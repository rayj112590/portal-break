# Blender (background): turn a decimated Rodin melee weapon (a scythe, an axe, a staff) into a game GLB.
# blender -b --factory-startup --python melee_prep.py -- <kind> <work.blend> <out.glb> <out.blend> <preview_prefix>
#
# Game contract (the melee cousin of weapon_prep.py's guns):
#   root "Weapon<Kind>" with its origin AT THE RIGHT-HAND GRIP (the lower hand on the shaft), so parenting
#   it to a character's Gun bone puts the grip in the hand.
#   Stored UPRIGHT, the way it's carried at rest: shaft straight up +Z from the grip, the blade reaching
#   forward (-Y in Blender = glTF +Z, the way the characters face). The game rotates it into its swings.
#   children: "<Kind>Body" mesh; empties "Grip" (right hand, = root origin), "Foregrip" (left hand, higher
#   up the shaft) and "Tip" (the point of the blade, for hit checks and trails). No muzzle.
#   one lit material "Weapon<Kind>" with the weapon's own colours.
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
kind, work, out_glb, out_blend, prev = argv[:5]

AX = {"+X": (1, 0, 0), "-X": (-1, 0, 0), "+Y": (0, 1, 0), "-Y": (0, -1, 0), "+Z": (0, 0, 1), "-Z": (0, 0, -1)}
CONFIG = {
    # Rodin 31baa80d (Christmas): the Candy Cane scythe stands on its pommel, shaft slightly tilted, the
    # long blade sweeping out and down to -Y from the hooked head (a small back hook points +Y).
    # length = overall height in the game (Jax is 1.851): about chin height.
    # grip/fore = where the hands close, as fractions of the height up the shaft.
    "scythe": dict(up="+Z", blade="-Y", length=1.3, grip=0.12, fore=0.45),
}
cfg = CONFIG[kind]
Kind = kind.capitalize()

bpy.ops.wm.open_mainfile(filepath=work)
scn = bpy.context.scene
src = bpy.data.objects["RodinRaw"]
for o in bpy.context.selected_objects: o.select_set(False)
src.select_set(True); bpy.context.view_layer.objects.active = src
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = src.data
co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)

# ---- 1. orient: shaft -> +Z, blade -> -Y ----
up, bl = np.array(AX[cfg["up"]], float), np.array(AX[cfg["blade"]], float)
R = np.array([np.cross(-bl, up), -bl, up])          # rows: where target X, Y, Z come from
co = co @ R.T
co[:, 2] -= co[:, 2].min()

def shaft_line(co, z0, z1):
    """least-squares line through the centres of 2 cm slices of the shaft between heights z0 and z1"""
    H = co[:, 2].max()
    zs, cs = [], []
    for z in np.arange(z0 * H, z1 * H, 0.02 * H / 1.3):
        s = co[np.abs(co[:, 2] - z) < 0.01 * H / 1.3]
        if len(s) >= 6:
            zs.append(z); cs.append(((s[:, 0].min() + s[:, 0].max()) / 2, (s[:, 1].min() + s[:, 1].max()) / 2))
    zs, cs = np.array(zs), np.array(cs)
    A = np.stack([zs, np.ones_like(zs)], 1)
    (kx, bx), (ky, by) = np.linalg.lstsq(A, cs[:, 0], rcond=None)[0], np.linalg.lstsq(A, cs[:, 1], rcond=None)[0]
    return kx, bx, ky, by

# ---- 2. straighten the shaft (fitted on its plain lower half), then scale to the game height ----
kx, bx, ky, by = shaft_line(co, 0.06, 0.5)
d = Vector((kx, ky, 1)).normalized()
tilt = math.degrees(d.angle(Vector((0, 0, 1))))
rot = d.rotation_difference(Vector((0, 0, 1))).to_matrix()
co = (co - np.array([bx, by, 0])) @ np.array(rot).T
co[:, 2] -= co[:, 2].min()
co *= cfg["length"] / co[:, 2].max()
kx, bx, ky, by = shaft_line(co, 0.06, 0.5)
print(f"{kind}: shaft was tilted {tilt:.1f} deg; now {math.degrees(math.atan(math.hypot(kx, ky))):.2f} deg; "
      f"size {np.round(co.max(0) - co.min(0), 3)}")
