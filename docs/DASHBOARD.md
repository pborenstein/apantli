# Dashboard Guide

User guide for Apantli's web dashboard.

## Overview

The dashboard is a single-page web application accessible at `http://localhost:4000/` that provides real-time LLM usage statistics, cost tracking, and request history.

## Accessing the Dashboard

1. Start the server: `apantli`
2. Open browser to: `http://localhost:4000/`

The dashboard auto-refreshes statistics every 5 seconds when viewing the Stats tab.

## Dashboard Tabs

### Stats Tab

Real-time usage statistics with time-range filtering. Features include:

- Quick filters: All Time, Today, Yesterday, This Week, This Month, Last 30 Days
- Custom date range picker
- Total requests, cost, tokens, and average duration
- Breakdown by provider and model
- Provider cost trends chart
- Model efficiency comparisons
- Auto-refreshes every 5 seconds

### Calendar Tab

Visual month-by-month cost heatmap. Features include:

- Month navigation (previous/next buttons)
- Cost heatmap (darker colors for higher costs)
- Click any day to see provider breakdown
- Shows day number, cost, and request count

### Models Tab

List of configured models with pricing information. Displays:

- All models from `config.yaml`
- Input/output cost per million tokens
- Provider and LiteLLM routing name
- Sortable columns (click headers)

### Requests Tab

Detailed request history with server-side filtering and pagination. Uses the same global date filter as Stats tab (persists across page reloads).

**Pagination controls**:

- Navigate through all requests (50 per page, adjustable up to 200)
- Previous/Next buttons with disabled states
- Page indicator showing "Page X of Y"
- Item counter showing "Showing N of M requests"

**Advanced filters** (all applied on backend for accurate totals):

- Provider dropdown (openai, anthropic, etc.)
- Model dropdown (populated from available models - shows client aliases, see [MODEL_NAMING.md](MODEL_NAMING.md))
- Cost range slider (min/max thresholds)
- Text search (searches model name and request/response content)

**Request details**:

- Expandable rows (click to show full request/response JSON with request parameters)
- View modes (toggle between JSON and conversation view)
- Copy to clipboard (copy individual messages)
- Persistent filter state (all selections persist across page reloads)

**Request Parameters Display**: When viewing request details, a compact parameter line shows the key parameters used for that request: temperature, max_tokens, timeout, num_retries, and top_p. Only non-null values are displayed, making it easy to see which parameters were explicitly set or inherited from config defaults.

## Theme Toggle

Click the theme button in the header to switch between light and dark mode. Theme preference is saved automatically.

## Date Filtering and Persistence

The dashboard features a unified date filter that applies across Stats and Requests tabs.

**Filter options**:

- All Time (shows all historical data)
- Today (current day in your timezone)
- Yesterday
- This Week (Monday-Sunday)
- This Month (first day to last day)
- Last 30 Days (rolling 30-day window)
- Custom range (pick any start and end dates)

**Persistence behavior**:

- Selected filter persists across page reloads (stored in browser localStorage)
- Automatically applies to both Stats and Requests tabs
- Switching between tabs maintains the current date selection
- Pagination resets to page 1 when date filter changes
- Backend receives timezone offset for accurate date boundary calculations

## Request Filtering Workflow

The Requests tab combines multiple filter types for precise data exploration:

**Filter Interaction**:

```
User selects filters → Alpine.js watcher detects changes →
Reset to page 1 → Build query string →
Fetch from /requests endpoint → Server applies filters →
Return paginated results with total count →
Update UI with filtered data and pagination controls
```

**Example**:

1. Select "This Month" date filter
2. Choose "anthropic" from Provider dropdown
3. Set minimum cost to $0.01
4. Type "python" in search box
5. Result: Shows all Anthropic requests from this month costing at least $0.01 mentioning "python"

**Benefits**:

- Accurate totals (summary shows count for ALL filtered results, not just current page)
- Better performance (filtering done on indexed database)
- Lower memory usage (only fetches current page of results)
- Persistent state (filter selections saved in localStorage)

## Timezone Handling

All timestamps are displayed in your browser's local timezone, automatically detected from your operating system. The database stores all times in UTC internally.

**How it works**:

- **Timestamp display**: The dashboard reads your browser's timezone setting and converts UTC timestamps to local time for display
- **Date filtering**: When you select a date like "2025-10-05", the dashboard converts your local date to UTC timestamps for queries
  - Example: Selecting 2025-10-05 in Pacific Time (UTC-7) queries from 2025-10-05T07:00:00 UTC to 2025-10-06T07:00:00 UTC
  - This ensures date ranges match your local calendar, not UTC dates
- **Timezone detection**: Uses JavaScript's `Intl.DateTimeFormat().resolvedOptions().timeZone` to detect your browser's timezone

**Limitations**:

- Cannot override browser timezone (dashboard uses your system setting)
- If you see unexpected dates/times, check your system timezone settings
- Dashboard always matches browser timezone, even if server runs in different timezone

## Developer Notes

**Tech Stack**: Single-page app using vanilla JavaScript + Alpine.js for reactivity. No build step required.

**File Structure** (refactored 2025-10-18):
- `templates/dashboard.html` (327 lines) - HTML structure and Alpine.js reactive data model
- `apantli/static/css/dashboard.css` (1,087 lines) - All styles including theme variables
- `apantli/static/js/dashboard.js` (1,705 lines) - All JavaScript logic and Alpine.js methods

**Customization**:
- **Adding UI elements**: Edit `templates/dashboard.html` for structure
- **Styling changes**: Edit `apantli/static/css/dashboard.css` for colors, layout, themes
- **Logic changes**: Edit `apantli/static/js/dashboard.js` for data fetching, filters, interactions
- See inline comments in each file for guidance

**Performance**: Dashboard uses indexed queries and client-side sorting for fast navigation. Performance characteristics:

- <100K requests: Queries complete in <200ms
- 100K-500K requests: Queries complete in 500ms-2s
- >500K requests: May see slower queries; consider archiving old data

All statistics are calculated server-side using indexed queries for best performance.

## Troubleshooting

**Dashboard not loading**: Check server is running (`http://localhost:4000/health`), check browser console (F12) for errors.

**No data showing**: Verify database has records (`sqlite3 requests.db "SELECT COUNT(*) FROM requests"`), click "All Time" to clear filters.

**Theme not persisting**: Check browser's localStorage is enabled (private browsing may block it).

**Dates off by hours**: Expected behavior - dashboard shows your local timezone, database stores UTC.

**Chart not rendering**: Trends chart requires at least 3 days of data for meaningful visualization.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed debugging.
