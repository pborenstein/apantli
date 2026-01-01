# Phase 2: Advanced Features (Nov-Dec 2025)

## Entry 1: Calendar Visualization Evolution (2025-12-04)

**What**: Designed and implemented GitHub contribution-graph style calendar visualization with quartile-based intensity coloring.

**Why**: User had sparse, low-cost usage ($0.0005-$0.39/week) that was invisible with traditional absolute scaling approaches.

**How**: Iterative design process through 6 iterations:
1. Compact grid with bar graphs
2. Horizontal week bars
3. Color change (blue → orange)
4. Global scaling across all months
5. Baseline + proportional hybrid scaling
6. **Final**: GitHub contribution graph with quartile-based intensity

**Key Insight**: For sparse data, relative scaling beats absolute scaling. Users need to see patterns in their own usage range, not absolute values.

**Quartile Calculation**:
```javascript
const costs = Object.values(calendarData).map(d => d.cost).filter(c => c > 0);
costs.sort((a, b) => a - b);
const intensityLevels = {
    q1: costs[Math.floor(costs.length * 0.25)] || 0,
    q2: costs[Math.floor(costs.length * 0.50)] || 0,
    q3: costs[Math.floor(costs.length * 0.75)] || 0
};
```

**Color Levels**:
- Level 0: No activity (gray)
- Level 1: Bottom 25% (#ffedd5 lightest orange)
- Level 2: 25-50% (light orange)
- Level 3: 50-75% (medium orange)
- Level 4: Top 25% (#ea580c bright orange)

**Interactions**:
- Click day → navigate to Stats with single-day filter
- Click week number → navigate to Stats with week filter
- Drag across days → select range, navigate to Stats

**What We Learned**:
- Listen to frustration: "There is no information here" meant entire approach was wrong
- Sparse data needs different treatment than dense data
- Relative comparison > absolute values for pattern recognition
- GitHub's contribution graph pattern is battle-tested for this exact use case

**Decisions**: See DEC-001 (Quartile-Based Calendar Intensity), DEC-002 (Module-Level Logging Filter), DEC-003 (Complete Date Ranges)

**Branch**: `calendar-revitalization-initiative`
**Commits**: `0004b8d` and earlier iterations
**Files**: `apantli/static/js/modules/calendar.js` (~400 lines changed), `templates/dashboard.html`, `apantli/static/css/dashboard.css`

---

## Entry 2: Streaming Token Usage Fix (2025-12-10)

**What**: Fixed streaming requests to capture accurate token counts and costs by adding `stream_options.include_usage` parameter.

**Why**: Streaming requests were being logged with zero tokens (0→0) and $0.00 costs despite working correctly otherwise.

**The Investigation**:
- Database writes confirmed working
- `full_response['usage']` coming through as all zeros
- Chunks never contained usage data - this was the clue

**Root Cause**: Providers (Anthropic, OpenAI) don't send token usage in streaming chunks by default.

**The Solution**: One line fix:
```python
if is_streaming:
    request_data['stream_options'] = {"include_usage": True}
```

**Bonus Improvements**:
- Moved database logging to FastAPI background tasks (cleaner than inline `finally`)
- Added error state tracking in `full_response['_stream_error']`
- Removed diagnostic logging after confirming fix

**Verification**: Tested with TEQUITL/Joan streaming conversations, now shows accurate token counts:
```
✓ LLM Response: claude-sonnet-4-5 (anthropic) | 3294ms | 11576→57 tokens | $0.0356 [streaming]
```

**What We Learned**:
- Provider APIs need explicit flags for optional features
- Diagnostic logging is temporary - add it, use it, remove it
- Background tasks are cleaner than inline cleanup code
- Real client testing (TEQUITL/Joan) provides best validation

**Decisions**: See DEC-004 (Stream Options for Token Usage)

**Commits**: `b6134d6`, `80c5e69`, `3c33454`
**Files**: `apantli/server.py` (28 insertions, 19 deletions)

---

## Entry 3: Copy Button Conversation View Fix (2025-12-12)

**What**: Fixed broken copy buttons in conversation view and added "Copy All" feature with XML-tagged role formatting.

**Why**: Copy buttons in conversation view were broken (JavaScript syntax errors from inlining complex data), while JSON view copy buttons worked fine.

**The Problem**: Anti-pattern of inlining multi-line content with special characters into onclick attributes:
```javascript
// BROKEN - don't do this
onclick="copyToClipboard(\`${escapeHtml(msg.content).replace(/`/g, '\\`')}\`, this)"
```

No amount of escaping can handle all special characters (quotes, backticks, newlines) reliably in attribute context.

**The Solution**: ID-lookup pattern (already used successfully in JSON view):
```javascript
// Store data
conversationMessages[`${requestId}:${index}`] = msg.content;

// Reference by ID
onclick="copyConversationMessage('${requestId}', ${index}, this)"

// Lookup in handler
function copyConversationMessage(requestId, messageIndex, button) {
    const key = `${requestId}:${messageIndex}`;
    const content = conversationMessages[key];
    copyToClipboard(content, button);
}
```

**Copy All Feature**: Added button to copy entire conversations with XML-style role tags:
```
<user>
user message content
</user>

<assistant>
assistant response
</assistant>
```

Format chosen for:
- Machine-readable with simple regex
- Matches OpenAI/Anthropic API role naming
- Clean and professional
- Easy to paste into LLM tools

**UI Iteration**:
- First: Copy All in separate row (user: "takes up too much space")
- Final: Inline with Conversation/JSON toggle buttons, only visible in Conversation mode

**What We Learned**:
- Never inline complex data in HTML attributes - always use indirection
- Working examples guide solutions (JSON view showed the pattern)
- XML tags are versatile: machine + human readable, familiar from LLM APIs
- Progressive enhancement: fix broken → add missing → refine UI

**Decisions**: See DEC-005 (ID-Lookup Pattern), DEC-006 (XML-Tagged Role Format)

**Branch**: `claude/fix-conversation-copy-buttons-017XRKXH1kyWRbhcy5rkm8r3`
**Commits**: `ecc6b81`, `cbfe047`, `b26bbec`, `6251d94`
**Files**: `apantli/static/js/dashboard.js` (conversationMessages store, copy functions, render updates)

---

## Entry 4: Browser History Support for Tab Navigation (Date unknown)

**What**: Added browser history integration for dashboard tab navigation.

**Why**: Users expect back/forward buttons to work for navigation between tabs.

**How**:
- Synchronize tab state with URL hash fragments
- Each tab change creates history entry
- Support direct linking to specific tabs via hash URLs

**Implementation**: Tab changes update window.location.hash, hashchange event listener updates active tab.

**Files**: `apantli/static/js/dashboard.js`, `templates/dashboard.html`
