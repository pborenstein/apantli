#!/usr/bin/env python3
"""
Lightweight LLM proxy with SQLite cost tracking.
Compatible with OpenAI API format, uses LiteLLM SDK for provider routing.
"""

import os
import socket
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
from apantli.config import LOG_INDENT, Config
from apantli.database import Database, RequestFilter
from apantli.errors import build_error_response, get_error_details
from apantli.llm import infer_provider_from_model
from apantli.utils import convert_local_date_to_utc_range, build_time_filter, build_date_expr, build_hour_expr

# Load environment variables
load_dotenv()

# Templates
templates = Jinja2Templates(directory="templates")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize database and load config on startup."""
    # Get config values from app.state if set by main(), otherwise use defaults
    config_path = getattr(app.state, 'config_path', 'config.yaml')
    db_path = getattr(app.state, 'db_path', 'requests.db')
    app.state.timeout = getattr(app.state, 'timeout', 120)
    app.state.retries = getattr(app.state, 'retries', 3)

    # Load configuration
    config = Config(config_path)
    app.state.config = config
    app.state.model_map = config.get_model_map({
        'timeout': app.state.timeout,
        'num_retries': app.state.retries
    })

    # Initialize database
    db = Database(db_path)
    await db.init()
    app.state.db = db
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


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Convert FastAPI HTTPException to OpenAI-compatible error format."""
    error_response = build_error_response(
        "invalid_request_error",
        exc.detail if isinstance(exc.detail, str) else str(exc.detail),
        f"http_{exc.status_code}"
    )
    return JSONResponse(content=error_response, status_code=exc.status_code)


def resolve_model_config(model: str, request_data: dict, model_map: dict,
                        timeout: int, retries: int) -> dict:
    """Resolve model configuration and merge with request parameters.

    Args:
        model: Model name from request
        request_data: Request data dict (will be modified)
        model_map: Model configuration map from app.state
        timeout: Default timeout from app.state
        retries: Default retries from app.state

    Returns:
        Updated request_data dict

    Raises:
        HTTPException: If model not found in configuration
    """
    if model not in model_map:
        available_models = sorted(model_map.keys())
        error_msg = f"Model '{model}' not found in configuration."
        if available_models:
            error_msg += f" Available models: {', '.join(available_models)}"
        raise HTTPException(status_code=404, detail=error_msg)

    model_config = model_map[model]

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

    # Apply global defaults if not specified
    if 'timeout' not in request_data:
        request_data['timeout'] = timeout
    if 'num_retries' not in request_data:
        request_data['num_retries'] = retries

    return request_data


def calculate_cost(response) -> float:
    """Calculate cost for a completion response, returning 0.0 on error."""
    try:
        return litellm.completion_cost(completion_response=response)
    except:
        return 0.0


