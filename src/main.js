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

import { TILE, CITY, BREACH, PALETTE, PLAYER } from "./config.js";
import { LEVELS, STORY } from "./levels.js";
import { World } from "./world.js";
import { Player } from "./player.js";
import { Enemy, separate } from "./enemies.js";
import { Particles, Weather, Shockwaves, Flashes, Projectiles } from "./fx.js";
import { Audio } from "./audio.js";
import { Input } from "./input.js";
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
    if (!e.alive || e.phase !== game.phase) continue;
    const dx = e.pos.x - px, dz = e.pos.z - pz;
    const d = Math.hypot(dx, dz);
    if (d > AIM.range || d < 0.3) continue;
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
  aimTarget: null,
  world, player, camera, input, audio, particles,
  enemies: [],
  pickups: [],
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
    if (player.hp <= 0) killPlayer();
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

// ---------- level setup ----------
function spawnEnemy(type, x, z) {
  const e = new Enemy(type, x, z, scene);
  game.enemies.push(e);
  return e;
}

function resetLevel() {
  for (const e of game.enemies) if (e.alive) e.remove();
  game.enemies = [];
  for (const p of game.pickups) scene.remove(p.mesh);
  game.pickups = [];
  for (const p of projectiles.list) if (p.active) projectiles.kill(p);
  world.resetObjectives();
  player.reset(world.spawns.player);
  for (const s of world.spawns.enemies) spawnEnemy(s.type, s.x, s.z);
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
  audio.setBreach(0);
  hud.clearLabels();
  updateObjective();
  camTarget.set(player.pos.x, 0, player.pos.z);
}

// Respawn at the last hacked lock. Locks stay hacked; enemies stay where they are.
function respawnAtCheckpoint() {
  const cp = game.checkpoint;
  if (!cp) { startPlay(); return; }
  for (const p of projectiles.list) if (p.active) projectiles.kill(p);
  player.reset(cp);
  player.invuln = 2.5;
  player.model.root.visible = true;
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
    hud.hint(def.text);
    break;
  }
}

