# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apantli is a lightweight local LLM proxy server that routes requests to multiple providers (OpenAI, Anthropic, etc.) through a unified OpenAI-compatible API while tracking costs in SQLite. It's designed as a lighter alternative to LiteLLM's proxy, running entirely locally without requiring Postgres or Docker.

## Core Architecture

### Request Flow

Client → FastAPI (`/v1/chat/completions`) → Model lookup in `MODEL_MAP` → API key resolution from `.env` → LiteLLM SDK routing → Provider API → Response + cost calculation → SQLite logging → Client

### Key Components

- **apantli/server.py**: Single-file FastAPI application containing all server logic (routes, database, LiteLLM integration, dashboard HTML)
- **config.yaml**: Model configuration with provider mappings and API key references
- **.env**: API keys (gitignored, never committed)
- **requests.db**: SQLite database with full request/response logging and cost tracking

### Model Configuration System

Models are aliased in `config.yaml` and stored in `MODEL_MAP` dictionary:

```yaml
model_name: gpt-4.1-mini              # Client-facing alias
litellm_params:
  model: openai/gpt-4.1-mini          # LiteLLM format: provider/model
  api_key: os.environ/OPENAI_API_KEY  # Environment variable reference
```

API keys use format `os.environ/VARIABLE_NAME` and are resolved at request time from environment variables.

## Development Commands

### Running the Server

```bash
# Standard run
apantli

# Development with auto-reload (watches Python files only, not config.yaml or .env)
apantli --reload

# Custom port
apantli --port 8080

# With custom config file
apantli --config path/to/config.yaml
```

### Testing

```bash
# Start server first
apantli

# Run test script (in another terminal)
python3 test_proxy.py
```

Test script verifies:

- OpenAI model routing
- Anthropic model routing
- Stats endpoint
- Cost tracking

### Database Operations

```bash
# View recent requests
sqlite3 requests.db "SELECT timestamp, model, cost FROM requests ORDER BY timestamp DESC LIMIT 10"

# Calculate total costs
sqlite3 requests.db "SELECT SUM(cost) FROM requests"

# View errors
sqlite3 requests.db "SELECT timestamp, model, error FROM requests WHERE error IS NOT NULL"
```

## Common Development Tasks

### Adding a New Provider

1. Add API key to `.env`:
   ```bash
   NEW_PROVIDER_API_KEY=your-key-here
   ```

2. Add model to `config.yaml`:
   ```yaml
   - model_name: new-model-alias
     litellm_params:
       model: provider/model-name
       api_key: os.environ/NEW_PROVIDER_API_KEY
   ```

3. Restart server to reload config

### Modifying API Endpoints

All endpoints are in `apantli/server.py`:

- `/v1/chat/completions` - Main proxy endpoint (OpenAI compatible)
- `/stats` - Usage statistics with optional `?hours=N` parameter
- `/models` - List available models with pricing
- `/requests` - Last 50 requests with full JSON
- `/errors` - DELETE to clear error records
- `/` - Dashboard HTML (embedded in server.py)

### Dashboard Modifications

Dashboard is embedded HTML in `server.py` returned by `GET /` endpoint. Uses vanilla JavaScript with three tabs (Stats, Models, Requests). Auto-refreshes every 5 seconds for Stats tab.

## Database Schema

**Table: requests**

| Column | Type | Notes |
|--------|------|-------|
| timestamp | TEXT | ISO 8601 UTC timestamp |
| model | TEXT | Client-requested model name |
| provider | TEXT | Actual provider (openai, anthropic, etc.) |
| prompt_tokens | INTEGER | Input tokens |
| completion_tokens | INTEGER | Output tokens |
| total_tokens | INTEGER | Sum of input + output |
| cost | REAL | USD cost from LiteLLM's pricing database |
| duration_ms | INTEGER | Request duration |
| request_data | TEXT | Full request JSON serialized |
| response_data | TEXT | Full response JSON serialized |
| error | TEXT | NULL on success, error message on failure |

## LiteLLM Integration

The project uses LiteLLM SDK for:

- Multi-provider routing (single interface for OpenAI, Anthropic, etc.)
- Automatic cost calculation via `litellm.completion_cost()`
- Response normalization to OpenAI format
- Streaming support (currently implemented for real-time responses)

LiteLLM model format: `provider/model-name` (e.g., `openai/gpt-4.1-mini`, `anthropic/claude-sonnet-4-20250514`)

## Configuration Notes

### Environment Variables

`.env` file contains API keys referenced in `config.yaml`. Never logged or exposed in API responses.

### Server Startup

Uses FastAPI lifespan context manager:

1. Load `config.yaml` → populate `MODEL_MAP`
2. Initialize SQLite database (create table if missing)
3. Print server URL and available network interfaces
4. Start uvicorn server

### CORS

CORS is enabled for all origins to support web clients like Obsidian Copilot.

## Error Handling

- **Request errors**: Caught, logged to database (error column populated), return HTTP 500
- **Database errors**: Intentionally not caught (fail-fast to ensure data consistency)
- **Config errors**: Print warning but continue with empty `MODEL_MAP`

## Security Considerations

- **API keys**: Never in code or database logs, only in `.env`
- **Dashboard**: No authentication (acceptable for local use only)
- **Request logging**: Full conversation history stored in `requests.db` - protect file permissions
- **Network binding**: Default is `0.0.0.0` (all interfaces) - use `--host 127.0.0.1` for localhost-only

## Performance Characteristics

Total request latency = FastAPI (1-5ms) + LiteLLM SDK (10-50ms) + Provider API (200-2000ms) + SQLite write (1-5ms)

Provider API latency dominates. SQLite writes are async-friendly and not a bottleneck for single-user scenarios.

Database growth: ~2-10 KB per request. 10,000 requests ≈ 20-100 MB.

## Package Structure

- **apantli/\_\_init\_\_.py**: Package metadata (version, name)
- **apantli/\_\_main\_\_.py**: CLI entry point that imports and calls `server.main()`
- **apantli/server.py**: All application logic (FastAPI app, routes, database, dashboard)
- **pyproject.toml**: Defines `apantli` command pointing to `apantli.server:main`

Entry point: `apantli` command runs `uvicorn` with the FastAPI app from `server.py`.

## Dependencies

Managed via `uv` (fast Python package installer):

- **fastapi**: Web framework
- **uvicorn**: ASGI server
- **litellm**: Multi-provider LLM routing and cost calculation
- **pyyaml**: Config file parsing
- **python-dotenv**: Environment variable loading
- **netifaces**: Network interface discovery for startup messages

Install: `uv sync`

## Testing Strategy

`test_proxy.py` makes actual API calls to verify:

- OpenAI provider routing works
- Anthropic provider routing works
- Stats are correctly aggregated
- Costs are calculated and stored

Requires server to be running and valid API keys in `.env`.
