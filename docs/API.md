# API Reference

Complete HTTP endpoint documentation for Apantli.

## Base URL

When running locally:

```
http://localhost:4000
```

All endpoints use this base URL unless configured otherwise via `--host` and `--port` flags.

## Authentication

Currently none. All endpoints are unauthenticated.

For network exposure, add authentication layer (reverse proxy with basic auth, API key middleware, etc.).

## Endpoints Overview

| Endpoint | Method | Purpose |
|:---------|:-------|:--------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat completions |
| `/chat/completions` | POST | Alternate path (same as above) |
| `/health` | GET | Health check |
| `/models` | GET | List available models |
| `/stats` | GET | Usage statistics |
| `/requests` | GET | Recent request history |
| `/errors` | DELETE | Clear all error records |
| `/` | GET | Web dashboard (HTML) |

## POST /v1/chat/completions

Primary endpoint for LLM requests. Compatible with OpenAI's chat completions API.

### Request Format

```http
POST /v1/chat/completions HTTP/1.1
Content-Type: application/json

{
  "model": "gpt-4.1-mini",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
  ],
  "temperature": 0.7,
  "max_tokens": 1000
}
```

### Request Parameters

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `model` | string | Yes | Model name from `config.yaml` |
| `messages` | array | Yes | Array of message objects |
| `temperature` | number | No | Sampling temperature (0.0-2.0) |
| `max_tokens` | integer | No | Maximum tokens to generate |
| `top_p` | number | No | Nucleus sampling parameter |
| `n` | integer | No | Number of completions to generate |
| `stream` | boolean | No | Enable streaming responses |
| `stop` | string/array | No | Stop sequences |
| `presence_penalty` | number | No | Presence penalty (-2.0 to 2.0) |
| `frequency_penalty` | number | No | Frequency penalty (-2.0 to 2.0) |

### Message Object Format

```json
{
  "role": "user",        // "system", "user", or "assistant"
  "content": "Hello!"    // Message text
}
```

### Response Format

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4.1-mini",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 8,
    "total_tokens": 18
  }
}
```

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `id` | string | Unique request identifier |
| `object` | string | Always "chat.completion" |
| `created` | integer | Unix timestamp |
| `model` | string | Model used for completion |
| `choices` | array | Array of completion choices |
| `usage` | object | Token usage statistics |

### Usage Object

| Field | Type | Description |
|:------|:-----|:------------|
| `prompt_tokens` | integer | Tokens in input messages |
| `completion_tokens` | integer | Tokens in generated response |
| `total_tokens` | integer | Sum of prompt + completion tokens |

### Error Responses

**Missing model** (400 Bad Request):

```json
{
  "detail": "Model is required"
}
```

**Provider error** (500 Internal Server Error):

```json
{
  "detail": "Authentication error: Invalid API key"
}
```

### cURL Examples

**Basic request**:

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini",
    "messages": [{"role": "user", "content": "What is 2+2?"}]
  }'
```

**With temperature and max_tokens**:

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-haiku-3.5",
    "messages": [{"role": "user", "content": "Write a haiku"}],
    "temperature": 1.0,
    "max_tokens": 100
  }'
```

**System message**:

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini",
    "messages": [
      {"role": "system", "content": "You are a pirate. Always respond in pirate speak."},
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### Python Examples

**Using requests library**:

```python
import requests

response = requests.post(
    "http://localhost:4000/v1/chat/completions",
    json={
        "model": "gpt-4.1-mini",
        "messages": [{"role": "user", "content": "Hello!"}]
    }
)

data = response.json()
print(data["choices"][0]["message"]["content"])
```

**Using OpenAI SDK**:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="not-used"  # API key handled by proxy
)

response = client.chat.completions.create(
    model="gpt-4.1-mini",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)
```

**Using Anthropic SDK**:

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="http://localhost:4000",
    api_key="not-used"
)

