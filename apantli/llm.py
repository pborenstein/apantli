"""LLM provider inference and utilities."""


def infer_provider_from_model(model_name: str) -> str:
  """Infer provider from model name when not explicitly prefixed."""
  if not model_name:
    return 'unknown'

  model_lower = model_name.lower()

  # Check for provider prefix first
  if '/' in model_name:
    return model_name.split('/')[0]

  # Infer from model name patterns
  if model_lower.startswith(('gpt-', 'o1-', 'text-davinci', 'text-curie')):
    return 'openai'
  elif model_lower.startswith('claude') or 'claude' in model_lower:
    return 'anthropic'
  elif model_lower.startswith(('gemini', 'palm')):
    return 'gemini'  # LiteLLM uses 'gemini' not 'google'
  elif model_lower.startswith('mistral'):
    return 'mistral'
  elif model_lower.startswith('llama'):
    return 'meta'

  return 'unknown'
