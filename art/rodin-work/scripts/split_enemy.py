# Blender (background): turn a decimated Rodin enemy into a game GLB with the moving parts split off.
# blender -b --factory-startup --python split_enemy.py -- <type> <work.blend> <out.glb> <out.blend> <preview_prefix> <target_tris>
#
# Game contract (src/enemies.js): every enemy has a "Head" node. The drone's Head is moved to y=1.7 and the
# wraith's to y=1.2 by code, so their meshes are centred on the Head origin; the turret's Head only turns
# around Y, so its origin sits on the dome's vertical axis. The drone gets Rotor1..4 (spun around their own
# Y axis). One textured material per model, named Rodin<Type>; its emissive map is made grey so the game
# can tint the glow per enemy type / phase and pulse it as the attack warning.
# The snowman (Christmas event, behind src/events.js) is 1.8 m tall and stands on the floor: Snowman > Base
# (bottom snowball, origin at the ball's centre so turning it around X rolls it) and Snowman > Head (empty
# at the waist; turns to face / aim) > SnowmanBody, HandL, HandR (the floating gauntlets, origin at each
# gauntlet's centre so they can bob and swipe).
import bpy, bmesh, sys, os, math
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index("--") + 1:]
kind, work, out_glb, out_blend, prev = argv[:5]
target = int(argv[5])
bpy.ops.wm.open_mainfile(filepath=work)
scn = bpy.context.scene
src = bpy.data.objects["RodinRaw"]
for o in bpy.context.selected_objects: o.select_set(False)
src.select_set(True)
bpy.context.view_layer.objects.active = src
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

# ---- 1. decimate to the enemy budget ----
n0 = len(src.data.polygons)
if target < n0:
    mod = src.modifiers.new("Decimate", "DECIMATE")
    mod.decimate_type = "COLLAPSE"; mod.ratio = target / n0; mod.use_collapse_triangulate = True
    bpy.ops.object.modifier_apply(modifier=mod.name)
me = src.data
print(f"{kind}: {n0} -> {len(me.polygons)} faces")

def verts():
    co = np.empty(len(me.vertices) * 3); me.vertices.foreach_get("co", co); return co.reshape(-1, 3)
def set_verts(co):
    me.vertices.foreach_set("co", co.ravel()); me.update()
def centers():
    c = np.empty(len(me.polygons) * 3); me.polygons.foreach_get("center", c); return c.reshape(-1, 3)

# ---- 2. scale and place (Blender Z up, front = -Y = glTF +Z) ----
co = verts()
mn, mx = co.min(0), co.max(0)
if kind == "drone":      s = 1.40 / (mx[0] - mn[0])          # 1.4 m across the rotors
elif kind == "turret":   s = 1.30 / (mx[2] - mn[2])          # 1.3 m tall
elif kind == "wraith":   s = 1.70 / (mx[2] - mn[2])          # 1.7 m tall, floats around y=1.2
elif kind == "snowman":  s = 1.80 / (mx[2] - mn[2])          # 1.8 m tall, on the floor
co[:, 0] -= (mn[0] + mx[0]) / 2
co[:, 1] -= (mn[1] + mx[1]) / 2
co[:, 2] -= mn[2]
co *= s
if kind in ("drone", "wraith"): co[:, 2] -= co[:, 2].max() / 2   # centred on the Head origin
set_verts(co)
print("scale", round(s, 3), "bbox", co.min(0).round(3), co.max(0).round(3))

root = bpy.data.objects.new(kind.capitalize(), None); scn.collection.objects.link(root)
head = bpy.data.objects.new("Head", None); scn.collection.objects.link(head)
head.parent = root
fc = centers()
parts = []

