// Table sorting and rendering utilities

import { state } from './state.js'

export function sortTable(tableId, columnIndex, data, renderCallback) {
  if (!state.tableSortState[tableId]) {
    state.tableSortState[tableId] = { column: null, direction: null, originalData: [...data] }
  }

  const sortState = state.tableSortState[tableId]

  // Cycle through: null -> asc -> desc -> null
  if (sortState.column === columnIndex) {
    if (sortState.direction === 'asc') {
      sortState.direction = 'desc'
    } else if (sortState.direction === 'desc') {
      sortState.direction = null
      sortState.column = null
    } else {
      sortState.direction = 'asc'
    }
  } else {
    sortState.column = columnIndex
    sortState.direction = 'asc'
  }

  let sortedData
  if (sortState.direction === null) {
    // Return to original order
    sortedData = [...sortState.originalData]
  } else {
    sortedData = [...data].sort((a, b) => {
      let aVal = a[columnIndex]
      let bVal = b[columnIndex]

      // Handle null/undefined
      if (aVal == null) return sortState.direction === 'asc' ? 1 : -1
      if (bVal == null) return sortState.direction === 'asc' ? -1 : 1

      // Detect type and compare
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortState.direction === 'asc' ? aVal - bVal : bVal - aVal
      }

      // String comparison (case-insensitive)
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      const comparison = aStr.localeCompare(bStr)
      return sortState.direction === 'asc' ? comparison : -comparison
    })
  }

  renderCallback(sortedData, sortState)
}

export function makeSortableHeader(tableId, headers, onSort) {
  return headers.map((header, i) =>
    `<th class="sortable" onclick="${onSort}(${i})">${header}</th>`
  ).join('')
}

export function updateSortIndicators(tableElement, sortState) {
  const headers = tableElement.querySelectorAll('th.sortable')
  headers.forEach((th, i) => {
    th.classList.remove('sort-asc', 'sort-desc')
    if (sortState && sortState.column === i) {
      th.classList.add(sortState.direction === 'asc' ? 'sort-asc' : 'sort-desc')
    }
  })
}

export function applySortIfNeeded(tableId, data) {
  const sortState = state.tableSortState[tableId]
  if (!sortState || sortState.direction === null) {
    return data
  }

  return [...data].sort((a, b) => {
    let aVal = a[sortState.column]
    let bVal = b[sortState.column]

    if (aVal == null) return sortState.direction === 'asc' ? 1 : -1
    if (bVal == null) return sortState.direction === 'asc' ? -1 : 1

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortState.direction === 'asc' ? aVal - bVal : bVal - aVal
    }

    const aStr = String(aVal).toLowerCase()
    const bStr = String(bVal).toLowerCase()
    const comparison = aStr.localeCompare(bStr)
    return sortState.direction === 'asc' ? comparison : -comparison
  })
}
