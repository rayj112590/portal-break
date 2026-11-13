// ============================================================
//  AUDIO — everything synthesized with WebAudio.
//  Music is a small step sequencer that re-voices in the Breach.
// ============================================================

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.breach = 0;
    this.step = 0;
    this.nextTime = 0;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.55; this.master.connect(ctx.destination);
    this.sfx = ctx.createGain(); this.sfx.gain.value = 0.8; this.sfx.connect(this.master);
    this.music = ctx.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master);

    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = "lowpass"; this.musicFilter.frequency.value = 2400; this.musicFilter.Q.value = 4;
    this.musicFilter.connect(this.music);

    // noise buffer reused by many sounds
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    // rain bed
    const rain = ctx.createBufferSource(); rain.buffer = this.noise; rain.loop = true;
    const rf = ctx.createBiquadFilter(); rf.type = "highpass"; rf.frequency.value = 2500;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0.05;
    rain.connect(rf).connect(this.rainGain).connect(this.master);
    rain.start();

    // breach drone bed
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    const df = ctx.createBiquadFilter(); df.type = "lowpass"; df.frequency.value = 300;
    [55, 55.7, 82.4].forEach(f => {
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      o.connect(df); o.start();
    });
    df.connect(this.droneGain).connect(this.master);

    this.nextTime = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  // audio tap for the F9 clip recorder
  streamDest() {
    if (!this.ctx) return null;
    if (!this.dest) {
      this.dest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.dest);
    }
    return this.dest;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  setBreach(b) {
    this.breach = b;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.setTargetAtTime(b > 0.5 ? 700 : 2400, t, 0.15);
    this.rainGain.gain.setTargetAtTime(b > 0.5 ? 0.0 : 0.05, t, 0.2);
    this.droneGain.gain.setTargetAtTime(b > 0.5 ? 0.06 : 0, t, 0.3);
  }

  // ---------- music ----------
  schedule() {
    const ctx = this.ctx;
    if (!ctx) return;
    const bpm = 100, sixteenth = 60 / bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % 64;
    }
  }

  playStep(s, t) {
    const br = this.breach > 0.5;
    const bar = Math.floor(s / 16);
    const roots = br ? [41.2, 38.9, 36.7, 38.9] : [55, 43.65, 49, 41.2]; // A F G E  /  dark variant
    const root = roots[bar];
    const i = s % 16;
    // kick
    if (i % 4 === 0) this.kick(t);
    // hats
    if (i % 2 === 1) this.hat(t, i % 4 === 3 ? 0.05 : 0.025);
    // snare
    if (i === 4 || i === 12) this.snare(t);
    // bass: rolling 8ths
    if (i % 2 === 0) this.bass(t, root * (i % 8 === 6 ? 2 : 1), br);
    // arp
    const arp = br ? [1, 1.189, 1.414, 1.189] : [2, 2.378, 3, 3.564];
    if (!br || i % 2 === 0) this.arp(t, root * 2 * arp[(i / 2 | 0) % 4], br);
  }

  kick(t) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.32);
  }
  hat(t, v) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 8000;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f).connect(g).connect(this.music); n.start(t, Math.random()); n.stop(t + 0.06);
  }
  snare(t) {
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1800;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.28, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(f).connect(g).connect(this.music); n.start(t, Math.random()); n.stop(t + 0.2);
  }
  bass(t, f, br) {
    const o = this.ctx.createOscillator(); o.type = br ? "square" : "sawtooth"; o.frequency.value = f;
    const fl = this.ctx.createBiquadFilter(); fl.type = "lowpass"; fl.Q.value = 6;
    fl.frequency.setValueAtTime(br ? 500 : 900, t); fl.frequency.exponentialRampToValueAtTime(120, t + 0.2);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    o.connect(fl).connect(g).connect(this.musicFilter); o.start(t); o.stop(t + 0.26);
  }
  arp(t, f, br) {
    const o = this.ctx.createOscillator(); o.type = br ? "sawtooth" : "triangle"; o.frequency.value = f;
    if (br) o.detune.value = -30 + Math.random() * 60;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(br ? 0.05 : 0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.musicFilter); o.start(t); o.stop(t + 0.14);
  }

  // ---------- sfx ----------
  tone(type, f0, f1, dur, vol, dest = this.sfx) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  }
  burst(freq, q, dur, vol, type = "bandpass", sweepTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource(); n.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(t, Math.random() * 1.5); n.stop(t + dur + 0.02);
  }

  shoot() { this.tone("square", 900 + Math.random() * 80, 180, 0.08, 0.12); this.burst(3000, 1, 0.05, 0.12); }
  enemyShoot() { this.tone("sawtooth", 420, 90, 0.18, 0.08); }
  hit() { this.burst(2400, 2, 0.06, 0.2); this.tone("square", 300, 120, 0.05, 0.06); }
  hurt() { this.tone("sawtooth", 200, 50, 0.25, 0.25); this.burst(800, 1, 0.2, 0.3, "lowpass"); }
  explode() { this.burst(1200, 0.7, 0.6, 0.6, "lowpass", 60); this.tone("sine", 120, 30, 0.5, 0.5); }
  dash() { this.burst(600, 1.5, 0.18, 0.25, "bandpass", 2500); }
  lunge() { this.tone("sawtooth", 160, 600, 0.22, 0.08); }
  pickup() { this.tone("sine", 700, 1400, 0.12, 0.15); }
  denied() { this.tone("square", 140, 110, 0.18, 0.15); }
  hackTick() { this.tone("sine", 1200 + Math.random() * 400, 1200, 0.03, 0.04); }
  hackDone() {
    [660, 880, 1320].forEach((f, i) => setTimeout(() => this.tone("triangle", f, f, 0.16, 0.18), i * 80));
  }
  portalOpen() {
    [440, 554, 659, 880].forEach((f, i) => setTimeout(() => this.tone("sawtooth", f, f * 1.01, 0.4, 0.1), i * 110));
  }
  shift(toBreach) {
    this.burst(toBreach ? 4000 : 300, 2, 0.45, 0.45, "bandpass", toBreach ? 200 : 4000);
    this.tone("sine", toBreach ? 220 : 55, toBreach ? 40 : 330, 0.5, 0.45);
  }
}
