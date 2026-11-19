// ============================================================
//  THE WARDEN — District 05's boss, the end of World 1. A 3.4 m security mech that guards
//  the Portal Zero portal room; the portal only powers up once he's down.
//  - He lives in the CITY. Jax can phase into the Breach to hide: the Warden loses him and
//    can't hit him there (his purge is a CITY attack too), but the Breach drains phase energy,
//    and from half health he tears wraiths into the Breach.
//  - Rook's remote hack overrides him: for a few seconds his own cannons fire into his chest
//    and he takes extra damage. Then his firewall reboots before he can be hacked again.
//  - Boulder's thrown crates hit him three times as hard. Everyone can shoot him.
//  Model: assets/models/warden.glb (Rodin, rigged in art/rodin-work/warden_rig.blend): bones
//  pelvis, spine, chest, head, thigh/shin/foot L+R, armL/armR, cannonL1/L2/R1/R2, and a
//  MuzzleL1..R2 empty at each barrel tip.
//  It plugs into the same loop as the other enemies (game.enemies), with `isBoss` / `heavy`.
//  It talks back to main.js through hooks on `game`: bossFire, bossShock, ring, flash, shake,
//  spawnNear, hitEnemy, hud, audio.
// ============================================================
import * as THREE from "three";
import { CITY } from "./config.js";
import { instance } from "./models.js";

export const WARDEN = {
  hp: 2400, radius: 1.5, speed: 1.9, score: 5000,
  stream: { speed: 17, damage: 8, every: 0.1, dur: 1.1 },
  sweep: { speed: 14, damage: 7, every: 0.06, dur: 1.5, arc: 0.95 },
  purge: { speed: 11, damage: 12, count: 28, waves: 3, gap: 0.42, charge: 2.2, life: 2.4 },
  stomp: { range: 4.2, radius: 5.5, damage: 18, charge: 0.55, cooldown: 4 },
  override: 5, overrideDamage: 0.1, overrideMul: 1.5, firewall: 14,
  crateMul: 3,
  enrage: 0.5, secondWave: 0.25,
};
export const WARDEN_COLOR = new THREE.Color(1.0, 0.18, 0.5);
const PURGE_COLOR = new THREE.Color(1.0, 0.08, 0.1);
const HACK_COLOR = new THREE.Color(0.55, 1.0, 0.3);
const WHITE = new THREE.Color(1, 1, 1);
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _c = new THREE.Color();

const wrap = a => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };

// Bone helpers (same idea as player.js): rotate about a model-space axis on top of the rest pose,
// so the code never depends on how Blender oriented the bone.
function swing(bone, axisModel) {
  if (!bone) return () => {};
  const rest = bone.quaternion.clone();
  const pq = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(pq);
  const axis = axisModel.clone().applyQuaternion(pq.invert()).normalize();
  const q = new THREE.Quaternion();
  return a => { q.setFromAxisAngle(axis, a); bone.quaternion.copy(q).multiply(rest); };
}
function rot(bone) {   // (pitch about model X, yaw about model Y)
  if (!bone) return () => {};
  const rest = bone.quaternion.clone();
  const pq = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(pq);
  pq.invert();
  const ax = X.clone().applyQuaternion(pq).normalize(), ay = Y.clone().applyQuaternion(pq).normalize();
  const qx = new THREE.Quaternion(), qy = new THREE.Quaternion();
  return (pitch = 0, yaw = 0) => { qy.setFromAxisAngle(ay, yaw); qx.setFromAxisAngle(ax, pitch); bone.quaternion.copy(qy).multiply(qx).multiply(rest); };
}
function spinner(bone) {  // spin around the bone's own axis (the barrel)
  if (!bone) return () => {};
  const rest = bone.quaternion.clone(), q = new THREE.Quaternion();
  return a => { q.setFromAxisAngle(Y, a); bone.quaternion.copy(rest).multiply(q); };
}

export class Warden {
  // spawn {x, z}; arena {x0, z0, x1, z1} in world units (he never leaves it)
  constructor(spawn, arena, scene) {
    this.type = "warden";
    this.name = "THE WARDEN";
    this.isBoss = true;
    this.heavy = true;          // nothing pushes him around
    this.cfg = { hp: WARDEN.hp, score: WARDEN.score, damage: WARDEN.stream.damage, bulletSpeed: WARDEN.stream.speed };
    this.phase = CITY;
    this.color = WARDEN_COLOR.clone();
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.home = this.pos.clone();
    this.arena = arena;
    this.radius = WARDEN.radius;
    this.hp = WARDEN.hp;
    this.alive = true;
    this.dying = false;
    this.held = false;
    this.hijackT = 0;
    this.scene = scene;
    this.reset();
    this.build(scene);
  }

