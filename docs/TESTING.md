# Testing Guide

## Overview

Apantli includes comprehensive unit tests and integration tests to validate functionality, especially error handling and edge cases.

**Test Suite**:
- 70 total test cases across all modules
- Unit tests: Fast (<1 second), no API keys required, test individual modules
- Integration tests: Require running server and API keys, test end-to-end functionality

## Unit Tests

**Location**: `tests/` directory

**Prerequisites**:
- Python 3.13+
- Development dependencies: `pip install -r requirements-dev.txt`
- No running server required
- No API keys required

**Running Unit Tests**:

```bash
# Run all unit tests
pytest tests/ -v

# Run specific module tests
pytest tests/test_config.py -v
pytest tests/test_database.py -v
pytest tests/test_llm.py -v
pytest tests/test_errors.py -v
pytest tests/test_utils.py -v

# Run with coverage report
pytest tests/ --cov=apantli --cov-report=html
```

**What Unit Tests Cover**:

| Module | Tests | Description |
|:-------|:------|:------------|
| test_config.py | Configuration loading | YAML parsing, Pydantic validation, API key format, env var warnings |
| test_database.py | Database operations | Schema creation, async logging, cost calculation, API key redaction |
| test_llm.py | Provider inference | Pattern matching for gpt-*, claude*, gemini*, etc. |
| test_errors.py | Error formatting | OpenAI-compatible error responses, status code mapping |
| test_utils.py | Utility functions | Timezone conversion for date filtering |

**Features**:
- Fast execution (<1 second total)
- Uses pytest fixtures (conftest.py) for shared test data
- Uses temporary databases for isolation
- No external dependencies or API calls

See [tests/README.md](../tests/README.md) for detailed unit test documentation.

## Integration Tests

Integration tests require a running server and valid API keys.

### Error Handling Tests

Comprehensive test suite for error handling, timeouts, retries, and streaming behavior.

**Location**: `tests/integration/test_error_handling.py`

**Prerequisites**:
- Server running at `http://localhost:4000`
- Valid API keys configured in `.env`
- Python 3.13+ with `requests` library

**Running Tests**:

```bash
# Terminal 1: Start server
apantli

# Terminal 2: Run integration tests
python tests/integration/test_error_handling.py
python tests/integration/test_proxy.py
```

**What It Tests**:

| Test | Description | Expected Result |
|:-----|:------------|:----------------|
| Normal Request | Baseline functionality | 200 OK with response |
| Authentication Error | Invalid API key handling | 401 with error object |
| Model Not Found | Nonexistent model handling | 404 or 500 with error object |
| Normal Streaming | SSE streaming with [DONE] | 200 OK with chunks and [DONE] |
| Streaming Disconnect | Client disconnect mid-stream | Server logs once, no spam |
| Error Response Format | OpenAI-compatible errors | Proper `{"error": {...}}` structure |

**Output**:
- Color-coded results (green=pass, red=fail)
- Detailed response logging
- Summary report with pass/fail counts

**Interpreting Results**:

- **PASS**: Feature working as expected
- **FAIL**: Issue detected, review output for details
- Check server logs during "Streaming Disconnect" test - should see exactly ONE "Client disconnected" message

## Manual Tests

Some scenarios require manual testing or specific conditions.

### 1. Timeout Testing

**Objective**: Verify timeout handling works correctly

**Steps**:
1. Start server with low timeout: `apantli --timeout 5`
2. Make request to slow model or with large response
3. Verify 504 Gateway Timeout returned
4. Check database for logged timeout error

**Expected**:
- HTTP 504 status code
- Error response: `{"error": {"type": "timeout_error", "message": "...", "code": "request_timeout"}}`
- Database entry with `error` column populated

### 2. Rate Limit Testing

**Objective**: Verify rate limit handling and retries

**Steps**:
1. Make many rapid requests to trigger provider rate limit
2. Observe retry behavior (should retry 3 times by default)
3. Verify 429 status code returned if retries exhausted

**Expected**:
- Automatic retries (check logs for retry attempts)
- HTTP 429 if retries fail
- Error response: `{"error": {"type": "rate_limit_error", "code": "rate_limit_exceeded"}}`

### 3. Provider Overload Testing

**Objective**: Verify handling of Anthropic 529 "Overloaded" errors

**Steps**:
1. Use Apantli during peak load times when Anthropic is overloaded
2. Observe error handling in production
3. Verify retries happen automatically

**Expected**:
- Streaming requests show error SSE event: `data: {"error": {...}}`
- Non-streaming requests return 503 Service Unavailable
- Automatic retries (3 attempts by default)
- Database logged with error context

### 4. Socket Error Logging

