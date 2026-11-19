// Headless check of the Rodin enemy models in the real game: they load as Rodin models, the drone's
// rotors spin, turrets point their barrels at the player (and fire that way), hit flash + telegraph
// work, no page errors. Close-up and game-camera screenshots of each.
// usage: node enemy_check.mjs <outDir>
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const PORT = 9351;
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
  if (m.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(m.params.type)) errors.push(`console.${m.params.type}: ` + m.params.args.map(a => a.value ?? a.description).join(" "));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(`${expr}\n  -> ${r.result.exceptionDetails.exception?.description}`);
  return r.result?.result?.value;
};
const shot = async name => {
  const r = await send("Page.captureScreenshot", { format: "jpeg", quality: 88 });
  writeFileSync(path.join(OUT, name), Buffer.from(r.result.data, "base64"));
};
const waitFor = async (expr, ms = 60000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await ev(expr).catch(() => false)) return true; await sleep(250); }
  return false;
};
const results = [];
const check = (label, ok, detail = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  (" + detail + ")" : ""}`);

try {
  await send("Runtime.enable"); await send("Page.enable");
  await send("Page.navigate", { url: "http://127.0.0.1:8137/" });
  await waitFor("!!window.__game && !!document.querySelector('[data-action=start]')", 60000);
  await ev(`localStorage.setItem('pb-progress', '4'); true`);
  await ev("__gfx.loadDistrict(1); true"); await sleep(300);
  await ev("__game.state = 'briefing'; window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' })); true");
  await waitFor("__game.state === 'play'");
  await ev("__game.enemies = __game.enemies.filter(e => { e.remove(); return false; }); __game.player.invuln = 99999; __game.player.hp = 1e6; document.querySelectorAll('#hint, .hint').forEach(e => e.style.display = 'none'); true");
  // spawn one of each on open tiles near the player
  const spawned = await ev(`(async () => {
    const { Enemy } = await import('/src/enemies.js');
    const g = __game, p = g.player.pos, w = g.world;
    const out = [];
    const used = [];
    for (const [type, phase] of [["drone", 0], ["turret", 0], ["wraith", 1], ["riftTurret", 1]]) {
      let t = null;
      for (let k = 0; k < 40; k++) {
        const c = w.randomOpenTileNear(p.x, p.z, 2, 4, phase, type === "drone" ? "fly" : "walk");
        if (c && used.every(u => Math.hypot(u.x - c.x, u.z - c.z) > 2.5)) { t = c; break; }
      }
      if (!t) { out.push(type + ": no tile"); continue; }
      used.push(t);
      const e = new Enemy(type, t.x, t.z, w.scene);
      g.enemies.push(e);
      out.push(type + " @ " + t.x.toFixed(1) + "," + t.z.toFixed(1));
    }
    return out;
  })()`);
  console.log("spawned:", spawned.join(" | "));
  const info = await ev(`__game.enemies.map(e => ({ type: e.type, rodin: !!e.model.rodin, rotors: e.model.rotors?.length || 0, mat: e.model.rodin?.name, maps: e.model.rodin ? ['map','normalMap','emissiveMap','roughnessMap','metalnessMap'].filter(k => e.model.rodin[k]).join('+') : '' }))`);
  for (const i of info) check(`${i.type} uses the Rodin model`, i.rodin, `${i.mat} ${i.maps}${i.rotors ? ", rotors " + i.rotors : ""}`);
  check("drone has 4 rotors", info.find(i => i.type === "drone")?.rotors === 4);

  // rotors spin
  const r0 = await ev(`__game.enemies.find(e => e.type === 'drone').model.rotors.map(r => r.rotation.y)`);
  await ev("for (let i = 0; i < 6; i++) __gfx.step(1 / 60); true");   // 0.1 s of game time
  const r1 = await ev(`__game.enemies.find(e => e.type === 'drone').model.rotors.map(r => r.rotation.y)`);
  check("drone rotors spin (pairs counter-rotate)", r1.every((v, i) => Math.abs(v - r0[i]) > 0.2) && Math.sign(r1[0] - r0[0]) !== Math.sign(r1[1] - r0[1]), r1.map((v, i) => (v - r0[i]).toFixed(1)).join(" "));

  // turret aims at the player: barrel (head +Z in world) vs direction to the player
  await ev("for (let i = 0; i < 120; i++) __gfx.step(1 / 30); true");
  const shots0 = await ev("__game.stats?.shots ?? 0");
  const aim = await ev(`(() => {
    const T = __game.enemies.find(e => e.type === 'turret'), p = __game.player.pos;
    const d = T.model.head.getWorldDirection(new T.model.head.position.constructor());
    const want = Math.atan2(p.x - T.pos.x, p.z - T.pos.z), got = Math.atan2(d.x, d.z);
    let err = got - want; while (err > Math.PI) err -= 2 * Math.PI; while (err < -Math.PI) err += 2 * Math.PI;
    let err2 = T.aim - want; while (err2 > Math.PI) err2 -= 2 * Math.PI; while (err2 < -Math.PI) err2 += 2 * Math.PI;
    return { err: +err.toFixed(3), aimErr: +err2.toFixed(3), facing: +T.facing.toFixed(2), alert: T.alert };
  })()`);
  check("turret barrel points at the player", Math.abs(aim.err) < 0.25, `barrel off by ${aim.err} rad, aim off by ${aim.aimErr}, body facing ${aim.facing}, alert ${aim.alert}`);

  // hit flash + telegraph change the Rodin material
  const fl = await ev(`(() => { const e = __game.enemies.find(e => e.type === 'drone'); const c0 = e.model.rodin.color.r; e.damage(0); return new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r({ c0, c1: e.model.rodin.color.r, eye: e.model.eye.color.r })))); })()`);
  check("hit flash brightens the Rodin body", fl.c1 > fl.c0 * 1.3, `color.r ${fl.c0.toFixed(2)} -> ${fl.c1.toFixed(2)}`);

  // screenshots: pin every enemy to its own spot (it keeps animating), game camera, then close-ups
  await ev(`(() => { __game.enemies.forEach(e => { const p0 = e.home.clone(); const orig = e.update.bind(e);
    e.pos.copy(p0); e.update = (dt, g) => { orig(dt, g); e.pos.copy(p0); e.model.root.position.set(p0.x, 0, p0.z); }; }); return true; })()`);
  await ev("for (let i = 0; i < 20; i++) __gfx.step(1 / 30); true"); await sleep(600);
  await shot("game_city.jpg");
  const closeUp = async (type, file, dist = 3.2, h = 1.0) => {
    // camera just behind the player (open floor), looking at the enemy through a long lens
    await ev(`(() => { const e = __game.enemies.find(e => e.type === '${type}'); const p = __game.player.pos; const y = ${h};
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z, L = Math.hypot(dx, dz) || 1;
      window.__camOverride = { pos: [p.x - dx / L * 1.2, y + 1.6, p.z - dz / L * 1.2], look: [e.pos.x, y, e.pos.z] };
      const cam = __game.camera; cam.userData.fov0 ??= cam.fov; cam.fov = 2 * Math.atan(1.6 / (L + 1.2)) * 180 / Math.PI; cam.updateProjectionMatrix();
      __gfx.step(1 / 60); __gfx.composer.render(); return true; })()`);
    await sleep(1500);
    await shot(file);
    await ev("__game.camera.fov = __game.camera.userData.fov0; __game.camera.updateProjectionMatrix(); true");
  };
  await closeUp("drone", "close_drone.jpg", 3.0, 1.6);
  await closeUp("turret", "close_turret.jpg", 3.6, 0.8);
  // turret portraits for the devlog: guns held, camera in front of the barrels
  const portrait = async (type, file) => {
    await ev(`(() => { const e = __game.enemies.find(e => e.type === '${type}'); e.cooldown = 1e9; e.burst = 0;
      const a = e.aim, d = 3.4; const f = [Math.sin(a), Math.cos(a)], s = [Math.cos(a), -Math.sin(a)];
      window.__camOverride = { pos: [e.pos.x + f[0] * d + s[0] * 1.6, 2.3, e.pos.z + f[1] * d + s[1] * 1.6], look: [e.pos.x, 0.75, e.pos.z] };
      __gfx.step(1 / 60); __gfx.composer.render(); return true; })()`);
    await sleep(1500); await shot(file);
  };
  await portrait("turret", "portrait_turret.jpg");
  // Breach phase for the wraith and rift turret
  await ev("__game.phase = 1; for (let i = 0; i < 30; i++) __gfx.step(1 / 30); true"); await sleep(900);
  await ev("window.__camOverride = null; __gfx.step(1 / 60); __gfx.composer.render(); true"); await sleep(1500);
  await shot("game_breach.jpg");
  await closeUp("wraith", "close_wraith.jpg", 3.4, 1.2);
  await closeUp("riftTurret", "close_rift.jpg", 3.6, 0.8);
  await portrait("riftTurret", "portrait_rift.jpg");
  await ev("window.__camOverride = null; true");
} catch (e) { console.log("ERROR", e.message); }
console.log(results.join("\n"));
console.log(errors.length ? "page errors/warnings:\n" + errors.join("\n") : "No page errors.");
ws.close(); chrome.kill();
process.exit(0);
