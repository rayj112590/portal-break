# Blender (background): turn a decimated Rodin weapon into a game GLB that a character can hold.
# blender -b --factory-startup --python weapon_prep.py -- <kind> <work.blend> <out.glb> <out.blend> <preview_prefix>
#
# Game contract (weapon system, see GAME_DESIGN -> "Weapons and skins for every character"):
#   root "Weapon<Kind>" with its origin AT THE RIGHT-HAND GRIP, so parenting it to a character's
#   Gun bone (on handR) puts the grip in the hand. Barrel along -Y in Blender (= glTF +Z, the way the
#   characters face), handles hanging down (-Z), top (+Z) up.
#   children: "<Kind>Body" mesh (+ optional "Drum" mesh, origin on its own axis so it can revolve)
#             empties "Grip" (right hand, = root origin), "Foregrip" (left hand), "Muzzle" (barrel mouth)
#   one lit material "Weapon<Kind>" with the weapon's own colours (not tinted per crew member).
# Each weapon needs a few facts from looking at the Rodin model (CONFIG below): which way its muzzle and
# its handles point in the imported model, its length in the game, and where the handles and drum are.
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
kind, work, out_glb, out_blend, prev = argv[:5]

AX = {"+X": (1, 0, 0), "-X": (-1, 0, 0), "+Y": (0, 1, 0), "-Y": (0, -1, 0), "+Z": (0, 0, 1), "-Z": (0, 0, -1)}
CONFIG = {
    # Rodin 5e36083d: stands on end like the concept art (muzzle bell up), both handles and the gift drum
    # stick out to +Y; the front handle is the one near the muzzle, the rear one has the trigger guard.
    # The drum is fused to the body (its only loose piece is a small knob), so it doesn't revolve.
    "present": dict(muzzle="+Z", handles="+Y", length=0.85, drum=False),
    # Rodin e67ba3b6: the crew's rifle, lying along Y with the muzzle (a ringed brake) at -Y and the
    # foregrip, drum magazine and pistol grip hanging down. The drum hangs about as low as the two grips,
    # so "deepest part = drum" doesn't work here: groups=True splits whatever hangs under the gun into
    # runs along its length instead (front run = foregrip, last = pistol grip, middle = drum).
    "rifle": dict(muzzle="-Y", handles="-Z", length=0.92, drum=False, groups=True),
    # Rodin 791e3631 (Christmas): the snowball launcher stands on end like the present (frosted bell
    # muzzle up), both handles and the box of snowballs stick out to +Y, and the box sticks out furthest,
    # between the handles, so the default "deepest part = drum" rule finds it. The box is fused, no revolve.
    "snowball": dict(muzzle="+Z", handles="+Y", length=0.9, drum=False),
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

def verts():
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); return co.reshape(-1, 3)
def set_verts(co):
    me.vertices.foreach_set("co", co.ravel()); me.update()

# ---- 1. orient: muzzle -> -Y, handles -> -Z; scale to the game length ----
m_dir, h_dir = np.array(AX[cfg["muzzle"]], float), np.array(AX[cfg["handles"]], float)
x_dir = np.cross(m_dir, h_dir)            # becomes +X:  (-Y) x (-Z) = +X in the target frame
R = np.array([x_dir, -m_dir, -h_dir])     # rows: where each target axis comes from
co = verts() @ R.T
length = co[:, 1].max() - co[:, 1].min()
s = cfg["length"] / length
co *= s
co -= np.array([(co[:, 0].min() + co[:, 0].max()) / 2, co[:, 1].min(), 0])   # muzzle end at y = 0, centred in x
set_verts(co)
print(f"{kind}: scale {s:.3f}, size {np.round(co.max(0) - co.min(0), 3)}")

fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get("vertices", fv); fv = fv.reshape(-1, 3)
fc = co[fv].mean(1)

