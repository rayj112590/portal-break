# Portal Break — Devlog

Game Off 2026 · theme **SHIFT** · deadline Dec 1, 13:37 PST

Each entry is written to double as a YouTube script: what changed, why, and the shots to show.

---

## Day 1 — Nov 12: From sidebar puzzle to neon twin-stick

**Before:** a 2D canvas maze. You collected artifacts, dodged red circles, and most of the game lived in an HTML sidebar.
![before](devlog/2026-11-12/00-before-prototype.jpg)

**Goal:** make it look and feel like an isometric cyberpunk twin-stick shooter, and make SHIFT the core mechanic instead of a random teleport.

### The big idea
**SHIFT phases you between two versions of the same district:**
- **CITY:** holo-barriers block streets. Drones and turrets patrol. Terminals can be hacked.
- **BREACH:** barriers vanish, red crystals grow in other places, and a bridge appears over the chasm. Wraiths hunt you, and rift nodes can be hacked. It drains your phase energy.
- You **can't shift into something solid**. Standing on the Breach bridge and shifting to City gets blocked, because there's no floor there.
- Enemies only exist in their own world. In the other one they're harmless ghosts, so you can shift to escape a fight.

### What got built (all in one session)
- **Engine:** Three.js loaded from a CDN, plain ES modules, no build step.
- **Look:** 60° angled camera with aim look-ahead, wet floor reflections (PMREM env maps), bloom, a custom post shader (chromatic aberration, breach color grade, glitch lines on shift, damage vignette, scanlines), shadows from a moon light that follows the player, 8 pooled street-lamp lights, procedural neon signs, window-lit buildings, rooftop beacons, rain in the City and embers in the Breach.
- **Combat:** mouse aim, hold to fire, dash with i-frames, crits, damage numbers, hit-stop on kills, screen shake, explosions, health and phase pickups.
- **Enemies:** drones (strafe and shoot), turrets (3-round bursts), wraiths (pathfind with a BFS flow field, wind up, lunge).
- **Objective loop:** 4 locks (2 city terminals, 2 rift nodes). Each hack calls in reinforcements. All 4 open the exit portal.
- **Audio:** fully synthesized with WebAudio. A step-sequencer soundtrack re-voices itself darker in the Breach, plus rain ambience and every SFX.
- **HUD:** health and phase bars, objective banner, live minimap that swaps with the phase, dash cooldown, toasts, hack prompts.
- **F9 clip recorder:** records the game canvas plus audio to `.webm`, with no HUD. Use it for trailer footage.

### Shots for the video
| Shot | File |
|---|---|
| Title screen | ![](devlog/2026-11-12/01-title-screen.jpg) |
| First run: way too dark | ![](devlog/2026-11-12/02-first-run-too-dark.jpg) |
| After the lighting pass | ![](devlog/2026-11-12/03-lighting-fixed.jpg) |
| SHIFT into the Breach | ![](devlog/2026-11-12/04-phase-shift-breach.jpg) |
| Hacking a terminal | ![](devlog/2026-11-12/05-hacking-terminal.jpg) |
| Lock breached, reinforcements | ![](devlog/2026-11-12/06-lock-breached-reinforcements.jpg) |
| Combat: crit + loot drop | ![](devlog/2026-11-12/07-combat-crit-and-loot.jpg) |

### Bugs and lessons (good video moments)
- **Too dark on first run.** Neon only looks good when the surfaces around it are visible. Fix: tripled ambient and moon light, doubled lamp intensity, lightened ground and facades.
- **Died in 23 seconds standing still.** Two drones could see the spawn point. Fix: lower damage and range, plus a 2.5-second grace period.
- **Shift key not detected in automation.** Some environments report Shift only through `e.key`. Fix: fall back to `e.key`. Right-click also shifts (and saves you from Windows Sticky Keys).
- **Intel Iris Xe GPU.** Added auto quality: if FPS stays under 40 for the first 4 seconds, it drops MSAA, resolution and shadow size. There's also a manual toggle in the pause menu.

---

## Day 1, part 2 — Blender models

All four characters were modeled in Blender 5.2, driven live through the Blender connection, and exported as GLB files.

**Source file:** `art/portal_break_models.blend` (the build script lives inside it as the `pb_helpers.py` text block).
**Exports:** `assets/models/player.glb`, `drone.glb`, `turret.glb`, `wraith.glb` (13–103 KB each).

