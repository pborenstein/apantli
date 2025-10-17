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
