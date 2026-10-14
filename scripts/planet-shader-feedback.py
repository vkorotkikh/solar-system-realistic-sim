"""Execute the production planet vertex shader using EGL transform feedback.

Invoked by planetShaderGeometry.test.mjs. Requires the explicitly enabled optional
moderngl runtime; failures to create a context are failures, never passing skips.
"""
import array
import json
import math
import sys

import moderngl

request = json.load(sys.stdin)
context = moderngl.create_standalone_context(backend="egl", require=330)
# Mesa still requires a complete framebuffer during transform feedback.
context.simple_framebuffer((1, 1)).use()
prefix = """#version 330
#define varying out
#define attribute in
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
in vec3 position;
in vec2 uv;
"""
program = context.program(
    vertex_shader=prefix + request["shader"],
    varyings=["vSpherePosition", "vPosition", "vNormal", "gl_Position"],
)
results = []
for case in request["cases"]:
    for name, value in case["uniforms"].items():
        if name not in program:
            continue
        if isinstance(value, list) and len(value) == 16:
            program[name].write(array.array("f", value).tobytes())
        else:
            program[name].value = tuple(value) if isinstance(value, list) else value
    vertices = context.buffer(array.array("f", case["positions"]).tobytes())
    output = context.buffer(reserve=len(case["positions"]) // 3 * 13 * 4)
    vao = context.vertex_array(program, [(vertices, "3f", "position")])
    vao.transform(output, mode=moderngl.POINTS, vertices=len(case["positions"]) // 3)
    error = context.error
    if error != "GL_NO_ERROR":
        raise RuntimeError(f"Transform feedback failed: {error}")
    values = array.array("f")
    values.frombytes(output.read())
    if not all(math.isfinite(value) for value in values):
        raise AssertionError("Production planet shader emitted nonfinite coordinates or normals")
    results.append(list(values))
    vao.release()
    vertices.release()
    output.release()
print(json.dumps({"renderer": context.info["GL_RENDERER"], "results": results}))
