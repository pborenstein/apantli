"""Database operations for SQLite request logging."""

import aiosqlite
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

import litellm


@dataclass
class RequestFilter:
  """Filter parameters for database request queries."""
  time_filter: str = ""
  time_params: Optional[list] = None
  offset: int = 0
  limit: int = 50
  provider: Optional[str] = None
  model: Optional[str] = None
  min_cost: Optional[float] = None
  max_cost: Optional[float] = None
  search: Optional[str] = None

  def __post_init__(self):
    """Initialize mutable defaults."""
    if self.time_params is None:
      self.time_params = []


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

  async def log_request(self, model: str, provider: str, response: Optional[dict],
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

  async def get_requests(self, filters: RequestFilter):
    """Get requests with filtering and pagination.

    Args:
      filters: RequestFilter dataclass with filter parameters

    Returns:
      Dict with requests array, total count, aggregates, and pagination info
    """
    async with self._get_connection() as conn:
      # Build attribute filters
      where_conditions = []
      params: list = list(filters.time_params or [])  # Start with time filter params

      if filters.provider:
        where_conditions.append("provider = ?")
        params.append(filters.provider)

      if filters.model:
        where_conditions.append("model = ?")
        params.append(filters.model)

      if filters.min_cost is not None:
        where_conditions.append("cost >= ?")
        params.append(filters.min_cost)

      if filters.max_cost is not None:
        where_conditions.append("cost <= ?")
        params.append(filters.max_cost)

      if filters.search:
        where_conditions.append("(model LIKE ? OR request_data LIKE ? OR response_data LIKE ?)")
        search_param = f"%{filters.search}%"
        params.extend([search_param, search_param, search_param])

      # Combine filters
      filter_clause = filters.time_filter
      if where_conditions:
        filter_clause += " AND " + " AND ".join(where_conditions)

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
        LIMIT {filters.limit} OFFSET {filters.offset}
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
        "offset": filters.offset,
        "limit": filters.limit
      }

  async def get_stats(self, time_filter: str = "", time_params: Optional[list] = None):
    """Get usage statistics with optional time filtering.

    Args:
      time_filter: SQL WHERE clause fragment from build_time_filter()
      time_params: Parameters for time filter placeholders

    Returns:
      Dict with totals, by_model, by_provider, performance, and recent_errors
    """
    if time_params is None:
      time_params = []

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
      """, time_params)
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
      """, time_params)
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
      """, time_params)
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
      """, time_params)
      performance = await cursor.fetchall()

      # Recent errors
      cursor = await conn.execute(f"""
        SELECT timestamp, model, error
        FROM requests
        WHERE error IS NOT NULL {time_filter}
        ORDER BY timestamp DESC
        LIMIT 10
      """, time_params)
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

  async def get_daily_stats(self, start_date: str, end_date: str, where_filter: str, date_expr: str, where_params: Optional[list] = None):
    """Get daily aggregated statistics with model breakdown.

    Args:
      start_date: ISO date for default calculations (YYYY-MM-DD)
      end_date: ISO date for default calculations (YYYY-MM-DD)
      where_filter: SQL WHERE clause (without WHERE keyword)
      date_expr: SQL expression for grouping by date with timezone
      where_params: Parameters for where_filter placeholders

    Returns:
      Dict with daily array, total_days, total_cost, total_requests
    """
    if where_params is None:
      where_params = []

    async with self._get_connection() as conn:
      cursor = await conn.execute(f"""
        SELECT
          {date_expr} as date,
          provider,
          model,
          COUNT(*) as requests,
          SUM(cost) as cost,
          SUM(total_tokens) as tokens
        FROM requests
        WHERE error IS NULL
          AND {where_filter}
        GROUP BY {date_expr}, provider, model
        ORDER BY date DESC
      """, where_params)
      rows = await cursor.fetchall()

      # Group by date
      daily_data = {}
      for row in rows:
        date, provider, model, requests, cost, tokens = row
        if date not in daily_data:
          daily_data[date] = {
            'date': date,
            'requests': 0,
            'cost': 0.0,
            'total_tokens': 0,
            'by_model': []
          }
        daily_data[date]['requests'] += requests
        daily_data[date]['cost'] += cost or 0.0
        daily_data[date]['total_tokens'] += tokens or 0
        daily_data[date]['by_model'].append({
          'provider': provider,
          'model': model,
          'requests': requests,
          'cost': round(cost or 0, 4)
        })

      # Convert to sorted list
      daily_list = sorted(daily_data.values(), key=lambda x: x['date'], reverse=True)

      # Round costs
      for day in daily_list:
        day['cost'] = round(day['cost'], 4)

      # Calculate totals
      total_cost = sum(day['cost'] for day in daily_list)
      total_requests = sum(day['requests'] for day in daily_list)

      return {
        'daily': daily_list,
        'total_days': len(daily_list),
        'total_cost': round(total_cost, 4),
        'total_requests': total_requests
      }

  async def get_hourly_stats(self, where_filter: str, hour_expr: str, where_params: Optional[list] = None):
    """Get hourly aggregated statistics for a single day.

    Args:
      where_filter: SQL WHERE clause (without WHERE keyword)
      hour_expr: SQL expression for grouping by hour with timezone
      where_params: Parameters for where_filter placeholders

    Returns:
      Dict with hourly array, total_cost, total_requests
    """
    if where_params is None:
      where_params = []

    async with self._get_connection() as conn:
      cursor = await conn.execute(f"""
        SELECT
          {hour_expr} as hour,
          provider,
          model,
          COUNT(*) as requests,
          SUM(cost) as cost,
          SUM(total_tokens) as tokens
        FROM requests
        WHERE error IS NULL
          AND {where_filter}
        GROUP BY {hour_expr}, provider, model
        ORDER BY hour ASC
      """, where_params)
      rows = await cursor.fetchall()

      # Group by hour
      hourly_data = {}
      for row in rows:
        hour, provider, model, requests, cost, tokens = row
        if hour not in hourly_data:
          hourly_data[hour] = {
            'hour': hour,
            'requests': 0,
            'cost': 0.0,
            'total_tokens': 0,
            'by_model': []
          }
        hourly_data[hour]['requests'] += requests
        hourly_data[hour]['cost'] += cost or 0.0
        hourly_data[hour]['total_tokens'] += tokens or 0
        hourly_data[hour]['by_model'].append({
          'provider': provider,
          'model': model,
          'requests': requests,
          'cost': round(cost or 0, 4)
        })

      # Convert to sorted list
      hourly_list = sorted(hourly_data.values(), key=lambda x: x['hour'])

      # Round costs
      for hour in hourly_list:
        hour['cost'] = round(hour['cost'], 4)

      # Calculate totals
      total_cost = sum(hour['cost'] for hour in hourly_list)
      total_requests = sum(hour['requests'] for hour in hourly_list)

      return {
        'hourly': hourly_list,
        'total_cost': round(total_cost, 4),
        'total_requests': total_requests
      }

  async def clear_errors(self):
    """Clear all errors from the database.

    Returns:
      Number of deleted records
    """
    async with self._get_connection() as conn:
      cursor = await conn.execute("DELETE FROM requests WHERE error IS NOT NULL")
      return cursor.rowcount

  async def get_date_range(self):
    """Get the actual date range of data in the database.

    Returns:
      Dict with start_date and end_date (None values if no data)
    """
    async with self._get_connection() as conn:
      cursor = await conn.execute("""
        SELECT MIN(DATE(timestamp)), MAX(DATE(timestamp))
        FROM requests
        WHERE error IS NULL
      """)
      row = await cursor.fetchone()

      if row and row[0] and row[1]:
        return {
          'start_date': row[0],
          'end_date': row[1]
        }
      return {
        'start_date': None,
        'end_date': None
      }
