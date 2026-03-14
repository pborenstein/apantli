# The Story of Apantli: Code Archaeology Report

**Repository**: apantli
**Timeline**: October 4 - November 1, 2025 (27 days)
**Total Commits**: 189
**Contributors**: Philip Borenstein (single developer)
**Current State**: Version 0.2.0, Apache-2.0 license

## Chapter 1: Genesis in a Single Afternoon (October 4, 2025)

### The Foundation Commit

At 14:54 on October 4, 2025, commit `fbe7b56` initiated the repository with a single file: `config.yaml`. The commit message read simply "Make it so". This 25-line configuration file defined model mappings for GPT-4 and Claude models using LiteLLM parameters and environment variable references.

### Rapid Construction

45 minutes later, at 15:40, commit `326265b` added 537 lines across 5 files. The commit message stated:

> "Add lightweight LLM proxy with SQLite cost tracking. Build a local proxy server that routes requests to multiple LLM providers using LiteLLM SDK. Unlike the full LiteLLM proxy which requires Prisma and Postgres, this uses SQLite for request/cost tracking and provides a simple web dashboard for usage stats."

This commit included:
- `proxy.py` (386 lines) - Complete FastAPI server with OpenAI-compatible endpoints
- `test_proxy.py` (61 lines) - Basic integration tests
- `README.md` (78 lines) - Installation and usage documentation
- `requirements.txt` (5 dependencies) - FastAPI, LiteLLM, PyYAML, uvicorn, python-dotenv
- `.gitignore` - Standard Python patterns

The initial implementation handled:
- Model configuration loading from YAML
- SQLite database initialization and request logging
- Cost calculation using `litellm.completion_cost()`
- OpenAI-compatible `/v1/chat/completions` endpoint
- HTML dashboard embedded in Python string

### First-Day Iteration

Between 15:51 and 22:01, 18 additional commits refined the foundation:

**Package Structure** (17:04, commit `0589966`):
Renamed project to "apantli" (Nahuatl for irrigation channel) and restructured as proper Python package. Moved `proxy.py` to `apantli/server.py`, added CLI argument parsing (`--host`, `--port`, `--config`, `--db`, `--reload`), configured hatchling build backend.

**Documentation** (17:57, commit `c88f804`):
Added comprehensive documentation and MIT license. Created initial structure for multi-document approach.

**Integration Features** (19:44, commit `6c6aa1b`):
Added CORS support and streaming for Obsidian Copilot compatibility. Implemented Server-Sent Events (SSE) for streaming completions.

**Dashboard Enhancements** (19:54, 21:29, 21:46):
Enhanced dashboard with error management, refined time filters, local timezone support, streaming request logging, and initial time filtering.

By end of day: 20 commits, complete working proxy with dashboard, tests, documentation, and streaming support.

## Chapter 2: Rapid Feature Development (October 5-8, 2025)

### Reactive Dashboard Architecture (October 5)

Commit `47eaea4` (23:22) integrated Alpine.js for reactive state management, replacing manual DOM manipulation. Three subsequent commits fixed filter persistence, added enhanced date filtering with quick buttons (Today, Yesterday, This Week, This Month), and simplified timezone handling.

### Visual Enhancements (October 6)

Three commits added sophisticated visualizations:
- Provider cost breakdown with model segmentation
- Date range discovery (automatic detection of first/last request dates)
- Sortable columns across all dashboard tables with preserved state across auto-refresh

### Documentation Expansion (October 6)

Commit `4e8f11c` (19:15) added `DATABASE.md` with comprehensive schema documentation. Subsequent commits added request filtering UI and updated README to reflect dashboard features.

### Performance Breakthrough (October 7)

Commit `6aba66c` (09:31) delivered dramatic performance improvement. The commit message stated:

> "Optimize database queries for 50x+ performance improvement. Fixes 5-second delay on Stats page by eliminating inefficient DATE() function calls in WHERE clauses."

