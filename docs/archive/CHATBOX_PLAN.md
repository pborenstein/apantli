# Chat Comparison Interface Plan

## Concept

Create a chat interface where users can send the same prompt to up to 3 different models with different parameter settings, view responses side-by-side, and continue parallel conversations with each model maintaining its own context.

## Use Cases

- Compare responses from different models (e.g., GPT-4 vs Claude vs Gemini)
- Test same model with different temperatures/top_p settings
- Evaluate how parameter changes affect response style
- Continue multi-turn conversations with each model independently

## Interface Mockup

```
┌─────────────────────────────────────────────────────────────────────────┐
│ apantli ≈ compare                                       [Back to Stats] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│ MODEL CONFIGURATION                                                     │
│                                                                         │
│ ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐│
│ │ Slot A [✓]          │  │ Slot B [✓]          │  │ Slot C [ ]       ││
│ │                     │  │                     │  │                  ││
│ │ Model:              │  │ Model:              │  │ Model:           ││
│ │ [gpt-4o        ▼]   │  │ [claude-3.5    ▼]   │  │ [gemini-2.5  ▼]  ││
│ │                     │  │                     │  │                  ││
│ │ Temperature:        │  │ Temperature:        │  │ Temperature:     ││
│ │ 0.7  ●──────────    │  │ 1.0  ───────────●   │  │ 0.5  ●───────    ││
│ │                     │  │                     │  │                  ││
│ │ Top P:              │  │ Top P:              │  │ Top P:           ││
│ │ 0.9  ──────●────    │  │ 0.95 ────────●──    │  │ 1.0  ────────●   ││
│ │                     │  │                     │  │                  ││
│ │ Max tokens: 2000    │  │ Max tokens: 2000    │  │ Max tokens: 1000 ││
│ └─────────────────────┘  └─────────────────────┘  └──────────────────┘│
│                                                                         │
│                                                    [New Conversation]   │
├─────────────────────────────────────────────────────────────────────────┤
│ CONVERSATION                                                            │
├───────────────────────┬───────────────────────┬───────────────────────┤
│ gpt-4o                │ claude-3.5-sonnet     │                       │
│ temp=0.7, top_p=0.9   │ temp=1.0, top_p=0.95  │  (slot disabled)      │
├───────────────────────┼───────────────────────┼───────────────────────┤
│                       │                       │                       │
│ USER:                 │ USER:                 │                       │
│ Explain quantum       │ Explain quantum       │                       │
│ computing             │ computing             │                       │
│                       │                       │                       │
│ ASSISTANT:            │ ASSISTANT:            │                       │
│ Quantum computing     │ Quantum computing is  │                       │
│ leverages quantum     │ a fascinating approach│                       │
│ mechanical phenomena  │ to computation that   │                       │
│ such as superposition │ harnesses the weird   │                       │
│ and entanglement...   │ and wonderful...      │                       │
│                       │                       │                       │
│ USER:                 │ USER:                 │                       │
│ What are practical    │ What are practical    │                       │
│ applications?         │ applications?         │                       │
│                       │                       │                       │
│ ASSISTANT:            │ ASSISTANT:            │                       │
│ Key applications      │ Some exciting real-   │                       │
│ include cryptography, │ world applications    │                       │
│ drug discovery, and   │ emerging today are... │                       │
│ optimization...       │                       │                       │
│                       │                       │                       │
│ ↓ (scroll)            │ ↓ (scroll)            │                       │
│                       │                       │                       │
└───────────────────────┴───────────────────────┴───────────────────────┘
│                                                                         │
│ Send to all enabled models:                                            │
│ ┌─────────────────────────────────────────────────────────────────────┐│
│ │ Give me a code example                                              ││
│ │                                                                     ││
│ └─────────────────────────────────────────────────────────────────────┘│
│                                            [Send to 2 models] [Clear]  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Architecture

### Frontend-Only Implementation

No backend changes needed beyond serving the template. All comparison logic lives in the browser.

**Why frontend-only:**

- Reuses existing `/v1/chat/completions` endpoint
- Each request is independent (just parallel API calls)
- Conversation history managed in browser localStorage
- Simple to implement and maintain
- No database schema changes

### Request Flow

```
User types message
    ↓
Frontend JS loops through enabled slots (1-3)
    ↓
For each slot, build request with:
  - model name
  - messages array (conversation history)
  - temperature, top_p, max_tokens
    ↓
Send parallel requests to /v1/chat/completions
    ↓
Stream responses into respective columns
    ↓
Append to conversation history
    ↓
Save to localStorage
```

## Implementation Details

### 1. Server Route (`apantli/server.py`)

Add simple template serving endpoint:

```python
@app.get("/compare")
async def compare_page(request: Request):
    """Render the chat comparison interface."""
    return app.state.templates.TemplateResponse(
        "compare.html",
        {
            "request": request,
            "models": list(app.state.model_map.keys())
        }
    )
