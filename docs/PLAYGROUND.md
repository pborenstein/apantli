# Playground

Interactive interface for testing and comparing multiple LLM models side-by-side with independent parameter configurations and conversation contexts.

## Overview

The Playground (accessible at `/compare`) is a browser-based chat interface that allows you to test up to 3 different models simultaneously, each with its own parameter settings and conversation history. It's designed for model comparison, parameter tuning, and prompt testing.

**Key Use Cases**:

- Compare responses from different models (e.g., GPT-4 vs Claude vs Gemini)
- Test how parameter changes affect response style (temperature, top_p)
- Evaluate model performance across multi-turn conversations
- Develop and refine prompts by seeing immediate side-by-side results
- Test model-specific behaviors and capabilities

## Architecture

### Frontend-Only Implementation

The Playground is entirely client-side, requiring minimal backend support:

- **No new database tables**: Conversations stored in browser localStorage
- **No new API endpoints**: Reuses existing `/v1/chat/completions` and `/models`
- **Single route added**: `/compare` serves the HTML template
- **Parallel requests**: Each slot makes independent streaming API calls
- **State management**: Alpine.js reactive data model + localStorage persistence

**Benefits of this approach**:

- Simple to maintain (no backend logic changes)
- Immediate availability (no migrations or config changes)
- Privacy-focused (conversations stay in browser)
- Fast iteration (no server restart needed for UI changes)

### Component Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          Playground Interface                           │
│                          (/compare route)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Input Panel (Top)                                                │  │
│  │  - Shared textarea for user prompts                               │  │
│  │  - Send button (shows enabled count)                              │  │
│  │  - Ctrl+Enter / Cmd+Enter to send                                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Configuration Panel (Collapsible)                                │  │
│  │  ┌─────────────────┐ ┌─────────────────┐ ┌──────────────────┐     │  │
│  │  │  Slot A         │ │  Slot B         │ │  Slot C          │     │  │
│  │  │  ✓ Enabled      │ │  ✓ Enabled      │ │  ☐ Disabled      │     │  │
│  │  │                 │ │                 │ │                  │     │  │
│  │  │  [Model ▼]      │ │  [Model ▼]      │ │  [Model ▼]       │     │  │
│  │  │  Temperature ↺  │ │  Temperature ↺  │ │  Temperature ↺   │     │  │
│  │  │  Top P ↺        │ │  Top P ↺        │ │  Top P ↺         │     │  │
│  │  │  Max Tokens ↺   │ │  Max Tokens ↺   │ │  Max Tokens ↺    │     │  │
│  │  └─────────────────┘ └─────────────────┘ └──────────────────┘     │  │
│  │                                                                   │  │
│  │  [Export All] [New Conversation]                                  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  Conversation Columns (3-column grid)                             │  │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐          │  │
│  │  │ gpt-4o        │  │ claude-3.5    │  │               │          │  │
│  │  │ temp=0.7      │  │ temp=1.0      │  │ Slot disabled │          │  │
│  │  ├───────────────┤  ├───────────────┤  ├───────────────┤          │  │
│  │  │ USER:         │  │ USER:         │  │               │          │  │
│  │  │ Hello         │  │ Hello         │  │               │          │  │
│  │  │               │  │               │  │               │          │  │
│  │  │ ASSISTANT:    │  │ ASSISTANT:    │  │               │          │  │
│  │  │ Hi there...   │  │ Hello!...     │  │               │          │  │
│  │  │ 10→25 tokens  │  │ 10→18 tokens  │  │               │          │  │
│  │  │               │  │               │  │               │          │  │
│  │  │ [scrollable]  │  │ [scrollable]  │  │               │          │  │
│  │  └───────────────┘  └───────────────┘  └───────────────┘          │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### File Structure

**New Files**:

- `templates/compare.html` (218 lines) - HTML structure, Alpine.js data model
- `apantli/static/js/compare.js` (426 lines) - All client-side logic
- `apantli/static/css/compare.css` (427 lines) - Playground-specific styles

**Modified Files**:

- `apantli/server.py` - Added `/compare` route, enhanced `/models` endpoint
- `templates/dashboard.html` - Added "Playground" navigation link

## Data Flow

### Initialization Flow

