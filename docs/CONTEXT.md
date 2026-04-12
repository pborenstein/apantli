# Current Session Context

---
phase: maintenance
phase_name: "Service Management"
updated: 2026-04-12
last_commit: eb3bf40
---

## Current Focus

Service management stable. launchd label standardized to `dev.pborenstein.apantli` across all files. Article drafts written and in Obsidian.

## Active Tasks

- [x] Rewrite dev.sh with subcommands (dev/start/stop/status)
- [x] Modernize launchctl calls in install.sh
- [x] Remove tailscale handling from dev.sh and install.sh
- [x] Clean up stale dev.philip.* plist files
- [x] Standardize launchd label to dev.pborenstein.apantli (hardcoded)
- [ ] Continue editing articles in Obsidian

## Context

- Service label is `dev.pborenstein.apantli` (reverse-domain, hardcoded)
- Tailscale plist templates still in `launchd/` but not managed by dev.sh or install.sh
- Same dev.sh structure as temoa: bare = dev mode, start/stop/status subcommands
- Cross-project launchd convention documented in nahuatl-PROJECTS DECISIONS.md

## Next Session

Continue editing the articles in Obsidian. `how-claude-codes-with-philip.md` is the main piece.
