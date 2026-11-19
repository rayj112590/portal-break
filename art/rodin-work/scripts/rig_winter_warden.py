# Blender (background): rig the Winter Warden (Rodin 1afe67e6, Christmas event boss) and export a GLB.
# blender -b --factory-startup --python rig_winter_warden.py -- <work.blend> <out.glb> <out_rig.blend> <jax_models.blend> <preview_prefix>
#
# A copy of rig_unarmed.py (the crew's skeleton: pelvis, spine, chest, head, thigh/shin/foot L+R, arm
# bones, "Gun" on handR and a "Muzzle" empty), changed for this model:
#  - The floating crystal shard beside the right hand is a loose piece of the mesh: it becomes its own
#    unskinned node "Shard" (origin at its centre), parented to the handR bone, so it follows the hand
#    and code can bob, spin, or detach and throw it.
#  - The cape: below 1.1 m it's a separate piece of the mesh behind the legs. It never takes leg weights
#    (it rides on the pelvis, blending up the back like the torso), so the legs swing under it; keep the
#    boss's stride short or the back leg pokes through. There's no backpack rule (it would glue the cape
#    to the chest), and the arm walk stays off the cape.
#  - The ice glow keeps its own colours (crew models grey their emissive so the game can tint it).
# Rigged at Jax's height (1.851, so the crew's thresholds fit); the game scales the boss up in code.
# Jax's convention: "L" bones are at -X, the character faces -Y (glTF +Z).
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

# ---- 0. the shard: the smaller loose piece becomes its own object ----
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.mesh.separate(type="LOOSE")
bpy.ops.object.mode_set(mode="OBJECT")
pieces = sorted([o for o in bpy.data.objects if o.type == "MESH"], key=lambda o: -len(o.data.vertices))
print("loose pieces:", [(o.name, len(o.data.vertices)) for o in pieces])
if len(pieces) != 2: raise SystemExit("expected the body and one shard")
body, shard = pieces
body.name = "Body"; shard.name = "Shard"; shard.data.name = "Shard"
me = body.data

# ---- 1. scale to Jax's height, feet on the floor, legs centred under the origin ----
co = np.empty(len(me.vertices) * 3, dtype=np.float64)
me.vertices.foreach_get("co", co)
co = co.reshape(-1, 3)
z0 = co[:, 2].min()
s = JAX_H / (co[:, 2].max() - z0)
co[:, 2] -= z0
co *= s
# the legs' slice, without the cape hanging behind them (cape y > +0.1 here, legs < +0.05)
legs = co[(co[:, 2] > 0.25) & (co[:, 2] < 0.55) & (co[:, 1] < 0.05)]
shift = np.array([legs[:, 0].mean(), legs[:, 1].mean(), 0])
co -= shift
me.vertices.foreach_set("co", co.ravel())
me.update()
print(f"scaled by {s:.3f}; bounds min {co.min(0).round(3)} max {co.max(0).round(3)}")
legs = co[(co[:, 2] > 0.25) & (co[:, 2] < 0.55) & (co[:, 1] < 0.14)]
legL_x = legs[legs[:, 0] < 0][:, 0].mean()
legR_x = legs[legs[:, 0] > 0][:, 0].mean()
# the shard gets the same transform, then its origin moves to its centre
sc = np.empty(len(shard.data.vertices) * 3); shard.data.vertices.foreach_get("co", sc); sc = sc.reshape(-1, 3)
sc[:, 2] -= z0; sc *= s; sc -= shift
s_ctr = (sc.min(0) + sc.max(0)) / 2
shard.data.vertices.foreach_set("co", (sc - s_ctr).ravel()); shard.data.update()
shard.location = Vector(s_ctr)
print(f"shard: {len(sc)} verts, centre {tuple(round(c, 3) for c in s_ctr)}, size {np.round(sc.max(0) - sc.min(0), 3)}")

# ---- 2. arms: flood the mesh from each fingertip, staying outside the torso and in front of the backpack ----
# (per-height slicing missed fingertip vertices; walking the mesh's own edges gets the whole hand)
TORSO_X = 0.20          # half-width of the torso: the arm walk never steps inside it
TOP_Z = 1.42            # the walk stops at the shoulder
ev = np.empty(len(me.edges) * 2, dtype=np.int64)
me.edges.foreach_get("vertices", ev)
nbr = [[] for _ in range(len(co))]
for a, b in ev.reshape(-1, 2):
    nbr[a].append(b); nbr[b].append(a)
