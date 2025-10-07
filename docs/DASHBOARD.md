# Dashboard

Complete guide to Apantli's web dashboard - how it works, what it displays, and how to customize it.

## Overview

The dashboard is a single-page web application built with minimal dependencies:

- **Backend**: FastAPI serves a single HTML file via Jinja2 templating
- **Frontend**: Vanilla JavaScript with Alpine.js for reactivity
- **Styling**: Custom CSS with dark/light theme support
- **Data**: Real-time stats fetched from SQLite via REST APIs

The entire dashboard is self-contained in `templates/dashboard.html` (~2600 lines) with two small Alpine.js libraries served from `apantli/static/`.

## What is Jinja2?

Jinja2 is a Python templating engine that lets you generate HTML dynamically. Think of it like mail merge for web pages.

### How Jinja2 Works (Simplified)

In traditional web development:

1. Server has data (like a user's name)
2. Server renders HTML with that data embedded
3. Browser receives complete HTML

For Apantli's dashboard, Jinja2 is used minimally:

```python
# In server.py (line 679-682)
@app.get("/")
async def dashboard(request: Request):
    """Simple HTML dashboard."""
    return templates.TemplateResponse("dashboard.html", {"request": request})
```

This means:
- Jinja2 loads `templates/dashboard.html`
- Passes a `request` object to the template (required by Jinja2 but not used)
- Returns pure HTML to the browser

**Important**: Unlike typical Jinja2 usage, Apantli's dashboard doesn't use any Jinja2 template variables, loops, or conditionals. The HTML is static. All dynamic behavior happens in the browser via JavaScript and Alpine.js.

### Why Use Jinja2 at All?

FastAPI requires a templating engine to serve HTML files. Jinja2 is the standard choice. We could serve a static file instead, but Jinja2:

- Integrates cleanly with FastAPI
- Allows future server-side rendering if needed
- Is a standard Python web development pattern

## Dashboard Architecture

### File Structure

```
apantli/
├── server.py                    # Serves dashboard at GET /
├── templates/
│   └── dashboard.html          # Complete single-page app
└── apantli/static/
    ├── alpine.min.js           # Alpine.js framework (45KB)
    └── alpine-persist.min.js   # Persistence plugin (1KB)
```

### Technology Stack

| Layer | Technology | Purpose |
|:------|:-----------|:--------|
| **Backend** | FastAPI + Jinja2 | Serve HTML and API endpoints |
| **Frontend Framework** | Alpine.js | Reactive state management |
| **State Persistence** | Alpine Persist | Save user preferences to localStorage |
| **Styling** | Custom CSS | Theme system, responsive design |
| **Data Fetching** | Fetch API | Async HTTP requests to API endpoints |
| **Charting** | SVG + JavaScript | Custom line charts for trends |

### What is Alpine.js?

Alpine.js is a lightweight JavaScript framework (think "jQuery for reactivity"). It adds interactive behavior directly in HTML using special attributes.

**Key Alpine.js Concepts:**

1. **`x-data`**: Defines reactive state
2. **`x-show`**: Shows/hides elements based on state
3. **`x-model`**: Two-way data binding with inputs
4. **`@click`**: Event handlers
5. **`:class`**: Dynamic CSS classes
6. **`$persist`**: Saves state to browser's localStorage

**Example from the dashboard (line 1030-1046):**

```html
<body x-data="{
    currentTab: $persist('stats'),
    theme: $persist('light'),

    toggleTheme() {
        this.theme = this.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.theme);
    }
}">
```

This means:
- `currentTab` starts at 'stats' and persists across page reloads
- `theme` starts at 'light' and persists across page reloads
- `toggleTheme()` is a method available throughout the page
- All state is reactive - when it changes, the UI updates automatically

### Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Alpine.js State (x-data)                                  │  │
│  │  ┌─────────────────────────────────────────────────────┐   │  │
│  │  │ currentTab: 'stats'                                 │   │  │
│  │  │ theme: 'dark'                                       │   │  │
│  │  │ statsFilter: { startDate: '', endDate: '' }        │   │  │
│  │  │ requestsFilter: { startDate: '', endDate: '' }     │   │  │
│  │  └────────────┬────────────────────────────────────────┘   │  │
│  └───────────────┼─────────────────────────────────────────────┘  │
│                  │                                                │
│                  │ Triggers JavaScript Functions                  │
│                  ↓                                                │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  JavaScript Functions                                      │  │
│  │  - refreshStats()      ← called on statsFilter change     │  │
│  │  - loadRequests()      ← called on requestsFilter change  │  │
│  │  - loadCalendar()      ← called when switching to calendar│  │
│  │  - loadModels()        ← called when switching to models  │  │
│  └────────────┬───────────────────────────────────────────────┘  │
│               │                                                   │
│               │ fetch(url)                                        │
│               ↓                                                   │
└──────────────────────────────────────────────────────────────────┘
                 │
                 │ HTTP GET
                 ↓
┌──────────────────────────────────────────────────────────────────┐
│                    FastAPI Server (server.py)                    │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  API Endpoints                                             │  │
│  │  GET /stats           → Usage statistics                   │  │
│  │  GET /stats/daily     → Daily aggregated data              │  │
│  │  GET /models          → Available models                   │  │
│  │  GET /requests        → Recent request history             │  │
│  │  GET /stats/date-range → Database date range               │  │
│  └────────────┬───────────────────────────────────────────────┘  │
│               │                                                   │
│               │ SQL Query                                         │
│               ↓                                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  requests.db (SQLite)                                      │  │
│  └────────────┬───────────────────────────────────────────────┘  │
│               │                                                   │
│               │ JSON Response                                     │
└───────────────┼───────────────────────────────────────────────────┘
                │
                ↓
┌──────────────────────────────────────────────────────────────────┐
│                         Browser                                  │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  JavaScript renders data into HTML                         │  │
│  │  - Update tables                                           │  │
│  │  - Draw charts                                             │  │
│  │  - Calculate metrics                                       │  │
│  │  - Update UI elements                                      │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

## Dashboard Features

### Four Main Tabs

The dashboard has four tabs controlled by Alpine.js state (line 1160-1164):

```html
<nav>
    <a href="#" :class="{ 'active': currentTab === 'stats' }"
       @click.prevent="currentTab = 'stats'">Stats</a>
    <a href="#" :class="{ 'active': currentTab === 'calendar' }"
       @click.prevent="currentTab = 'calendar'">Calendar</a>
    <a href="#" :class="{ 'active': currentTab === 'models' }"
       @click.prevent="currentTab = 'models'">Models</a>
    <a href="#" :class="{ 'active': currentTab === 'requests' }"
       @click.prevent="currentTab = 'requests'">Requests</a>
</nav>
```

Each tab is shown/hidden using `x-show`:

```html
<div id="stats-tab" x-show="currentTab === 'stats'">...</div>
<div id="calendar-tab" x-show="currentTab === 'calendar'">...</div>
<div id="models-tab" x-show="currentTab === 'models'">...</div>
<div id="requests-tab" x-show="currentTab === 'requests'">...</div>
```

### 1. Stats Tab

**Purpose**: Real-time usage statistics with filtering

**Data Sources**:

- `GET /stats?start_date=X&end_date=Y&timezone_offset=Z` - aggregated stats
- `GET /stats/daily?start_date=X&end_date=Y&timezone_offset=Z` - trend chart data

**Key Features**:

- **Quick Filters**: Buttons for All Time, Today, Yesterday, This Week, This Month, Last 30 Days
- **Custom Date Range**: Date pickers for precise filtering
- **Metrics Displayed**:
  - Total requests
  - Total cost ($)
  - Total tokens (prompt + completion)
  - Average duration (ms)
- **Breakdowns**:
  - By provider (OpenAI, Anthropic, etc.)
  - By model (gpt-4.1-mini, claude-haiku-3.5, etc.)
  - Provider cost trends (SVG line chart)
  - Model efficiency (cost per token comparisons)
- **Auto-refresh**: Every 5 seconds (line 2624)

**How It Works**:

1. User clicks filter button or changes date inputs
2. Alpine.js `$watch` detects `statsFilter` change (line 1145)
3. Calls `refreshStats()` function (line 2196)
4. Fetches data: `fetch('/stats' + query)`
5. Parses JSON response
6. Updates DOM with `innerHTML` injections

**Example Flow**:

```javascript
// Line 1145: Watch for filter changes
$watch('statsFilter', value => refreshStats(), { deep: true });

// Line 2196: Fetch and render
async function refreshStats() {
    const query = alpineData.buildQuery(alpineData.statsFilter);
    const statsRes = await fetch(`/stats${query}`);
    const data = await statsRes.json();

    // Update totals
    document.getElementById('totals').innerHTML = `
        <div class="metric">
            <div class="metric-value">${data.totals.requests}</div>
            <div class="metric-label">REQUESTS</div>
        </div>
        ...
    `;
}
```

### 2. Calendar Tab

**Purpose**: Visual month-by-month cost heatmap

**Data Source**: `GET /stats/daily?start_date=X&end_date=Y&timezone_offset=Z`

**Key Features**:

- **Month Navigation**: Previous/next buttons to change months
- **Cost Heatmap**: Days colored by cost (darker = more expensive)
- **Day Details**: Click any day to see provider breakdown
- **Timezone Support**: Converts UTC data to local timezone for display

**How It Works**:

1. User switches to calendar tab
2. `onTabChange('calendar')` fires (line 2609)
3. Calls `loadCalendar()` (line 2494)
4. Fetches month's daily data
5. Calls `renderCalendar()` (line 2518) to build grid
6. Uses `getCostColor()` to calculate heatmap colors (line 2466)

**Calendar Grid Structure**:

```
┌─────────────────────────────────────────────────────┐
│  Sun   Mon   Tue   Wed   Thu   Fri   Sat           │
├─────────────────────────────────────────────────────┤
│       │      │      │   1  │   2  │   3  │   4     │  ← Empty cells for
│       │      │      │ $0.02│ $0.15│ $0.08│ $0.05   │    week alignment
│       │      │      │ 3 req│ 12req│ 5 req│ 2 req   │
├───────┼──────┼──────┼──────┼──────┼──────┼─────────┤
│   5   │   6  │  ... │  ... │  ... │  ... │  ...    │
│ $0.03 │ $0.12│      │      │      │      │         │
│ 4 req │ 9 req│      │      │      │      │         │
└─────────────────────────────────────────────────────┘
```

Each day cell shows:

- Day number
- Total cost
- Request count
- Background color (cost heatmap)

**Color Calculation (Line 2466)**:

```javascript
function getCostColor(cost, maxCost) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    if (cost === 0) {
        return isDark ? '#2a2a2a' : '#f0f0f0';  // Gray for no activity
    }

    const ratio = Math.min(cost / (maxCost || 1), 1);

    if (isDark) {
        // Dark mode: darker blues with less saturation
        const lightness = 25 + (ratio * 25); // 25% to 50%
        const saturation = 60 + (ratio * 20); // 60% to 80%
        return `hsl(210, ${saturation}%, ${lightness}%)`;
    } else {
        // Light mode: lighter blues
        const lightness = 100 - (ratio * 50); // 100% to 50%
        return `hsl(210, 100%, ${lightness}%)`;
    }
}
```

This creates a gradient from light (cheap) to dark (expensive) within each theme.

### 3. Models Tab

**Purpose**: List all configured models with pricing

**Data Source**: `GET /models`

**Key Features**:

- **Model Listing**: All models from `config.yaml`
- **Pricing Info**: Input/output cost per million tokens (from LiteLLM's cost database)
- **Provider**: Which API the model uses
- **LiteLLM Model**: Internal routing name (e.g., `openai/gpt-4.1-mini`)
- **Sortable Columns**: Click headers to sort

**How It Works**:

1. User switches to models tab
2. `onTabChange('models')` fires (line 2613)
3. Calls `loadModels()` (line 1582)
4. Fetches: `fetch('/models')`
5. Converts to sortable array format
6. Renders table with `renderModelsTable()` (line 1604)

**Example Response from `/models`**:

```json
{
  "models": [
    {
      "name": "gpt-4.1-mini",
      "litellm_model": "openai/gpt-4.1-mini",
      "provider": "openai",
      "input_cost_per_million": 0.15,
      "output_cost_per_million": 0.60
    },
    {
      "name": "claude-haiku-3.5",
      "litellm_model": "anthropic/claude-3-5-haiku-20241022",
      "provider": "anthropic",
      "input_cost_per_million": 1.00,
      "output_cost_per_million": 5.00
    }
  ]
}
```

### 4. Requests Tab

**Purpose**: Detailed request history with filtering

**Data Source**: `GET /requests?start_date=X&end_date=Y&timezone_offset=Z`

**Key Features**:

- **Date Filtering**: Same quick filters as Stats tab
- **Search**: Filter by content in request/response
- **Model Filter**: Dropdown to filter by model
- **Provider Filter**: Dropdown to filter by provider
- **Cost Range**: Filter by min/max cost
- **Expandable Rows**: Click to see full request/response JSON
- **Conversation View**: Toggle between JSON and chat message format
- **Copy to Clipboard**: Copy individual messages

**How It Works**:

1. User switches to requests tab
2. `onTabChange('requests')` fires (line 2616)
3. Calls `loadRequests()` (line 1701)
4. Fetches: `fetch('/requests' + query)`
5. Populates filter dropdowns
6. Applies client-side filters
7. Renders table with expandable detail rows

**Request Detail View (Line 1900)**:

When you click a request row, it expands to show:

- **Detail Header**: Timestamp, model, provider
- **Stats Grid**: Tokens, cost, duration
- **Toggle Buttons**: Switch between JSON and Conversation view
- **JSON View**: Syntax-highlighted, collapsible tree
- **Conversation View**: Chat-style message bubbles with copy buttons

**Client-Side Filtering**:

Unlike Stats tab (server-side filtering), Requests tab filters in the browser:

```javascript
// Line 1777-1833: Filter logic
function getFilteredRequests() {
    return requestsData.filter(row => {
        // Search filter
        if (searchText) {
            const requestObj = requestsObjects.find(r => r.timestamp === row[5]);
            const content = JSON.stringify(requestObj).toLowerCase();
            if (!content.includes(searchText)) return false;
        }

        // Model filter
        if (modelFilter && row[1] !== modelFilter) return false;

        // Provider filter
        if (providerFilter) {
            const requestObj = requestsObjects.find(r => r.timestamp === row[5]);
            if (requestObj.provider !== providerFilter) return false;
        }

        // Cost range filter
        if (minCost && row[3] < parseFloat(minCost)) return false;
        if (maxCost && row[3] > parseFloat(maxCost)) return false;

        return true;
    });
}
```

## Theme System

The dashboard supports light and dark modes with full color consistency.

### How Themes Work

1. **CSS Variables** (Line 8-57): Define all colors as CSS custom properties

```css
:root {
    /* Light mode (default) */
    --color-text: #262626;
    --color-background: #ffffff;
    --color-border: #d9d9d9;
    ...
}

[data-theme="dark"] {
    /* Dark mode overrides */
    --color-text: #e8e8e8;
    --color-background: #1a1a1a;
    --color-border: #404040;
    ...
}
```

2. **Alpine.js State** (Line 1032): Track current theme

```javascript
theme: $persist('light')
```

3. **Toggle Function** (Line 1043-1046): Switch themes

```javascript
toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.theme);
}
```

4. **Persistence**: Theme saved to localStorage via Alpine Persist plugin

5. **All Components Use Variables**: Every CSS rule references variables

```css
body {
    background-color: var(--color-background);
    color: var(--color-text);
}

th {
    background: var(--color-background-tertiary);
    border-bottom: 1px solid var(--color-border);
}
```

When theme changes:

1. `toggleTheme()` updates `data-theme` attribute on `<html>`
2. CSS automatically switches from `:root` to `[data-theme="dark"]` variables
3. All colors transition smoothly (line 60: `transition: background-color 0.2s ease, color 0.2s ease, border-color 0.2s ease`)

## State Management

Alpine.js manages all UI state in the `x-data` object (line 1030-1134):

```javascript
{
    // Persisted state (saved to localStorage)
    currentTab: $persist('stats'),
    theme: $persist('light'),
    statsFilter: $persist({ startDate: '', endDate: '' }),
    requestsFilter: $persist({ startDate: '', endDate: '' }),

    // Non-persisted state
    dbDateRange: { startDate: null, endDate: null },

    // Methods
    toggleTheme() { ... },
    formatDate(date) { ... },
    setQuickFilter(filter, range) { ... },
    isQuickActive(filter, range) { ... },
    buildQuery(filter) { ... }
}
```

### Watchers (Line 1135-1147)

Alpine.js watches for state changes and triggers actions:

```javascript
x-init="
    // On page load
    document.documentElement.setAttribute('data-theme', theme);

    // Watch for tab changes
    $watch('currentTab', value => onTabChange(value));

    // Watch for theme changes
    $watch('theme', value => {
        if (currentTab === 'calendar') loadCalendar();
    });

    // Watch for filter changes (deep: true = watch nested properties)
    $watch('statsFilter', value => refreshStats(), { deep: true });
    $watch('requestsFilter', value => loadRequests(), { deep: true });
"
```

This means:

- Changing `currentTab` → calls `onTabChange()` → loads appropriate data
- Changing `statsFilter.startDate` → calls `refreshStats()` → fetches new stats
- Changing `theme` → reloads calendar with new colors

### Global JavaScript State (Lines 1568-1580)

Some state lives outside Alpine for performance:

```javascript
let alpineData = null;  // Reference to Alpine state
let tableSortState = {};  // Sort direction for each table
let modelsData = [];  // Raw models data
let requestsData = [];  // Raw requests data (sortable array format)
let requestsObjects = [];  // Full request objects with all fields
let expandedRows = {};  // Which request rows are expanded
let viewModes = {};  // JSON vs conversation view per request
```

Why separate?

- Large datasets (requests, models) don't need reactivity
- Table sorting needs mutable state not tied to Alpine
- Expanded rows are transient UI state

## Auto-Refresh

The Stats tab auto-refreshes every 5 seconds (line 2624-2628):

```javascript
// Auto-refresh stats every 5 seconds when on stats tab
setInterval(() => {
    if (alpineData && alpineData.currentTab === 'stats') {
        refreshStats();
    }
}, 5000);
```

This only refreshes when:

1. Alpine.js is initialized (`alpineData` exists)
2. User is viewing the Stats tab

Other tabs don't auto-refresh - they reload when you switch to them.

## Timezone Handling

The dashboard handles timezones to show local dates while storing UTC in the database.

### How It Works

1. **Browser Timezone Detection** (Line 1127):

```javascript
const timezoneOffset = -new Date().getTimezoneOffset();
// Example: PST = -480 minutes (8 hours west of UTC)
```

2. **Send to Server**: Include `timezone_offset` in every API call

```javascript
let query = `?timezone_offset=${timezoneOffset}`;
if (filter.startDate && filter.endDate) {
    query += `&start_date=${filter.startDate}&end_date=${filter.endDate}`;
}
```

3. **Server Converts** (server.py line 61-78): Convert local dates to UTC ranges

```python
def convert_local_date_to_utc_range(date_str: str, timezone_offset_minutes: int):
    """Convert a local date string to UTC timestamp range."""
    local_date = datetime.fromisoformat(date_str)
    utc_start = local_date - timedelta(minutes=timezone_offset_minutes)
    utc_end = utc_start + timedelta(days=1)
    return utc_start.isoformat(), utc_end.isoformat()
```

4. **Database Queries**: Use efficient UTC timestamp comparisons

```sql
SELECT * FROM requests
WHERE timestamp >= '2025-10-06T07:00:00'  -- PST midnight as UTC
  AND timestamp < '2025-10-07T07:00:00'   -- PST midnight next day as UTC
```

5. **Display**: Convert UTC back to local time in browser

```javascript
new Date(row.timestamp + 'Z').toLocaleString()
// 'Z' suffix tells JavaScript it's UTC
// toLocaleString() converts to browser's timezone
```

**Why This Matters**:

- Database stores UTC for consistency
- Users see local dates/times
- Date filtering works correctly across timezones
- Calendar shows correct local dates

## Customization Guide

### Adding a New Tab

1. **Add nav link** (after line 1163):

```html
<a href="#" :class="{ 'active': currentTab === 'mytab' }"
   @click.prevent="currentTab = 'mytab'">My Tab</a>
```

2. **Add tab content** (after line 1240):

```html
<div id="mytab-tab" x-show="currentTab === 'mytab'">
    <h2>My Custom Tab</h2>
    <div id="mytab-content"></div>
</div>
```

3. **Add load function** (after line 2600):

```javascript
async function loadMyTab() {
    const res = await fetch('/my-custom-endpoint');
    const data = await res.json();
    document.getElementById('mytab-content').innerHTML = `
        <p>Data: ${JSON.stringify(data)}</p>
    `;
}
```

4. **Wire up tab change** (modify line 2609):

```javascript
function onTabChange(tab) {
    if (tab === 'stats') refreshStats();
    if (tab === 'calendar') loadCalendar();
    if (tab === 'models') loadModels();
    if (tab === 'requests') loadRequests();
    if (tab === 'mytab') loadMyTab();  // Add this
}
```

### Adding a New Color Theme

1. **Define colors** (after line 57):

```css
[data-theme="ocean"] {
    --color-text: #e0f2f1;
    --color-background: #004d40;
    --color-border: #00695c;
    /* ... other colors ... */
}
```

2. **Update theme toggle** (line 1043-1046):

```javascript
toggleTheme() {
    const themes = ['light', 'dark', 'ocean'];
    const current = themes.indexOf(this.theme);
    this.theme = themes[(current + 1) % themes.length];
    document.documentElement.setAttribute('data-theme', this.theme);
}
```

3. **Update button text** (line 1150-1153):

```html
<button class="theme-toggle" @click="toggleTheme()">
    <span x-show="theme === 'light'">Dark Mode</span>
    <span x-show="theme === 'dark'">Ocean Mode</span>
    <span x-show="theme === 'ocean'">Light Mode</span>
</button>
```

### Changing Auto-Refresh Interval

Line 2627: Change `5000` (milliseconds) to desired interval:

```javascript
setInterval(() => {
    if (alpineData && alpineData.currentTab === 'stats') {
        refreshStats();
    }
}, 10000);  // 10 seconds instead of 5
```

Or disable entirely by removing/commenting out the `setInterval` block.

### Adding Provider Colors

Provider colors are defined at line 14-18:

```css
--color-openai: #10a37f;
--color-anthropic: #d97757;
--color-google: #4285f4;
--color-default: #999999;
```

To add a new provider:

1. Add color variable:

```css
--color-mistral: #ff6b35;
```

2. Use in provider mapping (line 2304):

```javascript
function getProviderColor(provider) {
    const colors = {
        openai: 'var(--color-openai)',
        anthropic: 'var(--color-anthropic)',
        google: 'var(--color-google)',
        mistral: 'var(--color-mistral)'  // Add this
    };
    return colors[provider] || 'var(--color-default)';
}
```

### Modifying Date Filter Presets

Quick filters are defined in `setQuickFilter()` (line 1056-1108). To add "Last 7 Days":

1. **Add button** (after line 1174):

```html
<button class="filter-btn"
        :class="{ 'active': isQuickActive(statsFilter, 'last-7-days') }"
        @click="setQuickFilter(statsFilter, 'last-7-days')">
    Last 7 Days
</button>
```

2. **Add case** (in `setQuickFilter`, after line 1106):

```javascript
case 'last-7-days':
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    filter.startDate = this.formatDate(sevenDaysAgo);
    filter.endDate = this.formatDate(today);
    break;
```

3. **Handle in `isQuickActive`** (line 1111-1123): No change needed - it auto-detects

## Performance Notes

### Optimizations in Place

1. **Parallel Data Fetching** (line 2200-2204):

```javascript
// Fetch stats and chart data simultaneously
const [statsRes, _] = await Promise.all([
    fetch(`/stats${query}`),
    renderProviderTrends()
]);
```

2. **Indexed Database Queries** (server.py lines 103-116): SQLite indexes on timestamp, date+provider, and cost

3. **Efficient Timezone Queries** (server.py lines 369-379): Convert dates to UTC for indexed timestamp lookups instead of DATE() function

4. **Limit Result Sets**:
   - Requests tab: 50 most recent (line 401)
   - Errors: 10 most recent (line 513)

5. **Client-Side Sorting**: Sort data in browser, don't re-fetch from server

6. **Conditional Auto-Refresh** (line 2625): Only refresh active tab

### Performance Considerations

**Large Datasets**:

- 10K+ requests: Requests tab may slow down (client-side filtering)
- 1M+ requests: Database queries remain fast (indexed)
- Consider pagination for requests tab if needed

**Calendar Performance**:

- Loads one month at a time
- ~30 cells × calculations = minimal overhead
- SVG chart limited to 30 days (line 2333)

**Memory Usage**:

- Minimal - no frameworks, small libraries
- Alpine.js: 45KB
- Full dashboard HTML: 96KB
- No virtual DOM overhead

## Troubleshooting

### Dashboard Not Loading

**Problem**: Blank page or errors in browser console

**Check**:

1. Server running? `http://localhost:4000/health` should return `{"status":"ok"}`
2. Static files present? `ls apantli/static/` should show `alpine*.js`
3. Browser console errors? Open DevTools (F12) → Console tab

### No Data Showing

**Problem**: Dashboard loads but shows zeros or "No data"

**Check**:

1. Database has data? `sqlite3 requests.db "SELECT COUNT(*) FROM requests;"`
2. Date filters? Click "All Time" to clear filters
3. API endpoints responding? Check `/stats`, `/models`, `/requests` directly

### Theme Not Persisting

**Problem**: Theme resets to light mode on page reload

**Check**:

1. Browser localStorage enabled? Check DevTools → Application → Local Storage
2. Alpine Persist plugin loaded? View page source, look for `alpine-persist.min.js`
3. Private browsing? Some browsers block localStorage in private mode

### Auto-Refresh Not Working

**Problem**: Stats tab doesn't update automatically

**Check**:

1. Browser console errors? Auto-refresh silently fails on errors
2. Alpine initialized? `alpineData` should exist in console
3. On stats tab? Auto-refresh only works when `currentTab === 'stats'`

### Timezone Issues

**Problem**: Dates shown are off by several hours

**Explanation**: This is expected! Database stores UTC, browser converts to local.

**Verify**:

1. Check browser timezone: `new Date().getTimezoneOffset()` in console (negative = west of UTC)
2. Check a request timestamp in DB: `sqlite3 requests.db "SELECT timestamp FROM requests LIMIT 1;"`
3. Compare with dashboard display - should differ by timezone offset

### Chart Not Rendering

**Problem**: Provider trends chart is blank

**Check**:

1. Data available? Need at least 2 days of data for chart
2. Date range selected? Chart requires start/end dates
3. SVG errors? Inspect element, look for red error messages

## File Reference

Key sections in `templates/dashboard.html`:

| Lines | Content |
|:------|:--------|
| 1-1029 | CSS styles and theme definitions |
| 1030-1147 | Alpine.js state and initialization |
| 1148-1154 | Header and theme toggle |
| 1159-1164 | Navigation tabs |
| 1166-1203 | Stats tab HTML |
| 1205-1216 | Calendar tab HTML |
| 1218-1221 | Models tab HTML |
| 1223-1243 | Requests tab HTML |
| 1245-1567 | Utility functions (JSON rendering, sorting, etc.) |
| 1568-1581 | Global JavaScript state |
| 1582-1602 | Models loading and rendering |
| 1604-1699 | Models table rendering |
| 1701-1899 | Requests loading, filtering, and table rendering |
| 1900-2194 | Request detail row rendering (conversation view, JSON view) |
| 2196-2459 | Stats loading and rendering |
| 2461-2607 | Calendar loading and rendering |
| 2609-2630 | Tab change handler and auto-refresh |

## API Dependencies

Dashboard relies on these server.py endpoints:

| Endpoint | Used By | Purpose |
|:---------|:--------|:--------|
| `GET /stats` | Stats tab | Overall statistics with filtering |
| `GET /stats/daily` | Stats tab, Calendar tab | Daily aggregated data for chart and heatmap |
| `GET /stats/date-range` | Stats tab, Requests tab | Get min/max dates for "All Time" filter |
| `GET /models` | Models tab | List configured models with pricing |
| `GET /requests` | Requests tab | Recent request history with filtering |
| `DELETE /errors` | Stats tab | Clear error records |

All endpoints support `?start_date=X&end_date=Y&timezone_offset=Z` query params except `/models` and `/errors`.

## Adding Server-Side Data

To surface new data in the dashboard:

1. **Add to database schema** (if needed):

```sql
ALTER TABLE requests ADD COLUMN new_field TEXT;
```

2. **Return in API response** (server.py):

```python
@app.get("/stats")
async def stats():
    # ... existing queries ...
    cursor.execute("SELECT new_field, COUNT(*) FROM requests GROUP BY new_field")
    by_new_field = cursor.fetchall()

    return {
        "totals": { ... },
        "by_new_field": [{"value": row[0], "count": row[1]} for row in by_new_field]
    }
```

3. **Render in dashboard** (dashboard.html):

```javascript
async function refreshStats() {
    const data = await (await fetch('/stats')).json();

    // Add new section
    document.getElementById('new-section').innerHTML = `
        <table>
            ${data.by_new_field.map(item => `
                <tr>
                    <td>${item.value}</td>
                    <td>${item.count}</td>
                </tr>
            `).join('')}
        </table>
    `;
}
```

4. **Add HTML placeholder** (in stats tab):

```html
<h2>By New Field</h2>
<div id="new-section"></div>
```

The dashboard will automatically fetch and display the new data when the Stats tab loads.
