// Procedural canvas textures — no image assets needed.
import * as THREE from "three";

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return [c, c.getContext("2d")];
}

function tex(c, { srgb = true, repeat = [1, 1] } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 4;
  return t;
}

// Seeded RNG so the city looks the same every run.
export function rng(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function groundTextures(cols, rows) {
  const px = 64; // pixels per tile
  const [c, g] = canvas(cols * px / 2, rows * px / 2);
  const [r, rg] = canvas(c.width, c.height);
  const rand = rng(7);
  const s = px / 2;

  g.fillStyle = "#14161f";
  g.fillRect(0, 0, c.width, c.height);
  rg.fillStyle = "#b0b0b0";
  rg.fillRect(0, 0, c.width, c.height);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const v = 50 + Math.floor(rand() * 14);
      g.fillStyle = `rgb(${v},${v + 2},${v + 9})`;
      g.fillRect(x * s + 1, y * s + 1, s - 2, s - 2);
      // panel seams
      g.fillStyle = "rgba(0,0,0,0.5)";
      g.fillRect(x * s, y * s, s, 1);
      g.fillRect(x * s, y * s, 1, s);
      // grime speckle
      for (let i = 0; i < 6; i++) {
        g.fillStyle = `rgba(0,0,0,${rand() * 0.35})`;
        g.fillRect(x * s + rand() * s, y * s + rand() * s, 2, 2);
      }
      // occasional hazard stripe / marking
      if (rand() < 0.04) {
        g.fillStyle = "rgba(255,190,60,0.35)";
        for (let k = 0; k < 4; k++) g.fillRect(x * s + 3 + k * 7, y * s + 3, 3, s - 6);
      }
    }
  }
  // puddles: dark in color map, glossy in roughness map
  for (let i = 0; i < cols * rows * 0.06; i++) {
    const px2 = rand() * c.width, py2 = rand() * c.height, rad = 6 + rand() * 18;
    const grad = g.createRadialGradient(px2, py2, 0, px2, py2, rad);
    grad.addColorStop(0, "rgba(5,7,14,0.7)");
    grad.addColorStop(1, "rgba(5,7,14,0)");
    g.fillStyle = grad;
    g.beginPath(); g.ellipse(px2, py2, rad * 1.6, rad, 0, 0, Math.PI * 2); g.fill();
    const rgrad = rg.createRadialGradient(px2, py2, 0, px2, py2, rad);
    rgrad.addColorStop(0, "rgba(80,80,80,1)");
    rgrad.addColorStop(1, "rgba(80,80,80,0)");
    rg.fillStyle = rgrad;
    rg.beginPath(); rg.ellipse(px2, py2, rad * 1.6, rad, 0, 0, Math.PI * 2); rg.fill();
  }
  return { map: tex(c), roughness: tex(r, { srgb: false }) };
}

export function facadeTextures(floors, seed) {
  const [c, g] = canvas(128, 64 * floors);
  const [e, eg] = canvas(c.width, c.height);
  const rand = rng(seed);
  g.fillStyle = "#262d3f";
  g.fillRect(0, 0, c.width, c.height);
  eg.fillStyle = "#000";
  eg.fillRect(0, 0, e.width, e.height);
  const colors = ["#7fe9ff", "#ffcf7a", "#ff7ad1", "#c8d4ff"];
  for (let f = 0; f < floors; f++) {
    const y = f * 64;
    g.fillStyle = "#0e111a";
    g.fillRect(0, y + 54, c.width, 6); // floor ledge
    for (let w = 0; w < 4; w++) {
      const x = 8 + w * 30;
      g.fillStyle = "#090b12";
      g.fillRect(x, y + 14, 22, 30);
      if (rand() < 0.38) {
        const col = colors[Math.floor(rand() * colors.length)];
        eg.fillStyle = col;
        eg.globalAlpha = 0.35 + rand() * 0.65;
        eg.fillRect(x + 2, y + 16, 18, 26);
        // blinds
        eg.fillStyle = "#000";
        eg.globalAlpha = 0.5;
        for (let b = 0; b < 5; b++) eg.fillRect(x + 2, y + 18 + b * 5, 18, 1);
        eg.globalAlpha = 1;
      }
    }
  }
  // vertical pipe
  g.fillStyle = "#232a3a";
  g.fillRect(c.width - 10, 0, 5, c.height);
  return { map: tex(c), emissive: tex(e) };
}

export function roofTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = "#222838";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#343d55";
  g.lineWidth = 2;
  g.strokeRect(3, 3, 58, 58);
  g.fillStyle = "#151a26";
  g.fillRect(14, 14, 16, 12);
  g.fillRect(36, 34, 14, 14);
  return tex(c);
}

const SIGN_WORDS = ["NOODLE", "SYNTH", "24H", "CLINIC", "DATA", "BAR", "VOID", "RAMEN", "MODS", "HOTEL", "CHROME", "PHASE", "LOANS", "ARCADE", "OPEN"];
const SIGN_COLORS = ["#30e0ff", "#ff3fb4", "#ffb347", "#8cff6a", "#b37bff"];

export function signTexture(i) {
  const word = SIGN_WORDS[i % SIGN_WORDS.length];
  const color = SIGN_COLORS[i % SIGN_COLORS.length];
  const [c, g] = canvas(256, 96);
  g.fillStyle = "#000";
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.strokeRect(8, 8, 240, 80);
  g.fillStyle = color;
  g.font = "bold 50px 'Rajdhani', 'Arial Narrow', sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(word, 128, 52);
  return { tex: tex(c), color: new THREE.Color(color) };
}

export function barrierTexture() {
  const [c, g] = canvas(64, 128);
  g.fillStyle = "#000";
  g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 8) {
    g.fillStyle = `rgba(255,255,255,${y % 32 === 0 ? 0.9 : 0.28})`;
    g.fillRect(0, y, 64, 2);
  }
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.fillRect(0, 0, 3, 128);
  g.fillRect(61, 0, 3, 128);
  return tex(c, { srgb: false });
}

export function bridgeTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = "#000";
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = "#fff";
  g.lineWidth = 2;
  g.strokeRect(2, 2, 60, 60);
  g.globalAlpha = 0.4;
  g.beginPath();
  g.moveTo(32, 2); g.lineTo(32, 62); g.moveTo(2, 32); g.lineTo(62, 32);
  g.stroke();
  return tex(c, { srgb: false });
}

export function glowSprite() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.6)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return tex(c, { srgb: false });
}
