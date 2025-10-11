"""Unit tests for database operations."""

import pytest
import aiosqlite
import json
from datetime import datetime
from apantli.database import init_db, log_request, Database
import apantli.database


@pytest.mark.asyncio
async def test_init_db(temp_db, monkeypatch):
  """Test database initialization creates tables and indexes."""
  # Set DB_PATH to temp database
  monkeypatch.setattr('apantli.database.DB_PATH', temp_db)

  # Initialize database
  await init_db()

  # Verify database file was created
  async with aiosqlite.connect(temp_db) as conn:
    # Check table exists
    async with conn.execute("""
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='requests'
    """) as cursor:
      result = await cursor.fetchone()
      assert result is not None

    # Check indexes exist
    async with conn.execute("""
      SELECT name FROM sqlite_master
      WHERE type='index' AND tbl_name='requests'
    """) as cursor:
      rows = await cursor.fetchall()
      indexes = {row[0] for row in rows}
      assert 'idx_timestamp' in indexes
      assert 'idx_date_provider' in indexes
      assert 'idx_cost' in indexes


@pytest.mark.asyncio
async def test_init_db_schema(temp_db, monkeypatch):
  """Test database schema has all required columns."""
  monkeypatch.setattr('apantli.database.DB_PATH', temp_db)
  await init_db()

  async with aiosqlite.connect(temp_db) as conn:
    # Get table schema
    async with conn.execute("PRAGMA table_info(requests)") as cursor:
      rows = await cursor.fetchall()
      columns = {row[1]: row[2] for row in rows}

    # Verify all required columns exist
    assert 'id' in columns
    assert 'timestamp' in columns
    assert 'model' in columns
    assert 'provider' in columns
    assert 'prompt_tokens' in columns
    assert 'completion_tokens' in columns
    assert 'total_tokens' in columns
    assert 'cost' in columns
    assert 'duration_ms' in columns
    assert 'request_data' in columns
    assert 'response_data' in columns
    assert 'error' in columns


@pytest.mark.asyncio
async def test_log_request_success(temp_db, monkeypatch, sample_response, sample_request_data):
  """Test logging a successful request."""
  monkeypatch.setattr('apantli.database.DB_PATH', temp_db)
  await init_db()

  # Log a request
  await log_request(
    model='gpt-4',
    provider='openai',
    response=sample_response,
    duration_ms=500,
    request_data=sample_request_data,
    error=None
  )

  # Verify it was logged
  async with aiosqlite.connect(temp_db) as conn:
    async with conn.execute("SELECT * FROM requests") as cursor:
      row = await cursor.fetchone()

    assert row is not None
    # Check columns (based on schema order)
    assert row[2] == 'gpt-4'  # model
    assert row[3] == 'openai'  # provider
    assert row[4] == 10  # prompt_tokens
    assert row[5] == 20  # completion_tokens
    assert row[6] == 30  # total_tokens
    assert row[8] == 500  # duration_ms
    assert row[11] is None  # error


@pytest.mark.asyncio
async def test_log_request_error(temp_db, monkeypatch, sample_request_data):
  """Test logging a failed request."""
  monkeypatch.setattr('apantli.database.DB_PATH', temp_db)
  await init_db()

  # Log an error request
  await log_request(
    model='gpt-4',
    provider='openai',
    response=None,
    duration_ms=100,
    request_data=sample_request_data,
    error='AuthenticationError: Invalid API key'
  )

  # Verify it was logged
  async with aiosqlite.connect(temp_db) as conn:
    async with conn.execute("SELECT * FROM requests WHERE error IS NOT NULL") as cursor:
      row = await cursor.fetchone()

    assert row is not None
    assert row[2] == 'gpt-4'  # model
    assert row[11] == 'AuthenticationError: Invalid API key'  # error
    assert row[10] is None  # response_data should be None


@pytest.mark.asyncio
async def test_log_request_api_key_redaction(temp_db, monkeypatch, sample_response, sample_request_data):
  """Test that API keys are redacted in stored request data."""
  monkeypatch.setattr('apantli.database.DB_PATH', temp_db)
  await init_db()

  # Request data contains API key
  assert sample_request_data['api_key'] == 'sk-test-key-12345'

  await log_request(
    model='gpt-4',
    provider='openai',
    response=sample_response,
    duration_ms=500,
    request_data=sample_request_data,
    error=None
  )

  # Verify API key was redacted
  async with aiosqlite.connect(temp_db) as conn:
    async with conn.execute("SELECT request_data FROM requests") as cursor:
      row = await cursor.fetchone()

    stored_request = json.loads(row[0])
    assert stored_request['api_key'] == 'sk-redacted'
    assert stored_request['api_key'] != 'sk-test-key-12345'


