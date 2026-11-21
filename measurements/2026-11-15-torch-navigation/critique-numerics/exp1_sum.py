import json, numpy as np, collections
res = json.load(open("exp1.json"))
names = [k for k in res[0] if k not in ("pair","jd","g","conj")]
ref = "complex/strict"
print(f"{len(res)} trips")
print(f"{'config':16s} ok   fails(msg)                      med/max it  Tdiff-vs-complex/strict: med / max   er km med/p99/max   ev m/s max")
for n in names:
    rows = [r[n] for r in res]
    ok = [x for x in rows if x["ok"]]
    msgs = collections.Counter(x["msg"] for x in rows if not x["ok"])
    its = np.array([x["it"] for x in ok])
    dT = []
    for r in res:
        if r[n]["ok"] and r[ref]["ok"]: dT.append(abs(r[n]["T"]/r[ref]["T"]-1))
    dT = np.array(dT)
    er = np.array([x["er"] for x in ok if "er" in x]); ev = np.array([x["ev"] for x in ok if "ev" in x])
    print(f"{n:16s} {len(ok):3d}  {str(dict(msgs)):32s} {np.median(its):.0f}/{its.max():.0f}   {np.median(dT):.1e} / {dT.max():.1e}   {np.median(er):.1e}/{np.percentile(er,99):.1e}/{er.max():.1e}  {ev.max():.1e}")
# which trips fail where
for n in names:
    bad = [(r["pair"], round(r["jd"]), r["g"], r["conj"], r[n]["msg"]) for r in res if not r[n]["ok"]]
    if bad: print(n, bad[:12])
# same-root check: complex/FAST vs fd/FAST T differences > 1e-6
for n in ("fd1e-7/FAST","fd1e-6/FAST"):
    diff = [(r["pair"], round(r["jd"]), r["g"], r[n]["T"], r["complex/FAST"]["T"]) for r in res if r[n]["ok"] and r["complex/FAST"]["ok"] and abs(r[n]["T"]/r["complex/FAST"]["T"]-1) > 1e-6]
    print(n, "different-root cases vs complex/FAST:", len(diff), diff[:5])
