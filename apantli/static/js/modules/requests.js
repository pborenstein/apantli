// Requests table, conversation view, JSON tree, and request filtering
import { extractContentText, escapeHtml, getProviderColor, getValueTint } from './core.js'
import {
  expandedRequests,
  saveExpandedRequests,
  foldedMessages,
  saveFoldedMessages,
  detailViewMode,
  conversationMessages,
  tableSortState,
  requestsSortState
} from './state.js'

// Module-level state
let requestsData = []
let requestsObjects = [] // Store original request objects for detail rows
let serverAggregates = { total: 0, total_tokens: 0, total_cost: 0, avg_cost: 0 } // Server-side aggregates
let filterValuesLoaded = false

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
    const trimmedCode = code.trim()
    return '<pre><code>' + trimmedCode + '</code></pre>'
  })

  // Convert inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>')

  return formatted
}

// Toggle message fold state
export function toggleMessageFold(button, messageId) {
  const messageContent = button.closest('.message-content')
  const messageText = messageContent.querySelector('.message-text')
  const isFolded = messageText.classList.toggle('folded')
  button.textContent = isFolded ? '▶' : '▼'

  if (isFolded) {
    foldedMessages.add(messageId)
  } else {
    foldedMessages.delete(messageId)
  }
  saveFoldedMessages()
}

// Copy text to clipboard
function copyToClipboard(text, button) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = button.textContent
    button.textContent = 'Copied!'
    setTimeout(() => {
      button.textContent = originalText
    }, 1500)
  }).catch(err => {
    console.error('Failed to copy:', err)
  })
}

// Copy conversation message to clipboard by ID
export function copyConversationMessage(requestId, messageIndex, button) {
  const key = `${requestId}:${messageIndex}`
  const content = conversationMessages[key]
  if (content) {
    copyToClipboard(content, button)
  } else {
    console.error('Message not found:', key)
  }
}

// Copy entire conversation to clipboard
export function copyEntireConversation(requestId, button) {
  const requestObj = requestsObjects.find(r => r.timestamp === requestId)
  if (!requestObj) return

  const messages = extractConversation(requestObj)
  if (!messages) return

  // Format as: <role>content</role>
  const fullConversation = messages.map(msg => {
    return '<' + msg.role + '>\n' + msg.content + '\n</' + msg.role + '>'
  }).join('\n\n')

  copyToClipboard(fullConversation, button)
}

// Copy JSON request/response to clipboard
export function copyJsonToClipboard(requestId, type, button) {
  const requestObj = requestsObjects.find(r => r.timestamp === requestId)
  if (!requestObj) return

  let textToCopy = ''

  try {
    if (type === 'request' || type === 'both') {
      const req = JSON.parse(requestObj.request_data)
      const requestJson = JSON.stringify(req, null, 2)
      textToCopy += type === 'both' ? 'Request:\n' + requestJson : requestJson
    }

    if (type === 'both') {
      textToCopy += '\n\n'
    }

    if (type === 'response' || type === 'both') {
      const resp = JSON.parse(requestObj.response_data)
      const responseJson = JSON.stringify(resp, null, 2)
      textToCopy += type === 'both' ? 'Response:\n' + responseJson : responseJson
    }

    copyToClipboard(textToCopy, button)
  } catch (e) {
    console.error('Failed to parse JSON:', e)
  }
}

