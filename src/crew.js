// ============================================================
//  CREW — the characters sleeping in the District 01 hypersleep chamber, where Jax wakes up.
//  Each one has an ID card hidden somewhere in the station (Rook's is in District 03,
//  Crane's in District 04).
//  Take a card to that district's crew terminal ("K") and the station thaws the pod; the
//  character joins (a district without a terminal wakes them on pickup). TAB (or 1-4) swaps,
//  SHIFT / right click uses the current character's ability. Jax keeps the phase shift.
//  Each crew member has their own health and phase energy (game.vitals in main.js).
// ============================================================
import * as THREE from "three";
import { EVENTS, eventLive } from "./events.js";

// Character select: `bio` and `abilityText` are shown on the crew screen, `role` under the name.
// Skins recolour the glow lines (`glow`, null = the crew colour / Jax's phase colour) and the armour
// (`body` multiplies the Rodin albedo; the suits are near-black, so values above 1 lighten them).
// `unlock`: { clear: "d02" } = clear that district, { feat: "wardenDown" } = see FEATS below,
// { event: "christmas" } = free while that event is live.
// `model`: a skin that is a whole different model (assets/models/<model>.glb) instead of a recolour.
// `event`: the skin only exists while that event (events.js) is live: hidden from skinsOf(), never
// unlocked, never worn. List skins for the crew screen with skinsOf(id), not CREW[id].skins.
export const CREW = {
  jax: {
    id: "jax", name: "JAX CALDER", short: "J. CALDER", tag: "STATUS: TERMINATED?",
    ability: "PHASE SHIFT", pod: "01", tint: null, css: "#55e6ff", role: "EXPLORER // POD 01",
    bio: "Station explorer, officially dead since the first breach, and nobody can tell him why he isn't. His suit rides the tear between the City and the Breach.",
    abilityText: "Phase into the Breach: walls turn into doorways, and nothing in the City can see or hit you, not even the Warden. The Breach drains phase energy, so don't stay long.",
    skins: [
      { id: "standard", name: "STANDARD ISSUE", glow: null, body: null },
      { id: "ghost", name: "GHOST PROTOCOL", glow: new THREE.Color(0.8, 0.95, 1.0), body: new THREE.Color(3.4, 3.6, 4.0), unlock: { clear: "d02" } },
      { id: "breaker", name: "WARDEN BREAKER", glow: new THREE.Color(1.0, 0.68, 0.18), body: new THREE.Color(1.9, 1.45, 0.85), unlock: { feat: "wardenDown" } },
    ],
  },
  rook: {
    id: "rook", name: "IRIS ROOK", short: "I. ROOK", tag: "NETRUNNER // POD 07",
    ability: "REMOTE HACK", pod: "07", tint: new THREE.Color(0.55, 1.0, 0.3), css: "#9dff6a", role: "NETRUNNER // POD 07",
    bio: "Netrunner. She talks to machines better than to people, and the machines usually listen. They said she died in the first breach too.",
    abilityText: "Hack terminals and turrets from up to 16 m away, straight through walls. A hijacked turret fights for you. Even the Warden has a port: override him and his own cannons turn on him.",
    skins: [
      { id: "netrunner", name: "NETRUNNER", glow: null, body: null },
      { id: "blackice", name: "BLACK ICE", glow: new THREE.Color(0.3, 0.75, 1.0), body: new THREE.Color(0.75, 0.95, 1.6), unlock: { clear: "d03" } },
      { id: "override", name: "OVERRIDE", glow: new THREE.Color(1.0, 0.22, 0.38), body: new THREE.Color(1.7, 0.85, 0.95), unlock: { feat: "wardenHacked" } },
      // Christmas event (off): her own model, candy-cane stripes and gold. See events.js before launch.
      { id: "candycane", name: "CANDY CANE", model: "rook_xmas", glow: null, body: null, event: "christmas", unlock: { event: "christmas" } },
    ],
    wake: [
      { speaker: "STATION COMPUTER", text: "Crew ID verified: IRIS ROOK, netrunner. Pod 07, hypersleep chamber: thaw cycle complete." },
      { speaker: "IRIS ROOK", text: "...Calder? They said you died in the first breach. Funny. They said that about me too." },
      { speaker: "IRIS ROOK", text: "You punch through worlds. I punch through firewalls. Point me at anything with a circuit and I'll take it, walls or not." },
      { speaker: "DR. LENA VOSS", text: "Rook is on your link now. TAB swaps between you. Anything locked behind glass from here on? That's hers." },
    ],
  },
  // the tank: more health, a bit slower, and SHIFT lifts crates and small enemies to throw them
  crane: {
    id: "crane", name: 'HOLLIS "BOULDER" CRANE', short: "BOULDER", tag: "HEAVY // POD 11",
    ability: "GRAB & THROW", pod: "11", tint: new THREE.Color(0.8, 0.5, 1.0), css: "#c78bff",
    hp: 160, speed: 0.88, bulk: 1.16, role: "HEAVY LIFTER // POD 11",
    // a heavy jog instead of Jax's sprint (player.js DEFAULT_GAIT): steps at a normal pace (just
    // stretching Jax's cycle to his size read as a slow-motion sprint), a shorter swing so the
    // planted foot still keeps up with the ground, a low heel kick, more hip sway and shoulder swing
    gait: { cadence: 1.12, swing: 0.66, knee: 1.05, twist: 0.15, roll: 0.09, lean: 0.07, bob: 0.07 },
    bio: "Heavy lifter. The last thing he remembers is carrying a reactor core up four flights of stairs. If it's bolted down, he'll unbolt it. If it flies, he'll catch it.",
    abilityText: "Lift heavy crates and small enemies overhead, then throw them where you aim. Supply crates break open with loot inside, and a crate hits the Warden three times as hard.",
    skins: [
      { id: "heavy", name: "HEAVY", glow: null, body: null },
      { id: "scrapyard", name: "SCRAPYARD", glow: new THREE.Color(1.0, 0.52, 0.12), body: new THREE.Color(2.0, 1.35, 0.85), unlock: { clear: "d04" } },
      { id: "titan", name: "TITAN", glow: new THREE.Color(1.0, 0.85, 0.35), body: new THREE.Color(2.4, 2.0, 1.2), unlock: { feat: "wardenCrated" } },
      // Christmas event (off): his own model, red and green armour, gold trim, fur collar and boots. See events.js.
      { id: "yuletide", name: "YULETIDE", model: "crane_xmas", glow: null, body: null, event: "christmas", unlock: { event: "christmas" } },
    ],
    wake: [
      { speaker: "STATION COMPUTER", text: "Crew ID verified: HOLLIS CRANE, heavy lifter. Pod 11, hypersleep chamber: thaw cycle complete." },
      { speaker: 'HOLLIS "BOULDER" CRANE', text: "Easy. Easy. Last thing I remember, I was carrying a reactor core up four flights of stairs. Did I drop it?" },
      { speaker: 'HOLLIS "BOULDER" CRANE', text: "Doesn't matter. Call me Boulder, everybody does. Point me at something heavy. If it's bolted down, I'll unbolt it. If it flies, I'll catch it." },
      { speaker: "DR. LENA VOSS", text: "Boulder is on your link. SHIFT lifts a crate or a small enemy, press it again to throw. Supply crates with gold straps break open with something useful inside." },
    ],
  },
  // a pod that's waiting on a card from a later district
  lumen: {
    id: "lumen", name: "???", short: "???", tag: "POD 03", ability: "FLARE", pod: "03",
    tint: new THREE.Color(1.0, 0.85, 0.4), css: "#ffd36a", future: true, role: "POD 03",
    bio: "Pod 03's ID card was pulled, and whoever took it went through Portal Zero. The pod is reading something... bright.",
  },
};