# the cape: below CAPE_Z the mesh falls apart into legs, two forearms and the cape; the cape is the
# piece well behind the legs
CAPE_Z = 1.1
below = co[:, 2] < CAPE_Z
comp = np.full(len(co), -1)
n_comp = 0
for v0 in np.where(below)[0]:
    if comp[v0] >= 0: continue
    comp[v0] = n_comp; stack = [v0]
    while stack:
        v = stack.pop()
        for n in nbr[v]:
            if below[n] and comp[n] < 0:
                comp[n] = n_comp; stack.append(n)
    n_comp += 1
cape = np.zeros(len(co), dtype=bool)
for k in range(n_comp):
    sel = comp == k
    p = co[sel]
    if sel.sum() > 200 and p[:, 1].mean() > 0.15 and p[:, 0].max() - p[:, 0].min() > 0.5:
        cape |= sel
        print(f"cape: {int(sel.sum())} verts, y {p[:, 1].min():.3f}..{p[:, 1].max():.3f}, z {p[:, 2].min():.3f}..{p[:, 2].max():.3f}")
if not cape.any(): raise SystemExit("cape not found")
FRONT = (co[:, 1] < 0.12) & ~cape
is_arm = np.zeros(len(co), dtype=bool)
arm = {}
for side, sg in (("L", -1), ("R", 1)):
    ax = co[:, 0] * sg                      # distance out to this side
    allowed = (ax > TORSO_X) & FRONT & (co[:, 2] < TOP_Z)
    cand = np.where(FRONT & (co[:, 2] > 0.6) & (co[:, 2] < 1.5))[0]
    seed = int(cand[np.argmax(ax[cand])])   # the farthest-out point is the hand (hanging or A-pose)
    seen = np.zeros(len(co), dtype=bool); seen[seed] = True
    stack = [seed]
    while stack:
        v = stack.pop()
        for n in nbr[v]:
            if allowed[n] and not seen[n]:
                seen[n] = True; stack.append(n)
    is_arm |= seen
    A = co[seen]
    top = A[A[:, 2] > TOP_Z - 0.08]
    shoulder = Vector((top[:, 0].mean() - sg * 0.04, top[:, 1].mean(), TOP_Z + 0.02))
    # measure along the arm (shoulder -> fingertip), so hanging arms and A-pose arms work the same way
    S = np.array(shoulder)
    tip = Vector(A[np.argmax(np.linalg.norm(A - S, axis=1))])
    axis = (tip - shoulder).normalized()
    L = (tip - shoulder).length
    d = (A - S) @ np.array(axis)
    def along(dc, h=0.02):
        mm = A[np.abs(d - dc) < h]
        return Vector(mm.mean(0)) if len(mm) else shoulder + axis * dc
    d_w = L - 0.19                          # hand ~19 cm
    d_e = d_w / 2                           # upper arm ~ forearm
    wrist, elbow = along(d_w), along(d_e)
    droop = math.degrees(math.atan2(abs(tip.x - shoulder.x), shoulder.z - tip.z))   # 0 = hanging straight down
    arm[side] = dict(sg=sg, shoulder=shoulder, elbow=elbow, wrist=wrist, tip=tip, axis=axis, d_e=d_e, d_w=d_w, droop=droop)
    print(f"arm {side}: {int(seen.sum())} verts, z {A[:, 2].min():.3f}..{A[:, 2].max():.3f}, |x| {np.abs(A[:, 0]).min():.3f}..{np.abs(A[:, 0]).max():.3f}; "
          f"length {L:.3f}, {droop:.0f} deg out from hanging; shoulder {tuple(round(c, 3) for c in shoulder)}, "
          f"elbow {tuple(round(c, 3) for c in elbow)}, wrist {tuple(round(c, 3) for c in wrist)}")
    # anything far out at the side that the walk didn't reach (a separate piece of the hand?) is reported
    stray = FRONT & (ax > TORSO_X + 0.25) & (co[:, 2] > 0.5) & ~seen
    if stray.any(): print(f"  WARNING {int(stray.sum())} far-out vertices not reached on side {side}")

# ---- 3. Jax's armature, legs moved to this body, plus arm bones and the Gun attach bone ----
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
for side, a in arm.items():
    for n, h, t in (("upperarm", a["shoulder"], a["elbow"]), ("forearm", a["elbow"], a["wrist"]), ("hand", a["wrist"], a["tip"])):
        b = eb[n + side]
        b.head = h; b.tail = t; b.roll = 0
