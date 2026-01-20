# Current Session Context

---
phase: QoL
phase_name: "Dashboard UX Improvements"
updated: 2026-01-19
last_commit: fbc8ba6
---

## Current Focus

Fixed server-side sorting for requests table to apply across entire dataset.

## Active Tasks

- [x] Add shaded background for expanded request rows
- [x] Add collapsible messages with fold/unfold buttons
- [x] Persist expanded/folded state across refreshes
- [x] Make charts responsive to window resize
- [x] Add color coding for message role headings
- [x] Fix "Clear Filter" to clear ALL filters (not just date)
- [x] Add visual indicators for active filters (blue glow)
- [x] Fix filter dropdowns persisting across pagination
- [x] Implement server-side sorting (applies to all data, not just page)
- [ ] Merge fixes-and-stuff to main

## Blockers

None.

## Context

- Server-side sorting via `sort_by` and `sort_dir` parameters on `/requests` endpoint
- Sorting persists across pagination (sorts entire dataset, not just visible page)
- Column map: timestamp, model, total_tokens, cost, duration_ms
- Need to clarify what "sorting" means for requests table in future (see note)
- **Note**: Next time, think more clearly about what sorting means for this table
- Branch: fixes-and-stuff (9 commits ahead of main)

## Next Session

Merge fixes-and-stuff to main, tag v0.4.1 patch release.
