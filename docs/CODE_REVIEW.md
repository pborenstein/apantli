# Code Review

Technical assessment of codebase health, conducted 2026-01-28.

## Overview

This document captures findings from a systematic review of the Apantli codebase, covering both frontend (dashboard UI) and backend (FastAPI server) components. The goal is to identify technical debt, document architectural patterns, and provide recommendations for future work.

**Scope**:

- Frontend: dashboard.html, dashboard.css, dashboard.js
- Backend: server.py, database.py, config.py, errors.py, utils.py, llm.py

---

## Frontend Review

Assessment of dashboard UI codebase.

### Files Reviewed

| File | Lines | Purpose |
|------|-------|---------|
| `templates/dashboard.html` | 753 | HTML structure, Jinja2 macros, Alpine.js reactive data |
| `apantli/static/css/dashboard.css` | 2,209 | All styles including theme variables |
| `apantli/static/js/dashboard.js` | 2,691 | All JavaScript logic |

### Current State

The dashboard has grown organically through Phase 5 QoL improvements. Core functionality works well but the codebase shows signs of accumulated complexity.

**What works well**:

- CSS custom properties for theming (light/dark mode)
- Provider colors defined as CSS variables
- Alpine.js for reactive state management
- localStorage persistence for UI preferences
- Server-side sorting and filtering

**Technical debt**:

| Issue | Impact | Notes |
|-------|--------|-------|
| Monolithic JS file | Maintainability | 2,691 lines, 80+ functions, no module structure |
| Duplicated provider colors | DRY violation | Defined in both CSS variables and JS object |
| Minimal CSS comments | Navigation | Only 4 section comments in 2,209 lines |
| Inconsistent error handling | Reliability | Some fetches use wrapper, most use inline try/catch |

### Architecture

**CSS Organization** (`dashboard.css`):

```
Lines 1-70:      CSS variables (colors, spacing, typography)
Lines 70-1600:   Core styles (layout, tables, forms, charts)
Lines 1604-1668: Models management styles
Lines 1669-1687: Toast notifications
Lines 1688-1785: Modal styles
Lines 1786-2209: Add Model wizard styles
```

**JavaScript Organization** (`dashboard.js`):

The file contains all dashboard logic in a single scope:

- Error handling utilities (lines 1-26)
- State management (lines 28-48)
- Content extraction helpers (lines 50-106)
- Conversation view rendering (lines 108-310)
- Table sorting (lines 310-400)
- Tab management (lines 401-410)
- Models CRUD (lines 410-545)
- JSON tree rendering (lines 549-608)
- Requests loading/filtering (lines 609-760)
- Requests table rendering (lines 761-1020)
- Provider colors and tinting (lines 1022-1075)
- Charts and stats (lines 1076-1500)
- Stats tables (lines 1575-1835)
- Calendar (lines 1849-2200)
- Add Model wizard (lines 2206-2690)

### Refactoring Completed (2026-01-28)

All three frontend refactoring options have been implemented:

**✓ Option 1: Extract JS modules** (Completed)

Split monolithic `dashboard.js` (2,691 lines) into focused ES6 modules:

- `modules/core.js` (6.2K) - Error handling, fetch wrapper, color utilities, table sorting
- `modules/state.js` (1.0K) - localStorage persistence, state management
- `modules/requests.js` (26K) - Conversation view, JSON tree, request table, filtering
- `modules/stats.js` (32K) - Charts, provider trends, efficiency tables, error tracking
- `modules/calendar.js` (12K) - Multi-month calendar, date range selection
- `modules/models.js` (24K) - CRUD operations, add model wizard, export

Main entry point: `dashboard.js` (68 lines) imports all modules and exposes to `window.dashboardApp` for Alpine.js/onclick handlers.

Changes:
- Added `type="module"` to script tag in dashboard.html
- Updated all onclick handlers to use `dashboardApp.` prefix
- All 17 unit tests pass

**✓ Option 2: Add CSS section comments** (Completed)

Added 13 major section markers to `dashboard.css` for easy navigation:
- CSS Variables, Base Styles, Settings & Modals, Buttons & Controls
- Request Tables & Details, Calendar Styles, Charts & Visualizations
- Stats Tables, Filters & Search, Request Summary & Pagination
- Loading & Error States, Responsive Design, Models Management
- Toast Notifications, Modals, Add Model Wizard

