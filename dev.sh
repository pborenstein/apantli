#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

USERNAME="$(whoami)"
APANTLI_PLIST="$HOME/Library/LaunchAgents/dev.$USERNAME.apantli.plist"
TAILSCALE_PLIST="$HOME/Library/LaunchAgents/dev.$USERNAME.apantli.tailscale.plist"

echo -e "${BLUE}🔧 Apantli Development Mode${NC}"
echo

# Check if launchd service exists
if [ ! -f "$APANTLI_PLIST" ]; then
    echo -e "${YELLOW}No launchd service found. Running directly...${NC}"
    echo
else
    # Check if service is running
    if launchctl list | grep -q "dev.$USERNAME.apantli"; then
        echo -e "${YELLOW}Stopping launchd service...${NC}"
        launchctl unload "$APANTLI_PLIST" 2>/dev/null || true
        echo -e "${GREEN}✓${NC} Service stopped"
        echo
        STOPPED_SERVICE=true
    else
        STOPPED_SERVICE=false
    fi
fi

# Function to restore service on exit
cleanup() {
    echo
    echo
    if [ "$STOPPED_SERVICE" = true ]; then
        echo -e "${YELLOW}Restore launchd service? (y/n)${NC}"
        read -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            echo -e "${BLUE}Restarting launchd service...${NC}"
            launchctl load "$APANTLI_PLIST"
            echo -e "${GREEN}✓${NC} Service restored"
        else
            echo -e "${YELLOW}Service not restored. To start it manually:${NC}"
            echo "  launchctl load $APANTLI_PLIST"
        fi
    fi
}

trap cleanup EXIT

# Run apantli in development mode with auto-reload
echo -e "${GREEN}Starting apantli in development mode with auto-reload...${NC}"
echo -e "${BLUE}Press Ctrl+C to stop${NC}"
echo

# Check if we're in a virtual environment
if [ -z "$VIRTUAL_ENV" ]; then
    # Not in venv, use the venv python directly
    if [ -f ".venv/bin/python3" ]; then
        .venv/bin/python3 -m apantli.server --reload
    else
        echo -e "${RED}Error: .venv not found. Please run 'uv sync' first.${NC}"
        exit 1
    fi
else
    # Already in venv
    caffeinate -dimsu -- python3 -m apantli.server --reload
fi
