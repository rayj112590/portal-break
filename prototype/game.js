// ============================================================
//  PORTAL BREAK — Full Game Build
//  Story · Abilities · Levels · Side Missions · Unlocks · Portal Events
// ============================================================

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// DOM — screens
const startScreen     = document.getElementById("start-screen");
const endScreen       = document.getElementById("end-screen");
const storyScreen     = document.getElementById("story-screen");
const levelIntroScreen= document.getElementById("level-intro-screen");
const unlockScreen    = document.getElementById("unlock-screen");

// DOM — story
const storyHeading    = document.getElementById("story-heading");
const storyText       = document.getElementById("story-text");
const storySpeaker    = document.getElementById("story-speaker");
const storyNextButton = document.getElementById("story-next-button");

// DOM — HUD
const systemStatus    = document.getElementById("system-status");
const portalStatus    = document.getElementById("portal-status");
const missionText     = document.getElementById("mission-text");
const objective       = document.getElementById("objective");
const fieldLog        = document.getElementById("field-log");
const energyValue     = document.getElementById("energy-value");
const energyBar       = document.getElementById("energy-bar");
const artifactCount   = document.getElementById("artifact-count");
const sectorValue     = document.getElementById("sector-value");
const endTitle        = document.getElementById("end-title");
const endMessage      = document.getElementById("end-message");

// DOM — abilities & materials
const abilitySlots    = document.getElementById("ability-slots");
const materialList    = document.getElementById("material-list");
const teleportCharges = document.getElementById("teleport-charges");

// DOM — side missions
const sideMissionList = document.getElementById("side-mission-list");

// DOM — journal
const journalCount    = document.getElementById("journal-count");
const journalButton   = document.getElementById("journal-button");
const journalEntries  = document.getElementById("journal-entries");

// DOM — character select
const characterSelect = document.getElementById("character-select");
const characterGrid   = document.getElementById("character-grid");

// DOM — level info
const levelIntroName  = document.getElementById("level-intro-name");
const levelIntroStory = document.getElementById("level-intro-story");
const levelIntroBtn   = document.getElementById("level-intro-button");

// DOM — unlock screen
const unlockTitle     = document.getElementById("unlock-title");
const unlockBody      = document.getElementById("unlock-body");
const unlockButton    = document.getElementById("unlock-button");

const startButton     = document.getElementById("start-button");
const restartButton   = document.getElementById("restart-button");

const WIDTH  = canvas.width;
const HEIGHT = canvas.height;

// ============================================================
//  GAME DATA — Abilities
// ============================================================

const ABILITIES = {
  teleport: {
    name: "PHASE SHIFT",
    icon: "◈",
    color: "#55e6ff",
    description: "Teleport to a random spot. Costs 1 Phase Shard. May be safe or dangerous."
  },
  freezeTime: {
    name: "TIME FREEZE",
    icon: "❄",
    color: "#7df5bc",
    description: "Freeze all hazards for 5 seconds. Costs 1 Chrono Crystal."
  },
  speedBoost: {
    name: "SPEED SURGE",
    icon: "⚡",
    color: "#ffc857",
    description: "Double movement speed for 4 seconds. Costs 1 Volt Cell."
  },
  invisibility: {
    name: "CLOAK",
    icon: "◐",
    color: "#a879ff",
    description: "Become invisible to hazards for 5 seconds. Costs 1 Prism Dust."
  }
};

// ============================================================
//  GAME DATA — Levels
// ============================================================

