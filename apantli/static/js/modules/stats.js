// Statistics loading and rendering

import { state } from './state.js'
import { escapeHtml, getModelColor } from './core.js'
import { sortTable, applySortIfNeeded, updateSortIndicators } from './tables.js'

// Refresh stats (main stats tab data)
export async function refreshStats(alpineData, renderProviderTrends) {
  if (!alpineData) return
  const query = alpineData.buildQuery(alpineData.dateFilter)

  // Fetch stats and daily data in parallel for faster loading
  const [statsRes, _] = await Promise.all([
    fetch(`/stats${query}`),
    renderProviderTrends() // Start chart fetch in parallel
  ])
  const data = await statsRes.json()

  // Totals
  document.getElementById('totals').innerHTML = `
    <div class="metric">
      <div class="metric-value">${data.totals.requests}</div>
      <div class="metric-label">REQUESTS</div>
    </div>
    <div class="metric">
      <div class="metric-value">$${data.totals.cost.toFixed(4)}</div>
      <div class="metric-label">TOTAL COST</div>
    </div>
    <div class="metric">
      <div class="metric-value">${(data.totals.prompt_tokens + data.totals.completion_tokens).toLocaleString()}</div>
      <div class="metric-label">TOTAL TOKENS</div>
    </div>
    <div class="metric">
      <div class="metric-value">${data.totals.avg_duration_ms.toFixed(0)}ms</div>
      <div class="metric-label">AVG DURATION</div>
    </div>
  `

  // Provider breakdown visualization with model segments
  const totalCost = data.totals.cost

  let providerHtml = ''
  if (data.by_model.length > 0 && totalCost > 0) {
    // Group models by provider
    const modelsByProvider = {}
    data.by_model.forEach(m => {
      if (!modelsByProvider[m.provider]) {
        modelsByProvider[m.provider] = []
      }
      modelsByProvider[m.provider].push(m)
    })

    // Sort providers by total cost
    const providerTotals = Object.entries(modelsByProvider).map(([provider, models]) => ({
      provider,
      models,
      totalCost: models.reduce((sum, m) => sum + m.cost, 0),
      totalRequests: models.reduce((sum, m) => sum + m.requests, 0)
    })).sort((a, b) => b.totalCost - a.totalCost)

    providerHtml = providerTotals.map(p => {
      const providerPercentage = (p.totalCost / totalCost * 100)

      // Sort models by cost within provider and assign colors
      const sortedModels = p.models.sort((a, b) => b.cost - a.cost)
      sortedModels.forEach((m, index) => {
        m.color = getModelColor(p.provider, index, sortedModels.length)
      })

      // Create segmented bar
      const segments = sortedModels.map(m => {
        const modelPercentage = (m.cost / totalCost * 100)
        const modelLabel = escapeHtml(m.model)
        return `<div class="bar-segment" style="width: ${modelPercentage}%; background: ${m.color}; cursor: pointer;"
                     onmouseover="window.showChartTooltip(event, '${p.provider}', '${modelLabel}', ${m.cost})"
                     onmouseout="window.hideChartTooltip()"></div>`
      }).join('')

      // Model details list
      const modelDetails = sortedModels.map(m =>
        `<span style="color: ${m.color};">●</span> ${escapeHtml(m.model)}: $${m.cost.toFixed(4)} (${m.requests} req)`
      ).join(' • ')

      return `
        <div class="provider-bar">
          <div class="provider-header">
            <span class="provider-name">${p.provider}</span>
            <span class="provider-percentage">${providerPercentage.toFixed(0)}%</span>
          </div>
          <div class="bar-container">
            ${segments}
          </div>
          <div class="provider-details">
            $${p.totalCost.toFixed(4)} across ${p.totalRequests} requests ($${(p.totalCost / p.totalRequests).toFixed(4)} per request)
          </div>
          <div class="provider-details" style="font-size: 11px; margin-top: 4px;">
            ${modelDetails}
          </div>
        </div>
      `
    }).join('')

    providerHtml += `<div style="margin-top: 20px; font-weight: bold;">Total: $${totalCost.toFixed(4)} (${data.totals.requests} requests)</div>`
  } else {
    providerHtml = '<div style="color: #666;">No data available</div>'
  }

  document.getElementById('provider-breakdown').innerHTML = providerHtml

  // By model - convert to sortable format
  state.byModelData = data.by_model.map(m => [m.model, m.requests, m.cost, m.tokens])
  if (!state.tableSortState['by-model']) {
    state.tableSortState['by-model'] = { column: null, direction: null, originalData: [...state.byModelData] }
  } else {
    state.tableSortState['by-model'].originalData = [...state.byModelData]
  }
  renderByModelTable(applySortIfNeeded('by-model', state.byModelData), state.tableSortState['by-model'])

  // Model efficiency
  renderModelEfficiency(state.byModelData)

  // Model performance (speed)
  renderModelPerformance(data.performance || [])

  // By provider - convert to sortable format
  state.byProviderData = data.by_provider.map(p => [p.provider, p.requests, p.cost, p.tokens])
  if (!state.tableSortState['by-provider']) {
    state.tableSortState['by-provider'] = { column: null, direction: null, originalData: [...state.byProviderData] }
  } else {
    state.tableSortState['by-provider'].originalData = [...state.byProviderData]
  }
  renderByProviderTable(applySortIfNeeded('by-provider', state.byProviderData), state.tableSortState['by-provider'])

  // Errors - convert to sortable format
  state.errorsData = data.recent_errors.map(e => [new Date(e.timestamp + 'Z').getTime(), e.model, e.error, e.timestamp])
  if (!state.tableSortState['errors']) {
    state.tableSortState['errors'] = { column: null, direction: null, originalData: [...state.errorsData] }
  } else {
    state.tableSortState['errors'].originalData = [...state.errorsData]
  }
  renderErrorsTable(applySortIfNeeded('errors', state.errorsData), state.tableSortState['errors'])
}

