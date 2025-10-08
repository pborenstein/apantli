# Error Handling Implementation Plan

## Issues to Fix

1. **No timeout configured** - LiteLLM defaults to 600s (10 min), too long for interactive use
2. **Streaming errors crash mid-response** - Exception at line 260 happens after HTTP 200 sent
3. **No specific exception handling** - Broad catch-all doesn't return proper HTTP status codes
4. **Socket errors unhandled** - Client disconnections cause cryptic "socket.send()" errors
5. **No retry logic** - Transient failures (rate limits, overloaded) fail immediately

## Implementation Checklist

### Phase 1: Configuration & Setup

- [x] Add timeout configuration system
  - [x] Default timeout: 120 seconds
  - [x] CLI arg: `--timeout` (global default)
  - [x] Per-model timeout in config.yaml
  - [x] Per-model temperature and other litellm_params passthrough
- [x] Add retry configuration
  - [x] Default: 3 retries for transient errors
  - [x] CLI arg: `--retries`
  - [x] Per-model retry config
- [x] Import LiteLLM exception classes

### Phase 2: Non-Streaming Error Handling

- [x] Add specific exception handlers with proper HTTP status codes
  - [x] `RateLimitError` → 429
  - [x] `InternalServerError/ServiceUnavailableError` → 503
  - [x] `AuthenticationError` → 401
  - [x] `Timeout` → 504 Gateway Timeout
  - [x] `APIConnectionError` → 502 Bad Gateway
  - [x] `PermissionDeniedError` → 403
  - [x] `NotFoundError` → 404
- [x] Return OpenAI-compatible error format
- [x] Improve error logging with context

### Phase 3: Streaming Error Handling

- [x] Wrap streaming loop in try/except inside generator
- [x] Send SSE error event on failure: `data: {"error": {...}}\n\n`
- [x] Catch socket errors (BrokenPipeError, ConnectionError, ConnectionResetError)
- [x] Consolidate socket error logging (avoid spam)
- [x] Always attempt database logging in finally block

### Phase 4: Testing & Validation

Test script created: `test_error_handling.py`

Automated tests:
- [x] Create test script with color-coded output
- [ ] Test normal request (baseline)
- [ ] Test authentication error (401)
- [ ] Test model not found (404/500)
- [ ] Test normal streaming
- [ ] Test client disconnection during streaming
- [ ] Test error response format validation

Manual tests needed:
- [ ] Test timeout behavior (requires `apantli --timeout 5`)
- [ ] Test rate limit handling (requires hitting actual limits)
- [ ] Test provider overload (Anthropic 529 in production)
- [ ] Verify no log spam from socket errors (check logs during disconnect test)
- [ ] Test error logging and database records (query DB after tests)

## Configuration Schema Changes

### config.yaml additions:

```yaml
model_list:
  - model_name: gpt-4.1-mini
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: os.environ/OPENAI_API_KEY
      timeout: 60              # NEW: per-model timeout
      num_retries: 3           # NEW: per-model retries
      temperature: 0.7         # NEW: allow any litellm param
      max_tokens: 4096         # NEW: allow any litellm param
```

All `litellm_params` (except `model` and `api_key` which we handle specially) should be passed through to LiteLLM.