hR = arm["R"]
grip = (hR["wrist"] + hR["tip"]) / 2
gun = eb.new("Gun")
gun.head = grip; gun.tail = grip + Vector((0, -0.2, 0)); gun.roll = 0
gun.parent = eb["handR"]; gun.use_connect = False; gun.use_deform = False
bpy.ops.object.mode_set(mode="OBJECT")
for b in rig.data.bones:
    print(f"  bone {b.name:10s} head {tuple(round(c, 3) for c in b.head_local)} tail {tuple(round(c, 3) for c in b.tail_local)}")

# ---- 4. weights by region ----
def ramp(v, a, b):            # 0 below a, 1 above b
    return float(min(1.0, max(0.0, (v - a) / (b - a))))

names = [b.name for b in rig.data.bones if b.use_deform]
groups = {n: body.vertex_groups.new(name=n) for n in names}
W = {n: [] for n in names}
dominant = np.zeros(len(co), dtype=np.int32)
for i, (x, y, z) in enumerate(co):
    w = {}
    side = "L" if x < 0 else "R"
    a = arm[side]
    if is_arm[i]:
        # upper arm -> forearm -> hand by distance along the arm, blended at the elbow and the wrist
        dd = (Vector((x, y, z)) - a["shoulder"]).dot(a["axis"])
        lower = ramp(dd, a["d_e"] - 0.04, a["d_e"] + 0.04)
        hand = ramp(dd, a["d_w"] - 0.03, a["d_w"] + 0.03)
        w["upperarm" + side] = 1 - lower
        w["forearm" + side] = lower * (1 - hand)
        w["hand" + side] = lower * hand
    else:
        foot = 1 - ramp(z, 0.07, 0.15)
        knee = ramp(z, 0.45, 0.55)
        hip = 1.0 if cape[i] else ramp(z, 0.82, 0.94)     # the cape never follows a leg
        leg = 1 - hip
        w["foot" + side] = leg * foot
        w["shin" + side] = leg * (1 - foot) * (1 - knee)
        w["thigh" + side] = leg * (1 - foot) * knee
        up = hip
        t1 = ramp(z, 1.0, 1.12)
        t2 = ramp(z, 1.24, 1.36)
        t3 = ramp(z, 1.56, 1.66)
        w["pelvis"] = up * (1 - t1)
        w["spine"] = up * t1 * (1 - t2)
        w["chest"] = up * t1 * t2 * (1 - t3)
        w["head"] = up * t1 * t2 * t3
        pack = 0.0            # no backpack: the cape up the back follows the torso by height instead
        # shoulder caps above the armpit blend into the upper arm so a raised arm doesn't tear
        cap = ramp(abs(x), TORSO_X - 0.03, TORSO_X + 0.03) * ramp(z, 1.24, 1.30) \
            * (1 - ramp(z, TOP_Z + 0.04, TOP_Z + 0.14)) * (1.0 if y < 0.10 else 0.0)
        if pack > 0 or cap > 0:
            keep = 1 - max(pack, cap)
            w = {k: v * keep for k, v in w.items()}
            w["chest"] = w.get("chest", 0) + pack * (1 - cap)
            w["upperarm" + side] = cap
    tot = sum(w.values())
    if tot <= 1e-6: w = {"pelvis": 1.0}; tot = 1.0
    for k, v in w.items():
        if v > 1e-3: W[k].append((i, v / tot))
    dominant[i] = names.index(max(w, key=w.get))
for n, lst in W.items():
    for i, v in lst: groups[n].add([i], v, "REPLACE")
print("weighted verts per bone:", {n: len(l) for n, l in W.items() if l})

mod = body.modifiers.new("Armature", "ARMATURE")
mod.object = rig
body.parent = rig
body.matrix_parent_inverse = Matrix.Identity(4)

# ---- 5. muzzle empty on the Gun bone, just in front of the hand ----
mz = bpy.data.objects.new("Muzzle", None)
bpy.context.scene.collection.objects.link(mz)
mz.parent = rig; mz.parent_type = "BONE"; mz.parent_bone = "Gun"
bpy.context.view_layer.update()
mz.matrix_world = Matrix.Translation(grip + Vector((0, -0.25, 0)))
mz.empty_display_size = 0.05

# ---- 5b. the shard rides on the right hand, unskinned, where it floats in the model ----
shard.parent = rig; shard.parent_type = "BONE"; shard.parent_bone = "handR"
bpy.context.view_layer.update()
shard.matrix_world = Matrix.Translation(Vector(s_ctr))

# ---- 6. textures: 1K; the ice glow keeps its own colours (a boss isn't tinted per crew member) ----
mat = body.data.materials[0]
for node in mat.node_tree.nodes:
    if node.type != "TEX_IMAGE" or not node.image: continue
    img = node.image
    if img.size[0] > 1024: img.scale(1024, 1024)
    img.pack()
