# Project-Based Usage Tracking for Apantli

**Date**: 2025-11-23
**Focus**: Deep dive into project-based organization and cross-tool attribution

## The Problem: Context-Free LLM Usage

### Current Reality

Every LLM request happens in a context:
- **Work project** for ClientA (should bill them)
- **Personal** side project (comes from your budget)
- **Experiments** trying new techniques (R&D budget)
- **Open source** contribution (community work)

But today, Apantli treats all requests the same:
```sql
SELECT model, cost FROM requests;
-- gpt-4.1-mini, $0.05
-- claude-haiku, $0.02
-- gpt-4.1-mini, $0.08
-- Where did these costs belong? Unknown!
```

**Result**: Mixed costs, no attribution, impossible to bill clients, can't track project budgets.

### Why This Matters

**Scenario 1: Freelance Developer**
```
You work on 3 client projects:
- ClientA web app (their API keys, pass-through billing)
- ClientB mobile app (your keys, bill at end of month)
- Personal blog (your personal budget)

Problem: At month end, you can't separate costs.
Invoice ClientB: "LLM costs: $???" ← Wild guess
```

**Scenario 2: Engineering Team**
```
5 engineers, all using same Apantli instance
- Each has different projects
- Each has different budgets
- Manager wants cost per project

Problem: No way to attribute requests to people or projects
```

**Scenario 3: Research Organization**
```
Multiple experiments running simultaneously:
- Experiment A: RAG with embeddings
- Experiment B: Chain-of-thought prompting
- Experiment C: Fine-tuning evaluation

Problem: Can't measure cost per experiment to determine ROI
```

## The Solution: Project-Based Organization

### Conceptual Model

**Three-Level Hierarchy**:
```
Organization (optional)
└── Projects
    └── Requests
```

**Example**:
```
Personal (org)
├── work (project)
│   ├── clientA-webapp
│   ├── clientB-mobile
│   └── internal-tools
├── personal (project)
│   ├── blog
│   └── learning
└── experiments (project)
    ├── rag-testing
    └── prompt-optimization
```

### Database Schema

```sql
-- Organizations (for teams/companies)
CREATE TABLE organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TEXT NOT NULL,
  settings TEXT,  -- JSON: {default_budget, alert_threshold, etc.}
  UNIQUE(name)
);

-- Projects belong to organizations
CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER,  -- NULL for personal projects
  name TEXT NOT NULL,
  display_name TEXT,        -- User-friendly name
  description TEXT,
  created_at TEXT NOT NULL,

  -- Visual organization
  color TEXT DEFAULT '#3B82F6',  -- Hex color
  icon TEXT,                      -- Emoji or icon name

  -- Budget tracking
  monthly_budget REAL,           -- NULL = unlimited
  alert_threshold REAL,          -- Warn at 80% by default

  -- State
  is_active INTEGER DEFAULT 1,
  archived_at TEXT,

  FOREIGN KEY(organization_id) REFERENCES organizations(id),
  UNIQUE(organization_id, name)
);

-- Project metadata (flexible key-value store)
CREATE TABLE project_metadata (
  project_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id),
  PRIMARY KEY(project_id, key)
);

-- Examples:
-- ('github_repo', 'https://github.com/user/repo')
-- ('client_name', 'ClientA')
-- ('billable', 'true')
-- ('billing_rate', '1.2')  -- 20% markup
-- ('cost_center', 'engineering')

-- Enhanced requests table
ALTER TABLE requests ADD COLUMN project_id INTEGER REFERENCES projects(id);
ALTER TABLE requests ADD COLUMN client_identifier TEXT;  -- 'cursor', 'llm-cli', etc.
ALTER TABLE requests ADD COLUMN context TEXT;  -- 'file:src/App.tsx', 'vault:notes'
ALTER TABLE requests ADD COLUMN session_id TEXT;  -- Group related requests

CREATE INDEX idx_project_timestamp ON requests(project_id, timestamp);
CREATE INDEX idx_client_project ON requests(client_identifier, project_id);
```

### Project Auto-Detection

**Strategy**: Infer project from context automatically