@pytest.mark.asyncio
async def test_log_request_timestamp_format(temp_db, monkeypatch, sample_response, sample_request_data):
  """Test that timestamps are in ISO format."""
  monkeypatch.setattr('apantli.database.DB_PATH', temp_db)
  await init_db()

  await log_request(
    model='gpt-4',
    provider='openai',
    response=sample_response,
    duration_ms=500,
    request_data=sample_request_data,
    error=None
  )

  async with aiosqlite.connect(temp_db) as conn:
    async with conn.execute("SELECT timestamp FROM requests") as cursor:
      row = await cursor.fetchone()

    # Should be parseable as ISO datetime
    timestamp = datetime.fromisoformat(row[0])
    assert isinstance(timestamp, datetime)


@pytest.mark.asyncio
async def test_log_request_multiple_requests(temp_db, monkeypatch, sample_response, sample_request_data):
  """Test logging multiple requests."""
  monkeypatch.setattr('apantli.database.DB_PATH', temp_db)
  await init_db()

  # Log multiple requests
  for i in range(5):
    await log_request(
      model=f'gpt-{i}',
      provider='openai',
      response=sample_response,
      duration_ms=100 * i,
      request_data=sample_request_data,
      error=None
    )

  # Verify all were logged
  async with aiosqlite.connect(temp_db) as conn:
    async with conn.execute("SELECT COUNT(*) FROM requests") as cursor:
      row = await cursor.fetchone()
      count = row[0]

    assert count == 5


@pytest.mark.asyncio
async def test_log_request_json_serialization(temp_db, monkeypatch):
  """Test that complex request/response data is properly serialized."""
  monkeypatch.setattr('apantli.database.DB_PATH', temp_db)
  await init_db()

  complex_request = {
    'model': 'gpt-4',
    'messages': [
      {'role': 'user', 'content': 'Hello'},
      {'role': 'assistant', 'content': 'Hi there'},
      {'role': 'user', 'content': 'How are you?'}
    ],
    'temperature': 0.7,
    'max_tokens': 100
  }

  complex_response = {
    'id': 'test-123',
    'choices': [{'message': {'content': 'I am doing well'}}],
    'usage': {'prompt_tokens': 15, 'completion_tokens': 5, 'total_tokens': 20}
  }

  await log_request(
    model='gpt-4',
    provider='openai',
    response=complex_response,
    duration_ms=500,
    request_data=complex_request,
    error=None
  )

  # Verify data can be deserialized
  async with aiosqlite.connect(temp_db) as conn:
    async with conn.execute("SELECT request_data, response_data FROM requests") as cursor:
      row = await cursor.fetchone()

    stored_request = json.loads(row[0])
    stored_response = json.loads(row[1])

    assert stored_request['messages'][2]['content'] == 'How are you?'
    assert stored_response['choices'][0]['message']['content'] == 'I am doing well'


@pytest.mark.asyncio
async def test_log_request_cost_calculation(temp_db, monkeypatch, sample_response, sample_request_data):
  """Test that cost is calculated and stored."""
  monkeypatch.setattr('apantli.database.DB_PATH', temp_db)
  await init_db()

  await log_request(
    model='gpt-4',
    provider='openai',
    response=sample_response,
    duration_ms=500,
    request_data=sample_request_data,
    error=None
  )

  async with aiosqlite.connect(temp_db) as conn:
    async with conn.execute("SELECT cost FROM requests") as cursor:
      row = await cursor.fetchone()

    # Cost should be a number (might be 0.0 if LiteLLM can't calculate)
    assert isinstance(row[0], (int, float))
    assert row[0] >= 0


@pytest.mark.asyncio
async def test_database_class_direct(temp_db):
  """Test using Database class directly."""
  db = Database(temp_db)
  await db.init()

  # Log a request using the class
  await db.log_request(
    model='test-model',
    provider='test-provider',
    response={'usage': {'prompt_tokens': 5, 'completion_tokens': 10, 'total_tokens': 15}},
    duration_ms=100,
    request_data={'test': 'data'},
    error=None
  )

  # Verify it was logged
  async with aiosqlite.connect(temp_db) as conn:
    async with conn.execute("SELECT model, provider FROM requests") as cursor:
      row = await cursor.fetchone()

    assert row[0] == 'test-model'
    assert row[1] == 'test-provider'
