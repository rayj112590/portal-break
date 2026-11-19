// ============================================================
//  FX — particles, weather, shockwaves, light flashes, bullets
// ============================================================
import * as THREE from "three";
import { glowSprite } from "./textures.js";

const glow = glowSprite();

// ---------- GPU-drawn, CPU-simulated particle pool ----------
export class Particles {
  constructor(scene, max = 2000) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.cursor = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("pcolor", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("psize", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("palpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    this.uniforms = { map: { value: glow }, uScale: { value: 600 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: `
        attribute vec3 pcolor; attribute float psize; attribute float palpha;
        uniform float uScale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = pcolor; vAlpha = palpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = psize * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D map; varying vec3 vColor; varying float vAlpha;
        void main() {
          float a = texture2D(map, gl_PointCoord).a * vAlpha;
          gl_FragColor = vec4(vColor * a, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit({ x, y, z, count = 10, speed = 5, up = 2, color = [1, 1, 1], size = 0.3, life = 0.5, gravity = -9, drag = 2, dir = null, spread = Math.PI }) {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      let a, s = speed * (0.4 + Math.random() * 0.8);
      if (dir) a = Math.atan2(dir.z, dir.x) + (Math.random() - 0.5) * spread;
      else a = Math.random() * Math.PI * 2;
      this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
      this.vel[i * 3] = Math.cos(a) * s;
      this.vel[i * 3 + 1] = up * (0.3 + Math.random());
      this.vel[i * 3 + 2] = Math.sin(a) * s;
      const k = 0.8 + Math.random() * 0.4;
      this.col[i * 3] = color[0] * k; this.col[i * 3 + 1] = color[1] * k; this.col[i * 3 + 2] = color[2] * k;
      this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.8);
      this.baseSize[i] = size * (0.6 + Math.random() * 0.8);
      this.grav[i] = gravity;
      this.drag[i] = drag;
    }
  }

  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d;
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.03) { this.pos[i * 3 + 1] = 0.03; this.vel[i * 3 + 1] *= -0.35; }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = t;
      this.size[i] = this.baseSize[i] * (0.4 + 0.6 * t);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.pcolor.needsUpdate = true;
    this.geo.attributes.psize.needsUpdate = true;
    this.geo.attributes.palpha.needsUpdate = true;
  }
}

// ---------- rain (city) + embers (breach) ----------
export class Weather {
  constructor(scene) {
    const drops = 1400;
    this.drops = drops;
    this.rainPos = new Float32Array(drops * 6);
    this.rainSpeed = new Float32Array(drops);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0x9fc8ff, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
    this.rain = new THREE.LineSegments(geo, this.rainMat);
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    this.rainGeo = geo;

    const embers = 500;
    this.embers = embers;
    this.emberPos = new Float32Array(embers * 3);
    this.emberVel = new Float32Array(embers * 3);
    const egeo = new THREE.BufferGeometry();
    egeo.setAttribute("position", new THREE.BufferAttribute(this.emberPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.emberMat = new THREE.PointsMaterial({ map: glow, color: new THREE.Color(2.4, 0.5, 0.35), size: 0.22, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ember = new THREE.Points(egeo, this.emberMat);
    this.ember.frustumCulled = false;
    scene.add(this.ember);
    this.emberGeo = egeo;
    this.seeded = false;
  }

  seed(cx, cz) {
    for (let i = 0; i < this.drops; i++) this.resetDrop(i, cx, cz, Math.random() * 20);
    for (let i = 0; i < this.embers; i++) this.resetEmber(i, cx, cz, true);
    this.seeded = true;
  }

  resetDrop(i, cx, cz, y = 20) {
    const x = cx + (Math.random() - 0.5) * 50, z = cz + (Math.random() - 0.5) * 44 - 4;
    const p = this.rainPos, o = i * 6;
    p[o] = x; p[o + 1] = y; p[o + 2] = z;
    p[o + 3] = x + 0.12; p[o + 4] = y + 0.9; p[o + 5] = z + 0.05;
    this.rainSpeed[i] = 26 + Math.random() * 10;
  }

  resetEmber(i, cx, cz, anyY = false) {
    const o = i * 3;
    this.emberPos[o] = cx + (Math.random() - 0.5) * 46;
    this.emberPos[o + 1] = anyY ? Math.random() * 10 : -0.5 - Math.random() * 3;
    this.emberPos[o + 2] = cz + (Math.random() - 0.5) * 40 - 3;
    this.emberVel[o] = (Math.random() - 0.5) * 0.6;
    this.emberVel[o + 1] = 0.6 + Math.random() * 1.4;
    this.emberVel[o + 2] = (Math.random() - 0.5) * 0.6;
  }

  update(dt, cx, cz, blend) {
    if (!this.seeded) this.seed(cx, cz);
    this.rainMat.opacity = 0.32 * (1 - blend);
    this.emberMat.opacity = blend;
    if (blend < 0.99) {
      const p = this.rainPos;
      for (let i = 0; i < this.drops; i++) {
        const o = i * 6, dy = this.rainSpeed[i] * dt;
        p[o + 1] -= dy; p[o + 4] -= dy; p[o] -= dy * 0.12; p[o + 3] -= dy * 0.12;
        if (p[o + 1] < 0 || Math.abs(p[o] - cx) > 28 || Math.abs(p[o + 2] - cz) > 26) this.resetDrop(i, cx, cz);
      }
      this.rainGeo.attributes.position.needsUpdate = true;
    }
    if (blend > 0.01) {
      const p = this.emberPos, v = this.emberVel, t = performance.now() / 1000;
      for (let i = 0; i < this.embers; i++) {
        const o = i * 3;
        p[o] += (v[o] + Math.sin(t + i) * 0.4) * dt;
        p[o + 1] += v[o + 1] * dt;
        p[o + 2] += v[o + 2] * dt;
        if (p[o + 1] > 12 || Math.abs(p[o] - cx) > 26 || Math.abs(p[o + 2] - cz) > 24) this.resetEmber(i, cx, cz);
      }
      this.emberGeo.attributes.position.needsUpdate = true;
    }
  }
}

// ---------- shockwave rings ----------
export class Shockwaves {
  constructor(scene) {
    this.pool = [];
    const geo = new THREE.RingGeometry(0.85, 1, 64);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      this.pool.push({ m, t: 0, dur: 1, max: 1 });
    }
    this.i = 0;
  }
  spawn(x, z, color, max = 14, dur = 0.55) {
    const s = this.pool[this.i];
    this.i = (this.i + 1) % this.pool.length;
    s.m.position.set(x, 0.08, z);
    s.m.material.color.copy(color).multiplyScalar(2.5);
    s.m.visible = true;
    s.t = 0; s.dur = dur; s.max = max;
  }
  update(dt) {
    for (const s of this.pool) {
      if (!s.m.visible) continue;
      s.t += dt;
      const k = s.t / s.dur;
      if (k >= 1) { s.m.visible = false; continue; }
      const e = 1 - Math.pow(1 - k, 3);
      s.m.scale.setScalar(0.3 + e * s.max);
      s.m.material.opacity = 1 - k;
    }
  }
}

// ---------- pooled flash lights (explosions, muzzle) ----------
export class Flashes {
  constructor(scene, n = 3) {
    this.pool = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 1.8);
      scene.add(l);
      this.pool.push({ l, t: 0, dur: 1, peak: 0 });
    }
    this.i = 0;
  }
  flash(x, y, z, color, peak = 30, dur = 0.25, range = 10) {
    const f = this.pool[this.i];
    this.i = (this.i + 1) % this.pool.length;
    f.l.position.set(x, y, z);
    f.l.color.set(color);
    f.l.distance = range;
    f.t = 0; f.dur = dur; f.peak = peak;
  }
  update(dt) {
    for (const f of this.pool) {
      if (f.t >= f.dur) { f.l.intensity = 0; continue; }
      f.t += dt;
      f.l.intensity = f.peak * Math.max(0, 1 - f.t / f.dur);
    }
  }
}

// ---------- projectiles ----------
const _up = new THREE.Vector3(0, 1, 0);
export class Projectiles {
  constructor(scene, max = 240) {
    this.list = [];
    const geo = new THREE.BoxGeometry(0.09, 0.09, 0.9);
    const glowGeo = new THREE.PlaneGeometry(0.7, 0.7);
    for (let i = 0; i < max; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const m = new THREE.Mesh(geo, mat);
      const halo = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ map: glow, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      halo.rotation.x = -Math.PI / 2;
      m.add(halo);
      m.visible = false;
      scene.add(m);
      this.list.push({ m, halo, active: false, x: 0, z: 0, y: 1.2, vx: 0, vz: 0, life: 0, damage: 0, phase: 0, friendly: true, radius: 0.18 });
    }
  }

