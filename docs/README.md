# Apantli Documentation

Comprehensive documentation for Apantli, a lightweight LLM proxy with SQLite cost tracking.

## Documentation Index

| Document | Description | Audience |
|:---------|:------------|:---------|
| [API.md](API.md) | HTTP endpoint reference with pagination and filtering examples | Developers & Integration users |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, components, data flow, and server-side filtering | Developers |
| [CONFIGURATION.md](CONFIGURATION.md) | Model configuration and environment setup | Users & Developers |
| [DASHBOARD.md](DASHBOARD.md) | Web dashboard guide with filtering and pagination workflows | Users & Developers |
| [DATABASE.md](DATABASE.md) | SQLite schema, maintenance, queries, and troubleshooting | Developers & DevOps |
| [ERROR_HANDLING.md](ERROR_HANDLING.md) | Error handling design, timeout/retry strategy, and implementation | Developers |
| [LLM_CLI_INTEGRATION.md](LLM_CLI_INTEGRATION.md) | How llm CLI integration works - config files, transformation, and data flow | Developers |
| [TESTING.md](TESTING.md) | Test suite, manual testing procedures, and validation | Developers & QA |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and solutions | Users & Developers |
| [../launchd/README.md](../launchd/README.md) | macOS launchd service setup, management, and troubleshooting | macOS Users & DevOps |
| [../launchd/NAMING.md](../launchd/NAMING.md) | launchd service naming convention and rationale | macOS Users & DevOps |

## Quick Navigation

**New Users**: Start with the main [README.md](../README.md) for installation and basic usage.

**Developers**: Read [ARCHITECTURE.md](ARCHITECTURE.md) to understand the system design, then review [API.md](API.md) for endpoint details.

**Configuration**: See [CONFIGURATION.md](CONFIGURATION.md) for detailed model setup and advanced configuration options.

**API Usage**: See [API.md](API.md) for comprehensive endpoint documentation with pagination and filtering examples.

**Dashboard**: See [DASHBOARD.md](DASHBOARD.md) for web dashboard features including advanced filtering workflows and persistent state.

**llm CLI Integration**: See [LLM_CLI_INTEGRATION.md](LLM_CLI_INTEGRATION.md) for how config.yaml, generate_llm_config.py, and extra-openai-models.yaml work together.

**Database**: See [DATABASE.md](DATABASE.md) for schema details, maintenance procedures, and custom queries.

**Error Handling**: See [ERROR_HANDLING.md](ERROR_HANDLING.md) for timeout/retry configuration, error response format, and design decisions.

**Testing**: See [TESTING.md](TESTING.md) for running the test suite, manual testing procedures, and validation strategies.

**Issues**: Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for solutions to common problems.

## Project Overview

Apantli is a local proxy server with modular architecture that:

- Routes requests to multiple LLM providers (OpenAI, Anthropic, etc.)
- Tracks token usage and costs in SQLite database with async operations
- Provides web dashboard for monitoring usage
- Implements OpenAI-compatible API format
- Uses Pydantic validation for type-safe configuration
- Includes comprehensive unit test suite (59 test cases)

## Key Features

| Feature | Description |
|:--------|:------------|
| Local-first | No cloud dependencies, runs entirely on your machine |
| Multi-provider | Supports OpenAI, Anthropic, and other LiteLLM-compatible providers |
| Cost tracking | Automatic calculation and storage of per-request costs |
| Advanced filtering | Server-side filtering by provider, model, cost range, and text search |
| Pagination | Navigate through all requests with configurable page size (up to 200 per page) |
| Web dashboard | Real-time statistics with unified date filtering across tabs |
| SQLite storage | Lightweight database with async operations, indexed queries, and full request/response logging |
| OpenAI compatible | Drop-in replacement for OpenAI API clients |
| Error handling | Configurable timeouts, automatic retries, and proper error responses |
| Modular architecture | Six focused modules with single responsibility |
| Type-safe config | Pydantic validation with early error detection |
| Comprehensive tests | 59 unit and integration test cases |
| Persistent state | Filter selections and theme preferences saved across sessions |

## Architecture at a Glance

**Modular Design**: Six focused modules with clear responsibilities

```
┌─────────────┐
│   Client    │
│ (any OpenAI │
│  compatible)│
└──────┬──────┘
       │ HTTP POST /v1/chat/completions
       ↓
┌──────────────────────────────────────┐
│      Apantli Proxy Server            │
│  ┌────────────────────────────────┐  │
│  │  Server (server.py)            │  │
│  │  - Routes & orchestration      │  │
│  └────────────┬───────────────────┘  │
│               ↓                      │
│  ┌────────────────────────────────┐  │
│  │  Config (config.py)            │  │
│  │  - Pydantic validation         │  │
│  │  - Model lookup & API keys     │  │
│  └────────────┬───────────────────┘  │
│               ↓                      │
│  ┌────────────────────────────────┐  │
│  │  LLM (llm.py) + LiteLLM SDK    │  │
│  │  - Provider inference          │  │
│  │  - Route & calculate costs     │  │
│  └────────────┬───────────────────┘  │
│               ↓                      │
│  ┌────────────────────────────────┐  │
│  │  Database (database.py)        │  │
│  │  - Async SQLite (aiosqlite)    │  │
│  │  - Non-blocking logging        │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
       │ Response
       ↓
┌──────────────┐
│   Client     │
└──────────────┘
```

## Utilities

The `utils/` directory contains helper scripts:

- **generate_llm_config.py** - Configure `llm` CLI to use Apantli as a proxy
- **recalculate_costs.py** - Fix missing costs in database for old requests

See [../utils/README.md](../utils/README.md) for usage instructions.

## Getting Help

If you encounter issues not covered in the documentation:

1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common problems
2. Review server logs for error messages
3. Verify your configuration in `config.yaml` and `.env`
4. Check the SQLite database for logged errors: `sqlite3 requests.db "SELECT * FROM requests WHERE error IS NOT NULL"`
