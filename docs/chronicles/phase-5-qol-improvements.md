# Phase 5: QoL Improvements

Quality-of-life improvements - fixing "things that annoy me" as they come up.

Covers model management UI, dashboard UX, visual feedback, state persistence, and other paper-cut fixes.

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

---

## Entry 7: Filter UX Improvements (2026-01-19)

**What**: Fixed major filter usability issues - "Clear Filter" now clears everything, active filters glow, dropdowns persist across pagination.

**Why**: Multiple annoyances: Clear Filter only cleared date (not search/model/provider), no visual indication when filters were active, dropdowns reset on pagination requiring filter reselection.

**How**:
- "Clear All Filters" button now resets all filter fields (date, search, provider, model, cost range)
- Added `.filter-active` class with blue glow (#7aa2f7 shadow) to inputs/selects with non-default values
- Created `/stats/filters` endpoint returning all providers/models with usage counts
- Filter dropdowns fetch once on load and cache results (not per-page)
- Providers/models sorted by usage count descending (most-used first)

**Technical**:
- New database method `get_filter_values()` with GROUP BY queries
- JavaScript flag `filterValuesLoaded` prevents re-fetching
- Alpine.js `:class` bindings toggle `.filter-active` based on values

**Files**: `apantli/server.py:1218-1222`, `apantli/database.py:508-538`, `apantli/static/js/dashboard.js:675-710`, `templates/dashboard.html:17,413,420,427,434-436`, `apantli/static/css/dashboard.css:1327-1331`

---

## Entry 8: Server-Side Sorting (2026-01-19)

**What**: Moved requests table sorting from client-side to server-side so sorting applies to entire dataset, not just visible page.

**Why**: Column sorting only sorted the current page of 50 results, causing confusion when paginating through sorted data.

**How**:
- Added `sort_by` and `sort_dir` parameters to `/requests` endpoint
- Extended `RequestFilter` dataclass with sort fields (timestamp, model, total_tokens, cost, duration_ms)
- Modified `get_requests()` to build ORDER BY clause from sort parameters
- JavaScript tracks `requestsSortState` and passes to API on each request
- Sort state persists across pagination

**Note**: User flagged need to "think more clearly about what sorting means" for this table in future.

**Files**: `apantli/database.py:25-26,178-188`, `apantli/server.py:1058,1092-1093`, `apantli/static/js/dashboard.js:47,634-639,740-759`

---

## Entry 9: Date Filter Dropdowns (2026-01-20)

**What**: Replaced flat date filter buttons with dropdown menus for Days/Weeks/Months selections.

**Why**: Consolidate 6 date filter buttons into 3 dropdown menus for cleaner UI and easier navigation through time ranges.

**How**:
- Converted Today/Yesterday/etc into Days dropdown (7 options: Today through 6 days ago)
- Converted This Week into Weeks dropdown (4 options: This Week, Last Week, 2-3 weeks ago)
- Converted This Month into Months dropdown (6 options: This Month through 5 months ago)
- Kept All Time and Last 30 Days as simple buttons
- Dropdown button highlights when any option is active
- Selected item in dropdown shows with inverted styling
- Added helper functions: `isDayFilterActive()`, `isWeekFilterActive()`, `isMonthFilterActive()`
- Extended `setQuickFilter()` to handle new date range patterns (day-N, week-N, month-N)

**Files**: `templates/dashboard.html:1-48,155-220,245-261`, `apantli/static/css/dashboard.css:1213-1253`

---

## Entry 10: Gradient Tinting for Metrics (2026-01-20)

**What**: Added gradient color tinting with glow effects to requests table metrics (tokens, cost, duration) and provider colors for model names.

**Why**: Improve visual hierarchy and scanability - higher metric values should draw the eye with brighter colors and glow effects optimized for dark mode.

**How**:
- Created `getValueTint()` function to generate gradient colors based on value normalization
- Higher values = brighter (0.7-1.0 brightness range keeps readability on dark background)
- Added text-shadow glow effect scaling 0-6px blur with 30-40% opacity based on normalized value
- Tokens (blue #3b82f6), Cost (green #10b981), Duration (amber #f59e0b)
- Model names tinted with provider colors from existing PROVIDER_COLORS map
- Calculated min/max per page for normalization ensuring darkest/brightest always represent extremes

**Files**: `apantli/static/js/dashboard.js:1029-1048,783-822`

---

## Entry 11: Codebase Cleanup (2026-01-28)

**What**: Removed dead code and documented UI/CSS technical state.

**Why**: The `static/js/modules/` directory contained 1,587 lines of unused code from an incomplete refactoring attempt. Documentation had stale line counts.

**How**:

- Deleted 7 unused JS module files (never imported by dashboard.html)
- Updated version marker from 2025-10-16 to 2026-01-28
- Added "Technical Review" section to DASHBOARD.md documenting:
  - CSS/JS file organization and line ranges
  - Known technical debt (monolithic files, duplicated colors)
  - Future refactoring options with effort estimates
- Updated line counts in CLAUDE.md and CONTEXT.md

**Files**: Deleted `apantli/static/js/modules/`, updated `docs/DASHBOARD.md`

---

## Entry 12: Code Review & Backend Fixes (2026-01-28)

**What**: Comprehensive code review of frontend and backend, with minor fixes.

**Why**: Document technical debt and architecture for future contributors; fix easy issues found during review.

**How**:

- Created `docs/CODE_REVIEW.md` consolidating all review findings
- Moved Technical Review section from DASHBOARD.md to CODE_REVIEW.md
- Backend review covered: server.py, database.py, config.py, errors.py, utils.py, llm.py
- Fixed bare `except:` at server.py:1355 (now catches `OSError, socket.error`)
- Moved `from litellm import model_cost` from 3 inline imports to module level

**Key Findings**:

- Frontend: Monolithic JS (2,691 lines), duplicated provider colors, minimal CSS comments
- Backend: server.py too large (1,378 lines), mixes proxy logic with CRUD; uses print() not logging
- Overall: Functional and maintainable, issues are organizational not functional

**Files**: `docs/CODE_REVIEW.md` (new), `docs/DASHBOARD.md`, `apantli/server.py`
