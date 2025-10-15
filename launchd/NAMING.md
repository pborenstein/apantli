# launchd Service Naming Convention

## What Changed

Standardized launchd service names to use the actual system username (`philip`) instead of a domain-based identifier (`pborenstein`).

**Old names:**
- `dev.pborenstein.apantli.plist`
- `dev.pborenstein.apantli.tailscale.plist`

**New names:**
- `dev.philip.apantli.plist`
- `dev.philip.apantli.tailscale.plist`

## Why This Matters

### The Problem

The original service names used `pborenstein` (from email/git username), but the system username is `philip`. This created a mismatch:

- `whoami` returns `philip`
- But service name was `dev.pborenstein.apantli`
- Scripts using `$(whoami)` would construct `dev.philip.apantli` and fail to find the service

### Real-World Impact

This affected:
- **dev.sh** - Development script couldn't automatically find and stop the service
- **launchd/install.sh** - Would create `dev.philip.apantli` on fresh installs
- **Documentation examples** - Examples using `$(whoami)` wouldn't work
- **User confusion** - Service name didn't match username

### The Fix

1. Renamed plist files to use actual username:
   ```bash
   mv dev.pborenstein.apantli.plist dev.philip.apantli.plist
   mv dev.pborenstein.apantli.tailscale.plist dev.philip.apantli.tailscale.plist
   ```

2. Updated Label keys inside plists to match filenames:
   ```xml
   <key>Label</key>
   <string>dev.philip.apantli</string>
   ```

3. Unloaded old services, loaded new ones:
   ```bash
   launchctl unload ~/Library/LaunchAgents/dev.pborenstein.apantli.plist
   launchctl load ~/Library/LaunchAgents/dev.philip.apantli.plist
   ```

## Naming Convention

For consistency across all installations:

**Format:** `dev.{username}.apantli[.service]`

Where:
- `{username}` = Output of `whoami` (system login name)
- `[.service]` = Optional suffix for additional services (e.g., `.tailscale`)

**Examples:**
- User `philip` → `dev.philip.apantli.plist`
- User `alice` → `dev.alice.apantli.plist`
- User `bob` → `dev.bob.apantli.tailscale.plist`

This ensures:
- Scripts using `$(whoami)` work correctly
- Service names are predictable
- Fresh installs match manual installations
- Less confusion for users

## For Template Maintainers

The `launchd/install.sh` script correctly uses:

```bash
USERNAME="$(whoami)"
APANTLI_PLIST="$HOME/Library/LaunchAgents/dev.$USERNAME.apantli.plist"
```

And templates use the placeholder:
```xml
<key>Label</key>
<string>dev.{{USERNAME}}.apantli</string>
```

This is replaced during installation with the actual username from `whoami`.

## Migration Notes

If you have existing services with different naming:

1. Find current service name:
   ```bash
   ls ~/Library/LaunchAgents/ | grep apantli
   ```

2. Unload old service:
   ```bash
   launchctl unload ~/Library/LaunchAgents/dev.oldname.apantli.plist
   ```

3. Rename file:
   ```bash
   mv ~/Library/LaunchAgents/dev.oldname.apantli.plist \
      ~/Library/LaunchAgents/dev.$(whoami).apantli.plist
   ```

4. Edit plist to update Label key to match new filename

5. Load new service:
   ```bash
   launchctl load ~/Library/LaunchAgents/dev.$(whoami).apantli.plist
   ```

Or simply run `./launchd/install.sh` to regenerate everything correctly.