**Git-Based Detection** (for code editors):
```python
def detect_project_from_git() -> Optional[str]:
    """Detect project from git repository"""
    try:
        # Get git root
        git_root = subprocess.check_output(
            ['git', 'rev-parse', '--show-toplevel'],
            stderr=subprocess.DEVNULL
        ).decode().strip()

        # Use repo name as project
        project = os.path.basename(git_root)
        return project
    except:
        return None

# Example:
# /Users/me/code/clientA-webapp/.git
# → Project: "clientA-webapp"
```

**Workspace-Based Detection** (for editors):
```python
def detect_project_from_workspace(cursor_workspace: str) -> str:
    """Extract project from workspace path"""
    # /Users/me/Projects/clientA-webapp
    # → Project: "clientA-webapp"
    return os.path.basename(cursor_workspace)
```

**File-Based Detection** (for note-taking apps):
```python
def detect_project_from_file(file_path: str) -> Optional[str]:
    """Detect project from file location"""
    # Obsidian: /Vaults/Work/ClientA/notes.md
    # → Project: "ClientA"

    # Drafts: tagged with "project:clientA"
    # → Project: "clientA"

    parts = file_path.split(os.sep)
    if 'Vaults' in parts:
        vault_idx = parts.index('Vaults')
        if len(parts) > vault_idx + 2:
            return parts[vault_idx + 2]  # Project subfolder

    return None
```

**Explicit Tagging** (fallback):
```python
def detect_project_from_tags(tags: list) -> Optional[str]:
    """Extract project from tags"""
    # Tags: ['todo', 'project:clientA', 'urgent']
    # → Project: "clientA"

    for tag in tags:
        if tag.startswith('project:'):
            return tag.replace('project:', '')

    return None
```

**Combined Auto-Detection**:
```python
async def resolve_project(request: Request) -> Optional[int]:
    """Resolve project ID from request context"""

    # 1. Explicit header (highest priority)
    if project_name := request.headers.get('X-Apantli-Project'):
        return await get_or_create_project(project_name)

    # 2. Extract from context header
    context = request.headers.get('X-Apantli-Context', '')

    # Git-based (from cursor, iTerm)
    if 'git:' in context:
        repo_name = context.split('git:')[1].split('/')[0]
        return await get_or_create_project(repo_name)

    # Workspace-based (from cursor)
    if 'workspace:' in context:
        workspace = context.split('workspace:')[1]
        return await get_or_create_project(workspace)

    # File-based (from Obsidian)
    if 'vault:' in context:
        vault_parts = context.split('vault:')[1].split('/')
        if len(vault_parts) > 1:
            return await get_or_create_project(vault_parts[1])

    # 3. Default project
    return await get_project_id('default')
```

### Client Integration Examples

#### Cursor Editor

**Automatic context**:
```javascript
// Cursor extension
const gitRoot = execSync('git rev-parse --show-toplevel').toString().trim();
const project = path.basename(gitRoot);

fetch('http://localhost:4000/v1/chat/completions', {
  headers: {
    'X-Apantli-Client': 'cursor/0.42.0',
    'X-Apantli-Project': project,  // Auto-detected!
    'X-Apantli-Context': `git:${project}/file:${activeFile.relativePath}`
  },
  body: JSON.stringify({...})
});
```

**Per-workspace override**:
```json
// .vscode/settings.json
{
  "apantli.project": "clientA-webapp",
  "apantli.metadata": {
    "client": "ClientA",
    "billable": true
  }
}
```

#### llm CLI

**Automatic detection**:
```bash
#!/bin/bash
# ~/.local/bin/llm-project

# Auto-detect project from git
PROJECT=$(git rev-parse --show-toplevel 2>/dev/null | xargs basename)
PROJECT=${PROJECT:-"personal"}

# Set headers
export LLM_HEADERS="X-Apantli-Project: $PROJECT"

# Run llm with project context
llm "$@"
```

**Manual override**:
```bash
# Explicit project
llm --project clientA "Generate API docs"

# Project from environment
export APANTLI_PROJECT=experiments
llm "Test new prompting technique"
```

#### Obsidian

