# Personal LLM Router - Session Summary

## What We Built
Lightweight local LLM proxy with SQLite cost tracking - alternative to LiteLLM's heavy Postgres/Docker setup.

## Current State
- ✅ Working proxy on port 4000
- ✅ Routes to OpenAI, Anthropic via LiteLLM SDK
- ✅ SQLite database (`requests.db`) logging all requests/responses
- ✅ Web dashboard with 3 tabs:
  - **Stats**: Usage/cost with time filtering (all time, 1h, 24h, week, 30d)
  - **Models**: Lists configured models with pricing
  - **Requests**: Last 50 requests - click rows to expand full JSON
- ✅ Config in `config.yaml`, API keys in `.env`
- ✅ uv project setup

## How to Run
```bash
uv run python3 proxy.py
```

Dashboard: http://localhost:4000/

## Key Files
- `proxy.py` - Main server (FastAPI + LiteLLM SDK)
- `config.yaml` - Model definitions
- `.env` - API keys (gitignored)
- `requests.db` - SQLite database (gitignored)

## Recent Fixes
- Provider detection extracts from model format (e.g., `openai/gpt-4`)
- Request viewer uses DOM createElement (not innerHTML) for proper event binding
- Toggle logic handles initial empty display state
- Removed `.request-detail { display: none }` CSS that was hiding expanded rows

## Known Issues
None currently - everything working

## Next Steps (if user wants)
- Add export functionality for requests data
- Add filtering/search in requests tab
- Add cost alerts/budgets
- Add streaming support