```
User navigates to /compare
   ↓
Server: GET /compare → Render compare.html
   ↓
Browser loads Alpine.js → compareApp() initializes
   ↓
1. loadTheme() → Read '_x_theme' from localStorage (shared with dashboard)
   ↓
2. loadModels() → fetch('/models')
   ↓
   Server: GET /models → Return model list with default parameters
   {
     "models": [
       {
         "name": "gpt-4o",
         "provider": "openai",
         "temperature": 0.7,    // From config.yaml if set
         "top_p": 1.0,
         "max_tokens": 2000,
         ...
       }
     ]
   }
   ↓
3. loadState() → Read 'apantli_compare_state' from localStorage
   Restore: slot configurations, conversation histories, enabled states
   ↓
4. validateAndInitializeSlots()
   - Check each slot has valid model (exists in availableModels)
   - If not, assign default model (first, second, third for variety)
   - Apply model-specific default parameters
   - Clear invalid conversationModel references
   ↓
Ready for user interaction
```

### Request Flow

```
User types message in textarea
   ↓
User clicks "Send" or presses Ctrl+Enter
   ↓
Alpine.js: sendToAll() triggered
   ↓
For each enabled slot (in parallel):
   ↓
   1. Set conversationModel (if first message) → Locks model for conversation
   ↓
   2. Add user message to slot.messages[]
      { role: 'user', content: 'Hello' }
   ↓
   3. Build request body:
      {
        model: slot.conversationModel,  // Use locked model
        messages: slot.messages,        // Full conversation history
        temperature: slot.temperature,
        top_p: slot.top_p,
        max_tokens: slot.max_tokens,
        stream: true,
        stream_options: { include_usage: true }
      }
   ↓
   4. POST /v1/chat/completions (existing endpoint)
   ↓
   ┌──────────────────────────────────────────────────────────────┐
   │  Apantli Server                                              │
   │  - Config lookup for model                                   │
   │  - API key resolution                                        │
   │  - LiteLLM streaming request to provider                     │
   │  - Database logging (async, non-blocking)                    │
   └──────────────────────────────────────────────────────────────┘
   ↓
   5. Stream response chunks
      - Read SSE stream: "data: {...}\n"
      - Parse JSON chunks
      - Extract delta.content from choices[0]
      - Accumulate in slot.streamingContent
      - Display in real-time
   ↓
   6. Capture usage information (final chunk)
      {
        "usage": {
          "prompt_tokens": 10,
          "completion_tokens": 25,
          "total_tokens": 35
        }
      }
   ↓
   7. Add complete assistant message to slot.messages[]
      {
        role: 'assistant',
        content: 'Hi there! How can I help you?',
        tokens: { prompt: 10, completion: 25, total: 35 }
      }
   ↓
   8. saveState() → Persist to localStorage
   ↓
Continue conversation (history maintained per slot)
```

### Parallel Execution

The Playground sends requests to all enabled slots **simultaneously** using `Promise.all()`:

```javascript
const promises = slots.map((slot, index) => {
  if (slot.enabled) {
    return sendToSlot(index, userMessage)  // Independent async call
  }
  return Promise.resolve()
})

await Promise.all(promises)
```

**Benefits**:

