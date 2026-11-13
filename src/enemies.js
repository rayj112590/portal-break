// ============================================================
//  ENEMIES — each one lives in a single phase. In the other
//  phase it is a harmless ghost you can see but not touch.
// ============================================================
import * as THREE from "three";
import { ENEMY, CITY, BREACH, PALETTE } from "./config.js";
import { instance } from "./models.js";

const DRONE_COLOR = new THREE.Color(1, 0.25, 0.7);
const TURRET_COLOR = new THREE.Color(1, 0.6, 0.15);
const RIFT_COLOR = new THREE.Color(1, 0.12, 0.32);
const WRAITH_COLOR = new THREE.Color(1, 0.15, 0.3);

function mat(opts) { return new THREE.MeshStandardMaterial({ transparent: true, ...opts }); }
function glowMat(color, k) { return new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(k), transparent: true }); }

// ---------- model builders (swap points for Blender GLBs) ----------
function buildDrone() {
  const root = new THREE.Group();
  const shell = mat({ color: 0x2a3042, metalness: 0.8, roughness: 0.3 });
  const eye = glowMat(DRONE_COLOR, 3);
  const ringM = glowMat(DRONE_COLOR, 1.6);
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), shell);
  body.castShadow = true;
  const eyeM = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 10), eye);
  eyeM.position.set(0, 0, 0.36);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 6, 32), ringM);
  ring.rotation.x = Math.PI / 2;
  const rotorGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.03, 12);
  const r1 = new THREE.Mesh(rotorGeo, shell); r1.position.set(-0.55, 0.12, 0);
  const r2 = new THREE.Mesh(rotorGeo, shell); r2.position.set(0.55, 0.12, 0);
  const head = new THREE.Group();
  head.add(body, eyeM, ring, r1, r2);
  head.position.y = 1.7;
  root.add(head);
  return { root, head, ring, mats: [shell, eye, ringM], eye, baseEye: DRONE_COLOR.clone().multiplyScalar(3), flashMats: [shell] };
}

function buildTurret(color = TURRET_COLOR) {
  const root = new THREE.Group();
  const metal = mat({ color: 0x2b2f3a, metalness: 0.75, roughness: 0.35 });
  const stripe = glowMat(color, 2.4);
  const eye = glowMat(color, 3);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 0.9, 8), metal);
  base.position.y = 0.45;
  base.castShadow = true;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 8), stripe);
  band.position.y = 0.75;
  const head = new THREE.Group();
  head.position.y = 1.15;
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.45, 0.75), metal);
  box.castShadow = true;
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.8), metal);
  barrel.position.set(0, 0, 0.6);
  const lens = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.05), eye);
  lens.position.set(0, 0.08, 0.39);
  head.add(box, barrel, lens);
  root.add(base, band, head);
  return { root, head, mats: [metal, stripe, eye], eye, baseEye: color.clone().multiplyScalar(3), flashMats: [metal] };
}

function buildWraith() {
  const root = new THREE.Group();
  const coreM = glowMat(WRAITH_COLOR, 2.6);
  const shellM = mat({ color: 0x1a0208, emissive: 0x500010, metalness: 0.2, roughness: 0.25, flatShading: true });
  const head = new THREE.Group();
  head.position.y = 1.2;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), coreM);
  core.scale.set(1, 1.6, 1);
  const shell = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), shellM);
  shell.scale.set(0.9, 1.7, 0.9);
  shell.castShadow = true;
  head.add(core, shell);
  const shards = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.16, 0), coreM);
    head.add(s);
    shards.push(s);
  }
  root.add(head);
  return { root, head, shards, shell, mats: [coreM, shellM], eye: coreM, baseEye: WRAITH_COLOR.clone().multiplyScalar(2.6), flashMats: [shellM] };
}

const BUILDERS = { drone: buildDrone, turret: () => buildTurret(), wraith: buildWraith, riftTurret: () => buildTurret(RIFT_COLOR) };

