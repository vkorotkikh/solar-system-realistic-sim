"""Verifier probe for SCN-057: do the dormant SRP / galactic-tide callbacks accept REBOUND's actual callback argument?
Registers an observer wrapper on a real rebound.Simulation and forwards the unmodified argument into each helper."""
import json, sys, subprocess
from pathlib import Path
ROOT = Path(sys.argv[1]).resolve(); sys.path.insert(0, str(ROOT / 'backend'))
import rebound
from sim.radiation_pressure import rebound_radiation_pressure_callback
from sim.galactic_tide import rebound_galactic_tide_callback, combined_forces_callback
out = {'head': subprocess.run(['git', '-C', str(ROOT), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip(),
       'rebound_version': rebound.__version__, 'callbacks': {}}
for name, cb in [('radiation', rebound_radiation_pressure_callback), ('galactic', rebound_galactic_tide_callback), ('combined', combined_forces_callback)]:
    s = rebound.Simulation(); s.units = ('yr', 'AU', 'Msun'); s.add(m=1); s.add(a=10000)
    seen, errors = [], []
    def observe(arg):
        if errors or len(seen) > 3: return
        seen.append(type(arg).__name__)
        try: cb(arg)
        except Exception as e: errors.append(type(e).__name__ + ': ' + str(e))
    s.additional_forces = observe; s.integrate(.0001)
    # What works: dereference the pointer the way REBOUND documents (arg.contents).
    s2 = rebound.Simulation(); s2.units = ('yr', 'AU', 'Msun'); s2.add(m=1); s2.add(a=10000)
    deref_errors = []
    def observe2(arg):
        if deref_errors: return
        try: cb(arg.contents)
        except Exception as e: deref_errors.append(type(e).__name__ + ': ' + str(e))
    s2.additional_forces = observe2; s2.integrate(.0001)
    out['callbacks'][name] = {'actual_argument_types': sorted(set(seen)), 'errors_with_actual_argument': errors, 'errors_with_arg_contents': deref_errors}
print(json.dumps(out, indent=2))