def make_part(mask, name, origin, parent):
    m = me.copy(); m.name = name
    bm = bmesh.new(); bm.from_mesh(m); bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not mask[f.index]], context="FACES")
    bmesh.ops.translate(bm, verts=bm.verts, vec=-Vector(origin))
    bm.to_mesh(m); bm.free()
    ob = bpy.data.objects.new(name, m); scn.collection.objects.link(ob)
    ob.parent = parent
    bpy.context.view_layer.update()
    # the drone's and wraith's vertices are already centred on the Head origin, so a part on the Head is
    # placed at its origin as is. (Until Nov 19 this subtracted the Head's height for them too, which left
    # their bodies 1.7 / 1.2 m low: drones and wraiths sat on the floor and a held drone hung at Boulder's waist.)
    head_local = kind in ("drone", "wraith") and parent is head
    ob.location = Vector(origin) - (Vector() if head_local else parent.matrix_world.translation)
    parts.append(ob)
    print(f"  part {name}: {len(m.polygons)} faces, origin {tuple(round(v, 3) for v in origin)}")
    return ob

def fit_circle(p):          # algebraic (Kasa) circle fit in 2D
    A = np.c_[2 * p[:, 0], 2 * p[:, 1], np.ones(len(p))]
    b = (p ** 2).sum(1)
    cx, cy, c = np.linalg.lstsq(A, b, rcond=None)[0]
    return np.array([cx, cy]), math.sqrt(c + cx * cx + cy * cy)

if kind == "drone":
    head.location = (0, 0, 1.7)
    rotor = np.zeros(len(fc), bool)
    rotors = []
    for k, (sx, sy) in enumerate([(-1, -1), (1, -1), (-1, 1), (1, 1)]):
        c = np.array([sx * 0.64 * s, sy * 0.59 * s])  # rough (raw units x scale), from the top view
        for _ in range(3):
            d = co[:, :2] - c
            r = np.hypot(d[:, 0], d[:, 1])
            near = r < 0.30
            ang = np.arctan2(d[near, 1], d[near, 0]); rr = r[near]
            rim = []
            outward = np.arctan2(sy, sx)
            for a0 in np.linspace(-math.pi, math.pi, 48, endpoint=False):
                da = (a0 - outward + math.pi) % (2 * math.pi) - math.pi
                if abs(da) > math.radians(100): continue          # only the side facing away from the body
                sel = (ang >= a0) & (ang < a0 + 2 * math.pi / 48)
                if sel.any():
                    i = np.argmax(rr[sel]); rim.append(c + np.array([math.cos(ang[sel][i]), math.sin(ang[sel][i])]) * rr[sel][i])
            c, R = fit_circle(np.array(rim))
        d = fc[:, :2] - c
        inner = np.hypot(d[:, 0], d[:, 1]) < R - 0.05
        rotor |= inner
        zc = fc[inner, 2]
        rotors.append((inner, np.array([c[0], c[1], (zc.min() + zc.max()) / 2]), R))
        print(f"rotor {k + 1}: centre {c.round(3)} R {R:.3f} inner faces {inner.sum()} z {zc.min():.3f}..{zc.max():.3f}")
    make_part(~rotor, "DroneBody", (0, 0, 0), head)
    for k, (mask, ctr, R) in enumerate(rotors):
        make_part(mask, f"Rotor{k + 1}", ctr, head)

elif kind == "turret":
    # dome + gun pods turn; legs stay. Dome footprint is an ellipse around (0, cy).
    cy = 0.035 * s                      # raw units x scale, from the height profile
    ex, ey = 0.40 * s, 0.53 * s
    zlo, zhi = 0.30 * s, 0.93 * s
    inside = (fc[:, 0] / ex) ** 2 + ((fc[:, 1] - cy) / ey) ** 2 < 1
    top = (fc[:, 2] > zlo) & inside | (fc[:, 2] > zhi)
    head.location = (0, cy, zhi)
    make_part(~top, "TurretLegs", (0, 0, 0), root)
    make_part(top, "TurretHead", (0, cy, zhi), head)

elif kind == "wraith":
    head.location = (0, 0, 1.2)
    make_part(np.ones(len(fc), bool), "WraithBody", (0, 0, 0), head)

