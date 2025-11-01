// Core utilities and error handling

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

export function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

export function formatDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function getCostColor(cost, maxCost) {
  if (cost === 0) return 'var(--color-text-secondary)'

  const ratio = cost / maxCost
  if (ratio < 0.33) {
    return '#22c55e'
  } else if (ratio < 0.67) {
    return '#f59e0b'
  } else {
    return '#ef4444'
  }
}

export function copyToClipboard(text, button) {
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

export function getProviderColor(provider) {
  const colors = {
    'openai': '#10a37f',
    'anthropic': '#d4a574',
    'google': '#4285f4',
    'meta': '#0467df',
    'mistral': '#ff7000',
    'unknown': '#999999'
  }
  return colors[provider.toLowerCase()] || colors['unknown']
}

export function getModelColor(provider, modelIndex, totalModels) {
  const baseColor = getProviderColor(provider)

  if (totalModels === 1) return baseColor

  const opacity = 1.0 - (modelIndex * 0.3 / totalModels)
  return baseColor + Math.floor(opacity * 255).toString(16).padStart(2, '0')
}
