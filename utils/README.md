# Apantli Utilities

Helper scripts for managing Apantli.

## Scripts

### generate_llm_config.py

Generate `extra-openai-models.yaml` for the `llm` CLI tool from your Apantli `config.yaml`.

**Usage**:

```bash
# Print to stdout with instructions
python3 utils/generate_llm_config.py

# Write directly to llm config directory
python3 utils/generate_llm_config.py --write

# Use custom config file
python3 utils/generate_llm_config.py --config custom.yaml
```

**What it does**:
- Reads model names from `config.yaml`
- Generates YAML in the format `llm` expects
- Outputs to stdout (default) or writes directly to llm config directory (with `--write`)
- Auto-detects OS and uses correct path (macOS, Linux, Windows)

**After running**:
```bash
export OPENAI_BASE_URL=http://localhost:4000/v1
llm -m claude-haiku-3.5 "Tell me a joke"
```

### recalculate_costs.py

Recalculate costs for requests that have missing or zero cost in the database.

**Usage**:

```bash
# Dry run - see what would be updated
python3 utils/recalculate_costs.py --dry-run

# Actually update the database
python3 utils/recalculate_costs.py
```

**What it does**:
- Finds all requests with `cost = 0` or `NULL`
- Maps short model names to full LiteLLM format (e.g., `claude-haiku-3.5` → `anthropic/claude-3-5-haiku-20241022`)
- Uses LiteLLM's pricing database to recalculate costs
- Updates the database with correct costs

**When to use**:
- After adding models to `config.yaml` that were previously used without config
- When old requests show $0.00 cost in the dashboard
- After LiteLLM updates its pricing database

**Note**: Some models may still show $0.00 if LiteLLM doesn't have pricing data for them.

### redact_api_keys.py

Redact API keys from existing database records (for databases created before API key redaction was implemented).

**Usage**:

```bash
# Dry run - see what would be updated
python3 utils/redact_api_keys.py --dry-run

# Actually update the database (will prompt for confirmation)
python3 utils/redact_api_keys.py
```

**What it does**:
- Scans all records in `requests.db` for request_data containing API keys
- Replaces actual API keys with `sk-redacted`
- Updates the database in place
- Skips records already redacted or without API keys

**When to use**:
- After upgrading to version with API key redaction (commit bb81327)
- If you have existing database records with exposed API keys
- To ensure historical data doesn't contain sensitive credentials

**Safety**:
- Always backup your database first: `cp requests.db requests.db.backup`
- Use `--dry-run` to preview changes before applying
- Script requires explicit confirmation before making changes
