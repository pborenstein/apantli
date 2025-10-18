# Troubleshooting

Solutions to common issues when running Apantli.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Configuration Issues](#configuration-issues)
- [Runtime Errors](#runtime-errors)
- [Request Failures](#request-failures)
- [Database Issues](#database-issues)
- [Dashboard Issues](#dashboard-issues)
- [Performance Issues](#performance-issues)

## Installation Issues

### "uv: command not found"

**Symptoms**:

- Running `uv sync` returns "command not found"
- Cannot install dependencies

**Solutions**:

1. Install uv package manager:

   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

2. Or use pip instead:

   ```bash
   pip install -r requirements.txt
   ```

**Related Issues**:

- [Missing Python 3.13](#python-version-mismatch)

### Python Version Mismatch

**Symptoms**:

- `requires-python = ">=3.13"` error
- Syntax errors in modern Python code
- Package installation failures

**Solutions**:

1. Check your Python version:

   ```bash
   python3 --version
   ```

2. Install Python 3.13 or higher:

   ```bash
   # macOS with Homebrew
   brew install python@3.13

   # Or download from python.org
   ```

3. Update `.python-version` if using pyenv:

   ```bash
   pyenv install 3.13.0
   pyenv local 3.13.0
   ```

**Related Issues**:

- [Virtual environment issues](#virtual-environment-activation-failed)

### Virtual Environment Activation Failed

**Symptoms**:

- `source .venv/bin/activate` fails
- No `.venv` directory exists
- Wrong Python version in virtual environment

**Solutions**:

1. Create virtual environment:

   ```bash
   python3.13 -m venv .venv
   ```

2. Activate and install:

   ```bash
   source .venv/bin/activate
   pip install -r requirements.txt
   ```

3. Or use uv (recommended):

   ```bash
   uv sync
   ```

**Related Issues**:

- [Python version mismatch](#python-version-mismatch)

### Missing Dependencies

**Symptoms**:

- `ModuleNotFoundError: No module named 'fastapi'`
- Import errors when running server

**Solutions**:

1. Install dependencies:

   ```bash
   uv sync
   # Or
   pip install -r requirements.txt
   ```

2. Verify installation:

   ```bash
   python3 -c "import fastapi, litellm, uvicorn; print('OK')"
   ```

3. If using virtual environment, ensure it's activated:

   ```bash
   source .venv/bin/activate
   ```

**Related Issues**:

- [Virtual environment not activated](#virtual-environment-activation-failed)

## Configuration Issues

### "Could not load config.yaml" Warning

**Symptoms**:

- Warning at server startup: `Warning: Could not load config.yaml`
- Server starts but requests fail with "Unknown model"

**Solutions**:

1. Verify `config.yaml` exists in project root:

   ```bash
   ls -la config.yaml
   ```

2. Check YAML syntax:

   ```bash
   python3 -c "import yaml; yaml.safe_load(open('config.yaml'))"
   ```

3. Verify file permissions:

   ```bash
   chmod 644 config.yaml
   ```

4. If using custom path, specify with `--config`:

   ```bash
   apantli --config /path/to/config.yaml
   ```

**Related Issues**:

- [YAML syntax errors](#invalid-yaml-syntax)

### Invalid YAML Syntax

**Symptoms**:

- `yaml.scanner.ScannerError: mapping values are not allowed here`
- Server fails to start
- Configuration not loading

**Solutions**:

1. Check indentation (must be 2 spaces, not tabs):

   ```yaml
   # Correct
   model_list:
     - model_name: gpt-4.1-mini
       litellm_params:
         model: openai/gpt-4.1-mini

   # Incorrect (tabs or wrong spacing)
   model_list:
   - model_name: gpt-4.1-mini
   litellm_params:
   model: openai/gpt-4.1-mini
   ```

2. Validate YAML online: https://www.yamllint.com/

3. Check for missing colons:

   ```yaml
   # Correct
   model_name: gpt-4.1-mini

   # Incorrect
   model_name gpt-4.1-mini
   ```

**Related Issues**:

- [Configuration not loading](#could-not-load-configyaml-warning)

### Missing .env File

**Symptoms**:

- Requests fail with authentication errors
- "API key not found" errors
- Provider returns 401 Unauthorized

**Solutions**:

1. Create `.env` file in project root:

   ```bash
   touch .env
   ```

2. Add API keys:

   ```bash
   OPENAI_API_KEY=sk-proj-your-key-here
   ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
   ```

3. Verify file exists and is readable:

   ```bash
   ls -la .env
   cat .env  # Check contents (be careful not to share)
   ```

4. Restart server to load new environment variables

**Related Issues**:

- [Invalid API keys](#invalid-api-key)

### Environment Variable Not Found

**Symptoms**:

- Requests work for some models but not others
- `KeyError` when accessing environment variable
- Authentication failures for specific providers

**Solutions**:

1. Check variable name matches `.env`:

   ```yaml
   # config.yaml references:
   api_key: os.environ/OPENAI_API_KEY

   # .env must contain:
   OPENAI_API_KEY=sk-...
   ```

2. Verify `.env` is being loaded:

   ```python
   import os
   from dotenv import load_dotenv

   load_dotenv()
   print(os.environ.get("OPENAI_API_KEY"))  # Should print your key
   ```

3. Restart server after modifying `.env`

**Related Issues**:

- [Missing .env file](#missing-env-file)

## Runtime Errors

### "Address already in use" (Port 4000 Conflict)

**Symptoms**:

- `OSError: [Errno 48] error while attempting to bind on address ('0.0.0.0', 4000)`
- Server fails to start
- Port already in use

**Solutions**:

1. Check what's using port 4000:

   ```bash
   lsof -i :4000
   ```

2. Kill existing process:

   ```bash
   kill -9 <PID>
   ```

3. Or use a different port:

   ```bash
   apantli --port 8080
   ```

4. Or find and stop previous Apantli instance:

   ```bash
   ps aux | grep apantli
   kill <PID>
   ```

**Related Issues**:

- [Cannot connect to server](#cannot-connect-to-dashboard)

### "litellm.exceptions.BadRequestError"

**Symptoms**:

- `BadRequestError: Unknown model: provider/model-name`
- Requests fail immediately
- Model not recognized by LiteLLM

**Solutions**:

1. Verify model identifier format:

   ```yaml
   # Correct
   model: openai/gpt-4.1-mini

   # Incorrect (missing provider prefix)
   model: gpt-4.1-mini
   ```

2. Check LiteLLM supported models: https://docs.litellm.ai/docs/providers

3. Update LiteLLM if model is new:

   ```bash
   pip install --upgrade litellm
   ```

4. Test model directly with LiteLLM:

   ```python
   from litellm import completion
   response = completion(
       model="openai/gpt-4.1-mini",
       messages=[{"role": "user", "content": "test"}],
       api_key="your-key"
   )
   ```

**Related Issues**:

- [Model not found](#model-not-found-error)

### Server Crashes on Startup

**Symptoms**:

- Server starts then immediately exits
- Traceback showing import errors or configuration errors
- No error message visible

**Solutions**:

1. Run with Python directly to see full error:

   ```bash
   python3 -m apantli.server
   ```

2. Check for common issues:
   - Missing dependencies
   - Invalid `config.yaml` syntax
   - Port conflicts
   - File permission errors

3. Enable debug mode:

   ```bash
   apantli --reload
   ```

4. Check logs for specific error messages

**Related Issues**:

- [Missing dependencies](#missing-dependencies)
- [YAML syntax errors](#invalid-yaml-syntax)

## Request Failures

### "Model is required" Error

**Symptoms**:

- HTTP 400 Bad Request
- Response: `{"error": {"message": "Model is required", "type": "invalid_request_error", "code": "missing_model"}}`

**Solutions**:

1. Ensure `model` field is present in request:

   ```bash
   curl http://localhost:4000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4.1-mini",
       "messages": [{"role": "user", "content": "test"}]
     }'
   ```

2. Check for typos in field name (`model`, not `modelName` or `model_name`)

**Related Issues**:

- [Invalid request format](#malformed-json-request)

### Invalid API Key

**Symptoms**:

- `AuthenticationError: Invalid API key`
- Provider returns 401 Unauthorized
- Requests fail immediately after startup

**Solutions**:

1. Verify API key format:
   - OpenAI: Starts with `sk-proj-` or `sk-`
   - Anthropic: Starts with `sk-ant-api03-`

2. Check API key is valid:
   - Test directly with provider's API
   - Verify key hasn't expired or been revoked
   - Check organization/project access

3. Ensure `.env` has correct key:

   ```bash
   grep OPENAI_API_KEY .env
   ```

4. Restart server after updating `.env`

5. Test key directly:

   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

**Related Issues**:

- [Environment variable not found](#environment-variable-not-found)
- [Missing .env file](#missing-env-file)

### Model Not Found Error

**Symptoms**:

- Request fails with "Model not found"
- Dashboard shows model in Models tab
- Model exists in `config.yaml`

**Solutions**:

1. Verify model name matches `config.yaml` exactly:

   ```bash
   # Check configured models
   curl http://localhost:4000/models | jq '.models[].name'
   ```

2. Check for typos or case sensitivity:
   - `gpt-4.1-mini` ≠ `gpt-4.1-Mini`
   - `claude-haiku-3.5` ≠ `claude-haiku-35`

3. Restart server after modifying `config.yaml`

4. Verify config was loaded successfully (no warnings at startup)

**Related Issues**:

- [Configuration not loading](#could-not-load-configyaml-warning)

### Rate Limit Errors

**Symptoms**:

- `RateLimitError: You exceeded your current quota`
- Requests succeed initially, then start failing
- Provider returns 429 Too Many Requests

**Solutions**:

1. Check provider account limits:
   - OpenAI: https://platform.openai.com/account/limits
   - Anthropic: https://console.anthropic.com/settings/limits

2. Verify billing is set up and active

3. Reduce request frequency

4. Use different model tier if quota exceeded

5. Wait for rate limit to reset (usually 1 minute)

**Related Issues**:

- [Cost tracking inaccurate](#cost-calculations-seem-wrong)

### Timeout Errors

**Symptoms**:

- Requests hang for a long time then fail
- `TimeoutError` or `ReadTimeout`
- Server doesn't respond

**Solutions**:

1. Check internet connection

2. Verify provider API is operational:
   - OpenAI: https://status.openai.com/
   - Anthropic: https://status.anthropic.com/

3. Try simpler/shorter request to test

4. Increase timeout in client code:

   ```python
   response = requests.post(
       "http://localhost:4000/v1/chat/completions",
       json={...},
       timeout=60  # 60 seconds
   )
   ```

5. Check for network proxy or firewall issues

**Related Issues**:

- [Cannot connect to providers](#cannot-reach-provider-apis)

### Malformed JSON Request

**Symptoms**:

- HTTP 422 Unprocessable Entity
- `json.decoder.JSONDecodeError`
- "Invalid JSON" errors

**Solutions**:

1. Validate JSON syntax:

   ```bash
   echo '{"model": "gpt-4.1-mini", ...}' | jq
   ```

2. Check Content-Type header:

   ```bash
   curl http://localhost:4000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{...}'
   ```

3. Verify quotes are proper JSON quotes (not smart quotes)

4. Check for trailing commas (not allowed in JSON):

   ```json
   {
     "model": "gpt-4.1-mini",
     "messages": [...],  // Remove this trailing comma
   }
   ```

**Related Issues**:

- [Model is required error](#model-is-required-error)

## Database Issues

For comprehensive database troubleshooting, maintenance procedures, and schema details, see [DATABASE.md](DATABASE.md).

### Quick Reference

**Common issues**:

- ["database is locked"](DATABASE.md#database-is-locked-error) - Multiple connections or high concurrency
- [Database corruption](DATABASE.md#database-corruption) - Recovery and backup procedures
- [Request history disappeared](DATABASE.md#request-history-disappeared) - Verify database location and contents
- [High memory usage](DATABASE.md#high-memory-usage) - Database size and pruning

**Quick checks**:

```bash
# Check database size
ls -lh requests.db

# Count records
sqlite3 requests.db "SELECT COUNT(*) FROM requests"

# Check for locks
lsof requests.db
```

## Dashboard Issues

### Cannot Connect to Dashboard

**Symptoms**:

- Browser shows "Unable to connect" at http://localhost:4000
- Dashboard doesn't load
- Connection refused

**Solutions**:

1. Verify server is running:

   ```bash
   curl http://localhost:4000/health
   ```

2. Check server started successfully (look for errors in console)

3. Verify correct port:

   ```bash
   # Check server startup message
   # Should show: Uvicorn running on http://0.0.0.0:4000
   ```

4. Try different browser or incognito mode

5. Check firewall isn't blocking port 4000

**Related Issues**:

- [Port already in use](#address-already-in-use-port-4000-conflict)

### Dashboard Shows Zero Stats

**Symptoms**:

- Dashboard loads but shows 0 requests, $0.00 cost
- No data in tables
- Stats page is empty

**Solutions**:

1. Make test request:

   ```bash
   curl http://localhost:4000/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{
       "model": "gpt-4.1-mini",
       "messages": [{"role": "user", "content": "test"}]
     }'
   ```

2. Check if request succeeded (look for errors in response)

3. Verify database is being written to:

   ```bash
   sqlite3 requests.db "SELECT * FROM requests ORDER BY id DESC LIMIT 1"
   ```

4. Refresh dashboard (should auto-refresh every 5 seconds)

**Related Issues**:

- [Request failures](#request-failures)
- [Database issues](#database-issues)

### Models Tab Empty

**Symptoms**:

- Models tab shows no models
- Empty table on Models tab
- "No models configured" message

**Solutions**:

1. Check `config.yaml` exists and has models:

   ```bash
   cat config.yaml
   ```

2. Verify configuration loaded at startup (no warnings in console)

3. Test `/models` endpoint directly:

   ```bash
   curl http://localhost:4000/models | jq
   ```

4. Restart server if recently modified `config.yaml`

**Related Issues**:

- [Configuration not loading](#could-not-load-configyaml-warning)

### Request Details Won't Expand

**Symptoms**:

- Clicking request rows in Requests tab doesn't show details
- No response when clicking rows
- JavaScript errors in browser console

**Solutions**:

1. Check browser console for JavaScript errors (F12)

2. Try different browser

3. Hard refresh page (Ctrl+Shift+R or Cmd+Shift+R)

4. Verify `response_data` field is populated:

   ```bash
   sqlite3 requests.db "SELECT response_data FROM requests LIMIT 1"
   ```

**Related Issues**:

- [Dashboard not loading](#cannot-connect-to-dashboard)

## Performance Issues

### Slow Request Processing

**Symptoms**:

- Requests take much longer than expected
- Dashboard shows high `avg_duration_ms`
- Timeouts under load

**Solutions**:

1. Check provider API latency (baseline without proxy):

   ```bash
   time curl https://api.openai.com/v1/chat/completions \
     -H "Authorization: Bearer $OPENAI_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{...}'
   ```

2. Database writes are usually fast (<5ms). Check if database is on slow storage.

3. LiteLLM overhead is ~10-50ms. For production, consider direct provider SDKs.

4. Check network latency to provider

5. Reduce `max_tokens` in requests to get faster responses

**Related Issues**:

- [Timeout errors](#timeout-errors)

### High Memory Usage

**Symptoms**:

- Server process using excessive RAM
- Memory grows over time
- System slows down

**Solutions**:

See [DATABASE.md - High Memory Usage](DATABASE.md#high-memory-usage) for detailed troubleshooting.

**Quick checks**:

```bash
# Check database size
ls -lh requests.db

# Monitor server memory
ps aux | grep apantli
```

**Common fixes**:

- Prune old database records (see [DATABASE.md - Pruning](DATABASE.md#pruning-old-data))
- Restart server periodically
- Archive large databases before deletion

**Related Issues**:

- [Database maintenance](DATABASE.md#database-maintenance)

### Cost Calculations Seem Wrong

**Symptoms**:

- Dashboard shows unexpected costs
- Costs don't match provider billing
- Some requests show $0.00 cost

**Solutions**:

1. Verify LiteLLM has pricing data for your model:

   ```bash
   curl http://localhost:4000/models | jq '.models[] | select(.name == "your-model")'
   ```

2. LiteLLM pricing may lag behind provider updates. Check LiteLLM version:

   ```bash
   pip show litellm
   ```

3. Update LiteLLM:

   ```bash
   pip install --upgrade litellm
   ```

4. Compare with provider dashboard to verify actual costs

5. Some models may not have pricing data (shows as `null` in `/models` endpoint)

**Related Issues**:

- [Stats showing incorrect data](#dashboard-shows-zero-stats)

## Cannot Reach Provider APIs

**Symptoms**:

- All requests fail with connection errors
- "Unable to reach provider" messages
- Network timeouts

**Solutions**:

1. Check internet connection:

   ```bash
   ping google.com
   ```

2. Verify DNS resolution:

   ```bash
   nslookup api.openai.com
   nslookup api.anthropic.com
   ```

3. Check firewall/proxy settings

4. Test direct connection to provider:

   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

5. Check for corporate VPN or proxy requirements

**Related Issues**:

- [Timeout errors](#timeout-errors)

## Getting Additional Help

If your issue isn't covered here:

1. Check server logs for specific error messages

2. Query database for failed requests:

   ```bash
   sqlite3 requests.db "SELECT timestamp, model, error FROM requests WHERE error IS NOT NULL ORDER BY timestamp DESC LIMIT 10"
   ```

3. Enable debug logging:

   ```bash
   # Set log level to debug
   export LITELLM_LOG=DEBUG
   apantli
   ```

4. Test configuration manually:

   ```python
   import yaml
   from dotenv import load_dotenv
   import os

   load_dotenv()
   config = yaml.safe_load(open('config.yaml'))

   for model in config['model_list']:
       print(f"Model: {model['model_name']}")
       api_key_ref = model['litellm_params']['api_key']
       if api_key_ref.startswith('os.environ/'):
           env_var = api_key_ref.split('/', 1)[1]
           key = os.environ.get(env_var)
           print(f"  Key found: {bool(key)}")
   ```

5. Review [ARCHITECTURE.md](ARCHITECTURE.md) for system design details
