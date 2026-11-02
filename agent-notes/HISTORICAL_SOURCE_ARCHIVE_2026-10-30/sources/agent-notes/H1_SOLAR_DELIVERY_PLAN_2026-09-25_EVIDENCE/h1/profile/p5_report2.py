"""Per key x offset: '=' identical; else 'max%/p95%/frac>1%' of numeric leaves (scaled by key max |x|), + J=id jaccard."""
import json, sys
P = "/tmp/claude-1000/-home-nomad-ai-projects-repositories-solar-system-realistic-sim/3e06ef45-898e-459a-9e2c-307d6a081174/scratchpad/h1/profile"
SKIP = {"schema", "model", "fidelity", "forcing", "live_data_enabled", "source", "solar_radius_au", "solar_radius_km", "surface"}
for tag in sys.argv[1:]:
    d = json.load(open(f"{P}/jd_{tag}.json"))
    offs = list(d["offsets"])
    keys = [k for k in sorted(d["offsets"][offs[0]]["diff"]) if k not in SKIP]
    print(f"\n### {tag} base_jd={d['base_jd']} netmode={d['netmode']} live={d['live']}   cell = max% / p95% / frac_leaves>1%  [J=id-jaccard]")
    print(f"{'key':26s}" + "".join(f"{o:>21s}" for o in offs))
    for k in keys:
        cells = []
        for o in offs:
            v = d["offsets"][o]["diff"][k]
            if not v["changed"]:
                cells.append("="); continue
            c = f"{100*v['max_rel_scaled']:.2g}/{100*v.get('p95_scaled',0):.2g}/{v.get('frac_leaves_gt1pct',0):.2f}"
            jac = v.get("id_jaccard") or {}
            if jac: c += " J" + "/".join(f"{x:.2f}" for x in jac.values())
            elif v.get("struct"): c += " S"
            cells.append(c)
        print(f"{k:26s}" + "".join(f"{c:>21s}" for c in cells))
    print("unchanged keys (all offsets):", [k for k in sorted(SKIP) if all(not d['offsets'][o]['diff'][k]['changed'] for o in offs)])
    print("feature_count:", {o: d["offsets"][o]["feature_count"] for o in offs})
    print("activity:", {o: round(d["offsets"][o]["activity_index"], 6) for o in offs})
    for k in ("coronal_holes", "pfss.meta", "assim.sources", "assim.source_status", "corona.features", "pfss.lines"):
        for o in offs:
            v = d["offsets"][o]["diff"].get(k)
            if v and v.get("struct"):
                print(f"   struct {k} @{o}: {v['struct'][:3]}"); break
