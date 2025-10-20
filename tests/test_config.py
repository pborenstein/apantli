"""Unit tests for configuration loading and validation."""

import pytest
import os
from pydantic import ValidationError
from apantli.config import (
  Config, ModelConfig, ConfigError,
  DEFAULT_TIMEOUT, DEFAULT_RETRIES
)


def test_model_config_valid(monkeypatch):
  """Test creating a valid ModelConfig."""
  monkeypatch.setenv('TEST_API_KEY', 'sk-test-123')

  config = ModelConfig(
    model_name='gpt-4',
    model='openai/gpt-4',
    api_key='os.environ/TEST_API_KEY',
    timeout=180,
    num_retries=5
  )

  assert config.model_name == 'gpt-4'
  assert config.litellm_model == 'openai/gpt-4'
  assert config.api_key_var == 'os.environ/TEST_API_KEY'
  assert config.timeout == 180
  assert config.num_retries == 5


def test_model_config_get_api_key(monkeypatch):
  """Test API key resolution from environment."""
  monkeypatch.setenv('TEST_API_KEY', 'sk-actual-key-value')

  config = ModelConfig(
    model_name='gpt-4',
    model='openai/gpt-4',
    api_key='os.environ/TEST_API_KEY'
  )

  assert config.get_api_key() == 'sk-actual-key-value'


def test_model_config_invalid_api_key_format():
  """Test that invalid API key format is rejected."""
  with pytest.raises(ValidationError) as exc_info:
    ModelConfig(
      model_name='gpt-4',
      model='openai/gpt-4',
      api_key='hardcoded-api-key'  # Missing os.environ/ prefix
    )

  errors = exc_info.value.errors()
  assert any('os.environ/VAR_NAME' in str(e) for e in errors)


def test_model_config_negative_timeout():
  """Test that negative timeout is rejected."""
  with pytest.raises(ValidationError) as exc_info:
    ModelConfig(
      model_name='gpt-4',
      model='openai/gpt-4',
      api_key='os.environ/TEST_KEY',
      timeout=-10
    )

  errors = exc_info.value.errors()
  assert any('positive' in str(e).lower() for e in errors)


def test_model_config_negative_retries():
  """Test that negative retries is rejected."""
  with pytest.raises(ValidationError) as exc_info:
    ModelConfig(
      model_name='gpt-4',
      model='openai/gpt-4',
      api_key='os.environ/TEST_KEY',
      num_retries=-1
    )

  errors = exc_info.value.errors()
  assert any('non-negative' in str(e).lower() for e in errors)


def test_model_config_missing_env_var_warns(monkeypatch):
  """Test that missing environment variable generates warning."""
  # Ensure the var doesn't exist
  monkeypatch.delenv('MISSING_VAR', raising=False)

  with pytest.warns(UserWarning, match="MISSING_VAR not set"):
    ModelConfig(
      model_name='gpt-4',
      model='openai/gpt-4',
      api_key='os.environ/MISSING_VAR'
    )


def test_model_config_to_litellm_params(monkeypatch):
  """Test conversion to LiteLLM parameters."""
  monkeypatch.setenv('TEST_KEY', 'sk-test')

  config = ModelConfig(
    model_name='gpt-4',
    model='openai/gpt-4',
    api_key='os.environ/TEST_KEY',
    timeout=180,
    temperature=0.7
  )

  params = config.to_litellm_params()

  assert params['model'] == 'openai/gpt-4'
  assert params['api_key'] == 'os.environ/TEST_KEY'
  assert params['timeout'] == 180
  assert params['temperature'] == 0.7
  assert 'model_name' not in params  # Should be excluded


def test_model_config_to_litellm_params_with_defaults(monkeypatch):
  """Test that defaults are applied when values are None."""
  monkeypatch.setenv('TEST_KEY', 'sk-test')

  config = ModelConfig(
    model_name='gpt-4',
    model='openai/gpt-4',
    api_key='os.environ/TEST_KEY'
    # No timeout or num_retries specified
  )

  params = config.to_litellm_params(defaults={
    'timeout': 120,
    'num_retries': 3
  })

  assert params['timeout'] == 120
  assert params['num_retries'] == 3


def test_config_load_valid(temp_config_file, sample_config_content, monkeypatch):
  """Test loading a valid configuration file."""
  # Set up environment variables
  monkeypatch.setenv('OPENAI_API_KEY', 'sk-test-openai')
  monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test-anthropic')

  # Write config to temp file
  with open(temp_config_file, 'w') as f:
    f.write(sample_config_content)

  # Load config
  config = Config(temp_config_file)

  # Verify models were loaded
  assert 'gpt-4' in config.models
  assert 'claude-3' in config.models

  # Verify model details
  gpt4 = config.models['gpt-4']
  assert gpt4.litellm_model == 'openai/gpt-4'
  assert gpt4.api_key_var == 'os.environ/OPENAI_API_KEY'

  claude = config.models['claude-3']
  assert claude.litellm_model == 'anthropic/claude-3-opus-20240229'
  assert claude.timeout == 180
  assert claude.num_retries == 5


