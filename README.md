# Apantli

Lightweight local LLM proxy with SQLite cost tracking. Routes requests to multiple providers through a unified OpenAI-compatible API.

## Quick Start

1. **Install dependencies**:

   ```bash
   uv sync
   ```

2. **Configure API keys** in `.env`:

   ```bash
   OPENAI_API_KEY=sk-proj-...
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. **Configure models** in `config.yaml`:

   ```yaml
   model_list:
     - model_name: gpt-4.1-mini
       litellm_params:
         model: openai/gpt-4.1-mini
         api_key: os.environ/OPENAI_API_KEY
   ```

4. **Start the server**:

   ```bash
   apantli
   ```

5. **View dashboard**: http://localhost:4000/

## Project Overview

Apantli is a local proxy server that routes LLM requests to multiple providers while tracking usage and costs in a SQLite database. It provides an OpenAI-compatible API and a web dashboard for monitoring.

**Why Apantli?** Lighter alternative to LiteLLM's proxy (which requires Postgres and Docker). Runs entirely locally with no cloud dependencies.

## Documentation

| Document | Description | Audience |
|:---------|:------------|:---------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and technical implementation | Developers |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Model setup and environment configuration | Users & Developers |
| [docs/DATABASE.md](docs/DATABASE.md) | SQLite schema, maintenance, queries, and troubleshooting | Developers & DevOps |
| [docs/API.md](docs/API.md) | HTTP endpoint reference | Developers & Integration users |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions | Users & Developers |

## Core Features

| Feature | Description |
|:--------|:------------|
| Local-first | No cloud dependencies, runs entirely on your machine |
| Multi-provider | OpenAI, Anthropic, and other LiteLLM-compatible providers |
| Cost tracking | Automatic calculation and storage of per-request costs |
| Web dashboard | Real-time statistics with time-range filtering and error management |
| SQLite storage | Lightweight database with full request/response logging |
| OpenAI compatible | Drop-in replacement for OpenAI API clients with streaming support |
| CORS enabled | Works with web-based clients like Obsidian Copilot |

## System Architecture

```
┌─────────────┐
│   Client    │  Any OpenAI-compatible client (curl, SDK, etc.)
└──────┬──────┘
       │ HTTP POST /v1/chat/completions
       ↓
┌──────────────────────────────────┐
│     Apantli Proxy (FastAPI)      │
│  ┌────────────────────────────┐  │
│  │ 1. Parse request           │  │
│  │ 2. Look up model config    │  │
│  │ 3. Resolve API key         │  │
│  └────────────┬───────────────┘  │
│               ↓                  │
│  ┌────────────────────────────┐  │
│  │ LiteLLM SDK                │  │
│  │ - Route to provider        │  │
│  │ - Calculate costs          │  │
│  └────────────┬───────────────┘  │
│               ↓                  │
│  ┌────────────────────────────┐  │
│  │ SQLite Logger              │  │
│  │ - Log request/response     │  │
│  │ - Track tokens & costs     │  │
│  └────────────────────────────┘  │
└──────────────────────────────────┘
       │ Response
       ↓
┌──────────────┐
│   Client     │
└──────────────┘
```

## Installation

### Prerequisites

- Python 3.13 or higher
- API keys for desired providers (OpenAI, Anthropic, etc.)

### Install with uv (recommended)

```bash
# Clone repository
git clone <repository-url>
cd apantli

# Install dependencies
uv sync

# Run server
apantli
```

### Install with pip

```bash
# Create virtual environment
python3.13 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run server
python3 -m apantli.server
```

## Configuration

### Environment Variables (.env)

Create a `.env` file with your API keys:

```bash
OPENAI_API_KEY=sk-proj-your-key-here
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

Never commit this file to version control (already in `.gitignore`).

### Model Configuration (config.yaml)

Define available models:

