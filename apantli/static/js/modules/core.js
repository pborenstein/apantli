// Error handling utilities
export function showError(message) {
  const errorBanner = document.getElementById('error-banner')
  errorBanner.textContent = message
  errorBanner.style.display = 'block'
  setTimeout(() => {
    errorBanner.style.display = 'none'
  }, 5000)
}

export function hideError() {
  const errorBanner = document.getElementById('error-banner')
  errorBanner.style.display = 'none'
}

// Fetch with error handling
export async function fetchWithErrorHandling(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    return await res.json()
  } catch (err) {
    showError(`Failed to load data: ${err.message}`)
    return null
  }
}

// Extract text from content (handles both string and multimodal array formats)
export function extractContentText(content) {
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

// Provider colors - read from CSS custom properties
export function getProviderColor(provider) {
  const style = getComputedStyle(document.documentElement)
  const colorVar = `--color-${provider.toLowerCase()}`
  const color = style.getPropertyValue(colorVar).trim()
  return color || style.getPropertyValue('--color-default').trim()
}

// Generate color tints for models within a provider
export function getModelColor(provider, modelIndex, totalModels) {
  const baseColor = getProviderColor(provider)

  // Parse hex color to RGB
  const r = parseInt(baseColor.slice(1, 3), 16)
  const g = parseInt(baseColor.slice(3, 5), 16)
  const b = parseInt(baseColor.slice(5, 7), 16)

  // Don't tint if only one model
  if (totalModels === 1) {
    return baseColor
  }

  // Create subtle brightness variations
  // Use brightness multiplier: from 0.85 (darker) to 1.15 (lighter)
  const step = 0.30 / (totalModels - 1) // Range across 30% brightness
  const multiplier = 0.85 + (step * modelIndex)

  // Apply multiplier to RGB
  const newR = Math.min(255, Math.round(r * multiplier))
  const newG = Math.min(255, Math.round(g * multiplier))
  const newB = Math.min(255, Math.round(b * multiplier))

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`
}

// HTML escape utility
export function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// Generate gradient tints for values in a range
export function getValueTint(value, min, max, baseColor = '#3b82f6') {
  if (max === min) return baseColor

  // Normalize value to 0-1 range
  const normalized = (value - min) / (max - min)

  // Parse base color to RGB
  const r = parseInt(baseColor.slice(1, 3), 16)
  const g = parseInt(baseColor.slice(3, 5), 16)
  const b = parseInt(baseColor.slice(5, 7), 16)

  // Subtle brighten: 0.7 to 1.0 range (much more subtle)
  // Higher values = slightly brighter
  const factor = 0.7 + (normalized * 0.3)
  const nr = Math.min(255, Math.round(r + (255 - r) * (factor - 0.7)))
  const ng = Math.min(255, Math.round(g + (255 - g) * (factor - 0.7)))
  const nb = Math.min(255, Math.round(b + (255 - b) * (factor - 0.7)))

  return `rgb(${nr}, ${ng}, ${nb})`
}

// Table sorting utilities
export function sortTable(tableId, columnIndex, data, renderCallback, tableSortState) {
  if (!tableSortState[tableId]) {
    tableSortState[tableId] = { column: null, direction: null, originalData: [...data] }
  }

  const state = tableSortState[tableId]

  // Cycle through: null -> asc -> desc -> null
  if (state.column === columnIndex) {
    if (state.direction === 'asc') {
      state.direction = 'desc'
    } else if (state.direction === 'desc') {
      state.direction = null
      state.column = null
    } else {
      state.direction = 'asc'
    }
  } else {
    state.column = columnIndex
    state.direction = 'asc'
  }

  let sortedData
  if (state.direction === null) {
    // Return to original order
    sortedData = [...state.originalData]
  } else {
    sortedData = [...data].sort((a, b) => {
      let aVal = a[columnIndex]
      let bVal = b[columnIndex]

      // Handle null/undefined
      if (aVal == null) return state.direction === 'asc' ? 1 : -1
      if (bVal == null) return state.direction === 'asc' ? -1 : 1

      // Detect type and compare
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return state.direction === 'asc' ? aVal - bVal : bVal - aVal
      }

      // String comparison (case-insensitive)
      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      const comparison = aStr.localeCompare(bStr)
      return state.direction === 'asc' ? comparison : -comparison
    })
  }

  renderCallback(sortedData, state)
}

export function updateSortIndicators(tableElement, state) {
  const headers = tableElement.querySelectorAll('th.sortable')
  headers.forEach((th, i) => {
    th.classList.remove('sort-asc', 'sort-desc')
    if (state && state.column === i) {
      th.classList.add(state.direction === 'asc' ? 'sort-asc' : 'sort-desc')
    }
  })
}

export function applySortIfNeeded(tableId, data, tableSortState) {
  const state = tableSortState[tableId]
  if (!state || state.direction === null) {
    return data
  }

  return [...data].sort((a, b) => {
    let aVal = a[state.column]
    let bVal = b[state.column]

    if (aVal == null) return state.direction === 'asc' ? 1 : -1
    if (bVal == null) return state.direction === 'asc' ? -1 : 1

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return state.direction === 'asc' ? aVal - bVal : bVal - aVal
    }

    const aStr = String(aVal).toLowerCase()
    const bStr = String(bVal).toLowerCase()
    const comparison = aStr.localeCompare(bStr)
    return state.direction === 'asc' ? comparison : -comparison
  })
}
