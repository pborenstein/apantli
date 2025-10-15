# CLAUDE.md

AI-specific context for Claude Code when working with this repository.

## Project Overview

Apantli is a lightweight local LLM proxy that routes requests to multiple providers through an OpenAI-compatible API while tracking costs in SQLite. Modular FastAPI architecture with six focused modules for configuration, database, LLM integration, error handling, and utilities.

## Core Architecture

**Request Flow**: Client → FastAPI (server.py) → Config lookup → API key resolution → LiteLLM SDK → Provider → Response + cost calc → Async DB log → Client

**Module Structure** (1,482 lines total, down from 1,074 lines in single file):
- `apantli/server.py` (1069 lines) - FastAPI app, HTTP routes, request orchestration
- `apantli/config.py` (213 lines) - Configuration with Pydantic validation
- `apantli/database.py` (119 lines) - Async database operations with aiosqlite
- `apantli/llm.py` (27 lines) - Provider inference
- `apantli/errors.py` (22 lines) - Error formatting
- `apantli/utils.py` (23 lines) - Timezone utilities

**Key Files**:
- `config.yaml` - Model definitions, API key refs
- `.env` - API keys (gitignored)
- `requests.db` - SQLite (full request/response logs + costs)
- `templates/dashboard.html` - Web UI (Alpine.js + vanilla JS)
- `tests/` - Unit and integration tests (59 test cases)

## Implementation Details

**Configuration (config.py)**:
- Pydantic models: `ModelConfig` (per-model settings), `Config` (overall configuration)
- Validation: API key format (`os.environ/VAR_NAME`), environment variable existence warnings
- Type-safe: Strong typing with Pydantic, early error detection
- Reload support: Can reload config without restart
- Backward compatible: `MODEL_MAP` global still available for legacy code

**Database (database.py)**:
- Async operations: aiosqlite for non-blocking I/O
- Database class: Encapsulates DB logging with async methods
- Connection management: Context managers (`_get_connection()`)
- Methods: `init()`, `log_request()`
- Cost calculation: Uses litellm.completion_cost() during log_request()
- Statistics queries: Implemented directly in server.py using raw SQL
- Performance: Non-blocking async, ~1-5ms per operation

**LLM Integration (llm.py)**:
- Provider inference: Pattern matching for `gpt-*`/`o1-*` → openai, `claude*` → anthropic, etc.
- Single SDK: LiteLLM for multi-provider routing, automatic cost calculation, OpenAI format normalization
- Streaming support: Full SSE implementation

**Error Handling (errors.py)**:
- OpenAI-compatible format: `{"error": {"message", "type", "code"}}`
- Status code mapping: 401 (auth), 404 (not found), 429 (rate limit), 502 (connection), 503 (provider error), 504 (timeout), 500 (other)
- Used by: server.py for all error responses

**Utils (utils.py)**:
- Timezone conversion: `convert_local_date_to_utc_range()` for dashboard date filtering
- Browser timezone handling: Converts local dates to UTC for SQL queries

**Dashboard**: Jinja2 template at `/`, Alpine.js for reactivity, 4 tabs (Stats, Calendar, Models, Requests), 5-second auto-refresh on Stats tab.

**Error Handling**: Comprehensive implementation with configurable timeouts/retries. See ERROR_HANDLING.md for design decisions.
- Timeout: `--timeout` CLI arg (default 120s), per-model override via `timeout` in litellm_params
- Retries: `--retries` CLI arg (default 3), per-model override via `num_retries`
- Status codes: 429 (rate limit), 401 (auth), 403 (permission), 404 (not found), 503 (provider error/overload), 504 (timeout), 502 (connection), 500 (other)
- Response format: OpenAI-compatible `{"error": {"message", "type", "code"}}`
- Streaming errors: SSE format `data: {"error": {...}}` then `data: [DONE]`
- Socket errors: Logged once per request (deduplication to avoid spam)
- Request errors: Caught, logged to DB with error context, return appropriate HTTP status
- Database errors: Not caught (fail-fast for data consistency)
- Config errors: Warning printed, continue with empty `MODEL_MAP`

**Testing**: Comprehensive test suite with 59 test cases:
- Unit tests: `tests/test_config.py`, `test_database.py`, `test_llm.py`, `test_errors.py`, `test_utils.py`
- Integration tests: `tests/integration/test_proxy.py`, `test_error_handling.py`
- Fast unit tests (<1 second) with no API key requirements
- Run with: `pytest tests/ -v` or `python run_unit_tests.py`
See TESTING.md for complete procedures and validation strategies.

**Security**: API keys in `.env` and stored in database logs for debugging. Dashboard unauthenticated (local use only). Database contains full conversation history and API keys - protect file permissions. Default `0.0.0.0` binding - use `--host 127.0.0.1` for localhost-only.

## API Endpoints

All routes defined in `apantli/server.py`. See API.md for full reference.

Primary: `/v1/chat/completions`, `/chat/completions` (POST) - OpenAI-compatible proxy (streaming supported)
Health: `/health` (GET) - Returns `{"status": "ok"}`
Stats: `/stats` (GET, includes performance metrics), `/stats/daily`, `/stats/date-range`
Data: `/models`, `/requests` (GET), `/errors` (DELETE)
UI: `/` (GET) - Dashboard, `/static/*` - Alpine.js libs

## Key Code Patterns

**Import Pattern** (server.py):
```python
from apantli.config import DEFAULT_TIMEOUT, DEFAULT_RETRIES, load_config
from apantli.database import DB_PATH, init_db, log_request
from apantli.errors import build_error_response
from apantli.llm import infer_provider_from_model
from apantli.utils import convert_local_date_to_utc_range

# Import module for accessing globals (MODEL_MAP updated by load_config)
import apantli.config
import apantli.database
```

**Config Usage**:
```python
# Access MODEL_MAP via module reference (updated by load_config())
if model in apantli.config.MODEL_MAP:
    model_config = apantli.config.MODEL_MAP[model]

# Or use Config class directly
config = Config("config.yaml")
model_config = config.get_model("gpt-4")
litellm_params = model_config.to_litellm_params()
```

**Database Usage**:
```python
db = Database("requests.db")
await db.init()
await db.log_request(model, provider, response, duration_ms, request_data)
stats = await db.get_stats(hours=24)
```
