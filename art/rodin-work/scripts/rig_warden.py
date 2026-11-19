# Blender (background): rig the decimated Rodin Warden and export assets/models/warden.glb.
# blender -b --factory-startup --python rig_warden.py -- <work.blend> <out.glb> <out_rig.blend> <preview_prefix> [height]
#
# Skeleton (driven in code, like the crew): pelvis > spine > chest > head, thigh/shin/foot L+R, and
# armL/armR on the chest (each whole arm aims from the shoulder). Each arm carries two rotary cannons;
# their barrels are weighted to cannonL1/L2/R1/R2 so they can spin around the bone's own axis, with a
# MuzzleL1..R2 empty at each barrel tip. Mech parts are weighted rigidly with short blends at the joints.
# Faces -Y (glTF +Z); "L" is at -X like Jax.
import bpy, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
work, out_glb, out_rig, prev = argv[:4]
H = float(argv[4]) if len(argv) > 4 else 3.4

bpy.ops.wm.open_mainfile(filepath=work)
scn = bpy.context.scene
body = bpy.data.objects["RodinRaw"]; body.name = "WardenBody"
for o in bpy.context.selected_objects: o.select_set(False)
body.select_set(True); bpy.context.view_layer.objects.active = body
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = body.data
co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); co = co.reshape(-1, 3)

# ---- 1. raw-unit landmarks (raw model is 1.493 tall); origin between the legs, feet on the floor ----
co[:, 2] -= co[:, 2].min()
lg = co[(co[:, 2] > 0.15) & (co[:, 2] < 0.40) & (np.abs(co[:, 0]) < 0.49)]
co[:, 0] -= lg[:, 0].mean(); co[:, 1] -= lg[:, 1].mean()
x, y, z = co[:, 0], co[:, 1], co[:, 2]
ax = np.abs(x)
lg = co[(z > 0.15) & (z < 0.40) & (ax < 0.49)]
legx = {"L": lg[lg[:, 0] < 0][:, 0].mean(), "R": lg[lg[:, 0] > 0][:, 0].mean()}
print("raw bbox", co.min(0).round(3), co.max(0).round(3), "legs x", {k: round(v, 3) for k, v in legx.items()})

def ramp(v, a, b): return np.clip((v - a) / (b - a), 0.0, 1.0)

# cannons: the barrels stick out in front (y < -0.33) beside the body; two clusters per side split at the
# biggest height gap; axis by PCA, pointing forward
cannons = {}
for side, sgn in (("L", -1), ("R", 1)):
    m = (y < -0.33) & (x * sgn > 0.40) & (z > 0.45) & (z < 0.86)
    idx = np.where(m)[0]
    # the two cannons are stacked: split at the emptiest 1 cm height band between them
    bins = np.arange(0.60, 0.72, 0.01)
    counts = [((z[idx] >= b) & (z[idx] < b + 0.01)).sum() for b in bins]
    zsplit = bins[int(np.argmin(counts))] + 0.005
    for k, sel in ((1, z[idx] > zsplit), (2, z[idx] <= zsplit)):       # 1 = upper, 2 = lower
        pts = co[idx[sel]]
        ytip, yback = pts[:, 1].min(), pts[:, 1].max()
        front = pts[pts[:, 1] < ytip + 0.06].mean(0)
        rear = pts[pts[:, 1] > yback - 0.06].mean(0)
        axis = (front - rear) / np.linalg.norm(front - rear)
        ctr_tip = front + axis * ((ytip - front[1]) / axis[1])
        ctr_back = rear + axis * ((yback - rear[1]) / axis[1])
        cannons[f"{side}{k}"] = dict(verts=idx[sel], back=ctr_back, tip=ctr_tip, axis=axis)
        print(f"cannon {side}{k}: {sel.sum()} verts, back {ctr_back.round(3)} tip {ctr_tip.round(3)} axis {axis.round(2)} (split z {zsplit:.3f})")

# ---- 2. weights ----
names = ["pelvis", "spine", "chest", "head", "thighL", "shinL", "footL", "thighR", "shinR", "footR",
         "armL", "armR", "cannonL1", "cannonL2", "cannonR1", "cannonR2"]