const LEVELS = [
  {
    id: 0,
    name: "SECTOR 01: THE AWAKENING",
    intro: "You wake in a failing station. Collect the containment artifacts and reach the emergency portal.",
    storyAfter: [
      { speaker: "STATION COMPUTER", heading: "SECTOR CLEARED.", text: "The portal pulls you through. You arrive somewhere deeper in the facility." }
    ],
    abilityReward: null,
    sideMissions: [
      { id: "s1_explore", name: "Explore all rooms", desc: "Visit every section of Sector 01", reward: { outfit: "explorer" }, done: false }
    ],
    // layout is the same as the original prototype
    walls: [
      { x: 145, y: 0,   w: 18, h: 175 },
      { x: 145, y: 245, w: 18, h: 255 },
      { x: 285, y: 105, w: 18, h: 250 },
      { x: 425, y: 0,   w: 18, h: 180 },
      { x: 425, y: 250, w: 18, h: 250 },
      { x: 565, y: 110, w: 18, h: 280 }
    ],
    artifacts: [
      { x: 210, y: 100, found: false },
      { x: 360, y: 390, found: false },
      { x: 520, y: 125, found: false }
    ],
    materials: [],
    hazards: [],
    playerStart: { x: 75, y: 250 },
    portalPos: { x: 710, y: 250 }
  },

  {
    id: 1,
    name: "SECTOR 02: FROZEN CORE",
    intro: "A cryogenic chamber. Hazards patrol the corridors. Recover the Chrono Crystal to unlock Time Freeze.",
    storyAfter: [
      { speaker: "DR. LENA VOSS", heading: "You're the one from the logs.", text: "I've been monitoring you since you woke. The station didn't collapse on its own — someone triggered the breach from inside." },
      { speaker: "DR. LENA VOSS", heading: "Portal Zero", text: "They're trying to open Portal Zero. Whatever's on the other side, it can't be allowed through. I'll help you, but we have to keep moving." }
    ],
    abilityReward: "freezeTime",
    sideMissions: [
      { id: "s2_nohit", name: "Ghost Run", desc: "Complete Sector 02 without touching a hazard", reward: { character: "voss" }, done: false }
    ],
    walls: [
      { x: 120, y: 0,   w: 18, h: 160 },
      { x: 120, y: 220, w: 18, h: 280 },
      { x: 260, y: 80,  w: 18, h: 260 },
      { x: 400, y: 0,   w: 18, h: 200 },
      { x: 400, y: 260, w: 18, h: 240 },
      { x: 540, y: 100, w: 18, h: 240 },
      { x: 660, y: 0,   w: 18, h: 160 },
      { x: 660, y: 220, w: 18, h: 280 }
    ],
    artifacts: [
      { x: 190, y: 100, found: false },
      { x: 330, y: 380, found: false },
      { x: 470, y: 130, found: false },
      { x: 600, y: 380, found: false }
    ],
    materials: [
      { type: "chrono", x: 340, y: 220, collected: false }
    ],
    hazards: [
      { x: 200, y: 300, radius: 14, vx: 0, vy: 90,  minX: 150, maxX: 240, minY: 260, maxY: 400 },
      { x: 460, y: 200, radius: 14, vx: 0, vy: 110, minX: 420, maxX: 520, minY: 60,  maxY: 240 },
      { x: 600, y: 300, radius: 14, vx: 0, vy: 80,  minX: 560, maxX: 640, minY: 240, maxY: 400 }
    ],
    playerStart: { x: 60, y: 250 },
    portalPos: { x: 720, y: 250 }
  },

  {
    id: 2,
    name: "SECTOR 03: SURGE GRID",
    intro: "An energy distribution hub. Fast-moving hazards. Recover the Volt Cell to unlock Speed Surge.",
    storyAfter: [
      { speaker: "UNKNOWN TRANSMISSION", heading: "STOP.", text: "You are approaching the containment wing. The breach source is behind these walls. Turn back, explorer. You are not ready." },
      { speaker: "DR. LENA VOSS", heading: "Ignore that.", text: "That signal is coming from inside the station — whoever sent it is the one who caused all this. Keep going." }
    ],
    abilityReward: "speedBoost",
    sideMissions: [
      { id: "s3_speedrun", name: "Adrenaline", desc: "Complete Sector 03 in under 45 seconds", reward: { outfit: "surge" }, done: false }
    ],
    walls: [
      { x: 100, y: 0,   w: 18, h: 120 },
      { x: 100, y: 180, w: 18, h: 120 },
      { x: 100, y: 360, w: 18, h: 140 },
      { x: 250, y: 60,  w: 18, h: 180 },
      { x: 250, y: 300, w: 18, h: 200 },
      { x: 400, y: 0,   w: 18, h: 140 },
      { x: 400, y: 200, w: 18, h: 140 },
      { x: 400, y: 360, w: 18, h: 140 },
      { x: 550, y: 60,  w: 18, h: 180 },
      { x: 550, y: 300, w: 18, h: 200 },
      { x: 680, y: 0,   w: 18, h: 120 },
      { x: 680, y: 180, w: 18, h: 120 },
      { x: 680, y: 360, w: 18, h: 140 }
    ],
    artifacts: [
      { x: 180, y: 150, found: false },
      { x: 330, y: 250, found: false },
      { x: 470, y: 150, found: false },
      { x: 610, y: 250, found: false },
      { x: 330, y: 400, found: false }
    ],
    materials: [
      { type: "volt", x: 470, y: 400, collected: false }
    ],
    hazards: [
      { x: 180, y: 250, radius: 12, vx: 0, vy: 160, minX: 120, maxX: 230, minY: 200, maxY: 340 },
      { x: 330, y: 150, radius: 12, vx: 140, vy: 0, minX: 270, maxX: 380, minY: 50,  maxY: 180 },
      { x: 470, y: 300, radius: 12, vx: 0, vy: 150, minX: 420, maxX: 530, minY: 210, maxY: 340 },
      { x: 610, y: 150, radius: 12, vx: 130, vy: 0, minX: 570, maxX: 660, minY: 50,  maxY: 170 },
      { x: 180, y: 420, radius: 12, vx: 120, vy: 0, minX: 120, maxX: 230, minY: 370, maxY: 470 }
    ],
    playerStart: { x: 50, y: 250 },
    portalPos: { x: 740, y: 250 }
  },

  {
    id: 3,
    name: "SECTOR 04: MIRROR VAULT",
    intro: "A chamber of refracted light. Recover the Prism Dust to unlock Cloak (Invisibility).",
    storyAfter: [
      { speaker: "STATION COMPUTER", heading: "BREACH SOURCE LOCATED.", text: "Portal Zero is one sector ahead. Energy readings are off every scale on record." },
      { speaker: "DR. LENA VOSS", heading: "This is it.", text: "Whatever comes through that portal, we stop it here. I've unlocked every system I can. Good luck, explorer." }
    ],
    abilityReward: "invisibility",
    sideMissions: [
      { id: "s4_collectall", name: "Completionist", desc: "Collect every material in Sector 04", reward: { outfit: "phantom" }, done: false }
    ],
    walls: [
      { x: 130, y: 50,  w: 18, h: 140 },
      { x: 130, y: 250, w: 18, h: 200 },
      { x: 270, y: 0,   w: 18, h: 180 },
      { x: 270, y: 240, w: 18, h: 180 },
      { x: 270, y: 460, w: 18, h: 40 },
      { x: 410, y: 50,  w: 18, h: 140 },
      { x: 410, y: 250, w: 18, h: 200 },
      { x: 550, y: 0,   w: 18, h: 180 },
      { x: 550, y: 240, w: 18, h: 180 },
      { x: 550, y: 460, w: 18, h: 40 },
      { x: 670, y: 50,  w: 18, h: 140 },
      { x: 670, y: 250, w: 18, h: 200 }
    ],
    artifacts: [
      { x: 200, y: 100, found: false },
      { x: 200, y: 400, found: false },
      { x: 340, y: 200, found: false },
      { x: 340, y: 320, found: false },
      { x: 480, y: 100, found: false },
      { x: 480, y: 400, found: false }
    ],
    materials: [
      { type: "prism", x: 620, y: 200, collected: false },
      { type: "prism", x: 620, y: 350, collected: false }
    ],
    hazards: [
      { x: 340, y: 130, radius: 13, vx: 0, vy: 120, minX: 290, maxX: 390, minY: 50,  maxY: 190 },
      { x: 340, y: 370, radius: 13, vx: 0, vy: 120, minX: 290, maxX: 390, minY: 250, maxY: 430 },
      { x: 480, y: 250, radius: 13, vx: 100, vy: 0, minX: 430, maxX: 530, minY: 210, maxY: 290 },
      { x: 200, y: 250, radius: 13, vx: 90, vy: 0, minX: 150, maxX: 250, minY: 200, maxY: 300 }
    ],
    playerStart: { x: 50, y: 250 },
    portalPos: { x: 740, y: 250 }
  },

  {
    id: 4,
    name: "SECTOR 05: PORTAL ZERO",
    intro: "The breach source. Stop whatever is coming through Portal Zero. This is the end — or the beginning.",
    storyAfter: [
      { speaker: "???", heading: "YOU CAME.", text: "The explorer who should be terminated. How persistent. But you are too late — the portal is already open." },
      { speaker: "DR. LENA VOSS", heading: "Close it!", text: "The portal stabilizer is in the chamber. Disable it and the breach collapses. GO!" }
    ],
    abilityReward: null,
    sideMissions: [
      { id: "s5_flawless", name: "Unbreakable", desc: "Complete Portal Zero without losing any energy", reward: { character: "warden" }, done: false }
    ],
    walls: [
      { x: 110, y: 0,   w: 18, h: 180 },
      { x: 110, y: 240, w: 18, h: 260 },
      { x: 250, y: 80,  w: 18, h: 340 },
      { x: 390, y: 0,   w: 18, h: 180 },
      { x: 390, y: 240, w: 18, h: 260 },
      { x: 530, y: 80,  w: 18, h: 340 },
      { x: 650, y: 0,   w: 18, h: 180 },
      { x: 650, y: 240, w: 18, h: 260 }
    ],
    artifacts: [
      { x: 180, y: 120, found: false },
      { x: 320, y: 380, found: false },
      { x: 460, y: 120, found: false },
      { x: 590, y: 380, found: false },
      { x: 320, y: 220, found: false }
    ],
    materials: [
      { type: "phase", x: 460, y: 280, collected: false }
    ],
    hazards: [
      { x: 180, y: 300, radius: 15, vx: 0, vy: 130, minX: 130, maxX: 230, minY: 200, maxY: 400 },
      { x: 320, y: 150, radius: 15, vx: 120, vy: 0, minX: 270, maxX: 370, minY: 90,  maxY: 210 },
      { x: 460, y: 300, radius: 15, vx: 0, vy: 140, minX: 410, maxX: 510, minY: 250, maxY: 400 },
      { x: 590, y: 150, radius: 15, vx: 110, vy: 0, minX: 540, maxX: 640, minY: 90,  maxY: 210 },
      { x: 320, y: 350, radius: 15, vx: 100, vy: 0, minX: 270, maxX: 370, minY: 260, maxY: 440 },
      { x: 700, y: 350, radius: 18, vx: 0, vy: 200, minX: 670, maxX: 740, minY: 50,  maxY: 460 }
    ],
    playerStart: { x: 50, y: 250 },
    portalPos: { x: 740, y: 250 }
  }
];

// ============================================================
//  GAME DATA — Characters & Outfits
// ============================================================

const CHARACTERS = {
  explorer: {
    name: "THE EXPLORER",
    desc: "Amnesiac survivor. Balanced stats.",
    colors: { jacket: "#173D68", trim: "#2877A8", pants: "#202D42", skin: "#E4B894", hair: "#211B22" }
  },
  voss: {
    name: "DR. LENA VOSS",
    desc: "Station scientist. Faster energy drain, higher speed.",
    colors: { jacket: "#2d5a3d", trim: "#5dba7d", pants: "#1a2820", skin: "#d4a87a", hair: "#8B4513" }
  },
  warden: {
    name: "THE WARDEN",
    desc: "Mysterious entity from Portal Zero. No energy drain.",
    colors: { jacket: "#3a1535", trim: "#a879ff", pants: "#1a0a18", skin: "#c9c9d0", hair: "#0a0a0a" }
  }
};

const OUTFITS = {
  default: { name: "Standard Issue", desc: "Default explorer suit" },
  explorer: { name: "Deep Survey", desc: "Enhanced for long expeditions" },
  surge: { name: "Surge Rig", desc: "Tuned for high-voltage sectors" },
  phantom: { name: "Phantom Cloak", desc: "Refracts light in mirror vaults" }
};

// ============================================================
//  GAME DATA — Journal Clues
// ============================================================

