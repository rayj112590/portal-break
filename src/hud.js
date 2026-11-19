// ============================================================
//  HUD — DOM overlay drawn on top of the WebGL canvas.
// ============================================================
import { CREW, MAX_CELLS, maxHp } from "./crew.js";
import * as THREE from "three";
import { CITY, BREACH, PALETTE, WEAPONS } from "./config.js";

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

  // Crew roster under the bars + callsign + which ability SHIFT fires. Each crew member gets
  // their own mini health / phase bars (filled in every frame from game.vitals).
  setCrew(list, active) {
    const c = CREW[active];
    this.root.dataset.char = active;
    const cs = this.root.querySelector(".callsign");
    cs.innerHTML = `${c.short} <span>// ${c.tag}</span>`;
    const el = $("crew-strip");
    el.classList.toggle("hidden", list.length < 2);
    el.innerHTML = list.map((id, i) => `<span class="cm${id === active ? " on" : ""}" data-id="${id}" style="--cc:${CREW[id].css || "var(--accent)"}">`
      + `<span class="cm-name"><kbd>${i + 1}</kbd>${CREW[id].short.split(" ").pop()}<em>DOWN</em></span>`
      + `<i class="mb"><b class="mh"></b></i><i class="mb me"><b class="mp"></b></i></span>`).join("")
      + `<span class="cm-tab"><kbd>TAB</kbd></span>`;
    this.crewEls = [...el.querySelectorAll(".cm")].map(n => ({ id: n.dataset.id, root: n, hp: n.querySelector(".mh"), en: n.querySelector(".mp"), last: "" }));
  }

  updateCrewBars(game) {
    for (const e of this.crewEls || []) {
      const v = game.vitals[e.id];
      if (!v) continue;
      const key = `${Math.ceil(v.hp)}|${Math.round(v.energy)}|${v.down}`;
      if (key === e.last) continue;
      e.last = key;
      const hpPct = Math.max(0, v.hp) / maxHp(e.id) * 100;
      e.hp.style.width = `${hpPct}%`;
      e.hp.classList.toggle("low", hpPct < 30);
      e.en.style.width = `${Math.max(0, v.energy)}%`;
      e.root.classList.toggle("down", v.down);
    }
    const el = this.cellsEl || (this.cellsEl = $("cells"));
    const key = `${game.cells}`;
    if (el && el.dataset.k !== key) {
      el.dataset.k = key;
      let pips = "";
      for (let i = 0; i < MAX_CELLS; i++) pips += `<i class="${i < game.cells ? "on" : ""}"></i>`;
      el.innerHTML = `<b>✚</b> REVIVE ${pips}`;
    }
    // pickup weapon (from a supply crate) and its ammo
    const wEl = this.weaponEl || (this.weaponEl = $("weapon"));
    const w = game.player.weapon, def = w && WEAPONS[w.id];
    const wKey = def ? `${w.id}|${w.ammo}` : "";
    if (wEl && wEl.dataset.k !== wKey) {
      wEl.dataset.k = wKey;
      wEl.classList.toggle("hidden", !def);
      if (def) { wEl.style.setProperty("--wc", def.css); wEl.innerHTML = `<b>${def.name}</b><span>${w.ammo}</span>`; }
    }
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
    const hpPct = Math.max(0, player.hp) / maxHp(game.char);
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
    this.updateCrewBars(game);

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
    this.updateBoss(game);
    this.drawMinimap(game);
  }

  // The Warden's health bar under the objective, once he's powered up. The pale "lag" bar trails
  // behind the real one so big hits read clearly.
  updateBoss(game) {
    const b = game.boss;
    const el = this.bossEl || (this.bossEl = { root: $("boss-bar"), fill: $("bb-fill"), lag: $("bb-lag"), status: $("bb-status"), last: "" });
    const on = !!(b && b.state !== "dormant" && b.alive && game.player.alive);
    el.root.classList.toggle("hidden", !on);
    if (!on) return;
    const pct = `${Math.max(0, b.hp / b.maxHp) * 100}%`;
    if (el.fill.style.width !== pct) { el.fill.style.width = pct; el.lag.style.width = pct; }
    const st = b.status();
    if (st !== el.last) { el.status.textContent = st; el.last = st; }
    el.root.dataset.state = b.state === "override" ? "override" : (b.state === "purge" || b.state === "purgeCharge") ? "purge" : b.state === "search" ? "lost" : "";
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
    const y = t.isBoss ? 2.4 : t.type === "drone" ? 1.7 : 1.2;
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
    const reviveTarget = this.reviveWaypoint(game);
    const boss = game.boss;
    if (world.exit?.open) { target = world.exit; kind = "EXIT PORTAL"; color = "#9ff3ff"; }
    else if (boss && boss.alive && !boss.dying && world.terminals.every(t => t.hacked)) {
      // all locks done: the portal room, then the Warden himself
      target = boss.pos; kind = "THE WARDEN"; color = "#ff2e80";
    }
    else if (crewTarget) {
      // standing at the crew terminal: its own label takes over
      if (crewTarget.d < 3.2) { wp.el.classList.add("hidden"); return; }
      target = crewTarget; kind = crewTarget.kind; color = "#ffc04a";
    }
    else if (reviveTarget) {
      // standing at it: the chamber's own label takes over
      if (reviveTarget.d < 3.2) { wp.el.classList.add("hidden"); return; }
      target = reviveTarget; kind = "REVIVE CHAMBER"; color = "#7dffb0";
    }
    else {
      let best = Infinity;
      for (const t of world.terminals) {
        if (t.hacked || (t.tier || 0) > world.locksDone) continue;   // skip locks still behind a gate
        if (t.sealed && (!game.crew.includes("rook") || game.vitals.rook?.down)) continue;   // glass vault: needs Rook's remote hack
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
    // keep clear of the tutorial hint at the bottom while it's showing, and of the toast at the top
    const hintOn = this.hintEl?.classList.contains("show");
    const mx = 70, myTop = 165, myBot = hintOn ? 200 : 110;
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

  // The crew ID card once the gate in front of it is open, then the crew terminal while you carry it.
  crewWaypoint(game) {
    const { world, player } = game, cd = world.card;
    if (!cd) return null;
    const c = CREW[cd.crew];
    if (!c || game.crew.includes(c.id)) return null;
    if (!cd.taken && (cd.tier || 0) <= world.locksDone) return { x: cd.x, z: cd.z, kind: "CREW ID CARD", d: Infinity };
    const ct = world.crewTerm;
    if (cd.taken && ct) return { x: ct.fx, z: ct.fz, kind: "CREW TERMINAL", d: Math.hypot(ct.fx - player.pos.x, ct.fz - player.pos.z) };
    return null;
  }

  // A crew member is down and you carry a revive cell: point at the nearest revive chamber.
  reviveWaypoint(game) {
    const { world, player } = game;
    if (!game.cells || !game.crew.some(id => game.vitals[id]?.down)) return null;
    let best = null, bestD = Infinity;
    for (const ch of world.chambers || []) {
      const d = Math.hypot(ch.fx - player.pos.x, ch.fz - player.pos.z);
      if (d < bestD) { bestD = d; best = { x: ch.fx, z: ch.fz, d }; }
    }
    return best;
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
          else if (ch === "U") fill = "#3fd08a";
          else if (ch === "K") fill = "#e0a23a";
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
    // throwable crates (they move, so they're drawn live instead of baked into the layers)
    for (const pr of game.world.props || []) {
      if (pr.state !== "idle") continue;
      g.fillStyle = pr.kind === "supply" ? "#ffc04a" : "#8a7a66";
      g.fillRect(pr.x * s - 3, pr.z * s - 3, 6, 6);
    }
    g.fillStyle = "#7dffb0";
    for (const cell of game.world.cells || []) {
      if (cell.taken) continue;
      g.fillRect(cell.x * s - 1, cell.z * s - 3, 2, 6);
      g.fillRect(cell.x * s - 3, cell.z * s - 1, 6, 2);
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
