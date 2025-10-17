"""Database operations for SQLite request logging."""

import aiosqlite
import json
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

import litellm


# Database path (can be overridden by CLI args in main())
DB_PATH = "requests.db"


class Database:
  """Async database interface for request logging."""

  def __init__(self, path: str):
    self.path = path

  @asynccontextmanager
  async def _get_connection(self):
    """Context manager for database connections."""
    conn = await aiosqlite.connect(self.path)
    try:
      yield conn
      await conn.commit()
    finally:
      await conn.close()

  async def init(self):
    """Initialize SQLite database with requests table."""
    async with self._get_connection() as conn:
      await conn.execute("""
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
      """)

      # Create indexes for faster date-based queries
      await conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_timestamp
        ON requests(timestamp)
      """)
      await conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_date_provider
        ON requests(DATE(timestamp), provider)
        WHERE error IS NULL
      """)
      await conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_cost
        ON requests(cost)
        WHERE error IS NULL
      """)

  async def log_request(self, model: str, provider: str, response: dict,
                       duration_ms: int, request_data: dict,
                       error: Optional[str] = None):
    """Log a request to SQLite."""
    async with self._get_connection() as conn:
      usage = response.get('usage', {}) if response else {}
      prompt_tokens = usage.get('prompt_tokens', 0)
      completion_tokens = usage.get('completion_tokens', 0)
      total_tokens = usage.get('total_tokens', 0)

      # Calculate cost using LiteLLM
      cost = 0.0
      if response:
        try:
          cost = litellm.completion_cost(completion_response=response)
        except Exception:
          pass

      await conn.execute("""
        INSERT INTO requests
        (timestamp, model, provider, prompt_tokens, completion_tokens, total_tokens,
         cost, duration_ms, request_data, response_data, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      """, (
        datetime.utcnow().isoformat(),
        model,
        provider,
        prompt_tokens,
        completion_tokens,
        total_tokens,
        cost,
        duration_ms,
        json.dumps(request_data),
        json.dumps(response) if response else None,
        error
      ))

  async def get_requests(self, time_filter: str = "", offset: int = 0, limit: int = 50,
                        provider: Optional[str] = None, model: Optional[str] = None,
                        min_cost: Optional[float] = None, max_cost: Optional[float] = None,
                        search: Optional[str] = None):
    """Get requests with filtering and pagination.

    Args:
      time_filter: SQL WHERE clause fragment from build_time_filter()
      offset: Number of records to skip
      limit: Maximum number of records to return
      provider: Filter by provider name
      model: Filter by model name
      min_cost: Minimum cost threshold
      max_cost: Maximum cost threshold
      search: Search in model name or request/response content

    Returns:
      Dict with requests array, total count, aggregates, and pagination info
    """
    async with self._get_connection() as conn:
      # Build attribute filters
      filters = []
      params = []

      if provider:
        filters.append("provider = ?")
        params.append(provider)

      if model:
        filters.append("model = ?")
        params.append(model)

      if min_cost is not None:
        filters.append("cost >= ?")
        params.append(min_cost)

      if max_cost is not None:
        filters.append("cost <= ?")
        params.append(max_cost)

      if search:
        filters.append("(model LIKE ? OR request_data LIKE ? OR response_data LIKE ?)")
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param])

      # Combine filters
      filter_clause = time_filter
      if filters:
        filter_clause += " AND " + " AND ".join(filters)

      # Get aggregate stats for ALL matching requests
      cursor = await conn.execute(f"""
        SELECT COUNT(*),
               SUM(total_tokens),
               SUM(cost),
               AVG(cost)
        FROM requests
        WHERE error IS NULL {filter_clause}
      """, params)
      agg_row = await cursor.fetchone()
      total = agg_row[0] or 0
      total_tokens = agg_row[1] or 0
      total_cost = agg_row[2] or 0.0
      avg_cost = agg_row[3] or 0.0

      # Get paginated results
      cursor = await conn.execute(f"""
        SELECT timestamp, model, provider, prompt_tokens, completion_tokens, total_tokens,
               cost, duration_ms, request_data, response_data
        FROM requests
        WHERE error IS NULL {filter_clause}
        ORDER BY timestamp DESC
        LIMIT {limit} OFFSET {offset}
      """, params)
      rows = await cursor.fetchall()

      return {
        "requests": [
          {
            "timestamp": row[0],
            "model": row[1],
            "provider": row[2],
            "prompt_tokens": row[3],
            "completion_tokens": row[4],
            "total_tokens": row[5],
            "cost": row[6],
            "duration_ms": row[7],
            "request_data": row[8],
            "response_data": row[9]
          }
          for row in rows
        ],
        "total": total,
        "total_tokens": total_tokens,
        "total_cost": total_cost,
        "avg_cost": avg_cost,
        "offset": offset,
        "limit": limit
      }

  async def get_stats(self, time_filter: str = ""):
    """Get usage statistics with optional time filtering.

    Args:
      time_filter: SQL WHERE clause fragment from build_time_filter()

    Returns:
      Dict with totals, by_model, by_provider, performance, and recent_errors
    """
    async with self._get_connection() as conn:
      # Total stats
      cursor = await conn.execute(f"""
        SELECT
          COUNT(*) as total_requests,
          SUM(cost) as total_cost,
          SUM(prompt_tokens) as total_prompt_tokens,
          SUM(completion_tokens) as total_completion_tokens,
          AVG(duration_ms) as avg_duration_ms
        FROM requests
        WHERE error IS NULL {time_filter}
      """)
      totals = await cursor.fetchone()

      # By model (include provider for segmented visualization)
      cursor = await conn.execute(f"""
        SELECT
          model,
          provider,
          COUNT(*) as requests,
          SUM(cost) as cost,
          SUM(total_tokens) as tokens
        FROM requests
        WHERE error IS NULL {time_filter}
        GROUP BY model, provider
        ORDER BY cost DESC
      """)
      by_model = await cursor.fetchall()

      # By provider
      cursor = await conn.execute(f"""
        SELECT
          provider,
          COUNT(*) as requests,
          SUM(cost) as cost,
          SUM(total_tokens) as tokens
        FROM requests
        WHERE error IS NULL {time_filter}
        GROUP BY provider
        ORDER BY cost DESC
      """)
      by_provider = await cursor.fetchall()

      # Model performance metrics
      cursor = await conn.execute(f"""
        SELECT
          model,
          COUNT(*) as requests,
          AVG(CAST(completion_tokens AS REAL) / (CAST(duration_ms AS REAL) / 1000.0)) as avg_tokens_per_sec,
          AVG(duration_ms) as avg_duration_ms,
          MIN(CAST(completion_tokens AS REAL) / (CAST(duration_ms AS REAL) / 1000.0)) as min_tokens_per_sec,
          MAX(CAST(completion_tokens AS REAL) / (CAST(duration_ms AS REAL) / 1000.0)) as max_tokens_per_sec,
          AVG(cost) as avg_cost_per_request
        FROM requests
        WHERE error IS NULL
          AND completion_tokens > 0
          AND duration_ms > 0
          {time_filter}
        GROUP BY model
        ORDER BY avg_tokens_per_sec DESC
      """)
      performance = await cursor.fetchall()

      # Recent errors
      cursor = await conn.execute(f"""
        SELECT timestamp, model, error
        FROM requests
        WHERE error IS NOT NULL {time_filter}
        ORDER BY timestamp DESC
        LIMIT 10
      """)
      errors = await cursor.fetchall()

      return {
        "totals": {
          "requests": totals[0] or 0,
          "cost": round(totals[1] or 0, 4),
          "prompt_tokens": totals[2] or 0,
          "completion_tokens": totals[3] or 0,
          "avg_duration_ms": round(totals[4] or 0, 2)
        },
        "by_model": [
          {"model": row[0], "provider": row[1], "requests": row[2], "cost": round(row[3] or 0, 4), "tokens": row[4]}
          for row in by_model
        ],
        "by_provider": [
          {"provider": row[0], "requests": row[1], "cost": round(row[2] or 0, 4), "tokens": row[3]}
          for row in by_provider
        ],
        "performance": [
          {
            "model": row[0],
            "requests": row[1],
            "avg_tokens_per_sec": round(row[2] or 0, 2),
            "avg_duration_ms": round(row[3] or 0, 2),
            "min_tokens_per_sec": round(row[4] or 0, 2),
            "max_tokens_per_sec": round(row[5] or 0, 2),
            "avg_cost_per_request": round(row[6] or 0, 6)
          }
          for row in performance
        ],
        "recent_errors": [
          {"timestamp": row[0], "model": row[1], "error": row[2]}
          for row in errors
        ]
      }


# Backward compatibility: module-level functions that use global DB_PATH
# These maintain the original API for existing code

# Global database instance (initialized by init_db())
_db: Optional[Database] = None


async def init_db():
  """Initialize SQLite database with requests table (async)."""
  global _db
  _db = Database(DB_PATH)
  await _db.init()


async def log_request(model: str, provider: str, response: dict, duration_ms: int,
                     request_data: dict, error: Optional[str] = None):
  """Log a request to SQLite (async)."""
  if _db is None:
    raise RuntimeError("Database not initialized. Call init_db() first.")
  await _db.log_request(model, provider, response, duration_ms, request_data, error)
