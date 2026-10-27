"""Evidence-only SCN-042 sampling A/B and shader failure instrumentation.

Executes the unchanged acceptance harness. The single-sample variant is a
diagnostic control, not a production acceptance pass. No GL errors are cleared.
"""
from __future__ import annotations

import json
from pathlib import Path
import runpy
import sys

from PIL import Image
from playwright.sync_api import Browser, Page


EVIDENCE = Path(__file__).resolve().parent
ROOT = EVIDENCE.parents[1]

INIT = r"""(() => {
  window.__scn042FailedPrograms = [];
  const prototype = WebGL2RenderingContext.prototype;
  const link = prototype.linkProgram;
  prototype.linkProgram = function(program) {
    const result = link.call(this, program);
    if (!this.getProgramParameter(program, this.LINK_STATUS)) {
      window.__scn042FailedPrograms.push({
        program,
        linkStatus: false,
        linkLog: this.getProgramInfoLog(program),
        shaders: this.getAttachedShaders(program).map(shader => ({
          type: this.getShaderParameter(shader, this.SHADER_TYPE) === this.VERTEX_SHADER ? 'vertex' : 'fragment',
          compileStatus: this.getShaderParameter(shader, this.COMPILE_STATUS),
          compileLog: this.getShaderInfoLog(shader),
          source: this.getShaderSource(shader)
        }))
      });
    }
    return result;
  };
})();"""

SINGLE_SAMPLE = r"""(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attributes) {
    return getContext.call(this, type, type === 'webgl2'
      ? {...attributes, antialias:false} : attributes);
  };
})();"""

SHADER_DETAILS = r"""() => {
  const p = window.__solarMainFrame;
  return window.__scn042FailedPrograms.map(failure => {
    const owners = [];
    p.scene.traverse(object => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material) continue;
        const current = p.renderer.properties.get(material).currentProgram;
        if (current?.program === failure.program) {
          owners.push({objectName:object.name, bodyId:object.userData.bodyId,
            materialType:material.type, materialName:material.name,
            fragmentShader:material.fragmentShader, vertexShader:material.vertexShader});
        }
      }
    });
    return {linkStatus:failure.linkStatus, linkLog:failure.linkLog,
      shaders:failure.shaders, owners};
  });
}"""

CASE_DETAILS = r"""async data => {
  const p = window.__solarMainFrame;
  const THREE = await import('/node_modules/three/build/three.module.js');
  const mesh = p.bodyMeshes.get('sun');
  const gl = p.renderer.getContext();
  const center = mesh.getWorldPosition(new THREE.Vector3());
  const radius = mesh.geometry.boundingSphere.radius * mesh.getWorldScale(new THREE.Vector3()).x;
  let target;
  const targetId = data.input_frame === 'IAU_SUN' ? 'sun-magnetic-field' : 'sun-coronal-loops';
  p.scene.traverse(object => {if (object.userData.bodyId === targetId) target = object;});
  const markers = target.children.filter(object => object.isPoints && object.visible
    && object.geometry.getAttribute('position').count === 1);
  return {
    antialias:gl.getContextAttributes().antialias,
    samples:gl.getParameter(gl.SAMPLES),
    radius, geometry:mesh.geometry.parameters,
    markers:markers.map((marker,index) => {
      const point = new THREE.Vector3().fromBufferAttribute(marker.geometry.getAttribute('position'),0)
        .applyMatrix4(marker.matrixWorld);
      const world = point.clone().sub(center).divideScalar(radius);
      const ndc = point.clone().project(p.camera);
      const pixel = [(ndc.x+1)*400,(1-ndc.y)*300];
      const sample = data.samples[index];
      return {name:sample.name, actualWorld:world.toArray(), referenceWorld:sample.world,
        worldError:world.distanceTo(new THREE.Vector3(...sample.world)),
        actualPixel:pixel, referencePixel:sample.pixel,
        projectionError:Math.hypot(pixel[0]-sample.pixel[0],pixel[1]-sample.pixel[1])};
    })
  };
}"""