The optimization converted local date ranges to UTC timestamps for index-based filtering:
- Before: ~5s with `DATE(timestamp, tz)` forcing full table scans
- After: <100ms with indexed timestamp range scans

Later that day (09:36, 09:58, 10:29, 11:11):
- Added provider cost trends chart (Phase 3.2)
- Implemented parallel fetching of stats and chart data
- Bundled Alpine.js locally (eliminating 6-second CDN delay)
- Fixed 5-second delay on initial page load

Commit `74ca99f` (14:21) added Model Efficiency comparison showing most economical and token-rich models.

### Documentation Refinement (October 7-8)

Series of commits synchronized documentation with implementation, optimized README by consolidating content into specialized docs, completed documentation audit, fixed Python packaging configuration, archived completed audit document.

Commit `a850de5` (19:05) documented all available `litellm_params` configuration parameters.

Commit `9edb7f3` (19:58) added comprehensive `DASHBOARD.md` with implementation details and feature explanations.

### Error Handling Implementation (October 8)

Commit `45ab7f8` (12:10) implemented comprehensive error handling:
- Configurable timeouts (default 120s) and retries (default 3)
- Status code mapping (429, 401, 403, 404, 503, 504, 502, 500)
- OpenAI-compatible error response format
- Streaming error handling in SSE format

Commit `6f02e48` (12:13) added 6 error handling tests covering timeout simulation, retry behavior, invalid API keys, authentication, malformed requests, and unknown models.

Commit `4e21d3a` (16:00) added `tenacity` dependency after discovering LiteLLM requires it for retry functionality.

## Chapter 3: Architectural Rearchitecture (October 10-11, 2025)

### Four-Phase Modularization

The rearchitecture occurred across four commits on October 10, each marked with phase numbers:

**Phase 1** (20:27, commit `0516179`):
Extracted five focused modules from monolithic `server.py`:
- `apantli/config.py` - Configuration management and MODEL_MAP
- `apantli/database.py` - SQLite operations and schema management
- `apantli/errors.py` - OpenAI-compatible error response formatting
- `apantli/llm.py` - Provider inference from model names
- `apantli/utils.py` - Timezone conversion utilities

Server.py reduced from 1,078 to 903 lines (16% reduction). All integration tests remained passing.

**Phase 2** (20:33, commit `9ca97ea`):
Added comprehensive unit test suite:
- `tests/test_config.py` - 6 tests for configuration loading
- `tests/test_database.py` - 11 tests for database operations
- `tests/test_llm.py` - 4 tests for provider inference
- `tests/test_errors.py` - 2 tests for error formatting
- `tests/test_utils.py` - 4 tests for timezone conversion

Created `run_unit_tests.py` script and updated documentation.

**Phase 3** (20:41, commit `e785496`):
Converted to async database operations with aiosqlite:
- Added Database class with async methods
- Implemented async context manager for connections
- Added `await` to all 9 `init_db()` and `log_request()` calls
- Converted all 11 database tests to async with `@pytest.mark.asyncio`

The commit message noted: "Server handles concurrent requests without blocking. Database operations complete in same time but non-blocking."

**Phase 4** (20:46, commit `68bae8a`):
Added Pydantic validation for configuration:
- Created `ModelConfig` and `Config` Pydantic models
- Added validation for API key format (`os.environ/VAR_NAME`)
- Implemented environment variable existence warnings
- Updated all 6 config tests for Pydantic validation

Commit `4829f7f` (20:52) archived the completed `REARCHITECTURE.md` plan document.

### Security Decision Reversal (October 10-11)

Three commits documented evolving security stance:

1. Commit `ddb8e57` (Oct 10, 19:14): "Redact API keys before storing in database"
2. Commit `46301b3` (Oct 11, 00:21): "feat: Store API keys in database logs for debugging"
3. Commit `8a4df57` (Oct 11, 00:28): "fix: Preserve API keys in database logs by copying request_data before LiteLLM"

The final state stored unredacted API keys. Commit `4b06d74` (Oct 10, 19:59) added utility script to redact keys from existing databases.