```

### 2. HTML Template (`templates/compare.html`)

Structure:

- Header with navigation
- Model configuration panel (3 columns)
  - Enable/disable checkbox per slot
  - Model dropdown (populated from `/models` endpoint)
  - Temperature slider (0-2, step 0.1)
  - Top P slider (0-1, step 0.05)
  - Max tokens input
- Conversation display (3 columns)
  - Scrollable message history
  - User/assistant message formatting
- Shared input area
  - Textarea for prompt
  - Send button (shows count of enabled models)
  - Clear button
  - New conversation button

Uses Alpine.js for reactivity (already loaded in existing dashboard).

### 3. CSS (`apantli/static/css/compare.css`)

Key elements:

- 3-column grid layout using CSS Grid
- Responsive breakpoints (stack on mobile)
- Model configuration card styling
- Message bubble styling (user vs assistant)
- Slider/input styling consistent with dashboard
- Disabled slot visual treatment

### 4. JavaScript (`apantli/static/js/compare.js`)

#### State Management

```javascript
{
  slots: [
    {
      enabled: true,
      model: 'gpt-4o',
      temperature: 0.7,
      top_p: 0.9,
      max_tokens: 2000,
      messages: []  // conversation history
    },
    {
      enabled: true,
      model: 'claude-3.5-sonnet',
      temperature: 1.0,
      top_p: 0.95,
      max_tokens: 2000,
      messages: []
    },
    {
      enabled: false,
      model: 'gemini-2.0-flash',
      temperature: 0.5,
      top_p: 1.0,
      max_tokens: 1000,
      messages: []
    }
  ],
  currentPrompt: '',
  isLoading: false
}
```

#### Core Functions

- `loadModels()` - Fetch available models from `/models` endpoint
- `sendToAll()` - Send prompt to all enabled slots in parallel
- `sendToSlot(slotIndex, userMessage)` - Make streaming request for one slot
- `appendMessage(slotIndex, role, content)` - Add message to history
- `clearPrompt()` - Clear input field
- `newConversation()` - Clear all message histories
- `saveState()` - Persist to localStorage
- `loadState()` - Restore from localStorage

#### Streaming Implementation

Reuse pattern from existing dashboard streaming handling:

```javascript
const response = await fetch('/v1/chat/completions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: slot.model,
    messages: slot.messages,
    temperature: slot.temperature,
    top_p: slot.top_p,
    max_tokens: slot.max_tokens,
    stream: true
  })
})

const reader = response.body.getReader()
const decoder = new TextDecoder()
let buffer = ''

while (true) {
  const { done, value } = await reader.read()
  if (done) break

  buffer += decoder.decode(value, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop()

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6)
      if (data === '[DONE]') continue
      const chunk = JSON.parse(data)
      const content = chunk.choices[0]?.delta?.content
      if (content) {
        // Append to current message display
      }
    }
  }
}
```

### 5. Navigation Integration

Add link to dashboard header and compare page header for easy switching between views.

## Features

### MVP (v1)

- [x] 3 model slots (enable/disable)
- [x] Model selection dropdown
- [x] Temperature, top_p, max_tokens controls
- [x] Parallel request sending
- [x] Side-by-side response display
- [x] Streaming responses
- [x] Conversation history per slot
- [x] localStorage persistence
- [x] New conversation button

### Future Enhancements (v2+)

- [ ] Export conversation as markdown/JSON
- [ ] Save/load conversation presets
- [ ] Copy individual responses
- [ ] Diff view between responses
- [ ] Cost tracking per conversation
- [ ] Response timing comparison
- [ ] System message configuration per slot
- [ ] Token count display
- [ ] Conversation branching (edit previous messages)

## Testing Plan

1. Load `/compare` page successfully
2. Enable/disable slots - UI updates correctly
3. Change model/parameters - state persists
4. Send message to 1 model - streams correctly
5. Send message to 3 models - all stream in parallel
6. Continue conversation - history maintained per slot
7. Refresh page - state restored from localStorage
8. New conversation - all histories cleared
9. Mobile responsive - columns stack vertically

## File Changes Summary

### New Files

- `CHATBOX_PLAN.md` - This document
- `templates/compare.html` - Main interface template
- `apantli/static/css/compare.css` - Styling
- `apantli/static/js/compare.js` - Client-side logic

### Modified Files

- `apantli/server.py` - Add `/compare` route
- `templates/dashboard.html` - Add navigation link (optional)

### No Changes Needed

- Database schema (no backend storage)
- API endpoints (reuse existing)
- Configuration (use existing model map)

## Implementation Timeline

Estimated: 3-4 hours

1. Setup (30 min) - Route + basic template
2. HTML structure (45 min) - Layout + controls
3. CSS styling (45 min) - Grid + responsive
4. JavaScript core (90 min) - State management + API calls
5. Testing/refinement (30 min) - Bug fixes + polish
