"""Exercise actual main/controller scene transforms against frozen CSPICE pixels.

The test-only probe is injected into the served module, never production source.
The fragment material, ID markers and single-sample render target are diagnostic.
The production canvas retains its normal antialiasing. Actual main creates
the scene, Sun, parents, controller, rotations and WebGL renderer. Network-backed
providers are disabled: this is a transform gate, not live delivery/calibration.
"""
from __future__ import annotations

import argparse
import base64
import importlib.metadata
import json
import math
import os
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

PROBE = """
window.__solarMainFrame = {
  scene, renderer, camera, controls, bodyMeshes, bodySpinGroups, sunCtrl, simState,
  updateBodyRotations, disableModelWorkerIntegration,
  stopFrames: () => frameLifecycle.stop()
};
"""

SETUP = r"""async reference => {
  const p = window.__solarMainFrame;
  p.stopFrames(); p.disableModelWorkerIntegration();
  p.simState.paused = true; p.controls.enabled = false;
  const THREE = await import('/node_modules/three/build/three.module.js');
  const { createMagneticFieldLinesFromPFSS } = await import('/src/frontend/features/solar/solarMagnetics.ts');
  const mesh = p.bodyMeshes.get('sun');
  if (!mesh?.isMesh || !mesh.material?.vertexShader) throw new Error('Actual Sun shader mesh missing');
  const spin = p.bodySpinGroups.get('sun');
  const find = id => {
    let found;
    p.scene.traverse(object => { if (object.userData.bodyId === id) found = object; });
    if (!found) throw new Error('Missing actual controller layer ' + id);
    return found;
  };
  const rotating = find('sun-magnetic-field');
  const fixed = find('sun-coronal-loops');
  const fixedQuaternion = fixed.quaternion.clone();
  const savedMaterial = mesh.material;
  const gl = p.renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  // Capture the actual default-AA startup before replacing any material or
  // framebuffer. Every read GL error belongs to an explicit acceptance result.
  const startup = {
    antialias: gl.getContextAttributes().antialias,
    samples: gl.getParameter(gl.SAMPLES),
    programs: p.renderer.info.programs.map(({program}) => ({
      linked: gl.getProgramParameter(program, gl.LINK_STATUS),
      linkLog: gl.getProgramInfoLog(program),
      stages: gl.getAttachedShaders(program).map(shader => ({
        compiled: gl.getShaderParameter(shader, gl.COMPILE_STATUS),
        log: gl.getShaderInfoLog(shader)
      }))
    })),
    webglError: gl.getError()
  };
  const spec = reference.camera;
  // The CSPICE oracle specifies pixel-centre depth and aliased nine-pixel
  // points. An RGBA8 target with raw ID bytes and no MSAA matches that contract;
  // changing the production WebGL context or widening RGB/pixel budgets does not.
  const diagnosticTarget = new THREE.WebGLRenderTarget(spec.width, spec.height, {
    samples: 0, depthBuffer: true, stencilBuffer: false,
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
    colorSpace: THREE.NoColorSpace,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter
  });
  const rgba = new Uint8Array(spec.width * spec.height * 4);
  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = spec.width; captureCanvas.height = spec.height;
  const captureContext = captureCanvas.getContext('2d');
  if (!captureContext) throw new Error('Diagnostic readback canvas unavailable');
  const diagnostic = new THREE.ShaderMaterial({
    vertexShader: savedMaterial.vertexShader, uniforms: savedMaterial.uniforms,
    fragmentShader: `varying vec3 vSunNormal; varying float vLatitude;
      void main(){gl_FragColor=vec4(vec3(vLatitude>0.0?160.0:40.0,
        vSunNormal.x>0.0?160.0:40.0,-vSunNormal.z>0.0?160.0:40.0)/255.0,1.0);}`,
    toneMapped: false
  });
  mesh.material = diagnostic;
  mesh.geometry.computeBoundingSphere();
  const hardware = {
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : null,
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : null,
    version: gl.getParameter(gl.VERSION), antialias: gl.getContextAttributes().antialias,
    startup,
    diagnosticSampling: 'single-sample RGBA8 raw ID/depth target; pixel-centre reference'
  };
  let markers = [];
  const showPath = object => { for (let node=object; node; node=node.parent) node.visible=true; };
  window.runSolarMainFrameCase = (index, mutant='none') => {
    for (const marker of markers) { marker.removeFromParent(); marker.geometry.dispose(); marker.material.dispose(); }
    markers = [];
    const data = reference.cases[index];
    p.simState.julianDate = data.jd_tdb;
    fixed.quaternion.copy(fixedQuaternion);
    mesh.quaternion.identity();
    // Run actual main's handoff as well as the real controller update.
    p.updateBodyRotations(data.jd_tdb);
    p.sunCtrl.update(data.jd_tdb, 0);
    p.scene.updateMatrixWorld(true);
    const center = mesh.getWorldPosition(new THREE.Vector3());
    const scale = mesh.getWorldScale(new THREE.Vector3());
    if (Math.max(scale.x,scale.y,scale.z)-Math.min(scale.x,scale.y,scale.z)>1e-9)
      throw new Error('Unexpected nonuniform actual Sun scale');
    const radius = mesh.geometry.boundingSphere.radius * scale.x;
    if (!(radius>0) || !Number.isFinite(radius)) throw new Error('Invalid actual Sun radius');
    const target = data.input_frame === 'IAU_SUN' ? rotating : fixed;
    const targetScale = target.getWorldScale(new THREE.Vector3());
    if (Math.max(targetScale.x,targetScale.y,targetScale.z)-Math.min(targetScale.x,targetScale.y,targetScale.z)>1e-9)
      throw new Error('Unexpected nonuniform controller layer scale');
    // The frozen oracle specifies visual radii. Invert the enlarged-Sun height
    // mapping for this fixture only: visual 1.03 requires source radius 1.2.
    // Keep the independent reference directions and projected pixels unchanged.
    const toSourcePoint = displayPoint => {
      const displayRadius = Math.hypot(...displayPoint);
      const sourceRadius = 1 + (displayRadius - 1) / 0.15;
      return displayPoint.map(v => v * sourceRadius / displayRadius);
    };
    const lines = data.samples.map(sample => {
      const point = [...sample.input];
      if (mutant==='handedness') point[1]*=-1;
      return {state:'open',polarity:1,
        arc:[toSourcePoint(point.map(v=>v*1.005/1.03)),toSourcePoint(point)]};
    });
    const generated = createMagneticFieldLinesFromPFSS({lines},radius/targetScale.x,.5,
      {inputFrame:data.input_frame,jdTdb:data.jd_tdb});
    if (generated.children.length!==data.samples.length) throw new Error('Production geometry dropped samples');
    generated.children.forEach((line,index) => {
      const pos = line.geometry.getAttribute('position');
      const endpoint = [pos.getX(pos.count-1),pos.getY(pos.count-1),pos.getZ(pos.count-1)];
      const rgb = data.samples[index].rgb;
      const marker = new THREE.Points(new THREE.BufferGeometry().setAttribute('position',
        new THREE.Float32BufferAttribute(endpoint,3)),new THREE.PointsMaterial({
          // Raw diagnostic bytes: the target has no display transfer function.
          color:new THREE.Color().setRGB(rgb[0]/255,rgb[1]/255,rgb[2]/255,THREE.LinearSRGBColorSpace),
          size:9,sizeAttenuation:false,depthTest:true,depthWrite:true,toneMapped:false
        }));
      target.add(marker); markers.push(marker);
      line.geometry.dispose(); line.material.dispose();
    });
    if (mutant==='legacy_axis') {
      spin.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),
        new THREE.Vector3(Math.sin(7.25*Math.PI/180),0,Math.cos(7.25*Math.PI/180)));
      mesh.rotation.y=(data.jd_tdb-2451545)*2*Math.PI/25.38;
    }
    if (mutant==='double_spin') target.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0,1,0),(data.jd_tdb-2451545)*2*Math.PI/25.38));
    p.scene.traverse(object => { if(object.isMesh||object.isPoints||object.isLine||object.isSprite) object.visible=false; });
    showPath(mesh); for(const marker of markers) showPath(marker);
    const spec=reference.camera;
    p.renderer.setPixelRatio(1); p.renderer.setSize(spec.width,spec.height,false);
    p.renderer.setClearColor(0x000000); p.scene.background=null;
    p.camera.fov=spec.vertical_fov_deg; p.camera.aspect=spec.width/spec.height;
    p.camera.near=.1*radius; p.camera.far=100*radius;
    p.camera.position.copy(center).addScaledVector(new THREE.Vector3(...spec.position),radius);
    p.camera.up.fromArray(spec.up);
    p.camera.lookAt(center.clone().addScaledVector(new THREE.Vector3(...spec.target),radius));
    p.camera.updateProjectionMatrix(); p.scene.updateMatrixWorld(true);
    const previousTarget = p.renderer.getRenderTarget();
    let targetSamples, framebufferStatus;
    try {
      p.renderer.setRenderTarget(diagnosticTarget);
      targetSamples = gl.getParameter(gl.SAMPLES);
      framebufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      p.renderer.render(p.scene,p.camera);
      p.renderer.readRenderTargetPixels(diagnosticTarget,0,0,spec.width,spec.height,rgba);
    } finally {
      p.renderer.setRenderTarget(previousTarget);
    }
    const image = captureContext.createImageData(spec.width,spec.height);
    for(let y=0;y<spec.height;y++) {
      const row = (spec.height-1-y)*spec.width*4;
      image.data.set(rgba.subarray(row,row+spec.width*4),y*spec.width*4);
    }
    captureContext.putImageData(image,0,0);
    return {index,mutant,radius,frameOwner:spin.userData.solarFrameOwner,
      targetParent:target.parent?.userData?.bodyId??target.parent?.name??null,
      targetSamples, framebufferComplete:framebufferStatus===gl.FRAMEBUFFER_COMPLETE,
      productionAntialias:gl.getContextAttributes().antialias,
      productionSamples:gl.getParameter(gl.SAMPLES),
      webglError:gl.getError(), image:captureCanvas.toDataURL('image/png')};
  };
  window.disposeSolarMainFrame = () => {
    diagnosticTarget.dispose(); diagnostic.dispose(); mesh.material=savedMaterial;
    for(const marker of markers) { marker.removeFromParent(); marker.geometry.dispose(); marker.material.dispose(); }
  };
  return hardware;
}"""