**Vault-based projects**:
```typescript
// Obsidian plugin
class ApantliPlugin extends Plugin {
  async onload() {
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        // Detect project from file path
        const project = this.detectProject(file.path);
        this.currentProject = project;
      })
    );
  }

  detectProject(filePath: string): string {
    // /Work/ClientA/meeting-notes.md → "ClientA"
    const parts = filePath.split('/');
    if (parts.length > 1) {
      return parts[1];  // Second level folder
    }
    return 'personal';
  }

  async callLLM(prompt: string): Promise<string> {
    const response = await fetch('http://localhost:4000/v1/chat/completions', {
      headers: {
        'X-Apantli-Client': 'obsidian-copilot/1.8.0',
        'X-Apantli-Project': this.currentProject,
        'X-Apantli-Context': `vault:${this.app.vault.getName()}/file:${this.app.workspace.getActiveFile()?.path}`
      },
      // ...
    });
    return response;
  }
}
```

### Project Management UI

**Dashboard: "Projects" Tab**

```
┌──────────────────────────────────────────────────────────────┐
│ Projects                                      [+ New Project] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Active Projects                                              │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                              │
│ 🟢 work                                                      │
│    54 requests today  •  $4.23  •  Budget: $150/month       │
│    ▓▓▓░░░░░░░░░░░░░░░░░  28% used                           │
│                                                              │
│    Breakdown by tool:                                        │
│      cursor:  32 requests  $2.11                            │
│      llm-cli: 15 requests  $1.45                            │
│      obsidian: 7 requests  $0.67                            │
│                                                              │
│    Top models:                                               │
│      gpt-4.1-mini: 38 requests  $2.89                       │
│      claude-haiku: 16 requests  $1.34                       │
│                                                              │
│    [View Details] [Edit] [Archive]                          │
│                                                              │
│ ─────────────────────────────────────────────────────────────│
│                                                              │
│ 🔵 personal                                                  │
│    23 requests today  •  $1.45  •  Budget: $50/month        │
│    ▓▓▓░░░░░░░░░░░░░░░░░  29% used                           │
│                                                              │
│    [View Details] [Edit]                                    │
│                                                              │
│ ─────────────────────────────────────────────────────────────│
│                                                              │
│ 🟡 experiments                                               │
│    12 requests today  •  $0.78  •  No budget                │
│                                                              │
│    [View Details] [Edit]                                    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Project Detail View**:

```
┌──────────────────────────────────────────────────────────────┐
│ ← Projects                                                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ 🟢 work                                              [Edit]  │
│                                                              │
│ Description: Client work and internal tools                  │
│ Created: 2025-01-15                                          │
│ Monthly Budget: $150.00                                      │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Usage Overview                                               │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ This Month (November 2025)                                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                              │
│ Spending: $42.45 / $150.00                                   │
│ ▓▓▓▓▓░░░░░░░░░░░░░░  28%                                     │
│                                                              │
│ Requests: 1,234                                              │
│ Tokens: 2.3M prompt → 890K completion                        │
│ Avg cost per request: $0.034                                 │
│                                                              │
│ Projected monthly cost: $58.23 Under budget              │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Cost Trend                                                   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  $8 │     ╭─╮                                                │
│     │    ╭╯ ╰╮                                               │
│  $4 │  ╭─╯   ╰╮   ╭╮                                         │
│     │╭─╯      ╰───╯╰─────                                    │
│  $0 └────────────────────────────                            │
│     Nov 1        15         23                               │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ By Tool                                                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ cursor        ████████████████░░  785 req    $28.12  66%    │
│ llm-cli       ████████░░░░░░░░░░  312 req    $10.23  24%    │
│ obsidian      ███░░░░░░░░░░░░░░░  137 req    $ 4.10  10%    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ By Model                                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ gpt-4.1-mini  ███████████████░░░  892 req    $26.78  63%    │
│ claude-haiku  ██████░░░░░░░░░░░░  298 req    $12.45  29%    │
│ gpt-4.1       ██░░░░░░░░░░░░░░░░   44 req    $ 3.22   8%    │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Recent Activity                                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Nov 23 10:45  cursor  gpt-4.1-mini  $0.05  "Refactor auth"  │
│ Nov 23 10:32  cursor  gpt-4.1-mini  $0.03  "Add validation" │
│ Nov 23 09:15  llm-cli claude-haiku  $0.02  "Explain error"  │
│                                                              │
│ [View All Requests]                                          │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

**Create/Edit Project Form**:

