// Charts and statistics tables
import { getProviderColor, getModelColor, sortTable, applySortIfNeeded, updateSortIndicators } from './core.js'
import { tableSortState } from './state.js'

// Module-level state
let byModelData = []
let byProviderData = []
let errorsData = []
let hiddenProviders = new Set()


export async function renderProviderTrends() {
    if (!alpineData) return

    const container = document.getElementById('provider-trends-chart')
    const filter = alpineData.dateFilter

    // Detect single-day view (Today, Yesterday, or custom single-day range)
    const isSingleDay = filter.startDate && filter.endDate && filter.startDate === filter.endDate

    try {
        if (isSingleDay) {
            // Fetch hourly data for single-day view
            const timezoneOffset = -new Date().getTimezoneOffset()
            const res = await fetch(`/stats/hourly?date=${filter.startDate}&timezone_offset=${timezoneOffset}`)
            const data = await res.json()

            if (!data.hourly || data.hourly.length === 0) {
                container.innerHTML = '<div class="chart-empty">No data available for selected date</div>'
                return
            }

            renderHourlyChart(container, data.hourly, data.date)
        } else {
            // Fetch daily data for multi-day view
            const query = alpineData.buildQuery(filter)
            const res = await fetch(`/stats/daily${query}`)
            const data = await res.json()

            if (!data.daily || data.daily.length === 0) {
                container.innerHTML = '<div class="chart-empty">No data available for selected date range</div>'
                return
            }

            // Sort daily data by date ascending for proper line rendering
            const dailyData = data.daily.sort((a, b) => a.date.localeCompare(b.date))

            // Generate complete date range (including empty days)
            // Use filter dates if set, otherwise use dbDateRange for "All Time",
            // falling back to data bounds only if neither is available
            const allDates = []
            let rangeStart, rangeEnd

            if (filter.startDate && filter.endDate) {
                // Explicit filter range (This Week, This Month, etc.)
                rangeStart = filter.startDate
                rangeEnd = filter.endDate
            } else if (alpineData.dbDateRange.startDate && alpineData.dbDateRange.endDate) {
                // "All Time" - use database range
                rangeStart = alpineData.dbDateRange.startDate
                rangeEnd = alpineData.dbDateRange.endDate
            } else if (dailyData.length > 0) {
                // Fallback to data bounds
                rangeStart = dailyData[0].date
                rangeEnd = dailyData[dailyData.length - 1].date
            }

            if (rangeStart && rangeEnd) {
                const start = new Date(rangeStart + 'T00:00:00')
                const end = new Date(rangeEnd + 'T00:00:00')
                for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                    const dateStr = d.toISOString().split('T')[0]
                    allDates.push(dateStr)
                }
            }

            // Group data by model (includes provider for coloring)
            const modelData = {}
            dailyData.forEach(day => {
                day.by_model.forEach(m => {
                    const modelKey = `${m.provider}:${m.model}`
                    if (!modelData[modelKey]) {
                        modelData[modelKey] = {
                            provider: m.provider,
                            model: m.model,
                            data: []
                        }
                    }
                    modelData[modelKey].data.push({
                        date: day.date,
                        cost: m.cost
                    })
                })
            })

            // Fill in missing dates with 0 cost for each model
            Object.values(modelData).forEach(modelInfo => {
                const existingDates = new Set(modelInfo.data.map(d => d.date))
                allDates.forEach(date => {
                    if (!existingDates.has(date)) {
                        modelInfo.data.push({ date, cost: 0 })
                    }
                })
                // Re-sort after filling gaps
                modelInfo.data.sort((a, b) => a.date.localeCompare(b.date))
            })

            // Sort models by total cost and assign colors
            const sortedModels = Object.values(modelData).sort((a, b) => {
                const aCost = a.data.reduce((sum, d) => sum + d.cost, 0)
                const bCost = b.data.reduce((sum, d) => sum + d.cost, 0)
                return bCost - aCost
            })

            // Group by provider and assign colors
            const modelsByProvider = {}
            sortedModels.forEach(m => {
                if (!modelsByProvider[m.provider]) {
                    modelsByProvider[m.provider] = []
                }
                modelsByProvider[m.provider].push(m)
            })

            // Assign colors to models
            Object.entries(modelsByProvider).forEach(([provider, models]) => {
                models.forEach((m, index) => {
                    m.color = getModelColor(provider, index, models.length)
                })
            })

            renderChart(container, sortedModels, allDates)
        }
    } catch (e) {
        console.error('Failed to load provider trends:', e)
        container.innerHTML = '<div class="chart-empty">Failed to load chart data</div>'
    }
}