// Blender models (assets/models/<type>.glb); same shape as the builders above.
function fromGLB(type) {
  const inst = instance(type === "riftTurret" ? "turret" : type, { transparent: true });
  if (!inst) return null;
  const root = new THREE.Group();
  root.add(inst.root);
  const eye = inst.byRole.Eye?.[0];
  if (type === "riftTurret") {
    // same Blender turret, recoloured crimson for the Breach
    for (const m of inst.byRole.Eye || []) m.color.copy(RIFT_COLOR).multiplyScalar(3);
    for (const m of inst.byRole.Glow || []) m.color.copy(RIFT_COLOR).multiplyScalar(2.2);
    for (const m of inst.byRole.Lit || []) m.color.multiply(new THREE.Color(1.15, 0.8, 0.9));
  }
  const out = { root, head: inst.find("Head"), mats: inst.mats, eye, baseEye: eye?.color.clone(), flashMats: inst.byRole.Lit || [] };
  if (type === "drone") { out.ring = inst.find("Ring"); out.ringAxis = "y"; }
  if (type === "wraith") { out.shards = [1, 2, 3].map(i => inst.find(`Shard${i}`)); out.shell = inst.find("Shell"); }
  if (!out.head || !eye || (type === "drone" && !out.ring) || (type === "wraith" && (!out.shell || out.shards.some(s => !s)))) return null;
  return out;
}
const COLORS = { drone: DRONE_COLOR, turret: TURRET_COLOR, wraith: WRAITH_COLOR, riftTurret: RIFT_COLOR };

// ---------- hp bar ----------
const barBgGeo = new THREE.PlaneGeometry(1, 0.1);
const barFillGeo = new THREE.PlaneGeometry(1, 0.1);
barFillGeo.translate(0.5, 0, 0);