// ---------- squad: who you bring into a district (max 3, chosen on the crew screen) ----------
export const MAX_SQUAD = 3;
export function loadSquad(unlocked) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem("pb-squad") || "[]"); } catch (e) {}
  list = (Array.isArray(list) ? list : []).filter(id => unlocked.includes(id));
  if (!list.length) list = unlocked.slice(0, MAX_SQUAD);
  return list.slice(0, MAX_SQUAD);
}
export function saveSquad(list) {
  try { localStorage.setItem("pb-squad", JSON.stringify(list.slice(0, MAX_SQUAD))); } catch (e) {}
}

// ---------- feats (skin unlocks earned in a fight) ----------
export const FEATS = {
  wardenDown: "Defeat the Warden",
  wardenHacked: "Override the Warden with Rook's hack",
  wardenCrated: "Hit the Warden with a crate Boulder throws",
};
export function loadFeats() {
  try { const f = JSON.parse(localStorage.getItem("pb-feats") || "[]"); return Array.isArray(f) ? f : []; } catch (e) { return []; }
}
// Records a feat. Returns the skins it just unlocked (for a toast), or [] if it was already earned.
export function earnFeat(id) {
  const feats = loadFeats();
  if (feats.includes(id)) return [];
  const before = unlockedSkins();
  feats.push(id);
  try { localStorage.setItem("pb-feats", JSON.stringify(feats)); } catch (e) {}
  return newlyUnlocked(before);
}