### Production Hardening (October 11)

Series of commits addressed real-world usage patterns:

- Fixed MODEL_MAP import bug causing empty config lookup
- Added global sticky date filter and request pagination
- Showed total request stats (not just paginated page)
- Implemented server-side filtering for requests
- Improved server logging with detailed LLM request tracking
- Aligned log messages with uvicorn INFO format (adjusted indentation to 28 spaces)

## Chapter 4: Polish and Professional Identity (October 11-15, 2025)

### Branding Materialization (October 11)

Commit `eb29a7a` (19:06) added the apantli glyph - a simple water channel icon representing the project's identity as a conduit for requests.

### Documentation Reorganization (October 11)

Three commits reorganized README:
- Restructured for better new user flow
- Changed primary example from Python SDK to curl
- Converted Web Dashboard tab descriptions to table format

Commit `bc4eb0a` created a comparison table:

| Tab | Purpose |
|-----|---------|
| Stats | Overall usage statistics |
| Calendar | Daily activity visualization |
| Models | Available model configurations |
| Requests | Individual request details |

### Visual Refinements (October 13-14)

- Added PNG version of glyph
- Fixed cost calculation display for streaming requests
- Added footer with copyright and attribution
- Added favicon and app icons

### Error Handling Enhancement (October 14)

Commit `d3c0aa9` (19:30) handled unknown model errors gracefully with helpful messages. Commit `e7f6a5e` (19:34) logged these errors to database and console.

### Service Infrastructure (October 14-15)

Commit `6fd31dd` (23:09) added launchd service configuration and documentation for macOS system service integration.

Commit `8c7bcb4` (23:39) added generic launchd templates and installer script.

Commit `f5e3426` (23:55) added `dev.sh` development script and documented launchd naming conventions.

Commit `7f9f59e` (Oct 15, 00:24) updated documentation for accuracy and recent features.

Commit `8802784` (Oct 15, 00:32) removed unmaintained `CHANGELOG.md`.

## Chapter 5: Parameter System and Visualization (October 17, 2025)

### Parameter Precedence Implementation

Commit `9636359` (11:53) fixed dashboard date filtering and temperature override behavior.

Commit `c0c8dca` (12:45) implemented comprehensive parameter precedence system. The commit message stated:

> "Fix parameter precedence and add parameter display to dashboard. Config provides defaults, client values (except null) override config."

Added parameter display to request details showing temperature, max_tokens, timeout, num_retries, and top_p.

### Temporal Visualization Enhancement

Commit `dc69e5a` (16:51) added hourly breakdown for single-day views.

Commit `f360369` (16:51) updated documentation for parameter precedence and dashboard features.

Commit `cc40e84` (17:05) fixed hourly stats timezone bug that fetched 2 days instead of 1.

### Chart Improvements

Three commits enhanced visualization:
- Showed models instead of providers in cost trend charts
- Increased color contrast for model tints (0-75% instead of 0-50%)
- Added tooltip popup on hover for bar segment models

## Chapter 6: Database Architecture Consolidation (October 17-18, 2025)

### Streaming Refactoring (October 17)

Commit `014ca19` (18:29) consolidated duplicate code and improved error handling.

Commit `317d092` (18:31) simplified streaming generator and documented architecture.

Commit `4da08e4` (18:52) moved `socket_error_logged` to correct scope.

Commit `0d6636b` (20:30) reverted broken `safe_yield()` helper from streaming.

### Database Class Migration (October 17)

Two commits moved all SQL from `server.py` to Database class:
- Commit `5cc9307` (18:57): Moved `/requests` and `/stats` SQL to Database class
- Commit `5dd41af` (19:01): Completed migration with removal of all direct SQL from server.py

Commit `8f64732` (20:21) fixed result dict values in `/stats/hourly` return.

Commit `5765508` (23:44) updated quickstart documentation.

### Naming and Branding (October 18)

Commit `6db7fbe` (00:24) replaced generic "LLM Proxy Statistics" title with "apantli ≈ dashboard" including inline glyph image.

