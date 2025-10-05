# Apantli Dashboard Improvement Plan

## Executive Summary

This plan outlines incremental improvements to the Apantli dashboard to add date filtering, calendar views, provider breakdown, and enhanced analytics while maintaining the lightweight, embedded architecture.

**Current State:**
- Dashboard HTML served via Jinja2 template (`templates/dashboard.html`)
- Decoupled from server code for easier development with `--reload`
- Vanilla JavaScript, three tabs (Stats, Models, Requests)
- Simple time-based filtering (hours dropdown)
- Basic tables and metrics
- Auto-refresh every 5 seconds

**Target State:**
- Calendar view with daily cost visualization
- Flexible date range filtering (single day, week, month, custom range)
- Provider cost breakdown and comparison
- Enhanced request exploration by date
- Lightweight charting without heavy frameworks
- Improved visual design and information hierarchy

---

## Phase 1: Backend - Date Range API Enhancements

**Goal:** Add flexible date filtering to all API endpoints

### 1.1 New Query Parameters

Modify existing endpoints to accept date range parameters:

**Parameters:**
- `start_date` (ISO 8601 date: YYYY-MM-DD)
- `end_date` (ISO 8601 date: YYYY-MM-DD)
- `date` (single day shorthand)
- Keep existing `hours` parameter for backward compatibility

**Endpoints to modify:**
- `/stats` - Add date range filtering
- `/requests` - Add date range filtering

### 1.2 New Endpoint: Daily Summary

**Endpoint:** `GET /stats/daily`

**Parameters:**
- `start_date` (optional, defaults to 30 days ago)
- `end_date` (optional, defaults to today)

**Response:**
```json
{
  "daily": [
    {
      "date": "2025-10-04",
      "requests": 15,
      "cost": 0.0234,
      "total_tokens": 12450,
      "by_provider": [
        {"provider": "openai", "requests": 10, "cost": 0.0150},
        {"provider": "anthropic", "requests": 5, "cost": 0.0084}
      ]
    }
  ],
  "total_days": 30,
  "total_cost": 0.7020,
  "total_requests": 450
}
```

**SQL Query Pattern:**
```sql
SELECT
  DATE(timestamp) as date,
  COUNT(*) as requests,
  SUM(cost) as cost,
  SUM(total_tokens) as tokens,
  provider,
  COUNT(*) as provider_requests,
  SUM(cost) as provider_cost
FROM requests
WHERE error IS NULL
  AND DATE(timestamp) >= DATE(?)
  AND DATE(timestamp) <= DATE(?)
GROUP BY DATE(timestamp), provider
ORDER BY date DESC
```

### 1.3 Database Index Optimization

Add index on timestamp for faster date queries:

```sql
CREATE INDEX IF NOT EXISTS idx_timestamp ON requests(timestamp);
CREATE INDEX IF NOT EXISTS idx_date_provider ON requests(DATE(timestamp), provider);
```

**Implementation Details:**
- Add index creation to `init_db()` function
- Backward compatible (IF NOT EXISTS)
- Significant performance improvement for date-based queries

### 1.4 Timezone Handling

**Current:** Timestamps stored in UTC (ISO 8601)

**Enhancement:** Add timezone conversion in responses

- Add query parameter `?timezone=America/New_York` (optional)
- Convert UTC timestamps to local timezone in responses
- Frontend can pass browser timezone via `Intl.DateTimeFormat().resolvedOptions().timeZone`
- Default to UTC if not specified

**Python implementation:**
```python
from datetime import timezone
import pytz

def convert_to_timezone(utc_timestamp: str, tz_name: str = None):
    if not tz_name:
        return utc_timestamp
    dt = datetime.fromisoformat(utc_timestamp.replace('Z', '+00:00'))
    tz = pytz.timezone(tz_name)
    return dt.astimezone(tz).isoformat()
```

---

## Phase 2: Calendar View UI

**Goal:** Visual calendar showing daily spending patterns

### 2.1 Calendar Component Design

**Visual Design:**
- Month grid layout (7 columns, 5-6 rows)
- Each day cell shows:
  - Date number
  - Total cost (prominent)
  - Request count (smaller)
  - Color intensity based on cost (heatmap style)
- Navigation: Previous/Next month buttons
- Click day to filter requests/stats for that date

