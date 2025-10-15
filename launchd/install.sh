#!/bin/bash
set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Apantli launchd Service Installer${NC}"
echo

# Detect environment
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USERNAME="$(whoami)"
HOME_DIR="$HOME"
VENV_PYTHON="$PROJECT_DIR/.venv/bin/python3"
VENV_BIN="$PROJECT_DIR/.venv/bin"

echo -e "${BLUE}Detected environment:${NC}"
echo "  Username:    $USERNAME"
echo "  Project dir: $PROJECT_DIR"
echo "  Python:      $VENV_PYTHON"
echo

# Check if venv exists
if [ ! -f "$VENV_PYTHON" ]; then
    echo -e "${RED}Error: Virtual environment not found at $VENV_PYTHON${NC}"
    echo "Please run 'uv sync' or create a virtual environment first."
    exit 1
fi

# Generate apantli plist
echo -e "${BLUE}Generating apantli service...${NC}"
APANTLI_PLIST="$HOME_DIR/Library/LaunchAgents/dev.$USERNAME.apantli.plist"

cat "$PROJECT_DIR/launchd/apantli.plist.template" | \
    sed "s|{{USERNAME}}|$USERNAME|g" | \
    sed "s|{{VENV_PYTHON}}|$VENV_PYTHON|g" | \
    sed "s|{{PROJECT_DIR}}|$PROJECT_DIR|g" | \
    sed "s|{{HOME}}|$HOME_DIR|g" | \
    sed "s|{{VENV_BIN}}|$VENV_BIN|g" \
    > "$APANTLI_PLIST"

echo -e "${GREEN}✓${NC} Created $APANTLI_PLIST"

# Ask about Tailscale
echo
read -p "Do you want to set up Tailscale HTTPS access? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Check if tailscale is installed
    TAILSCALE_BIN="$(which tailscale 2>/dev/null || echo "")"

    if [ -z "$TAILSCALE_BIN" ]; then
        echo -e "${RED}Error: tailscale not found in PATH${NC}"
        echo "Please install Tailscale first: https://tailscale.com/download"
        exit 1
    fi

    echo -e "${BLUE}Generating Tailscale service...${NC}"
    TAILSCALE_PLIST="$HOME_DIR/Library/LaunchAgents/dev.$USERNAME.apantli.tailscale.plist"

    cat "$PROJECT_DIR/launchd/tailscale.plist.template" | \
        sed "s|{{USERNAME}}|$USERNAME|g" | \
        sed "s|{{TAILSCALE_BIN}}|$TAILSCALE_BIN|g" | \
        sed "s|{{HOME}}|$HOME_DIR|g" \
        > "$TAILSCALE_PLIST"

    echo -e "${GREEN}✓${NC} Created $TAILSCALE_PLIST"
    SETUP_TAILSCALE=true
else
    SETUP_TAILSCALE=false
fi

# Unload existing services if running
echo
echo -e "${BLUE}Unloading any existing services...${NC}"
launchctl unload "$APANTLI_PLIST" 2>/dev/null || true
if [ "$SETUP_TAILSCALE" = true ]; then
    launchctl unload "$TAILSCALE_PLIST" 2>/dev/null || true
fi

# Load services
echo -e "${BLUE}Loading services...${NC}"
launchctl load "$APANTLI_PLIST"
echo -e "${GREEN}✓${NC} Loaded apantli service"

if [ "$SETUP_TAILSCALE" = true ]; then
    # Reset any existing Tailscale serve config
    tailscale serve reset 2>/dev/null || true

    launchctl load "$TAILSCALE_PLIST"
    echo -e "${GREEN}✓${NC} Loaded Tailscale service"

    # Give it a moment to set up
    sleep 2
fi

# Show status
echo
echo -e "${GREEN}✓ Installation complete!${NC}"
echo
echo -e "${BLUE}Service status:${NC}"
launchctl list | grep "dev.$USERNAME.apantli" || echo "  No services found"

echo
echo -e "${BLUE}Access apantli at:${NC}"
echo "  Local:       http://localhost:4000"

# Try to get LAN IP
LAN_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
if [ -n "$LAN_IP" ]; then
    echo "  LAN:         http://$LAN_IP:4000"
fi

if [ "$SETUP_TAILSCALE" = true ]; then
    # Get Tailscale hostname
    TS_HOSTNAME=$(tailscale status --json 2>/dev/null | grep -o '"HostName":"[^"]*"' | cut -d'"' -f4 || echo "")
    if [ -n "$TS_HOSTNAME" ]; then
        echo "  Tailscale:   https://$TS_HOSTNAME"
    else
        echo "  Tailscale:   (run 'tailscale serve status' to see URL)"
    fi
fi

echo
echo -e "${BLUE}View logs:${NC}"
echo "  $PROJECT_DIR/view-logs.sh"
echo
echo -e "${BLUE}Manage services:${NC}"
echo "  Stop:    launchctl unload ~/Library/LaunchAgents/dev.$USERNAME.apantli.plist"
echo "  Start:   launchctl load ~/Library/LaunchAgents/dev.$USERNAME.apantli.plist"
echo "  Restart: launchctl unload ~/Library/LaunchAgents/dev.$USERNAME.apantli.plist && launchctl load ~/Library/LaunchAgents/dev.$USERNAME.apantli.plist"
echo
