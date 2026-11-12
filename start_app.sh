#!/usr/bin/env bash
# Finsheild full-stack launcher: FastAPI backend (:8000) + Next.js frontend (:5173).
# Run from repo root:  bash start_app.sh   (or: chmod +x start_app.sh; ./start_app.sh)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

# Find Python interpreter (repo .venv first, else python3)
if [ -f "$ROOT/.venv/bin/python" ]; then
    PY="$ROOT/.venv/bin/python"
elif [ -f "$ROOT/.venv/Scripts/python.exe" ]; then
    PY="$ROOT/.venv/Scripts/python.exe"
else
    PY="$(command -v python3 || command -v python)"
fi

BACKEND_PORT="${BACKEND_PORT:-8000}"
export VITE_API_URL="${VITE_API_URL:-http://127.0.0.1:$BACKEND_PORT}"
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$ROOT:$ROOT/src"

echo "Starting FinSheild Backend with $PY..."
"$PY" -m uvicorn backend.main:app --host 127.0.0.1 --port "$BACKEND_PORT" &
BACK_PID=$!
trap 'kill $BACK_PID 2>/dev/null || true' EXIT
echo "Backend running -> http://127.0.0.1:$BACKEND_PORT (pid $BACK_PID)"

cd "$ROOT/frontend"
if [ ! -d node_modules ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

echo "Starting FinSheild Frontend on :5173..."
npm run dev -- --hostname 127.0.0.1 --port 5173
