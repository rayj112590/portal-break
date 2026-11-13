// ============================================================
//  PLAYER — movement, dash, aim, and the stand-in model.
//  buildPlayerModel() is the single swap point for a Blender GLB.
// ============================================================
import * as THREE from "three";
import { PLAYER, PALETTE, CITY, BREACH } from "./config.js";
import { instance } from "./models.js";
import { clone as cloneWithSkeleton } from "three/addons/utils/SkeletonUtils.js";

// X-ray silhouette: drawn only where the player is hidden behind the world.
// The real player meshes stamp stencil=1 where visible; the ghost skips those pixels,
// so the model never x-rays through its own overlapping parts.
const ghostMat = new THREE.MeshBasicMaterial({
  color: 0x55e6ff, transparent: true, opacity: 0.35, depthWrite: false, depthFunc: THREE.GreaterDepth,
  stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc, stencilWriteMask: 0x00,
  stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp,
});

function stampStencil(root) {
  root.traverse(o => {
    if (!o.isMesh || o.material === ghostMat) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      m.stencilWrite = true;
      m.stencilRef = 1;
      m.stencilFunc = THREE.AlwaysStencilFunc;
      m.stencilZPass = THREE.ReplaceStencilOp;
    }
  });
}

function part(parent, geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  // x-ray silhouette: only drawn where something is in front of the player
  const g = new THREE.Mesh(geo, ghostMat);
  g.position.copy(m.position);
  g.renderOrder = 10;
  parent.add(g);
  return m;
}

export function buildPlayerModel() {
  const root = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({ color: 0x1c2233, roughness: 0.45, metalness: 0.65 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.8, metalness: 0.1 });
  const trimMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3) });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3) });

  const hipL = new THREE.Group(); hipL.position.set(-0.15, 0.85, 0); root.add(hipL);
  const hipR = new THREE.Group(); hipR.position.set(0.15, 0.85, 0); root.add(hipR);
  const legGeo = new THREE.BoxGeometry(0.2, 0.82, 0.24);
  part(hipL, legGeo, cloth, 0, -0.41, 0);
  part(hipR, legGeo, cloth, 0, -0.41, 0);

  const body = new THREE.Group(); root.add(body);
  part(body, new THREE.BoxGeometry(0.62, 0.66, 0.38), armor, 0, 1.22, 0);
  part(body, new THREE.BoxGeometry(0.64, 0.06, 0.4), trimMat, 0, 1.0, 0);
  part(body, new THREE.BoxGeometry(0.46, 0.48, 0.2), armor, 0, 1.25, -0.28);    // backpack
  part(body, new THREE.BoxGeometry(0.18, 0.3, 0.06), coreMat, 0, 1.27, -0.39);   // phase core
  part(body, new THREE.BoxGeometry(0.32, 0.32, 0.34), armor, 0, 1.75, 0.02);     // head
  part(body, new THREE.BoxGeometry(0.28, 0.08, 0.04), trimMat, 0, 1.78, 0.2);    // visor
  part(body, new THREE.BoxGeometry(0.16, 0.16, 0.16), armor, -0.4, 1.45, 0);     // shoulder L
  part(body, new THREE.BoxGeometry(0.16, 0.16, 0.16), armor, 0.4, 1.45, 0);      // shoulder R

  // gun held forward at hip height
  const gun = new THREE.Group(); gun.position.set(0.26, 1.18, 0.25); body.add(gun);
  part(gun, new THREE.BoxGeometry(0.12, 0.16, 0.72), armor, 0, 0, 0.18);
  part(gun, new THREE.BoxGeometry(0.04, 0.04, 0.5), trimMat, 0.07, 0.03, 0.2);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.02, 0.6); gun.add(muzzle);

  return pivotModel({ root, hipL, hipR, body, gun, muzzle, trimMat, coreMat });
}

// Pose interface shared by every player model:
//   legL/legR  + = swing that foot forward      kneeL/kneeR  + = bend
//   lean       + = lean forward                 bob/breath   small offsets
//   recoil     0..1 gun kick
function pivotModel(parts) {
  const gunBaseZ = parts.gun.position.z;
  parts.pose = p => {
    parts.hipL.rotation.x = -p.legL;
    parts.hipR.rotation.x = -p.legR;
    parts.body.position.y = p.bob;
    parts.body.rotation.x = p.lean;
    parts.gun.position.z = gunBaseZ - p.recoil * 0.6;
  };
  return parts;
}

