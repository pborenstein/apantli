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
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
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
async def requests():
    """Get recent requests with full details."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT timestamp, model, provider, prompt_tokens, completion_tokens, total_tokens,
               cost, duration_ms, request_data, response_data
        FROM requests
        WHERE error IS NULL
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
async def stats(hours: int = None):
    """Get usage statistics, optionally filtered by time range (hours)."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Build time filter
    time_filter = ""
    if hours:
        time_filter = f"AND datetime(timestamp) > datetime('now', '-{hours} hours')"

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

    # Recent errors
    cursor.execute("""
        SELECT timestamp, model, error
        FROM requests
        WHERE error IS NOT NULL
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


@app.get("/", response_class=HTMLResponse)
async def dashboard():
    """Simple HTML dashboard."""
    return """
<!DOCTYPE html>
<html>
<head>
    <title>LLM Proxy Stats</title>
    <style>
        body { font-family: monospace; max-width: 1200px; margin: 40px auto; padding: 0 20px; }
        h1 { border-bottom: 2px solid #333; }
        h2 { margin-top: 30px; border-bottom: 1px solid #666; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
        th { background: #f0f0f0; }
        .metric { display: inline-block; margin: 10px 20px 10px 0; }
        .metric-value { font-size: 24px; font-weight: bold; }
        .metric-label { font-size: 12px; color: #666; }
        .error { color: #c00; }
        .request-row { cursor: pointer; }
        .request-row:hover { background: #f5f5f5; }
        .request-detail { padding: 10px; background: #f9f9f9; }
        .json-view { white-space: pre-wrap; font-size: 11px; overflow-x: auto; }
        pre.json-view { margin: 5px 0; }
        nav { margin: 20px 0; border-bottom: 1px solid #ccc; }
        nav a { display: inline-block; padding: 10px 20px; text-decoration: none; color: #333; }
        nav a.active { border-bottom: 2px solid #333; font-weight: bold; }
    </style>
</head>
<body>
    <h1>LLM Proxy Statistics</h1>

    <nav>
        <a href="#" class="active" onclick="showTab(event, 'stats')">Stats</a>
        <a href="#" onclick="showTab(event, 'models')">Models</a>
        <a href="#" onclick="showTab(event, 'requests')">Requests</a>
    </nav>

    <div id="stats-tab">
        <div style="margin: 20px 0;">
            Time range:
            <select id="timeRange" onchange="refresh()">
                <option value="">All time</option>
                <option value="1">Last hour</option>
                <option value="4">Last 4 hours</option>
                <option value="6">Last 6 hours</option>
                <option value="12">Last 12 hours</option>
                <option value="24">Last 24 hours</option>
                <option value="168">Last week</option>
                <option value="720">Last 30 days</option>
            </select>
        </div>

        <div id="totals"></div>

        <h2>By Model</h2>
        <table id="by-model"></table>

        <h2>By Provider</h2>
        <table id="by-provider"></table>

        <h2>Recent Errors <button onclick="clearErrors()" style="margin-left: 10px;">Clear Errors</button></h2>
        <table id="errors"></table>
    </div>

    <div id="models-tab" style="display:none">
        <h2>Available Models</h2>
        <table id="models-list"></table>
    </div>

    <div id="requests-tab" style="display:none">
        <h2>Recent Requests</h2>
        <table id="requests-list"></table>
    </div>

    <script>
        let requestsInterval = null;

        function showTab(e, tab) {
            e.preventDefault();
            document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
            e.target.classList.add('active');

            document.getElementById('stats-tab').style.display = tab === 'stats' ? 'block' : 'none';
            document.getElementById('models-tab').style.display = tab === 'models' ? 'block' : 'none';
            document.getElementById('requests-tab').style.display = tab === 'requests' ? 'block' : 'none';

            // Clear requests interval when switching away
            if (requestsInterval) {
                clearInterval(requestsInterval);
                requestsInterval = null;
            }

            if (tab === 'models') loadModels();
            if (tab === 'requests') {
                loadRequests();
                // Auto-refresh requests every 5 seconds
                requestsInterval = setInterval(loadRequests, 5000);
            }
        }

        async function loadModels() {
            const res = await fetch('/models');
            const data = await res.json();

            document.getElementById('models-list').innerHTML = `
                <tr>
                    <th>Name</th>
                    <th>Provider</th>
                    <th>LiteLLM Model</th>
                    <th>Input Cost/1M</th>
                    <th>Output Cost/1M</th>
                </tr>
                ${data.models.map(m => `
                    <tr>
                        <td>${m.name}</td>
                        <td>${m.provider}</td>
                        <td>${m.litellm_model}</td>
                        <td>${m.input_cost_per_million ? '$' + m.input_cost_per_million.toFixed(2) : 'N/A'}</td>
                        <td>${m.output_cost_per_million ? '$' + m.output_cost_per_million.toFixed(2) : 'N/A'}</td>
                    </tr>
                `).join('')}
            `;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        async function loadRequests() {
            try {
                const res = await fetch('/requests');
                const data = await res.json();

                const tbody = document.createElement('tbody');

                data.requests.forEach((r, i) => {
                    let requestJson = 'Error parsing request';
                    let responseJson = 'Error parsing response';

                    try {
                        requestJson = JSON.stringify(JSON.parse(r.request_data), null, 2);
                    } catch(e) {}

                    try {
                        responseJson = JSON.stringify(JSON.parse(r.response_data), null, 2);
                    } catch(e) {}

                    // Create main row
                    const mainRow = document.createElement('tr');
                    mainRow.className = 'request-row';
                    mainRow.onclick = () => toggleDetail(i);
                    mainRow.innerHTML = `
                        <td>${escapeHtml(new Date(r.timestamp + 'Z').toLocaleString())}</td>
                        <td>${escapeHtml(r.model)}</td>
                        <td>${r.total_tokens}</td>
                        <td>$${r.cost.toFixed(4)}</td>
                        <td>${r.duration_ms}ms</td>
                    `;

                    // Create detail row
                    const detailRow = document.createElement('tr');
                    detailRow.id = 'detail-' + i;
                    detailRow.style.display = 'none';
                    detailRow.innerHTML = `
                        <td colspan="5" class="request-detail">
                            <b>Request:</b>
                            <pre class="json-view">${escapeHtml(requestJson)}</pre>
                            <b>Response:</b>
                            <pre class="json-view">${escapeHtml(responseJson)}</pre>
                        </td>
                    `;

                    tbody.appendChild(mainRow);
                    tbody.appendChild(detailRow);
                });

                document.getElementById('requests-list').innerHTML = `
                    <thead>
                        <tr>
                            <th>Time</th>
                            <th>Model</th>
                            <th>Tokens</th>
                            <th>Cost</th>
                            <th>Duration</th>
                        </tr>
                    </thead>
                `;
                document.getElementById('requests-list').appendChild(tbody);
            } catch(e) {
                document.getElementById('requests-list').innerHTML = '<tr><td colspan="5">Error loading requests</td></tr>';
            }
        }

        function toggleDetail(id) {
            const row = document.getElementById('detail-' + id);
            if (row) {
                const isHidden = row.style.display === 'none' || !row.style.display;
                row.style.display = isHidden ? 'table-row' : 'none';
            }
        }

        async function refresh() {
            const hours = document.getElementById('timeRange')?.value;
            const url = hours ? `/stats?hours=${hours}` : '/stats';
            const res = await fetch(url);
            const data = await res.json();

            // Totals
            document.getElementById('totals').innerHTML = `
                <div class="metric">
                    <div class="metric-value">${data.totals.requests}</div>
                    <div class="metric-label">REQUESTS</div>
                </div>
                <div class="metric">
                    <div class="metric-value">$${data.totals.cost.toFixed(4)}</div>
                    <div class="metric-label">TOTAL COST</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${(data.totals.prompt_tokens + data.totals.completion_tokens).toLocaleString()}</div>
                    <div class="metric-label">TOTAL TOKENS</div>
                </div>
                <div class="metric">
                    <div class="metric-value">${data.totals.avg_duration_ms.toFixed(0)}ms</div>
                    <div class="metric-label">AVG DURATION</div>
                </div>
            `;

            // By model
            document.getElementById('by-model').innerHTML = `
                <tr><th>Model</th><th>Requests</th><th>Cost</th><th>Tokens</th></tr>
                ${data.by_model.map(m => `
                    <tr>
                        <td>${m.model}</td>
                        <td>${m.requests}</td>
                        <td>$${m.cost.toFixed(4)}</td>
                        <td>${m.tokens.toLocaleString()}</td>
                    </tr>
                `).join('')}
            `;

            // By provider
            document.getElementById('by-provider').innerHTML = `
                <tr><th>Provider</th><th>Requests</th><th>Cost</th><th>Tokens</th></tr>
                ${data.by_provider.map(p => `
                    <tr>
                        <td>${p.provider}</td>
                        <td>${p.requests}</td>
                        <td>$${p.cost.toFixed(4)}</td>
                        <td>${p.tokens.toLocaleString()}</td>
                    </tr>
                `).join('')}
            `;

            // Errors
            if (data.recent_errors.length > 0) {
                document.getElementById('errors').innerHTML = `
                    <tr><th>Time</th><th>Model</th><th>Error</th></tr>
                    ${data.recent_errors.map(e => `
                        <tr>
                            <td>${new Date(e.timestamp + 'Z').toLocaleString()}</td>
                            <td>${e.model}</td>
                            <td class="error">${e.error}</td>
                        </tr>
                    `).join('')}
                `;
            } else {
                document.getElementById('errors').innerHTML = '<tr><td>No errors</td></tr>';
            }
        }

        async function clearErrors() {
            if (!confirm('Clear all errors from the database?')) return;
            await fetch('/errors', { method: 'DELETE' });
            refresh();
        }

        refresh();
        setInterval(refresh, 5000);
    </script>
</body>
</html>
"""


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

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=args.reload
    )


if __name__ == "__main__":
    main()
