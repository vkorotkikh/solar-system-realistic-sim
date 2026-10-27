"""Verifier probe for SCN-054 (Kuiper binary initializer) and SCN-055 (Tudat energy origins).
Read-only; no network; runs the actual helpers on injected states. Exit 0 = observations captured."""
import json, math, sys, subprocess, urllib.request
from pathlib import Path
ROOT = Path(sys.argv[1]).resolve(); sys.path.insert(0, str(ROOT / 'backend'))
def no_network(*a, **k): raise RuntimeError('network disabled')
urllib.request.urlopen = no_network
import numpy as np
from sim.kuiper import KuiperBeltEngine
from sim.tudatpy_hooks import TudatPyEngine
out = {'head': subprocess.run(['git', '-C', str(ROOT), 'rev-parse', '--short', 'HEAD'], capture_output=True, text=True).stdout.strip()}
AU_KM = 149597870.7
q = 0.35
mu = 4 * math.pi ** 2 * KuiperBeltEngine.NOMINAL_BINARY_TOTAL_MASS_MSUN
rows = []
for km in [1000, 5000, 14960, 20000, 200000]:
    a = km / AU_KM
    pp, cp, pv, cv = KuiperBeltEngine._binary_relative_state((43, 0, 0), (0, 1, 0), a, 0, 0, 0, q)
    relv = np.array(cv) - np.array(pv); relp = np.array(cp) - np.array(pp)
    expected = math.sqrt(mu / a)
    actual = float(np.linalg.norm(relv))
    com = (np.array(pp) + q * np.array(cp)) / (1 + q)
    comv = (np.array(pv) + q * np.array(cv)) / (1 + q)
    rows.append({'sep_km': km, 'separation_realised_km': float(np.linalg.norm(relp)) * AU_KM,
                 'relative_speed_au_yr': actual, 'expected_circular_au_yr': expected,
                 'expected_over_actual': expected / actual,
                 'floor_active': a ** 3 < 1e-12,
                 'com_offset_km_q_is_companion_over_primary': (com * AU_KM).tolist(),
                 'com_velocity_au_yr': comv.tolist()})
out['scn054_binary_initializer'] = {'mass_ratio_q': q, 'nominal_total_mass_msun': KuiperBeltEngine.NOMINAL_BINARY_TOTAL_MASS_MSUN,
                                     'sep_min_au': KuiperBeltEngine.BINARY_SEP_MIN_AU, 'floor_threshold_km': 1e-4 * AU_KM, 'rows': rows}
t = TudatPyEngine(); t._body_ids = ['sun', 'earth']; t._spice_names = ['Sun', 'Earth']
t._stored_bodies = [{'id': 'sun', 'mass_kg': 1.989e30}, {'id': 'earth', 'mass_kg': 5.972e24}]
base = np.array([0, 0, 0, 0, 0, 0, 149597870700, 0, 0, 0, 29780, 0], dtype=float)
t._current_state = base.copy(); e0 = t.get_energy()
t._current_state[:3] = [.01 * 149597870700, 0, 0]; e1 = t.get_energy()
out['scn055_tudat_energy_translation'] = {'sun_at_ssb_energy_j': e0, 'sun_offset_0_01au_energy_j': e1,
                                           'relative_change': (e1 - e0) / abs(e0), 'expected_change': 0.0,
                                           'note': 'Injected documented mixed-origin Tudat state (Sun rel. SSB, Earth rel. Sun); get_energy subtracts them directly.'}
print(json.dumps(out, indent=2))
