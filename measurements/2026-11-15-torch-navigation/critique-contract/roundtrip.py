from common import *
from datetime import date
from planner.trips import date_to_jd
first = date_to_jd(date(2026, 11, 15)); n = 3000
g = 1.0
out = [free_T("earth", "mars", first + i, g) for i in range(n)]
best_out = int(np.argmin(out))
print(f"best one-way day = +{best_out} d (T_out {out[best_out]:.2f} d); first-day T_out = {out[0]:.2f} d")
for stay in (30, 200, 500, 780):
    tot = []
    for i in range(n):
        d = first + i + out[i] + stay
        tot.append(out[i] + free_T("mars", "earth", d, g))
    j = int(np.argmin(tot))
    # design: outbound = best-ranked one-way day, return = best-ranked day inside the stay range (exact stay -> one day)
    i = best_out
    design = out[i] + free_T("mars", "earth", first + i + out[i] + stay, g)
    soon = tot[0]
    print(f"stay {stay:4d} d: joint optimum leaves +{j:4d} d, flight total {tot[j]:.2f} d;  design's 'cheapest' (best one-way outbound + its return) {design:.2f} d  ({100*(design/tot[j]-1):+.0f}%);  first-day pair {soon:.2f} d")
