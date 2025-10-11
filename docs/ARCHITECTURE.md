# Architecture

System design and technical implementation details for Apantli.

## Overview

Apantli is a FastAPI-based HTTP proxy that intercepts OpenAI-compatible API requests, routes them through LiteLLM to various providers, and logs all activity to a local SQLite database. The system operates entirely locally with no cloud dependencies beyond the LLM provider APIs themselves.

The architecture follows a modular design with six focused modules handling configuration, database operations, error handling, LLM integration, and utility functions, orchestrated by a FastAPI server.

## System Components

```
┌──────────────────────────────────────────────────────────────────────┐
│                        Apantli Server                                │
│                                                                      │
│  ┌────────────────────┐      ┌─────────────────────────────────┐    │
│  │  FastAPI App       │      │  Lifespan Manager               │    │
│  │  (server.py)       │◄─────┤  - Config.reload()              │    │
│  │  - Routes          │      │  - Database.init()              │    │
│  │  - Middleware      │      └─────────────────────────────────┘    │
│  └─────────┬──────────┘                                             │
│            │                                                        │
│            │ HTTP Routes                                            │
│            ↓                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Core Modules (Modular Architecture)                         │   │
│  │  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐  │   │
│  │  │  Config       │  │  Database    │  │  LLM             │  │   │
│  │  │  (config.py)  │  │ (database.py)│  │  (llm.py)        │  │   │
│  │  │               │  │              │  │                  │  │   │
│  │  │ - ModelConfig │  │ - Database   │  │ - infer_provider │  │   │
│  │  │ - Config      │  │   class      │  │ - Provider       │  │   │
│  │  │ - Pydantic    │  │ - Async ops  │  │   patterns       │  │   │
│  │  │   validation  │  │ - aiosqlite  │  │                  │  │   │
│  │  └───────┬───────┘  └──────┬───────┘  └──────────────────┘  │   │
│  │          │                 │                                 │   │
│  │  ┌───────┴────────┐  ┌─────┴──────┐  ┌──────────────────┐  │   │
│  │  │  Errors        │  │  Utils     │  │  Static Files    │  │   │
│  │  │  (errors.py)   │  │ (utils.py) │  │  - Alpine.js     │  │   │
│  │  │                │  │            │  │  - Dashboard     │  │   │
│  │  │ - Error format │  │ - Timezone │  │    assets        │  │   │
│  │  │ - Status codes │  │   utils    │  │                  │  │   │
│  │  └────────────────┘  └────────────┘  └──────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│            │                              │                         │
└────────────┼──────────────────────────────┼─────────────────────────┘
             │                              │
             ↓                              ↓
    ┌────────────────┐           ┌──────────────────┐
    │  LLM Providers │           │  requests.db     │
    │  - OpenAI      │           │  (SQLite)        │
    │  - Anthropic   │           └──────────────────┘
    │  - Others      │
    └────────────────┘
```

## Data Flow

### Request Flow

```
┌──────────────┐
│   Client     │
└──────┬───────┘
       │ POST /v1/chat/completions
       │ { "model": "gpt-4.1-mini", "messages": [...] }
       ↓
┌─────────────────────────────────────────────────────────────────────┐
│                          Apantli Server                             │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 1. Config Lookup (config.py)                               │    │
│  │    Config.get_model("gpt-4.1-mini") →                       │    │
│  │    ModelConfig(litellm_model="openai/gpt-4.1-mini",         │    │
│  │               api_key_var="os.environ/OPENAI_API_KEY")      │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                ↓                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 2. API Key Resolution (config.py)                          │    │
│  │    ModelConfig.get_api_key() → os.environ["OPENAI_API_KEY"] │    │
│  │    → "sk-..."                                               │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                ↓                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 3. LiteLLM Call (llm.py)                                    │    │
│  │    completion(model="openai/gpt-4.1-mini",                  │    │
│  │               messages=[...], api_key="sk-...")             │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
└────────────────────────────────┼──────────────────────────────────┬─┘
                                 ↓                                  │
                       ┌──────────────────┐                         │
                       │ Provider (OpenAI)│                         │
                       └──────────┬───────┘                         │
                                  │ Response                        │
                                  │ { "id": "chatcmpl-...",         │
                                  │   "choices": [...],             │
                                  │   "usage": { tokens, ... } }    │
                                  ↓                                 │
┌────────────────────────────────────────────────────────────────┐  │
│                          Apantli Server                        │  │
│  ┌─────────────────────────────────────────────────────────┐   │  │
│  │ 4. Cost Calculation (database.py)                       │   │  │
│  │    Database._calculate_cost(response)                   │   │  │
│  │    → litellm.completion_cost() → 0.0015                 │   │  │
│  └─────────────────────────────┬───────────────────────────┘   │  │
│                                ↓                               │  │
│  ┌─────────────────────────────────────────────────────────┐   │  │
│  │ 5. Async Database Logging (database.py)                │   │  │
│  │    await Database.log_request(...)                      │◄──┼──┘
│  │    → aiosqlite.connect() → INSERT INTO requests        │   │
│  │    (non-blocking async operation)                       │   │
│  └─────────────────────────────┬───────────────────────────┘   │
│                                ↓                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 6. Return Response (server.py)                          │   │
│  │    Original LiteLLM response                            │   │
│  └─────────────────────────────┬───────────────────────────┘   │
└────────────────────────────────┼───────────────────────────────┘
                                 ↓
                         ┌──────────────┐
                         │    Client    │
                         └──────────────┘
```