| Model | Design |
|---|---|
| ~~Kael Ren~~ (first-pass player) | Armored operative: visor helmet, high collar, long coat, glowing phase-core backpack, rifle. Replaced in part 3. |
| **Drone** | Hover body with a magenta eye, a spinning halo ring, side rotor pods and an under-slung gun. |
| **Turret** | Octagonal base with a glowing band, and a rotating head with twin barrels and an orange sensor strip. |
| **Wraith** | Crimson crystal body with a crown of spikes, blade arms, trailing tendrils, a glowing core and three orbiting shards. |

![lineup](devlog/2026-11-12/09-blender-lineup.png)
![player close-up](devlog/2026-11-12/08-blender-player.png)

**The naming contract between Blender and the game:** materials named `Trim*`, `Core*`, `Eye*` or `Glow*` become unlit neon that the game recolors (cyan in the City, red in the Breach). Object names (`LegL`, `Gun`, `Muzzle`, `Head`, `Ring`, `Shell`, `Shard1-3`) are the parts the game animates. If a GLB fails to load, the old box stand-ins are used instead.

![in game](devlog/2026-11-12/11-blender-models-in-game.png)
![shift effect](devlog/2026-11-12/10-shift-effect-midframe.jpg)

### Bugs and lessons
- **Detailed models broke the x-ray silhouette.** The "see yourself behind buildings" ghost also drew wherever the model's own parts overlapped, like the chest plate over the chest, which washed the player out. Fix: the player stamps a stencil mask, and the ghost only draws where a building actually hides the player.
- **The stencil buffer then went black on Intel graphics.** This Intel/Direct3D driver can't combine MSAA with a stencil buffer. Fix: dropped MSAA and added an FXAA pass, which is also cheaper on integrated GPUs.
- **Testing in a hidden browser.** Background tabs don't run animation frames, so screenshots came back black even though the game was fine. Added `__probe()`, which renders one frame on demand and measures brightness, so rendering can be checked without seeing it.

---

## Day 1, part 3 — Meet Jax Calder

The main character got a name and a real design. Reference sheets are in `art/reference/`. Jax uses the male turnaround: short dark hair, stubble, and a black tactical suit.

Rebuilt from scratch in Blender to match the sheet:
- **Front:** gunmetal chest plate with the **cyan ring emblem**, segmented ab plates, and cyan piping down the torso sides.
- **Back:** octagonal back module with a **cyan octagon** and X-straps.
- **Arms:** layered pauldrons, forearm bracers with cyan cuffs, fingerless gloves.
- **Lower body:** utility belt with pouches, silver thigh plates, knee pads, silver shin guards with bright edges, strapped boots.
- **Gameplay hook:** the chest ring and back octagon use the `Core` material, so they glow **cyan in the City and red in the Breach**.

| Front | Three-quarter | Back |
|---|---|---|
| ![](devlog/2026-11-12/12-jax-front.png) | ![](devlog/2026-11-12/12-jax-threequarter.png) | ![](devlog/2026-11-12/12-jax-back.png) |

The name is now in the game: the HUD callsign reads `J. CALDER`, and the story's opening transmission reads *"Personnel record found: JAX CALDER. Status: TERMINATED."*

Fix along the way: the first hair cap only covered the top of the head, so the back of the skull showed skin from behind. Added a back and sides hair piece.

---

## Day 1, part 4 — Playtest feedback: "too dark, can't see where to go, too much flashing"

**Readability**
- Brighter overall: more ambient and moon light, stronger street lamps, thinner fog, lighter floor, and a softer vignette. The Breach gets a brighter sky tint so it no longer turns into a red void.
- **Objective beams:** a tall soft light column over every remaining terminal and rift node, visible over the rooftops. It's brightest when you're in the world that can hack it.
- **Waypoint marker:** always points to the nearest unfinished objective, e.g. `RIFT NODE // BREACH 10m`. When the target is off-screen, it pins to the screen edge and points the way.

**Flashing (photosensitivity pass)**
- Muzzle light: 18 → 4. It used to strobe 9 times a second while firing.
- Enemy shot flashes, kill flashes, the Shift screen flash, glitch and chromatic split, and screen shake all cut by 60–80%.
- No more player blink after taking damage, no flickering neon signs, and the low-health pulse is slow and soft.
- New pause-menu option: **SCREEN EFFECTS: CALM / OFF**. Off removes all flashes, shake and glitch. It defaults to Off when the OS "reduce motion" setting is on.