const journalClues = [
  { title: "ENTRY 001: UNKNOWN IDENTITY", text: "Your personnel record says you are terminated. You are still alive." },
  { title: "ENTRY 002: THE LOCKDOWN", text: "Someone deliberately sealed the emergency portal. The station's security logs have been erased." },
  { title: "ENTRY 003: PORTAL ZERO", text: "An unknown transmission warns you not to open Portal Zero. Who sent the warning?" },
  { title: "ENTRY 004: DR. VOSS", text: "Dr. Lena Voss has been guiding you through the station. Her personnel file lists her as deceased three years ago." },
  { title: "ENTRY 005: THE BREACH", text: "The breach was triggered manually. Someone wanted Portal Zero opened from this side." },
  { title: "ENTRY 006: THE WARDEN", text: "Whatever came through Portal Zero calls itself the Warden. It has been waiting." },
  { title: "ENTRY 007: YOUR NAME", text: "The final terminal reveals your identity: Officer Kael Ren. You were the one assigned to seal Portal Zero — and you failed." },
  { title: "ENTRY 008: SECOND CHANCE", text: "The station gave you a second life. This time, finish what you started." }
];

// ============================================================
//  GAME DATA — Portal Crossover Events (future expansion hooks)
// ============================================================

const PORTAL_EVENTS = [
  {
    id: "shadow_realm",
    name: "SHADOW REALM CROSSOVER",
    desc: "A rift to the Shadow Realm has opened. New missions and characters await.",
    unlockCondition: "Complete the main story",
    newCharacters: ["shadow_blade"],
    locked: true
  },
  {
    id: "neon_city",
    name: "NEON CITY CROSSOVER",
    desc: "A portal to a neon-soaked cyber world. Collect new materials and unlock new abilities.",
    unlockCondition: "Complete 3 side missions",
    newCharacters: ["cyber_runner"],
    locked: true
  },
  {
    id: "abyss_depths",
    name: "ABYSS DEPTHS CROSSOVER",
    desc: "An underwater world beneath the station. Ancient technology and ancient dangers.",
    unlockCondition: "Unlock all abilities",
    newCharacters: ["deep_one"],
    locked: true
  }
];

// ============================================================
//  GAME STATE
// ============================================================

const keys = {};
let running = false;
let finished = false;
let lastTime = 0;
let energy = 100;

// Player
const player = {
  x: 75,
  y: 250,
  radius: 13,
  speed: 205,
  isMoving: false,
  invisible: false,
  speedBuff: false,
  freezeActive: false
};

// Persistent save
let saveData = {
  currentLevel: 0,
  completedLevels: [],
  unlockedAbilities: [],
  materials: { phase: 0, chrono: 0, volt: 0, prism: 0 },
  discoveredClues: [],
  unlockedCharacters: ["explorer"],
  unlockedOutfits: ["default"],
  selectedCharacter: "explorer",
  selectedOutfit: "default",
  completedSideMissions: [],
  portalEventsUnlocked: [],
  storyComplete: false,
  sideMissionsCompletedCount: 0
};

// Per-level runtime state
let currentLevelData = null;
let artifacts = [];
let materials = [];
let hazards = [];
let walls = [];
let portal = { x: 710, y: 250, radius: 30 };
let portalActive = false;
let artifactsFound = 0;
let levelStartTime = 0;
let levelTookHit = false;

// Ability timers
let abilityTimers = {
  freezeTime: 0,
  speedBoost: 0,
  invisibility: 0
};

// Story
const openingStory = [
  { speaker: "STATION COMPUTER", heading: "WAKE UP, EXPLORER.", text: "Life support failing. Station systems compromised. Your identity could not be verified." },
  { speaker: "UNKNOWN TRANSMISSION", heading: "YOU SHOULD BE DEAD.", text: "A damaged terminal flickers to life: EXPLORER RECORD FOUND. STATUS: TERMINATED." },
  { speaker: "STATION COMPUTER", heading: "PORTAL LOCKDOWN.", text: "Three energy artifacts are missing from the containment sector. Recover them to restore the emergency portal." },
  { speaker: "UNKNOWN TRANSMISSION", heading: "DO NOT OPEN PORTAL ZERO.", text: "The message cuts out. Something moves behind the observation glass. Your only way forward is through the station." },
  { speaker: "NARRATOR", heading: "PORTAL BREAK", text: "Navigate five sectors of a collapsing dimensional research station. Collect materials to unlock abilities. Complete side missions for new outfits and characters. Stop the breach." }
];

let storyIndex = 0;
let postLevelStoryQueue = [];
let inPostLevelStory = false;

// ============================================================
//  SAVE / LOAD
// ============================================================

function loadSave() {
  try {
    const saved = localStorage.getItem("portalBreakSave");
    if (saved) {
      const parsed = JSON.parse(saved);
      saveData = Object.assign(saveData, parsed);
    }
  } catch (e) {
    // fresh save
  }

  // Load journal clues
  try {
    const clues = localStorage.getItem("portalBreakJournal");
    if (clues) {
      const parsed = JSON.parse(clues);
      if (Array.isArray(parsed)) {
        saveData.discoveredClues = parsed.filter(
          i => Number.isInteger(i) && i >= 0 && i < journalClues.length
        );
      }
    }
  } catch (e) {}
}

function persistSave() {
  try {
    localStorage.setItem("portalBreakSave", JSON.stringify(saveData));
    localStorage.setItem("portalBreakJournal", JSON.stringify(saveData.discoveredClues));
  } catch (e) {}
}

// ============================================================
//  JOURNAL
// ============================================================

function unlockClue(index) {
  if (saveData.discoveredClues.includes(index)) return;
  saveData.discoveredClues.push(index);
  persistSave();
  updateJournal();
  fieldLog.textContent = `New clue recovered: ${journalClues[index].title}`;
  journalButton.textContent = "NEW CLUE FOUND!";
}

function updateJournal() {
  journalCount.textContent =
    `${saveData.discoveredClues.length} of ${journalClues.length} clues discovered`;

  journalEntries.innerHTML = "";

  saveData.discoveredClues.forEach(index => {
    const clue = journalClues[index];
    const entry = document.createElement("div");
    const heading = document.createElement("h4");
    const paragraph = document.createElement("p");

    entry.className = "journal-entry";
    heading.textContent = clue.title;
    paragraph.textContent = clue.text;

    entry.appendChild(heading);
    entry.appendChild(paragraph);
    journalEntries.appendChild(entry);
  });
}

journalButton.addEventListener("click", () => {
  const isHidden = journalEntries.classList.toggle("hidden");
  journalButton.textContent = isHidden ? "OPEN JOURNAL" : "CLOSE JOURNAL";
  if (!isHidden) updateJournal();
});

// ============================================================
//  ABILITY / MATERIAL HUD
// ============================================================

const MATERIAL_NAMES = {
  phase:   { name: "Phase Shards",    icon: "◈", color: "#55e6ff" },
  chrono:  { name: "Chrono Crystals", icon: "❄", color: "#7df5bc" },
  volt:    { name: "Volt Cells",      icon: "⚡", color: "#ffc857" },
  prism:   { name: "Prism Dust",      icon: "◐", color: "#a879ff" }
};

function updateAbilityHUD() {
  // Material counts
  materialList.innerHTML = "";
  for (const [key, info] of Object.entries(MATERIAL_NAMES)) {
    const count = saveData.materials[key] || 0;
    const div = document.createElement("div");
    div.className = "material-item";
    div.innerHTML =
      `<span class="mat-icon" style="color:${info.color}">${info.icon}</span>` +
      `<span class="mat-name">${info.name}</span>` +
      `<span class="mat-count">×${count}</span>`;
    materialList.appendChild(div);
  }

  // Teleport charges
  teleportCharges.textContent = saveData.materials.phase || 0;

  // Ability slots
  abilitySlots.innerHTML = "";
  const allAbilities = ["teleport", "freezeTime", "speedBoost", "invisibility"];
  for (const abId of allAbilities) {
    const ab = ABILITIES[abId];
    const unlocked = saveData.unlockedAbilities.includes(abId);
    const div = document.createElement("div");
    div.className = "ability-slot" + (unlocked ? "" : " locked");
    div.innerHTML =
      `<span class="ability-icon" style="color:${ab.color}">${ab.icon}</span>` +
      `<span class="ability-name">${unlocked ? ab.name : "???"}</span>` +
      `<span class="ability-desc">${unlocked ? ab.description : "Locked"}</span>`;
    abilitySlots.appendChild(div);
  }
}

