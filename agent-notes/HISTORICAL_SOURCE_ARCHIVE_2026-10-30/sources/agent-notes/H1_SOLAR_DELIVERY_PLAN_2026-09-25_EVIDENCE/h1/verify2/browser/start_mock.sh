#!/bin/bash
# usage: start_mock.sh <MODE> <tag> ; refuses to start if anything listens on 127.0.0.1:8042; writes $V/<tag>-mock.pid (exact python PID)
set -u
SP=/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad
V=$SP/h1/verify2/browser
if ss -ltnp | grep -E '(127\.0\.0\.1|0\.0\.0\.0|\*|\[::\]):8042\s'; then echo "PORT 8042 BUSY - not starting"; exit 3; fi
export MODE=$1 PAYLOAD=$SP/h1/upstream/physics_payload.json PNG=$SP/h1/upstream/aia_304_tile_192408248.png LOG=$V/$2-mock-requests.jsonl
nohup setsid bash -c "echo \$\$ > $V/$2-mock.pid; exec $SP/venv/bin/python $V/mock_backend.py" > $V/$2-mock.log 2>&1 < /dev/null &
for i in $(seq 1 30); do curl -s -m 1 -o /dev/null http://127.0.0.1:8042/health && break; sleep 0.3; done
P=$(cat $V/$2-mock.pid); echo "mock $1 pid $P"; ss -ltnp | grep -E '127\.0\.0\.1:8042\s'; cat $V/$2-mock.log
