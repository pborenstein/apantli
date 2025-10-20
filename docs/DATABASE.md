# Database Documentation

Complete reference for Apantli's SQLite database system.

## Overview

**File**: `requests.db` (created automatically on first request)

**Type**: SQLite 3

**Purpose**: Persistent storage for all LLM requests, responses, token usage, costs, and errors

**Location**: Project root directory (unless custom path specified via `--db` flag)

## Schema

### Table: requests

Complete schema for the main requests table:

| Column | Type | Description |
|:-------|:-----|:------------|
| id | INTEGER | Primary key (autoincrement) |
| timestamp | TEXT | ISO 8601 timestamp (UTC) - when request was made |
| model | TEXT | Model name as requested by client |
| provider | TEXT | Provider name (openai, anthropic, etc.) - inferred from model or response |
| prompt_tokens | INTEGER | Input token count |
| completion_tokens | INTEGER | Output token count |
| total_tokens | INTEGER | Sum of prompt + completion |
| cost | REAL | USD cost calculated by LiteLLM |
| duration_ms | INTEGER | Request duration in milliseconds |
| request_data | TEXT | Full request JSON (serialized) |
| response_data | TEXT | Full response JSON (serialized) |
| error | TEXT | Error message if request failed (NULL otherwise) |

**Creation SQL**:

```sql
CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    model TEXT NOT NULL,
    provider TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    cost REAL,
    duration_ms INTEGER,
    request_data TEXT,
    response_data TEXT,
    error TEXT
)
```

### Indexes

Performance indexes created at startup (as of dashboard improvements):

```sql
-- Primary timestamp index for date-based queries
CREATE INDEX IF NOT EXISTS idx_timestamp
ON requests(timestamp);

-- Composite index for date+provider aggregations
CREATE INDEX IF NOT EXISTS idx_date_provider
ON requests(DATE(timestamp), provider)
WHERE error IS NULL;

-- Cost sorting index for high-cost queries
CREATE INDEX IF NOT EXISTS idx_cost
ON requests(cost)
WHERE error IS NULL;
```

**Rationale**:

- `idx_timestamp`: Speeds up date range filtering in stats endpoints
- `idx_date_provider`: Optimizes provider breakdown queries
- `idx_cost`: Enables fast sorting by cost (e.g., finding expensive requests)
- Partial indexes (`WHERE error IS NULL`) reduce index size by excluding failed requests

## Storage Characteristics

### Size Estimates

Based on typical usage patterns:

| Metric | Size |
|:-------|:-----|
| Per request (metadata only) | ~200-500 bytes |
| Per request (with JSON) | 2-15 KB |
| Average request_data | ~12 KB |
| Average response_data | ~1.6 KB |
| 1000 requests | ~15 MB |
| 10000 requests | ~150 MB |

**Space breakdown**:

- **request_data** and **response_data**: 90-95% of total size
- Metadata (timestamps, tokens, costs): 5-10% of total size

### What Gets Stored

**Always stored**:

- Request metadata (timestamp, model, provider, tokens, cost, duration)
- Error messages for failed requests

**Configurable** (currently always on):

- Full request JSON including all messages and parameters
- Full response JSON including all choices and metadata
- API keys (stored for debugging purposes)

**Never stored**:

- Server logs (separate from database)

## Database Maintenance

### Checking Database Size

```bash
# File size
ls -lh requests.db

# Record count
sqlite3 requests.db "SELECT COUNT(*) FROM requests;"

# Size by component
sqlite3 requests.db "
SELECT
  COUNT(*) as total_records,
  SUM(LENGTH(request_data)) / 1024.0 / 1024.0 as request_mb,
  SUM(LENGTH(response_data)) / 1024.0 / 1024.0 as response_mb
FROM requests;
"
```

### Pruning Old Data

**Delete old records** (removes everything):

```bash
# Delete requests older than 30 days
sqlite3 requests.db "DELETE FROM requests WHERE timestamp < datetime('now', '-30 days')"

# Reclaim disk space after deletion
sqlite3 requests.db "VACUUM"
```

**Compact without losing metadata** (keeps costs/tokens, removes JSON):