// ============================================================
//  SIDE MISSION HUD
// ============================================================

function updateSideMissionHUD() {
  sideMissionList.innerHTML = "";

  let totalMissions = 0;
  let completed = 0;

  for (const level of LEVELS) {
    for (const sm of level.sideMissions) {
      totalMissions++;
      const done = saveData.completedSideMissions.includes(sm.id);
      if (done) completed++;

      const div = document.createElement("div");
      div.className = "side-mission" + (done ? " done" : "");
      div.innerHTML =
        `<span class="sm-check">${done ? "✓" : "○"}</span>` +
        `<div><strong>${sm.name}</strong>` +
        `<p>${sm.desc} — ${level.name}</p>` +
        `<span class="sm-reward">Reward: ${formatReward(sm.reward)}</span></div>`;
      sideMissionList.appendChild(div);
    }
  }

  const header = document.createElement("div");
  header.className = "sm-summary";
  header.textContent = `${completed} / ${totalMissions} missions completed`;
  sideMissionList.insertBefore(header, sideMissionList.firstChild);
}

function formatReward(reward) {
  if (reward.character) return `Unlock ${CHARACTERS[reward.character]?.name || reward.character}`;
  if (reward.outfit) return `Unlock ${OUTFITS[reward.outfit]?.name || reward.outfit} outfit`;
  return "Unknown reward";
}

function checkSideMissions() {
  if (!currentLevelData) return;

  for (const sm of currentLevelData.sideMissions) {
    if (saveData.completedSideMissions.includes(sm.id)) continue;

    let completed = false;

    // Check specific conditions
    if (sm.id === "s3_speedrun") {
      const elapsed = (performance.now() - levelStartTime) / 1000;
      if (elapsed < 45 && finished) completed = true;
    }
    if (sm.id === "s2_nohit") {
      if (!levelTookHit && finished) completed = true;
    }
    if (sm.id === "s5_flawless") {
      if (!levelTookHit && finished) completed = true;
    }
    if (sm.id === "s4_collectall") {
      if (finished && materials.every(m => m.collected)) completed = true;
    }

    if (completed) {
      saveData.completedSideMissions.push(sm.id);
      saveData.sideMissionsCompletedCount++;

      // Grant reward
      if (sm.reward.character && !saveData.unlockedCharacters.includes(sm.reward.character)) {
        saveData.unlockedCharacters.push(sm.reward.character);
        showUnlock("NEW CHARACTER UNLOCKED", `${CHARACTERS[sm.reward.character].name} — ${CHARACTERS[sm.reward.character].desc}`);
      }
      if (sm.reward.outfit && !saveData.unlockedOutfits.includes(sm.reward.outfit)) {
        saveData.unlockedOutfits.push(sm.reward.outfit);
        showUnlock("NEW OUTFIT UNLOCKED", `${OUTFITS[sm.reward.outfit].name} — ${OUTFITS[sm.reward.outfit].desc}`);
      }

      persistSave();
      updateSideMissionHUD();
      checkPortalEventUnlocks();
    }
  }
}

// ============================================================
//  PORTAL EVENT UNLOCKS
// ============================================================

function checkPortalEventUnlocks() {
  // Complete the main story
  if (saveData.completedLevels.length >= LEVELS.length && !saveData.storyComplete) {
    saveData.storyComplete = true;
    if (!saveData.portalEventsUnlocked.includes("shadow_realm")) {
      saveData.portalEventsUnlocked.push("shadow_realm");
      showUnlock("PORTAL CROSSOVER EVENT", "SHADOW REALM crossover is now available! A new world awaits.");
    }
  }

  // 3 side missions
  if (saveData.sideMissionsCompletedCount >= 3 && !saveData.portalEventsUnlocked.includes("neon_city")) {
    saveData.portalEventsUnlocked.push("neon_city");
    showUnlock("PORTAL CROSSOVER EVENT", "NEON CITY crossover is now available! Enter a cyber world.");
  }

  // All abilities
  if (saveData.unlockedAbilities.length >= 3 && !saveData.portalEventsUnlocked.includes("abyss_depths")) {
    saveData.portalEventsUnlocked.push("abyss_depths");
    showUnlock("PORTAL CROSSOVER EVENT", "ABYSS DEPTHS crossover is now available! Dive into the unknown.");
  }

  persistSave();
}

// ============================================================
//  UNLOCK SCREEN
// ============================================================

function showUnlock(title, body) {
  unlockTitle.textContent = title;
  unlockBody.textContent = body;
  unlockScreen.classList.remove("hidden");
  running = false;
}

unlockButton.addEventListener("click", () => {
  unlockScreen.classList.add("hidden");
  if (finished) {
    // continue to next level or show end screen
    proceedAfterLevel();
  } else {
    running = true;
    lastTime = 0;
    requestAnimationFrame(gameLoop);
  }
});

// ============================================================
//  CHARACTER SELECT
// ============================================================

function buildCharacterSelect() {
  characterGrid.innerHTML = "";

  for (const [id, char] of Object.entries(CHARACTERS)) {
    const unlocked = saveData.unlockedCharacters.includes(id);
    const selected = saveData.selectedCharacter === id;
    const div = document.createElement("div");
    div.className = "char-card" + (selected ? " selected" : "") + (unlocked ? "" : " locked");
    div.innerHTML =
      `<div class="char-preview" data-char="${id}">` +
      renderCharacterPreview(char.colors) +
      `</div>` +
      `<strong>${unlocked ? char.name : "???"}</strong>` +
      `<p>${unlocked ? char.desc : "Locked"}</p>`;

    if (unlocked) {
      div.addEventListener("click", () => {
        saveData.selectedCharacter = id;
        persistSave();
        buildCharacterSelect();
      });
    }

    characterGrid.appendChild(div);
  }
}

function renderCharacterPreview(colors) {
  // Simple pixel-preview using inline divs
  return (
    `<div class="preview-wrapper">` +
    `<div class="pv-hair" style="background:${colors.hair}"></div>` +
    `<div class="pv-head" style="background:${colors.skin}"></div>` +
    `<div class="pv-jacket" style="background:${colors.jacket}"></div>` +
    `<div class="pv-trim" style="background:${colors.trim}"></div>` +
    `<div class="pv-pants" style="background:${colors.pants}"></div>` +
    `</div>`
  );
}

// Toggle character select visibility
const charSelectToggle = document.getElementById("char-select-toggle");
if (charSelectToggle) {
  charSelectToggle.addEventListener("click", () => {
    characterSelect.classList.toggle("hidden");
    buildCharacterSelect();
  });
}

const charSelectClose = document.getElementById("char-select-close");
if (charSelectClose) {
  charSelectClose.addEventListener("click", () => {
    characterSelect.classList.add("hidden");
  });
}

// ============================================================
//  COLLISION
// ============================================================

function circleTouchesRect(x, y, radius, rect) {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - nearestX;
  const dy = y - nearestY;
  return dx * dx + dy * dy < radius * radius;
}

function canMoveTo(x, y) {
  if (x - player.radius < 0 || x + player.radius > WIDTH ||
      y - player.radius < 0 || y + player.radius > HEIGHT) {
    return false;
  }
  return !walls.some(wall => circleTouchesRect(x, y, player.radius, wall));
}

function isPositionSafe(x, y) {
  // Check if position is inside a wall
  if (!canMoveTo(x, y)) return false;

  // Check if near a hazard
  for (const hazard of hazards) {
    const dist = Math.hypot(x - hazard.x, y - hazard.y);
    if (dist < hazard.radius + player.radius + 10) return false;
  }
  return true;
}

// ============================================================
//  TELEPORT (SHIFT KEY)
// ============================================================

