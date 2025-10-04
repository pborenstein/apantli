# Personal LLM Router

Lightweight local proxy for routing LLM requests with SQLite cost tracking.

## Features

- Local proxy server (no cloud dependencies)
- Routes to multiple LLM providers (OpenAI, Anthropic, etc.) via LiteLLM SDK
- SQLite-based request and cost tracking
- Simple web dashboard for usage stats
- OpenAI-compatible API

## Setup

```bash
uv sync
```

Create `.env` with your API keys:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

Configure models in `config.yaml`:

```yaml
model_list:
  - model_name: gpt-4.1-mini
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: os.environ/OPENAI_API_KEY

  - model_name: claude-haiku-3.5
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY
```

## Usage

Start the proxy:

```bash
uv run python3 proxy.py
```

Make requests:

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

View stats:

- Dashboard: http://localhost:4000/
- JSON API: http://localhost:4000/stats

## Database

All requests are logged to `requests.db` (SQLite) with:

- Timestamps
- Model and provider
- Token counts (prompt, completion, total)
- Costs (calculated via LiteLLM)
- Request/response data
- Errors

## Compatibility

Works with any tool that speaks OpenAI's API format. Point your client at `http://localhost:4000` and use model names from `config.yaml`.
