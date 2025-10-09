# Architecture

System design and technical implementation details for Apantli.

## Overview

Apantli is a FastAPI-based HTTP proxy that intercepts OpenAI-compatible API requests, routes them through LiteLLM to various providers, and logs all activity to a local SQLite database. The system operates entirely locally with no cloud dependencies beyond the LLM provider APIs themselves.

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Apantli Server                           │
│                                                                 │
│  ┌────────────────────┐      ┌──────────────────────────────┐   │
│  │  FastAPI           │      │  Lifespan Manager            │   │
│  │  Application       │◄─────┤  - load_config()             │   │
│  │                    │      │  - init_db()                 │   │
│  └─────────┬──────────┘      └──────────────────────────────┘   │
│            │                                                    │
│            │ HTTP Routes                                        │
│            ↓                                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  API Endpoints                                          │    │
│  │  - POST /v1/chat/completions (primary)                  │    │
│  │  - GET  /stats (usage statistics)                       │    │
│  │  - GET  /models (available models)                      │    │
│  │  - GET  /requests (recent activity)                     │    │
│  │  - GET  / (dashboard HTML)                              │    │
│  └─────────┬───────────────────────────────────────────────┘    │
│            │                                                    │
│            ↓                                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Request Processing Pipeline                            │    │
│  │  1. Parse incoming JSON                                 │    │
│  │  2. Look up model in MODEL_MAP                          │    │
│  │  3. Resolve API key from environment                    │    │
│  │  4. Call LiteLLM completion()                           │    │
│  │  5. Extract provider from response                      │    │
│  │  6. Calculate cost and duration                         │    │
│  │  7. Log to database                                     │    │
│  │  8. Return response to client                           │    │
│  └─────────┬───────────────────────────────────────────────┘    │
│            │                                                    │
│            ↓                                                    │
│  ┌─────────────────────┐      ┌─────────────────────────┐       │
│  │  LiteLLM SDK        │      │  Database Logger        │       │
│  │  - Provider routing │      │  - log_request()        │       │
│  │  - Cost calculation │      │  - SQLite operations    │       │
│  │  - Response parsing │      │  - JSON serialization   │       │
│  └─────────┬───────────┘      └───────────┬─────────────┘       │
│            │                              │                     │
└────────────┼──────────────────────────────┼─────────────────────┘
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
│  │ 1. Model Lookup                                             │    │
│  │    MODEL_MAP["gpt-4.1-mini"] →                              │    │
│  │    { "model": "openai/gpt-4.1-mini",                        │    │
│  │      "api_key": "os.environ/OPENAI_API_KEY" }               │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                ↓                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 2. API Key Resolution                                       │    │
│  │    os.environ["OPENAI_API_KEY"] → "sk-..."                  │    │
│  └─────────────────────────────┬───────────────────────────────┘    │
│                                ↓                                    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 3. LiteLLM Call                                             │    │
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
│  │ 4. Cost Calculation                                     │   │  │
│  │    litellm.completion_cost(response) → 0.0015           │   │  │
│  └─────────────────────────────┬───────────────────────────┘   │  │
│                                ↓                               │  │
│  ┌─────────────────────────────────────────────────────────┐   │  │
│  │ 5. Database Logging                                     │   │  │
│  │    INSERT INTO requests (timestamp, model, provider,    │◄──┼──┘
│  │                          tokens, cost, duration_ms,     │   │
│  │                          request_data, response_data)   │   │
│  └─────────────────────────────┬───────────────────────────┘   │
│                                ↓                               │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 6. Return Response                                      │   │
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

### FastAPI Application

**File**: `apantli/server.py`

**Responsibilities**:

- HTTP request handling
- Route management
- Application lifecycle (startup/shutdown)
- Error handling and logging

**Key Features**:

- Async request handling via FastAPI
- Lifespan context manager for initialization
- OpenAI-compatible endpoints
- Static HTML dashboard serving

### LiteLLM Integration

**Purpose**: Abstract away provider-specific API differences

**How it works**:

1. Accept model in format `provider/model-name` (e.g., `openai/gpt-4.1-mini`)
2. Route request to appropriate provider SDK
3. Normalize response to OpenAI format
4. Calculate costs using built-in pricing database

**Benefits**:

- Single interface for multiple providers
- Automatic cost calculation
- Consistent response format
- Streaming responses supported

### Configuration System

**File**: `config.yaml`

**Structure**:

```yaml
model_list:
  - model_name: gpt-4.1-mini           # Alias used by clients
    litellm_params:
      model: openai/gpt-4.1-mini       # LiteLLM model identifier
      api_key: os.environ/OPENAI_API_KEY  # Environment variable reference
```

**Loading Process**:

1. Read `config.yaml` on startup (via lifespan manager)
2. Parse YAML to dictionary
3. Build `MODEL_MAP` for O(1) lookups
4. Store as global state in server module

**API Key Resolution**:

- Format: `os.environ/VARIABLE_NAME`
- Parsed at request time (not startup) to support dynamic updates
- Falls back to empty string if environment variable missing

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
Total latency = FastAPI overhead + LiteLLM overhead + Provider API latency + SQLite write

Breakdown:
- FastAPI: ~1-5ms (negligible)
- LiteLLM: ~10-50ms (SDK overhead)
- Provider API: 200-2000ms (dominant factor)
- SQLite write: ~1-5ms (negligible)
```

SQLite writes are non-blocking due to async FastAPI handlers.

### Memory Usage

Baseline: ~50-100 MB (Python + FastAPI + LiteLLM)

Per-request overhead: Request and response JSON stored in memory briefly, then written to database. For typical requests (~1-5 KB), memory impact is minimal.

Database size: Grows ~2-10 KB per request depending on message length. 10,000 requests ≈ 20-100 MB.

### Concurrency

FastAPI uses async handlers, allowing concurrent request processing. However:

- SQLite uses file-level locking (only one write at a time)
- For single-user local proxy, this is not a bottleneck
- For multi-user scenarios, consider external database

## Security Considerations

**Apantli provides no authentication or authorization.** It is designed for local use only on a trusted machine.

**Network exposure**: By default, the server binds to `0.0.0.0:4000` (all network interfaces). Anyone who can reach this port can:
- Send requests to any configured LLM model (using your API keys)
- Access the web dashboard and view all conversation history
- Read all stored requests and responses

For localhost-only access, use `apantli --host 127.0.0.1`. For network exposure, implement authentication (see Future Considerations below).

**API keys**: Stored in `.env` file (gitignored), resolved at request time, never logged to database or returned in responses.

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
├── apantli/                    # Python package
│   ├── __init__.py            # Package metadata
│   ├── __main__.py            # CLI entry point
│   ├── server.py              # FastAPI application
│   └── static/                # Static files for dashboard
│       ├── alpine.min.js      # Alpine.js framework (44KB, self-hosted)
│       └── alpine-persist.min.js  # Alpine.js persistence plugin
├── templates/                 # Jinja2 templates
│   └── dashboard.html         # Web dashboard UI
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
├── requirements.txt           # Dependencies
├── test_proxy.py              # Basic functionality test
├── test_error_handling.py     # Comprehensive error handling test suite
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

```bash
# Start server
apantli

# In another terminal, run test scripts
python3 test_proxy.py              # Basic functionality tests
python3 test_error_handling.py     # Comprehensive error handling tests
```

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
