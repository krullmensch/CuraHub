# Builds public/models/scale-figure.glb (1.73 m person, mesh "ScaleFigure") from the "Character" node
# of the SHUTDOWN.gallery exhibition "Quarantine Diary" (Evangelos Rodoulis, shutdown.gallery/#Quarantine-Diary,
# site by Patrik Huebner). Python 3 standard library only.
# Run: python3 scripts/build-scale-figure.py public/models/scale-figure.glb [/tmp/figure-preview.png]
#   Source: SCALE_FIGURE_SOURCE (a path or URL of the scene .gltf), default SOURCE_URL below.
#
# The mesh is scaled to 1.73 m, its feet put on y = 0 and its bounding box centred on x/z = 0. It already faces
# +Z (CuraHub's convention for figures). Vertices are welded by position; the normals are smooth, which does not
# matter: the figure's material uses flat shading.
import base64
import json
import os
import struct
import sys
import urllib.request
import zlib

SOURCE_URL = "https://shutdown.gallery/assets/exhibitions/Evangelos_Rodoulis/models/Warehouse.gltf"
SOURCE_NODE = "Character"
HEIGHT = 1.73

argv = sys.argv[1:]
OUT_GLB = argv[0]
OUT_PNG = argv[1] if len(argv) > 1 else None
source = os.environ.get("SCALE_FIGURE_SOURCE", SOURCE_URL)

if source.startswith(("http://", "https://")):
    with urllib.request.urlopen(source) as response:
        gltf = json.load(response)
else:
    with open(source, encoding="utf-8") as f:
        gltf = json.load(f)

(buffer_uri,) = [b["uri"] for b in gltf["buffers"]]
data = base64.b64decode(buffer_uri.split(",", 1)[1])


def read_accessor(index):
    accessor = gltf["accessors"][index]
    view = gltf["bufferViews"][accessor["bufferView"]]
    width = {"SCALAR": 1, "VEC3": 3}[accessor["type"]]
    fmt = {5123: "H", 5125: "I", 5126: "f"}[accessor["componentType"]] * width
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    stride = view.get("byteStride", struct.calcsize(fmt))
    return [struct.unpack_from("<" + fmt, data, offset + i * stride) for i in range(accessor["count"])]


(node,) = [n for n in gltf["nodes"] if n.get("name") == SOURCE_NODE]
(primitive,) = gltf["meshes"][node["mesh"]]["primitives"]
positions = read_accessor(primitive["attributes"]["POSITION"])
indices = [i for (i,) in read_accessor(primitive["indices"])] if "indices" in primitive else list(range(len(positions)))