```bash
# Remove request/response JSON from old successful requests
sqlite3 requests.db "
UPDATE requests
SET request_data = NULL, response_data = NULL
WHERE timestamp < datetime('now', '-30 days')
  AND error IS NULL
"

sqlite3 requests.db "VACUUM"
```

### Archiving Data

**Export to JSON before deletion**:

```bash
# Export last 30 days to JSON file
sqlite3 requests.db -json \
  "SELECT * FROM requests WHERE timestamp < datetime('now', '-30 days')" \
  > archive_$(date +%Y%m%d).json

# Then delete from database
sqlite3 requests.db "DELETE FROM requests WHERE timestamp < datetime('now', '-30 days')"
sqlite3 requests.db "VACUUM"
```

**Export to CSV for analysis**:

```bash
sqlite3 requests.db -csv \
  "SELECT timestamp, model, provider, total_tokens, cost FROM requests" \
  > usage_export.csv
```

### VACUUM Command

The `VACUUM` command rebuilds the database file to reclaim unused space after deletions.

**When to run**:

- After deleting large numbers of records
- When database file is much larger than expected based on record count
- Periodically (monthly) for long-running installations

**Performance impact**:

- Locks the database during operation (no writes possible)
- Can take several seconds for large databases (>1GB)
- Temporary disk space required: 2x current database size

## Querying the Database

## Database Class API

The `Database` class in `apantli/database.py` encapsulates all database operations with async methods.

### Constructor

```python
Database(path: str)
```

Creates a database instance pointing to the specified SQLite file.

### Core Methods

#### `async init()`

Initializes the database schema and indexes. Creates the `requests` table if it doesn't exist and establishes performance indexes for timestamp, date+provider, and cost queries.

**Usage**:
```python
db = Database("requests.db")
await db.init()
```

#### `async log_request(model, provider, response, duration_ms, request_data, error=None)`

Logs a completed request (successful or failed) to the database.

**Parameters**:
- `model` (str): Model name as requested by client
- `provider` (str): Provider name (openai, anthropic, etc.)
- `response` (dict): Full response from provider (None for errors)
- `duration_ms` (int): Request duration in milliseconds
- `request_data` (dict): Full request JSON
- `error` (str, optional): Error message if request failed

**Behavior**:
- Extracts token usage from response
- Calculates cost using `litellm.completion_cost()`
- Stores full request/response JSON
- Records UTC timestamp

### Query Methods

#### `async get_requests(time_filter="", offset=0, limit=50, provider=None, model=None, min_cost=None, max_cost=None, search=None)`

Returns paginated request history with filtering and aggregates.

**Parameters**:
- `time_filter` (str): SQL WHERE clause fragment (from `build_time_filter()`)
- `offset` (int): Number of records to skip (default: 0)
- `limit` (int): Maximum records to return (default: 50)
- `provider` (str, optional): Filter by provider name
- `model` (str, optional): Filter by model name
- `min_cost` (float, optional): Minimum cost threshold
- `max_cost` (float, optional): Maximum cost threshold
- `search` (str, optional): Search in model name or request/response content

**Returns**:
```python
{
  "requests": [...],      # Array of request objects
  "total": 150,          # Total matching records
  "total_tokens": 45000, # Sum of all tokens
  "total_cost": 2.45,    # Sum of all costs
  "avg_cost": 0.016,     # Average cost per request
  "offset": 0,
  "limit": 50
}
```

#### `async get_stats(time_filter="")`

Returns aggregated usage statistics with model/provider breakdown and performance metrics.

**Parameters**:
- `time_filter` (str): SQL WHERE clause fragment

**Returns**:
```python
{
  "totals": {...},           # Overall totals (requests, cost, tokens, avg_duration_ms)
  "by_model": [...],         # Per-model breakdown
  "by_provider": [...],      # Per-provider breakdown
  "performance": [...],      # Model performance metrics (tokens/sec, duration)
  "recent_errors": [...]     # Last 10 errors
}
```

#### `async get_daily_stats(start_date, end_date, where_filter, date_expr)`

Returns daily aggregated statistics with model breakdown.

