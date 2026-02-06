
#!/bin/bash

# Kill ports 8000 and 3000 just in case
fuser -k 8000/tcp
fuser -k 3000/tcp

echo "Starting Backend (Port 8000)..."
uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload > backend.log 2>&1 &
BACKEND_PID=$!
echo "Backend PID: $BACKEND_PID"

echo "Starting Web UI (Port 3000)..."
cd web-config
npm run dev > ../frontend.log 2>&1 &
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