# ---- 2. landmarks ----
# barrel: the core most of the length runs through; its underside is where the handles start
core_z = np.median(co[:, 2])
under = co[:, 2] < np.percentile(co[:, 2], 35)
print(f"core z {core_z:.3f}")
hang_all = co[:, 2] < core_z - 0.06 * cfg["length"]
if cfg.get("groups"):
    # runs along the length (1 cm bins, 1-bin gaps bridged) of whatever reaches below 40% of the way
    # from the lowest point up to the core: separate handles and magazines, not the stock or trigger guard
    low = co[:, 2] < co[:, 2].min() + 0.4 * (core_z - co[:, 2].min())
    y0 = co[:, 1].min()
    bins = np.bincount(((co[low, 1] - y0) / 0.01).astype(int))
    runs, start, gap = [], None, 0
    for i, n in enumerate(list(bins) + [0, 0]):
        if n:
            if start is None: start = i
            gap = 0; end = i
        elif start is not None:
            gap += 1
            if gap > 1:
                if bins[start:end + 1].sum() >= 8: runs.append((y0 + start * 0.01, y0 + (end + 1) * 0.01))
                start = None
    print("runs hanging under the gun (y):", [(round(a, 3), round(b, 3)) for a, b in runs])
    if len(runs) < 2: raise SystemExit("groups: expected a foregrip and a grip hanging under the gun")
    pad = 0.015
    front = hang_all & (co[:, 1] > runs[0][0] - pad) & (co[:, 1] < runs[0][1] + pad)
    rear = hang_all & (co[:, 1] > runs[-1][0] - pad) & (co[:, 1] < runs[-1][1] + pad)
    mid = runs[1:-1]
    drum_y0, drum_y1 = (mid[0][0], mid[-1][1]) if mid else (runs[0][1], runs[-1][0])
    print(f"drum / magazine y {drum_y0:.3f}..{drum_y1:.3f}")
else:
    # the drum hangs lowest of all, between the handles: the y-range of the deepest vertices
    deep = co[:, 2] < co[:, 2].min() + 0.25 * (core_z - co[:, 2].min())
    drum_y0, drum_y1 = co[deep, 1].min(), co[deep, 1].max()
    print(f"drum (deepest part) y {drum_y0:.3f}..{drum_y1:.3f}")
    # handles: hanging below the barrel, outside the drum's length; front one nearer the muzzle (smaller y)
    hang = hang_all & ((co[:, 1] < drum_y0 - 0.01) | (co[:, 1] > drum_y1 + 0.01))
    front = hang & (co[:, 1] < drum_y0)
    rear = hang & (co[:, 1] > drum_y1)
def handle_point(mask):
    p = co[mask]
    # where the hand closes: halfway down the handle, at that height's centre
    zmid = (p[:, 2].min() + core_z) / 2
    q = p[np.abs(p[:, 2] - zmid) < 0.02] if (np.abs(p[:, 2] - zmid) < 0.02).sum() > 3 else p
    return Vector(q.mean(0))
fore, grip = handle_point(front), handle_point(rear)
mz = co[co[:, 1] < co[:, 1].min() + 0.01]
muzzle = Vector((mz[:, 0].mean(), co[:, 1].min(), mz[:, 2].mean()))
print(f"foregrip {tuple(round(c, 3) for c in fore)} ({front.sum()} verts), grip {tuple(round(c, 3) for c in grip)} ({rear.sum()} verts), "
      f"spacing {(grip - fore).length:.3f} m, muzzle {tuple(round(c, 3) for c in muzzle)}")

# ---- 3. optional drum: mesh islands sitting in the drum's region become their own part ----
parts = []
drum_mask = np.zeros(len(fc), bool)
drum_axis = None
if cfg.get("drum"):
    ev = np.empty(len(me.edges) * 2, dtype=np.int64); me.edges.foreach_get("vertices", ev)
    par = list(range(len(co)))
    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a
    for a, b in ev.reshape(-1, 2):
        ra, rb = find(int(a)), find(int(b))
        if ra != rb: par[ra] = rb
    isl = np.array([find(i) for i in range(len(co))])
    ids, inv, cnt = np.unique(isl, return_inverse=True, return_counts=True)
    print(f"{len(ids)} islands")
    in_drum = (co[:, 1] > drum_y0 - 0.005) & (co[:, 1] < drum_y1 + 0.005) & (co[:, 2] < core_z)
    for k in np.argsort(-cnt)[:12]:
        sel = inv == k
        frac = in_drum[sel].mean()
        p = co[sel]
        print(f"   island {cnt[k]:5d} verts, {frac:.0%} in drum region, y {p[:, 1].min():.3f}..{p[:, 1].max():.3f} z {p[:, 2].min():.3f}..{p[:, 2].max():.3f}")
        if frac > 0.9 and cnt[k] < 0.6 * len(co):
            drum_mask |= sel[fv[:, 0]]
    if drum_mask.any():
        dp = co[np.unique(fv[drum_mask].ravel())]
        drum_axis = Vector(((dp[:, 0].min() + dp[:, 0].max()) / 2, 0, (dp[:, 2].min() + dp[:, 2].max()) / 2))
        drum_axis.y = (dp[:, 1].min() + dp[:, 1].max()) / 2
        print(f"drum: {drum_mask.sum()} faces, centre {tuple(round(c, 3) for c in drum_axis)} (revolves around Y)")
    else:
        print("drum: not a separate piece of the mesh, left in the body")

