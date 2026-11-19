// ============================================================
//  PORTAL BREAK — Game Off 2026 (theme: SHIFT)
//  Isometric neon twin-stick shooter. SHIFT phases you between
//  the CITY and the BREACH: walls in one are doors in the other.
// ============================================================
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FXAAShader } from "three/addons/shaders/FXAAShader.js";

import { TILE, CITY, BREACH, PALETTE, PLAYER, WEAPONS, LOOT_NAME } from "./config.js";
import { LEVELS, STORY } from "./levels.js";
import { World, PROP_Y } from "./world.js";
import { Player } from "./player.js";
import { Enemy, separate } from "./enemies.js";
import { Warden, WARDEN } from "./boss.js";
import { openPreview, setPreview, clearPreview, closePreview } from "./preview.js";
import { Particles, Weather, Shockwaves, Flashes, Projectiles } from "./fx.js";
import { Audio } from "./audio.js";
import { Input } from "./input.js";
import { CREW, CREW_ORDER, loadCrew, saveCrew, crewByPod, MAX_CELLS, loadCells, saveCells, maxHp,
  MAX_SQUAD, loadSquad, saveSquad, skinOf, skinsOf, setSkin, skinUnlocked, unlockText, glowOf, earnFeat, unlockedSkins, newlyUnlocked,
  modelOf } from "./crew.js";
import { Hud } from "./hud.js";
import { loadModels } from "./models.js";

// Blender GLBs (falls back to built-in stand-ins if any fail)
const loadedModels = await loadModels();
import { FinalShader, SanitizeShader } from "./post.js";

// ---------- renderer / scene ----------
const viewport = document.getElementById("viewport");
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(PALETTE[CITY].fog.clone(), 0.010);
scene.background = scene.fog.color;

const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.5, 220);
const CAM_OFFSET = new THREE.Vector3(0, 22.5, 13.8);

// No MSAA: Intel/ANGLE drivers can't combine multisampling with the stencil
// buffer the player x-ray needs, so anti-aliasing is an FXAA pass instead.
const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, stencilBuffer: true });
const composer = new EffectComposer(renderer, rt);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new ShaderPass(SanitizeShader));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.85, 0.55, 0.72);
composer.addPass(bloom);
const finalPass = new ShaderPass(FinalShader);
composer.addPass(finalPass);
composer.addPass(new OutputPass());
const fxaa = new ShaderPass(FXAAShader);
composer.addPass(fxaa);
function sizeFXAA() {
  const pr = renderer.getPixelRatio();
  fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * pr), 1 / (innerHeight * pr));
}
sizeFXAA();

// ---------- systems ----------
// ---------- quality (auto-drops on slow GPUs, toggle in pause menu) ----------
let quality = "high";
try { quality = localStorage.getItem("pb-quality") || "high"; } catch (e) {}
function applyQuality(q, announce = false) {
  quality = q;
  try { localStorage.setItem("pb-quality", q); } catch (e) {}
  const low = q === "low";
  renderer.setPixelRatio(low ? Math.min(devicePixelRatio, 1) * 0.85 : Math.min(devicePixelRatio, 1.5));
  composer.setPixelRatio(renderer.getPixelRatio());
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  fxaa.enabled = !low;
  sizeFXAA();
  bloom.resolution.set(innerWidth * (low ? 0.5 : 1), innerHeight * (low ? 0.5 : 1));
  if (typeof particles !== "undefined") particles.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() * 0.9;
  if (announce) hud.toast(`GRAPHICS: ${q.toUpperCase()}`, "#55e6ff");
}
const perf = { t: 0, frames: 0, checked: false };
function watchPerformance(realDt) {
  if (perf.checked || document.hidden || quality === "low") return;
  // only measure while the window is focused: a backgrounded window runs slow and would
  // wrongly force LOW graphics
  if (!document.hasFocus()) { perf.t = 0; perf.frames = 0; return; }
  // a one-off stall (loading, a shader compile) says nothing about the GPU's frame rate: skip it, or
  // a single long frame in the first seconds could force LOW graphics on a fast machine
  if (realDt > 0.25) return;
  perf.t += realDt; perf.frames++;
  if (perf.t >= 4) {
    const fps = perf.frames / perf.t;
    perf.checked = true;
    if (fps < 40) { applyQuality("low"); world.moon.shadow.mapSize.set(1024, 1024); world.moon.shadow.map?.dispose(); world.moon.shadow.map = null; hud.toast("LOW FPS DETECTED // GRAPHICS SET TO LOW", "#ffb347"); }
  }
}

const input = new Input(renderer.domElement);
const audio = new Audio();
const hud = new Hud();
let levelIndex = 0;
let level = LEVELS[0];
let world = new World(scene, renderer, level);
const player = new Player(scene);
const particles = new Particles(scene);
const weather = new Weather(scene);
const shockwaves = new Shockwaves(scene);
const flashes = new Flashes(scene, 3);
const projectiles = new Projectiles(scene);
const muzzleLight = new THREE.PointLight(0xffffff, 0, 7, 1.8);
scene.add(muzzleLight);
hud.buildMinimap(world);
hud.setDistrict(level.name);

const pickupGeo = new THREE.OctahedronGeometry(0.22, 0);
const raycaster = new THREE.Raycaster();
const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.2);
const _ndc = new THREE.Vector2();
const _hit = new THREE.Vector3();
const camTarget = new THREE.Vector3();

// ---------- screen effects (flashes, shake, glitch): 1 = calm, 0 = off ----------
function initialFx() {
  try {
    const saved = localStorage.getItem("pb-fx");
    if (saved) return saved === "off" ? 0 : 1;
  } catch (e) {}
  return matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 1;
}
function setFx(v) {
  game.fx = v;
  try { localStorage.setItem("pb-fx", v ? "calm" : "off"); } catch (e) {}
}

// ---------- auto aim (on by default) ----------
function initialAutoAim() {
  try { return localStorage.getItem("pb-autoaim") !== "off"; } catch (e) { return true; }
}
function setAutoAim(on) {
  game.autoAim = on;
  try { localStorage.setItem("pb-autoaim", on ? "on" : "off"); } catch (e) {}
}
const AIM = { range: 18 }; // lock range in world units
const VENT_DAMAGE = 12;
// Iris Rook's remote hack: terminals + turrets within range, straight through walls
// (bossTime: the Warden takes longer to crack, then his firewall reboots for WARDEN.firewall seconds)
const HACK = { range: 16, termTime: 2.0, turretTime: 0.7, bossTime: 1.8, hijack: 12, cooldown: 1.0 };
const HACK_COLOR = new THREE.Color(0.55, 1.0, 0.3);

// ---------- movement style: "facing" (W = toward mouse, default) or "screen" (W = up) ----------
function initialMoveMode() {
  try { return localStorage.getItem("pb-move") === "screen" ? "screen" : "facing"; } catch (e) { return "facing"; }
}
function setMoveMode(mode) {
  game.moveMode = mode;
  player.relativeMove = mode === "facing";
  try { localStorage.setItem("pb-move", mode); } catch (e) {}
}

// Picks the enemy closest to where the cursor points: same phase, in range, in line of sight,
// inside a cone around the cursor direction. Sticks to the current target while it stays valid.
function pickAimTarget() {
  const px = player.pos.x, pz = player.pos.z;
  const cdx = player.aim.x - px, cdz = player.aim.z - pz;
  const cursorAng = Math.atan2(cdx, cdz);
  let best = null, bestScore = Infinity;
  for (const e of game.enemies) {
    if (!e.alive || e.phase !== game.phase || e.hijackT > 0 || e.held || e.untouchable) continue;
    const dx = e.pos.x - px, dz = e.pos.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > AIM.range + (e.radius > 1 ? e.radius : 0) || d < 0.3) continue;
    let da = Math.atan2(dx, dz) - cursorAng;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    da = Math.abs(da);
    if (!world.lineOfSight(px, pz, e.pos.x, e.pos.z, game.phase)) continue;
    // nearest enemy wins; the cursor direction only breaks ties, so you can still pick between enemies
    const score = d * 0.3 + da * 2.5 - (e === game.aimTarget ? 1.5 : 0);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}
const _lock = new THREE.Vector3();

// ---------- game state (shared with enemies + hud) ----------
const game = {
  state: "title",
  fx: initialFx(),
  autoAim: initialAutoAim(),
  moveMode: initialMoveMode(),
  crew: loadCrew(),      // unlocked characters, in roster order
  char: "jax",           // who you're playing right now
  vitals: {},            // per crew member: { hp, energy, down }; the active one's live numbers are on `player`
  cells: 0,              // revive cells carried (saved between districts)
  held: null,            // what Crane is carrying overhead: { kind: "prop" | "enemy", obj, t, ... }
  thrown: [],            // crates / enemies in flight
  grabCd: 0,
  uplink: null,
  uplinkCd: 0,
  swapCd: 0,
  hackPreview: null,
  aimTarget: null,
  world, player, camera, input, audio, particles,
  enemies: [],
  pickups: [],
  boss: null,            // the Warden (District 05), also in `enemies`
  bossDeath: null,       // his death sequence: { t, e }
  phase: CITY,
  blend: 0,
  shiftCd: 0,
  shiftCdMax: PLAYER.shiftCooldown,
  recoil: 0,
  trauma: 0,
  damageFx: 0,
  caFx: 0,
  glitchFx: 0,
  hitstop: 0,
  timeScale: 1,
  flow: null,
  flowKey: "",
  flowT: 0,
  stats: null,
  lowEnergyWarned: false,
  dyingT: 0,

  enemyFire(enemy, x, z, y, dx, dz) {
    if (game.stats.time < 2.5) return; // grace period at district start
    const cfg = enemy.cfg;
    projectiles.spawn({ x, z, y, dx, dz, speed: cfg.bulletSpeed, damage: cfg.damage, phase: enemy.phase, friendly: false, color: enemy.color });
    if (game.fx) flashes.flash(x, y, z, enemy.color, 2.5, 0.12, 4);
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < 22) audio.enemyShoot();
  },

  // ---- hooks the Warden (boss.js) calls ----
  bossFire(src, x, z, y, dx, dz, o = {}) {
    const color = o.color || src.color;
    projectiles.spawn({ x, z, y, dx, dz, speed: o.speed, damage: o.damage, phase: src.phase, friendly: !!o.friendly, color, size: o.size || 1.2, life: o.life || 1.6 });
    if (game.fx && o.flash !== false) flashes.flash(x, y, z, color, 3, 0.1, 5);
    if ((game.bossSfxT || 0) <= game.stats.time) { audio.enemyShoot(); game.bossSfxT = game.stats.time + 0.05; }
  },
  // stomp: a shockwave that only hurts in the CITY (phase out, or dash through it)
  bossShock(x, z, radius, dmg, color) {
    shockwaves.spawn(x, z, color, radius * 1.3, 0.5);
    shockwaves.spawn(x, z, color, radius * 0.6, 0.3);
    flashes.flash(x, 1, z, color, 16 * game.fx, 0.4, 12);
    particles.emit({ x, y: 0.3, z, count: 60, speed: 9, up: 2, color: [color.r * 2, color.g * 2, color.b * 2], size: 0.5, life: 0.6, gravity: -6, drag: 2 });
    audio.explode();
    game.trauma = Math.min(1, game.trauma + 0.35 * game.fx);
    const d = Math.hypot(player.pos.x - x, player.pos.z - z);
    if (game.phase === CITY && player.alive && d < radius && player.dashT <= 0) {
      game.hurtPlayer(dmg, x, z);
      const l = d || 1;
      world.move(player.pos, ((player.pos.x - x) / l) * 2.2, ((player.pos.z - z) / l) * 2.2, player.radius, game.phase, "walk");
    }
  },
  ring(x, z, color, radius, dur) { shockwaves.spawn(x, z, color, radius, dur); },
  flash(x, y, z, color, k, dur, dist) { flashes.flash(x, y, z, color, k * game.fx, dur, dist); },
  shake(k) { game.trauma = Math.min(1, game.trauma + k * game.fx); },
  spawnNear(type, x, z, minD, maxD) {
    const spot = world.randomOpenTileNear(x, z, minD, maxD, type === "wraith" ? BREACH : CITY, type === "drone" ? "fly" : "walk");
    if (!spot) return null;
    const e = spawnEnemy(type, spot.x, spot.z);
    e.alert = 6;
    shockwaves.spawn(spot.x, spot.z, e.color, 3, 0.5);
    particles.emit({ x: spot.x, y: 1.2, z: spot.z, count: 30, speed: 4, up: 4, color: [e.color.r * 2, e.color.g * 2, e.color.b * 2], size: 0.4, life: 0.6, gravity: -4 });
    return e;
  },

  // a turret Rook hijacked: friendly fire at its old friends
  allyFire(src, x, z, y, dx, dz) {
    projectiles.spawn({ x, z, y, dx, dz, speed: 24, damage: 14, phase: src.phase, friendly: true, color: HACK_COLOR });
    if (game.fx) flashes.flash(x, y, z, HACK_COLOR, 2.5, 0.1, 4);
    if (Math.hypot(x - player.pos.x, z - player.pos.z) < 22) audio.enemyShoot();
  },

  hurtPlayer(dmg, fromX, fromZ) {
    if (!player.alive || player.invuln > 0) return;
    player.hp -= dmg;
    player.invuln = 0.45;
    player.hitFlash = 1;
    game.stats.damageTaken += dmg;
    game.lastHurt = game.stats.time;
    game.trauma = Math.min(1, game.trauma + 0.25 * game.fx);
    game.damageFx = 0.35 + 0.25 * game.fx;
    game.caFx = Math.max(game.caFx, 0.2 * game.fx);
    audio.hurt();
    hud.damageNumber(player.pos.x, 2.2, player.pos.z, `-${dmg}`, "#ff4466", camera, true);
    const kx = player.pos.x - fromX, kz = player.pos.z - fromZ, kl = Math.hypot(kx, kz) || 1;
    world.move(player.pos, (kx / kl) * 0.6, (kz / kl) * 0.6, player.radius, game.phase, "walk");
    if (player.hp <= 0) playerDown();
  },

  flowDir(x, z) {
    if (!game.flow) return null;
    const [r, c] = world.toTile(x, z);
    const here = game.flow[r * world.cols + c];
    if (here < 0) return null;
    let best = here, br = r, bc = c;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr, nc = c + dc;
        if (!world.inside(nr, nc)) continue;
        if (dr && dc && (world.solid(r + dr, c, BREACH, "walk") || world.solid(r, c + dc, BREACH, "walk"))) continue;
        const d = game.flow[nr * world.cols + nc];
        if (d >= 0 && d < best) { best = d; br = nr; bc = nc; }
      }
    }
    const t = world.center(br, bc);
    const dx = t.x - x, dz = t.z - z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  },
};

game.hud = hud;   // the Warden posts his own warnings

const grabLabel = { x: 0, z: 0 };   // Crane's one floating "SHIFT // LIFT" prompt (moved each frame)

// ---------- level setup ----------
function spawnEnemy(type, x, z) {
  const e = new Enemy(type, x, z, scene);
  game.enemies.push(e);
  return e;
}

// Who always comes along: Jax (every district needs the phase shift) and the district's
// required character (District 05's glass vault needs Rook).
function requiredCrew(lv) { return [...new Set([lv?.needs, "jax"].filter(Boolean))]; }

// A squad that follows the rules: the required crew are in, at most MAX_SQUAD (the last picks
// that aren't required drop out first), and a required character leads.
function fitSquad(list, lv) {
  const req = requiredCrew(lv);
  let s = [...new Set(list)];
  for (const id of req) if (!s.includes(id)) s.push(id);
  while (s.length > MAX_SQUAD) {
    const i = s.findLastIndex(id => !req.includes(id));
    if (i < 0) break;
    s.splice(i, 1);
  }
  if (lv?.needs) s = [lv.needs, ...s.filter(id => id !== lv.needs)];
  return s;
}