// Render conversation view
function renderConversationView(requestObj) {
  const messages = extractConversation(requestObj)
  if (!messages) {
    return '<p class="error">Could not extract conversation from request/response data</p>'
  }

  const requestId = requestObj.timestamp
  let html = '<div class="conversation-view">'

  messages.forEach((msg, index) => {
    // Store message content for copy button
    const messageKey = requestId + ':' + index
    conversationMessages[messageKey] = msg.content

    const icon = msg.role === 'user' ? '⊙' : msg.role === 'assistant' ? '◈' : '⚙'
    const roleLabel = msg.role.charAt(0).toUpperCase() + msg.role.slice(1)
    const tokens = estimateTokens(msg.content)
    const formattedContent = formatMessageContent(msg.content)
    const isFolded = foldedMessages.has(messageKey)

    const foldIcon = isFolded ? '▶' : '▼'
    const foldedClass = isFolded ? ' folded' : ''

    html += '<div class="message">'
    html += '<div class="message-icon">' + icon + '</div>'
    html += '<div class="message-content">'
    html += '<div class="message-header">'
    html += '<div>'
    html += '<span class="message-role" data-role="' + msg.role + '">' + roleLabel + '</span>'
    html += '<span class="message-meta">~' + tokens.toLocaleString() + ' tokens</span>'
    html += '</div>'
    html += '<div class="message-actions">'
    html += '<button class="fold-btn" onclick="event.stopPropagation(); dashboardApp.toggleMessageFold(this, \'' + messageKey + '\')" title="Fold/unfold message">' + foldIcon + '</button>'
    html += '<button class="copy-btn" onclick="dashboardApp.copyConversationMessage(\'' + requestId + '\', ' + index + ', this)">Copy</button>'
    html += '</div>'
    html += '</div>'
    html += '<div class="message-text' + foldedClass + '">' + formattedContent + '</div>'
    html += '</div>'
    html += '</div>'
  })

  html += '</div>'
  return html
}

// Render JSON tree with collapsible nodes
export function renderJsonTree(obj, isRoot = true) {
  if (obj === null) return '<span class="json-null">null</span>'
  if (obj === undefined) return '<span class="json-null">undefined</span>'

  const type = typeof obj
  if (type === 'string') return '<span class="json-string">"' + escapeHtml(obj) + '"</span>'
  if (type === 'number') return '<span class="json-number">' + obj + '</span>'
  if (type === 'boolean') return '<span class="json-boolean">' + obj + '</span>'

  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span>[]</span>'

    const id = 'json-' + Math.random().toString(36).substr(2, 9)
    let html = '<span class="json-toggle" onclick="dashboardApp.toggleJson(\'' + id + '\')">▼</span>['
    html += '<div id="' + id + '" class="json-line">'
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
    let html = '<span class="json-toggle" onclick="dashboardApp.toggleJson(\'' + id + '\')">▼</span>{'
    html += '<div id="' + id + '" class="json-line">'
    keys.forEach((key, i) => {
      html += '<span class="json-key">"' + escapeHtml(key) + '"</span>: '
      html += renderJsonTree(obj[key], false)
      if (i < keys.length - 1) html += ','
      html += '<br>'
    })
    html += '</div>}'
    return html
  }

  return String(obj)
}

// Toggle JSON tree node collapse
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
  detailViewMode[requestId] = mode
  const requestObj = requestsObjects.find(r => r.timestamp === requestId)
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

    let jsonViewHtml = '<div style="display: flex; gap: 8px; margin-bottom: 12px;">'
    jsonViewHtml += '<button class="copy-btn" onclick="dashboardApp.copyJsonToClipboard(\'' + requestId + '\', \'request\', this)">Copy Request</button>'
    jsonViewHtml += '<button class="copy-btn" onclick="dashboardApp.copyJsonToClipboard(\'' + requestId + '\', \'response\', this)">Copy Response</button>'
    jsonViewHtml += '<button class="copy-btn" onclick="dashboardApp.copyJsonToClipboard(\'' + requestId + '\', \'both\', this)">Copy Both</button>'
    jsonViewHtml += '</div>'
    jsonViewHtml += '<b>Request:</b>'
    jsonViewHtml += '<div class="json-view json-tree">' + requestHtml + '</div>'
    jsonViewHtml += '<b>Response:</b>'
    jsonViewHtml += '<div class="json-view json-tree">' + responseHtml + '</div>'

    contentDiv.innerHTML = jsonViewHtml
  }

  // Update toggle buttons and "Copy All" button visibility
  const toggleDiv = detailRow.querySelector('.detail-toggle')
  const conversationActive = mode === 'conversation' ? 'active' : ''
  const jsonActive = mode === 'json' ? 'active' : ''
  const copyAllButton = mode === 'conversation' ? '<button class="copy-btn" onclick="event.stopPropagation(); copyEntireConversation(\'' + requestId + '\', this)">Copy All</button>' : ''

  let toggleHtml = '<button class="toggle-btn ' + conversationActive + '" data-mode="conversation" onclick="event.stopPropagation(); toggleDetailView(\'' + requestId + '\', \'conversation\')">Conversation</button>'
  toggleHtml += '<button class="toggle-btn ' + jsonActive + '" data-mode="json" onclick="event.stopPropagation(); toggleDetailView(\'' + requestId + '\', \'json\')">Raw JSON</button>'
  toggleHtml += copyAllButton

  toggleDiv.innerHTML = toggleHtml
}

