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

## API Endpoints

All endpoints are in `apantli/server.py`:

- `/v1/chat/completions` - Main proxy endpoint (OpenAI compatible)
- `/stats` - Usage statistics with optional `?hours=N` parameter
- `/models` - List available models with pricing
- `/requests` - Last 50 requests with full JSON
- `/errors` - DELETE to clear error records
- `/` - Dashboard HTML (from templates/dashboard.html)

## Dashboard

Served via Jinja2 templates from `templates/dashboard.html`. Uses vanilla JavaScript with three tabs (Stats, Models, Requests). Auto-refreshes every 5 seconds for Stats tab.

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

`.env` file contains API keys referenced in `config.yaml`. Never logged or exposed in API responses. CORS is enabled for all origins to support web clients.

## Error Handling

- **Request errors**: Caught, logged to database (error column populated), return HTTP 500
- **Database errors**: Intentionally not caught (fail-fast to ensure data consistency)
- **Config errors**: Print warning but continue with empty `MODEL_MAP`

## Security Considerations

- **API keys**: Never in code or database logs, only in `.env`
- **Dashboard**: No authentication (acceptable for local use only)
- **Request logging**: Full conversation history stored in `requests.db` - protect file permissions
- **Network binding**: Default is `0.0.0.0` (all interfaces) - use `--host 127.0.0.1` for localhost-only