// The crew you take into a district: the squad saved on the crew screen (lead first, max 3)
// from the unlocked characters, with the required ones swapped in.
function squadFor(lv) { return fitSquad(loadSquad(loadCrew()), lv); }

// District 05: the Warden waits in the portal room (level.boss), dormant until you walk in.
function spawnBoss() {
  if (game.boss) { game.boss.remove(); game.boss = null; }
  game.bossDeath = null;
  const b = world.level.boss;
  if (!b) return;
  const at = world.center(b.at[0], b.at[1]);
  const [r0, c0, r1, c1] = b.arena;
  const arena = { x0: c0 * TILE, z0: r0 * TILE, x1: (c1 + 1) * TILE, z1: (r1 + 1) * TILE };
  game.boss = new Warden(at, arena, scene);
  game.enemies.push(game.boss);
}

function resetLevel() {
  for (const e of game.enemies) if (e.alive) e.remove();
  game.enemies = [];
  for (const p of game.pickups) scene.remove(p.mesh);
  game.pickups = [];
  for (const p of projectiles.list) if (p.active) projectiles.kill(p);
  game.held = null;       // the props themselves go back in place in world.resetObjectives
  game.thrown = [];
  game.grabCd = 0;
  hud.terminalLabel(grabLabel, camera, false);
  world.resetObjectives();
  player.reset(world.spawns.player);
  for (const s of world.spawns.enemies) spawnEnemy(s.type, s.x, s.z);
  spawnBoss();
  game.phase = CITY;
  game.blend = 0;
  game.shiftCd = 0;
  game.trauma = game.damageFx = game.caFx = game.glitchFx = 0;
  game.timeScale = 1;
  game.flow = null;
  game.flowKey = "";
  game.lowEnergyWarned = false;
  game.stats = { time: 0, kills: 0, shifts: 0, damageTaken: 0, score: 0, deaths: 0 };
  game.checkpoint = null;
  game.lastHurt = -99;
  game.hintsShown ||= new Set(); // persists across districts so basics aren't repeated
  game.hint = null;
  hud.hint(null);
  game.uplink = null;
  game.uplinkCd = 0;
  game.objText = "";
  // crew: the squad picked on the crew screen (up to 3 of the unlocked characters, lead first),
  // plus whoever this district can't be finished without (District 05's glass vault needs Rook):
  // that character comes along and starts selected.
  game.crew = squadFor(world.level);
  const need = world.level.needs;
  game.char = need || game.crew[0];
  applyBody(game.char);
  // every crew member starts the district with their own full health and phase energy
  game.vitals = {};
  for (const id of game.crew) vit(id);
  player.hp = vit(game.char).hp;
  game.cells = loadCells();
  hud.setCrew(game.crew, game.char);
  refreshPods(true);
  // District 01: Jax is still asleep in Pod 01 until the district starts
  player.asleep = world.pods?.some(p => p.state === "sleeping") || false;
  audio.setBreach(0);
  hud.clearLabels();
  updateObjective();
  camTarget.set(player.pos.x, 0, player.pos.z);
  warmShaders();
}

// ---------- shader warm-up ----------
// three.js builds a material's shader the first time it's drawn, so everything off-screen when play
// started (turrets and wraiths across the map, terminals, gates) compiled mid-fight the first time it
// came into view: a visible hitch each time on Windows. Build them all here instead, when a district
// loads (behind the briefing) and when it restarts; compileAsync lets the GPU driver do it without
// blocking the page. The scene's lights must be the same as during play (they are: every light stays
// in the scene, off ones just have intensity 0), or the shaders would be built for the wrong count.
function warmShaders() {
  // a throwaway afterimage (invisible, gone next frame), so its pooled material's shader exists too
  if (player.model) {
    player.spawnAfterimage(PALETTE[game.phase].accent);
    const a = player.afterimages[player.afterimages.length - 1];
    a.mat.opacity = 0; a.t = 1;
  }
  try {
    if (renderer.compileAsync) renderer.compileAsync(scene, camera).catch(() => {});
    else renderer.compile(scene, camera);
  } catch (e) { console.warn("[warm-up]", e); }
}

// Respawn at the last hacked lock. Locks stay hacked; enemies stay where they are.
function respawnAtCheckpoint() {
  const cp = game.checkpoint;
  if (!cp) { startPlay(); return; }
  for (const p of projectiles.list) if (p.active) projectiles.kill(p);
  clearCarry();
  player.reset(cp);
  player.invuln = 2.5;
  player.model.root.visible = true;
  // the whole crew is back on their feet at the checkpoint (pickup weapons are lost)
  game.vitals = {};
  for (const id of game.crew) vit(id);
  applyBody(game.char);
  player.hp = vit(game.char).hp;
  hud.setCrew(game.crew, game.char);
  game.phase = cp.phase;
  game.blend = cp.phase;
  audio.setBreach(cp.phase);
  game.shiftCd = 0;
  game.trauma = game.damageFx = game.caFx = game.glitchFx = 0;
  game.timeScale = 1;
  game.flowKey = "";
  game.lowEnergyWarned = false;
  game.lastHurt = game.stats.time;
  for (const e of game.enemies) if (Math.hypot(e.pos.x - cp.x, e.pos.z - cp.z) < 10) e.alert = 0;
  // the Warden reboots at full strength and waits for you to walk back in
  if (game.boss && game.boss.alive && !game.boss.dying) game.boss.reset();
  game.stats.deaths++;
  hud.clearLabels();
  hideOverlay();
  hud.show(true);
  camTarget.set(cp.x, 0, cp.z);
  game.state = "play";
  hud.toast("CHECKPOINT RESTORED", "#7df5bc");
}

// ---------- contextual hints: teach the Shift rules the first time they matter ----------
function nearTile(ch, radiusTiles) {
  const [r0, c0] = world.toTile(player.pos.x, player.pos.z);
  for (let r = r0 - radiusTiles; r <= r0 + radiusTiles; r++)
    for (let c = c0 - radiusTiles; c <= c0 + radiusTiles; c++)
      if (world.ch(r, c) === ch) return true;
  return false;
}
const HINTS = [
  { id: "controls", when: () => true, until: () => game.stats.time > 7,
    text: "<kbd>WASD</kbd> move &nbsp;·&nbsp; hold <kbd>LEFT CLICK</kbd> to fire &nbsp;·&nbsp; auto aim locks on for you" },
  { id: "down", when: () => game.crew.some(id => game.vitals[id]?.down), dur: 11,
    text: () => `A crew member is <b class='r'>DOWN</b> and can't be swapped in. ${game.cells
      ? "Take your <b style='color:#7dffb0'>REVIVE CELL</b> to the <b style='color:#7dffb0'>REVIVE CHAMBER</b>, the green tube in the wall."
      : "Find a <b style='color:#7dffb0'>REVIVE CELL</b>, then use the <b style='color:#7dffb0'>REVIVE CHAMBER</b>, the green tube in the wall."}` },
  { id: "barrier", when: () => game.phase === CITY && nearTile("A", 3), until: () => game.phase === BREACH,
    text: "HOLO BARRIER &nbsp;//&nbsp; press <kbd>SHIFT</kbd> or <kbd>RIGHT CLICK</kbd> to phase into the <b class='r'>BREACH</b>, where it doesn't exist" },
  { id: "breach", when: () => game.phase === BREACH, dur: 7,
    text: "The <b class='r'>BREACH</b> drains your <b class='p'>PHASE</b> bar. <kbd>SHIFT</kbd> back to the <b class='c'>CITY</b> to recharge." },
  { id: "bridge", when: () => game.phase === CITY && nearTile("b", 2), until: () => game.phase === BREACH,
    text: "No way across here... but a bridge exists in the <b class='r'>BREACH</b> &nbsp;//&nbsp; <kbd>SHIFT</kbd>" },
  { id: "crystal", when: () => game.phase === BREACH && nearTile("B", 2), until: () => game.phase === CITY,
    text: "<b class='r'>BREACH</b> crystals block this way &nbsp;//&nbsp; <kbd>SHIFT</kbd> back to the <b class='c'>CITY</b> to pass" },
  { id: "ghosts", when: () => game.enemies.some(e => e.alive && e.phase !== game.phase && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 9), dur: 6,
    text: "Faded enemies live in the other world. They can't hurt you here, and you can't hurt them." },
  { id: "glass", when: () => game.phase === CITY && nearTile("v", 1), dur: 9,
    text: "GLASS WALKWAY &nbsp;//&nbsp; it only exists in the <b class='c'>CITY</b>. Cross it, reach solid ground, <i>then</i> <kbd>SHIFT</kbd>." },
  { id: "rift", when: () => game.phase === BREACH && game.enemies.some(e => e.alive && e.type === "riftTurret" && Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) < 14), dur: 6,
    text: "<b class='r'>RIFT TURRET</b> &nbsp;//&nbsp; it only exists in the Breach. Shoot it, or <kbd>SHIFT</kbd> to the City where it can't see you." },
  { id: "vent", when: () => game.phase === CITY && nearTile("h", 2), dur: 10,
    text: "<b class='c'>COOLANT VENTS</b> &nbsp;//&nbsp; they blast in waves. Wait for the gap, <kbd>SPACE</kbd> dash through, or <kbd>SHIFT</kbd>: they're dead in the <b class='r'>BREACH</b>." },
  { id: "gate", when: () => world.gates?.some(g => !g.open && Math.hypot(g.x - player.pos.x, g.z - player.pos.z) < 7), dur: 9,
    text: "<b style='color:#ffb347'>SECURITY GATE</b> &nbsp;//&nbsp; blocks BOTH worlds. Crack locks to cut its power: gate <b>1</b> drops after 1 lock, gate <b>2</b> after 2..." },
  { id: "pods", when: () => world.pods?.some(p => Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 7), dur: 10,
    text: "<b style='color:#ffc04a'>CREW PODS</b> &nbsp;//&nbsp; each one opens with that sleeper's ID card. Cards are hidden all over the station: take one to a <b style='color:#ffc04a'>CREW TERMINAL</b>." },
  { id: "crewterm", when: () => world.crewTerm && Math.hypot(world.crewTerm.fx - player.pos.x, world.crewTerm.fz - player.pos.z) < 6, dur: 10,
    text: () => carryingCard()
      ? "<b style='color:#ffc04a'>CREW TERMINAL</b> &nbsp;//&nbsp; stand on the ring to upload the ID card. It wakes that sleeper back in the hypersleep chamber."
      : "<b style='color:#ffc04a'>CREW TERMINAL</b> &nbsp;//&nbsp; bring it a crew ID card and it wakes that sleeper. There's a card somewhere in this district." },
  { id: "sealed", when: () => world.terminals.some(t => t.sealed && !t.hacked && Math.hypot(t.x - player.pos.x, t.z - player.pos.z) < 13), dur: 10,
    text: () => game.crew.includes("rook")
      ? "<b style='color:#9dff6a'>SEALED VAULT</b> &nbsp;//&nbsp; no way in, in either world. <kbd>TAB</kbd> to Rook and <kbd>SHIFT</kbd> remote hack it from out here."
      : "<b style='color:#9dff6a'>SEALED VAULT</b> &nbsp;//&nbsp; no way in, in either world. Somebody asleep in the hypersleep chamber might be able to hack it from outside..." },
  { id: "rook", when: () => game.char === "rook", dur: 13,
    text: "<b style='color:#9dff6a'>IRIS ROOK</b> &nbsp;//&nbsp; <kbd>SHIFT</kbd> / <kbd>RIGHT CLICK</kbd>: remote hack the terminal or turret nearest your cursor, up to 16m, through walls. <kbd>TAB</kbd> back to Jax to phase." },
  { id: "crane", when: () => game.char === "crane", dur: 14,
    text: "<b style='color:#c78bff'>HOLLIS &quot;BOULDER&quot; CRANE</b> &nbsp;//&nbsp; <kbd>SHIFT</kbd> / <kbd>RIGHT CLICK</kbd> next to a crate or a small enemy lifts it. Press again, or <kbd>LEFT CLICK</kbd>, to throw it where you aim." },
  { id: "props", when: () => game.char !== "crane" && world.props?.some(p => p.state === "idle" && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 5), dur: 9,
    text: () => game.crew.includes("crane")
      ? "Crates with an orange band can be thrown, and gold-strapped <b style='color:#ffc04a'>SUPPLY CRATES</b> break open. <kbd>TAB</kbd> to Boulder and <kbd>SHIFT</kbd> to lift one."
      : "That crate with the orange band looks throwable, and the gold-strapped ones are <b style='color:#ffc04a'>SUPPLY CRATES</b> with something inside. Somebody strong could open them..." },
  { id: "chamber", when: () => world.chambers?.some(ch => Math.hypot(ch.fx - player.pos.x, ch.fz - player.pos.z) < 6), dur: 9,
    text: "<b style='color:#7dffb0'>REVIVE CHAMBER</b> &nbsp;//&nbsp; if a crew member goes down, stand on its ring with a <b style='color:#7dffb0'>REVIVE CELL</b> to bring them back. Cells are hidden around every district." },
  { id: "exit", when: () => world.exit?.open, dur: 6,
    text: "All locks breached &nbsp;//&nbsp; follow the marker to the <b class='c'>EXIT PORTAL</b>" },
];
function updateHints(dt) {
  const h = game.hint;
  if (h) {
    h.t += dt;
    if ((h.def.until && h.def.until()) || h.t > (h.def.dur || 14)) { game.hint = null; hud.hint(null); }
    return;
  }
  for (const def of HINTS) {
    if (game.hintsShown.has(def.id) || !def.when()) continue;
    game.hintsShown.add(def.id);
    game.hint = { def, t: 0 };
    hud.hint(typeof def.text === "function" ? def.text() : def.text);
    break;
  }
}

function updateObjective() {
  const total = world.terminals.length;
  const done = world.terminals.filter(t => t.hacked).length;
  const b = game.boss;
  let text = done < total ? `BREACH THE LOCKS  ${done}/${total}`
    : b && b.alive && !b.dying ? (b.state === "dormant" ? "PORTAL ROOM OPEN // FACE THE WARDEN" : "DEFEAT THE WARDEN")
    : b && b.dying ? "THE WARDEN IS FALLING"
    : "PORTAL ONLINE // REACH THE EXIT";
  const cd = world.card, c = cd && CREW[cd.crew];
  if (c && !game.crew.includes(c.id) && !cd.taken && (cd.tier || 0) <= world.locksDone) text += "  //  FIND THE CREW ID CARD";
  else if (carryingCard() && world.crewTerm) text += "  //  TAKE THE ID CARD TO THE CREW TERMINAL";
  if (text !== game.objText) { game.objText = text; hud.setObjective(text); }
}

// ---------- crew: ID cards, hypersleep pods, swapping ----------
function refreshPods(instant) {
  for (const p of world.pods || []) {
    const c = crewByPod(p.label);
    // Pod 01 is Jax's own: shut with him inside until the district starts, then it opens (updateCrew)
    if (c?.id === "jax") { if (instant) { world.setPodState(p, "sleeping"); p.open = 0; } continue; }
    const state = c && game.crew.includes(c.id) ? "awake" : "locked";
    world.setPodState(p, state);
    if (instant) p.open = state === "awake" ? 1 : 0;
  }
}

// ---------- crew vitals: everyone has their own health + phase energy ----------
const BENCH_HEAL = 3;                    // hp/s a benched (not downed) crew member recovers
const REVIVE_COLOR = new THREE.Color(0.35, 1, 0.65);
const CELL_PICKUP = 1.3, CHAMBER_REACH = 1.7, REVIVE_TIME = 1.6;

function vit(id) {
  return game.vitals[id] ||= { hp: maxHp(id), energy: 100, down: false, weapon: null };
}

