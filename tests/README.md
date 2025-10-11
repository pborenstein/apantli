# Apantli Tests

This directory contains unit and integration tests for Apantli.

## Test Structure

```
tests/
├── conftest.py              # Shared pytest fixtures
├── test_config.py           # Configuration loading tests
├── test_database.py         # Database operations tests
├── test_errors.py           # Error formatting tests
├── test_llm.py              # LLM provider inference tests
├── test_utils.py            # Utility functions tests
└── integration/
    ├── test_proxy.py        # End-to-end proxy tests
    └── test_error_handling.py  # Comprehensive error scenarios
```

## Running Tests

### Unit Tests (fast, no server required)

Using the simple test runner:

```bash
python run_unit_tests.py
```

Using pytest (recommended):

```bash
pip install -r requirements-dev.txt
pytest tests/ -v
```

### Integration Tests (require running server)

Start the server first:

```bash
python -m apantli
```

Then in another terminal:

```bash
python tests/integration/test_proxy.py
python tests/integration/test_error_handling.py
```

## Test Coverage

Unit tests cover:
- **Config module**: YAML loading, validation, error handling
- **Database module**: Schema creation, request logging, API key redaction
- **Errors module**: OpenAI-compatible error response formatting
- **LLM module**: Provider inference from model names
- **Utils module**: Timezone conversion utilities

Integration tests cover:
- **Basic proxy functionality**: Request routing, response handling
- **Error handling**: Authentication, model not found, timeouts, streaming errors
- **Streaming**: SSE format, client disconnects, error propagation

## Writing New Tests

### Unit Tests

Use pytest fixtures from `conftest.py`:

```python
def test_something(temp_db, sample_response):
    # Test using temporary database and sample data
    pass
```

### Integration Tests

Integration tests require a running server at http://localhost:4000:

```python
import requests

response = requests.post(
    "http://localhost:4000/v1/chat/completions",
    json={"model": "gpt-4", "messages": [...]}
)
assert response.status_code == 200
```

## Development Dependencies

Install with:

```bash
pip install -r requirements-dev.txt
```

Includes:
- pytest: Test framework
- pytest-asyncio: Async test support (for future Phase 3)
