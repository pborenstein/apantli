#!/usr/bin/env python3
"""
Lightweight LLM proxy with SQLite cost tracking.
Compatible with OpenAI API format, uses LiteLLM SDK for provider routing.
"""

import os
import socket
import sqlite3
import json
import argparse
import logging
from datetime import datetime, timedelta
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import litellm
from litellm import completion
import uvicorn
import yaml
from dotenv import load_dotenv

# Load environment variables
load_dotenv()


# Database setup
DB_PATH = "requests.db"

# Model mapping from config.yaml
MODEL_MAP = {}

# Templates
templates = Jinja2Templates(directory="templates")


def load_config():
    """Load model configuration from config.yaml."""
    global MODEL_MAP
    try:
        with open('config.yaml', 'r') as f:
            config = yaml.safe_load(f)

        for model in config.get('model_list', []):
            model_name = model['model_name']
            litellm_params = model['litellm_params']
            MODEL_MAP[model_name] = {
                'model': litellm_params['model'],
                'api_key': litellm_params.get('api_key', '')
            }
    except Exception as e:
        print(f"Warning: Could not load config.yaml: {e}")
        print("Models will need to be specified with provider prefix (e.g., 'openai/gpt-4')")


def convert_local_date_to_utc_range(date_str: str, timezone_offset_minutes: int):
    """Convert a local date string to UTC timestamp range.

    Args:
        date_str: ISO date like "2025-10-06"
        timezone_offset_minutes: Minutes from UTC (negative for west, positive for east)

    Returns:
        (start_utc, end_utc) as ISO timestamp strings (inclusive start, exclusive end)
    """
    # Parse local date at midnight
    local_date = datetime.fromisoformat(date_str)

    # Convert to UTC by subtracting the timezone offset
    utc_start = local_date - timedelta(minutes=timezone_offset_minutes)
    utc_end = utc_start + timedelta(days=1)

    return utc_start.isoformat(), utc_end.isoformat()


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
        json.dumps(request_data),
        json.dumps(response) if response else None,
        error
    ))
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and load config on startup."""
    load_config()
    init_db()
    yield


app = FastAPI(title="LLM Proxy", lifespan=lifespan)

# Mount static files directory
app.mount("/static", StaticFiles(directory="apantli/static"), name="static")

# Add CORS middleware - allow all origins by using regex
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/v1/chat/completions")
@app.post("/chat/completions")
async def chat_completions(request: Request):
    """OpenAI-compatible chat completions endpoint."""
    import time

    start_time = time.time()
    request_data = await request.json()

    try:
        # Extract model and remap if needed
        model = request_data.get('model')
        if not model:
            raise HTTPException(status_code=400, detail="Model is required")

        # Look up model in config
        if model in MODEL_MAP:
            model_config = MODEL_MAP[model]
            request_data['model'] = model_config['model']

            # Handle api_key from config
            api_key = model_config.get('api_key', '')
            if api_key.startswith('os.environ/'):
                env_var = api_key.split('/', 1)[1]
                api_key = os.environ.get(env_var, '')
            if api_key:
                request_data['api_key'] = api_key

        # Call LiteLLM
        response = completion(**request_data)

        # Handle streaming responses
        if request_data.get('stream', False):
            # Collect chunks for logging
            chunks = []
            full_response = {
                'id': None,
                'model': request_data['model'],  # Use full LiteLLM model name for cost calculation
                'choices': [{'message': {'role': 'assistant', 'content': ''}, 'finish_reason': None}],
                'usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
            }

            async def generate():
                nonlocal full_response
                for chunk in response:
                    chunk_dict = chunk.model_dump() if hasattr(chunk, 'model_dump') else dict(chunk)
                    chunks.append(chunk_dict)

                    # Accumulate content
                    if 'choices' in chunk_dict and len(chunk_dict['choices']) > 0:
                        delta = chunk_dict['choices'][0].get('delta', {})
                        if 'content' in delta and delta['content'] is not None:
                            full_response['choices'][0]['message']['content'] += delta['content']
                        if 'finish_reason' in chunk_dict['choices'][0]:
                            full_response['choices'][0]['finish_reason'] = chunk_dict['choices'][0]['finish_reason']

                    # Capture ID and usage
                    if 'id' in chunk_dict and chunk_dict['id']:
                        full_response['id'] = chunk_dict['id']
                    if 'usage' in chunk_dict:
                        full_response['usage'] = chunk_dict['usage']

                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                yield "data: [DONE]\n\n"

                # Log after streaming completes
                try:
                    # Extract provider from model name in request
                    litellm_model = request_data.get('model', '')
                    provider = litellm_model.split('/')[0] if '/' in litellm_model else 'unknown'

                    duration_ms = int((time.time() - start_time) * 1000)
                    log_request(model, provider, full_response, duration_ms, request_data)
                except Exception as e:
                    print(f"Error logging streaming request: {e}")

            return StreamingResponse(generate(), media_type="text/event-stream")

        # Non-streaming response
        # Convert to dict for logging and response
        if hasattr(response, 'model_dump'):
            response_dict = response.model_dump()
        elif hasattr(response, 'dict'):
            response_dict = response.dict()
        else:
            response_dict = json.loads(response.json())

        # Extract provider from response metadata
        provider = getattr(response, 'model', '').split('/')[0] if '/' in getattr(response, 'model', '') else 'unknown'
        if provider == 'unknown' and hasattr(response, '_hidden_params'):
            provider = response._hidden_params.get('custom_llm_provider', 'unknown')

        # Calculate duration
        duration_ms = int((time.time() - start_time) * 1000)

        # Log to database
        log_request(model, provider, response_dict, duration_ms, request_data)

        return JSONResponse(content=response_dict)

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        log_request(
            request_data.get('model', 'unknown'),
            'unknown',
            None,
            duration_ms,
            request_data,
            error=str(e)
        )
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/models")
async def models():
    """List available models from config."""
    model_list = []
    for model_name, config in MODEL_MAP.items():
        # Try to get pricing info from LiteLLM
        litellm_model = config['model']
        input_cost = None
        output_cost = None

        try:
            # Get per-token costs from LiteLLM's cost database
            # Try with full model name first, then without provider prefix
            model_data = None
            if litellm_model in litellm.model_cost:
                model_data = litellm.model_cost[litellm_model]
            elif '/' in litellm_model:
                # Try without provider prefix (e.g., "openai/gpt-4.1" -> "gpt-4.1")
                model_without_provider = litellm_model.split('/', 1)[1]
                if model_without_provider in litellm.model_cost:
                    model_data = litellm.model_cost[model_without_provider]

            if model_data:
                input_cost_per_token = model_data.get('input_cost_per_token', 0)
                output_cost_per_token = model_data.get('output_cost_per_token', 0)

                # Convert to per-million
                if input_cost_per_token:
                    input_cost = input_cost_per_token * 1000000
                if output_cost_per_token:
                    output_cost = output_cost_per_token * 1000000
        except Exception as e:
            pass

        model_list.append({
            'name': model_name,
            'litellm_model': config['model'],
            'provider': config['model'].split('/')[0] if '/' in config['model'] else 'unknown',
            'input_cost_per_million': round(input_cost, 2) if input_cost else None,
            'output_cost_per_million': round(output_cost, 2) if output_cost else None
        })

    return {'models': model_list}


@app.get("/requests")
async def requests(hours: int = None, start_date: str = None, end_date: str = None, timezone_offset: int = None):
    """Get recent requests with full details, optionally filtered by time range.

    Parameters:
    - hours: Filter to last N hours
    - start_date: ISO 8601 date (YYYY-MM-DD)
    - end_date: ISO 8601 date (YYYY-MM-DD)
    - timezone_offset: Timezone offset in minutes from UTC (e.g., -480 for PST)
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Build time filter using efficient timestamp comparisons
    time_filter = ""
    if hours:
        time_filter = f"AND datetime(timestamp) > datetime('now', '-{hours} hours')"
    elif start_date and end_date:
        if timezone_offset is not None:
            # Convert local date range to UTC timestamps for efficient indexed queries
            start_utc, _ = convert_local_date_to_utc_range(start_date, timezone_offset)
            _, end_utc = convert_local_date_to_utc_range(end_date, timezone_offset)
            time_filter = f"AND timestamp >= '{start_utc}' AND timestamp < '{end_utc}'"
        else:
            # No timezone conversion needed
            time_filter = f"AND timestamp >= '{start_date}T00:00:00' AND timestamp < '{end_date}T00:00:00' + interval '1 day'"
            # SQLite doesn't have interval, so we'll use date arithmetic
            from datetime import datetime as dt
            end_dt = dt.fromisoformat(end_date) + timedelta(days=1)
            time_filter = f"AND timestamp >= '{start_date}T00:00:00' AND timestamp < '{end_dt.date()}T00:00:00'"
    elif start_date:
        if timezone_offset is not None:
            start_utc, _ = convert_local_date_to_utc_range(start_date, timezone_offset)
            time_filter = f"AND timestamp >= '{start_utc}'"
        else:
            time_filter = f"AND timestamp >= '{start_date}T00:00:00'"
    elif end_date:
        if timezone_offset is not None:
            _, end_utc = convert_local_date_to_utc_range(end_date, timezone_offset)
            time_filter = f"AND timestamp < '{end_utc}'"
        else:
            from datetime import datetime as dt
            end_dt = dt.fromisoformat(end_date) + timedelta(days=1)
            time_filter = f"AND timestamp < '{end_dt.date()}T00:00:00'"

    cursor.execute(f"""
        SELECT timestamp, model, provider, prompt_tokens, completion_tokens, total_tokens,
               cost, duration_ms, request_data, response_data
        FROM requests
        WHERE error IS NULL {time_filter}
        ORDER BY timestamp DESC
        LIMIT 50
    """)
    rows = cursor.fetchall()
    conn.close()

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
        ]
    }


