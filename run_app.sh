#!/bin/bash



# Proper NVM initialization for non-interactive shells
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

# Force use of Node 22
nvm use 22 || nvm install 22

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
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload --timeout-graceful-shutdown 5 > backend_stdout.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

# Trap immediately to ensure backend is killed if build fails or is cancelled
trap "kill $BACKEND_PID; exit" INT TERM

echo "Starting Web UI (Port 3000) [$MODE]..."
cd web-config


# Resolve absolute paths for node and npm from nvm
NODE_PATH=$(nvm which 22)

# Fallback if nvm fails (e.g. non-interactive shell in Supervisor)
if [ -z "$NODE_PATH" ]; then
    NODE_PATH="/home/pongsak/.nvm/versions/node/v22.14.0/bin/node"
fi

if [ ! -f "$NODE_PATH" ]; then
    echo "ERROR: Node.js executable not found at $NODE_PATH"
    exit 1
fi


NPM_PATH=$(dirname "$NODE_PATH")/npm

# Update PATH to ensure child processes (like next) find the correct node
export PATH="$(dirname "$NODE_PATH"):$PATH"

echo "Using Node: $NODE_PATH"
echo "Using NPM: $NPM_PATH"

if [[ "$SHOULD_BUILD" == "true" ]]; then
    echo "Building Frontend (this may take a while)..."
    "$NODE_PATH" "$NPM_PATH" run build
fi

if [[ "$MODE" == "development" ]]; then
    "$NODE_PATH" "$NPM_PATH" run dev > ../frontend.log 2>&1 &
else
    "$NODE_PATH" "$NPM_PATH" start > ../frontend.log 2>&1 &
fi
FRONTEND_PID=$!
echo "Frontend PID: $FRONTEND_PID"

echo "=================================================="
echo "Application Started!"
echo "Backend Logs: tail -f backend.log (Rotation Enabled) | backend_stdout.log (Startup)"
echo "Frontend Logs: tail -f frontend.log"
echo "Web UI URL: http://localhost:3000"
echo "=================================================="
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM
wait
