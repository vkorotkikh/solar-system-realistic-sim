"""Byte breakdown of the /solar/physics payload by section, and share the frontend never reads."""
import json, sys
s = json.load(open(sys.argv[1])); total = len(json.dumps(s))
L = lambda o: len(json.dumps(o))
feats = s["corona"]["features"]
used_f = {"id","kind","brightness","expansion_speed_kms","peak_extent_solar_radii","arc","base_dir","paired_dir","emergence","active_region_id","region_id"}
f_arc = sum(L(f["arc"]) for f in feats)
f_unused = sum(L({k: v for k, v in f.items() if k not in used_f}) for f in feats)
pf = s["pfss_field_lines"]; pf_arc = sum(L(l["arc"]) for l in pf["lines"])
ps = s["heliosphere"]["parker_spiral"]; ps_arc = sum(L(l["arc"]) for l in ps["lines"])
rows = {"total": total, "corona.features": L(feats), "  corona arcs": f_arc, "  of which fields never read by frontend": f_unused,
        "pfss_field_lines": L(pf), "  pfss arcs": pf_arc, "heliosphere.parker_spiral": L(ps), "  parker arcs": ps_arc,
        "coronal_holes": L(s["coronal_holes"]), "data_assimilation": L(s["data_assimilation"]), "surface (never read)": L(s["surface"])}
for k, v in rows.items(): print(f"{k:45s} {v:8d}  {100*v/total:5.1f}%")
