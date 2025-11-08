# Apantli

Lightweight local LLM proxy with SQLite cost tracking and interactive model comparison playground. Routes requests to multiple providers through a unified OpenAI-compatible API.


## Quick Start

1. **Clone the repository**:

   ```bash
   git clone git@github.com:pborenstein/apantli.git
   cd apantli
   ```

2. **Install dependencies**:

   ```bash
   uv sync
   ```

3. **Activate the virtual environment**:

   ```bash
   # bash/zsh
   source .venv/bin/activate

   # fish
   source .venv/bin/activate.fish
   ```

4. **Configure API keys** in `.env`:

   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

5. **Configure models** in `config.yaml`:

   ```yaml
   model_list:
     - model_name: gpt-4.1-mini
       litellm_params:
         model: openai/gpt-4.1-mini
         api_key: os.environ/OPENAI_API_KEY
   ```

6. **Start the server**:

   ```bash
   apantli
   ```

7. **View dashboard**: http://localhost:4000/

8. **Try the Playground**: http://localhost:4000/compare - Compare models side-by-side

## Project Overview

Apantli is a local proxy server that routes LLM requests to multiple providers while tracking usage and costs in a SQLite database. It provides:

- **OpenAI-compatible API** - Drop-in replacement for OpenAI SDK clients
- **Interactive Playground** - Side-by-side model comparison with parallel streaming
- **Web Dashboard** - Real-time monitoring with cost tracking and request history
- **SQLite Storage** - Full request/response logging with automatic cost calculation

**Why Apantli?** Lighter alternative to LiteLLM's proxy (which requires Postgres and Docker). Runs entirely locally with no cloud dependencies. The Playground makes it easy to compare model outputs, evaluate prompts, and tune parameters across multiple providers simultaneously.

> **⚠️ Security Notice**
>
> Apantli is designed for local use only and provides **no authentication or authorization**. Do not expose to the network without adding proper security controls. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-considerations) for details.

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

**Using curl**:

```bash
curl http://localhost:4000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

See [docs/API.md](docs/API.md) for OpenAI SDK, requests library, and detailed API examples.

### Web Dashboard

Open http://localhost:4000/ for real-time monitoring with four tabs:

| Stats | Calendar | Models | Requests |
|:------|:---------|:-------|:---------|
| Usage statistics with date filtering, cost breakdowns, provider trends, model efficiency, and recent errors <br> [Stats tab screenshot](docs/stats-tab.png) | Monthly view of daily spending patterns with heatmap coloring showing cost intensity per day | Configured models with pricing information in sortable columns | Paginated request history (50 per page) with advanced server-side filtering. Apply global date filters (Today, Yesterday, This Week, This Month, Last 30 Days, Custom range), provider dropdown (openai, anthropic, etc.), model dropdown (exact match), cost range (min/max thresholds), and text search (searches model name and request/response content). All filters combine with AND logic. Summary shows accurate totals for ALL filtered results, and filter state persists across page reloads <br> [Requests tab screenshot](docs/requests-tab.png) |

### Playground

Interactive model comparison at http://localhost:4000/compare - test up to 3 models side-by-side with independent parameters:

- **Side-by-side comparison**: Enable up to 3 slots, each with its own model and parameters (temperature, top_p, max_tokens)
- **Parallel streaming**: Send one prompt to multiple models simultaneously, see responses develop in real-time
- **Conversation threading**: Each slot maintains independent conversation history with context preservation
- **Token tracking**: View prompt→completion token usage for each response
- **Export conversations**: Copy all conversations to markdown with one click
- **Parameter defaults**: Model-specific defaults from config.yaml with reset buttons
- **State persistence**: Conversations and settings saved in browser localStorage

Perfect for prompt engineering, model evaluation, and parameter tuning. See [docs/PLAYGROUND.md](docs/PLAYGROUND.md) for detailed usage and architecture.


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
| `/requests` | GET | Paginated request history with server-side filtering (provider, model, cost, search) |
| `/errors` | DELETE | Clear all error records |
| `/` | GET | Web dashboard |
| `/compare` | GET | Playground (side-by-side model comparison interface) |

See [docs/API.md](docs/API.md) for complete endpoint documentation.

## Core Features

| Feature | Description |
|:--------|:------------|
| Local-first | No cloud dependencies, runs entirely on your machine |
| Multi-provider | OpenAI, Anthropic, and other LiteLLM-compatible providers |
| Cost tracking | Automatic calculation and storage of per-request costs |
| Web dashboard | Real-time statistics with time-range filtering and error management |
| Playground | Side-by-side model comparison with independent parameters and conversation threading |
| Advanced filtering | Server-side request filtering by provider, model, cost range, and text search |
| Pagination | Navigate through all requests with configurable page size (up to 200 per page) |
| SQLite storage | Lightweight database with full request/response logging and indexed queries |
| OpenAI compatible | Drop-in replacement for OpenAI API clients with streaming support |
| Error handling | Configurable timeouts, automatic retries, and OpenAI-compatible error responses |
| CORS enabled | Works with web-based clients like Obsidian Copilot |

## System Architecture

Apantli uses a modular architecture with six focused modules:

```
┌─────────────┐
│   Client    │  Any OpenAI-compatible client (curl, SDK, etc.)
└──────┬──────┘
       │ HTTP POST /v1/chat/completions
       ↓
