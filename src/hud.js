// ============================================================
//  HUD — DOM overlay drawn on top of the WebGL canvas.
// ============================================================
import { CREW } from "./crew.js";
import * as THREE from "three";
import { CITY, BREACH, PALETTE } from "./config.js";

const $ = id => document.getElementById(id);
const _v = new THREE.Vector3();

export class Hud {
  constructor() {
    this.root = $("hud");
    this.hpFill = $("hp-fill");
    this.hpText = $("hp-text");
    this.energyFill = $("energy-fill");
    this.objective = $("objective-text");
    this.district = $("district-name");
    this.phaseEl = $("phase-indicator");
    this.phaseCd = $("phase-cd-fill");
    this.dashCd = $("dash-cd");
    this.toastEl = $("toast");
    this.labels = $("labels");
    this.crosshair = $("crosshair");
    this.flash = $("fx-flash");
    this.minimap = $("minimap");
    this.mctx = this.minimap.getContext("2d");
    this.numbers = [];
    this.toastT = 0;
    this.termLabels = new Map();
  }

  show(on) {
    this.root.classList.toggle("hidden", !on);
    this.crosshair.classList.toggle("hidden", !on);
    if (!on) {
      document.getElementById("waypoint").classList.add("hidden");
      document.getElementById("lock").classList.add("hidden");
    }
  }

  setDistrict(name) { this.district.textContent = name; }

  // Crew roster under the bars + callsign + which ability SHIFT fires.
  setCrew(list, active) {
    const c = CREW[active];
    this.root.dataset.char = active;
    const cs = this.root.querySelector(".callsign");
    cs.innerHTML = `${c.short} <span>// ${c.tag}</span>`;
    const el = $("crew-strip");
    el.classList.toggle("hidden", list.length < 2);
    el.innerHTML = list.map((id, i) => `<span class="cm${id === active ? " on" : ""}" style="--cc:${CREW[id].css || "var(--accent)"}"><kbd>${i + 1}</kbd>${CREW[id].short.split(" ").pop()}</span>`).join("")
      + `<span class="cm-tab"><kbd>TAB</kbd></span>`;
  }

  // Tutorial hint above the phase indicator; null hides it.
  hint(html) {
    const el = this.hintEl || (this.hintEl = document.getElementById("hint"));
    if (!html) { el.classList.remove("show"); return; }
    el.innerHTML = html;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  }
  setObjective(text) { this.objective.textContent = text; }

  toast(text, color = "#55e6ff") {
    this.toastEl.textContent = text;
    this.toastEl.style.color = color;
    this.toastEl.style.borderColor = color;
    this.toastEl.classList.remove("show");
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add("show");
    this.toastT = 2.4;
  }

  screenFlash(color, strength = 0.5) {
    this.flash.style.transition = "none";
    this.flash.style.background = color;
    this.flash.style.opacity = strength;
    void this.flash.offsetWidth;
    this.flash.style.transition = "opacity 0.45s ease-out";
    this.flash.style.opacity = 0;
  }

  project(x, y, z, camera) {
    _v.set(x, y, z).project(camera);
    return { x: (_v.x + 1) / 2 * innerWidth, y: (1 - _v.y) / 2 * innerHeight, behind: _v.z > 1 };
  }

  damageNumber(x, y, z, text, color, camera, big = false) {
    const el = document.createElement("div");
    el.className = "dmg" + (big ? " big" : "");
    el.textContent = text;
    el.style.color = color;
    this.labels.appendChild(el);
    this.numbers.push({ el, x: x + (Math.random() - 0.5) * 0.5, y, z, t: 0, vx: (Math.random() - 0.5) * 1.2 });
  }

  terminalLabel(term, camera, visible, html, progress) {
    let el = this.termLabels.get(term);
    if (!el) {
      el = document.createElement("div");
      el.className = "term-label";
      el.innerHTML = `<div class="tl-text"></div><div class="tl-bar"><i></i></div>`;
      this.labels.appendChild(el);
      this.termLabels.set(term, el);
    }
    el.style.display = visible ? "block" : "none";
    if (!visible) return;
    const p = this.project(term.x, 2.9, term.z, camera);
    el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    const txt = el.firstChild;
    if (txt.innerHTML !== html) txt.innerHTML = html;
    el.querySelector("i").style.width = `${Math.round(progress * 100)}%`;
    el.querySelector(".tl-bar").style.display = progress > 0 && progress < 1 ? "block" : "none";
  }

  clearLabels() {
    this.labels.innerHTML = "";
    this.termLabels.clear();
    this.numbers = [];
  }