function renderHourlyChart(container, hourlyData, date) {
    const width = container.offsetWidth - 140; // Subtract container padding (60 + 80)
    const height = 260
    const margin = { top: 20, right: 0, bottom: 25, left: 0 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    // Calculate max cost for scaling
    const maxCost = Math.max(...hourlyData.map(h => h.cost), 0.0001)
    const minCost = 0

    // Group data by model for stacked bars
    const modelTotals = {}
    hourlyData.forEach(hour => {
        hour.by_model.forEach(m => {
            const modelKey = `${m.provider}:${m.model}`
            if (!modelTotals[modelKey]) {
                modelTotals[modelKey] = {
                    provider: m.provider,
                    model: m.model,
                    costs: new Array(24).fill(0)
                }
            }
            modelTotals[modelKey].costs[hour.hour] = m.cost
        })
    })

    // Sort models by total cost and assign colors
    const sortedModels = Object.values(modelTotals).sort((a, b) => {
        const aCost = a.costs.reduce((sum, c) => sum + c, 0)
        const bCost = b.costs.reduce((sum, c) => sum + c, 0)
        return bCost - aCost
    })

    // Group by provider and assign colors
    const modelsByProvider = {}
    sortedModels.forEach(m => {
        if (!modelsByProvider[m.provider]) {
            modelsByProvider[m.provider] = []
        }
        modelsByProvider[m.provider].push(m)
    })

    Object.entries(modelsByProvider).forEach(([provider, models]) => {
        models.forEach((m, index) => {
            m.color = getModelColor(provider, index, models.length)
        })
    })
    const barWidth = chartWidth / 24

    // Y scale: cost to pixel (inverted because SVG Y increases downward)
    const yScale = (cost) => chartHeight - ((cost - minCost) / (maxCost - minCost)) * chartHeight

    // Format hour for display (0-23 to "12am", "1am", ... "11pm")
    const formatHour = (hour) => {
        if (hour === 0) return '12am'
        if (hour < 12) return hour + 'am'
        if (hour === 12) return '12pm'
        return (hour - 12) + 'pm'
    }

    // Create SVG
    let svg = `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height + 40}" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(${margin.left}, ${margin.top})">
    `

    // Add grid lines
    const gridSteps = 5
    for (let i = 0; i <= gridSteps; i++) {
        const y = (i / gridSteps) * chartHeight
        svg += `<line class="chart-grid" x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" />`
    }

    // Add Y axis
    svg += `<line class="chart-axis" x1="0" y1="0" x2="0" y2="${chartHeight}" />`
    for (let i = 0; i <= gridSteps; i++) {
        const y = (i / gridSteps) * chartHeight
        const cost = maxCost - (i / gridSteps) * (maxCost - minCost)
        svg += `<text class="chart-axis-text" x="-10" y="${y + 4}" text-anchor="end">$${cost.toFixed(3)}</text>`
    }

    // Add X axis
    svg += `<line class="chart-axis" x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" />`

    // Add X axis labels (show every 3 hours to avoid crowding: 0, 3, 6, 9, 12, 15, 18, 21)
    for (let hour = 0; hour < 24; hour += 3) {
        const x = hour * barWidth + barWidth / 2
        svg += `<text class="chart-axis-text" x="${x}" y="${chartHeight + 20}" text-anchor="middle">${formatHour(hour)}</text>`
    }

    // Draw stacked bars for each hour
    for (let hour = 0; hour < 24; hour++) {
        const x = hour * barWidth
        let yOffset = chartHeight
        const hourLabel = formatHour(hour)

        sortedModels.forEach(modelInfo => {
            const cost = modelInfo.costs[hour]
            if (cost > 0) {
                const barHeight = chartHeight - yScale(cost)
                yOffset -= barHeight
                const modelLabel = escapeHtml(modelInfo.model)
                svg += `<rect class="chart-bar" x="${x + 2}" y="${yOffset}" width="${barWidth - 4}" height="${barHeight}" fill="${modelInfo.color}"
                             onmouseover="showChartTooltip(event, '${hourLabel}', '${modelLabel}', ${cost})"
                             onmouseout="hideChartTooltip()" />`
            }
        })
    }

    // Add legend grouped by provider
    let legendY = 0
    const legendX = chartWidth + 10

    Object.entries(modelsByProvider).forEach(([provider, models]) => {
        // Add provider name
        svg += `<text class="chart-legend-text" x="${legendX}" y="${legendY + 8}" style="font-weight: bold;">${provider}</text>`
        legendY += 18

        // Add models for this provider
        models.forEach(m => {
            svg += `
                <circle cx="${legendX}" cy="${legendY + 4}" r="4" fill="${m.color}" />
                <text class="chart-legend-text" x="${legendX + 10}" y="${legendY + 8}">${escapeHtml(m.model)}</text>
            `
            legendY += 16
        })

        legendY += 4; // Extra space between providers
    })

    svg += `
            </g>
        </svg>
    `

    // Display date as title
    const dateObj = new Date(date + 'T00:00:00')
    const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })

    container.innerHTML = `
        <div class="chart-title">Hourly Usage - ${dateStr}</div>
        ${svg}
    `
}

