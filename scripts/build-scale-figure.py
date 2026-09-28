# Builds public/models/scale-figure.glb (1.73 m low-poly person, mesh "ScaleFigure") and a preview PNG.
# Run: /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup \
#        --python scripts/build-scale-figure.py -- "$PWD/public/models/scale-figure.glb" /tmp/figure-preview.png
import bpy
import math
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
OUT_GLB, OUT_PNG = argv[0], argv[1]
RATIO = float(argv[2]) if len(argv) > 2 else 0.35
BRANCH = float(argv[3]) if len(argv) > 3 else 0.5
H = 1.73

bpy.ops.wm.read_factory_settings(use_empty=True)

joints = {
    "pelvis": ((0.0, 0.0, 0.93), (0.16, 0.11)),
    "waist":  ((0.0, 0.0, 1.10), (0.14, 0.10)),
    "chest":  ((0.0, 0.0, 1.30), (0.17, 0.11)),
    "neck":   ((0.0, 0.0, 1.46), (0.045, 0.045)),
    "head":   ((0.0, -0.01, 1.585), (0.095, 0.11)),
    "crown":  ((0.0, 0.0, 1.66), (0.085, 0.095)),
}
for side, s in (("L", 1), ("R", -1)):
    joints.update({
        f"hip{side}":      ((s * 0.09, 0.0, 0.90), (0.085, 0.085)),
        f"knee{side}":     ((s * 0.10, -0.01, 0.49), (0.055, 0.06)),
        f"ankle{side}":    ((s * 0.10, 0.02, 0.08), (0.04, 0.045)),
        f"toe{side}":      ((s * 0.10, -0.13, 0.03), (0.04, 0.03)),
        f"shoulder{side}": ((s * 0.19, 0.0, 1.40), (0.055, 0.055)),
        f"elbow{side}":    ((s * 0.25, 0.02, 1.10), (0.042, 0.042)),
        f"wrist{side}":    ((s * 0.29, 0.0, 0.86), (0.032, 0.028)),
        f"hand{side}":     ((s * 0.31, 0.0, 0.73), (0.038, 0.018)),
    })
edges = [("pelvis", "waist"), ("waist", "chest"), ("chest", "neck"), ("neck", "head"), ("head", "crown")]
for side in ("L", "R"):
    edges += [("pelvis", f"hip{side}"), (f"hip{side}", f"knee{side}"), (f"knee{side}", f"ankle{side}"),
              (f"ankle{side}", f"toe{side}"), ("chest", f"shoulder{side}"), (f"shoulder{side}", f"elbow{side}"),
              (f"elbow{side}", f"wrist{side}"), (f"wrist{side}", f"hand{side}")]

names = list(joints)
index = {n: i for i, n in enumerate(names)}
mesh = bpy.data.meshes.new("ScaleFigure")
mesh.from_pydata([joints[n][0] for n in names], [(index[a], index[b]) for a, b in edges], [])
obj = bpy.data.objects.new("ScaleFigure", mesh)
bpy.context.scene.collection.objects.link(obj)
bpy.context.view_layer.objects.active = obj
obj.select_set(True)

bpy.ops.object.modifier_add(type='SKIN')
obj.modifiers[-1].branch_smoothing = BRANCH
skin = mesh.skin_vertices[0].data
for n in names:
    skin[index[n]].radius = joints[n][1]
skin[index["pelvis"]].use_root = True

sub = obj.modifiers.new("Subdivision", 'SUBSURF'); sub.levels = 1; sub.render_levels = 1
dec = obj.modifiers.new("Decimate", 'DECIMATE'); dec.ratio = RATIO
for m in list(obj.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)

me = obj.data
zs = [v.co.z for v in me.vertices]
zmin, zmax = min(zs), max(zs)
k = H / (zmax - zmin)
for v in me.vertices:
    v.co = Vector((v.co.x * k, v.co.y * k, (v.co.z - zmin) * k))
for p in me.polygons:
    p.use_smooth = False
me.update()

tris = sum(len(p.vertices) - 2 for p in me.polygons)
zs = [v.co.z for v in me.vertices]
print("FIGURE", {"triangles": tris, "height": max(zs) - min(zs), "min_z": min(zs)})

bpy.ops.object.select_all(action='DESELECT')
obj.select_set(True)
bpy.context.view_layer.objects.active = obj
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format='GLB',
    use_selection=True,
    export_yup=True,
    export_apply=True,
    export_normals=True,
    export_texcoords=False,
    export_materials='NONE',
)

# Preview render: front + three-quarter, matte dark material, workbench
mat = bpy.data.materials.new("Preview")
mat.diffuse_color = (0.6, 0.6, 0.6, 1)
me.materials.append(mat)
twin = obj.copy(); twin.data = obj.data
twin.location.x = 0.9; twin.rotation_euler.z = math.radians(35)
bpy.context.scene.collection.objects.link(twin)
cam_data = bpy.data.cameras.new("Cam"); cam_data.type = 'ORTHO'; cam_data.ortho_scale = 2.2
cam = bpy.data.objects.new("Cam", cam_data)
cam.location = (0.45, -6, 0.87); cam.rotation_euler = (math.radians(90), 0, 0)
bpy.context.scene.collection.objects.link(cam)
scene = bpy.context.scene
scene.camera = cam
scene.world = bpy.data.worlds.new('W'); scene.world.color = (1, 1, 1)
engines = [e.identifier for e in scene.render.bl_rna.properties['engine'].enum_items]
scene.render.engine = 'BLENDER_WORKBENCH' if 'BLENDER_WORKBENCH' in engines else scene.render.engine
scene.display.shading.light = 'STUDIO'
scene.display.shading.color_type = 'MATERIAL'
scene.render.resolution_x = 800; scene.render.resolution_y = 800
scene.render.filepath = OUT_PNG
bpy.ops.render.render(write_still=True)
print("PREVIEW", OUT_PNG)
