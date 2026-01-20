# Current Session Context

---
phase: QoL
phase_name: "Dashboard UX Improvements"
updated: 2026-01-19
last_commit: a44d9a8
---

## Current Focus

Dashboard filter improvements: clear all functionality and visual indicators for active filters.

## Active Tasks

- [x] Add shaded background for expanded request rows
- [x] Add collapsible messages with fold/unfold buttons
- [x] Persist expanded/folded state across refreshes
- [x] Make charts responsive to window resize
- [x] Add color coding for message role headings
- [x] Fix "Clear Filter" to clear ALL filters (not just date)
- [x] Add visual indicators for active filters (blue glow)
- [x] Fix filter dropdowns persisting across pagination
- [ ] Merge fixes-and-stuff to main

## Blockers

None.

## Context

- "Clear All Filters" now resets date, search, provider, model, and cost range
- Active filters glow blue (#7aa2f7 shadow) for visibility in dark mode
- Filter dropdowns fetch from `/stats/filters` endpoint once on load
- Providers/models sorted by usage count (most-used first)
- Dropdowns no longer repopulate per page - fixes pagination annoyance
- Branch: fixes-and-stuff (7 commits ahead of main)

## Next Session

Merge fixes-and-stuff to main, tag v0.4.1 patch release.
