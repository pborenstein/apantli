// Models CRUD and add model wizard
import { sortTable, applySortIfNeeded, updateSortIndicators } from './core.js'
import { tableSortState } from './state.js'

// Module-level state
let modelsData = []
let wizardState = {
  currentStep: 1,
  selectedProvider: null,
  selectedModel: null,
  providers: [],
  models: []
}

export async function loadModels() {
    const res = await fetch('/models')
    const data = await res.json()

    // Convert to array format for sorting: [name, provider, litellm_model, enabled, input_cost, output_cost]
    modelsData = data.models.map(m => [
        m.name,
        m.provider,
        m.litellm_model,
        m.enabled !== undefined ? m.enabled : true,
        m.input_cost_per_million || 0,
        m.output_cost_per_million || 0
    ])

    if (!tableSortState['models-list']) {
        tableSortState['models-list'] = { column: null, direction: null, originalData: [...modelsData] }
    } else {
        tableSortState['models-list'].originalData = [...modelsData]
    }
    renderModelsTable(applySortIfNeeded('models-list', modelsData, tableSortState), tableSortState['models-list'])
}

export function sortModelsTable(columnIndex) {
    sortTable('models-list', columnIndex, modelsData, renderModelsTable, tableSortState)
}

function renderModelsTable(data, sortState) {
    const table = document.getElementById('models-list')
    table.innerHTML = `
        <thead>
            <tr>
                <th class="sortable" onclick="dashboardApp.sortModelsTable(0)">Name</th>
                <th class="sortable" onclick="dashboardApp.sortModelsTable(1)">Provider</th>
                <th class="sortable" onclick="dashboardApp.sortModelsTable(2)">LiteLLM Model</th>
                <th class="sortable" onclick="dashboardApp.sortModelsTable(3)">Status</th>
                <th class="sortable" onclick="dashboardApp.sortModelsTable(4)">Input Cost/1M</th>
                <th class="sortable" onclick="dashboardApp.sortModelsTable(5)">Output Cost/1M</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            ${data.map(row => {
                const name = row[0]
                const enabled = row[3]
                const escapedName = name.replace(/'/g, "\\'")
                const toggleButton = enabled
                    ? `<button class="btn-sm btn-success" onclick="dashboardApp.toggleModel('${escapedName}', false)">Enabled</button>`
                    : `<button class="btn-sm btn-secondary" onclick="dashboardApp.toggleModel('${escapedName}', true)">Disabled</button>`

                return `
                    <tr>
                        <td>${name}</td>
                        <td>${row[1]}</td>
                        <td>${row[2]}</td>
                        <td>${toggleButton}</td>
                        <td>${row[4] ? '$' + row[4].toFixed(2) : 'N/A'}</td>
                        <td>${row[5] ? '$' + row[5].toFixed(2) : 'N/A'}</td>
                        <td class="actions-cell">
                            <button class="btn-sm btn-danger" onclick="dashboardApp.deleteModel('${escapedName}')">Delete</button>
                        </td>
                    </tr>
                `
            }).join('')}
        </tbody>
    `
    updateSortIndicators(table, sortState)
}

