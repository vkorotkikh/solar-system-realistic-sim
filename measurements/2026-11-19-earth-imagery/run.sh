#!/usr/bin/env bash
# Rebuild the NASA-imagery Earth report from scratch: screenshots, startup timings, report/.
#
#   measurements/2026-11-19-earth-imagery/run.sh <after checkout> <before checkout> [startup runs]
#
# <after> is a checkout of the branch to show (feat/earth-nasa-imagery), <before> one of the
# commit to compare against (for example the branch's merge base). Both need node_modules
# (npm ci). Run it from this lab branch's checkout, which also needs npm ci for Playwright,
# with Node 22 on PATH. Everything runs headless; GPU=0 uses SwiftShader instead of the GPU.
# Output: captures/, captures-before/, output-*.txt and report/ (open report/index.html).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
after="$(cd "${1:?after checkout}" && pwd)"
before="$(cd "${2:?before checkout}" && pwd)"
runs="${3:-5}"
after_port="${AFTER_PORT:-5191}"
before_port="${BEFORE_PORT:-5192}"

pids=()
stop() { for pid in "${pids[@]}"; do kill "$pid" 2>/dev/null || true; done; }
trap stop EXIT
serve() {
  [ -x "$1/node_modules/.bin/vite" ] || { echo "no node_modules in $1: run npm ci there" >&2; exit 1; }
  (cd "$1" && exec node_modules/.bin/vite --host 127.0.0.1 --port "$2" --strictPort) > "$here/output-server-$2.log" 2>&1 &
  pids+=("$!")
}
serve "$after" "$after_port"
serve "$before" "$before_port"
for port in "$after_port" "$before_port"; do
  for _ in $(seq 60); do curl -sf -o /dev/null "http://127.0.0.1:$port/" && break; sleep 1; done
  curl -sf -o /dev/null "http://127.0.0.1:$port/" || { echo "dev server on $port did not start" >&2; exit 1; }
done

{
  echo "date $(date -u +%Y-%m-%dT%H:%MZ)"
  echo "after $(git -C "$after" rev-parse --abbrev-ref HEAD) $(git -C "$after" rev-parse --short HEAD)"
  echo "before $(git -C "$before" rev-parse --short HEAD)"
  echo "load $(cut -d' ' -f1-3 /proc/loadavg)"
} > "$here/output-meta.txt"
rm -rf "$here/captures" "$here/captures-before"
node "$here/capture.mjs" "http://127.0.0.1:$after_port/" "$here/captures" | tee "$here/output-capture.txt"
SHOTS='^0(1|2)-' node "$here/capture.mjs" "http://127.0.0.1:$before_port/" "$here/captures-before" | tee "$here/output-capture-before.txt"
node "$here/../2026-11-14-preload-cost/startup.mjs" "before=http://127.0.0.1:$before_port/" "after=http://127.0.0.1:$after_port/" "$runs" | tee "$here/output-startup.txt"
node "$here/report.mjs" "$after"
echo "report: $here/report/index.html"