# Scale to HEIGHT, feet on the floor, bounding box centred on the vertical axis
lo = [min(p[k] for p in positions) for k in range(3)]
hi = [max(p[k] for p in positions) for k in range(3)]
scale = HEIGHT / (hi[1] - lo[1])
centre = ((lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2)

# Weld identical positions (the source is a triangle soup), drop triangles that collapse
vertices, remap, triangles = [], {}, []
for i in indices:
    p = positions[i]
    if p not in remap:
        remap[p] = len(vertices)
        vertices.append(tuple((p[k] - centre[k]) * scale for k in range(3)))
for t in range(0, len(indices), 3):
    a, b, c = (remap[positions[i]] for i in indices[t:t + 3])
    if a != b and b != c and a != c:
        triangles.append((a, b, c))
assert len(vertices) < 65536

# Area-weighted vertex normals
normals = [[0.0, 0.0, 0.0] for _ in vertices]
for a, b, c in triangles:
    pa, pb, pc = vertices[a], vertices[b], vertices[c]
    u = [pb[k] - pa[k] for k in range(3)]
    v = [pc[k] - pa[k] for k in range(3)]
    n = (u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
    for i in (a, b, c):
        for k in range(3):
            normals[i][k] += n[k]
for n in normals:
    length = (n[0] ** 2 + n[1] ** 2 + n[2] ** 2) ** 0.5 or 1.0
    n[:] = [x / length for x in n]

# GLB: one node + mesh "ScaleFigure", POSITION / NORMAL / uint16 indices, no material
position_bytes = b"".join(struct.pack("<3f", *p) for p in vertices)
normal_bytes = b"".join(struct.pack("<3f", *n) for n in normals)
index_bytes = b"".join(struct.pack("<3H", *t) for t in triangles)
index_bytes += b"\0" * (-len(index_bytes) % 4)
binary = position_bytes + normal_bytes + index_bytes
v_min = [min(p[k] for p in vertices) for k in range(3)]
v_max = [max(p[k] for p in vertices) for k in range(3)]
document = {
    "asset": {"version": "2.0", "generator": "CuraHub scripts/build-scale-figure.py"},
    "scene": 0,
    "scenes": [{"name": "Scene", "nodes": [0]}],
    "nodes": [{"mesh": 0, "name": "ScaleFigure"}],
    "meshes": [{"name": "ScaleFigure", "primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2}]}],
    "accessors": [
        {"bufferView": 0, "componentType": 5126, "count": len(vertices), "type": "VEC3", "min": v_min, "max": v_max},
        {"bufferView": 1, "componentType": 5126, "count": len(vertices), "type": "VEC3"},
        {"bufferView": 2, "componentType": 5123, "count": len(triangles) * 3, "type": "SCALAR"},
    ],
    "bufferViews": [
        {"buffer": 0, "byteOffset": 0, "byteLength": len(position_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": len(position_bytes), "byteLength": len(normal_bytes), "target": 34962},
        {"buffer": 0, "byteOffset": len(position_bytes) + len(normal_bytes), "byteLength": len(triangles) * 6, "target": 34963},
    ],
    "buffers": [{"byteLength": len(binary)}],
}
json_bytes = json.dumps(document, separators=(",", ":")).encode()
json_bytes += b" " * (-len(json_bytes) % 4)
glb = b"".join([
    struct.pack("<4sII", b"glTF", 2, 12 + 8 + len(json_bytes) + 8 + len(binary)),
    struct.pack("<I4s", len(json_bytes), b"JSON"), json_bytes,
    struct.pack("<I4s", len(binary), b"BIN\0"), binary,
])
with open(OUT_GLB, "wb") as f:
    f.write(glb)
print(f"{OUT_GLB}: {len(vertices)} vertices, {len(triangles)} triangles, {len(glb)} bytes, "
      f"x {v_min[0]:.3f}..{v_max[0]:.3f}, y {v_min[1]:.3f}..{v_max[1]:.3f}, z {v_min[2]:.3f}..{v_max[2]:.3f}")

# Preview: side view (facing left) and front view as a greyscale PNG
if OUT_PNG:
    W, H, pad = 300, 600, 10
    px = bytearray([235]) * (2 * W * H)
    s = (H - 2 * pad) / HEIGHT
    for panel, (axis, sign) in enumerate(((2, -1), (0, 1))):
        pts = [(panel * W + W / 2 + sign * p[axis] * s, H - pad - p[1] * s) for p in vertices]
        for a, b, c in triangles:
            (ax, ay), (bx, by), (cx, cy) = pts[a], pts[b], pts[c]
            d = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
            if abs(d) < 1e-12:
                continue
            for y in range(int(min(ay, by, cy)), int(max(ay, by, cy)) + 1):
                for x in range(int(min(ax, bx, cx)), int(max(ax, bx, cx)) + 1):
                    X, Y = x + 0.5, y + 0.5
                    w1 = ((bx - X) * (cy - Y) - (cx - X) * (by - Y)) / d
                    w2 = ((cx - X) * (ay - Y) - (ax - X) * (cy - Y)) / d
                    if w1 >= 0 and w2 >= 0 and w1 + w2 <= 1 and 0 <= y < H and 0 <= x < 2 * W:
                        px[y * 2 * W + x] = 0
    raw = b"".join(b"\0" + bytes(px[y * 2 * W:(y + 1) * 2 * W]) for y in range(H))

    def chunk(tag, body):
        return struct.pack(">I", len(body)) + tag + body + struct.pack(">I", zlib.crc32(tag + body) & 0xFFFFFFFF)

    with open(OUT_PNG, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 2 * W, H, 8, 0, 0, 0, 0))
                + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b""))
