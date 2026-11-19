# Blender (background): rig a decimated Rodin character with Jax's skeleton and export a game GLB.
# blender -b --factory-startup --python rig_rodin.py -- <work.blend> <out.glb> <out_rig.blend> <jax_models.blend> <preview_prefix>
#
# The game (src/player.js) drives these bones in code: pelvis, spine, chest, head, thigh/shin/foot L+R.
# Arms aren't animated, so arms, backpack and collar ride on the chest. The rifle Rodin fused into the
# hands is weighted to an extra "Gun" bone (child of chest) so recoil still moves it, and a "Muzzle"
# empty sits at the barrel tip (where bullets come from). Jax's convention: "L" bones are at -X,
# the character faces -Y (glTF +Z), and is 1.851 tall.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
work, out_glb, out_rig, jax_blend, prev = argv[:5]
JAX_H = 1.851

bpy.ops.wm.open_mainfile(filepath=work)
body = bpy.data.objects["RodinRaw"]
body.name = "Body"
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True)
bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = body.data

# ---- 1. scale to Jax's height, feet on the floor, legs centred under the origin ----
co = np.empty(len(me.vertices) * 3, dtype=np.float64)
me.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
co[:, 2] -= co[:, 2].min()
s = JAX_H / co[:, 2].max()
co *= s
legs = co[(co[:, 2] > 0.25) & (co[:, 2] < 0.55)]
co[:, 0] -= legs[:, 0].mean()
co[:, 1] -= legs[:, 1].mean()
me.vertices.foreach_set("co", co.ravel())
me.update()
print(f"scaled by {s:.3f}; bounds min {co.min(0).round(3)} max {co.max(0).round(3)}")

# ---- 2. landmarks from the mesh ----
legs = co[(co[:, 2] > 0.25) & (co[:, 2] < 0.55)]
legL_x = legs[legs[:, 0] < 0][:, 0].mean()
legR_x = legs[legs[:, 0] > 0][:, 0].mean()
chest = co[(co[:, 2] > 1.32) & (co[:, 2] < 1.45) & (np.abs(co[:, 0]) < 0.12)]
y_front = chest[:, 1].min()
rifle = co[co[:, 1] < y_front - 0.22]                       # well in front of the chest: only the rifle
rz0, rz1 = rifle[:, 2].min() - 0.05, rifle[:, 2].max() + 0.05
tip_i = np.argmin(co[:, 1])
tip = co[tip_i]
muzzle_pts = co[(co[:, 1] < tip[1] + 0.04)]
muzzle = Vector((muzzle_pts[:, 0].mean(), tip[1] - 0.02, muzzle_pts[:, 2].mean()))
grip = rifle[rifle[:, 1] > rifle[:, 1].min() * 0.5]         # the back half of the rifle, near the hands
grip_c = Vector(grip.mean(0)) if len(grip) else Vector((0, y_front - 0.2, 1.2))
print(f"legs x L {legL_x:.3f} R {legR_x:.3f}; chest front y {y_front:.3f}; rifle z {rz0:.2f}..{rz1:.2f}; muzzle {tuple(round(v, 3) for v in muzzle)}; grip {tuple(round(v, 3) for v in grip_c)}")

# ---- 3. Jax's armature, legs moved to this body, plus the Gun bone ----
with bpy.data.libraries.load(jax_blend, link=False) as (src, dst):
    dst.objects = ["Player"]
rig = dst.objects[0]
bpy.context.scene.collection.objects.link(rig)
rig.name = "Rig"; rig.data.name = "Rig"
rig.location = (0, 0, 0); rig.rotation_euler = (0, 0, 0); rig.scale = (1, 1, 1)
bpy.context.view_layer.objects.active = rig
for o in bpy.context.selected_objects: o.select_set(False)
rig.select_set(True)
bpy.ops.object.mode_set(mode="EDIT")
eb = rig.data.edit_bones
for side, x in (("L", legL_x), ("R", legR_x)):
    for n in ("thigh", "shin", "foot"):
        b = eb[n + side]
        dx = x - b.head.x
        b.head.x += dx; b.tail.x += dx
gun = eb.new("Gun")
gun.head = grip_c
gun.tail = grip_c + Vector((0, -0.2, 0))
gun.roll = 0
gun.parent = eb["chest"]
gun.use_connect = False
gun.use_deform = True
bpy.ops.object.mode_set(mode="OBJECT")

# ---- 4. weights by region ----
def ramp(v, a, b):            # 0 below a, 1 above b
    return float(min(1.0, max(0.0, (v - a) / (b - a))))