// Populate filter dropdowns once on load (not per page)
async function populateFilterDropdowns(alpineData) {
  if (filterValuesLoaded) return

  try {
    const res = await fetch('/stats/filters')
    const data = await res.json()

    const providerSelect = document.getElementById('filter-provider')
    const currentProvider = alpineData.requestFilters.provider
    providerSelect.innerHTML = '<option value="">All</option>'
    data.providers.forEach(p => {
      const option = document.createElement('option')
      option.value = p.name
      option.textContent = p.name
      if (p.name === currentProvider) option.selected = true
      providerSelect.appendChild(option)
    })

    const modelSelect = document.getElementById('filter-model')
    const currentModel = alpineData.requestFilters.model
    modelSelect.innerHTML = '<option value="">All</option>'
    data.models.forEach(m => {
      const option = document.createElement('option')
      option.value = m.name
      option.textContent = m.name
      if (m.name === currentModel) option.selected = true
      modelSelect.appendChild(option)
    })

    filterValuesLoaded = true
  } catch (e) {
    console.error('Failed to load filter values:', e)
  }
}

// Update request summary with server-side aggregates
function updateRequestSummary() {
  const summary = document.getElementById('request-summary')

  // Use server-side aggregates for ALL matching requests, not just paginated results
  if (serverAggregates.total === 0) {
    summary.style.display = 'none'
    return
  }

  document.getElementById('summary-count').textContent = serverAggregates.total.toLocaleString()
  document.getElementById('summary-cost').textContent = '$' + serverAggregates.total_cost.toFixed(4)
  document.getElementById('summary-tokens').textContent = serverAggregates.total_tokens.toLocaleString()
  document.getElementById('summary-avg-cost').textContent = '$' + serverAggregates.avg_cost.toFixed(4)

  summary.style.display = 'flex'
}

// Sort requests table (server-side)
export function sortRequestsTable(columnIndex) {
  // Update sort state
  if (requestsSortState.column === columnIndex) {
    // Toggle direction or clear
    if (requestsSortState.direction === 'desc') {
      requestsSortState.direction = 'asc'
    } else if (requestsSortState.direction === 'asc') {
      // Clear sort
      requestsSortState.column = null
      requestsSortState.direction = 'desc'
    }
  } else {
    // New column, default to desc
    requestsSortState.column = columnIndex
    requestsSortState.direction = 'desc'
  }

  // Reload data from server with new sort
  // Note: loadRequests is called through Alpine data binding
  window.loadRequests()
}

// Update sort indicators using server-side state
function updateSortIndicators(tableElement, state) {
  const headers = tableElement.querySelectorAll('th.sortable')
  headers.forEach((th, i) => {
    th.classList.remove('sort-asc', 'sort-desc')
    if (state && state.column === i) {
      th.classList.add(state.direction === 'asc' ? 'sort-asc' : 'sort-desc')
    }
  })
}

