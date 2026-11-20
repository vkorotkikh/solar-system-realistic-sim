"""Count Earth-disk pixels where the shipped cloud shell (A) or the 1 km control (C) differs from
the depth-test-off reference (B), and so does each depth-offset variant (O...). Usage: python -I analyze.py <capture dir>"""
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

out = Path(sys.argv[1])
views = json.loads((out / 'views.json').read_text())
load = lambda name, v: np.asarray(Image.open(out / f'{name}-{v}.png').convert('RGB'), int)
others = [v for v in views[0]['variants'] if v not in 'BD']
print('view          disk px  cloudy px  ' + '  '.join(f'{v + " lost":>9s}' for v in others) + '  control held')
for view in views:
    b, d = load(view['name'], 'B'), load(view['name'], 'D')
    h, w = b.shape[:2]
    y, x = np.mgrid[:h, :w]
    disk = np.hypot(x - w / 2, y - h / 2) < 0.95 * view['fill'] * h / 2  # inside the limb
    differs = lambda p, q: (np.abs(p - q).max(axis=2) > 2) & disk
    lost = [int(differs(load(view['name'], v), b).sum()) for v in others]
    print(f"{view['name']:12s} {int(disk.sum()):8d} {int(differs(b, d).sum()):10d}  "
          + '  '.join(f'{n:9d}' for n in lost) + f"  {view['controlScaleHeld']:.6g}")