// Rotates a bone about a model-space axis through its head, on top of its rest pose,
// so the game never needs to know how Blender oriented the bone.
function swinger(bone, modelAxis) {
  const rest = bone.quaternion.clone();
  const pq = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(pq);
  const axis = modelAxis.clone().applyQuaternion(pq.invert()).normalize();
  const q = new THREE.Quaternion();
  return angle => { q.setFromAxisAngle(axis, angle); bone.quaternion.copy(q).multiply(rest); };
}

// Same idea for three model-space axes at once: pitch (X), yaw (Y, outermost) and roll (Z).
function rotator(bone) {
  const rest = bone.quaternion.clone();
  const pq = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(pq);
  pq.invert();
  const ax = new THREE.Vector3(1, 0, 0).applyQuaternion(pq).normalize();
  const ay = new THREE.Vector3(0, 1, 0).applyQuaternion(pq).normalize();
  const az = new THREE.Vector3(0, 0, 1).applyQuaternion(pq).normalize();
  const qx = new THREE.Quaternion(), qy = new THREE.Quaternion(), qz = new THREE.Quaternion();
  return (pitch = 0, yaw = 0, roll = 0) => {
    qy.setFromAxisAngle(ay, yaw); qx.setFromAxisAngle(ax, pitch); qz.setFromAxisAngle(az, roll);
    bone.quaternion.copy(qy).multiply(qx).multiply(qz).multiply(rest);
  };
}

// Blender model (assets/models/player.glb), with x-ray ghosts added per mesh.
function buildPlayerFromGLB() {
  const inst = instance("player");
  if (!inst) return null;
  const meshes = [];
  inst.root.traverse(o => { if (o.isMesh) meshes.push(o); });
  for (const m of meshes) {
    // x-ray ghost; skinned meshes need a skinned ghost bound to the same skeleton
    let g;
    if (m.isSkinnedMesh) { g = new THREE.SkinnedMesh(m.geometry, ghostMat); g.bind(m.skeleton, m.bindMatrix); }
    else g = new THREE.Mesh(m.geometry, ghostMat);
    g.position.copy(m.position); g.quaternion.copy(m.quaternion); g.scale.copy(m.scale);
    g.renderOrder = 10;
    g.frustumCulled = false;
    m.parent.add(g);
    if (m.isSkinnedMesh) m.frustumCulled = false; // skinned bounds don't follow the pose
  }
  const root = new THREE.Group();
  root.add(inst.root);
  const gun = inst.find("Gun"), muzzle = inst.find("Muzzle");
  const trimMat = inst.byRole.Trim?.[0] || new THREE.MeshBasicMaterial();
  const coreMat = inst.byRole.Core?.[0] || new THREE.MeshBasicMaterial();
  if (!gun || !muzzle) return null;

  // --- skinned human (Jax v3): drive bones ---
  const pelvis = inst.find("pelvis");
  if (pelvis) {
    root.updateMatrixWorld(true);
    const X = new THREE.Vector3(1, 0, 0);
    const bone = n => inst.find(n);
    const thighL = swinger(bone("thighL"), X), thighR = swinger(bone("thighR"), X);
    const shinL = swinger(bone("shinL"), X), shinR = swinger(bone("shinR"), X);
    const footL = swinger(bone("footL"), X), footR = swinger(bone("footR"), X);
    const hips = rotator(pelvis), spine = rotator(bone("spine")), chest = rotator(bone("chest")), head = rotator(bone("head"));
    const pelvisY = pelvis.position.y;
    // recoil slides the rifle backwards in model space, expressed in its parent bone's space
    const gunBase = gun.position.clone();
    const pq = new THREE.Quaternion(); gun.parent.getWorldQuaternion(pq);
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(pq.invert());
    return {
      root, gun, muzzle, trimMat, coreMat, skinned: true,
      pose(p) {
        const hipYaw = p.hipYaw || 0, twist = p.twist || 0, roll = p.roll || 0;
        // hips turn toward the walking direction (+ stride twist, + hip drop) ...
        hips(0, hipYaw + twist, roll);
        // ... and the spine/chest unwind it so the upper body keeps aiming, with shoulders countering the hips
        spine(p.lean, -hipYaw * 0.6 - twist * 1.6, -roll * 0.7);
        chest(p.breath - p.recoil * 0.08, -hipYaw * 0.4 - twist * 0.2, -roll * 0.3);
        head(p.nod || 0, 0, 0);
        thighL(-p.legL); thighR(-p.legR);
        shinL(p.kneeL); shinR(p.kneeR);
        // keep feet flatter: cancel most of the thigh + shin pitch
        footL(((p.legL) - p.kneeL) * 0.75); footR(((p.legR) - p.kneeR) * 0.75);
        pelvis.position.y = pelvisY + p.bob;
        gun.position.copy(gunBase).addScaledVector(back, p.recoil * 0.12);
      },
    };
  }

  // --- older rigid model with LegL/LegR/Body pivots ---
  const hipL = inst.find("LegL"), hipR = inst.find("LegR"), body = inst.find("Body");
  if (!hipL || !hipR || !body) return null;
  return pivotModel({ root, hipL, hipR, body, gun, muzzle, trimMat, coreMat });
}

