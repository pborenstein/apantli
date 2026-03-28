# Current Session Context

---
phase: maintenance
phase_name: "Service Management"
updated: 2026-03-28
last_commit: c7e6bf4
---

## Current Focus

Rewrote `dev.sh` and `launchd/install.sh` to use modern `launchctl bootstrap/bootout` API. Removed tailscale plist handling. Consistent with temoa's pattern.

## Active Tasks

- [x] Rewrite dev.sh with subcommands (dev/start/stop/status)
- [x] Modernize launchctl calls in install.sh
- [x] Remove tailscale handling from dev.sh and install.sh
- [x] Clean up stale dev.philip.* plist files
- [ ] Continue editing articles in Obsidian

## Context

- Service label is `dev.pborenstein.apantli` (reverse-domain, hardcoded -- was `$(whoami)` before)
- Tailscale plist templates still in `launchd/` but no longer managed by dev.sh or install.sh
- Same dev.sh structure as temoa: bare = dev mode, start/stop/status subcommands

## Next Session

Continue editing the articles in Obsidian. `how-claude-codes-with-philip.md` is the main piece.