### Dashboard Flow

```
User visits http://localhost:4000/
   ↓
GET / → Returns HTML with embedded JavaScript
   ↓
Browser loads → Calls refresh()
   ↓
fetch('/stats') → Query database for aggregated statistics
   ↓
Render metrics, tables, charts
   ↓
User switches to "Models" tab
   ↓
fetch('/models') → Read MODEL_MAP + LiteLLM pricing
   ↓
Display model list with costs
   ↓
User switches to "Requests" tab
   ↓
fetch('/requests') → SELECT recent requests with JSON data
   ↓
Render expandable table rows
   ↓
User clicks row → toggleDetail() → Show full request/response JSON
```

## Core Components Detail

### Module Overview

Apantli follows a modular architecture with six focused modules, each handling a specific concern:

| Module | Lines | Responsibility |
|:-------|:------|:---------------|
| server.py | 903 | FastAPI app, HTTP routes, request orchestration |
| config.py | 207 | Configuration management with Pydantic validation |
| database.py | 124 | Async database operations with aiosqlite |
| llm.py | 27 | Provider inference and LiteLLM integration |
| errors.py | 22 | OpenAI-compatible error response formatting |
| utils.py | 23 | Timezone conversion utilities |

### Server Module (server.py)

**Responsibilities**:

- HTTP request handling and routing
- Request orchestration across modules
- Application lifecycle (startup/shutdown)
- Middleware configuration (CORS)
- Template rendering for dashboard

**Key Features**:

- Async request handling via FastAPI
- Lifespan context manager calling Config.reload() and Database.init()
- OpenAI-compatible endpoints
- Static file serving for dashboard assets
- Imports and coordinates all other modules

**Integration Points**:

- Uses Config class for model lookups
- Calls Database methods for logging
- Uses LLM module for provider inference
- Uses Errors module for error formatting
- Uses Utils module for timezone operations

### Configuration Module (config.py)

**Responsibilities**:

- Load and parse config.yaml with YAML library
- Validate configuration with Pydantic models
- Provide type-safe model configuration access
- Resolve environment variables for API keys

**Key Classes**:

**ModelConfig (Pydantic model)**:
- model_name: Client-facing alias
- litellm_model: LiteLLM provider/model format
- api_key_var: Environment variable reference (validated format)
- Optional overrides: timeout, num_retries, temperature, max_tokens
- Validation: API key format, environment variable existence warnings

**Config class**:
- models: Dict[str, ModelConfig] - O(1) model lookups
- reload(): Load/reload configuration from file
- get_model(name): Retrieve ModelConfig by alias
- list_models(): Return all configured model names

**Features**:

- Early validation with clear error messages (Pydantic)
- Configuration reload support without restart
- Environment variable validation at startup
- Backward compatibility with MODEL_MAP global

### Database Module (database.py)

**Responsibilities**:

- Async SQLite operations using aiosqlite
- Schema initialization and migration
- Request/response logging with full JSON
- Query execution for statistics and history
- Cost calculation using LiteLLM

**Key Class**:

**Database class**:
- path: SQLite database file path
- _get_connection(): Async context manager for connections
- init(): Create schema and indexes
- log_request(): Insert request with async I/O
- get_stats(): Query aggregated statistics
- get_daily_stats(): Query daily breakdowns
- get_requests(): Fetch request history

