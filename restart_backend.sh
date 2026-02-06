#!/bin/bash

echo "Stopping existing backend..."
pkill -f "uvicorn backend.main:app" || echo "Backend not running."

echo "Waiting for ports to clear..."
sleep 2

echo "Starting backend..."
nohup uv run uvicorn backend.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &

echo "Backend started! Logs are being written to backend.log"
echo "You can view logs with: tail -f backend.log"
