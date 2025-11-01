// Request loading, rendering, and detail views

import { state } from './state.js'
import { escapeHtml, copyToClipboard } from './core.js'
import { sortTable, updateSortIndicators } from './tables.js'

// Extract text from content (handles both string and multimodal array formats)
function extractContentText(content) {
  if (!content) return ''

  // If content is a string, return as-is
  if (typeof content === 'string') {
    return content
  }

  // If content is an array (multimodal format), extract text parts
  if (Array.isArray(content)) {
    return content.map(part => {
      if (typeof part === 'string') return part
      if (part.type === 'text' && part.text) return part.text
      if (part.type === 'image_url') return '[Image]'
      return ''
    }).filter(Boolean).join('\n\n')
  }

  // Fallback for unexpected formats
  return String(content)
}

// Extract conversation messages from request/response
function extractConversation(requestObj) {
  try {
    const request = JSON.parse(requestObj.request_data)
    const response = JSON.parse(requestObj.response_data)

    const messages = []

    // Extract request messages
    if (request.messages && Array.isArray(request.messages)) {
      request.messages.forEach(msg => {
        messages.push({
          role: msg.role,
          content: extractContentText(msg.content),
          isRequest: true
        })
      })
    }

    // Extract response message
    if (response.choices && response.choices[0] && response.choices[0].message) {
      const assistantMsg = response.choices[0].message
      messages.push({
        role: assistantMsg.role || 'assistant',
        content: extractContentText(assistantMsg.content),
        isRequest: false
      })
    }

    return messages
  } catch (e) {
    return null
  }
}

// Estimate token count for a message (rough approximation)
function estimateTokens(text) {
  if (!text) return 0
  // Rough estimate: ~4 characters per token
  return Math.ceil(text.length / 4)
}

