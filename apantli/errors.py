"""Error handling utilities for OpenAI-compatible error responses."""

import json
import re
from typing import Optional, Tuple
from litellm.exceptions import (
    RateLimitError,
    InternalServerError,
    ServiceUnavailableError,
    APIConnectionError,
    AuthenticationError,
    Timeout,
    PermissionDeniedError,
    NotFoundError,
    BadRequestError,
)


# Error mapping for LLM API exceptions
# Maps exception type to (HTTP status code, error_type, error_code)
ERROR_MAP = {
    BadRequestError: (400, "invalid_request_error", "bad_request"),
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


def build_error_response(error_type: str, message: str, code: Optional[str] = None) -> dict:
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


def extract_error_message(exception: Exception) -> str:
  """Extract clean error message from LiteLLM exception.

  LiteLLM exceptions often contain verbose nested error messages like:
  "litellm.BadRequestError: AnthropicException - b'{...JSON...}'"

  This function extracts the meaningful error message from the provider.

  Args:
    exception: The exception to extract from

  Returns:
    Clean error message string
  """
  error_str = str(exception)

  # Try to extract JSON-embedded error message (common in Anthropic errors)
  # Pattern: b'{"type":"error","error":{"message":"actual message"}}'
  # Use non-greedy match and handle nested braces
  json_match = re.search(r"b'(\{.+\})'", error_str, re.DOTALL)
  if json_match:
    try:
      json_str = json_match.group(1)
      # Replace escaped quotes to handle JSON properly
      json_str = json_str.replace(r'\"', '"')
      error_data = json.loads(json_str)

      # Anthropic format: {"error":{"message":"..."}}
      if 'error' in error_data and 'message' in error_data['error']:
        return str(error_data['error']['message'])

      # Alternative format: {"message":"..."}
      if 'message' in error_data:
        return str(error_data['message'])
    except (json.JSONDecodeError, KeyError):
      pass

  # Try to extract from OpenAI-style error format
  # Pattern: {"error": {"message": "..."}}
  try:
    if error_str.strip().startswith('{'):
      error_data = json.loads(error_str)
      if 'error' in error_data and 'message' in error_data['error']:
        return str(error_data['error']['message'])
      if 'message' in error_data:
        return str(error_data['message'])
  except (json.JSONDecodeError, ValueError):
    pass

  # Fallback: strip the verbose LiteLLM prefix if present
  # Pattern: "litellm.ErrorType: ProviderException - actual message"
  prefix_match = re.match(r'litellm\.\w+:\s+\w+Exception\s+-\s+(.+)', error_str)
  if prefix_match:
    # If we couldn't extract JSON, return the part after the dash
    return prefix_match.group(1)

  # Final fallback: return the original error string
  return error_str
