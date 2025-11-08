# Error Handling Design Document

## Overview

This document records the design decisions and implementation approach for error handling in Apantli.

## Design Decisions

### Timeout Strategy

**Decision**: 120 second default timeout with per-model override capability

**Rationale**:
- LiteLLM default (600s/10min) is too long for interactive use
- 120s balances patience for slow providers vs user experience
- Per-model config allows tuning (e.g., lower for fast models, higher for slow ones)

**Implementation**: Global `--timeout` CLI arg + `timeout` in `litellm_params`

### Retry Strategy

**Decision**: 3 retries by default for transient errors

**Rationale**:
- Provider overload (Anthropic 529) and rate limits (429) are often temporary
- 3 retries = 4 total attempts, reasonable for transient issues
- Exponential backoff handled by LiteLLM internally
- Configurable per-model for high-value operations

**Retry-eligible errors**: RateLimitError, InternalServerError, ServiceUnavailableError

### Streaming Error Recovery

**Decision**: Send SSE error event, then close stream gracefully

**Format**:
```
data: {"error": {"message": "...", "type": "...", "code": "..."}}\n\n
data: [DONE]\n\n
```

**Rationale**:
- Prioritizes diagnosis: client receives error details
- Enables recovery: client knows stream ended due to error vs completion
- OpenAI-compatible: follows SSE error event pattern
- Clean termination: always send [DONE] to signal end

### Socket Error Handling

**Decision**: Proactive disconnection detection + log once per request

**Rationale**:
- Client disconnections are normal (user closes browser, network hiccup)
- Spamming logs with "socket.send() raised exception" is noise
- Proactive detection stops processing immediately, saving resources
- INFO level: expected behavior, not a server problem

**Implementation**:

1. **Proactive detection**: Check `await request.is_disconnected()` at start of each loop iteration
   ```python
   async def execute_streaming_request(..., request: Request):
       for chunk in response:
           if await request.is_disconnected():
               logging.info("Client disconnected during streaming")
               return
   ```

2. **Benefits**:
   - Stops processing immediately when client disconnects
   - `await` point enables event loop processing (Ctrl+C works)
   - No console spam from socket.send() exceptions
   - Saves resources by not processing unwanted responses

3. **Exception handling**: Socket errors (BrokenPipeError, ConnectionError) caught and logged once per request

### HTTP Status Code Mapping

**Decision**: Use standard HTTP status codes matching error type

| LiteLLM Exception | HTTP Status | Retry? | Notes |
|:------------------|:------------|:-------|:------|
| BadRequestError | 400 | No | Invalid request parameters (e.g., top_p > 1.0) |
| RateLimitError | 429 | Yes (with Retry-After header) | Provider rate limit exceeded |
| AuthenticationError | 401 | No | Invalid or missing API key |
| PermissionDeniedError | 403 | No | API key lacks permissions |
| NotFoundError | 404 | No | Provider-side resource not found |
| UnknownModel | 404 | No | Model not in config.yaml, returns list of available models |
| InternalServerError | 503 | Yes | Provider internal error |
| ServiceUnavailableError | 503 | Yes | Provider temporarily unavailable |
| Timeout | 504 | Yes | Request exceeded timeout limit |
| APIConnectionError | 502 | Yes | Cannot connect to provider |
| Other/Unknown | 500 | No | Unexpected error |

**Rationale**: Standard HTTP semantics make client integration easier

### Error Response Format

**Decision**: OpenAI-compatible error response format

```json
{
  "error": {
    "message": "Human-readable error message",
    "type": "invalid_request_error",
    "code": "rate_limit_exceeded"
  }
}
```

**Rationale**:
- OpenAI SDK and other clients expect this format
- Consistent with our OpenAI-compatible API design
- Includes structured error info for programmatic handling

### Per-Model Configuration

**Decision**: Pass all `litellm_params` through to LiteLLM, except special-handled keys

**Special keys** (handled by Apantli):
- `model` - remapped to provider/model format
- `api_key` - resolved from environment

**Pass-through keys** (sent to LiteLLM as-is):
- `timeout`
- `num_retries`
- `temperature`
- `max_tokens`
- `top_p`
- Any other LiteLLM-supported parameter

**Rationale**:
- Maximum flexibility without code changes
- Supports all LiteLLM features automatically
- Clear separation: we handle routing/auth, LiteLLM handles everything else

### LiteLLM Logging Suppression

**Decision**: Suppress LiteLLM's verbose logging and feedback messages

**Problem**: LiteLLM by default logs verbose debugging info and "Give Feedback / Get Help" messages to console, cluttering server output.

**Implementation**:
```python
# Set before initializing LiteLLM
os.environ['LITELLM_LOG'] = 'ERROR'
litellm.suppress_debug_info = True
litellm.set_verbose = False
```

**Rationale**:
- Keeps server logs clean and focused on Apantli operations
- Reduces noise during normal operation
- ERROR level still shows critical LiteLLM issues
- Can be overridden with `export LITELLM_LOG=DEBUG` for debugging

### Client-Side Parameter Validation

**Decision**: Validate and clamp parameters in Playground before sending requests

**Problem**: Users can bypass HTML input constraints by typing directly, causing 400 errors for invalid values.

**Implementation** (in compare.js):
- `temperature`: clamped to [0, 2]
- `top_p`: clamped to [0, 1]
- `max_tokens`: clamped to [1, ∞)