  // pierce: how many enemies the round punches through before it stops (rail gun)
  // life: seconds before it fizzles (the Warden's purge rings fly further)
  spawn({ x, z, y = 1.2, dx, dz, speed, damage, phase, friendly, color, size = 1, pierce = 0, life = 1.6 }) {
    const p = this.list.find(b => !b.active);
    if (!p) return null;
    p.active = true;
    p.x = x; p.z = z; p.y = y;
    p.vx = dx * speed; p.vz = dz * speed;
    p.life = life;
    p.damage = damage; p.phase = phase; p.friendly = friendly;
    p.pierce = pierce; p.hits = pierce ? new Set() : null;
    p.radius = friendly ? 0.18 : 0.28;
    p.m.visible = true;
    p.m.material.color.copy(color).multiplyScalar(friendly ? 4 : 3);
    p.halo.material.color.copy(color).multiplyScalar(friendly ? 0.8 : 1.4);
    p.m.scale.set(size * (friendly ? 1 : 2.2), size * (friendly ? 1 : 2.2), size * (friendly ? 1 : 0.6));
    p.halo.scale.setScalar(friendly ? 1 : 1.6);
    p.m.position.set(x, y, z);
    p.m.lookAt(x + dx, y, z + dz);
    return p;
  }

  kill(p) { p.active = false; p.m.visible = false; }

  clearEnemy() { for (const p of this.list) if (p.active && !p.friendly) this.kill(p); }
}