**Parameters**:
- `start_date` (str): ISO date (YYYY-MM-DD)
- `end_date` (str): ISO date (YYYY-MM-DD)
- `where_filter` (str): SQL WHERE clause (without WHERE keyword)
- `date_expr` (str): SQL expression for grouping by date with timezone

**Returns**:
```python
{
  "daily": [...],          # Array of daily objects with by_model breakdown
  "total_days": 30,
  "total_cost": 45.67,
  "total_requests": 1234
}
```

#### `async get_hourly_stats(where_filter, hour_expr)`

Returns hourly aggregated statistics for a single day.

**Parameters**:
- `where_filter` (str): SQL WHERE clause (without WHERE keyword)
- `hour_expr` (str): SQL expression for grouping by hour with timezone

**Returns**:
```python
{
  "hourly": [...],         # Array of hourly objects with by_model breakdown
  "total_cost": 1.23,
  "total_requests": 45
}
```

#### `async clear_errors()`

Deletes all error records from the database.

**Returns**: Number of deleted records (int)

#### `async get_date_range()`

Returns the actual date range of data in the database.

**Returns**:
```python
{
  "start_date": "2024-01-01",  # ISO date or None if no data
  "end_date": "2024-01-31"     # ISO date or None if no data
}
```

## Command-Line Queries

### Quick Reference

For quick database queries from the command line:

```bash
# View recent requests
sqlite3 requests.db "SELECT timestamp, model, cost FROM requests ORDER BY timestamp DESC LIMIT 10"

# Calculate total costs
sqlite3 requests.db "SELECT SUM(cost) FROM requests"

# Count total requests
sqlite3 requests.db "SELECT COUNT(*) FROM requests"

# View errors
sqlite3 requests.db "SELECT timestamp, model, error FROM requests WHERE error IS NOT NULL ORDER BY timestamp DESC LIMIT 10"
```

### Common Queries

**Cost by provider (last 7 days)**:

```sql
SELECT
  provider,
  COUNT(*) as requests,
  SUM(total_tokens) as tokens,
  SUM(cost) as total_cost
FROM requests
WHERE timestamp > datetime('now', '-7 days')
  AND error IS NULL
GROUP BY provider
ORDER BY total_cost DESC;
```

**Most expensive requests**:

```sql
SELECT
  timestamp,
  model,
  total_tokens,
  cost,
  SUBSTR(request_data, 1, 100) as request_preview
FROM requests
WHERE error IS NULL
ORDER BY cost DESC
LIMIT 10;
```

**Error rate by model**:

```sql
SELECT
  model,
  COUNT(*) as total,
  SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) as errors,
  ROUND(100.0 * SUM(CASE WHEN error IS NOT NULL THEN 1 ELSE 0 END) / COUNT(*), 2) as error_rate_pct
FROM requests
GROUP BY model
HAVING total > 10
ORDER BY error_rate_pct DESC;
```

**Daily usage summary**:

```sql
SELECT
  DATE(timestamp) as date,
  COUNT(*) as requests,
  SUM(total_tokens) as tokens,
  ROUND(SUM(cost), 4) as cost
FROM requests
WHERE error IS NULL
GROUP BY DATE(timestamp)
ORDER BY date DESC
LIMIT 30;
```

## Troubleshooting

### "database is locked" Error

**Symptoms**:

- `sqlite3.OperationalError: database is locked`
- Intermittent request failures
- Database operations hang

**Causes**:

- Multiple server instances accessing same database
- External tools (sqlite3 CLI) holding locks
- SQLite's single-writer limitation under high concurrency

**Solutions**:

1. Close other connections to `requests.db`:

   ```bash
   # Check for processes using the database
   lsof requests.db
   ```

2. Ensure only one server instance is running:

   ```bash
   ps aux | grep apantli
   ```

3. For high-concurrency scenarios:
   - Use external database (Postgres)
   - Or reduce concurrent requests
   - Or increase SQLite timeout in code

### Database Corruption

**Symptoms**:

- `sqlite3.DatabaseError: database disk image is malformed`
- Server crashes on startup
- Stats endpoint returns errors

**Solutions**:

1. Backup existing database:

   ```bash
   cp requests.db requests.db.backup
   ```

