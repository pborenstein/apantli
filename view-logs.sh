#!/bin/bash
# Helper script to view apantli logs

case "$1" in
  apantli|app|a)
    echo "=== Apantli Logs (stdout) ==="
    tail -f ~/Library/Logs/apantli.log
    ;;
  error|err|e)
    echo "=== Apantli Errors (stderr) ==="
    tail -f ~/Library/Logs/apantli.error.log
    ;;
  tailscale|ts|t)
    echo "=== Tailscale Serve Logs ==="
    tail -f ~/Library/Logs/apantli-tailscale.log ~/Library/Logs/apantli-tailscale.error.log
    ;;
  all|*)
    echo "=== All Apantli Logs ==="
    tail -f ~/Library/Logs/apantli*.log
    ;;
esac
