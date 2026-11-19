// Sanity check for Portal Break district maps: widths, markers, and reachability of every
// lock, the ID card and the exit (phase shifting + security gates, Rook's remote hack where needed).
import { pathToFileURL } from "node:url";
const { LEVELS } = await import(pathToFileURL(process.argv[2]).href);
const CITY = 0, BREACH = 1;

for (const lv of LEVELS) {
  const g = lv.map, rows = g.length, cols = g[0].length, problems = [];
  g.forEach((row, r) => { if (row.length !== cols) problems.push(`row ${r} is ${row.length} wide, expected ${cols}`); });
  const find = ch => { const out = []; g.forEach((row, r) => [...row].forEach((x, c) => { if (x === ch) out.push([r, c]); })); return out; };
  const P = find("P"), X = find("X"), K = find("k"), O = find("O"), U = find("U"), C = find("+"), CT = find("K");
  if (U.length !== 1) problems.push(`${U.length} revive chambers (want 1)`);
  if (!C.length) problems.push("no revive cells");
  if (P.length !== 1) problems.push(`${P.length} player starts`);
  if (X.length !== 1) problems.push(`${X.length} exits`);
  if ((lv.pods || []).length !== O.length) problems.push(`${O.length} crew pods on the map, ${(lv.pods || []).length} in pods[]`);
  if (!!lv.card !== (K.length === 1)) problems.push(`card field ${lv.card} but ${K.length} k tiles`);

  let locksDone = 0;
  const solid = (r, c, ph) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return true;
    const ch = g[r][c];
    if ("#cTRoOgUKm$".includes(ch) || ch === "~") return true;   // m/$ count as solid: nothing may depend on Crane
    if (ch === "A") return ph === CITY;
    if (ch === "B") return ph === BREACH;
    if (ch === "b") return ph === CITY;
    if (ch === "v") return ph === BREACH;
    if ("123".includes(ch)) return Number(ch) > locksDone;
    return false;
  };
  const locks = [...find("T").map(p => [...p, CITY]), ...find("R").map(p => [...p, BREACH])];
  const hacked = new Set();
  let seen;
  const rook = lv.needs === "rook" || LEVELS.indexOf(lv) >= 3; // Rook joins in District 03
  for (let pass = 0; pass < 10; pass++) {
    seen = new Uint8Array(rows * cols * 2);
    const [sr, sc] = P[0], q = [[sr, sc, CITY]];
    seen[(sr * cols + sc) * 2] = 1;
    while (q.length) {
      const [r, c, ph] = q.pop();
      const other = 1 - ph;
      const next = [[r + 1, c, ph], [r - 1, c, ph], [r, c + 1, ph], [r, c - 1, ph], [r, c, other]];
      for (const [nr, nc, np] of next) {
        if (solid(nr, nc, np)) continue;
        const k = (nr * cols + nc) * 2 + np;
        if (!seen[k]) { seen[k] = 1; q.push([nr, nc, np]); }
      }
    }
    const at = (r, c, ph) => r >= 0 && c >= 0 && r < rows && c < cols && seen[(r * cols + c) * 2 + ph];
    for (const [r, c, ph] of locks) {
      const key = `${r},${c}`;
      if (hacked.has(key)) continue;
      const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => at(r + dr, c + dc, ph));
      let remote = false;
      if (!adj && rook && ph === CITY)
        for (let rr = r - 8; rr <= r + 8 && !remote; rr++) for (let cc = c - 8; cc <= c + 8; cc++)
          if (Math.hypot(rr - r, cc - c) <= 8 && (at(rr, cc, CITY) || at(rr, cc, BREACH))) { remote = true; break; }
      if (adj || remote) hacked.add(key);
    }
    if (hacked.size === locksDone) break;
    locksDone = hacked.size;
  }
  const reach = ([r, c]) => seen[(r * cols + c) * 2] || seen[(r * cols + c) * 2 + 1];
  if (hacked.size !== locks.length) problems.push(`only ${hacked.size}/${locks.length} locks reachable`);
  if (X[0] && !reach(X[0])) problems.push("exit unreachable");
  if (K[0] && !reach(K[0])) problems.push("ID card unreachable");
  for (const [r, c] of O) {
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => reach([r + dr, c + dc]));
    if (!nb) problems.push(`pod at ${r},${c} can't be walked up to`);
  }
  for (const [r, c] of U) {
    const south = r + 1 < rows && !"#~bvU".includes(g[r + 1][c]);
    if (!south) problems.push(`chamber at ${r},${c} has no floor south of it (camera can't see its face)`);
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => reach([r + dr, c + dc]));
    if (!nb) problems.push(`chamber at ${r},${c} can't be walked up to`);
  }
  // crew terminal: every district with an ID card gets exactly one, facing floor you can reach
  if (lv.card && CT.length !== 1) problems.push(`card but ${CT.length} crew terminals (want 1)`);
  if (!lv.card && CT.length) problems.push("crew terminal without a card");
  for (const [r, c] of CT) {
    const south = r + 1 < rows && !"#~bvUK".includes(g[r + 1][c]);
    if (!south) problems.push(`crew terminal at ${r},${c} has no floor south of it`);
    if (!reach([r + 1, c])) problems.push(`crew terminal at ${r},${c} can't be walked up to`);
  }
  for (const p of C) if (!reach(p)) problems.push(`revive cell at ${p.join(",")} unreachable`);
  // throwable crates: Crane has to be able to walk up to each one
  const M = find("m"), S = find("$");
  for (const [r, c] of [...M, ...S]) {
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => reach([r + dr, c + dc]));
    if (!nb) problems.push(`crate at ${r},${c} can't be walked up to`);
  }
  if ((lv.loot || []).length > S.length) problems.push(`loot lists ${lv.loot.length} items but only ${S.length} supply crates`);
  console.log(`${lv.id} ${lv.name.padEnd(32)} ${rows}x${cols}  locks ${locks.length}  pods ${O.length}  card ${K.length ? K[0].join(",") : "-"}  needs ${lv.needs || "-"}  chamber ${U.map(p => p.join(",")).join(" ")}  term ${CT.map(p => p.join(",")).join(" ") || "-"}  cells ${C.length}  crates ${find("m").length}m ${find("$").length}$ ${(lv.loot || []).join("/") || "-"}  ${problems.length ? "PROBLEMS: " + problems.join("; ") : "OK"}`);
}
