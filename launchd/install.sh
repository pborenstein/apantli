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
APANTLI_PLIST="$HOME_DIR/Library/LaunchAgents/dev.pborenstein.apantli.plist"

cat "$PROJECT_DIR/launchd/apantli.plist.template" | \
    sed "s|{{VENV_PYTHON}}|$VENV_PYTHON|g" | \
    sed "s|{{PROJECT_DIR}}|$PROJECT_DIR|g" | \
    sed "s|{{HOME}}|$HOME_DIR|g" | \
    sed "s|{{VENV_BIN}}|$VENV_BIN|g" \
    > "$APANTLI_PLIST"

echo -e "${GREEN}✓${NC} Created $APANTLI_PLIST"

# Stop existing service if registered
echo
GUI_DOMAIN="gui/$(id -u)"
echo -e "${BLUE}Stopping any existing service...${NC}"
launchctl bootout "$GUI_DOMAIN/dev.pborenstein.apantli" 2>/dev/null || true

# Start service
echo -e "${BLUE}Starting service...${NC}"
launchctl bootstrap "$GUI_DOMAIN" "$APANTLI_PLIST"
echo -e "${GREEN}✓${NC} Started apantli service"

# Show status
echo
echo -e "${GREEN}✓ Installation complete!${NC}"
echo
echo -e "${BLUE}Service status:${NC}"
launchctl print "$GUI_DOMAIN/dev.pborenstein.apantli" 2>/dev/null | grep -E "state|pid" | head -3 || echo "  No service found"

echo
echo -e "${BLUE}Access apantli at:${NC}"
echo "  Local:       http://localhost:4000"

# Try to get LAN IP
LAN_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | head -1 | awk '{print $2}')
if [ -n "$LAN_IP" ]; then
    echo "  LAN:         http://$LAN_IP:4000"
fi

echo
echo -e "${BLUE}View logs:${NC}"
echo "  $PROJECT_DIR/view-logs.sh"
echo
echo -e "${BLUE}Manage services:${NC}"
echo "  ./dev.sh stop     Stop the service"
echo "  ./dev.sh start    Start the service"
echo "  ./dev.sh status   Show service status"
echo "  ./dev.sh          Dev mode (stops service, runs with reload)"
echo
