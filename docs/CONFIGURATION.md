# Configuration

Complete guide to configuring Apantli for your LLM providers and models.

## Configuration Files

Apantli uses two configuration files:

| File | Purpose | Format | Committed to Git |
|:-----|:--------|:-------|:-----------------|
| `config.yaml` | Model definitions and routing | YAML | Yes |
| `.env` | API keys and secrets | Environment variables | No (gitignored) |

## Environment Variables (.env)

Create a `.env` file in the project root with your API keys:

```bash
# OpenAI
OPENAI_API_KEY=sk-proj-...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-api03-...

# Other providers (optional)
GEMINI_API_KEY=...
COHERE_API_KEY=...
```

### Environment Variable Format

The `.env` file uses simple `KEY=value` format:

- One variable per line
- No quotes needed around values
- Comments start with `#`
- Loaded automatically by `python-dotenv` on server startup

### Security Notes

- Never commit `.env` to version control
- File is listed in `.gitignore` by default
- Server process must have read access to `.env`
- API keys are resolved at request time, not stored in memory globally

## Model Configuration (config.yaml)

The `config.yaml` file defines which models are available and how to route them.

### Basic Structure

```yaml
model_list:
  - model_name: alias-for-client
    litellm_params:
      model: provider/actual-model-name
      api_key: os.environ/ENV_VAR_NAME
```

### Configuration Fields

| Field | Required | Description |
|:------|:---------|:------------|
| `model_name` | Yes | Alias clients use in API requests |
| `litellm_params.model` | Yes | LiteLLM model identifier (format: `provider/model`) |
| `litellm_params.api_key` | Yes | API key reference (format: `os.environ/VAR_NAME`) |

### Example Configuration

```yaml
model_list:
  # OpenAI GPT-4.1 models
  - model_name: gpt-4.1
    litellm_params:
      model: openai/gpt-4.1
      api_key: os.environ/OPENAI_API_KEY

  - model_name: gpt-4.1-mini
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: os.environ/OPENAI_API_KEY

  - model_name: gpt-4.1-nano
    litellm_params:
      model: openai/gpt-4.1-nano
      api_key: os.environ/OPENAI_API_KEY

  # Anthropic Claude models
  - model_name: claude-sonnet-4
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-haiku-3.5
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY

  # Google Gemini
  - model_name: gemini-pro
    litellm_params:
      model: gemini/gemini-pro
      api_key: os.environ/GEMINI_API_KEY

  # Cohere
  - model_name: command-r
    litellm_params:
      model: cohere/command-r
      api_key: os.environ/COHERE_API_KEY
```

## Provider-Specific Configuration

### Supported Providers