const _v = new THREE.Vector3();

export class Player {
  constructor(scene) {
    this.model = buildPlayerFromGLB() || buildPlayerModel();
    stampStencil(this.model.root);
    scene.add(this.model.root);
    this.scene = scene;
    this.afterimages = [];
    this.light = new THREE.PointLight(0x7fdcff, 14, 12, 1.2); // kept well above the model: too close produced NaN pixels on Intel GPUs
    scene.add(this.light);
    this.muzzleWorld = new THREE.Vector3();
    this.reset({ x: 0, z: 0 });
  }

  reset(spawn) {
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.vel = new THREE.Vector3();
    this.aim = new THREE.Vector3(spawn.x, 1.2, spawn.z + 3);
    this.facing = 0;
    this.hp = PLAYER.hp;
    this.energy = 100;
    this.fireCd = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.dashDir = new THREE.Vector3();
    this.invuln = 0;
    this.walk = 0;
    this.alive = true;
    this.hitFlash = 0;
    this.lock = null; // auto-aim target position (Vector3) or null
  }

  get radius() { return PLAYER.radius; }

  // where the gun points: the auto-aim lock if there is one, otherwise the cursor
  get aimPoint() { return this.lock || this.aim; }

  update(dt, input, world, phase) {
    // movement input in world space (camera looks north, so W = -z)
    let mx = 0, mz = 0;
    if (input.down("KeyW") || input.down("ArrowUp")) mz -= 1;
    if (input.down("KeyS") || input.down("ArrowDown")) mz += 1;
    if (input.down("KeyA") || input.down("ArrowLeft")) mx -= 1;
    if (input.down("KeyD") || input.down("ArrowRight")) mx += 1;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }

    // "Facing" movement: W runs toward the mouse, S backs away, A/D strafe around it.
    // Uses the cursor (not the auto-aim lock) so holding fire doesn't yank you off course.
    if (this.relativeMove && len > 0) {
      const dx = this.aim.x - this.pos.x, dz = this.aim.z - this.pos.z;
      if (dx * dx + dz * dz > 0.36) this.moveHeading = Math.atan2(dx, dz);
      const f = this.moveHeading ?? this.facing;
      const fx = Math.sin(f), fz = Math.cos(f);     // forward
      const rx = -fz, rz = fx;                      // his right-hand side
      const fwd = -mz, side = mx;
      mx = fx * fwd + rx * side;
      mz = fz * fwd + rz * side;
    }

    this.dashCd = Math.max(0, this.dashCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 4);

    let dashed = false;
    if (input.pressed("Space") && this.dashCd <= 0) {
      if (len > 0) this.dashDir.set(mx, 0, mz);
      else this.dashDir.set(this.aim.x - this.pos.x, 0, this.aim.z - this.pos.z).normalize();
      this.dashT = PLAYER.dashTime;
      this.dashCd = PLAYER.dashCooldown;
      this.invuln = Math.max(this.invuln, PLAYER.dashTime + 0.05);
      dashed = true;
    }

    let vx, vz;
    if (this.dashT > 0) {
      this.dashT -= dt;
      vx = this.dashDir.x * PLAYER.dashSpeed;
      vz = this.dashDir.z * PLAYER.dashSpeed;
    } else {
      // snappy acceleration
      const k = 1 - Math.exp(-dt * 18);
      this.vel.x += (mx * PLAYER.speed - this.vel.x) * k;
      this.vel.z += (mz * PLAYER.speed - this.vel.z) * k;
      vx = this.vel.x; vz = this.vel.z;
    }
    world.move(this.pos, vx * dt, vz * dt, PLAYER.radius, phase, "walk");

    // face the cursor (or the auto-aim target)
    const ap = this.aimPoint;
    const target = Math.atan2(ap.x - this.pos.x, ap.z - this.pos.z);
    let diff = target - this.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.facing += diff * Math.min(1, dt * 22);

