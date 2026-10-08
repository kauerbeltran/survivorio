"use strict";

/* Small math / helper library shared by the whole game. */

const TAU = Math.PI * 2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
const sq = (x) => x * x;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

function weightedPick(items, weightFn) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightFn(it));
  if (total <= 0) return items[(Math.random() * items.length) | 0];
  let r = Math.random() * total;
  for (const it of items) {
    r -= Math.max(0, weightFn(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ":" + (r < 10 ? "0" : "") + r;
}

/* Stable per-cell pseudo-random value in [0,1) - used to scatter background
   detail deterministically without storing anything. */
function hash2(ix, iy) {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/* Uniform spatial hash — used for enemy separation and bullet hits. */
class Grid {
  constructor(cell) {
    this.cell = cell;
    this.map = new Map();
  }
  clear() { this.map.clear(); }
  bucket(cx, cy) { return this.map.get(this._key(cx, cy)); }
  _key(cx, cy) { return (cx + 32768) * 65536 + (cy + 32768); }
  insert(e) {
    const cx = Math.floor(e.x / this.cell), cy = Math.floor(e.y / this.cell);
    const k = this._key(cx, cy);
    let a = this.map.get(k);
    if (!a) { a = []; this.map.set(k, a); }
    a.push(e);
  }
  query(x, y, r, out) {
    out.length = 0;
    const c = this.cell;
    const x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
    const y0 = Math.floor((y - r) / c), y1 = Math.floor((y + r) / c);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const a = this.map.get(this._key(cx, cy));
        if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
      }
    }
    return out;
  }
}

/* Offscreen pooled array: fixed size, no allocation during play. */
class Pool {
  constructor(size, factory) {
    this.items = new Array(size);
    for (let i = 0; i < size; i++) this.items[i] = factory();
    this.size = size;
    this.cursor = 0;
  }
  spawn() {
    const n = this.size;
    for (let i = 0; i < n; i++) {
      const idx = (this.cursor + i) % n;
      const it = this.items[idx];
      if (!it.alive) { this.cursor = (idx + 1) % n; return it; }
    }
    const it = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % n;
    return it;
  }
  forEach(fn) {
    const a = this.items;
    for (let i = 0; i < a.length; i++) if (a[i].alive) fn(a[i], i);
  }
  clear() { for (const it of this.items) it.alive = false; }
}

/* Save / load with graceful fallback (private mode, file://, etc). */
const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
  }
};
