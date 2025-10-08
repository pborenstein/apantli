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

Real-time usage statistics with time-range filtering.

**Features**:
- Quick filters: All Time, Today, Yesterday, This Week, This Month, Last 30 Days
- Custom date range picker
- Total requests, cost, tokens, average duration
- Breakdown by provider and model
- Provider cost trends chart
- Model efficiency comparisons
- Auto-refreshes every 5 seconds

### Calendar Tab

Visual month-by-month cost heatmap.

**Features**:
- Month navigation (previous/next buttons)
- Cost heatmap (darker colors = higher costs)
- Click any day to see provider breakdown
- Shows day number, cost, and request count per day

### Models Tab

List of configured models with pricing information.

**Features**:
- All models from `config.yaml`
- Input/output cost per million tokens
- Provider and LiteLLM routing name
- Sortable columns (click headers)

### Requests Tab

Detailed request history with advanced filtering.

**Features**:
- Date filtering (same quick filters as Stats tab)
- Search by content in requests/responses
- Filter by model, provider, or cost range
- Click rows to expand full request/response JSON
- Toggle between JSON and conversation view
- Copy individual messages to clipboard

## Theme Toggle

Click the theme button in the header to switch between light and dark mode. Theme preference is saved automatically.

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

**Chart not rendering**: Need at least 2 days of data and a date range selected.

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed debugging.