  update(dt, game) {
    const { player, phase, blend, camera } = game;
    const hpPct = Math.max(0, player.hp) / 100;
    this.hpFill.style.width = `${hpPct * 100}%`;
    this.hpFill.classList.toggle("low", hpPct < 0.3);
    this.hpText.textContent = Math.max(0, Math.ceil(player.hp));
    this.energyFill.style.width = `${player.energy}%`;
    this.energyFill.classList.toggle("low", player.energy < 25);
    this.phaseEl.dataset.phase = phase === CITY ? "city" : "breach";
    this.phaseCd.style.width = `${(game.abilityFrac ?? 1 - game.shiftCd / game.shiftCdMax) * 100}%`;
    this.dashCd.style.height = `${(player.dashCd / 0.75) * 100}%`;
    this.root.dataset.phase = phase === CITY ? "city" : "breach";
    this.crosshair.dataset.phase = this.root.dataset.phase;

    // crosshair
    const m = game.input.mouse;
    this.crosshair.style.transform = `translate(${m.x}px, ${m.y}px) scale(${1 + game.recoil * 0.6})`;

    // floating numbers
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t += dt;
      if (n.t > 0.8) { n.el.remove(); this.numbers.splice(i, 1); continue; }
      const p = this.project(n.x + n.vx * n.t, n.y + n.t * 1.6, n.z, camera);
      n.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.15 - n.t) * 4})`;
      n.el.style.opacity = 1 - Math.max(0, n.t - 0.45) / 0.35;
    }

    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove("show"); }

    this.updateWaypoint(game);
    this.updateLock(game);
    this.drawMinimap(game);
  }

  // Auto-aim ring: faint over the current candidate, tight and bright while firing.
  updateLock(game) {
    const el = this.lockEl || (this.lockEl = document.getElementById("lock"));
    const hp = game.hackPreview;
    if (hp && !game.input.mouse.left && game.player.alive) {
      // Rook: show what SHIFT would hack
      el.classList.remove("hidden", "firing");
      el.style.setProperty("--lk", "#9dff6a");
      const p = this.project(hp.x, 1.2, hp.z, game.camera);
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      return;
    }
    const t = game.aimTarget;
    if (!t || !t.alive || !game.player.alive) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    el.classList.toggle("firing", !!game.input.mouse.left);
    el.style.setProperty("--lk", PALETTE[game.phase].css);
    const y = t.type === "drone" ? 1.7 : t.type === "turret" ? 1.2 : 1.2;
    const p = this.project(t.pos.x, y, t.pos.z, game.camera);
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  }

  // Points at the nearest unfinished objective (or the exit once it opens).
  // On screen: a marker above the target. Off screen: pinned to the edge, arrow pointing at it.
  updateWaypoint(game) {
    const wp = this.wp || (this.wp = {
      el: document.getElementById("waypoint"),
      arrow: document.querySelector("#waypoint .wp-arrow"),
      label: document.querySelector("#waypoint .wp-label"),
    });
    const { player, world, camera } = game;
    let target = null, kind = "", color = "#55e6ff";
    const crewTarget = this.crewWaypoint(game);
    if (world.exit?.open) { target = world.exit; kind = "EXIT PORTAL"; color = "#9ff3ff"; }
    else if (crewTarget) { target = crewTarget; kind = crewTarget.kind; color = "#ffc04a"; }
    else {
      let best = Infinity;
      for (const t of world.terminals) {
        if (t.hacked || (t.tier || 0) > world.locksDone) continue;   // skip locks still behind a gate
        if (t.sealed && !game.crew.includes("rook")) continue;        // glass vault: needs a remote hack
        const d = Math.hypot(t.x - player.pos.x, t.z - player.pos.z);
        if (d < best) { best = d; target = t; }
      }
      if (target) {
        kind = target.phase === CITY ? "TERMINAL // CITY" : "RIFT NODE // BREACH";
        color = PALETTE[target.phase].css;
      }
    }
    if (!target || !player.alive) { wp.el.classList.add("hidden"); return; }
    wp.el.classList.remove("hidden");
    const dist = Math.round(Math.hypot(target.x - player.pos.x, target.z - player.pos.z));
    const text = `${kind}  ${dist}m`;
    if (wp.label.textContent !== text) wp.label.textContent = text;
    wp.el.style.setProperty("--wp", color);

    const p = this.project(target.x, 3.4, target.z, camera);
    // keep clear of the tutorial hint at the bottom while it's showing
    const hintOn = this.hintEl?.classList.contains("show");
    const mx = 70, myTop = 120, myBot = hintOn ? 200 : 110;
    const onScreen = p.x > mx && p.x < innerWidth - mx && p.y > myTop && p.y < innerHeight - myBot;
    if (onScreen) {
      wp.el.classList.remove("edge");
      wp.arrow.style.transform = "none";
      wp.el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -100%)`;
    } else {
      // pin to the screen edge along the line from screen centre to the target
      const cx = innerWidth / 2, cy = innerHeight / 2;
      const dx = p.x - cx, dy = p.y - cy;
      const sx = (innerWidth / 2 - mx) / Math.abs(dx || 1e-6);
      const sy = ((dy < 0 ? innerHeight / 2 - myTop : innerHeight / 2 - myBot)) / Math.abs(dy || 1e-6);
      const s = Math.min(sx, sy);
      // keep the whole label on screen, not just its centre
      const half = (wp.label.offsetWidth || 160) / 2 + 10;
      const ex = Math.min(innerWidth - half, Math.max(half, cx + dx * s));
      const ey = cy + dy * s;
      const ang = Math.atan2(dy, dx) * 180 / Math.PI - 90; // arrow art points down (+90°)
      wp.el.classList.add("edge");
      wp.arrow.style.transform = `rotate(${ang}deg)`;
      wp.el.style.transform = `translate(${ex}px, ${ey}px) translate(-50%, -50%)`;
    }
  }

  // District 05: the ID card, then the pod it opens.
  crewWaypoint(game) {
    const { world } = game, cd = world.card;
    if (!cd) return null;
    const c = CREW[cd.crew];
    if (!c || game.crew.includes(c.id)) return null;
    if (game.carrying === c.id) {
      const p = world.pods.find(p => p.label === c.pod);
      return p && { x: p.x, z: p.z, kind: `POD ${c.pod}` };
    }
    if (!cd.taken && (cd.tier || 0) <= world.locksDone) return { x: cd.x, z: cd.z, kind: "CREW ID CARD" };
    return null;
  }

  buildMinimap(world) {
    const s = 4;
    this.mmScale = s;
    this.minimap.width = world.cols * s;
    this.minimap.height = world.rows * s;
    this.mmLayers = [CITY, BREACH].map(phase => {
      const c = document.createElement("canvas");
      c.width = this.minimap.width; c.height = this.minimap.height;
      const g = c.getContext("2d");
      for (let r = 0; r < world.rows; r++) {
        for (let col = 0; col < world.cols; col++) {
          const ch = world.grid[r][col];
          let fill = phase === CITY ? "#141a2a" : "#22101a";
          if (ch === "#") fill = phase === CITY ? "#2b3550" : "#3a1a28";
          else if (ch === "c") fill = "#3b4256";
          else if (ch === "~") fill = "#000";
          else if (ch === "b") fill = phase === BREACH ? "#ff3355" : "#000";
          else if (ch === "v") fill = phase === CITY ? "#2a8fa8" : "#000";
          else if (ch === "A") fill = phase === CITY ? "#55e6ff" : "#1e3640";
          else if (ch === "B") fill = phase === BREACH ? "#ff3355" : "#3a1a22";
          else if (ch === "h") fill = phase === CITY ? "#1f5566" : "#2a1a30";
          else if (ch === "g") fill = "#4f9fcf";
          else if (ch === "o" || ch === "O") fill = "#46506a";
          g.fillStyle = fill;
          g.fillRect(col * s, r * s, s, s);
        }
      }
      return c;
    });
  }

  drawMinimap(game) {
    const g = this.mctx, s = this.mmScale / 2; // world units -> px  (TILE=2)
    g.clearRect(0, 0, this.minimap.width, this.minimap.height);
    g.globalAlpha = 1;
    g.drawImage(this.mmLayers[CITY], 0, 0);
    g.globalAlpha = game.blend;
    g.drawImage(this.mmLayers[BREACH], 0, 0);
    g.globalAlpha = 1;

    for (const t of game.world.terminals) {
      g.fillStyle = t.hacked ? "#7df5bc" : PALETTE[t.phase].css;
      g.save();
      g.translate(t.x * s, t.z * s);
      g.rotate(Math.PI / 4);
      g.fillRect(-3, -3, 6, 6);
      g.restore();
    }
    for (const gt of game.world.gates || []) {
      if (gt.open) continue;
      g.fillStyle = "#ff8a2a";
      for (const [r, c] of gt.tiles) g.fillRect(c * this.mmScale, r * this.mmScale, this.mmScale, this.mmScale);
    }
    const ex = game.world.exit;
    if (ex) {
      g.strokeStyle = ex.open ? "#55e6ff" : "#ff5566";
      g.lineWidth = 2;
      g.beginPath(); g.arc(ex.x * s, ex.z * s, 4, 0, Math.PI * 2); g.stroke();
    }
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const same = e.phase === game.phase;
      g.fillStyle = same ? "#ff4466" : "rgba(255,255,255,0.18)";
      g.fillRect(e.pos.x * s - 1.5, e.pos.z * s - 1.5, 3, 3);
    }
    const p = game.player;
    g.save();
    g.translate(p.pos.x * s, p.pos.z * s);
    g.rotate(-p.facing + Math.PI);
    g.fillStyle = "#fff";
    g.beginPath(); g.moveTo(0, -4); g.lineTo(3, 3); g.lineTo(-3, 3); g.closePath(); g.fill();
    g.restore();
  }
}
