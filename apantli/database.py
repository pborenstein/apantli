"""Database operations for SQLite request logging."""

import sqlite3
import json
from datetime import datetime
from typing import Optional

import litellm


# Database path (can be overridden by CLI args in main())
DB_PATH = "requests.db"


def init_db():
  """Initialize SQLite database with requests table."""
  conn = sqlite3.connect(DB_PATH)
  cursor = conn.cursor()
  cursor.execute("""
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
  cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_timestamp
    ON requests(timestamp)
  """)
  cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_date_provider
    ON requests(DATE(timestamp), provider)
    WHERE error IS NULL
  """)
  cursor.execute("""
    CREATE INDEX IF NOT EXISTS idx_cost
    ON requests(cost)
    WHERE error IS NULL
  """)

  conn.commit()
  conn.close()


def log_request(model: str, provider: str, response: dict, duration_ms: int,
                request_data: dict, error: Optional[str] = None):
  """Log a request to SQLite."""
  conn = sqlite3.connect(DB_PATH)
  cursor = conn.cursor()

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

  # Redact sensitive data before storing
  safe_request_data = request_data.copy()
  if 'api_key' in safe_request_data:
    safe_request_data['api_key'] = 'sk-redacted'

  cursor.execute("""
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
    json.dumps(safe_request_data),
    json.dumps(response) if response else None,
    error
  ))
  conn.commit()
  conn.close()