async def execute_streaming_request(
    response,
    model: str,
    request_data: dict,
    request_data_for_logging: dict,
    start_time: float,
    db: Database
) -> StreamingResponse:
    """Execute and stream LiteLLM response with logging.

    Args:
        response: LiteLLM streaming response
        model: Original model name from request
        request_data: Request data dict
        request_data_for_logging: Copy of request data for logging
        start_time: Request start time
        db: Database instance

    Returns:
        StreamingResponse with SSE format
    """
    import time

    # Extract provider before creating generator (from remapped litellm model name)
    litellm_model = request_data.get('model', '')
    provider = infer_provider_from_model(litellm_model)

    # Collect chunks for logging
    full_response = {
        'id': None,
        'model': request_data['model'],  # Use full LiteLLM model name for cost calculation
        'choices': [{'message': {'role': 'assistant', 'content': ''}, 'finish_reason': None}],
        'usage': {'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}
    }
    socket_error_logged = False

    async def generate():
        nonlocal full_response, socket_error_logged
        stream_error = None

        try:
            for chunk in response:
                chunk_dict = chunk.model_dump() if hasattr(chunk, 'model_dump') else dict(chunk)

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

                try:
                    yield f"data: {json.dumps(chunk_dict)}\n\n"
                except (BrokenPipeError, ConnectionError, ConnectionResetError) as exc:
                    if not socket_error_logged:
                        logging.info(f"Client disconnected during streaming: {type(exc).__name__}")
                        socket_error_logged = True
                    return  # Client disconnected

        except (RateLimitError, InternalServerError, ServiceUnavailableError, Timeout, APIConnectionError) as exc:
            # Provider error during streaming - send error event
            stream_error = f"{type(exc).__name__}: {str(exc)}"
            error_event = build_error_response("stream_error", str(exc), type(exc).__name__.lower())
            try:
                yield f"data: {json.dumps(error_event)}\n\n"
            except (BrokenPipeError, ConnectionError, ConnectionResetError):
                if not socket_error_logged:
                    logging.info("Client disconnected before error could be sent")
                    socket_error_logged = True

        except Exception as exc:
            # Unexpected error during streaming
            stream_error = f"UnexpectedStreamError: {str(exc)}"
            error_event = build_error_response("stream_error", str(exc), "internal_error")
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
                await db.log_request(model, provider, full_response, duration_ms, request_data_for_logging, error=stream_error)

                # Log completion
                if stream_error:
                    print(f"{LOG_INDENT}✗ LLM Response: {model} ({provider}) | {duration_ms}ms | Error: {stream_error}")
                else:
                    usage = full_response.get('usage', {})
                    prompt_tokens = usage.get('prompt_tokens', 0)
                    completion_tokens = usage.get('completion_tokens', 0)
                    total_tokens = usage.get('total_tokens', 0)
                    cost = calculate_cost(full_response)
                    print(f"{LOG_INDENT}✓ LLM Response: {model} ({provider}) | {duration_ms}ms | {prompt_tokens}→{completion_tokens} tokens ({total_tokens} total) | ${cost:.4f} [streaming]")
            except Exception as exc:
                logging.error(f"Error logging streaming request to database: {exc}")

    return StreamingResponse(generate(), media_type="text/event-stream")


async def execute_request(
    response,
    model: str,
    request_data: dict,
    request_data_for_logging: dict,
    start_time: float,
    db: Database
) -> JSONResponse:
    """Execute non-streaming LiteLLM request with logging.

    Args:
        response: LiteLLM response object
        model: Original model name from request
        request_data: Request data dict
        request_data_for_logging: Copy of request data for logging
        start_time: Request start time
        db: Database instance

    Returns:
        JSONResponse with completion data
    """
    import time

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
    await db.log_request(model, provider, response_dict, duration_ms, request_data_for_logging)

    # Log completion
    usage = response_dict.get('usage', {})
    prompt_tokens = usage.get('prompt_tokens', 0)
    completion_tokens = usage.get('completion_tokens', 0)
    total_tokens = usage.get('total_tokens', 0)
    cost = calculate_cost(response)
    print(f"{LOG_INDENT}✓ LLM Response: {model} ({provider}) | {duration_ms}ms | {prompt_tokens}→{completion_tokens} tokens ({total_tokens} total) | ${cost:.4f}")

    return JSONResponse(content=response_dict)


async def handle_llm_error(e: Exception, start_time: float, request_data: dict,
                          request_data_for_logging: dict, db: Database) -> JSONResponse:
    """Handle LLM API errors with consistent logging and response formatting."""
    import time

    duration_ms = int((time.time() - start_time) * 1000)
    model_name = request_data.get('model', 'unknown')
    provider = infer_provider_from_model(model_name)

    # Get error details from error mapping
    status_code, error_type, error_code = get_error_details(e)

    # Special handling for provider errors
    error_name = type(e).__name__
    if isinstance(e, (InternalServerError, ServiceUnavailableError)):
        error_name = "ProviderError"

    # Log to database
    await db.log_request(
        model_name,
        provider,
        None,
        duration_ms,
        request_data_for_logging,
        error=f"{error_name}: {str(e)}"
    )

    # Console log
    print(f"{LOG_INDENT}✗ LLM Response: {model_name} ({provider}) | {duration_ms}ms | Error: {error_name}")

    # Build and return error response
    error_response = build_error_response(error_type, str(e), error_code)
    return JSONResponse(content=error_response, status_code=status_code)


@app.post("/v1/chat/completions")
@app.post("/chat/completions")
async def chat_completions(request: Request):
    """OpenAI-compatible chat completions endpoint."""
    import time

    db = request.app.state.db
    start_time = time.time()
    request_data = await request.json()

    try:
        # Validate model parameter
        model = request_data.get('model')
        if not model:
            error_response = build_error_response("invalid_request_error", "Model is required", "missing_model")
            return JSONResponse(content=error_response, status_code=400)

        # Resolve model configuration and merge with request
        request_data = resolve_model_config(
            model,
            request_data,
            request.app.state.model_map,
            request.app.state.timeout,
            request.app.state.retries
        )

        # Create logging copy with final request_data (includes API key and all params)
        request_data_for_logging = request_data.copy()

        # Log request start
        is_streaming = request_data.get('stream', False)
        stream_indicator = " [streaming]" if is_streaming else ""
        print(f"{LOG_INDENT}→ LLM Request: {model}{stream_indicator}")

        # Call LiteLLM
        response = completion(**request_data)

        # Route to appropriate handler based on streaming mode
        if is_streaming:
            return await execute_streaming_request(response, model, request_data, request_data_for_logging, start_time, db)
        else:
            return await execute_request(response, model, request_data, request_data_for_logging, start_time, db)

    except HTTPException as exc:
        # Model not found - log and return error
        duration_ms = int((time.time() - start_time) * 1000)
        await db.log_request(model, "unknown", None, duration_ms, request_data, error=f"UnknownModel: {exc.detail}")
        print(f"{LOG_INDENT}✗ LLM Response: {model} (unknown) | {duration_ms}ms | Error: UnknownModel")
        error_response = build_error_response("invalid_request_error", exc.detail, "model_not_found")
        return JSONResponse(content=error_response, status_code=exc.status_code)

    except (RateLimitError, AuthenticationError, PermissionDeniedError, NotFoundError,
            Timeout, InternalServerError, ServiceUnavailableError, APIConnectionError) as exc:
        return await handle_llm_error(exc, start_time, request_data, request_data_for_logging, db)

    except Exception as exc:
        # Catch-all for unexpected errors
        logging.exception(f"Unexpected error in chat completions: {exc}")
        return await handle_llm_error(exc, start_time, request_data, request_data_for_logging, db)


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.get("/models")
async def models(request: Request):
    """List available models from config."""
    model_list = []
    for model_name, litellm_params in request.app.state.model_map.items():
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
        except Exception as exc:
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
async def requests(request: Request, hours: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None,
                  timezone_offset: Optional[int] = None, offset: int = 0, limit: int = 50,
                  provider: Optional[str] = None, model: Optional[str] = None,
                  min_cost: Optional[float] = None, max_cost: Optional[float] = None, search: Optional[str] = None):
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

    # Build time filter using efficient timestamp comparisons
    time_filter = build_time_filter(hours, start_date, end_date, timezone_offset)

    # Use Database instance from app state
    db = request.app.state.db
    filters = RequestFilter(
        time_filter=time_filter,
        offset=offset,
        limit=limit,
        provider=provider,
        model=model,
        min_cost=min_cost,
        max_cost=max_cost,
        search=search
    )
    return await db.get_requests(filters)


@app.get("/stats")
async def stats(request: Request, hours: Optional[int] = None, start_date: Optional[str] = None, end_date: Optional[str] = None, timezone_offset: Optional[int] = None):
    """Get usage statistics, optionally filtered by time range.

    Parameters:
    - hours: Filter to last N hours
    - start_date: ISO 8601 date (YYYY-MM-DD)
    - end_date: ISO 8601 date (YYYY-MM-DD)
    - timezone_offset: Timezone offset in minutes from UTC (e.g., -480 for PST)
    """
    # Build time filter using efficient timestamp comparisons
    time_filter = build_time_filter(hours, start_date, end_date, timezone_offset)

    # Use Database instance from app state
    db = request.app.state.db
    return await db.get_stats(time_filter=time_filter)


@app.delete("/errors")
async def clear_errors(request: Request):
    """Clear all errors from the database."""
    db = request.app.state.db
    deleted = await db.clear_errors()
    return {"deleted": deleted}


@app.get("/stats/daily")
async def stats_daily(request: Request, start_date: Optional[str] = None, end_date: Optional[str] = None, timezone_offset: Optional[int] = None):
    """Get daily aggregated statistics with provider breakdown.

    Parameters:
    - start_date: ISO 8601 date (YYYY-MM-DD), defaults to 30 days ago
    - end_date: ISO 8601 date (YYYY-MM-DD), defaults to today
    - timezone_offset: Timezone offset in minutes from UTC (e.g., -480 for PST)
    """
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
    else:
        # No timezone conversion needed
        end_dt = datetime.fromisoformat(end_date) + timedelta(days=1)
        where_filter = f"timestamp >= '{start_date}T00:00:00' AND timestamp < '{end_dt.date()}T00:00:00'"

    # Build date expression for GROUP BY
    date_expr = build_date_expr(timezone_offset)

    # Use Database instance from app state
    db = request.app.state.db
    return await db.get_daily_stats(start_date, end_date, where_filter, date_expr)


@app.get("/stats/hourly")
async def stats_hourly(request: Request, date: str, timezone_offset: Optional[int] = None):
    """Get hourly aggregated statistics for a single day with provider breakdown.

    Parameters:
    - date: ISO 8601 date (YYYY-MM-DD)
    - timezone_offset: Timezone offset in minutes from UTC (e.g., -480 for PST)
    """
    # Build WHERE clause using efficient timestamp comparisons
    # and GROUP BY using timezone-adjusted hours
    if timezone_offset is not None:
        # Convert local date range to UTC timestamps for efficient WHERE clause
        start_utc, end_utc = convert_local_date_to_utc_range(date, timezone_offset)
        where_filter = f"timestamp >= '{start_utc}' AND timestamp < '{end_utc}'"
    else:
        # No timezone conversion needed
        end_dt = datetime.fromisoformat(date) + timedelta(days=1)
        where_filter = f"timestamp >= '{date}T00:00:00' AND timestamp < '{end_dt.date()}T00:00:00'"

    # Build hour expression for GROUP BY
    hour_expr = build_hour_expr(timezone_offset)

    # Use Database instance from app state
    db = request.app.state.db
    result = await db.get_hourly_stats(where_filter, hour_expr)

    # Ensure all 24 hours are present (fill missing hours with zeros)
    hourly_dict = {h['hour']: h for h in result['hourly']}
    hourly_list = []
    for hour in range(24):
        if hour in hourly_dict:
            hourly_list.append(hourly_dict[hour])
        else:
            hourly_list.append({
                'hour': hour,
                'requests': 0,
                'cost': 0.0,
                'total_tokens': 0,
                'by_model': []
            })

    return {
        'hourly': hourly_list,
        'date': date,
        'total_cost': result['total_cost'],
        'total_requests': result['total_requests']
    }


@app.get("/stats/date-range")
async def stats_date_range(request: Request):
    """Get the actual date range of data in the database."""
    db = request.app.state.db
    return await db.get_date_range()


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

    # Store config values in app.state for lifespan to access
    app.state.config_path = args.config
    app.state.db_path = args.db
    app.state.timeout = args.timeout
    app.state.retries = args.retries

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
        except Exception as exc:
            # Fallback to hostname lookup
            try:
                hostname = socket.gethostname()
                for info in socket.getaddrinfo(hostname, None):
                    ip = str(info[4][0])  # Convert to string for consistent handling
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