export class Enemy {
  constructor(type, x, z, scene) {
    this.type = type;
    this.cfg = ENEMY[type];
    this.phase = this.cfg.phase;
    this.color = COLORS[type];
    this.model = fromGLB(type) || BUILDERS[type]();
    this.model.root.position.set(x, 0, z);
    scene.add(this.model.root);
    this.scene = scene;
    this.pos = new THREE.Vector3(x, 0, z);
    this.home = this.pos.clone();
    this.hp = this.cfg.hp;
    this.alive = true;
    this.alert = 0;
    this.cooldown = 0.6 + Math.random() * this.cfg.fireEvery;
    this.telegraph = 0;
    this.burst = 0;
    this.burstT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 1 + Math.random() * 2;
    this.wanderT = 0;
    this.wanderTarget = this.pos.clone();
    this.state = "idle";
    this.stateT = 0;
    this.lungeDir = new THREE.Vector3();
    this.lungeHit = false;
    this.hitFlash = 0;
    this.facing = Math.random() * Math.PI * 2;
    this.bob = Math.random() * 10;
    this.ghost = -1;

    const bar = new THREE.Group();
    const bg = new THREE.Mesh(barBgGeo, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false }));
    this.barFill = new THREE.Mesh(barFillGeo, new THREE.MeshBasicMaterial({ color: this.color.clone().multiplyScalar(2), depthTest: false }));
    this.barFill.position.x = -0.5;
    bg.renderOrder = this.barFill.renderOrder = 20;
    bar.add(bg, this.barFill);
    bar.visible = false;
    this.bar = bar;
    scene.add(bar);
  }

  get radius() { return this.cfg.radius; }
  get mode() { return this.type === "drone" ? "fly" : "walk"; }
  get stationary() { return this.cfg.speed === 0; }

  setGhost(isGhost) {
    const g = isGhost ? 1 : 0;
    if (g === this.ghost) return;
    this.ghost = g;
    for (const m of this.model.mats) m.opacity = isGhost ? 0.12 : 1;
    this.model.root.traverse(o => { if (o.isMesh) o.castShadow = !isGhost; });
  }

  damage(amount) {
    this.hp -= amount;
    this.hitFlash = 1;
    this.alert = 6;
    return this.hp <= 0;
  }

  remove() {
    this.scene.remove(this.model.root);
    this.scene.remove(this.bar);
    this.alive = false;
  }

  update(dt, game) {
    const { world, player } = game;
    const active = game.phase === this.phase;
    this.setGhost(!active);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.bob += dt;

    if (this.hijackT > 0) this.updateHijacked(dt, game);
    else {
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const sees = active && player.alive && dist < this.cfg.range && world.lineOfSight(this.pos.x, this.pos.z, player.pos.x, player.pos.z, this.phase);
    if (sees) this.alert = 4;
    else this.alert = Math.max(0, this.alert - dt);
    const engaged = active && this.alert > 0 && player.alive;

    if (this.type === "drone") this.updateDrone(dt, game, engaged, sees, dx, dz, dist);
    else if (this.stationary) this.updateTurret(dt, game, engaged, sees, dx, dz, dist);
    else this.updateWraith(dt, game, engaged, sees, dx, dz, dist);
    }

    // visuals
    const m = this.model;
    m.root.position.set(this.pos.x, 0, this.pos.z);
    m.root.rotation.y = this.facing;
    const flash = this.hitFlash;
    for (const fm of m.flashMats) fm.emissive?.setRGB(flash * 3, flash * 3, flash * 3);
    const tel = this.telegraph > 0 ? 1 + Math.sin(this.telegraph * 40) * 0.5 + 1 : 1;
    m.eye.color.copy(m.baseEye).multiplyScalar(tel);
    if (this.hijackT > 0) m.eye.color.setRGB(0.6, 2.8, 0.4);
    if (this.type === "wraith" && flash === 0) m.shell.material.emissive.setRGB(0.31 + (this.state === "windup" ? 1.5 : 0), 0, 0.06);

    // hp bar
    const showBar = active && this.hp < this.cfg.hp;
    this.bar.visible = showBar;
    if (showBar) {
      this.bar.position.set(this.pos.x, (this.stationary ? 2.0 : 2.4), this.pos.z);
      this.bar.quaternion.copy(game.camera.quaternion);
      this.barFill.scale.x = Math.max(0.001, this.hp / this.cfg.hp);
    }
  }

  turnTo(angle, dt, rate = 8) {
    let d = angle - this.facing;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    this.facing += d * Math.min(1, dt * rate);
  }

  wander(dt, world, speed) {
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 2 + Math.random() * 3;
      const t = world.randomOpenTileNear(this.home.x, this.home.z, 1, 4, this.phase, this.mode);
      if (t) this.wanderTarget.set(t.x, 0, t.z);
    }
    const wx = this.wanderTarget.x - this.pos.x, wz = this.wanderTarget.z - this.pos.z;
    const wd = Math.hypot(wx, wz);
    if (wd > 0.3) {
      world.move(this.pos, (wx / wd) * speed * dt, (wz / wd) * speed * dt, this.radius, this.phase, this.mode);
      this.turnTo(Math.atan2(wx, wz), dt, 4);
    }
  }

  updateDrone(dt, game, engaged, sees, dx, dz, dist) {
    const { world } = game;
    const h = this.model.head;
    h.position.y = 1.7 + Math.sin(this.bob * 2.2) * 0.12;
    this.model.ring.rotation[this.model.ringAxis || "z"] += dt * 3;
    if (!engaged) { this.telegraph = 0; this.wander(dt, world, 1.5); return; }

    this.turnTo(Math.atan2(dx, dz), dt, 10);
    const nx = dx / (dist || 1), nz = dz / (dist || 1);
    this.strafeT -= dt;
    if (this.strafeT <= 0) { this.strafe *= -1; this.strafeT = 1.5 + Math.random() * 2; }
    let fx = 0, fz = 0;
    if (dist > 9) { fx += nx; fz += nz; }
    else if (dist < 6) { fx -= nx; fz -= nz; }
    fx += -nz * this.strafe * 0.8; fz += nx * this.strafe * 0.8;
    const fl = Math.hypot(fx, fz) || 1;
    const blocked = world.move(this.pos, (fx / fl) * this.cfg.speed * dt, (fz / fl) * this.cfg.speed * dt, this.radius, this.phase, "fly");
    if (blocked) this.strafe *= -1;

    this.cooldown -= dt;
    if (this.cooldown < 0.35 && sees) this.telegraph = Math.max(this.telegraph, 0.001) + dt;
    if (this.cooldown <= 0) {
      if (sees) {
        game.enemyFire(this, this.pos.x + nx * 0.5, this.pos.z + nz * 0.5, 1.6, nx, nz);
        this.cooldown = this.cfg.fireEvery * (0.8 + Math.random() * 0.4);
      } else this.cooldown = 0.3;
      this.telegraph = 0;
    }
  }

  // Remote-hacked by Rook: for a while it hunts the nearest enemy in its own world instead of you.
  updateHijacked(dt, game) {
    this.hijackT -= dt;
    this.telegraph = 0;
    this.burst = 0;
    if (this.hijackT <= 0) { this.alert = 0; this.cooldown = 1.5; return; }
    const head = this.model.head;
    let best = null, bd = this.cfg.range;
    for (const e of game.enemies) {
      if (e === this || !e.alive || e.phase !== this.phase || e.hijackT > 0) continue;
      const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (d < bd && game.world.lineOfSight(this.pos.x, this.pos.z, e.pos.x, e.pos.z, this.phase)) { bd = d; best = e; }
    }
    if (!best) { head.rotation.y += dt * 1.5; return; }
    let d = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z) - head.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    head.rotation.y += d * Math.min(1, dt * 8);
    this.cooldown -= dt;
    if (this.cooldown <= 0 && Math.abs(d) < 0.3) {
      const a = head.rotation.y, fx = Math.sin(a), fz = Math.cos(a);
      game.allyFire(this, this.pos.x + fx * 0.9, this.pos.z + fz * 0.9, 1.15, fx, fz);
      this.cooldown = 0.28;
    }
  }

  updateTurret(dt, game, engaged, sees, dx, dz, dist) {
    const head = this.model.head;
    if (!engaged) { head.rotation.y += dt * 0.5; this.telegraph = 0; return; }
    const want = Math.atan2(dx, dz);
    let d = want - head.rotation.y;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    head.rotation.y += d * Math.min(1, dt * 5);

    if (this.burst > 0) {
      this.burstT -= dt;
      if (this.burstT <= 0) {
        const a = head.rotation.y;
        const fx = Math.sin(a), fz = Math.cos(a);
        game.enemyFire(this, this.pos.x + fx * 0.9, this.pos.z + fz * 0.9, 1.15, fx, fz);
        this.burst--;
        this.burstT = 0.14;
      }
      return;
    }
    this.cooldown -= dt;
    this.telegraph = this.cooldown < 0.5 && sees ? this.telegraph + dt : 0;
    if (this.cooldown <= 0) {
      if (sees && Math.abs(d) < 0.4) { this.burst = 3; this.burstT = 0; this.cooldown = this.cfg.fireEvery; }
      else this.cooldown = 0.2;
      this.telegraph = 0;
    }
  }

  updateWraith(dt, game, engaged, sees, dx, dz, dist) {
    const { world, player } = game;
    const m = this.model;
    m.head.position.y = 1.2 + Math.sin(this.bob * 3) * 0.1;
    m.shards.forEach((s, i) => {
      const a = this.bob * 2.5 + (i * Math.PI * 2) / 3;
      s.position.set(Math.cos(a) * 0.7, Math.sin(this.bob * 4 + i) * 0.25, Math.sin(a) * 0.7);
      s.rotation.x += dt * 4;
    });
    this.stateT -= dt;

    if (!engaged) {
      this.state = "idle";
      this.telegraph = 0;
      m.head.position.x = m.head.position.z = 0;
      this.wander(dt, world, 1.2);
      return;
    }

    if (this.state === "windup") {
      m.head.position.x = (Math.random() - 0.5) * 0.12;
      m.head.position.z = (Math.random() - 0.5) * 0.12;
      this.telegraph = 0.4 - this.stateT;
      if (this.stateT <= 0) {
        this.state = "lunge";
        this.stateT = 0.3;
        this.lungeDir.set(dx, 0, dz).normalize();
        this.lungeHit = false;
        game.audio.lunge();
      }
      return;
    }
    m.head.position.x = m.head.position.z = 0;
    this.telegraph = 0;

    if (this.state === "lunge") {
      world.move(this.pos, this.lungeDir.x * 16 * dt, this.lungeDir.z * 16 * dt, this.radius, this.phase, "walk");
      game.particles.emit({ x: this.pos.x, y: 1.2, z: this.pos.z, count: 2, speed: 1, up: 0.5, color: [2.5, 0.3, 0.5], size: 0.5, life: 0.35, gravity: 0 });
      if (!this.lungeHit && dist < this.radius + player.radius + 0.35) {
        this.lungeHit = true;
        game.hurtPlayer(this.cfg.damage, this.pos.x, this.pos.z);
      }
      if (this.stateT <= 0) { this.state = "recover"; this.stateT = 0.65; }
      return;
    }
    if (this.state === "recover") { if (this.stateT <= 0) this.state = "chase"; return; }

    // chase
    this.state = "chase";
    this.turnTo(Math.atan2(dx, dz), dt, 10);
    if (dist < 3.0 && sees) { this.state = "windup"; this.stateT = 0.42; return; }
    let mx, mz;
    if (sees && dist < 6) { mx = dx / dist; mz = dz / dist; }
    else {
      const dir = game.flowDir(this.pos.x, this.pos.z);
      if (!dir) { mx = dx / dist; mz = dz / dist; } else { mx = dir.x; mz = dir.z; }
    }
    world.move(this.pos, mx * this.cfg.speed * dt, mz * this.cfg.speed * dt, this.radius, this.phase, "walk");
  }
}

export function separate(enemies) {
  for (let i = 0; i < enemies.length; i++) {
    const a = enemies[i];
    if (!a.alive || a.stationary) continue;
    for (let j = i + 1; j < enemies.length; j++) {
      const b = enemies[j];
      if (!b.alive || b.phase !== a.phase) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz), min = a.radius + b.radius;
      if (d > 0 && d < min) {
        const push = (min - d) / 2;
        const ux = dx / d, uz = dz / d;
        a.pos.x -= ux * push; a.pos.z -= uz * push;
        if (!b.stationary) { b.pos.x += ux * push; b.pos.z += uz * push; }
      }
    }
  }
}