  get stationary() { return false; }
  get mode() { return "walk"; }
  get active() { return this.state !== "dormant" && !this.dying; }
  get maxHp() { return WARDEN.hp; }
  // shots and crates pass through him while he's powered down or already falling
  get untouchable() { return this.state === "dormant" || this.dying; }

  // back to square one (new attempt after the whole crew went down)
  reset() {
    this.pos.copy(this.home);
    this.hp = WARDEN.hp;
    this.state = "dormant"; this.stateT = 0;
    this.facing = 0;            // faces south, toward the gate
    this.aimYaw = 0;            // torso yaw relative to facing
    this.headYaw = 0;
    this.walkPh = 0; this.move = 0;
    this.spin = [0, 0, 0, 0]; this.spinSpeed = 0;
    this.attackN = 0; this.cooldown = 1.2; this.stompCd = 2;
    this.fireT = 0; this.shotN = 0; this.arm = 0; this.sweepFrom = 0;
    this.wave = 0;
    this.overrideT = 0; this.firewallT = 0;
    this.hitFlash = 0; this.recoil = [0, 0];
    this.enraged = false; this.secondWave = false; this.events = [];
    this.lostT = 0; this.t = 0; this.deathT = 0;
    this.crouch = 0; this.ghost = -1;
  }

  build(scene) {
    const inst = instance("warden", { transparent: true });
    const root = new THREE.Group();
    if (inst) {
      root.add(inst.root);
      inst.root.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
      root.updateMatrixWorld(true);
      const b = n => inst.find(n);
      this.rig = {
        thighL: swing(b("thighL"), X), thighR: swing(b("thighR"), X),
        shinL: swing(b("shinL"), X), shinR: swing(b("shinR"), X),
        footL: swing(b("footL"), X), footR: swing(b("footR"), X),
        spine: swing(b("spine"), Y), chest: rot(b("chest")), head: rot(b("head")),
        armL: rot(b("armL")), armR: rot(b("armR")),
        cannons: ["L1", "L2", "R1", "R2"].map(k => spinner(b(`cannon${k}`))),
        pelvis: b("pelvis"),
      };
      this.pelvisY = this.rig.pelvis ? this.rig.pelvis.position.y : 0;
      this.muzzles = ["L1", "L2", "R1", "R2"].map(k => b(`Muzzle${k}`));
      this.mats = inst.mats;
      this.mat = inst.byRole.Lit?.find(m => m.emissiveMap) || inst.mats[0];
      this.mat.emissiveIntensity = 1;
      this.baseColor = this.mat.color.clone();
    } else {
      // stand-in if the GLB failed: a block mech with two cannon arms
      const body = new THREE.MeshStandardMaterial({ color: 0x1a1c26, emissive: 0x000000, transparent: true, metalness: 0.7, roughness: 0.4 });
      const add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), body); m.position.set(x, y, z); m.castShadow = true; root.add(m); return m; };
      add(1.8, 1.4, 1.1, 0, 2.2, 0); add(0.6, 1.4, 0.7, -0.6, 0.7, 0); add(0.6, 1.4, 0.7, 0.6, 0.7, 0);
      this.muzzles = [-1.6, -1.4, 1.4, 1.6].map(x => { const a = add(0.35, 0.35, 1.4, x, 1.6, 0.8); const m = new THREE.Object3D(); m.position.set(0, 0, 0.75); a.add(m); return m; });
      this.rig = null;
      this.mats = [body];
      this.mat = body;
      this.baseColor = body.color.clone();
    }
    root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    root.position.copy(this.pos);
    scene.add(root);
    this.root = root;
    this.model = { root, mats: this.mats };   // main.js only touches model.root
  }

  remove() { this.scene.remove(this.root); this.alive = false; }

  setGhost(isGhost) {
    const g = isGhost ? 1 : 0;
    if (g === this.ghost) return;
    this.ghost = g;
    for (const m of this.mats) m.opacity = isGhost ? 0.14 : 1;
    this.root.traverse(o => { if (o.isMesh) o.castShadow = !isGhost; });
  }

  // Shots, crates and his own overridden cannons all land here. Returns true when he's down.
  damage(amount) {
    if (this.dying || this.state === "dormant") return false;
    if (this.state === "override") amount *= WARDEN.overrideMul;
    this.hp -= amount;
    this.hitFlash = 1;
    if (!this.enraged && this.hp < WARDEN.hp * WARDEN.enrage) { this.enraged = true; this.events.push("enrage"); }
    if (!this.secondWave && this.hp < WARDEN.hp * WARDEN.secondWave) { this.secondWave = true; this.events.push("adds"); }
    return this.hp <= 0;
  }

  // the arena trigger fired: power up
  activate() { if (this.state === "dormant") { this.state = "intro"; this.stateT = 2.2; } }

  // Rook's hack went through
  override() {
    this.state = "override"; this.stateT = WARDEN.override; this.fireT = 0; this.shotN = 0;
    this.spinSpeed = 30;
  }

  // HUD status line under the boss bar
  status() {
    if (this.dying) return "SYSTEMS FAILING";
    switch (this.state) {
      case "intro": return "POWERING UP";
      case "search": return "TARGET LOST // SCANNING";
      case "reacquire": return "TARGET REACQUIRED";
      case "purgeCharge": case "purge": return "PURGE PROTOCOL";
      case "override": return `OVERRIDDEN // ${Math.ceil(this.stateT)}s`;
      default: return this.firewallT > 0 ? `FIREWALL REBOOTING // ${Math.ceil(this.firewallT)}s` : this.enraged ? "OVERCLOCKED" : "";
    }
  }

  // ---------------- per frame ----------------
  update(dt, game) {
    const { player, world } = game;
    this.t += dt;
    this.setGhost(game.phase !== this.phase);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 5);
    this.firewallT = Math.max(0, this.firewallT - dt);
    this.stompCd = Math.max(0, this.stompCd - dt);
    this.recoil[0] = Math.max(0, this.recoil[0] - dt * 8);
    this.recoil[1] = Math.max(0, this.recoil[1] - dt * 8);
    this.stateT -= dt;
    for (const ev of this.events.splice(0)) this.onEvent(ev, game);

    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.001;
    const toPlayer = Math.atan2(dx, dz);
    // he sees you while you're alive in his world (the Breach hides you completely)
    const sees = player.alive && game.phase === this.phase;
    let want = null;               // where he'd like to walk
    let aimAt = null;              // world angle the torso tracks
    let spinTarget = 4;

    switch (this.state) {
      case "dormant":
        spinTarget = 0;
        break;
      case "intro":
        spinTarget = 10;
        aimAt = toPlayer;
        if (this.stateT <= 0) { this.state = "hunt"; this.cooldown = 1.0; }
        break;
      case "dying":
        this.deathT += dt;
        spinTarget = 0;
        break;
      case "override": {
        spinTarget = 34;
        // both arms swing inward and the cannons fire into his own chest
        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = 0.1;
          const i = this.shotN++ % 4, m = this.muzzles[i];
          if (m) {
            m.getWorldPosition(_v);
            const cx = this.pos.x, cz = this.pos.z;
            const ddx = cx - _v.x, ddz = cz - _v.z, l = Math.hypot(ddx, ddz) || 1;
            const total = WARDEN.hp * WARDEN.overrideDamage, ticks = WARDEN.override / 0.1;
            game.bossFire(this, _v.x, _v.z, Math.min(2.2, _v.y), ddx / l, ddz / l, { speed: 20, damage: Math.round(total / ticks / WARDEN.overrideMul), friendly: true, color: HACK_COLOR, size: 1 });
            this.recoil[i < 2 ? 0 : 1] = 1;
          }
        }
        if (this.stateT <= 0) { this.state = "hunt"; this.cooldown = 1.2; this.firewallT = WARDEN.firewall; }
        break;
      }
      default: {
        // ----- combat -----
        if (!sees && this.state !== "purgeCharge" && this.state !== "purge") {
          if (this.state !== "search") { this.state = "search"; this.stateT = 0; game.audio.tone("square", 520, 260, 0.35, 0.05); }
        }
        if (this.state === "search") {
          // scanning: torso sweeps, he drifts back toward the portal
          this.lostT += dt;
          spinTarget = 2;
          aimAt = this.facing + Math.sin(this.t * 0.9) * 1.0;
          this.headYaw = Math.sin(this.t * 1.7) * 0.5;
          if (Math.hypot(this.home.x - this.pos.x, this.home.z - this.pos.z) > 1) want = { x: this.home.x, z: this.home.z, speed: 0.6 };
          if (sees) { this.state = "reacquire"; this.stateT = 0.7; this.lostT = 0; game.audio.tone("square", 300, 700, 0.25, 0.06); }
          break;
        }
        this.headYaw *= 1 - Math.min(1, dt * 4);
        aimAt = toPlayer;
        if (this.state === "reacquire") { if (this.stateT <= 0) { this.state = "hunt"; this.cooldown = Math.max(this.cooldown, 0.5); } break; }

        if (this.state === "hunt") {
          // keep a fighting distance, drift sideways a little
          const keep = 8;
          const side = Math.sin(this.t * 0.4) * 0.6;
          const nx = dx / dist, nz = dz / dist;
          let mx = -nz * side, mz = nx * side;
          if (dist > keep + 2) { mx += nx; mz += nz; } else if (dist < keep - 2) { mx -= nx; mz -= nz; }
          want = { x: this.pos.x + mx * 3, z: this.pos.z + mz * 3, speed: 1 };
          this.cooldown -= dt;
          if (dist < WARDEN.stomp.range && this.stompCd <= 0) { this.state = "stompCharge"; this.stateT = WARDEN.stomp.charge; game.audio.tone("sawtooth", 90, 50, 0.5, 0.18); }
          else if (this.cooldown <= 0) this.pickAttack(game);
          break;
        }
        if (this.state === "telegraph") {
          spinTarget = 26;
          if (this.stateT <= 0) { this.state = this.next; this.stateT = this.next === "stream" ? WARDEN.stream.dur : WARDEN.sweep.dur; this.fireT = 0; this.shotN = 0; this.sweepFrom = toPlayer; }
          break;
        }
        if (this.state === "stream") {
          // one arm's two cannons, aimed at you
          spinTarget = 34;
          this.fireT -= dt;
          if (this.fireT <= 0) {
            this.fireT = WARDEN.stream.every * (this.enraged ? 0.8 : 1);
            const i = this.arm * 2 + (this.shotN++ % 2), m = this.muzzles[i];
            if (m) {
              m.getWorldPosition(_v);
              // lead the target a little
              const lx = player.pos.x + player.vel.x * 0.25, lz = player.pos.z + player.vel.z * 0.25;
              const ddx = lx - _v.x, ddz = lz - _v.z, l = Math.hypot(ddx, ddz) || 1;
              const sp = (Math.random() - 0.5) * 0.08, cs = Math.cos(sp), sn = Math.sin(sp);
              const fx = (ddx / l) * cs - (ddz / l) * sn, fz = (ddx / l) * sn + (ddz / l) * cs;
              game.bossFire(this, _v.x, _v.z, Math.min(2.2, _v.y), fx, fz, { speed: WARDEN.stream.speed, damage: WARDEN.stream.damage });
              this.recoil[this.arm] = 1;
            }
          }
          if (this.stateT <= 0) this.endAttack();
          break;
        }
        if (this.state === "sweep") {
          // both arms rake across you
          spinTarget = 34;
          const k = 1 - Math.max(0, this.stateT) / WARDEN.sweep.dur;
          const dir = this.sweepDir || 1;
          aimAt = this.sweepFrom + dir * WARDEN.sweep.arc * (k * 2 - 1);
          this.fireT -= dt;
          if (this.fireT <= 0) {
            this.fireT = WARDEN.sweep.every * (this.enraged ? 0.85 : 1);
            const i = this.shotN++ % 4, m = this.muzzles[i];
            if (m) {
              m.getWorldPosition(_v);
              const a = this.facing + this.aimYaw + (i < 2 ? -0.06 : 0.06);
              game.bossFire(this, _v.x, _v.z, Math.min(2.2, _v.y), Math.sin(a), Math.cos(a), { speed: WARDEN.sweep.speed, damage: WARDEN.sweep.damage });
              this.recoil[i < 2 ? 0 : 1] = 1;
            }
          }
          if (this.stateT <= 0) this.endAttack();
          break;
        }
        if (this.state === "purgeCharge") {
          spinTarget = 40;
          this.crouch = Math.min(1, this.crouch + dt * 1.2);
          this.fireT -= dt;
          if (this.fireT <= 0) { this.fireT = 0.45; game.ring(this.pos.x, this.pos.z, PURGE_COLOR, 9, 0.45); game.audio.tone("square", 880, 440, 0.2, 0.07); }
          if (this.stateT <= 0) { this.state = "purge"; this.wave = 0; this.fireT = 0; }
          break;
        }
        if (this.state === "purge") {
          spinTarget = 40;
          this.crouch = Math.max(0, this.crouch - dt * 3);
          this.fireT -= dt;
          if (this.fireT <= 0) {
            const P = WARDEN.purge;
            this.fireT = P.gap;
            const off = (this.wave % 2) * (Math.PI / P.count) + this.t;
            for (let k = 0; k < P.count; k++) {
              const a = off + (k / P.count) * Math.PI * 2;
              game.bossFire(this, this.pos.x + Math.sin(a) * 1.6, this.pos.z + Math.cos(a) * 1.6, 1.4, Math.sin(a), Math.cos(a),
                { speed: P.speed, damage: P.damage, color: PURGE_COLOR, size: 1.3, life: P.life, flash: k === 0 });
            }
            game.ring(this.pos.x, this.pos.z, PURGE_COLOR, 14, 0.6);
            game.shake(0.25);
            game.audio.explode();
            if (++this.wave >= P.waves) this.endAttack(1.6);
          }
          break;
        }
        if (this.state === "stompCharge") {
          this.crouch = Math.min(1, this.crouch + dt / WARDEN.stomp.charge);
          if (this.stateT <= 0) {
            this.crouch = 0;
            game.bossShock(this.pos.x, this.pos.z, WARDEN.stomp.radius, WARDEN.stomp.damage, this.color);
            this.stompCd = WARDEN.stomp.cooldown;
            this.endAttack(0.9);
          }
          break;
        }
      }
    }

    // ----- body: turn, walk, aim -----
    if (aimAt !== null && this.state !== "dormant" && !this.dying) {
      // the legs turn slowly toward the target, the torso makes up the rest (up to ~70°)
      const bodyRate = this.state === "sweep" ? 0.6 : 1.4;
      this.facing += wrap(aimAt - this.facing) * Math.min(1, dt * bodyRate);
      const wantYaw = THREE.MathUtils.clamp(wrap(aimAt - this.facing), -1.2, 1.2);
      this.aimYaw += (wantYaw - this.aimYaw) * Math.min(1, dt * (this.state === "sweep" ? 9 : 5));
    }
    let moved = 0;
    if (want && !this.dying) {
      const wx = want.x - this.pos.x, wz = want.z - this.pos.z, wl = Math.hypot(wx, wz);
      if (wl > 0.2) {
        const sp = WARDEN.speed * (want.speed ?? 1) * (this.enraged ? 1.15 : 1);
        const ox = this.pos.x, oz = this.pos.z;
        world.move(this.pos, (wx / wl) * sp * dt, (wz / wl) * sp * dt, this.radius, this.phase, "walk");
        const A = this.arena, r = this.radius + 0.1;
        this.pos.x = THREE.MathUtils.clamp(this.pos.x, A.x0 + r, A.x1 - r);
        this.pos.z = THREE.MathUtils.clamp(this.pos.z, A.z0 + r, A.z1 - r);
        moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
      }
    }
    this.move += ((moved > 0.0005 ? 1 : 0) - this.move) * Math.min(1, dt * 6);
    this.walkPh += (moved / 2.6) * Math.PI * 2;
    this.spinSpeed += (spinTarget - this.spinSpeed) * Math.min(1, dt * 3);
    for (let i = 0; i < 4; i++) this.spin[i] += this.spinSpeed * dt * (i % 2 ? -1 : 1);

    this.pose(dt);
    this.glow(game);
  }

  pickAttack(game) {
    this.attackN++;
    if (this.attackN % (this.enraged ? 3 : 4) === 0) {
      this.state = "purgeCharge"; this.stateT = WARDEN.purge.charge; this.fireT = 0;
      game.hud.toast("WARDEN // PURGE PROTOCOL // PHASE OUT OR TAKE COVER", "#ff4455");
      game.audio.tone("sawtooth", 140, 700, WARDEN.purge.charge, 0.12);
      return;
    }
    this.next = Math.random() < 0.6 ? "stream" : "sweep";
    if (this.next === "stream") this.arm = 1 - this.arm;
    this.sweepDir = Math.random() < 0.5 ? 1 : -1;
    this.state = "telegraph";
    this.stateT = this.enraged ? 0.5 : 0.7;
    game.audio.tone("sawtooth", 200, 900, this.stateT, 0.07);
  }

  endAttack(cd) {
    this.state = "hunt";
    this.cooldown = cd ?? (this.enraged ? 1.1 : 1.6);
  }

  onEvent(ev, game) {
    if (ev === "enrage") {
      game.hud.toast("THE WARDEN IS OVERCLOCKING // HE'S TEARING THE BREACH OPEN", "#ff4455");
      game.audio.tone("sawtooth", 60, 180, 1.2, 0.2);
      game.shake(0.4);
    }
    if (ev === "enrage" || ev === "adds") {
      // reinforcements in both worlds, so hiding in the Breach isn't free any more
      for (const [type, n] of [["drone", 2], ["wraith", 2]]) for (let i = 0; i < n; i++) game.spawnNear(type, this.pos.x, this.pos.z, 4, 10);
    }
  }

  pose(dt) {
    const R = this.rig;
    if (!R) {
      this.root.position.set(this.pos.x, 0, this.pos.z);
      this.root.rotation.y = this.facing;
      return;
    }
    const m = this.move, s = Math.sin(this.walkPh), c = Math.cos(this.walkPh);
    const legL = s * 0.36 * m, legR = -legL;
    const crouch = this.crouch;
    const dyingK = this.dying ? Math.min(1, this.deathT / 1.6) : 0;
    const kneeL = Math.max(0, c) * 0.7 * m + 0.05 + crouch * 0.45 + dyingK * 0.7;
    const kneeR = Math.max(0, -c) * 0.7 * m + 0.05 + crouch * 0.45 + dyingK * 0.5;
    const hipBend = crouch * 0.3 + dyingK * 0.4;
    R.thighL(-legL - hipBend); R.thighR(-legR - hipBend);
    R.shinL(kneeL); R.shinR(kneeR);
    R.footL((legL + hipBend - kneeL) * 0.8); R.footR((legR + hipBend - kneeR) * 0.8);
    if (R.pelvis) R.pelvis.position.y = this.pelvisY + Math.abs(s) * 0.07 * m - crouch * 0.28 - dyingK * 0.55;
    R.spine(this.aimYaw);
    R.chest(-0.04 * (this.recoil[0] + this.recoil[1]) + hipBend * 0.6 + dyingK * 0.35, 0);
    R.head(this.dying ? 0.4 * dyingK : 0, this.headYaw);
    const inward = this.state === "override" ? 1.05 : 0;
    const down = this.state === "dormant" ? 0.35 : this.dying ? 0.6 * dyingK : 0;
    R.armL(down - this.recoil[0] * 0.1 + inward * 0.25, inward);
    R.armR(down - this.recoil[1] * 0.1 + inward * 0.25, -inward);
    for (let i = 0; i < 4; i++) R.cannons[i](this.spin[i]);
    this.root.position.set(this.pos.x, 0, this.pos.z);
    this.root.rotation.y = this.facing;
  }

  glow(game) {
    const mat = this.mat;
    let k = 1.4;
    _c.copy(this.color);
    switch (this.state) {
      case "dormant": k = 0.25; break;
      case "intro": k = 0.25 + (1 - Math.max(0, this.stateT) / 2.2) * 2.2; break;
      case "telegraph": k = 2 + Math.sin(this.t * 32) * 0.9; break;
      case "purgeCharge": _c.lerp(PURGE_COLOR, 1); k = 1.5 + (1 - Math.max(0, this.stateT) / WARDEN.purge.charge) * 3 + Math.sin(this.t * 40) * 0.6; break;
      case "purge": _c.copy(PURGE_COLOR); k = 3.5; break;
      case "override": _c.copy(HACK_COLOR); k = 1.6 + Math.random() * 1.4; break;
      case "search": k = 0.8; break;
      case "stompCharge": k = 1.8 + this.crouch * 2; break;
    }
    if (this.dying) { k = Math.random() < 0.35 ? 3 : 0.3; }
    if (this.enraged && this.state === "hunt") k *= 1.25;
    if (mat.emissive) mat.emissive.copy(_c).multiplyScalar(k).addScalar(this.hitFlash * 1.5);
    mat.color.copy(this.baseColor).multiplyScalar(1 + this.hitFlash * 2.2);
  }
}
