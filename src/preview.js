// ============================================================
//  CREW PREVIEW — the turning 3D model on the crew select screen, wearing the chosen skin.
//  It has its own small WebGL renderer, made when the screen opens and freed when it closes
//  (nothing of it is left running during play).
// ============================================================
import * as THREE from "three";
import { instance, hasModel } from "./models.js";

const WHITE = new THREE.Color(1, 1, 1);
let R = null;

export function openPreview(canvas) {
  closePreview();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x8a98ff, 0x140a1c, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.6);
  key.position.set(2.5, 4, 3.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x55e6ff, 2.4);
  rim.position.set(-3, 2.5, -3);
  scene.add(rim);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  R = { renderer, scene, camera, canvas, rim, models: {}, cur: null, t: 0, raf: 0, last: performance.now(), size: "" };
  const loop = now => {
    if (!R) return;
    R.raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - R.last) / 1000);
    R.last = now;
    R.t += dt;
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 360, key = `${w}x${h}`;
    if (key !== R.size) { R.size = key; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (R.cur) R.cur.root.rotation.y = 0.45 + Math.sin(R.t * 0.5) * 0.9 + R.t * 0.25;
    renderer.render(scene, camera);
  };
  R.raf = requestAnimationFrame(loop);
}

// id: crew member; glow: THREE.Color of the glow lines; body: armour tint (null = as textured); bulk: scale;
// model: a skin's own model (crew.js modelOf), falling back to the crew member's usual one if not loaded
export function setPreview(id, glow, body, bulk = 1, model = id) {
  if (!R) return;
  if (R.cur) R.cur.root.visible = false;
  const name = hasModel(model) ? model : hasModel(id) ? id : hasModel("player") ? "player" : null;
  let m = name && R.models[name];
  if (!m) {
    const inst = name && instance(name);
    if (!inst) { R.cur = null; return; }
    inst.root.traverse(o => { if (o.isSkinnedMesh) o.frustumCulled = false; });
    m = { root: inst.root, mat: inst.byRole.Lit?.find(x => x.emissiveMap) || null, trims: [...(inst.byRole.Trim || []), ...(inst.byRole.Core || [])] };
    R.scene.add(inst.root);
    R.models[name] = m;
    // build its shaders in the background first and show it once they're ready: drawing it straight
    // away compiled them on the spot and froze the menu for a moment on each new crew member
    m.ready = false;
    const rr = R;
    const ready = () => { m.ready = true; if (R === rr && R.cur === m) m.root.visible = true; };
    inst.root.visible = false;
    try { if (R.renderer.compileAsync) R.renderer.compileAsync(R.scene, R.camera).then(ready, ready); else ready(); }
    catch (e) { ready(); }
  }
  m.root.visible = m.ready !== false;
  m.root.scale.setScalar(bulk);
  if (m.mat) {
    m.mat.emissiveIntensity = 1.5;
    m.mat.emissive.copy(glow).multiplyScalar(1.3);
    m.mat.color.copy(body || WHITE);
  }
  for (const t of m.trims) t.color.copy(glow).multiplyScalar(2.2);
  R.rim.color.copy(glow);
  const h = 1.85 * bulk;
  R.camera.position.set(0, h * 0.6, 4.6 * Math.max(1, bulk));
  R.camera.lookAt(0, h * 0.5, 0);
  R.cur = m;
}

// show nothing (a crew member who's still asleep)
export function clearPreview() {
  if (R?.cur) { R.cur.root.visible = false; R.cur = null; }
}

export function closePreview() {
  if (!R) return;
  cancelAnimationFrame(R.raf);
  R.renderer.dispose();
  R.renderer.forceContextLoss();
  R = null;
}