// what makes each crew member feel different in the hand: colour, size, speed
function applyBody(id) {
  const c = CREW[id];
  player.setBody(id, modelOf(id));   // their own model (or their skin's), else Jax's
  player.setSkin(skinOf(id)?.body || null);   // the skin's armour colour (after setBody: it tints the new body)
  player.tint = glowOf(id);                    // the skin's glow, else the crew colour (Jax: the phase colour)
  player.bulk = c.bulk || 1;
  player.gait = c.gait || null;   // Boulder runs heavier than Jax
  player.speedMul = (c.speed || 1) * (game.held ? GRAB.carrySlow : 1);
}

// Health hit zero. With a teammate still standing, this character goes down and the teammate
// takes over on the spot (revive them at a chamber); with nobody left it's the usual death.
function playerDown() {
  if (!player.alive) return;
  const backup = game.crew.find(id => id !== game.char && !vit(id).down);
  if (!backup) { killPlayer(); return; }
  const fallen = CREW[game.char];
  const v = vit(game.char);
  v.down = true; v.hp = 0; v.energy = player.energy; v.weapon = null;   // a pickup weapon is lost with them
  player.weapon = null;
  const col = fallen.tint || PALETTE[game.phase].accent;
  particles.emit({ x: player.pos.x, y: 1.2, z: player.pos.z, count: 90, speed: 7, up: 5, color: [col.r * 2.5, col.g * 2.5, col.b * 2.5], size: 0.5, life: 1.1, gravity: -8 });
  shockwaves.spawn(player.pos.x, player.pos.z, col, 8, 0.6);
  audio.explode();
  game.trauma = Math.min(1, game.trauma + 0.3 * game.fx);
  game.hitstop = 0.12;
  game.swapCd = 0;
  swapTo(backup, true);
  player.invuln = 1.5;
  hud.toast(`${fallen.name} IS DOWN // ${game.cells ? "REVIVE AT THE REVIVE CHAMBER" : "FIND A REVIVE CELL"}`, "#ff5566");
}

function updateRevive(dt) {
  // revive cells lying on the floor
  for (const cell of world.cells || []) {
    if (cell.taken || !player.alive || Math.hypot(player.pos.x - cell.x, player.pos.z - cell.z) > CELL_PICKUP) continue;
    if (game.cells >= MAX_CELLS) {
      if ((game.cellFullT || 0) <= game.stats.time) { hud.toast(`REVIVE CELLS FULL // ${MAX_CELLS}/${MAX_CELLS}`, "#7dffb0"); game.cellFullT = game.stats.time + 3; }
      continue;
    }
    world.takeCell(cell);
    game.cells++;
    saveCells(game.cells);
    game.stats.score += 100;
    audio.pickup();
    flashes.flash(cell.x, 1.2, cell.z, REVIVE_COLOR, 8 * game.fx, 0.4, 8);
    shockwaves.spawn(cell.x, cell.z, REVIVE_COLOR, 3.5, 0.4);
    const anyDown = game.crew.some(id => vit(id).down);
    hud.toast(`REVIVE CELL ${game.cells}/${MAX_CELLS} // ${anyDown ? "TAKE IT TO THE REVIVE CHAMBER" : "SAVES A CREW MEMBER WHO GOES DOWN"}`, "#7dffb0");
  }
  // revive chambers: stand on the ring in front with a cell and a downed crew member
  const who = game.crew.find(id => vit(id).down);
  for (const ch of world.chambers || []) {
    const near = player.alive && Math.hypot(player.pos.x - ch.fx, player.pos.z - ch.fz) < CHAMBER_REACH;
    const ready = !!who && game.cells > 0;
    if (!near || !ready) { ch.progress = Math.max(0, ch.progress - dt); ch.state = ready ? "ready" : "idle"; }
    if (!near) { hud.terminalLabel(ch.labelAt, camera, false); continue; }
    if (!who) { hud.terminalLabel(ch.labelAt, camera, true, `<b style="color:#7dffb0">REVIVE CHAMBER</b><br>CREW STABLE // CELLS ${game.cells}/${MAX_CELLS}`, 0); continue; }
    const c = CREW[who];
    if (!game.cells) { hud.terminalLabel(ch.labelAt, camera, true, `<b class="r">REVIVE CHAMBER</b><br>${c.short} DOWN // NEEDS A REVIVE CELL`, 0); continue; }
    ch.state = "reviving";
    ch.tint = c.tint || PALETTE[CITY].accent;
    ch.progress = Math.min(1, ch.progress + dt / REVIVE_TIME);
    hackTickT -= dt;
    if (hackTickT <= 0) { audio.hackTick(); hackTickT = 0.1; }
    hud.terminalLabel(ch.labelAt, camera, true, `<b style="color:#7dffb0">REVIVING</b> ${c.short} ${Math.floor(ch.progress * 100)}%`, ch.progress);
    if (ch.progress >= 1) reviveCrew(who, ch);
  }
}

function reviveCrew(id, ch) {
  const c = CREW[id];
  game.vitals[id] = { hp: maxHp(id), energy: 100, down: false, weapon: null };
  game.cells--;
  saveCells(game.cells);
  game.stats.score += 150;
  ch.progress = 0;
  ch.state = "idle";
  ch.figureMat.opacity = 1;   // fades back out in world.updateRevive
  audio.hackDone();
  const col = c.tint || PALETTE[CITY].accent;
  shockwaves.spawn(ch.fx, ch.fz, REVIVE_COLOR, 6, 0.55);
  flashes.flash(ch.labelAt.x, 2, ch.labelAt.z, REVIVE_COLOR, 14 * game.fx, 0.6, 12);
  particles.emit({ x: ch.labelAt.x, y: 1.4, z: ch.labelAt.z, count: 60, speed: 5, up: 3, color: [col.r * 2, col.g * 2, col.b * 2], size: 0.45, life: 0.8, gravity: -3, drag: 2 });
  hud.terminalLabel(ch.labelAt, camera, false);
  hud.toast(`${c.name} REVIVED // TAB TO SWAP`, c.css || "#7dffb0");
  hud.setCrew(game.crew, game.char);
}

function swapTo(id, quiet) {
  if (id === game.char || !game.crew.includes(id) || !player.alive || game.swapCd > 0) return;
  if (vit(id).down) {
    audio.denied();
    hud.toast(`${CREW[id].name} IS DOWN // ${game.cells ? "REVIVE AT THE REVIVE CHAMBER" : "FIND A REVIVE CELL"}`, "#ff5566");
    game.swapCd = 0.3;
    return;
  }
  if (game.held) dropHeld();   // Crane puts down whatever he's carrying
  // park the current character's health, energy and pickup weapon, bring in the new one's
  const cur = vit(game.char);
  if (!cur.down) { cur.hp = player.hp; cur.energy = player.energy; cur.weapon = player.weapon; }
  const next = vit(id);
  player.hp = next.hp;
  player.energy = next.energy;
  player.weapon = next.weapon;
  game.lowEnergyWarned = false;
  game.char = id;
  game.swapCd = 0.35;
  game.uplink = null;
  const c = CREW[id];
  applyBody(id);
  const col = c.tint || PALETTE[game.phase].accent;
  shockwaves.spawn(player.pos.x, player.pos.z, col, 5, 0.4);
  particles.emit({ x: player.pos.x, y: 1, z: player.pos.z, count: 30, speed: 5, up: 3, color: [col.r * 2, col.g * 2, col.b * 2], size: 0.35, life: 0.5, gravity: -2, drag: 3 });
  if (game.fx) player.spawnAfterimage(col);
  audio.dash();
  if (!quiet) hud.toast(`${c.name} // ${c.ability}`, c.css || "#55e6ff");
  hud.setCrew(game.crew, id);
}

function updateCrew(dt) {
  // pick up the ID card, then take it to the district's crew terminal to thaw that pod
  // (a district without a terminal wakes them on the spot)
  const cd = world.card;
  if (cd && !cd.taken && player.alive && Math.hypot(player.pos.x - cd.x, player.pos.z - cd.z) < 1.4) {
    world.takeCard();
    const c = CREW[cd.crew];
    audio.hackDone();
    flashes.flash(cd.x, 1.5, cd.z, 0xffc04a, 10 * game.fx, 0.5, 10);
    shockwaves.spawn(cd.x, cd.z, new THREE.Color(1, 0.75, 0.3), 5, 0.5);
    game.stats.score += 100;
    if (loadCrew().includes(c.id)) hud.toast(`ID CARD // POD ${c.pod} IS ALREADY OPEN`, "#ffc04a");
    else if (world.crewTerm) hud.toast(`ID CARD: ${c.name} // TAKE IT TO THE CREW TERMINAL`, "#ffc04a");
    else joinCrew(c, cd);
  }
  updateCrewTerminal(dt);
  // crew pods
  for (const p of world.pods || []) {
    if (p.state === "sleeping") { if (game.stats.time > 0.4) wakeUp(p); continue; }
    const c = crewByPod(p.label);
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (!c || d > 2.9 || !player.alive) { hud.terminalLabel(p, camera, false); continue; }
    if (p.state === "awake") hud.terminalLabel(p, camera, true, `<b style="color:${c.css || "#55e6ff"}">POD ${p.label}</b><br>EMPTY // ${c.name} IS AWAKE`, 0);
    else hud.terminalLabel(p, camera, true, `<b class="r">POD ${p.label}</b><br>LOCKED // ID CARD REQUIRED`, 0);
  }
  game.swapCd = Math.max(0, game.swapCd - dt);
  updateRevive(dt);
  updateUplink(dt);
  updateObjective();
}

// You carry the district's ID card and that crew member isn't awake yet.
function carryingCard() {
  const cd = world.card, c = cd && CREW[cd.crew];
  return !!(c && cd.taken && !game.crew.includes(c.id));
}

// The crew terminal: stand on its ring with the ID card and it uploads, then the pod thaws.
const CARD_UPLOAD_TIME = 1.2;
function updateCrewTerminal(dt) {
  const ct = world.crewTerm;
  if (!ct) return;
  const cd = world.card, c = cd && CREW[cd.crew];
  const carrying = carryingCard();
  const near = player.alive && Math.hypot(player.pos.x - ct.fx, player.pos.z - ct.fz) < CHAMBER_REACH;
  if (!near || !carrying) ct.progress = Math.max(0, ct.progress - dt);
  ct.state = c && game.crew.includes(c.id) ? "done" : carrying ? (near ? "uploading" : "ready") : "locked";
  if (!near) { hud.terminalLabel(ct.labelAt, camera, false); return; }
  const head = `<b style="color:#ffc04a">CREW TERMINAL</b><br>`;
  if (!c) { hud.terminalLabel(ct.labelAt, camera, true, `${head}NO CREW RECORDS`, 0); return; }
  if (ct.state === "done") { hud.terminalLabel(ct.labelAt, camera, true, `${head}POD ${c.pod} OPEN // ${c.short} IS AWAKE`, 0); return; }
  if (!carrying) { hud.terminalLabel(ct.labelAt, camera, true, `<b class="r">CREW TERMINAL</b><br>INSERT A CREW ID CARD`, 0); return; }
  ct.progress = Math.min(1, ct.progress + dt / CARD_UPLOAD_TIME);
  hackTickT -= dt;
  if (hackTickT <= 0) { audio.hackTick(); hackTickT = 0.1; }
  hud.terminalLabel(ct.labelAt, camera, true, `${head}UPLOADING ID // ${c.short} ${Math.floor(ct.progress * 100)}%`, ct.progress);
  if (ct.progress >= 1) {
    ct.progress = 0;
    ct.state = "done";
    hud.terminalLabel(ct.labelAt, camera, false);
    joinCrew(c, { x: ct.fx, z: ct.fz });
  }
}

// District 01 opening: Pod 01's lid lifts, cold fog rolls out, and Jax climbs out of it.
function wakeUp(p) {
  world.setPodState(p, "awake");
  player.asleep = false;
  shockwaves.spawn(p.x, p.z, new THREE.Color(0.5, 0.9, 1), 6, 0.6);
  particles.emit({ x: p.x, y: 0.8, z: p.z, count: 70, speed: 5, up: 2, color: [1.6, 2.0, 2.4], size: 0.6, life: 1.1, gravity: 0.5, drag: 2.5 });
  audio.dash();
}

// A crew member joins (their ID card was picked up). `at` is where the card was.
function joinCrew(c, at) {
  // a full squad (3) can't take one more mid-district: they wake up and wait for the next crew screen
  const full = game.crew.length >= MAX_SQUAD;
  // the newcomer goes on the end, so the lead and the 1-3 swap keys you deployed with stay put
  if (!full && !game.crew.includes(c.id)) game.crew = [...game.crew, c.id];
  saveCrew(CREW_ORDER.filter(id => id === c.id || loadCrew().includes(id)));
  const sq = loadSquad(loadCrew());
  if (!full && !sq.includes(c.id) && sq.length < MAX_SQUAD) saveSquad([...sq, c.id]);
  const p = world.pods?.find(p => p.label === c.pod);
  if (p) world.setPodState(p, "awake");
  game.stats.score += 500;
  // a burst of the new crew member's colour where the card was
  shockwaves.spawn(at.x, at.z, c.tint, 9, 0.7);
  flashes.flash(at.x, 2, at.z, c.tint, 16 * game.fx, 0.7, 12);
  particles.emit({ x: at.x, y: 0.8, z: at.z, count: 90, speed: 6, up: 2, color: [1.6, 2.0, 2.4], size: 0.6, life: 1.1, gravity: 0.5, drag: 2.5 });
  audio.portalOpen();
  hud.setCrew(game.crew, game.char);
  updateObjective();
  playStory(c.wake || [], () => {
    hideOverlay();
    hud.show(true);
    game.state = "play";
    game.swapCd = 0;
    if (!full) swapTo(c.id);
    else hud.toast(`${c.short} IS AWAKE // PICK ${c.short} ON THE CREW SCREEN BEFORE THE NEXT DISTRICT`, c.css || "#ffc04a");
  });
}

// ---------- Rook: remote hack ----------
function findUplinkTarget() {
  const px = player.pos.x, pz = player.pos.z, ax = player.aim.x, az = player.aim.z;
  let best = null, bestD = Infinity;
  // `edge`: big targets (the Warden) count from their armour, not their centre
  const consider = (obj, kind, x, z, edge = 0) => {
    if (Math.hypot(x - px, z - pz) - edge > HACK.range) return;
    const d = Math.max(0, Math.hypot(x - ax, z - az) - edge);
    if (d < bestD) { bestD = d; best = { obj, kind, x, z }; }
  };
  for (const t of world.terminals) if (!t.hacked && t.phase === game.phase) consider(t, "terminal", t.x, t.z);
  for (const e of game.enemies) if (e.alive && e.stationary && e.phase === game.phase && !(e.hijackT > 0)) consider(e, "turret", e.pos.x, e.pos.z);
  const b = game.boss;
  if (b && bossHackable(b)) consider(b, "boss", b.pos.x, b.pos.z, b.radius);
  return best;
}

// The Warden can be hacked while he's fighting, in your world, and his firewall is up again.
function bossHackable(b) {
  return b.alive && !b.untouchable && b.phase === game.phase && b.firewallT <= 0 && b.state !== "override" && b.state !== "intro";
}

function tryUplink() {
  if (game.uplinkCd > 0 || !player.alive) return;
  const t = findUplinkTarget();
  if (t && game.uplink && t.obj === game.uplink.obj) return;   // already on it
  if (!t) {
    audio.denied();
    const other = world.terminals.some(x => !x.hacked && x.phase !== game.phase && Math.hypot(x.x - player.pos.x, x.z - player.pos.z) < HACK.range);
    const b = game.boss, near = b && b.alive && !b.untouchable && Math.hypot(b.pos.x - player.pos.x, b.pos.z - player.pos.z) - b.radius < HACK.range;
    hud.toast(near && b.firewallT > 0 ? `UPLINK FAILED // WARDEN FIREWALL REBOOTING ${Math.ceil(b.firewallT)}s`
      : near && b.state === "override" ? "WARDEN ALREADY OVERRIDDEN"
      : other ? "UPLINK FAILED // THAT LOCK IS IN THE OTHER WORLD" : "UPLINK FAILED // NOTHING HACKABLE WITHIN 16m", "#ff5566");
    game.uplinkCd = 0.25;
    return;
  }
  game.uplink = { ...t, t: 0, dur: t.kind === "terminal" ? HACK.termTime : t.kind === "boss" ? HACK.bossTime : HACK.turretTime };
  audio.hackTick();
  shockwaves.spawn(t.x, t.z, HACK_COLOR, 3, 0.35);
}

