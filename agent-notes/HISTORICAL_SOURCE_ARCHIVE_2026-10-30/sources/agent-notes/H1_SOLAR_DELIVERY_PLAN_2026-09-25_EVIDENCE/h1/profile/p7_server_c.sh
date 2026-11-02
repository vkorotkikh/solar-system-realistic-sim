#!/usr/bin/env bash
# Step 7: real uvicorn on 127.0.0.1:8071 (defaults, no reload, live upstream), default frontend request.
set -u
SP=/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad
OUT=$SP/h1/profile/server_run3
mkdir -p $OUT
PORT=8071
BASE=http://127.0.0.1:$PORT
J0=2461308.60
cd $SP/wt-h1/backend
$SP/venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port $PORT > $OUT/uvicorn.log 2>&1 &
UPID=$!
echo "uvicorn pid $UPID" | tee $OUT/pid.txt
for i in $(seq 1 60); do curl -s -o /dev/null -m 1 $BASE/health && break; sleep 0.25; done
now() { date +%s.%N; }
T0=$(now)
ts() { python3 -c "print(f'{$(now)-$T0:7.2f}')"; }
q() { # $1=label $2=jd $3=extra curl args
  local label=$1 jd=$2; shift 2
  local r
  r=$(curl -s -o $OUT/body_$label.json -w '%{http_code} %{time_total} %{size_download}' "$@" \
      -H 'Origin: http://localhost:5173' \
      "$BASE/solar/physics?jd=$jd&fidelity=high&max_features=180&forcing=hybrid&live_data=true")
  local rc=$?
  echo "t=$(ts) $label jd=$jd -> $r curl_rc=$rc detail=$(head -c 90 $OUT/body_$label.json 2>/dev/null | tr -d '\n' | grep -o '"detail":"[^"]*"' )"
}
probe() { # cheap slot probe: preview/synthetic/no-live, fixed jd (PFSS cache hit after first call)
  local r
  r=$(curl -s -o $OUT/probe.json -w '%{http_code} %{time_total}' \
      "$BASE/solar/physics?jd=2461300.25&fidelity=preview&max_features=64&forcing=synthetic&live_data=false")
  echo "t=$(ts) probe -> $r"
}
jd() { python3 -c "print(f'{$J0 + $1*1e-4:.8f}')"; }

probe; probe
echo "== phase A: 2 client-aborted requests (curl -m 2), then a third immediately, then probe every 0.5 s"
TA=$(now)
q abort1 $(jd 51) -m 2 & A1=$!
q abort2 $(jd 52) -m 2 & A2=$!
wait $A1 $A2
echo "t=$(ts) both aborted clients have exited ($(python3 -c "print(f'{$(now)-$TA:.2f}')") s after launch)"
q third $(jd 53)
for i in $(seq 1 30); do
  r=$(curl -s -o /dev/null -w '%{http_code} %{time_total}' "$BASE/solar/physics?jd=2461300.25&fidelity=preview&max_features=64&forcing=synthetic&live_data=false")
  echo "t=$(ts) probe -> $r"
  case "$r" in 200*) break;; esac
  sleep 1.4
done
echo "== rate limit bookkeeping: server log tail"
sleep 1
kill $UPID; wait $UPID 2>/dev/null
echo "uvicorn stopped (pid $UPID)"