| Provider | Format | Example Models | API Key Source | Env Variable | Key Format |
|:---------|:-------|:--------------|:---------------|:-------------|:-----------|
| **OpenAI** | `openai/model` | `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`, `gpt-4-turbo`, `gpt-3.5-turbo` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `OPENAI_API_KEY` | `sk-proj-...` or `sk-...` |
| **Anthropic** | `anthropic/model` | `claude-sonnet-4-20250514`, `claude-3-5-haiku-20241022`, `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229` | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | `ANTHROPIC_API_KEY` | `sk-ant-api03-...` |
| **Google Gemini** | `gemini/model` | `gemini-pro`, `gemini-pro-vision`, `gemini-1.5-pro` | [makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey) | `GEMINI_API_KEY` | 39-char string |
| **Cohere** | `cohere/model` | `command-r`, `command-r-plus`, `command-light` | [dashboard.cohere.com/api-keys](https://dashboard.cohere.com/api-keys) | `COHERE_API_KEY` | Alphanumeric |

### Azure OpenAI (Special Configuration)

Azure OpenAI requires additional parameters beyond the standard config:

```yaml
model_list:
  - model_name: azure-gpt4
    litellm_params:
      model: azure/gpt-4-deployment-name
      api_key: os.environ/AZURE_API_KEY
      api_base: os.environ/AZURE_API_BASE
      api_version: "2024-02-15-preview"
```

**Environment variables**:

```bash
AZURE_API_KEY=your-azure-key
AZURE_API_BASE=https://your-resource.openai.azure.com/
```

## Model Name Aliases

The `model_name` field creates an alias for client convenience.

### Why Use Aliases?

Actual model identifiers can be verbose:

- `anthropic/claude-3-5-haiku-20241022` → Use alias `claude-haiku-3.5`
- `openai/gpt-4.1-mini` → Use alias `gpt-4.1-mini` (same, but could shorten to `gpt4-mini`)

### Alias Best Practices

- Use short, memorable names
- Include provider if supporting multiple (e.g., `openai-gpt4`, `azure-gpt4`)
- Version numbers help track model updates
- Consistency aids muscle memory

### Example Aliasing Strategy

```yaml
model_list:
  # Short aliases for common models
  - model_name: gpt4
    litellm_params:
      model: openai/gpt-4.1
      api_key: os.environ/OPENAI_API_KEY

  - model_name: claude
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

  # Versioned aliases for specific models
  - model_name: gpt-4.1-mini
    litellm_params:
      model: openai/gpt-4.1-mini
      api_key: os.environ/OPENAI_API_KEY

  - model_name: haiku-3.5
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY
```

## Command-Line Options

The proxy server supports several command-line arguments:

```bash
apantli --help
```

### Available Options

| Option | Default | Description |
|:-------|:--------|:------------|
| `--host` | `0.0.0.0` | Host to bind to |
| `--port` | `4000` | Port to bind to |
| `--config` | `config.yaml` | Path to config file |
| `--db` | `requests.db` | Path to SQLite database |
| `--reload` | `false` | Enable auto-reload for development |

### Usage Examples

**Run on different port**:

```bash
apantli --port 8080
```

**Use custom config file**:

```bash
apantli --config /path/to/custom-config.yaml
```

**Development mode with auto-reload**:

```bash
apantli --reload
```

**Custom database location**:

```bash
apantli --db /data/llm-requests.db
```

**Bind to localhost only** (more secure):

```bash
apantli --host 127.0.0.1
```

**Combine multiple options**:

```bash
apantli --host 127.0.0.1 --port 8080 --config prod-config.yaml
```

## Configuration Validation

### Testing Your Configuration

After editing `config.yaml`, verify it loads correctly:

```bash
# Start the server
apantli

# In another terminal, check available models
curl http://localhost:4000/models | jq
```

Expected output:

```json
{
  "models": [
    {
      "name": "gpt-4.1-mini",
      "litellm_model": "openai/gpt-4.1-mini",
      "provider": "openai",
      "input_cost_per_million": 0.15,
      "output_cost_per_million": 0.60
    },
    ...
  ]
}
```

### Common Configuration Errors

**YAML syntax error**:

```
yaml.scanner.ScannerError: mapping values are not allowed here
```

Fix: Check for missing colons, incorrect indentation (must be 2 spaces)

**Environment variable not found**:

No error at startup, but requests fail with "API key not found"

Fix: Verify `.env` file exists and contains the referenced variable

**Invalid model identifier**:

```
litellm.exceptions.BadRequestError: Unknown model: invalid/model-name
```

Fix: Check LiteLLM documentation for correct provider/model format

**Missing config.yaml**:

```
Warning: Could not load config.yaml: [Errno 2] No such file or directory
```

Server continues running but requires full `provider/model` format in requests.

## Dynamic Configuration

### Reloading Configuration

Configuration is loaded once at server startup. To reload:

1. Edit `config.yaml` or `.env`
2. Restart the server (CTRL+C, then `apantli`)

In development, use `--reload` flag for auto-restart on file changes:

```bash
apantli --reload
```

This watches Python files for changes, but does NOT watch `config.yaml` or `.env`. Manual restart still required for config changes.

### Multiple Configurations

For different environments, maintain separate config files:

```bash
# Development
apantli --config config.dev.yaml

# Production
apantli --config config.prod.yaml

# Testing
apantli --config config.test.yaml
```

## Advanced Configuration

### Custom Model Parameters

LiteLLM supports additional parameters per model:

```yaml
model_list:
  - model_name: gpt-4-creative
    litellm_params:
      model: openai/gpt-4.1
      api_key: os.environ/OPENAI_API_KEY
      temperature: 1.2
      max_tokens: 2000
```

These become defaults for this model alias. Clients can still override in individual requests.

### Organization/Project IDs

Some providers require organization or project IDs:

```yaml
model_list:
  - model_name: openai-gpt4
    litellm_params:
      model: openai/gpt-4.1
      api_key: os.environ/OPENAI_API_KEY
      organization: os.environ/OPENAI_ORG_ID
```

### Base URL Override

For custom API endpoints or proxies:

```yaml
model_list:
  - model_name: custom-openai
    litellm_params:
      model: openai/gpt-4.1
      api_key: os.environ/OPENAI_API_KEY
      api_base: https://custom.openai.endpoint/v1
```

## Client Integration

### Obsidian Copilot

Configure Obsidian Copilot to use Apantli as a custom provider:

1. **Start Apantli**:
   ```bash
   apantli
   ```

2. **In Obsidian Copilot settings**:
   - Go to **Copilot Basic Settings** → **API Keys**
   - Click **Add Model** → **Custom Model**

3. **Configure custom model**:
   - **Provider**: Select "3rd party (openai format)"
   - **Base URL**: `http://localhost:4000/v1`
   - **Model Name**: Use any model from your `config.yaml` (e.g., `gpt-4.1-mini`, `claude-sonnet-4`)
   - **API Key**: Enter any value (e.g., `not-used`) - Apantli handles the actual API keys

4. **Use the model**: Select your custom model in Copilot and start chatting

All requests will route through Apantli with full cost tracking and logging. Streaming responses are supported.

### Other OpenAI-Compatible Clients

Any tool that supports OpenAI's API format can use Apantli:

- **Base URL**: `http://localhost:4000/v1`
- **API Key**: Any value (ignored by Apantli)
- **Model**: Use model names from your `config.yaml`

Compatible tools include: LangChain, LlamaIndex, Continue.dev, Cursor, and custom applications using the OpenAI SDK.

## Configuration Best Practices

### Security

- Never hardcode API keys in `config.yaml`
- Always use `os.environ/VAR_NAME` references
- Keep `.env` out of version control
- Rotate API keys periodically
- Use separate keys for development/production

### Organization

- Group models by provider
- Use consistent naming conventions
- Comment complex configurations
- Document custom parameters

Example:

```yaml
model_list:
  # === OpenAI Models ===
  # Standard GPT-4.1 models for production use

  - model_name: gpt-4.1
    litellm_params:
      model: openai/gpt-4.1
      api_key: os.environ/OPENAI_API_KEY

  # === Anthropic Models ===
  # Claude Sonnet for long-context tasks

  - model_name: claude-sonnet-4
    litellm_params:
      model: anthropic/claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY
```

### Performance

- Remove unused models from config (reduces dashboard clutter)
- Use shorter aliases for frequently-used models
- Test new models in separate config file first

### Maintenance

- Document model version updates
- Keep old aliases during migration periods
- Test configuration changes in development first
- Monitor costs when adding new models
