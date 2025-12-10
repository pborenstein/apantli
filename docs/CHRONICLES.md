# Project Chronicle

**Note**: This document records key decisions and interesting episodes. It will be backfilled with historical context in future sessions.

---

## Episode: Calendar Visualization Evolution (2025-12-04)

**Branch**: `calendar-revitalization-initiative`

### The Problem

User wanted to visualize usage patterns but had sparse, low-cost data ($0.0005-$0.39/week). Traditional scaling approaches made tiny values invisible.

### Design Evolution

**Iteration 1: Compact Grid**
- User feedback: "chasm between days is illegible... cells next to each other"
- Made cells touch with shared borders
- Still used bar graphs

**Iteration 2: Horizontal Bars**
- User feedback: "All the graphs should be continuous... week-long slabs one above the other"
- Complete redesign to horizontal bar layout like Provider Cost Trends
- One continuous bar per week

**Iteration 3: Color Change**
- User feedback: "the blue is too much -- something like yellow? orange"
- Changed from blue to orange (#ff9500)

**Iteration 4: Global Scaling**
- User feedback: "there's no data showing"
- Problem: per-month scaling made small values invisible
- Solution: global max cost across ALL data for consistent scaling

**Iteration 5: Baseline Scaling**
- User feedback: "The amounts -- the costs are very tiny so the scale... has to be a way to make tiny things visible"
- Added hybrid scaling: 15% baseline + 85% proportional
- Made tiny values visible while preserving relative differences

**Iteration 6: GitHub Contribution Graph (FINAL)**
- User feedback: "I don't know what to tell you. There is no information here... Maybe the calendar isn't the best way to display this data... can we come up with a way to see trends in tiny data"
- User chose GitHub contribution graph from proposed alternatives
- Quartile-based intensity coloring
- All squares same size, color shows relative intensity

### Key Decision: Relative vs Absolute Scaling

**Insight**: For sparse data, absolute scaling fails. Users need to see patterns in their own usage, not absolute amounts.

**Solution**: Quartile-based intensity levels calculated from user's own data:

- Level 0: No activity (gray)
- Level 1: Bottom 25% of activity (lightest orange)
- Level 2: 25-50% (light orange)
- Level 3: 50-75% (medium orange)
- Level 4: Top 25% (bright orange)

This makes a $0.39 week and a $0.03 week both visible and comparable within the user's usage context.

### Technical Notes

**Quartile Calculation**: Sort non-zero costs, find values at 25%, 50%, 75% positions.

**Why It Works**: Every user sees patterns in their own data range. Heavy users ($100/week) and light users ($0.03/week) both get meaningful visualizations.

**Color Choice**: Orange palette chosen by user. Light/dark mode support with adjusted intensities.

### What We Learned

1. **Listen to user frustration**: "There is no information here" meant the entire approach was wrong, not just the scaling
2. **Sparse data needs different treatment**: Techniques that work for dense data fail for sparse data
3. **Relative comparison > absolute values**: Users want to see their own patterns, not compare to arbitrary scales
4. **GitHub's approach works**: It's battle-tested for exactly this use case (sparse contributions)

---

## Other Decisions This Session

### Logging Filter Architecture

**Decision**: Move DashboardFilter to module level for reload compatibility.

**Rationale**: `--reload` mode spawns subprocess that doesn't inherit function-level filter application. Module-level application survives reload.

**Location**: server.py:82-106

### Chart Date Range Completeness

**Decision**: Always generate complete date range even when no data for some days.

**Rationale**: Users expect continuous x-axis on time-series charts. Gaps are confusing.

**Implementation**: Generate all dates from first to last, fill missing days with zeros.

---

## Episode: Streaming Database Logging Mystery (2025-12-10)

### The Discovery

User noticed requests appearing in server logs but not in the database dashboard. Investigation revealed:

- ✅ Non-streaming requests: logged correctly
- ❌ Streaming requests: successful HTTP responses but no database entries
- 🤔 No error messages visible (caught and suppressed)

### The Diagnosis

Code review found the smoking gun in `server.py` lines 350-351:

```python
except Exception as exc:
    logging.error(f"Error logging streaming request to database: {exc}")
```

The streaming code path has a `finally` block that attempts to log requests to the database after streaming completes. However, any exceptions during database insertion are caught and only logged to console, never re-raised.

**Why This Is Subtle**: The exception handler is inside the streaming generator function. Errors are logged with `logging.error()` but not visible without checking server console. HTTP response is already sent (200 OK) before database logging happens, so from the client's perspective, everything looks successful.

### Questions for Next Session

1. What is the actual database error? (Check server console for error messages)
2. Why do non-streaming requests succeed but streaming requests fail?
3. Is it an async context issue? Connection pool? Lock contention?
4. Should database errors be re-raised or handled differently?