```
┌──────────────────────────────────────────────────────┐
│ New Project                                          │
├──────────────────────────────────────────────────────┤
│                                                      │
│ Display Name: *                                      │
│ [ClientA Web Application_____________]               │
│                                                      │
│ Internal Name: (auto-generated)                      │
│ [clienta-web-application_____________]               │
│                                                      │
│ Description:                                         │
│ [E-commerce platform for ClientA,____]               │
│ [including admin dashboard and API___]               │
│                                                      │
│ Color:                                               │
│ ⬛ 🟥 🟧 🟨 🟩 🟦 🟪  ← Selected: Blue             │
│                                                      │
│ Icon (optional):                                     │
│ [🛒]  ← Emoji picker                                 │
│                                                      │
│ Monthly Budget (optional):                           │
│ [$] [200.00______]  per month                        │
│                                                      │
│ Alert Threshold:                                     │
│ [80_____]%  of budget                                │
│                                                      │
│ Metadata (optional):                                 │
│ ┌────────────────────────────────────────────┐       │
│ │ Key          │ Value                       │       │
│ ├────────────────────────────────────────────┤       │
│ │ client_name  │ ClientA Inc.                │       │
│ │ billable     │ true                        │       │
│ │ billing_rate │ 1.2 (20% markup)            │       │
│ │ github_repo  │ github.com/me/clienta-web   │       │
│ └────────────────────────────────────────────┘       │
│ [+ Add Metadata]                                     │
│                                                      │
│ [Cancel]                          [Create Project]   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### Budget Tracking & Alerts

**Monthly Budget Monitoring**:
```python
async def check_project_budget(project_id: int) -> dict:
    """Check current spending against budget"""

    # Get project budget
    project = await db.get_project(project_id)
    monthly_budget = project['monthly_budget']

    if not monthly_budget:
        return {'status': 'no_budget', 'spending': get_monthly_spending(project_id)}

    # Calculate current month spending
    spending = await db.query("""
        SELECT SUM(cost) as total
        FROM requests
        WHERE project_id = ?
          AND strftime('%Y-%m', timestamp) = strftime('%Y-%m', 'now')
    """, [project_id])

    current_spending = spending['total'] or 0
    percentage = (current_spending / monthly_budget) * 100
    threshold = project['alert_threshold'] or 80

    # Project end-of-month cost
    days_in_month = 30
    day_of_month = datetime.now().day
    daily_rate = current_spending / day_of_month
    projected = daily_rate * days_in_month

    status = 'ok'
    if percentage >= 100:
        status = 'over_budget'
    elif percentage >= threshold:
        status = 'warning'

    return {
        'status': status,
        'budget': monthly_budget,
        'spending': current_spending,
        'percentage': percentage,
        'projected': projected,
        'remaining': monthly_budget - current_spending,
        'days_remaining': days_in_month - day_of_month
    }
```

**Budget Alert System**:
```python
class BudgetAlertSystem:
    async def check_all_budgets(self):
        """Check all project budgets and send alerts"""
        projects = await db.get_active_projects()

        for project in projects:
            status = await check_project_budget(project['id'])

            if status['status'] == 'over_budget':
                await self.send_alert({
                    'severity': 'error',
                    'project': project['name'],
                    'message': f"Budget exceeded! ${status['spending']:.2f} / ${status['budget']:.2f}",
                    'action': 'Consider pausing non-critical requests or increasing budget'
                })

            elif status['status'] == 'warning':
                await self.send_alert({
                    'severity': 'warning',
                    'project': project['name'],
                    'message': f"Budget at {status['percentage']:.1f}% (${status['spending']:.2f} / ${status['budget']:.2f})",
                    'projected': f"Projected month-end: ${status['projected']:.2f}",
                    'action': 'Monitor usage closely'
                })

    async def send_alert(self, alert: dict):
        """Send alert via WebSocket to dashboard"""
        # Real-time notification in dashboard
        await websocket_broadcast({
            'type': 'budget_alert',
            'severity': alert['severity'],
            'data': alert
        })

        # Could also: email, Slack, webhook, etc.