**Features**:

- Non-blocking async operations (aiosqlite)
- Context managers for connection handling
- Automatic cost calculation via litellm.completion_cost()
- API key redaction before storage (sk-redacted)
- Full request/response JSON storage for audit trail

**Performance**:

- Async operations prevent event loop blocking
- Connection pooling via context managers
- Indexed queries for dashboard performance
- Typical operation time: 1-5ms (non-blocking)

### LLM Module (llm.py)

**Responsibilities**:

- Infer provider from model name patterns
- Provider-specific logic and routing hints

**Key Functions**:

**infer_provider_from_model(model_name: str) -> str**:
- Pattern matching: gpt-*/o1-* → openai, claude* → anthropic, etc.
- Handles prefixed models (openai/gpt-4) by extracting prefix
- Returns "unknown" for unrecognized patterns

**Provider Patterns**:
- OpenAI: gpt-*, o1-*, chatgpt-*
- Anthropic: claude*
- Google: gemini*
- Mistral: mistral*
- Meta: llama*

### Errors Module (errors.py)

**Responsibilities**:

- Build OpenAI-compatible error responses
- Map exceptions to HTTP status codes
- Format error messages for client compatibility

**Key Function**:

**build_error_response(error, status_code) -> dict**:
- Extracts error message from exception
- Determines error type and code from exception class
- Returns standard OpenAI error format: {"error": {"message", "type", "code"}}

### Utils Module (utils.py)

**Responsibilities**:

- Timezone conversion for date filtering
- Local date to UTC timestamp range conversion

**Key Function**:

**convert_local_date_to_utc_range(date_str, timezone_offset) -> tuple**:
- Converts local date (YYYY-MM-DD) to UTC timestamp range
- Handles timezone offsets from browser
- Returns (start_timestamp, end_timestamp) for SQL queries

### LiteLLM SDK Integration

**Purpose**: Abstract away provider-specific API differences

**How it works**:

1. Accept model in format `provider/model-name` (e.g., `openai/gpt-4.1-mini`)
2. Route request to appropriate provider SDK
3. Normalize response to OpenAI format
4. Calculate costs using built-in pricing database

**Benefits**:

- Single interface for multiple providers
- Automatic cost calculation via litellm.completion_cost()
- Consistent response format
- Streaming responses supported

**Usage in Apantli**:

- Called from server.py request handlers
- Cost calculation handled by Database module
- Provider inference done by LLM module for logging

### Database Schema

**File**: `requests.db` (SQLite 3, created automatically)

**Table**: `requests` - stores all LLM requests, responses, costs, and errors

For complete schema details, indexes, maintenance procedures, and troubleshooting, see [DATABASE.md](DATABASE.md).

### Web Dashboard

**Technology**: Vanilla JavaScript with server-side HTML rendering

**Architecture**:

- Single HTML page returned by `GET /`
- Four tabs: Stats, Calendar, Models, Requests
- Auto-refresh every 5 seconds for Stats tab
- On-demand loading for Calendar, Models, and Requests tabs
- Date range filtering with quick buttons and custom date pickers
- Request filtering with search, provider/model selectors, and cost range
- Summary statistics for filtered results

**Key Functions**:

| Function | Purpose |
|:---------|:--------|
| `showTab(e, tab)` | Switch between Stats/Models/Requests views |
| `refresh()` | Fetch and render statistics with time filtering |
| `loadModels()` | Fetch and display configured models with pricing |
| `loadRequests()` | Fetch last 50 requests and render expandable table |
| `toggleDetail(id)` | Show/hide full JSON for a request row |
| `escapeHtml(text)` | Prevent XSS by escaping user-supplied content |

**Security**:

- Uses `escapeHtml()` for all dynamic content
- Constructs DOM elements via `createElement()` instead of `innerHTML` for event handlers
- No external JavaScript dependencies (no CDN risk)

## Technical Decisions

### Why SQLite?

**Rationale**: Lightweight, serverless, file-based database ideal for local proxies

**Alternatives considered**:

- Postgres: Too heavy, requires separate server process
- JSON files: No query capabilities, slow for aggregations
- In-memory: Data loss on restart

**Trade-offs**:

- Pro: Zero configuration, single file, excellent for reads
- Con: Not suitable for high concurrency (but proxy is single-user)