export async function toggleModel(modelName, enabled) {
    try {
        const res = await fetch(`/api/models/${encodeURIComponent(modelName)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
        })

        if (!res.ok) {
            const error = await res.json()
            alert('Error: ' + (error.error || 'Failed to toggle model'))
            return
        }

        // Reload models to reflect changes
        await loadModels()
        showToast(`Model ${modelName} ${enabled ? 'enabled' : 'disabled'}`)
    } catch (error) {
        console.error('Error toggling model:', error)
        alert('Failed to toggle model: ' + error.message)
    }
}

export async function deleteModel(modelName) {
    if (!confirm(`Are you sure you want to delete the model "${modelName}"?\n\nThis will remove it from config.yaml.`)) {
        return
    }

    try {
        const res = await fetch(`/api/models/${encodeURIComponent(modelName)}`, {
            method: 'DELETE'
        })

        if (!res.ok) {
            const error = await res.json()
            alert('Error: ' + (error.error || 'Failed to delete model'))
            return
        }

        // Reload models to reflect changes
        await loadModels()
        showToast(`Model ${modelName} deleted`)
    } catch (error) {
        console.error('Error deleting model:', error)
        alert('Failed to delete model: ' + error.message)
    }
}

export function showToast(message) {
    // Simple toast notification
    const toast = document.createElement('div')
    toast.className = 'toast'
    toast.textContent = message
    document.body.appendChild(toast)

    setTimeout(() => {
        toast.classList.add('show')
    }, 10)

    setTimeout(() => {
        toast.classList.remove('show')
        setTimeout(() => toast.remove(), 300)
    }, 3000)
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text


        'google': 'https://ai.google.dev/gemini-api/docs/models/gemini',
        'gemini': 'https://ai.google.dev/gemini-api/docs/models/gemini',
        'cohere': 'https://docs.cohere.com/docs/models',
        'mistral': 'https://docs.mistral.ai/getting-started/models/',
        'azure': 'https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models',
        'bedrock': 'https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html',
        'vertex_ai': 'https://cloud.google.com/vertex-ai/docs/generative-ai/learn/models',
        'groq': 'https://console.groq.com/docs/models',
        'together_ai': 'https://docs.together.ai/docs/inference-models',
        'fireworks_ai': 'https://docs.fireworks.ai/guides/querying-text-models',
        'replicate': 'https://replicate.com/explore',
        'perplexity': 'https://docs.perplexity.ai/docs/model-cards',
        'deepseek': 'https://platform.deepseek.com/api-docs/',
        'xai': 'https://docs.x.ai/docs',
        'openrouter': 'https://openrouter.ai/docs#models'
    }
    return urls[providerName] || `https://docs.litellm.ai/docs/providers/${providerName}`
}

export async function openAddModelModal() {
    // Reset wizard state
    wizardState = {
        currentStep: 1,
        selectedProvider: null,
        selectedModel: null,
        providers: [],
        models: []
    }

    // Reset form inputs
    document.getElementById('model-name-input').value = ''
    document.getElementById('api-key-env-input').value = ''
    document.getElementById('model-enabled-input').checked = true
    document.getElementById('temperature-input').value = ''
    document.getElementById('max-tokens-input').value = ''
    document.getElementById('timeout-input').value = ''
    document.getElementById('retries-input').value = ''

    // Load providers
    try {
        const res = await fetch('/api/providers')
        if (!res.ok) throw new Error('Failed to fetch providers')
        const data = await res.json()
        wizardState.providers = data.providers
        await renderProviderList(data.providers)
    } catch (error) {
        console.error('Error loading providers:', error)
        alert('Failed to load providers: ' + error.message)
        return
    }

    // Show modal at step 1
    showWizardStep(1)
    const modal = document.getElementById('add-model-modal')
    modal.classList.add('show')
}

export function closeAddModelModal() {
    const modal = document.getElementById('add-model-modal')
    modal.classList.remove('show')
}

function showWizardStep(step) {
    wizardState.currentStep = step

    // Hide all steps
    for (let i = 1; i <= 3; i++) {
        document.getElementById(`wizard-step-${i}`).style.display = 'none'
    }

    // Show current step
    document.getElementById(`wizard-step-${step}`).style.display = 'block'

    // Update progress indicators
    document.querySelectorAll('.wizard-step').forEach((el, idx) => {
        const stepNum = idx + 1
        if (stepNum < step) {
            el.classList.add('completed')
            el.classList.remove('active')
        } else if (stepNum === step) {
            el.classList.add('active')
            el.classList.remove('completed')
        } else {
            el.classList.remove('active', 'completed')
        }
    })

    // Update button visibility
    const backBtn = document.getElementById('wizard-back-btn')
    const nextBtn = document.getElementById('wizard-next-btn')
    const submitBtn = document.getElementById('wizard-submit-btn')

    backBtn.style.display = step > 1 ? 'inline-block' : 'none'
    nextBtn.style.display = step < 3 ? 'inline-block' : 'none'
    submitBtn.style.display = step === 3 ? 'inline-block' : 'none'

    // Update button enabled state
    updateNextButtonState()
}

function updateNextButtonState() {
    const nextBtn = document.getElementById('wizard-next-btn')
    const submitBtn = document.getElementById('wizard-submit-btn')

    if (wizardState.currentStep === 1) {
        nextBtn.disabled = !wizardState.selectedProvider
    } else if (wizardState.currentStep === 2) {
        nextBtn.disabled = !wizardState.selectedModel
    } else if (wizardState.currentStep === 3) {
        const modelName = document.getElementById('model-name-input').value.trim()
        const apiKeyEnv = document.getElementById('api-key-env-input').value.trim()
        submitBtn.disabled = !modelName || !apiKeyEnv
    }
}

async function renderProviderList(providers) {
    // Get active providers from current models
    const modelsRes = await fetch('/models')
    const modelsData = await modelsRes.json()
    const activeProviders = new Set(modelsData.models.map(m => m.provider))

    // Sort: active providers first, then alphabetically
    const sortedProviders = [...providers].sort((a, b) => {
        const aActive = activeProviders.has(a.name)
        const bActive = activeProviders.has(b.name)

        if (aActive && !bActive) return -1
        if (!aActive && bActive) return 1
        return a.display_name.localeCompare(b.display_name)
    })

    const container = document.getElementById('provider-list')
    container.innerHTML = sortedProviders.map(provider => {
        const isActive = activeProviders.has(provider.name)
        const activeBadge = isActive ? '<span class="badge-active">Active</span>' : ''
        const providerUrl = getProviderUrl(provider.name)
        return `
            <div class="provider-card" data-provider="${provider.name}" onclick="dashboardApp.selectProvider('${provider.name}')">
                <div class="provider-name">
                    ${provider.display_name} ${activeBadge}
                    <a href="${providerUrl}" target="_blank" class="provider-link" onclick="event.stopPropagation()" title="View ${provider.display_name} documentation">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                            <polyline points="15 3 21 3 21 9"></polyline>
                            <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                    </a>
                </div>
                <div class="provider-count">${provider.model_count} models</div>
            </div>
        `
    }).join('')

    // Setup search
    const searchInput = document.getElementById('provider-search')
    searchInput.value = ''
    searchInput.oninput = () => filterProviders(searchInput.value.toLowerCase())
}

function filterProviders(searchTerm) {
    const cards = document.querySelectorAll('.provider-card')
    cards.forEach(card => {
        const providerName = card.querySelector('.provider-name').textContent.toLowerCase()
        card.style.display = providerName.includes(searchTerm) ? 'block' : 'none'
    })
}

export async function selectProvider(providerName) {
    wizardState.selectedProvider = providerName

    // Highlight selected provider
    document.querySelectorAll('.provider-card').forEach(card => {
        card.classList.remove('selected')
    })
    document.querySelector(`.provider-card[data-provider="${providerName}"]`).classList.add('selected')

    // Load models for this provider
    try {
        const res = await fetch(`/api/providers/${providerName}/models`)
        if (!res.ok) throw new Error('Failed to fetch models')
        const data = await res.json()
        wizardState.models = data.models
        updateNextButtonState()
    } catch (error) {
        console.error('Error loading models:', error)
        alert('Failed to load models: ' + error.message)
    }
}

export async function wizardNext() {
    if (wizardState.currentStep === 1) {
        // Moving from provider to model selection
        const providerDisplayName = wizardState.providers.find(p => p.name === wizardState.selectedProvider)?.display_name || wizardState.selectedProvider
        document.getElementById('selected-provider-name').textContent = providerDisplayName

        // Set provider docs link
        const docsLink = document.getElementById('provider-docs-link')
        docsLink.href = getProviderUrl(wizardState.selectedProvider)
        docsLink.title = `View ${providerDisplayName} documentation`

        await renderModelList(wizardState.models)
        showWizardStep(2)
    } else if (wizardState.currentStep === 2) {
        // Moving from model to configuration
        populateConfigurationStep()
        showWizardStep(3)
    }
}

export function wizardBack() {
    if (wizardState.currentStep > 1) {
        showWizardStep(wizardState.currentStep - 1)
    }
}

async function renderModelList(models) {
    // Get configured models to show which are already in use
    const configuredRes = await fetch('/models')
    const configuredData = await configuredRes.json()

    // Create a map of litellm_model -> configured names
    // Handle both formats: "provider/model" and "model"
    const configuredMap = {}
    configuredData.models.forEach(m => {
        const litellmModel = m.litellm_model
        // Store with full path
        if (!configuredMap[litellmModel]) {
            configuredMap[litellmModel] = new Set()
        }
        configuredMap[litellmModel].add(m.name)

        // Also store without provider prefix for matching
        const modelWithoutProvider = litellmModel.includes('/') ? litellmModel.split('/')[1] : litellmModel
        if (!configuredMap[modelWithoutProvider]) {
            configuredMap[modelWithoutProvider] = new Set()
        }
        configuredMap[modelWithoutProvider].add(m.name)
    })

    // Sort: configured models first, then by name
    const sortedModels = [...models].sort((a, b) => {
        const aConfigured = configuredMap[a.litellm_id] && configuredMap[a.litellm_id].size > 0
        const bConfigured = configuredMap[b.litellm_id] && configuredMap[b.litellm_id].size > 0

        if (aConfigured && !bConfigured) return -1
        if (!aConfigured && bConfigured) return 1
        return a.name.localeCompare(b.name)
    })

    const container = document.getElementById('model-list')
    container.innerHTML = sortedModels.map(model => {
        const escapedId = model.litellm_id.replace(/'/g, "\\'")
        const configuredNames = Array.from(configuredMap[model.litellm_id] || [])
        const configuredBadges = configuredNames.length > 0
            ? configuredNames.map(name => `<span class="badge-configured" title="Already configured as '${name}'">${name}</span>`).join('')
            : ''

        return `
            <div class="model-card" data-model-id="${escapedId}"
                 data-name="${model.name.toLowerCase()}"
                 data-input-cost="${model.input_cost_per_million}"
                 data-output-cost="${model.output_cost_per_million}"
                 onclick="selectModel('${escapedId}')">
                <div class="model-name">
                    ${model.name}
                    ${configuredBadges}
                </div>
                <div class="model-details">
                    <div class="model-cost-row">
                        <span>In: $${model.input_cost_per_million.toFixed(2)}/M</span>
                        <span>Out: $${model.output_cost_per_million.toFixed(2)}/M</span>
                    </div>
                    ${model.max_tokens ? `<div class="model-tokens">${model.max_tokens.toLocaleString()} tokens</div>` : ''}
                </div>
            </div>
        `
    }).join('')

    // Setup search
    const searchInput = document.getElementById('model-search')
    searchInput.value = ''
    searchInput.oninput = () => filterModels(searchInput.value.toLowerCase())

    // Reset sort dropdown
    document.getElementById('model-sort-select').value = 'name'
}

function sortModels(models, sortBy) {
    return [...models].sort((a, b) => {
        if (sortBy === 'name') {
            return a.name.localeCompare(b.name)
        } else if (sortBy === 'input-cost') {
            return a.input_cost_per_million - b.input_cost_per_million
        } else if (sortBy === 'output-cost') {
            return a.output_cost_per_million - b.output_cost_per_million
        }
        return 0
    })
}

function sortModelList() {
    const sortBy = document.getElementById('model-sort-select').value
    const sortedModels = sortModels(wizardState.models, sortBy)

    const container = document.getElementById('model-list')
    const cards = Array.from(container.querySelectorAll('.model-card'))

    // Sort the DOM elements
    sortedModels.forEach(model => {
        const escapedId = model.litellm_id.replace(/'/g, "\\'")
        const card = container.querySelector(`.model-card[data-model-id="${escapedId}"]`)
        if (card) {
            container.appendChild(card)
        }
    })
}

function filterModels(searchTerm) {
    const cards = document.querySelectorAll('.model-card')
    cards.forEach(card => {
        const modelName = card.querySelector('.model-name').textContent.toLowerCase()
        card.style.display = modelName.includes(searchTerm) ? 'block' : 'none'
    })
}

export function selectModel(litellmId) {
    wizardState.selectedModel = wizardState.models.find(m => m.litellm_id === litellmId)

    // Highlight selected model
    document.querySelectorAll('.model-card').forEach(card => {
        card.classList.remove('selected')
    })
    document.querySelector(`.model-card[data-model-id="${litellmId}"]`).classList.add('selected')

    updateNextButtonState()
}

function populateConfigurationStep() {
    const model = wizardState.selectedModel

    // Populate summary
    document.getElementById('summary-litellm-model').textContent = model.litellm_id
    document.getElementById('summary-input-cost').textContent = `$${model.input_cost_per_million.toFixed(2)}/1M tokens`
    document.getElementById('summary-output-cost').textContent = `$${model.output_cost_per_million.toFixed(2)}/1M tokens`
    document.getElementById('summary-max-tokens').textContent = model.max_tokens || 'N/A'

    // Suggest model name and API key based on provider
    const suggestedName = model.name.replace(/\//g, '-').toLowerCase()
    document.getElementById('model-name-input').value = suggestedName

    // Suggest API key env var based on provider
    const apiKeyMap = {
        'openai': 'OPENAI_API_KEY',
        'anthropic': 'ANTHROPIC_API_KEY',
        'google': 'GOOGLE_API_KEY',
        'gemini': 'GOOGLE_API_KEY',
        'cohere': 'COHERE_API_KEY',
        'mistral': 'MISTRAL_API_KEY',
        'azure': 'AZURE_API_KEY'
    }
    const suggestedApiKey = apiKeyMap[wizardState.selectedProvider] || `${wizardState.selectedProvider.toUpperCase()}_API_KEY`
    document.getElementById('api-key-env-input').value = suggestedApiKey

    // Add input listeners to update submit button state
    document.getElementById('model-name-input').oninput = updateNextButtonState
    document.getElementById('api-key-env-input').oninput = updateNextButtonState
}

export async function submitAddModel() {
    const modelName = document.getElementById('model-name-input').value.trim()
    const apiKeyEnv = document.getElementById('api-key-env-input').value.trim()
    const enabled = document.getElementById('model-enabled-input').checked
    const temperature = document.getElementById('temperature-input').value
    const maxTokens = document.getElementById('max-tokens-input').value
    const timeout = document.getElementById('timeout-input').value
    const retries = document.getElementById('retries-input').value

    if (!modelName || !apiKeyEnv) {
        alert('Please fill in all required fields')
        return
    }

    const payload = {
        model_name: modelName,
        litellm_model: wizardState.selectedModel.litellm_id,
        api_key_env: apiKeyEnv,
        enabled: enabled
    }

    // Add optional fields if provided
    if (temperature) payload.temperature = parseFloat(temperature)
    if (maxTokens) payload.max_tokens = parseInt(maxTokens)
    if (timeout) payload.timeout = parseInt(timeout)
    if (retries) payload.num_retries = parseInt(retries)

    try {
        const res = await fetch('/api/models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })

        if (!res.ok) {
            const error = await res.json()
            alert('Error: ' + (error.error || 'Failed to add model'))
            return
        }

        // Success - close modal and reload models
        closeAddModelModal()
        showToast(`Model ${modelName} added successfully`)
        await loadModels()
    } catch (error) {
        console.error('Error adding model:', error)
        alert('Failed to add model: ' + error.message)
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const addModal = document.getElementById('add-model-modal')
    if (event.target === addModal) {
        closeAddModelModal()
    }
})

export async function openExportModal() {
    try {
        const res = await fetch('/api/export/obsidian')
        if (!res.ok) {
            throw new Error('Failed to fetch export data')
        }

        const data = await res.json()

        // Update modal content
        document.getElementById('export-count').textContent = data.models.length
        document.getElementById('export-json').textContent = JSON.stringify(data, null, 2)

        // Show modal
        const modal = document.getElementById('export-modal')
        modal.classList.add('show')
    } catch (error) {
        console.error('Error opening export modal:', error)
        alert('Failed to generate export: ' + error.message)
    }
}

export function closeExportModal() {
    const modal = document.getElementById('export-modal')
    modal.classList.remove('show')
}

export async function copyExportJson() {
    const jsonText = document.getElementById('export-json').textContent

    try {
        await navigator.clipboard.writeText(jsonText)
        showToast('Copied to clipboard!')
    } catch (error) {
        // Fallback for older browsers
        const textarea = document.createElement('textarea')
        textarea.value = jsonText
        document.body.appendChild(textarea)
        textarea.select()
        try {
            document.execCommand('copy')
            showToast('Copied to clipboard!')
        } catch (err) {
            alert('Failed to copy to clipboard')
        }
        document.body.removeChild(textarea)
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('export-modal')
    if (event.target === modal) {
        closeExportModal()
    }
})
