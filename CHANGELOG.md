# Changelog

All notable changes to Apantli will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

**Request Filtering and Pagination (2025-10-11)**

- Server-side filtering for `/requests` endpoint with multiple filter types:
  - Provider filter (e.g., 'openai', 'anthropic')
  - Model filter (exact match)
  - Cost range filters (min_cost, max_cost)
  - Text search (searches model name and request/response JSON)
- Pagination support with configurable page size:
  - `offset` parameter for skipping records (default: 0)
  - `limit` parameter for page size (default: 50, max: 200)
  - Response includes total count for accurate pagination
- Dashboard improvements:
  - Unified date filter across Stats and Requests tabs
  - Filter state persists across page reloads (localStorage)
  - Pagination UI with Previous/Next buttons
  - Page indicator ("Page X of Y") and item counter
  - Summary shows accurate totals for ALL filtered results
  - Automatic reset to page 1 when filters change

**API Keys in Database Logs (2025-10-09)**

- Store full API keys in database logs for debugging purposes
- Preserves request_data before LiteLLM transformations
- Enables reconstruction of exact requests sent to providers

**Enhanced Error Logging (2025-10-08)**

- Suppress verbose LiteLLM logging by default
- Improved error message formatting
- Socket error deduplication (log once per request)

### Fixed

**Configuration Import Bug (2025-10-10)**

- Resolved MODEL_MAP import issue causing empty config lookup
- Fixed module reference pattern for accessing globals

**Stats Display Bug (2025-10-11)**

- Show total request stats in summary, not just paginated page
- Fixed discrepancy between summary totals and table counts

### Changed

**Dashboard Architecture**

- Moved filtering logic from client-side JavaScript to server-side SQL
- Reduced client-side memory usage
- Improved query performance with indexed filters
- Removed client-side filtering functions (applyRequestFilters, filteredRequestsData)

**Documentation Updates (2025-10-07)**

- Completed architecture documentation after rearchitecture
- Added comprehensive test suite documentation
- Created LLM CLI integration guide
- Archived completed development plans

## [0.2.0] - 2025-10-06

### Added

**Modular Architecture Rearchitecture**

- Split monolithic `server.py` into six focused modules:
  - `apantli/config.py` - Configuration with Pydantic validation
  - `apantli/database.py` - Async database operations with aiosqlite
  - `apantli/llm.py` - Provider inference
  - `apantli/errors.py` - Error formatting
  - `apantli/utils.py` - Timezone utilities
  - `apantli/server.py` - FastAPI routes and orchestration

**Pydantic Configuration Validation (Phase 4)**

- Type-safe configuration with Pydantic models
- ModelConfig class with validation
- Config class for configuration management
- Early error detection for API key format
- Environment variable existence warnings

**Async Database Operations (Phase 3)**

- Converted all database operations to async using aiosqlite
- Database class with async context managers
- Non-blocking I/O for all queries
- Maintains performance under load

**Comprehensive Test Suite (Phase 2)**

- 60 test cases across unit and integration tests
- Unit tests for all modules (config, database, llm, errors, utils)
- Integration tests for proxy and error handling
- Fast unit tests (<1 second) with no API key requirements
- See `tests/README.md` for complete procedures

**Utility Scripts**

- `utils/redact_api_keys.py` - Redact API keys from existing database
- `utils/generate_llm_config.py` - Configure llm CLI to use Apantli
- `run_unit_tests.py` - Run test suite with color output

### Changed

**Configuration System**

- Replaced global dictionaries with Pydantic models
- Added validation for API key references
- Improved error messages for configuration issues
- Backward compatible MODEL_MAP global still available

**Database Operations**

- All database operations now async
- Connection management via context managers
- Cost calculation built into Database class
- Improved query performance with async I/O

**Documentation**

- Created dedicated docs/ directory
- Added ARCHITECTURE.md with system design details
- Added CONFIGURATION.md for setup instructions
- Added DATABASE.md with schema and maintenance
- Added DASHBOARD.md for web UI guide
- Added ERROR_HANDLING.md with design decisions
- Added TESTING.md with test procedures
- Added docs/README.md as navigation index

## [0.1.0] - Initial Release

### Added

- OpenAI-compatible proxy server with FastAPI
- Multi-provider support via LiteLLM SDK
- SQLite database for request/response logging
- Cost tracking with automatic calculation
- Web dashboard with statistics and request history
- Streaming support for real-time responses
- Configurable timeouts and retries
- Error handling with OpenAI-compatible format
- Calendar view with daily cost heatmap
- Model pricing information display
- Dark mode theme toggle
- CORS support for web clients
