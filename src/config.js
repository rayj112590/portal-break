import * as THREE from "three";

export const TILE = 2;
export const CITY = 0;
export const BREACH = 1;

export const PALETTE = [
  { // CITY
    fog: new THREE.Color(0x070b18),
    hemiSky: new THREE.Color(0x5a6cb0),
    hemiGround: new THREE.Color(0x0b0714),
    moon: new THREE.Color(0x8090ff),
    lamps: [new THREE.Color(0x30e0ff), new THREE.Color(0xff3fb4), new THREE.Color(0xffb347)],
    accent: new THREE.Color(0x55e6ff),
    css: "#55e6ff",
  },
  { // BREACH
    fog: new THREE.Color(0x2a0914),
    hemiSky: new THREE.Color(0xc04a66),
    hemiGround: new THREE.Color(0x16020a),
    moon: new THREE.Color(0xff3a5c),
    lamps: [new THREE.Color(0xff2050), new THREE.Color(0xb040ff), new THREE.Color(0xff6a20)],
    accent: new THREE.Color(0xff3355),
    css: "#ff3355",
  },
];

export const PLAYER = {
  hp: 100,
  speed: 7.2,
  radius: 0.45,
  fireRate: 9,
  damage: 10,
  bulletSpeed: 42,
  dashSpeed: 24,
  dashTime: 0.17,
  dashCooldown: 0.75,
  shiftCooldown: 0.9,
  breachDrain: 5.5,
  energyRegen: 14,
};

// Pickup weapons: found in supply crates (Crane smashes them open). They replace the rifle until
// the ammo runs out, and belong to whoever picked them up (kept through crew swaps).
export const WEAPONS = {
  scatter: { name: "SCATTER GUN", ammo: 36, rate: 3, pellets: 6, cone: 0.42, damage: 9, speed: 36, css: "#ff9a3c", color: new THREE.Color(1.0, 0.55, 0.15) },
  // rail: fast enough to feel like a power-up when held down (at 1.8/s it read as "one shot, then
  // nothing", and did less damage per second than the rifle), and it hits harder than the rifle
  rail:    { name: "RAIL GUN", ammo: 40, rate: 3.5, pellets: 1, cone: 0, damage: 36, speed: 75, pierce: 3, size: 2.2, css: "#bfe8ff", color: new THREE.Color(0.7, 0.9, 1.0) },
};
// what a pickup is called in toasts (supply crate contents)
export const LOOT_NAME = { hp: "HEALTH", energy: "PHASE ENERGY", cell: "REVIVE CELL", gift: "GIFT", scatter: "SCATTER GUN", rail: "RAIL GUN" };

export const ENEMY = {
  drone:  { hp: 30, speed: 4.0, radius: 0.5, phase: CITY,   fireEvery: 1.9, damage: 5,  bulletSpeed: 14, range: 12, score: 50 },
  turret: { hp: 70, speed: 0,   radius: 0.7, phase: CITY,   fireEvery: 2.6, damage: 5,  bulletSpeed: 17, range: 14, score: 100 },
  riftTurret: { hp: 60, speed: 0, radius: 0.7, phase: BREACH, fireEvery: 2.4, damage: 6, bulletSpeed: 16, range: 14, score: 100 },
  wraith: { hp: 40, speed: 5.4, radius: 0.5, phase: BREACH, fireEvery: 0,   damage: 14, bulletSpeed: 0,  range: 13, score: 75 },
};
