#!/bin/bash
# Double-click this file to start the overlay server and open the control panel.
set -u

cd "$(dirname "$0")" || exit 1

PORT="${PORT:-8765}"
HOST="${HOST:-127.0.0.1}"
URL="http://localhost:$PORT"

if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
  echo "MLBB overlay server is already running at $URL"
  open "$URL/control.html"
  exit 0
fi

echo "Starting MLBB overlay server on $URL ..."
python3 server.py --port "$PORT" --host "$HOST" &
SERVER_PID=$!

cleanup() {
  kill "$SERVER_PID" 2>/dev/null
}
trap cleanup INT TERM EXIT

# Wait until the server answers before opening the browser.
for _ in $(seq 1 50); do
  if curl -fsS "$URL/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.2
done

open "$URL/control.html"
echo ""
echo "Control panel opened in your browser."
echo "Keep this window open while you stream. Press Ctrl+C to stop."
echo ""
wait "$SERVER_PID"