**Color Scale (Heatmap):**
```
$0.00:       #f0f0f0 (light gray - no activity)
$0.01-$0.10: #e6f7ff (very light blue)
$0.11-$0.50: #91d5ff (light blue)
$0.51-$1.00: #40a9ff (medium blue)
$1.01-$5.00: #1890ff (blue)
$5.01+:      #096dd9 (dark blue)
```

**Layout Wireframe:**
```
┌────────────────────────────────────────────┐
│  ← October 2025 →                          │
├────────────────────────────────────────────┤
│ Sun   Mon   Tue   Wed   Thu   Fri   Sat   │
├───────┬───────┬───────┬───────┬───────────┤
│       │       │   1   │   2   │   3   ...│
│       │       │$0.12  │$0.08  │$0.15      │
│       │       │ 5 req │ 3 req │ 7 req     │
├───────┼───────┼───────┼───────┼───────────┤
│   4   │   5   │   6   │  ...              │
│$0.23  │$0.19  │$0.31  │                   │
│ 12 req│ 8 req │ 15 req│                   │
└───────┴───────┴───────┴───────────────────┘

Selected: October 4, 2025
┌────────────────────────────────────────────┐
│ Total: $0.23 across 12 requests            │
│                                            │
│ By Provider:                               │
│ • OpenAI:     $0.15 (65%) - 8 requests    │
│ • Anthropic:  $0.08 (35%) - 4 requests    │
└────────────────────────────────────────────┘
```

### 2.2 Implementation Approach

**No heavy framework needed - vanilla JavaScript**

**HTML Structure:**
```html
<div id="calendar-view">
  <div class="calendar-header">
    <button id="prev-month">←</button>
    <h3 id="current-month">October 2025</h3>
    <button id="next-month">→</button>
  </div>
  <div class="calendar-grid">
    <div class="calendar-day-header">Sun</div>
    <!-- ... other headers ... -->
    <div class="calendar-day" data-date="2025-10-04" style="background: #91d5ff">
      <div class="day-number">4</div>
      <div class="day-cost">$0.23</div>
      <div class="day-requests">12 req</div>
    </div>
    <!-- ... other days ... -->
  </div>
  <div id="day-detail" style="display:none">
    <!-- Day breakdown -->
  </div>
</div>
```

**CSS (add to templates/dashboard.html style block):**
```css
.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin: 20px 0;
}

.calendar-day {
  aspect-ratio: 1;
  padding: 8px;
  border: 1px solid #e0e0e0;
  cursor: pointer;
  transition: transform 0.1s;
  text-align: center;
}

.calendar-day:hover {
  transform: scale(1.05);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}

.calendar-day.today {
  border: 2px solid #333;
}

.day-number {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 4px;
}

.day-cost {
  font-size: 12px;
  font-weight: bold;
  color: #1890ff;
}

.day-requests {
  font-size: 10px;
  color: #666;
}
```

### 2.3 JavaScript Implementation

**Key Functions:**
```javascript
// State
let currentMonth = new Date()
let selectedDate = null

// Fetch daily data from API
async function loadCalendarData(year, month) {
  const startDate = new Date(year, month, 1).toISOString().split('T')[0]
  const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]
  const res = await fetch(`/stats/daily?start_date=${startDate}&end_date=${endDate}`)
  return await res.json()
}

// Generate calendar grid
function renderCalendar(data) {
  // Calculate max cost for color scaling
  // Build grid with day cells
  // Apply heatmap colors
  // Add click handlers
}

// Color calculation
function getCostColor(cost, maxCost) {
  if (cost === 0) return '#f0f0f0'
  const ratio = cost / maxCost
  // Interpolate color based on ratio
  return `hsl(210, 100%, ${100 - ratio * 50}%)`
}

// Day click handler
function onDayClick(date) {
  selectedDate = date
  // Load detailed breakdown for that day
  loadDayDetail(date)
}
```

### 2.4 New Dashboard Tab

Add "Calendar" tab between "Stats" and "Models":

```html
<nav>
  <a href="#" onclick="showTab(event, 'stats')">Stats</a>
  <a href="#" onclick="showTab(event, 'calendar')">Calendar</a>
  <a href="#" onclick="showTab(event, 'models')">Models</a>
  <a href="#" onclick="showTab(event, 'requests')">Requests</a>
</nav>

<div id="calendar-tab" style="display:none">
  <div id="calendar-view"></div>
  <div id="day-detail"></div>
</div>
```

---

## Phase 3: Enhanced Provider Breakdown

**Goal:** Visual comparison of provider costs and usage patterns

### 3.1 Provider Overview Section

