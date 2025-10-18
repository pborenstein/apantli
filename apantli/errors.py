"""Error handling utilities for OpenAI-compatible error responses."""

from typing import Tuple
from litellm.exceptions import (
    RateLimitError,
    InternalServerError,
    ServiceUnavailableError,
    APIConnectionError,
    AuthenticationError,
    Timeout,
    PermissionDeniedError,
    NotFoundError,
)


# Error mapping for LLM API exceptions
# Maps exception type to (HTTP status code, error_type, error_code)
ERROR_MAP = {
    RateLimitError: (429, "rate_limit_error", "rate_limit_exceeded"),
    AuthenticationError: (401, "authentication_error", "invalid_api_key"),
    PermissionDeniedError: (403, "permission_denied", "permission_denied"),
    NotFoundError: (404, "invalid_request_error", "model_not_found"),
    Timeout: (504, "timeout_error", "request_timeout"),
    InternalServerError: (503, "service_unavailable", "service_unavailable"),
    ServiceUnavailableError: (503, "service_unavailable", "service_unavailable"),
    APIConnectionError: (502, "connection_error", "connection_error"),
}


def get_error_details(exception: Exception) -> Tuple[int, str, str]:
  """Get HTTP status, error type, and error code for an exception.

  Args:
    exception: The exception to map

  Returns:
    Tuple of (status_code, error_type, error_code)
  """
  for exc_type, (code, etype, ecode) in ERROR_MAP.items():
    if isinstance(exception, exc_type):
      return code, etype, ecode

  # Default for unknown errors
  return 500, "api_error", "internal_error"


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
