# Apantli Documentation

Comprehensive documentation for Apantli, a lightweight LLM proxy with SQLite cost tracking.

## Documentation Index

| Document | Description | Audience |
|:---------|:------------|:---------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, components, and data flow | Developers |
| [CONFIGURATION.md](CONFIGURATION.md) | Model configuration and environment setup | Users & Developers |
| [DATABASE.md](DATABASE.md) | SQLite schema, maintenance, queries, and troubleshooting | Developers & DevOps |
| [API.md](API.md) | HTTP endpoint reference | Developers & Integration users |
| [DASHBOARD.md](DASHBOARD.md) | Web dashboard guide - features, customization, and how it works | Users & Developers |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and solutions | Users & Developers |

## Quick Navigation

**New Users**: Start with the main [README.md](../README.md) for installation and basic usage.

**Developers**: Read [ARCHITECTURE.md](ARCHITECTURE.md) to understand the system design, then review [API.md](API.md) for endpoint details.

**Configuration**: See [CONFIGURATION.md](CONFIGURATION.md) for detailed model setup and advanced configuration options.

**Database**: See [DATABASE.md](DATABASE.md) for schema details, maintenance procedures, and custom queries.

**Dashboard**: See [DASHBOARD.md](DASHBOARD.md) for web dashboard features, Jinja2/Alpine.js explanation, and customization guide.

**Issues**: Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for solutions to common problems.

## Project Overview

Apantli is a local proxy server that:

- Routes requests to multiple LLM providers (OpenAI, Anthropic, etc.)
- Tracks token usage and costs in SQLite database
- Provides web dashboard for monitoring usage
- Implements OpenAI-compatible API format

## Key Features

| Feature | Description |
|:--------|:------------|
| Local-first | No cloud dependencies, runs entirely on your machine |
| Multi-provider | Supports OpenAI, Anthropic, and other LiteLLM-compatible providers |
| Cost tracking | Automatic calculation and storage of per-request costs |
| Web dashboard | Real-time statistics with time-range filtering |
| SQLite storage | Lightweight database with full request/response logging |
| OpenAI compatible | Drop-in replacement for OpenAI API clients |

## Architecture at a Glance

```
┌─────────────┐
│   Client    │
│ (any OpenAI │
│  compatible)│
└──────┬──────┘
       │ HTTP POST /v1/chat/completions
       ↓
┌─────────────────────────────────┐
│      Apantli Proxy Server       │
│  ┌────────────────────────────┐ │
│  │  Request Handler           │ │
│  │  - Parse model name        │ │
│  │  - Load config/API keys    │ │
│  └────────────┬───────────────┘ │
│               ↓                 │
│  ┌────────────────────────────┐ │
│  │  LiteLLM SDK               │ │
│  │  - Route to provider       │ │
│  │  - Calculate costs         │ │
│  └────────────┬───────────────┘ │
│               ↓                 │
│  ┌────────────────────────────┐ │
│  │  SQLite Logger             │ │
│  │  - Store request/response  │ │
│  │  - Track tokens/costs      │ │
│  └────────────────────────────┘ │
└─────────────────────────────────┘
       │ Response
       ↓
┌──────────────┐
│   Client     │
└──────────────┘
```

## Getting Help

If you encounter issues not covered in the documentation:

1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common problems
2. Review server logs for error messages
3. Verify your configuration in `config.yaml` and `.env`
4. Check the SQLite database for logged errors: `sqlite3 requests.db "SELECT * FROM requests WHERE error IS NOT NULL"`
