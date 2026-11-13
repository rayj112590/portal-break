// ============================================================
//  WORLD — builds a district from its ASCII map and answers
//  "is this tile solid in this phase?" for everything else.
// ============================================================
import * as THREE from "three";
import { TILE, CITY, BREACH, PALETTE } from "./config.js";
import { instance, hasModel } from "./models.js";
import {
  rng, groundTextures, facadeTextures, roofTexture, signTexture,
  barrierTexture, bridgeTexture, glowSprite,
} from "./textures.js";

const FLOOR_H = 1.2;
const HEIGHT_CLASSES = [2, 4, 6]; // floors
const LAMP_POOL = 8;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _c2 = new THREE.Color();
const VENT = { period: 2.6, on: 0.9, warn: 0.6 }; // seconds

// Tall soft light column that marks an objective above the rooftops.
let beamTex = null;
function makeBeam(color) {
  if (!beamTex) {
    const c = document.createElement("canvas");
    c.width = 4; c.height = 128;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.35)");
    grad.addColorStop(1, "rgba(255,255,255,1)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 128);
    beamTex = new THREE.CanvasTexture(c);
  }
  const mat = new THREE.MeshBasicMaterial({
    map: beamTex, color: color.clone().multiplyScalar(1.6), transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 16, 12, 1, true), mat);
  beam.position.y = 8;
  beam.renderOrder = 3;
  return beam;
}

export class World {
  constructor(scene, renderer, level) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.grid = level.map.map(row => row.split(""));
    this.level = level;
    this.rows = this.grid.length;
    this.cols = this.grid[0].length;
    this.width = this.cols * TILE;
    this.depth = this.rows * TILE;
    this.rand = rng(4242);
    this.time = 0;
    this.lastBlend = -1;