def main():
    namespace = runpy.run_path(str(ROOT / 'scripts/verify_solar_main_frame.py'))
    harness_globals = namespace['main'].__globals__
    original_new_page = Browser.new_page
    original_evaluate = Page.evaluate
    original_compare = harness_globals['compare_pixels']
    summaries = []
    state = {}

    def new_page(self, *args, **kwargs):
        page = original_new_page(self, *args, **kwargs)
        page.add_init_script(INIT)
        if state['singleSample']:
            page.add_init_script(SINGLE_SAMPLE)
        page.on('console', lambda message: state['console'].append(
            {'type': message.type, 'text': message.text})
            if message.type in ('warning', 'error') else None)
        return page

    def evaluate(self, expression, arg=None):
        if expression == harness_globals['SETUP']:
            state['shaderDiagnostics'] = original_evaluate(self, SHADER_DETAILS)
            state['referenceCases'] = arg['cases']
        result = original_evaluate(self, expression, arg)
        if expression == '(v)=>window.runSolarMainFrameCase(v.index,v.mutant)':
            if arg['mutant'] == 'none':
                details = original_evaluate(self, CASE_DETAILS, state['referenceCases'][arg['index']])
                details['index'] = arg['index']
                details['webglError'] = result['webglError']
                state['caseDetails'].append(details)
        return result

    def compare(path, case):
        result = original_compare(path, case)
        state['results'].append({'case': path.stem, **result})
        if path.stem in ('2-none', '4-none'):
            name = 'lon90_lat0' if path.stem == '2-none' else 'lon270_lat0'
            sample = next(s for s in case['samples'] if s['name'] == name)
            pixels = Image.open(path).convert('RGB')
            state['limbPixels'].append({
                'case': path.stem, 'name': name, 'markerRgb': sample['rgb'],
                'expectedPixels': [{'pixel': xy, 'actualRgb': pixels.getpixel(tuple(xy))}
                                   for xy in sample['footprint_pixels']],
            })
        return result

    Browser.new_page = new_page
    Page.evaluate = evaluate
    harness_globals['compare_pixels'] = compare
    try:
        for single_sample, name in ((False, 'rootcause-msaa'), (True, 'rootcause-single-sample')):
            state = {'singleSample': single_sample, 'console': [], 'shaderDiagnostics': [],
                     'caseDetails': [], 'limbPixels': [], 'results': []}
            out = EVIDENCE / name
            sys.argv = ['verify_solar_main_frame.py', '--origin', 'http://127.0.0.1:5188', '--out', str(out)]
            exit_code = namespace['main']()
            state.pop('referenceCases', None)
            state['harnessExitCode'] = exit_code
            (out / 'diagnostics.json').write_text(json.dumps(state, indent=2) + '\n')
            for i, failure in enumerate(state['shaderDiagnostics']):
                for shader in failure['shaders']:
                    (out / f'program-{i}-{shader["type"]}.glsl').write_text(shader['source'])
            summaries.append({
                'run': name, 'singleSample': single_sample, 'harnessExitCode': exit_code,
                'caseCounts': [{'case': item['case'], 'pixelComparisonPassed': item['passed'],
                                'markersPassed': sum(marker['passed'] for marker in item['markers']),
                                'failures': item['failures'], 'surfaceFailures': len(item['surfaceFailures'])}
                               for item in state['results']],
                'caseDetails': [{'index': item['index'], 'antialias': item['antialias'],
                                 'samples': item['samples'], 'geometry': item['geometry'],
                                 'webglError': item['webglError'],
                                 'maxWorldError': max(m['worldError'] for m in item['markers']),
                                 'maxProjectionError': max(m['projectionError'] for m in item['markers'])}
                                for item in state['caseDetails']],
                'limbPixels': state['limbPixels'],
                'shaderErrors': [{'linkLog': failure['linkLog'],
                                  'owners': [{k: v for k, v in owner.items()
                                              if k not in ('fragmentShader', 'vertexShader')}
                                             for owner in failure['owners']],
                                  'shaders': [{k: v for k, v in shader.items() if k != 'source'}
                                              for shader in failure['shaders']]}
                                 for failure in state['shaderDiagnostics']],
            })
    finally:
        Browser.new_page = original_new_page
        Page.evaluate = original_evaluate
        harness_globals['compare_pixels'] = original_compare
    with (EVIDENCE / 'rootcause-summary.json').open('x') as stream:
        json.dump(summaries, stream, indent=2)
        stream.write('\n')
    print('ROOTCAUSE_SUMMARY', json.dumps(summaries))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