**Objective**: Verify socket errors don't spam logs

**Steps**:
1. Run `test_error_handling.py` and watch server logs
2. Note "Streaming Disconnect" test
3. Count log messages for client disconnection

**Expected**:
- Exactly ONE log message: "Client disconnected during streaming: BrokenPipeError"
- No repeated "socket.send() raised exception" spam
- Database entry logged with partial response

### 5. Database Error Logging

**Objective**: Verify errors are logged correctly

**Steps**:
1. Run test suite
2. Query database for error records:
   ```sql
   SELECT timestamp, model, provider, error
   FROM requests
   WHERE error IS NOT NULL
   ORDER BY timestamp DESC
   LIMIT 10;
   ```

**Expected**:
- All errors logged with context
- `error` column contains error type and message
- `provider` correctly inferred from model
- `duration_ms` tracked even on failure

## Per-Model Configuration Testing

### Objective: Verify per-model parameters work

**Setup**: Add to `config.yaml`:
```yaml
- model_name: gpt-4.1-mini-fast
  litellm_params:
    model: openai/gpt-4.1-mini
    api_key: os.environ/OPENAI_API_KEY
    timeout: 30
    num_retries: 5
    temperature: 0.3
    max_tokens: 100
```

**Steps**:
1. Restart server to load config
2. Make request to `gpt-4.1-mini-fast`
3. Verify parameters applied (check response for token limit, etc.)

**Expected**:
- Custom timeout used (30s instead of default 120s)
- Custom retries used (5 instead of default 3)
- Temperature applied to request
- Max tokens limit respected

## Performance Testing

### Concurrent Requests

**Objective**: Verify concurrent request handling

**Setup**: Use tool like Apache Bench or custom script

```bash
# Install Apache Bench
brew install apache-bench  # macOS

# Run concurrent requests
ab -n 100 -c 10 -p payload.json -T application/json \
   http://localhost:4000/v1/chat/completions
```

**Expected**:
- All requests complete successfully
- SQLite handles concurrent writes
- No database lock errors
- Response times reasonable

### Memory Usage

**Objective**: Verify no memory leaks

**Steps**:
1. Start server and note memory usage: `ps aux | grep apantli`
2. Run many requests (1000+)
3. Check memory usage again

**Expected**:
- Memory usage remains stable
- No significant growth over time
- Baseline: ~50-100 MB

## Continuous Validation

### In Production

Monitor these metrics in production use:

1. **Error rates** by provider (check dashboard or query DB)
2. **Retry success rates** (requires adding retry logging)
3. **Average response times** (available in dashboard)
4. **Socket errors** (should be rare in server logs)
5. **Timeout frequency** (adjust timeout if too frequent)

### Database Queries for Monitoring

```sql
-- Error rate by provider (last 24 hours)
SELECT
  provider,
  COUNT(*) as total_requests,
  SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as errors,
  ROUND(100.0 * SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 2) as error_rate_pct
FROM requests
WHERE timestamp > datetime('now', '-24 hours')
GROUP BY provider;

-- Most common errors
SELECT
  SUBSTR(error, 1, 50) as error_prefix,
  COUNT(*) as count
FROM requests
WHERE error IS NOT NULL
GROUP BY error_prefix
ORDER BY count DESC
LIMIT 10;

-- Timeout frequency
SELECT
  DATE(timestamp) as date,
  COUNT(*) as timeout_count
FROM requests
WHERE error LIKE '%Timeout%'
GROUP BY DATE(timestamp)
ORDER BY date DESC
LIMIT 7;
```

## Troubleshooting Tests

### Test Script Fails to Connect

**Issue**: `Server is not running at http://localhost:4000`

**Solutions**:
1. Check server is running: `ps aux | grep apantli`
2. Check port: `lsof -i :4000`
3. Start server: `apantli`
4. Check firewall settings

### Authentication Error Test Passes Unexpectedly

**Issue**: Expected 401 but got 200

**Explanation**: This happens if:
1. Server has valid API key configured
2. LiteLLM accepts the request despite override

**Resolution**: This is informational, not a failure

### Streaming Disconnect Shows Multiple Log Lines

**Issue**: Expected one log line, seeing multiple

**Investigation**:
1. Check if multiple tests ran
2. Check for different error types (socket vs provider error)
3. Review streaming error handling code

**Expected**: One line per request, not per chunk

## Future Test Additions

Potential tests to add:

1. **Load testing**: Sustained high request rate
2. **Cost calculation accuracy**: Verify LiteLLM costs match provider bills
3. **Dashboard tests**: Selenium/Playwright for UI testing
4. **Integration tests**: Test with actual OpenAI SDK client
5. **Backup/restore tests**: Database integrity after restart
