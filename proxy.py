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
        provider = response_dict.get('_hidden_params', {}).get('custom_llm_provider', 'unknown')

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


@app.get("/stats")
async def stats():
    """Get usage statistics."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Total stats
    cursor.execute("""
        SELECT
            COUNT(*) as total_requests,
            SUM(cost) as total_cost,
            SUM(prompt_tokens) as total_prompt_tokens,
            SUM(completion_tokens) as total_completion_tokens,
            AVG(duration_ms) as avg_duration_ms
        FROM requests
        WHERE error IS NULL
    """)
    totals = cursor.fetchone()

    # By model
    cursor.execute("""
        SELECT
            model,
            COUNT(*) as requests,
            SUM(cost) as cost,
            SUM(total_tokens) as tokens
        FROM requests
        WHERE error IS NULL
        GROUP BY model
        ORDER BY cost DESC
    """)
    by_model = cursor.fetchall()

    # By provider
    cursor.execute("""
        SELECT
            provider,
            COUNT(*) as requests,
            SUM(cost) as cost,
            SUM(total_tokens) as tokens
        FROM requests
        WHERE error IS NULL
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
    </style>
</head>
<body>
    <h1>LLM Proxy Statistics</h1>

    <div id="totals"></div>

    <h2>By Model</h2>
    <table id="by-model"></table>

    <h2>By Provider</h2>
    <table id="by-provider"></table>

    <h2>Recent Errors</h2>
    <table id="errors"></table>

    <script>
        async function refresh() {
            const res = await fetch('/stats');
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


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=4000)
