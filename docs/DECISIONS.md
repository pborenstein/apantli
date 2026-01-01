# Architectural Decisions

This document records significant architectural and design decisions made during Apantli's development.

## Active Decisions

### DEC-001: Quartile-Based Calendar Intensity (2025-12-04)

**Status**: Active

**Context**: Users with sparse, low-cost LLM usage ($0.0005-$0.39/week) couldn't see patterns in traditional absolute-scaled visualizations. All values appeared invisible or uniform.

**Decision**: Use relative quartile-based intensity levels calculated from the user's own usage data:
- Level 0: No activity (gray)
- Level 1: Bottom 25% (lightest orange #ffedd5)
- Level 2: 25-50% (light orange)
- Level 3: 50-75% (medium orange)
- Level 4: Top 25% (brightest orange #ea580c)

**Alternatives Considered**:
- Absolute scaling: Failed for sparse data - tiny values invisible
- Heat map: Not distinct enough
- Side-by-side bars: Too small to see
- Horizontal continuous bars: Still invisible with small values
- Baseline + proportional scaling: Confusing, didn't solve core problem

**Consequences**:
- ✅ Works equally well for heavy users ($100/week) and light users ($0.03/week)
- ✅ Makes usage patterns immediately visible regardless of absolute amounts
- ✅ Familiar pattern (GitHub contribution graph)
- ⚠️ Can't compare absolute costs across different users' calendars

**Implementation**: `apantli/static/js/modules/calendar.js:66-73`

---

### DEC-002: Module-Level Logging Filter (2025-12-04)

**Status**: Active

**Context**: DashboardFilter wasn't working in `--reload` mode. The `--reload` flag spawns a subprocess that doesn't inherit function-level filter application.

**Decision**: Move DashboardFilter application to module level (server.py:82-106) instead of within function scope.

**Alternatives Considered**:
- Function-level filter: Doesn't survive reload
- Disabling reload: Hurts development experience
- Global logging config: Would affect all logging, not just dashboard

**Consequences**:
- ✅ Filter works correctly in both normal and reload modes
- ✅ Survives subprocess spawning
- ⚠️ Slightly less encapsulated (module-level side effect)

**Implementation**: `apantli/server.py:82-106`

---

### DEC-003: Complete Date Ranges in Charts (2025-12-04)

**Status**: Active

**Context**: Provider Cost Trends chart was skipping days with no data, creating confusing gaps in the x-axis.

**Decision**: Always generate complete date range from first to last date in dataset, filling missing days with zeros.

**Alternatives Considered**:
- Sparse dates only: Creates confusing gaps in time-series visualization
- Smart gap detection: Too complex for simple use case

**Consequences**:
- ✅ Users see continuous, easy-to-read time-series charts
- ✅ Gaps represent actual gaps (no data), not missing datapoints
- ⚠️ Minimal: Slightly more data points generated

**Implementation**: `apantli/static/js/dashboard.js:576-581`

---

### DEC-004: Stream Options for Token Usage (2025-12-10)

**Status**: Active

**Context**: Streaming requests were being logged to database with zero token counts and $0.00 costs. Providers (Anthropic, OpenAI) don't send token usage data in streaming chunks by default.

**Decision**: Add `stream_options={"include_usage": True}` to all streaming requests.

**Alternatives Considered**:
- Estimating token counts: Inaccurate, defeats purpose of cost tracking
- Non-streaming only: Users want streaming for real-time responses
- Provider-specific workarounds: Fragile, hard to maintain

**Consequences**:
- ✅ Accurate token counts and costs for streaming requests
- ✅ Works across all providers (OpenAI, Anthropic, etc.)
- ✅ One-line fix with immediate impact
- ⚠️ Relies on provider support for stream_options (widely supported)

**Implementation**: `apantli/server.py:500-501`

---

### DEC-005: ID-Lookup Pattern for Complex HTML Data (2025-12-12)

**Status**: Active

**Context**: Copy buttons in conversation view were broken because multi-line message content with special characters (quotes, backticks, newlines) was being inlined into onclick attributes, causing JavaScript syntax errors.

**Decision**: Never inline complex data in HTML attributes. Instead:
1. Store data in global object with unique ID/key
2. Pass only ID to onclick handler
3. Lookup data in handler function

**Pattern**:
```javascript
// Store
conversationMessages[`${requestId}:${index}`] = msg.content;

// Reference
onclick="copyConversationMessage('${requestId}', ${index}, this)"

// Lookup
function copyConversationMessage(requestId, messageIndex, button) {
    const key = `${requestId}:${messageIndex}`;
    const content = conversationMessages[key];
    copyToClipboard(content, button);
}
```

**Alternatives Considered**:
- Inline with escaping: Impossible to escape all special chars reliably
- Base64 encoding in attribute: Too verbose, still fragile
- Data attributes: Better but still risky for very large content

**Consequences**:
- ✅ Robust: Works for any content (multi-line, special chars, binary)
- ✅ Clean HTML: Attributes only contain simple IDs
- ✅ Reusable pattern: Already used successfully for JSON copy buttons
- ⚠️ Memory: Data stored in client-side object (acceptable for dashboard use case)

**Implementation**: `apantli/static/js/dashboard.js:30, 131-140, 189-211`

---

### DEC-006: XML-Tagged Role Format for Conversation Export (2025-12-12)

**Status**: Active

**Context**: Users needed a way to copy conversations with role information preserved for reuse in other tools.

**Decision**: Use XML-style tags with standard LLM API role names:
```
<user>
message content
</user>

<assistant>
response content
</assistant>
```

**Alternatives Considered**:
- `<ap-user>` namespace prefix: Safer for HTML but non-standard
- Self-closing tags `<user>content`: More compact but less parseable
- JSON format: Less human-readable

**Consequences**:
- ✅ Machine-readable with simple regex: `/<user>(.*?)<\/user>/gs`
- ✅ Matches OpenAI/Anthropic API role naming conventions
- ✅ Clean and professional format
- ✅ Easy to paste into LLM playgrounds or API tools
- ⚠️ Could conflict with HTML parsing if not escaped (acceptable for copy/paste use)

**Implementation**: `apantli/static/js/dashboard.js:142-156`

---

### DEC-007: Dynamic Version from Package Metadata (2025-12-27)

**Status**: Active

**Context**: Version information needed to be displayed in FastAPI docs at `/docs` and kept in sync with package version in `pyproject.toml`.

**Decision**: Use `importlib.metadata.version()` to pull version from installed package metadata with fallback to dev version:

```python
try:
    __version__ = importlib.metadata.version("apantli")
except importlib.metadata.PackageNotFoundError:
    __version__ = "0.3.8-dev"
```

**Alternatives Considered**:
- Hardcoded version in `__version__.py`: Would drift out of sync with pyproject.toml
- Reading pyproject.toml directly: More complex, requires parsing TOML
- Build-time code generation: Overkill for simple version string

**Consequences**:
- ✅ Single source of truth: Version defined once in pyproject.toml
- ✅ No version drift between package and runtime display
- ✅ Works in both installed and development environments
- ✅ Standard Python pattern (used by many packages)
- ⚠️ Requires package to be installed for non-dev version (acceptable tradeoff)

**Implementation**: `apantli/__version__.py`, `apantli/server.py:83-89`

---

## Superseded Decisions

(None yet - all decisions remain active)

---

## Decision Index by Category

**Visualization**:
- DEC-001: Quartile-Based Calendar Intensity
- DEC-003: Complete Date Ranges in Charts

**Backend/API**:
- DEC-002: Module-Level Logging Filter
- DEC-004: Stream Options for Token Usage

**Frontend/UX**:
- DEC-005: ID-Lookup Pattern for Complex HTML Data
- DEC-006: XML-Tagged Role Format for Conversation Export

**Infrastructure**:
- DEC-007: Dynamic Version from Package Metadata

---

## Using This Document

**Adding new decisions**: Use heading format `### DEC-XXX: Title (YYYY-MM-DD)`

**Searching decisions**: Use grep:
```bash
grep "DEC-" docs/DECISIONS.md
grep -A 5 "calendar" docs/DECISIONS.md
```

**Updating decisions**: Change Status to "Superseded" and note replacement in Consequences section
