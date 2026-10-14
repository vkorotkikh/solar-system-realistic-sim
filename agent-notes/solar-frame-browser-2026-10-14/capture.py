"""Headful hardware oracle. Missing GPU/browser is an error, never a pass.

Start Vite on 127.0.0.1:5187; run with uv --with playwright --with pillow.
GALLIUM_DRIVER=d3d12 LD_LIBRARY_PATH=/usr/lib/wsl/lib are inherited by Chromium.
"""
import importlib.metadata
import json
import math
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
reference = json.loads((ROOT / "backend/tests/fixtures/solar_frames/cspice_solar_frame.json").read_text())
CHROME = "/home/nomad/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome"
report = {"schema": "solar-hardware-screen-oracle-v1", "browser_executable": CHROME,
          "playwright_version": importlib.metadata.version("playwright"),
          "headless": False, "pixel_budget": 1.0, "cases": [], "negative_controls": []}


def compare_pixels(path, case):
    image = Image.open(path).convert("RGB")
    pixels = image.load()
    by_color = {tuple(sample["rgb"]): [] for sample in case["samples"]}
    # Color IDs have red >=210. Surface oracle codes use only 40 and 160.
    for y in range(image.height):
        for x in range(image.width):
            rgb = pixels[x, y]
            if rgb[0] < 205:
                continue
            for target in by_color:
                if max(abs(a-b) for a,b in zip(rgb,target)) <= 2:
                    by_color[target].append((x+.5,y+.5))
                    break
    results = []
    failures = []
    for sample in case["samples"]:
        detected = by_color[tuple(sample["rgb"])]
        item = {"name":sample["name"], "visible":sample["visible"],
                "robust_visibility":sample["robust_visibility"], "pixels":len(detected)}
        if detected:
            center = [sum(p[i] for p in detected)/len(detected) for i in (0,1)]
            item["centroid"] = center
            item["error_pixels"] = math.dist(center,sample["pixel"])
        expected_pixels=sample['footprint_pixels']
        item['expected_footprint_pixels']=len(expected_pixels)
        if expected_pixels and detected:
            expected_center=[sum(p[i]+.5 for p in expected_pixels)/len(expected_pixels) for i in (0,1)]
            item['footprint_centroid_error_pixels']=math.dist(center,expected_center)
            actual_pixels=[(int(p[0]),int(p[1])) for p in detected]
            # One-pixel rasterization budget, in both directions. This also
            # gates every partial limb footprint rather than dropping it.
            def covered(source,target):
                return all(any(max(abs(a-c),abs(b-d)) <= 1 for c,d in target) for a,b in source)
            item['footprint_passed']=(item['footprint_centroid_error_pixels'] <= 1
                                     and covered(actual_pixels,expected_pixels)
                                     and covered(expected_pixels,actual_pixels))
        else:
            item['footprint_passed']=not expected_pixels and not detected
        if not item['footprint_passed']:
            failures.append(sample['name']+': independent footprint')
        if sample["robust_visibility"]:
            if sample["visible"] and (not detected or item["error_pixels"] > 1):
                failures.append(sample["name"]+": projection")
            if not sample["visible"] and detected:
                failures.append(sample["name"]+": occlusion")
        results.append(item)
    surface_failures = []
    for probe in case["surface_samples"]:
        x,y=probe["pixel"]
        if max(abs(a-b) for a,b in zip(pixels[x,y],probe["rgb"])) > 2:
            surface_failures.append({"pixel":[x,y],"actual":pixels[x,y],"expected":probe["rgb"]})
    return {"markers":results,"failures":failures,"surface_probes":len(case["surface_samples"]),
            "surface_failures":surface_failures,"passed":not failures and not surface_failures}


with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=CHROME,headless=False,
        args=['--use-gl=angle','--use-angle=gl','--no-sandbox'])
    try:
        page=browser.new_page(viewport={"width":800,"height":600},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda error: errors.append(str(error)))
        page.on('console',lambda msg: errors.append(msg.text) if msg.type=='error' else None)
        page.goto('http://127.0.0.1:5187/agent-notes/solar-frame-browser-2026-10-14/index.html',wait_until='networkidle',timeout=30000)
        page.wait_for_function('window.solarFrameReady === true',timeout=30000)
        report['hardware']=page.evaluate('window.solarFrameHardware')
        hardware=report['hardware']['renderer'] or ''
        if 'NVIDIA' not in hardware.upper() or '5090' not in hardware or 'swiftshader' in hardware.lower():
            raise RuntimeError(f'Required RTX5090 hardware not confirmed: {hardware}')
        report['browser_version']=browser.version
        for index,case in enumerate(reference['cases']):
            result=page.evaluate('i=>window.runSolarFrameCase(i)',index)
            path=HERE/f'case-{index}.png'
            page.locator('canvas').screenshot(path=str(path))
            report['cases'].append({"index":index,"jd_tdb":case['jd_tdb'],"input_frame":case['input_frame'],
                                    "webgl_error":result['webglError'],**compare_pixels(path,case)})
        for mode,index in [('legacy_axis',0),('double_spin',3),('handedness',2)]:
            page.evaluate('v=>window.runSolarFrameCase(v.index,v.mode)',{'index':index,'mode':mode})
            path=HERE/f'negative-{mode}.png'
            page.locator('canvas').screenshot(path=str(path))
            report['negative_controls'].append({'mode':mode,'index':index,**compare_pixels(path,reference['cases'][index])})
        report['console_errors']=errors
        report['passed']=(not errors and all(case['passed'] and case['webgl_error']==0 for case in report['cases'])
                          and all(not case['passed'] for case in report['negative_controls']))
    finally:
        browser.close()
(HERE/'results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({"passed":report['passed'],"hardware":report['hardware'],
                  "cases":[{"index":x['index'],"passed":x['passed'],"failures":x['failures'],"surface_failures":x['surface_failures']} for x in report['cases']],
                  "negative_controls":[{"mode":x['mode'],"detected":not x['passed']} for x in report['negative_controls']],
                  "console_errors":report['console_errors']},indent=2))
if not report['passed']:
    raise SystemExit(1)
