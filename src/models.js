// ============================================================
//  MODELS — loads the Blender GLBs from assets/models/.
//  Naming contract with art/portal_break_models.blend:
//   materials starting with Trim / Core / Eye / Glow  -> unlit neon
//     (the game recolors these at runtime, e.g. per phase)
//   every other material                             -> lit PBR
//   nodes: player  LegL, LegR, Body, Gun, Muzzle
//          drone   Head, Ring      turret  Head
//          wraith  Head, Shell, Core, Shard1..3
// ============================================================
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneWithSkeleton } from "three/addons/utils/SkeletonUtils.js";

const loader = new GLTFLoader();
const SOURCES = {};
const NEON = /^(Trim|Core|Eye|Glow)/;

export async function loadModels(names = ["player", "drone", "turret", "wraith", "terminal", "crate"]) {
  await Promise.all(names.map(async n => {
    try {
      const gltf = await loader.loadAsync(`assets/models/${n}.glb`);
      SOURCES[n] = gltf.scene;
    } catch (err) {
      console.warn(`[models] ${n}.glb failed to load, using stand-in`, err);
    }
  }));
  return Object.keys(SOURCES);
}

export function hasModel(name) { return !!SOURCES[name]; }

// Returns a fresh copy with its own materials (so enemies can flash/ghost
// independently) plus lookup helpers.
export function instance(name, { transparent = false, neonBoost = 3 } = {}) {
  const src = SOURCES[name];
  if (!src) return null;
  // skeleton-aware clone: a plain clone(true) would leave skinned meshes bound to the
  // *source* bones, so animating the copy's bones would not move the body
  const root = cloneWithSkeleton(src);
  const converted = new Map();
  const mats = [];
  const byRole = {};

  root.traverse(o => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    const out = list.map(m => {
      if (converted.has(m.uuid)) return converted.get(m.uuid);
      let nm;
      if (NEON.test(m.name)) {
        const col = (m.emissive && m.emissive.getHex() !== 0 ? m.emissive : m.color).clone().multiplyScalar(neonBoost);
        nm = new THREE.MeshBasicMaterial({ color: col, transparent });
      } else {
        nm = m.clone();
        nm.transparent = transparent;
        nm.envMapIntensity = 0.6;
      }
      nm.name = m.name;
      converted.set(m.uuid, nm);
      mats.push(nm);
      const role = m.name.match(NEON)?.[1] || "Lit";
      (byRole[role] ||= []).push(nm);
      return nm;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });

  const find = prefix => {
    let hit = null;
    root.traverse(o => { if (!hit && o.name.startsWith(prefix)) hit = o; });
    return hit;
  };
  return { root, mats, byRole, find };
}
