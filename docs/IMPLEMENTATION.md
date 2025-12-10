# Implementation Status

**Note**: This document is the plan of record. It will be backfilled with historical context in future sessions.

## Calendar View - GitHub Contribution Graph Style

**Status**: ✅ Complete (2025-12-04)
**Branch**: `calendar-revitalization-initiative`
**Commit**: `0004b8d` - "Redesign calendar as GitHub contribution graph style"

### What Was Built

Multi-month scrollable calendar visualization using GitHub contribution graph pattern for sparse usage data.

**Core Features**:

- GitHub-style squares colored by quartile-based intensity (5 levels: 0-4)
- Week-based layout: one row per week, 7 uniform squares per row
- Quartile calculation: divides non-zero activity into 4 equal groups
- Orange color palette: #ffedd5 (lightest) → #ea580c (brightest)
- Dark mode support with adjusted color values
- Week totals displayed on right side of each row
- All months rendered at once (no pagination)

**Interactions**:

- Click day → navigate to Stats tab with single-day filter
- Click week number → navigate to Stats tab with week filter
- Drag across days → select date range, navigate to Stats tab
- Hover tooltips show exact cost and request count

**Integration**:

- Respects date filter from Stats tab
- Auto-reloads when date filter changes
- Uses `/stats/daily` endpoint with timezone offset
- Calculates intensity levels client-side from fetched data

### Why This Design

**Problem**: User has sparse, low-cost usage ($0.0005-$0.39/week) that was invisible with absolute scaling.

**Solution**: Relative intensity based on user's own quartiles. A $0.39 week shows as "top 25%" (bright orange) and $0.03 shows as "bottom 25%" (light orange). Both visible, pattern clear.

**Rejected Approaches**:

1. Heat map - not distinct enough
2. Side-by-side bars - too small to see
3. Horizontal continuous bars - still invisible
4. Baseline + proportional scaling - confusing

### Files Modified

- `templates/dashboard.html` - removed old navigation, added date filter integration
- `apantli/static/js/modules/calendar.js` - complete rewrite (~400 lines changed)
- `apantli/static/css/dashboard.css` - replaced bar styles with GitHub-style squares

### Technical Implementation

**Quartile Calculation** (calendar.js:66-73):
```javascript
const costs = Object.values(calendarData).map(d => d.cost).filter(c => c > 0);
costs.sort((a, b) => a - b);
const intensityLevels = {
    q1: costs[Math.floor(costs.length * 0.25)] || 0,
    q2: costs[Math.floor(costs.length * 0.50)] || 0,
    q3: costs[Math.floor(costs.length * 0.75)] || 0
};
```

**Intensity Class Assignment** (calendar.js:167-174):
```javascript
let intensityClass = 'level-0';
if (day.data.cost > 0) {
    if (day.data.cost <= intensityLevels.q1) intensityClass = 'level-1';
    else if (day.data.cost <= intensityLevels.q2) intensityClass = 'level-2';
    else if (day.data.cost <= intensityLevels.q3) intensityClass = 'level-3';
    else intensityClass = 'level-4';
}
```

### How to Continue

The calendar implementation is complete and working. Future work might include:

- Export calendar data to CSV/JSON
- Provider-specific intensity views
- Model-specific intensity views
- Comparison mode (show two time periods side-by-side)

No immediate work planned - waiting for user feedback.

---

## Other Recent Work

### Dashboard Logging Filter Fix

**Status**: ✅ Complete (2025-12-04)
**Commit**: `31bb706` - "Fix dashboard logging filter and chart date gaps"

Fixed DashboardFilter not working in `--reload` mode by moving filter application to module level (server.py:106).

### Chart Date Range Fix

**Status**: ✅ Complete (2025-12-04)
**Commit**: `31bb706` - "Fix dashboard logging filter and chart date gaps"

Fixed Provider Cost Trends chart skipping days with no data. Now generates complete date range from first to last date in dataset (dashboard.js:576-581).

---

## Streaming Request Database Logging Issue

**Status**: 🔴 In Progress (2025-12-10)
**Branch**: TBD

### The Problem

Streaming requests complete successfully (HTTP 200) and show in server logs, but fail to write to the database. Evidence:

- Last database entry: 2025-12-10 07:08:02
- Server logs show successful streaming requests at 08:01:56, 08:02:00, 08:02:13, 08:02:17, 08:03:38, 08:03:42
- All returned HTTP 200 OK
- Database has 0 entries after 08:00:00

### Root Cause

Database insertion errors in streaming requests are being caught and suppressed by exception handler (server.py:350-351):

```python
except Exception as exc:
    logging.error(f"Error logging streaming request to database: {exc}")
```

The `finally` block at line 338 calls `await db.log_request()` to log streaming requests, but any exceptions are caught and only logged to console, not re-raised. This causes silent failures.

### Next Steps

1. Check server console for "Error logging streaming request to database:" messages
2. Identify the actual database error causing the failures
3. Fix the underlying issue (likely connection pool, locking, or async context problem)
4. Consider whether to re-raise database errors or handle them differently

### Files Involved

- `apantli/server.py` - streaming response generator (lines 280-351)
- `apantli/database.py` - log_request method (lines 84-120)

### Context

Non-streaming requests work correctly and log to database. Only streaming requests are affected, suggesting the issue is specific to the streaming code path or how it interacts with async database operations.