let uplinkBeam = null;
function updateUplink(dt) {
  game.uplinkCd = Math.max(0, game.uplinkCd - dt);
  if (!uplinkBeam) {
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true);
    geo.rotateX(Math.PI / 2);
    uplinkBeam = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: HACK_COLOR.clone().multiplyScalar(3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    uplinkBeam.frustumCulled = false;
    scene.add(uplinkBeam);
  }
  game.hackPreview = game.char === "rook" && !game.uplink && player.alive ? findUplinkTarget() : null;
  const u = game.uplink;
  uplinkBeam.visible = !!u;
  if (!u) return;
  if (u.kind === "boss") { u.x = u.obj.pos.x; u.z = u.obj.pos.z; }   // he walks while you hack
  const lost = !player.alive || game.char !== "rook"
    || Math.hypot(u.x - player.pos.x, u.z - player.pos.z) - (u.kind === "boss" ? u.obj.radius : 0) > HACK.range + 3
    || (u.kind === "terminal" ? u.obj.hacked || u.obj.phase !== game.phase
      : u.kind === "boss" ? !bossHackable(u.obj)
      : !u.obj.alive || u.obj.phase !== game.phase);
  if (lost) {
    game.uplink = null; uplinkBeam.visible = false; game.uplinkCd = 0.5;
    if ((u.kind === "terminal" && !u.obj.hacked) || u.kind === "boss") hud.toast("UPLINK LOST", "#ff5566");
    if (u.kind === "boss" && u.obj.labelAt) hud.terminalLabel(u.obj.labelAt, camera, false);
    return;
  }
  u.t += dt;
  const k = Math.min(1, u.t / u.dur);
  // beam from Rook's hand to the target, crackling
  const sx = player.pos.x, sz = player.pos.z, sy = 1.5, ty = u.kind === "terminal" ? 1.3 : u.kind === "boss" ? 2.6 : 1.2;
  uplinkBeam.position.set((sx + u.x) / 2, (sy + ty) / 2, (sz + u.z) / 2);
  uplinkBeam.lookAt(u.x, ty, u.z);
  const len = Math.hypot(u.x - sx, ty - sy, u.z - sz);
  const w = 0.7 + Math.random() * 0.8;
  uplinkBeam.scale.set(w, w, len);
  const f = Math.random();
  particles.emit({ x: sx + (u.x - sx) * f, y: sy + (ty - sy) * f, z: sz + (u.z - sz) * f, count: 1, speed: 0.6, up: 0.3, color: [1.2, 2.6, 0.8], size: 0.3, life: 0.25, gravity: 0 });
  hackTickT -= dt;
  if (hackTickT <= 0) { audio.hackTick(); hackTickT = 0.08; }
  if (u.kind === "terminal") {
    u.obj.progress = Math.max(u.obj.progress, k);
    hud.terminalLabel(u.obj, camera, true, `<b style="color:#9dff6a">REMOTE HACK</b> ${Math.floor(u.obj.progress * 100)}%`, u.obj.progress);
    if (u.obj.progress >= 1) { game.uplink = null; game.uplinkCd = HACK.cooldown; completeTerminal(u.obj); }
  } else if (u.kind === "boss") {
    hud.terminalLabel(u.obj.labelAt ||= { x: 0, z: 0, y: 4.2 }, camera, true, `<b style="color:#9dff6a">OVERRIDING THE WARDEN</b> ${Math.floor(k * 100)}%`, k);
    u.obj.labelAt.x = u.x; u.obj.labelAt.z = u.z;
    if (k >= 1) {
      // his own cannons turn on him for a few seconds, then his firewall reboots
      hud.terminalLabel(u.obj.labelAt, camera, false);
      u.obj.override();
      game.uplink = null; game.uplinkCd = HACK.cooldown;
      audio.hackDone();
      shockwaves.spawn(u.x, u.z, HACK_COLOR, 7, 0.6);
      flashes.flash(u.x, 2.6, u.z, HACK_COLOR, 14 * game.fx, 0.5, 12);
      hud.toast(`WARDEN OVERRIDDEN // HIS CANNONS TURN ON HIM // ${WARDEN.override}s`, "#9dff6a");
      game.stats.score += 300;
      announceUnlocks(earnFeat("wardenHacked"));
    }
  } else if (k >= 1) {
    u.obj.hijackT = HACK.hijack;
    u.obj.cooldown = 0.3;
    game.uplink = null; game.uplinkCd = HACK.cooldown;
    audio.hackDone();
    shockwaves.spawn(u.x, u.z, HACK_COLOR, 4, 0.45);
    hud.toast(`TURRET HIJACKED // ${HACK.hijack}s`, "#9dff6a");
    game.stats.score += 50;
  }
}

// ---------- Crane: grab, carry, throw ----------
// SHIFT next to a throwable crate ("m", "$") or a small enemy lifts it overhead; SHIFT again or
// LEFT CLICK throws it toward the aim point. It smashes on the first wall or enemy it meets, or
// where it lands, hurting every enemy nearby. Supply crates break open with their loot inside.
const GRAB = { reach: 2.3, cooldown: 0.3, range: 11, minRange: 2.5, speed: 18, radius: 3.2, damage: 70, carrySlow: 0.8, liftTime: 0.18, holdY: 2.9 };
const GRAB_Y = { drone: 1.7, wraith: 1.2 };   // small enemies Crane can lift: their body's centre height (their Head's height in enemies.js)
// carry height (the held thing's centre) when GRAB.holdY would leave it touching his head: the wraith is 1.7 m tall
const GRAB_HOLD = { wraith: 3.2 };
const holdY = h => (h.kind === "enemy" && GRAB_HOLD[h.obj.type]) || GRAB.holdY;
const CRANE_COLOR = new THREE.Color(0.8, 0.5, 1.0);
const GOLD = new THREE.Color(1.0, 0.75, 0.25);

function findGrabTarget() {
  const px = player.pos.x, pz = player.pos.z;
  const fx = px + Math.sin(player.facing), fz = pz + Math.cos(player.facing);   // prefer what's in front
  let best = null, bestD = Infinity;
  const consider = (obj, kind, x, z) => {
    if (Math.hypot(x - px, z - pz) > GRAB.reach) return;
    const d = Math.hypot(x - fx, z - fz);
    if (d < bestD) { bestD = d; best = { obj, kind, x, z }; }
  };
  for (const p of world.props || []) if (p.state === "idle") consider(p, "prop", p.x, p.z);
  for (const e of game.enemies) {
    if (e.alive && !e.held && GRAB_Y[e.type] && e.phase === game.phase && !(e.hijackT > 0)) consider(e, "enemy", e.pos.x, e.pos.z);
  }
  return best;
}

function tryGrab() {
  if (!player.alive) return;
  if (game.held) { if (game.held.t >= GRAB.liftTime) throwHeld(); return; }
  if (game.grabCd > 0) return;
  const t = findGrabTarget();
  if (!t) {
    audio.denied();
    hud.toast("NOTHING TO GRAB // STAND NEXT TO A CRATE OR A SMALL ENEMY", "#ff5566");
    game.grabCd = 0.25;
    return;
  }
  if (t.kind === "prop") world.liftProp(t.obj);
  else { t.obj.held = true; t.obj.bar.visible = false; t.obj.telegraph = 0; }
  const y0 = t.kind === "prop" ? PROP_Y : GRAB_Y[t.obj.type];
  game.held = { ...t, t: 0, fromX: t.x, fromZ: t.z, fromY: y0 };
  player.carrying = true;
  applyBody(game.char);
  audio.burst(260, 1, 0.22, 0.35, "lowpass", 900);
  audio.tone("sine", 90, 170, 0.2, 0.25);
  game.trauma = Math.min(1, game.trauma + 0.06 * game.fx);
  shockwaves.spawn(t.x, t.z, CRANE_COLOR, 2.5, 0.3);
}

// put a carried / flying thing at a world position (y = its centre)
function placeHeld(h, x, y, z, rotY, tilt) {
  if (h.kind === "prop") { h.obj.group.position.set(x, y, z); h.obj.group.rotation.set(tilt, rotY, 0); }
  else {
    const e = h.obj;
    e.pos.set(x, 0, z);
    e.model.root.position.set(x, y - GRAB_Y[e.type], z);
    e.model.root.rotation.set(0, rotY, 0);
  }
}

function updateCarry(dt) {
  game.grabCd = Math.max(0, game.grabCd - dt);
  const h = game.held;
  if (h) {
    h.t += dt;
    const k = Math.min(1, h.t / GRAB.liftTime), ease = k * (2 - k);
    const x = h.fromX + (player.pos.x - h.fromX) * ease, z = h.fromZ + (player.pos.z - h.fromZ) * ease;
    const y = h.fromY + (holdY(h) - h.fromY) * ease + Math.sin(game.stats.time * 6) * 0.04;
    placeHeld(h, x, y, z, player.facing, 0);
    if (h.kind === "enemy") h.obj.hitFlash = 0;
  }
  // prompt: what SHIFT would do right now
  const show = game.char === "crane" && player.alive && !player.asleep;
  const target = show && !h ? findGrabTarget() : null;
  if (h && show) {
    grabLabel.x = player.pos.x; grabLabel.z = player.pos.z;
    hud.terminalLabel(grabLabel, camera, true, `<kbd>SHIFT</kbd> / <kbd>CLICK</kbd> <b style="color:#c78bff">THROW</b>`, 0);
  } else if (target) {
    grabLabel.x = target.x; grabLabel.z = target.z;
    const what = target.kind === "enemy" ? "GRAB" : target.obj.kind === "supply" ? "LIFT SUPPLY CRATE" : "LIFT";
    hud.terminalLabel(grabLabel, camera, true, `<kbd>SHIFT</kbd> <b style="color:#c78bff">${what}</b>`, 0);
  } else hud.terminalLabel(grabLabel, camera, false);
  updateThrown(dt);
}

function throwHeld() {
  const h = game.held;
  game.held = null;
  player.carrying = false;
  applyBody(game.char);
  const px = player.pos.x, pz = player.pos.z;
  // aim: the auto-aim target if there is one, otherwise the cursor; clamped to the throw range
  const tgt = game.aimTarget ? game.aimTarget.pos : player.aim;
  let dx = tgt.x - px, dz = tgt.z - pz;
  const d = Math.hypot(dx, dz);
  if (d < 0.05) { dx = Math.sin(player.facing); dz = Math.cos(player.facing); }
  else { dx /= d; dz /= d; }
  const dist = THREE.MathUtils.clamp(d, GRAB.minRange, GRAB.range);
  if (h.kind === "prop") h.obj.state = "flying";
  game.thrown.push({
    ...h, x0: px, z0: pz, y0: holdY(h), x1: px + dx * dist, z1: pz + dz * dist,
    x: px, z: pz, t: 0, T: Math.max(0.22, dist / GRAB.speed), spin: player.facing, phase: game.phase,
  });
  game.grabCd = GRAB.cooldown;
  player.fireCd = 0.3;          // the click that threw it shouldn't also fire
  game.recoil = 1;
  audio.tone("sawtooth", 240, 70, 0.18, 0.12);
  audio.dash();
}

function updateThrown(dt) {
  for (let i = game.thrown.length - 1; i >= 0; i--) {
    const f = game.thrown[i];
    f.t += dt;
    const k = Math.min(1, f.t / f.T);
    const nx = f.x0 + (f.x1 - f.x0) * k, nz = f.z0 + (f.z1 - f.z0) * k;
    // sub-step so it can't skip through a wall tile or past an enemy
    let hit = null;
    const steps = Math.max(1, Math.ceil(Math.hypot(nx - f.x, nz - f.z) / 0.3));
    for (let s = 1; s <= steps && !hit; s++) {
      const sx = f.x + ((nx - f.x) * s) / steps, sz = f.z + ((nz - f.z) * s) / steps;
      const [r, c] = world.toTile(sx, sz);
      if (world.solid(r, c, f.phase, "shot")) { hit = { x: f.x + ((nx - f.x) * (s - 1)) / steps, z: f.z + ((nz - f.z) * (s - 1)) / steps }; break; }
      for (const e of game.enemies) {
        if (!e.alive || e.held || e === f.obj || e.phase !== f.phase || e.hijackT > 0 || e.untouchable) continue;
        if (Math.hypot(e.pos.x - sx, e.pos.z - sz) < e.radius + 0.6) { hit = { x: sx, z: sz }; break; }
      }
    }
    if (hit) { game.thrown.splice(i, 1); smashAt(f, hit.x, hit.z); continue; }
    f.x = nx; f.z = nz;
    f.spin += dt * 9;
    const endY = f.kind === "prop" ? PROP_Y : 1.0;
    const y = f.y0 + (endY - f.y0) * k + 4 * 1.2 * k * (1 - k);   // a short arc
    placeHeld(f, nx, y, nz, f.spin, f.kind === "prop" ? f.spin * 0.6 : 0);
    if (k >= 1) { game.thrown.splice(i, 1); smashAt(f, nx, nz); }
  }
}

// A thrown crate or enemy hits: every enemy close by takes damage (more at the centre) and gets
// knocked back. Thrown enemies don't get back up. `harmless` = just dropped, not thrown.
function smashAt(f, x, z, harmless = false) {
  const supply = f.kind === "prop" && f.obj.kind === "supply";
  const col = supply ? GOLD : f.kind === "enemy" ? f.obj.color : CRANE_COLOR;
  if (!harmless) {
    for (const e of game.enemies) {
      if (!e.alive || e.held || e === f.obj || e.phase !== f.phase || e.hijackT > 0 || e.untouchable) continue;
      // distance to the enemy's edge (the Warden is big), so a crate that lands against him counts
      const d = Math.max(0, Math.hypot(e.pos.x - x, e.pos.z - z) - (e.isBoss ? e.radius : 0));
      if (d > GRAB.radius) continue;
      let dmg = Math.round(GRAB.damage * (1 - (0.5 * d) / GRAB.radius));
      if (e.isBoss) { dmg *= WARDEN.crateMul; announceUnlocks(earnFeat("wardenCrated")); }
      hud.damageNumber(e.pos.x, e.isBoss ? 3.6 : 2.1, e.pos.z, `${dmg}!`, "#ffd166", camera, true);
      if (!e.stationary && !e.heavy && d > 0.01) world.move(e.pos, ((e.pos.x - x) / d) * 1.2, ((e.pos.z - z) / d) * 1.2, e.radius, e.phase, e.mode);
      if (e.damage(dmg)) killEnemy(e);
    }
  }
  if (f.kind === "enemy") {
    const e = f.obj;
    e.held = false;
    e.pos.set(x, 0, z);
    if (e.alive) killEnemy(e);
  } else {
    world.smashProp(f.obj);
    // splinters: steel grey + the band colour
    particles.emit({ x, y: 0.8, z, count: 40, speed: 7, up: 5, color: [0.5, 0.55, 0.65], size: 0.35, life: 0.9, gravity: -14, drag: 1 });
    particles.emit({ x, y: 0.8, z, count: 24, speed: 6, up: 4, color: [col.r * 2.5, col.g * 2.5, col.b * 2.5], size: 0.3, life: 0.6, gravity: -10, drag: 1.5 });
    revealLoot(f.obj, x, z);
  }
  shockwaves.spawn(x, z, col, GRAB.radius * 1.6, 0.45);
  flashes.flash(x, 1.2, z, col, 10 * game.fx, 0.35, 10);
  audio.explode();
  game.trauma = Math.min(1, game.trauma + 0.22 * game.fx);
  game.hitstop = Math.max(game.hitstop, 0.04);
}