```yaml
model_list:
  # OpenAI models
  - model_name: gpt-4.1
    litellm_params:
      model: openai/gpt-4.1
      api_key: os.environ/OPENAI_API_KEY

  - model_name: gpt-4.1-mini
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: os.environ/OPENAI_API_KEY

  # Anthropic models
  - model_name: claude-sonnet-4
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-haiku-3.5
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY
```

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for detailed configuration options and provider-specific setup.

## Usage

### Start the Server

```bash
# Default (port 4000)
apantli

# Custom port
apantli --port 8080

# Development mode with auto-reload
apantli --reload

# Custom config file
apantli --config /path/to/config.yaml
```

### Make Requests

**Using curl**:

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

**Using OpenAI SDK**:

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:4000/v1",
    api_key="not-used"  # Proxy handles API keys
)

response = client.chat.completions.create(
    model="gpt-4.1-mini",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(response.choices[0].message.content)
```

**Using requests library**:

```python
import requests

response = requests.post(
    "http://localhost:4000/v1/chat/completions",
    json={
        "model": "claude-haiku-3.5",
        "messages": [{"role": "user", "content": "Hello!"}]
    }
)

data = response.json()
print(data["choices"][0]["message"]["content"])
```

### Obsidian Copilot Integration

Configure Obsidian Copilot to use Apantli as a custom provider:

1. **Start Apantli**:
   ```bash
   apantli
   ```

2. **In Obsidian Copilot settings**:
   - Go to **Copilot Basic Settings** → **API Keys**
   - Click **Add Model** → **Custom Model**

3. **Configure custom model**:
   - **Provider**: Select "3rd party (openai format)"
   - **Base URL**: `http://localhost:4000/v1`
   - **Model Name**: Use any model from your `config.yaml` (e.g., `gpt-4.1-mini`, `claude-sonnet-4`)
   - **API Key**: Enter any value (e.g., `not-used`) - Apantli handles the actual API keys

4. **Use the model**: Select your custom model in Copilot and start chatting

All requests will route through Apantli with full cost tracking and logging. Streaming responses are supported.

### Web Dashboard

Open http://localhost:4000/ in your browser.

**Stats Tab**: View usage statistics with flexible date filtering

- Total requests, costs, tokens
- Breakdown by model and provider
- Provider cost breakdown visualization
- Recent errors with "Clear Errors" button
- Date filters: All Time, Today, Yesterday, This Week, This Month, Last 30 Days
- Custom date range picker for specific periods
- All timestamps in local timezone

**Calendar Tab**: Monthly view of daily spending patterns

- Calendar grid showing daily costs with heatmap coloring
- Request counts per day
- Click any day to see provider breakdown
- Navigate between months

**Models Tab**: See configured models with pricing

- Model names and aliases
- Provider information
- Input/output costs per million tokens

**Requests Tab**: View and filter request history

- Last 50 requests with date range filtering
- Search filter (model names and content)
- Filter by provider, model, and cost range
- Summary statistics for filtered results (count, cost, tokens, avg)
- Click rows to expand full request/response JSON
- Sortable columns (time, model, tokens, cost, duration)

### API Endpoints

| Endpoint | Method | Description |
|:---------|:-------|:------------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat completions (streaming supported) |
| `/models` | GET | List available models with pricing |
| `/stats?hours=N` | GET | Usage statistics (optional time filter) |
| `/requests` | GET | Recent request history (last 50) |
| `/errors` | DELETE | Clear all error records |
| `/health` | GET | Health check |
| `/` | GET | Web dashboard |

See [docs/API.md](docs/API.md) for complete endpoint documentation.

## Database

All requests are logged to `requests.db` (SQLite) including:

- Request metadata (timestamp, model, provider, tokens, cost, duration)
- Full request and response JSON
- Error messages for failed requests

**Quick queries**:

```bash
# View recent requests
sqlite3 requests.db "SELECT timestamp, model, cost FROM requests ORDER BY timestamp DESC LIMIT 10"

# Calculate total costs
sqlite3 requests.db "SELECT SUM(cost) FROM requests"
```

See [docs/DATABASE.md](docs/DATABASE.md) for complete schema, maintenance procedures, common queries, and troubleshooting.

## Troubleshooting

### Common Issues

**Server won't start**:

- Check port 4000 is available: `lsof -i :4000`
- Verify Python version: `python3 --version` (requires 3.13+)
- Check for missing dependencies: `uv sync`

**Requests fail with authentication errors**:

- Verify `.env` file exists and contains API keys
- Check API key format (OpenAI starts with `sk-`, Anthropic with `sk-ant-`)
- Restart server after modifying `.env`

**Model not found**:

- Verify model name matches `config.yaml` exactly
- Check for typos and case sensitivity
- Restart server after modifying `config.yaml`

**Dashboard shows zero stats**:

- Make a test request first
- Check that request succeeded (no errors in response)
- Verify database is being written: `sqlite3 requests.db "SELECT COUNT(*) FROM requests"`

See [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for comprehensive troubleshooting guide.

## Compatibility

Works with any tool that supports OpenAI's API format:

- OpenAI Python SDK
- LangChain
- LlamaIndex
- Continue.dev
- Cursor
- Obsidian Copilot
- Any custom application using OpenAI API

Point your client at `http://localhost:4000/v1` and use model names from `config.yaml`.

## Command-Line Options

```bash
apantli --help
```

| Option | Default | Description |
|:-------|:--------|:------------|
| `--host` | `0.0.0.0` | Host to bind to |
| `--port` | `4000` | Port to bind to |
| `--config` | `config.yaml` | Path to config file |
| `--db` | `requests.db` | Path to SQLite database |
| `--reload` | `false` | Enable auto-reload for development |

## Development

### Run in Development Mode

```bash
apantli --reload
```

Auto-reloads server when Python files change (does not watch `config.yaml` or `.env`).

### Run Tests

```bash
# Start server
apantli

# In another terminal, run test script
python3 test_proxy.py
```

### Project Structure

```
apantli/
├── apantli/                 # Python package
│   ├── __init__.py         # Package metadata
│   ├── __main__.py         # CLI entry point
│   └── server.py           # FastAPI application
├── docs/                   # Documentation
│   ├── README.md           # Documentation index
│   ├── ARCHITECTURE.md     # System design
│   ├── CONFIGURATION.md    # Setup guide
│   ├── DATABASE.md         # Database schema & maintenance
│   ├── API.md              # Endpoint reference
│   ├── TROUBLESHOOTING.md  # Common issues
│   └── archive/            # Historical documents
├── config.yaml             # Model configuration
├── .env                    # API keys (gitignored)
├── requests.db             # SQLite database (gitignored)
├── pyproject.toml          # Package metadata
├── requirements.txt        # Dependencies
└── test_proxy.py           # Test script
```

## Security Considerations

**API Keys**: Stored in `.env`, never logged or returned in responses. Protect `requests.db` with appropriate file permissions as it contains full conversation history.

**Dashboard**: No authentication. Acceptable for local development. Do not expose to network without adding authentication.

**Network Exposure**: Default binding is `0.0.0.0` (all interfaces). For localhost-only access, use `--host 127.0.0.1`.

## Performance

**Request Latency**:

- FastAPI overhead: ~1-5ms
- LiteLLM overhead: ~10-50ms
- Provider API: 200-2000ms (dominant factor)
- SQLite write: ~1-5ms

**Database Growth**: ~2-10 KB per request. 10,000 requests ≈ 20-100 MB.

**Concurrency**: SQLite uses file-level locking (single writer). Suitable for single-user local proxy. For multi-user scenarios, consider external database.

## Future Enhancements

- Cost alerts and budgets
- Data export (CSV, JSON)
- Authentication for network exposure
- Additional provider support
- Provider cost trends over time
- Enhanced request detail view with message extraction

## License

See project repository for license information.

## Name Origin

"Apantli" (Nahuatl: āpantli) means "canal" or "channel" - a fitting name for a system that channels requests between clients and LLM providers.