me.vertices.foreach_set("co", co.ravel()); me.update()

# ---- 3. landmarks ----
H = cfg["length"]
def on_shaft(f):
    z = f * H
    return Vector((kx * z + bx, ky * z + by, z))
grip, fore = on_shaft(cfg["grip"]), on_shaft(cfg["fore"])
# the blade's point: it curls down at the end, so the lowest vertex of the blade's forward reach
reach = co[co[:, 1] < 0.6 * co[:, 1].min()]
tip = Vector(reach[np.argmin(reach[:, 2])])
print(f"grip {tuple(round(c, 3) for c in grip)}, foregrip {tuple(round(c, 3) for c in fore)} "
      f"(hands {(fore - grip).length:.3f} m apart), tip {tuple(round(c, 3) for c in tip)}")

# ---- 4. hierarchy, origin at the grip ----
root = bpy.data.objects.new("Weapon" + Kind, None); scn.collection.objects.link(root)
bm = bmesh.new(); bm.from_mesh(me)
bmesh.ops.translate(bm, verts=bm.verts, vec=-grip)
bm.to_mesh(me); bm.free()
src.name = Kind + "Body"; me.name = Kind + "Body"
src.parent = root; src.location = (0, 0, 0)
for name, p in (("Grip", grip), ("Foregrip", fore), ("Tip", tip)):
    e = bpy.data.objects.new(name, None); scn.collection.objects.link(e)
    e.parent = root; e.location = p - grip; e.empty_display_size = 0.03
print(f"  part {src.name}: {len(me.polygons)} faces")

# ---- 5. textures at 1K, the weapon keeps its own colours ----
mat = me.materials[0]
for node in mat.node_tree.nodes:
    if node.type == "TEX_IMAGE" and node.image:
        if node.image.size[0] > 1024: node.image.scale(1024, 1024)
        node.image.pack()
mat.name = "Weapon" + Kind
bpy.ops.wm.save_as_mainfile(filepath=out_blend)

for o in scn.objects: o.select_set(o is root or o.parent is root)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=True, export_yup=True,
                          export_animations=False, export_morph=False, export_skins=False,
                          export_image_format="JPEG", export_jpeg_quality=82, export_materials="EXPORT")
print("exported", out_glb, os.path.getsize(out_glb) // 1024, "KB")

# ---- 6. check renders: textured with markers (grip green, foregrip blue, tip red) ----
scn.render.engine = "BLENDER_WORKBENCH"; scn.display.shading.light = "STUDIO"
scn.render.resolution_x, scn.render.resolution_y = 600, 800
if not scn.world: scn.world = bpy.data.worlds.new("W")
for name, col in (("Grip", (0.2, 1, 0.3, 1)), ("Foregrip", (0.2, 0.5, 1, 1)), ("Tip", (1, 0.2, 0.2, 1))):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.025, location=bpy.data.objects[name].matrix_world.translation)
    mk = bpy.context.active_object; mk.color = col; mk.name = "mark_" + name
bpy.context.view_layer.update()
pts = [src.matrix_world @ Vector(c) for c in src.bound_box]
bmn = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
bmx = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
ctr = (bmn + bmx) / 2
tgt = bpy.data.objects.new("T", None); scn.collection.objects.link(tgt); tgt.location = ctr
cd = bpy.data.cameras.new("C"); cd.type = "ORTHO"; cd.ortho_scale = max(bmx - bmn) * 1.15
cam = bpy.data.objects.new("C", cd); scn.collection.objects.link(cam); scn.camera = cam
c = cam.constraints.new("TRACK_TO"); c.target = tgt; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
src.color = (0.85, 0.85, 0.85, 1)
for colour, tag, loc in (("TEXTURE", "side", (ctr.x + 3, ctr.y, ctr.z)), ("OBJECT", "side", (ctr.x + 3, ctr.y, ctr.z)),
                         ("OBJECT", "front", (ctr.x, ctr.y - 3, ctr.z))):
    scn.display.shading.color_type = colour
    cam.location = loc
    scn.render.filepath = f"{prev}_{colour.lower()}_{tag}.png"; bpy.ops.render.render(write_still=True)
print("renders done")