function renderChart(container, modelData, dates) {
    const width = container.offsetWidth - 140; // Subtract container padding (60 + 80)
    const height = 260
    const margin = { top: 20, right: 0, bottom: 25, left: 0 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    // Calculate scales
    const maxCost = Math.max(...modelData.flatMap(m => m.data.map(d => d.cost)), 0.0001)
    const minCost = 0

    // Calculate bar width based on number of dates
    const barWidth = chartWidth / dates.length

    // Y scale: cost to pixel (inverted because SVG Y increases downward)
    const yScale = (cost) => chartHeight - ((cost - minCost) / (maxCost - minCost)) * chartHeight

    // Format date for display
    const formatDate = (dateStr) => {
        const date = new Date(dateStr + 'T00:00:00')
        return `${date.getMonth() + 1}/${date.getDate()}`
    }

    // Create SVG
    let svg = `
        <svg class="chart-svg" viewBox="0 0 ${width} ${height + 40}" xmlns="http://www.w3.org/2000/svg">
            <g transform="translate(${margin.left}, ${margin.top})">
    `

    // Add grid lines
    const gridSteps = 5
    for (let i = 0; i <= gridSteps; i++) {
        const y = (i / gridSteps) * chartHeight
        svg += `<line class="chart-grid" x1="0" y1="${y}" x2="${chartWidth}" y2="${y}" />`
    }

    // Add Y axis
    svg += `<line class="chart-axis" x1="0" y1="0" x2="0" y2="${chartHeight}" />`
    for (let i = 0; i <= gridSteps; i++) {
        const y = (i / gridSteps) * chartHeight
        const cost = maxCost - (i / gridSteps) * (maxCost - minCost)
        svg += `<text class="chart-axis-text" x="-10" y="${y + 4}" text-anchor="end">$${cost.toFixed(3)}</text>`
    }

    // Add X axis
    svg += `<line class="chart-axis" x1="0" y1="${chartHeight}" x2="${chartWidth}" y2="${chartHeight}" />`

    // Add X axis labels (show fewer labels to avoid crowding)
    const labelStep = Math.ceil(dates.length / 8)
    dates.forEach((date, i) => {
        if (i % labelStep === 0 || i === dates.length - 1) {
            const x = i * barWidth + barWidth / 2
            svg += `<text class="chart-axis-text" x="${x}" y="${chartHeight + 20}" text-anchor="middle">${formatDate(date)}</text>`
        }
    })

    // Draw stacked bars for each date
    dates.forEach((date, dateIndex) => {
        const x = dateIndex * barWidth
        let yOffset = chartHeight
        const dateLabel = formatDate(date)

        // Stack bars from each model for this date
        modelData.forEach(modelInfo => {
            const dataPoint = modelInfo.data[dateIndex]
            if (dataPoint && dataPoint.cost > 0) {
                const barHeight = chartHeight - yScale(dataPoint.cost)
                yOffset -= barHeight
                const modelLabel = escapeHtml(modelInfo.model)
                svg += `<rect class="chart-bar" x="${x + 2}" y="${yOffset}" width="${barWidth - 4}" height="${barHeight}" fill="${modelInfo.color}"
                             onmouseover="showChartTooltip(event, '${dateLabel}', '${modelLabel}', ${dataPoint.cost})"
                             onmouseout="hideChartTooltip()" />`
            }
        })
    })

    svg += `
            </g>
        </svg>
    `

    // Add legend grouped by provider
    const modelsByProvider = {}
    modelData.forEach(m => {
        if (!modelsByProvider[m.provider]) {
            modelsByProvider[m.provider] = []
        }
        modelsByProvider[m.provider].push(m)
    })

    let legend = ''
    Object.entries(modelsByProvider).forEach(([provider, models]) => {
        // Create provider section as a grid item
        legend += `<div class="chart-legend-provider">`
        legend += `<div class="chart-legend-provider-name">${provider}</div>`

        // Add models for this provider
        models.forEach(m => {
            const totalCost = m.data.reduce((sum, d) => sum + d.cost, 0)
            legend += `
                <div class="chart-legend-item">
                    <div class="chart-legend-color" style="background: ${m.color}"></div>
                    <div class="chart-legend-label">${escapeHtml(m.model)} ($${totalCost.toFixed(4)})</div>
                </div>
            `
        })
        legend += `</div>`
    })

    container.innerHTML = svg + `<div class="chart-legend">${legend}</div>`
}

function showChartTooltip(event, date, provider, cost) {
    const tooltip = document.getElementById('chart-tooltip')
    if (cost === null) {
        // Badge tooltip (date is title, provider is description)
        tooltip.innerHTML = `
            <div class="chart-tooltip-date">${date}</div>
            <div class="chart-tooltip-item">
                <span>${provider}</span>
            </div>
        `
    } else {
        // Chart tooltip (standard format)
        tooltip.innerHTML = `
            <div class="chart-tooltip-date">${date}</div>
            <div class="chart-tooltip-item">
                <span>${provider}:</span>
                <span>$${cost.toFixed(4)}</span>
            </div>
        `
    }
    tooltip.style.display = 'block'
    tooltip.style.left = (event.pageX + 10) + 'px'
    tooltip.style.top = (event.pageY - 30) + 'px'
}

function hideChartTooltip() {
    const tooltip = document.getElementById('chart-tooltip')
    tooltip.style.display = 'none'
}

export function toggleProvider(provider) {
    if (hiddenProviders.has(provider)) {
        hiddenProviders.delete(provider)
    } else {
        hiddenProviders.add(provider)
    }
    renderProviderTrends()
}

export async function refreshStats() {
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

    // By model - convert to sortable format and merge with performance data
    const performanceMap = new Map((data.performance || []).map(p => [p.model, p]))

    byModelData = data.by_model.map(m => {
        const perf = performanceMap.get(m.model)
        return [
            m.model,                                    // 0: model
            m.requests,                                 // 1: requests
            m.cost,                                     // 2: cost
            m.tokens,                                   // 3: tokens
            m.cost / m.requests,                        // 4: avg cost per request
            m.tokens / m.requests,                      // 5: avg tokens per request
            perf ? perf.avg_tokens_per_sec : null,      // 6: speed (tokens/sec)
            perf ? perf.avg_duration_ms : null          // 7: avg duration
        ]
    })

    if (!tableSortState['by-model']) {
        tableSortState['by-model'] = { column: null, direction: null, originalData: [...byModelData] }
    } else {
        tableSortState['by-model'].originalData = [...byModelData]
    }
    renderByModelTable(applySortIfNeeded('by-model', byModelData), tableSortState['by-model'])

    // By provider - convert to sortable format
    byProviderData = data.by_provider.map(p => [p.provider, p.requests, p.cost, p.tokens])
    if (!tableSortState['by-provider']) {
        tableSortState['by-provider'] = { column: null, direction: null, originalData: [...byProviderData] }
    } else {
        tableSortState['by-provider'].originalData = [...byProviderData]
    }
    renderByProviderTable(applySortIfNeeded('by-provider', byProviderData), tableSortState['by-provider'])

    // Errors - convert to sortable format
    errorsData = data.recent_errors.map(e => [new Date(e.timestamp.endsWith('Z') || e.timestamp.includes('+') ? e.timestamp : e.timestamp + 'Z').getTime(), e.model, e.error, e.timestamp])
    if (!tableSortState['errors']) {
        tableSortState['errors'] = { column: null, direction: null, originalData: [...errorsData] }
    } else {
        tableSortState['errors'].originalData = [...errorsData]
    }
    renderErrorsTable(applySortIfNeeded('errors', errorsData), tableSortState['errors'])
}

// Navigate to requests tab with filters
function filterRequests(filters) {
    if (!alpineData) return

    // Set the filters
    Object.assign(alpineData.requestFilters, filters)

    // Switch to requests tab
    alpineData.currentTab = 'requests'
}

export function sortByModelTable(columnIndex) {
    sortTable('by-model', columnIndex, byModelData, renderByModelTable, tableSortState)
}

function renderByModelTable(data, sortState) {
    // Find best performers
    const validCostPerRequest = data.filter(r => r[4] != null)
    const validTokensPerRequest = data.filter(r => r[5] != null)
    const validSpeed = data.filter(r => r[6] != null)

    const mostEconomical = validCostPerRequest.length > 0
        ? validCostPerRequest.reduce((min, curr) => curr[4] < min[4] ? curr : min)[0]
        : null
    const mostTokenRich = validTokensPerRequest.length > 0
        ? validTokensPerRequest.reduce((max, curr) => curr[5] > max[5] ? curr : max)[0]
        : null
    const fastest = validSpeed.length > 0
        ? validSpeed.reduce((max, curr) => curr[6] > max[6] ? curr : max)[0]
        : null

    const table = document.getElementById('by-model')
    table.innerHTML = `
        <thead>
            <tr>
                <th class="sortable" onclick="dashboardApp.sortByModelTable(0)">Model</th>
                <th class="sortable" onclick="dashboardApp.sortByModelTable(1)">Requests</th>
                <th class="sortable" onclick="dashboardApp.sortByModelTable(2)">Total Cost</th>
                <th class="sortable" onclick="dashboardApp.sortByModelTable(3)">Tokens</th>
                <th class="sortable" onclick="dashboardApp.sortByModelTable(4)">$/Request</th>
                <th class="sortable" onclick="dashboardApp.sortByModelTable(5)">Tokens/Req</th>
                <th class="sortable" onclick="dashboardApp.sortByModelTable(6)">Speed</th>
                <th class="sortable" onclick="dashboardApp.sortByModelTable(7)">Duration</th>
            </tr>
        </thead>
        <tbody>
            ${data.map(row => {
                const badges = []
                if (row[0] === mostEconomical) badges.push('<span class="badge badge-economical" onmouseover="showChartTooltip(event, \'Most Economical\', \'Lowest cost per request\', null)" onmouseout="hideChartTooltip()">$</span>')
                if (row[0] === mostTokenRich) badges.push('<span class="badge badge-tokens" onmouseover="showChartTooltip(event, \'Most Token-Rich\', \'Highest tokens per request\', null)" onmouseout="hideChartTooltip()">▰</span>')
                if (row[0] === fastest) badges.push('<span class="badge badge-speed" onmouseover="showChartTooltip(event, \'Fastest\', \'Highest tokens per second\', null)" onmouseout="hideChartTooltip()">⚡︎</span>')

                return `
                <tr class="clickable-row" onclick="filterRequests({ model: '${escapeHtml(row[0])}', provider: '', search: '', minCost: '', maxCost: '' })">
                    <td>${escapeHtml(row[0])} ${badges.join(' ')}</td>
                    <td>${row[1]}</td>
                    <td>$${row[2].toFixed(4)}</td>
                    <td>${row[3].toLocaleString()}</td>
                    <td>$${row[4].toFixed(4)}</td>
                    <td>${Math.round(row[5]).toLocaleString()}</td>
                    <td>${row[6] != null ? row[6].toFixed(1) + ' tok/s' : '—'}</td>
                    <td>${row[7] != null ? Math.round(row[7]) + 'ms' : '—'}</td>
                </tr>
            `}).join('')}
        </tbody>
    `
    updateSortIndicators(table, sortState)
}

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
            &nbsp;•&nbsp
            Most token-rich: <strong>${mostTokenRich.model}</strong> at ${Math.round(mostTokenRich.avgTokensPerRequest).toLocaleString()} tokens/request
        </div>
    `
}

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
            &nbsp;•&nbsp
            Note: Duration includes network latency and prompt processing time
        </div>
    `
}

