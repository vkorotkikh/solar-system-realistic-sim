#!/bin/bash
SP=/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad
OUT=$SP/h1/spike
cd $SP/wt-h1-spike
PATH=$SP/nodedist/bin:$PATH nohup ./node_modules/.bin/vite --port 5183 --strictPort --host 127.0.0.1 > $OUT/vite.log 2>&1 &
echo $! > $OUT/vite.pid
echo "vite pid $(cat $OUT/vite.pid)"