mat.name = "WinterWarden"

bpy.ops.wm.save_as_mainfile(filepath=out_rig)
print("saved", out_rig)

# ---- 7. export ----
for o in bpy.context.scene.objects: o.select_set(o in (rig, body, mz, shard))
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=True, export_yup=True,
                          export_skins=True, export_animations=False, export_morph=False, export_apply=False,
                          export_image_format="JPEG", export_jpeg_quality=82, export_materials="EXPORT")
print("exported", out_glb, os.path.getsize(out_glb) // 1024, "KB")

# ---- 8. checks: weight map (colour per bone), then a pose with a stride, a twist and both arms raised ----
scn = bpy.context.scene
scn.render.engine = "BLENDER_WORKBENCH"
scn.display.shading.light = "STUDIO"
scn.render.resolution_x, scn.render.resolution_y = 640, 800
if not scn.world: scn.world = bpy.data.worlds.new("W")
cd = bpy.data.cameras.new("Cam"); cd.type = "ORTHO"; cd.ortho_scale = 2.3
cam = bpy.data.objects.new("Cam", cd); scn.collection.objects.link(cam); scn.camera = cam
views = [("front", (0, -6, 0.95), (math.pi / 2, 0, 0)), ("side", (6, -0.2, 0.95), (math.pi / 2, 0, math.pi / 2))]

palette = np.array([[0.9, 0.2, 0.2], [0.2, 0.8, 0.3], [0.25, 0.4, 0.95], [0.95, 0.85, 0.2], [0.8, 0.3, 0.9],
                    [0.2, 0.85, 0.9], [1.0, 0.55, 0.15], [0.6, 0.6, 0.6], [0.55, 0.3, 0.15], [0.1, 0.5, 0.35],
                    [0.95, 0.5, 0.7], [0.35, 0.2, 0.6], [0.7, 0.9, 0.4], [0.3, 0.3, 0.3], [1.0, 1.0, 1.0],
                    [0.5, 0.75, 1.0], [0.9, 0.7, 0.5]])
attr = me.color_attributes.new("BoneMap", "FLOAT_COLOR", "POINT")
cols = np.ones((len(co), 4), dtype=np.float32)
cols[:, :3] = palette[dominant % len(palette)]
attr.data.foreach_set("color", cols.ravel())
me.color_attributes.active_color = attr
scn.display.shading.color_type = "VERTEX"
for tag, loc, rot in views:
    cam.location = loc; cam.rotation_euler = rot
    scn.render.filepath = f"{prev}_weights_{tag}.png"
    bpy.ops.render.render(write_still=True)
print("bone colours:", {n: palette[i % len(palette)].round(2).tolist() for i, n in enumerate(names)})

scn.display.shading.color_type = "TEXTURE"
pb = rig.pose.bones
for n in ("thighL", "thighR", "shinR", "spine", "upperarmL", "upperarmR", "forearmL", "forearmR"):
    pb[n].rotation_mode = "XYZ"
pb["thighL"].rotation_euler = (math.radians(-35), 0, 0)
pb["thighR"].rotation_euler = (math.radians(30), 0, 0)
pb["shinR"].rotation_euler = (math.radians(45), 0, 0)
pb["spine"].rotation_euler = (0, math.radians(20), 0)
bpy.context.view_layer.update()
# rotate a bone's current world pose about a world axis around its own head
def swing(pbone, axis, deg):
    M = rig.matrix_world @ pbone.matrix
    p = M.to_translation()
    M2 = Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-p) @ M
    pbone.matrix = rig.matrix_world.inverted() @ M2
    bpy.context.view_layer.update()
# front: arms brought down to ~12 degrees from hanging (how an A-pose model would be posed for the game)
for sd, a in arm.items():
    swing(pb["upperarm" + sd], "Y", max(0.0, a["droop"] - 12) * (1 if sd == "R" else -1))
cam.location, cam.rotation_euler = views[0][1], views[0][2]
scn.render.filepath = f"{prev}_pose_front.png"; bpy.ops.render.render(write_still=True)
# side: then both arms raised forward ~70 degrees with the elbows bent (the character faces -Y)
for sd in ("L", "R"):
    swing(pb["upperarm" + sd], "X", -70)
    swing(pb["forearm" + sd], "X", -30)
cam.location, cam.rotation_euler = views[1][1], views[1][2]
scn.render.filepath = f"{prev}_pose_side.png"; bpy.ops.render.render(write_still=True)
print("pose renders done")