**✓ Option 3: Consolidate provider colors** (Completed)

Eliminated duplication by making `getProviderColor()` read from CSS custom properties:

```javascript
function getProviderColor(provider) {
  const style = getComputedStyle(document.documentElement)
  const colorVar = `--color-${provider.toLowerCase()}`
  const color = style.getPropertyValue(colorVar).trim()
  return color || style.getPropertyValue('--color-default').trim()
}
```

Removed hardcoded `PROVIDER_COLORS` object (was duplicating CSS variables).

---

## Backend Review

Assessment of Python backend codebase.

### Files to Review

| File | Lines | Purpose |
|------|-------|---------|
| `apantli/server.py` | 1,382 | FastAPI app, HTTP routes, request orchestration |
| `apantli/database.py` | 552 | Async database operations with aiosqlite |
| `apantli/config.py` | 312 | Configuration with Pydantic validation |
| `apantli/errors.py` | 129 | Error formatting |
| `apantli/utils.py` | 117 | Timezone utilities |
| `apantli/llm.py` | 27 | Provider inference |

### server.py (1,382 lines)

Main FastAPI application handling HTTP routes and LLM request orchestration.

**What works well**:

- Clean separation of streaming vs non-streaming request handling
- Proper async/await usage throughout
- Background tasks for database logging (non-blocking)
- Comprehensive error handling with OpenAI-compatible error format
- Model parameter filtering for provider-specific constraints (e.g., Anthropic temperature/top_p conflict)
- Dashboard logging filter to reduce noise from polling endpoints
- Graceful client disconnect detection during streaming

**Technical debt**:

| Issue | Impact | Notes |
|-------|--------|-------|
| Large file size | Maintainability | 1,378 lines with 20+ route handlers in one file |
| Mixed responsibility | Organization | CRUD operations for models mixed with core proxy logic |
| Print statements | Logging | Uses `print()` for request logging instead of proper logger |
| ~~Duplicate imports~~ | ~~Minor~~ | ~~Fixed: moved `model_cost` import to module level~~ |
| ~~Bare except~~ | ~~Error handling~~ | ~~Fixed: now catches `(OSError, socket.error)`~~ |

**Architecture**:

```
Lines 1-56:      Imports, path setup, template initialization
Lines 60-131:    Lifespan, app setup, logging filter, CORS
Lines 133-254:   Model resolution and parameter filtering
Lines 256-476:   LLM request execution (streaming + non-streaming)
Lines 478-544:   Main /chat/completions endpoint
Lines 546-611:   /health and /models endpoints
Lines 613-733:   Provider discovery endpoints (/api/providers/*)
Lines 736-971:   Model CRUD endpoints (/api/models/*)
Lines 974-1051:  Obsidian export endpoint
Lines 1053-1226: Stats and requests endpoints
Lines 1228-1254: Dashboard HTML routes
Lines 1256-1383: CLI entry point and server startup
```

**Security notes**:

- CORS allows all origins (`allow_origin_regex=r".*"`) - appropriate for local proxy
- API keys resolved from environment variables, not hardcoded
- Full request/response logged to database (includes API keys in request_data)

### database.py (552 lines)

Async SQLite operations using aiosqlite with connection-per-request pattern.

**What works well**:

- Clean async context manager for connections (`_get_connection`)
- Proper parameterized queries (no SQL injection risk)
- Useful indexes for common query patterns (timestamp, date+provider, cost)
- RequestFilter dataclass for clean parameter passing
- Good separation of query concerns (stats, requests, daily, hourly)

**Technical debt**:

| Issue | Impact | Notes |
|-------|--------|-------|
| Connection per query | Performance | Opens/closes connection for each operation; could use connection pool |
| F-string SQL building | Readability | Filter clauses built with f-strings (safe but harder to read) |
| No query logging | Debugging | No way to see actual SQL being executed |
| Duplicated grouping logic | DRY | `get_daily_stats` and `get_hourly_stats` have similar aggregation patterns |

**Architecture**:

```
Lines 1-32:      RequestFilter dataclass
Lines 34-48:     Database class, connection manager
Lines 50-121:    Schema init, log_request
Lines 123-223:   get_requests (filtered, paginated)
Lines 225-343:   get_stats (aggregated statistics)
Lines 345-416:   get_daily_stats
Lines 418-486:   get_hourly_stats
Lines 488-552:   Utility methods (clear_errors, get_date_range, get_filter_values)
```