function updateObjective() {
  const total = world.terminals.length;
  const done = world.terminals.filter(t => t.hacked).length;
  if (done < total) hud.setObjective(`BREACH THE LOCKS  ${done}/${total}`);
  else hud.setObjective("PORTAL ONLINE // REACH THE EXIT");
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
  const dir = player.aimDir();
  const spread = (Math.random() - 0.5) * 0.06;
  const cs = Math.cos(spread), sn = Math.sin(spread);
  const dx = dir.x * cs - dir.z * sn, dz = dir.x * sn + dir.z * cs;
  const m = player.muzzleWorld;
  const col = PALETTE[game.phase].accent;
  projectiles.spawn({ x: m.x, z: m.z, y: m.y, dx, dz, speed: PLAYER.bulletSpeed, damage: PLAYER.damage, phase: game.phase, friendly: true, color: col });
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

function spawnPickup(x, z, kind) {
  const color = kind === "hp" ? new THREE.Color(0.5, 3, 1.4) : new THREE.Color(2.2, 0.8, 3);
  const mesh = new THREE.Mesh(pickupGeo, new THREE.MeshBasicMaterial({ color }));
  mesh.position.set(x, 0.6, z);
  scene.add(mesh);
  game.pickups.push({ mesh, kind, x, z, t: 0, vx: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4 });
}

function killPlayer() {
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
          if (!e.alive || e.phase !== p.phase) continue;
          if (Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < e.radius + p.radius) {
            const crit = Math.random() < 0.12;
            const dmg = crit ? p.damage * 2 : p.damage;
            const ec = e.color;
            particles.emit({ x: p.x, y: p.y, z: p.z, count: 8, speed: 5, up: 2, color: [ec.r * 2, ec.g * 2, ec.b * 2], size: 0.25, life: 0.3, gravity: -10, dir: { x: p.vx, z: p.vz }, spread: 1.4 });
            hud.damageNumber(e.pos.x, 2.1, e.pos.z, crit ? `${dmg}!` : `${dmg}`, crit ? "#ffd166" : "#ffffff", camera, crit);
            audio.hit();
            // small knockback so hits feel solid (turrets are bolted down)
            if (!e.stationary) {
              const pl = Math.hypot(p.vx, p.vz) || 1;
              world.move(e.pos, (p.vx / pl) * 0.22, (p.vz / pl) * 0.22, e.radius, e.phase, e.mode);
            }
            if (e.damage(dmg)) killEnemy(e);
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
      if (pk.kind === "hp") { player.hp = Math.min(PLAYER.hp, player.hp + 12); hud.damageNumber(player.pos.x, 2.3, player.pos.z, "+12", "#7df5bc", camera); }
      else { player.energy = Math.min(100, player.energy + 35); hud.damageNumber(player.pos.x, 2.3, player.pos.z, "+PHASE", "#c58bff", camera); }
      audio.pickup();
      scene.remove(pk.mesh);
      game.pickups.splice(i, 1);
    } else if (pk.t > 20) {
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
  if (done === total) {
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
  if (input.shiftPressed()) tryShift();
  game.shiftCd = Math.max(0, game.shiftCd - dt);

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
        if (player.hp <= 0) killPlayer();
      }
    }
  } else {
    player.energy = Math.min(100, player.energy + PLAYER.energyRegen * dt);
    if (player.energy > 40) game.lowEnergyWarned = false;
  }

  // health slowly regenerates after 4s without taking damage
  if (player.alive && player.hp < PLAYER.hp && game.stats.time - game.lastHurt > 4) {
    player.hp = Math.min(PLAYER.hp, player.hp + 6 * dt);
  }

  updateHints(dt);

  // shooting
  player.fireCd = Math.max(0, player.fireCd - dt);
  if (input.mouse.left && player.fireCd <= 0 && player.alive) {
    player.fireCd = 1 / PLAYER.fireRate;
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

  for (const e of game.enemies) e.update(dt, game);
  separate(game.enemies);
  updateProjectiles(dt);
  updatePickups(dt);
  updateTerminals(dt);

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
  overlay.className = `overlay ${cls}`;
  overlay.innerHTML = html;
  overlay.classList.remove("hidden");
}
function hideOverlay() { overlay.classList.add("hidden"); overlay.innerHTML = ""; }

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
      <div class="controls">
        <span><kbd>WASD</kbd> move (W = toward the mouse)</span>
        <span><kbd>MOUSE</kbd> aim / fire</span>
        <span><kbd>SHIFT</kbd> or <kbd>RMB</kbd> phase shift</span>
        <span><kbd>SPACE</kbd> dash</span>
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
      <button class="btn" data-action="play">ENTER DISTRICT</button>
    </div>`, "briefing-screen");
}

function startPlay() {
  resetLevel();
  hideOverlay();
  hud.show(true);
  game.state = "play";
  hud.toast("SECURE THE 4 LOCKS // SHIFT TO CHANGE WORLDS", "#55e6ff");
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
      <p class="eyebrow red">SIGNAL LOST</p>
      <h2>YOU WERE TERMINATED. AGAIN.</h2>
      <p class="stat-line">${statLine()}</p>
      ${game.checkpoint
        ? `<button class="btn" data-action="respawn">RESPAWN AT CHECKPOINT</button>
           <button class="btn ghost" data-action="restart">RESTART DISTRICT</button>`
        : `<button class="btn" data-action="restart">RE-INITIALIZE</button>`}
      <p class="hint">${game.checkpoint ? "Your hacked locks are kept. <kbd>ENTER</kbd> respawn · <kbd>R</kbd> restart" : "<kbd>ENTER</kbd> or <kbd>R</kbd> to restart"}</p>
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
  const best = saveRecord(level.id, s);
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
  const a = e.target.closest("[data-action]")?.dataset.action;
  if (!a) return;
  audio.init();
  if (a === "start") newGame();
  else if (a === "continue") continueGame();
  else if (a === "nextDistrict") nextDistrict();
  else if (a === "select") screenSelect();
  else if (a === "menu") screenTitle();
  else if (a === "pick") { const i = +e.target.closest("[data-index]").dataset.index; loadDistrict(i); screenBriefing(); }
  else if (a === "next") storyNext();
  else if (a === "skip") { clearInterval(typeTimer); storyDone(); }
  else if (a === "play") startPlay();
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
  }
  if (e.code === "Enter" || e.code === "Space") {
    if (game.state === "title") { if (loadProgress() > 0) continueGame(); else newGame(); }
    else if (game.state === "story") storyNext();
    else if (game.state === "briefing") startPlay();
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
  } else if (["title", "story", "briefing"].includes(game.state)) {
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
    const fx = Math.min(world.width - 14, s.x + 9), fz = Math.max(14, s.z - 8);
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