def test_config_get_model(temp_config_file, sample_config_content, monkeypatch):
  """Test getting a specific model configuration."""
  monkeypatch.setenv('OPENAI_API_KEY', 'sk-test')
  monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test')

  with open(temp_config_file, 'w') as f:
    f.write(sample_config_content)

  config = Config(temp_config_file)

  # Get existing model
  gpt4 = config.get_model('gpt-4')
  assert gpt4 is not None
  assert gpt4.model_name == 'gpt-4'

  # Get non-existent model
  assert config.get_model('nonexistent') is None


def test_config_list_models(temp_config_file, sample_config_content, monkeypatch):
  """Test listing all model names."""
  monkeypatch.setenv('OPENAI_API_KEY', 'sk-test')
  monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test')

  with open(temp_config_file, 'w') as f:
    f.write(sample_config_content)

  config = Config(temp_config_file)

  models = config.list_models()
  assert 'gpt-4' in models
  assert 'claude-3' in models
  assert len(models) == 2


def test_config_missing_file(temp_config_file, capsys):
  """Test loading config when file doesn't exist."""
  # Use a file path that doesn't exist
  config = Config(temp_config_file + '.nonexistent')

  # Should not raise, just warn
  captured = capsys.readouterr()
  assert "Config file not found" in captured.out
  assert len(config.models) == 0


def test_config_invalid_yaml(temp_config_file, capsys):
  """Test loading config with invalid YAML."""
  # Write invalid YAML
  with open(temp_config_file, 'w') as f:
    f.write("invalid: yaml: content: [[[")

  config = Config(temp_config_file)

  # Should not raise, just warn
  captured = capsys.readouterr()
  assert "Invalid YAML" in captured.out
  assert len(config.models) == 0


def test_config_missing_model_field(temp_config_file, monkeypatch, capsys):
  """Test config with missing required model field."""
  monkeypatch.setenv('TEST_KEY', 'sk-test')

  config_content = """model_list:
  - model_name: test-model
    litellm_params:
      api_key: os.environ/TEST_KEY
      # Missing 'model' field
"""
  with open(temp_config_file, 'w') as f:
    f.write(config_content)

  config = Config(temp_config_file)

  # Should warn about validation error
  captured = capsys.readouterr()
  assert "validation errors" in captured.out.lower()
  # Model should not be loaded
  assert 'test-model' not in config.models


def test_config_invalid_timeout(temp_config_file, monkeypatch, capsys):
  """Test config with invalid timeout value."""
  monkeypatch.setenv('TEST_KEY', 'sk-test')

  config_content = """model_list:
  - model_name: test-model
    litellm_params:
      model: test/model
      api_key: os.environ/TEST_KEY
      timeout: -5
"""
  with open(temp_config_file, 'w') as f:
    f.write(config_content)

  config = Config(temp_config_file)

  # Should warn about validation error
  captured = capsys.readouterr()
  assert "validation errors" in captured.out.lower()
  assert 'test-model' not in config.models


def test_config_get_model_map(temp_config_file, sample_config_content, monkeypatch):
  """Test getting model map from Config class."""
  monkeypatch.setenv('OPENAI_API_KEY', 'sk-test')
  monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test')

  with open(temp_config_file, 'w') as f:
    f.write(sample_config_content)

  config = Config(temp_config_file)

  # Get model map
  model_map = config.get_model_map()
  assert 'gpt-4' in model_map
  assert 'claude-3' in model_map
  assert model_map['gpt-4']['model'] == 'openai/gpt-4'


def test_config_get_model_map_with_defaults(temp_config_file, sample_config_content, monkeypatch):
  """Test that get_model_map applies defaults correctly."""
  monkeypatch.setenv('OPENAI_API_KEY', 'sk-test')
  monkeypatch.setenv('ANTHROPIC_API_KEY', 'sk-test')

  with open(temp_config_file, 'w') as f:
    f.write(sample_config_content)

  config = Config(temp_config_file)

  # Get model map with defaults
  model_map = config.get_model_map({'timeout': 120, 'num_retries': 3})

  # gpt-4 doesn't specify timeout/retries, should get defaults
  assert model_map['gpt-4']['timeout'] == 120
  assert model_map['gpt-4']['num_retries'] == 3

  # claude-3 specifies its own values, should keep them
  assert model_map['claude-3']['timeout'] == 180
  assert model_map['claude-3']['num_retries'] == 5


def test_config_defaults():
  """Test default configuration values."""
  assert DEFAULT_TIMEOUT == 120
  assert DEFAULT_RETRIES == 3


def test_model_config_extra_fields_allowed(monkeypatch):
  """Test that extra LiteLLM parameters are preserved."""
  monkeypatch.setenv('TEST_KEY', 'sk-test')

  config = ModelConfig(
    model_name='gpt-4',
    model='openai/gpt-4',
    api_key='os.environ/TEST_KEY',
    custom_param='custom_value',  # Extra field
    another_param=42
  )

  params = config.to_litellm_params()
  assert params.get('custom_param') == 'custom_value'
  assert params.get('another_param') == 42
