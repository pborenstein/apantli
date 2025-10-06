# Architecture

System design and technical implementation details for Apantli.

## Overview

Apantli is a FastAPI-based HTTP proxy that intercepts OpenAI-compatible API requests, routes them through LiteLLM to various providers, and logs all activity to a local SQLite database. The system operates entirely locally with no cloud dependencies beyond the LLM provider APIs themselves.

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Apantli Server                           │
│                                                                 │
│  ┌────────────────────┐      ┌──────────────────────────────┐  │
│  │  FastAPI           │      │  Lifespan Manager            │  │
│  │  Application       │◄─────┤  - load_config()             │  │
│  │                    │      │  - init_db()                 │  │
│  └─────────┬──────────┘      └──────────────────────────────┘  │
│            │                                                    │
│            │ HTTP Routes                                        │
│            ↓                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  API Endpoints                                          │   │
│  │  - POST /v1/chat/completions (primary)                  │   │
│  │  - GET  /stats (usage statistics)                       │   │
│  │  - GET  /models (available models)                      │   │
│  │  - GET  /requests (recent activity)                     │   │
│  │  - GET  / (dashboard HTML)                              │   │
│  └─────────┬───────────────────────────────────────────────┘   │
│            │                                                    │
│            ↓                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Request Processing Pipeline                            │   │
│  │  1. Parse incoming JSON                                 │   │
│  │  2. Look up model in MODEL_MAP                          │   │
│  │  3. Resolve API key from environment                    │   │
│  │  4. Call LiteLLM completion()                           │   │
│  │  5. Extract provider from response                      │   │
│  │  6. Calculate cost and duration                         │   │
│  │  7. Log to database                                     │   │
│  │  8. Return response to client                           │   │
│  └─────────┬───────────────────────────────────────────────┘   │
│            │                                                    │
│            ↓                                                    │
│  ┌─────────────────────┐      ┌─────────────────────────┐     │
│  │  LiteLLM SDK        │      │  Database Logger        │     │
│  │  - Provider routing │      │  - log_request()        │     │
│  │  - Cost calculation │      │  - SQLite operations    │     │
│  │  - Response parsing │      │  - JSON serialization   │     │
│  └─────────┬───────────┘      └──────────┬──────────────┘     │
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
1. Client Request
   ↓
   POST /v1/chat/completions
   {
     "model": "gpt-4.1-mini",
     "messages": [...]
   }
   ↓
2. Model Lookup
   ↓
   MODEL_MAP["gpt-4.1-mini"] → {
     "model": "openai/gpt-4.1-mini",
     "api_key": "os.environ/OPENAI_API_KEY"
   }
   ↓
3. API Key Resolution
   ↓
   os.environ["OPENAI_API_KEY"] → "sk-..."
   ↓
4. LiteLLM Call
   ↓
   completion(
     model="openai/gpt-4.1-mini",
     messages=[...],
     api_key="sk-..."
   )
   ↓
5. Provider Response
   ↓
   {
     "id": "chatcmpl-...",
     "choices": [...],
     "usage": {
       "prompt_tokens": 10,
       "completion_tokens": 20,
       "total_tokens": 30
     }
   }
   ↓
6. Cost Calculation
   ↓
   litellm.completion_cost(response) → 0.0015
   ↓
7. Database Logging
   ↓
   INSERT INTO requests (
     timestamp, model, provider,
     prompt_tokens, completion_tokens,
     total_tokens, cost, duration_ms,
     request_data, response_data
   )
   ↓
8. Client Response
   ↓
   Return original LiteLLM response
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
- Supports streaming (future)

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
- Three tabs: Stats, Models, Requests
- Auto-refresh every 5 seconds for Stats tab
- On-demand loading for Models and Requests tabs

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

### Request Errors

```
Try:
  Call LiteLLM completion()
Except Exception:
  - Log error to database (error column populated)
  - Calculate duration (still tracked)
  - Return HTTP 500 with error detail
```

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

### API Key Storage

API keys stored in `.env` file:

- Not committed to git (via `.gitignore`)
- Readable only by server process
- Resolved at request time from environment

Never logged to database or returned in API responses.

### Request/Response Logging

Full request and response JSON stored in database, including:

- User messages (potentially sensitive)
- Model outputs
- Metadata

**Implication**: The `requests.db` file contains all conversation history. Protect with appropriate file permissions. See [DATABASE.md](DATABASE.md#security-considerations) for details.

### Web Dashboard

Dashboard has no authentication:

- Accessible to anyone on `localhost:4000`
- Acceptable for local development
- Do not expose to network without adding authentication

### Input Validation

Minimal validation:

- Model name required (HTTP 400 if missing)
- No sanitization of messages (passed through to provider)
- Relies on LiteLLM and provider for validation

## Future Considerations

### Streaming Support

LiteLLM supports streaming responses. To add:

1. Modify `/v1/chat/completions` to handle `stream=true` parameter
2. Return FastAPI `StreamingResponse`
3. Accumulate chunks for final database logging
4. Update dashboard to show in-progress requests

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
