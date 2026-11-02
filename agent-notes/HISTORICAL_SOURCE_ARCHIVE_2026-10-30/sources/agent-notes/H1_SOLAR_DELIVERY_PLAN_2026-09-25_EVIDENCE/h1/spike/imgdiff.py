# mean-abs pixel diff over the 3D canvas region (x>=352) and over the Sun disc box; prints per-pair values
import sys
from PIL import Image, ImageChops, ImageStat
D = '/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/spike/shots/'
pairs = [p.split(':') for p in sys.argv[1:]]
for a, b in pairs:
    A = Image.open(D + a + '.png').convert('RGB'); B = Image.open(D + b + '.png').convert('RGB')
    out = []
    for name, box in [('canvas', (352, 0, 1280, 800)), ('sunbox', (560, 150, 1070, 650))]:
        d = ImageChops.difference(A.crop(box), B.crop(box)); st = ImageStat.Stat(d)
        frac = sum(1 for px in d.convert('L').getdata() if px > 24) / (d.size[0] * d.size[1])
        out.append(f"{name}: meanAbs={sum(st.mean)/3:.2f} frac>24={frac:.3f}")
    ma = ImageStat.Stat(A.crop((560, 150, 1070, 650))).mean; mb = ImageStat.Stat(B.crop((560, 150, 1070, 650))).mean
    print(f"{a} vs {b}: " + ' | '.join(out) + f" | sunbox meanRGB {[round(x) for x in ma]} -> {[round(x) for x in mb]}")