// ---------- skins ----------
function cleared(id) {
  try { return !!(JSON.parse(localStorage.getItem("pb-records") || "{}") || {})[id]; } catch (e) { return false; }
}
export function skinUnlocked(skin) {
  if (skin.event && !eventLive(skin.event)) return false;   // event skins don't exist outside their event
  const u = skin.unlock;
  if (!u) return true;
  if (u.clear) return cleared(u.clear);
  if (u.feat) return loadFeats().includes(u.feat);
  if (u.event) return eventLive(u.event);
  return false;
}
export function unlockText(skin) {
  const u = skin.unlock;
  if (!u) return "";
  if (u.clear) return `Clear District ${u.clear.slice(1)}`;
  if (u.event) return `${EVENTS[u.event]?.name || u.event} event`;
  return FEATS[u.feat] || "???";
}
// the skins the crew screen may show (event skins only while their event is live)
export const skinsOf = id => (CREW[id]?.skins || []).filter(s => !s.event || eventLive(s.event));
// "jax:ghost" keys of every unlocked skin (to spot new unlocks after a win or a feat)
export function unlockedSkins() {
  const out = new Set();
  for (const c of Object.values(CREW)) for (const s of c.skins || []) if (skinUnlocked(s)) out.add(`${c.id}:${s.id}`);
  return out;
}
export function newlyUnlocked(before) {
  const out = [];
  for (const c of Object.values(CREW)) for (const s of c.skins || []) if (!before.has(`${c.id}:${s.id}`) && skinUnlocked(s)) out.push({ crew: c, skin: s });
  return out;
}
function loadSkinChoice() {
  try { return JSON.parse(localStorage.getItem("pb-skins") || "{}") || {}; } catch (e) { return {}; }
}
// the skin a crew member wears (falls back to their first one if the saved choice is locked)
export function skinOf(id) {
  const skins = CREW[id]?.skins;
  if (!skins) return null;
  const s = skins.find(x => x.id === loadSkinChoice()[id]);
  return s && skinUnlocked(s) ? s : skins[0];
}
export function setSkin(id, skinId) {
  const all = loadSkinChoice();
  all[id] = skinId;
  try { localStorage.setItem("pb-skins", JSON.stringify(all)); } catch (e) {}
}
// glow colour in the game: the skin's, else the crew colour (null = Jax's phase colour)
export const glowOf = id => skinOf(id)?.glow || CREW[id]?.tint || null;
// the model a crew member wears: the skin's own model if it has one, else their usual one
export const modelOf = id => skinOf(id)?.model || id;
export const CREW_ORDER = ["jax", "rook", "crane", "lumen"];
// max health per crew member (Crane is the tank)
export const maxHp = id => CREW[id]?.hp || 100;
export const crewByPod = pod => Object.values(CREW).find(c => c.pod === pod);

export function loadCrew() {
  try {
    const list = JSON.parse(localStorage.getItem("pb-crew") || "[]");
    return CREW_ORDER.filter(id => id === "jax" || list.includes(id));
  } catch (e) { return ["jax"]; }
}
export function saveCrew(list) {
  try { localStorage.setItem("pb-crew", JSON.stringify(list.filter(id => id !== "jax"))); } catch (e) {}
}

// Revive cells: found lying around the districts and carried between them. At a revive
// chamber one brings back a crew member who went down (their health hit zero while a
// teammate was still standing).
export const MAX_CELLS = 3;
export function loadCells() {
  try { return Math.min(MAX_CELLS, Math.max(0, parseInt(localStorage.getItem("pb-cells") || "0", 10) || 0)); } catch (e) { return 0; }
}
export function saveCells(n) {
  try { localStorage.setItem("pb-cells", String(n)); } catch (e) {}
}