Commit `80df5f3` (01:00) standardized all error responses to OpenAI-compatible format.

Commit `e413e9e` (02:28) added `MODEL_NAMING.md` explaining the three-API confusion (client API, apantli API, provider API).

Two commits clarified MODEL_NAMING.md:
- LiteLLM provider inference and removed "we" voice
- Clarified two APIs with Apantli as bridge, not three APIs

### Code Cleanup Phase (October 18)

Commit `023e950` (04:49) eliminated duplicate database API, using Database class directly throughout.

Commit `af6ba00` (05:00) extracted timezone utilities to `utils.py` and centralized error mapping.

Commit `504a990` (05:13) eliminated remaining global state, using `app.state` throughout.

Commit `a439062` (05:33) broke down 234-line `chat_completions` function into focused subfunctions.

Commit `6a70f9e` (05:45) updated `CODE_REVIEW.md` with completion status summary.

## Chapter 7: Frontend Standardization (October 19-20, 2025)

### API and Naming Standardization (October 19)

Commit `73afe05` (22:54) standardized Config API, error naming, and database filters. Introduced `RequestFilter` dataclass for type-safe query parameters.

### Dashboard File Split (October 19)

Commit `03f9cb7` (22:58) split monolithic `dashboard.html` into separate files:
- `templates/dashboard.html` - HTML structure (327 lines, down from 3,344)
- `apantli/static/css/dashboard.css` - Styles (1,087 lines)
- `apantli/static/js/dashboard.js` - Logic (1,705 lines)

This 3,070-line extraction maintained functionality while enabling separate concerns.

### Type Safety Implementation (October 19)

Commit `b082728` (23:13) added mypy static type checking. The commit message documented:

> "Type checking integration: Install mypy and type stubs (types-PyYAML, types-netifaces), add mypy configuration to pyproject.toml, configure for Python 3.13 with sensible strictness settings."

Applied type fixes across codebase:
- Added `Optional[]` types to parameters with `default=None`
- Fixed MODEL_MAP type annotation (`Dict[str, dict]`)
- Fixed error.py code parameter (`Optional[str]`)
- Fixed database.py params list annotations
- Fixed server.py endpoint parameters

Results: "Success: no issues found in 8 source files"

Commit `cfd9367` (23:03) fixed filters.offset/limit usage in `get_requests()` return dict.

Commits `bfbb0d8` (23:26) and `5055b80` (23:30) archived code review document and added mypy/type stubs to dev dependencies.

### Navigation Enhancement (October 19-20)

Commit `03e5f4f` (23:52, Oct 19) made stats table rows clickable, navigating to Requests tab with filters applied (model or provider).

Commit `53b8d0e` (00:05, Oct 20) added browser history support for tab navigation. Each tab change created history entry, enabling browser back/forward navigation. Direct linking to tabs supported via hash URLs (`/#calendar`, `/#requests`).

Commit `f14460d` (00:30) cleaned up backward compatibility code and documentation.

Commit `93fe6ec` (00:57) marked with "wip" - a stopping point.

Commit `ad5f451` (05:31) fixed race condition in filter watchers causing missing requests.

## Chapter 8: License Change and Provider Expansion (October 23-24, 2025)

### License Transition

Commit `c5abf52` (Oct 23, 23:44) updated clone command with actual repository URL.

Commit `fcc9f54` (Oct 23, 23:50) changed license from MIT to Apache License 2.0. Modified `LICENSE` file (201 lines added, 21 removed) and updated `pyproject.toml` classifiers.

### Model Expansion

Commit `f20dd7c` (Oct 24, 21:00) added Gemini models to configuration.

Commit `77cea6b` (Oct 24, 21:23) fixed gemini-flash-lite model name from `gemini/gemini-flash-lite` to `gemini/gemini-2.5-flash-lite` (correct LiteLLM identifier).

## Chapter 9: JavaScript Modularization and Stability (October 31 - November 1, 2025)

### Code Review Refinements (October 31)

