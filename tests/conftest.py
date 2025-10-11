"""Shared pytest fixtures for Apantli tests."""

import pytest
import tempfile
import os
from pathlib import Path


@pytest.fixture
def temp_db(tmp_path):
  """Provide a temporary database path for testing."""
  db_path = tmp_path / "test.db"
  return str(db_path)


@pytest.fixture
def temp_config_file(tmp_path):
  """Provide a temporary config file path for testing."""
  config_path = tmp_path / "config.yaml"
  return str(config_path)


@pytest.fixture
def sample_config_content():
  """Provide sample valid config YAML content."""
  return """model_list:
  - model_name: gpt-4
    litellm_params:
      model: openai/gpt-4
      api_key: os.environ/OPENAI_API_KEY
  - model_name: claude-3
    litellm_params:
      model: anthropic/claude-3-opus-20240229
      api_key: os.environ/ANTHROPIC_API_KEY
      timeout: 180
      num_retries: 5
"""


@pytest.fixture
def sample_response():
  """Provide a sample LiteLLM response for testing."""
  return {
    'id': 'chatcmpl-123',
    'model': 'gpt-4',
    'choices': [{
      'message': {
        'role': 'assistant',
        'content': 'Test response'
      },
      'finish_reason': 'stop'
    }],
    'usage': {
      'prompt_tokens': 10,
      'completion_tokens': 20,
      'total_tokens': 30
    }
  }


@pytest.fixture
def sample_request_data():
  """Provide sample request data for testing."""
  return {
    'model': 'gpt-4',
    'messages': [
      {'role': 'user', 'content': 'Hello'}
    ],
    'api_key': 'sk-test-key-12345'
  }