Add to Stats tab, above existing tables:

**Visual Design:**
```
┌────────────────────────────────────────────┐
│ Provider Cost Breakdown                    │
├────────────────────────────────────────────┤
│                                            │
│ OpenAI      ████████████████░░░░  72%     │
│             $5.23 across 150 requests      │
│                                            │
│ Anthropic   ███████░░░░░░░░░░░░░  28%     │
│             $2.01 across 45 requests       │
│                                            │
│ Total:      $7.24 (195 requests)           │
└────────────────────────────────────────────┘
```

**Implementation:**
```html
<div id="provider-overview">
  <h2>Provider Breakdown</h2>
  <div class="provider-bars">
    <!-- Generated for each provider -->
    <div class="provider-bar">
      <div class="provider-header">
        <span class="provider-name">OpenAI</span>
        <span class="provider-percentage">72%</span>
      </div>
      <div class="bar-container">
        <div class="bar-fill" style="width: 72%; background: #10a37f"></div>
      </div>
      <div class="provider-details">
        $5.23 across 150 requests
      </div>
    </div>
  </div>
</div>
```

**CSS:**
```css
.provider-bar {
  margin: 15px 0;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 5px;
  font-weight: bold;
}

.bar-container {
  height: 24px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  transition: width 0.3s ease;
}

.provider-details {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
}
```

**Provider Colors:**
- OpenAI: #10a37f (brand teal)
- Anthropic: #d97757 (brand orange)
- Google: #4285f4 (brand blue)
- Default: #999999 (gray)

### 3.2 Provider Comparison Over Time

Add line chart showing provider costs over time:

**Chart Library:** Chart.js (lightweight, 64KB minified)
- Alternative: uPlot (even lighter, 40KB)
- Alternative: Vanilla SVG (no dependencies)

**Recommendation: Vanilla SVG** for maximum lightness

**Visual Design:**
```
Cost Trend (Last 30 Days)

$2.00 ┤                                    ╭─ OpenAI
      │                                 ╭──╯
$1.50 ┤                              ╭──╯
      │                           ╭──╯
$1.00 ┤                        ╭──╯
      │         Anthropic   ╭──╯
$0.50 ┤              ╭──────╯
      │         ╭────╯
$0.00 ┼─────────╯
      └────────────────────────────────────
      Oct 1                         Oct 30
```

**Implementation (Vanilla SVG):**
```javascript
function renderProviderTrend(dailyData) {
  const width = 800
  const height = 300
  const margin = {top: 20, right: 80, bottom: 30, left: 50}

  // Group by provider
  const providers = {}
  dailyData.forEach(day => {
    day.by_provider.forEach(p => {
      if (!providers[p.provider]) providers[p.provider] = []
      providers[p.provider].push({date: day.date, cost: p.cost})
    })
  })

  // Generate SVG paths
  // Add legend
  // Add axes
}
```

---

## Phase 4: Date Range Filtering UI

**Goal:** Flexible date selection across all dashboard views

### 4.1 Date Range Selector Component

Replace time dropdown with enhanced date selector:

**Visual Design:**
```
┌────────────────────────────────────────────┐
│ Filter by Date:                            │
│                                            │
│ ○ Last Hour    ○ Last 24h   ○ Last Week   │
│ ○ Last Month   ○ All Time   ● Custom       │
│                                            │
│ From: [Oct 1, 2025 ▼]  To: [Oct 4, 2025 ▼]│
│                                            │
│ Quick: [Today] [Yesterday] [This Week]     │
│        [This Month] [Last 30 Days]         │
└────────────────────────────────────────────┘
```

**HTML Structure:**
```html
<div class="date-filter">
  <div class="filter-presets">
    <button onclick="setDateRange('hour')">Last Hour</button>
    <button onclick="setDateRange('24h')">Last 24h</button>
    <button onclick="setDateRange('week')">Last Week</button>
    <button onclick="setDateRange('month')">Last Month</button>
    <button onclick="setDateRange('all')">All Time</button>
  </div>

  <div class="filter-custom">
    <input type="date" id="start-date" onchange="applyCustomRange()">
    <span>to</span>
    <input type="date" id="end-date" onchange="applyCustomRange()">
  </div>

  <div class="filter-quick">
    <button onclick="setQuickRange('today')">Today</button>
    <button onclick="setQuickRange('yesterday')">Yesterday</button>
    <button onclick="setQuickRange('this-week')">This Week</button>
    <button onclick="setQuickRange('this-month')">This Month</button>
  </div>
</div>
```

