// Global state management

export const state = {
  expandedRequests: new Set(),
  detailViewMode: {}, // Track view mode per request: 'conversation' or 'json'
  tableSortState: {}, // { tableId: { column: index, direction: 'asc'|'desc'|null, originalData: [] } }
  modelsData: [],
  requestsObjects: [],
  hiddenProviders: new Set()
}

export function resetState() {
  state.expandedRequests.clear()
  state.detailViewMode = {}
  state.tableSortState = {}
  state.modelsData = []
  state.requestsObjects = []
  state.hiddenProviders.clear()
}
