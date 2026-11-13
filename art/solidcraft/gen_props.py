"""Generates SolidCraft scripts for Portal Break props: terminal.json and crate.json.

Run:  python gen_props.py
      solidcraft-cli run terminal.json --out terminal.glb --save terminal.sc
      solidcraft-cli run crate.json    --out crate.glb    --save crate.sc

Millimetres, Z up, the front faces -Y (it ends up facing the game camera).
Body names drive game materials in Blender: Screen -> phase/hack-coloured screen,
Trim* -> phase-coloured glow, Stripe -> amber hazard glow.
"""
import json

def script():
    S = []
    def cmd(c, **p): S.append({"command": c, "params": p})
    def box(name, L, W, H, cx, cy, cz, **extra):
        cmd("solid.box", length=L, width=W, height=H, center=[cx, cy, cz], body_name=name, **extra)
    def cut(target, L, W, H, cx, cy, cz):
        cmd("solid.box", length=L, width=W, height=H, center=[cx, cy, cz], operation="cut", targets=[target])
    def fillet(body, r, edges): cmd("solid.fillet", body=body, radius=r, tangent_chain=False, edges=edges)
    def chamfer(body, d, edges): cmd("solid.chamfer", body=body, distance=d, tangent_chain=False, edges=edges)
    return S, cmd, box, cut, fillet, chamfer

# ------------------------------------------------------------------ terminal
S, cmd, box, cut, fillet, chamfer = script()
box("Plinth", 900, 620, 80, 0, 0, 40)
chamfer("Plinth", 20, [[0, -310, 80], [0, 310, 80], [-450, 0, 80], [450, 0, 80]])
box("Body", 700, 440, 1000, 0, 40, 580)
fillet("Body", 30, [[sx * 350, 40 + sy * 220, 580] for sx in (-1, 1) for sy in (-1, 1)])
for i in range(6):                                   # side cooling vents
    for sx in (-1, 1):
        cut("Body", 60, 300, 26, sx * 350, 60, 300 + i * 70)
# angled control deck: built at the origin, tilted about its own centre, then moved onto the body
box("Console", 700, 460, 70, 0, 0, 0)
cmd("solid.move", bodies=["Console"], axis=[1, 0, 0], angle="28 deg")
cmd("solid.move", bodies=["Console"], translate=[0, -20, 1135])
box("Bezel", 620, 40, 400, 0, -182, 770)             # screen surround on the front face
cut("Bezel", 540, 60, 320, 0, -182, 770)
box("Screen", 540, 10, 320, 0, -178, 770)
box("Keypad", 520, 200, 24, 0, 0, 0)                 # sits on the deck: same tilt, offset along the deck's normal
cmd("solid.move", bodies=["Keypad"], axis=[1, 0, 0], angle="28 deg")
cmd("solid.move", bodies=["Keypad"], translate=[0, -20 - 22, 1135 + 41])
cmd("solid.cylinder", radius=40, height=900, base=[0, 280, 80], axis="Z", body_name="Conduit")
box("TrimBase", 860, 8, 14, 0, -312, 70)
box("TrimSideL", 8, 380, 14, -352, 40, 1050)
box("TrimSideR", 8, 380, 14, 352, 40, 1050)
cmd("appearance.assign", bodies=["Plinth", "Body", "Conduit"], color="#232833", pbr={"metallic": 0.7, "roughness": 0.4, "dielectric_ior": 1.5})
cmd("appearance.assign", bodies=["Console", "Bezel", "Keypad"], color="#151820", pbr={"metallic": 0.6, "roughness": 0.45, "dielectric_ior": 1.5})
cmd("appearance.assign", bodies=["Screen"], color="#40e0ff")
cmd("appearance.assign", bodies=["TrimBase", "TrimSideL", "TrimSideR"], color="#40e0ff")
json.dump(S, open("terminal.json", "w"), indent=1)
print(f"terminal.json: {len(S)} commands")

# ------------------------------------------------------------------ crate
S, cmd, box, cut, fillet, chamfer = script()
L, W, H = 1700, 1700, 1150
box("Shell", L, W, H, 0, 0, H / 2)
chamfer("Shell", 40, [[sx * L / 2, sy * W / 2, H / 2] for sx in (-1, 1) for sy in (-1, 1)])
for i in range(5):                                   # corrugation grooves on all four sides
    off = -560 + i * 280
    cut("Shell", 70, 40, 900, off, -W / 2, H / 2)
    cut("Shell", 70, 40, 900, off, W / 2, H / 2)
    cut("Shell", 40, 70, 900, -L / 2, off, H / 2)
    cut("Shell", 40, 70, 900, L / 2, off, H / 2)
for sx in (-1, 1):                                   # corner castings
    for sy in (-1, 1):
        for z in (60, H - 60):
            box(f"Corner{sx}{sy}{z}", 160, 160, 120, sx * (L / 2 - 70), sy * (W / 2 - 70), z)
box("Lid", L - 120, W - 120, 30, 0, 0, H + 15)
box("Stripe", L + 10, W + 10, 60, 0, 0, H - 200)
cut("Stripe", L - 20, W - 20, 80, 0, 0, H - 200)
cmd("appearance.assign", bodies=["Shell"], color="#3a404f", pbr={"metallic": 0.6, "roughness": 0.5, "dielectric_ior": 1.5})
cmd("appearance.assign", bodies=["Lid"] + [f"Corner{sx}{sy}{z}" for sx in (-1, 1) for sy in (-1, 1) for z in (60, H - 60)],
    color="#222630", pbr={"metallic": 0.75, "roughness": 0.4, "dielectric_ior": 1.5})
cmd("appearance.assign", bodies=["Stripe"], color="#ffb347")
json.dump(S, open("crate.json", "w"), indent=1)
print(f"crate.json: {len(S)} commands")
