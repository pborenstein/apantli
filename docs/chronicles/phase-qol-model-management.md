# Phase QoL: Model Management UI

Quality-of-life improvements for model management through dashboard UI.

---

## Entry 1: Backend APIs (2026-01-11)

**What**: Implemented CRUD APIs for model management with hot-reload.

**Why**: Users needed UI for managing models instead of editing YAML manually.

**How**: Added POST/PATCH/DELETE endpoints for models, provider discovery API, config backup system.

**Files**: `apantli/server.py` (lines 610-920), `apantli/config.py`

---

## Entry 2: Add Model Wizard (2026-01-11)

**What**: 3-step wizard UI for adding models with smart sorting and provider documentation links.

**Why**: Complex task requiring multiple selections - needed guided flow with good UX.

**How**:
- Step 1: Provider grid with active providers first, alphabetical sorting
- Step 2: Model grid with configured models first, sortable by name/cost
- Step 3: Configuration form with smart defaults and validation
- Shows configured aliases as badges, links to provider docs
- Fixed all modal CSS variables for light/dark mode compatibility

**Key Features**:
- Active provider badges (green)
- Configured model badges showing aliases (orange)
- External link icons to provider documentation
- Grid layouts for both providers and models
- Search and sort controls
- Status toggle shows current state not action

**Files**: `templates/dashboard.html` (lines 507-630), `apantli/static/js/dashboard.js` (lines 2017-2360), `apantli/static/css/dashboard.css` (lines 1688-2004)

---

## Entry 3: Critical Bug Fixes (2026-01-11)

**What**: Fixed playground and API completely broken - all requests failing with "Extra inputs are not permitted".

**Why**: Server was passing metadata fields to LiteLLM that providers reject; playground was including metadata in message history.

**How**:
- Server: Added EXCLUDED_KEYS filter to prevent passing `enabled`, cost metadata to LiteLLM
- Playground: Strip `tokens` property from messages before sending to API
- Playground: Handle null parameter defaults in Alpine expressions
- Config: Fixed Claude Haiku 4.5 model name (confirmed model exists)

**Root Causes**:
1. `resolve_model_config()` passed all model config fields to LiteLLM (including metadata)
2. Playground stored `tokens` with messages, sent entire message objects to API
3. `getDefaultValue()` returned null, template called `.toFixed()` on null

**Files**: `apantli/server.py:193`, `apantli/static/js/compare.js:332-335,243`, `config.yaml`

---

## Entry 5: Dashboard Chart & Calendar Fixes (2026-01-19)

**What**: Fixed chart date range clipping and calendar weeks showing fewer than 7 days.

**Why**: "All Time" chart only showed data bounds (not full DB range), "This Week" showed 2 days instead of 7, calendar weeks at month boundaries were incomplete.

**Root Causes**:
1. `dbDateRange` only populated when user clicks "All Time" button, not on page load
2. Chart used data bounds as fallback when `dbDateRange` was null
3. Calendar `renderMonth` only rendered days within the month, no padding for week boundaries

**How**:
- Fetch `/stats/date-range` on Alpine init before charts render (dashboard.js:882-895)
- Rewrite week rendering to add leading/trailing empty squares (dashboard.js:1857-1883)
- Add `.day-square.empty` CSS style (dashboard.css:785-789)

**Files**: `apantli/static/js/dashboard.js`, `apantli/static/css/dashboard.css`

---

## Entry 6: Dashboard UX Improvements (2026-01-19)

**What**: Added visual indicators, state persistence, and responsive layout improvements.

**Why**: Users needed better visual feedback when scanning requests, and state should persist across refreshes.

**Features**:
- Expanded request rows have shaded background for quick scanning
- Message fold/unfold buttons (▼/▶) to collapse content to 2 lines
- Expanded requests persist via localStorage
- Folded messages persist via localStorage
- Charts re-render on window resize (debounced 250ms)
- Color-coded message role headings: SYSTEM orange, USER blue, ASSISTANT green

**How**:
- Added `.expanded` class to request rows with distinct backgrounds (#333 dark, #e8e6e3 light)
- Added fold buttons to message headers with `.folded` CSS class (max-height: 3.4em)
- localStorage keys: `apantli_expandedRequests`, `apantli_foldedMessages`
- Window resize listener triggers chart re-render when on Stats tab
- Data attribute `data-role` on message role spans for CSS targeting

**Files**: `apantli/static/js/dashboard.js`, `apantli/static/js/modules/requests.js`, `apantli/static/css/dashboard.css`
