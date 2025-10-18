# MODEL_NAMING.md

## Model Names Are Confusing—Here's Why

If you're confused about when to use `gpt-4.1-mini` versus `openai/gpt-4.1-mini`, or why the word "model" appears in three different places in the config file, **you're not wrong to be confused**. This document explains the landscape you're navigating.

**TL;DR**: Different APIs and SDKs use the word "model" to mean different things. Apantli bridges these systems, so you'll encounter multiple naming conventions depending on context.

## The Root Cause: Three Different APIs

Apantli sits between three systems, each with its own naming convention:

1. **OpenAI-Compatible API** (what clients send) — Uses short names like `"gpt-4.1-mini"`
2. **LiteLLM SDK** (what routes requests) — Needs provider prefixes like `"openai/gpt-4.1-mini"`
3. **The Apantli config.yaml** (what maps one to the other) — Contains both names with different field labels

None of these naming choices belong to Apantli. They're inherited from external APIs and SDKs.

## What "Model" Means in Each Context

Here's where you'll see model names and what they mean:

| Where | Field Name | Example Value | What It Represents |
|-------|-----------|---------------|-------------------|
| **Client sends request** | `model` | `"gpt-4.1-mini"` | Short alias (what clients use) |
| **config.yaml** | `model_name` | `gpt-4.1-mini` | Short alias (maps to full identifier below) |
| **config.yaml** | `litellm_params.model` | `openai/gpt-4.1-mini` | Full provider/model identifier |
| **API response** | `model` | `"gpt-4.1-mini"` | Echoes request (still the alias) |
| **GET /models response** | `name` | `"gpt-4.1-mini"` | The alias |
| **GET /models response** | `litellm_model` | `"openai/gpt-4.1-mini"` | The full identifier |

Notice the word "model" appears **four times** with different meanings.

## Mental Model: Request Flow

Here's what happens when a client makes a request:

```
┌────────────────────────────────────────────────────────────────────┐
│ 1. CLIENT SENDS REQUEST (OpenAI-compatible format)                 │
│    POST /v1/chat/completions                                       │
│    {"model": "gpt-4.1-mini", "messages": [...]}                    │
│                                                                    │
│    Uses: Short alias                                               │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│ 2. APANTLI LOOKS UP CONFIG (config.yaml)                           │
│                                                                    │
│    model_list:                                                     │
│      - model_name: gpt-4.1-mini          ← Matches client request  │
│        litellm_params:                                             │
│          model: openai/gpt-4.1-mini      ← Maps to provider format │
│          api_key: os.environ/OPENAI_API_KEY                        │
│                                                                    │
│    Contains: Both the alias AND the full identifier                │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│ 3. LITELLM SDK ROUTES REQUEST                                      │
│    litellm.completion(                                             │
│      model="openai/gpt-4.1-mini",       ← Uses provider/model      │
│      messages=[...]                                                │
│    )                                                               │
│                                                                    │
│    Needs: Provider prefix (openai/, anthropic/, etc.)              │
└────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────┐
│ 4. RESPONSE SENT BACK (OpenAI-compatible format)                   │
│    {"model": "gpt-4.1-mini", "choices": [...]}                     │
│                                                                    │
│    Returns: Original alias (not the provider/model format)         │
└────────────────────────────────────────────────────────────────────┘
```

## Why Two Names Exist

**Short alias** (`gpt-4.1-mini`):

- Easy for clients to type
- Matches OpenAI API conventions
- Same name works across providers (you could map it to a different backend)
- Example: `"claude-sonnet-4"` is easier than `"anthropic/claude-sonnet-4-20250514"`

**Full identifier** (`openai/gpt-4.1-mini`):

- Required by LiteLLM SDK for routing
- Specifies which provider to use
- Includes version info (e.g., `claude-3-5-haiku-20241022`)
- No ambiguity when multiple providers offer same model name

## Common Confusion Points

### "Why does config.yaml have both `model_name` and a field called `model`?"

Because they serve different purposes:

- `model_name`: What clients send in API requests (the alias)
- `litellm_params.model`: What LiteLLM needs to route the request (provider/model)

The field names come from different APIs (OpenAI-compatible vs. LiteLLM SDK).

### "Do I use `gpt-4.1-mini` or `openai/gpt-4.1-mini` in my API request?"

Use the **short alias** (`gpt-4.1-mini`). The provider prefix is internal routing info.

### "Can I name my alias anything I want?"

Yes! The `model_name` field is arbitrary. You could use:

```yaml
model_list:
  - model_name: my-cheap-fast-model      # Your custom alias
    litellm_params:
      model: openai/gpt-4.1-mini         # Maps to this provider/model
```

Then send: `{"model": "my-cheap-fast-model"}`

This is actually how `hot-haiku` works in the example config — it's an alias for Claude Haiku with `temperature: 0.99`.

### "What if I configure two aliases pointing to the same provider/model?"

That's allowed and sometimes useful:

```yaml
model_list:
  - model_name: claude-fast
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      temperature: 0.2

  - model_name: claude-creative
    litellm_params:
      model: anthropic/claude-3-5-haiku-20241022
      temperature: 0.9
```

Same underlying model, different default parameters.

### "Why does GET /models return both `name` and `litellm_model`?"

So clients can see:

- **`name`**: The alias they should use in requests
- **`litellm_model`**: What provider/model it maps to (for transparency/debugging)

Example:

```json
{
  "name": "claude-sonnet-4",
  "litellm_model": "anthropic/claude-sonnet-4-20250514"
}
```

This shows that `claude-sonnet-4` is actually Anthropic's model from May 2025.

## Quick Reference

**When you see this...** | **It means this...**
-------------------------|-------------------
`model` in API request body | Client alias (short name)
`model_name` in config.yaml | Client alias (same as above)
`litellm_params.model` in config.yaml | Full provider/model identifier
`model` in API response | Echo of request alias
`litellm_model` in GET /models | Full provider/model identifier
`name` in GET /models | Client alias

## Why Not Standardize Everything?

We'd love to, but:

- **OpenAI API** uses `"model": "gpt-4"` (no provider prefix)
- **LiteLLM SDK** requires `model="openai/gpt-4"` (with prefix)
- **Changing either** would break compatibility

Apantli's job is to bridge these systems while keeping both APIs happy.

---

**Still confused?** Check these docs:

- [CONFIGURATION.md](CONFIGURATION.md) - How to set up model aliases
- [API.md](API.md) - How clients use model names in requests
- [ARCHITECTURE.md](ARCHITECTURE.md) - How routing works internally

---

## Summary

Model naming is confusing because **you're dealing with three different APIs at once**:

1. **Clients** speak OpenAI format (short aliases)
2. **LiteLLM** speaks provider/model format (with prefixes)
3. **The Apantli config.yaml** maps one to the other (contains both names)

The word "model" appears multiple times because each API defines its own fields. None of this is arbitrary — it's the cost of bridging different ecosystems while maintaining compatibility.

When in doubt: **clients send the alias, config maps to provider/model, responses echo the alias**.

