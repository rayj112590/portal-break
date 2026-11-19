// Headless playtest of the crew changes over the Chrome DevTools protocol (no extra packages).
// Usage: node playtest.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const PORT = 9341;
const chrome = spawn("C:/Program Files/Google/Chrome/Application/chrome.exe", [
  "--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, "profile")}`,
  "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--window-size=1280,720",
  "--autoplay-policy=no-user-gesture-required", "--no-first-run", "about:blank",
], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find(t => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console.error: " + m.params.args.map(a => a.value ?? a.description).join(" "));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(`${expr}\n  -> ${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
};
const shot = async name => {
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 85 });
  writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
};
const click = sel => ev(`(() => { const b = document.querySelector('${sel}'); if (!b) throw new Error('no ${sel}'); b.click(); return true; })()`);
const results = [];
const check = (label, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  (" + detail + ")" : ""}`);

try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:8137/" });
  for (let i = 0; i < 60; i++) { await sleep(500); if (await ev("!!window.__game && !!document.querySelector('[data-action=start]')").catch(() => false)) break; }
  await sleep(1500);

  // ---- District 01: wake up in Pod 01 ----
  await click("[data-action=start]"); await sleep(300);
  await click("[data-action=skip]"); await sleep(300);
  const pods1 = await ev("__game.world.pods.map(p => p.label + ':' + p.state).join(' ')");
  check("D01 has the hypersleep chamber pods", pods1.split(" ").length === 4, pods1);
  check("D01 Jax is hidden in his pod on the briefing", await ev("__game.player.asleep === true"));
  await shot("d01-briefing.jpg");
  await click("[data-action=play]"); await sleep(150);
  await shot("d01-wake-start.jpg");
  for (let i = 0; i < 40; i++) { await sleep(500); if (await ev("__game.world.pods.find(p => p.label === '01').open > 0.85")) break; }
  const s1 = await ev("({ asleep: __game.player.asleep, pod01: __game.world.pods.find(p => p.label === '01').state, open: +__game.world.pods.find(p => p.label === '01').open.toFixed(2), char: __game.char, crew: __game.crew.join(','), state: __game.state })");
  check("D01 Pod 01 opens and Jax wakes", !s1.asleep && s1.pod01 === "awake" && s1.open > 0.8, JSON.stringify(s1));
  check("D01 Rook's Pod 07 is locked", await ev("__game.world.pods.find(p => p.label === '07').state") === "locked");
  await shot("d01-awake.jpg");

  // ---- District 03: the ID card unlocks Rook ----
  await ev("localStorage.setItem('pb-progress', '4'); true");
  await ev("__gfx.loadDistrict(2); true"); await sleep(300);
  check("D03 has the ID card for Rook", await ev("__game.world.card?.crew") === "rook", await ev("JSON.stringify({ r: __game.world.card?.r, c: __game.world.card?.c, tier: __game.world.card?.tier })"));
  await ev("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); true"); // briefing state? fall back below
  await ev("__game.state = 'briefing'; true");
  await ev("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); true"); await sleep(400);
  check("D03 starts as Jax without Rook", await ev("__game.char === 'jax' && !__game.crew.includes('rook')"), await ev("__game.crew.join(',')"));
  check("D03 has a crew terminal facing the floor", await ev("!!__game.world.crewTerm && !__game.world.solid(...__game.world.toTile(__game.world.crewTerm.fx, __game.world.crewTerm.fz), 0, 'walk')"), await ev("JSON.stringify({ r: __game.world.crewTerm?.r, c: __game.world.crewTerm?.c })"));
  // walk onto the card: it is picked up, but Rook stays asleep until the terminal
  await ev("(() => { const c = __game.world.card; __game.player.pos.set(c.x, 0, c.z); return true; })()");
  for (let i = 0; i < 40; i++) { await sleep(500); if (await ev("__game.world.card.taken")) break; }
  await sleep(1500);
  const s2 = await ev("({ state: __game.state, crew: __game.crew.join(','), saved: localStorage.getItem('pb-crew'), toast: document.getElementById('toast')?.textContent, obj: __game.objText, wp: document.querySelector('#waypoint .wp-label')?.textContent })");
  check("D03 the card alone does not wake Rook", s2.state === "play" && !s2.crew.includes("rook") && !(s2.saved || "").includes("rook"), JSON.stringify(s2));
  check("D03 toast, objective and waypoint send you to the crew terminal", (s2.toast || "").includes("CREW TERMINAL") && s2.obj.includes("CREW TERMINAL") && (s2.wp || "").startsWith("CREW TERMINAL"), JSON.stringify(s2));
  // stand at the terminal: the ID uploads, then the wake scene
  await ev("(() => { const t = __game.world.crewTerm; __game.player.pos.set(t.fx, 0, t.fz); window.__camOverride = { pos: [t.fx, 12, t.fz + 9], look: [t.fx, 1, t.fz - 1] }; return true; })()");
  for (let i = 0; i < 60; i++) { await sleep(500); if (await ev("__game.world.crewTerm.progress > 0.35 || __game.state === 'story'")) break; }
  const up = await ev("({ state: __game.world.crewTerm.state, p: __game.world.crewTerm.progress, label: [...document.querySelectorAll('.term-label')].filter(e => e.style.display !== 'none').map(e => e.textContent).join('|') })");
  check("D03 the crew terminal uploads the ID", up.state === "uploading" && up.label.includes("UPLOADING ID"), JSON.stringify(up));
  await shot("d03-crew-terminal.jpg");
  for (let i = 0; i < 60; i++) { await sleep(500); if (await ev("__game.state === 'story'")) break; }
  await ev("window.__camOverride = null; true");
  await sleep(1500);
  const s3 = await ev("({ state: __game.state, crew: __game.crew.join(','), saved: localStorage.getItem('pb-crew'), speaker: document.querySelector('.speaker')?.textContent })");
  check("D03 the crew terminal wakes Rook (wake scene plays, saved)", s3.state === "story" && s3.crew.includes("rook") && (s3.saved || "").includes("rook"), JSON.stringify(s3));
  await shot("d03-rook-wakes.jpg");
  await click("[data-action=skip]"); await sleep(400);
  check("D03 after the scene you play as Rook", await ev("__game.state === 'play' && __game.char === 'rook'"), await ev("__game.state + ' ' + __game.char"));

  // ---- District 01 replay: Pod 07 is empty now ----
  await ev("__gfx.loadDistrict(0); true"); await sleep(300);
  check("D01 replay: Pod 07 shows awake/empty", await ev("__game.world.pods.find(p => p.label === '07').state") === "awake");

  // ---- District 05 without Rook: she's brought along and selected ----
  await ev("localStorage.removeItem('pb-crew'); true");
  await ev("__gfx.loadDistrict(4); true"); await sleep(300);
  await ev("__game.state = 'briefing'; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); true"); await sleep(400);
  const s5 = await ev("({ name: __game.world.level.name, char: __game.char, crew: __game.crew.join(','), saved: localStorage.getItem('pb-crew'), pods: (__game.world.pods || []).length, card: !!__game.world.card, locks: __game.world.terminals.length, sealed: __game.world.terminals.filter(t => t.sealed).length, toast: document.querySelector('.toast, #toast')?.textContent })");
  check("D05 is Portal Zero with no pods or card", s5.pods === 0 && !s5.card && s5.name.includes("PORTAL ZERO"), JSON.stringify(s5));
  check("D05 auto-selects Rook even if she was never unlocked", s5.char === "rook" && s5.crew.includes("rook") && !(s5.saved || "").includes("rook"));
  check("D05 keeps the sealed vault lock", s5.sealed === 1 && s5.locks === 3);
  await shot("d05-start.jpg");
  // look at the old pod room
  await ev("__game.player.pos.set(45, 0, 31); true"); await sleep(1500);
  await shot("d05-hall.jpg");
} catch (e) {
  results.push("ERROR  " + e.message);
} finally {
  console.log(results.join("\n"));
  console.log(errors.length ? "PAGE ERRORS:\n  " + [...new Set(errors)].join("\n  ") : "No page errors.");
  ws.close(); chrome.kill();
}