elif kind == "snowman":
    # mesh islands (Rodin floats the gauntlets free of the body)
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
    cen = np.array([co[inv == k].mean(0) for k in range(len(ids))])
    order = np.argsort(-cnt)
    print(f"{len(ids)} islands; biggest:")
    for k in order[:8]:
        pts = co[inv == k]
        print(f"   {cnt[k]:6d} verts, centre {cen[k].round(3)}, x {pts[:, 0].min():.2f}..{pts[:, 0].max():.2f}, z {pts[:, 2].min():.2f}..{pts[:, 2].max():.2f}")
    fv = np.empty(len(me.polygons) * 3, dtype=np.int64); me.polygons.foreach_get("vertices", fv); fv = fv.reshape(-1, 3)
    f_isl = inv[fv[:, 0]]
    # gauntlets: islands whose centre is out at the side and below the shoulder crystals
    side_isl = (np.abs(cen[:, 0]) > 0.40) & (cen[:, 2] < 0.95)
    handL = side_isl[f_isl] & (cen[f_isl, 0] < 0)
    handR = side_isl[f_isl] & (cen[f_isl, 0] > 0)
    print(f"gauntlet faces L {handL.sum()} R {handR.sum()}")
    stray = (np.abs(fc[:, 0]) > 0.50) & (fc[:, 2] < 0.85) & ~(handL | handR)
    if stray.any(): print(f"WARNING {stray.sum()} faces out at the sides aren't in a gauntlet island")
    # waist: the narrowest point between the bottom snowball and the torso (gauntlets left out)
    body_v = np.ones(len(co), bool); body_v[fv[handL | handR].ravel()] = False
    prof = []
    for z0 in np.arange(0.30, 0.80, 0.02):
        m = body_v & (co[:, 2] >= z0) & (co[:, 2] < z0 + 0.02)
        if m.sum() > 5: prof.append((z0 + 0.01, np.percentile(np.abs(co[m, 0]), 98)))
    print("half-width by height:", " ".join(f"{z:.2f}:{w:.2f}" for z, w in prof))
    z_waist = min(prof, key=lambda p: p[1])[0]
    base = (fc[:, 2] < z_waist) & ~(handL | handR)
    # the ball's centre: least-squares sphere through the base's vertices
    bp = co[np.unique(fv[base].ravel())]
    A = np.c_[2 * bp, np.ones(len(bp))]
    sol = np.linalg.lstsq(A, (bp ** 2).sum(1), rcond=None)[0]
    bc, br = sol[:3], math.sqrt(sol[3] + (sol[:3] ** 2).sum())
    print(f"waist z {z_waist:.3f}; base ball centre {bc.round(3)} radius {br:.3f}")
    head.location = (0, 0, z_waist)
    make_part(base, "Base", tuple(bc), root)
    make_part(~(base | handL | handR), "SnowmanBody", (0, 0, z_waist), head)
    for nm, mask in (("HandL", handL), ("HandR", handR)):
        make_part(mask, nm, tuple(fc[mask].mean(0)), head)

bpy.data.objects.remove(src)

