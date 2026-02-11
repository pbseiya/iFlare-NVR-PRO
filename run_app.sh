#!/bin/bash


# Set mode based on argument
MODE="production"
SHOULD_BUILD=false

if [[ "$1" == "dev" ]]; then
    MODE="development"
    echo "Running in DEVELOPMENT mode (Hot-reload enabled, High CPU)"
elif [[ "$1" == "build" ]]; then
    SHOULD_BUILD=true
    echo "Running in PRODUCTION mode with REBUILD (Optimized, Low CPU)"
else
    echo "Running in PRODUCTION mode (Optimized, Low CPU)"
fi

# Kill ports 8000 and 3000 just in case
fuser -k 8000/tcp
fuser -k 3000/tcp

echo "Starting Backend (Port 8000)..."
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload > backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

echo "Starting Web UI (Port 3000) [$MODE]..."
cd web-config

if [[ "$SHOULD_BUILD" == "true" ]]; then
    echo "Building Frontend (this may take a while)..."
    npm run build
fi

if [[ "$MODE" == "development" ]]; then
    npm run dev > ../frontend.log 2>&1 &
else
    npm start > ../frontend.log 2>&1 &
fi
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo "=================================================="
echo "Application Started!"
echo "Backend Logs: tail -f backend.log"
echo "Frontend Logs: tail -f frontend.log"
echo "Web UI URL: http://localhost:3000"
echo "=================================================="
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT
wait