names = [b.name for b in rig.data.bones]
groups = {n: body.vertex_groups.new(name=n) for n in names}
W = {n: [] for n in names}
for i, (x, y, z) in enumerate(co):
    w = {}
    side = "L" if x < 0 else "R"
    # legs: foot / shin / thigh, blended at ankle and knee, then into the pelvis at the hip
    foot = 1 - ramp(z, 0.07, 0.15)
    knee = ramp(z, 0.45, 0.55)
    hip = ramp(z, 0.82, 0.94)
    leg = 1 - hip
    w["foot" + side] = leg * foot
    w["shin" + side] = leg * (1 - foot) * (1 - knee)
    w["thigh" + side] = leg * (1 - foot) * knee
    # torso: pelvis -> spine -> chest -> head
    up = hip
    t1 = ramp(z, 1.0, 1.12)
    t2 = ramp(z, 1.24, 1.36)
    t3 = ramp(z, 1.56, 1.66)
    w["pelvis"] = up * (1 - t1)
    w["spine"] = up * t1 * (1 - t2)
    w["chest"] = up * t1 * t2 * (1 - t3)
    w["head"] = up * t1 * t2 * t3
    # arms (beside the torso, above the belt) and the backpack ride on the chest
    rigid = 0.0
    if z > 1.05: rigid = max(rigid, ramp(abs(x), 0.17, 0.21))
    if z > 1.0: rigid = max(rigid, ramp(y, 0.11, 0.15))
    # the rifle (and the hands on it): in front of the chest, at rifle height
    g = ramp(-y, -y_front + 0.02, -y_front + 0.07) * (1.0 if rz0 <= z <= rz1 else 0.0)
    if rigid > 0 or g > 0:
        keep = 1 - max(rigid, g)
        w = {k: v * keep for k, v in w.items()}
        w["chest"] = w.get("chest", 0) + rigid * (1 - g)
        w["Gun"] = g
    tot = sum(w.values())
    if tot <= 1e-6: w = {"pelvis": 1.0}; tot = 1.0
    for k, v in w.items():
        if v > 1e-3: W[k].append((i, v / tot))
for n, lst in W.items():
    for i, v in lst: groups[n].add([i], v, "REPLACE")
print("weighted verts per bone:", {n: len(l) for n, l in W.items() if l})

mod = body.modifiers.new("Armature", "ARMATURE")
mod.object = rig
body.parent = rig
body.matrix_parent_inverse = Matrix.Identity(4)

# ---- 5. muzzle empty on the Gun bone ----
mz = bpy.data.objects.new("Muzzle", None)
bpy.context.scene.collection.objects.link(mz)
mz.parent = rig; mz.parent_type = "BONE"; mz.parent_bone = "Gun"
bpy.context.view_layer.update()
mz.matrix_world = Matrix.Translation(muzzle)
mz.empty_display_size = 0.05

# ---- 6. textures: 1K, emissive turned grey so the game can tint the glow per crew member / phase ----
mat = body.data.materials[0]
for node in mat.node_tree.nodes:
    if node.type != "TEX_IMAGE" or not node.image: continue
    img = node.image
    if img.size[0] > 1024: img.scale(1024, 1024)
    if "emissive" in img.name:
        px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        lum = px[:, :3].max(1)
        lum = np.clip(lum / max(1e-3, np.percentile(lum[lum > 0.05], 98) if (lum > 0.05).any() else 1), 0, 1)
        px[:, 0] = px[:, 1] = px[:, 2] = lum
        img.pixels.foreach_set(px.ravel())
    img.pack()
mat.name = "RodinSuit"

bpy.ops.wm.save_as_mainfile(filepath=out_rig)
print("saved", out_rig)

# ---- 7. export ----
for o in bpy.context.scene.objects: o.select_set(o in (rig, body, mz))
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=True, export_yup=True,
                          export_skins=True, export_animations=False, export_morph=False, export_apply=False,
                          export_image_format="JPEG", export_jpeg_quality=82, export_materials="EXPORT")
print("exported", out_glb, os.path.getsize(out_glb) // 1024, "KB")

# ---- 8. pose test render: stride + torso twist ----
pb = rig.pose.bones
pb["thighL"].rotation_mode = pb["thighR"].rotation_mode = pb["shinR"].rotation_mode = "XYZ"
pb["chest"].rotation_mode = pb["spine"].rotation_mode = "XYZ"
pb["thighL"].rotation_euler = (math.radians(-35), 0, 0)
pb["thighR"].rotation_euler = (math.radians(30), 0, 0)
pb["shinR"].rotation_euler = (math.radians(45), 0, 0)
pb["spine"].rotation_euler = (0, math.radians(20), 0)
bpy.context.view_layer.update()
scn = bpy.context.scene
scn.render.engine = "BLENDER_WORKBENCH"
scn.display.shading.light = "STUDIO"; scn.display.shading.color_type = "TEXTURE"
scn.render.resolution_x, scn.render.resolution_y = 640, 800
if not scn.world: scn.world = bpy.data.worlds.new("W")
cd = bpy.data.cameras.new("Cam"); cd.type = "ORTHO"; cd.ortho_scale = 2.3
cam = bpy.data.objects.new("Cam", cd); scn.collection.objects.link(cam); scn.camera = cam
for tag, loc, rot in [("pose_front", (0, -6, 0.95), (math.pi / 2, 0, 0)), ("pose_side", (6, -0.2, 0.95), (math.pi / 2, 0, math.pi / 2))]:
    cam.location = loc; cam.rotation_euler = rot
    scn.render.filepath = f"{prev}_{tag}.png"
    bpy.ops.render.render(write_still=True)
print("pose renders done")
