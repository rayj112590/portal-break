# PORTAL BREAK

**Game Off 2026 entry · theme: SHIFT**

An isometric neon twin-stick shooter where **SHIFT phases you between two worlds**. In the City, holo-barriers block the streets and drones hunt you. In the Breach, the barriers are gone, a bridge spans the chasm, and wraiths come for you. Every wall is a door somewhere.

## Controls
| Input | Action |
|---|---|
| WASD / arrows | Move: W runs toward the mouse, S backs off, A/D strafe (switch to screen-direction movement in Esc settings) |
| Mouse | Aim |
| Left mouse (hold) | Fire |
| **Shift** or right mouse | Current character's ability: Jax = phase shift (City ⇄ Breach), Rook = remote hack, Crane = grab & throw |
| Tab / 1–4 | Swap crew (once you've taken Rook's ID card in District 03, or Crane's in District 04, to that district's crew terminal) |
| Space | Dash |
| Esc | Pause (graphics + mute options) |
| M | Mute |
| F9 | Record a gameplay clip (.webm) |

## Crew, going down and reviving
Each crew member has **their own health and phase energy**. Swapping parks one character's bars and brings in the other's, and a benched character slowly recovers. If the character you're playing hits zero while a teammate is still standing, they go **down** and the teammate takes over on the spot. A downed crew member can't be swapped in until you revive them: pick up a **revive cell** (hidden in every district, you can carry 3) and stand on the ring in front of the district's **revive chamber**, the green glass tube set into a wall. If the whole crew goes down, it's back to the last checkpoint with everyone up again.

## ID cards and crew terminals
Each sleeper in the hypersleep chamber has an ID card hidden somewhere in the station. Picking one up doesn't wake them yet: take it to that district's **crew terminal**, a gold-lit console set into a wall (the waypoint points to it once you carry the card). Stand on the ring in front of it, the card uploads, and the pod thaws. District 03 has Rook's card and terminal, District 04 has Crane's.

## Crane, crates and pickup weapons
**Hollis "Boulder" Crane** is the tank: 160 health instead of 100, a bit slower, and built bigger. His card is in District 04. His ability lifts a **heavy crate** (orange band) or a **small enemy** (drone, wraith) overhead; press Shift again, or left click, to throw it where you aim. It smashes on the first wall or enemy it meets and hurts everything around it, and a thrown enemy doesn't get back up. **Supply crates** (tied up with gold straps) break open with something inside: a gift, a revive cell, or a pickup weapon. The **scatter gun** fires a 6-pellet spread and the **rail gun** punches through enemies. Both replace the rifle until their ammo runs out, and they stay with whoever picked them up when you swap.

## Run locally
ES modules need a web server (opening `index.html` directly won't work):

```bash
python serve.py
```

(`serve.py` is a tiny no-cache server, so reloads always pick up your latest changes. `python -m http.server 8137` also works.)

Then open http://127.0.0.1:8137

## Tech
- [Three.js](https://threejs.org/) r160 (CDN, no build step)
- All textures generated in code, all audio synthesized with WebAudio
- `src/levels.js`: districts are ASCII maps. See the legend at the top of the file.

## Project layout
```
index.html, style.css   page + HUD
src/main.js             game loop, phase shift, combat, screens
src/world.js            builds a district from its map; collision, line of sight, pathing
src/player.js           player movement + model
src/enemies.js          drone / turret / wraith AI + models
src/fx.js               particles, rain/embers, shockwaves, projectiles
src/audio.js            synth SFX + adaptive music
src/hud.js              HUD, minimap, floating labels
src/crew.js             playable crew roster (who's unlocked, abilities, pod numbers, health), revive cells
src/config.js           tuning: player, enemies, pickup weapons
src/post.js             final screen shader
src/models.js           loads the Blender GLBs (falls back to stand-ins)
assets/models/          exported GLBs: player, crew (jax, rook, crane), drone, turret, wraith, warden
art/                    portal_break_models.blend (source for the GLBs)
prototype/              the original 2D version
```