**Rationale**:
- Prevents user errors before they reach the server
- Better UX than server-side errors
- Matches provider parameter constraints
- HTML constraints alone are insufficient (can be bypassed)

## Implementation Progress

### Completed

**Phase 1: Configuration & Setup** ✅
- Added `DEFAULT_TIMEOUT = 120` and `DEFAULT_RETRIES = 3` module-level globals
- Added CLI arguments: `--timeout` and `--retries`
- Imported all LiteLLM exception classes
- Updated `load_config()` to store all `litellm_params` (not just model/api_key)
- Updated `chat_completions()` to pass through all litellm_params
- Applied global defaults when not specified in config or request

**Phase 2: Non-Streaming Error Handling** ✅
- Created `build_error_response()` helper for OpenAI-compatible error format
- Added specific exception handlers with proper HTTP status codes:
  - `RateLimitError` → 429
  - `AuthenticationError` → 401
  - `PermissionDeniedError` → 403
  - `NotFoundError` → 404
  - `Timeout` → 504
  - `InternalServerError/ServiceUnavailableError` → 503
  - `APIConnectionError` → 502
  - Generic `Exception` → 500
- All errors logged to database with context
- Provider inferred from model name for error logging

**Phase 3: Streaming Error Handling** ✅
- Wrapped streaming loop in comprehensive try/except
- **Proactive disconnection detection**: `await request.is_disconnected()` at start of each loop
- Inner loop catches socket errors (`BrokenPipeError`, `ConnectionError`, `ConnectionResetError`)
- Outer loop catches LiteLLM exceptions (rate limit, timeout, etc.)
- Socket errors logged once per request (no spam)
- Provider errors send SSE error event: `data: {"error": {...}}\n\n`
- Always sends `data: [DONE]\n\n` in finally block
- Database logging always attempted with error context
- Graceful handling when client disconnects before error can be sent
- Enables Ctrl+C interrupts via `await` in loop

**Phase 4: Additional Improvements** ✅
- Added `BadRequestError` handling (400 status) for parameter validation errors
- Suppressed LiteLLM verbose logging (`LITELLM_LOG='ERROR'`)
- Client-side parameter validation in Playground (temperature, top_p, max_tokens)

### In Progress
- Testing and validation

### Blocked
- (None)

## Dependencies

**Important**: The retry functionality requires the `tenacity` library. While LiteLLM lists it as optional, it's required if you use `num_retries` parameter.

Without `tenacity`, you'll see:
```
UnexpectedError: tenacity import failed please run `pip install tenacity`
```

The dependency is included in Apantli's `pyproject.toml` and will be installed automatically with `uv sync`.

## Open Questions

- Should we log retries (to track which providers are flaky)?
- Should dashboard display error rates by provider?
- Do we need circuit breaker pattern for consistently failing providers?

## Testing Strategy

### Test Script: `test_error_handling.py`

Comprehensive test script covering all error scenarios. Located at project root.

**Usage**:
```bash
# Start server
apantli

# Run tests in another terminal
python test_error_handling.py
```

**Tests Included**:

1. **Normal Request** - Baseline test to verify basic functionality
2. **Authentication Error** - Tests 401 handling with invalid API key
3. **Model Not Found** - Tests 404/500 handling with nonexistent model
4. **Normal Streaming** - Validates streaming works and [DONE] is sent
5. **Streaming Disconnect** - Tests client disconnect handling (check logs for deduplication)
6. **Error Response Format** - Validates OpenAI-compatible error structure

**Features**:
- Color-coded output for readability
- Detailed logging of responses and status codes
- Validates error response structure
- Tests socket error deduplication (check server logs)
- Summary report at end

**Manual Tests** (not automated):

1. **Timeout testing**: Start server with `apantli --timeout 5`, make request to slow model
2. **Retry testing**: Trigger rate limit or overload (requires hitting actual limits)
3. **Provider overload**: Wait for Anthropic 529 error in production use
4. **Streaming disconnection**:
   - Start server and open Playground at http://localhost:4000/compare
   - Start a streaming request with a slow model
   - Close browser tab or stop request mid-stream
   - Server should log clean disconnection without spam
   - Verify only one "Client disconnected" message appears in logs
5. **Parameter validation**: In Playground, try entering invalid values (e.g., top_p: 1.5) and verify they're clamped before sending

## References

### FastAPI Streaming Disconnection Handling
- [Understanding Client Disconnection in FastAPI](https://fastapiexpert.com/blog/2024/06/06/understanding-client-disconnection-in-fastapi/)
- [FastAPI Discussion: Client Disconnection](https://github.com/fastapi/fastapi/discussions/7572)
- [Uvicorn Issue: Client Disconnection](https://github.com/Kludex/uvicorn/issues/2271)

### LiteLLM Logging Suppression
- [LiteLLM Issue #4825: Logging Configuration](https://github.com/BerriAI/litellm/issues/4825)
- [LiteLLM Issue #5942: Suppress Feedback Messages](https://github.com/BerriAI/litellm/issues/5942)
- [LiteLLM Docs: Proxy Logging](https://docs.litellm.ai/docs/proxy/logging)

### Related Documentation
- [ARCHITECTURE.md](ARCHITECTURE.md) - Overall system design
- [TESTING.md](TESTING.md) - Complete testing procedures