@app.get("/stats")
async def stats(hours: int = None, start_date: str = None, end_date: str = None, timezone_offset: int = None):
    """Get usage statistics, optionally filtered by time range.

    Parameters:
    - hours: Filter to last N hours
    - start_date: ISO 8601 date (YYYY-MM-DD)
    - end_date: ISO 8601 date (YYYY-MM-DD)
    - timezone_offset: Timezone offset in minutes from UTC (e.g., -480 for PST)
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Build time filter using efficient timestamp comparisons
    time_filter = ""
    if hours:
        time_filter = f"AND datetime(timestamp) > datetime('now', '-{hours} hours')"
    elif start_date and end_date:
        if timezone_offset is not None:
            # Convert local date range to UTC timestamps for efficient indexed queries
            start_utc, _ = convert_local_date_to_utc_range(start_date, timezone_offset)
            _, end_utc = convert_local_date_to_utc_range(end_date, timezone_offset)
            time_filter = f"AND timestamp >= '{start_utc}' AND timestamp < '{end_utc}'"
        else:
            # No timezone conversion needed
            end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
            time_filter = f"AND timestamp >= '{start_date}T00:00:00' AND timestamp < '{end_dt.date()}T00:00:00'"
    elif start_date:
        if timezone_offset is not None:
            start_utc, _ = convert_local_date_to_utc_range(start_date, timezone_offset)
            time_filter = f"AND timestamp >= '{start_utc}'"
        else:
            time_filter = f"AND timestamp >= '{start_date}T00:00:00'"
    elif end_date:
        if timezone_offset is not None:
            _, end_utc = convert_local_date_to_utc_range(end_date, timezone_offset)
            time_filter = f"AND timestamp < '{end_utc}'"
        else:
            end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
            time_filter = f"AND timestamp < '{end_dt.date()}T00:00:00'"

    # Total stats
    cursor.execute(f"""
        SELECT
            COUNT(*) as total_requests,
            SUM(cost) as total_cost,
            SUM(prompt_tokens) as total_prompt_tokens,
            SUM(completion_tokens) as total_completion_tokens,
            AVG(duration_ms) as avg_duration_ms
        FROM requests
        WHERE error IS NULL {time_filter}
    """)
    totals = cursor.fetchone()

    # By model
    cursor.execute(f"""
        SELECT
            model,
            COUNT(*) as requests,
            SUM(cost) as cost,
            SUM(total_tokens) as tokens
        FROM requests
        WHERE error IS NULL {time_filter}
        GROUP BY model
        ORDER BY cost DESC
    """)
    by_model = cursor.fetchall()

    # By provider
    cursor.execute(f"""
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
    by_provider = cursor.fetchall()

    # Recent errors (limit to same time range as other queries for consistency)
    cursor.execute(f"""
        SELECT timestamp, model, error
        FROM requests
        WHERE error IS NOT NULL {time_filter}
        ORDER BY timestamp DESC
        LIMIT 10
    """)
    errors = cursor.fetchall()

    conn.close()

    return {
        "totals": {
            "requests": totals[0] or 0,
            "cost": round(totals[1] or 0, 4),
            "prompt_tokens": totals[2] or 0,
            "completion_tokens": totals[3] or 0,
            "avg_duration_ms": round(totals[4] or 0, 2)
        },
        "by_model": [
            {"model": row[0], "requests": row[1], "cost": round(row[2] or 0, 4), "tokens": row[3]}
            for row in by_model
        ],
        "by_provider": [
            {"provider": row[0], "requests": row[1], "cost": round(row[2] or 0, 4), "tokens": row[3]}
            for row in by_provider
        ],
        "recent_errors": [
            {"timestamp": row[0], "model": row[1], "error": row[2]}
            for row in errors
        ]
    }


