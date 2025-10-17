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
from litellm.exceptions import (
    RateLimitError,
    InternalServerError,
    ServiceUnavailableError,
    APIConnectionError,
    AuthenticationError,
    Timeout,
    PermissionDeniedError,
    NotFoundError,
)
import uvicorn
from dotenv import load_dotenv

# Import from local modules
from apantli.config import DEFAULT_TIMEOUT, DEFAULT_RETRIES, LOG_INDENT, load_config
from apantli.database import DB_PATH, init_db, log_request
from apantli.errors import build_error_response
from apantli.llm import infer_provider_from_model
from apantli.utils import convert_local_date_to_utc_range

# Import modules themselves for accessing globals
import apantli.config
import apantli.database

# Load environment variables
load_dotenv()

# Templates
templates = Jinja2Templates(directory="templates")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and load config on startup."""
    load_config()
    await init_db()
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
    # Will be updated with API key later, used for database logging
    request_data_for_logging = request_data.copy()

    try:
        # Extract model and remap if needed
        model = request_data.get('model')
        if not model:
            raise HTTPException(status_code=400, detail="Model is required")

        # Look up model in config
        if model in apantli.config.MODEL_MAP:
            model_config = apantli.config.MODEL_MAP[model]

            # Replace model with LiteLLM format
            request_data['model'] = model_config['model']

            # Handle api_key from config (resolve environment variable)
            api_key = model_config.get('api_key', '')
            if api_key.startswith('os.environ/'):
                env_var = api_key.split('/', 1)[1]
                api_key = os.environ.get(env_var, '')
            if api_key:
                request_data['api_key'] = api_key

            # Pass through all other litellm_params (timeout, num_retries, temperature, etc.)
            # Config provides defaults; client values (except null) always win
            for key, value in model_config.items():
                if key not in ('model', 'api_key'):
                    # Use config value only if client didn't provide, or provided None/null
                    # This allows: config defaults, client override, null → use config
                    if key not in request_data or request_data.get(key) is None:
                        request_data[key] = value
        else:
            # Model not found in config - log and return helpful error
            duration_ms = int((time.time() - start_time) * 1000)
            available_models = sorted(apantli.config.MODEL_MAP.keys())
            error_msg = f"Model '{model}' not found in configuration."
            if available_models:
                error_msg += f" Available models: {', '.join(available_models)}"

            # Log to database
            await log_request(
                model,
                "unknown",
                None,
                duration_ms,
                request_data_for_logging,
                error=f"UnknownModel: {error_msg}"
            )

            # Console log
            print(f"{LOG_INDENT}✗ LLM Response: {model} (unknown) | {duration_ms}ms | Error: UnknownModel")

            error_response = build_error_response("invalid_request_error", error_msg, "model_not_found")
            return JSONResponse(content=error_response, status_code=404)

        # Apply global defaults if not specified
        if 'timeout' not in request_data:
            request_data['timeout'] = DEFAULT_TIMEOUT
        if 'num_retries' not in request_data:
            request_data['num_retries'] = DEFAULT_RETRIES

        # Update logging copy with final request_data (includes API key and all params)
        request_data_for_logging = request_data.copy()

        # Log request start
        is_streaming = request_data.get('stream', False)
        stream_indicator = " [streaming]" if is_streaming else ""
        print(f"{LOG_INDENT}→ LLM Request: {model}{stream_indicator}")

        # Call LiteLLM
        response = completion(**request_data)

        # Handle streaming responses
        if request_data.get('stream', False):
            # Extract provider before creating generator (from remapped litellm model name)
            litellm_model = request_data.get('model', '')
            provider = infer_provider_from_model(litellm_model)

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
                socket_error_logged = False
                stream_error = None

                try:
                    for chunk in response:
                        try:
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

                        except (BrokenPipeError, ConnectionError, ConnectionResetError) as e:
                            # Client disconnected - log once and stop streaming
                            if not socket_error_logged:
                                logging.info(f"Client disconnected during streaming: {type(e).__name__}")
                                socket_error_logged = True
                            break

                except (RateLimitError, InternalServerError, ServiceUnavailableError, Timeout, APIConnectionError) as e:
                    # Provider error during streaming - send error event
                    stream_error = f"{type(e).__name__}: {str(e)}"
                    error_event = build_error_response(
                        "stream_error",
                        str(e),
                        type(e).__name__.lower()
                    )
                    try:
                        yield f"data: {json.dumps(error_event)}\n\n"
                    except (BrokenPipeError, ConnectionError, ConnectionResetError):
                        # Client already gone, can't send error
                        if not socket_error_logged:
                            logging.info("Client disconnected before error could be sent")
                            socket_error_logged = True

                except Exception as e:
                    # Unexpected error during streaming
                    stream_error = f"UnexpectedStreamError: {str(e)}"
                    error_event = build_error_response("stream_error", str(e), "internal_error")
                    try:
                        yield f"data: {json.dumps(error_event)}\n\n"
                    except (BrokenPipeError, ConnectionError, ConnectionResetError):
                        if not socket_error_logged:
                            logging.info("Client disconnected before error could be sent")
                            socket_error_logged = True

                finally:
                    # Always send [DONE] and log to database
                    try:
                        yield "data: [DONE]\n\n"
                    except (BrokenPipeError, ConnectionError, ConnectionResetError):
                        pass  # Client gone, can't send [DONE]

                    # Log to database
                    try:
                        duration_ms = int((time.time() - start_time) * 1000)
                        await log_request(model, provider, full_response, duration_ms, request_data_for_logging, error=stream_error)

                        # Log completion
                        if stream_error:
                            print(f"{LOG_INDENT}✗ LLM Response: {model} ({provider}) | {duration_ms}ms | Error: {stream_error}")
                        else:
                            usage = full_response.get('usage', {})
                            prompt_tokens = usage.get('prompt_tokens', 0)
                            completion_tokens = usage.get('completion_tokens', 0)
                            total_tokens = usage.get('total_tokens', 0)

                            # Calculate cost
                            try:
                                import litellm
                                cost = litellm.completion_cost(completion_response=full_response)
                            except:
                                cost = 0.0

                            print(f"{LOG_INDENT}✓ LLM Response: {model} ({provider}) | {duration_ms}ms | {prompt_tokens}→{completion_tokens} tokens ({total_tokens} total) | ${cost:.4f} [streaming]")
                    except Exception as e:
                        logging.error(f"Error logging streaming request to database: {e}")

            return StreamingResponse(generate(), media_type="text/event-stream")

        # Non-streaming response
        # Convert to dict for logging and response
        if hasattr(response, 'model_dump'):
            response_dict = response.model_dump()
        elif hasattr(response, 'dict'):
            response_dict = response.dict()
        else:
            response_dict = json.loads(response.json())

        # Extract provider from request_data (which has the remapped litellm model name)
        litellm_model = request_data.get('model', '')
        provider = infer_provider_from_model(litellm_model)

        # Fallback: try response metadata if still unknown
        if provider == 'unknown' and hasattr(response, '_hidden_params'):
            provider = response._hidden_params.get('custom_llm_provider', 'unknown')

        # Calculate duration
        duration_ms = int((time.time() - start_time) * 1000)

        # Log to database
        await log_request(model, provider, response_dict, duration_ms, request_data_for_logging)

        # Log completion
        usage = response_dict.get('usage', {})
        prompt_tokens = usage.get('prompt_tokens', 0)
        completion_tokens = usage.get('completion_tokens', 0)
        total_tokens = usage.get('total_tokens', 0)

        # Calculate cost using litellm
        try:
            import litellm
            cost = litellm.completion_cost(completion_response=response)
        except:
            cost = 0.0

        print(f"{LOG_INDENT}✓ LLM Response: {model} ({provider}) | {duration_ms}ms | {prompt_tokens}→{completion_tokens} tokens ({total_tokens} total) | ${cost:.4f}")

        return JSONResponse(content=response_dict)

    except RateLimitError as e:
        duration_ms = int((time.time() - start_time) * 1000)
        model_name = request_data.get('model', 'unknown')
        provider = infer_provider_from_model(model_name)
        await log_request(
            model_name,
            provider,
            None,
            duration_ms,
            request_data_for_logging,
            error=f"RateLimitError: {str(e)}"
        )
        print(f"{LOG_INDENT}✗ LLM Response: {model_name} ({provider}) | {duration_ms}ms | Error: RateLimitError")
        error_response = build_error_response("rate_limit_error", str(e), "rate_limit_exceeded")
        return JSONResponse(content=error_response, status_code=429)

    except AuthenticationError as e:
        duration_ms = int((time.time() - start_time) * 1000)
        model_name = request_data.get('model', 'unknown')
        provider = infer_provider_from_model(model_name)
        await log_request(
            model_name,
            provider,
            None,
            duration_ms,
            request_data_for_logging,
            error=f"AuthenticationError: {str(e)}"
        )
        print(f"{LOG_INDENT}✗ LLM Response: {model_name} ({provider}) | {duration_ms}ms | Error: AuthenticationError")
        error_response = build_error_response("authentication_error", str(e), "invalid_api_key")
        return JSONResponse(content=error_response, status_code=401)

    except PermissionDeniedError as e:
        duration_ms = int((time.time() - start_time) * 1000)
        model_name = request_data.get('model', 'unknown')
        provider = infer_provider_from_model(model_name)
        await log_request(
            model_name,
            provider,
            None,
            duration_ms,
            request_data_for_logging,
            error=f"PermissionDeniedError: {str(e)}"
        )
        print(f"{LOG_INDENT}✗ LLM Response: {model_name} ({provider}) | {duration_ms}ms | Error: PermissionDeniedError")
        error_response = build_error_response("permission_denied", str(e), "permission_denied")
        return JSONResponse(content=error_response, status_code=403)

    except NotFoundError as e:
        duration_ms = int((time.time() - start_time) * 1000)
        model_name = request_data.get('model', 'unknown')
        provider = infer_provider_from_model(model_name)
        await log_request(
            model_name,
            provider,
            None,
            duration_ms,
            request_data_for_logging,
            error=f"NotFoundError: {str(e)}"
        )
        print(f"{LOG_INDENT}✗ LLM Response: {model_name} ({provider}) | {duration_ms}ms | Error: NotFoundError")
        error_response = build_error_response("invalid_request_error", str(e), "model_not_found")
        return JSONResponse(content=error_response, status_code=404)

    except Timeout as e:
        duration_ms = int((time.time() - start_time) * 1000)
        model_name = request_data.get('model', 'unknown')
        provider = infer_provider_from_model(model_name)
        await log_request(
            model_name,
            provider,
            None,
            duration_ms,
            request_data_for_logging,
            error=f"Timeout: {str(e)}"
        )
        print(f"{LOG_INDENT}✗ LLM Response: {model_name} ({provider}) | {duration_ms}ms | Error: Timeout")
        error_response = build_error_response("timeout_error", str(e), "request_timeout")
        return JSONResponse(content=error_response, status_code=504)

    except (InternalServerError, ServiceUnavailableError) as e:
        duration_ms = int((time.time() - start_time) * 1000)
        model_name = request_data.get('model', 'unknown')
        provider = infer_provider_from_model(model_name)
        await log_request(
            model_name,
            provider,
            None,
            duration_ms,
            request_data_for_logging,
            error=f"ProviderError: {str(e)}"
        )
        print(f"{LOG_INDENT}✗ LLM Response: {model_name} ({provider}) | {duration_ms}ms | Error: ProviderError")
        error_response = build_error_response("service_unavailable", str(e), "service_unavailable")
        return JSONResponse(content=error_response, status_code=503)

    except APIConnectionError as e:
        duration_ms = int((time.time() - start_time) * 1000)
        model_name = request_data.get('model', 'unknown')
        provider = infer_provider_from_model(model_name)
        await log_request(
            model_name,
            provider,
            None,
            duration_ms,
            request_data_for_logging,
            error=f"APIConnectionError: {str(e)}"
        )
        print(f"{LOG_INDENT}✗ LLM Response: {model_name} ({provider}) | {duration_ms}ms | Error: APIConnectionError")
        error_response = build_error_response("connection_error", str(e), "connection_error")
        return JSONResponse(content=error_response, status_code=502)

    except Exception as e:
        # Catch-all for unexpected errors
        logging.exception(f"Unexpected error in chat completions: {e}")
        duration_ms = int((time.time() - start_time) * 1000)
        model_name = request_data.get('model', 'unknown')
        provider = infer_provider_from_model(model_name)
        await log_request(
            model_name,
            provider,
            None,
            duration_ms,
            request_data_for_logging,
            error=f"UnexpectedError: {str(e)}"
        )
        print(f"{LOG_INDENT}✗ LLM Response: {model_name} ({provider}) | {duration_ms}ms | Error: UnexpectedError")
        error_response = build_error_response("api_error", str(e), "internal_error")
        return JSONResponse(content=error_response, status_code=500)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/models")
async def models():
    """List available models from config."""
    model_list = []
    for model_name, litellm_params in apantli.config.MODEL_MAP.items():
        # Try to get pricing info from LiteLLM
        litellm_model = litellm_params['model']
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
            'litellm_model': litellm_params['model'],
            'provider': litellm_params['model'].split('/')[0] if '/' in litellm_params['model'] else 'unknown',
            'input_cost_per_million': round(input_cost, 2) if input_cost else None,
            'output_cost_per_million': round(output_cost, 2) if output_cost else None
        })

    return {'models': model_list}


@app.get("/requests")
async def requests(hours: int = None, start_date: str = None, end_date: str = None,
                  timezone_offset: int = None, offset: int = 0, limit: int = 50,
                  provider: str = None, model: str = None,
                  min_cost: float = None, max_cost: float = None, search: str = None):
    """Get recent requests with full details, optionally filtered by time range and attributes.

    Parameters:
    - hours: Filter to last N hours
    - start_date: ISO 8601 date (YYYY-MM-DD)
    - end_date: ISO 8601 date (YYYY-MM-DD)
    - timezone_offset: Timezone offset in minutes from UTC (e.g., -480 for PST)
    - offset: Number of records to skip (for pagination)
    - limit: Maximum number of records to return (default: 50, max: 200)
    - provider: Filter by provider name (e.g., 'openai', 'anthropic')
    - model: Filter by model name
    - min_cost: Minimum cost threshold
    - max_cost: Maximum cost threshold
    - search: Search in model name or request/response content
    """
    # Limit the max page size
    limit = min(limit, 200)

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
        # Search in model name or JSON content (request_data, response_data)
        filters.append("(model LIKE ? OR request_data LIKE ? OR response_data LIKE ?)")
        search_param = f"%{search}%"
        params.extend([search_param, search_param, search_param])

    # Combine all filters
    filter_clause = time_filter
    if filters:
        filter_clause += " AND " + " AND ".join(filters)

    # Get aggregate stats for ALL matching requests (for summary display)
    cursor.execute(f"""
        SELECT COUNT(*),
               SUM(total_tokens),
               SUM(cost),
               AVG(cost)
        FROM requests
        WHERE error IS NULL {filter_clause}
    """, params)
    agg_row = cursor.fetchone()
    total = agg_row[0] or 0
    total_tokens = agg_row[1] or 0
    total_cost = agg_row[2] or 0.0
    avg_cost = agg_row[3] or 0.0

    # Get paginated results
    cursor.execute(f"""
        SELECT timestamp, model, provider, prompt_tokens, completion_tokens, total_tokens,
               cost, duration_ms, request_data, response_data
        FROM requests
        WHERE error IS NULL {filter_clause}
        ORDER BY timestamp DESC
        LIMIT {limit} OFFSET {offset}
    """, params)
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
        ],
        "total": total,
        "total_tokens": total_tokens,
        "total_cost": total_cost,
        "avg_cost": avg_cost,
        "offset": offset,
        "limit": limit
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

    # Model performance metrics (tokens/second, avg duration, etc.)
    cursor.execute(f"""
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
    performance = cursor.fetchall()

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

    # Get daily aggregates with model breakdown (includes provider for grouping)
    cursor.execute(f"""
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
    """)
    rows = cursor.fetchall()

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

    conn.close()

    return {
        'daily': daily_list,
        'total_days': len(daily_list),
        'total_cost': round(total_cost, 4),
        'total_requests': total_requests
    }