### Why LiteLLM SDK?

**Rationale**: Mature library for multi-provider LLM routing with built-in cost tracking

**Alternatives considered**:

- Direct provider SDKs: Duplicate code for each provider
- Manual API calls: Would need to reimplement cost calculation

**Trade-offs**:

- Pro: Multi-provider support, cost calculation, active maintenance
- Con: Additional dependency, abstracts away provider-specific features

### Why FastAPI?

**Rationale**: Modern async framework with automatic OpenAPI documentation

**Alternatives considered**:

- Flask: Synchronous (poor for I/O-bound LLM calls)
- aiohttp: Lower-level, more boilerplate

**Trade-offs**:

- Pro: Async support, type hints, auto-generated docs
- Con: Slightly heavier than minimal frameworks

### Why Embedded Dashboard?

**Rationale**: Single-file deployment, no build step, works offline

**Alternatives considered**:

- React/Vue SPA: Requires build process, heavier dependencies
- Separate static files: More complex deployment

**Trade-offs**:

- Pro: Simple deployment, no build tools, works immediately
- Con: Harder to test JavaScript, no component reuse

## Error Handling

Apantli implements comprehensive error handling with configurable timeouts, automatic retries, and OpenAI-compatible error responses. For detailed design decisions and implementation details, see [ERROR_HANDLING.md](ERROR_HANDLING.md).

### Configuration

Error handling behavior is controlled by CLI arguments and per-model configuration:

**Global defaults** (via CLI):
- `--timeout 120` - Request timeout in seconds (default: 120)
- `--retries 3` - Number of retry attempts for transient errors (default: 3)

**Per-model overrides** (in config.yaml):
```yaml
litellm_params:
  timeout: 60        # Override global timeout
  num_retries: 5     # Override global retries
```

### Timeout Strategy

Default timeout of 120 seconds balances patience for slow providers with interactive usability. Per-model configuration allows tuning for specific model characteristics (fast models get lower timeout, slow models get higher timeout).

### Retry Strategy

Automatic retries for transient errors with exponential backoff (handled by LiteLLM):

**Retry-eligible errors**:
- Rate limit errors (429)
- Internal server errors (500)
- Service unavailable (503)
- Timeout errors (504)
- API connection errors (502)

**Non-retryable errors**:
- Authentication errors (401)
- Permission denied (403)
- Not found (404)

### HTTP Status Code Mapping

| LiteLLM Exception | HTTP Status | Retry? | Use Case |
|:------------------|:------------|:-------|:---------|
| RateLimitError | 429 | Yes | Provider quota exceeded |
| AuthenticationError | 401 | No | Invalid API key |
| PermissionDeniedError | 403 | No | API key lacks permission |
| NotFoundError | 404 | No | Model not found |
| InternalServerError | 503 | Yes | Provider internal error |
| ServiceUnavailableError | 503 | Yes | Provider overloaded (Anthropic 529) |
| Timeout | 504 | Yes | Request exceeded timeout |
| APIConnectionError | 502 | Yes | Network connectivity issue |
| Other/Unknown | 500 | No | Unhandled error |

### Error Response Format

All errors return OpenAI-compatible JSON format:

```json
{
  "error": {
    "message": "Human-readable error message",
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded"
  }
}
```

This ensures compatibility with OpenAI SDK and other clients expecting this format.

### Streaming Error Handling

Streaming requests receive errors via Server-Sent Events:

```
data: {"error": {"message": "...", "type": "...", "code": "..."}}\n\n
data: [DONE]\n\n
```

**Socket error deduplication**: Client disconnections (socket errors) are logged once per request, not per chunk, to avoid log spam.

### Request Errors

```
Try:
  Call LiteLLM completion()
Except RateLimitError:
  - Return HTTP 429 with error detail
  - Log to database with error context
Except AuthenticationError:
  - Return HTTP 401
  - Log to database
Except Timeout:
  - Return HTTP 504
  - Log to database
Except Exception:
  - Return HTTP 500 with error detail
  - Log to database (error column populated)
  - Calculate duration (still tracked)
```

All errors are logged to database for monitoring and debugging.

### Database Errors

Intentionally minimal handling:

- Database operations not wrapped in try/except
- Failures will crash the request (desired behavior)
- Ensures data consistency (fail-fast rather than silent corruption)

### Configuration Errors

