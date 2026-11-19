"""Run a production planet or cloud-shell fragment shader on EGL, one RGBA pixel per case.

Invoked by planetShaderFragment.test.mjs. Each case supplies the varyings a quadtree
vertex would; uniforms and small RGBA8 textures are shared. Requires the explicitly
enabled optional moderngl runtime; failures to create a context are failures.
"""
import array
import json
import math
import sys

import moderngl

request = json.load(sys.stdin)
context = moderngl.create_standalone_context(backend="egl", require=330)
cases = request["cases"]
count = len(cases)
vertex = """#version 330
in float index; in vec3 sphere; in vec3 place; in vec3 surfaceNormal; in float height;
uniform float count;
out vec2 vUv; out vec3 vNormal; out vec3 vPosition; out float vHeight; out vec3 vSpherePosition;
void main() {
    vUv = vec2(0.0); vNormal = surfaceNormal; vPosition = place; vHeight = height; vSpherePosition = sphere;
    gl_Position = vec4(-1.0 + (2.0 * index + 1.0) / count, 0.0, 0.0, 1.0);
    gl_PointSize = 1.0;
}
"""
prefix = "#version 330\n#define varying in\n#define texture2D texture\nout vec4 fragmentColour;\n#define gl_FragColor fragmentColour\n"
program = context.program(vertex_shader=vertex, fragment_shader=prefix + request["defines"] + request["shader"])
program["count"].value = float(count)
for unit, (name, texture) in enumerate(request["textures"].items()):
    if name not in program:
        continue
    gl_texture = context.texture((texture["width"], texture["height"]), 4, bytes(texture["rgba"]))
    gl_texture.repeat_x = True
    gl_texture.use(unit)
    program[name].value = unit
for name, value in request["uniforms"].items():
    if name in program:
        program[name].value = tuple(value) if isinstance(value, list) else value
rows = array.array("f")
for i, case in enumerate(cases):
    rows.extend([float(i), *case["sphere"], *case["position"], *case["normal"], case.get("height", 0.0)])
buffer = context.buffer(rows.tobytes())
vao = context.vertex_array(program, [(buffer, "1f 3f 3f 3f 1f", "index", "sphere", "place", "surfaceNormal", "height")])
target = context.framebuffer(color_attachments=[context.texture((count, 1), 4, dtype="f4")])
target.use()
target.clear(0.0, 0.0, 0.0, 0.0)
vao.render(mode=moderngl.POINTS)
if context.error != "GL_NO_ERROR":
    raise RuntimeError(f"Fragment render failed: {context.error}")
values = array.array("f")
values.frombytes(target.read(components=4, dtype="f4"))
colours = [list(values[i * 4:i * 4 + 4]) for i in range(count)]
if not all(math.isfinite(v) for colour in colours for v in colour):
    raise AssertionError("Production planet fragment shader emitted a nonfinite colour")
print(json.dumps({"renderer": context.info["GL_RENDERER"], "colours": colours}))