export function sortByProviderTable(columnIndex) {
    sortTable('by-provider', columnIndex, byProviderData, renderByProviderTable, tableSortState)
}

function renderByProviderTable(data, sortState) {
    const table = document.getElementById('by-provider')
    table.innerHTML = `
        <thead>
            <tr>
                <th class="sortable" onclick="dashboardApp.sortByProviderTable(0)">Provider</th>
                <th class="sortable" onclick="dashboardApp.sortByProviderTable(1)">Requests</th>
                <th class="sortable" onclick="dashboardApp.sortByProviderTable(2)">Cost</th>
                <th class="sortable" onclick="dashboardApp.sortByProviderTable(3)">Tokens</th>
            </tr>
        </thead>
        <tbody>
            ${data.map(row => `
                <tr class="clickable-row" onclick="filterRequests({ provider: '${escapeHtml(row[0])}', model: '', search: '', minCost: '', maxCost: '' })">
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

export function sortErrorsTable(columnIndex) {
    sortTable('errors', columnIndex, errorsData, renderErrorsTable, tableSortState)
}

function renderErrorsTable(data, sortState) {
    const table = document.getElementById('errors')
    if (data.length === 0) {
        table.innerHTML = '<tr><td>No errors</td></tr>'
        return
    }

    table.innerHTML = `
        <thead>
            <tr>
                <th class="sortable" onclick="dashboardApp.sortErrorsTable(0)">Time</th>
                <th class="sortable" onclick="dashboardApp.sortErrorsTable(1)">Model</th>
                <th class="sortable" onclick="dashboardApp.sortErrorsTable(2)">Error</th>
            </tr>
        </thead>
        <tbody>
            ${data.map(row => `
                <tr class="clickable-row" onclick="filterRequests({ model: '${escapeHtml(row[1])}', provider: '', search: '', minCost: '', maxCost: '' })">
                    <td>${new Date(row[3].endsWith('Z') || row[3].includes('+') ? row[3] : row[3] + 'Z').toLocaleString()}</td>
                    <td>${row[1]}</td>
                    <td class="error">${row[2]}</td>
                </tr>
            `).join('')}
        </tbody>
    `
    updateSortIndicators(table, sortState)
}

export async function clearErrors() {
    if (!confirm('Clear all errors from the database?')) return
    await fetch('/errors', { method: 'DELETE' })
    refreshStats()
}