**Performance notes**:

- Current pattern works well for low-to-medium load
- For high load, consider aiosqlite connection pool or WAL mode

### config.py (312 lines)

Configuration management with Pydantic validation.

**What works well**:

- Strong validation with Pydantic field validators
- Automatic environment variable validation (warns if not set)
- Backup management with automatic cleanup (keeps last 5)
- Uses ruamel.yaml to preserve comments when writing
- Clean separation: ModelConfig for individual models, Config for file management

**Technical debt**:

| Issue | Impact | Notes |
|-------|--------|-------|
| Two YAML libraries | Dependencies | Uses both `yaml` (reading) and `ruamel.yaml` (writing) |
| Validation runs on reload | Startup time | All validators run even for unchanged models |
| No schema versioning | Migration | No way to detect/migrate old config formats |

**Architecture**:

```
Lines 1-28:      Imports, constants (LOG_INDENT, defaults)
Lines 31-107:    ModelConfig Pydantic model with validators
Lines 109-173:   Config class: init, reload
Lines 174-194:   Model access methods (get_model, list_models, get_model_map)
Lines 196-241:   Backup management
Lines 243-312:   Config file writing with ruamel.yaml
```

### errors.py (129 lines)

Error handling utilities for OpenAI-compatible error responses.

**What works well**:

- Clean error type mapping (ERROR_MAP)
- Robust message extraction from nested LiteLLM errors
- Handles multiple error formats (Anthropic JSON, OpenAI style, LiteLLM prefix)

**Technical debt**:

| Issue | Impact | Notes |
|-------|--------|-------|
| Regex for error parsing | Fragility | Could break if LiteLLM changes error format |

**Architecture**:

```
Lines 1-31:      ERROR_MAP definition
Lines 34-48:     get_error_details()
Lines 51-69:     build_error_response()
Lines 72-129:    extract_error_message() with multiple parsing strategies
```

### utils.py (117 lines)

Date/time utilities for timezone-aware queries.

**What works well**:

- Clean timezone offset handling
- Proper conversion of local dates to UTC ranges
- Builds efficient SQL (timestamp comparisons use index)

**No significant issues** - this is a well-focused utility module.

**Architecture**:

```
Lines 1-24:      convert_local_date_to_utc_range()
Lines 27-72:     build_time_filter()
Lines 75-87:     build_timezone_modifier()
Lines 90-102:    build_date_expr()
Lines 105-117:   build_hour_expr()
```

### llm.py (27 lines)

Provider inference from model names.

**What works well**:

- Simple, focused function
- Handles both prefixed (`openai/gpt-4`) and unprefixed (`gpt-4`) formats

**Minor issue**: Could miss new model patterns as providers add models, but this is acceptable since it's just a fallback when provider isn't explicitly specified.

---

## Summary

### Overall Assessment

The backend codebase is in good shape. Code is readable, follows Python conventions, and handles errors appropriately. The main concerns are organizational rather than functional.

### Technical Debt by Priority

**High priority** (address if touching these areas):

| Issue | Location | Notes |
|-------|----------|-------|
| server.py size | server.py | Split CRUD routes to separate module |
| Print-based logging | server.py | Convert to proper logger for consistency |

**Medium priority** (address during refactoring):

| Issue | Location | Notes |
|-------|----------|-------|
| Connection-per-query | database.py | Consider connection pooling for scale |

**Low priority** (nice to have):

| Issue | Location | Notes |
|-------|----------|-------|
| Two YAML libraries | config.py | Could consolidate to ruamel.yaml only |
| F-string SQL building | database.py | Could use query builder pattern |

### Recommendations

1. **Keep as-is for now** - The codebase works well for its intended use case (local proxy)

2. **If scaling up**:
   - Extract model CRUD routes to `apantli/routes/models.py`
   - Add connection pooling to database.py
   - Add query logging for debugging

3. **Quick wins** (completed 2026-01-28):
   - ~~Fix bare `except:` at server.py:1355~~ Done
   - ~~Move `from litellm import model_cost` to module level~~ Done
   - Replace `print()` with `logging.info()` for request logging (deferred - cosmetic)
