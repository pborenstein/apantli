// Models table loading and rendering

import { state } from './state.js'
import { sortTable, applySortIfNeeded, updateSortIndicators } from './tables.js'

// Load models from API
export async function loadModels() {
  const res = await fetch('/models')
  const data = await res.json()

  // Convert to array format for sorting: [name, provider, litellm_model, input_cost, output_cost]
  state.modelsData = data.models.map(m => [
    m.name,
    m.provider,
    m.litellm_model,
    m.input_cost_per_million || 0,
    m.output_cost_per_million || 0
  ])

  if (!state.tableSortState['models-list']) {
    state.tableSortState['models-list'] = { column: null, direction: null, originalData: [...state.modelsData] }
  } else {
    state.tableSortState['models-list'].originalData = [...state.modelsData]
  }
  renderModelsTable(applySortIfNeeded('models-list', state.modelsData), state.tableSortState['models-list'])
}

// Sort models table
export function sortModelsTable(columnIndex) {
  sortTable('models-list', columnIndex, state.modelsData, renderModelsTable)
}

// Render models table
function renderModelsTable(data, sortState) {
  const table = document.getElementById('models-list')
  table.innerHTML = `
    <thead>
      <tr>
        <th class="sortable" onclick="window.sortModelsTable(0)">Name</th>
        <th class="sortable" onclick="window.sortModelsTable(1)">Provider</th>
        <th class="sortable" onclick="window.sortModelsTable(2)">LiteLLM Model</th>
        <th class="sortable" onclick="window.sortModelsTable(3)">Input Cost/1M</th>
        <th class="sortable" onclick="window.sortModelsTable(4)">Output Cost/1M</th>
      </tr>
    </thead>
    <tbody>
      ${data.map(row => `
        <tr>
          <td>${row[0]}</td>
          <td>${row[1]}</td>
          <td>${row[2]}</td>
          <td>${row[3] ? '$' + row[3].toFixed(2) : 'N/A'}</td>
          <td>${row[4] ? '$' + row[4].toFixed(2) : 'N/A'}</td>
        </tr>
      `).join('')}
    </tbody>
  `
  updateSortIndicators(table, sortState)
}
