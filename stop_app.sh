#!/bin/bash

# Stop Script for YOLOv11 Inference System

# Define colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🛑 Stopping YOLOv11 Inference System...${NC}"

# 1. Stop the Launcher Script
if pgrep -f "run_app.sh" > /dev/null; then
    pkill -f "run_app.sh"
    echo -e "   ✅ Launcher (run_app.sh) stopped"
else
    echo -e "   Launcher not active"
fi

# 2. Stop the Backend (Uvicorn)
if pgrep -f "uvicorn backend.main:app" > /dev/null; then
    pkill -f "uvicorn backend.main:app"
    echo -e "   ✅ Backend (Uvicorn) stopped"
else
    echo -e "   Backend not active"
fi

# 3. Stop the Frontend (Next.js server)
if pgrep -f "next-server" > /dev/null; then
    pkill -f "next-server"
    echo -e "   ✅ Frontend (Next.js) stopped"
else
    echo -e "   Frontend not active"
fi

echo -e "${GREEN}✅ System Shutdown Complete.${NC}"
