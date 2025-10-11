"""Configuration management for model routing."""

import os
import warnings
from typing import Dict, Optional, Any
from pydantic import BaseModel, Field, field_validator, ValidationError
import yaml


# Default configuration
DEFAULT_TIMEOUT = 120  # seconds
DEFAULT_RETRIES = 3    # number of retry attempts

# Model mapping from config.yaml (for backward compatibility)
MODEL_MAP = {}


class ConfigError(Exception):
  """Configuration validation error."""
  pass


class ModelConfig(BaseModel):
  """Configuration for a single model."""
  model_name: str = Field(..., description="Alias used by clients")
  litellm_model: str = Field(..., alias="model", description="LiteLLM model identifier")
  api_key_var: str = Field(..., alias="api_key", description="Environment variable reference")
  timeout: Optional[int] = Field(None, description="Request timeout override")
  num_retries: Optional[int] = Field(None, description="Retry count override")
  temperature: Optional[float] = None
  max_tokens: Optional[int] = None

  class Config:
    populate_by_name = True
    extra = "allow"  # Allow extra fields for future LiteLLM params

  @field_validator('api_key_var')
  @classmethod
  def validate_api_key_format(cls, v: str) -> str:
    """Ensure API key follows os.environ/VAR format."""
    if not v.startswith('os.environ/'):
      raise ValueError(
        f"API key must be in format 'os.environ/VAR_NAME', got: {v}"
      )
    return v

  @field_validator('api_key_var')
  @classmethod
  def check_env_var_exists(cls, v: str) -> str:
    """Warn if environment variable is not set."""
    var_name = v.split('/', 1)[1]
    if var_name not in os.environ:
      warnings.warn(
        f"Environment variable {var_name} not set. "
        f"Requests using this model will fail with authentication error.",
        UserWarning
      )
    return v

  @field_validator('timeout')
  @classmethod
  def validate_timeout(cls, v: Optional[int]) -> Optional[int]:
    """Ensure timeout is positive."""
    if v is not None and v <= 0:
      raise ValueError(f"Timeout must be positive, got: {v}")
    return v

  @field_validator('num_retries')
  @classmethod
  def validate_retries(cls, v: Optional[int]) -> Optional[int]:
    """Ensure retries is non-negative."""
    if v is not None and v < 0:
      raise ValueError(f"Retries must be non-negative, got: {v}")
    return v

  def get_api_key(self) -> str:
    """Resolve API key from environment."""
    var_name = self.api_key_var.split('/', 1)[1]
    return os.environ.get(var_name, '')

  def to_litellm_params(self, defaults: Optional[Dict[str, Any]] = None) -> dict:
    """Convert to LiteLLM parameters with defaults.

    Returns a dict compatible with the old MODEL_MAP format.
    """
    if defaults is None:
      defaults = {}

    # Start with all model fields (excluding model_name)
    params = self.model_dump(exclude={'model_name'}, by_alias=True)

    # Apply defaults for missing values
    for key in ['timeout', 'num_retries']:
      if params.get(key) is None and key in defaults:
        params[key] = defaults[key]

    return params


class Config:
  """Application configuration manager."""

  def __init__(self, config_path: str = "config.yaml"):
    self.config_path = config_path
    self.models: Dict[str, ModelConfig] = {}
    self.reload()

  def reload(self):
    """Load or reload configuration from file."""
    global MODEL_MAP

    try:
      with open(self.config_path, 'r') as f:
        config_data = yaml.safe_load(f)

      # Validate and load models
      models = {}
      errors = []

      for model_dict in config_data.get('model_list', []):
        try:
          # Extract model_name from top level
          model_name = model_dict.get('model_name')
          if not model_name:
            errors.append("Model entry missing 'model_name' field")
            continue

          # Merge litellm_params with model_name
          litellm_params = model_dict.get('litellm_params', {})
          model_config = ModelConfig(
            model_name=model_name,
            **litellm_params
          )

          models[model_name] = model_config

        except ValidationError as e:
          # Format validation errors nicely
          for error in e.errors():
            field = error['loc'][0] if error['loc'] else 'unknown'
            message = error['msg']
            errors.append(f"Model '{model_name}': {field} - {message}")

      if errors:
        print(f"⚠️  Configuration validation errors:")
        for error in errors:
          print(f"  - {error}")
        if not models:
          raise ConfigError("No valid models found in configuration")

      self.models = models

      # Update global MODEL_MAP for backward compatibility
      MODEL_MAP = {
        name: config.to_litellm_params()
        for name, config in models.items()
      }

      print(f"✓ Loaded {len(self.models)} model(s) from {self.config_path}")

    except FileNotFoundError:
      print(f"⚠️  Config file not found: {self.config_path}")
      print("   Server will start with no models configured")
      self.models = {}
      MODEL_MAP = {}
    except yaml.YAMLError as e:
      print(f"⚠️  Invalid YAML in config file: {e}")
      self.models = {}
      MODEL_MAP = {}
    except ConfigError:
      # Re-raise config errors
      raise
    except Exception as e:
      print(f"⚠️  Could not load config: {e}")
      self.models = {}
      MODEL_MAP = {}

  def get_model(self, model_name: str) -> Optional[ModelConfig]:
    """Get model configuration by name."""
    return self.models.get(model_name)

  def list_models(self) -> list:
    """List all configured model names."""
    return list(self.models.keys())


# Global config instance for backward compatibility
_config: Optional[Config] = None


def load_config(config_path: str = "config.yaml"):
  """Load model configuration from config.yaml (backward compatible).

  This function maintains the global MODEL_MAP for existing code.
  """
  global _config, MODEL_MAP

  try:
    _config = Config(config_path)
    # MODEL_MAP is already updated by Config.reload()
  except ConfigError:
    # Config errors are already printed by Config class
    MODEL_MAP = {}
  except Exception as e:
    print(f"Warning: Could not load config.yaml: {e}")
    print("Models will need to be specified with provider prefix (e.g., 'openai/gpt-4')")
    MODEL_MAP = {}
