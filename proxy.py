#!/usr/bin/env python3
"""
Lightweight LLM proxy with SQLite cost tracking.
Compatible with OpenAI API format, uses LiteLLM SDK for provider routing.
"""

import os
import sqlite3
import json
from datetime import datetime
from typing import Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
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

        # Convert to dict for logging and response
        response_dict = response.model_dump()

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
        try:
            test_response = {
                'model': config['model'],
                'usage': {'prompt_tokens': 1000, 'completion_tokens': 1000}
            }
            cost_per_1k = litellm.completion_cost(completion_response=test_response)
            input_cost = cost_per_1k / 2  # Rough estimate
            output_cost = cost_per_1k / 2
        except:
            input_cost = None
            output_cost = None

        model_list.append({
            'name': model_name,
            'litellm_model': config['model'],
            'provider': config['model'].split('/')[0] if '/' in config['model'] else 'unknown',
            'input_cost_per_1k': round(input_cost, 6) if input_cost else None,
            'output_cost_per_1k': round(output_cost, 6) if output_cost else None
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
        time_filter = f"AND timestamp > datetime('now', '-{hours} hours')"

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
        .request-detail { display: none; padding: 10px; background: #f9f9f9; margin: 10px 0; }
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

        <h2>Recent Errors</h2>
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
        function showTab(e, tab) {
            e.preventDefault();
            document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
            e.target.classList.add('active');

            document.getElementById('stats-tab').style.display = tab === 'stats' ? 'block' : 'none';
            document.getElementById('models-tab').style.display = tab === 'models' ? 'block' : 'none';
            document.getElementById('requests-tab').style.display = tab === 'requests' ? 'block' : 'none';

            if (tab === 'models') loadModels();
            if (tab === 'requests') loadRequests();
        }

        async function loadModels() {
            const res = await fetch('/models');
            const data = await res.json();

            document.getElementById('models-list').innerHTML = `
                <tr>
                    <th>Name</th>
                    <th>Provider</th>
                    <th>LiteLLM Model</th>
                    <th>Input Cost/1k</th>
                    <th>Output Cost/1k</th>
                </tr>
                ${data.models.map(m => `
                    <tr>
                        <td>${m.name}</td>
                        <td>${m.provider}</td>
                        <td>${m.litellm_model}</td>
                        <td>${m.input_cost_per_1k ? '$' + m.input_cost_per_1k : 'N/A'}</td>
                        <td>${m.output_cost_per_1k ? '$' + m.output_cost_per_1k : 'N/A'}</td>
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
                console.log('Loaded', data.requests.length, 'requests');

                const tbody = document.createElement('tbody');

                data.requests.forEach((r, i) => {
                    let requestJson = 'Error parsing request';
                    let responseJson = 'Error parsing response';

                    try {
                        requestJson = JSON.stringify(JSON.parse(r.request_data), null, 2);
                    } catch(e) {
                        console.error('Error parsing request:', e);
                    }

                    try {
                        responseJson = JSON.stringify(JSON.parse(r.response_data), null, 2);
                    } catch(e) {
                        console.error('Error parsing response:', e);
                    }

                    // Create main row
                    const mainRow = document.createElement('tr');
                    mainRow.className = 'request-row';
                    mainRow.onclick = () => toggleDetail(i);
                    mainRow.innerHTML = `
                        <td>${escapeHtml(new Date(r.timestamp).toLocaleString())}</td>
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
                console.error('Error loading requests:', e);
                document.getElementById('requests-list').innerHTML = '<tr><td colspan="5">Error loading requests</td></tr>';
            }
        }

        function toggleDetail(id) {
            const row = document.getElementById('detail-' + id);
            row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
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
                            <td>${new Date(e.timestamp).toLocaleString()}</td>
                            <td>${e.model}</td>
                            <td class="error">${e.error}</td>
                        </tr>
                    `).join('')}
                `;
            } else {
                document.getElementById('errors').innerHTML = '<tr><td>No errors</td></tr>';
            }
        }

        refresh();
        setInterval(refresh, 5000);
    </script>
</body>
</html>
"""


def main():
    """Entry point for the proxy server."""
    uvicorn.run(app, host="0.0.0.0", port=4000)


if __name__ == "__main__":
    main()