```

**Budget Enforcement** (optional):
```python
@app.middleware("http")
async def budget_enforcement(request: Request, call_next):
    """Block requests if budget exceeded"""

    if request.url.path not in ['/v1/chat/completions', '/chat/completions']:
        return await call_next(request)

    # Get project from headers
    project_name = request.headers.get('X-Apantli-Project', 'default')
    project = await db.get_project_by_name(project_name)

    if not project:
        return await call_next(request)

    # Check budget
    status = await check_project_budget(project['id'])

    if status['status'] == 'over_budget':
        # Block request
        return JSONResponse({
            'error': {
                'message': f"Project '{project_name}' has exceeded its monthly budget (${status['spending']:.2f} / ${status['budget']:.2f})",
                'type': 'budget_exceeded',
                'code': 'over_budget',
                'details': {
                    'project': project_name,
                    'budget': status['budget'],
                    'spending': status['spending'],
                    'percentage': status['percentage']
                }
            }
        }, status_code=429)

    # Allow request
    return await call_next(request)
```

### Analytics & Reporting

**Project Comparison**:
```sql
-- Compare projects this month
SELECT
  p.name as project,
  COUNT(r.id) as requests,
  SUM(r.cost) as cost,
  AVG(r.cost) as avg_cost_per_request,
  SUM(r.total_tokens) as total_tokens,
  COUNT(DISTINCT r.client_identifier) as tools_used
FROM requests r
JOIN projects p ON r.project_id = p.id
WHERE strftime('%Y-%m', r.timestamp) = strftime('%Y-%m', 'now')
  AND r.error IS NULL
GROUP BY p.id
ORDER BY cost DESC;
```

**Tool Usage by Project**:
```sql
-- Which tools are used in which projects?
SELECT
  p.name as project,
  r.client_identifier as tool,
  COUNT(*) as requests,
  SUM(r.cost) as cost,
  AVG(r.duration_ms) as avg_latency_ms
FROM requests r
JOIN projects p ON r.project_id = p.id
WHERE DATE(r.timestamp) = DATE('now')
  AND r.client_identifier IS NOT NULL
GROUP BY p.id, r.client_identifier
ORDER BY p.name, requests DESC;
```

**Project Cost Trends**:
```sql
-- Daily costs per project (last 30 days)
SELECT
  p.name as project,
  DATE(r.timestamp) as date,
  COUNT(*) as requests,
  SUM(r.cost) as daily_cost
FROM requests r
JOIN projects p ON r.project_id = p.id
WHERE r.timestamp >= datetime('now', '-30 days')
  AND r.error IS NULL
GROUP BY p.id, DATE(r.timestamp)
ORDER BY date DESC, daily_cost DESC;
```

**Project Efficiency Metrics**:
```sql
-- Which projects get the most value per dollar?
SELECT
  p.name as project,
  COUNT(*) as requests,
  SUM(r.cost) as total_cost,
  SUM(r.completion_tokens) as output_tokens,
  CAST(SUM(r.completion_tokens) AS REAL) / SUM(r.cost) as tokens_per_dollar,
  AVG(r.duration_ms) / 1000.0 as avg_latency_sec
FROM requests r
JOIN projects p ON r.project_id = p.id
WHERE strftime('%Y-%m', r.timestamp) = strftime('%Y-%m', 'now')
  AND r.error IS NULL
  AND r.cost > 0
GROUP BY p.id
ORDER BY tokens_per_dollar DESC;
```

### Billing & Export

**Client Invoicing** (for billable projects):
```python
async def generate_invoice(project_id: int, month: str) -> dict:
    """Generate invoice for billable project"""

    project = await db.get_project(project_id)
    metadata = await db.get_project_metadata(project_id)

    # Check if billable
    if metadata.get('billable') != 'true':
        return {'error': 'Project is not billable'}

    # Get billing rate (markup)
    billing_rate = float(metadata.get('billing_rate', '1.0'))

    # Get usage for month
    usage = await db.query("""
        SELECT
            DATE(timestamp) as date,
            client_identifier as tool,
            model,
            COUNT(*) as requests,
            SUM(cost) as provider_cost,
            SUM(total_tokens) as tokens
        FROM requests
        WHERE project_id = ?
          AND strftime('%Y-%m', timestamp) = ?
          AND error IS NULL
        GROUP BY DATE(timestamp), client_identifier, model
        ORDER BY date DESC
    """, [project_id, month])

    # Calculate totals
    total_provider_cost = sum(row['provider_cost'] for row in usage)
    total_billable = total_provider_cost * billing_rate
    markup_amount = total_billable - total_provider_cost

    return {
        'project': project['display_name'],
        'client': metadata.get('client_name', 'Unknown'),
        'month': month,
        'line_items': usage,
        'summary': {
            'total_requests': sum(row['requests'] for row in usage),
            'total_tokens': sum(row['tokens'] for row in usage),
            'provider_cost': total_provider_cost,
            'markup_rate': billing_rate,
            'markup_amount': markup_amount,
            'total_billable': total_billable
        }
    }

