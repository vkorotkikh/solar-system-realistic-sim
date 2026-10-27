"""Capture non-mutating frontend checks against an extracted branch snapshot."""
import json
import os
import subprocess
import sys
import time
from pathlib import Path

snapshot, label, tool_bin = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
output = Path(__file__).resolve().parent
env = dict(os.environ, PATH=str(tool_bin) + os.pathsep + os.environ["PATH"])
commands = [
    ["node", "--version"], ["npm", "--version"],
    ["npm", "test"], ["npm", "run", "typecheck"], ["npm", "run", "build"],
    ["npm", "run", "verify:planet-positions"], ["npm", "run", "verify:moon-frames"],
    ["npm", "audit", "--json"],
]
if (snapshot / "scripts/ci/typescript-error-ratchet.mjs").exists():
    # The script .test.mjs files import Vitest and already run under npm test;
    # Node's native test runner is not their supported harness.
    commands += [["npm", "run", "typecheck:ratchet"]]
results = []
for index, command in enumerate(commands):
    name = '-'.join(command[:3]).replace(':', '-').replace('/', '-')
    log = output / f"{label}-{index:02d}-{name}.log"
    started = time.monotonic()
    try:
        with log.open("w") as stream:
            run = subprocess.run(command, cwd=snapshot, env=env, stdout=stream,
                                 stderr=subprocess.STDOUT, timeout=180)
        code = run.returncode
    except subprocess.TimeoutExpired:
        code = 124
    result = {"command": command, "returncode": code,
              "seconds": round(time.monotonic() - started, 3), "log": log.name}
    results.append(result)
    print(json.dumps(result), flush=True)
    (output / f"{label}-frontend-checks.json").write_text(json.dumps(results, indent=2) + "\n")