**CSS:**
```css
.date-filter {
  background: #f9f9f9;
  padding: 15px;
  border-radius: 6px;
  margin: 20px 0;
}

.filter-presets,
.filter-quick {
  margin: 10px 0;
}

.filter-presets button,
.filter-quick button {
  margin: 4px;
  padding: 6px 12px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.filter-presets button:hover,
.filter-quick button:hover {
  background: #f0f0f0;
}

.filter-presets button.active {
  background: #333;
  color: white;
  border-color: #333;
}

.filter-custom {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0;
}

.filter-custom input[type="date"] {
  padding: 6px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
}
```

**JavaScript Implementation:**
```javascript
// Global filter state
let currentFilter = {
  type: 'all', // 'preset', 'custom', 'quick'
  startDate: null,
  endDate: null
}

function setDateRange(preset) {
  const now = new Date()
  currentFilter.type = 'preset'

  switch(preset) {
    case 'hour':
      currentFilter.hours = 1
      break
    case '24h':
      currentFilter.hours = 24
      break
    case 'week':
      currentFilter.hours = 168
      break
    case 'month':
      currentFilter.hours = 720
      break
    case 'all':
      currentFilter.hours = null
      break
  }

  currentFilter.startDate = null
  currentFilter.endDate = null
  applyFilter()
}

function setQuickRange(range) {
  const now = new Date()
  currentFilter.type = 'quick'

  switch(range) {
    case 'today':
      currentFilter.startDate = formatDate(now)
      currentFilter.endDate = formatDate(now)
      break
    case 'yesterday':
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      currentFilter.startDate = formatDate(yesterday)
      currentFilter.endDate = formatDate(yesterday)
      break
    case 'this-week':
      const weekStart = new Date(now)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      currentFilter.startDate = formatDate(weekStart)
      currentFilter.endDate = formatDate(now)
      break
    case 'this-month':
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      currentFilter.startDate = formatDate(monthStart)
      currentFilter.endDate = formatDate(now)
      break
  }

  applyFilter()
}

function applyCustomRange() {
  const start = document.getElementById('start-date').value
  const end = document.getElementById('end-date').value

  if (start && end) {
    currentFilter.type = 'custom'
    currentFilter.startDate = start
    currentFilter.endDate = end
    currentFilter.hours = null
    applyFilter()
  }
}

function applyFilter() {
  // Build query string based on currentFilter
  let query = ''

  if (currentFilter.hours) {
    query = `?hours=${currentFilter.hours}`
  } else if (currentFilter.startDate && currentFilter.endDate) {
    query = `?start_date=${currentFilter.startDate}&end_date=${currentFilter.endDate}`
  }

  // Reload all data with new filter
  refreshStatsWithFilter(query)
  refreshRequestsWithFilter(query)
}

function formatDate(date) {
  return date.toISOString().split('T')[0]
}
```

### 4.2 URL State Management

Persist filter state in URL for bookmarking and sharing:

```javascript
// Update URL when filter changes
function updateURLState() {
  const params = new URLSearchParams()

  if (currentFilter.startDate) params.set('start', currentFilter.startDate)
  if (currentFilter.endDate) params.set('end', currentFilter.endDate)
  if (currentFilter.hours) params.set('hours', currentFilter.hours)

  history.replaceState({}, '', `?${params.toString()}`)
}

// Restore filter from URL on page load
function loadFilterFromURL() {
  const params = new URLSearchParams(window.location.search)

  if (params.has('start') && params.has('end')) {
    currentFilter.startDate = params.get('start')
    currentFilter.endDate = params.get('end')
    document.getElementById('start-date').value = currentFilter.startDate
    document.getElementById('end-date').value = currentFilter.endDate
  } else if (params.has('hours')) {
    currentFilter.hours = parseInt(params.get('hours'))
  }

  applyFilter()
}

// Call on page load
document.addEventListener('DOMContentLoaded', loadFilterFromURL)
```

---

## Phase 5: Enhanced Requests Explorer

**Goal:** Better exploration and analysis of individual requests

### 5.1 Request Filtering and Search

Add search and filter controls above requests table:

**Visual Design:**
```
┌────────────────────────────────────────────┐
│ Search: [____________]  🔍                 │
│                                            │
│ Provider: [All ▼]  Model: [All ▼]         │
│                                            │
│ Cost Range: $[0.00] to $[10.00]           │
│                                            │
│ Sort by: [Time ▼] [Cost] [Tokens] [Duration]
└────────────────────────────────────────────┘
```