// What's inside: a supply crate always holds its item (the level's `loot` list, or something
// basic); a plain crate sometimes drops health or energy.
function revealLoot(p, x, z) {
  // never leave the item over the void or inside a wall: walk it back toward Crane
  for (let i = 0; i < 24; i++) {
    const [r, c] = world.toTile(x, z);
    if (!world.solid(r, c, game.phase, "walk")) break;
    const dx = player.pos.x - x, dz = player.pos.z - z, l = Math.hypot(dx, dz) || 1;
    x += (dx / l) * 0.5; z += (dz / l) * 0.5;
  }
  if (p.kind === "supply") {
    const item = p.loot || ["gift", "hp", "energy"][Math.floor(Math.random() * 3)];
    spawnPickup(x, z, item, true);
    shockwaves.spawn(x, z, GOLD, 6, 0.6);
    flashes.flash(x, 1.6, z, GOLD, 14 * game.fx, 0.6, 12);
    audio.hackDone();
    hud.toast(`SUPPLY CRATE // ${LOOT_NAME[item] || item.toUpperCase()}`, "#ffc04a");
    game.stats.score += 100;
  } else if (Math.random() < 0.35) spawnPickup(x, z, Math.random() < 0.5 ? "hp" : "energy");
}

// Crane let go without throwing (swapped out, went down): crates drop and break, enemies get loose.
function dropHeld() {
  const h = game.held;
  if (!h) return;
  game.held = null;
  player.carrying = false;
  applyBody(game.char);
  if (h.kind === "enemy") {
    const e = h.obj;
    e.held = false;
    e.pos.set(player.pos.x, 0, player.pos.z);
    e.model.root.position.set(e.pos.x, 0, e.pos.z);
  } else smashAt({ ...h, phase: game.phase }, player.pos.x, player.pos.z, true);
}

// checkpoint respawn: anything carried or mid-air is gone (crates) or let go (enemies)
function clearCarry() {
  const all = [...(game.held ? [game.held] : []), ...game.thrown];
  for (const h of all) {
    if (h.kind === "prop") world.smashProp(h.obj);
    else { h.obj.held = false; h.obj.model.root.position.set(h.obj.pos.x, 0, h.obj.pos.z); }
  }
  game.held = null;
  game.thrown = [];
  player.carrying = false;
  hud.terminalLabel(grabLabel, camera, false);
}

// ---------- the Warden (District 05 boss) ----------
function updateBoss(dt) {
  const b = game.boss;
  if (!b) return;
  // walking into the portal room wakes him
  if (b.state === "dormant" && b.alive && player.alive) {
    const A = b.arena;
    if (player.pos.x > A.x0 && player.pos.x < A.x1 && player.pos.z > A.z0 && player.pos.z < A.z1) startBossFight();
  }
  const d = game.bossDeath;
  if (!d) return;
  d.t += dt;
  if (d.t > 1.1) game.timeScale = 1;
  // explosions ripple over him while he buckles
  d.nextT -= dt;
  if (!d.done && d.nextT <= 0) {
    d.nextT = 0.16;
    const a = Math.random() * Math.PI * 2, r = Math.random() * 1.3;
    const x = b.pos.x + Math.sin(a) * r, z = b.pos.z + Math.cos(a) * r, y = 0.8 + Math.random() * 2.4;
    const c = Math.random() < 0.5 ? b.color : new THREE.Color(1, 0.6, 0.25);
    particles.emit({ x, y, z, count: 24, speed: 6, up: 3, color: [c.r * 2.5, c.g * 2.5, c.b * 2.5], size: 0.5, life: 0.6, gravity: -8, drag: 1.5 });
    flashes.flash(x, y, z, c, 10 * game.fx, 0.25, 9);
    if (Math.random() < 0.6) audio.explode();
    game.trauma = Math.min(1, game.trauma + 0.1 * game.fx);
  }
  if (!d.done && d.t >= 2.6) {
    d.done = true;
    const x = b.pos.x, z = b.pos.z, c = b.color;
    particles.emit({ x, y: 1.8, z, count: 160, speed: 12, up: 7, color: [c.r * 3, c.g * 3, c.b * 3], size: 0.7, life: 1.3, gravity: -9, drag: 1.2 });
    particles.emit({ x, y: 1.6, z, count: 60, speed: 4, up: 3, color: [2.6, 2.3, 1.9], size: 1.2, life: 0.5, gravity: 0, drag: 4 });
    shockwaves.spawn(x, z, c, 16, 0.8);
    shockwaves.spawn(x, z, new THREE.Color(1, 0.7, 0.3), 9, 0.5);
    flashes.flash(x, 2, z, c, 30 * game.fx, 0.8, 18);
    hud.screenFlash("rgba(255,60,140,0.6)", 0.3 * game.fx);
    audio.explode(); audio.explode();
    game.trauma = Math.min(1, game.trauma + 0.6 * game.fx);
    game.hitstop = 0.15;
    b.remove();
    game.boss = null;
    game.bossDeath = null;
    world.openExit();
    audio.portalOpen();
    hud.toast("THE WARDEN IS DOWN // PORTAL ZERO IS ONLINE", "#9ff3ff");
    updateObjective();
  }
}

function startBossFight() {
  const b = game.boss, cp = world.level.boss.checkpoint;
  // if the whole crew goes down you come back just outside the portal room
  game.checkpoint = { x: cp[1] * TILE + TILE / 2, z: cp[0] * TILE + TILE / 2, phase: CITY };
  b.activate();
  game.trauma = Math.min(1, game.trauma + 0.3 * game.fx);
  audio.tone("sawtooth", 70, 140, 1.4, 0.22);
  updateObjective();
  if (game.wardenIntroSeen) { hud.toast("THE WARDEN // REBOOTED", "#ff2e80"); return; }
  game.wardenIntroSeen = true;
  const tips = [];
  if (game.crew.includes("jax")) tips.push("When he charges a purge, Jax: phase into the Breach. He can't see you there.");
  if (game.crew.includes("rook")) tips.push("Rook, his armor has a maintenance port. Hack it and his own cannons turn on him.");
  if (game.crew.includes("crane")) tips.push("Boulder, those heavy crates will hurt him more than any bullet.");
  playStory([
    { speaker: "STATION COMPUTER", text: "Unauthorized crew in the Portal Zero chamber. Deploying WARDEN security unit." },
    { speaker: "DR. LENA VOSS", text: "That's the Warden, Calder. Station security's last word. The portal won't power up while he's standing." },
    { speaker: "DR. LENA VOSS", text: tips.join(" ") || "Keep moving and keep shooting." },
  ], () => { hideOverlay(); hud.show(true); game.state = "play"; });
}

function defeatBoss(e) {
  if (e.dying) return;
  e.dying = true;
  e.state = "dying";
  e.deathT = 0;
  game.bossDeath = { t: 0, nextT: 0, e };
  game.timeScale = 0.45;
  game.stats.kills++;
  game.stats.score += e.cfg.score;
  projectiles.clearEnemy();
  if (game.uplink?.obj === e) game.uplink = null;
  hud.toast("THE WARDEN IS GOING DOWN", "#ff2e80");
  announceUnlocks(earnFeat("wardenDown"));
  updateObjective();
}

// "SKIN UNLOCKED" toast for whatever a feat or a win just unlocked
function announceUnlocks(list) {
  if (!list.length) return;
  const txt = list.map(u => `${u.crew.short.split(" ").pop()}: ${u.skin.name}`).join(" + ");
  setTimeout(() => hud.toast(`SKIN UNLOCKED // ${txt} // CHANGE IT ON THE CREW SCREEN`, list[0].crew.css || "#ffc04a"), 1600);
}

// ---------- phase shift ----------
function tryShift() {
  if (game.shiftCd > 0 || !player.alive) return;
  const target = 1 - game.phase;
  if (world.overlaps(player.pos.x, player.pos.z, player.radius, target, "walk")) {
    audio.denied();
    // say *why*: standing on a floor that doesn't exist there, or inside something solid
    const [pr, pc] = world.toTile(player.pos.x, player.pos.z);
    const noFloor = "~bv".includes(world.ch(pr, pc));
    hud.toast(noFloor ? "PHASE BLOCKED // NO FLOOR UNDER YOU IN THE OTHER WORLD" : "PHASE BLOCKED // SOMETHING SOLID IS HERE IN THE OTHER WORLD", "#ff5566");
    game.trauma = Math.min(1, game.trauma + 0.08 * game.fx);
    shockwaves.spawn(player.pos.x, player.pos.z, new THREE.Color(1, 0.2, 0.2), 2.5, 0.3);
    game.shiftCd = 0.25;
    return;
  }
  if (target === BREACH && player.energy < 12) {
    audio.denied();
    hud.toast("PHASE ENERGY TOO LOW", "#ff5566");
    game.shiftCd = 0.25;
    return;
  }
  doShift(target);
}

function doShift(target) {
  game.phase = target;
  game.shiftCd = game.shiftCdMax;
  game.stats.shifts++;
  const col = PALETTE[target].accent;
  shockwaves.spawn(player.pos.x, player.pos.z, col, 18, 0.6);
  shockwaves.spawn(player.pos.x, player.pos.z, col, 7, 0.35);
  flashes.flash(player.pos.x, 2, player.pos.z, col, 18 * game.fx, 0.5, 14);
  particles.emit({ x: player.pos.x, y: 0.8, z: player.pos.z, count: 70, speed: 10, up: 3, color: [col.r * 2, col.g * 2, col.b * 2], size: 0.35, life: 0.7, gravity: -2, drag: 3 });
  game.caFx = 0.35 * game.fx;
  game.glitchFx = 0.3 * game.fx;
  game.trauma = Math.min(1, game.trauma + 0.12 * game.fx);
  hud.screenFlash(target === BREACH ? "rgba(255,40,80,0.5)" : "rgba(80,230,255,0.45)", 0.18 * game.fx);
  projectiles.clearEnemy();
  if (game.fx) player.spawnAfterimage(PALETTE[1 - target].accent); // the self you left in the old world
  audio.shift(target === BREACH);
  audio.setBreach(target);
  game.flowKey = "";
}

// ---------- combat ----------
function firePlayer() {
  const w = player.weapon && WEAPONS[player.weapon.id];   // pickup weapon from a supply crate, or the rifle
  const dir = player.aimDir();
  const m = player.muzzleWorld;
  const col = w ? w.color : PALETTE[game.phase].accent;
  const n = w ? w.pellets : 1;
  let dx = dir.x, dz = dir.z;
  for (let i = 0; i < n; i++) {
    const spread = n > 1 ? (i / (n - 1) - 0.5) * w.cone + (Math.random() - 0.5) * 0.05 : (w ? 0 : (Math.random() - 0.5) * 0.06);
    const cs = Math.cos(spread), sn = Math.sin(spread);
    dx = dir.x * cs - dir.z * sn; dz = dir.x * sn + dir.z * cs;
    projectiles.spawn({
      x: m.x, z: m.z, y: m.y, dx, dz, speed: w ? w.speed : PLAYER.bulletSpeed, damage: w ? w.damage : PLAYER.damage,
      phase: game.phase, friendly: true, color: col, size: w?.size || 1, pierce: w?.pierce || 0,
    });
  }
  if (w && --player.weapon.ammo <= 0) {
    player.weapon = null;
    hud.toast(`${w.name} EMPTY // BACK TO THE RIFLE`, "#ffb347");
  }
  // keep the flash light well clear of the barrel: a light ~1cm from a surface overflows the render buffer
  muzzleLight.position.set(m.x + dx * 0.5, m.y + 0.25, m.z + dz * 0.5);
  muzzleLight.color.copy(col);
  muzzleLight.intensity = 4 * game.fx;
  particles.emit({ x: m.x, y: m.y, z: m.z, count: 3, speed: 4, up: 0.5, color: [col.r * 2, col.g * 2, col.b * 2], size: 0.25, life: 0.12, gravity: 0, dir: { x: dx, z: dz }, spread: 0.6 });
  game.trauma = Math.min(1, game.trauma + 0.012 * game.fx);
  game.recoil = 1;
  audio.shoot();
}

function killEnemy(e) {
  if (e.isBoss) { defeatBoss(e); return; }
  const c = e.color;
  const y = e.type === "drone" ? 1.7 : 1.1;
  particles.emit({ x: e.pos.x, y, z: e.pos.z, count: 60, speed: 9, up: 5, color: [c.r * 2.5, c.g * 2.5, c.b * 2.5], size: 0.45, life: 0.9, gravity: -12, drag: 1.5 });
  particles.emit({ x: e.pos.x, y, z: e.pos.z, count: 25, speed: 3, up: 2, color: [2.5, 2.2, 1.8], size: 0.8, life: 0.35, gravity: 0, drag: 4 });
  shockwaves.spawn(e.pos.x, e.pos.z, c, 4.5, 0.4);
  flashes.flash(e.pos.x, y + 0.5, e.pos.z, c, 14 * game.fx, 0.45, 12);
  game.trauma = Math.min(1, game.trauma + 0.14 * game.fx);
  game.hitstop = 0.05;
  audio.explode();
  e.remove();
  game.stats.kills++;
  game.stats.score += e.cfg.score;
  const roll = Math.random();
  if (roll < 0.45) spawnPickup(e.pos.x, e.pos.z, e.phase === BREACH ? "hp" : (Math.random() < 0.5 ? "hp" : "energy"));
}

// kind: hp, energy (enemy drops) or cell, gift, scatter, rail (supply crates). `keep` = never despawns.
function spawnPickup(x, z, kind, keep = false) {
  let mesh;
  const basic = c => new THREE.MeshBasicMaterial({ color: c });
  if (kind === "cell") {
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.5, 10), basic(new THREE.Color(0.35, 2.6, 1.5)));
    mesh.rotation.z = 0.4;
  } else if (kind === "gift") {
    // a little present: red box, gold ribbon
    mesh = new THREE.Group();
    const box = new THREE.BoxGeometry(1, 1, 1);
    const add = (c, w, h, d, y = 0) => { const p = new THREE.Mesh(box, basic(c)); p.scale.set(w, h, d); p.position.y = y; mesh.add(p); };
    add(new THREE.Color(1.9, 0.25, 0.35), 0.46, 0.4, 0.46);
    add(new THREE.Color(2.6, 1.9, 0.5), 0.5, 0.42, 0.1);
    add(new THREE.Color(2.6, 1.9, 0.5), 0.1, 0.42, 0.5);
    add(new THREE.Color(2.6, 1.9, 0.5), 0.22, 0.1, 0.22, 0.25);
  } else if (WEAPONS[kind]) {
    // a floating gun silhouette in the weapon's colour
    const c = WEAPONS[kind].color.clone().multiplyScalar(2.6);
    mesh = new THREE.Group();
    const add = (w, h, d, x, y) => { const p = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), basic(c)); p.position.set(x, y, 0); mesh.add(p); };
    add(0.62, 0.17, 0.2, 0, 0);
    add(0.4, 0.07, 0.08, 0.46, 0.03);
    add(0.12, 0.26, 0.14, -0.14, -0.17);
  } else {
    const color = kind === "hp" ? new THREE.Color(0.5, 3, 1.4) : new THREE.Color(2.2, 0.8, 3);
    mesh = new THREE.Mesh(pickupGeo, basic(color));
  }
  mesh.position.set(x, 0.6, z);
  scene.add(mesh);
  const v = keep ? 0 : 4;   // crate loot stays where it fell
  game.pickups.push({ mesh, kind, x, z, t: 0, keep, vx: (Math.random() - 0.5) * v, vz: (Math.random() - 0.5) * v });
}

function equipWeapon(id) {
  const w = WEAPONS[id];
  if (player.weapon?.id === id) player.weapon.ammo += w.ammo;
  else player.weapon = { id, ammo: w.ammo };
  hud.toast(`${w.name} // ${player.weapon.ammo} SHOTS`, w.css);
}

