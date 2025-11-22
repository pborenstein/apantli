"""Unit tests for LLM provider inference."""

import pytest
from apantli.llm import infer_provider_from_model


def test_infer_provider_openai():
  """Test OpenAI model patterns."""
  assert infer_provider_from_model("gpt-4") == "openai"
  assert infer_provider_from_model("gpt-4.1-mini") == "openai"
  assert infer_provider_from_model("gpt-4o") == "openai"
  assert infer_provider_from_model("o1-preview") == "openai"
  assert infer_provider_from_model("o1-mini") == "openai"
  assert infer_provider_from_model("text-davinci-003") == "openai"
  assert infer_provider_from_model("text-curie-001") == "openai"


def test_infer_provider_anthropic():
  """Test Anthropic model patterns."""
  assert infer_provider_from_model("claude-3-opus") == "anthropic"
  assert infer_provider_from_model("claude-3-sonnet") == "anthropic"
  assert infer_provider_from_model("claude-3-haiku") == "anthropic"
  assert infer_provider_from_model("claude-sonnet-4") == "anthropic"
  assert infer_provider_from_model("claude-sonnet-4-5") == "anthropic"
  # Case insensitive
  assert infer_provider_from_model("Claude-3-Opus") == "anthropic"


def test_infer_provider_google():
  """Test Google/Gemini model patterns."""
  assert infer_provider_from_model("gemini-pro") == "gemini"
  assert infer_provider_from_model("gemini-1.5-flash") == "gemini"
  assert infer_provider_from_model("palm-2") == "gemini"


def test_infer_provider_mistral():
  """Test Mistral model patterns."""
  assert infer_provider_from_model("mistral-medium") == "mistral"
  assert infer_provider_from_model("mistral-small") == "mistral"
  assert infer_provider_from_model("mistral-large") == "mistral"


def test_infer_provider_meta():
  """Test Meta/Llama model patterns."""
  assert infer_provider_from_model("llama-2-70b") == "meta"
  assert infer_provider_from_model("llama-3-8b") == "meta"


def test_infer_provider_with_prefix():
  """Test explicit provider prefix extraction."""
  assert infer_provider_from_model("openai/gpt-4") == "openai"
  assert infer_provider_from_model("anthropic/claude-3-opus") == "anthropic"
  assert infer_provider_from_model("gemini/gemini-pro") == "gemini"
  assert infer_provider_from_model("custom/my-model") == "custom"


def test_infer_provider_unknown():
  """Test unknown model patterns."""
  assert infer_provider_from_model("unknown-model-xyz") == "unknown"
  assert infer_provider_from_model("some-random-model") == "unknown"
  assert infer_provider_from_model("") == "unknown"


def test_infer_provider_empty_input():
  """Test handling of empty/None input."""
  assert infer_provider_from_model("") == "unknown"
  assert infer_provider_from_model(None) == "unknown"