function doTeleport() {
  if (!running) return;

  if (saveData.materials.phase > 0) {
    // Spend a phase shard
    saveData.materials.phase--;
    persistSave();
    updateAbilityHUD();

    // Find a random valid position
    let attempts = 0;
    let tx, ty;
    let safe = false;

    while (attempts < 30) {
      tx = 30 + Math.random() * (WIDTH - 60);
      ty = 30 + Math.random() * (HEIGHT - 60);
      if (canMoveTo(tx, ty)) {
        safe = isPositionSafe(tx, ty);
        break;
      }
      attempts++;
    }

    if (tx !== undefined) {
      // Teleport effect
      drawTeleportEffect(player.x, player.y, tx, ty);

      player.x = tx;
      player.y = ty;

      if (safe) {
        fieldLog.textContent = "PHASE SHIFT! Teleported to a safe position.";
      } else {
        fieldLog.textContent = "PHASE SHIFT! Teleported — but danger is near!";
      }

      // If we still have shards and landed in danger, inform player they can teleport again
      if (!safe && saveData.materials.phase > 0) {
        fieldLog.textContent += " Press SHIFT again to re-phase!";
      }

      // Check if teleported into a hazard
      checkHazardCollision();
    }
  } else {
    fieldLog.textContent = "No Phase Shards left! Find more to teleport.";
  }
}

// ============================================================
//  ABILITIES
// ============================================================

function activateAbility(abilityId) {
  if (!running) return;

  if (!saveData.unlockedAbilities.includes(abilityId)) {
    fieldLog.textContent = "Ability not unlocked yet.";
    return;
  }

  switch (abilityId) {
    case "freezeTime":
      if (saveData.materials.chrono > 0 && abilityTimers.freezeTime <= 0) {
        saveData.materials.chrono--;
        abilityTimers.freezeTime = 5;
        player.freezeActive = true;
        persistSave();
        updateAbilityHUD();
        fieldLog.textContent = "TIME FREEZE! Hazards frozen for 5 seconds.";
      } else if (abilityTimers.freezeTime > 0) {
        fieldLog.textContent = "Time already frozen!";
      } else {
        fieldLog.textContent = "No Chrono Crystals left!";
      }
      break;

    case "speedBoost":
      if (saveData.materials.volt > 0 && abilityTimers.speedBoost <= 0) {
        saveData.materials.volt--;
        abilityTimers.speedBoost = 4;
        player.speedBuff = true;
        persistSave();
        updateAbilityHUD();
        fieldLog.textContent = "SPEED SURGE! Double speed for 4 seconds!";
      } else if (abilityTimers.speedBoost > 0) {
        fieldLog.textContent = "Speed boost already active!";
      } else {
        fieldLog.textContent = "No Volt Cells left!";
      }
      break;

    case "invisibility":
      if (saveData.materials.prism > 0 && abilityTimers.invisibility <= 0) {
        saveData.materials.prism--;
        abilityTimers.invisibility = 5;
        player.invisible = true;
        persistSave();
        updateAbilityHUD();
        fieldLog.textContent = "CLOAK! Invisible to hazards for 5 seconds!";
      } else if (abilityTimers.invisibility > 0) {
        fieldLog.textContent = "Already cloaked!";
      } else {
        fieldLog.textContent = "No Prism Dust left!";
      }
      break;
  }
}

function updateAbilityTimers(delta) {
  if (abilityTimers.freezeTime > 0) {
    abilityTimers.freezeTime -= delta;
    if (abilityTimers.freezeTime <= 0) {
      abilityTimers.freezeTime = 0;
      player.freezeActive = false;
      fieldLog.textContent = "Time freeze ended.";
    }
  }

  if (abilityTimers.speedBoost > 0) {
    abilityTimers.speedBoost -= delta;
    if (abilityTimers.speedBoost <= 0) {
      abilityTimers.speedBoost = 0;
      player.speedBuff = false;
      fieldLog.textContent = "Speed surge faded.";
    }
  }

  if (abilityTimers.invisibility > 0) {
    abilityTimers.invisibility -= delta;
    if (abilityTimers.invisibility <= 0) {
      abilityTimers.invisibility = 0;
      player.invisible = false;
      fieldLog.textContent = "Cloak dissipated.";
    }
  }
}

// ============================================================
//  LEVEL SETUP
// ============================================================

function loadLevel(levelIndex) {
  const level = LEVELS[levelIndex];
  if (!level) return;

  currentLevelData = level;
  saveData.currentLevel = levelIndex;
  persistSave();

  // Clone layout data so we don't mutate the originals
  walls = level.walls.map(w => ({ ...w }));
  artifacts = level.artifacts.map(a => ({ ...a, found: false }));
  materials = (level.materials || []).map(m => ({ ...m, collected: false }));
  hazards = (level.hazards || []).map(h => ({ ...h }));
  portal = { ...level.portalPos, radius: 30 };

  player.x = level.playerStart.x;
  player.y = level.playerStart.y;
  player.invisible = false;
  player.speedBuff = false;
  player.freezeActive = false;

  abilityTimers = { freezeTime: 0, speedBoost: 0, invisibility: 0 };

  energy = 100;
  artifactsFound = 0;
  portalActive = false;
  levelStartTime = performance.now();
  levelTookHit = false;
  finished = false;

  // Show level intro
  levelIntroName.textContent = level.name;
  levelIntroStory.textContent = level.intro;
  levelIntroScreen.classList.remove("hidden");

  sectorValue.textContent = String(levelIndex + 1).padStart(2, "0");
  missionText.textContent = `Collect all ${artifacts.length} artifacts${materials.length > 0 ? " and materials" : ""}, then reach the portal.`;
  objective.textContent = `OBJECTIVE: RECOVER ${artifacts.length} ARTIFACTS`;
  portalStatus.textContent = "PORTAL OFFLINE";
  systemStatus.textContent = "STANDBY";
  fieldLog.textContent = `${level.name} loaded. Explore carefully.`;

  updateHUD();
  updateAbilityHUD();
  updateSideMissionHUD();
}

function startLevelFromIntro() {
  levelIntroScreen.classList.add("hidden");
  running = true;
  finished = false;
  lastTime = 0;
  requestAnimationFrame(gameLoop);
}

levelIntroBtn.addEventListener("click", startLevelFromIntro);

// ============================================================
//  GAME UPDATE
// ============================================================

function updateGame(delta) {
  let dx = 0;
  let dy = 0;
  player.isMoving = false;

  if (keys["w"] || keys["arrowup"]) dy -= 1;
  if (keys["s"] || keys["arrowdown"]) dy += 1;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;

  if (dx !== 0 || dy !== 0) {
    player.isMoving = true;
    const length = Math.hypot(dx, dy);
    dx /= length;
    dy /= length;

    const currentSpeed = player.speedBuff ? player.speed * 2 : player.speed;
    const nextX = player.x + dx * currentSpeed * delta;
    const nextY = player.y + dy * currentSpeed * delta;

    if (canMoveTo(nextX, player.y)) player.x = nextX;
    if (canMoveTo(player.x, nextY)) player.y = nextY;

    // Energy drain — Warden character has no drain
    if (saveData.selectedCharacter !== "warden") {
      const drainRate = saveData.selectedCharacter === "voss" ? 1.6 : 1.2;
      energy -= drainRate * delta;
    }
  }

  // Update ability timers
  updateAbilityTimers(delta);

  // Update hazards (unless frozen)
  if (!player.freezeActive) {
    for (const hazard of hazards) {
      hazard.x += hazard.vx * delta;
      hazard.y += hazard.vy * delta;

      if (hazard.x < hazard.minX) { hazard.x = hazard.minX; hazard.vx *= -1; }
      if (hazard.x > hazard.maxX) { hazard.x = hazard.maxX; hazard.vx *= -1; }
      if (hazard.y < hazard.minY) { hazard.y = hazard.minY; hazard.vy *= -1; }
      if (hazard.y > hazard.maxY) { hazard.y = hazard.maxY; hazard.vy *= -1; }
    }
  }

  // Artifact collection
  for (const artifact of artifacts) {
    if (!artifact.found) {
      const distance = Math.hypot(player.x - artifact.x, player.y - artifact.y);
      if (distance < player.radius + 12) {
        artifact.found = true;
        artifactsFound++;

        // Unlock clues based on level
        const clueBase = currentLevelData.id * 2;
        if (clueBase < journalClues.length) unlockClue(clueBase);
        if (clueBase + 1 < journalClues.length && artifactsFound === artifacts.length) {
          unlockClue(clueBase + 1);
        }

        fieldLog.textContent = `Artifact recovered! ${artifactsFound} of ${artifacts.length} found.`;
        updateHUD();
      }
    }
  }

  // Material collection
  for (const mat of materials) {
    if (!mat.collected) {
      const distance = Math.hypot(player.x - mat.x, player.y - mat.y);
      if (distance < player.radius + 12) {
        mat.collected = true;
        saveData.materials[mat.type] = (saveData.materials[mat.type] || 0) + 1;
        persistSave();
        updateAbilityHUD();
        fieldLog.textContent = `${MATERIAL_NAMES[mat.type].name} collected! Total: ${saveData.materials[mat.type]}`;
      }
    }
  }

  // Hazard collision
  checkHazardCollision();

  // Energy depletion
  if (energy <= 0) {
    energy = 0;
    endGame(false);
    return;
  }

  // Portal check
  const portalDistance = Math.hypot(player.x - portal.x, player.y - portal.y);
  if (portalActive && portalDistance < player.radius + portal.radius) {
    endGame(true);
  }

  updateHUD();
}