function killPlayer() {
  if (game.held) dropHeld();
  player.alive = false;
  player.hp = 0;
  game.state = "dying";
  game.dyingT = 1.6;
  game.timeScale = 0.35;
  player.model.root.visible = false;
  const c = PALETTE[game.phase].accent;
  particles.emit({ x: player.pos.x, y: 1.2, z: player.pos.z, count: 120, speed: 8, up: 6, color: [c.r * 2.5, c.g * 2.5, c.b * 2.5], size: 0.5, life: 1.4, gravity: -8 });
  shockwaves.spawn(player.pos.x, player.pos.z, c, 10, 0.8);
  audio.explode();
}

function updateProjectiles(dt) {
  for (const p of projectiles.list) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { projectiles.kill(p); continue; }
    const steps = Math.ceil((Math.hypot(p.vx, p.vz) * dt) / 0.3);
    let dead = false;
    for (let s = 0; s < steps && !dead; s++) {
      p.x += (p.vx * dt) / steps;
      p.z += (p.vz * dt) / steps;
      const [r, c] = world.toTile(p.x, p.z);
      if (world.solid(r, c, p.phase, "shot")) {
        const col = p.m.material.color;
        particles.emit({ x: p.x, y: p.y, z: p.z, count: 6, speed: 4, up: 2, color: [col.r * 0.5, col.g * 0.5, col.b * 0.5], size: 0.2, life: 0.25, gravity: -10, dir: { x: -p.vx, z: -p.vz }, spread: 2.2 });
        dead = true;
        break;
      }
      if (p.friendly) {
        for (const e of game.enemies) {
          if (!e.alive || e.phase !== p.phase || e.hijackT > 0 || e.held || e.untouchable || p.hits?.has(e)) continue;
          if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < e.radius + p.radius) {
            const crit = Math.random() < 0.12;
            const dmg = crit ? p.damage * 2 : p.damage;
            const ec = e.color;
            particles.emit({ x: p.x, y: p.y, z: p.z, count: 8, speed: 5, up: 2, color: [ec.r * 2, ec.g * 2, ec.b * 2], size: 0.25, life: 0.3, gravity: -10, dir: { x: p.vx, z: p.vz }, spread: 1.4 });
            hud.damageNumber(e.pos.x, e.isBoss ? 3.6 : 2.1, e.pos.z, crit ? `${dmg}!` : `${dmg}`, crit ? "#ffd166" : "#ffffff", camera, crit);
            audio.hit();
            // small knockback so hits feel solid (turrets are bolted down)
            if (!e.stationary && !e.heavy) {
              const pl = Math.hypot(p.vx, p.vz) || 1;
              world.move(e.pos, (p.vx / pl) * 0.22, (p.vz / pl) * 0.22, e.radius, e.phase, e.mode);
            }
            if (e.damage(dmg)) killEnemy(e);
            if (p.pierce > 0) { p.pierce--; p.hits.add(e); continue; }   // rail rounds punch through
            dead = true;
            break;
          }
        }
      } else if (p.phase === game.phase && player.alive && Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < player.radius + p.radius) {
        game.hurtPlayer(p.damage, p.x - p.vx, p.z - p.vz);
        dead = true;
      }
    }
    if (dead) { projectiles.kill(p); continue; }
    p.m.position.set(p.x, p.y, p.z);
  }
  game.enemies = game.enemies.filter(e => e.alive);
}

function updatePickups(dt) {
  for (let i = game.pickups.length - 1; i >= 0; i--) {
    const pk = game.pickups[i];
    pk.t += dt;
    pk.vx *= 1 - dt * 4; pk.vz *= 1 - dt * 4;
    const dx = player.pos.x - pk.x, dz = player.pos.z - pk.z, d = Math.hypot(dx, dz);
    if (d < 3.5 && pk.t > 0.4) { pk.vx += (dx / d) * 40 * dt; pk.vz += (dz / d) * 40 * dt; }
    pk.x += pk.vx * dt; pk.z += pk.vz * dt;
    pk.mesh.position.set(pk.x, 0.6 + Math.sin(pk.t * 4) * 0.15, pk.z);
    pk.mesh.rotation.y += dt * 3;
    if (d < 0.8 && pk.t > 0.3) {
      const top = maxHp(game.char);
      if (pk.kind === "hp") { player.hp = Math.min(top, player.hp + 12); hud.damageNumber(player.pos.x, 2.3, player.pos.z, "+12", "#7df5bc", camera); }
      else if (pk.kind === "energy") { player.energy = Math.min(100, player.energy + 35); hud.damageNumber(player.pos.x, 2.3, player.pos.z, "+PHASE", "#c58bff", camera); }
      else if (pk.kind === "cell") {
        if (game.cells < MAX_CELLS) { game.cells++; saveCells(game.cells); hud.toast(`REVIVE CELL ${game.cells}/${MAX_CELLS}`, "#7dffb0"); }
        else { game.stats.score += 100; hud.toast(`REVIVE CELLS FULL // +100`, "#7dffb0"); }
      } else if (pk.kind === "gift") {
        game.stats.score += 300;
        player.hp = Math.min(top, player.hp + 25);
        hud.damageNumber(player.pos.x, 2.3, player.pos.z, "+300", "#ffc04a", camera, true);
        hud.toast("GIFT // +300 SCORE, +25 HEALTH", "#ffc04a");
      } else if (WEAPONS[pk.kind]) equipWeapon(pk.kind);
      audio.pickup();
      scene.remove(pk.mesh);
      game.pickups.splice(i, 1);
    } else if (pk.t > 20 && !pk.keep) {
      scene.remove(pk.mesh);
      game.pickups.splice(i, 1);
    }
  }
}

let hackTickT = 0;
function updateTerminals(dt) {
  for (const t of world.terminals) {
    const d = Math.hypot(player.pos.x - t.x, player.pos.z - t.z);
    const near = d < 2.4 && player.alive && !t.hacked;
    if (!near) { hud.terminalLabel(t, camera, false); continue; }
    const want = t.phase === CITY ? "CITY" : "BREACH";
    if (game.phase !== t.phase) {
      hud.terminalLabel(t, camera, true, `<b class="${t.phase === CITY ? "c" : "r"}">${t.phase === CITY ? "TERMINAL" : "RIFT NODE"}</b><br>SHIFT TO ${want} TO HACK`, t.progress);
      continue;
    }
    t.progress = Math.min(1, t.progress + dt / 1.7);
    hackTickT -= dt;
    if (hackTickT <= 0) { audio.hackTick(); hackTickT = 0.09; }
    hud.terminalLabel(t, camera, true, `<b class="${t.phase === CITY ? "c" : "r"}">HACKING</b> ${Math.floor(t.progress * 100)}%`, t.progress);
    if (t.progress >= 1) completeTerminal(t);
  }
}

function completeTerminal(t) {
  t.hacked = true;
  world.markHacked(t);
  hud.terminalLabel(t, camera, false);
  audio.hackDone();
  game.stats.score += 250;
  const done = world.terminals.filter(x => x.hacked).length;
  const total = world.terminals.length;
  shockwaves.spawn(t.x, t.z, new THREE.Color(0.4, 1, 0.7), 8, 0.6);
  flashes.flash(t.x, 2, t.z, 0x7df5bc, 14 * game.fx, 0.6, 12);
  updateObjective();
  // checkpoint: where you stood (and which world) when the lock fell
  game.checkpoint = { x: player.pos.x, z: player.pos.z, phase: game.phase };
  // security gates (District 03+): each hacked lock powers down the next gate
  const opened = world.openGates(done);
  for (const gt of opened) {
    shockwaves.spawn(gt.x, gt.z, new THREE.Color(1, 0.55, 0.2), 6, 0.5);
    flashes.flash(gt.x, 2, gt.z, 0xff8a2a, 10 * game.fx, 0.5, 10);
  }
  if (opened.length) game.flowKey = "";   // wraiths can path through it now
  if (done === total && game.boss) {
    // boss stage: the locks only open the portal room; the portal waits for the Warden to fall
    audio.portalOpen();
    hud.toast("ALL LOCKS BREACHED // PORTAL ROOM OPEN // SOMETHING IS GUARDING IT", "#ff2e80");
  } else if (done === total) {
    world.openExit();
    audio.portalOpen();
    hud.toast("ALL LOCKS BREACHED // PORTAL ONLINE", "#55e6ff");
  } else if (opened.length) {
    audio.portalOpen();
    hud.toast(`LOCK ${done}/${total} BREACHED // SECURITY GATE ${opened.map(g => g.n).join(" + ")} OFFLINE`, "#ffb347");
  } else {
    hud.toast(`LOCK ${done}/${total} BREACHED // CHECKPOINT SAVED`, "#7df5bc");
  }
  // reinforcements warp in, in the terminal's phase
  const type = t.phase === CITY ? "drone" : "wraith";
  for (let i = 0; i < 2; i++) {
    const spot = world.randomOpenTileNear(player.pos.x, player.pos.z, 7, 12, t.phase, type === "drone" ? "fly" : "walk");
    if (!spot) continue;
    const e = spawnEnemy(type, spot.x, spot.z);
    e.alert = 5;
    shockwaves.spawn(spot.x, spot.z, e.color, 3, 0.5);
    particles.emit({ x: spot.x, y: 1.2, z: spot.z, count: 30, speed: 4, up: 4, color: [e.color.r * 2, e.color.g * 2, e.color.b * 2], size: 0.4, life: 0.6, gravity: -4 });
  }
}

// ---------- camera ----------
function updateCamera(dt, follow = true) {
  // debug/screenshot hook: window.__camOverride = { pos: [x,y,z], look: [x,y,z] }
  const ov = window.__camOverride;
  if (ov) { camera.position.set(...ov.pos); camera.lookAt(...ov.look); return; }
  if (follow) {
    const ax = THREE.MathUtils.clamp((player.aim.x - player.pos.x) * 0.22, -4.5, 4.5);
    const az = THREE.MathUtils.clamp((player.aim.z - player.pos.z) * 0.22, -3.5, 3.5);
    const k = 1 - Math.exp(-dt * 6);
    camTarget.x += (player.pos.x + ax - camTarget.x) * k;
    camTarget.z += (player.pos.z + az - camTarget.z) * k;
  }
  camera.position.copy(camTarget).add(CAM_OFFSET);
  const shake = game.trauma * game.trauma;
  if (shake > 0) {
    const t = performance.now() / 1000;
    camera.position.x += Math.sin(t * 61) * shake * 0.9;
    camera.position.y += Math.sin(t * 53 + 1) * shake * 0.6;
    camera.position.z += Math.sin(t * 47 + 2) * shake * 0.9;
  }
  camera.lookAt(camTarget.x, 0, camTarget.z);
}

