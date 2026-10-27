"""Regenerate independent CSPICE orientation and pinhole-screen oracles.

uv run --python 3.12 --with spiceypy==8.3.0 --with numpy python <this-file>
No production application imports. ET is TDB seconds from J2000, not UTC.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
import spiceypy as spice


HERE = Path(__file__).resolve().parent
KERNEL = HERE / "pck00011.tpc"
spice.furnsh(str(KERNEL))
camera = np.array([6., 4., 8.])
forward = -camera / np.linalg.norm(camera)
right = np.cross(forward, [0., 0., 1.])
right /= np.linalg.norm(right)
up = np.cross(right, forward)
width, height, fov = 800, 600, 20.
f = 1 / np.tan(np.deg2rad(fov / 2))
anchors = []
for lat in (-45, 0, 45):
    for lon in range(0, 360, 45):
        a, b = np.deg2rad([lon, lat])
        anchors.append((f"lon{lon}_lat{lat}", [np.cos(b)*np.cos(a), np.cos(b)*np.sin(a), np.sin(b)]))
anchors += [("north", [0., 0., 1.]), ("south", [0., 0., -1.])]
cases = []
for jd in (2451545., 2451552., 2461326.238888889):
    for frame in ("IAU_SUN", "SOLAR_EQUATORIAL_J2000"):
        et = (jd - 2451545.) * 86400 if frame == "IAU_SUN" else 0.
        matrix = spice.pxform("IAU_SUN", "ECLIPJ2000", et)
        samples = []
        for i, (name, direction) in enumerate(anchors):
            vector = np.array(direction) * 1.03
            world = matrix @ vector
            delta = world - camera
            depth = np.dot(delta, forward)
            pixel = [(np.dot(delta, right) / depth * f / (width/height) + 1)*width/2,
                     (1 - np.dot(delta, up) / depth*f)*height/2]
            # Independent segment/sphere intersection for opaque-photosphere occlusion.
            aa, bb, cc = np.dot(delta, delta), 2*np.dot(camera, delta), np.dot(camera, camera)-1
            disc = bb*bb-4*aa*cc
            near = (-bb-np.sqrt(max(disc, 0)))/(2*aa)
            visible = bool(disc < 0 or near >= 1)
            # A GL point is a 9-pixel billboard, not a mathematical point. Test
            # its entire footprint plus a one-pixel rasterization margin.
            # Partially occulted IDs are reported, not falsely called invisible.
            footprint_visibility = []
            for dy in range(-5, 6):
                for dx in range(-5, 6):
                    px, py = pixel[0]+dx, pixel[1]+dy
                    ray = forward + right*((2*px/width-1)*(width/height)/f) + up*((1-2*py/height)/f)
                    ra, rb = np.dot(ray, ray), 2*np.dot(camera, ray)
                    rd = rb*rb - 4*ra*(np.dot(camera, camera)-1)
                    rt = (-rb-np.sqrt(max(rd, 0)))/(2*ra)
                    footprint_visibility.append(bool(rd < 0 or rt >= depth))
            robust_visibility = len(set(footprint_visibility)) == 1
            # Explicit aliased-GL-point pixel mask also covers partially occulted
            # billboards; they are not excluded from the full footprint gate.
            footprint_pixels = []
            for py in range(int(np.floor(pixel[1]))-4, int(np.floor(pixel[1]))+5):
                for px in range(int(np.floor(pixel[0]))-4, int(np.floor(pixel[0]))+5):
                    ray = forward + right*((2*(px+.5)/width-1)*(width/height)/f) + up*((1-2*(py+.5)/height)/f)
                    ra, rb = np.dot(ray, ray), 2*np.dot(camera, ray)
                    rd = rb*rb - 4*ra*(np.dot(camera, camera)-1)
                    rt = (-rb-np.sqrt(max(rd, 0)))/(2*ra)
                    if rd < 0 or rt >= depth:
                        footprint_pixels.append([px,py])
            rgb = [210+30*(i % 2), 30+55*((i//2) % 4), 25+55*(i//8)]
            samples.append({"name": name, "input": vector.tolist(), "world": world.tolist(),
                            "pixel": pixel, "visible": visible, "robust_visibility": robust_visibility,
                            "rgb": rgb, "footprint_pixels": footprint_pixels})
        surface = []
        surface_matrix = spice.pxform("IAU_SUN", "ECLIPJ2000", (jd-2451545.)*86400)
        for y in range(180, 421, 37):
            for x in range(280, 521, 37):
                ray = forward + right*((2*(x+.5)/width-1)*(width/height)/f) + up*((1-2*(y+.5)/height)/f)
                aa, bb = np.dot(ray, ray), 2*np.dot(camera, ray)
                disc = bb*bb - 4*aa*(np.dot(camera, camera)-1)
                if disc <= 0:
                    continue
                hit = camera + ray*((-bb-np.sqrt(disc))/(2*aa))
                body = surface_matrix.T @ hit
                if min(abs(body)) < .05 or any(s["visible"] and np.linalg.norm(np.array(s["pixel"])-[x+.5,y+.5]) < 12 for s in samples):
                    continue
                surface.append({"pixel": [x, y], "body_normal": body.tolist(),
                                "rgb": [160 if body[2] > 0 else 40, 160 if body[0] > 0 else 40, 160 if body[1] > 0 else 40]})
        cases.append({"jd_tdb": jd, "input_frame": frame, "matrix_row_major": matrix.tolist(), "samples": samples, "surface_samples": surface})
result = {"schema": "cspice-solar-frame-reference-v1", "spiceypy_version": spice.__version__,
          "cspice_version": spice.tkvrsn("TOOLKIT"),
          "kernel_url": "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc",
          "kernel_sha256": hashlib.sha256(KERNEL.read_bytes()).hexdigest(),
          "time_scale": "JDTDB, ET=(JD-2451545)*86400; no UTC substitution",
          "world_frame": "ECLIPJ2000, Cartesian z-up, right-handed",
          "inertial_frame_definition": "IAU_SUN basis frozen at J2000, not rotating Carrington coordinates",
          "camera": {"position": camera.tolist(), "up": [0, 0, 1], "target": [0, 0, 0],
                     "vertical_fov_deg": fov, "width": width, "height": height},
          "photosphere_radius": 1., "cases": cases}
(HERE / "cspice_solar_frame.json").write_text(json.dumps(result, indent=2, allow_nan=False)+'\n')
print(json.dumps({"kernel_sha256": result["kernel_sha256"], "cspice": result["cspice_version"],
                  "cases": len(cases), "samples": sum(len(x["samples"]) for x in cases)}, indent=2))
spice.kclear()
