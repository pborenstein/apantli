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
| [docs/ERROR_HANDLING.md](docs/ERROR_HANDLING.md) | Error handling design, timeout/retry strategy, and implementation | Developers |
| [docs/TESTING.md](docs/TESTING.md) | Test suite, manual testing procedures, and validation | Developers & QA |
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
| Error handling | Configurable timeouts, automatic retries, and OpenAI-compatible error responses |
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

**Prerequisites**: Python 3.13+, API keys for desired providers

```bash
# Clone repository
git clone <repository-url>
cd apantli

# Install dependencies
uv sync

# Copy environment template
cp .env.example .env
# Edit .env with your API keys

# Start server
apantli
```

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for alternative installation methods and detailed setup.

## Configuration

### Environment Variables (.env)

```bash
OPENAI_API_KEY=sk-proj-your-key-here
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
```

Never commit `.env` to version control (already in `.gitignore`).

### Model Configuration (config.yaml)

```yaml
model_list:
  - model_name: gpt-4.1-mini
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: os.environ/OPENAI_API_KEY

  - model_name: claude-sonnet-4
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  # Optional: Per-model configuration
  - model_name: gpt-4.1-mini-fast
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: os.environ/OPENAI_API_KEY
      timeout: 30          # Override default timeout
      num_retries: 5       # Override default retries
      temperature: 0.7     # Default temperature
      max_tokens: 1000     # Default max tokens
```

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for detailed configuration options, provider-specific setup, and client integration guides.

## Usage

### Starting the Server

```bash
# Default (port 4000, 120s timeout, 3 retries)
apantli

# Common options
apantli --port 8080           # Custom port
apantli --timeout 60          # Request timeout in seconds (default: 120)
apantli --retries 5           # Number of retries for transient errors (default: 3)
apantli --reload              # Development mode with auto-reload
apantli --config custom.yaml  # Custom config file

# Combined options
apantli --port 8080 --timeout 60 --retries 5
```

### Making Requests

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

See [docs/API.md](docs/API.md) for curl, requests library, and detailed API examples.

### Web Dashboard

Open http://localhost:4000/ to view:

- **Stats**: Usage statistics with date filtering, cost breakdowns, recent errors
- **Calendar**: Monthly view of daily spending patterns with heatmap
- **Models**: Configured models with pricing information
- **Requests**: Last 50 requests with filtering, search, and full JSON details

### Client Integration

Works with any OpenAI-compatible client: OpenAI SDK, LangChain, LlamaIndex, Continue.dev, Cursor, Obsidian Copilot.

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md#client-integration) for Obsidian Copilot setup and other client integrations.

### API Endpoints

| Endpoint | Method | Description |
|:---------|:-------|:------------|
| `/v1/chat/completions` | POST | OpenAI-compatible chat completions (streaming supported) |
| `/chat/completions` | POST | Alternate path for chat completions |
| `/health` | GET | Health check |
| `/models` | GET | List available models with pricing |
| `/stats` | GET | Usage statistics with date filtering and performance metrics |
| `/stats/daily` | GET | Daily aggregated statistics with provider breakdown |
| `/stats/date-range` | GET | Get actual date range of data in database |
| `/requests` | GET | Request history with filtering (last 50) |
| `/errors` | DELETE | Clear all error records |
| `/` | GET | Web dashboard |

See [docs/API.md](docs/API.md) for complete endpoint documentation.

## Database

All requests logged to `requests.db` (SQLite):

- Request metadata (timestamp, model, provider, tokens, cost, duration)
- Full request and response JSON
- Error messages for failed requests

See [docs/DATABASE.md](docs/DATABASE.md) for schema, queries, and maintenance.

## Compatibility

Works with any OpenAI-compatible client. Point at `http://localhost:4000/v1` and use model names from `config.yaml`.

Compatible tools: OpenAI SDK, LangChain, LlamaIndex, Continue.dev, Cursor, Obsidian Copilot.

## Security

**Default configuration is for local use only.** Do not expose to network without authentication.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-considerations) for security details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Name Origin

"Apantli" (Nahuatl: āpantli) means "canal" or "channel" - a fitting name for a system that channels requests between clients and LLM providers.