// Navigate to requests tab with filters
export function filterRequests(filters, alpineData) {
  if (!alpineData) return

  // Set the filters
  Object.assign(alpineData.requestFilters, filters)

  // Switch to requests tab
  alpineData.currentTab = 'requests'
}

// Sort by model table
export function sortByModelTable(columnIndex) {
  sortTable('by-model', columnIndex, state.byModelData, renderByModelTable)
}

// Render by model table
function renderByModelTable(data, sortState) {
  const table = document.getElementById('by-model')
  table.innerHTML = `
    <thead>
      <tr>
        <th class="sortable" onclick="window.sortByModelTable(0)">Model</th>
        <th class="sortable" onclick="window.sortByModelTable(1)">Requests</th>
        <th class="sortable" onclick="window.sortByModelTable(2)">Cost</th>
        <th class="sortable" onclick="window.sortByModelTable(3)">Tokens</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
        <tr class="clickable-row" onclick="window.filterRequests({ model: '${escapeHtml(row[0])}', provider: '', search: '', minCost: '', maxCost: '' })">
          <td>${row[0]}</td>
          <td>${row[1]}</td>
          <td>$${row[2].toFixed(4)}</td>
          <td>${row[3].toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  `
  updateSortIndicators(table, sortState)
}

// Render model efficiency metrics
function renderModelEfficiency(modelData) {
  const container = document.getElementById('model-efficiency')

  if (!modelData || modelData.length === 0) {
    container.innerHTML = '<div class="chart-empty">No model data available</div>'
    return
  }

  // Calculate efficiency metrics
  const efficiencyData = modelData.map(row => ({
    model: row[0],
    requests: row[1],
    cost: row[2],
    tokens: row[3],
    avgCostPerRequest: row[2] / row[1],
    avgTokensPerRequest: row[3] / row[1]
  }))

  // Find most economical (lowest avg cost)
  const mostEconomical = efficiencyData.reduce((min, curr) =>
    curr.avgCostPerRequest < min.avgCostPerRequest ? curr : min
  )

  // Find most token-rich (highest avg tokens)
  const mostTokenRich = efficiencyData.reduce((max, curr) =>
    curr.avgTokensPerRequest > max.avgTokensPerRequest ? curr : max
  )

  // Render efficiency cards
  const cards = efficiencyData.map(data => {
    const isEconomical = data.model === mostEconomical.model
    const isTokenRich = data.model === mostTokenRich.model
    const highlightClass = isEconomical ? 'highlight-economical' : (isTokenRich ? 'highlight-tokens' : '')

    return `
      <div class="efficiency-card ${highlightClass}">
        <div class="efficiency-model-name">
          ${data.model}
          ${isEconomical ? '<span class="efficiency-badge economical">Most Economical</span>' : ''}
          ${isTokenRich ? '<span class="efficiency-badge token-rich">Most Token-Rich</span>' : ''}
        </div>
        <div class="efficiency-metrics">
          <div class="efficiency-metric">
            <div class="efficiency-metric-label">Avg Cost/Request</div>
            <div class="efficiency-metric-value">$${data.avgCostPerRequest.toFixed(4)}</div>
          </div>
          <div class="efficiency-metric">
            <div class="efficiency-metric-label">Avg Tokens/Request</div>
            <div class="efficiency-metric-value">${Math.round(data.avgTokensPerRequest).toLocaleString()}</div>
          </div>
          <div class="efficiency-metric">
            <div class="efficiency-metric-label">Total Requests</div>
            <div class="efficiency-metric-value">${data.requests.toLocaleString()}</div>
          </div>
          <div class="efficiency-metric">
            <div class="efficiency-metric-label">Total Cost</div>
            <div class="efficiency-metric-value">$${data.cost.toFixed(4)}</div>
          </div>
        </div>
      </div>
    `
  }).join('')

  container.innerHTML = `
    <div class="efficiency-grid">
      ${cards}
    </div>
    <div class="efficiency-summary">
      Most economical: <strong>${mostEconomical.model}</strong> at $${mostEconomical.avgCostPerRequest.toFixed(4)}/request
      &nbsp;•&nbsp;
      Most token-rich: <strong>${mostTokenRich.model}</strong> at ${Math.round(mostTokenRich.avgTokensPerRequest).toLocaleString()} tokens/request
    </div>
  `
}