def require_hardware(renderer: str, expected_gpu: str) -> None:
    if (not expected_gpu.strip() or expected_gpu.casefold() not in renderer.casefold()
            or any(name in renderer.casefold() for name in ("swiftshader", "llvmpipe", "softpipe", "software", "basic render", "warp"))):
        raise ValueError(f"Expected physical GPU {expected_gpu!r}, observed {renderer!r}")

def compare_pixels(path, case):
    image = Image.open(path).convert("RGB")
    pixels = image.load()
    colors = {tuple(sample["rgb"]): [] for sample in case["samples"]}
    for y in range(image.height):
        for x in range(image.width):
            rgb = pixels[x, y]
            if rgb[0] < 205:
                continue
            for target in colors:
                if max(abs(a-b) for a, b in zip(rgb, target)) <= 2:
                    colors[target].append((x, y))
                    break
    failures, markers = [], []
    for sample in case["samples"]:
        actual = colors[tuple(sample["rgb"])]
        expected = sample["footprint_pixels"]
        def center(points):
            return [sum(point[i]+.5 for point in points)/len(points) for i in (0, 1)]
        def covered(source, target):
            return all(any(max(abs(a-c), abs(b-d)) <= 1 for c, d in target) for a, b in source)
        passed = (math.dist(center(actual), center(expected)) <= 1
                  and covered(actual, expected) and covered(expected, actual)) if actual and expected else not actual and not expected
        if sample["robust_visibility"]:
            passed = passed and ((bool(actual) and math.dist(center(actual), sample["pixel"]) <= 1)
                                 if sample["visible"] else not actual)
        if not passed:
            failures.append(sample["name"])
        markers.append({"name": sample["name"], "passed": passed, "pixels": len(actual), "expectedPixels": len(expected)})
    surface = []
    for sample in case["surface_samples"]:
        x, y = sample["pixel"]
        if max(abs(a-b) for a, b in zip(pixels[x, y], sample["rgb"])) > 2:
            surface.append({"pixel": [x, y], "actual": pixels[x, y], "expected": sample["rgb"]})
    return {"passed": not failures and not surface, "markers": markers,
            "failures": failures, "surfaceFailures": surface, "surfaceProbeCount": len(case["surface_samples"])}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', default='http://127.0.0.1:5188')
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--chromium', default=os.environ.get('SOLAR_CHROMIUM_EXECUTABLE'))
    parser.add_argument('--expect-gpu', default=os.environ.get('SOLAR_EXPECT_GPU'))
    args = parser.parse_args()
    if not args.chromium or not args.expect_gpu or not args.expect_gpu.strip():
        parser.error('--chromium and --expect-gpu are required (or SOLAR_CHROMIUM_EXECUTABLE and SOLAR_EXPECT_GPU)')
    args.out.mkdir(parents=True, exist_ok=False)
    reference = json.loads((ROOT/'backend/tests/fixtures/solar_frames/cspice_solar_frame.json').read_bytes())
    report = {"schema": "solar-actual-main-frame-v2", "pixelBudget": 1, "headless": False,
              "scope": "Default-AA startup compilation plus actual main/controller transforms in a single-sample diagnostic ID/depth target; offline, not live delivery or calibration",
              "expectedGpu": args.expect_gpu,
              "playwright": importlib.metadata.version('playwright'), "cases": [], "negativeControls": []}
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.chromium, headless=False,
            args=['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl'])
        try:
            page = browser.new_page(viewport={"width": 800, "height": 600}, device_scale_factor=1)
            page.on('pageerror', lambda error: errors.append(str(error)))
            def route_request(route):
                url = route.request.url
                if not url.startswith(args.origin+'/') or '/solar/' in url and '/src/' not in url:
                    route.fulfill(status=503, body='Offline solar frame gate', headers={'Access-Control-Allow-Origin': '*'})
                else:
                    route.continue_()
            page.route('**/*', route_request)
            def inject(route):
                response = route.fetch()
                source = response.text()
                needle = 'renderer.render(scene, camera);'
                if needle not in source:
                    raise RuntimeError('Actual main render hook missing')
                route.fulfill(response=response, body=source.replace(needle, PROBE+'\n'+needle, 1))
            page.route('**/src/main.ts*', inject)
            page.goto(args.origin+'/?uiWidth=800&uiHeight=600&renderScale=1&maxPixelRatio=1', wait_until='domcontentloaded', timeout=60000)
            page.wait_for_function('Boolean(window.__solarMainFrame)', timeout=60000)
            report['hardware'] = page.evaluate(SETUP, reference)
            hardware = report['hardware']['renderer'] or ''
            require_hardware(hardware, args.expect_gpu)
            startup = report['hardware']['startup']
            startup['passed'] = (startup['antialias'] and startup['samples'] > 0
                                 and startup['webglError'] == 0 and bool(startup['programs'])
                                 and all(program['linked'] and len(program['stages']) == 2
                                         and all(stage['compiled'] for stage in program['stages'])
                                         for program in startup['programs']))
            report['browserVersion'] = browser.version
            for index, mutant in [(i, 'none') for i in range(len(reference['cases']))]+[(0, 'legacy_axis'), (3, 'double_spin'), (2, 'handedness')]:
                result = page.evaluate('(v)=>window.runSolarMainFrameCase(v.index,v.mutant)', {'index': index, 'mutant': mutant})
                screenshot = args.out/f'{index}-{mutant}.png'
                screenshot.write_bytes(base64.b64decode(result.pop('image').split(',', 1)[1]))
                result.update(compare_pixels(screenshot, reference['cases'][index]))
                result['passed'] = (result['passed'] and result['webglError'] == 0
                                    and result['frameOwner'] == 'sunController'
                                    and result['targetSamples'] == 0 and result['framebufferComplete']
                                    and result['productionAntialias'] and result['productionSamples'] == startup['samples'])
                report['cases' if mutant == 'none' else 'negativeControls'].append(result)
            report['errors'] = errors
            report['passed'] = (not errors and startup['passed']
                                and all(case['passed'] for case in report['cases'])
                                and all(not case['passed'] and case['webglError'] == 0
                                        and (case['failures'] or case['surfaceFailures'])
                                        for case in report['negativeControls']))
        except Exception as error:
            report['passed'] = False
            report['fatal'] = repr(error)
        finally:
            try:
                if 'page' in locals() and not page.is_closed():
                    page.evaluate('window.disposeSolarMainFrame?.()')
            except Exception as error:
                report['passed'] = False
                report['cleanupError'] = repr(error)
            finally:
                try:
                    browser.close()
                except Exception as error:
                    report['passed'] = False
                    report['browserCloseError'] = repr(error)
    (args.out/'results.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report, indent=2))
    return 0 if report['passed'] else 1

if __name__ == '__main__':
    raise SystemExit(main())
