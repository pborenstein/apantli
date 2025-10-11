"""Error handling utilities for OpenAI-compatible error responses."""


def build_error_response(error_type: str, message: str, code: str = None) -> dict:
  """Build OpenAI-compatible error response.

  Args:
    error_type: Error type (e.g., 'invalid_request_error', 'rate_limit_error')
    message: Human-readable error message
    code: Optional error code

  Returns:
    Dictionary with error structure matching OpenAI format
  """
  error_obj = {
    "message": message,
    "type": error_type,
  }
  if code:
    error_obj["code"] = code

  return {"error": error_obj}
