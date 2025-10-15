# Apantli launchd Services

Run apantli automatically at startup on macOS using launchd.

## Quick Start

```bash
cd /path/to/apantli
./launchd/install.sh
```

The installer will:

1. Detect your environment (username, Python path, project location)
2. Generate personalized service files from templates
3. Optionally set up Tailscale HTTPS access
4. Install and start the services
5. Show you how to access apantli

## What Gets Installed

**Required:**

- `~/Library/LaunchAgents/dev.{username}.apantli.plist`
  - Runs apantli server on port 4000
  - Auto-starts on login
  - Auto-restarts on crash
  - Binds to all network interfaces (accessible on localhost, LAN, and Tailscale)

**Optional:**

- `~/Library/LaunchAgents/dev.{username}.apantli.tailscale.plist`
  - Exposes apantli via Tailscale HTTPS
  - Provides custom hostname (e.g., `https://your-machine.ts.net`)
  - Uses standard HTTPS port (443)

## Access Points

After installation, apantli is available at:

- **localhost:** `http://localhost:4000` (always)
- **LAN:** `http://{your-lan-ip}:4000` (from devices on your network)
- **Tailscale IP:** `http://{tailscale-ip}:4000` (from devices on your tailnet)
- **Tailscale HTTPS:** `https://{your-machine}.ts.net` (if Tailscale service is enabled)

## Viewing Logs

Use the helper script:

```bash
./view-logs.sh            # All logs (live tail)
./view-logs.sh apantli    # Just apantli stdout
./view-logs.sh error      # Just errors
./view-logs.sh tailscale  # Tailscale serve logs
```

Or directly:

```bash
tail -f ~/Library/Logs/apantli.log
tail -f ~/Library/Logs/apantli.error.log
tail -f ~/Library/Logs/apantli-tailscale.log
```

## Managing Services

**Check status:**

```bash
launchctl list | grep apantli
```

**Stop service:**

```bash
launchctl unload ~/Library/LaunchAgents/dev.{username}.apantli.plist
```

**Start service:**

```bash
launchctl load ~/Library/LaunchAgents/dev.{username}.apantli.plist
```

**Restart service:**

```bash
launchctl unload ~/Library/LaunchAgents/dev.{username}.apantli.plist
launchctl load ~/Library/LaunchAgents/dev.{username}.apantli.plist
```

## Uninstall

```bash
# Stop and remove services
launchctl unload ~/Library/LaunchAgents/dev.{username}.apantli.plist
launchctl unload ~/Library/LaunchAgents/dev.{username}.apantli.tailscale.plist
rm ~/Library/LaunchAgents/dev.{username}.apantli.plist
rm ~/Library/LaunchAgents/dev.{username}.apantli.tailscale.plist

# Remove Tailscale serve configuration (if applicable)
tailscale serve reset
```

## Manual Configuration

If you prefer to customize the services manually:

1. Copy templates:
   ```bash
   cp launchd/apantli.plist.template ~/Library/LaunchAgents/dev.yourname.apantli.plist
   ```

2. Edit the plist and replace placeholders:
   - `{{USERNAME}}` - Your username (e.g., `philip`)
   - `{{HOME}}` - Your home directory (e.g., `/Users/philip`)
   - `{{PROJECT_DIR}}` - Full path to apantli project
   - `{{VENV_PYTHON}}` - Full path to venv Python (e.g., `/path/to/apantli/.venv/bin/python3`)
   - `{{VENV_BIN}}` - Full path to venv bin directory
   - `{{TAILSCALE_BIN}}` - Full path to tailscale binary (e.g., `/opt/homebrew/bin/tailscale`)

3. Load the service:
   ```bash
   launchctl load ~/Library/LaunchAgents/dev.yourname.apantli.plist
   ```

## Files in This Directory

- `apantli.plist.template` - Template for apantli service (required)
- `tailscale.plist.template` - Template for Tailscale HTTPS (optional)
- `install.sh` - Automated installer script
- `README.md` - This file

## How It Works

### apantli Service

The apantli service runs `python3 -m apantli.server --port 4000` from your project directory using your virtual environment. It:

- Starts automatically when you log in (`RunAtLoad`)
- Restarts automatically if it crashes (`KeepAlive`)
- Binds to all interfaces (accessible locally and over network)
- Logs to `~/Library/Logs/apantli.log` and `~/Library/Logs/apantli.error.log`

### Tailscale Service (Optional)

The Tailscale service runs `tailscale serve --bg --https=443 http://localhost:4000` once at startup. It:

- Configures Tailscale to proxy HTTPS traffic to apantli
- Uses the `--bg` flag to run in background mode
- Does NOT use `KeepAlive` (the config persists in Tailscale daemon)
- Provides HTTPS with automatic certificate management
- Makes apantli accessible at a friendly URL on your tailnet

The actual traffic serving is handled by the Tailscale daemon (`tailscaled`), not by this launchd job. The job just sets up the configuration.

## Troubleshooting

**Service won't start:**

```bash
# Check error logs
cat ~/Library/Logs/apantli.error.log

# Verify Python environment exists
ls .venv/bin/python3

# Check if port 4000 is already in use
lsof -i :4000
```

**Tailscale serve not working:**

```bash
# Check Tailscale status
tailscale status

# Check serve configuration
tailscale serve status

# Reset and reinstall
tailscale serve reset
./launchd/install.sh
```

**Changes not taking effect:**

After modifying a plist file, you must unload and reload it:

```bash
launchctl unload ~/Library/LaunchAgents/dev.{username}.apantli.plist
launchctl load ~/Library/LaunchAgents/dev.{username}.apantli.plist
```

## Why launchd?

launchd is macOS's native init system and provides:

- **Built-in** - No extra dependencies
- **Automatic restart** - Services recover from crashes
- **Login integration** - Starts when you log in
- **Logging** - Captures stdout/stderr
- **Standard** - Follows macOS conventions

## Network Security Note

By default, apantli binds to all network interfaces (`0.0.0.0`), making it accessible on:

- localhost (127.0.0.1)
- Your LAN IP
- Your Tailscale IP

This is convenient but means anyone on your local network can access it. If you want to restrict access to localhost only, edit the plist and add `--host 127.0.0.1` to the ProgramArguments.

With Tailscale, you get:

- HTTPS with automatic certificates
- Access control via Tailscale ACLs
- Private network (not exposed to internet)
- Custom hostname instead of IP addresses
