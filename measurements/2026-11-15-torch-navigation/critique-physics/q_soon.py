import sys
sys.path.insert(0, "<session-dir>/nav-lab/critique-physics")
from plab import *
# claim 5: soonest (first-day departure) vs earliest arrival, free-space estimate E1 (within 0.24%-0.7% of solved at >=0.3 g)
def scan(a, b, g, start, ndays):
    A, B = FN[a], FN[b]; acc = g_to_aud2(g)
    jds = start + np.arange(ndays); T = np.array([free_space_T(A, B, j, acc)["T"] for j in jds])
    return jds, T
print("pair g | window | first-day leave: T d, arrives +d | earliest arrival leaves +d later, T d, arrives earlier by d | fastest leaves +d, T")
for a, b, g, win in (("earth","mars",1.0,60), ("earth","mars",0.3,60), ("earth","mars",0.1,60), ("earth","mars",0.03,90), ("earth","mars",0.01,90), ("earth","jupiter",0.01,90), ("earth","venus",0.03,90), ("earth","venus",0.1,60), ("earth","mercury",0.1,60), ("earth","mercury",0.03,90)):
    worst = None
    for start in np.arange(2461000.5, 2461000.5 + 800, 25):
        jds, T = scan(a, b, g, start, win)
        arr = jds + T
        i = int(np.argmin(arr)); j = int(np.argmin(T))
        gain = arr[0] - arr[i]
        if worst is None or gain > worst[0]: worst = (gain, start, i, T[0], T[i], j, T[j])
    gain, start, i, T0, Ti, j, Tj = worst
    print(f"{a}-{b} {g}g | {win} d | T0={T0:.2f} | earliest arrival: leave +{i} d, T={Ti:.2f}, earlier by {gain:.2f} d ({100*gain/T0:.0f}% of the first-day flight) | fastest flight leaves +{j} d, T={Tj:.2f}")
