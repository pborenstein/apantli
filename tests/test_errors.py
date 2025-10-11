"""Unit tests for error response formatting."""

import pytest
from apantli.errors import build_error_response


def test_build_error_response_basic():
  """Test basic error response structure."""
  response = build_error_response("invalid_request_error", "Test error message")

  assert "error" in response
  assert response["error"]["type"] == "invalid_request_error"
  assert response["error"]["message"] == "Test error message"
  assert "code" not in response["error"]


def test_build_error_response_with_code():
  """Test error response with error code."""
  response = build_error_response(
    "rate_limit_error",
    "Rate limit exceeded",
    "rate_limit_exceeded"
  )

  assert response["error"]["type"] == "rate_limit_error"
  assert response["error"]["message"] == "Rate limit exceeded"
  assert response["error"]["code"] == "rate_limit_exceeded"


def test_build_error_response_openai_format():
  """Test OpenAI-compatible error format."""
  response = build_error_response(
    "authentication_error",
    "Invalid API key",
    "invalid_api_key"
  )

  # Should match OpenAI error structure
  assert isinstance(response, dict)
  assert "error" in response
  assert isinstance(response["error"], dict)
  assert "message" in response["error"]
  assert "type" in response["error"]


def test_build_error_response_various_types():
  """Test different error types."""
  error_types = [
    "invalid_request_error",
    "authentication_error",
    "permission_denied",
    "rate_limit_error",
    "service_unavailable",
    "timeout_error",
    "connection_error",
    "api_error"
  ]

  for error_type in error_types:
    response = build_error_response(error_type, f"Test {error_type}")
    assert response["error"]["type"] == error_type
    assert response["error"]["message"] == f"Test {error_type}"


def test_build_error_response_long_message():
  """Test error response with long message."""
  long_message = "A" * 1000
  response = build_error_response("api_error", long_message)

  assert response["error"]["message"] == long_message
  assert len(response["error"]["message"]) == 1000


def test_build_error_response_special_characters():
  """Test error response with special characters in message."""
  special_message = 'Error with "quotes" and \'apostrophes\' and <tags> and &ampersands'
  response = build_error_response("api_error", special_message)

  assert response["error"]["message"] == special_message