// Render requests table with gradient tinting
function renderRequestsTable(data, sortState) {
  const tbody = document.createElement('tbody')

  // Calculate min/max for gradient tinting
  const tokens = data.map(r => r[2])
  const costs = data.map(r => r[3])
  const durations = data.map(r => r[4])

  const minTokens = Math.min(...tokens)
  const maxTokens = Math.max(...tokens)
  const minCost = Math.min(...costs)
  const maxCost = Math.max(...costs)
  const minDuration = Math.min(...durations)
  const maxDuration = Math.max(...durations)

  data.forEach(row => {
    const timestamp = row[5]
    const requestObj = requestsObjects.find(r => r.timestamp === timestamp)
    if (!requestObj) return

    const requestId = timestamp
    const currentMode = detailViewMode[requestId] || 'conversation'

    // Calculate cost breakdown
    const promptTokens = requestObj.prompt_tokens || 0
    const completionTokens = requestObj.completion_tokens || 0
    const totalTokens = requestObj.total_tokens || 0
    const cost = requestObj.cost || 0

    // Rough cost split based on token counts (not exact but reasonable)
    const promptCost = totalTokens > 0 ? (promptTokens / totalTokens) * cost : 0
    const completionCost = cost - promptCost

    // Calculate gradient colors for this row
    const tokenColor = getValueTint(row[2], minTokens, maxTokens, '#3b82f6')
    const costColor = getValueTint(row[3], minCost, maxCost, '#10b981')
    const durationColor = getValueTint(row[4], minDuration, maxDuration, '#f59e0b')

    // Calculate glow intensity (higher values = more glow)
    const tokenGlow = (row[2] - minTokens) / (maxTokens - minTokens || 1)
    const costGlow = (row[3] - minCost) / (maxCost - minCost || 1)
    const durationGlow = (row[4] - minDuration) / (maxDuration - minDuration || 1)

    // Get provider color for model
    const provider = requestObj.provider || 'unknown'
    const modelColor = getProviderColor(provider)

    // Create main row
    const mainRow = document.createElement('tr')
    mainRow.id = 'row-' + requestId
    mainRow.className = 'request-row' + (expandedRequests.has(requestId) ? ' expanded' : '')
    mainRow.onclick = () => toggleDetail(requestId)
    
    const formattedDate = new Date(timestamp.endsWith('Z') || timestamp.includes('+') ? timestamp : timestamp + 'Z').toLocaleString()
    const modelShadow = '0 0 6px ' + modelColor + '30'
    const tokenShadow = '0 0 ' + (6 * tokenGlow) + 'px ' + tokenColor + '40'
    const costShadow = '0 0 ' + (6 * costGlow) + 'px ' + costColor + '40'
    const durationShadow = '0 0 ' + (6 * durationGlow) + 'px ' + durationColor + '40'

    let rowHtml = '<td>' + escapeHtml(formattedDate) + '</td>'
    rowHtml += '<td style="color: ' + modelColor + '; font-weight: 600; text-shadow: ' + modelShadow + ';">' + escapeHtml(row[1]) + '</td>'
    rowHtml += '<td style="color: ' + tokenColor + '; font-weight: 600; text-shadow: ' + tokenShadow + ';">' + row[2].toLocaleString() + '</td>'
    rowHtml += '<td style="color: ' + costColor + '; font-weight: 600; text-shadow: ' + costShadow + ';">$' + row[3].toFixed(4) + '</td>'
    rowHtml += '<td style="color: ' + durationColor + '; font-weight: 600; text-shadow: ' + durationShadow + ';">' + row[4] + 'ms</td>'
    
    mainRow.innerHTML = rowHtml

    // Create detail row, restore expanded state
    const detailRow = document.createElement('tr')
    detailRow.id = 'detail-' + requestId
    detailRow.style.display = expandedRequests.has(requestId) ? 'table-row' : 'none'

    // Extract parameters from request data
    let paramsHtml = ''
    try {
      const req = JSON.parse(requestObj.request_data)
      const params = []

      if (req.temperature !== null && req.temperature !== undefined) {
        params.push('temp: ' + req.temperature)
      }
      if (req.max_tokens !== null && req.max_tokens !== undefined) {
        params.push('max: ' + req.max_tokens)
      }
      if (req.timeout !== null && req.timeout !== undefined) {
        params.push('timeout: ' + req.timeout + 's')
      }
      if (req.num_retries !== null && req.num_retries !== undefined) {
        params.push('retries: ' + req.num_retries)
      }
      if (req.top_p !== null && req.top_p !== undefined) {
        params.push('top_p: ' + req.top_p)
      }

      if (params.length > 0) {
        paramsHtml = '<div class="detail-stat">'
        paramsHtml += '<span class="detail-stat-label">Params: </span>'
        paramsHtml += '<span class="detail-stat-value">' + params.join(', ') + '</span>'
        paramsHtml += '</div>'
      }
    } catch(e) {
      // Ignore parsing errors
    }

    // Build detail content
    let detailHeader = '<div class="detail-header"><div class="detail-stats">'
    detailHeader += '<div class="detail-stat"><span class="detail-stat-label">Model: </span><span class="detail-stat-value">' + escapeHtml(requestObj.model) + '</span></div>'
    detailHeader += '<div class="detail-stat"><span class="detail-stat-label">Provider: </span><span class="detail-stat-value">' + escapeHtml(requestObj.provider || 'unknown') + '</span></div>'
    detailHeader += '<div class="detail-stat"><span class="detail-stat-label">Tokens: </span><span class="detail-stat-value">' + promptTokens.toLocaleString() + ' in / ' + completionTokens.toLocaleString() + ' out = ' + totalTokens.toLocaleString() + ' total</span></div>'
    detailHeader += '<div class="detail-stat"><span class="detail-stat-label">Cost: </span><span class="detail-stat-value">$' + cost.toFixed(4) + ' ($' + promptCost.toFixed(4) + ' in + $' + completionCost.toFixed(4) + ' out)</span></div>'
    detailHeader += '<div class="detail-stat"><span class="detail-stat-label">Duration: </span><span class="detail-stat-value">' + requestObj.duration_ms + 'ms</span></div>'
    detailHeader += paramsHtml
    detailHeader += '</div></div>'

    const conversationActive = currentMode === 'conversation' ? 'active' : ''
    const jsonActive = currentMode === 'json' ? 'active' : ''
    const copyAllButton = currentMode === 'conversation' ? '<button class="copy-btn" onclick="event.stopPropagation(); copyEntireConversation(\'' + requestId + '\', this)">Copy All</button>' : ''

    let toggleButtons = '<div class="detail-toggle">'
    toggleButtons += '<button class="toggle-btn ' + conversationActive + '" data-mode="conversation" onclick="event.stopPropagation(); toggleDetailView(\'' + requestId + '\', \'conversation\')">Conversation</button>'
    toggleButtons += '<button class="toggle-btn ' + jsonActive + '" data-mode="json" onclick="event.stopPropagation(); toggleDetailView(\'' + requestId + '\', \'json\')">Raw JSON</button>'
    toggleButtons += copyAllButton
    toggleButtons += '</div>'

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

      contentHtml = '<div style="display: flex; gap: 8px; margin-bottom: 12px;">'
      contentHtml += '<button class="copy-btn" onclick="dashboardApp.copyJsonToClipboard(\'' + requestId + '\', \'request\', this)">Copy Request</button>'
      contentHtml += '<button class="copy-btn" onclick="dashboardApp.copyJsonToClipboard(\'' + requestId + '\', \'response\', this)">Copy Response</button>'
      contentHtml += '<button class="copy-btn" onclick="dashboardApp.copyJsonToClipboard(\'' + requestId + '\', \'both\', this)">Copy Both</button>'
      contentHtml += '</div>'
      contentHtml += '<b>Request:</b>'
      contentHtml += '<div class="json-view json-tree">' + requestHtml + '</div>'
      contentHtml += '<b>Response:</b>'
      contentHtml += '<div class="json-view json-tree">' + responseHtml + '</div>'
    }

    let detailRowHtml = '<td colspan="5" class="request-detail">'
    detailRowHtml += detailHeader
    detailRowHtml += toggleButtons
    detailRowHtml += '<div class="detail-content">' + contentHtml + '</div>'
    detailRowHtml += '</td>'

    detailRow.innerHTML = detailRowHtml

    tbody.appendChild(mainRow)
    tbody.appendChild(detailRow)
  })

  const table = document.getElementById('requests-list')
  let tableHtml = '<thead><tr>'
  tableHtml += '<th class="sortable" onclick="dashboardApp.sortRequestsTable(0)">Time</th>'
  tableHtml += '<th class="sortable" onclick="dashboardApp.sortRequestsTable(1)">Model</th>'
  tableHtml += '<th class="sortable" onclick="dashboardApp.sortRequestsTable(2)">Tokens</th>'
  tableHtml += '<th class="sortable" onclick="dashboardApp.sortRequestsTable(3)">Cost</th>'
  tableHtml += '<th class="sortable" onclick="dashboardApp.sortRequestsTable(4)">Duration</th>'
  tableHtml += '</tr></thead>'
  
  table.innerHTML = tableHtml
  table.appendChild(tbody)

  // Update sort indicators using server-side state
  updateSortIndicators(table, requestsSortState)
}

