// Headless playtest of Hollis Crane (the tank): joining from his District 04 card, lifting and
// throwing crates and small enemies, supply crate loot, pickup weapons, and level reset.
// Usage: node playtest_crane.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const PORT = 9343;
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
const key = code => ev(`window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}' })); setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}' })), 60); true`);
const shift = async () => { await waitFor("__game.grabCd === 0"); await key("ShiftLeft"); };
const results = [];
const check = (label, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  (" + detail + ")" : ""}`);
const enter = async (i, keep = "false") => {
  await ev(`__gfx.loadDistrict(${i}); true`); await sleep(300);
  await ev("__game.state = 'briefing'; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); true");
  // with two or more crew awake, ENTER on the briefing opens the crew screen (Nov 19): ENTER again deploys
  await sleep(400);
  if (await ev("__game.state === 'crew'")) await ev("window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); true");
  await waitFor("__game.state === 'play'");
  await ev(`__game.enemies = __game.enemies.filter(e => { const k = ${keep}; if (!k) e.remove(); return k; }); __game.player.invuln = 9999; true`);
};
const goTo = (x, z) => ev(`__game.player.pos.set(${x}, 0, ${z}); __game.player.vel.set(0, 0, 0); true`);
// fixed camera over a spot, so the mouse can be pointed at world positions reliably
const cam = (x, z, h = 14, back = 9) => ev(`window.__camOverride = { pos: [${x}, ${h}, ${z + back}], look: [${x}, 1, ${z - 1}] }; true`);
const aimAt = (x, z) => ev(`(() => { const v = __game.player.pos.clone().set(${x}, 1.2, ${z}).project(__game.camera);
  window.dispatchEvent(new MouseEvent('mousemove', { clientX: (v.x + 1) / 2 * innerWidth, clientY: (1 - v.y) / 2 * innerHeight })); return true; })()`);
const canvas = "document.querySelector('canvas')";
const holdFire = on => ev(on
  ? `${canvas}.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); true`
  : `window.dispatchEvent(new MouseEvent('mouseup', { button: 0 })); true`);
const prop = (r, c) => `__game.world.props.find(p => p.r === ${r} && p.c === ${c})`;

try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:8137/" });
  await waitFor("!!window.__game && !!document.querySelector('[data-action=start]')", 30000);
  await ev(`localStorage.setItem('pb-crew', '["rook"]'); localStorage.setItem('pb-progress', '4'); localStorage.setItem('pb-cells', '0'); true`);
  await sleep(800);

  // ---- District 04: the card, then Crane joins ----
  await enter(3, "e.type === 'drone' && Math.hypot(e.pos.x - 47, e.pos.z - 7) < 3");
  const w0 = await ev("({ props: __game.world.props.map(p => p.ch + p.loot).join(','), card: __game.world.card?.crew, drone: __game.enemies.length })");
  check("D04 has 3 heavy crates, 2 supply crates (scatter, gift) and Crane's card", w0.props.split(",").filter(s => s.startsWith("m")).length === 3 && w0.props.includes("$scatter") && w0.props.includes("$gift") && w0.card === "crane", JSON.stringify(w0));
  check("Without Crane, a crate is solid cover", await ev("__game.world.solid(2, 24, 0, 'walk') && __game.world.solid(2, 24, 0, 'shot') && !__game.world.solid(2, 24, 0, 'fly')"));
  await ev("for (const e of __game.enemies) { e.cfg = { ...e.cfg, fireEvery: 999 }; e.cooldown = 999; } true");   // the drone stays, but doesn't shoot
  await cam(47, 6);
  await goTo(45, 7.2); await sleep(300);
  await shot("d04-card-alcove.jpg");
  await goTo(45, 5);
  await waitFor("__game.world.card.taken", 30000); await sleep(800);
  check("The card alone does not wake Crane; the crew terminal does", await ev("__game.state === 'play' && !__game.crew.includes('crane') && __game.objText.includes('CREW TERMINAL')"), await ev("__game.objText"));
  const ct = await ev("({ x: __game.world.crewTerm.fx, z: __game.world.crewTerm.fz })");
  await cam(ct.x, ct.z); await goTo(ct.x, ct.z);
  await waitFor("__game.world.crewTerm.progress > 0.35 || __game.state === 'story'", 30000);
  await shot("d04-crew-terminal.jpg");
  await waitFor("__game.state === 'story'", 30000);
  await waitFor("document.getElementById('overlay').textContent.includes('CRANE')", 20000);   // typewriter text
  check("Card pickup starts Crane's wake-up story", await ev("__game.state === 'story' && document.getElementById('overlay').textContent.includes('CRANE')"));
  await shot("crane-wake.jpg");
  await ev("document.querySelector('[data-action=skip]')?.click(); true");
  await waitFor("__game.state === 'play' && __game.char === 'crane'", 30000);
  const s1 = await ev("({ char: __game.char, crew: __game.crew.join(','), saved: localStorage.getItem('pb-crew'), hp: Math.round(__game.player.hp), bulk: __game.player.bulk, speed: __game.player.speedMul, callsign: document.querySelector('.callsign').textContent, shift: getComputedStyle(document.querySelector('.ph.grab')).display })");
  check("Crane joins and is selected: 160 health, bigger, slower", s1.char === "crane" && s1.crew === "jax,rook,crane" && s1.saved.includes("crane") && s1.hp === 160 && s1.bulk > 1.1 && s1.speed < 1, JSON.stringify(s1));
  check("HUD: callsign BOULDER, SHIFT reads GRAB & THROW, three crew bars", s1.callsign.includes("BOULDER") && s1.shift !== "none" && await ev("document.querySelectorAll('#crew-strip .cm').length === 3"), JSON.stringify(s1));

  // ---- grab the drone and throw it ----
  const hasDrone = await ev("__game.enemies.some(e => e.alive && e.type === 'drone')");
  if (hasDrone) {
    const kills0 = await ev("__game.stats.kills");
    const d = await ev("(() => { const e = __game.enemies.find(e => e.alive && e.type === 'drone'); e.cfg = { ...e.cfg, speed: 0 }; return { x: e.pos.x, z: e.pos.z }; })()");
    await cam(d.x, d.z + 1);
    await goTo(d.x, d.z + 1.4); await aimAt(d.x, d.z); await sleep(1200); await aimAt(d.x, d.z); await sleep(500);
    await shift();
    await waitFor("__game.held?.kind === 'enemy'");
    check("SHIFT grabs a small enemy (drone)", await ev("__game.held?.kind === 'enemy' && __game.held.obj.type === 'drone' && __game.held.obj.held"));
    await waitFor("__game.held.t >= 0.18"); await sleep(500);
    await shot("crane-holds-drone.jpg");
    await aimAt(d.x, d.z + 8); await sleep(400);
    await holdFire(true); await sleep(400); await holdFire(false);   // a click throws while carrying
    await waitFor(`__game.stats.kills > ${kills0}`);
    check("Left click throws it, and a thrown enemy doesn't get up", await ev(`__game.stats.kills > ${kills0} && !__game.enemies.some(e => e.alive && e.type === 'drone' && e.held)`));
  } else check("SHIFT grabs a small enemy (drone)", false, "no drone left to test with");

  // ---- lift the supply crate (2,24) ----
  await cam(47, 6);
  await goTo(47.2, 5); await aimAt(49, 5); await sleep(1500); await aimAt(49, 5); await sleep(800);
  const lbl = await ev("[...document.querySelectorAll('.term-label')].filter(e => e.style.display !== 'none').map(e => e.textContent).join(' | ')");
  check("Prompt over the crate: SHIFT LIFT SUPPLY CRATE", lbl.includes("LIFT SUPPLY CRATE"), lbl);
  await shift();
  await waitFor("!!__game.held");
  const s2 = await ev(`({ kind: __game.held?.kind, what: __game.held?.obj.kind, tile: __game.world.ch(2, 24), carrying: __game.player.carrying, speed: +__game.player.speedMul.toFixed(3), gun: __game.player.model.gun.visible })`);
  check("SHIFT lifts it: tile is floor now, Crane slows down and puts his gun away", s2.kind === "prop" && s2.what === "supply" && s2.tile === "." && s2.carrying && s2.speed < 0.75 && !s2.gun, JSON.stringify(s2));
  await waitFor("__game.held.t >= 0.18");
  await sleep(600);
  await shot("crane-lift.jpg");

  // ---- throw it south ----
  await aimAt(49, 13); await sleep(600); await aimAt(49, 13);
  await shift();
  await waitFor("__game.thrown.length === 1 || " + prop(2, 24) + ".state === 'gone'");
  await shot("crane-throw.jpg");
  await waitFor(prop(2, 24) + ".state === 'gone'");
  const s3 = await ev(`({ state: ${prop(2, 24)}.state, held: !!__game.held, loot: __game.pickups.map(p => p.kind + (p.keep ? '*' : '')).join(','), toast: document.getElementById('toast').textContent })`);
  check("Thrown supply crate smashes and reveals its scatter gun", s3.state === "gone" && !s3.held && s3.loot.includes("scatter*") && s3.toast.includes("SCATTER"), JSON.stringify(s3));
  await sleep(800);
  await shot("supply-crate-open.jpg");

  // ---- pick the weapon up and fire it ----
  const pk = await ev("(() => { const p = __game.pickups.find(p => p.kind === 'scatter'); return { x: p.x, z: p.z }; })()");
  await goTo(pk.x, pk.z);
  await waitFor("__game.player.weapon?.id === 'scatter'");
  const s4 = await ev("({ w: __game.player.weapon, hud: document.getElementById('weapon').textContent, hidden: document.getElementById('weapon').classList.contains('hidden') })");
  check("Scatter gun picked up, HUD shows it with ammo", s4.w?.ammo === 36 && !s4.hidden && s4.hud.includes("SCATTER GUN") && s4.hud.includes("36"), JSON.stringify(s4));
  await aimAt(pk.x, pk.z + 6);
  await holdFire(true);
  await waitFor("__game.player.weapon && __game.player.weapon.ammo <= 33", 60000);
  await holdFire(false);
  const s5 = await ev("({ ammo: __game.player.weapon?.ammo, hud: document.getElementById('weapon').textContent })");
  check("Firing spends scatter ammo", s5.ammo <= 33 && s5.hud.includes(String(s5.ammo)), JSON.stringify(s5));
  await shot("scatter-gun.jpg");

  // ---- the weapon belongs to Crane: swap away and back ----
  await waitFor("__game.swapCd === 0"); await key("Digit1");
  await waitFor("__game.char === 'jax'");
  const s6 = await ev("({ w: __game.player.weapon, hp: Math.round(__game.player.hp), bulk: __game.player.bulk, crane: __game.vitals.crane.weapon })");
  check("Jax has his rifle and normal size; Crane keeps the scatter gun on the bench", !s6.w && s6.bulk === 1 && s6.crane?.id === "scatter", JSON.stringify(s6));
  await waitFor("__game.swapCd === 0"); await key("Digit3");
  await waitFor("__game.char === 'crane'");
  check("Back to Crane: scatter gun is still his", (await ev("__game.player.weapon?.id")) === "scatter");

  // ---- plain heavy crate (5,24): lift, the tile opens up, throw it ----
  await cam(49, 12);
  await goTo(49, 13.2); await aimAt(49, 11); await sleep(1200); await aimAt(49, 11); await sleep(500);
  await shift();
  await waitFor("__game.held?.kind === 'prop'");
  check("Heavy crate lifted, its tile is walkable", await ev("__game.held?.obj.kind === 'crate' && !__game.world.solid(5, 24, 0, 'walk')"));
  await waitFor("__game.held.t >= 0.18");
  await aimAt(42, 13); await sleep(400);
  await shift();
  await waitFor(prop(5, 24) + ".state === 'gone'");
  check("Heavy crate thrown and broken", await ev(prop(5, 24) + ".state === 'gone'"));

  // ---- swapping while carrying drops it ----
  await goTo(41, 7.2); await aimAt(41, 5); await cam(41, 6); await sleep(1200); await aimAt(41, 5); await sleep(400);
  await shift();
  await waitFor("__game.held?.kind === 'prop'");
  await waitFor("__game.swapCd === 0"); await key("Digit2");
  await waitFor("__game.char === 'rook'");
  check("Swapping out while carrying drops the crate (it breaks)", await ev(`!__game.held && !__game.player.carrying && ${prop(2, 20)}.state === 'gone' && __game.player.model.gun.visible`));

  // ---- restart the district: every crate is back ----
  await enter(3);
  const s7 = await ev("({ idle: __game.world.props.every(p => p.state === 'idle' && p.group.visible), tiles: __game.world.props.map(p => __game.world.ch(p.r, p.c)).join(''), crane: Math.round(__game.vitals.crane.hp), weapon: __game.vitals.crane.weapon })");
  check("District restart puts every crate back; Crane starts at 160 with the rifle", s7.idle && s7.tiles === "m$m$m" &&s7.crane === 160 && !s7.weapon, JSON.stringify(s7));

  // ---- District 05: supply crate with a revive cell ----
  await enter(4);
  const s8 = await ev("({ char: __game.char, crew: __game.crew.join(','), props: __game.world.props.map(p => p.ch + (p.loot || '')).join(',') })");
  // Nov 19: the squad lists the lead first, and the portal room has 6 more heavy crates for the Warden fight
  check("D05 starts with Rook (needs, leads), Crane in the squad, heavy crates (10 with the Warden's) + 2 supply crates (rail, cell)", s8.char === "rook" && s8.crew.split(",")[0] === "rook" && s8.crew.split(",").sort().join(",") === "crane,jax,rook" && s8.props.includes("$rail") && s8.props.includes("$cell") && s8.props.split(",").filter(s => s === "m").length >= 4, JSON.stringify(s8));
  await waitFor("__game.swapCd === 0"); await key("Digit3");
  await waitFor("__game.char === 'crane'");
  const c0 = await ev("__game.cells");
  // supply crate at (26,16): x 33, z 53
  await cam(33, 52);
  await goTo(33, 50.8); await aimAt(33, 53); await sleep(1200); await aimAt(33, 53); await sleep(500);
  await shift();
  await waitFor("__game.held?.obj?.loot === 'cell'");
  await waitFor("__game.held.t >= 0.18");
  await aimAt(39, 49); await sleep(400);
  await shift();
  await waitFor(prop(26, 16) + ".state === 'gone'");
  const cp = await ev("(() => { const p = __game.pickups.find(p => p.kind === 'cell'); return p ? { x: p.x, z: p.z } : null; })()");
  check("D05 supply crate drops a revive cell", !!cp, JSON.stringify(cp));
  if (cp) {
    await goTo(cp.x, cp.z);
    await waitFor(`__game.cells === ${c0 + 1}`);
    check("Picking it up adds a revive cell", (await ev("__game.cells")) === c0 + 1 && (await ev("localStorage.getItem('pb-cells')")) === String(c0 + 1));
  }

  // ---- rail gun pierces ----
  await ev("__game.player.weapon = { id: 'rail', ammo: 20 }; true");
  await aimAt(33, 40); await sleep(300);
  await holdFire(true);
  await waitFor("__game.player.weapon.ammo < 20");
  await holdFire(false);
  const rail = await ev("({ ammo: __game.player.weapon.ammo })");
  check("Rail gun fires and spends ammo", rail.ammo < 20, JSON.stringify(rail));

  // ---- overview shots of both districts' crates ----
  await ev("window.__camOverride = null; true");
  await enter(3);
  await cam(45, 8, 18, 12); await goTo(45, 13); await sleep(2500);
  await shot("d04-crates.jpg");
  await enter(4);
  await cam(33, 50, 18, 12); await goTo(37, 52); await sleep(2500);
  await shot("d05-crates.jpg");
  await ev("window.__camOverride = null; true");
} catch (e) {
  results.push("ERROR  " + e.message);
} finally {
  console.log(results.join("\n"));
  console.log(errors.length ? "PAGE ERRORS:\n  " + [...new Set(errors)].join("\n  ") : "No page errors.");
  ws.close(); chrome.kill();
}