Commit `897678d` (22:03) implemented code quality improvements from code review.

Commit `d5207b6` (22:14) fixed test assertions for logging changes.

### JavaScript Architecture Evolution (October 31)

Commit `69528fc` (22:18) started JavaScript modularization (partial).

Commit `6b86457` (23:06) completed major JavaScript modularization. The commit message documented creation of 6 modules:

**modules/state.js** (953 bytes):
- Centralized state management for dashboard data
- expandedRequests, detailViewMode, tableSortState
- modelsData, requestsData, serverAggregates, chartData

**modules/core.js** (2.2KB):
- Error handling: showError, hideError, fetchWithErrorHandling
- Utilities: escapeHtml, formatDate, copyToClipboard
- Color functions: getCostColor, getProviderColor, getModelColor

**modules/tables.js** (2.9KB):
- Table sorting with 3-state cycling (null → asc → desc → null)
- sortTable, makeSortableHeader, updateSortIndicators, applySortIfNeeded

**modules/requests.js** (18KB):
- Request loading and filtering
- Conversation view with multimodal content support
- JSON tree rendering with collapsible nodes
- Detail row toggling and view mode switching

**modules/models.js** (2.0KB):
- Models table loading from `/models` endpoint
- Sortable table with cost per million tokens

**modules/calendar.js** (4.5KB):
- Calendar view for daily statistics
- Month navigation and day selection
- Provider breakdown visualization

**modules/stats.js** (15KB):
- Statistics aggregation and visualization
- Provider breakdown with model segments
- Clickable tables for filtering
- Model efficiency and performance metrics

Total: ~45KB extracted from 1,728-line monolith.

### Type and DateTime Fixes (October 31)

Commit `2e5fa93` (23:18) fixed type annotations in `database.py` for mypy compliance.

Commit `9396ab6` (23:21) replaced deprecated `datetime.utcnow()` with `datetime.now(UTC)`.

### Timestamp Parsing Crisis (October 31)

Three commits addressed timestamp format incompatibilities:

Commit `eb5a485` (23:28): "Fix timestamp format for JavaScript compatibility in dashboard"

Commit `d079b2f` (23:33): "Fix 'Invalid Date' in dashboard by removing blind 'Z' appending"

Commit `0c07e4f` (23:42): "Fix timestamp parsing to handle all three database formats"

The final commit message explained:

> "Database contains three timestamp formats from different implementations:
> 1. Old (datetime.utcnow): '2025-11-01T03:17:20.760472' (no timezone)
> 2. Middle (datetime.now(UTC)): '2025-11-01T03:20:45.872052+00:00'
> 3. Current (with .replace): '2025-11-01T03:29:49.474288Z'"

Solution: Conditionally append 'Z' only when timestamp lacks timezone info. Applied to 8 locations in `dashboard.js`, `requests.js`, and `stats.js`.

### Version Release (October 31 - November 1)

Commit `ead1975` (23:48, Oct 31) added cache-busting query parameter to `dashboard.js`.

Commit `9e8a314` (23:55, Oct 31) bumped version to 0.2.0. The commit message summarized:

> "Major changes in this release:
> - Complete JavaScript modularization (6 modules)
> - Fixed timestamp parsing for all three database formats
> - Replaced deprecated datetime.utcnow() with datetime.now(UTC)
> - Fixed type annotations for mypy compliance
> - Updated license from MIT to Apache-2.0
> - Added cache-busting for browser compatibility
>
> This release includes significant refactoring and bug fixes for production stability."

## Arc of Development

### Velocity Pattern

The commit timeline shows three distinct periods:

**Explosive Genesis** (Oct 4-8): 72 commits in 5 days
- Foundation built in single 7-hour session
- Feature development, dashboard enhancements
- Performance optimization (50x improvement)
- Error handling implementation

**Systematic Rearchitecture** (Oct 10-11): 29 commits in 2 days
- Four-phase modularization executed with zero regressions
- Security decision reversal and production hardening
- Database architecture consolidation

