"""Summarise jd_<tag>.json: per key x offset -> '=' identical, else max_rel_scaled% (and id-jaccard)."""
import json, sys
P = "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/profile"
for tag in sys.argv[1:]:
    d = json.load(open(f"{P}/jd_{tag}.json"))
    offs = list(d["offsets"])
    keys = sorted(d["offsets"][offs[0]]["diff"])
    print(f"\n### {tag} (netmode={d['netmode']} live={d['live']})  cell = max_rel_scaled % | J=jaccard(ids) | S=structural")
    print(f"{'key':28s}" + "".join(f"{o:>16s}" for o in offs))
    for k in keys:
        cells = []
        for o in offs:
            v = d["offsets"][o]["diff"][k]
            if not v["changed"]:
                cells.append("=")
                continue
            c = f"{100*v['max_rel_scaled']:.3g}%" if v.get("max_rel_scaled") not in (None,) else "?"
            jac = v.get("id_jaccard") or {}
            if jac:
                c += " J" + "/".join(f"{x:.2f}" for x in jac.values())
            elif v.get("struct"):
                c += " S"
            cells.append(c)
        print(f"{k:28s}" + "".join(f"{c:>16s}" for c in cells))
    print("feature_count:", {o: d["offsets"][o]["feature_count"] for o in offs})
    print("activity:", {o: round(d["offsets"][o]["activity_index"], 6) for o in offs})
    print("build_s:", {o: d["offsets"][o]["build_s"] for o in offs})
    # struct samples for a few keys
    for k in ("coronal_holes", "pfss.meta", "assim.indices", "surface", "heliosphere"):
        for o in offs:
            v = d["offsets"][o]["diff"].get(k)
            if v and v.get("struct"):
                print(f"   struct {k} @{o}: {v['struct'][:3]}")
                break
