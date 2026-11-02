#!/bin/bash
# usage: start_backend.sh <tag> [ENV=VAL ...]   -> starts uvicorn on 127.0.0.1:8073, writes pid to $OUT/backend.pid
SP=/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad
OUT=$SP/h1/spike; TAG=$1; shift
cd $SP/wt-h1-spike/backend
env "$@" nohup $SP/venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8073 > $OUT/backend_$TAG.log 2>&1 &
echo $! > $OUT/backend.pid
echo "backend pid $(cat $OUT/backend.pid) tag=$TAG"