# ---- 3. textures: 1K, emissive turned grey (tinted in code) ----
mat = parts[0].data.materials[0]
for node in mat.node_tree.nodes:
    if node.type != "TEX_IMAGE" or not node.image: continue
    img = node.image
    if img.size[0] > 1024: img.scale(1024, 1024)
    if "emissive" in img.name:
        px = np.empty(img.size[0] * img.size[1] * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        px = px.reshape(-1, 4)
        lum = px[:, :3].max(1)
        ref = np.percentile(lum[lum > 0.05], 98) if (lum > 0.05).any() else 1
        lum = np.clip(lum / max(1e-3, ref), 0, 1)
        px[:, 0] = px[:, 1] = px[:, 2] = lum
        img.pixels.foreach_set(px.ravel())
    img.pack()
mat.name = "Rodin" + kind.capitalize()

bpy.ops.wm.save_as_mainfile(filepath=out_blend)

# ---- 4. export ----
for o in scn.objects: o.select_set(o is root or o is head or o in parts)
bpy.context.view_layer.objects.active = root
bpy.ops.export_scene.gltf(filepath=out_glb, export_format="GLB", use_selection=True, export_yup=True,
                          export_animations=False, export_morph=False, export_skins=False,
                          export_image_format="JPEG", export_jpeg_quality=82, export_materials="EXPORT")
print("exported", out_glb, os.path.getsize(out_glb) // 1024, "KB")

# ---- 5. check renders: parts in flat colours (front / side / top), then textured ----
scn.render.engine = "BLENDER_WORKBENCH"
scn.display.shading.light = "STUDIO"
scn.render.resolution_x = scn.render.resolution_y = 520
if not scn.world: scn.world = bpy.data.worlds.new("W")
palette = [(0.9, 0.9, 0.9, 1), (1, 0.3, 0.2, 1), (0.2, 0.8, 1, 1), (1, 0.85, 0.1, 1), (0.4, 1, 0.3, 1)]
for i, p in enumerate(parts): p.color = palette[i % len(palette)]
bpy.context.view_layer.update()
pts = []
for p in parts:
    for c in p.bound_box: pts.append(p.matrix_world @ Vector(c))
bmn = Vector((min(v.x for v in pts), min(v.y for v in pts), min(v.z for v in pts)))
bmx = Vector((max(v.x for v in pts), max(v.y for v in pts), max(v.z for v in pts)))
ctr = (bmn + bmx) / 2
cd = bpy.data.cameras.new("Cam"); cd.type = "ORTHO"; cd.ortho_scale = max(bmx - bmn) * 1.1
cam = bpy.data.objects.new("Cam", cd); scn.collection.objects.link(cam); scn.camera = cam
views = [("front", (ctr.x, bmn.y - 5, ctr.z), (math.pi / 2, 0, 0)),
         ("side", (bmx.x + 5, ctr.y, ctr.z), (math.pi / 2, 0, math.pi / 2)),
         ("top", (ctr.x, ctr.y, bmx.z + 5), (0, 0, 0)),
         ("three4", (ctr.x + 3.2, bmn.y - 3.2, ctr.z + 3.6), (math.radians(52), 0, math.radians(45)))]
for colour in ("OBJECT", "TEXTURE"):
    scn.display.shading.color_type = colour
    for tag, loc, rot in views:
        if colour == "TEXTURE" and tag != "three4": continue
        cam.location = loc; cam.rotation_euler = rot
        scn.render.filepath = f"{prev}_{colour.lower()}_{tag}.png"
        bpy.ops.render.render(write_still=True)
if kind == "turret":
    head.rotation_euler = (0, 0, math.radians(70)); bpy.context.view_layer.update()
    cam.location, cam.rotation_euler = views[3][1], views[3][2]
    scn.render.filepath = f"{prev}_texture_turned.png"; bpy.ops.render.render(write_still=True)
    scn.display.shading.color_type = "OBJECT"
    cam.location, cam.rotation_euler = views[2][1], views[2][2]
    scn.render.filepath = f"{prev}_object_turnedtop.png"; bpy.ops.render.render(write_still=True)
if kind == "snowman":
    # move test: ball rolled, body turned, one gauntlet raised and swung, the other bobbed down
    objs = {o.name: o for o in scn.objects}
    objs["Base"].rotation_euler = (math.radians(70), 0, 0)
    head.rotation_euler = (0, 0, math.radians(-25))
    objs["HandR"].location.z += 0.35; objs["HandR"].rotation_euler = (math.radians(-60), 0, math.radians(20))
    objs["HandL"].location.z -= 0.08
    bpy.context.view_layer.update()
    scn.display.shading.color_type = "TEXTURE"
    cam.location, cam.rotation_euler = views[3][1], views[3][2]
    scn.render.filepath = f"{prev}_texture_moved.png"; bpy.ops.render.render(write_still=True)
print("renders done")
