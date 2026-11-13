// ============================================================
//  CREW — the characters sleeping in the District 05 hypersleep bay.
//  Each one has an ID card hidden somewhere in the station. Bring a card back to the bay,
//  open that pod, and the character joins: TAB (or 1-4) swaps, SHIFT / right click uses
//  the current character's ability. Jax keeps the phase shift.
// ============================================================
import * as THREE from "three";

export const CREW = {
  jax: {
    id: "jax", name: "JAX CALDER", short: "J. CALDER", tag: "STATUS: TERMINATED?",
    ability: "PHASE SHIFT", tint: null,
  },
  rook: {
    id: "rook", name: "IRIS ROOK", short: "I. ROOK", tag: "NETRUNNER // POD 07",
    ability: "REMOTE HACK", pod: "07", tint: new THREE.Color(0.55, 1.0, 0.3), css: "#9dff6a",
    wake: [
      { speaker: "STATION COMPUTER", text: "Crew ID verified: IRIS ROOK, netrunner. Pod 07 thaw cycle complete." },
      { speaker: "IRIS ROOK", text: "...Calder? They said you died in the first breach. Funny. They said that about me too." },
      { speaker: "IRIS ROOK", text: "You punch through worlds. I punch through firewalls. Point me at anything with a circuit and I'll take it, walls or not." },
      { speaker: "DR. LENA VOSS", text: "Rook is on your link now. TAB swaps between you. That sealed vault on the west side? That one's hers." },
    ],
  },
  // pods that are waiting on cards from later districts
  lumen: {
    id: "lumen", name: "???", short: "???", tag: "POD 03", ability: "FLARE", pod: "03",
    tint: new THREE.Color(1.0, 0.85, 0.4), css: "#ffd36a", future: true,
  },
  wren: {
    id: "wren", name: "???", short: "???", tag: "POD 11", ability: "???", pod: "11",
    tint: new THREE.Color(0.8, 0.5, 1.0), css: "#c78bff", future: true,
  },
};
export const CREW_ORDER = ["jax", "rook", "lumen", "wren"];
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