    this.spawns = { player: null, enemies: [], terminals: [], exit: null, lamps: [] };
    this.locksDone = 0; // security gates 1/2/3 stay shut until this many locks are hacked
    this.parseEntities();
    this.buildEnvironments(renderer);
    this.buildLights();
    this.buildGround();
    this.buildAbyss();
    this.buildBuildings();
    this.buildCrates();
    this.buildBarriers();
    this.buildCrystals();
    this.buildBridge();
    this.buildGlass();
    this.buildLamps();
    this.buildTerminals();
    this.buildExit();
    this.buildGates();
    this.buildVents();
    this.buildPods();
    this.buildVault();
    this.buildCard();
    this.computeLockTiers();
  }

  // ---------- grid helpers ----------
  inside(r, c) { return r >= 0 && c >= 0 && r < this.rows && c < this.cols; }
  ch(r, c) { return this.inside(r, c) ? this.grid[r][c] : "#"; }
  center(r, c) { return { x: c * TILE + TILE / 2, z: r * TILE + TILE / 2 }; }
  toTile(x, z) { return [Math.floor(z / TILE), Math.floor(x / TILE)]; }

  // mode: "walk" (ground units), "fly" (drones), "shot" (bullets)
  solid(r, c, phase, mode) {
    const ch = this.ch(r, c);
    switch (ch) {
      case "#": return true;
      case "c": return mode !== "fly";
      case "T": case "R": return true;
      case "A": return phase === CITY;
      case "B": return phase === BREACH;
      case "~": return mode === "walk";
      case "b": return mode === "walk" && phase === CITY;
      case "v": return mode === "walk" && phase === BREACH;
      case "1": case "2": case "3": return Number(ch) > this.locksDone;
      case "o": case "O": return mode !== "fly";   // hypersleep pods
      case "g": return true;                         // security glass: sealed in both worlds
      default: return false;
    }
  }

  overlaps(x, z, radius, phase, mode) {
    const r0 = Math.floor((z - radius) / TILE), r1 = Math.floor((z + radius) / TILE);
    const c0 = Math.floor((x - radius) / TILE), c1 = Math.floor((x + radius) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!this.solid(r, c, phase, mode)) continue;
        const nx = Math.max(c * TILE, Math.min(x, c * TILE + TILE));
        const nz = Math.max(r * TILE, Math.min(z, r * TILE + TILE));
        const dx = x - nx, dz = z - nz;
        if (dx * dx + dz * dz < radius * radius) return true;
      }
    }
    return false;
  }

  // Moves pos by (dx, dz), sliding along walls. Returns true if blocked.
  move(pos, dx, dz, radius, phase, mode) {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / 0.2));
    const sx = dx / steps, sz = dz / steps;
    let blocked = false;
    for (let i = 0; i < steps; i++) {
      pos.x += sx;
      if (this.overlaps(pos.x, pos.z, radius, phase, mode)) { pos.x -= sx; blocked = true; }
      pos.z += sz;
      if (this.overlaps(pos.x, pos.z, radius, phase, mode)) { pos.z -= sz; blocked = true; }
    }
    return blocked;
  }

  lineOfSight(x0, z0, x1, z1, phase) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const steps = Math.ceil(d / 0.4);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const [r, c] = this.toTile(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
      if (this.solid(r, c, phase, "shot")) return false;
    }
    return true;
  }

  // BFS distance field toward (tr, tc) for ground units in a phase.
  flowField(phase, tr, tc) {
    const n = this.rows * this.cols;
    const dist = new Int32Array(n).fill(-1);
    if (!this.inside(tr, tc)) return dist;
    const queue = new Int32Array(n);
    let head = 0, tail = 0;
    dist[tr * this.cols + tc] = 0;
    queue[tail++] = tr * this.cols + tc;
    while (head < tail) {
      const i = queue[head++];
      const r = (i / this.cols) | 0, c = i % this.cols;
      const d = dist[i] + 1;
      const nb = [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]];
      for (const [nr, nc] of nb) {
        if (!this.inside(nr, nc) || this.solid(nr, nc, phase, "walk")) continue;
        const j = nr * this.cols + nc;
        if (dist[j] !== -1) continue;
        dist[j] = d;
        queue[tail++] = j;
      }
    }
    return dist;
  }

  randomOpenTileNear(x, z, minD, maxD, phase, mode = "walk") {
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = minD + Math.random() * (maxD - minD);
      const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
      const [r, c] = this.toTile(px, pz);
      if (!this.inside(r, c) || this.solid(r, c, phase, mode)) continue;
      const ctr = this.center(r, c);
      if (!this.overlaps(ctr.x, ctr.z, 0.6, phase, mode)) return ctr;
    }
    return null;
  }

  // ---------- parsing ----------
  parseEntities() {
    const types = { d: "drone", t: "turret", w: "wraith", r: "riftTurret" };
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = this.grid[r][c];
        const p = this.center(r, c);
        if (ch === "P") this.spawns.player = p;
        else if (types[ch]) this.spawns.enemies.push({ type: types[ch], ...p });
        else if (ch === "T" || ch === "R") this.spawns.terminals.push({ r, c, ...p, phase: ch === "T" ? CITY : BREACH });
        else if (ch === "X") this.spawns.exit = p;
        else if (ch === "L") this.spawns.lamps.push(p);
      }
    }
  }

  isFloorish(r, c) {
    const ch = this.ch(r, c);
    return !"#~bv".includes(ch);
  }

  // ---------- environment maps (wet reflections) ----------
  buildEnvironments(renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMaps = [CITY, BREACH].map(phase => {
      const s = new THREE.Scene();
      s.background = new THREE.Color(phase === CITY ? 0x05070f : 0x0c0206);
      const cols = phase === CITY ? [0x30e0ff, 0xff3fb4, 0xffb347, 0x4060ff] : [0xff2050, 0xb040ff, 0xff6a20, 0xff0040];
      for (let i = 0; i < 14; i++) {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(1 + Math.random() * 3, 0.4 + Math.random()),
          new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i % cols.length]).multiplyScalar(3), side: THREE.DoubleSide })
        );
        const a = (i / 14) * Math.PI * 2;
        m.position.set(Math.cos(a) * 8, 1 + Math.random() * 4, Math.sin(a) * 8);
        m.lookAt(0, 2, 0);
        s.add(m);
      }
      const rt = pmrem.fromScene(s, 0.04);
      return rt.texture;
    });
    pmrem.dispose();
    this.scene.environment = this.envMaps[CITY];
  }

  // ---------- lights ----------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(PALETTE[CITY].hemiSky, PALETTE[CITY].hemiGround, 2.1);
    this.group.add(this.hemi);

    this.moon = new THREE.DirectionalLight(PALETTE[CITY].moon, 2.3);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(2048, 2048);
    const sc = this.moon.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 26; sc.bottom = -26; sc.near = 1; sc.far = 80;
    this.moon.shadow.bias = -0.0006;
    this.moon.shadow.normalBias = 0.03;
    this.group.add(this.moon, this.moon.target);
  }

  followShadow(x, z) {
    this.moon.position.set(x - 14, 34, z - 10);
    this.moon.target.position.set(x, 0, z);
  }

  // ---------- ground (skips void tiles so the abyss shows through) ----------
  buildGround() {
    const { map, roughness } = groundTextures(this.cols, this.rows);
    map.repeat.set(1, 1); roughness.repeat.set(1, 1);
    const pos = [], uv = [], idx = [];
    let v = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = this.grid[r][c];
        if (ch === "~" || ch === "b" || ch === "v") continue;
        const x0 = c * TILE, x1 = x0 + TILE, z0 = r * TILE, z1 = z0 + TILE;
        pos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
        const u0 = c / this.cols, u1 = (c + 1) / this.cols, v0 = 1 - r / this.rows, v1 = 1 - (r + 1) / this.rows;
        uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        idx.push(v, v + 2, v + 1, v, v + 3, v + 2);
        v += 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      map, roughnessMap: roughness, roughness: 1, metalness: 0.4, envMapIntensity: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  buildAbyss() {
    const depth = 14;
    // pit walls along every void edge
    const wallGeo = new THREE.PlaneGeometry(TILE, depth);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0b0e17, roughness: 0.9, metalness: 0.2 });
    const edges = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const ch = this.grid[r][c];
        if (ch !== "~" && ch !== "b" && ch !== "v") continue;
        const dirs = [[-1, 0, 0], [1, 0, Math.PI], [0, -1, Math.PI / 2], [0, 1, -Math.PI / 2]];
        for (const [dr, dc, rot] of dirs) {
          const n = this.ch(r + dr, c + dc);
          if (n === "~" || n === "b" || n === "v") continue;
          const ctr = this.center(r, c);
          edges.push({ x: ctr.x + dc * TILE / 2, z: ctr.z + dr * TILE / 2, rot });
        }
      }
    }
    const walls = new THREE.InstancedMesh(wallGeo, wallMat, Math.max(1, edges.length));
    const stripGeo = new THREE.BoxGeometry(TILE, 0.06, 0.06);
    this.edgeStripMat = new THREE.MeshBasicMaterial({ color: PALETTE[CITY].accent.clone().multiplyScalar(2.2) });
    const strips = new THREE.InstancedMesh(stripGeo, this.edgeStripMat, Math.max(1, edges.length));
    edges.forEach((e, i) => {
      _q.setFromEuler(new THREE.Euler(0, e.rot, 0));
      _m.compose(_p.set(e.x, -depth / 2, e.z), _q, _s.set(1, 1, 1));
      walls.setMatrixAt(i, _m);
      _m.compose(_p.set(e.x, 0.03, e.z), _q, _s.set(1, 1, 1));
      strips.setMatrixAt(i, _m);
    });
    walls.count = strips.count = edges.length;
    this.group.add(walls, strips);

    // far-below floor with distant lights
    this.abyssMat = new THREE.MeshBasicMaterial({ color: 0x04060d });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(this.width * 1.5, this.depth * 1.5), this.abyssMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.width / 2, -depth, this.depth / 2);
    this.group.add(floor);

    const dots = 160;
    this.abyssDotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb347).multiplyScalar(3) });
    const dotMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), this.abyssDotMat, dots);
    let n = 0;
    for (let r = 0; r < this.rows && n < dots; r++) {
      for (let c = 0; c < this.cols && n < dots; c++) {
        const ch = this.grid[r][c];
        if (ch !== "~" && ch !== "b" && ch !== "v") continue;
        for (let k = 0; k < 2 && n < dots; k++) {
          _m.compose(_p.set(c * TILE + this.rand() * TILE, -depth + 0.2 + this.rand() * 3, r * TILE + this.rand() * TILE), _q.identity(), _s.set(1, 1, 1));
          dotMesh.setMatrixAt(n++, _m);
        }
      }
    }
    dotMesh.count = n;
    this.group.add(dotMesh);
  }

  // ---------- buildings ----------
  buildBuildings() {
    const buckets = HEIGHT_CLASSES.map(() => []);
    const signSpots = [];
    const stripSpots = [];
    const roofSpots = [];

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] !== "#") continue;
        const nearFloor = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => this.isFloorish(r + dr, c + dc));
        let cls;
        if (r >= this.rows - 2) cls = 0;              // keep the camera side low
        else if (!nearFloor) cls = this.rand() < 0.55 ? 2 : 1;
        else cls = this.rand() < 0.45 ? 0 : (this.rand() < 0.7 ? 1 : 2);
        if (r >= this.rows - 3 && cls === 2) cls = 1;
        const h = HEIGHT_CLASSES[cls] * FLOOR_H;
        buckets[cls].push({ r, c, h });
        const ctr = this.center(r, c);

        // signs + neon strips on faces that look onto a street
        const faces = [
          { dr: 1, dc: 0, rot: 0 }, { dr: 0, dc: 1, rot: Math.PI / 2 }, { dr: 0, dc: -1, rot: -Math.PI / 2 },
        ];
        for (const f of faces) {
          if (!this.isFloorish(r + f.dr, c + f.dc)) continue;
          const fx = ctr.x + f.dc * (TILE / 2 + 0.03), fz = ctr.z + f.dr * (TILE / 2 + 0.03);
          if (this.rand() < 0.16 && h > 2) signSpots.push({ x: fx, z: fz, rot: f.rot, y: 1.7 + this.rand() * (h - 2.4) });
          if (this.rand() < 0.35) stripSpots.push({ x: fx, z: fz, rot: f.rot, y: this.rand() < 0.5 ? h - 0.08 : 0.28 });
        }
        if (cls > 0 && this.rand() < 0.4) roofSpots.push({ x: ctr.x, z: ctr.z, h });
      }
    }

    const geo = new THREE.BoxGeometry(TILE, 1, TILE);
    geo.translate(0, 0.5, 0);
    const roof = new THREE.MeshStandardMaterial({ map: roofTexture(), roughness: 0.85, metalness: 0.3 });
    const bottom = new THREE.MeshBasicMaterial({ color: 0x000000 });
    this.buildingMeshes = [];
    HEIGHT_CLASSES.forEach((floors, cls) => {
      const list = buckets[cls];
      if (!list.length) return;
      const { map, emissive } = facadeTextures(floors, 100 + cls);
      const side = new THREE.MeshStandardMaterial({
        map, emissiveMap: emissive, emissive: 0xffffff, emissiveIntensity: 1.6,
        roughness: 0.75, metalness: 0.35, envMapIntensity: 0.4,
      });
      const mesh = new THREE.InstancedMesh(geo, [side, side, roof, bottom, side, side], list.length);
      list.forEach((b, i) => {
        const ctr = this.center(b.r, b.c);
        _m.compose(_p.set(ctr.x, 0, ctr.z), _q.identity(), _s.set(1, b.h, 1));
        mesh.setMatrixAt(i, _m);
        const tint = 0.75 + this.rand() * 0.35;
        mesh.setColorAt(i, _c.setRGB(tint, tint, tint * 1.05));
      });
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.buildingMeshes.push(mesh);
    });

    // neon signs
    this.signs = [];
    const signTex = Array.from({ length: 10 }, (_, i) => signTexture(i));
    const signGeo = new THREE.PlaneGeometry(1.7, 0.64);
    signSpots.forEach((s, i) => {
      const st = signTex[i % signTex.length];
      const mat = new THREE.MeshBasicMaterial({ map: st.tex, color: new THREE.Color(2.4, 2.4, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const m = new THREE.Mesh(signGeo, mat);
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = s.rot;
      this.group.add(m);
      this.signs.push({ mat, flicker: false, seed: this.rand() * 100 });
    });

    // neon strips
    const stripGeo = new THREE.BoxGeometry(TILE, 0.07, 0.07);
    this.stripMats = PALETTE[CITY].lamps.map(col => new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.6) }));
    const stripBuckets = this.stripMats.map(() => []);
    stripSpots.forEach((s, i) => stripBuckets[Math.floor(this.rand() * 3)].push(s));
    stripBuckets.forEach((list, k) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(stripGeo, this.stripMats[k], list.length);
      list.forEach((s, i) => {
        _q.setFromEuler(new THREE.Euler(0, s.rot, 0));
        _m.compose(_p.set(s.x, s.y, s.z), _q, _s.set(1, 1, 1));
        mesh.setMatrixAt(i, _m);
      });
      this.group.add(mesh);
    });

    // rooftop clutter + antenna beacons
    const acGeo = new THREE.BoxGeometry(0.8, 0.5, 0.6);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x272d3c, roughness: 0.7, metalness: 0.5 });
    const ac = new THREE.InstancedMesh(acGeo, acMat, Math.max(1, roofSpots.length));
    const beacons = roofSpots.filter(() => this.rand() < 0.3);
    this.beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.3) });
    const beacon = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 6, 6), this.beaconMat, Math.max(1, beacons.length));
    const antenna = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 4), acMat, Math.max(1, beacons.length));
    roofSpots.forEach((s, i) => {
      _q.setFromEuler(new THREE.Euler(0, this.rand() * Math.PI, 0));
      _m.compose(_p.set(s.x + (this.rand() - 0.5), s.h + 0.25, s.z + (this.rand() - 0.5)), _q, _s.set(1, 1, 1));
      ac.setMatrixAt(i, _m);
    });
    beacons.forEach((s, i) => {
      _m.compose(_p.set(s.x + 0.6, s.h + 0.8, s.z - 0.6), _q.identity(), _s.set(1, 1, 1));
      antenna.setMatrixAt(i, _m);
      _m.compose(_p.set(s.x + 0.6, s.h + 1.62, s.z - 0.6), _q.identity(), _s.set(1, 1, 1));
      beacon.setMatrixAt(i, _m);
    });
    ac.count = roofSpots.length;
    beacon.count = antenna.count = beacons.length;
    ac.castShadow = true;
    this.group.add(ac, beacon, antenna);
  }

  buildCrates() {
    const spots = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c] === "c") spots.push(this.center(r, c));
    if (!spots.length) return;
    if (hasModel("crate")) return this.buildCratesFromModel(spots);
    const geo = new THREE.BoxGeometry(1.7, 1.15, 1.7);
    geo.translate(0, 0.575, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f4f, roughness: 0.6, metalness: 0.6 });
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const stripe = new THREE.InstancedMesh(new THREE.BoxGeometry(1.72, 0.08, 1.72), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.6, 0.3) }), spots.length);
    spots.forEach((s, i) => {
      _q.setFromEuler(new THREE.Euler(0, (this.rand() - 0.5) * 0.3, 0));
      _m.compose(_p.set(s.x, 0, s.z), _q, _s.set(1, 1, 1));
      mesh.setMatrixAt(i, _m);
      const t = 0.7 + this.rand() * 0.5;
      mesh.setColorAt(i, _c.setRGB(t, t * 0.95, t * 0.9));
      _m.compose(_p.set(s.x, 0.85, s.z), _q, _s.set(1, 1, 1));
      stripe.setMatrixAt(i, _m);
    });
    mesh.castShadow = mesh.receiveShadow = true;
    this.group.add(mesh, stripe);
  }

  // SolidCraft crate (assets/models/crate.glb): one InstancedMesh per part, so every crate in
  // the district is drawn in a handful of draw calls.
  buildCratesFromModel(spots) {
    const inst = instance("crate");
    inst.root.updateMatrixWorld(true);
    const parts = [];
    inst.root.traverse(o => { if (o.isMesh) parts.push(o); });
    const rots = spots.map(() => (Math.floor(this.rand() * 4) * Math.PI) / 2 + (this.rand() - 0.5) * 0.12);
    for (const part of parts) {
      const geo = part.geometry.clone().applyMatrix4(part.matrixWorld);
      const mesh = new THREE.InstancedMesh(geo, part.material, spots.length);
      spots.forEach((s, i) => {
        _q.setFromEuler(new THREE.Euler(0, rots[i], 0));
        _m.compose(_p.set(s.x, 0, s.z), _q, _s.set(1, 1, 1));
        mesh.setMatrixAt(i, _m);
      });
      mesh.castShadow = mesh.receiveShadow = !part.material.isMeshBasicMaterial;
      this.group.add(mesh);
    }
  }

  // ---------- phase-specific blockers ----------
  buildBarriers() {
    const spots = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c] === "A") spots.push(this.center(r, c));
    if (!spots.length) return;
    const t = barrierTexture();
    t.repeat.set(1, 1);
    this.barrierTex = t;
    this.barrierMat = new THREE.MeshBasicMaterial({
      map: t, color: PALETTE[CITY].accent.clone().multiplyScalar(1.8), transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.BoxGeometry(TILE * 0.98, 2.4, TILE * 0.98);
    geo.translate(0, 1.2, 0);
    const mesh = new THREE.InstancedMesh(geo, this.barrierMat, spots.length);
    const base = new THREE.InstancedMesh(new THREE.BoxGeometry(TILE, 0.18, TILE), new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.7, roughness: 0.4 }), spots.length);
    spots.forEach((s, i) => {
      _m.compose(_p.set(s.x, 0, s.z), _q.identity(), _s.set(1, 1, 1));
      mesh.setMatrixAt(i, _m);
      _m.compose(_p.set(s.x, 0.09, s.z), _q.identity(), _s.set(1, 1, 1));
      base.setMatrixAt(i, _m);
    });
    mesh.renderOrder = 2;
    this.group.add(mesh, base);
  }

  buildCrystals() {
    const spots = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c] === "B") spots.push(this.center(r, c));
    if (!spots.length) return;
    const per = 4;
    const geo = new THREE.OctahedronGeometry(0.6, 0);
    geo.scale(0.7, 2.2, 0.7);
    this.crystalMat = new THREE.MeshStandardMaterial({
      color: 0x2a0410, emissive: 0xff2050, emissiveIntensity: 1.8, roughness: 0.2, metalness: 0.1,
      flatShading: true, transparent: true, opacity: 0.25,
    });
    this.crystalMesh = new THREE.InstancedMesh(geo, this.crystalMat, spots.length * per);
    this.crystalData = [];
    spots.forEach(s => {
      for (let k = 0; k < per; k++) {
        this.crystalData.push({
          x: s.x + (this.rand() - 0.5) * 1.4, z: s.z + (this.rand() - 0.5) * 1.4,
          rx: (this.rand() - 0.5) * 0.6, ry: this.rand() * Math.PI, rz: (this.rand() - 0.5) * 0.6,
          sc: 0.7 + this.rand() * 0.6,
        });
      }
    });
    this.crystalMesh.castShadow = true;
    this.group.add(this.crystalMesh);
    this.layoutCrystals(0);
  }

  layoutCrystals(blend) {
    if (!this.crystalMesh) return;
    const grow = 0.18 + 0.82 * blend;
    this.crystalData.forEach((d, i) => {
      _q.setFromEuler(new THREE.Euler(d.rx, d.ry, d.rz));
      const s = d.sc * grow;
      _m.compose(_p.set(d.x, 1.1 * s, d.z), _q, _s.set(s, s, s));
      this.crystalMesh.setMatrixAt(i, _m);
    });
    this.crystalMesh.instanceMatrix.needsUpdate = true;
  }

  buildBridge() {
    const spots = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c] === "b") spots.push(this.center(r, c));
    if (!spots.length) return;
    this.bridgeMat = new THREE.MeshBasicMaterial({
      map: bridgeTexture(), color: PALETTE[BREACH].accent.clone().multiplyScalar(2), transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const geo = new THREE.PlaneGeometry(TILE, TILE);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, this.bridgeMat, spots.length);
    spots.forEach((s, i) => {
      _m.compose(_p.set(s.x, 0.02, s.z), _q.identity(), _s.set(1, 1, 1));
      mesh.setMatrixAt(i, _m);
    });
    this.group.add(mesh);
  }

  // City-only glass walkways: a tinted pane plus a glowing grid; both fade out in the Breach.
  buildGlass() {
    const spots = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c] === "v") spots.push(this.center(r, c));
    if (!spots.length) return;
    const geo = new THREE.PlaneGeometry(TILE * 0.98, TILE * 0.98);
    geo.rotateX(-Math.PI / 2);
    this.glassMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.12, 0.35, 0.45), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide,
    });
    this.glassEdgeMat = new THREE.MeshBasicMaterial({
      map: bridgeTexture(), color: PALETTE[CITY].accent.clone().multiplyScalar(1.8), transparent: true, opacity: 1,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const pane = new THREE.InstancedMesh(geo, this.glassMat, spots.length);
    const grid = new THREE.InstancedMesh(geo, this.glassEdgeMat, spots.length);
    spots.forEach((s, i) => {
      _m.compose(_p.set(s.x, 0.015, s.z), _q.identity(), _s.set(1, 1, 1));
      pane.setMatrixAt(i, _m);
      _m.compose(_p.set(s.x, 0.025, s.z), _q.identity(), _s.set(1, 1, 1));
      grid.setMatrixAt(i, _m);
    });
    pane.renderOrder = 1; grid.renderOrder = 2;
    this.group.add(pane, grid);
  }

  // Frees GPU memory when switching districts.
  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) { for (const k of ["map", "emissiveMap", "roughnessMap"]) m[k]?.dispose?.(); m.dispose(); }
    });
    this.envMaps?.forEach(t => t.dispose());
  }

  // ---------- lamps (8 real lights pooled onto nearest lamp posts) ----------
  buildLamps() {
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x20242f, metalness: 0.7, roughness: 0.4 });
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.09, 3.6, 6);
    poleGeo.translate(0, 1.8, 0);
    const armGeo = new THREE.BoxGeometry(0.9, 0.08, 0.08);
    const headGeo = new THREE.BoxGeometry(0.5, 0.12, 0.25);
    this.lampHeads = [];
    this.spawns.lamps.forEach((l, i) => {
      const colorIdx = i % 3;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(l.x, 0, l.z);
      pole.castShadow = true;
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.set(l.x + 0.4, 3.55, l.z);
      const headMat = new THREE.MeshBasicMaterial({ color: PALETTE[CITY].lamps[colorIdx].clone().multiplyScalar(3) });
      const head = new THREE.Mesh(headGeo, headMat);
      head.position.set(l.x + 0.75, 3.48, l.z);
      this.group.add(pole, arm, head);
      this.lampHeads.push({ mat: headMat, colorIdx, x: l.x + 0.75, z: l.z });
    });

    this.lampLights = [];
    for (let i = 0; i < LAMP_POOL; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 22, 1.4);
      this.group.add(light);
      this.lampLights.push(light);
    }

    // soft glow cards under each lamp head
    this.glowTex = glowSprite();
  }

  assignLamps(x, z, blend) {
    const sorted = this.lampHeads
      .map(h => ({ h, d: (h.x - x) ** 2 + (h.z - z) ** 2 }))
      .sort((a, b) => a.d - b.d);
    this.lampLights.forEach((light, i) => {
      const entry = sorted[i];
      if (!entry) { light.intensity = 0; return; }
      const { h, d } = entry;
      light.position.set(h.x, 3.2, h.z);
      light.color.copy(PALETTE[CITY].lamps[h.colorIdx]).lerp(PALETTE[BREACH].lamps[h.colorIdx], blend);
      const fade = THREE.MathUtils.clamp(1 - (Math.sqrt(d) - 18) / 8, 0, 1);
      light.intensity = 95 * fade;
    });
  }

  // ---------- terminals & exit ----------
  buildTerminals() {
    this.terminals = this.spawns.terminals.map(t => {
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);
      const color = PALETTE[t.phase].accent;
      // SolidCraft console for City terminals; its Glow_Screen material becomes the hack-state screen
      const model = t.phase === CITY && hasModel("terminal") ? instance("terminal") : null;
      if (model) {
        g.add(model.root);
      } else if (t.phase === CITY) {
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.35, 0.7), new THREE.MeshStandardMaterial({ color: 0x1b2131, metalness: 0.6, roughness: 0.4 }));
        base.position.y = 0.675;
        base.castShadow = true;
        g.add(base);
      } else {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.5, 6), new THREE.MeshStandardMaterial({ color: 0x1a0710, metalness: 0.4, roughness: 0.5 }));
        base.position.y = 0.25;
        g.add(base);
      }
      let screenMat, screen;
      const modelScreen = model?.byRole.Glow?.find(m => m.name === "Glow_Screen");
      if (modelScreen) {
        screenMat = modelScreen;
        screenMat.color.copy(color).multiplyScalar(2.2);
        screen = model.find("TerminalScreen") || model.root;
      } else {
        screenMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.2) });
        screen = t.phase === CITY
          ? new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.5), screenMat)
          : new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), screenMat);
        if (t.phase === CITY) { screen.position.set(0, 1.05, 0.36); }
        else { screen.position.set(0, 1.4, 0); }
        g.add(screen);
      }
      const holo = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2), wireframe: true }));
      holo.position.y = t.phase === CITY ? 2.0 : 2.3;
      g.add(holo);
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.7, 40), new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.5), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      g.add(ring);
      const beam = makeBeam(color);
      g.add(beam);
      this.group.add(g);
      return { ...t, group: g, screen, screenMat, holo, ring, beam, hacked: false, progress: 0 };
    });
  }

  buildExit() {
    const e = this.spawns.exit;
    if (!e) return;
    const g = new THREE.Group();
    g.position.set(e.x, 0, e.z);
    this.exitRingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.2, 0.25) });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.08, 8, 48), this.exitRingMat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 8, 48), this.exitRingMat);
    ring1.position.y = ring2.position.y = 1.6;
    this.exitCoreMat = new THREE.MeshBasicMaterial({ map: glowSprite(), color: new THREE.Color(0.6, 0.1, 0.1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const core = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), this.exitCoreMat);
    core.position.y = 1.6;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 0.2, 24), new THREE.MeshStandardMaterial({ color: 0x1a1f2c, metalness: 0.7, roughness: 0.35 }));
    pad.position.y = 0.1;
    this.exitLight = new THREE.PointLight(0xff3050, 6, 9, 1.6);
    this.exitLight.position.y = 1.8;
    const beam = makeBeam(new THREE.Color(0.55, 0.95, 1.0));
    beam.visible = false;
    g.add(ring1, ring2, core, pad, this.exitLight, beam);
    this.exit = { ...e, group: g, ring1, ring2, core, beam, open: false };
    this.group.add(g);
  }

  markHacked(term) {
    term.screenMat.color.setRGB(0.5, 3, 1.6);
    term.holo.material.color.setRGB(0.5, 2.6, 1.4);
    term.ring.material.color.setRGB(0.4, 1.6, 1.0);
    term.beam.visible = false;
  }

  resetObjectives() {
    for (const t of this.terminals) {
      const col = PALETTE[t.phase].accent;
      t.hacked = false;
      t.progress = 0;
      t.screenMat.color.copy(col).multiplyScalar(2.2);
      t.holo.material.color.copy(col).multiplyScalar(2);
      t.ring.material.color.copy(col).multiplyScalar(1.5);
      t.beam.visible = true;
    }
    this.locksDone = 0;
    for (const gt of this.gates || []) { gt.open = false; gt.fade = 1; gt.group.visible = true; }
    if (this.card) { this.card.taken = false; this.card.group.visible = true; }
    if (this.exit) {
      this.exit.open = false;
      this.exitRingMat.color.setRGB(1.5, 0.2, 0.25);
      this.exitCoreMat.color.setRGB(0.6, 0.1, 0.1);
      this.exitLight.color.set(0xff3050);
      this.exitLight.intensity = 6;
      this.exit.beam.visible = false;
    }
  }

  // ---------- security gates (District 03+) ----------
  // Each connected run of the same digit is one gate: laser curtains across the opening,
  // with a floating number. Gate N drops once N locks are hacked, in any order.
  buildGates() {
    this.gates = [];
    const seen = new Set();
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const ch = this.grid[r][c];
      if (!"123".includes(ch) || seen.has(r * this.cols + c)) continue;
      const tiles = [], stack = [[r, c]];
      seen.add(r * this.cols + c);
      while (stack.length) {
        const [tr, tc] = stack.pop();
        tiles.push([tr, tc]);
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = tr + dr, nc = tc + dc, k = nr * this.cols + nc;
          if (this.ch(nr, nc) === ch && !seen.has(k)) { seen.add(k); stack.push([nr, nc]); }
        }
      }
      this.gates.push(this.makeGate(Number(ch), tiles));
    }
  }

  makeGate(n, tiles) {
    const rs = tiles.map(t => t[0]), cs = tiles.map(t => t[1]);
    const r0 = Math.min(...rs), r1 = Math.max(...rs), c0 = Math.min(...cs), c1 = Math.max(...cs);
    const alongZ = (r1 - r0) >= (c1 - c0);           // opening runs north-south -> curtains face east-west
    const g = new THREE.Group();
    const color = new THREE.Color(1.0, 0.45, 0.1);
    if (!this.gateTex) this.gateTex = gateTexture();
    const curtainMat = new THREE.MeshBasicMaterial({
      map: this.gateTex, color: color.clone().multiplyScalar(2.2), transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    const span = ((alongZ ? r1 - r0 : c1 - c0) + 1) * TILE;
    const layers = alongZ ? [c0, c1] : [r0, r1];
    const postMat = new THREE.MeshStandardMaterial({ color: 0x20242e, metalness: 0.7, roughness: 0.4 });
    const capMat = new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(2.5) });
    const mid = this.center((r0 + r1) / 2, (c0 + c1) / 2);
    for (const L of layers) {
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(span, 2.6), curtainMat);
      const p = alongZ ? this.center(0, L) : this.center(L, 0);
      curtain.position.set(alongZ ? p.x : mid.x, 1.3, alongZ ? mid.z : p.z);
      if (alongZ) curtain.rotation.y = Math.PI / 2;
      g.add(curtain);
      // emitter posts at both ends of each curtain
      for (const end of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.9, 0.3), postMat);
        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.34), capMat);
        const off = end * span / 2;
        post.position.set(curtain.position.x + (alongZ ? 0 : off), 1.45, curtain.position.z + (alongZ ? off : 0));
        cap.position.copy(post.position).setY(2.6);
        post.castShadow = true;
        g.add(post, cap);
      }
    }
    // floating gate number so players can read the order at a glance
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: gateNumberTexture(n), transparent: true, depthWrite: false }));
    label.scale.set(1.3, 1.3, 1);
    label.position.set(mid.x, 3.5, mid.z);
    g.add(label);
    const light = new THREE.PointLight(0xff7a20, 10, 8, 1.6);
    light.position.set(mid.x, 1.6, mid.z);
    g.add(light);
    this.group.add(g);
    return { n, tiles, group: g, curtainMat, label, light, x: mid.x, z: mid.z, open: false, fade: 1 };
  }

  // ---------- coolant vents (District 04+) ----------
  // Floor grates that blast coolant in waves rolling across the map. CITY only: in the
  // BREACH they're dormant. The grate glows for WARN seconds before each blast.
  buildVents() {
    this.vents = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      if (this.grid[r][c] === "h") this.vents.push({ r, c, ...this.center(r, c), wasOn: false });
    }
    if (!this.vents.length) return;
    const n = this.vents.length;
    const grateGeo = new THREE.PlaneGeometry(TILE * 0.92, TILE * 0.92);
    grateGeo.rotateX(-Math.PI / 2);
    this.grateMesh = new THREE.InstancedMesh(grateGeo, new THREE.MeshBasicMaterial({ map: grateTexture(), transparent: true, depthWrite: false }), n);
    const colGeo = new THREE.CylinderGeometry(0.28, 0.5, 3.0, 10, 1, true);
    colGeo.translate(0, 1.5, 0);
    this.ventColMesh = new THREE.InstancedMesh(colGeo, new THREE.MeshBasicMaterial({
      map: ventStreakTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }), n);
    this.ventColMesh.frustumCulled = false;
    this.vents.forEach((v, i) => {
      _m.compose(_p.set(v.x, 0.03, v.z), _q.identity(), _s.set(1, 1, 1));
      this.grateMesh.setMatrixAt(i, _m);
      this.grateMesh.setColorAt(i, _c.setRGB(0.16, 0.22, 0.28));
      _m.compose(_p.set(v.x, 0, v.z), _q.identity(), _s.set(1, 0.001, 1));
      this.ventColMesh.setMatrixAt(i, _m);
      this.ventColMesh.setColorAt(i, _c.setRGB(0, 0, 0));
    });
    this.grateMesh.renderOrder = 1;
    this.group.add(this.grateMesh, this.ventColMesh);
  }

  // 0..1 timeline position of a vent; blast while s < ON, warning glow in the last WARN seconds.
  ventCycle(r, c) {
    const P = VENT.period, off = c * 0.16 + r * 0.05;
    return (((this.time - off) % P) + P) % P;
  }
  ventBlasting(r, c) { return this.ch(r, c) === "h" && this.ventCycle(r, c) < VENT.on; }

  // Is there a live blast under (x, z)? Only meaningful in the CITY.
  ventHitAt(x, z) {
    const [r, c] = this.toTile(x, z);
    return this.ventBlasting(r, c);
  }

  updateVents(blend, focusX, focusZ) {
    if (!this.vents?.length) return;
    const city = 1 - blend;
    let bursts = 0;
    this.vents.forEach((v, i) => {
      const s = this.ventCycle(v.r, v.c);
      const on = s < VENT.on;
      const warn = s > VENT.period - VENT.warn ? (s - (VENT.period - VENT.warn)) / VENT.warn : 0;
      // column: shoots up fast, then thins out
      const k = on ? Math.min(1, s / 0.12) * (1 - Math.max(0, (s - VENT.on + 0.25) / 0.25)) : 0;
      const h = Math.max(0.001, k * city);
      _m.compose(_p.set(v.x, 0, v.z), _q.identity(), _s.set(0.9 + k * 0.2, h, 0.9 + k * 0.2));
      this.ventColMesh.setMatrixAt(i, _m);
      this.ventColMesh.setColorAt(i, _c.setRGB(0.22 * k, 0.55 * k, 0.75 * k));
      // grate: cool steel when idle, amber warning, white-blue during the blast, dull violet in the Breach
      if (on) _c.setRGB(0.45, 0.8, 1.0);
      else if (warn > 0) _c.setRGB(0.16 + warn * 0.9, 0.22 + warn * 0.4, 0.28 - warn * 0.15);
      else _c.setRGB(0.16, 0.22, 0.28);
      _c.lerp(_c2.setRGB(0.25, 0.14, 0.3), blend);
      this.grateMesh.setColorAt(i, _c);
      if (on && !v.wasOn && city > 0.5 && Math.abs(v.x - focusX) < 9 && Math.abs(v.z - focusZ) < 9) bursts++;
      v.wasOn = on;
    });
    this.ventColMesh.instanceMatrix.needsUpdate = true;
    this.ventColMesh.instanceColor.needsUpdate = true;
    this.grateMesh.instanceColor.needsUpdate = true;
    this.ventBursts = bursts;
  }

  // ---------- hypersleep pods (District 05) ----------
  // "o" = a sleeper pod (scenery), "O" = a crew pod, numbered from level.pods in reading order.
  buildPods() {
    const deco = [], crew = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const ch = this.grid[r][c];
      if (ch === "o") deco.push({ r, c, ...this.center(r, c) });
      else if (ch === "O") crew.push({ r, c, ...this.center(r, c) });
    }
    this.pods = [];
    if (deco.length) {
      const n = deco.length;
      const baseGeo = new THREE.BoxGeometry(1.5, 0.45, 1.85); baseGeo.translate(0, 0.225, 0);
      const shellGeo = podShellGeo(0.52, 0.9);
      const lightGeo = new THREE.BoxGeometry(0.5, 0.05, 0.06); lightGeo.translate(0, 0.47, -0.93);
      const base = new THREE.InstancedMesh(baseGeo, new THREE.MeshStandardMaterial({ color: 0x1a2030, metalness: 0.75, roughness: 0.35 }), n);
      const shell = new THREE.InstancedMesh(shellGeo, podGlassMat(0x5f8fbf), n);
      const light = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial(), n);
      deco.forEach((p, i) => {
        _m.compose(_p.set(p.x, 0, p.z), _q.identity(), _s.set(1, 1, 1));
        base.setMatrixAt(i, _m); shell.setMatrixAt(i, _m); light.setMatrixAt(i, _m);
        // most sleepers are long dead: a few faint green lights, the rest dark red
        light.setColorAt(i, (p.c * 7 + p.r * 3) % 5 === 0 ? _c.setRGB(0.3, 2, 0.8) : _c.setRGB(0.9, 0.08, 0.1));
      });
      base.castShadow = base.receiveShadow = true;
      this.group.add(base, shell, light);
    }
    const order = this.level.pods || [];
    crew.forEach((p, i) => this.pods.push(this.makeCrewPod(p, order[i] || "??")));
  }

  makeCrewPod(p, label) {
    const g = new THREE.Group();
    g.position.set(p.x, 0, p.z);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 2.1), new THREE.MeshStandardMaterial({ color: 0x232a3c, metalness: 0.8, roughness: 0.3 }));
    base.position.y = 0.25; base.castShadow = base.receiveShadow = true;
    const sleeper = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.0, 4, 10), new THREE.MeshStandardMaterial({ color: 0x0c1018, emissive: 0x112233, roughness: 0.6 }));
    sleeper.rotation.x = Math.PI / 2; sleeper.position.y = 0.72;
    const lid = new THREE.Group();                    // hinged at the head end (north, -z)
    lid.position.set(0, 0.5, -1.0);
    const shell = new THREE.Mesh(podShellGeo(0.62, 1.05), podGlassMat(0x86b8e0));
    shell.position.set(0, -0.5, 1.0);
    lid.add(shell);
    const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.2, 0.2) });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 0.08), stripMat);
    strip.position.set(0, 0.52, 1.06);
    const label3 = new THREE.Sprite(new THREE.SpriteMaterial({ map: podLabelTexture(label), transparent: true, depthWrite: false }));
    label3.scale.set(2.4, 1.2, 1); label3.position.set(0, 2.6, 0);
    const light = new THREE.PointLight(0xff3040, 5, 6, 1.6);
    light.position.set(0, 1.6, 0.4);
    // frosted bed inside, lit once the pod is open and empty
    const bedMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.12, 0.38, 0.5), transparent: true, opacity: 0, depthWrite: false });
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.75), bedMat);
    bed.rotation.x = -Math.PI / 2; bed.position.y = 0.52;
    g.add(base, sleeper, lid, strip, label3, light, bed);
    this.group.add(g);
    return { ...p, label, group: g, lid, sleeper, stripMat, light, label3, bedMat, state: "locked", open: 0 };
  }

  // locked (red) / ready = you carry its card (amber, pulsing) / awake = empty, lid up (green)
  setPodState(pod, state) { pod.state = state; }

  updatePods(dt) {
    for (const p of this.pods || []) {
      const target = p.state === "awake" ? 1 : 0;
      p.open += (target - p.open) * Math.min(1, dt * 2.5);
      p.lid.rotation.x = -p.open * 1.15;
      p.lid.position.y = 0.5 + p.open * 0.25;
      p.sleeper.visible = p.open < 0.6;
      p.bedMat.opacity = Math.max(0, p.open - 0.3) * 0.8;
      const pulse = 0.6 + Math.sin(this.time * 6) * 0.4;
      if (p.state === "awake") { p.stripMat.color.setRGB(0.3, 2.2, 0.9); p.light.color.setRGB(0.4, 1, 0.6); p.light.intensity = 6; }
      else if (p.state === "ready") { p.stripMat.color.setRGB(2.4 * pulse, 1.3 * pulse, 0.2); p.light.color.setRGB(1, 0.6, 0.15); p.light.intensity = 4 + pulse * 6; }
      else { p.stripMat.color.setRGB(1.3, 0.15, 0.2); p.light.color.setRGB(1, 0.2, 0.25); p.light.intensity = 3.5; }
      p.label3.position.y = 2.6 + Math.sin(this.time * 2 + p.c) * 0.08;
    }
    if (this.card?.group.visible) {
      this.card.mesh.rotation.y += dt * 2.2;
      this.card.mesh.position.y = 1.1 + Math.sin(this.time * 3) * 0.12;
    }
  }

  // ---------- security glass ("g"): see-through walls around a vault ----------
  buildVault() {
    const tiles = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c] === "g") tiles.push(this.center(r, c));
    if (!tiles.length) return;
    const glassGeo = new THREE.BoxGeometry(TILE, 2.4, TILE); glassGeo.translate(0, 1.2, 0);
    const rimGeo = new THREE.BoxGeometry(TILE, 0.07, TILE); rimGeo.translate(0, 2.42, 0);
    const glass = new THREE.InstancedMesh(glassGeo, new THREE.MeshStandardMaterial({
      color: 0x5fb8ff, transparent: true, opacity: 0.16, metalness: 0.3, roughness: 0.05, depthWrite: false,
    }), tiles.length);
    // dim cap so the wall reads from above; bright enough to see, not a floodlight under bloom
    const rim = new THREE.InstancedMesh(rimGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.1, 0.32, 0.45), transparent: true, opacity: 0.7, depthWrite: false }), tiles.length);
    tiles.forEach((p, i) => {
      _m.compose(_p.set(p.x, 0, p.z), _q.identity(), _s.set(1, 1, 1));
      glass.setMatrixAt(i, _m); rim.setMatrixAt(i, _m);
    });
    glass.renderOrder = 2;
    this.group.add(glass, rim);
  }

  // ---------- crew ID card ("k") ----------
  buildCard() {
    let spot = null;
    for (let r = 0; r < this.rows && !spot; r++) for (let c = 0; c < this.cols; c++) if (this.grid[r][c] === "k") { spot = { r, c, ...this.center(r, c) }; break; }
    if (!spot) return;
    const g = new THREE.Group();
    g.position.set(spot.x, 0, spot.z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.4, 0.04), new THREE.MeshBasicMaterial({ map: cardTexture(), color: new THREE.Color(1.6, 1.4, 1.0) }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(), color: 0xffc04a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.set(2, 2, 1); halo.position.y = 1.1;
    const light = new THREE.PointLight(0xffb040, 6, 6, 1.6); light.position.y = 1.6;
    const beam = makeBeam(new THREE.Color(1.0, 0.75, 0.3));
    g.add(mesh, halo, light, beam);
    this.group.add(g);
    this.card = { ...spot, group: g, mesh, crew: this.level.card, taken: false };
  }

  takeCard() { this.card.taken = true; this.card.group.visible = false; }

  // Called after each hacked lock. Returns the gates that just opened.
  openGates(locksDone) {
    this.locksDone = locksDone;
    const opened = [];
    for (const gt of this.gates || []) if (!gt.open && gt.n <= locksDone) { gt.open = true; opened.push(gt); }
    return opened;
  }

  // Which gate level each lock sits behind (walkable in either world), so the waypoint
  // never points at a lock you can't reach yet.
  computeLockTiers() {
    const sp = this.spawns.player;
    const maxGate = Math.max(0, ...(this.gates || []).map(g => g.n));
    if (!sp) return;
    const [sr, sc] = this.toTile(sp.x, sp.z);
    for (let k = 0; k <= maxGate; k++) {
      const seen = new Uint8Array(this.rows * this.cols);
      const q = [[sr, sc]]; seen[sr * this.cols + sc] = 1;
      while (q.length) {
        const [r, c] = q.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nr = r + dr, nc = c + dc;
          if (!this.inside(nr, nc) || seen[nr * this.cols + nc]) continue;
          const ch = this.grid[nr][nc];
          if ("#cTR~goO".includes(ch) || ("123".includes(ch) && Number(ch) > k)) continue;
          seen[nr * this.cols + nc] = 1; q.push([nr, nc]);
        }
      }
      if (this.card && this.card.tier === undefined && seen[this.card.r * this.cols + this.card.c]) this.card.tier = k;
      for (const t of this.terminals) {
        if (t.tier !== undefined) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => this.inside(t.r + dr, t.c + dc) && seen[(t.r + dr) * this.cols + t.c + dc])) t.tier = k;
      }
    }
    // a lock you can't walk up to in either world (glass vault): only a remote hack reaches it
    for (const t of this.terminals) if (t.tier === undefined) { t.tier = 0; t.sealed = true; }
  }

  openExit() {
    if (!this.exit) return;
    this.exit.open = true;
    this.exitRingMat.color.setRGB(0.4, 2.2, 2.6);
    this.exitCoreMat.color.setRGB(0.3, 1.4, 1.8);
    this.exitLight.color.set(0x40e8ff);
    this.exitLight.intensity = 22;
    this.exit.beam.visible = true;
  }

  // ---------- per-frame ----------
  update(dt, blend, focusX, focusZ) {
    this.time += dt;
    const t = this.time;

    if (Math.abs(blend - this.lastBlend) > 0.001) {
      this.layoutCrystals(blend);
      const pal0 = PALETTE[CITY], pal1 = PALETTE[BREACH];
      this.hemi.color.copy(pal0.hemiSky).lerp(pal1.hemiSky, blend);
      this.hemi.groundColor.copy(pal0.hemiGround).lerp(pal1.hemiGround, blend);
      this.moon.color.copy(pal0.moon).lerp(pal1.moon, blend);
      if (this.barrierMat) this.barrierMat.opacity = THREE.MathUtils.lerp(0.85, 0.05, blend);
      if (this.bridgeMat) this.bridgeMat.opacity = THREE.MathUtils.lerp(0.06, 0.9, blend);
      if (this.glassMat) this.glassMat.opacity = THREE.MathUtils.lerp(0.75, 0.04, blend);
      if (this.glassEdgeMat) this.glassEdgeMat.opacity = THREE.MathUtils.lerp(1, 0.08, blend);
      if (this.crystalMat) this.crystalMat.opacity = THREE.MathUtils.lerp(0.22, 0.95, blend);
      this.edgeStripMat.color.copy(pal0.accent).lerp(pal1.accent, blend).multiplyScalar(2.2);
      this.abyssMat.color.setRGB(0.016 + 0.08 * blend, 0.024 - 0.015 * blend, 0.05 - 0.03 * blend);
      this.abyssDotMat.color.setRGB(3, 1.9 - 1.6 * blend, 0.8 - 0.6 * blend);
      this.stripMats.forEach((m, i) => m.color.copy(pal0.lamps[i]).lerp(pal1.lamps[i], blend).multiplyScalar(2.6));
      this.lampHeads.forEach(h => h.mat.color.copy(pal0.lamps[h.colorIdx]).lerp(pal1.lamps[h.colorIdx], blend).multiplyScalar(3));
      this.scene.environment = this.envMaps[blend > 0.5 ? BREACH : CITY];
      this.lastBlend = blend;
    }

    if (this.barrierTex) this.barrierTex.offset.y = -t * 0.4;
    this.beaconMat.color.setRGB(1.6 + Math.sin(t * 1.2) * 0.8, 0.2, 0.2);

    for (const s of this.signs) {
      let k = 2.4;
      if (s.flicker) {
        const n = Math.sin(t * 23 + s.seed) * Math.sin(t * 7.3 + s.seed * 2);
        if (n > 0.85) k = 0.3;
      }
      const br = 1 - blend * 0.55;
      s.mat.color.setRGB(k * (br + blend * 0.4), k * br * (1 - blend * 0.6), k * br * (1 - blend * 0.3));
    }

    for (const term of this.terminals) {
      term.holo.rotation.y += dt * 1.8;
      term.holo.position.y = (term.phase === CITY ? 2.0 : 2.3) + Math.sin(t * 2 + term.x) * 0.1;
      if (term.phase === BREACH) term.screen.rotation.y += dt * 1.2;
      const active = term.phase === CITY ? 1 - blend : blend;
      term.ring.material.opacity = term.hacked ? 0.15 : 0.12 + 0.35 * active;
      // beam is brightest when you're in the phase that can hack it
      term.beam.material.opacity = 0.35 + 0.45 * active + Math.sin(t * 1.5 + term.x) * 0.06;
    }

    this.updateVents(blend, focusX, focusZ);
    this.updatePods(dt);
    if (this.ventColMesh) this.ventColMesh.material.map.offset.y = (-t * 2.5) % 1;
    if (this.gateTex) this.gateTex.offset.y = (t * 0.6) % 1;
    for (const gt of this.gates || []) {
      if (!gt.group.visible) continue;
      if (gt.open) {
        gt.fade = Math.max(0, gt.fade - dt * 1.8);
        if (gt.fade === 0) gt.group.visible = false;
      }
      const flick = gt.open ? (Math.sin(t * 60) > 0 ? 1 : 0.35) : 0.85 + Math.sin(t * 5 + gt.n) * 0.1;
      gt.curtainMat.opacity = 0.9 * gt.fade * flick;
      gt.light.intensity = 10 * gt.fade;
      gt.label.material.opacity = gt.fade;
      gt.label.position.y = 3.5 + Math.sin(t * 2 + gt.n) * 0.12;
    }

    if (this.exit) {
      this.exit.ring1.rotation.y += dt * (this.exit.open ? 2.4 : 0.4);
      this.exit.ring2.rotation.x += dt * (this.exit.open ? 3.1 : 0.5);
      const pulse = 1 + Math.sin(t * 4) * 0.06;
      this.exit.core.scale.setScalar(pulse);
      this.exit.core.lookAt(this.exit.core.getWorldPosition(_p).add(new THREE.Vector3(0, 0.6, 1)));
    }

    this.assignLamps(focusX, focusZ, blend);
    this.followShadow(focusX, focusZ);
  }
}

