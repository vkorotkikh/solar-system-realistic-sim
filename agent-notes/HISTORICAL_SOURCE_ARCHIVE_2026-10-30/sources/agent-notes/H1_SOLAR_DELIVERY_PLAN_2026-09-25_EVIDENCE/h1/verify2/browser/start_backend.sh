#!/bin/bash
# usage: start_backend.sh <worktree> <tag> [cors-origins]; writes $V/<tag>-backend.pid (exact python PID)
set -u
SP=/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad
V=$SP/h1/verify2/browser
if ss -ltnp | grep -E '(127\.0\.0\.1|0\.0\.0\.0|\*|\[::\]):8042\s'; then echo "PORT 8042 BUSY - not starting"; exit 3; fi
WT=$1; TAG=$2; CORS=${3:-}
cd $WT/backend
if [ -n "$CORS" ]; then ENVSET="SOLAR_CORS_ALLOWED_ORIGINS=$CORS"; else ENVSET=""; fi
nohup setsid env -u SOLAR_CORS_ALLOWED_ORIGINS PYTHONDONTWRITEBYTECODE=1 $ENVSET bash -c "echo \$\$ > $V/$TAG-backend.pid; exec $SP/venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port 8042" > $V/$TAG-backend.log 2>&1 < /dev/null &
for i in $(seq 1 120); do c=$(curl -s -m 1 -o /dev/null -w '%{http_code}' http://127.0.0.1:8042/health); [ "$c" = 200 ] && break; sleep 0.5; done
P=$(cat $V/$TAG-backend.pid); echo "backend $TAG pid $P health=$c cors='${CORS}'"; ss -ltnp | grep -E '127\.0\.0\.1:8042\s'; tr '\0' '\n' < /proc/$P/environ | grep SOLAR_CORS || echo "(no SOLAR_CORS env)"; tail -5 $V/$TAG-backend.log
