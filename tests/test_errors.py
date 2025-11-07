"""Unit tests for error response formatting."""

import pytest
from apantli.errors import build_error_response, extract_error_message


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


def test_extract_error_message_anthropic_format():
  """Test extracting error from Anthropic-style JSON embedded in exception."""
  error_str = 'litellm.BadRequestError: AnthropicException - b\'{"type":"error","error":{"type":"invalid_request_error","message":"temperature: range: 0..1"},"request_id":"req_123"}\''

  class MockException(Exception):
    pass

  exc = MockException(error_str)
  result = extract_error_message(exc)

  assert result == "temperature: range: 0..1"


def test_extract_error_message_anthropic_complex():
  """Test extracting complex Anthropic error message with special characters."""
  error_str = 'litellm.BadRequestError: AnthropicException - b\'{"type":"error","error":{"type":"invalid_request_error","message":"`temperature` and `top_p` cannot both be specified for this model. Please use only one."},"request_id":"req_456"}\''

  class MockException(Exception):
    pass

  exc = MockException(error_str)
  result = extract_error_message(exc)

  assert result == "`temperature` and `top_p` cannot both be specified for this model. Please use only one."


def test_extract_error_message_simple_string():
  """Test extracting error from simple string exception."""
  error_str = "Simple error message"

  class MockException(Exception):
    pass

  exc = MockException(error_str)
  result = extract_error_message(exc)

  assert result == "Simple error message"


def test_extract_error_message_openai_format():
  """Test extracting error from OpenAI-style JSON exception."""
  error_str = '{"error": {"message": "Invalid request", "type": "invalid_request_error"}}'

  class MockException(Exception):
    pass

  exc = MockException(error_str)
  result = extract_error_message(exc)

  assert result == "Invalid request"


def test_extract_error_message_litellm_prefix():
  """Test extracting error with LiteLLM prefix but no JSON."""
  error_str = "litellm.RateLimitError: OpenAIException - Rate limit exceeded"

  class MockException(Exception):
    pass

  exc = MockException(error_str)
  result = extract_error_message(exc)

  # Should extract the part after the dash
  assert "Rate limit exceeded" in result


def test_extract_error_message_fallback():
  """Test fallback for unrecognized error format."""
  error_str = "Some random error format that doesn't match any pattern"

  class MockException(Exception):
    pass

  exc = MockException(error_str)
  result = extract_error_message(exc)

  # Should return original message when no pattern matches
  assert result == error_str
