// Dashboard main entry point - imports all modules and sets up global scope

import * as core from './modules/core.js'
import * as state from './modules/state.js'
import * as requests from './modules/requests.js'
import * as stats from './modules/stats.js'
import * as calendar from './modules/calendar.js'
import * as models from './modules/models.js'

// Expose to window for Alpine.js and onclick handlers
window.dashboardApp = {
  // Core utilities
  showError: core.showError,
  hideError: core.hideError,

  // Request functions
  toggleMessageFold: requests.toggleMessageFold,
  copyConversationMessage: requests.copyConversationMessage,
  copyEntireConversation: requests.copyEntireConversation,
  copyJsonToClipboard: requests.copyJsonToClipboard,
  renderJsonTree: requests.renderJsonTree,
  toggleJson: requests.toggleJson,
  toggleDetailView: requests.toggleDetailView,
  sortRequestsTable: requests.sortRequestsTable,
  toggleDetail: requests.toggleDetail,
  loadRequests: requests.loadRequests,

  // Stats functions
  renderProviderTrends: stats.renderProviderTrends,
  toggleProvider: stats.toggleProvider,
  refreshStats: stats.refreshStats,
  sortByModelTable: stats.sortByModelTable,
  sortByProviderTable: stats.sortByProviderTable,
  sortErrorsTable: stats.sortErrorsTable,
  clearErrors: stats.clearErrors,

  // Calendar functions
  loadCalendar: calendar.loadCalendar,

  // Models functions
  loadModels: models.loadModels,
  sortModelsTable: models.sortModelsTable,
  toggleModel: models.toggleModel,
  deleteModel: models.deleteModel,
  showToast: models.showToast,
  openAddModelModal: models.openAddModelModal,
  closeAddModelModal: models.closeAddModelModal,
  selectProvider: models.selectProvider,
  selectModel: models.selectModel,
  wizardNext: models.wizardNext,
  wizardBack: models.wizardBack,
  submitAddModel: models.submitAddModel,
  openExportModal: models.openExportModal,
  closeExportModal: models.closeExportModal,
  copyExportJson: models.copyExportJson,

  // Table sorting
  sortTable: core.sortTable
}

// Store Alpine data globally for access from modules
let alpineData = null

// Tab change handler - called by Alpine.js x-init watcher
window.onTabChange = function(tab) {
  if (tab === 'stats') stats.refreshStats()
  if (tab === 'calendar') calendar.loadCalendar()
  if (tab === 'models') models.loadModels()
  if (tab === 'requests' && alpineData) requests.loadRequests(alpineData)
}

// Initialize when Alpine is ready
document.addEventListener('alpine:initialized', () => {
  // Store Alpine data reference
  alpineData = window.Alpine.$data(document.body)

  // Load initial tab based on URL hash
  const hash = window.location.hash.slice(1) || 'requests'
  if (hash === 'requests' && alpineData) {
    requests.loadRequests(alpineData)
  } else if (hash === 'stats') {
    stats.refreshStats()
  } else if (hash === 'calendar') {
    calendar.loadCalendar()
  } else if (hash === 'models') {
    models.loadModels()
  }
})