**Implementation:**
```javascript
let requestFilters = {
  search: '',
  provider: 'all',
  model: 'all',
  minCost: 0,
  maxCost: null,
  sortBy: 'timestamp',
  sortOrder: 'desc'
}

function filterRequests(requests) {
  return requests
    .filter(r => {
      // Search in model name or request content
      if (requestFilters.search) {
        const search = requestFilters.search.toLowerCase()
        const content = JSON.stringify(r.request_data).toLowerCase()
        if (!r.model.toLowerCase().includes(search) && !content.includes(search)) {
          return false
        }
      }

      // Provider filter
      if (requestFilters.provider !== 'all' && r.provider !== requestFilters.provider) {
        return false
      }

      // Model filter
      if (requestFilters.model !== 'all' && r.model !== requestFilters.model) {
        return false
      }

      // Cost range
      if (r.cost < requestFilters.minCost) return false
      if (requestFilters.maxCost && r.cost > requestFilters.maxCost) return false

      return true
    })
    .sort((a, b) => {
      const field = requestFilters.sortBy
      const order = requestFilters.sortOrder === 'asc' ? 1 : -1
      return (a[field] > b[field] ? 1 : -1) * order
    })
}
```

### 5.2 Request Statistics Summary

Show aggregate stats for filtered requests:

```html
<div class="request-summary">
  <div class="summary-metric">
    <span class="metric-value">45</span>
    <span class="metric-label">Requests</span>
  </div>
  <div class="summary-metric">
    <span class="metric-value">$1.23</span>
    <span class="metric-label">Total Cost</span>
  </div>
  <div class="summary-metric">
    <span class="metric-value">125K</span>
    <span class="metric-label">Tokens</span>
  </div>
  <div class="summary-metric">
    <span class="metric-value">$0.027</span>
    <span class="metric-label">Avg Cost</span>
  </div>
</div>
```

### 5.3 Enhanced Request Detail View

Improve the expandable request detail:

**Current:** JSON tree (good)

**Enhancements:**
- Message extraction (show just the conversation)
- Syntax highlighting for code in messages
- Copy buttons for messages
- Token count per message
- Cost breakdown (input vs output)

**Visual Design:**
```
┌────────────────────────────────────────────┐
│ Request Detail - Oct 4, 2025 3:45 PM      │
├────────────────────────────────────────────┤
│ Model: gpt-4.1-mini (OpenAI)               │
│ Tokens: 1,234 in / 567 out = 1,801 total  │
│ Cost: $0.0123 ($0.0074 in + $0.0049 out)  │
│ Duration: 1,234ms                          │
├────────────────────────────────────────────┤
│ Conversation:                              │
│                                            │
│ 👤 User:                           [Copy]  │
│ │ Write a function to calculate...        │
│ │                                          │
│ │ 245 tokens                               │
│                                            │
│ 🤖 Assistant:                      [Copy]  │
│ │ Here's a Python function that...        │
│ │ ```python                                │
│ │ def calculate(...):                      │
│ │     ...                                  │
│ │ ```                                      │
│ │                                          │
│ │ 567 tokens                               │
│                                            │
│ [View Raw JSON] [View Full Request]       │
└────────────────────────────────────────────┘
```

---

## Phase 6: Visual Polish and Accessibility

**Goal:** Improve visual design and ensure accessibility

### 6.1 Color Scheme Refinement

**Current:** Basic black/white with minimal color

**Enhanced Palette:**
```css
:root {
  /* Primary colors */
  --color-primary: #1890ff;
  --color-primary-dark: #096dd9;
  --color-primary-light: #40a9ff;

  /* Provider colors */
  --color-openai: #10a37f;
  --color-anthropic: #d97757;
  --color-google: #4285f4;
  --color-default: #999999;

  /* Semantic colors */
  --color-success: #52c41a;
  --color-warning: #faad14;
  --color-error: #f5222d;

  /* Neutrals */
  --color-text: #262626;
  --color-text-secondary: #8c8c8c;
  --color-border: #d9d9d9;
  --color-background: #ffffff;
  --color-background-secondary: #fafafa;

  /* Spacing */
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;

  /* Typography */
  --font-mono: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', monospace;
  --font-system: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
```

### 6.2 Responsive Design

Add mobile-friendly layout:

