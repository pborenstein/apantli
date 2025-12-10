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

## Episode: Streaming Token Usage Mystery (2025-12-10)

### The Discovery

User noticed streaming requests were being logged to database, but with zero token counts and $0.00 costs:

```
✓ LLM Response: claude-sonnet-4-5 (anthropic) | 3456ms | 0→0 tokens (0 total) | $0.0000 [streaming]
```

Database showed `prompt_tokens=0, completion_tokens=0, cost=0.0` for all streaming requests, while non-streaming requests had accurate counts.

### The Investigation

Added diagnostic logging to track down the issue:
- Database writes were working (connection → insert → commit → close all successful)
- `full_response['usage']` was coming through as `{'prompt_tokens': 0, 'completion_tokens': 0, 'total_tokens': 0}`
- The code was correctly attempting to capture usage from chunks, but chunks never contained usage data

### The Root Cause

Providers (Anthropic, OpenAI, etc.) don't send token usage data in streaming chunks by default. The accumulation logic was correct:

```python
if 'usage' in chunk_dict:
    full_response['usage'] = chunk_dict['usage']  # never triggered - no usage in chunks
```

But since chunks never contained `'usage'`, the initialized zero values persisted throughout the stream.

### The Solution

One line fix: Add `stream_options={"include_usage": True}` to streaming requests:

```python
# For streaming requests, request usage data from provider
if is_streaming:
    request_data['stream_options'] = {"include_usage": True}
```

This tells providers to include token usage data in the final streaming chunk.

### Bonus Improvements

While investigating, also improved streaming reliability:
1. **Background task logging** - Moved from inline `finally` block to FastAPI's `background` parameter
2. **Error state tracking** - Store stream errors in `full_response['_stream_error']` for background task
3. **Clean diagnostic removal** - Removed all debug prints after confirming fix

### The Verification

Tested with TEQUITL/Joan streaming conversations. Now shows accurate token counts:

```
✓ LLM Response: claude-sonnet-4-5 (anthropic) | 3294ms | 11576→57 tokens (11633 total) | $0.0356 [streaming]
```

Database entries confirmed:
```
2025-12-10T21:21:00Z | claude-sonnet-4-5 | 11731 | 344 | 0.040353
```

### What We Learned

1. **Provider APIs need explicit flags** - Features like usage tracking in streaming aren't automatic
2. **Diagnostic logging is temporary** - Add it, use it, remove it. Don't let it accumulate
3. **Background tasks are cleaner** - FastAPI's `background` parameter is better than inline `finally` blocks
4. **Test with real clients** - TEQUITL/Joan provided perfect test case with actual streaming usage

### Follow-up Observation

User noticed the high prompt token counts (11K+) mean TEQUITL is sending full conversation history every turn, which is expected for stateless LLM APIs. Each turn costs $0.035-$0.040 because of the massive context being sent (vault data, project context, full conversation history).

**Commits**: `b6134d6`, `80c5e69`, `3c33454`