**The black-screen bug (a good debugging story for the video)**
- **Symptom:** in some areas the screen went black, or flickered black very fast.
- **Cause:** some frames contained NaN pixels on the player model. On a plain render they're invisible, but **bloom blurs them across the entire screen**, which turns the whole frame black.
- **Proving it:** stress-tested 135 spots × both worlds. Without a fix, about 50% of frames were black.
- **First fix failed:** a shader filter using `isnan()` did nothing, because Intel's Direct3D shader compiler optimizes `isnan()` away as "always false".
- **Real fix:** a filter pass before bloom that checks each pixel's raw bits (`floatBitsToUint`) for NaN or Infinity and zeroes them, and caps extreme highlights. Result: **0 / 135 black frames**.
- Also made the game recover when the browser tab starts at 0×0 size (another source of a black screen).

| City | Breach |
|---|---|
| ![](devlog/2026-11-12/14-brighter-city.jpg) | ![](devlog/2026-11-12/13-brighter-breach-waypoint.jpg) |

---

## Day 1, part 5 — Auto aim (on by default)

- While you fire, shots lock onto the enemy **closest to where your cursor points**: same world as you, within 17 m, in clear line of sight, and within about 40° of the cursor. A target that's already locked stays locked out to about 55°, so the lock doesn't jitter between enemies.
- A faint ring shows the current candidate. It tightens and brightens while you're firing, and Jax turns to face the target.
- **Pause menu → AUTO AIM: ON / OFF**, saved between sessions. The title screen shows the current setting.
- **Tested:** cursor 25° off a drone with auto aim off missed every shot; with it on, the drone died in 23 frames.
- **Playtest feedback: "it's not locking on."** The first version only locked within about 40° of the cursor and only while firing, which felt like nothing was happening. It now locks onto the **nearest visible enemy automatically**. Jax faces it even before you shoot, and the cursor direction only breaks ties between enemies. Verified: with the cursor 90° and even 160° away from a drone, it still locks on and kills it in under half a second.
- **Dev server:** added `serve.py`, a no-cache local server, so a normal reload always loads the newest game files. Run it with `python serve.py`.

---

## Day 1, part 6 — Polishing District 01

**Teaching the Shift in place.** One short hint at a time, each shown once, the first time it matters:
- Start: controls, and that auto aim locks on for you.
- Next to a holo barrier in the City: *"press SHIFT or RIGHT CLICK to phase into the BREACH, where it doesn't exist."*
- First time in the Breach: it drains your PHASE bar; shift back to recharge.
- At the chasm edge: the bridge only exists in the Breach.
- At breach crystals: shift back to the City to pass.
- Near faded enemies: they live in the other world and can't hurt you.
- When the portal opens: follow the marker.

![hint](devlog/2026-11-12/15-tutorial-hint.jpg)

**Checkpoints.** Every hacked lock saves a checkpoint. Dying then offers **RESPAWN AT CHECKPOINT** (Enter) with your hacked locks kept, full health and 2.5 seconds of protection, or **RESTART DISTRICT** (R).

**Feel**
- Health regenerates after 4 seconds without taking damage, so you're never stuck limping between fights.
- Shots knock enemies back slightly, so hits land with weight. Turrets stay put.

**Fixes**
- On narrow windows, the top banners no longer overlap each other.
- The waypoint marker steps aside while a hint is showing.
- The auto graphics check only measures while the game window is focused. Switching windows in the first few seconds used to wrongly force LOW graphics.

---

## Day 1, part 7 — District 02: Drowned Transit

**The rule:** each district adds one new Shift twist.

**New twist: City-only glass walkways.** They're the mirror image of District 01's Breach-only bridges. The district is a set of broken transit platforms over an abyss, joined by glass (City), rift bridges (Breach) and mixed crossings: *glass → solid island → Shift → bridge*. Shifting while standing on glass is blocked with a clear message (*"NO FLOOR UNDER YOU IN THE OTHER WORLD"*). Drones fly over the abyss and hit you while you cross.

**New enemy: Rift Turret.** The Blender turret recolored crimson, existing only in the Breach. It gives the Breach a ranged threat, so it isn't just wraiths.

![district 02](devlog/2026-11-12/16-district02-glass-walkways.jpg)

**Progression**
- Clearing a district saves progress and shows **NEXT DISTRICT**, then a short story scene (Voss, and a warning from the unknown transmission), then the next briefing.
- The title screen shows **CONTINUE // DISTRICT 02** once it's unlocked.
- Switching districts frees the old district's GPU memory, which matters on integrated graphics.
- New one-time hints for glass walkways and rift turrets. The basic hints don't repeat between districts.

