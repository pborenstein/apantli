# Error Handling Improvements

This document covers multiple error handling fixes implemented on 2025-11-07.

## 1. Streaming Client Disconnection Fix

## Problem

When a client disconnected during a streaming response, the server would:
1. Spam console with `WARNING:asyncio:socket.send() raised exception.` repeatedly
2. Not respond to Ctrl+C interrupt signals
3. Continue pulling chunks from LiteLLM and trying to send to dead socket
4. Waste resources processing responses that would never be delivered

## Root Cause

The streaming generator in `execute_streaming_request()` had two issues:

1. **No proactive disconnection detection**: The code only caught exceptions from `yield` operations, but asyncio's socket.send() warnings occurred at a lower level and didn't propagate as catchable exceptions to the generator.

2. **No await points in loop**: The tight loop had no `await` statements, preventing:
   - AsyncIO event loop from processing cancellation signals
   - Ctrl+C from being handled
   - Clean shutdown when exceptions occurred elsewhere

## Solution

Modified `execute_streaming_request()` in server.py:

1. **Added Request parameter**: Pass FastAPI `Request` object to access disconnection state
   ```python
   async def execute_streaming_request(..., request: Request):
   ```

2. **Proactive disconnection check**: Check `await request.is_disconnected()` at start of each loop iteration
   ```python
   for chunk in response:
       if await request.is_disconnected():
           logging.info("Client disconnected during streaming")
           return
   ```

3. **Simplified exception handling**:
   - Removed nested try-except around individual yields
   - Moved socket exceptions to outer handler that stops streaming immediately
   - Check disconnection before sending error events or [DONE]

4. **Benefits**:
   - Stops processing immediately when client disconnects (no spam)
   - `await` point enables event loop processing (Ctrl+C works)
   - Cleaner error handling with single responsibility
   - Saves resources by not processing unwanted responses

## Testing

To test this fix, trigger a client disconnection during streaming:
1. Start server: `python -m apantli.server`
2. Open playground: http://localhost:4000/compare
3. Start a streaming request with a slow model
4. Close the browser tab or stop the request mid-stream
5. Server should log clean disconnection without spam

Type checking and unit tests pass:
- `mypy apantli/` - Success: no issues found
- `python run_unit_tests.py` - 17 passed, 0 failed

## 2. BadRequestError Handling

**Problem**: Parameter validation errors (like `top_p: 1.5` when max is 1.0) returned 500 Internal Server Error instead of 400 Bad Request.

**Root Cause**: `BadRequestError` from LiteLLM was not in the exception mapping, so it fell through to the generic Exception handler.

**Solution**:
1. Added `BadRequestError` to imports in server.py and errors.py
2. Added to ERROR_MAP in errors.py: `BadRequestError: (400, "invalid_request_error", "bad_request")`
3. Added to exception handler list in server.py line 418-420

**Files Changed**:
- server.py:24-34 (imports)
- server.py:418-420 (exception handler)
- errors.py:4-14 (imports)
- errors.py:20 (error mapping)

## 3. LiteLLM Feedback Message Spam

**Problem**: Console flooded with "Give Feedback / Get Help: https://github.com/BerriAI/litellm/issues/new" messages.

**Root Cause**: LiteLLM's default logging was not fully suppressed despite `suppress_debug_info = True`.

**Solution**: Set environment variable `LITELLM_LOG='ERROR'` before initializing LiteLLM (server.py:730).

**Files Changed**:
- server.py:730 (added `os.environ['LITELLM_LOG'] = 'ERROR'`)

## 4. Playground Parameter Validation

**Problem**: Users could set invalid parameter values (e.g., top_p > 1.0) by typing directly into inputs, bypassing HTML validation.

**Root Cause**: HTML input constraints can be bypassed. No JavaScript validation before sending request.

**Solution**: Added parameter clamping in compare.js before sending requests:
- `temperature`: clamped to [0, 2]
- `top_p`: clamped to [0, 1]
- `max_tokens`: clamped to [1, ∞)

**Files Changed**:
- compare.js:219-222 (parameter validation)

## Testing

All fixes tested with:
- `mypy apantli/` - Success: no issues found
- `python run_unit_tests.py` - 17 passed, 0 failed

Integration test for BadRequestError:
1. Start server: `python -m apantli.server`
2. Send request with `top_p: 1.5`
3. Should receive 400 Bad Request (not 500)
4. No "Give Feedback" spam in console

## Related

FastAPI streaming disconnection handling:
- https://fastapiexpert.com/blog/2024/06/06/understanding-client-disconnection-in-fastapi/
- https://github.com/fastapi/fastapi/discussions/7572
- https://github.com/Kludex/uvicorn/issues/2271

LiteLLM logging suppression:
- https://github.com/BerriAI/litellm/issues/4825
- https://github.com/BerriAI/litellm/issues/5942
- https://docs.litellm.ai/docs/proxy/logging