function updateAim() {
  const m = input.mouse;
  _ndc.set((m.x / innerWidth) * 2 - 1, -(m.y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  if (raycaster.ray.intersectPlane(aimPlane, _hit)) player.aim.copy(_hit);
}

// ---------- main update ----------
function updatePlay(dt) {
  game.stats.time += dt;
  updateAim();
  // auto aim: always pick the nearest visible enemy (shown as a ring), but Jax keeps facing the
  // mouse; only while firing does he snap to the target so every shot lands
  game.aimTarget = game.autoAim && player.alive ? pickAimTarget() : null;
  const t = game.aimTarget;
  player.lock = t && input.mouse.left ? _lock.set(t.pos.x, 1.2, t.pos.z) : null;
  // crew: TAB cycles, 1-4 picks; SHIFT / right click = the current character's ability
  if (input.pressed("Tab")) {
    // next crew member who's still standing (if everyone else is down, the swap is refused with a reason)
    const n = game.crew.length, i0 = game.crew.indexOf(game.char);
    let pick = null;
    for (let k = 1; k < n && !pick; k++) { const id = game.crew[(i0 + k) % n]; if (!vit(id).down) pick = id; }
    swapTo(pick || game.crew[(i0 + 1) % n]);
  }
  for (let k = 0; k < 4; k++) if (input.pressed(`Digit${k + 1}`) && game.crew[k]) swapTo(game.crew[k]);
  if (input.shiftPressed()) {
    if (game.char === "rook") tryUplink();
    else if (game.char === "crane") tryGrab();
    else tryShift();
  }
  game.shiftCd = Math.max(0, game.shiftCd - dt);
  game.abilityFrac = game.char === "rook"
    ? (game.uplink ? Math.min(1, game.uplink.t / game.uplink.dur) : 1 - game.uplinkCd / HACK.cooldown)
    : game.char === "crane" ? (game.held ? 1 : 1 - game.grabCd / GRAB.cooldown)
    : 1 - game.shiftCd / game.shiftCdMax;

  player.relativeMove = game.moveMode === "facing";
  const { dashed } = player.update(dt, input, world, game.phase);
  // coolant vents (District 04+): a blast under you in the CITY hurts once per burst; dashing is safe
  game.ventHitT = Math.max(0, (game.ventHitT || 0) - dt);
  if (game.phase === CITY && player.alive && player.dashT <= 0 && game.ventHitT <= 0 && world.ventHitAt(player.pos.x, player.pos.z)) {
    game.ventHitT = 0.9;
    game.hurtPlayer(VENT_DAMAGE, player.pos.x, player.pos.z);
  }
  if (world.ventBursts && game.phase === CITY && (game.ventSfxT = (game.ventSfxT || 0) - dt) <= 0) {
    audio.burst(5200, 0.6, 0.5, 0.05, "highpass");
    game.ventSfxT = 0.35;
  }
  if (dashed) {
    audio.dash();
    if (game.fx) player.spawnAfterimage(PALETTE[game.phase].accent);
    const c = PALETTE[game.phase].accent;
    particles.emit({ x: player.pos.x, y: 0.9, z: player.pos.z, count: 18, speed: 3, up: 1, color: [c.r * 2, c.g * 2, c.b * 2], size: 0.5, life: 0.35, gravity: 0 });
  }
  if (player.dashT > 0) {
    const c = PALETTE[game.phase].accent;
    particles.emit({ x: player.pos.x, y: 1.1, z: player.pos.z, count: 2, speed: 0.5, up: 0.2, color: [c.r * 1.5, c.g * 1.5, c.b * 1.5], size: 0.7, life: 0.25, gravity: 0 });
  }

  // phase energy
  if (game.phase === BREACH) {
    player.energy = Math.max(0, player.energy - PLAYER.breachDrain * dt);
    if (player.energy < 25 && !game.lowEnergyWarned) { hud.toast("PHASE ENERGY LOW // SHIFT BACK SOON", "#ffb347"); game.lowEnergyWarned = true; }
    if (player.energy <= 0) {
      if (!world.overlaps(player.pos.x, player.pos.z, player.radius, CITY, "walk")) {
        doShift(CITY);
        hud.toast("PHASE COLLAPSE // FORCED BACK TO CITY", "#ff5566");
      } else {
        player.hp -= 10 * dt;
        if (player.hp <= 0) playerDown();
      }
    }
  } else {
    player.energy = Math.min(100, player.energy + PLAYER.energyRegen * dt);
    if (player.energy > 40) game.lowEnergyWarned = false;
  }

  // health slowly regenerates after 4s without taking damage
  const hpTop = maxHp(game.char);
  if (player.alive && player.hp < hpTop && game.stats.time - game.lastHurt > 4) {
    player.hp = Math.min(hpTop, player.hp + 6 * dt);
  }

  // crew vitals: the active character's numbers live on the player; benched ones recover slowly
  for (const id of game.crew) {
    const v = vit(id);
    if (id === game.char) { if (!v.down) { v.hp = player.hp; v.energy = player.energy; v.weapon = player.weapon; } continue; }
    if (v.down) continue;
    v.hp = Math.min(maxHp(id), v.hp + BENCH_HEAL * dt);
    v.energy = Math.min(100, v.energy + PLAYER.energyRegen * dt);
  }

  updateHints(dt);

  // shooting (while Crane carries something, a click throws it instead)
  player.fireCd = Math.max(0, player.fireCd - dt);
  if (game.held) { if (input.mouse.leftPressed && game.held.t >= GRAB.liftTime) throwHeld(); }
  else if (input.mouse.left && player.fireCd <= 0 && player.alive) {
    const w = player.weapon && WEAPONS[player.weapon.id];
    player.fireCd = 1 / (w ? w.rate : PLAYER.fireRate);
    firePlayer();
  }

  // breach pathing
  if (game.phase === BREACH) {
    const [r, c] = world.toTile(player.pos.x, player.pos.z);
    const key = `${r},${c}`;
    game.flowT -= dt;
    if (key !== game.flowKey && game.flowT <= 0) {
      game.flow = world.flowField(BREACH, r, c);
      game.flowKey = key;
      game.flowT = 0.2;
    }
  }

  updateBoss(dt);
  for (const e of game.enemies) if (!e.held) e.update(dt, game);   // held / thrown ones are Crane's
  separate(game.enemies);
  updateCarry(dt);
  updateProjectiles(dt);
  updatePickups(dt);
  updateTerminals(dt);
  updateCrew(dt);

  if (world.exit?.open && Math.hypot(player.pos.x - world.exit.x, player.pos.z - world.exit.z) < 1.5) winLevel();
}

function updateShared(dt, realDt) {
  const target = game.phase;
  const step = realDt / 0.28;
  game.blend = target === BREACH ? Math.min(1, game.blend + step) : Math.max(0, game.blend - step);
  const b = game.blend;

  scene.fog.color.copy(PALETTE[CITY].fog).lerp(PALETTE[BREACH].fog, b);
  scene.fog.density = 0.010 + b * 0.003;
  bloom.strength = 0.8 + b * 0.15 + game.caFx * 0.15;

  world.update(dt, b, camTarget.x, camTarget.z);
  weather.update(dt, camTarget.x, camTarget.z, b);
  particles.update(dt);
  shockwaves.update(dt);
  flashes.update(dt);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - realDt * 200);

  game.trauma = Math.max(0, game.trauma - realDt * 1.7);
  game.recoil = Math.max(0, game.recoil - realDt * 10);
  game.damageFx = Math.max(0, game.damageFx - realDt * 2.2);
  game.caFx = Math.max(0, game.caFx - realDt * 2.5);
  game.glitchFx = Math.max(0, game.glitchFx - realDt * 3);

  const u = finalPass.uniforms;
  u.uTime.value += realDt;
  u.uBreach.value = b;
  u.uCA.value = game.caFx + game.damageFx * 0.5 + b * 0.15;
  u.uDamage.value = game.damageFx + (player.alive && player.hp < 30 ? 0.22 + Math.sin(u.uTime.value * 1.5) * 0.06 : 0);
  u.uGlitch.value = game.glitchFx;
}

// ---------- districts & progress ----------
function loadProgress() { try { return Math.min(LEVELS.length - 1, parseInt(localStorage.getItem("pb-progress") || "0", 10) || 0); } catch (e) { return 0; } }
function saveProgress(i) { try { if (i > loadProgress()) localStorage.setItem("pb-progress", String(i)); } catch (e) {} }

// per-district records: { d01: { time, score, kills }, ... }; a district with a record counts as cleared
function loadRecords() { try { return JSON.parse(localStorage.getItem("pb-records") || "{}") || {}; } catch (e) { return {}; } }
function saveRecord(id, stats) {
  const all = loadRecords();
  const prev = all[id];
  all[id] = {
    time: prev ? Math.min(prev.time, stats.time) : stats.time,
    score: prev ? Math.max(prev.score, stats.score) : stats.score,
    kills: prev ? Math.max(prev.kills, stats.kills) : stats.kills,
  };
  try { localStorage.setItem("pb-records", JSON.stringify(all)); } catch (e) {}
  return { newBestTime: !prev || stats.time < prev.time, newBestScore: !prev || stats.score > prev.score };
}
function hasSelectableDistricts() { return loadProgress() > 0 || Object.keys(loadRecords()).length > 0; }

// District select: every unlocked district, replayable, with its best time and score.
function screenSelect() {
  game.state = "title";
  hud.show(false);
  const records = loadRecords(), unlocked = loadProgress();
  const rows = LEVELS.map((lv, i) => {
    const [num, title] = lv.name.split(" // ");
    const rec = records[lv.id];
    const open = i <= unlocked;
    return `<button class="district ${open ? "" : "locked"}" ${open ? `data-action="pick" data-index="${i}"` : "disabled"}>
        <span class="d-thumb"><img src="assets/thumbs/${lv.id}.jpg" alt="" onerror="this.remove()">${open ? "" : '<i class="d-lock">LOCKED</i>'}</span>
        <span class="d-info">
          <span class="d-num">${num}${rec ? ' <i class="d-check">✓ CLEARED</i>' : ""}</span>
          <span class="d-title">${open ? title : "???"}</span>
          <span class="d-best">${rec ? `BEST ${fmtTime(rec.time)} · ${rec.score} PTS` : open ? "NOT CLEARED YET" : "Clear the previous district"}</span>
        </span>
      </button>`;
  }).join("");
  showOverlay(`
    <div class="panel select-panel">
      <p class="eyebrow">REPLAY ANY CLEARED STAGE</p>
      <h2>SELECT DISTRICT</h2>
      <div class="district-list">${rows}</div>
      <button class="btn ghost" data-action="menu">BACK</button>
    </div>`, "dim");
}

// Swap the whole district: old world out (GPU memory freed), new world in.
function loadDistrict(i) {
  if (i === levelIndex) return;
  for (const e of game.enemies) if (e.alive) e.remove();
  game.enemies = [];
  hud.clearLabels();
  world.dispose();
  levelIndex = i;
  level = LEVELS[i];
  world = new World(scene, renderer, level);
  game.world = world;
  if (window.__gfx) window.__gfx.world = world;
  hud.buildMinimap(world);
  hud.setDistrict(level.name);
  resetLevel();
}

// ---------- screens ----------
const overlay = document.getElementById("overlay");
let storyIndex = 0;
let storyCards = STORY;
let storyDone = () => screenBriefing();
let typeTimer = null;

function playStory(cards, done) {
  storyCards = cards;
  storyDone = done;
  screenStory(0);
}
function storyNext() {
  if (storyIndex < storyCards.length - 1) screenStory(storyIndex + 1);
  else { clearInterval(typeTimer); storyDone(); }
}
function newGame() { loadDistrict(0); playStory(STORY, screenBriefing); }
function continueGame() { loadDistrict(loadProgress()); screenBriefing(); }
function nextDistrict() {
  const next = levelIndex + 1;
  playStory(level.storyAfter || [], () => {
    if (next < LEVELS.length) { loadDistrict(next); screenBriefing(); }
    else screenTitle();
  });
}

function showOverlay(html, cls = "") {
  closePreview();   // the crew screen's 3D preview has its own WebGL context: free it with its canvas
  overlay.className = `overlay ${cls}`;
  overlay.innerHTML = html;
  overlay.classList.remove("hidden");
}
function hideOverlay() { closePreview(); overlay.classList.add("hidden"); overlay.innerHTML = ""; }

function screenTitle() {
  game.state = "title";
  hud.show(false);
  showOverlay(`
    <div class="title-wrap">
      <p class="eyebrow">GAME OFF 2026 // SHIFT</p>
      <h1 class="logo" data-text="PORTAL BREAK">PORTAL BREAK</h1>
      <p class="tagline">Two worlds. One city. Every wall is a door somewhere.</p>
      ${loadProgress() > 0
        ? `<button class="btn" data-action="continue">CONTINUE // ${LEVELS[loadProgress()].name.split(" // ")[0]}</button>
           <button class="btn ghost" data-action="start">NEW GAME</button>`
        : `<button class="btn" data-action="start">START</button>`}
      ${hasSelectableDistricts() ? `<button class="btn ghost" data-action="select">SELECT DISTRICT</button>` : ""}
      <button class="btn ghost" data-action="crew">CREW</button>
      <div class="controls">
        <span><kbd>WASD</kbd> move (W = toward the mouse)</span>
        <span><kbd>MOUSE</kbd> aim / fire</span>
        <span><kbd>SHIFT</kbd> or <kbd>RMB</kbd> phase shift</span>
        <span><kbd>SPACE</kbd> dash</span>
        <span><kbd>TAB</kbd> swap crew</span>
        <span><kbd>ESC</kbd> pause</span>
        <span><kbd>M</kbd> mute</span>
        <span><kbd>F9</kbd> record clip</span>
        <span>Auto aim is <b>${game.autoAim ? "ON" : "OFF"}</b> // change it in <kbd>ESC</kbd> settings</span>
      </div>
    </div>`, "title");
}

function screenStory(i) {
  game.state = "story";
  storyIndex = i;
  const s = storyCards[i];
  if (!s) { storyDone(); return; }
  showOverlay(`
    <div class="story">
      <p class="speaker">${s.speaker}</p>
      <p class="story-text" id="story-text"></p>
      <div class="story-nav">
        <button class="btn ghost" data-action="skip">SKIP</button>
        <button class="btn" data-action="next">${i < storyCards.length - 1 ? "NEXT" : "CONTINUE"}</button>
      </div>
      <p class="hint">${i + 1} / ${storyCards.length}</p>
    </div>`, "story-screen");
  const el = document.getElementById("story-text");
  let n = 0;
  clearInterval(typeTimer);
  typeTimer = setInterval(() => {
    n += 2;
    el.textContent = s.text.slice(0, n);
    if (n % 6 === 0) audio.hackTick();
    if (n >= s.text.length) clearInterval(typeTimer);
  }, 22);
}

function screenBriefing() {
  game.state = "briefing";
  clearInterval(typeTimer);
  showOverlay(`
    <div class="briefing">
      <p class="eyebrow">ENTERING</p>
      <h2>${level.name}</h2>
      ${level.briefing.map(l => `<p>${l}</p>`).join("")}
      <div class="legend">
        <span><i class="sw city"></i> CITY: drones, turrets, terminals</span>
        <span><i class="sw breach"></i> BREACH: wraiths, rift nodes, bridges. Drains phase energy.</span>
        ${level.legendExtra ? `<span>${level.legendExtra}</span>` : ""}
      </div>
      <button class="btn" data-action="play">${loadCrew().length > 1 ? "CHOOSE SQUAD" : "ENTER DISTRICT"}</button>
    </div>`, "briefing-screen");
}

// From the briefing: with more than one crew member awake, pick the squad first.
function enterDistrict() {
  if (loadCrew().length > 1) screenCrew("deploy");
  else startPlay();
}

// ---------- crew select: squad (max 3), short bios, skins ----------
// "deploy": opened from the briefing, ends with DEPLOY. "view": opened from the title screen to
// read the bios and change skins (no squad controls).
const crewUI = { mode: "deploy", focus: "jax", squad: [] };
const HP_TOP = Math.max(...Object.values(CREW).map(c => c.hp || 100));
const cssOf = col => `#${col.getHexString()}`;

function screenCrew(mode = "deploy") {
  game.state = "crew";
  clearInterval(typeTimer);
  hud.show(false);
  crewUI.mode = mode;
  crewUI.squad = squadFor(level);
  crewUI.focus = crewUI.squad[0] || "jax";
  const deploy = mode === "deploy";
  showOverlay(`
    <div class="crew-screen">
      <header>
        <p class="eyebrow">${deploy ? `${level.name.split(" // ")[0]} // CREW SELECT` : "HYPERSLEEP CHAMBER // CREW ROSTER"}</p>
        <h2>${deploy ? "CHOOSE YOUR SQUAD" : "THE CREW"}</h2>
        <p class="crew-sub">${deploy
          ? `Bring up to ${MAX_SQUAD}. The lead goes in first, <kbd>TAB</kbd> or <kbd>1</kbd>-<kbd>${MAX_SQUAD}</kbd> swaps during the district.`
          : "Who's who, and the skins you've unlocked. You pick your squad when you enter a district."}</p>
      </header>
      <div class="crew-body">
        <div class="crew-roster" id="crew-roster"></div>
        <div class="crew-detail" id="crew-detail">
          <div class="cd-view"><div class="cd-floor"></div><canvas id="crew-canvas"></canvas><div class="cd-locked hidden" id="crew-locked">CRYO-SEALED</div></div>
          <div class="cd-info" id="crew-info"></div>
        </div>
      </div>
      <div class="crew-foot">
        <div class="squad-slots" id="crew-slots"></div>
        <button class="btn ghost" data-action="crewback">BACK</button>
        ${deploy ? `<button class="btn" data-action="deploy">DEPLOY</button>` : ""}
      </div>
    </div>`, "crew-overlay");
  openPreview(document.getElementById("crew-canvas"));
  refreshCrew();
}

function refreshCrew() {
  const roster = document.getElementById("crew-roster");
  if (!roster) return;
  const unlocked = loadCrew(), req = requiredCrew(level), deploy = crewUI.mode === "deploy", sq = crewUI.squad;

  roster.innerHTML = CREW_ORDER.map(id => {
    const c = CREW[id], open = unlocked.includes(id);
    const badges = [];
    if (open && deploy && sq[0] === id) badges.push(`<i class="cc-badge req">LEAD</i>`);
    if (open && deploy && sq.includes(id)) badges.push(`<i class="cc-badge">IN SQUAD</i>`);
    if (open && deploy && req.includes(id)) badges.push(`<i class="cc-badge req">${id === level.needs ? "NEEDED HERE" : "ALWAYS COMES"}</i>`);
    if (!open) badges.push(`<i class="cc-badge off">${c.future ? "SEALED" : `ASLEEP // POD ${c.pod}`}</i>`);
    return `<button class="crew-card ${open ? "" : "locked"} ${crewUI.focus === id ? "focus" : ""}" style="--cc:${open ? c.css : "#556070"}" data-action="crewfocus" data-id="${id}">
        <span class="cc-name">${c.future ? "???" : c.short}</span>
        <span class="cc-role">${c.role || c.tag}</span>
        <span class="cc-badges">${badges.join("")}</span>
      </button>`;
  }).join("");

  const id = crewUI.focus, c = CREW[id], open = unlocked.includes(id);
  document.getElementById("crew-detail").style.setProperty("--cc", open ? c.css : "#8090a8");
  const skin = skinOf(id);
  const glow = skin?.glow || c.tint || PALETTE[CITY].accent;
  let info;
  if (c.future) {
    info = `<p class="cd-role">${c.tag}</p><h3>???</h3><p class="cd-bio">${c.bio}</p>`;
  } else {
    const hp = maxHp(id), spd = PLAYER.speed * (c.speed || 1);
    const skins = skinsOf(id).map(s => {
      const ok = skinUnlocked(s), on = skin?.id === s.id;
      return `<button class="skin ${on ? "on" : ""} ${ok ? "" : "locked"}" style="--sk:${cssOf(s.glow || c.tint || PALETTE[CITY].accent)}" ${ok ? `data-action="skin" data-id="${id}" data-skin="${s.id}"` : "disabled"}>
          <i></i><span>${s.name}${ok ? "" : `<small>${unlockText(s)}</small>`}</span>
        </button>`;
    }).join("");
    const inSq = sq.includes(id);
    let actions = "";
    if (deploy && open) {
      if (!inSq && sq.length < MAX_SQUAD) actions += `<button class="btn" data-action="squadtoggle" data-id="${id}">ADD TO SQUAD</button>`;
      if (inSq && !req.includes(id)) actions += `<button class="btn ghost" data-action="squadtoggle" data-id="${id}">LEAVE BEHIND</button>`;
      if (inSq && sq[0] !== id && !level.needs) actions += `<button class="btn ghost" data-action="squadlead" data-id="${id}">MAKE LEAD</button>`;
    }
    const note = !deploy || !open ? ""
      : !inSq && sq.length >= MAX_SQUAD ? `SQUAD FULL // LEAVE SOMEONE BEHIND FIRST`
      : req.includes(id) ? (id === level.needs ? "THIS DISTRICT CAN'T BE FINISHED WITHOUT THEM" : "EVERY DISTRICT NEEDS THE PHASE SHIFT") : "";
    info = `
      <p class="cd-role">${c.role || c.tag}</p>
      <h3>${c.name}</h3>
      <p class="cd-bio">${c.bio || ""}</p>
      <div class="cd-ability"><b><kbd>SHIFT</kbd> ${c.ability}</b><p>${c.abilityText || ""}</p></div>
      <div class="cd-stats">
        <span>HEALTH</span><span class="st"><i style="width:${Math.round((hp / HP_TOP) * 100)}%"></i></span><em>${hp}</em>
        <span>SPEED</span><span class="st"><i style="width:${Math.round((spd / PLAYER.speed) * 100)}%"></i></span><em>${spd.toFixed(1)}</em>
      </div>
      ${open
        ? `<div class="cd-skins-label">SKINS</div><div class="cd-skins">${skins}</div>`
        : `<p class="crew-note">ASLEEP IN POD ${c.pod} // FIND THE ID CARD AND TAKE IT TO A CREW TERMINAL</p>`}
      ${note ? `<p class="crew-note">${note}</p>` : ""}
      ${actions ? `<div class="cd-actions">${actions}</div>` : ""}`;
  }
  document.getElementById("crew-info").innerHTML = info;
  document.getElementById("crew-locked").classList.toggle("hidden", open);
  if (open) setPreview(id, glow, skin?.body || null, c.bulk || 1, modelOf(id));
  else clearPreview();

  document.getElementById("crew-slots").innerHTML = !deploy ? "" : Array.from({ length: MAX_SQUAD }, (_, i) => {
    const s = sq[i] && CREW[sq[i]];
    return s
      ? `<div class="slot full" style="--cc:${s.css}"><kbd>${i + 1}</kbd>${s.short}${i === 0 ? '<span class="lead">LEAD</span>' : ""}</div>`
      : `<div class="slot"><kbd>${i + 1}</kbd>EMPTY</div>`;
  }).join("");
}

function changeSquad(list) {
  crewUI.squad = fitSquad(list, level);
  saveSquad(crewUI.squad);
  refreshCrew();
}
function crewToggle(id) {
  const sq = crewUI.squad;
  if (sq.includes(id)) { if (!requiredCrew(level).includes(id)) changeSquad(sq.filter(x => x !== id)); }
  else if (sq.length < MAX_SQUAD) changeSquad([...sq, id]);
  else audio.denied();
}
function deployCrew() { saveSquad(crewUI.squad); startPlay(); }
function crewBack() { if (crewUI.mode === "deploy") screenBriefing(); else screenTitle(); }

function startPlay() {
  resetLevel();
  hideOverlay();
  hud.show(true);
  game.state = "play";
  const need = level.needs && CREW[level.needs];
  if (need) hud.toast(`${need.name} SELECTED // ${need.ability} // TAB TO SWAP`, need.css || "#55e6ff");
  else hud.toast(`SECURE THE ${world.terminals.length} LOCKS // SHIFT TO CHANGE WORLDS`, "#55e6ff");
}

function screenPause() {
  game.state = "paused";
  showOverlay(`
    <div class="panel">
      <h2>PAUSED</h2>
      <button class="btn" data-action="resume">RESUME</button>
      <button class="btn ghost" data-action="restart">RESTART DISTRICT</button>
      <button class="btn ghost" data-action="menu">MAIN MENU</button>
      <button class="btn ghost" data-action="mute">${audio.muted ? "UNMUTE" : "MUTE"}</button>
      <button class="btn ghost" data-action="quality">GRAPHICS: ${quality.toUpperCase()}</button>
      <button class="btn ghost" data-action="autoaim">AUTO AIM: ${game.autoAim ? "ON" : "OFF"}</button>
      <button class="btn ghost" data-action="movemode">MOVEMENT: ${game.moveMode === "facing" ? "TOWARD MOUSE" : "SCREEN"}</button>
      <button class="btn ghost" data-action="fx">SCREEN EFFECTS: ${game.fx ? "CALM" : "OFF"}</button>
    </div>`, "dim");
}

function screenDead() {
  game.state = "dead";
  hud.show(false);
  showOverlay(`
    <div class="panel">
      <p class="eyebrow red">SIGNAL LOST${game.crew.length > 1 ? " // WHOLE CREW DOWN" : ""}</p>
      <h2>YOU WERE TERMINATED. AGAIN.</h2>
      <p class="stat-line">${statLine()}</p>
      ${game.checkpoint
        ? `<button class="btn" data-action="respawn">RESPAWN AT CHECKPOINT</button>
           <button class="btn ghost" data-action="restart">RESTART DISTRICT</button>`
        : `<button class="btn" data-action="restart">RE-INITIALIZE</button>`}
      <p class="hint">${game.checkpoint ? `Your hacked locks are kept${game.crew.length > 1 ? " and the whole crew is back up" : ""}. <kbd>ENTER</kbd> respawn · <kbd>R</kbd> restart` : "<kbd>ENTER</kbd> or <kbd>R</kbd> to restart"}</p>
    </div>`, "dim red");
}

function winLevel() {
  game.state = "won";
  hud.show(false);
  audio.portalOpen();
  hud.screenFlash("rgba(120,240,255,0.8)", 0.35 * game.fx);
  const s = game.stats;
  const timeBonus = Math.max(0, Math.round(3000 - s.time * 15));
  s.score += timeBonus;
  const hasNext = levelIndex + 1 < LEVELS.length;
  if (hasNext) saveProgress(levelIndex + 1);
  const skinsBefore = unlockedSkins();
  const best = saveRecord(level.id, s);
  const fresh = newlyUnlocked(skinsBefore);   // clearing a district can unlock a skin
  const tag = on => (on ? ' <i class="new-best">NEW BEST</i>' : "");
  showOverlay(`
    <div class="panel">
      <p class="eyebrow">${level.name.split(" // ")[0]} CLEARED</p>
      <h2>THE PORTAL TAKES YOU DEEPER.</h2>
      <div class="stats">
        <div><b>${fmtTime(s.time)}</b><span>TIME${tag(best.newBestTime)}</span></div>
        <div><b>${s.kills}</b><span>KILLS</span></div>
        <div><b>${s.shifts}</b><span>SHIFTS</span></div>
        <div><b>${s.score}</b><span>SCORE${tag(best.newBestScore)}</span></div>
      </div>
      ${fresh.length ? `<p class="new-skins">NEW SKIN${fresh.length > 1 ? "S" : ""} ${fresh.map(u => `<b style="color:${u.crew.css}">${u.crew.short} // ${u.skin.name}</b>`).join(" · ")}<span>Change skins on the crew screen</span></p>` : ""}
      <button class="btn" data-action="nextDistrict">${hasNext ? "NEXT DISTRICT" : "CONTINUE"}</button>
      <button class="btn ghost" data-action="restart">REPLAY DISTRICT</button>
      <button class="btn ghost" data-action="menu">MAIN MENU</button>
      <p class="hint">${hasNext ? "Progress saved. Replay any cleared district from the main menu." : "More districts are coming in the next build."}</p>
    </div>`, "dim");
}

function statLine() {
  const s = game.stats;
  return `${fmtTime(s.time)} · ${s.kills} kills · ${s.shifts} shifts · ${world.terminals.filter(t => t.hacked).length}/${world.terminals.length} locks`;
}
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, "0")}`; }

overlay.addEventListener("click", e => {
  const el = e.target.closest("[data-action]");
  const a = el?.dataset.action;
  if (!a) return;
  audio.init();
  if (a === "crew") { screenCrew("view"); return; }
  if (a === "crewfocus") { crewUI.focus = el.dataset.id; refreshCrew(); return; }
  if (a === "squadtoggle") { crewToggle(el.dataset.id); return; }
  if (a === "squadlead") { changeSquad([el.dataset.id, ...crewUI.squad.filter(x => x !== el.dataset.id)]); return; }
  if (a === "skin") { setSkin(el.dataset.id, el.dataset.skin); refreshCrew(); return; }
  if (a === "deploy") { deployCrew(); return; }
  if (a === "crewback") { crewBack(); return; }
  if (a === "start") newGame();
  else if (a === "continue") continueGame();
  else if (a === "nextDistrict") nextDistrict();
  else if (a === "select") screenSelect();
  else if (a === "menu") screenTitle();
  else if (a === "pick") { const i = +e.target.closest("[data-index]").dataset.index; loadDistrict(i); screenBriefing(); }
  else if (a === "next") storyNext();
  else if (a === "skip") { clearInterval(typeTimer); storyDone(); }
  else if (a === "play") enterDistrict();
  else if (a === "resume") { hideOverlay(); game.state = "play"; }
  else if (a === "restart") startPlay();
  else if (a === "respawn") respawnAtCheckpoint();
  else if (a === "mute") { audio.toggleMute(); screenPause(); }
  else if (a === "quality") { applyQuality(quality === "high" ? "low" : "high"); perf.checked = true; screenPause(); }
  else if (a === "fx") { setFx(game.fx ? 0 : 1); screenPause(); }
  else if (a === "autoaim") { setAutoAim(!game.autoAim); screenPause(); }
  else if (a === "movemode") { setMoveMode(game.moveMode === "facing" ? "screen" : "facing"); screenPause(); }
});

// ---------- clip recorder (F9): canvas + game audio, no HUD ----------
let recorder = null;
const recBadge = document.getElementById("rec");
function toggleRecord() {
  if (recorder) { recorder.stop(); return; }
  if (!window.MediaRecorder) { hud.toast("RECORDING NOT SUPPORTED IN THIS BROWSER", "#ff5566"); return; }
  const stream = renderer.domElement.captureStream(60);
  const dest = audio.streamDest();
  if (dest) dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find(m => MediaRecorder.isTypeSupported(m));
  const chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16_000_000 });
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `portal-break-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    recorder = null;
    recBadge.classList.add("hidden");
  };
  recorder.start(250);
  recBadge.classList.remove("hidden");
}