# ---- 4. build the hierarchy, origin at the grip ----
root = bpy.data.objects.new("Weapon" + Kind, None); scn.collection.objects.link(root)
def make_part(mask, name, origin):
    m = me.copy(); m.name = name
    bm = bmesh.new(); bm.from_mesh(m); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not mask[f.index]], context="FACES")
    bmesh.ops.translate(bm, verts=bm.verts, vec=-Vector(origin))
    bm.to_mesh(m); bm.free()
    ob = bpy.data.objects.new(name, m); scn.collection.objects.link(ob)
    ob.parent = root; ob.location = Vector(origin) - grip
    parts.append(ob)
    print(f"  part {name}: {len(m.polygons)} faces")
    return ob
make_part(~drum_mask, Kind + "Body", grip)
if drum_mask.any(): make_part(drum_mask, "Drum", drum_axis)
for name, p in (("Grip", grip), ("Foregrip", fore), ("Muzzle", muzzle)):
    e = bpy.data.objects.new(name, None); scn.collection.objects.link(e)
    e.parent = root; e.location = p - grip; e.empty_display_size = 0.03
bpy.data.objects.remove(src)

# ---- 5. textures at 1K, the weapon keeps its own colours ----
mat = parts[0].data.materials[0]
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

# ---- 6. check renders: textured with markers (grip green, foregrip blue, muzzle red), parts in colour ----
scn.render.engine = "BLENDER_WORKBENCH"; scn.display.shading.light = "STUDIO"
scn.render.resolution_x, scn.render.resolution_y = 800, 520
if not scn.world: scn.world = bpy.data.worlds.new("W")
for name, col in (("Grip", (0.2, 1, 0.3, 1)), ("Foregrip", (0.2, 0.5, 1, 1)), ("Muzzle", (1, 0.2, 0.2, 1))):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.018, location=bpy.data.objects[name].matrix_world.translation)
    mk = bpy.context.active_object; mk.color = col; mk.name = "mark_" + name
bpy.context.view_layer.update()
pts = [p.matrix_world @ Vector(c) for p in parts for c in p.bound_box]
bmn = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
bmx = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
ctr = (bmn + bmx) / 2
tgt = bpy.data.objects.new("T", None); scn.collection.objects.link(tgt); tgt.location = ctr
cd = bpy.data.cameras.new("C"); cd.type = "ORTHO"; cd.ortho_scale = max(bmx - bmn) * 1.15
cam = bpy.data.objects.new("C", cd); scn.collection.objects.link(cam); scn.camera = cam
c = cam.constraints.new("TRACK_TO"); c.target = tgt; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"
palette = [(0.85, 0.85, 0.85, 1), (1, 0.75, 0.2, 1)]
for i, p in enumerate(parts): p.color = palette[i % 2]
for colour, tag, loc in (("TEXTURE", "side", (ctr.x + 3, ctr.y, ctr.z)), ("TEXTURE", "three4", (ctr.x + 2.2, ctr.y - 1.6, ctr.z + 1.4)),
                         ("OBJECT", "side", (ctr.x + 3, ctr.y, ctr.z)), ("OBJECT", "below", (ctr.x + 0.01, ctr.y, ctr.z - 3))):
    scn.display.shading.color_type = colour
    cam.location = loc
    scn.render.filepath = f"{prev}_{colour.lower()}_{tag}.png"; bpy.ops.render.render(write_still=True)
print("renders done")
