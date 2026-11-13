# PORTAL BREAK

**Game Off 2026 entry · theme: SHIFT**

An isometric neon twin-stick shooter where **SHIFT phases you between two worlds**. In the City, holo-barriers block the streets and drones hunt you. In the Breach, the barriers are gone, a bridge spans the chasm, and wraiths come for you. Every wall is a door somewhere.

## Controls
| Input | Action |
|---|---|
| WASD / arrows | Move: W runs toward the mouse, S backs off, A/D strafe (switch to screen-direction movement in Esc settings) |
| Mouse | Aim |
| Left mouse (hold) | Fire |
| **Shift** or right mouse | Current character's ability: Jax = phase shift (City ⇄ Breach), Rook = remote hack |
| Tab / 1–4 | Swap crew (once you've woken someone in District 05) |
| Space | Dash |
| Esc | Pause (graphics + mute options) |
| M | Mute |
| F9 | Record a gameplay clip (.webm) |

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
src/crew.js             playable crew roster (who's unlocked, abilities, pod numbers)
src/post.js             final screen shader
src/models.js           loads the Blender GLBs (falls back to stand-ins)
assets/models/          exported GLBs: player, drone, turret, wraith
art/                    portal_break_models.blend (source for the GLBs)
prototype/              the original 2D version
```
