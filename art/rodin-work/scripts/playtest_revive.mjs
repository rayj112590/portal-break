// Headless playtest of per-character vitals, going down, revive cells and revive chambers.
// Usage: node playtest_revive.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const PORT = 9342;
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
const waitFor = async (expr, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(250); }
  return false;
};
const tab = async () => { await waitFor('__game.swapCd === 0'); await key('Tab'); };
const key = code => ev(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}' })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}' })), 60); true`);
const results = [];
const check = (label, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  (" + detail + ")" : ""}`);
const clearEnemies = () => ev("for (const e of __game.enemies) if (e.alive) e.remove(); __game.enemies = []; true");
const enter = async i => {
  await ev(`__gfx.loadDistrict(${i}); true`); await sleep(300);
  await ev("__game.state = 'briefing'; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); true");
  // with two or more crew awake, ENTER on the briefing opens the crew screen (Nov 19): ENTER again deploys
  await sleep(400);
  if (await ev("__game.state === 'crew'")) await ev("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); true");
  await waitFor("__game.state === 'play'");
  await clearEnemies();
};
const goTo = (x, z) => ev(`__game.player.pos.set(${x}, 0, ${z}); true`);

try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:8137/" });
  await waitFor("!!window.__game && !!document.querySelector('[data-action=start]')", 30000);
  await ev(`localStorage.setItem('pb-crew', '["rook"]'); localStorage.setItem('pb-progress', '4'); localStorage.setItem('pb-cells', '0'); true`);
  await sleep(800);

  // ---- District 03 with Rook unlocked ----
  await enter(2);
  const v0 = await ev("JSON.stringify(__game.vitals)");
  check("D03 both crew start with their own full vitals", v0.includes('"jax":{"hp":100') && v0.includes('"rook":{"hp":100'), v0);
  check("HUD shows two crew entries with bars", await ev("document.querySelectorAll('#crew-strip .cm .mh').length === 2"));
  check("HUD shows the revive cell counter", await ev("document.getElementById('cells').textContent.includes('REVIVE')"), await ev("document.getElementById('cells').textContent"));

  // Jax hurt to 40, swap to Rook: Rook has her own 100
  await ev("__game.player.hp = 40; __game.lastHurt = __game.stats.time; true"); await sleep(400);
  await tab();
  await waitFor("__game.char === 'rook'");
  const s1 = await ev("({ char: __game.char, hp: Math.round(__game.player.hp), jax: Math.round(__game.vitals.jax.hp) })");
  check("Swap to Rook loads her own health", s1.char === "rook" && s1.hp >= 99 && s1.jax >= 40 && s1.jax < 70, JSON.stringify(s1));
  const barW = await ev("document.querySelector('#crew-strip .cm[data-id=jax] .mh').style.width");
  check("Jax's mini bar shows his lower health while benched", parseFloat(barW) < 75, barW);
  await shot("hud-two-bars.jpg");
  await sleep(500);
  await tab();
  await waitFor("__game.char === 'jax'");
  const s2 = await ev("({ char: __game.char, hp: Math.round(__game.player.hp), rook: Math.round(__game.vitals.rook.hp) })");
  check("Swap back: Jax keeps his own (recovering) health", s2.char === "jax" && s2.hp >= 40 && s2.hp < 90 && s2.rook >= 99, JSON.stringify(s2));

  // energy is per character too
  await ev("__game.player.energy = 20; true"); await sleep(400);
  await tab(); await waitFor("__game.char === 'rook'");
  const s3 = await ev("({ e: Math.round(__game.player.energy), jaxE: Math.round(__game.vitals.jax.energy) })");
  check("Phase energy is per character", s3.e >= 95 && s3.jaxE < 60, JSON.stringify(s3));

  // Rook goes down -> Jax takes over, game continues
  await ev("__game.player.invuln = 0; __game.hurtPlayer(500, __game.player.pos.x + 1, __game.player.pos.z); true");
  await waitFor("__game.char === 'jax'");
  await waitFor("!!document.querySelector('#crew-strip .cm.down')", 20000);
  const s4 = await ev("({ char: __game.char, state: __game.state, alive: __game.player.alive, down: __game.vitals.rook.down, hud: !!document.querySelector('#crew-strip .cm.down'), toast: document.getElementById('toast').textContent })");
  check("Rook down: Jax takes over, no game over", s4.char === "jax" && s4.state === "play" && s4.alive && s4.down && s4.hud, JSON.stringify(s4));
  await sleep(500);
  await tab(); await sleep(600); await waitFor('__game.swapCd === 0');
  const s5 = await ev("({ char: __game.char, toast: document.getElementById('toast').textContent })");
  check("Can't swap to a downed crew member", s5.char === "jax" && s5.toast.includes("IS DOWN"), JSON.stringify(s5));
  await shot("rook-down.jpg");

  // chamber with no cell: label says so, nothing happens
  const ch = await ev("({ fx: __game.world.chambers[0].fx, fz: __game.world.chambers[0].fz, x: __game.world.chambers[0].x, z: __game.world.chambers[0].z })");
  await goTo(ch.fx, ch.fz); await sleep(1500);
  const s6 = await ev("({ down: __game.vitals.rook.down, label: [...document.querySelectorAll('.term-label')].filter(e => e.style.display !== 'none').map(e => e.textContent).join(' | ') })");
  check("Chamber without a cell doesn't revive", s6.down && s6.label.includes("NEEDS A REVIVE CELL"), JSON.stringify(s6));

  // pick up the district's revive cell
  const cell = await ev("({ x: __game.world.cells[0].x, z: __game.world.cells[0].z })");
  await goTo(cell.x, cell.z);
  await waitFor("__game.cells === 1");
  const s7 = await ev("({ cells: __game.cells, saved: localStorage.getItem('pb-cells'), taken: __game.world.cells[0].taken, wp: document.querySelector('#waypoint .wp-label').textContent })");
  check("Revive cell picked up and saved", s7.cells === 1 && s7.saved === "1" && s7.taken, JSON.stringify(s7));
  await sleep(400);
  check("Waypoint points at the revive chamber", (await ev("document.querySelector('#waypoint .wp-label').textContent")).includes("REVIVE CHAMBER"));

  // revive at the chamber
  await goTo(ch.fx, ch.fz);
  await waitFor("__game.world.chambers[0].progress > 0.45", 120000);
  await ev(`window.__camOverride = { pos: [${ch.fx}, 13, ${ch.fz + 9}], look: [${ch.fx}, 1.2, ${ch.fz - 1.5}] }; true`);
  await sleep(300);
  await shot("chamber-reviving.jpg");
  await ev("window.__camOverride = null; true");
  await waitFor("!__game.vitals.rook.down", 120000);
  const s8 = await ev("({ down: __game.vitals.rook.down, hp: __game.vitals.rook.hp, cells: __game.cells, saved: localStorage.getItem('pb-cells'), hud: !!document.querySelector('#crew-strip .cm.down') })");
  check("Revive chamber brings Rook back and spends the cell", !s8.down && s8.hp === 100 && s8.cells === 0 && s8.saved === "0" && !s8.hud, JSON.stringify(s8));
  await sleep(600);
  await tab();
  check("Revived Rook can be swapped in again", await waitFor("__game.char === 'rook'"));

  // whole crew down = game over
  await ev("__game.player.invuln = 0; __game.hurtPlayer(500, __game.player.pos.x + 1, __game.player.pos.z); true");
  await waitFor("__game.char === 'jax'"); await sleep(300);
  await ev("__game.player.invuln = 0; __game.hurtPlayer(500, __game.player.pos.x + 1, __game.player.pos.z); true");
  await waitFor("__game.state === 'dead'", 120000);
  const s9 = await ev("({ state: __game.state, eyebrow: document.querySelector('.eyebrow')?.textContent })");
  check("Both down = game over screen", s9.state === "dead" && s9.eyebrow.includes("WHOLE CREW DOWN"), JSON.stringify(s9));
  await shot("crew-dead.jpg");

  // ---- Every district has a chamber; shoot each one ----
  for (let i = 0; i < 5; i++) {
    await enter(i);
    const c = await ev("({ n: __game.world.chambers.length, fx: __game.world.chambers[0].fx, fz: __game.world.chambers[0].fz, cells: __game.world.cells.length })");
    check(`District 0${i + 1} has a revive chamber and ${c.cells} cell(s)`, c.n === 1 && c.cells >= 1);
    await goTo(c.fx + 2, c.fz + 1.5);
    await ev(`__game.player.invuln = 999; window.__camOverride = { pos: [${c.fx}, 13, ${c.fz + 9}], look: [${c.fx}, 1.2, ${c.fz - 1.5}] }; true`);
    await sleep(2500);
    await shot(`d0${i + 1}-chamber.jpg`);
  }
  await ev("window.__camOverride = null; true");
  const fps = await ev("new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else r(+(n / 3).toFixed(1)); }; requestAnimationFrame(f); })");
  results.push(`INFO  headless fps ${fps}`);
} catch (e) {
  results.push("ERROR  " + e.message);
} finally {
  console.log(results.join("\n"));
  console.log(errors.length ? "PAGE ERRORS:\n  " + [...new Set(errors)].join("\n  ") : "No page errors.");
  ws.close(); chrome.kill();
}