┌──────────────────────────────────────────┐
│     Apantli Proxy (FastAPI)              │
│  ┌────────────────────────────────────┐  │
│  │ Server (server.py)                 │  │
│  │ - Routes & request orchestration   │  │
│  └────────────┬───────────────────────┘  │
│               ↓                          │
│  ┌────────────────────────────────────┐  │
│  │ Config (config.py)                 │  │
│  │ - Pydantic validation              │  │
│  │ - Model lookup & API keys          │  │
│  └────────────┬───────────────────────┘  │
│               ↓                          │
│  ┌────────────────────────────────────┐  │
│  │ LiteLLM SDK + LLM Module           │  │
│  │ - Provider routing (llm.py)        │  │
│  │ - Cost calculation                 │  │
│  └────────────┬───────────────────────┘  │
│               ↓                          │
│  ┌────────────────────────────────────┐  │
│  │ Database (database.py)             │  │
│  │ - Async SQLite with aiosqlite      │  │
│  │ - Request/response logging         │  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
       │ Response
       ↓
┌──────────────┐
│   Client     │
└──────────────┘
```

The architecture follows modular design principles with single responsibility per module, async database operations for non-blocking I/O, Pydantic validation for type-safe configuration, and comprehensive unit test suite (69 test cases).

## Installation

**Prerequisites**: Python 3.13+, API keys for desired providers

```bash
# Clone repository
git clone git@github.com:pborenstein/apantli.git
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

## Running as a Service (macOS)

To run apantli automatically at startup using launchd:

```bash
cd launchd
./install.sh
```

The installer creates launchd services that run apantli in the background and optionally expose it via Tailscale HTTPS. Includes a `dev.sh` script for development with auto-reload.

See [launchd/README.md](launchd/README.md) for complete setup, configuration, and troubleshooting.

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

  # Optional: Per-model configuration with parameter defaults
  - model_name: gpt-4.1-mini-fast
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: os.environ/OPENAI_API_KEY
      timeout: 30          # Override default timeout
      num_retries: 5       # Override default retries
      temperature: 0.7     # Default temperature (clients can override)
      max_tokens: 1000     # Default max tokens (clients can override)
```

Config parameters provide defaults that clients can override in individual requests.

See [docs/CONFIGURATION.md](docs/CONFIGURATION.md) for detailed configuration options, provider-specific setup, and client integration guides.

## Database

All requests are logged to `requests.db` (SQLite) with request metadata (timestamp, model, provider, tokens, cost, duration), full request and response JSON, and error messages for failed requests.

See [docs/DATABASE.md](docs/DATABASE.md) for schema, queries, and maintenance.

## Utilities

Helper scripts in `utils/` directory:

**Generate llm CLI config** - Use Apantli with the `llm` CLI tool:
```bash
# Write llm config from Apantli config.yaml
python3 utils/generate_llm_config.py --write

# Then use llm with all your models
export OPENAI_BASE_URL=http://localhost:4000/v1
llm -m claude-haiku-3.5 "Tell me a joke"
llm -m gpt-4o-mini "What is 2+2?"
```

**Recalculate costs** - Fix missing costs in database:
```bash
# Dry run to see what would be updated
python3 utils/recalculate_costs.py --dry-run

# Update database with correct costs
python3 utils/recalculate_costs.py
```

See [utils/README.md](utils/README.md) for detailed usage.

## Compatibility

Works with any OpenAI-compatible client. Point at `http://localhost:4000/v1` and use model names from `config.yaml`.

Compatible tools: OpenAI SDK, LangChain, LlamaIndex, Continue.dev, Cursor, Obsidian Copilot, llm CLI.

For `llm` CLI integration, see [Utilities](#utilities) section above.

## Security

**Default configuration is for local use only.** Do not expose to network without authentication.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#security-considerations) for security details.

## Further Reading

For detailed documentation on specific topics:

| Document | Description | Audience |
|:---------|:------------|:---------|
| [docs/API.md](docs/API.md) | HTTP endpoint reference | Developers & Integration users |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design and technical implementation | Developers |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Model setup and environment configuration | Users & Developers |
| [docs/DASHBOARD.md](docs/DASHBOARD.md) | Dashboard features, tabs, filtering, and browser navigation | Users |
| [docs/DATABASE.md](docs/DATABASE.md) | SQLite schema, maintenance, queries, and troubleshooting | Developers & DevOps |
| [docs/ERROR_HANDLING.md](docs/ERROR_HANDLING.md) | Error handling design, timeout/retry strategy, and implementation | Developers |
| [docs/PLAYGROUND.md](docs/PLAYGROUND.md) | Interactive model comparison interface architecture and usage | Users & Developers |
| [docs/TESTING.md](docs/TESTING.md) | Test suite, manual testing procedures, and validation | Developers & QA |
| [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues and solutions | Users & Developers |

## License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

## Name Origin

"Apantli" (Nahuatl: āpantli) means "canal" or "channel" - a fitting name for a system that channels requests between clients and LLM providers.

<a href="https://aztecglyphs.wired-humanities.org/content/apantli-mdz50r"><img src="./docs/apantli-glyph.png" width="120px"></a>