# Example output:
{
  'project': 'ClientA Web Application',
  'client': 'ClientA Inc.',
  'month': '2025-11',
  'line_items': [
    {'date': '2025-11-22', 'tool': 'cursor', 'model': 'gpt-4.1-mini',
     'requests': 45, 'provider_cost': 1.23, 'tokens': 123456},
    # ...
  ],
  'summary': {
    'total_requests': 1234,
    'total_tokens': 2345678,
    'provider_cost': 42.45,
    'markup_rate': 1.2,
    'markup_amount': 8.49,
    'total_billable': 50.94  # Bill client $50.94
  }
}
```

**CSV Export**:
```python
async def export_project_usage_csv(project_id: int, start_date: str, end_date: str) -> str:
    """Export project usage to CSV"""

    import csv
    import io

    # Get detailed usage
    requests = await db.query("""
        SELECT
            timestamp,
            client_identifier,
            model,
            prompt_tokens,
            completion_tokens,
            total_tokens,
            cost,
            duration_ms,
            SUBSTR(json_extract(request_data, '$.messages[0].content'), 1, 100) as prompt_preview
        FROM requests
        WHERE project_id = ?
          AND DATE(timestamp) BETWEEN ? AND ?
          AND error IS NULL
        ORDER BY timestamp DESC
    """, [project_id, start_date, end_date])

    # Write CSV
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=[
        'timestamp', 'tool', 'model', 'prompt_tokens', 'completion_tokens',
        'total_tokens', 'cost', 'duration_ms', 'prompt_preview'
    ])
    writer.writeheader()

    for req in requests:
        writer.writerow({
            'timestamp': req['timestamp'],
            'tool': req['client_identifier'] or 'unknown',
            'model': req['model'],
            'prompt_tokens': req['prompt_tokens'],
            'completion_tokens': req['completion_tokens'],
            'total_tokens': req['total_tokens'],
            'cost': f"${req['cost']:.4f}",
            'duration_ms': req['duration_ms'],
            'prompt_preview': req['prompt_preview']
        })

    return output.getvalue()

# Download via endpoint
@app.get("/api/projects/{project_id}/export")
async def export_project(project_id: int, start_date: str, end_date: str):
    csv_data = await export_project_usage_csv(project_id, start_date, end_date)

    return Response(
        content=csv_data,
        media_type='text/csv',
        headers={
            'Content-Disposition': f'attachment; filename="project_{project_id}_{start_date}_{end_date}.csv"'
        }
    )
```

## Implementation Priority

**Phase 1: Core Infrastructure** (Week 1)
- Database schema (projects, metadata)
- Auto-detection logic (git, workspace, file)
- Project resolution in request handling
- Basic CRUD endpoints

**Phase 2: UI & Visualization** (Week 2)
- Projects tab in dashboard
- Project creation/editing form
- Usage overview and charts
- Budget tracking display

**Phase 3: Budget & Alerts** (Week 3)
- Budget monitoring system
- Real-time alerts (WebSocket)
- Budget enforcement (optional)
- Email/webhook notifications

**Phase 4: Billing & Export** (Week 4)
- Invoice generation
- CSV/PDF export
- Client portal (optional)
- Automated monthly reports

## Success Metrics

**Adoption**:
- 80%+ of requests attributed to projects (not "default")
- 50%+ of users create ≥2 projects
- 30%+ of users set budgets

**Value**:
- Users can answer: "What did ClientA cost me last month?"
- Users can answer: "Which tool am I spending the most on?"
- Users can answer: "Am I on track to stay under budget?"

**Accuracy**:
- Auto-detection works 90%+ of the time
- Manual overrides available for edge cases
- No requests lost due to project resolution failures

