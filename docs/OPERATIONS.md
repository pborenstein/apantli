# Operations & Maintenance

Guide for maintaining and operating Apantli in production or long-term development environments.

## Overview

This document covers:

- Regular maintenance tasks
- Dependency updates (including pricing data)
- Database management and backups
- Monitoring and troubleshooting
- Version upgrades

For initial setup, see [README.md](../README.md). For database-specific operations, see [DATABASE.md](DATABASE.md).

## Regular Maintenance Tasks

### Update Model Pricing Data

**Frequency**: Monthly or when providers announce pricing changes

**Why**: Apantli uses LiteLLM's built-in pricing database for cost calculations. Provider pricing changes aren't automatically reflected until you update the LiteLLM package.

**Commands**:

```bash
# Update LiteLLM pricing data
make update-pricing

# This runs:
# 1. uv sync --upgrade-package litellm
# 2. python utils/recalculate_costs.py
```

**Steps**:

1. Update LiteLLM package to get latest pricing
2. Recalculate costs for historical requests with $0.00 or outdated pricing
3. Restart Apantli server to use new pricing

**Manual approach** (if not using Makefile):

```bash
# 1. Update LiteLLM
uv sync --upgrade-package litellm

# 2. Recalculate historical costs
python utils/recalculate_costs.py

# 3. Restart server
# Stop current server (Ctrl+C or systemd/launchd)
apantli
```

**Note**: Some models may still show `$0.00` or `null` if LiteLLM doesn't have pricing data for them. Check LiteLLM's [model_prices_and_context_window.json](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json) for coverage.

### Check for Dependency Updates

**Frequency**: Monthly or quarterly

**Why**: Security patches, bug fixes, and new features from upstream dependencies.

**Commands**:

```bash
# Update all dependencies
make update-deps

# This runs: uv sync --upgrade
```

**After updating**:

1. Run tests to verify compatibility:
   ```bash
   make all
   ```

2. Review changes in major dependencies:
   ```bash
   uv pip list
   ```

3. Test in development before deploying to production

### Database Maintenance

**Frequency**: Monthly for active installations, quarterly for light usage

