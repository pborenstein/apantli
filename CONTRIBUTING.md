# Contributing to Apantli

Thank you for your interest in contributing to Apantli! This guide will help you get started with development.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Project Structure](#project-structure)
- [Common Development Tasks](#common-development-tasks)

## Development Setup

### Prerequisites

- Python 3.13 or higher
- Git
- Virtual environment tool (uv recommended, or venv)

### Initial Setup

1. **Fork and clone the repository**:

   ```bash
   git clone https://github.com/yourusername/apantli.git
   cd apantli
   ```

2. **Create a virtual environment**:

   ```bash
   # Using uv (recommended)
   uv sync

   # Or using venv
   python3.13 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   pip install -r requirements-dev.txt
   ```

3. **Set up environment variables**:

   ```bash
   cp .env.example .env
   # Edit .env and add your API keys for testing
   ```

4. **Verify installation**:

   ```bash
   # Run the server
   apantli

   # In another terminal, run tests
   pytest tests/ -v
   ```

### Development Mode

Run the server with auto-reload during development:

```bash
apantli --reload
```

**Note**: Auto-reload watches Python files only. You must manually restart after changing `config.yaml` or `.env`.

## Code Style Guidelines

### Python Code Style

Apantli follows PEP 8 with these specific conventions:

**Type Hints**: Use type hints for all function signatures:

```python
def log_request(self, model: str, provider: str, response: Optional[dict],
                duration_ms: int, request_data: dict, error: Optional[str] = None) -> None:
    """Log a request to the database."""
    pass
```

**Docstrings**: Use Google-style docstrings for modules, classes, and functions:

```python
def get_stats(self, time_filter: str = "", time_params: Optional[list] = None):
    """Get usage statistics with optional time filtering.

    Args:
        time_filter: SQL WHERE clause fragment from build_time_filter()
        time_params: Optional list of parameters for placeholders

    Returns:
        Dictionary containing totals, by_model, by_provider, performance, and recent_errors
    """
    pass
```

**Async Functions**: Prefix async functions with `async` keyword and use `await` for async calls:

```python
async def get_requests(self, filters: RequestFilter):
    """Get paginated request history."""
    async with self._get_connection() as conn:
        cursor = await conn.execute(query, params)
        rows = await cursor.fetchall()
    return results
```

**Error Handling**: Use specific exception types and handle errors appropriately:

```python
try:
    response = await completion(...)
except AuthenticationError as e:
    return JSONResponse(
        status_code=401,
        content=build_error_response(e, 401)
    )
```

### Code Organization

**Imports**: Group imports in this order (PEP 8):
1. Standard library imports
2. Third-party imports
3. Local application imports

```python
import os
from typing import Optional, Dict

from fastapi import FastAPI, Request
from litellm import completion

from apantli.config import Config
from apantli.database import Database
```

**Module Structure**: Follow the established modular architecture:
- `server.py` - FastAPI routes and HTTP handling
- `config.py` - Configuration with Pydantic validation
- `database.py` - Async database operations
- `llm.py` - Provider inference
- `errors.py` - Error formatting
- `utils.py` - Utility functions

### Frontend Code Style

**JavaScript**: Use modern ES6+ syntax:
- `const` and `let` (not `var`)
- Arrow functions for callbacks
- Template literals for string interpolation
- Async/await for promises

**Alpine.js**: Follow Alpine.js conventions:
- Use `x-data` for component state
- Use `x-on` or `@` for event handlers
- Use `x-bind` or `:` for attribute binding
- Keep reactive data in Alpine state, not global variables

**CSS**: Follow BEM-like naming for clarity:
- Component-based organization
- Descriptive class names
- Avoid overly deep selectors

## Testing Requirements

### Running Tests

**Unit Tests** (fast, no API keys required):

```bash
# Run all unit tests
pytest tests/ -v

# Run specific module
pytest tests/test_config.py -v

# Run with coverage
pytest tests/ --cov=apantli --cov-report=html
```

**Integration Tests** (require running server and API keys):

```bash
# Terminal 1: Start server
apantli

# Terminal 2: Run integration tests
python tests/integration/test_error_handling.py
python tests/integration/test_proxy.py
```

**Type Checking**:

```bash
mypy apantli/
```

### Writing Tests

**Unit Test Example**:

```python
import pytest
from apantli.config import ModelConfig

def test_model_config_valid(monkeypatch):
    """Test ModelConfig validation with valid data."""
    monkeypatch.setenv('OPENAI_API_KEY', 'test-key')

    config = ModelConfig(
        model_name='test-model',
        model='openai/gpt-4',
        api_key='os.environ/OPENAI_API_KEY'
    )

    assert config.model_name == 'test-model'
    assert config.litellm_model == 'openai/gpt-4'
```

**Async Test Example**:

```python
import pytest
from apantli.database import Database

@pytest.mark.asyncio
async def test_log_request_success(temp_db, sample_response, sample_request_data):
    """Test logging a successful request."""
    db = Database(temp_db)
    await db.init()

    await db.log_request(
        model='gpt-4',
        provider='openai',
        response=sample_response,
        duration_ms=500,
        request_data=sample_request_data
    )

    # Verify logged
    async with db._get_connection() as conn:
        cursor = await conn.execute("SELECT COUNT(*) FROM requests")
        count = await cursor.fetchone()

    assert count[0] == 1
```

### Test Guidelines

1. **Isolation**: Each test should be independent
2. **Fixtures**: Use pytest fixtures for common test data (see `tests/conftest.py`)
3. **Temp Files**: Use temporary databases for database tests
4. **Assertions**: Include clear assertion messages
5. **Coverage**: Aim for high coverage of core modules

## Pull Request Process

### Before Submitting

1. **Run all tests**:

   ```bash
   pytest tests/ -v
   mypy apantli/
   ```

2. **Update documentation** if you changed:
   - API endpoints
   - Configuration options
   - Database schema
   - Command-line arguments

3. **Update CHANGELOG.md** (if not present, create it) with your changes

### PR Guidelines

**PR Title**: Use conventional commit format:
- `feat: Add new feature`
- `fix: Fix bug in error handling`
- `docs: Update API documentation`
- `refactor: Restructure database module`
- `test: Add tests for config validation`

**PR Description**: Include:
- What changed and why
- Related issues (if any)
- Testing performed
- Breaking changes (if any)

**Example PR Description**:

```markdown
## Summary

Add support for per-model retry configuration.

## Changes

- Add `num_retries` field to ModelConfig
- Update server.py to use model-specific retry count
- Add validation for negative retry values
- Update CONFIGURATION.md with retry examples

## Testing

- Added unit tests for ModelConfig retry validation
- Tested with config.yaml override
- Verified default retries still work

## Breaking Changes

None
```

### Review Process

1. All tests must pass
2. Type checking must pass (mypy)
3. Code must follow style guidelines
4. Documentation must be updated
5. At least one maintainer approval required

## Project Structure

```
apantli/
├── apantli/                 # Main Python package
│   ├── __init__.py
│   ├── __main__.py          # CLI entry point
│   ├── server.py            # FastAPI application (887 lines)
│   ├── config.py            # Configuration (189 lines)
│   ├── database.py          # Database operations (506 lines)
│   ├── llm.py               # Provider inference (27 lines)
│   ├── errors.py            # Error formatting (129 lines)
│   ├── utils.py             # Utilities (117 lines)
│   └── static/              # Static assets
│       ├── alpine.min.js
│       ├── alpine-persist.min.js
│       ├── css/
│       │   ├── dashboard.css
│       │   └── compare.css
│       └── js/
│           ├── dashboard.js
│           └── compare.js
├── templates/               # Jinja2 templates
│   ├── dashboard.html
│   └── compare.html
├── tests/                   # Test suite
│   ├── conftest.py          # Shared fixtures
│   ├── test_*.py            # Unit tests
│   └── integration/         # Integration tests
├── docs/                    # Documentation
├── utils/                   # Utility scripts
├── config.yaml              # Model configuration
├── .env                     # API keys (gitignored)
└── requests.db              # SQLite database (gitignored)
```

## Common Development Tasks

### Adding a New Model Provider

1. **Update provider inference** in `apantli/llm.py`:

   ```python
   def infer_provider_from_model(model_name: str) -> str:
       # Add pattern for new provider
       if model_name.startswith("newprovider-"):
           return "newprovider"
   ```

2. **Add example to config.yaml**:

   ```yaml
   - model_name: newprovider-model
     litellm_params:
       model: newprovider/model-name
       api_key: os.environ/NEWPROVIDER_API_KEY
   ```

3. **Update documentation** in `docs/CONFIGURATION.md`

4. **Add tests** in `tests/test_llm.py`

### Adding a New API Endpoint

1. **Add route** in `apantli/server.py`:

   ```python
   @app.get("/new-endpoint")
   async def new_endpoint(request: Request):
       # Implementation
       return {"result": "data"}
   ```

2. **Update documentation** in `docs/API.md`

3. **Add tests** in `tests/integration/`

### Adding a Database Column

1. **Update schema** in `database.py` `init()` method

2. **Create migration strategy** (manual for now, consider alembic for future)

3. **Update database class methods** to use new column

4. **Update documentation** in `docs/DATABASE.md`

5. **Add tests** in `tests/test_database.py`

### Modifying Dashboard

1. **HTML**: Edit `templates/dashboard.html` or `templates/compare.html`

2. **CSS**: Edit `apantli/static/css/dashboard.css` or `compare.css`

3. **JavaScript**: Edit `apantli/static/js/dashboard.js` or `compare.js`

4. **Test manually**: Start server and verify in browser

5. **Update documentation** in `docs/DASHBOARD.md` or `docs/PLAYGROUND.md`

## Getting Help

- **Documentation**: See [docs/README.md](docs/README.md) for all guides
- **Architecture**: Review [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design
- **Issues**: Check existing GitHub issues or create a new one
- **Questions**: Open a GitHub Discussion

## Code of Conduct

- Be respectful and constructive
- Focus on the code, not the person
- Welcome newcomers and help them learn
- Assume good intentions

Thank you for contributing to Apantli!