@app.get("/stats/hourly")
async def stats_hourly(date: str, timezone_offset: int = None):
    """Get hourly aggregated statistics for a single day with provider breakdown.

    Parameters:
    - date: ISO 8601 date (YYYY-MM-DD)
    - timezone_offset: Timezone offset in minutes from UTC (e.g., -480 for PST)
    """
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Build WHERE clause using efficient timestamp comparisons
    # and GROUP BY using timezone-adjusted hours
    if timezone_offset is not None:
        # Convert local date range to UTC timestamps for efficient WHERE clause
        start_utc, end_utc = convert_local_date_to_utc_range(date, timezone_offset)
        where_filter = f"timestamp >= '{start_utc}' AND timestamp < '{end_utc}'"

        # Timezone conversion for GROUP BY to group by local hour
        hours = abs(timezone_offset) // 60
        minutes = abs(timezone_offset) % 60
        sign = '+' if timezone_offset >= 0 else '-'
        tz_modifier = f"{sign}{hours:02d}:{minutes:02d}"
        hour_expr = f"CAST(strftime('%H', timestamp, '{tz_modifier}') AS INTEGER)"
    else:
        # No timezone conversion needed
        end_dt = datetime.fromisoformat(date) + timedelta(days=1)
        where_filter = f"timestamp >= '{date}T00:00:00' AND timestamp < '{end_dt.date()}T00:00:00'"
        hour_expr = "CAST(strftime('%H', timestamp) AS INTEGER)"

    # Get hourly aggregates with provider breakdown
    cursor.execute(f"""
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
    """)
    rows = cursor.fetchall()

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

    # Convert to sorted list (ensure all 24 hours are present, even if 0)
    hourly_list = []
    for hour in range(24):
        if hour in hourly_data:
            hourly_data[hour]['cost'] = round(hourly_data[hour]['cost'], 4)
            hourly_list.append(hourly_data[hour])
        else:
            # Fill in missing hours with zeros
            hourly_list.append({
                'hour': hour,
                'requests': 0,
                'cost': 0.0,
                'total_tokens': 0,
                'by_model': []
            })

    # Calculate totals
    total_cost = sum(h['cost'] for h in hourly_list)
    total_requests = sum(h['requests'] for h in hourly_list)

    conn.close()

    return {
        'hourly': hourly_list,
        'date': date,
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
    response = templates.TemplateResponse("dashboard.html", {"request": request})
    # Prevent browser caching of the HTML to avoid stale UI bugs
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


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
    parser.add_argument(
        "--timeout",
        type=int,
        default=120,
        help="Default request timeout in seconds (default: 120)"
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=3,
        help="Default number of retry attempts (default: 3)"
    )

    args = parser.parse_args()

    # Suppress LiteLLM's verbose logging and feedback messages
    litellm.suppress_debug_info = True
    litellm.set_verbose = False

    # Update global config values in their respective modules
    apantli.database.DB_PATH = args.db
    apantli.config.DEFAULT_TIMEOUT = args.timeout
    apantli.config.DEFAULT_RETRIES = args.retries

    # Configure logging format with timestamps
    log_config = uvicorn.config.LOGGING_CONFIG
    # Update default formatter (for startup/info logs)
    log_config["formatters"]["default"]["fmt"] = '%(asctime)s %(levelprefix)s %(message)s'
    log_config["formatters"]["default"]["datefmt"] = '%Y-%m-%d %H:%M:%S'
    # Update access formatter (for HTTP request logs)
    log_config["formatters"]["access"]["fmt"] = '%(asctime)s %(levelprefix)s %(client_addr)s - "%(request_line)s" %(status_code)s'
    log_config["formatters"]["access"]["datefmt"] = '%Y-%m-%d %H:%M:%S'

    # Add filter to suppress noisy dashboard endpoints
    class DashboardFilter(logging.Filter):
        """Filter out noisy dashboard GET requests from access logs."""
        def filter(self, record):
            # Suppress logs for dashboard polling endpoints
            # Check the formatted message since uvicorn log records vary
            message = record.getMessage() if hasattr(record, 'getMessage') else str(record.msg)

            # Filter out all dashboard-related GET requests
            noisy_patterns = [
                'GET / ',  # Dashboard homepage
                'GET /stats?',
                'GET /stats/daily?',
                'GET /stats/date-range',
                'GET /static/',
                'GET /requests',  # Requests endpoint
                'GET /models',  # Models endpoint
                'GET /errors',  # Errors endpoint
                'GET /health',  # Health check
            ]
            return not any(pattern in message for pattern in noisy_patterns)

    # Apply filter to access logger
    logging.getLogger("uvicorn.access").addFilter(DashboardFilter())

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