- Faster total response time (3 models in ~10s instead of ~30s)
- Real-time comparison (see responses develop side-by-side)
- Independent error handling (one failure doesn't block others)

## Implementation Details

### State Management

The Playground uses Alpine.js for reactive state management:

```javascript
{
  // Theme (synced with dashboard)
  theme: 'light',

  // Available models from /models endpoint
  availableModels: ['gpt-4o', 'claude-3.5-sonnet', ...],
  modelConfigs: { 'gpt-4o': { temperature: 0.7, ... }, ... },

  // 3 independent model slots
  slots: [
    {
      enabled: true,              // Slot active/inactive
      model: 'gpt-4o',            // Current model selection
      conversationModel: 'gpt-4o', // Locked model for conversation
      temperature: 0.7,
      top_p: 1.0,
      max_tokens: 2000,
      messages: [                 // Full conversation history
        { role: 'user', content: '...' },
        { role: 'assistant', content: '...', tokens: {...} }
      ],
      streaming: false,           // Currently streaming?
      streamingContent: ''        // Accumulated stream content
    },
    // ... slots 1 and 2
  ],

  // Shared input
  currentPrompt: '',
  isLoading: false
}
```

**State Persistence**:

All state (except streaming/loading flags) is saved to `localStorage` as `apantli_compare_state`:

```javascript
saveState() {
  const state = {
    slots: this.slots.map(s => ({
      enabled: s.enabled,
      model: s.model,
      temperature: s.temperature,
      top_p: s.top_p,
      max_tokens: s.max_tokens,
      messages: s.messages,           // Full conversation preserved
      conversationModel: s.conversationModel
    }))
  }
  localStorage.setItem('apantli_compare_state', JSON.stringify(state))
}
```

### Conversation Threading

Each slot maintains its own **independent conversation history**:

**Key Concepts**:

1. **conversationModel**: Once set (first message), this model is locked for the entire conversation
2. **messages[]**: Array of all user/assistant messages in chronological order
3. **Model switching**: User can change `slot.model` dropdown, but existing conversation continues with `conversationModel`
4. **Warning indicator**: UI shows ⚠️ when `slot.model !== slot.conversationModel`

**Why lock the model?**

Multi-turn conversations depend on context. Switching models mid-conversation would:
- Lose conversation context (new model doesn't see prior messages from different model)
- Create confusion about which model generated which response
- Break threading (different models have different context windows/behaviors)

**Example**:

```javascript
// User starts conversation with GPT-4
slot.model = 'gpt-4o'
slot.conversationModel = null

sendMessage("Hello")
// → conversationModel set to 'gpt-4o'
// → messages: [{ user: "Hello" }, { assistant: "Hi there!" }]

sendMessage("Tell me a joke")
// → Uses 'gpt-4o' (conversationModel)
// → messages: [... previous ..., { user: "Tell me a joke" }, { assistant: "..." }]

// User changes dropdown to 'claude-3.5-sonnet'
slot.model = 'claude-3.5-sonnet'
slot.conversationModel = 'gpt-4o'  // Still locked!
// → UI shows warning: ⚠️ "Model changed - conversation still using original model"

sendMessage("Another joke")
// → Still uses 'gpt-4o' (conversationModel locked)

// User clicks "New Conversation"
slot.messages = []
slot.conversationModel = null  // Unlocked!
// → Next message will use 'claude-3.5-sonnet'
```

### Parameter Defaults and Reset

The Playground respects model-specific defaults from `config.yaml`:

**Server-side** (`apantli/server.py`):

```python
@app.get("/models")
async def models(request: Request):
    model_list = []
    for model_name, litellm_params in request.app.state.model_map.items():
        model_info = {
            'name': model_name,
            'provider': ...,
            'input_cost_per_million': ...,
            'output_cost_per_million': ...
        }

        # Include predefined parameters from config
        if 'temperature' in litellm_params:
            model_info['temperature'] = litellm_params['temperature']
        if 'top_p' in litellm_params:
            model_info['top_p'] = litellm_params['top_p']
        if 'max_tokens' in litellm_params:
            model_info['max_tokens'] = litellm_params['max_tokens']

        model_list.append(model_info)
```

**Client-side** (`compare.js`):

```javascript
getDefaultValue(slotIndex, paramName) {
  const slot = this.slots[slotIndex]
  const modelConfig = this.modelConfigs[slot.model]

  const baseDefaults = {
    temperature: 0.7,
    top_p: 1.0,
    max_tokens: 2000
  }

  // Return config override if exists, otherwise base default
  if (modelConfig && modelConfig[paramName] !== undefined) {
    return modelConfig[paramName]
  }
  return baseDefaults[paramName]
}
```

**Reset buttons** (↺):

Each parameter has a reset button that restores the model-specific default:

- Shows tooltip with default value on hover
- One click resets that parameter only
- Respects config.yaml overrides
- Works independently per slot

### Streaming Implementation

The Playground uses Server-Sent Events (SSE) for real-time streaming:

```javascript
async sendToSlot(slotIndex, userMessage) {
  const response = await fetch('/v1/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model: slot.conversationModel,
      messages: slot.messages,
      temperature: parseFloat(slot.temperature),
      top_p: parseFloat(slot.top_p),
      max_tokens: parseInt(slot.max_tokens),
      stream: true,
      stream_options: { include_usage: true }
    })
  })

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
        if (data === '[DONE]') continue

        const chunk = JSON.parse(data)

        // Accumulate content
        const content = chunk.choices?.[0]?.delta?.content
        if (content) {
          assistantMessage += content
          slot.streamingContent = assistantMessage  // Alpine reactivity updates UI
        }

        // Capture usage (final chunk)
        if (chunk.usage) {
          usage = chunk.usage
        }
      }
    }
  }

  // Add complete message with tokens
  slot.messages.push({
    role: 'assistant',
    content: assistantMessage,
    tokens: usage ? {
      prompt: usage.prompt_tokens,
      completion: usage.completion_tokens,
      total: usage.total_tokens
    } : null
  })
}
```

**Error Handling**:

- Network errors: Caught per-slot, error message added to conversation
- Streaming errors: Detected in chunk JSON (`chunk.error`), thrown immediately
- Graceful degradation: One slot failing doesn't affect others

### Export Functionality

**Export All** button copies all conversations to clipboard as markdown:

```markdown
# Slot A: gpt-4o

**Parameters:** temp=0.7, top_p=1.0, max_tokens=2000

---

## USER

Hello

---

## ASSISTANT

Hi there! How can I help you?

*10→25 tokens (35 total)*

---

# Slot B: claude-3.5-sonnet

**Parameters:** temp=1.0, top_p=0.95, max_tokens=2000

---

## USER

Hello

---

## ASSISTANT

Hello! It's nice to meet you.

*10→18 tokens (28 total)*
```

**Implementation**:

- Filters only enabled slots with messages
- Formats each conversation separately
- Uses `navigator.clipboard.writeText()` API
- Shows confirmation alert on success

## Features

### Slot Configuration

**Enable/Disable**:

- Toggle checkbox activates/deactivates slot
- Disabled slots don't receive messages
- UI visually dimmed for disabled slots
- Configuration collapsed when disabled

**Model Selection**:

- Dropdown populated from `/models` endpoint
- Sorted alphabetically
- Automatically applies model-specific defaults
- Shows warning if changed mid-conversation

**Parameter Controls**:

- **Temperature** (0-2, step 0.1): Randomness control
  - Lower (<1) = focused, deterministic
  - Higher (>1) = creative, random
- **Top P** (0-1, step 0.01): Nucleus sampling
  - Lower (<0.9) = focused on likely tokens
  - Higher (>0.9) = more variety
- **Max Tokens** (1-32000): Response length limit
- All parameters include tooltips explaining their effect

**Reset Buttons**:

- Individual reset per parameter (↺ icon)
- Restores model-specific default from config
- Tooltip shows what value will be restored

### Message History

**Display**:

- User messages: Left-aligned, distinct styling
- Assistant messages: Right-aligned with token counts
- Scrollable columns (independent scroll per slot)
- Streaming indicator during generation

**Token Information**:

- Shows prompt→completion tokens (total)
- Example: `10→25 tokens (35 total)`
- Only displayed if provider returns usage data
- Helps compare efficiency across models

**Persistence**:

- Full history saved to localStorage
- Survives page reload
- Cleared only by "New Conversation" or manual clear

### Navigation

**Keyboard Shortcuts**:

- `Ctrl+Enter` / `Cmd+Enter` - Send message
- Works from textarea (no need to click button)

**Links**:

- Dashboard → Playground: Link in header
- Playground → Dashboard: "Dashboard" button in header
- Both share theme preference (synced via localStorage)

## Usage Examples

### Example 1: Model Comparison

**Goal**: Compare GPT-4 and Claude responses to the same prompt.

**Setup**:

1. Enable Slots A and B
2. Slot A: `gpt-4o`, temp=0.7
3. Slot B: `claude-3.5-sonnet`, temp=0.7
4. Disable Slot C

**Prompt**: "Explain quantum entanglement in simple terms"

**Result**: See side-by-side how each model approaches the explanation.

### Example 2: Temperature Testing

**Goal**: Test how temperature affects GPT-4 creativity.

**Setup**:

1. Enable all 3 slots
2. All slots: `gpt-4o`
3. Slot A: temp=0.3 (deterministic)
4. Slot B: temp=0.7 (balanced)
5. Slot C: temp=1.5 (creative)

**Prompt**: "Write a short story opening about a detective"

**Result**: Compare consistency vs. creativity across temperatures.

### Example 3: Multi-Turn Conversation

**Goal**: Test conversation coherence across multiple exchanges.

**Setup**:

1. Enable Slots A and B
2. Different models in each slot
3. Same temperature settings

**Conversation**:

- Message 1: "I'm planning a trip to Japan"
- Message 2: "What should I see in Tokyo?"
- Message 3: "How about food recommendations?"

**Result**: Evaluate which model maintains context better.

### Example 4: Parameter Tuning

**Goal**: Find optimal settings for technical documentation generation.

**Setup**:

1. Enable all 3 slots
2. Same model (e.g., `gpt-4o`)
3. Vary combinations:
   - Slot A: temp=0.2, top_p=0.9 (precise)
   - Slot B: temp=0.5, top_p=0.95 (balanced)
   - Slot C: temp=0.8, top_p=1.0 (varied)

**Prompt**: "Document the quicksort algorithm"

**Result**: Identify which parameter set produces best technical writing.

## Troubleshooting

### Playground not loading

**Symptoms**: Blank page, spinner forever, no slots visible

**Solutions**:

1. Check browser console (F12) for JavaScript errors
2. Verify server is running: `curl http://localhost:4000/health`
3. Check `/models` endpoint has data: `curl http://localhost:4000/models`
4. Clear localStorage: `localStorage.removeItem('apantli_compare_state')`
5. Hard refresh: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)

### Slots show "No models available"

**Symptoms**: Dropdowns are empty, can't select models

**Solutions**:

1. Verify `config.yaml` has models defined
2. Check server logs for config errors
3. Restart server to reload config
4. Test `/models` endpoint directly

### Messages not sending

**Symptoms**: Click "Send" but nothing happens, no responses

**Solutions**:

1. Check at least one slot is enabled
2. Verify prompt is not empty
3. Check browser network tab for failed requests
4. Review server logs for errors
5. Test `/v1/chat/completions` endpoint directly with curl

### Streaming stops mid-response

**Symptoms**: Response starts then freezes, incomplete message

**Solutions**:

1. Check server timeout settings (`--timeout` flag)
2. Verify API key is valid and has credits
3. Check network connection stability
4. Review browser console for JavaScript errors
5. Try "New Conversation" to reset state

### Conversation history lost

**Symptoms**: Refresh page and messages disappear

**Solutions**:

1. Check if browser is in private/incognito mode (localStorage disabled)
2. Verify browser's localStorage quota not exceeded
3. Check browser settings allow localStorage
4. Try different browser to isolate issue

### Token counts not showing

**Symptoms**: Messages appear but no token information

**Solutions**:

1. Check if provider supports usage info (most do, some don't)
2. Verify `stream_options: { include_usage: true }` in request
3. Some models/providers don't return usage in streaming mode
4. Non-streaming requests always include usage

### Model changed warning (⚠️)

**Symptoms**: Warning icon appears next to model name

**Explanation**: This is **expected behavior**, not an error.

- Indicates conversation started with different model
- Current conversation still uses original model
- Change will take effect after "New Conversation"
- Prevents context loss from model switching

**To resolve**: Click "New Conversation" to unlock model selection.

## Technical Notes

### Browser Compatibility

**Supported**:

- Chrome/Edge 90+
- Firefox 90+
- Safari 14+

**Required APIs**:

- Fetch API with streaming response
- ReadableStream and TextDecoder
- Clipboard API (for export)
- localStorage

### Performance

**Concurrent Requests**:

- 3 parallel streaming requests
- Each ~1-2 KB/s stream
- Total ~3-6 KB/s network usage
- Handles well on typical connections

**Memory Usage**:

- Conversation history in memory (~1-5 MB per slot)
- localStorage limit: ~5-10 MB (browser-dependent)
- Recommend clearing history after ~100 messages per slot

**Database Impact**:

- Each request logged to database (same as API usage)
- 3 parallel requests = 3 database writes
- No additional load compared to normal API usage

### Security Considerations

**localStorage Security**:

- Conversations stored in plaintext
- Accessible to JavaScript on same origin
- Not encrypted at rest
- Cleared on logout (if implemented)
- Consider sensitive content before using

**API Key Handling**:

- Keys never sent to client
- Server-side resolution only
- Client only sends model names
- No key exposure in browser

### Accessibility

**Keyboard Navigation**:

- Tab through all controls
- Ctrl+Enter to send
- Focus indicators on all interactive elements
- ARIA labels on buttons

**Screen Readers**:

- Semantic HTML structure
- Role attributes on custom controls
- Live regions for streaming updates
- Alternative text on icons

## Future Enhancements

Potential features for future versions:

- **Copy individual responses**: Button per message
- **Diff view**: Highlight differences between slot responses
- **Cost tracking**: Show running total per conversation
- **System message**: Configure per-slot system prompts
- **Response timing**: Show latency and tokens/second
- **Save/load presets**: Named configurations
- **More slots**: Support 4-6 slots on wide screens
- **Conversation branching**: Edit and resend previous messages
- **JSON export**: Export as structured data
- **Import conversations**: Load previous sessions

## Related Documentation

- [DASHBOARD.md](DASHBOARD.md) - Main dashboard interface
- [API.md](API.md) - API endpoint reference
- [CONFIGURATION.md](CONFIGURATION.md) - Model and parameter configuration
- [DATABASE.md](DATABASE.md) - Database schema and logging
