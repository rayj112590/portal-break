// ============================================================
//  MODELS — loads the Blender GLBs from assets/models/.
//  Naming contract with art/portal_break_models.blend:
//   materials starting with Trim / Core / Eye / Glow  -> unlit neon
//     (the game recolors these at runtime, e.g. per phase)
//   every other material                             -> lit PBR
//   nodes: player  LegL, LegR, Body, Gun, Muzzle
//          drone   Head, Ring      turret  Head
//          wraith  Head, Shell, Core, Shard1..3
//   crew models jax / rook / crane (Hyper3D Rodin, rigged in art/rodin-work/<id>_rig.blend):
//     Jax's skeleton (pelvis, spine, chest, head, thigh/shin/foot L+R) + a Gun bone + Muzzle;
//     one textured material whose grey emissive map is tinted in code
//   enemy models drone / turret / wraith (Hyper3D Rodin, split in art/rodin-work/<type>_split.blend):
//     one material Rodin<Type> (grey emissive map, tinted per enemy in enemies.js);
//     drone  Head > DroneBody, Rotor1..4     turret  Head > TurretHead, TurretLegs     wraith  Head > WraithBody
//   warden.glb (District 05 boss, driven by boss.js; art/rodin-work/warden_rig.blend): skinned, bones pelvis, spine,
//     chest, head, thigh/shin/foot L+R, armL/armR, cannonL1/L2/R1/R2 (spin around their own axis),
//     MuzzleL1..R2 empties at the barrel tips; 3.4 m tall, faces +Z
//   event models (e.g. santa.glb) are listed in events.js and only loaded while their event is live
//   weapons weapon_<kind>.glb (art/rodin-work/scripts/weapon_prep.py): root Weapon<Kind> whose origin is
//     the right-hand grip (parent it to a character's Gun bone), empties Grip / Foregrip / Muzzle,
//     barrel along +Z, handles down, one lit material with the weapon's own colours
//     weapon_rifle (Rodin e67ba3b6, the crew's rifle with a drum magazine): 0.92 m, Foregrip 0.45 m ahead
//   melee weapons (art/rodin-work/scripts/melee_prep.py): same root/Grip/Foregrip, stored upright, Tip at the blade
//   empty-handed crew bodies jax_unarmed / rook_unarmed / crane_unarmed (Rodin cbe9488b / ddc9f71b / c735b2e1,
//     rig_unarmed.py): the same skeleton plus arm bones (upperarm > forearm > hand L/R) and Gun on handR,
//     for the weapon system (a separate weapon on the Gun bone). Not loaded yet: add them to CORE_MODELS
//     with weapon_rifle when the weapon system replaces the crew models with their guns built in.
// ============================================================
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneWithSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { eventModels } from "./events.js";

const loader = new GLTFLoader();
const SOURCES = {};
const NEON = /^(Trim|Core|Eye|Glow)/;

const CORE_MODELS = ["player", "jax", "rook", "crane", "drone", "turret", "wraith", "terminal", "crate", "warden"];

export async function loadModels(names = [...CORE_MODELS, ...eventModels()]) {
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
