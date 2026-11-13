"""Generates rifle.json, a SolidCraft script for Jax Calder's rifle.

Run:  python gen_rifle.py
      "C:/Program Files/SolidCraft/solidcraft-cli.exe" run rifle.json --out rifle.glb --save rifle.sc

Units are millimetres. The barrel points along +X, Z is up, Y is width.
Body names matter: Blender maps them to game materials (Trim* -> phase-coloured glow).
"""
import json

S = []                                   # the script
def cmd(c, **p): S.append({"command": c, "params": p})

def box(name, L, W, H, cx, cy, cz, fillet_v=0.0, chamfer_top=0.0):
    cmd("solid.box", length=L, width=W, height=H, center=[cx, cy, cz], body_name=name)
    if fillet_v:                         # round the four vertical edges
        cmd("solid.fillet", body=name, radius=fillet_v, tangent_chain=False,
            edges=[[cx + sx * L / 2, cy + sy * W / 2, cz] for sx in (-1, 1) for sy in (-1, 1)])
    if chamfer_top:                      # bevel the two long top edges
        cmd("solid.chamfer", body=name, distance=chamfer_top, tangent_chain=False,
            edges=[[cx, cy + sy * W / 2, cz + H / 2] for sy in (-1, 1)])

def cut_box(target, L, W, H, cx, cy, cz):
    cmd("solid.box", length=L, width=W, height=H, center=[cx, cy, cz], operation="cut", targets=[target])

def cyl(name, r, h, base, axis="X"):
    cmd("solid.cylinder", radius=r, height=h, base=base, axis=axis, body_name=name)

# ---- receiver: the core block ----
box("Receiver", 300, 44, 70, 0, 0, 0, fillet_v=6, chamfer_top=5)
cut_box("Receiver", 70, 50, 18, 40, 0, 12)            # ejection port recess (through the sides)
# ---- top rail with teeth ----
box("Rail", 250, 22, 10, -10, 0, 40)
for i in range(14):
    cut_box("Rail", 7, 30, 6, -125 + i * 17.5, 0, 44)
# ---- handguard with vent slots ----
box("Handguard", 220, 52, 56, 255, 0, 4, fillet_v=8, chamfer_top=6)
for i in range(5):
    cut_box("Handguard", 26, 70, 12, 185 + i * 34, 0, 8)
# ---- barrel + muzzle brake with ports ----
cyl("Barrel", 11, 175, [362, 0, 10])
cyl("Brake", 17, 55, [530, 0, 10])
for i in range(3):
    cut_box("Brake", 8, 50, 9, 545 + i * 14, 0, 10)
# ---- magazine (angled) ----
box("Magazine", 40, 34, 125, 45, 0, -92, fillet_v=4)
cmd("solid.move", bodies=["Magazine"], axis=[0, 1, 0], angle="-10 deg")
# ---- pistol grip (raked back) + trigger guard ----
box("Grip", 34, 36, 105, -72, 0, -78, fillet_v=9)
cmd("solid.move", bodies=["Grip"], axis=[0, 1, 0], angle="16 deg")
box("TriggerGuard", 62, 10, 8, -30, 0, -52)
# ---- stock with a lightening hole + butt pad ----
box("Stock", 180, 40, 62, -238, 0, -6, fillet_v=8, chamfer_top=5)
cmd("solid.cylinder", radius=17, height=60, base=[-238, -30, -4], axis="Y", operation="cut", targets=["Stock"])
box("ButtPad", 18, 46, 84, -337, 0, -8, fillet_v=6)
# ---- optic on the rail ----
cyl("Optic", 16, 120, [-60, 0, 66])
cyl("OpticLens", 13, 4, [61, 0, 66])
box("OpticMounts", 90, 20, 18, 0, 0, 52)
# ---- glow strips (the game recolours these cyan / red per phase) ----
box("TrimL", 160, 2, 6, 255, 27, 10)
box("TrimR", 160, 2, 6, 255, -27, 10)
box("TrimTop", 120, 6, 2, -10, 0, 46)

# ---- colours (Blender re-maps them to the game's materials) ----
dark = ["Receiver", "Barrel", "Brake", "Magazine", "Grip", "TriggerGuard", "Rail", "OpticMounts"]
mid = ["Handguard", "Stock", "ButtPad", "Optic"]
cmd("appearance.assign", bodies=dark, color="#1b1d23", pbr={"metallic": 0.85, "roughness": 0.35, "dielectric_ior": 1.5})
cmd("appearance.assign", bodies=mid, color="#2c313b", pbr={"metallic": 0.5, "roughness": 0.5, "dielectric_ior": 1.5})
cmd("appearance.assign", bodies=["TrimL", "TrimR", "TrimTop", "OpticLens"], color="#40e0ff")

json.dump(S, open("rifle.json", "w"), indent=1)
print(f"wrote rifle.json with {len(S)} commands")