```css
/* Mobile breakpoint */
@media (max-width: 768px) {
  body {
    margin: 10px;
    padding: 0 10px;
  }

  .metric {
    display: block;
    margin: 10px 0;
  }

  table {
    font-size: 12px;
  }

  .calendar-grid {
    gap: 1px;
  }

  .calendar-day {
    padding: 4px;
  }

  .day-cost {
    font-size: 10px;
  }

  .filter-presets button {
    display: block;
    width: 100%;
    margin: 4px 0;
  }
}
```

### 6.3 Accessibility Improvements

**ARIA Labels:**
```html
<button
  aria-label="Previous month"
  onclick="navigateMonth(-1)">
  ←
</button>

<div
  class="calendar-day"
  role="button"
  tabindex="0"
  aria-label="October 4, 2025: 12 requests, $0.23 total cost"
  onclick="onDayClick('2025-10-04')"
  onkeypress="handleKeyPress(event, '2025-10-04')">
  ...
</div>
```

**Keyboard Navigation:**
```javascript
// Calendar navigation with arrow keys
function handleKeyPress(event, date) {
  if (event.key === 'Enter' || event.key === ' ') {
    onDayClick(date)
  }
}

// Tab navigation
document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' && e.shiftKey) {
    // Navigate tabs with Shift+Tab
  }
})
```

**Color Contrast:**
- Ensure all text meets WCAG AA contrast ratios (4.5:1)
- Test heatmap colors for readability
- Add patterns/textures in addition to colors for colorblind users

**Focus Indicators:**
```css
button:focus,
input:focus,
.calendar-day:focus {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Don't remove focus for keyboard users */
button:focus:not(:focus-visible) {
  outline: none;
}
```

### 6.4 Loading States and Error Handling

**Loading Indicators:**
```html
<div class="loading-spinner" style="display: none">
  <div class="spinner"></div>
  Loading...
</div>
```

```css
.spinner {
  border: 3px solid #f3f3f3;
  border-top: 3px solid var(--color-primary);
  border-radius: 50%;
  width: 24px;
  height: 24px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

**Error States:**
```javascript
async function fetchWithErrorHandling(url) {
  try {
    showLoading()
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    showError(`Failed to load data: ${err.message}`)
    return null
  } finally {
    hideLoading()
  }
}

function showError(message) {
  const errorDiv = document.getElementById('error-banner')
  errorDiv.textContent = message
  errorDiv.style.display = 'block'
  setTimeout(() => errorDiv.style.display = 'none', 5000)
}
```

---

## Phase 7: Advanced Analytics

**Goal:** Deeper insights into usage patterns

### 7.1 Cost Trends and Projections

**Monthly Projection:**
```
┌────────────────────────────────────────────┐
│ Current Month Projection                   │
├────────────────────────────────────────────┤
│ Days elapsed:        4 / 30                │
│ Actual spend:        $1.23                 │
│ Daily average:       $0.31                 │
│ Projected total:     $9.30                 │
│                                            │
│ ████░░░░░░░░░░░░░░░░░░░░░░  13% complete  │
└────────────────────────────────────────────┘
```

**Implementation:**
```javascript
function calculateProjection(dailyData) {
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const currentDay = now.getDate()

  const monthData = dailyData.filter(d => {
    const date = new Date(d.date)
    return date.getMonth() === now.getMonth()
  })

  const actualSpend = monthData.reduce((sum, d) => sum + d.cost, 0)
  const dailyAvg = actualSpend / currentDay
  const projected = dailyAvg * daysInMonth

  return {
    daysElapsed: currentDay,
    daysInMonth,
    actualSpend,
    dailyAvg,
    projected,
    percentComplete: (currentDay / daysInMonth) * 100
  }
}
```

### 7.2 Model Performance Comparison

**Average Cost per Request:**
```
┌────────────────────────────────────────────┐
│ Model Efficiency                           │
├────────────────────────────────────────────┤
│ Model             Avg Cost   Avg Tokens    │
├────────────────────────────────────────────┤
│ gpt-4.1-mini      $0.0023    1,234         │
│ claude-sonnet-4   $0.0156    2,345         │
│ gpt-4.1           $0.0890    1,456         │
│                                            │
│ Most economical:    gpt-4.1-mini           │
│ Most token-rich:    claude-sonnet-4        │
└────────────────────────────────────────────┘
```

### 7.3 Time-of-Day Analysis

**Heatmap by hour of day:**
```
Hour of Day Usage

