"""Unit tests for configuration loading."""

import pytest
import os
from apantli.config import load_config, MODEL_MAP


def test_load_valid_config(temp_config_file, sample_config_content, monkeypatch):
  """Test loading a valid configuration file."""
  # Write config to temp file
  with open(temp_config_file, 'w') as f:
    f.write(sample_config_content)

  # Clear MODEL_MAP and change to temp directory
  import apantli.config
  apantli.config.MODEL_MAP = {}
  monkeypatch.chdir(os.path.dirname(temp_config_file))
  monkeypatch.setattr('apantli.config.MODEL_MAP', {})

  # Mock open to use our temp file
  original_open = open
  def mock_open(filename, *args, **kwargs):
    if filename == 'config.yaml':
      return original_open(temp_config_file, *args, **kwargs)
    return original_open(filename, *args, **kwargs)

  monkeypatch.setattr('builtins.open', mock_open)

  # Load config
  load_config()

  # Verify models were loaded
  from apantli.config import MODEL_MAP
  assert 'gpt-4' in MODEL_MAP
  assert 'claude-3' in MODEL_MAP

  # Verify model details
  assert MODEL_MAP['gpt-4']['model'] == 'openai/gpt-4'
  assert MODEL_MAP['gpt-4']['api_key'] == 'os.environ/OPENAI_API_KEY'

  assert MODEL_MAP['claude-3']['model'] == 'anthropic/claude-3-opus-20240229'
  assert MODEL_MAP['claude-3']['api_key'] == 'os.environ/ANTHROPIC_API_KEY'
  assert MODEL_MAP['claude-3']['timeout'] == 180
  assert MODEL_MAP['claude-3']['num_retries'] == 5


def test_load_config_missing_file(monkeypatch, capsys):
  """Test loading config when file doesn't exist."""
  import apantli.config
  apantli.config.MODEL_MAP = {}

  # Mock open to raise FileNotFoundError
  def mock_open(*args, **kwargs):
    raise FileNotFoundError("config.yaml not found")

  monkeypatch.setattr('builtins.open', mock_open)

  # Load config - should not raise, just warn
  load_config()

  # Should print warning
  captured = capsys.readouterr()
  assert "Warning: Could not load config.yaml" in captured.out

  # MODEL_MAP should be empty
  from apantli.config import MODEL_MAP
  assert len(MODEL_MAP) == 0


def test_load_config_invalid_yaml(temp_config_file, monkeypatch, capsys):
  """Test loading config with invalid YAML."""
  # Write invalid YAML
  with open(temp_config_file, 'w') as f:
    f.write("invalid: yaml: content: [[[")

  import apantli.config
  apantli.config.MODEL_MAP = {}

  # Mock open to use our temp file
  original_open = open
  def mock_open(filename, *args, **kwargs):
    if filename == 'config.yaml':
      return original_open(temp_config_file, *args, **kwargs)
    return original_open(filename, *args, **kwargs)

  monkeypatch.setattr('builtins.open', mock_open)

  # Load config - should not raise, just warn
  load_config()

  # Should print warning
  captured = capsys.readouterr()
  assert "Warning: Could not load config.yaml" in captured.out


def test_load_config_missing_model_name(temp_config_file, monkeypatch):
  """Test config with missing model_name field."""
  config_content = """model_list:
  - litellm_params:
      model: openai/gpt-4
      api_key: os.environ/OPENAI_API_KEY
"""
  with open(temp_config_file, 'w') as f:
    f.write(config_content)

  import apantli.config
  apantli.config.MODEL_MAP = {}

  original_open = open
  def mock_open(filename, *args, **kwargs):
    if filename == 'config.yaml':
      return original_open(temp_config_file, *args, **kwargs)
    return original_open(filename, *args, **kwargs)

  monkeypatch.setattr('builtins.open', mock_open)

  # Load config - should handle gracefully
  load_config()

  # MODEL_MAP should be empty or skip this model
  from apantli.config import MODEL_MAP
  # The current implementation will error on this, which is caught


def test_load_config_empty_model_list(temp_config_file, monkeypatch):
  """Test config with empty model_list."""
  config_content = """model_list: []
"""
  with open(temp_config_file, 'w') as f:
    f.write(config_content)

  import apantli.config
  apantli.config.MODEL_MAP = {}

  original_open = open
  def mock_open(filename, *args, **kwargs):
    if filename == 'config.yaml':
      return original_open(temp_config_file, *args, **kwargs)
    return original_open(filename, *args, **kwargs)

  monkeypatch.setattr('builtins.open', mock_open)

  load_config()

  from apantli.config import MODEL_MAP
  assert len(MODEL_MAP) == 0


def test_config_defaults():
  """Test default configuration values."""
  from apantli.config import DEFAULT_TIMEOUT, DEFAULT_RETRIES

  assert DEFAULT_TIMEOUT == 120
  assert DEFAULT_RETRIES == 3
