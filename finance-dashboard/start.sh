#!/bin/bash
# start.sh — Launch Flask + Cloudflare quick tunnel
# Usage: ./start.sh [--tunnel]
#
# Without --tunnel: just starts Flask on 0.0.0.0:5000
# With --tunnel:    starts Flask + cloudflared quick tunnel (free, no domain needed)
#
# Prerequisites for tunnel: brew install cloudflared

set -e
cd "$(dirname "$0")"

PORT=5000
FLASK_PID=""
TUNNEL_PID=""

cleanup() {
  echo ""
  echo "Shutting down..."
  [ -n "$TUNNEL_PID" ] && kill "$TUNNEL_PID" 2>/dev/null
  [ -n "$FLASK_PID" ] && kill "$FLASK_PID" 2>/dev/null
  wait 2>/dev/null
  echo "Done."
}
trap cleanup EXIT INT TERM

# Start Flask
echo "Starting Flask on 0.0.0.0:$PORT ..."
python3 app.py &
FLASK_PID=$!
sleep 2

# Check Flask is running
if ! kill -0 "$FLASK_PID" 2>/dev/null; then
  echo "ERROR: Flask failed to start"
  exit 1
fi

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")
echo ""
echo "  Local:   http://$LOCAL_IP:$PORT"
echo "  Web UI:  http://$LOCAL_IP:$PORT"
echo ""

if [ "$1" = "--tunnel" ]; then
  if ! command -v cloudflared &>/dev/null; then
    echo "ERROR: cloudflared not found. Install with: brew install cloudflared"
    exit 1
  fi

  echo "Starting Cloudflare tunnel..."
  TUNNEL_LOG=$(mktemp)
  cloudflared tunnel --url "http://localhost:$PORT" 2>"$TUNNEL_LOG" &
  TUNNEL_PID=$!

  # Wait for the tunnel URL to appear in logs
  for i in $(seq 1 30); do
    TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -1)
    if [ -n "$TUNNEL_URL" ]; then
      break
    fi
    sleep 1
  done
  rm -f "$TUNNEL_LOG"

  if [ -n "$TUNNEL_URL" ]; then
    echo "============================================"
    echo "  TUNNEL URL: $TUNNEL_URL"
    echo "============================================"
    echo ""
    echo "  Use this URL on your phone or anywhere."
    echo "  Note: URL changes each time you restart."
    echo ""
  else
    echo "WARNING: Could not detect tunnel URL. Check cloudflared output."
  fi
fi

echo "Press Ctrl+C to stop."
wait
