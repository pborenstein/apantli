# CLAUDE.md

AI-specific context for Claude Code when working with this repository.

## Project Overview

Apantli is a lightweight local LLM proxy that routes requests to multiple providers through an OpenAI-compatible API while tracking costs in SQLite. Single-file FastAPI server (apantli/server.py) with minimal dependencies.

## Core Architecture

**Request Flow**: Client → FastAPI → Model lookup (`MODEL_MAP`) → API key resolution (`.env`) → LiteLLM SDK → Provider → Response + cost calc → SQLite log → Client

**Key Files**:
- `apantli/server.py` - Single-file FastAPI app (all logic here)
- `config.yaml` - Model definitions, API key refs
- `.env` - API keys (gitignored)
- `requests.db` - SQLite (full request/response logs + costs)
- `templates/dashboard.html` - Web UI (Alpine.js + vanilla JS)

## Implementation Details

**Model Config**: Aliases in `config.yaml` loaded into `MODEL_MAP` dict. API keys referenced as `os.environ/VAR_NAME`, resolved at request time. All `litellm_params` (except `model` and `api_key` which are specially handled) passed through to LiteLLM SDK for per-model configuration.

**LiteLLM Integration**: Single SDK for multi-provider routing, automatic cost calculation via `litellm.completion_cost()`, OpenAI format normalization, streaming support.

**Provider Inference**: When provider not prefixed in model name, inferred via pattern matching: `gpt-*`/`o1-*` → openai, `claude*` → anthropic, `gemini*` → google, `mistral*` → mistral, `llama*` → meta.

**Database**: See DATABASE.md for full schema. Indexes on `timestamp`, `DATE(timestamp)+provider`, `cost` for dashboard query performance.

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

**Testing**: Two test scripts in project root:
- `test_proxy.py` - Basic functionality tests
- `test_error_handling.py` - Comprehensive error handling suite (authentication, model not found, streaming, disconnect, error format validation)
See TESTING.md for manual test procedures and validation strategies.

**Security**: API keys only in `.env`, redacted in logs (stored as `sk-redacted`). Dashboard unauthenticated (local use only). Database contains full conversation history - protect file permissions. Default `0.0.0.0` binding - use `--host 127.0.0.1` for localhost-only.

## API Endpoints

All in `apantli/server.py`. See API.md for full reference.

Primary: `/v1/chat/completions`, `/chat/completions` (POST) - OpenAI-compatible proxy (streaming supported)
Health: `/health` (GET) - Returns `{"status": "ok"}`
Stats: `/stats` (GET, includes performance metrics), `/stats/daily`, `/stats/date-range`
Data: `/models`, `/requests` (GET), `/errors` (DELETE)
UI: `/` (GET) - Dashboard, `/static/*` - Alpine.js libs