// Horizontal laser lines with a soft glow, scrolled upward in update().
function gateTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(255,255,255,0.06)"; g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 16) {
    const grd = g.createLinearGradient(0, y - 4, 0, y + 4);
    grd.addColorStop(0, "rgba(255,255,255,0)"); grd.addColorStop(0.5, "rgba(255,255,255,1)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, y - 4, 64, 8);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Diamond badge with the gate number, used as a floating sprite.
function gateNumberTexture(n) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.strokeStyle = "#ff8a2a"; g.lineWidth = 8;
  g.beginPath(); g.moveTo(64, 6); g.lineTo(122, 64); g.lineTo(64, 122); g.lineTo(6, 64); g.closePath();
  g.fillStyle = "rgba(20,10,4,0.85)"; g.fill(); g.stroke();
  g.fillStyle = "#ffd2a0"; g.font = "bold 64px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(String(n), 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Dark floor grate: slats with a bright rim, tinted per instance (idle / warning / blast).
function grateTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(10,14,20,0.95)"; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,0.35)";
  for (let x = 10; x < 56; x += 9) g.fillRect(x, 12, 2, 40);
  g.strokeStyle = "rgba(255,255,255,0.8)"; g.lineWidth = 2; g.strokeRect(4, 4, 56, 56);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Vertical streaks for the coolant column, scrolled upward.
function ventStreakTexture() {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createLinearGradient(0, 0, 0, 64);
  grd.addColorStop(0, "rgba(255,255,255,0)"); grd.addColorStop(0.5, "rgba(255,255,255,0.35)"); grd.addColorStop(1, "rgba(255,255,255,0.9)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  g.fillStyle = "rgba(255,255,255,0.8)";
  for (let i = 0; i < 9; i++) g.fillRect((i * 7 + 3) % 64, (i * 23) % 64, 2, 18);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Lying capsule (pod glass), split lengthwise so only the top half shows.
function podShellGeo(radius, length) {
  const g = new THREE.CapsuleGeometry(radius, length, 6, 14);
  g.rotateX(Math.PI / 2);
  g.scale(1, 0.62, 1);
  g.translate(0, 0.5, 0);
  return g;
}
function podGlassMat(color) {
  return new THREE.MeshStandardMaterial({
    color, emissive: new THREE.Color(color).multiplyScalar(0.04), transparent: true, opacity: 0.26,
    metalness: 0.2, roughness: 0.15, depthWrite: false,
  });
}

// "POD 07" plate for crew pods.
function podLabelTexture(text) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "rgba(6,10,18,0.85)"; g.strokeStyle = "#9fe8ff"; g.lineWidth = 6;
  g.beginPath(); g.moveTo(20, 8); g.lineTo(248, 8); g.lineTo(236, 120); g.lineTo(8, 120); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = "#dff8ff"; g.font = "bold 30px monospace"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("POD", 128, 40);
  g.font = "bold 56px monospace"; g.fillText(text, 128, 86);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Gold crew ID card face.
function cardTexture() {
  const c = document.createElement("canvas");
  c.width = 128; c.height = 80;
  const g = c.getContext("2d");
  g.fillStyle = "#c98a1c"; g.fillRect(0, 0, 128, 80);
  g.fillStyle = "#ffe08a"; g.fillRect(6, 6, 116, 14);
  g.fillStyle = "#3a2608"; g.fillRect(10, 28, 30, 38);
  g.fillStyle = "#ffe9b0"; for (let i = 0; i < 4; i++) g.fillRect(48, 30 + i * 9, 66 - i * 10, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