24 │░░░░░░░░
22 │░░░░░░
20 │█░░░░░░░
18 │███░░░░░
16 │████░░░░
14 │████████
12 │███████░
10 │████░░░░
08 │██░░░░░░
06 │░░░░░░░░
04 │░░░░░░░░
02 │░░░░░░░░
00 │░░░░░░░░
   └────────
   Mon Tue Wed Thu Fri Sat Sun
```

**SQL Query:**
```sql
SELECT
  CAST(strftime('%H', timestamp) AS INTEGER) as hour,
  CAST(strftime('%w', timestamp) AS INTEGER) as day_of_week,
  COUNT(*) as requests,
  SUM(cost) as cost
FROM requests
WHERE error IS NULL
GROUP BY hour, day_of_week
ORDER BY hour, day_of_week
```

### 7.4 Cost Alerts and Budgets

**Budget Tracking:**
```html
<div class="budget-alert">
  <h3>Monthly Budget: $10.00</h3>
  <div class="budget-bar">
    <div class="budget-used" style="width: 67%">$6.70</div>
  </div>
  <p>$3.30 remaining (33%)</p>
  <p class="budget-status warning">⚠️ On track to exceed budget by $2.50</p>
</div>
```

**Implementation:**
- Store budget in localStorage
- Calculate projection vs budget
- Show warning when projected > budget
- Color-code status (green/yellow/red)

---

## Implementation Priority Matrix

### High Priority (Implement First)
1. **Phase 1: Backend Date APIs** - Foundation for all features
   - Daily summary endpoint
   - Date range parameters
   - Database indexes
2. **Phase 4.1: Date Range UI** - User-requested feature
   - Date pickers
   - Quick filters (Today, Yesterday, etc.)
3. **Phase 2: Calendar View** - User-requested feature
   - Monthly calendar grid
   - Daily cost heatmap
   - Click to filter

### Medium Priority (Implement Second)
4. **Phase 3: Provider Breakdown** - User-requested feature
   - Visual provider comparison bars
   - Provider filtering
5. **Phase 5.1-5.2: Request Filtering** - Enhanced usability
   - Search functionality
   - Provider/model filters
   - Summary statistics
6. **Phase 6.3: Accessibility** - Important for usability
   - ARIA labels
   - Keyboard navigation
   - Focus indicators

### Lower Priority (Nice to Have)
7. **Phase 3.2: Provider Trends** - Advanced analytics
8. **Phase 5.3: Enhanced Request Detail** - UX polish
9. **Phase 6.1-6.2: Visual Polish** - Aesthetics
10. **Phase 7: Advanced Analytics** - Power user features

---

## Technical Considerations

### Performance Optimization

**Database Query Performance:**
- Add indexes on frequently queried columns (timestamp, provider)
- Use date functions efficiently (DATE(timestamp) in WHERE clause)
- Limit result sets (LIMIT 50 for requests)
- Consider materialized views for daily aggregations if dataset grows large

**Frontend Performance:**
- Debounce search input (300ms)
- Virtual scrolling for large request lists (if > 1000 items)
- Lazy load calendar months (only fetch when navigating)
- Cache API responses with timestamp-based invalidation

**Bundle Size:**
- Keep vanilla JS approach (no framework = 0KB overhead)
- If chart library needed: uPlot (40KB) or vanilla SVG
- Minify HTML/CSS/JS in production (optional, via build step)

### Browser Compatibility

**Target:** Modern browsers (Chrome, Firefox, Safari, Edge - last 2 versions)

**Features to watch:**
- CSS Grid (supported everywhere)
- Fetch API (supported everywhere)
- Date input type (supported, with fallback)
- ES6+ features (use sparingly or transpile)

**Fallbacks:**
```javascript
// Date input fallback for older browsers
if (!supportsDateInput()) {
  // Replace with text input + manual validation
}