```
Try:
  Load config.yaml
Except:
  - Print warning to stdout
  - Continue with empty MODEL_MAP
  - Require clients to use full provider/model format
```

Allows server to start even with missing/invalid config.

## Performance Characteristics

### Request Latency

```
Total latency = FastAPI overhead + Config lookup + LiteLLM overhead + Provider API latency + Async DB write

Breakdown:
- FastAPI: ~1-5ms (negligible)
- Config lookup: <1ms (dictionary O(1) lookup)
- LiteLLM: ~10-50ms (SDK overhead)
- Provider API: 200-2000ms (dominant factor)
- Async DB write: ~1-5ms (non-blocking)
```

Database writes are non-blocking async operations using aiosqlite, allowing the event loop to handle other requests during I/O.

### Memory Usage

Baseline: ~50-100 MB (Python + FastAPI + LiteLLM + aiosqlite)

Per-request overhead: Request and response JSON stored in memory briefly during processing. For typical requests (~1-5 KB), memory impact is minimal.

Database size: Grows ~2-10 KB per request depending on message length. 10,000 requests ≈ 20-100 MB.

### Concurrency

**Async Architecture**:
- FastAPI async handlers allow concurrent request processing
- aiosqlite enables non-blocking database operations
- Event loop not blocked during I/O operations
- Multiple requests can be in-flight simultaneously

**SQLite Constraints**:
- SQLite uses file-level locking (one write at a time)
- Reads can happen concurrently with other reads
- For single-user local proxy, not a bottleneck
- For multi-user high-concurrency scenarios, consider external database

**Practical Performance**:
- Single-user typical load: 1-10 requests/minute
- Database operations complete in <5ms
- No observed performance issues in normal usage

## Security Considerations

**Apantli provides no authentication or authorization.** It is designed for local use only on a trusted machine.

**Network exposure**: By default, the server binds to `0.0.0.0:4000` (all network interfaces). Anyone who can reach this port can:
- Send requests to any configured LLM model (using your API keys)
- Access the web dashboard and view all conversation history
- Read all stored requests and responses

For localhost-only access, use `apantli --host 127.0.0.1`. For network exposure, implement authentication (see Future Considerations below).

**API keys**: Stored in `.env` file (gitignored), resolved at request time, redacted before database logging (stored as `sk-redacted`), never returned in responses.

