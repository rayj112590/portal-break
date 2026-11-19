# Blender (background): import one Rodin OBJ, decimate it, hook up its PBR textures,
# save a work .blend and render front/side previews.
# blender -b --factory-startup --python rodin_import.py -- <raw_dir> <out_blend> <preview_prefix> [target_tris]
import bpy, sys, os, time, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
raw_dir, out_blend, prev = argv[0], argv[1], argv[2]
target = int(argv[3]) if len(argv) > 3 else 20000
t0 = time.time()

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.obj_import(filepath=os.path.join(raw_dir, "base.obj"))
obj = bpy.context.selected_objects[0]
obj.name = "RodinRaw"
me = obj.data
faces0 = len(me.polygons)
print(f"imported {faces0} faces, {len(me.vertices)} verts in {time.time() - t0:.1f}s")

# decimate (collapse) to the triangle budget
bpy.context.view_layer.objects.active = obj
mod = obj.modifiers.new("Decimate", "DECIMATE")
mod.decimate_type = "COLLAPSE"
mod.ratio = min(1.0, target / max(1, faces0))
mod.use_collapse_triangulate = True
t1 = time.time()
bpy.ops.object.modifier_apply(modifier=mod.name)
print(f"decimated to {len(obj.data.polygons)} faces in {time.time() - t1:.1f}s")

# bounds (Blender Z up)
ws = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
mn = Vector((min(v.x for v in ws), min(v.y for v in ws), min(v.z for v in ws)))
mx = Vector((max(v.x for v in ws), max(v.y for v in ws), max(v.z for v in ws)))
print("bbox min", tuple(round(v, 3) for v in mn), "max", tuple(round(v, 3) for v in mx), "size", tuple(round(v, 3) for v in (mx - mn)))

# PBR material from Rodin's maps
mat = bpy.data.materials.new("RodinBody")
mat.use_nodes = True
nt = mat.node_tree
bsdf = nt.nodes["Principled BSDF"]
def tex(name, non_color=False):
    p = os.path.join(raw_dir, name)
    if not os.path.exists(p): return None
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = bpy.data.images.load(p)
    if non_color: n.image.colorspace_settings.name = "Non-Color"
    return n
d = tex("texture_diffuse.png")
if d: nt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
r = tex("texture_roughness.png", True)
if r: nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
m = tex("texture_metallic.png", True)
if m: nt.links.new(m.outputs["Color"], bsdf.inputs["Metallic"])
n = tex("texture_normal.png", True)
if n:
    nm = nt.nodes.new("ShaderNodeNormalMap")
    nt.links.new(n.outputs["Color"], nm.inputs["Color"])
    nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
e = tex("texture_emissive.png")
if e:
    nt.links.new(e.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 1.0
obj.data.materials.clear()
obj.data.materials.append(mat)
for img in bpy.data.images: print("texture", img.name, tuple(img.size))

os.makedirs(os.path.dirname(out_blend), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
print("saved", out_blend)

# previews: orthographic front (-Y) and side (+X), workbench with textures
scn = bpy.context.scene
scn.render.engine = "BLENDER_WORKBENCH"
scn.display.shading.light = "STUDIO"
scn.display.shading.color_type = "TEXTURE"
scn.render.resolution_x, scn.render.resolution_y = 640, 800
scn.render.film_transparent = False
world = bpy.data.worlds.new("W"); scn.world = world
cam_data = bpy.data.cameras.new("Cam"); cam_data.type = "ORTHO"
size = mx - mn
cam_data.ortho_scale = max(size.z, size.x, size.y) * 1.15
cam = bpy.data.objects.new("Cam", cam_data); scn.collection.objects.link(cam); scn.camera = cam
c = (mn + mx) / 2
for tag, loc, rot in [("front", (c.x, mn.y - 5, c.z), (math.pi / 2, 0, 0)),
                      ("side", (mx.x + 5, c.y, c.z), (math.pi / 2, 0, math.pi / 2)),
                      ("back", (c.x, mx.y + 5, c.z), (math.pi / 2, 0, math.pi))]:
    cam.location = loc; cam.rotation_euler = rot
    scn.render.filepath = f"{prev}_{tag}.png"
    bpy.ops.render.render(write_still=True)
    print("rendered", scn.render.filepath)
print(f"done in {time.time() - t0:.1f}s")