// Toggle detail row expansion
export function toggleDetail(id) {
  const detailRow = document.getElementById('detail-' + id)
  const mainRow = document.getElementById('row-' + id)
  if (detailRow) {
    const isHidden = detailRow.style.display === 'none' || !detailRow.style.display
    detailRow.style.display = isHidden ? 'table-row' : 'none'

    // Toggle expanded class on main row
    if (mainRow) {
      mainRow.classList.toggle('expanded', isHidden)
    }

    // Track expanded state
    if (isHidden) {
      expandedRequests.add(id)
    } else {
      expandedRequests.delete(id)
    }
    saveExpandedRequests()
  }
}

// Load requests with filtering and pagination
export async function loadRequests(alpineData) {
  if (!alpineData) return
  try {
    const query = alpineData.buildQuery(alpineData.dateFilter)
    const offset = (alpineData.currentPage - 1) * alpineData.itemsPerPage
    let url = '/requests' + query + (query ? '&' : '?') + 'offset=' + offset + '&limit=' + alpineData.itemsPerPage

    // Add filter parameters
    const filters = alpineData.requestFilters
    if (filters.provider) {
      url += '&provider=' + encodeURIComponent(filters.provider)
    }
    if (filters.model) {
      url += '&model=' + encodeURIComponent(filters.model)
    }
    if (filters.minCost !== '' && filters.minCost !== null) {
      url += '&min_cost=' + filters.minCost
    }
    if (filters.maxCost !== '' && filters.maxCost !== null) {
      url += '&max_cost=' + filters.maxCost
    }
    if (filters.search) {
      url += '&search=' + encodeURIComponent(filters.search)
    }

    // Add sort parameters
    const sortColumnMap = ['timestamp', 'model', 'total_tokens', 'cost', 'duration_ms']
    if (requestsSortState.column !== null) {
      url += '&sort_by=' + sortColumnMap[requestsSortState.column]
      url += '&sort_dir=' + requestsSortState.direction
    }

    const res = await fetch(url)
    const data = await res.json()

    // Store server-side aggregates for ALL matching requests
    serverAggregates = {
      total: data.total,
      total_tokens: data.total_tokens,
      total_cost: data.total_cost,
      avg_cost: data.avg_cost
    }

    // Store total for pagination
    alpineData.totalItems = data.total

    // Store original objects and convert to array format for sorting
    requestsObjects = data.requests
    requestsData = data.requests.map(r => [
      new Date(r.timestamp.endsWith('Z') || r.timestamp.includes('+') ? r.timestamp : r.timestamp + 'Z').getTime(), // For sorting by time
      r.model,
      r.total_tokens,
      r.cost,
      r.duration_ms,
      r.timestamp // Store timestamp for detail row lookup
    ])

    // Populate filter dropdowns from current page data
    await populateFilterDropdowns(alpineData)

    // Initialize or update sort state
    if (!tableSortState['requests-list']) {
      tableSortState['requests-list'] = { column: null, direction: null, originalData: [...requestsData] }
    } else {
      // Update originalData to match current filtered results
      tableSortState['requests-list'].originalData = [...requestsData]
    }

    // Update summary and render table
    updateRequestSummary()
    renderRequestsTable(requestsData, tableSortState['requests-list'])
  } catch(e) {
    document.getElementById('requests-list').innerHTML = '<tr><td colspan="5">Error loading requests</td></tr>'
  }
}
