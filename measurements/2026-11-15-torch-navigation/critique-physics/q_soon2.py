import sys
sys.path.insert(0, "<session-dir>/nav-lab/critique-physics")
from plab import *
for a, b, g in (("earth","venus",0.0035), ("earth","venus",0.01), ("earth","mars",0.002), ("earth","mars",0.0035), ("earth","mercury",0.012), ("earth","mercury",0.02)):
    A, B = FN[a], FN[b]; acc = g_to_aud2(g); best = None
    for start in np.arange(2461000.5, 2461000.5 + 800, 10):
        jds = start + np.arange(0, 100, 1.0)
        T = np.array([free_space_T(A, B, j, acc)["T"] for j in jds]); arr = jds + T; i = int(np.argmin(arr))
        if best is None or arr[0] - arr[i] > best[0]: best = (arr[0] - arr[i], start, i, T[0], T[i])
    print(f"{a}-{b} {g} g (free-space est): first-day T={best[3]:.1f} d; best later departure +{best[2]} d arrives {best[0]:.2f} d EARLIER (T={best[4]:.1f} d)")