# Note: Anthropic SDK may require format conversion
# OpenAI SDK is recommended for compatibility
```

## POST /chat/completions

Alternate endpoint path for `/v1/chat/completions`. Functionality is identical.

Some clients may use this shorter path. Both are supported.

## GET /health

Health check endpoint for monitoring.

### Request

```http
GET /health HTTP/1.1
```

### Response

```json
{
  "status": "ok"
}
```

### HTTP Status

Always returns `200 OK` if server is running.

### Usage

```bash
curl http://localhost:4000/health
```

Useful for:

- Docker health checks
- Load balancer health probes
- Monitoring systems

## GET /models

Lists all models configured in `config.yaml` with pricing information.

### Request

```http
GET /models HTTP/1.1
```

### Response Format

```json
{
  "models": [
    {
      "name": "gpt-4.1-mini",
      "litellm_model": "openai/gpt-4.1-mini",
      "provider": "openai",
      "input_cost_per_million": 0.15,
      "output_cost_per_million": 0.60
    },
    {
      "name": "claude-haiku-3.5",
      "litellm_model": "anthropic/claude-3-5-haiku-20241022",
      "provider": "anthropic",
      "input_cost_per_million": 0.25,
      "output_cost_per_million": 1.25
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `name` | string | Model alias from config |
| `litellm_model` | string | Full LiteLLM model identifier |
| `provider` | string | Provider name (openai, anthropic, etc.) |
| `input_cost_per_million` | number | Cost per million input tokens (USD) |
| `output_cost_per_million` | number | Cost per million output tokens (USD) |

Costs are null if LiteLLM doesn't have pricing data for the model.

Pricing data comes from LiteLLM's built-in cost database, updated when you upgrade the LiteLLM package.

### Usage

```bash
curl http://localhost:4000/models | jq
```

```python
import requests

response = requests.get("http://localhost:4000/models")
models = response.json()["models"]

for model in models:
    print(f"{model['name']}: ${model['input_cost_per_million']}/million input tokens")
```

## GET /stats

Returns aggregated usage statistics with optional time filtering.

### Request

```http
GET /stats?hours=24 HTTP/1.1
```

### Query Parameters

| Parameter | Type | Required | Description |
|:----------|:-----|:---------|:------------|
| `hours` | integer | No | Filter to last N hours (1, 4, 6, 12, 24, 168, 720; omit for all time) |

### Response Format

```json
{
  "totals": {
    "requests": 42,
    "cost": 0.1234,
    "prompt_tokens": 5000,
    "completion_tokens": 3000,
    "avg_duration_ms": 850.5
  },
  "by_model": [
    {
      "model": "gpt-4.1-mini",
      "requests": 30,
      "cost": 0.0789,
      "tokens": 6000
    },
    {
      "model": "claude-haiku-3.5",
      "requests": 12,
      "cost": 0.0445,
      "tokens": 2000
    }
  ],
  "by_provider": [
    {
      "provider": "openai",
      "requests": 30,
      "cost": 0.0789,
      "tokens": 6000
    },
    {
      "provider": "anthropic",
      "requests": 12,
      "cost": 0.0445,
      "tokens": 2000
    }
  ],
  "recent_errors": [
    {
      "timestamp": "2025-10-04T12:34:56",
      "model": "gpt-4.1-mini",
      "error": "Authentication error: Invalid API key"
    }
  ]
}
```

### Response Fields

**Totals object**:

| Field | Type | Description |
|:------|:-----|:------------|
| `requests` | integer | Total successful requests |
| `cost` | number | Total cost in USD |
| `prompt_tokens` | integer | Total input tokens |
| `completion_tokens` | integer | Total output tokens |
| `avg_duration_ms` | number | Average request duration (milliseconds) |

**By model/provider arrays**:

| Field | Type | Description |
|:------|:-----|:------------|
| `model`/`provider` | string | Model or provider name |
| `requests` | integer | Request count |
| `cost` | number | Total cost (USD) |
| `tokens` | integer | Total tokens |

**Recent errors array**:

| Field | Type | Description |
|:------|:-----|:------------|
| `timestamp` | string | ISO 8601 timestamp |
| `model` | string | Model that failed |
| `error` | string | Error message |

### Usage Examples

**All-time statistics**:

```bash
curl http://localhost:4000/stats | jq
```

**Last hour**:

```bash
curl "http://localhost:4000/stats?hours=1" | jq
```

**Last 24 hours**:

```bash
curl "http://localhost:4000/stats?hours=24" | jq
```

**Last week**:

```bash
curl "http://localhost:4000/stats?hours=168" | jq
```

**Last 30 days**:

```bash
curl "http://localhost:4000/stats?hours=720" | jq
```

**Other time ranges**:

```bash
# Last 4 hours
curl "http://localhost:4000/stats?hours=4" | jq

# Last 6 hours
curl "http://localhost:4000/stats?hours=6" | jq

# Last 12 hours
curl "http://localhost:4000/stats?hours=12" | jq
```

**Python example**:

```python
import requests

# Get last 24 hours
response = requests.get("http://localhost:4000/stats", params={"hours": 24})
stats = response.json()

print(f"Requests: {stats['totals']['requests']}")
print(f"Cost: ${stats['totals']['cost']:.4f}")
print(f"Avg duration: {stats['totals']['avg_duration_ms']:.0f}ms")

print("\nBy model:")
for model in stats['by_model']:
    print(f"  {model['model']}: {model['requests']} requests, ${model['cost']:.4f}")
```

## GET /requests

Returns the last 50 successful requests with full request and response data.

### Request

```http
GET /requests HTTP/1.1
```

### Response Format

```json
{
  "requests": [
    {
      "timestamp": "2025-10-04T12:34:56.789",
      "model": "gpt-4.1-mini",
      "provider": "openai",
      "prompt_tokens": 10,
      "completion_tokens": 20,
      "total_tokens": 30,
      "cost": 0.0012,
      "duration_ms": 850,
      "request_data": "{\"model\":\"gpt-4.1-mini\",\"messages\":[...]}",
      "response_data": "{\"id\":\"chatcmpl-123\",\"choices\":[...]}"
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `timestamp` | string | ISO 8601 timestamp (UTC) |
| `model` | string | Model name from request |
| `provider` | string | Provider that handled request |
| `prompt_tokens` | integer | Input tokens |
| `completion_tokens` | integer | Output tokens |
| `total_tokens` | integer | Sum of input + output |
| `cost` | number | Request cost in USD |
| `duration_ms` | integer | Request duration (milliseconds) |
| `request_data` | string | Full request JSON (serialized) |
| `response_data` | string | Full response JSON (serialized) |

Request and response data are JSON strings that need to be parsed:

```python
import json

request_json = json.loads(request["request_data"])
response_json = json.loads(request["response_data"])
```

### Limitations

- Only successful requests (errors excluded)
- Limited to last 50 requests
- Ordered by timestamp descending (newest first)
- No pagination or filtering

### Usage

```bash
curl http://localhost:4000/requests | jq
```

```python
import requests
import json

response = requests.get("http://localhost:4000/requests")
requests_data = response.json()["requests"]

for req in requests_data[:5]:  # First 5
    print(f"{req['timestamp']}: {req['model']} - ${req['cost']:.4f}")

    # Parse request data
    request_json = json.loads(req["request_data"])
    user_message = request_json["messages"][-1]["content"]
    print(f"  User: {user_message[:50]}...")
```

## DELETE /errors

Deletes all error records from the database.

### Request

```http
DELETE /errors HTTP/1.1
```

### Response Format

```json
{
  "deleted": 15
}
```

### Response Fields

| Field | Type | Description |
|:------|:-----|:------------|
| `deleted` | integer | Number of error records deleted |

### Usage

```bash
curl -X DELETE http://localhost:4000/errors
```

```python
import requests

response = requests.delete("http://localhost:4000/errors")
print(f"Deleted {response.json()['deleted']} error records")
```

This endpoint is used by the dashboard's "Clear Errors" button but can also be called directly via API.

## GET /

Returns the HTML dashboard for browser viewing.

### Request

```http
GET / HTTP/1.1
```

### Response

HTML page with embedded JavaScript. Open in browser at:

```
http://localhost:4000/
```

### Dashboard Features

**Stats Tab**:

- Total requests, cost, tokens, average duration
- Time range selector (all time, 1h, 4h, 6h, 12h, 24h, week, 30 days)
- Breakdown by model and provider
- Recent errors with "Clear Errors" button
- All timestamps displayed in local timezone

**Models Tab**:

- List of configured models
- Provider and LiteLLM identifier
- Input/output costs per million tokens

**Requests Tab**:

- Last 50 requests
- Expandable rows showing full request/response JSON
- Click any row to toggle details

### Auto-Refresh

Stats tab auto-refreshes every 5 seconds. Models and Requests tabs load on-demand when clicked.

## OpenAI SDK Compatibility

Apantli implements a subset of OpenAI's API. Compatible endpoints:

| OpenAI Endpoint | Apantli Support | Notes |
|:----------------|:----------------|:------|
| `/v1/chat/completions` | Yes | Full support including streaming |
| `/v1/completions` | No | Use chat completions instead |
| `/v1/embeddings` | No | Not implemented |
| `/v1/models` | Partial | Different format, use `/models` |

### Using OpenAI SDK

Point the SDK at Apantli's base URL:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="not-used"  # Proxy handles auth
)

# Use any configured model
response = client.chat.completions.create(
    model="gpt-4.1-mini",  # From config.yaml
    messages=[{"role": "user", "content": "Hello!"}]
)
```

API key parameter is ignored. Apantli uses keys from `.env` based on model configuration.

## Rate Limiting

Currently none. Apantli proxies requests directly to providers without rate limiting.

Provider rate limits still apply. If you exceed provider limits, requests will fail with provider error messages.

## CORS

CORS is fully enabled with permissive settings to support web-based clients like Obsidian Copilot.

All origins are allowed via regex pattern matching. Credentials and all HTTP methods/headers are permitted.

This configuration is suitable for local development. For production network exposure, restrict `allow_origin_regex` to specific domains.

## Logging

All requests (successful and failed) are logged to SQLite database. See [ARCHITECTURE.md](ARCHITECTURE.md#database-schema) for schema details.

Failed requests include error message in `error` column. Successful requests have `error = NULL`.

## Versioning

API has no versioning scheme currently. Breaking changes will be documented in release notes.

OpenAI compatibility is maintained at the `/v1/chat/completions` endpoint path.