**Verified:** every lock is reachable under the Shift rules (generator check). A full scripted run hacks all 4 locks and reaches the exit and the win screen. Shifting on glass is blocked. 0/90 black frames in a sweep of both worlds.

---

## Day 1, part 8 — "He looks like a robot. He's supposed to be a person who's dead in the system."

**Why v2 read as a robot:** hard-edged boxes with flat shading, stiff legs with no knees, metal plates everywhere, and glow on everything.

**Attempt 1 (failed):** rounding the separate box parts with subdivision. It made a balloon figure with sausage limbs and a bulb nose. Lesson: **a body has to be one continuous mesh**, not parts stuck together.

**What worked: Blender's Skin modifier.** Draw a stick-figure skeleton, give each joint a thickness, and Blender wraps one seamless body around it. Then:
1. A real **armature** (pelvis, spine, chest, head, thighs, shins, feet, arms), bound with automatic weights. Every vertex is weighted.
2. A posing test (walking stride) to check that the knees and hips deform like a person's.
3. **Dressed to match the reference**: chest plate with the cyan ring, octagon back module and X-straps, belt and pouches, thigh plates, knee pads, silver shin guards, bracers with cyan cuffs, fingerless gloves, short messy hair, stubble, face. Each piece is attached to the bone it rides on.

| Front | Three-quarter | Back |
|---|---|---|
| ![](devlog/2026-11-12/19-jax-human-front.png) | ![](devlog/2026-11-12/19-jax-human-threequarter.png) | ![](devlog/2026-11-12/19-jax-human-back.png) |

**In the game**
- He walks like a person: hip swing, **knees bend** as each leg swings through, a slight forward lean when running, and breathing when idle.
- The game computes each bone's swing axis from the model itself at load, so Blender's bone orientation never needs to be hand-matched.
- **"Dead in the system":** dashing or Shifting leaves a faint translucent copy of Jax behind, like a stale data trace of someone the system thinks is gone. It's off when Screen Effects is Off.
- The suit glow is turned down to accents, so the chest no longer turns into a floodlight.

![running](devlog/2026-11-12/20-jax-human-running-ingame.jpg)

**Bugs worth a video segment**
- *Armor fell to the floor:* attaching meshes to bones read the skeleton before Blender had computed it. Fixed by computing each piece's offset from the bone's rest position directly.
- *The walk animation moved nothing:* the model loader used a plain `clone()`, which leaves a skinned body attached to the **original** skeleton, so the game animated bones the body didn't follow. Fixed with `SkeletonUtils.clone`.
- *The afterimage was a blinding white blob:* a wireframe of a 24k-triangle body is effectively solid, and bloom made it glare. It's now a soft see-through silhouette.

---

## Day 1, part 9 — Jax v4: armor that's part of the body

Playtest feedback: *"still looks half human, half robot."* The box-shaped armor plates were the culprit.

**New technique: cut the armor from the body itself.** Select a region of the body surface (chest, back, shoulder caps, outer thighs, knees, shins, forearms, belt, the side piping), copy it, push it outward and give it thickness. The plates now **curve with the body like the molded armor in the reference**, and because they keep the body's bone weights, they bend with him when he moves. The body also got more anatomy: deltoids, a tapered chest, biceps, forearms, thighs and calves.

| Front | Back | Walking |
|---|---|---|
| ![](devlog/2026-11-12/23-jax-v4-front.png) | ![](devlog/2026-11-12/23-jax-v4-back.png) | ![](devlog/2026-11-12/23-jax-v4-walk-close.png) |

![in game](devlog/2026-11-12/24-jax-v4-ingame.jpg)

