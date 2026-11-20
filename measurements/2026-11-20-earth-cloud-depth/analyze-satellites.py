"""Count satellite-marker pixels on Earth's disk that the clouds change (S vs N), with the
markers found as pixels where N (satellites, no clouds) differs from Z (neither). A marker's
edge pixels are antialiased and blend with what lies behind, so they change with the clouds even
when the marker is drawn on top; "interior" drops pixels within one pixel of the marker's edge.
Usage: python -I analyze-satellites.py <capture dir>"""
import json
from pathlib import Path
import sys

import numpy as np
from PIL import Image

out = Path(sys.argv[1])
views = json.loads((out / 'views.json').read_text())
load = lambda name, v: np.asarray(Image.open(out / f'{name}-{v}.png').convert('RGB'), int)
print('view                    in front  marker px  covered  interior px  interior covered')
for view in views:
    z, n, s = (load(view['name'], v) for v in 'ZNS')
    h, w = z.shape[:2]
    y, x = np.mgrid[:h, :w]
    disk = np.hypot(x - w / 2, y - h / 2) < 0.95 * view['fill'] * h / 2
    marker = (np.abs(n - z).max(axis=2) > 8) & disk
    changed = np.abs(s - n).max(axis=2) > 8
    interior = marker.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            interior &= np.roll(np.roll(marker, dy, 0), dx, 1)
    print(f"{view['name']:23s} {view['markersInFront']:8d}  {int(marker.sum()):9d} {int((marker & changed).sum()):8d}"
          f"  {int(interior.sum()):11d} {int((interior & changed).sum()):17d}")
