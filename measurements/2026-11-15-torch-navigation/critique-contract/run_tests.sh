#!/bin/bash
# $1 = label, $2.. = extra pytest args. Never writes under wt-nav: no cache provider, no bytecode.
label=$1; shift
export PYTHONDONTWRITEBYTECODE=1
export PYTHONPATH=<session-dir>/nav-lab/critique-contract:<session-dir>/wt-nav/backend
T=<session-dir>/wt-nav/backend/tests
cd <session-dir>/nav-lab/critique-contract
<venv>/bin/python -B -m pytest -p no:cacheprovider --rootdir=. -c /dev/null "$@" $T/test_planner_*.py -q -x --no-header -p no:randomly > out_$label.txt 2>&1
echo "exit $?" >> out_$label.txt