W = {n: np.zeros(len(co)) for n in names}
sideL = x < 0
arm = (((ax > 0.49) & (z > 0.40)) | ((ax > 0.40) & (z > 0.72))) & (z < 1.06)
armw = arm * (1 - ramp(z, 0.98, 1.06))                    # blends into the chest under the shoulder pad
leg = (~arm) & (ax > 0.14) & (z < 0.84)
legw = leg * (1 - ramp(z, 0.74, 0.82))                    # thigh armour blends into the pelvis
torso = 1 - np.maximum(armw, legw)
# torso chain
t1, t2, t3 = ramp(z, 0.84, 0.92), ramp(z, 0.98, 1.06), ramp(z, 1.25, 1.30)
headm = (ax < 0.17) & (y < 0.10)
W["pelvis"] += torso * (1 - t1)
W["spine"] += torso * t1 * (1 - t2)
W["chest"] += torso * t1 * t2 * (1 - t3 * headm)
W["head"] += torso * t1 * t2 * t3 * headm
# legs
foot = 1 - ramp(z, 0.10, 0.15)
knee = ramp(z, 0.42, 0.50)
for s, msk in (("L", sideL), ("R", ~sideL)):
    lw = legw * msk
    W["foot" + s] += lw * foot
    W["shin" + s] += lw * (1 - foot) * (1 - knee)
    W["thigh" + s] += lw * (1 - foot) * knee
    W["arm" + s] += armw * msk
# barrels ride on their cannon bones
for key, cn in cannons.items():
    v = cn["verts"]
    W["cannon" + key][v] = armw[v]
    W["arm" + key[0]][v] = 0
tot = sum(W.values()); bad = tot < 1e-6
W["pelvis"][bad] = 1; tot[bad] = 1
for n in names: W[n] /= tot
print("verts per bone:", {n: int((W[n] > 1e-3).sum()) for n in names})

# ---- 3. scale everything to the boss height ----
s = H / co[:, 2].max()
co *= s
me.vertices.foreach_set("co", co.ravel()); me.update()
for cn in cannons.values():
    cn["back"] = cn["back"] * s; cn["tip"] = cn["tip"] * s
S = lambda *p: Vector(p) * s
print(f"scale {s:.3f}; bbox {co.min(0).round(3)} {co.max(0).round(3)}")

# ---- 4. armature ----
arm_data = bpy.data.armatures.new("WardenRig")
rig = bpy.data.objects.new("WardenRig", arm_data); scn.collection.objects.link(rig)
for o in bpy.context.selected_objects: o.select_set(False)
rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
eb = arm_data.edit_bones
def bone(name, head, tail, parent=None):
    b = eb.new(name); b.head = head; b.tail = tail; b.roll = 0
    if parent: b.parent = eb[parent]; b.use_connect = False
    return b
bone("pelvis", S(0, 0, 0.72), S(0, 0, 0.86))
bone("spine", S(0, 0, 0.86), S(0, 0, 1.00), "pelvis")
bone("chest", S(0, 0, 1.00), S(0, 0, 1.27), "spine")
bone("head", S(0, -0.02, 1.27), S(0, -0.02, 1.45), "chest")
for sd in ("L", "R"):
    lx = legx[sd]
    bone("thigh" + sd, S(lx * 0.95, 0, 0.72), S(lx, 0, 0.46), "pelvis")
    bone("shin" + sd, S(lx, 0, 0.46), S(lx, 0.02, 0.11), "thigh" + sd)
    bone("foot" + sd, S(lx, 0.02, 0.11), S(lx, -0.22, 0.03), "shin" + sd)
    sg = -1 if sd == "L" else 1
    bone("arm" + sd, S(sg * 0.55, 0, 1.03), S(sg * 0.64, -0.08, 0.70), "chest")
    for k in (1, 2):
        cn = cannons[f"{sd}{k}"]
        bone(f"cannon{sd}{k}", Vector(cn["back"]), Vector(cn["tip"]), "arm" + sd)
bpy.ops.object.mode_set(mode="OBJECT")
for b in arm_data.bones: b.use_deform = True

groups = {n: body.vertex_groups.new(name=n) for n in names}
for n in names:
    w = W[n]
    for i in np.where(w > 1e-3)[0]: groups[n].add([int(i)], float(w[i]), "REPLACE")
mod = body.modifiers.new("Armature", "ARMATURE"); mod.object = rig
body.parent = rig; body.matrix_parent_inverse = Matrix.Identity(4)

muzzles = []
for key, cn in cannons.items():
    mz = bpy.data.objects.new("Muzzle" + key, None); scn.collection.objects.link(mz)
    mz.parent = rig; mz.parent_type = "BONE"; mz.parent_bone = "cannon" + key
    bpy.context.view_layer.update()
    mz.matrix_world = Matrix.Translation(Vector(cn["tip"]) + Vector(cn["axis"]) * 0.04)
    mz.empty_display_size = 0.08
    muzzles.append(mz)

