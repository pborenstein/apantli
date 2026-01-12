# CLAUDE.md

AI-specific context for Claude Code when working with this repository.

## Project Overview

Apantli is a lightweight local LLM proxy that routes requests to multiple providers through an OpenAI-compatible API while tracking costs in SQLite. Built with FastAPI and LiteLLM, it provides a dashboard for monitoring usage and a playground for testing models side-by-side.

## Quick Architecture

**Core Modules** (~1,900 lines):
- `apantli/server.py` (887 lines) - FastAPI app, HTTP routes, request orchestration
- `apantli/config.py` (189 lines) - Configuration with Pydantic validation
- `apantli/database.py` (506 lines) - Async database operations with aiosqlite
- `apantli/llm.py` (27 lines) - Provider inference
- `apantli/errors.py` (129 lines) - Error formatting
- `apantli/utils.py` (117 lines) - Timezone utilities

**Request Flow**: Client → Config lookup → API key resolution → LiteLLM SDK → Provider → Response + cost calc → Async DB log → Client

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for detailed system design, data flow diagrams, and component interactions.

## Key Documentation

**Core Implementation**:
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design, data flow, module details
- [API.md](docs/API.md) - Complete API endpoint reference
- [CONFIGURATION.md](docs/CONFIGURATION.md) - Config file format, model setup, API keys
- [DATABASE.md](docs/DATABASE.md) - Schema, async operations, query patterns
- [ERROR_HANDLING.md](docs/ERROR_HANDLING.md) - Timeout/retry configuration, status codes
- [TESTING.md](docs/TESTING.md) - Test suite (69 test cases), running tests, validation

**User Interface**:
- [DASHBOARD.md](docs/DASHBOARD.md) - Dashboard tabs, auto-refresh, request details
- [PLAYGROUND.md](docs/PLAYGROUND.md) - Side-by-side model comparison, parameter controls

**Operations**:
- [OPERATIONS.md](docs/OPERATIONS.md) - Deployment, monitoring, troubleshooting
- [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) - Common issues and solutions

**Project Status**:
- [CHRONICLES.md](docs/CHRONICLES.md) - Key decisions and interesting episodes
- [IMPLEMENTATION.md](docs/IMPLEMENTATION.md) - Current status and recent work

## Session Orientation

### Starting a session

1. **Check recent work**: Read [CHRONICLES.md](docs/CHRONICLES.md) latest entries and [IMPLEMENTATION.md](docs/IMPLEMENTATION.md)
2. **Understand current state**: `git log --oneline -10` for recent commits
3. **Run tests**: `make all` or `pytest tests/ -v` to verify everything works

### Key Files

- `config.yaml` - Model definitions, API key references
- `.env` - API keys (gitignored, not in repo)
- `requests.db` - SQLite database (full request/response logs + costs)
- `templates/dashboard.html` (502 lines) - Dashboard UI structure
- `templates/compare.html` (258 lines) - Playground UI structure
- `apantli/static/js/dashboard.js` (1,728 lines) - Dashboard logic
- `apantli/static/js/compare.js` (556 lines) - Playground logic

### Development

**Server URL**: `http://localhost:4000` (NOT 8000!)

**Run server**:
```bash
./dev.sh  # Development mode with auto-reload on port 4000
```

**Before offering to start the server**: Check if it's already running with `lsof -i :4000` or `curl -s http://localhost:4000/health`

**Run tests**:
```bash
make all           # Type check + tests
pytest tests/ -v   # Just tests
mypy apantli/      # Just type checking
```

**API Endpoints**: See [docs/API.md](docs/API.md) for full reference
- Primary: `/v1/chat/completions`, `/chat/completions` (POST) - OpenAI-compatible proxy
- Health: `/health` (GET)
- Stats: `/stats` (GET), `/stats/daily`, `/stats/date-range`
- UI: `/` (Dashboard), `/compare` (Playground)

## Implementation Patterns

For code examples and implementation details, refer to the source files:

- **Config Usage**: See [apantli/server.py:113-129](apantli/server.py) for initialization and model lookup
- **Database Operations**: See [apantli/database.py](apantli/database.py) for async patterns with aiosqlite
- **Error Handling**: See [apantli/errors.py](apantli/errors.py) for OpenAI-compatible error formatting

## Security Notes

- API keys stored in `.env` and logged to database (for debugging)
- Dashboard unauthenticated (designed for local use only)
- Database contains full conversation history and API keys - protect file permissions
- Default binding is `0.0.0.0` - use `--host 127.0.0.1` for localhost-only access

See [SECURITY.md](SECURITY.md) for security considerations.