function supportsDateInput() {
  const input = document.createElement('input')
  input.type = 'date'
  return input.type === 'date'
}
```

### Testing Strategy

**Manual Testing Checklist:**
- [ ] Calendar navigation works
- [ ] Date filters apply correctly
- [ ] Provider breakdown calculates accurately
- [ ] Request search finds correct results
- [ ] Keyboard navigation works
- [ ] Mobile layout responsive
- [ ] All API endpoints return expected data
- [ ] Error states display properly
- [ ] Loading states show appropriately

**Automated Testing (Optional):**
- Backend: pytest for API endpoints
- Frontend: Playwright for UI testing
- SQL queries: Unit tests for aggregations

### Security Considerations

**Already Secure (Local Use):**
- No authentication needed (localhost only)
- API keys not exposed (stored in .env, never in responses)
- Request data logged locally (not transmitted)

**Additional Considerations:**
- Sanitize all user input (search queries, date inputs)
- Escape HTML in rendered content (already done with escapeHtml)
- CORS already configured (allow all for local use)
- SQL injection prevented (using parameterized queries)

---

## Migration Path

### Step-by-Step Implementation

**Week 1: Backend Foundation**
1. Add database indexes
2. Implement date range parameters in existing endpoints
3. Create `/stats/daily` endpoint
4. Test all new endpoints

**Week 2: Calendar View**
1. Add calendar tab to dashboard
2. Implement calendar grid rendering
3. Add heatmap colors
4. Connect to daily stats API
5. Add day click handler

**Week 3: Date Filtering**
1. Replace time dropdown with date filter component
2. Add quick filter buttons
3. Add date picker inputs
4. Wire up filter application
5. Add URL state management

**Week 4: Provider Breakdown**
1. Add provider visualization to stats tab
2. Implement provider filter
3. Add provider comparison bars
4. Test with multiple providers

**Week 5: Request Enhancements**
1. Add request search
2. Add filter controls
3. Add summary statistics
4. Improve detail view

**Week 6: Polish**
1. Accessibility audit and fixes
2. Visual design refinement
3. Mobile responsive testing
4. Performance optimization
5. Documentation updates

---

## API Endpoint Summary

### New Endpoints

**GET /stats/daily**
- Parameters: `start_date`, `end_date`, `timezone` (optional)
- Returns: Daily aggregated stats with provider breakdown
- Used by: Calendar view, trend charts

### Modified Endpoints

**GET /stats**
- New parameters: `start_date`, `end_date` (in addition to `hours`)
- Backward compatible: `hours` parameter still works
- Returns: Same structure, filtered by date range

**GET /requests**
- New parameters: `start_date`, `end_date` (in addition to `hours`)
- Backward compatible: `hours` parameter still works
- Returns: Same structure, filtered by date range

---

## Database Schema Changes

### New Indexes

```sql
CREATE INDEX IF NOT EXISTS idx_timestamp
ON requests(timestamp);

CREATE INDEX IF NOT EXISTS idx_date_provider
ON requests(DATE(timestamp), provider)
WHERE error IS NULL;

CREATE INDEX IF NOT EXISTS idx_cost
ON requests(cost)
WHERE error IS NULL;
```

**Impact:** Faster queries, minimal storage overhead (~5% increase)

**Migration:** Run during `init_db()`, no data migration needed

---

## File Size Estimates

**Current HTML:** ~12KB in templates/dashboard.html

**After All Phases:**
- HTML structure: ~8KB
- CSS: ~12KB
- JavaScript: ~25KB
- **Total: ~45KB** (still very lightweight)

**Comparison:**
- React + Chart.js: ~200KB+ minified
- Vue + dependencies: ~150KB+ minified
- Our solution: ~45KB unminified (can minify to ~30KB)

**Development Workflow:**
- Template files live in `templates/` directory
- Server code in `apantli/server.py`
- Changes to templates auto-reload with `apantli --reload`
- Separate concerns enable better HTML tooling and faster iteration

---

## Conclusion

This plan delivers all user-requested features while maintaining the lightweight, template-based architecture:

1. **Date range filtering** - Flexible date selection with quick filters and custom ranges
2. **Calendar view** - Visual monthly overview with daily cost heatmap
3. **Provider breakdown** - Clear visualization of provider costs and usage
4. **Enhanced request exploration** - Filter, search, and analyze individual requests

The incremental approach allows you to ship features progressively, with each phase delivering standalone value. The plan prioritizes user needs first (phases 1-4), then adds polish and advanced features (phases 5-7).

**Key Strengths:**
- No heavy frameworks (vanilla JS keeps it fast)
- Backward compatible (existing endpoints still work)
- Progressively enhanced (works without JS for basic stats)
- Accessible (WCAG AA compliant)
- Mobile-friendly (responsive design)
- Fast (optimized queries, minimal bundle size)

**Next Steps:**
1. Review plan with stakeholders
2. Prioritize phases based on user feedback
3. Begin Phase 1 backend implementation
4. Iterate and gather feedback after each phase