// Format message content with markdown-like code block detection
function formatMessageContent(content) {
  if (!content) return ''

  // Escape HTML
  const escaped = escapeHtml(content)

  // Convert markdown code blocks to HTML
  let formatted = escaped.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`
  })

  // Convert inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>')

  return formatted
}

// Render conversation view
function renderConversationView(requestObj) {
  const messages = extractConversation(requestObj)
  if (!messages) {
    return '<p class="error">Could not extract conversation from request/response data</p>'
  }

  let html = '<div class="conversation-view">'

  messages.forEach((msg, index) => {
    const icon = msg.role === 'user' ? '⊙' : msg.role === 'assistant' ? '◈' : '⚙'
    const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1)
    const tokens = estimateTokens(msg.content)
    const formattedContent = formatMessageContent(msg.content)

    html += `
      <div class="message">
        <div class="message-icon">${icon}</div>
        <div class="message-content">
          <div class="message-header">
            <div>
              <span class="message-role">${roleLabel}</span>
              <span class="message-meta">~${tokens.toLocaleString()} tokens</span>
            </div>
            <button class="copy-btn" onclick="window.copyToClipboard(\`${escapeHtml(msg.content).replace(/`/g, '\\`')}\`, this)">Copy</button>
          </div>
          <div class="message-text">${formattedContent}</div>
        </div>
      </div>
    `
  })

  html += '</div>'
  return html
}

// Render JSON tree with collapsible nodes
export function renderJsonTree(obj, isRoot = true) {
  if (obj === null) return '<span class="json-null">null</span>'
  if (obj === undefined) return '<span class="json-null">undefined</span>'

  const type = typeof obj
  if (type === 'string') return `<span class="json-string">"${escapeHtml(obj)}"</span>`
  if (type === 'number') return `<span class="json-number">${obj}</span>`
  if (type === 'boolean') return `<span class="json-boolean">${obj}</span>`

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span>[]</span>'

    const id = 'json-' + Math.random().toString(36).substr(2, 9)
    let html = `<span class="json-toggle" onclick="window.toggleJson('${id}')">▼</span>[`
    html += `<div id="${id}" class="json-line">`
    obj.forEach((item, i) => {
      html += renderJsonTree(item, false)
      if (i < obj.length - 1) html += ','
      html += '<br>'
    })
    html += '</div>]'
    return html
  }

  if (type === 'object') {
    const keys = Object.keys(obj)
    if (keys.length === 0) return '<span>{}</span>'

    const id = 'json-' + Math.random().toString(36).substr(2, 9)
    let html = `<span class="json-toggle" onclick="window.toggleJson('${id}')">▼</span>{`
    html += `<div id="${id}" class="json-line">`
    keys.forEach((key, i) => {
      html += `<span class="json-key">"${escapeHtml(key)}"</span>: `
      html += renderJsonTree(obj[key], false)
      if (i < keys.length - 1) html += ','
      html += '<br>'
    })
    html += '</div>}'
    return html
  }

  return String(obj)
}

// Toggle JSON tree node
export function toggleJson(id) {
  const el = document.getElementById(id)
  const toggle = el.previousElementSibling
  if (el.classList.contains('json-collapsed')) {
    el.classList.remove('json-collapsed')
    toggle.textContent = '▼'
  } else {
    el.classList.add('json-collapsed')
    toggle.textContent = '▶'
  }
}

// Toggle between conversation and JSON view
export function toggleDetailView(requestId, mode) {
  state.detailViewMode[requestId] = mode
  const requestObj = state.requestsObjects.find(r => r.timestamp === requestId)
  if (!requestObj) return

  const detailRow = document.getElementById('detail-' + requestId)
  const contentDiv = detailRow.querySelector('.detail-content')

  if (mode === 'conversation') {
    contentDiv.innerHTML = renderConversationView(requestObj)
  } else {
    // JSON view
    let requestHtml = '<span class="error">Error parsing request</span>'
    let responseHtml = '<span class="error">Error parsing response</span>'

    try {
      const req = JSON.parse(requestObj.request_data)
      requestHtml = renderJsonTree(req)
    } catch(e) {}

    try {
      const resp = JSON.parse(requestObj.response_data)
      responseHtml = renderJsonTree(resp)
    } catch(e) {}

    contentDiv.innerHTML = `
      <b>Request:</b>
      <div class="json-view json-tree">${requestHtml}</div>
      <b>Response:</b>
      <div class="json-view json-tree">${responseHtml}</div>
    `
  }

  // Update toggle buttons
  detailRow.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.classList.remove('active')
    if (btn.dataset.mode === mode) {
      btn.classList.add('active')
    }
  })
}

// Load requests from API
export async function loadRequests(alpineData) {
  if (!alpineData) return
  try {
    const query = alpineData.buildQuery(alpineData.dateFilter)
    const offset = (alpineData.currentPage - 1) * alpineData.itemsPerPage
    let url = `/requests${query}${query ? '&' : '?'}offset=${offset}&limit=${alpineData.itemsPerPage}`

    // Add filter parameters
    const filters = alpineData.requestFilters
    if (filters.provider) {
      url += `&provider=${encodeURIComponent(filters.provider)}`
    }
    if (filters.model) {
      url += `&model=${encodeURIComponent(filters.model)}`
    }
    if (filters.minCost !== '' && filters.minCost !== null) {
      url += `&min_cost=${filters.minCost}`
    }
    if (filters.maxCost !== '' && filters.maxCost !== null) {
      url += `&max_cost=${filters.maxCost}`
    }
    if (filters.search) {
      url += `&search=${encodeURIComponent(filters.search)}`
    }

    const res = await fetch(url)
    const data = await res.json()

    // Store server-side aggregates for ALL matching requests
    state.serverAggregates = {
      total: data.total,
      total_tokens: data.total_tokens,
      total_cost: data.total_cost,
      avg_cost: data.avg_cost
    }

    // Store total for pagination
    alpineData.totalItems = data.total

    // Store original objects and convert to array format for sorting
    state.requestsObjects = data.requests
    state.requestsData = data.requests.map(r => [
      new Date(r.timestamp.endsWith('Z') || r.timestamp.includes('+') ? r.timestamp : r.timestamp + 'Z').getTime(), // For sorting by time
      r.model,
      r.total_tokens,
      r.cost,
      r.duration_ms,
      r.timestamp // Store timestamp for detail row lookup
    ])

    // Populate filter dropdowns from current page data
    populateFilterDropdowns(alpineData)

    // Initialize or update sort state
    if (!state.tableSortState['requests-list']) {
      state.tableSortState['requests-list'] = { column: null, direction: null, originalData: [...state.requestsData] }
    } else {
      // Update originalData to match current filtered results
      state.tableSortState['requests-list'].originalData = [...state.requestsData]
    }

    // Update summary and render table
    updateRequestSummary()
    renderRequestsTable(state.requestsData, state.tableSortState['requests-list'])
  } catch(e) {
    document.getElementById('requests-list').innerHTML = '<tr><td colspan="5">Error loading requests</td></tr>'
  }
}

// Populate filter dropdowns
function populateFilterDropdowns(alpineData) {
  // Get unique providers from current page data
  const providers = [...new Set(state.requestsObjects.map(r => r.provider).filter(Boolean))].sort()
  const providerSelect = document.getElementById('filter-provider')
  const currentProvider = alpineData.requestFilters.provider
  providerSelect.innerHTML = '<option value="">All</option>'
  providers.forEach(p => {
    const option = document.createElement('option')
    option.value = p
    option.textContent = p
    if (p === currentProvider) option.selected = true
    providerSelect.appendChild(option)
  })

  // Get unique models from current page data
  const models = [...new Set(state.requestsObjects.map(r => r.model).filter(Boolean))].sort()
  const modelSelect = document.getElementById('filter-model')
  const currentModel = alpineData.requestFilters.model
  modelSelect.innerHTML = '<option value="">All</option>'
  models.forEach(m => {
    const option = document.createElement('option')
    option.value = m
    option.textContent = m
    if (m === currentModel) option.selected = true
    modelSelect.appendChild(option)
  })
}

// Update request summary display
function updateRequestSummary() {
  const summary = document.getElementById('request-summary')

  // Use server-side aggregates for ALL matching requests, not just paginated results
  if (state.serverAggregates.total === 0) {
    summary.style.display = 'none'
    return
  }

  document.getElementById('summary-count').textContent = state.serverAggregates.total.toLocaleString()
  document.getElementById('summary-cost').textContent = '$' + state.serverAggregates.total_cost.toFixed(4)
  document.getElementById('summary-tokens').textContent = state.serverAggregates.total_tokens.toLocaleString()
  document.getElementById('summary-avg-cost').textContent = '$' + state.serverAggregates.avg_cost.toFixed(4)

  summary.style.display = 'flex'
}

// Sort requests table
export function sortRequestsTable(columnIndex) {
  sortTable('requests-list', columnIndex, state.requestsData, renderRequestsTable)
}

// Render requests table
function renderRequestsTable(data, sortState) {
  const tbody = document.createElement('tbody')

  data.forEach(row => {
    const timestamp = row[5]
    const requestObj = state.requestsObjects.find(r => r.timestamp === timestamp)
    if (!requestObj) return

    const requestId = timestamp
    const currentMode = state.detailViewMode[requestId] || 'conversation'

    // Calculate cost breakdown
    const promptTokens = requestObj.prompt_tokens || 0
    const completionTokens = requestObj.completion_tokens || 0
    const totalTokens = requestObj.total_tokens || 0
    const cost = requestObj.cost || 0

    // Rough cost split based on token counts (not exact but reasonable)
    const promptCost = totalTokens > 0 ? (promptTokens / totalTokens) * cost : 0
    const completionCost = cost - promptCost

    // Create main row
    const mainRow = document.createElement('tr')
    mainRow.className = 'request-row'
    mainRow.onclick = () => window.toggleDetail(requestId)
    mainRow.innerHTML = `
      <td>${escapeHtml(new Date(timestamp.endsWith('Z') || timestamp.includes('+') ? timestamp : timestamp + 'Z').toLocaleString())}</td>
      <td>${escapeHtml(row[1])}</td>
      <td>${row[2].toLocaleString()}</td>
      <td>$${row[3].toFixed(4)}</td>
      <td>${row[4]}ms</td>
    `

    // Create detail row, restore expanded state
    const detailRow = document.createElement('tr')
    detailRow.id = 'detail-' + requestId
    detailRow.style.display = state.expandedRequests.has(requestId) ? 'table-row' : 'none'

    // Extract parameters from request data
    let paramsHtml = ''
    try {
      const req = JSON.parse(requestObj.request_data)
      const params = []

      if (req.temperature !== null && req.temperature !== undefined) {
        params.push(`temp: ${req.temperature}`)
      }
      if (req.max_tokens !== null && req.max_tokens !== undefined) {
        params.push(`max: ${req.max_tokens}`)
      }
      if (req.timeout !== null && req.timeout !== undefined) {
        params.push(`timeout: ${req.timeout}s`)
      }
      if (req.num_retries !== null && req.num_retries !== undefined) {
        params.push(`retries: ${req.num_retries}`)
      }
      if (req.top_p !== null && req.top_p !== undefined) {
        params.push(`top_p: ${req.top_p}`)
      }

      if (params.length > 0) {
        paramsHtml = `
          <div class="detail-stat">
            <span class="detail-stat-label">Params: </span>
            <span class="detail-stat-value">${params.join(', ')}</span>
          </div>
        `
      }
    } catch(e) {
      // Ignore parsing errors
    }

    // Build detail content
    const detailHeader = `
      <div class="detail-header">
        <div class="detail-stats">
          <div class="detail-stat">
            <span class="detail-stat-label">Model: </span>
            <span class="detail-stat-value">${escapeHtml(requestObj.model)}</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-label">Provider: </span>
            <span class="detail-stat-value">${escapeHtml(requestObj.provider || 'unknown')}</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-label">Tokens: </span>
            <span class="detail-stat-value">${promptTokens.toLocaleString()} in / ${completionTokens.toLocaleString()} out = ${totalTokens.toLocaleString()} total</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-label">Cost: </span>
            <span class="detail-stat-value">$${cost.toFixed(4)} ($${promptCost.toFixed(4)} in + $${completionCost.toFixed(4)} out)</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-label">Duration: </span>
            <span class="detail-stat-value">${requestObj.duration_ms}ms</span>
          </div>
          ${paramsHtml}
        </div>
      </div>
    `

    const toggleButtons = `
      <div class="detail-toggle">
        <button class="toggle-btn ${currentMode === 'conversation' ? 'active' : ''}" data-mode="conversation" onclick="event.stopPropagation(); window.toggleDetailView('${requestId}', 'conversation')">Conversation</button>
        <button class="toggle-btn ${currentMode === 'json' ? 'active' : ''}" data-mode="json" onclick="event.stopPropagation(); window.toggleDetailView('${requestId}', 'json')">Raw JSON</button>
      </div>
    `

    // Generate initial content
    let contentHtml = ''
    if (currentMode === 'conversation') {
      contentHtml = renderConversationView(requestObj)
    } else {
      let requestHtml = '<span class="error">Error parsing request</span>'
      let responseHtml = '<span class="error">Error parsing response</span>'

      try {
        const req = JSON.parse(requestObj.request_data)
        requestHtml = renderJsonTree(req)
      } catch(e) {}

      try {
        const resp = JSON.parse(requestObj.response_data)
        responseHtml = renderJsonTree(resp)
      } catch(e) {}

      contentHtml = `
        <b>Request:</b>
        <div class="json-view json-tree">${requestHtml}</div>
        <b>Response:</b>
        <div class="json-view json-tree">${responseHtml}</div>
      `
    }

    detailRow.innerHTML = `
      <td colspan="5" class="request-detail">
        ${detailHeader}
        ${toggleButtons}
        <div class="detail-content">
          ${contentHtml}
        </div>
      </td>
    `

    tbody.appendChild(mainRow)
    tbody.appendChild(detailRow)
  })

  const table = document.getElementById('requests-list')
  table.innerHTML = `
    <thead>
      <tr>
        <th class="sortable" onclick="window.sortRequestsTable(0)">Time</th>
        <th class="sortable" onclick="window.sortRequestsTable(1)">Model</th>
        <th class="sortable" onclick="window.sortRequestsTable(2)">Tokens</th>
        <th class="sortable" onclick="window.sortRequestsTable(3)">Cost</th>
        <th class="sortable" onclick="window.sortRequestsTable(4)">Duration</th>
      </tr>
    </thead>
  `
  table.appendChild(tbody)
  updateSortIndicators(table, sortState)
}

// Toggle detail row
export function toggleDetail(id) {
  const row = document.getElementById('detail-' + id)
  if (row) {
    const isHidden = row.style.display === 'none' || !row.style.display
    row.style.display = isHidden ? 'table-row' : 'none'

    // Track expanded state
    if (isHidden) {
      state.expandedRequests.add(id)
    } else {
      state.expandedRequests.delete(id)
    }
  }
}

// Filter requests (not currently used but kept for compatibility)
export function filterRequests(filters) {
  // This function is defined but filtering is now done server-side
  // Kept for potential client-side filtering in the future
  return state.requestsData
}