// ---------- global keys ----------
addEventListener("keydown", e => {
  audio.init();
  if (e.code === "F9") { e.preventDefault(); toggleRecord(); }
  if (e.code === "KeyM") audio.toggleMute();
  if (e.code === "Escape") {
    if (game.state === "play") screenPause();
    else if (game.state === "paused") { hideOverlay(); game.state = "play"; }
    else if (game.state === "crew") crewBack();
  }
  if (e.code === "Enter" || e.code === "Space") {
    if (game.state === "title") { if (loadProgress() > 0) continueGame(); else newGame(); }
    else if (game.state === "story") storyNext();
    else if (game.state === "briefing") enterDistrict();
    else if (game.state === "crew" && e.code === "Enter" && crewUI.mode === "deploy") { e.preventDefault(); deployCrew(); }
    else if (game.state === "dead" && e.code === "Enter") respawnAtCheckpoint();
  }
  if (e.code === "KeyR" && (game.state === "play" || game.state === "dead")) startPlay();
});
renderer.domElement.addEventListener("mousedown", () => audio.init());
document.addEventListener("visibilitychange", () => { if (document.hidden && game.state === "play") screenPause(); });

// Resize everything when the window changes. Also checked every frame, because a tab that
// starts hidden can report 0x0 and leave the bloom buffers zero-sized (black screen).
let appliedSize = "";
function resizeIfNeeded() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  const key = `${w}x${h}`;
  if (key === appliedSize || innerWidth === 0 || innerHeight === 0) return;
  appliedSize = key;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  sizeFXAA();
  particles.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.9;
}
addEventListener("resize", resizeIfNeeded);
resizeIfNeeded();

// ---------- loop ----------
if (quality === "low") applyQuality("low");
resetLevel();
screenTitle();
let last = performance.now();
let titleT = 0;

function frame(now) {
  requestAnimationFrame(frame);
  resizeIfNeeded();
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game.hitstop > 0) { game.hitstop -= realDt; }
  const dt = (game.hitstop > 0 ? 0.05 : 1) * game.timeScale * realDt;

  if (game.state === "play") {
    watchPerformance(realDt);
    updatePlay(dt);
    updateCamera(realDt);
  } else if (game.state === "dying") {
    for (const e of game.enemies) e.update(dt, game);
    updateProjectiles(dt);
    game.dyingT -= realDt;
    updateCamera(realDt);
    if (game.dyingT <= 0) { game.timeScale = 1; screenDead(); }
  } else if (["title", "story", "briefing", "crew"].includes(game.state)) {
    // slow drift over the start plaza behind the menus
    titleT += realDt;
    const s = world.spawns.player;
    camTarget.set(s.x + 6 + Math.sin(titleT * 0.15) * 8, 0, s.z - 6 + Math.cos(titleT * 0.11) * 4);
    player.update(0.0001, input, world, game.phase);
    updateCamera(realDt, false);
  } else {
    updateCamera(realDt);
  }

  updateShared(dt, realDt);
  if (game.state === "play" || game.state === "dying") hud.update(realDt, game);
  composer.render();
  input.endFrame();
}
requestAnimationFrame(frame);

// ---------- dev tool: district thumbnails for District Select ----------
// Run __makeThumbs() in the browser console while serve.py is running; it writes
// assets/thumbs/<district id>.jpg for every district. Not used by the shipped game.
window.__makeThumbs = async () => {
  const keep = levelIndex, saved = [];
  for (let i = 0; i < LEVELS.length; i++) {
    loadDistrict(i);
    game.state = "paused";
    game.phase = CITY; game.blend = 0;
    const s = world.spawns.player;
    const tf = LEVELS[i].thumbFocus;   // optional [row, col] to frame instead of the spawn
    const fx = tf ? tf[1] * 2 + 1 : Math.min(world.width - 14, s.x + 9), fz = tf ? tf[0] * 2 + 1 : Math.max(14, s.z - 8);
    camTarget.set(fx, 0, fz);
    player.pos.set(s.x + 2, 0, s.z - 1);
    player.update(0.0001, input, world, CITY);
    window.__camOverride = { pos: [fx - 3, 19, fz + 15], look: [fx, 0, fz - 1] };
    for (let k = 0; k < 40; k++) updateShared(0.03, 0.03);   // settle weather, lamps, fog
    updateCamera(0);
    composer.render();
    const src = renderer.domElement, out = document.createElement("canvas");
    out.width = 640; out.height = 360;
    const scale = Math.max(640 / src.width, 360 / src.height);
    const w = src.width * scale, h = src.height * scale;
    out.getContext("2d").drawImage(src, (640 - w) / 2, (360 - h) / 2, w, h);
    const blob = await new Promise(r => out.toBlob(r, "image/jpeg", 0.86));
    const res = await fetch(`/__dev/thumb?name=${LEVELS[i].id}`, { method: "POST", body: blob });
    saved.push(`${LEVELS[i].id}: ${res.status} (${Math.round(blob.size / 1024)} KB)`);
  }
  delete window.__camOverride;
  loadDistrict(keep);
  screenTitle();
  return saved;
};

// expose for debugging in devtools
window.__game = game;
window.__gfx = { renderer, composer, bloom, world, rt, step: dt => { updatePlay(dt); updateShared(dt, dt); hud.update(dt, game); }, screenDead, loadDistrict: i => loadDistrict(i), winLevel: () => winLevel() };
// renders one frame on demand and reports average brightness (works even when the tab is in the background)
window.__probe = () => {
  updateShared(0.016, 0.016);
  if (game.state === "play") updateCamera(0.016);
  composer.render();
  const gl = renderer.getContext();
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0, lit = 0;
  for (let i = 0; i < px.length; i += 4) { const v = px[i] + px[i + 1] + px[i + 2]; sum += v; if (v > 60) lit++; }
  return { avg: +(sum / (w * h * 3)).toFixed(1), litPct: +((lit / (w * h)) * 100).toFixed(1), w, h };
};
