#!/bin/bash
set -euo pipefail

# === Configuration ===
PROJECT_NAME="apantli"
SERVICE_LABEL="dev.pborenstein.apantli"
SERVICE_PLIST="$HOME/Library/LaunchAgents/${SERVICE_LABEL}.plist"
PORT=4000
VENV_DIR=".venv"
GUI_DOMAIN="gui/$(id -u)"

# === Colors ===
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
DIM='\033[2m'
NC='\033[0m'

# === Helpers ===

info()    { echo -e "${BLUE}$*${NC}"; }
ok()      { echo -e "${GREEN}$*${NC}"; }
warn()    { echo -e "${YELLOW}$*${NC}"; }
err()     { echo -e "${RED}$*${NC}"; }

service_is_registered() {
  launchctl print "$GUI_DOMAIN/$SERVICE_LABEL" &>/dev/null
}

port_in_use() {
  lsof -ti :"$PORT" &>/dev/null
}

kill_port() {
  local pids
  pids=$(lsof -ti :"$PORT" 2>/dev/null) || return 0
  [ -z "$pids" ] && return 0
  warn "Killing processes on port $PORT..."
  echo "$pids" | xargs kill 2>/dev/null || true
  sleep 1
  pids=$(lsof -ti :"$PORT" 2>/dev/null) || return 0
  [ -z "$pids" ] && return 0
  echo "$pids" | xargs kill -9 2>/dev/null || true
  sleep 1
}

# === Commands ===

cmd_stop() {
  if service_is_registered; then
    info "Stopping $PROJECT_NAME service..."
    launchctl bootout "$GUI_DOMAIN/$SERVICE_LABEL" 2>/dev/null || true
    ok "  Service stopped"
  else
    info "  Service is not running"
  fi
}

cmd_start() {
  if [ ! -f "$SERVICE_PLIST" ]; then
    err "Plist not found: $SERVICE_PLIST"
    err "Run ./launchd/install.sh first."
    exit 1
  fi

  if service_is_registered; then
    warn "Service already registered. Stopping first..."
    launchctl bootout "$GUI_DOMAIN/$SERVICE_LABEL" 2>/dev/null || true
    sleep 1
  fi

  info "Starting $PROJECT_NAME service..."
  launchctl bootstrap "$GUI_DOMAIN" "$SERVICE_PLIST"

  sleep 2
  if port_in_use; then
    ok "  Service running on port $PORT"
  else
    warn "  Port $PORT not yet in use -- service may still be starting"
    warn "  Check: ./dev.sh status"
  fi
}

cmd_status() {
  info "$PROJECT_NAME service status:"
  echo
  if service_is_registered; then
    ok "  Service: registered"
    launchctl print "$GUI_DOMAIN/$SERVICE_LABEL" 2>/dev/null | grep -E "state|pid" | head -5 || true
  else
    warn "  Service: not registered"
  fi
  echo
  if port_in_use; then
    ok "  Port $PORT: in use (PID $(lsof -ti :$PORT 2>/dev/null | head -1))"
  else
    warn "  Port $PORT: free"
  fi
}

cmd_dev() {
  info "$PROJECT_NAME dev mode"
  echo

  # Sanity: plist exists
  if [ ! -f "$SERVICE_PLIST" ]; then
    err "Plist not found: $SERVICE_PLIST"
    err "Run ./launchd/install.sh first."
    exit 1
  fi

  # Sanity: venv exists
  if [ ! -f "$VENV_DIR/bin/python3" ]; then
    err "Venv not found at $VENV_DIR -- run 'uv sync' first."
    exit 1
  fi

  # Stop the launchd service
  cmd_stop

  # Make sure port is free
  if port_in_use; then
    kill_port
  fi
  if port_in_use; then
    err "Port $PORT still in use after stopping service"
    err "PID: $(lsof -ti :$PORT 2>/dev/null)"
    exit 1
  fi
  ok "  Port $PORT is free"
  echo

  # On exit: no prompt, just print how to restart
  trap '_cleanup' EXIT
  trap '_cleanup; exit 130' INT TERM

  info "Starting dev server with auto-reload..."
  info "Press Ctrl+C to stop"
  echo

  caffeinate -dimsu -- .venv/bin/python3 -m apantli.server --reload
}

_cleanup() {
  echo
  info "$PROJECT_NAME dev server stopped. Service is still stopped."
  echo -e "  ${DIM}./dev.sh start${NC}  to restart the service"
}

# === Dispatch ===

case "${1:-}" in
  start)  cmd_start ;;
  stop)   cmd_stop ;;
  status) cmd_status ;;
  help|-h|--help)
    echo "Usage: ./dev.sh [command]"
    echo
    echo "  (none)    Stop service, run dev server with reload"
    echo "  start     Start the launchd service"
    echo "  stop      Stop the launchd service"
    echo "  status    Show service and port status"
    ;;
  "")     cmd_dev ;;
  *)
    err "Unknown command: $1"
    echo "Run './dev.sh help' for usage."
    exit 1
    ;;
esac