# ---- 5. textures: 1K, emissive grey (tinted in code) ----
mat = me.materials[0]
for node in mat.node_tree.nodes:
    if node.type != "TEX_IMAGE" or not node.image: continue
    img = node.image
    if img.size[0] > 1024: img.scale(1024, 1024)
    if "emissive" in img.name:
        px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32); img.pixels.foreach_get(px); px = px.reshape(-1, 4)
        lum = px[:, :3].max(1)
        ref = np.percentile(lum[lum > 0.05], 98) if (lum > 0.05).any() else 1
        lum = np.clip(lum / max(1e-3, ref), 0, 1)
        px[:, 0] = px[:, 1] = px[:, 2] = lum
        img.pixels.foreach_set(px.ravel())
    img.pack()
mat.name = "RodinWarden"
bpy.ops.wm.save_as_mainfile(filepath=out_rig)

# ---- 6. export ----
for o in scn.objects: o.select_set(o is rig or o is body or o in muzzles)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=True, export_yup=True,
                          export_skins=True, export_animations=False, export_morph=False, export_apply=False,
                          export_image_format="JPEG", export_jpeg_quality=82, export_materials="EXPORT")
print("exported", out_glb, os.path.getsize(out_glb) // 1024, "KB")

# ---- 7. renders: weights by bone colour (rest), then a pose test (stride, torso twist, arms aimed, barrels spun) ----
scn.render.engine = "BLENDER_WORKBENCH"; scn.display.shading.light = "STUDIO"
scn.render.resolution_x, scn.render.resolution_y = 700, 700
if not scn.world: scn.world = bpy.data.worlds.new("W")
cd = bpy.data.cameras.new("Cam"); cd.type = "ORTHO"; cd.ortho_scale = H * 1.45
cam = bpy.data.objects.new("Cam", cd); scn.collection.objects.link(cam); scn.camera = cam
views = [("front", (0, -12, H / 2), (math.pi / 2, 0, 0)), ("side", (12, 0, H / 2), (math.pi / 2, 0, math.pi / 2)),
         ("three4", (8, -8, H * 1.6), (math.radians(60), 0, math.radians(45)))]
# weight colours via vertex colours
cols = {"pelvis": (0.5, 0.5, 0.5), "spine": (0.9, 0.9, 0.2), "chest": (0.9, 0.9, 0.9), "head": (1, 0, 1),
        "thighL": (1, 0.3, 0.2), "shinL": (0.2, 0.6, 1), "footL": (0.3, 1, 0.3),
        "thighR": (1, 0.3, 0.2), "shinR": (0.2, 0.6, 1), "footR": (0.3, 1, 0.3),
        "armL": (1, 0.6, 0.1), "armR": (1, 0.6, 0.1),
        "cannonL1": (0.1, 1, 1), "cannonL2": (0.6, 0.2, 1), "cannonR1": (0.1, 1, 1), "cannonR2": (0.6, 0.2, 1)}
vc = np.zeros((len(co), 3))
for n in names: vc += W[n][:, None] * np.array(cols[n])
attr = me.color_attributes.new("weights", "FLOAT_COLOR", "POINT")
attr.data.foreach_set("color", np.c_[vc, np.ones(len(co))].ravel().astype(np.float32))
me.color_attributes.active_color = attr
scn.display.shading.color_type = "VERTEX"
for tag, loc, rot in views[:2]:
    cam.location, cam.rotation_euler = loc, rot
    scn.render.filepath = f"{prev}_weights_{tag}.png"; bpy.ops.render.render(write_still=True)
pb = rig.pose.bones
for b in pb: b.rotation_mode = "XYZ"
pb["thighL"].rotation_euler = (math.radians(-28), 0, 0)
pb["thighR"].rotation_euler = (math.radians(24), 0, 0)
pb["shinR"].rotation_euler = (math.radians(40), 0, 0)
pb["spine"].rotation_euler = (0, math.radians(25), 0)
pb["armL"].rotation_euler = (math.radians(-20), 0, 0)
pb["cannonL1"].rotation_euler = (0, math.radians(45), 0)
bpy.context.view_layer.update()
for colour in ("VERTEX", "TEXTURE"):
    scn.display.shading.color_type = colour
    for tag, loc, rot in views:
        if colour == "TEXTURE" and tag == "side": continue
        cam.location, cam.rotation_euler = loc, rot
        scn.render.filepath = f"{prev}_pose_{colour.lower()}_{tag}.png"; bpy.ops.render.render(write_still=True)
me.color_attributes.remove(me.color_attributes["weights"])
print("renders done")
