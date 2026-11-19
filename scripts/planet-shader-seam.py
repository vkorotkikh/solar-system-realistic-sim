"""Count pixels where the production map coordinate helper drops to a coarse mip level.

Invoked by planetShaderFragment.test.mjs. Renders magnified full-screen views of the sphere
(real per-pixel derivatives, unlike the one-pixel fragment harness) through the shipped
mapUv GLSL, sampling a texture whose level 0 is white and whose smaller levels are black, so
any non-white pixel took a mip-level jump from the coordinate the helper chose.
Requires the explicitly enabled optional moderngl runtime.
"""
import array
import json
import math
import sys

import moderngl

request = json.load(sys.stdin)
context = moderngl.create_standalone_context(backend="egl", require=330)
size = 256
width, height = 1024, 512
texture = context.texture((width, height), 1, bytes([255]) * (width * height))
texture.build_mipmaps()
level, w, h = 0, width, height
while w > 1 or h > 1:
    w, h, level = max(w // 2, 1), max(h // 2, 1), level + 1
    texture.write(bytes(w * h), level=level)
texture.repeat_x = True
texture.repeat_y = False
texture.filter = (moderngl.LINEAR_MIPMAP_LINEAR, moderngl.LINEAR)
program = context.program(
    vertex_shader="#version 330\nin vec2 position; out vec2 screen;\n"
                  "void main() { screen = position; gl_Position = vec4(position, 0.0, 1.0); }",
    fragment_shader="#version 330\n#define texture2D texture\nin vec2 screen; out vec4 colour;\n"
                    "uniform sampler2D map; uniform vec3 centre; uniform vec3 across; uniform vec3 up;\n"
                    + request["mapUv"]
                    + "\nvoid main() { colour = vec4(texture2D(map, mapUv(normalize(centre + screen.x * across + screen.y * up))).r); }",
)
triangle = context.buffer(array.array("f", [-1, -1, 3, -1, -1, 3]).tobytes())
vao = context.vertex_array(program, [(triangle, "2f", "position")])
target = context.framebuffer(color_attachments=[context.texture((size, size), 4, dtype="f4")])
texture.use(0)
program["map"].value = 0
coarse = []
for view in request["views"]:
    lon, lat, half = math.radians(view["lon"]), math.radians(view["lat"]), math.radians(view["spanDeg"] / 2)
    centre = (math.cos(lat) * math.sin(lon), math.sin(lat), math.cos(lat) * math.cos(lon))
    east = (math.cos(lon), 0.0, -math.sin(lon))
    north = (centre[1] * east[2] - centre[2] * east[1], centre[2] * east[0] - centre[0] * east[2], centre[0] * east[1] - centre[1] * east[0])
    program["centre"].value = centre
    program["across"].value = tuple(math.tan(half) * x for x in east)
    program["up"].value = tuple(math.tan(half) * x for x in north)
    target.use()
    target.clear(0.0, 0.0, 0.0, 0.0)
    vao.render()
    values = array.array("f")
    values.frombytes(target.read(components=4, dtype="f4"))
    coarse.append(sum(1 for i in range(0, len(values), 4) if values[i] < 0.99))
print(json.dumps({"renderer": context.info["GL_RENDERER"], "pixels": size * size, "coarse": coarse}))