**Professional Polish** (Oct 13-24): 43 commits in 12 days
- Branding materialization and visual refinements
- Service infrastructure and parameter systems
- Documentation reorganization
- License change and provider expansion

**Architectural Refinement** (Oct 31 - Nov 1): 10 commits in 2 days
- JavaScript modularization (6 focused modules)
- Type safety improvements with mypy compliance
- DateTime handling crisis resolved
- Version 0.2.0 release

### Quantified Evolution

| Metric | Initial (Oct 4) | Mid-point (Oct 18) | Current (Nov 1) |
|--------|-----------------|-------------------|-----------------|
| Python lines | 386 (proxy.py) | ~1,100 (7 modules) | 1,482 (6 modules) |
| Dashboard | Inline HTML string | 3,344 line monolith | 6 modules (~45KB) |
| Tests | 61 lines (basic) | 59 test cases | 59 test cases |
| Documentation | 78 line README | 15 documents | 15 documents (~170KB) |
| Dependencies | 5 packages | 7 packages | 8 packages |

## What the Story Reveals

### Architectural Philosophy

The evolution demonstrates clear preferences:

**Simplicity over features**: SQLite not Postgres, local not cloud, single-file to focused modules rather than complex frameworks.

**Testing as validation**: Tests appeared after working code, validating behavior rather than driving design. Integration tests preceded unit tests.

**Documentation as artifact**: 15 separate documents totaling 170KB. Completed planning documents archived rather than deleted. Documentation received its own fix commits.

**Incremental refinement**: Dashboard received 20+ commits of progressive enhancement rather than single big-bang redesign.

### Development Patterns

**Phased execution**: Major rearchitecture broken into 4 numbered phases executed in 2 days with test validation at each phase.

**Performance measurement**: "50x+ performance improvement" indicates profiling and measurement, not guesswork.

**Crisis management**: The three-commit timestamp parsing crisis (implement → quick fix → comprehensive fix) shows learning under real-world pressure.

**Archive discipline**: Three planning documents (DASHBOARD_IMPROVEMENT_PLAN.md, REARCHITECTURE.md, CODE_REVIEW.md) archived upon completion rather than deleted.

### Security Evolution

Initial implementation stored API keys without documentation. First security commit redacted keys. Within 24 hours, reverted to storing keys with explicit documentation: "Database contains full conversation history and API keys - protect file permissions."

This represents mature risk acceptance: acknowledged security implications, chose debuggability over theoretical security for local-only tool.

### Identity Formation

Project name "apantli" (Nahuatl for irrigation channel) appeared in commit `0589966` on Oct 4. The water channel glyph materialized in commit `eb29a7a` on Oct 11. Dashboard branding added in commit `6db7fbe` on Oct 18.

The identity crystallized over 14 days from generic "LLM proxy" to specific "apantli ≈ water channel for LLM requests".

## Current State Assessment

As of commit `9e8a314` (November 1, 2025):

**Architecture**: Modular Python backend (6 modules, 1,482 lines), modular JavaScript frontend (6 modules, ~45KB), SQLite persistence, Alpine.js reactivity.

**Testing**: 59 test cases (17 simple unit, 11 async database, 6 proxy integration, 6 error handling integration), mypy static type checking with zero issues.

**Documentation**: 15 documents in `docs/` directory, 3 archived planning documents, comprehensive API reference, architecture guide, configuration guide, dashboard documentation.

**Features**: OpenAI-compatible proxy API, multi-provider routing (OpenAI, Anthropic, Google Gemini), cost tracking with LiteLLM SDK, streaming support with SSE, CORS for browser clients, web dashboard with 4 tabs, date range filtering, sortable tables, browser history navigation, error management UI.

**Deployment**: CLI with configurable options, launchd service templates for macOS, development script, uv package management.

**License**: Apache-2.0 (changed from MIT on Oct 23)

**Version**: 0.2.0 (no git tags, version in pyproject.toml only)

The project represents a complete, tested, documented local LLM proxy suitable for individual developer use.