See [DATABASE.md](DATABASE.md#database-maintenance) for detailed procedures.

**Quick tasks**:

```bash
# Check database size
ls -lh requests.db

# Count records
sqlite3 requests.db "SELECT COUNT(*) FROM requests;"

# Vacuum to reclaim space (after deletions)
sqlite3 requests.db "VACUUM"
```

**Archiving old data** (if database grows large):

```bash
# Export requests older than 90 days
sqlite3 requests.db -json \
  "SELECT * FROM requests WHERE timestamp < datetime('now', '-90 days')" \
  > archive_$(date +%Y%m%d).json

# Delete old records
sqlite3 requests.db "DELETE FROM requests WHERE timestamp < datetime('now', '-90 days')"

# Reclaim space
sqlite3 requests.db "VACUUM"
```

### Clean Build Artifacts

**Frequency**: As needed (after development work)

**Commands**:

```bash
# Clean Python cache files
make clean
```

This removes `__pycache__`, `.mypy_cache`, `.pytest_cache`, and `*.pyc` files.

## Monitoring

### Check Server Status

**Health endpoint**:

```bash
curl http://localhost:4000/health
# Expected: {"status": "ok"}
```

**Process status**:

```bash
# If running as systemd service
systemctl status apantli

# If running as macOS launchd service
launchctl list | grep apantli
```

### Monitor Costs

**Dashboard**: http://localhost:4000/

The Stats tab shows:
- Total requests and costs (filterable by time period)
- Cost breakdown by model and provider
- Recent errors

**API endpoint**:

```bash
# Get current day stats
curl http://localhost:4000/stats | jq

# Get last 7 days
curl 'http://localhost:4000/stats?period=7d' | jq
```

### Check for Errors

**Recent errors via API**:

```bash
curl http://localhost:4000/stats | jq '.recent_errors'
```

**Query database directly**:

```bash
# Last 10 errors
sqlite3 requests.db "
  SELECT timestamp, model, error
  FROM requests
  WHERE error IS NOT NULL
  ORDER BY timestamp DESC
  LIMIT 10
"
```

**Clear logged errors** (after investigation):

```bash
curl -X DELETE http://localhost:4000/errors
```

### Verify Model Pricing

**Check if models have pricing data**:

```bash
curl http://localhost:4000/models | jq '.[] | {name, input_cost: .input_cost_per_million, output_cost: .output_cost_per_million}'
```

Models showing `null` costs may need LiteLLM updates or may not have pricing data available.

## Backup Strategies

### Database Backups

**SQLite database** (`requests.db`) contains:
- Complete request/response history
- API keys (stored for debugging)
- Cost calculations

**Backup approaches**:

1. **Simple file copy** (while server is running):
   ```bash
   cp requests.db backups/requests_$(date +%Y%m%d).db
   ```

2. **SQLite backup command** (safer for active databases):
   ```bash
   sqlite3 requests.db ".backup backups/requests_$(date +%Y%m%d).db"
   ```

3. **Automated daily backups** (cron example):
   ```bash
   # Add to crontab: 2 AM daily backup
   0 2 * * * cd /path/to/apantli && sqlite3 requests.db ".backup backups/requests_$(date +\%Y\%m\%d).db"
   ```

**Retention strategy**:
- Daily backups: Keep 7 days
- Weekly backups: Keep 4 weeks
- Monthly backups: Keep 12 months

### Configuration Backups

**Files to backup**:
- `config.yaml` - Model configurations
- `.env` - API keys (store securely!)

These files are small and should be backed up before any changes:

```bash
# Backup before changes
cp config.yaml config.yaml.backup
cp .env .env.backup
```

**Version control**: Consider tracking `config.yaml` in git (but never `.env`).

## Upgrades

### Upgrading Apantli

**When using git**:

```bash
# Pull latest version
git pull origin main

# Update dependencies
make update-deps

# Run tests
make all

# Restart server
apantli
```

**When using PyPI** (if published):

```bash
uv sync --upgrade-package apantli
apantli
```

### Database Migrations

Apantli uses SQLite with `CREATE TABLE IF NOT EXISTS` for schema management. Schema changes are rare and typically backwards-compatible.

**Check for schema changes** in release notes or CHANGELOG.md before upgrading.

**Manual migration** (if needed):

```bash
# Backup database first
cp requests.db requests.db.backup

# Run Apantli - it will apply schema changes automatically
apantli

# Verify
sqlite3 requests.db ".schema"
```

## Troubleshooting Operations

### High Database Size

**Symptoms**: `requests.db` grows to multiple GB

**Solutions**:

1. Check size breakdown:
   ```bash
   sqlite3 requests.db "
   SELECT
     COUNT(*) as total_records,
     SUM(LENGTH(request_data)) / 1024.0 / 1024.0 as request_mb,
     SUM(LENGTH(response_data)) / 1024.0 / 1024.0 as response_mb
   FROM requests;
   "
   ```

2. Archive old data (see Database Maintenance above)

3. Remove JSON from old requests (keep metadata):
   ```bash
   sqlite3 requests.db "
   UPDATE requests
   SET request_data = NULL, response_data = NULL
   WHERE timestamp < datetime('now', '-90 days')
     AND error IS NULL
   "
   sqlite3 requests.db "VACUUM"
   ```

### Missing Cost Data

**Symptoms**: Dashboard shows $0.00 costs for requests

**Solutions**:

1. Check if model has pricing data:
   ```bash
   curl http://localhost:4000/models | jq '.[] | select(.name=="your-model")'
   ```

2. Update pricing data:
   ```bash
   make update-pricing
   ```

3. If still $0.00, check LiteLLM's pricing database:
   - Visit: https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json
   - Search for your model
   - Some models may not have public pricing

### Server Performance Issues

**Symptoms**: Slow response times, high CPU usage

**Diagnostics**:

1. Check database performance:
   ```bash
   sqlite3 requests.db "EXPLAIN QUERY PLAN SELECT * FROM requests ORDER BY timestamp DESC LIMIT 50"
   ```

2. Verify indexes exist:
   ```bash
   sqlite3 requests.db ".indexes"
   ```

3. Run VACUUM if database is fragmented:
   ```bash
   sqlite3 requests.db "VACUUM"
   ```

4. Monitor server logs for errors

**Solutions**:
- Archive old data to reduce database size
- Ensure indexes are present (created automatically on init)
- Restart server to clear any memory leaks
- Check system resources (CPU, memory, disk I/O)

## Production Considerations

### Security

**Important**: Apantli has **no authentication or authorization** by default.

**Recommendations**:

1. **Bind to localhost only**:
   ```bash
   apantli --host 127.0.0.1
   ```

2. **Protect database file**:
   ```bash
   chmod 600 requests.db
   ```

3. **Secure .env file**:
   ```bash
   chmod 600 .env
   ```

4. **Network access**: Use firewall rules or reverse proxy with authentication if exposing to network

See [ARCHITECTURE.md](ARCHITECTURE.md#security-considerations) for details.

### Process Management

**systemd** (Linux):
- See systemd service file examples in community resources

**launchd** (macOS):
- See [../launchd/README.md](../launchd/README.md) for macOS service setup

**Docker** (containerized):
- Mount `config.yaml`, `.env`, and `requests.db` as volumes
- Ensure database persists across container restarts

### Log Management

**Server logs**:
- Default: stdout/stderr
- Redirect to file: `apantli > apantli.log 2>&1`
- Use systemd/launchd for log rotation

**Log rotation** (if using file logging):

```bash
# Add to logrotate.d
/path/to/apantli/apantli.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
```

## Quick Reference

| Task | Command |
|:-----|:--------|
| Update pricing data | `make update-pricing` |
| Update all dependencies | `make update-deps` |
| Run tests | `make all` |
| Clean build artifacts | `make clean` |
| Backup database | `sqlite3 requests.db ".backup requests_backup.db"` |
| Check health | `curl http://localhost:4000/health` |
| View stats | `curl http://localhost:4000/stats` |
| Clear errors | `curl -X DELETE http://localhost:4000/errors` |
| Recalculate costs | `python utils/recalculate_costs.py` |
| Vacuum database | `sqlite3 requests.db "VACUUM"` |

## Related Documentation

- [DATABASE.md](DATABASE.md) - Database schema and maintenance
- [CONFIGURATION.md](CONFIGURATION.md) - Model configuration
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Common issues and solutions
- [TESTING.md](TESTING.md) - Testing procedures
- [../utils/README.md](../utils/README.md) - Utility scripts