2. Try recovery:

   ```bash
   sqlite3 requests.db ".recover" | sqlite3 requests.db.recovered
   mv requests.db.recovered requests.db
   ```

3. If recovery fails, delete and recreate (loses all data):

   ```bash
   rm requests.db
   apantli  # Will create fresh database
   ```

4. Restore from backup if available

### Request History Disappeared

**Symptoms**:

- Dashboard shows no requests
- `/requests` endpoint returns empty array
- Stats show zero requests

**Solutions**:

1. Check database file exists:

   ```bash
   ls -la requests.db
   ```

2. Verify database has data:

   ```bash
   sqlite3 requests.db "SELECT COUNT(*) FROM requests"
   ```

3. Check if using custom database path:

   ```bash
   # Ensure you're querying the right database
   apantli --db /path/to/custom.db
   ```

4. Server may have recreated database (check for `requests.db.backup` or similar)

### High Memory Usage

**Symptoms**:

- Server using excessive RAM (>500 MB)
- Slow dashboard loading
- System memory warnings

**Solutions**:

1. Check database size:

   ```bash
   ls -lh requests.db
   ```

2. Large database files (>1GB) can increase memory usage. Archive or delete old data:

   ```bash
   # Delete requests older than 30 days
   sqlite3 requests.db "DELETE FROM requests WHERE timestamp < datetime('now', '-30 days')"
   sqlite3 requests.db "VACUUM"
   ```

3. Restart server periodically to clear memory

4. Monitor with:

   ```bash
   ps aux | grep apantli
   ```

## Limitations

### Concurrency

**SQLite characteristics**:

- Single-writer limitation (only one write transaction at a time)
- Multiple readers supported
- File-level locking

**Impact on Apantli**:

- For single-user local proxy: Not a bottleneck
- For multi-user scenarios: May cause "database is locked" errors under load
- Typical write time: <5ms per request

**Alternatives for production**:

- Postgres (requires external service)
- Disable request logging (metadata only)
- Use connection pooling with increased timeout

### Size Limits

**Theoretical limits**:

- Maximum database size: 281 TB (SQLite limitation)
- Maximum table rows: 2^64 (effectively unlimited)

**Practical limits**:

- Performance degrades above ~1GB without proper indexes
- Dashboard queries slow down with >100K records
- Full-text search in JSON becomes impractical above ~50K records

**Mitigation**:

- Regular pruning (delete old records)
- Archival (export to JSON/CSV before deletion)
- Remove request_data/response_data from old records (keep metadata)

## Security Considerations

### Sensitive Data Storage

**What's in the database**:

- Full conversation history (all messages)
- User inputs (potentially sensitive)
- Model outputs
- Metadata (timestamps, costs, models)
- API keys (stored in request_data for debugging)

**What's NOT in the database**:

- Server authentication tokens
- System credentials

### File Permissions

Default SQLite file permissions: `rw-r--r--` (644)

**Recommended** for production:

```bash
# Restrict to owner only
chmod 600 requests.db
```

**Location considerations**:

- Default: Project root (accessible to anyone with repo access)
- Custom path: Use `--db /secure/path/requests.db` for sensitive environments

### Data Retention Policies

**Considerations**:

- GDPR/privacy compliance if storing user data
- Automatic deletion after N days
- Anonymization of request_data/response_data
- Encryption at rest (SQLite has limited built-in encryption)

**Recommended approach**:

1. Document retention policy (30/60/90 days)
2. Implement automatic pruning
3. Export aggregated metrics before deletion
4. Store database in encrypted volume if required

## API Endpoints for Database Operations

See [API.md](API.md) for full endpoint documentation.

### Reading Data

- `GET /stats` - Aggregated statistics
- `GET /stats/daily` - Daily breakdown
- `GET /stats/date-range` - Available date range
- `GET /requests` - Last 50 requests
- `GET /models` - Model usage summary

### Modifying Data

- `DELETE /errors` - Clear all error records

**Note**: No endpoint for deleting all data or arbitrary records. Use SQLite CLI for manual operations.

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) - Overall system design including database role
- [API.md](API.md) - API endpoints that query the database
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - Debugging database issues
