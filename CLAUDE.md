# CLAUDE.md

AI-specific context for Claude Code when working with this repository.

## Project Overview

Apantli is a lightweight local LLM proxy that routes requests to multiple providers through an OpenAI-compatible API while tracking costs in SQLite. Modular FastAPI architecture with six focused modules for configuration, database, LLM integration, error handling, and utilities.

## Core Architecture

**Request Flow**: Client → FastAPI (server.py) → Config lookup → API key resolution → LiteLLM SDK → Provider → Response + cost calc → Async DB log → Client

**Module Structure** (~1,500 lines core + ~2,800 lines UI):
- `apantli/server.py` (~1,100 lines) - FastAPI app, HTTP routes, request orchestration
- `apantli/config.py` (213 lines) - Configuration with Pydantic validation
- `apantli/database.py` (119 lines) - Async database operations with aiosqlite
- `apantli/llm.py` (27 lines) - Provider inference
- `apantli/errors.py` (22 lines) - Error formatting
- `apantli/utils.py` (23 lines) - Timezone utilities

**Key Files**:
- `config.yaml` - Model definitions, API key refs
- `.env` - API keys (gitignored)
- `requests.db` - SQLite (full request/response logs + costs)
- `templates/dashboard.html` (327 lines) - Dashboard UI structure
- `templates/compare.html` (218 lines) - Playground UI structure
- `apantli/static/css/dashboard.css` (1,087 lines) - Dashboard styles
- `apantli/static/css/compare.css` (427 lines) - Playground styles
- `apantli/static/js/dashboard.js` (1,705 lines) - Dashboard logic
- `apantli/static/js/compare.js` (426 lines) - Playground logic
- `tests/` - Unit and integration tests (59 test cases)

## Implementation Details

**Configuration (config.py)**:
- Pydantic models: `ModelConfig` (per-model settings), `Config` (overall configuration)
- Validation: API key format (`os.environ/VAR_NAME`), environment variable existence warnings
- Type-safe: Strong typing with Pydantic, early error detection
- Reload support: Can reload config without restart
- Parameter precedence: Config provides defaults, client values (except null) override config

**Database (database.py)**:
- Async operations: aiosqlite for non-blocking I/O
- Database class: Encapsulates all database operations with async methods
- Connection management: Context managers (`_get_connection()`)
- Core methods: `init()`, `log_request()`, `get_requests()`, `get_stats()`, `get_daily_stats()`, `get_hourly_stats()`
- Cost calculation: Uses litellm.completion_cost() during log_request()
- Statistics queries: Encapsulated in Database class methods
- Performance: Non-blocking async, ~1-5ms per operation

**Application State**:
- Config and Database instances stored in FastAPI's `app.state` for dependency injection
- `app.state.config`: Config instance with all model configurations
- `app.state.db`: Database instance for async database operations
- `app.state.model_map`: Pre-computed dict of model parameters for fast lookups
- Benefits: Clean dependency injection, testable, no hidden global state

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

**Dashboard**: Jinja2 template at `/`, Alpine.js for reactivity, 4 tabs (Stats, Calendar, Models, Requests), 5-second auto-refresh on Stats tab. Request details show parameter values (temperature, max_tokens, timeout, num_retries, top_p). Navigation link to Playground in header.

**Playground**: Side-by-side model comparison interface at `/compare`. Frontend-only implementation (no backend changes beyond serving template). Key features:
- 3 independent slots for model comparison
- Each slot: enable/disable, model selection, parameter controls (temperature, top_p, max_tokens)
- Parallel streaming requests to `/v1/chat/completions`
- Independent conversation history per slot (locked to original model)
- Token usage display (prompt→completion tokens)
- localStorage persistence (conversations survive reload)
- Export all conversations to markdown
- Model-specific parameter defaults from config.yaml
- Reset buttons (↺) restore model defaults
- Warning indicators when model changed mid-conversation
See PLAYGROUND.md for detailed architecture and usage.

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

**Testing**: Comprehensive test suite with 59 test cases plus mypy type checking:
- Unit tests: `tests/test_config.py`, `test_database.py`, `test_llm.py`, `test_errors.py`, `test_utils.py`
- Integration tests: `tests/integration/test_proxy.py`, `test_error_handling.py`
- Type checking: `mypy apantli/` - static type analysis
- Fast unit tests (<1 second) with no API key requirements
- Run with: `make all` (type check + tests), `python run_unit_tests.py`, or `pytest tests/ -v`
See TESTING.md for complete procedures and validation strategies.

**Security**: API keys in `.env` and stored in database logs for debugging. Dashboard unauthenticated (local use only). Database contains full conversation history and API keys - protect file permissions. Default `0.0.0.0` binding - use `--host 127.0.0.1` for localhost-only.

## API Endpoints

All routes defined in `apantli/server.py`. See API.md for full reference.

Primary: `/v1/chat/completions`, `/chat/completions` (POST) - OpenAI-compatible proxy (streaming supported)
Health: `/health` (GET) - Returns `{"status": "ok"}`
Stats: `/stats` (GET, includes performance metrics), `/stats/daily`, `/stats/date-range`
Data: `/models` (GET, includes default parameters), `/requests` (GET), `/errors` (DELETE)
UI: `/` (GET) - Dashboard, `/compare` (GET) - Playground, `/static/*` - Alpine.js libs and assets

## Key Code Patterns

**Import Pattern** (server.py):
```python
from apantli.config import DEFAULT_TIMEOUT, DEFAULT_RETRIES, Config
from apantli.database import Database, RequestFilter
from apantli.errors import build_error_response
from apantli.llm import infer_provider_from_model
from apantli.utils import convert_local_date_to_utc_range
```

**Config Usage**:
```python
# Initialize config
config = Config("config.yaml")

# Get specific model configuration
model_config = config.get_model("gpt-4")
if model_config:
    litellm_params = model_config.to_litellm_params()
    api_key = model_config.get_api_key()

# Get all models as dict (for caching in app.state)
model_map = config.get_model_map({
    'timeout': 120,
    'num_retries': 3
})
```

**Database Usage**:
```python
# Initialize database
db = Database("requests.db")
await db.init()

# Log a request
await db.log_request(model, provider, response, duration_ms, request_data)

# Query with filters
filters = RequestFilter(
    offset=0,
    limit=50,
    provider="openai",
    model="gpt-4"
)
results = await db.get_requests(filters)

# Get statistics
stats = await db.get_stats(time_filter="")
```
