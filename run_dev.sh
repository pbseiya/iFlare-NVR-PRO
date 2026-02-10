#!/bin/bash

# Kill ports 8000 and 3000 just in case
fuser -k 8000/tcp 2>/dev/null
fuser -k 3000/tcp 2>/dev/null

echo "🚀 Starting NVR in Dev Mode (Logs -> Terminal)..."

# Function to kill processes on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

trap cleanup INT TERM

# Start Backend (Background but piping to stdout)
# Use a prefix if possible, but simple & works well enough
echo "👉 Starting Backend..."
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

# Start Frontend
echo "👉 Starting Frontend..."
cd web-config
npm run dev &
FRONTEND_PID=$!

# Wait for both
wait $BACKEND_PID $FRONTEND_PID
