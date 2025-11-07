// Playground interface for testing multiple models side-by-side

function compareApp() {
  return {
    // Theme (synced with dashboard)
    theme: 'light',

    // Available models from server (array of names for dropdown)
    availableModels: [],

    // Model configs indexed by name (for looking up default parameters)
    modelConfigs: {},

    // Model slots (3 slots for comparison)
    // Note: model will be set after loading from server
    // Parameters default to empty strings - only sent to server if user sets them
    slots: [
      {
        enabled: true,
        model: '',
        temperature: '',
        top_p: '',
        max_tokens: '',
        messages: [],
        conversationModel: null,  // Tracks which model is actually being used
        streaming: false,
        streamingContent: ''
      },
      {
        enabled: true,
        model: '',
        temperature: '',
        top_p: '',
        max_tokens: '',
        messages: [],
        conversationModel: null,
        streaming: false,
        streamingContent: ''
      },
      {
        enabled: false,
        model: '',
        temperature: '',
        top_p: '',
        max_tokens: '',
        messages: [],
        conversationModel: null,
        streaming: false,
        streamingContent: ''
      }
    ],

    // Current user prompt
    currentPrompt: '',

    // Loading state
    isLoading: false,

    // Initialize
    async init() {
      this.loadTheme()
      await this.loadModels()
      this.loadState()
      this.validateAndInitializeSlots()
      console.log('Playground app initialized')
    },

    // Validate slots and initialize empty ones with defaults
    validateAndInitializeSlots() {
      if (this.availableModels.length === 0) {
        console.warn('No models available')
        return
      }

      this.slots.forEach((slot, index) => {
        // If slot has no model or model doesn't exist in available models
        if (!slot.model || !this.availableModels.includes(slot.model)) {
          // Set to first available model (or second/third for variety)
          const modelIndex = Math.min(index, this.availableModels.length - 1)
          slot.model = this.availableModels[modelIndex]

          // Apply model defaults (config-only, no hardcoded defaults)
          this.applyModelDefaults(index)
        }

        // Clear conversationModel if it doesn't exist in available models
        if (slot.conversationModel && !this.availableModels.includes(slot.conversationModel)) {
          slot.conversationModel = null
        }
      })

      this.saveState()
    },

    // Load theme from localStorage (shared with dashboard)
    loadTheme() {
      try {
        const stored = localStorage.getItem('_x_theme')
        if (stored) {
          this.theme = JSON.parse(stored)
        }
      } catch (err) {
        console.error('Failed to load theme:', err)
      }
    },

    // Load available models from server
    async loadModels() {
      try {
        const res = await fetch('/models')
        const data = await res.json()

        // Store model names for dropdown
        this.availableModels = data.models.map(m => m.name).sort()

        // Store full model configs indexed by name for parameter lookups
        this.modelConfigs = {}
        data.models.forEach(m => {
          this.modelConfigs[m.name] = m
        })

        console.log('Loaded models:', this.availableModels.length)
      } catch (err) {
        console.error('Failed to load models:', err)
        this.availableModels = []
        this.modelConfigs = {}
      }
    },

    // Reset a specific parameter to empty (no default)
    resetParameter(slotIndex, paramName) {
      const slot = this.slots[slotIndex]

      // Clear to empty string - parameter won't be sent to server
      slot[paramName] = ''
      this.saveState()
    },

    // Apply model defaults when a model is selected
    // Only applies defaults from config.yaml, not hardcoded defaults
    applyModelDefaults(slotIndex) {
      const slot = this.slots[slotIndex]
      const modelConfig = this.modelConfigs[slot.model]

      // Only apply parameters that are explicitly defined in config
      // Leave others empty (will not be sent to server)
      if (modelConfig) {
        slot.temperature = modelConfig.temperature !== undefined ? modelConfig.temperature : ''
        slot.top_p = modelConfig.top_p !== undefined ? modelConfig.top_p : ''
        slot.max_tokens = modelConfig.max_tokens !== undefined ? modelConfig.max_tokens : ''
      } else {
        // No config found, clear all parameters
        slot.temperature = ''
        slot.top_p = ''
        slot.max_tokens = ''
      }

      this.saveState()
    },

    // Count enabled slots
    enabledCount() {
      return this.slots.filter(s => s.enabled).length
    },

    // Send message to all enabled slots
    async sendToAll() {
      if (!this.currentPrompt.trim() || this.isLoading) return

      const userMessage = this.currentPrompt.trim()
      this.isLoading = true

      // Send to all enabled slots in parallel
      const promises = this.slots.map((slot, index) => {
        if (slot.enabled) {
          return this.sendToSlot(index, userMessage)
        }
        return Promise.resolve()
      })

      try {
        await Promise.all(promises)
      } catch (err) {
        console.error('Error sending messages:', err)
      } finally {
        this.isLoading = false
        this.currentPrompt = ''
      }
    },

    // Send message to a specific slot
    async sendToSlot(slotIndex, userMessage) {
      const slot = this.slots[slotIndex]

      // Set conversation model on first message
      if (!slot.conversationModel) {
        slot.conversationModel = slot.model
      }

      // Add user message to history
      slot.messages.push({
        role: 'user',
        content: userMessage
      })

      // Prepare request with conversation history
      // Use conversationModel to ensure we keep using the same model throughout
      const requestBody = {
        model: slot.conversationModel,
        messages: slot.messages,
        stream: true,
        stream_options: {
          include_usage: true  // Request usage info in streaming response
        }
      }

      // Only include parameters if they have been explicitly set
      // This avoids sending incompatible parameter combinations to providers
      if (slot.temperature !== '') {
        const temperature = parseFloat(slot.temperature)
        if (!isNaN(temperature)) {
          requestBody.temperature = Math.max(0, Math.min(2, temperature))
        }
      }

      if (slot.top_p !== '') {
        const topP = parseFloat(slot.top_p)
        if (!isNaN(topP)) {
          requestBody.top_p = Math.max(0, Math.min(1, topP))
        }
      }

      if (slot.max_tokens !== '') {
        const maxTokens = parseInt(slot.max_tokens)
        if (!isNaN(maxTokens)) {
          requestBody.max_tokens = Math.max(1, maxTokens)
        }
      }

      slot.streaming = true
      slot.streamingContent = ''

      try {
        const response = await fetch('/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        // Handle streaming response
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let assistantMessage = ''
        let usage = null

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim()

              if (data === '[DONE]') {
                continue
              }

              try {
                const chunk = JSON.parse(data)

                // Check for errors in chunk
                if (chunk.error) {
                  throw new Error(chunk.error.message || 'Unknown error')
                }

                const content = chunk.choices?.[0]?.delta?.content
                if (content) {
                  assistantMessage += content
                  slot.streamingContent = assistantMessage
                }

                // Capture usage information if present
                if (chunk.usage) {
                  usage = chunk.usage
                }
              } catch (parseErr) {
                console.error('Failed to parse chunk:', parseErr, data)
              }
            }
          }
        }

        // Add complete assistant message to history with usage info
        if (assistantMessage) {
          slot.messages.push({
            role: 'assistant',
            content: assistantMessage,
            tokens: usage ? {
              prompt: usage.prompt_tokens || 0,
              completion: usage.completion_tokens || 0,
              total: usage.total_tokens || 0
            } : null
          })
        }

        slot.streaming = false
        slot.streamingContent = ''
        this.saveState()

      } catch (err) {
        console.error(`Error sending to slot ${slotIndex}:`, err)

        // Add error message
        slot.messages.push({
          role: 'assistant',
          content: `Error: ${err.message}`
        })

        slot.streaming = false
        slot.streamingContent = ''
        this.saveState()
      }
    },

    // Clear the prompt input
    clearPrompt() {
      this.currentPrompt = ''
    },

    // Start a new conversation (clear all messages)
    newConversation() {
      if (confirm('Clear all conversation history?')) {
        this.slots.forEach(slot => {
          slot.messages = []
          slot.conversationModel = null  // Reset so user can change model
          slot.streaming = false
          slot.streamingContent = ''
        })
        this.saveState()
      }
    },

    // Export all conversations to clipboard as markdown
    async exportAll() {
      const markdown = this.slots
        .filter(slot => slot.enabled && slot.messages.length > 0)
        .map((slot, index) => {
          const slotLabel = String.fromCharCode(65 + index)
          const model = slot.conversationModel || slot.model
          const header = `# Slot ${slotLabel}: ${model}\n\n**Parameters:** temp=${slot.temperature}, top_p=${slot.top_p}, max_tokens=${slot.max_tokens}\n\n---\n\n`

          const conversation = slot.messages.map(msg => {
            let text = `## ${msg.role.toUpperCase()}\n\n${msg.content}`
            if (msg.tokens) {
              text += `\n\n*${msg.tokens.prompt}→${msg.tokens.completion} tokens (${msg.tokens.total} total)*`
            }
            return text
          }).join('\n\n---\n\n')

          return header + conversation
        })
        .join('\n\n\n')

      if (!markdown) {
        alert('No conversations to export')
        return
      }

      try {
        await navigator.clipboard.writeText(markdown)
        alert('Conversations copied to clipboard!')
      } catch (err) {
        console.error('Failed to copy to clipboard:', err)
        alert('Failed to copy to clipboard. See console for details.')
      }
    },

    // Save state to localStorage
    saveState() {
      const state = {
        slots: this.slots.map(s => ({
          enabled: s.enabled,
          model: s.model,
          temperature: s.temperature,
          top_p: s.top_p,
          max_tokens: s.max_tokens,
          messages: s.messages,
          conversationModel: s.conversationModel
        }))
      }
      localStorage.setItem('apantli_compare_state', JSON.stringify(state))
    },

    // Load state from localStorage
    loadState() {
      try {
        const saved = localStorage.getItem('apantli_compare_state')
        if (saved) {
          const state = JSON.parse(saved)
          if (state.slots && Array.isArray(state.slots)) {
            state.slots.forEach((savedSlot, index) => {
              if (index < this.slots.length) {
                Object.assign(this.slots[index], {
                  enabled: savedSlot.enabled,
                  model: savedSlot.model,
                  temperature: savedSlot.temperature,
                  top_p: savedSlot.top_p,
                  max_tokens: savedSlot.max_tokens,
                  messages: savedSlot.messages || [],
                  conversationModel: savedSlot.conversationModel || null,
                  streaming: false,
                  streamingContent: ''
                })
              }
            })
            console.log('Loaded state from localStorage')
          }
        }
      } catch (err) {
        console.error('Failed to load state:', err)
      }
    }
  }
}
