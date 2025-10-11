"""Configuration management for model routing."""

import yaml


# Default configuration
DEFAULT_TIMEOUT = 120  # seconds
DEFAULT_RETRIES = 3    # number of retry attempts

# Model mapping from config.yaml
MODEL_MAP = {}


def load_config():
  """Load model configuration from config.yaml."""
  global MODEL_MAP
  try:
    with open('config.yaml', 'r') as f:
      config = yaml.safe_load(f)

    for model in config.get('model_list', []):
      model_name = model['model_name']
      litellm_params = model['litellm_params'].copy()

      # Store all litellm_params for pass-through to LiteLLM
      # We'll handle 'model' and 'api_key' specially at request time
      MODEL_MAP[model_name] = litellm_params
  except Exception as e:
    print(f"Warning: Could not load config.yaml: {e}")
    print("Models will need to be specified with provider prefix (e.g., 'openai/gpt-4')")
