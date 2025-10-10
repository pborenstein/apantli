# llm CLI Integration Architecture

This document explains how Apantli's `config.yaml`, the `generate_llm_config.py` utility, and [llm's](https://llm.datasette.io) `extra-openai-models.yaml` work together to enable unified CLI access to multiple LLM providers.

## Overview

The [llm CLI tool](https://llm.datasette.io) validates model names client-side before sending requests. By default, it only recognizes OpenAI model names. To use Claude, Anthropic, and other providers through Apantli, we teach llm about these models using its [`extra-openai-models.yaml`](https://llm.datasette.io/en/stable/other-models.html#registering-other-openai-compatible-models) configuration file.

## Component Relationship

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Apantli Project                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ config.yaml (Source of Truth)                                │   │
│  │                                                              │   │
│  │  model_list:                                                 │   │
│  │    - model_name: gpt-4o-mini                                 │   │
│  │      litellm_params:                                         │   │
│  │        model: openai/gpt-4o-mini                             │   │
│  │        api_key: os.environ/OPENAI_API_KEY                    │   │
│  │                                                              │   │
│  │    - model_name: claude-haiku-3.5                            │   │
│  │      litellm_params:                                         │   │
│  │        model: anthropic/claude-3-5-haiku-20241022            │   │
│  │        api_key: os.environ/ANTHROPIC_API_KEY                 │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│                    (reads and transforms)                           │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ utils/generate_llm_config.py (Transformer)                   │   │
│  │                                                              │   │
│  │  1. Reads config.yaml                                        │   │
│  │  2. Extracts model_name from each entry                      │   │
│  │  3. Generates llm-compatible YAML                            │   │
│  │  4. Auto-detects OS for correct path                         │   │
│  │  5. Writes to llm config directory                           │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│                          (generates)                                │
│                              ↓                                      │
└─────────────────────────────┼───────────────────────────────────────┘
                              ↓
┌─────────────────────────────┼───────────────────────────────────────┐
│                     llm Configuration                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ extra-openai-models.yaml (llm Model Registry)                │   │
│  │                                                              │   │
│  │ Location (OS-specific):                                      │   │
│  │  • macOS: ~/Library/Application Support/io.datasette.llm/    │   │
│  │  • Linux: ~/.config/io.datasette.llm/                        │   │
│  │  • Windows: %USERPROFILE%\AppData\Local\io.datasette.llm\    │   │
│  │                                                              │   │
│  │ Content:                                                     │   │
│  │  - model_id: gpt-4o-mini                                     │   │
│  │    model_name: gpt-4o-mini                                   │   │
│  │  - model_id: claude-haiku-3.5                                │   │
│  │    model_name: claude-haiku-3.5                              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
│                      (enables validation)                           │
│                              ↓                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ llm CLI (Client)                                             │   │
│  │                                                              │   │
│  │  $ llm -m claude-haiku-3.5 "Tell me a joke"                  │   │
│  │                                                              │   │
│  │  1. Validates model name (found in extra-openai-models)      │   │
│  │  2. Sends request to OPENAI_BASE_URL                         │   │
│  │     → http://localhost:4000/v1/chat/completions              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
└─────────────────────────────┼───────────────────────────────────────┘
                              ↓
                     (HTTP POST request)
                              ↓
┌─────────────────────────────┼───────────────────────────────────────┐
│                      Apantli Server                                 │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ Receives: { "model": "claude-haiku-3.5", ... }               │   │
│  │                                                              │   │
│  │ Looks up in config.yaml:                                     │   │
│  │   claude-haiku-3.5 → anthropic/claude-3-5-haiku-20241022     │   │
│  │                                                              │   │
│  │ Resolves API key: os.environ/ANTHROPIC_API_KEY               │   │
│  │                                                              │   │
│  │ Calls provider via LiteLLM SDK                               │   │
│  │                                                              │   │
│  │ Logs to requests.db with cost calculation                    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              ↓                                      │
└─────────────────────────────┼───────────────────────────────────────┘
                              ↓
                         (response)
                              ↓
                        ┌──────────┐
                        │   User   │
                        └──────────┘
```

## File Format Examples

### config.yaml (Apantli)

Apantli's source of truth for model configuration:

```yaml
model_list:
  - model_name: gpt-4o-mini              # Alias used by clients
    litellm_params:
      model: openai/gpt-4o-mini          # Full LiteLLM format
      api_key: os.environ/OPENAI_API_KEY # Environment variable reference

  - model_name: claude-haiku-3.5
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      api_key: os.environ/ANTHROPIC_API_KEY

  - model_name: claude-sonnet-4-5
    litellm_params:
      model: anthropic/claude-sonnet-4-5-20250929
      api_key: os.environ/ANTHROPIC_API_KEY
      timeout: 180                       # Optional: per-model overrides
```

Maps client-friendly aliases to full LiteLLM model identifiers with API key references and optional per-model configuration.

### extra-openai-models.yaml (llm CLI)

llm's model registry for custom models:

```yaml
- model_id: gpt-4o-mini
  model_name: gpt-4o-mini
- model_id: claude-haiku-3.5
  model_name: claude-haiku-3.5
- model_id: claude-sonnet-4-5
  model_name: claude-sonnet-4-5
```

Registers valid model names with llm CLI for client-side validation. Must match model aliases from config.yaml.

**Location**:
- **macOS**: `~/Library/Application Support/io.datasette.llm/extra-openai-models.yaml`
- **Linux**: `~/.config/io.datasette.llm/extra-openai-models.yaml`
- **Windows**: `%USERPROFILE%\AppData\Local\io.datasette.llm\extra-openai-models.yaml`

## Request Flow

### 1. User runs llm command

```bash
llm -m claude-haiku-3.5 "Tell me a joke"
```

### 2. llm validates model name

```
llm checks:
  1. Built-in models (gpt-4, gpt-3.5-turbo, etc.)
  2. extra-openai-models.yaml (claude-haiku-3.5 found!)
```

### 3. llm constructs request

```json
{
  "model": "claude-haiku-3.5",
  "messages": [
    {"role": "user", "content": "Tell me a joke"}
  ]
}
```

### 4. llm sends to OPENAI_BASE_URL

```
POST http://localhost:4000/v1/chat/completions
```

### 5. Apantli processes request

```
1. Receives: model = "claude-haiku-3.5"
2. Looks up in MODEL_MAP (loaded from config.yaml)
3. Finds: anthropic/claude-3-5-haiku-20241022
4. Resolves: ANTHROPIC_API_KEY from environment
5. Calls: LiteLLM SDK → Anthropic API
6. Calculates: Token usage and cost
7. Logs: Full request/response to requests.db
8. Returns: Response to llm
```

### 6. llm displays response

```
Why did the scarecrow win an award?
Because he was outstanding in his field!
```

## Why This Architecture?

| Problem | Solution |
|:--------|:---------|
| **Client-Side Validation**: llm validates model names before sending requests to prevent typos. This works for OpenAI models but blocks other providers through a proxy. | **Model Registry Synchronization**: Generate `extra-openai-models.yaml` from `config.yaml` to register custom models with llm while keeping a single source of truth. |

**Benefits**:
- `config.yaml` remains the definitive model list
- llm can validate model names client-side
- Models added to Apantli are automatically available to llm after regenerating config
- Users manage models in one place

### Data Flow Summary

```
config.yaml
  ↓ (source of truth)
  ↓ [generate_llm_config.py reads]
  ↓
extra-openai-models.yaml
  ↓ (enables validation)
  ↓ [llm CLI reads]
  ↓
llm command
  ↓ (HTTP request)
  ↓ [OPENAI_BASE_URL=http://localhost:4000/v1]
  ↓
Apantli server
  ↓ (looks up in config.yaml)
  ↓ [resolves to full model + API key]
  ↓
Provider API (OpenAI, Anthropic, etc.)
```

## Keeping Synchronized

**When to regenerate**: After adding, removing, or renaming models in `config.yaml`:

```bash
python3 utils/generate_llm_config.py --write
apantli --reload
```

**Verify registration**:

```bash
llm models | grep -A 5 "Extra OpenAI models"
# Should list your Apantli models: gpt-4o-mini, claude-haiku-3.5, etc.
```

## Benefits

- **Centralized configuration**: All models defined once in `config.yaml`
- **Automatic cost tracking**: Every request logged to Apantli's database
- **Multi-provider access**: OpenAI, Anthropic, and others with same CLI
- **Secure API keys**: Stored in `.env`, never exposed to llm
- **Dashboard monitoring**: View all usage at http://localhost:4000/
- **Dual history**: Both [llm](https://llm.datasette.io/en/stable/logging.html) and Apantli maintain conversation logs

## Troubleshooting

| Issue | Cause | Solution |
|:------|:------|:---------|
| "Unknown model" error | Model not in `extra-openai-models.yaml` | `python3 utils/generate_llm_config.py --write` |
| llm uses OpenAI directly | `OPENAI_API_KEY` overrides `OPENAI_BASE_URL` | `unset OPENAI_API_KEY` |
| Model works in llm but 404 from Apantli | Model in `extra-openai-models.yaml` but not `config.yaml` | Add to `config.yaml` and run `apantli --reload` |
| Changes to config.yaml not reflected | Stale `extra-openai-models.yaml` | `python3 utils/generate_llm_config.py --write` |

## Example: Adding a New Model

### Step 1: Add to config.yaml

```yaml
model_list:
  # ... existing models ...

  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY
```

### Step 2: Regenerate llm config

```bash
python3 utils/generate_llm_config.py --write
```

Output:
```
Generated ~/Library/Application Support/io.datasette.llm/extra-openai-models.yaml
Registered 4 models:
   - gpt-4o-mini
   - claude-haiku-3.5
   - claude-sonnet-4-5
   - gpt-4o    (newly added)

Now you can use:
  export OPENAI_BASE_URL=http://localhost:4000/v1
  llm -m gpt-4o "Hello"
```

### Step 3: Restart Apantli

```bash
apantli --reload
```

### Step 4: Use the new model

```bash
llm -m gpt-4o "What are the key features of GPT-4o?"
```

The request flows through Apantli with full cost tracking!

## Related Documentation

- [CONFIGURATION.md](CONFIGURATION.md#llm-cli-simon-willison) - llm CLI setup guide
- [utils/README.md](../utils/README.md) - Utility scripts documentation
- [llm documentation](https://llm.datasette.io) - Official llm CLI docs
- [Extra OpenAI Models](https://llm.datasette.io/en/stable/other-models.html#registering-other-openai-compatible-models) - llm's model registration feature
