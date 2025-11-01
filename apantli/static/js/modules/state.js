// Global state management

export const state = {
  expandedRequests: new Set(),
  detailViewMode: {}, // Track view mode per request: 'conversation' or 'json'
  tableSortState: {}, // { tableId: { column: index, direction: 'asc'|'desc'|null, originalData: [] } }
  modelsData: [],
  requestsData: [],
  requestsObjects: [],
  serverAggregates: { total: 0, total_tokens: 0, total_cost: 0, avg_cost: 0 },
  byModelData: [],
  byProviderData: [],
  errorsData: [],
  hiddenProviders: new Set(),
  currentMonth: new Date()
}

export function resetState() {
  state.expandedRequests.clear()
  state.detailViewMode = {}
  state.tableSortState = {}
  state.modelsData = []
  state.requestsData = []
  state.requestsObjects = []
  state.serverAggregates = { total: 0, total_tokens: 0, total_cost: 0, avg_cost: 0 }
  state.byModelData = []
  state.byProviderData = []
  state.errorsData = []
  state.hiddenProviders.clear()
  state.currentMonth = new Date()
}