    // animate
    const m = this.model;
    const speed = Math.hypot(vx, vz);
    this.walk += dt * speed * 1.55;
    this.idleT = (this.idleT || 0) + dt;
    const move = Math.min(1, speed / PLAYER.speed);
    const swing = move * 0.62;
    // Where is he walking relative to where he's aiming? Hips point that way (within limits),
    // the upper body keeps aiming. Walking mostly backwards = backpedal: hips face forward, stride reverses.
    let rel = Math.atan2(vx, vz) - this.facing;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    const backpedal = Math.abs(rel) > 1.95;
    if (backpedal) rel += rel > 0 ? -Math.PI : Math.PI;
    const targetYaw = move > 0.15 ? THREE.MathUtils.clamp(rel, -1.15, 1.15) : 0;
    this.legYaw = (this.legYaw || 0) + (targetYaw - (this.legYaw || 0)) * Math.min(1, dt * 10);
    const dir = backpedal ? -1 : 1;
    const s = Math.sin(this.walk), c = Math.cos(this.walk);
    const legL = s * swing * dir, legR = -s * swing * dir;
    m.pose({
      legL, legR,
      kneeL: Math.max(0, c * dir) * swing * 1.25 + 0.05,   // knee bends as that leg swings through
      kneeR: Math.max(0, -c * dir) * swing * 1.25 + 0.05,
      hipYaw: this.legYaw,
      twist: s * 0.1 * move,                                // hips twist with the stride, shoulders counter
      roll: s * 0.05 * move + Math.sin(this.idleT * 0.7) * 0.025 * (1 - move),   // hip drop / idle weight shift
      nod: -Math.abs(s) * 0.06 * move,
      lean: this.dashT > 0 ? 0.3 : move * 0.09 * (backpedal ? -0.5 : 1),
      bob: Math.abs(s) * 0.035 * move,
      breath: Math.sin(this.idleT * 2.1) * 0.02 * (1 - move),
      recoil: Math.max(0, this.fireCd * 2 - 0.1),
    });
    m.root.position.copy(this.pos);
    m.root.rotation.y = this.facing;

    const col = phase === CITY ? PALETTE[CITY].accent : PALETTE[BREACH].accent;
    m.coreMat.color.copy(col).multiplyScalar(1.7);   // accents, not floodlights: keeps him reading as a person
    if (this.hitFlash > 0) m.trimMat.color.setRGB(4, 4, 4);
    else m.trimMat.color.copy(col).multiplyScalar(1.15);
    ghostMat.color.copy(col);
    m.root.visible = true; // no hit-blink (photosensitivity)

    this.light.position.set(this.pos.x, 4.5, this.pos.z + 1.2);
    this.light.color.copy(col);

    m.muzzle.getWorldPosition(this.muzzleWorld);
    this.updateAfterimages(dt);
    return { dashed };
  }

  // "Dead in the system": a frozen wireframe copy of Jax, left behind like a stale data trace.
  spawnAfterimage(color) {
    const ghost = cloneWithSkeleton(this.model.root);
    // soft translucent silhouette (a dense wireframe reads as a blinding solid blob under bloom)
    const mat = new THREE.MeshBasicMaterial({
      color: color.clone().multiplyScalar(0.7), transparent: true, opacity: 0.22, depthWrite: false,
    });
    ghost.traverse(o => {
      if (!o.isMesh) return;
      if (o.material === ghostMat) { o.visible = false; return; }
      o.material = mat; o.castShadow = false; o.renderOrder = 5; o.frustumCulled = false;
    });
    this.scene.add(ghost);
    this.afterimages.push({ obj: ghost, mat, t: 0 });
  }

  updateAfterimages(dt) {
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i];
      a.t += dt;
      const k = a.t / 0.55;
      if (k >= 1) { this.scene.remove(a.obj); a.mat.dispose(); this.afterimages.splice(i, 1); continue; }
      a.mat.opacity = 0.22 * (1 - k);
      a.obj.position.y = k * 0.25;
    }
  }

  aimDir() {
    const ap = this.aimPoint;
    _v.set(ap.x - this.muzzleWorld.x, 0, ap.z - this.muzzleWorld.z);
    if (_v.lengthSq() < 0.01) _v.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    // if the aim point is very close, fire along facing to avoid shooting backwards
    const toCursor = Math.hypot(ap.x - this.pos.x, ap.z - this.pos.z);
    if (toCursor < 1.0) _v.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    return _v.normalize();
  }
}