**Database**: `requests.db` contains full conversation history. Protect with appropriate file permissions. See [DATABASE.md](DATABASE.md#security-considerations) for details.

## Implemented Features

### Streaming Support

Streaming responses are fully implemented (server.py:244-288):

1. `/v1/chat/completions` handles `stream=true` parameter
2. Returns FastAPI `StreamingResponse` with Server-Sent Events
3. Accumulates chunks for post-stream database logging
4. Complete request/response logged after stream finishes

**Implementation Details**:
- Uses async generator to yield SSE-formatted chunks (line 258)
- Buffers all chunks to reconstruct complete response
- Accumulates content from delta fields (lines 265-270)
- Captures usage data from final chunk (line 276)
- Calculates cost and tokens after streaming completes
- Logs to database with full conversation history (line 284)

## Project Structure

```
apantli/
├── apantli/                    # Python package (modular architecture)
│   ├── __init__.py            # Package metadata
│   ├── __main__.py            # CLI entry point
│   ├── server.py              # FastAPI application (903 lines)
│   ├── config.py              # Configuration management (207 lines)
│   ├── database.py            # Async database operations (124 lines)
│   ├── llm.py                 # Provider inference (27 lines)
│   ├── errors.py              # Error formatting (22 lines)
│   ├── utils.py               # Timezone utilities (23 lines)
│   └── static/                # Static files for dashboard
│       ├── alpine.min.js      # Alpine.js framework (44KB, self-hosted)
│       └── alpine-persist.min.js  # Alpine.js persistence plugin
├── templates/                 # Jinja2 templates
│   └── dashboard.html         # Web dashboard UI
├── tests/                     # Test suite (unit + integration)
│   ├── conftest.py            # Shared pytest fixtures
│   ├── test_config.py         # Configuration tests
│   ├── test_database.py       # Database tests
│   ├── test_llm.py            # LLM module tests
│   ├── test_errors.py         # Error formatting tests
│   ├── test_utils.py          # Utility tests
│   ├── integration/
│   │   ├── test_proxy.py      # End-to-end tests
│   │   └── test_error_handling.py  # Error handling tests
│   └── README.md              # Test documentation
├── docs/                      # Documentation
│   ├── README.md              # Documentation index
│   ├── ARCHITECTURE.md        # System design
│   ├── CONFIGURATION.md       # Setup guide
│   ├── DATABASE.md            # Database schema & maintenance
│   ├── API.md                 # Endpoint reference
│   ├── ERROR_HANDLING.md      # Error handling design & implementation
│   ├── TESTING.md             # Test suite and validation procedures
│   ├── TROUBLESHOOTING.md     # Common issues
│   └── archive/               # Historical documents
├── config.yaml                # Model configuration
├── .env.example               # Example environment file
├── .env                       # API keys (gitignored)
├── requests.db                # SQLite database (gitignored)
├── pyproject.toml             # Package metadata
├── requirements.txt           # Production dependencies
├── requirements-dev.txt       # Development dependencies (pytest, etc.)
└── utils/                     # Utility scripts
    ├── README.md              # Utilities documentation
    ├── generate_llm_config.py # Generate llm CLI config from config.yaml
    └── recalculate_costs.py   # Recalculate costs for requests with missing pricing
```

## Development

### Running in Development Mode

```bash
apantli --reload
```

Auto-reloads server when Python files change (does not watch `config.yaml` or `.env`).

### Running Tests

**Unit Tests** (fast, no server required):

```bash
# Install development dependencies
pip install -r requirements-dev.txt

# Run all unit tests
pytest tests/ -v

# Run specific module tests
pytest tests/test_config.py -v
pytest tests/test_database.py -v
```

**Integration Tests** (require running server):

```bash
# Start server in one terminal
apantli

# Run integration tests in another terminal
python3 tests/integration/test_proxy.py              # Basic functionality
python3 tests/integration/test_error_handling.py     # Error scenarios
```

**Test Coverage**:

- 60 total test cases across all modules
- Unit tests: Config, Database, LLM, Errors, Utils
- Integration tests: End-to-end proxy functionality, error handling
- Fast unit tests (<1 second) with no API key requirements

For complete testing procedures, manual test scenarios, and validation strategies, see [TESTING.md](TESTING.md).

### Package Installation

**Prerequisites**: Python 3.13 or higher

**With uv (recommended)**:

```bash
uv sync
```

**With pip**:

```bash
python3.13 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

**Note**: The `netifaces` dependency is used to display all available network addresses on startup. If installation fails on your system, the server will fall back to basic hostname lookup.

### Utility Scripts

The `utils/` directory contains helper scripts for managing Apantli:

**generate_llm_config.py** - Configure `llm` CLI to use Apantli:
- Reads `config.yaml` and generates `extra-openai-models.yaml` for the `llm` CLI tool
- Auto-detects OS (macOS/Linux/Windows) for correct config path
- Outputs to stdout (default) or writes directly with `--write` flag
- Enables using Claude, GPT, and other models through `llm` via Apantli proxy

```bash
python3 utils/generate_llm_config.py --write
export OPENAI_BASE_URL=http://localhost:4000/v1
llm -m claude-haiku-3.5 "Tell me a joke"
```

**recalculate_costs.py** - Fix missing costs in database:
- Finds requests with `cost = 0` or `NULL`
- Maps model aliases to full LiteLLM format (e.g., `claude-haiku-3.5` → `anthropic/claude-3-5-haiku-20241022`)
- Uses LiteLLM pricing database to recalculate
- Supports `--dry-run` to preview changes

```bash
python3 utils/recalculate_costs.py --dry-run  # Preview
python3 utils/recalculate_costs.py            # Update
```

See [utils/README.md](../utils/README.md) for detailed documentation.

## Future Considerations

### Authentication

For network exposure, add:

1. API key authentication for `/v1/chat/completions`
2. Basic auth for dashboard
3. Store credentials in `.env` or separate config file

### Cost Alerts

Database already tracks costs. Add:

1. Threshold configuration (e.g., `$10/day`)
2. Background task to check costs periodically
3. Email/webhook notification when exceeded

### Request Filtering

Add filtering to `/requests` endpoint:

- By model
- By date range
- By cost threshold
- Full-text search in messages

### Export Functionality

Add endpoints to export data:

- CSV export of all requests
- JSON dump of specific date range
- Cost summary reports