function checkHazardCollision() {
  if (player.invisible) return; // Can't be hit while invisible

  for (const hazard of hazards) {
    const distance = Math.hypot(player.x - hazard.x, player.y - hazard.y);
    if (distance < player.radius + hazard.radius) {
      energy -= 25;
      levelTookHit = true;

      // Knockback away from hazard
      const angle = Math.atan2(player.y - hazard.y, player.x - hazard.x);
      const knockback = 30;
      const kx = player.x + Math.cos(angle) * knockback;
      const ky = player.y + Math.sin(angle) * knockback;
      if (canMoveTo(kx, player.y)) player.x = kx;
      if (canMoveTo(player.x, ky)) player.y = ky;

      fieldLog.textContent = "HIT! Energy damaged. " + Math.max(0, Math.ceil(energy)) + "% remaining.";

      if (energy <= 0) {
        energy = 0;
        endGame(false);
      }
      break;
    }
  }
}

// ============================================================
//  HUD UPDATE
// ============================================================

function updateHUD() {
  energyValue.textContent = `${Math.max(0, Math.ceil(energy))}%`;
  energyBar.style.width = `${Math.max(0, energy)}%`;
  artifactCount.textContent = `${artifactsFound} / ${artifacts.length}`;

  if (artifactsFound === artifacts.length) {
    portalActive = true;
    portalStatus.textContent = "PORTAL ONLINE";
    missionText.textContent = "All artifacts recovered. Reach the portal!";
    objective.textContent = "OBJECTIVE: REACH THE PORTAL";
  }
}

// ============================================================
//  DRAWING
// ============================================================

function drawBackground() {
  ctx.fillStyle = "#080e1c";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let x = 0; x < WIDTH; x += 80) {
    for (let y = 0; y < HEIGHT; y += 80) {
      ctx.fillStyle = ((x / 80 + y / 80) % 2 === 0) ? "#0b1526" : "#0d192b";
      ctx.fillRect(x, y, 80, 80);
      ctx.strokeStyle = "rgba(85, 230, 255, 0.10)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 2, y + 2, 76, 76);
    }
  }

  ctx.strokeStyle = "rgba(85, 230, 255, 0.12)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= WIDTH; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke();
  }
  for (let y = 0; y <= HEIGHT; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke();
  }

  ctx.fillStyle = "rgba(0, 220, 255, 0.16)";
  ctx.fillRect(18, 18, WIDTH - 36, 3);
  ctx.fillRect(18, HEIGHT - 21, WIDTH - 36, 3);
  ctx.fillRect(18, 18, 3, HEIGHT - 36);
  ctx.fillRect(WIDTH - 21, 18, 3, HEIGHT - 36);

  ctx.strokeStyle = "rgba(85, 230, 255, 0.55)";
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
}

function drawWalls() {
  for (const wall of walls) {
    ctx.fillStyle = "#030711";
    ctx.fillRect(wall.x + 4, wall.y + 4, wall.w, wall.h);

    const wallGradient = ctx.createLinearGradient(wall.x, wall.y, wall.x + wall.w, wall.y);
    wallGradient.addColorStop(0, "#17243a");
    wallGradient.addColorStop(0.5, "#42536b");
    wallGradient.addColorStop(1, "#101b30");
    ctx.fillStyle = wallGradient;
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

    ctx.strokeStyle = "#55e6ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);

    ctx.fillStyle = "rgba(120, 190, 220, 0.18)";
    ctx.fillRect(wall.x + 4, wall.y + 4, Math.max(1, wall.w - 8), Math.max(1, wall.h - 8));

    ctx.fillStyle = "#55e6ff";
    ctx.fillRect(wall.x + 5, wall.y + 12, 3, 8);
    if (wall.h > 100) ctx.fillRect(wall.x + 5, wall.y + wall.h / 2 - 4, 3, 8);

    ctx.fillStyle = "#ffc857";
    for (let y = wall.y + 28; y < wall.y + wall.h - 12; y += 48) {
      ctx.fillRect(wall.x + 5, y, 8, 3);
    }
  }
}

