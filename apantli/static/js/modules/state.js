// Load expanded requests from localStorage
export let expandedRequests = new Set(JSON.parse(localStorage.getItem('apantli_expandedRequests') || '[]'))

// Load folded messages from localStorage
export let foldedMessages = new Set(JSON.parse(localStorage.getItem('apantli_foldedMessages') || '[]'))

// Track view mode per request: 'conversation' or 'json'
export let detailViewMode = {}

// Store conversation messages by requestId:messageIndex
export let conversationMessages = {}

export function saveExpandedRequests() {
  localStorage.setItem('apantli_expandedRequests', JSON.stringify([...expandedRequests]))
}

export function saveFoldedMessages() {
  localStorage.setItem('apantli_foldedMessages', JSON.stringify([...foldedMessages]))
}

// Table sorting state: { tableId: { column: index, direction: 'asc'|'desc'|null, originalData: [] } }
export let tableSortState = {}

// Server-side sort state for requests table
export let requestsSortState = { column: null, direction: 'desc' } // Default: timestamp DESC
