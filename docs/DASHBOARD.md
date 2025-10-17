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

Real-time usage statistics with time-range filtering. Includes quick filters (All Time, Today, Yesterday, This Week, This Month, Last 30 Days) and custom date range picker. Displays total requests, cost, tokens, average duration, breakdown by provider and model, provider cost trends chart, and model efficiency comparisons. Auto-refreshes every 5 seconds.

### Calendar Tab

Visual month-by-month cost heatmap with month navigation (previous/next buttons). Cost heatmap uses darker colors for higher costs. Click any day to see provider breakdown with day number, cost, and request count.

### Models Tab

List of configured models with pricing information. Shows all models from `config.yaml` with input/output cost per million tokens, provider and LiteLLM routing name, and sortable columns (click headers).

### Requests Tab

Detailed request history with server-side filtering and pagination. Uses the same global date filter as Stats tab (persists across page reloads). Navigate through all requests (50 per page, adjustable up to 200) with Previous/Next buttons with disabled states, page indicator showing "Page X of Y", and item counter showing "Showing N of M requests".

Advanced filters include provider dropdown (openai, anthropic, etc.), model dropdown (populated from available models), cost range slider (min/max thresholds), and text search (searches model name and request/response content). All filtering applied on backend for accurate totals.

Features expandable details (click rows to show full request/response JSON with request parameters), view modes (toggle between JSON and conversation view), copy to clipboard (copy individual messages), and persistent filter state (all filter selections persist across page reloads).

**Request Parameters Display**: When viewing request details, a compact parameter line shows the key parameters used for that request: temperature, max_tokens, timeout, num_retries, and top_p. Only non-null values are displayed, making it easy to see which parameters were explicitly set or inherited from config defaults.

## Theme Toggle

Click the theme button in the header to switch between light and dark mode. Theme preference is saved automatically.

## Date Filtering and Persistence

The dashboard features a unified date filter that applies across Stats and Requests tabs with options for All Time (shows all historical data), Today (current day in your timezone), Yesterday, This Week (Monday-Sunday), This Month (first day to last day), Last 30 Days (rolling 30-day window), and Custom range (pick any start and end dates).

The selected filter persists across page reloads (stored in browser localStorage) and automatically applies to both Stats and Requests tabs. Switching between tabs maintains the current date selection. Pagination resets to page 1 when date filter changes. Backend receives timezone offset for accurate date boundary calculations.

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

Benefits include accurate totals (summary shows count for ALL filtered results, not just current page), better performance (filtering done on indexed database), lower memory usage (only fetches current page of results), and persistent state (filter selections saved in localStorage).

## Timezone Handling

All timestamps are displayed in your local timezone. The database stores UTC internally, but the dashboard automatically converts for display and date filtering.

## Developer Notes

**Tech Stack**: Single-page app in `templates/dashboard.html` using vanilla JavaScript + Alpine.js for reactivity. No build step required.

**Customization**: For dashboard customization (adding tabs, themes, filters), edit `templates/dashboard.html`. See inline comments for guidance.

**Performance**: Dashboard uses indexed queries, client-side sorting, and parallel data fetching. Handles 100K+ requests efficiently.

## Troubleshooting

**Dashboard not loading**: Check server is running (`http://localhost:4000/health`), check browser console (F12) for errors.

**No data showing**: Verify database has records (`sqlite3 requests.db "SELECT COUNT(*) FROM requests"`), click "All Time" to clear filters.

**Theme not persisting**: Check browser's localStorage is enabled (private browsing may block it).

**Dates off by hours**: Expected behavior - dashboard shows your local timezone, database stores UTC.

**Chart not rendering**: Trends chart requires at least 3 days of data for meaningful visualization.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed debugging.