@app.delete("/errors")
async def clear_errors():
    """Clear all errors from the database."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM requests WHERE error IS NOT NULL")
    deleted = cursor.rowcount
    conn.commit()
    conn.close()
    return {"deleted": deleted}


@app.get("/stats/daily")
async def stats_daily(start_date: str = None, end_date: str = None, timezone_offset: int = None):
    """Get daily aggregated statistics with provider breakdown.

    Parameters:
    - start_date: ISO 8601 date (YYYY-MM-DD), defaults to 30 days ago
    - end_date: ISO 8601 date (YYYY-MM-DD), defaults to today
    - timezone_offset: Timezone offset in minutes from UTC (e.g., -480 for PST)
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Set default date range if not provided
    if not end_date:
        end_date = datetime.utcnow().strftime('%Y-%m-%d')
    if not start_date:
        # Default to 30 days ago
        start = datetime.utcnow() - timedelta(days=30)
        start_date = start.strftime('%Y-%m-%d')

    # Build WHERE clause using efficient timestamp comparisons
    # and GROUP BY using timezone-adjusted dates
    if timezone_offset is not None:
        # Convert local date range to UTC timestamps for efficient WHERE clause
        start_utc, _ = convert_local_date_to_utc_range(start_date, timezone_offset)
        _, end_utc = convert_local_date_to_utc_range(end_date, timezone_offset)
        where_filter = f"timestamp >= '{start_utc}' AND timestamp < '{end_utc}'"

        # Still need timezone conversion for GROUP BY to group by local date
        hours = abs(timezone_offset) // 60
        minutes = abs(timezone_offset) % 60
        sign = '+' if timezone_offset >= 0 else '-'
        tz_modifier = f"{sign}{hours:02d}:{minutes:02d}"
        date_expr = f"DATE(timestamp, '{tz_modifier}')"
    else:
        # No timezone conversion needed
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        where_filter = f"timestamp >= '{start_date}T00:00:00' AND timestamp < '{end_dt.date()}T00:00:00'"
        date_expr = "DATE(timestamp)"

    # Get daily aggregates with provider breakdown
    cursor.execute(f"""
        SELECT
            {date_expr} as date,
            provider,
            COUNT(*) as requests,
            SUM(cost) as cost,
            SUM(total_tokens) as tokens
        FROM requests
        WHERE error IS NULL
          AND {where_filter}
        GROUP BY {date_expr}, provider
        ORDER BY date DESC
    """)
    rows = cursor.fetchall()

    # Group by date
    daily_data = {}
    for row in rows:
        date, provider, requests, cost, tokens = row
        if date not in daily_data:
            daily_data[date] = {
                'date': date,
                'requests': 0,
                'cost': 0.0,
                'total_tokens': 0,
                'by_provider': []
            }
        daily_data[date]['requests'] += requests
        daily_data[date]['cost'] += cost or 0.0
        daily_data[date]['total_tokens'] += tokens or 0
        daily_data[date]['by_provider'].append({
            'provider': provider,
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

    conn.close()

    return {
        'daily': daily_list,
        'total_days': len(daily_list),
        'total_cost': round(total_cost, 4),
        'total_requests': total_requests
    }


@app.get("/stats/date-range")
async def stats_date_range():
    """Get the actual date range of data in the database."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT MIN(DATE(timestamp)), MAX(DATE(timestamp))
        FROM requests
        WHERE error IS NULL
    """)
    row = cursor.fetchone()
    conn.close()

    if row and row[0] and row[1]:
        return {
            'start_date': row[0],
            'end_date': row[1]
        }
    else:
        # No data yet, return empty
        return {
            'start_date': None,
            'end_date': None
        }


@app.get("/")
async def dashboard(request: Request):
    """Simple HTML dashboard."""
    return templates.TemplateResponse("dashboard.html", {"request": request})


def main():
    """Entry point for the proxy server."""
    parser = argparse.ArgumentParser(
        description="Apantli - Lightweight LLM proxy with SQLite cost tracking"
    )
    parser.add_argument(
        "--host",
        default="0.0.0.0",
        help="Host to bind to (default: 0.0.0.0)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=4000,
        help="Port to bind to (default: 4000)"
    )
    parser.add_argument(
        "--config",
        default="config.yaml",
        help="Path to config file (default: config.yaml)"
    )
    parser.add_argument(
        "--db",
        default="requests.db",
        help="Path to SQLite database (default: requests.db)"
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable auto-reload for development"
    )

    args = parser.parse_args()

    # Update global config paths if provided
    global DB_PATH
    DB_PATH = args.db

    # Configure logging format with timestamps
    log_config = uvicorn.config.LOGGING_CONFIG
    # Update default formatter (for startup/info logs)
    log_config["formatters"]["default"]["fmt"] = '%(asctime)s %(levelprefix)s %(message)s'
    log_config["formatters"]["default"]["datefmt"] = '%Y-%m-%d %H:%M:%S'
    # Update access formatter (for HTTP request logs)
    log_config["formatters"]["access"]["fmt"] = '%(asctime)s %(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s'
    log_config["formatters"]["access"]["datefmt"] = '%Y-%m-%d %H:%M:%S'

    # Print available URLs
    print(f"\n🚀 Apantli server starting...")
    if args.host == "0.0.0.0":
        # Get all network interfaces
        import netifaces
        addresses = []

        # Add localhost
        addresses.append(f"http://localhost:{args.port}/")

        # Get all network interfaces and their addresses
        try:
            for interface in netifaces.interfaces():
                addrs = netifaces.ifaddresses(interface)
                # Get IPv4 addresses (AF_INET = 2)
                if netifaces.AF_INET in addrs:
                    for addr_info in addrs[netifaces.AF_INET]:
                        ip = addr_info.get('addr')
                        # Skip localhost IPs
                        if ip and ip != '127.0.0.1':
                            url = f"http://{ip}:{args.port}/"
                            if url not in addresses:
                                addresses.append(url)
        except Exception as e:
            # Fallback to hostname lookup
            try:
                hostname = socket.gethostname()
                for info in socket.getaddrinfo(hostname, None):
                    ip = info[4][0]
                    if ':' not in ip and ip != '127.0.0.1':
                        url = f"http://{ip}:{args.port}/"
                        if url not in addresses:
                            addresses.append(url)
            except:
                pass

        print(f"   Server at {' or '.join(addresses)}\n")
    else:
        print(f"   Server at http://{args.host}:{args.port}/\n")

    if args.reload:
        # Reload mode requires import string
        uvicorn.run(
            "apantli.server:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
            log_config=log_config
        )
    else:
        # Production mode can use app object directly
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            log_config=log_config
        )


if __name__ == "__main__":
    main()