function drawStationDetails(time) {
  const lights = [
    { x: 65, y: 65, r: 48 }, { x: 350, y: 65, r: 55 }, { x: 650, y: 65, r: 48 },
    { x: 70, y: 425, r: 42 }, { x: 360, y: 425, r: 50 }, { x: 650, y: 425, r: 42 }
  ];

  for (const light of lights) {
    const glow = ctx.createRadialGradient(light.x, light.y, 2, light.x, light.y, light.r);
    glow.addColorStop(0, "rgba(35, 155, 220, 0.15)");
    glow.addColorStop(1, "rgba(15, 65, 120, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(light.x - light.r, light.y - light.r, light.r * 2, light.r * 2);
  }

  const pulse = 0.55 + Math.sin(time / 260) * 0.25;
  ctx.fillStyle = `rgba(255, 65, 55, ${pulse})`;
  for (const light of [{ x: 35, y: 35 }, { x: WIDTH - 35, y: 35 }, { x: 35, y: HEIGHT - 35 }, { x: WIDTH - 35, y: HEIGHT - 35 }]) {
    ctx.fillRect(light.x, light.y, 7, 4);
  }
}

function drawResearchEquipment(time) {
  const consoles = [
    { x: 28, y: 35, w: 82, h: 42 }, { x: 315, y: 32, w: 92, h: 44 },
    { x: 690, y: 35, w: 78, h: 42 }, { x: 28, y: 390, w: 90, h: 48 },
    { x: 680, y: 390, w: 88, h: 48 }
  ];

  for (let i = 0; i < consoles.length; i++) {
    const c = consoles[i];
    ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    ctx.fillRect(c.x + 5, c.y + 6, c.w, c.h);
    ctx.fillStyle = "#101722";
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = "#354253";
    ctx.fillRect(c.x + 3, c.y + 3, c.w - 6, c.h - 6);
    ctx.fillStyle = "#030a12";
    ctx.fillRect(c.x + 7, c.y + 6, c.w - 14, c.h - 15);
    ctx.strokeStyle = "#5b8298";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(c.x + 7, c.y + 6, c.w - 14, c.h - 15);
    ctx.fillStyle = "#40dfff";
    ctx.fillRect(c.x + 12, c.y + 11, c.w * 0.38, 3);
    ctx.fillRect(c.x + 12, c.y + 18, c.w * 0.55, 2);
    ctx.fillRect(c.x + 12, c.y + 24, c.w * 0.25, 2);
    const blink = Math.sin(time / 180 + i) > 0 ? 1 : 0.25;
    ctx.fillStyle = `rgba(255, 75, 65, ${blink})`;
    ctx.fillRect(c.x + c.w - 13, c.y + c.h - 8, 5, 3);
    ctx.fillStyle = "#9aafbd";
    ctx.fillRect(c.x + 3, c.y + 3, 2, 2);
    ctx.fillRect(c.x + c.w - 5, c.y + 3, 2, 2);
  }
}

function drawArtifacts() {
  for (const artifact of artifacts) {
    if (artifact.found) continue;

    ctx.save();
    ctx.translate(artifact.x, artifact.y);
    ctx.rotate(Math.PI / 4);
    ctx.shadowBlur = 16;
    ctx.shadowColor = "#a879ff";
    ctx.fillStyle = "#a879ff";
    ctx.fillRect(-8, -8, 16, 16);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(-4, -4, 8, 8);
    ctx.restore();
  }
}

function drawMaterials(time) {
  for (const mat of materials) {
    if (mat.collected) continue;

    const info = MATERIAL_NAMES[mat.type];
    const pulse = 1 + Math.sin(time / 200) * 0.15;

    ctx.save();
    ctx.translate(mat.x, mat.y);

    // Glow
    ctx.shadowBlur = 20;
    ctx.shadowColor = info.color;

    // Outer ring
    ctx.beginPath();
    ctx.arc(0, 0, 12 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = info.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner fill
    ctx.beginPath();
    ctx.arc(0, 0, 7 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = info.color + "60";
    ctx.fill();

    // Icon
    ctx.shadowBlur = 0;
    ctx.fillStyle = info.color;
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(info.icon, 0, 0);

    ctx.restore();
  }
}

function drawHazards(time) {
  for (const hazard of hazards) {
    const frozen = player.freezeActive;
    const pulse = 1 + Math.sin(time / 150) * 0.12;

    ctx.save();
    ctx.translate(hazard.x, hazard.y);

    // Glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = frozen ? "#7df5bc" : "#ff7188";

    // Outer pulse ring
    ctx.beginPath();
    ctx.arc(0, 0, hazard.radius * pulse + 4, 0, Math.PI * 2);
    ctx.strokeStyle = frozen ? "rgba(125, 245, 188, 0.5)" : "rgba(255, 113, 136, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Body
    ctx.beginPath();
    ctx.arc(0, 0, hazard.radius * pulse, 0, Math.PI * 2);
    ctx.fillStyle = frozen ? "rgba(125, 245, 188, 0.3)" : "rgba(255, 113, 136, 0.3)";
    ctx.fill();

    ctx.strokeStyle = frozen ? "#7df5bc" : "#ff7188";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Inner core
    ctx.beginPath();
    ctx.arc(0, 0, hazard.radius * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = frozen ? "#7df5bc" : "#ff7188";
    ctx.fill();

    // Hazard spikes
    const spikes = 6;
    ctx.strokeStyle = frozen ? "#7df5bc" : "#ff7188";
    ctx.lineWidth = 2;
    for (let i = 0; i < spikes; i++) {
      const angle = (Math.PI * 2 / spikes) * i + time / 500;
      const r1 = hazard.radius * pulse;
      const r2 = hazard.radius * pulse + 5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * r1, Math.sin(angle) * r1);
      ctx.lineTo(Math.cos(angle) * r2, Math.sin(angle) * r2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

function drawPortal(time) {
  ctx.save();
  ctx.translate(portal.x, portal.y);

  const pulse = 1 + Math.sin(time / 220) * 0.06;

  ctx.beginPath();
  ctx.arc(0, 0, portal.radius * pulse, 0, Math.PI * 2);
  ctx.fillStyle = portalActive ? "rgba(85, 230, 255, 0.15)" : "rgba(255, 100, 120, 0.08)";
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, 0, 16 * pulse, 26 * pulse, 0, 0, Math.PI * 2);
  ctx.strokeStyle = portalActive ? "#55e6ff" : "#ff7373";
  ctx.lineWidth = 4;
  ctx.shadowBlur = 20;
  ctx.shadowColor = portalActive ? "#55e6ff" : "#ff7373";
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(0, 0, 8 * pulse, 18 * pulse, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();

  ctx.font = "11px monospace";
  ctx.textAlign = "center";
  ctx.fillStyle = portalActive ? "#55e6ff" : "#ff8b96";
  ctx.fillText(portalActive ? "EXIT OPEN" : "LOCKED", portal.x, portal.y + 48);
}

function drawTeleportEffect(fromX, fromY, toX, toY) {
  // Brief flash at both locations
  ctx.save();

  ctx.globalAlpha = 0.6;
  ctx.fillStyle = "#55e6ff";
  ctx.shadowBlur = 30;
  ctx.shadowColor = "#55e6ff";

  ctx.beginPath();
  ctx.arc(fromX, fromY, 25, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(toX, toY, 25, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPlayer() {
  const char = CHARACTERS[saveData.selectedCharacter] || CHARACTERS.explorer;
  const c = char.colors;

  ctx.save();

  // Invisibility = semi-transparent
  if (player.invisible) {
    ctx.globalAlpha = 0.3;
  }

  const moving = player.isMoving === true;
  const walk = moving ? Math.floor(performance.now() / 110) % 4 : 0;
  const legSwing = moving ? [0, 2, 0, -2][walk] : 0;
  const armSwing = -legSwing;

  ctx.translate(Math.round(player.x), Math.round(player.y));

  // Shadow
  ctx.fillStyle = "#030812";
  ctx.fillRect(-10, 10, 20, 5);

  // Legs
  ctx.fillStyle = c.pants;
  ctx.fillRect(-8 + legSwing, 2, 6, 8);
  ctx.fillRect(2 - legSwing, 2, 6, 8);

  // Boots
  ctx.fillStyle = "#090F1A";
  ctx.fillRect(-9 + legSwing, 8, 7, 6);
  ctx.fillRect(2 - legSwing, 8, 7, 6);

  ctx.fillStyle = "#52657A";
  ctx.fillRect(-9 + legSwing, 12, 7, 2);
  ctx.fillRect(2 - legSwing, 12, 7, 2);

  // Backpack
  ctx.fillStyle = "#101D30";
  ctx.fillRect(-11, -7, 5, 12);
  ctx.fillStyle = "#16BFFF";
  ctx.fillRect(-10, -3, 2, 3);

  // Jacket
  ctx.fillStyle = c.jacket;
  ctx.fillRect(-7, -9, 14, 13);

  ctx.fillStyle = c.trim;
  ctx.fillRect(-8, -8, 4, 4);
  ctx.fillRect(4, -8, 4, 4);

  ctx.fillStyle = "#7CA4BC";
  ctx.fillRect(-2, -8, 4, 10);

  // Belt
  ctx.fillStyle = "#0A1727";
  ctx.fillRect(-7, 1, 14, 3);
  ctx.fillStyle = "#FFB45F";
  ctx.fillRect(-1, 1, 2, 2);

  // Arms
  ctx.fillStyle = c.jacket;
  ctx.fillRect(-10 + armSwing, -6, 3, 9);
  ctx.fillRect(7 - armSwing, -6, 3, 9);

  // Gloves
  ctx.fillStyle = "#A6BDCA";
  ctx.fillRect(-10 + armSwing, 2, 3, 3);
  ctx.fillRect(7 - armSwing, 2, 3, 3);

  // Wrist device
  ctx.fillStyle = "#087DAA";
  ctx.fillRect(7 - armSwing, -1, 4, 4);
  ctx.fillStyle = "#24D8FF";
  ctx.fillRect(8 - armSwing, 0, 2, 2);

  // Neck and face
  ctx.fillStyle = "#D8A982";
  ctx.fillRect(-3, -12, 6, 4);
  ctx.fillStyle = c.skin;
  ctx.fillRect(-6, -20, 12, 10);

  // Ears
  ctx.fillStyle = "#D8A982";
  ctx.fillRect(-7, -17, 2, 4);
  ctx.fillRect(5, -17, 2, 4);

  // Hair
  ctx.fillStyle = c.hair;
  ctx.fillRect(-7, -24, 14, 5);
  ctx.fillRect(-6, -26, 4, 3);
  ctx.fillRect(-1, -27, 5, 4);
  ctx.fillRect(4, -25, 4, 4);
  ctx.fillRect(-8, -22, 3, 5);
  ctx.fillRect(5, -21, 3, 4);

  ctx.fillStyle = "#58414A";
  ctx.fillRect(-4, -25, 3, 2);
  ctx.fillRect(1, -25, 3, 2);

  // Eyes
  ctx.fillStyle = "#25364B";
  ctx.fillRect(-4, -18, 2, 2);
  ctx.fillRect(2, -18, 2, 2);

  // Speed boost aura
  if (player.speedBuff) {
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = "#ffc857";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  // Ability status indicators above player
  drawAbilityIndicators();
}

function drawAbilityIndicators() {
  const indicators = [];
  if (player.freezeActive) indicators.push({ icon: "❄", color: "#7df5bc", time: abilityTimers.freezeTime });
  if (player.speedBuff) indicators.push({ icon: "⚡", color: "#ffc857", time: abilityTimers.speedBoost });
  if (player.invisible) indicators.push({ icon: "◐", color: "#a879ff", time: abilityTimers.invisibility });

  indicators.forEach((ind, i) => {
    ctx.save();
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = ind.color;
    ctx.shadowBlur = 8;
    ctx.shadowColor = ind.color;
    ctx.fillText(`${ind.icon} ${ind.time.toFixed(1)}s`, player.x + (i - indicators.length / 2 + 0.5) * 30, player.y - 35);
    ctx.restore();
  });
}

function drawGame(time) {
  drawBackground();
  drawStationDetails(time);
  drawWalls();
  drawResearchEquipment(time);
  drawMaterials(time);
  drawHazards(time);
  drawArtifacts();
  drawPortal(time);
  drawPlayer();
}

// ============================================================
//  GAME LOOP
// ============================================================

function gameLoop(time) {
  if (!running || finished) return;

  const delta = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, 0.04);
  lastTime = time;

  updateGame(delta);
  drawGame(time);

  if (running && !finished) {
    requestAnimationFrame(gameLoop);
  }
}

// ============================================================
//  END / TRANSITION
// ============================================================

function endGame(won) {
  running = false;
  finished = true;

  if (won) {
    // Mark level complete
    if (!saveData.completedLevels.includes(currentLevelData.id)) {
      saveData.completedLevels.push(currentLevelData.id);
    }

    restartButton.textContent = "CONTINUE";

    // Grant ability reward
    if (currentLevelData.abilityReward && !saveData.unlockedAbilities.includes(currentLevelData.abilityReward)) {
      saveData.unlockedAbilities.push(currentLevelData.abilityReward);
      const ab = ABILITIES[currentLevelData.abilityReward];

      // Queue the post-level story, then the unlock notification
      postLevelStoryQueue = [...currentLevelData.storyAfter];

      // After story, show unlock
      endTitle.textContent = "SECTOR CLEARED!";
      endMessage.textContent = `${currentLevelData.name} complete.`;
      objective.textContent = "OBJECTIVE: COMPLETE";
      systemStatus.textContent = "SECTOR CLEARED";
      fieldLog.textContent = `New ability unlocked: ${ab.name}!`;

      endScreen.classList.remove("hidden");
      return;
    }

    // No ability reward — just story or proceed
    if (currentLevelData.storyAfter && currentLevelData.storyAfter.length > 0) {
      postLevelStoryQueue = [...currentLevelData.storyAfter];
      endTitle.textContent = "SECTOR CLEARED!";
      endMessage.textContent = `${currentLevelData.name} complete.`;
      objective.textContent = "OBJECTIVE: COMPLETE";
      systemStatus.textContent = "SECTOR CLEARED";
      endScreen.classList.remove("hidden");
      return;
    }

    // No story — proceed directly
    endTitle.textContent = "SECTOR CLEARED!";
    endMessage.textContent = `${currentLevelData.name} complete.`;
    objective.textContent = "OBJECTIVE: COMPLETE";
    systemStatus.textContent = "SECTOR CLEARED";
    endScreen.classList.remove("hidden");

  } else {
    restartButton.textContent = "RETRY SECTOR";
    systemStatus.textContent = "ENERGY DEPLETED";
    endTitle.textContent = "SIGNAL LOST";
    endMessage.textContent = "Your energy ran out. Restart the sector and try another route.";
    fieldLog.textContent = "Critical energy failure. Restart the sector.";
    objective.textContent = "OBJECTIVE: TRY AGAIN";
    endScreen.classList.remove("hidden");
  }

  // Check side missions
  checkSideMissions();
  checkPortalEventUnlocks();
  persistSave();
  updateAbilityHUD();
  updateSideMissionHUD();
}

function proceedAfterLevel() {
  // If there's post-level story, show it
  if (postLevelStoryQueue.length > 0) {
    showPostLevelStory();
    return;
  }

  // If an ability was just unlocked, show the unlock screen
  if (currentLevelData.abilityReward && saveData.unlockedAbilities.includes(currentLevelData.abilityReward)) {
    const ab = ABILITIES[currentLevelData.abilityReward];
    showUnlock("NEW ABILITY UNLOCKED", `${ab.name} — ${ab.description}`);
    // Clear the reward flag by proceeding after
    return;
  }

  // Go to next level
  const nextIndex = currentLevelData.id + 1;
  if (nextIndex < LEVELS.length) {
    loadLevel(nextIndex);
  } else {
    // Story complete
    checkPortalEventUnlocks();
    showUnlock("STORY COMPLETE", "You have cleared all sectors. Portal crossover events may now be available. Replay levels to complete side missions and unlock more content.");
  }
}

function showPostLevelStory() {
  if (postLevelStoryQueue.length === 0) {
    inPostLevelStory = false;
    proceedAfterLevel();
    return;
  }

  inPostLevelStory = true;
  const scene = postLevelStoryQueue.shift();
  storySpeaker.textContent = scene.speaker;
  storyHeading.textContent = scene.heading;
  storyText.textContent = scene.text;
  storyNextButton.textContent = postLevelStoryQueue.length === 0 ? "CONTINUE" : "NEXT";
  storyScreen.classList.remove("hidden");
}

// Story next button handler — handles both opening story and post-level story
document.getElementById("story-next-button").addEventListener("click", handleStoryNext);

function handleStoryNext() {
  // If post-level story queue still has items, show the next one
  if (postLevelStoryQueue.length > 0) {
    showPostLevelStory();
    return;
  }

  // If we were in post-level story mode, proceed to next level / unlock
  if (inPostLevelStory) {
    inPostLevelStory = false;
    storyScreen.classList.add("hidden");
    proceedAfterLevel();
    return;
  }

  // Opening story mode
  storyIndex++;
  if (storyIndex >= openingStory.length) {
    storyScreen.classList.add("hidden");
    loadLevel(0);
    return;
  }
  showStoryScene();
}

// ============================================================
//  INPUT
// ============================================================

window.addEventListener("keydown", event => {
  const key = event.key.toLowerCase();
  if (key.startsWith("arrow") || key === " " || key === "shift") {
    event.preventDefault();
  }
  keys[key] = true;

  // Restart
  if (key === "r" && running) {
    loadLevel(currentLevelData.id);
    levelIntroScreen.classList.add("hidden");
    endScreen.classList.add("hidden");
    running = true;
    finished = false;
    lastTime = 0;
    requestAnimationFrame(gameLoop);
  }

  // Teleport
  if (key === "shift" && running) {
    doTeleport();
  }

  // Abilities
  if (key === "q" && running) {
    activateAbility("freezeTime");
  }
  if (key === "e" && running) {
    activateAbility("speedBoost");
  }
  if (key === "f" && running) {
    activateAbility("invisibility");
  }

  // Space — activate portal or advance
  if (key === " " && running && artifactsFound < artifacts.length) {
    fieldLog.textContent = "The portal is locked. Recover all artifacts first.";
  }
});

window.addEventListener("keyup", event => {
  keys[event.key.toLowerCase()] = false;
});

window.addEventListener("blur", () => {
  for (const key in keys) {
    keys[key] = false;
  }
});

// ============================================================
//  STORY FLOW
// ============================================================

function showStoryScene() {
  const scene = openingStory[storyIndex];
  storySpeaker.textContent = scene.speaker;
  storyHeading.textContent = scene.heading;
  storyText.textContent = scene.text;
  storyNextButton.textContent = storyIndex === openingStory.length - 1 ? "BEGIN MISSION" : "CONTINUE";
}

// ============================================================
//  BUTTONS
// ============================================================

startButton.addEventListener("click", () => {
  storyIndex = 0;
  startScreen.classList.add("hidden");
  storyScreen.classList.remove("hidden");
  showStoryScene();
});

// (Story next button handler is registered above as handleStoryNext)

restartButton.addEventListener("click", () => {
  endScreen.classList.add("hidden");

  if (finished) {
    // Level was won — proceed to next or replay
    proceedAfterLevel();
  } else {
    // Restart current level
    loadLevel(currentLevelData.id);
    levelIntroScreen.classList.add("hidden");
    running = true;
    finished = false;
    lastTime = 0;
    requestAnimationFrame(gameLoop);
  }
});

// ============================================================
//  INIT
// ============================================================

loadSave();
updateJournal();
updateAbilityHUD();
updateSideMissionHUD();
buildCharacterSelect();
drawGame();