**Bug: green specks on Jax.** Some pixels on his model rendered at 65,504 (the render buffer's maximum) in one color channel. The safety filter scaled them down but kept the color, so they stayed pure green, and bloom spread them. Found by elimination: with the filter off the screen washed out white, and with bloom off the model was perfectly clean. Fix: no light in this game is legitimately brighter than about 100, so any pixel above 500 is blanked as an error, the same as NaN. The muzzle-flash light also moved half a meter off the barrel, since a light about 1 cm from a surface overflows the buffer on its own.

---

## Day 1, part 10 — Hard-surface props in SolidCraft

SolidCraft (a free, open-source CAD program in the style of Fusion 360) has a scriptable command line, so hard-surface models are now **generated from Python scripts**:
- `art/solidcraft/gen_rifle.py` → `rifle.json` → SolidCraft builds it → GLB.
- `art/solidcraft/gen_props.py` → terminal + crate.

Edit a number in the script, re-run it, and the model updates. The `.sc` design files are kept too, so they open in the SolidCraft app.

| Rifle | Terminal | Crate |
|---|---|---|
| ![](devlog/2026-11-12/26-solidcraft-rifle.png) | ![](devlog/2026-11-12/27-solidcraft-terminal.png) | ![](devlog/2026-11-12/28-solidcraft-crate.png) |

- **Rifle:** receiver with an ejection port, toothed top rail, vented handguard with cyan glow strips, barrel with a ported muzzle brake, angled magazine, raked grip, stock with a cut-out, optic. It replaced Jax's box rifle, with the grip in his right hand and his left hand on the handguard.
- **Terminal:** plinth, a body with cooling vents, a sloped control deck with keypad, a recessed screen in a bezel, a cable conduit and glowing base strips. Its screen is the hack indicator: cyan, turning green when hacked.
- **Crate:** corrugated steel shipping crate with corner castings, a lid and an amber hazard band. Every crate in a district is drawn as one instanced batch per part.

**Pipeline:** SolidCraft GLB → Blender (merge flat triangles, map body names to game materials, attach to Jax's chest bone) → `assets/models/`.
**Lesson:** CAD tessellation is heavy. The rifle came in at 40,350 triangles. Merging coplanar faces ("limited dissolve") cut it to **3,512 with no visible change**. The terminal and crate ended up at 698 and 488.

![jax with rifle](devlog/2026-11-12/25-jax-with-rifle.png)

---

## Day 2 — Nov 13: Jax moves like a person; district select

**Feedback:** *"still a little stiff, robot-like."* The model was fine. The animation was the giveaway: his whole body turned as one block toward the aim, and when strafing his legs still swung forward and back, so he skated.

**What real people do, now in the game**
- **Legs follow the feet, chest follows the target.** His hips turn toward where he's walking (up to 66°) while the spine and chest unwind, so the rifle stays on the target. Walking mostly backwards switches to a backpedal: hips square, stride reversed. Verified: strafing right turns the hips -66°, strafing left +66°, forward and back 0°.
- **Counter-rotation:** the hips twist with each stride and the shoulders twist against them.
- **Hip drop:** a side-to-side tilt per step.
- **Planted feet:** the ankles cancel most of the leg pitch, so his feet stay flatter.
- **Head nod** with each step, and **idle weight shifts** and breathing when standing still.
- Technique: a `rotator(bone)` helper that applies pitch, yaw and roll in **model space** on top of each bone's rest pose. Blender's bone orientations never need to be known.

**District select (requested)**
- Title screen: **SELECT DISTRICT** lists every unlocked district. Cleared ones show ✓ and the **best time and score**. Pick one to replay it.
- **MAIN MENU** buttons on the win screen and in the pause menu.
- The win screen shows **NEW BEST** tags when you beat your record.
- Records are saved per district in the browser (`pb-records`).

**Follow-ups from playtest**
- **"When I turn my mouse, the character should turn."** Auto aim used to keep Jax locked on the nearest enemy all the time. Now **he always faces the mouse**, and auto aim only takes over **while fire is held**: he snaps to the target so shots land, then goes back to the mouse. The ring still shows which enemy it would pick.
- **District pictures in District Select.** Each card now has a real in-game overview shot of the district. They're generated by a dev tool: run `__makeThumbs()` in the browser console while `serve.py` is running, and it renders each district and saves `assets/thumbs/<id>.jpg`. `serve.py` got a tiny dev-only upload endpoint for this, locked to that folder and JPEG files. Locked districts show their picture greyed out and blurred.

![district select](devlog/2026-11-12/29-district-select.jpg)

### Next
- District 03 + a Warden boss fight at Portal Zero (model the Warden in Blender).
- Abilities Q/E/F (freeze, surge, cloak) from the old prototype.
- More Blender props: street kiosks, vending machines, holo-ad pillars.

### Day 2 — Movement follows the mouse
- WASD is now relative to where Jax faces: **W runs toward the mouse**, S backs away, A/D strafe around it. No more running into a wall because "up" on the keyboard didn't match where he was looking.
- It steers by the cursor, not the auto-aim lock, so holding fire never pulls you off course.
- The old screen-direction movement is still there: Esc → MOVEMENT: SCREEN (saved between sessions).

## Day 3 — 2026-11-13: District 03 // CRYO ADMIN

**New twist: security gates.** Orange laser curtains with a floating number badge. Unlike everything else in the game they're solid in *both* worlds, so phasing can't cheat past them. Each lock you crack reroutes power: gate 1 drops after one lock, gate 2 after two, gate 3 after three. That turns the district into four sealed zones you clear in a loop.

- Zone 1: an easy city terminal to learn the gate rule.
- Zone 2: a chasm crossed by City glass *or* a Breach bridge, rift node on the far side.
- Zone 3: a terminal sealed inside a holo-barrier box. Phase in through the wall, shift back inside, hack.
- Zone 4: glass and bridge over the void again, the last rift node, and the exit.
- The waypoint now skips locks that are still behind a closed gate (each lock knows which gate level it's behind, worked out with a flood fill from the start).
- The minimap draws closed gates in orange; wraith pathing updates the moment a gate drops.
- Map generated by a script that proves the progression: 1 lock reachable at the start, 2 after gate 1, 3 after gate 2, all 4 plus the exit after gate 3.

**Story setup:** the briefing after District 03 points to the hypersleep bay. That's District 05: a room of pods where Jax finds a crew ID card that wakes a new playable character. More cards later unlock more pod characters, each with their own Shift/right-click ability (first one: **Remote Hack**). Tab will swap between unlocked characters.

![security gate](devlog/2026-11-13/30-security-gate.jpg)

## Day 3 (cont.) — District 04 // COOLANT WORKS

**New twist: coolant vents.** Floor grates that blast freezing coolant in waves rolling east across the map. The rule is pure SHIFT: they only fire in the **City**. In the **Breach** they're dead, but the Breach drains your phase energy, so every vent field is a choice:
- time it: grates glow **amber** just before they fire, **blue jets** while blasting (12 damage, once per blast)
- **dash** through (you're invulnerable mid-dash)
- or **shift** across and race your energy bar back to solid City ground

Layout: a vent band north of the start, a huge central coolant hall with safe islands around a rift node, a terminal sealed in a holo-barrier box behind another vent strip, and a void crossing with a vent ledge before the last rift node and the exit. The script check confirms all four locks and the exit are reachable.

First pass looked like a glowing striped carpet with a white-out where the wave fired (60 additive jets + bloom). Toned the grates down and made the jets thinner and dimmer so each one reads on its own.

![coolant vents](devlog/2026-11-13/31-coolant-vents.jpg)

## Day 3 (cont.) — District 05 // HYPERSLEEP BAY: the crew system

**The big one: a second playable character.** District 05 is a hall full of hypersleep pods. Most sleepers are long gone, but three crew pods have numbers on them: 03, 07 and 11. Each one opens with that crew member's **ID card**, and the cards are scattered across the station.

This district hides the first card in a records office behind security gate 1. Bring it to **Pod 07**, it thaws, and **Iris Rook** wakes up: a netrunner who thought she was dead too.

**How the crew works:**
- **TAB** (or 1–4) swaps characters mid-stage
- **SHIFT / right click** fires the *current* character's ability. Jax keeps the phase shift.
- **Rook's REMOTE HACK** reaches the terminal or turret nearest your cursor, up to 16m away, **through walls**. A green uplink beam locks on and the hack runs on its own.
  - Hacking a turret **hijacks** it for 12 seconds, and it turns on its old friends.
  - Rook can't phase, so the levels make you swap: Rook for the sealed stuff, Jax for the Breach.
- Unlocked crew is saved, and Rook comes with you into every district (replays included).

**The puzzle that needs her:** one lock sits inside a **sealed glass vault**, solid in *both* worlds, so the Breach can't get you in. You can see the terminal through the glass, and only a remote hack reaches it. That lock powers gate 2, which leads to the rift node and the exit, so you need both characters to finish.

The waypoint follows the story: first lock → ID card → Pod 07 → vault → rift node → exit.

First pass of the vault: the glass "rim" was a full glowing cap on every tile, so the whole ring bloomed into a white rectangle. I dimmed it, and now you can see the beam cut through the glass.

Rook uses Jax's body for now, recolored in acid green. She needs her own Blender model.

![remote hack through the vault glass](devlog/2026-11-13/32-remote-hack-vault.jpg)
![hypersleep bay](devlog/2026-11-13/33-hypersleep-bay.jpg)
