"use strict";

/* Tiny WebAudio synth — no asset files, everything is generated. */

const Sound = {
  ctx: null,
  master: null,
  sfxBus: null,
  musicBus: null,
  ready: false,
  sfxOn: true,
  musicOn: false,
  _last: Object.create(null),
  _noise: null,

  init() {
    if (this.ready) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) { return; }

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxOn ? 0.5 : 0;
    this.sfxBus.connect(this.master);

    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(this.master);

    this.ready = true;
    this._buildNoise();
    this._musicTimer = setInterval(() => this._musicTick(), 90);
  },

  resume() {
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  },

  setSfx(on) {
    this.sfxOn = on;
    if (this.sfxBus) this.sfxBus.gain.value = on ? 0.5 : 0;
  },

  setMusic(on) {
    this.musicOn = on;
    if (this.musicBus) this.musicBus.gain.value = on ? 0.34 : 0;
  },

  _buildNoise() {
    const len = this.ctx.sampleRate * 0.4;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this._noise = buf;
  },

  /* Voice: quick pitch-swept oscillator. */
  _tone(freq, freq2, dur, type, vol, dest) {
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || "square";
    o.frequency.setValueAtTime(Math.max(30, freq), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(30, freq2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  },

  _noiseBurst(dur, vol, filterFreq, dest) {
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = filterFreq || 900;
    f.Q.value = 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || this.sfxBus);
    s.start(t); s.stop(t + dur + 0.02);
  },

  play(name, opt) {
    if (!this.ready || !this.sfxOn) return;
    const o = opt || {};
    const now = performance.now();
    // Throttle: at most N of the same sound every 60ms.
    const gap = o.gap == null ? 45 : o.gap;
    if (now - (this._last[name] || 0) < gap) return;
    this._last[name] = now;

    const p = o.pitch || 1;
    const v = (o.vol == null ? 1 : o.vol);
    switch (name) {
      case "shoot": this._tone(760 * p, 380 * p, 0.07, "square", 0.10 * v); break;
      case "hit": this._tone(340 * p, 200 * p, 0.05, "triangle", 0.09 * v); break;
      case "crit": this._tone(900 * p, 500 * p, 0.08, "sawtooth", 0.10 * v); break;
      case "kill": this._noiseBurst(0.14, 0.10 * v, 700 * p); break;
      case "hurt": this._tone(190 * p, 70 * p, 0.22, "sawtooth", 0.20 * v); break;
      case "gem": this._tone(1500 * p, 2100 * p, 0.05, "sine", 0.05 * v); break;
      case "level": this._tone(420, 880, 0.5, "triangle", 0.16 * v); this._tone(630, 1320, 0.55, "sine", 0.10 * v); break;
      case "boss": this._tone(120, 45, 0.9, "sawtooth", 0.22 * v); this._noiseBurst(0.7, 0.10 * v, 240); break;
      case "zap": this._noiseBurst(0.22, 0.14 * v, 2600); this._tone(1500, 300, 0.2, "sawtooth", 0.07 * v); break;
      case "nova": this._noiseBurst(0.35, 0.16 * v, 400); this._tone(260, 70, 0.35, "sine", 0.12 * v); break;
      case "coin": this._tone(1100, 1700, 0.09, "square", 0.07 * v); break;
      case "chest": this._tone(700, 1400, 0.16, "triangle", 0.10 * v); break;
      case "ui": this._tone(520, 700, 0.06, "square", 0.06 * v); break;
      case "over": this._tone(320, 60, 1.1, "sawtooth", 0.2 * v); break;
      case "boom": this._noiseBurst(0.3, 0.14 * v, 500); break;
    }
  },

  /* ---- Ambient pulse loop (bass + arpeggio, key shifts over time) ---- */
  _musicTick() {
    if (!this.ready || !this.musicOn || this.ctx.state !== "running") return;
    const t = this.ctx.currentTime;
    if (this._nextNote === undefined) this._nextNote = t + 0.1;
    const step = 0.24;
    while (this._nextNote < t + 0.25) {
      const at = this._nextNote - t;
      const scale = [0, 3, 5, 7, 10];
      const root = 55; // A1
      const bar = Math.floor(this._musicStep / 8) % 4;
      const roots = [55, 55, 62, 49];
      const r = roots[bar];

      // bass pulse
      this._toneAt(r, r, step * 0.9, "sine", 0.5, this.musicBus, at);
      // arp note
      if (this._musicStep % 2 === 0) {
        const semi = scale[(this._musicStep / 2 | 0) % scale.length];
        const f = r * 4 * Math.pow(2, semi / 12);
        this._toneAt(f, f * 1.01, step * 1.2, "triangle", 0.14, this.musicBus, at);
      }
      // hat
      if (this._musicStep % 2 === 1) this._noiseAt(0.05, 0.05, 6000, at);

      this._musicStep = (this._musicStep || 0) + 1;
      this._nextNote += step;
    }
    if (this._nextNote < t) this._nextNote = t + 0.1;
  },

  _toneAt(freq, freq2, dur, type, vol, dest, delay) {
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + 0.02);
  },

  _noiseAt(dur, vol, freq, delay) {
    const t = this.ctx.currentTime + (delay || 0);
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass"; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.musicBus);
    s.start(t); s.stop(t + dur + 0.02);
  }
};