// Render model performance (speed) metrics
function renderModelPerformance(performanceData) {
  const container = document.getElementById('model-performance')

  if (!performanceData || performanceData.length === 0) {
    container.innerHTML = '<div class="chart-empty">No performance data available (requires requests with completion tokens)</div>'
    return
  }

  // Find fastest model
  const fastest = performanceData.reduce((max, curr) =>
    curr.avg_tokens_per_sec > max.avg_tokens_per_sec ? curr : max
  )

  // Render performance cards
  const cards = performanceData.map(data => {
    const isFastest = data.model === fastest.model
    const highlightClass = isFastest ? 'highlight-tokens' : ''

    return `
      <div class="efficiency-card ${highlightClass}">
        <div class="efficiency-model-name">
          ${data.model}
          ${isFastest ? '<span class="efficiency-badge token-rich">Fastest</span>' : ''}
        </div>
        <div class="efficiency-metrics">
          <div class="efficiency-metric">
            <div class="efficiency-metric-label">Avg Speed</div>
            <div class="efficiency-metric-value">${data.avg_tokens_per_sec.toFixed(1)} tok/s</div>
          </div>
          <div class="efficiency-metric">
            <div class="efficiency-metric-label">Speed Range</div>
            <div class="efficiency-metric-value">${data.min_tokens_per_sec.toFixed(1)} - ${data.max_tokens_per_sec.toFixed(1)}</div>
          </div>
          <div class="efficiency-metric">
            <div class="efficiency-metric-label">Avg Duration</div>
            <div class="efficiency-metric-value">${Math.round(data.avg_duration_ms)}ms</div>
          </div>
          <div class="efficiency-metric">
            <div class="efficiency-metric-label">Requests Measured</div>
            <div class="efficiency-metric-value">${data.requests.toLocaleString()}</div>
          </div>
        </div>
      </div>
    `
  }).join('')

  container.innerHTML = `
    <div class="efficiency-grid">
      ${cards}
    </div>
    <div class="efficiency-summary">
      Fastest: <strong>${fastest.model}</strong> at ${fastest.avg_tokens_per_sec.toFixed(1)} tokens/second
      &nbsp;•&nbsp;
      Note: Duration includes network latency and prompt processing time
    </div>
  `
}

// Sort by provider table
export function sortByProviderTable(columnIndex) {
  sortTable('by-provider', columnIndex, state.byProviderData, renderByProviderTable)
}

// Render by provider table
function renderByProviderTable(data, sortState) {
  const table = document.getElementById('by-provider')
  table.innerHTML = `
    <thead>
      <tr>
        <th class="sortable" onclick="window.sortByProviderTable(0)">Provider</th>
        <th class="sortable" onclick="window.sortByProviderTable(1)">Requests</th>
        <th class="sortable" onclick="window.sortByProviderTable(2)">Cost</th>
        <th class="sortable" onclick="window.sortByProviderTable(3)">Tokens</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
        <tr class="clickable-row" onclick="window.filterRequests({ provider: '${escapeHtml(row[0])}', model: '', search: '', minCost: '', maxCost: '' })">
          <td>${row[0]}</td>
          <td>${row[1]}</td>
          <td>$${row[2].toFixed(4)}</td>
          <td>${row[3].toLocaleString()}</td>
        </tr>
      `).join('')}
    </tbody>
  `
  updateSortIndicators(table, sortState)
}

// Sort errors table
export function sortErrorsTable(columnIndex) {
  sortTable('errors', columnIndex, state.errorsData, renderErrorsTable)
}

// Render errors table
function renderErrorsTable(data, sortState) {
  const table = document.getElementById('errors')
  if (data.length === 0) {
    table.innerHTML = '<tr><td>No errors</td></tr>'
    return
  }

  table.innerHTML = `
    <thead>
      <tr>
        <th class="sortable" onclick="window.sortErrorsTable(0)">Time</th>
        <th class="sortable" onclick="window.sortErrorsTable(1)">Model</th>
        <th class="sortable" onclick="window.sortErrorsTable(2)">Error</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
        <tr class="clickable-row" onclick="window.filterRequests({ model: '${escapeHtml(row[1])}', provider: '', search: '', minCost: '', maxCost: '' })">
          <td>${new Date(row[3] + 'Z').toLocaleString()}</td>
          <td>${row[1]}</td>
          <td class="error">${row[2]}</td>
        </tr>
      `).join('')}
    </tbody>
  `
  updateSortIndicators(table, sortState)
}

// Clear all errors
export async function clearErrors(refreshStatsFn) {
  if (!confirm('Clear all errors from the database?')) return
  await fetch('/errors', { method: 'DELETE' })
  refreshStatsFn()
}
