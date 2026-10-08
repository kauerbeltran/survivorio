"use strict";

/* =============================================================
   HORDEFALL — canvas horde survival
   ============================================================= */

const cv = document.getElementById("game");
const ctx = cv.getContext("2d", { alpha: false });
const mm = document.getElementById("minimap");
const mctx = mm.getContext("2d");
const el = (id) => document.getElementById(id);

/* ---------------- canvas / camera ---------------- */
let vw = 0, vh = 0, dpr = 1;
const cam = { x: 0, y: 0, sx: 0, sy: 0, shake: 0, enabled: true };

/* quarter-resolution bloom buffer + cached vignette gradient */
let bloomCv = null, bctx = null, bw = 0, bh = 0, vigGrad = null, bloomFilterOk = false;

function ensureBuffers() {
  bw = Math.max(1, Math.ceil(vw * 0.25));
  bh = Math.max(1, Math.ceil(vh * 0.25));
  if (!bloomCv) {
    bloomCv = document.createElement("canvas");
    bctx = bloomCv.getContext("2d");
  }
  bloomCv.width = bw;
  bloomCv.height = bh;

  // feature-detect ctx.filter once; without it we fall back to a weaker bloom
  try {
    bctx.filter = "contrast(2)";
    bloomFilterOk = bctx.filter === "contrast(2)";
    bctx.filter = "none";
  } catch (e) { bloomFilterOk = false; }

  const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.32, vw / 2, vh / 2, Math.max(vw, vh) * 0.76);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.65, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0.68)");
  vigGrad = g;
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  vw = window.innerWidth;
  vh = window.innerHeight;
  cv.width = Math.floor(vw * dpr);
  cv.height = Math.floor(vh * dpr);
  cv.style.width = vw + "px";
  cv.style.height = vh + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ensureBuffers();
}
window.addEventListener("resize", resize);
resize();

/* ---------------- input ---------------- */
const keys = Object.create(null);
const joy = { active: false, id: -1, cx: 0, cy: 0, dx: 0, dy: 0 };

addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
  keys[k] = true;

  if (k === "escape" || k === "p") {
    if (state === "play") pauseGame();
    else if (state === "pause") resumeGame();
  }
  if (state === "levelup" && (k === "1" || k === "2" || k === "3")) chooseCard(+k - 1);
  if (k === "q" && state === "play") { if (!triggerAbility()) Sound.play("hit", { vol: 0.25 }); }
  if (k === "c" && (state === "play" || state === "pause")) openSheet();
  if (k === "e" && state === "play" && Armory.merchant && Armory.merchant.near) openTrade();
  if (k === "escape" && state === "trade") closeTrade();
  if (k === "escape" && state === "sheet") closeSheet();
  if (k === "enter" || k === " ") {
    if (state === "menu") startGame();
    else if (state === "over") startGame();
  }
  if (k === "m") { el("soundBtn").click(); }
});
addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
addEventListener("blur", () => { for (const k in keys) keys[k] = false; if (state === "play") pauseGame(); });

/* unlock WebAudio on the first gesture anywhere */
addEventListener("pointerdown", () => { Sound.init(); Sound.resume(); }, { once: true });

/* touch joystick */
const joyEl = el("joystick"), stickEl = el("stick");
if (matchMedia("(pointer: coarse)").matches) document.body.classList.add("touch");

joyEl.addEventListener("pointerdown", (e) => {
  joy.active = true; joy.id = e.pointerId;
  const r = joyEl.getBoundingClientRect();
  joy.cx = r.left + r.width / 2; joy.cy = r.top + r.height / 2;
  moveJoy(e);
  joyEl.setPointerCapture(e.pointerId);
  e.preventDefault();
});
joyEl.addEventListener("pointermove", (e) => { if (joy.active && e.pointerId === joy.id) { moveJoy(e); e.preventDefault(); } });
const joyEnd = (e) => {
  if (e.pointerId !== joy.id) return;
  joy.active = false; joy.dx = 0; joy.dy = 0; joy.id = -1;
  stickEl.style.transform = "";
};
joyEl.addEventListener("pointerup", joyEnd);
joyEl.addEventListener("pointercancel", joyEnd);
function moveJoy(e) {
  const dx = e.clientX - joy.cx, dy = e.clientY - joy.cy;
  const max = 46, d = Math.hypot(dx, dy) || 1;
  const k = Math.min(1, d / max);
  joy.dx = (dx / d) * k; joy.dy = (dy / d) * k;
  stickEl.style.transform = `translate(${joy.dx * max}px, ${joy.dy * max}px)`;
}

/* ---------------- fx pools ---------------- */
const SHAPE_DOT = 0, SHAPE_SQUARE = 1, SHAPE_LINE = 2;

const particles = new Pool(900, () => ({
  alive: false, x: 0, y: 0, vx: 0, vy: 0, t: 0, max: 1, size: 3, color: "#fff",
  drag: 0.9, shape: 0, rot: 0, spin: 0, glow: false
}));
const texts = new Pool(110, () => ({
  alive: false, x: 0, y: 0, text: "", t: 0, max: 1, color: "#fff", size: 14, vy: -52, crit: false, pop: 0
}));

/* Ground splats left behind by kills, faded out over time. */
const MAX_DECALS = 150;
const decals = new Array(MAX_DECALS);
let decalCur = 0;
function addDecal(x, y, r, color) {
  let d = decals[decalCur];
  if (!d) d = decals[decalCur] = { x: 0, y: 0, r: 0, c: "#fff", t: 0, max: 1, seed: 0 };
  decalCur = (decalCur + 1) % MAX_DECALS;
  d.x = x; d.y = y; d.r = r * rand(0.7, 1.25); d.c = color;
  d.t = 0; d.max = rand(18, 30); d.seed = Math.random() * TAU;
}

function fx(x, y, vx, vy, life, size, color, shape, drag, glow) {
  const p = particles.spawn();
  p.alive = true; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.t = 0; p.max = life;
  p.size = size; p.color = color; p.shape = shape || 0;
  p.drag = drag == null ? 0.9 : drag;
  p.rot = Math.random() * TAU; p.spin = rand(-8, 8); p.glow = !!glow;
  return p;
}
function burst(x, y, color, n, speed, size, life) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), s = rand(speed * 0.25, speed);
    fx(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(life * 0.6, life), rand(size * 0.5, size), color, SHAPE_DOT, 0.86);
  }
}
function dmgText(x, y, amount, crit, color) {
  if (!G.opts.dmg) return;
  if (amount < 3 && !crit) return; // skip chip damage so the screen stays readable
  const t = texts.spawn();
  t.alive = true; t.x = x + rand(-6, 6); t.y = y - 6; t.text = Math.round(amount);
  t.t = 0; t.max = crit ? 0.8 : 0.6; t.crit = !!crit;
  t.size = crit ? 22 : 14; t.color = color || (crit ? "#ffe066" : "#ffffff");
  t.vy = crit ? -78 : -52;
  t.pop = crit ? 1 : 0;
  if (crit) t.x += rand(-16, 16); // crits scatter so they read as special
}

function healText(x, y, amount) {
  const t = texts.spawn();
  t.alive = true; t.x = x + rand(-8, 8); t.y = y - 14; t.text = "+" + Math.round(amount);
  t.t = 0; t.max = 0.85; t.crit = false; t.size = 16; t.color = "#6dffa8";
  t.vy = -46; t.pop = 1;
}

/* ---------------- glow sprite cache ---------------- */
const glowCache = new Map();
/* Pre-rendered soft radial sprite, tinted per color and cached. */
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.32, "rgba(255,255,255,0.5)");
  grd.addColorStop(0.7, "rgba(255,255,255,0.12)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, 64, 64);
  glowCache.set(color, c);
  return c;
}

/* ---------------- game state ---------------- */
let state = "menu"; // menu | play | levelup | pause | over
let G = null;
let xpGhost = 1; // trailing XP bar segment, declared here (resetGame runs early)

const CELL = 52;
const grid = new Grid(CELL);
const scratch = [];
const MAX_ENEMIES = 320;

const ENEMY = {
  slime: { hp: 14,  spd: 74,  dmg: 9,  r: 14, xp: 3,  c: "#5fd97a", d: "#2c8a4b", unlock: 0,   ev: 1 },
  bat:   { hp: 9,   spd: 128, dmg: 6,  r: 11, xp: 3,  c: "#c98bff", d: "#6d3cb0", unlock: 20,  ev: 1 },
  brute: { hp: 58,  spd: 58,  dmg: 16, r: 21, xp: 10, c: "#ff8a5c", d: "#a8451f", unlock: 60,  ev: 1 },
  wisp:  { hp: 24,  spd: 88,  dmg: 10, r: 13, xp: 8,  c: "#6ad7ff", d: "#237a9e", unlock: 105, ev: 1, shoot: 3.0 },
  boss:  { hp: 720, spd: 66,  dmg: 28, r: 38, xp: 150, c: "#ff5d6c", d: "#8c1c28", unlock: 75, ev: 2, boss: 1, shoot: 3.4 },
};

function diff(t) {
  const D = DIFFS[Meta.data.difficulty] || DIFFS.normal;
  // After ~6.5 minutes the swarm escalates hard on every difficulty. Without
  // this a good build eventually outscales the spawn curve and the easiest
  // mode becomes an unlimited coin farm. Steep on purpose: builds scale
  // superlinearly, so a gentle ramp never catches up.
  const late = Math.pow(1 + Math.max(0, t - 390) / 300, 1.35);
  return {
    hp: (1 + Math.pow(t / 70, 1.15) * 0.28) * D.hp * late,
    dmg: (1 + t / 520) * D.dmg,
    interval: clamp(0.88 - t * 0.0019, 0.14, 0.88) / D.rate,
    // burst swings with difficulty but gently, and the swing grows over time
    // so easy modes actually thin out late while hard modes thicken
    burst: Math.max(1, Math.round(1 + Math.floor(t / 100) * (1 + (D.rate - 1) * 1.6))),
    cap: Math.min(MAX_ENEMIES - 20, (40 + t * 0.75) * D.rate),
  };
}

function newPlayer() {
  return {
    x: 0, y: 0, r: 16, hp: 100, maxHp: 100,
    level: 1, xp: 0, xpNeed: xpNeedFor(1), pendingLevels: 0, rerolls: 0,
    face: -Math.PI / 2, look: -Math.PI / 2, slash: 0, flash: 0,
    atkTimer: 0, boltTimer: 2, novaTimer: 5, droneAng: 0,
    trail: [], squash: 0,
    invuln: 0, hurtCd: 0, walk: 0, dead: false, phoenix: false, phoenixUsed: false,
    upg: {},
    /* stats */
    dmgPct: 0, atkPct: 0, spdPct: 0, regen: 0, armor: 0, dr: 0,
    crit: 0.05, critDmg: 1.6, projCount: 1, projSize: 0, pierce: 0,
    magnet: 0, xpGain: 0, goldGain: 0, chestChance: 0.08, lifesteal: 0,
    freezeChance: 0, boomDmg: 0, knock: 40, thorns: 0,
    droneDmg: 0, boltDmgPct: 0, novaDmgPct: 0, novaSize: 0,
  };
}

function resetGame() {
  const p = newPlayer();
  G = {
    t: 0, kills: 0, gold: 0, goldTotal: 0, dps: 0, dpsTimer: 0, dpsDamage: 0,
    revivesUsed: 0,
    reviveUsed: false, best: Store.get("survivor_best", { time: 0, level: 1 }),
    hitStop: 0, goldSpent: 0, banked: 0, gemsTaken: 0,
    bloomAuto: true, // stops once the player picks the setting themselves
    opts: { sfx: true, music: false, shake: true, dmg: true, bloom: true },
    player: p,
    enemies: [], gems: [], chests: [], bullets: [], ebullets: [], bolts: [], novas: [], rings: [],
    spawnT: 0, bossT: 0, minute: 0, rerolls: 0,
  };
  cam.x = p.x; cam.y = p.y; cam.shake = 0;
  xpGhost = 1;
  Armory.reset();
  particles.clear(); texts.clear();
  for (let i = 0; i < MAX_DECALS; i++) if (decals[i]) decals[i].t = 999;
  updateBestLabel();
}
resetGame();

/* ---------------- derived stats ---------------- */
function P() { return G.player; }
function moveSpeed() { return 215 * (1 + P().spdPct); }
function pickupR() { return 88 * (1 + P().magnet); }
/* Level costs grow superlinearly on purpose: player power compounds with every
   upgrade and weapon, so a flat-ish curve let runs run away to level 80. */
function xpNeedFor(lv) { return Math.floor(10 + 5 * lv + 0.8 * Math.pow(lv, 1.7) + 0.02 * Math.pow(lv, 3)); }
function droneCount() { return P().upg.drone || 0; }
function boltTargets() { const l = P().upg.bolt || 0; return l >= 4 ? 3 : l >= 2 ? 2 : 1; }

/* ---------------- spawning ---------------- */
function spawnPoint() {
  const p = P();
  const a = rand(0, TAU);
  const d = Math.max(vw, vh) * 0.62 + rand(30, 150);
  return { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
}

function enemyTypeFor(t) {
  const r = Math.random();
  const has = (k) => t >= ENEMY[k].unlock;
  if (has("wisp") && r < 0.16) return "wisp";
  if (has("brute") && r < 0.30) return "brute";
  if (has("bat") && r < 0.56) return "bat";
  return "slime";
}

function spawnEnemy(type, opts) {
  if (G.enemies.length >= MAX_ENEMIES) return null;
  const o = opts || {};
  const d = ENEMY[type];
  const t = G.t;
  const diff_ = diff(t);
  const pt = o.at ? o.at : spawnPoint();
  const elite = o.elite != null ? o.elite : type !== "boss" && chance(0.05);
  const hpM = diff_.hp * (elite ? 2.2 : 1);
  const sizeM = elite ? 1.22 : 1;
  const e = {
    x: pt.x, y: pt.y, vx: 0, vy: 0,
    r: d.r * sizeM, hp: d.hp * hpM, maxHp: d.hp * hpM,
    spd: d.spd * rand(0.92, 1.08), dmg: d.dmg * diff_.dmg,
    xp: d.xp * (elite ? 5 : 1), type, c: d.c, dc: d.d,
    ev: d.ev, boss: !!d.boss, elite, shoot: d.shoot || 0, shootT: rand(0.5, 2.5),
    flash: 0, hitCd: 0, slowT: 0, look: 0, wob: rand(0, TAU), born: G.t, dead: false,
    cdSlow: 0, droneCd: 0, orbitHit: 0, bleed: 0, bleedDps: 0,
  };
  if (elite && type !== "boss") { e.c = "#ffd25c"; e.dc = "#a3700f"; }
  G.enemies.push(e);
  return e;
}

function spawnDirector(dt) {
  const t = G.t;
  const cfg = diff(t);
  G.spawnT -= dt;
  if (G.spawnT <= 0) {
    G.spawnT = cfg.interval;
    const n = cfg.burst + (Math.random() < 0.35 ? 1 : 0);
    for (let i = 0; i < n && G.enemies.length < cfg.cap; i++) {
      spawnEnemy(enemyTypeFor(t));
    }
  }
  // boss
  if (t >= ENEMY.boss.unlock) {
    G.bossT -= dt;
    if (G.bossT <= 0) {
      G.bossT = 75;
      const e = spawnEnemy("boss");
      if (e) {
        cam.shake = Math.max(cam.shake, 12);
        burst(e.x, e.y, "#ff5d6c", 26, 220, 6, 0.7);
        showBanner("BOSS INCOMING", "huge monster spawned");
        Sound.play("boss");
      }
    }
  }
  // minute banners
  const m = Math.floor(t / 60);
  if (m > G.minute) {
    G.minute = m;
    if (m % 5 === 0) showBanner(`MINUTE ${m}`, "the swarm grows stronger");
  }
}

/* ---------------- combat ---------------- */
function nearestEnemy(x, y, maxD) {
  let best = null, bd = maxD ? maxD * maxD : Infinity;
  for (const e of G.enemies) {
    const dx = e.x - x, dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function damageEnemy(e, amount, opt) {
  if (e.hp <= 0) return 0;
  const o = opt || {};
  const critChance = o.critChance == null ? P().crit : o.critChance;
  const crit = Math.random() < critChance;
  let dmg = amount;
  if (crit) dmg *= (1 + P().critDmg);
  dmg = Math.max(1, dmg);
  e.hp -= dmg;
  e.flash = 0.09;
  G.dpsDamage += dmg;
  Run.event("dmg", dmg);

  if (o.kx || o.ky) {
    const k = (P().knock + (o.knock || 0)) / (e.r * 9 + 40);
    e.x += (o.kx || 0) * k; e.y += (o.ky || 0) * k;
  }
  if (P().freezeChance > 0 && Math.random() < P().freezeChance) e.slowT = 1.3;

  dmgText(e.x, e.y - e.r * 0.5, dmg, crit, o.color);
  Sound.play(crit ? "crit" : "hit", { pitch: rand(0.9, 1.15), gap: 55, vol: 0.7 });
  if (crit) G.hitStop = Math.max(G.hitStop, 0.035);
  if (e.hp <= 0) killEnemy(e);
  return dmg;
}

function killEnemy(e) {
  e.hp = 0;
  const p = P();
  G.kills++;
  Run.event("kills", 1);
  if (e.boss) Run.event("bosses", 1);
  if (e.elite) Run.event("elites", 1);
  if (p.lifesteal > 0) {
    p.hp = Math.min(p.maxHp, p.hp + p.lifesteal);
    healText(e.x, e.y, p.lifesteal);
  }

  burst(e.x, e.y, e.c, e.boss ? 46 : 8, e.boss ? 320 : 150, e.boss ? 7 : 3.4, e.boss ? 1.1 : 0.5);
  addDecal(e.x, e.y, e.r * (e.boss ? 2.2 : 1.1), e.dc);
  G.hitStop = Math.max(G.hitStop, e.boss ? 0.12 : 0.022);
  if (e.boss) cam.shake = Math.max(cam.shake, 16);
  Sound.play("kill", { pitch: e.boss ? 0.55 : rand(0.9, 1.2), vol: e.boss ? 1.2 : 0.6 });

  // xp gem
  const n = e.boss ? 6 : e.elite ? 3 : 1;
  const val = e.xp / n;
  for (let i = 0; i < n; i++) dropGem(e.x + rand(-8, 8), e.y + rand(-8, 8), val);
  Run.event("gems", n);

  // gold
  const gChance = e.elite ? 0.85 : e.boss ? 1 : 0.12;
  if (chance(gChance)) {
    const g = Math.round((e.boss ? 25 : e.elite ? 8 : 1) * (1 + p.goldGain) * (p.diffGold || 1));
    G.gold += g; G.goldTotal += g;
    fx(e.x, e.y, rand(-40, 40), rand(-90, -30), 0.7, 4, "#ffce4d", SHAPE_DOT, 0.95, true);
    Sound.play("coin", { gap: 90 });
  }
  // chest
  const cChance = (e.boss ? 1 : e.elite ? 0.35 : p.chestChance);
  if (chance(cChance)) dropChest(e.x, e.y);

  // explosive on kill
  if (p.boomDmg > 0) {
    fx(e.x, e.y, 0, 0, 0.25, 70, "#ffb347", SHAPE_LINE, 1);
    cam.shake = Math.max(cam.shake, 4);
    Sound.play("boom", { gap: 120, vol: 0.7 });
    const list = grid.query(e.x, e.y, 78, scratch2).slice();
    for (const o of list) {
      if (o.hp > 0) {
        const dx = o.x - e.x, dy = o.y - e.y, dd = Math.hypot(dx, dy) || 1;
        damageEnemy(o, p.boomDmg * (1 - dd / 90), { kx: dx / dd, ky: dy / dd });
      }
    }
  }
  removeEnemy(e);
}

/* Enemies are flagged dead and compacted once per frame, so kills triggered from
   inside iteration (thorns, explosions) never corrupt a running loop. */
function removeEnemy(e) { e.dead = true; }

function compactEnemies() {
  const list = G.enemies;
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!list[i].dead) list[w++] = list[i];
  list.length = w;
}

function hurtPlayer(amount, sx, sy) {
  const p = P();
  if (p.invuln > 0 || p.dead) return;
  // defensive weapons grant their damage reduction while held
  const weaponDr = Armory.grantedDr();
  let dmg = Math.max(1, amount - p.armor) * (1 - clamp(p.dr + weaponDr, 0, 0.75));
  p.hp -= dmg;
  p.invuln = 0.7;
  p.flash = 0.16;
  Run.event("hit");
  cam.shake = Math.max(cam.shake, 7);
  dmgText(p.x, p.y - 22, dmg, false, "#ff6b7d");
  burst(p.x, p.y, "#ff5d6c", 8, 160, 3.4, 0.4);
  Sound.play("hurt");
  if (sx !== undefined) {
    const dx = p.x - sx, dy = p.y - sy, d = Math.hypot(dx, dy) || 1;
    p.x += (dx / d) * 16; p.y += (dy / d) * 16;
  }
  if (p.hp <= 0) {
    if (p.phoenix && !p.phoenixUsed) {
      p.phoenixUsed = true;
      p.hp = p.maxHp * 0.5;
      p.invuln = 2.2;
      burst(p.x, p.y, "#ffd25c", 40, 300, 5, 1);
      G.rings.push({ x: p.x, y: p.y, r: 10, max: 300, t: 0, life: 0.7, c: "#ffd25c" });
      showBanner("PHOENIX", "second wind!");
      cam.shake = Math.max(cam.shake, 16);
    } else if ((p.revives || 0) > G.revivesUsed) {
      G.revivesUsed++;
      p.hp = p.maxHp * 0.6;
      p.invuln = 2.4;
      burst(p.x, p.y, "#7ee0ff", 40, 300, 5, 1);
      showBanner("REVIVED", "feather spent");
    } else {
      gameOver();
    }
  }
}

/* ---------------- weapons ----------------
   The firing logic lives in js/weapons.js (Armory). Kept here for reference:
   the old single auto-attack path was replaced by per-weapon cooldowns so that
   Multishot / Piercing / Might apply to whatever is actually equipped.        */

function updateWeapons(dt) {
  const p = P();

  /* equipped weapons (purchased mid-run) */
  updateArmory(dt);
  tickWeaponStatuses(dt);

  /* drones (an always-available skill, not a weapon) */
  const dn = droneCount();
  if (dn > 0) {
    p.droneAng += dt * 2.1;
    for (let i = 0; i < dn; i++) {
      const a = p.droneAng + (i * TAU) / dn;
      const px2 = p.x + Math.cos(a) * 64, py2 = p.y + Math.sin(a) * 64;
      dronePos[i] = dronePos[i] || { x: 0, y: 0, a: 0 };
      dronePos[i].x = px2; dronePos[i].y = py2; dronePos[i].a = a;
      if (Math.random() < dt * 22) fx(px2, py2, rand(-14, 14), rand(-30, -6), 0.3, 2.5, "#8fd0ff", SHAPE_DOT, 0.9, true);
      const list = grid.query(px2, py2, 34, scratch);
      for (const e of list) {
        if (e.hp > 0 && e.droneCd <= 0 && dist(e.x, e.y, px2, py2) < 22 + e.r) {
          e.droneCd = 0.3;
          const dx = e.x - px2, dy = e.y - py2, d = Math.hypot(dx, dy) || 1;
          damageEnemy(e, p.droneDmg * (1 + p.dmgPct), { kx: dx / d, ky: dy / d, knock: 20 });
        }
      }
    }
  }

  /* lightning */
  const bl = p.upg.bolt || 0;
  if (bl > 0) {
    p.boltTimer -= dt;
    if (p.boltTimer <= 0) {
      p.boltTimer = Math.max(1.1, 3.1 - bl * 0.12);
      const pool = grid.query(p.x, p.y, 430, scratch);
      const targets = [];
      for (const e of pool) if (e.hp > 0 && dist(e.x, e.y, p.x, p.y) < 430) targets.push(e);
      shuffle(targets);
      const n = Math.min(boltTargets(), targets.length);
      const dmg = 10 * (1 + p.dmgPct) * (1 + p.boltDmgPct);
      for (let i = 0; i < n; i++) {
        const e = targets[i];
        G.bolts.push({ x: e.x, y: e.y, t: 0, life: 0.24, seed: Math.random() * 100 });
        damageEnemy(e, dmg, { color: "#9ee7ff" });
      }
      if (n > 0) {
        cam.shake = Math.max(cam.shake, 3);
        Sound.play("zap", { gap: 80 });
      }
    }
  }

  /* nova */
  const nv = p.upg.nova || 0;
  if (nv > 0) {
    p.novaTimer -= dt;
    if (p.novaTimer <= 0) {
      p.novaTimer = Math.max(2.6, 6.4 - nv * 0.35);
      const R = 118 * (1 + p.novaSize);
      const dmg = 16 * (1 + p.dmgPct) * (1 + p.novaDmgPct);
      G.novas.push({ x: p.x, y: p.y, r: 8, max: R, t: 0, life: 0.42 });
      G.rings.push({ x: p.x, y: p.y, r: 10, max: R, t: 0, life: 0.42, c: "#8fd0ff" });
      cam.shake = Math.max(cam.shake, 6);
      Sound.play("nova");
      const list = grid.query(p.x, p.y, R + 30, scratch).slice();
      for (const e of list) {
        if (e.hp > 0) {
          const dd = dist(e.x, e.y, p.x, p.y);
          if (dd < R + e.r) {
            const dx = (e.x - p.x) / (dd || 1), dy = (e.y - p.y) / (dd || 1);
            damageEnemy(e, dmg * (1 - clamp(dd / (R * 1.4), 0, 0.6)), { kx: dx, ky: dy, knock: 90 });
          }
        }
      }
    }
  }

  if (p.slash > 0) p.slash -= dt;
}
const dronePos = [];
const scratch2 = [];

/* ---------------- pickups ---------------- */
function dropGem(x, y, value) {
  if (G.gems.length > 1400) {
    G.gems.shift();
  }
  G.gems.push({ x, y, value, t: Math.random() * TAU, born: G.t, vx: rand(-45, 45), vy: rand(-45, 45) });
}
function dropChest(x, y) {
  G.chests.push({ x, y, t: 0 });
  Sound.play("chest", { gap: 200 });
}
const GEM_COLORS = ["#8affc1", "#8affc1", "#7ee0ff", "#c39bff", "#ffb347"];

function updatePickups(dt) {
  const p = P();
  const R = pickupR();

  /* gems */
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const g = G.gems[i];
    g.t += dt;
    const dx = p.x - g.x, dy = p.y - g.y;
    const d = Math.hypot(dx, dy);
    if (d < R) {
      const pull = lerp(760, 90, d / R);
      g.x += (dx / (d || 1)) * pull * dt;
      g.y += (dy / (d || 1)) * pull * dt;
    } else if (g.vx) {
      g.x += g.vx * dt; g.y += g.vy * dt;
      g.vx *= 0.9; g.vy *= 0.9;
      if (Math.abs(g.vx) < 2) g.vx = 0;
    }
    if (d < p.r + 8) {
      const gain = g.value * (1 + p.xpGain) * (p.diffXp || 1);
      p.xp += gain;
      G.gemsTaken = (G.gemsTaken || 0) + 1;
      G.gems.splice(i, 1);
      if (Math.random() < 0.35) fx(g.x, g.y, rand(-30, 30), rand(-60, -20), 0.3, 3, "#8affc1", SHAPE_DOT, 0.9, true);
      Sound.play("gem", { pitch: rand(0.9, 1.3), gap: 40, vol: 0.4 });
      checkLevel();
    } else if (d > 2400) {
      G.gems.splice(i, 1);
    }
  }

  /* chests */
  for (let i = G.chests.length - 1; i >= 0; i--) {
    const c = G.chests[i];
    c.t += dt;
    const dx = p.x - c.x, dy = p.y - c.y;
    const d = Math.hypot(dx, dy);
    if (d < R * 1.1) {
      const pull = lerp(700, 60, clamp(d / (R * 1.1), 0, 1));
      c.x += (dx / (d || 1)) * pull * dt;
      c.y += (dy / (d || 1)) * pull * dt;
    }
    if (d < p.r + 16) {
      const g = Math.round(20 * (1 + p.goldGain) * (p.diffGold || 1));
      G.gold += g; G.goldTotal += g;
      Run.event("chests", 1);
      const healed = Math.min(12, p.maxHp - p.hp);
      p.hp = Math.min(p.maxHp, p.hp + 12);
      if (healed > 0.5) healText(c.x, c.y, healed);
      burst(c.x, c.y, "#ffce4d", 24, 220, 4, 0.7);
      G.chests.splice(i, 1);
      showBanner(`+${g} GOLD`, healed > 0.5 ? `+${Math.round(healed)} HP` : "");
      Sound.play("level");
    }
  }

  /* fx rings */
  for (let i = G.rings.length - 1; i >= 0; i--) {
    const r = G.rings[i];
    r.t += dt;
    if (r.t >= r.life) G.rings.splice(i, 1);
  }
}

function checkLevel() {
  const p = P();
  while (p.xp >= p.xpNeed) {
    p.xp -= p.xpNeed;
    p.level++;
    p.xpNeed = xpNeedFor(p.level);
    p.pendingLevels++;
    Run.event("level", 1);
  }
  if (p.pendingLevels > 0 && state === "play") openLevelUp();
}

/* ---------------- enemies ---------------- */
function updateEnemies(dt) {
  const p = P();
  const list = G.enemies;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) continue;
    e.wob += dt * 6;
    if (e.flash > 0) e.flash -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.hitCd > 0) e.hitCd -= dt;
    if (e.droneCd > 0) e.droneCd -= dt;

    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    e.look = Math.atan2(dy, dx);

    if (d > 2300) { removeEnemy(e); continue; }

    // chase with a slight weaving offset so packs do not perfectly stack
    const weave = Math.sin(e.wob) * 0.22;
    const a = e.look + weave;
    const sp = e.spd * (e.slowT > 0 ? 0.55 : 1);
    e.x += Math.cos(a) * sp * dt;
    e.y += Math.sin(a) * sp * dt;

    // ranged attack
    if (e.shoot) {
      e.shootT -= dt;
      if (e.shootT <= 0 && d < 700) {
        e.shootT = e.shoot;
        const n = e.boss ? 8 : 3;
        const base = e.look;
        for (let k = 0; k < n; k++) {
          const ang = base + (k - (n - 1) / 2) * (e.boss ? 0.5 : 0.3);
          G.ebullets.push({
            x: e.x + Math.cos(ang) * e.r, y: e.y + Math.sin(ang) * e.r,
            vx: Math.cos(ang) * (e.boss ? 172 : 186), vy: Math.sin(ang) * (e.boss ? 172 : 186),
            r: e.boss ? 8 : 5, dmg: e.dmg * (e.boss ? 0.45 : 0.6), life: 4.5, c: e.boss ? "#ff8a5c" : "#6ad7ff",
          });
        }
        fx(e.x, e.y, 0, 0, 0.18, e.r * 1.6, e.c, SHAPE_LINE, 1);
      }
    }

    // contact damage
    if (d < e.r + p.r && e.hitCd <= 0) {
      e.hitCd = 0.65;
      hurtPlayer(e.dmg, e.x, e.y);
      if (p.thorns > 0) damageEnemy(e, p.thorns, { color: "#ffd25c" });
    }
  }

  /* soft separation so bodies do not fully overlap */
  const cell = CELL;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const bucket = grid.bucket(cx + ox, cy + oy);
        if (!bucket) continue;
        for (const b of bucket) {
          if (b === a || b.dead) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = (a.r + b.r) * 0.86;
          const d2 = dx * dx + dy * dy;
          if (d2 > 0.0001 && d2 < min * min) {
            const d = Math.sqrt(d2);
            const push = (min - d) * 0.5;
            const nx = dx / d, ny = dy / d;
            a.x -= nx * push; a.y -= ny * push;
            b.x += nx * push; b.y += ny * push;
          }
        }
      }
    }
  }
}

/* ---------------- projectiles ---------------- */
function updateBullets(dt) {
  const list = G.bullets;
  const p0 = P();
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    b.px = b.x; b.py = b.y;

    // homing: steer toward the closest enemy
    if (b.kind === "homing") {
      const t = nearestEnemy(b.x, b.y, 460);
      if (t) {
        const want = Math.atan2(t.y - b.y, t.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        let d = want - cur;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const na = cur + clamp(d, -5.5 * dt, 5.5 * dt);
        const sp = Math.hypot(b.vx, b.vy);
        b.vx = Math.cos(na) * sp; b.vy = Math.sin(na) * sp;
      }
    }

    // boomerang: travel out, then home back to the player
    if (b.kind === "boomer") {
      b.home += dt;
      if (b.home > 0.45) {
        const want = Math.atan2(p0.y - b.y, p0.x - b.x);
        const cur = Math.atan2(b.vy, b.vx);
        let d = want - cur;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        const sp = Math.hypot(b.vx, b.vy) * (1 + dt * 1.6);
        b.vx = Math.cos(cur + clamp(d, -7 * dt, 7 * dt)) * sp;
        b.vy = Math.sin(cur + clamp(d, -7 * dt, 7 * dt)) * sp;
        if (b.hits.length > (b.maxPierce || 0) * 2 + 2) b.life = Math.min(b.life, 0.05);
      }
      if (Math.random() < dt * 30) {
        fx(b.x, b.y, rand(-20, 20), rand(-20, 20), 0.25, 2, b.color || "#ffce4d", SHAPE_DOT, 0.9, true);
      }
    }

    b.x += b.vx * dt; b.y += b.vy * dt;
    b.life -= dt;

    const near = grid.query(b.x, b.y, b.r + 34, scratch);
    let hitAny = false;
    for (const e of near) {
      if (e.hp <= 0 || b.hits.indexOf(e) >= 0) continue;
      const rr = e.r + b.r;
      const dx = e.x - b.x, dy = e.y - b.y;
      if (dx * dx + dy * dy <= rr * rr) {
        b.hits.push(e);
        hitAny = true;
        const d = Math.hypot(dx, dy) || 1;
        // damageEnemy rolls the crit itself, using b.critChance
        damageEnemy(e, b.dmg, {
          kx: dx / d, ky: dy / d, knock: b.knock || 0,
          critChance: b.critChance || 0,
        });
        // bleed from fast weapons
        if (b.bleed && e.hp > 0) { e.bleed = 3; e.bleedDps = b.bleed; }
        fx(b.x, b.y, (dx / d) * 60, (dy / d) * 60, 0.16, b.r * 1.2, b.color || "#fff2b0", SHAPE_DOT, 0.8, true);

        if (b.kind === "splash") {
          const R = b.splash || 70;
          fx(b.x, b.y, 0, 0, 0.3, R, b.color || "#ffb37a", SHAPE_LINE, 1);
          cam.shake = Math.max(cam.shake, b.meteor ? 6 : 3);
          Sound.play("boom", { gap: 70, vol: 0.5 });
          const aoe = grid.query(b.x, b.y, R + 30, scratch2).slice();
          for (const o of aoe) {
            if (o.hp <= 0 || o === e) continue;
            const ox = o.x - b.x, oy = o.y - b.y, od = Math.hypot(ox, oy) || 1;
            damageEnemy(o, b.dmg * 0.55, { kx: ox / od, ky: oy / od, knock: b.knock || 60 });
          }
          b.life = 0;
          break;
        }

        if (b.pierce > 0) { b.pierce--; } else { b.life = 0; break; }
      }
    }
    if (b.life <= 0) {
      if (b.kind === "splash" && !hitAny && b.meteor) {
        // a meteor that missed still cracks the ground
        fx(b.x, b.y, 0, 0, 0.3, 60, "#ff9d4d", SHAPE_LINE, 1);
      }
      list.splice(i, 1);
    }
  }

  /* enemy bullets */
  const p = P();
  for (let i = G.ebullets.length - 1; i >= 0; i--) {
    const b = G.ebullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const dx = p.x - b.x, dy = p.y - b.y;
    const rr = b.r + p.r;
    if (dx * dx + dy * dy <= rr * rr) {
      hurtPlayer(b.dmg, b.x, b.y);
      burst(b.x, b.y, b.c, 5, 120, 3, 0.3);
      b.life = 0;
    }
    if (b.life <= 0) G.ebullets.splice(i, 1);
  }
}

/* ---------------- player ---------------- */
function updatePlayer(dt) {
  const p = P();
  let dx = 0, dy = 0;
  if (keys["w"] || keys["arrowup"]) dy -= 1;
  if (keys["s"] || keys["arrowdown"]) dy += 1;
  if (keys["a"] || keys["arrowleft"]) dx -= 1;
  if (keys["d"] || keys["arrowright"]) dx += 1;
  if (joy.active) { dx += joy.dx; dy += joy.dy; }
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    const nx = dx / len, ny = dy / len;
    const sp = moveSpeed();
    p.x += nx * sp * dt;
    p.y += ny * sp * dt;
    p.face = Math.atan2(ny, nx);
    p.walk += dt * 12;
    // squash while running, spring back when stopping
    p.squash = lerp(p.squash, 0.07, clamp(dt * 10, 0, 1));
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 7) p.trail.shift();
    if (Math.random() < dt * 6) {
      fx(p.x - nx * 10 + rand(-4, 4), p.y - ny * 10 + rand(-4, 4), 0, 0, 0.35, 3, "rgba(120,180,255,0.5)", SHAPE_DOT, 1);
    }
  } else {
    p.walk += dt * 3;
    p.squash = lerp(p.squash, 0, clamp(dt * 9, 0, 1));
  }
  if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
  if (p.invuln > 0) p.invuln -= dt;
  if (p.flash > 0) p.flash -= dt;

  // face nearest enemy for the slash effect
  const t = nearestEnemy(p.x, p.y, 620);
  p.look = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.face;
}

/* ---------------- fx update ---------------- */
function updateFx(dt) {
  for (let i = 0; i < MAX_DECALS; i++) if (decals[i]) decals[i].t += dt;
  particles.forEach((p) => {
    p.t += dt;
    if (p.t >= p.max) { p.alive = false; return; }
    p.x += p.vx * dt; p.y += p.vy * dt;
    const d = Math.pow(p.drag, dt * 60);
    p.vx *= d; p.vy *= d;
    p.rot += p.spin * dt;
  });
  texts.forEach((t) => {
    t.t += dt;
    if (t.t >= t.max) { t.alive = false; return; }
    t.y += t.vy * dt;
    t.vy *= Math.pow(0.9, dt * 60);
  });
  for (let i = G.bolts.length - 1; i >= 0; i--) {
    G.bolts[i].t += dt;
    if (G.bolts[i].t >= G.bolts[i].life) G.bolts.splice(i, 1);
  }
  for (let i = G.novas.length - 1; i >= 0; i--) {
    const n = G.novas[i];
    n.t += dt;
    n.r = 8 + (n.max - 8) * clamp(n.t / n.life, 0, 1);
    if (n.t >= n.life) G.novas.splice(i, 1);
  }
  if (cam.shake > 0) {
    cam.shake = Math.max(0, cam.shake - dt * 26);
    if (!cam.enabled) cam.shake = 0;
    cam.sx = rand(-cam.shake, cam.shake);
    cam.sy = rand(-cam.shake, cam.shake);
  } else { cam.sx = cam.sy = 0; }
}

/* ---------------- rendering ---------------- */
let mmTick = 0;
function w2s(x, y) { return { x: x - cam.x + vw / 2 + cam.sx, y: y - cam.y + vh / 2 + cam.sy }; }

function drawDecals() {
  for (let i = 0; i < MAX_DECALS; i++) {
    const d = decals[i];
    if (!d || d.t >= d.max) continue;
    const s = w2s(d.x, d.y);
    if (s.x < -60 || s.y < -60 || s.x > vw + 60 || s.y > vh + 60) continue;
    const k = 1 - d.t / d.max;
    ctx.globalAlpha = 0.3 * k * k;
    ctx.fillStyle = d.c;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, d.r, d.r * 0.62, d.seed, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 0.18 * k * k;
    ctx.beginPath();
    ctx.ellipse(s.x + Math.cos(d.seed * 2) * d.r * 0.7, s.y + Math.sin(d.seed * 2) * d.r * 0.5, d.r * 0.5, d.r * 0.34, d.seed + 1, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawBackground() {
  ctx.fillStyle = "#070a12";
  ctx.fillRect(0, 0, vw, vh);

  // far parallax dust - slower than the world so movement reads with depth
  const pstep = 210;
  const ppx = ((-cam.x * 0.32 + cam.sx) % pstep + pstep) % pstep;
  const ppy = ((-cam.y * 0.32 + cam.sy) % pstep + pstep) % pstep;
  const ix0 = Math.floor((cam.x * 0.32 - cam.sx) / pstep);
  const iy0 = Math.floor((cam.y * 0.32 - cam.sy) / pstep);
  ctx.fillStyle = "rgba(150,185,255,0.16)";
  for (let gy = 0, iy = iy0; ppy + gy * pstep < vh + pstep; gy++, iy++) {
    for (let gx = 0, ix = ix0; ppx + gx * pstep < vw + pstep; gx++, ix++) {
      const h = hash2(ix, iy);
      if (h > 0.55) continue;
      const jx = (hash2(ix + 91, iy + 7) - 0.5) * pstep * 0.7;
      const jy = (hash2(ix + 13, iy + 57) - 0.5) * pstep * 0.7;
      const sz = 0.8 + h * 1.6;
      ctx.globalAlpha = 0.25 + h * 0.4;
      ctx.fillRect(ppx + gx * pstep + jx, ppy + gy * pstep + jy, sz, sz);
    }
  }
  ctx.globalAlpha = 1;

  // world-space ground scuffs
  const gstep = 260;
  const gx0 = Math.floor((cam.x - cam.sx) / gstep);
  const gy0 = Math.floor((cam.y - cam.sy) / gstep);
  ctx.strokeStyle = "rgba(120,150,220,0.07)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let gy = -1; gy <= Math.ceil(vh / gstep) + 1; gy++) {
    for (let gx = -1; gx <= Math.ceil(vw / gstep) + 1; gx++) {
      const h = hash2(gx + 1000, gy + 2000);
      if (h > 0.5) continue;
      const wx = (gx + h) * gstep, wy = (gy + hash2(gx, gy)) * gstep;
      const s = w2s(wx, wy);
      const len = 12 + h * 30;
      ctx.moveTo(s.x - len / 2, s.y);
      ctx.quadraticCurveTo(s.x, s.y + (h - 0.25) * 14, s.x + len / 2, s.y);
    }
  }
  ctx.stroke();

  // blood / goo decals from earlier kills
  drawDecals();

  // subtle vignette-light around the player
  const p = w2s(P().x, P().y);
  const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(vw, vh) * 0.62);
  grd.addColorStop(0, "rgba(60,110,220,0.16)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, vw, vh);

  // grid dots
  const step = 64;
  const ox = ((-cam.x + cam.sx) % step + step) % step;
  const oy = ((-cam.y + cam.sy) % step + step) % step;
  ctx.fillStyle = "rgba(120,160,255,0.10)";
  for (let x = ox; x < vw; x += step) {
    for (let y = oy; y < vh; y += step) {
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
}

function drawGems() {
  const sparse = G.gems.length > 260;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const g of G.gems) {
    const s = w2s(g.x, g.y);
    if (s.x < -30 || s.y < -30 || s.x > vw + 30 || s.y > vh + 30) continue;
    const tier = g.value >= 20 ? 4 : g.value >= 8 ? 3 : g.value >= 3 ? 2 : 0;
    if (tier === 0 && sparse) continue; // skip bloom when the field is crowded
    const size = 3.4 + tier * 0.7 + Math.sin(g.t * 4) * 0.4;
    const sprite = glowSprite(GEM_COLORS[tier]);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(sprite, s.x - size * 4.4, s.y - size * 4.4, size * 8.8, size * 8.8);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  for (const g of G.gems) {
    const s = w2s(g.x, g.y);
    if (s.x < -30 || s.y < -30 || s.x > vw + 30 || s.y > vh + 30) continue;
    const tier = g.value >= 20 ? 4 : g.value >= 8 ? 3 : g.value >= 3 ? 2 : 0;
    const size = 3.4 + tier * 0.8 + Math.sin(g.t * 4) * 0.4;
    ctx.fillStyle = GEM_COLORS[tier];
    if (tier === 0) {
      // cheap square for the common case; hundreds can be on screen at once
      ctx.fillRect(s.x - size * 0.75, s.y - size * 0.75, size * 1.5, size * 1.5);
    } else {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - size * 1.5);
      ctx.lineTo(s.x + size, s.y);
      ctx.lineTo(s.x, s.y + size * 1.5);
      ctx.lineTo(s.x - size, s.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawChests() {
  for (const c of G.chests) {
    const s = w2s(c.x, c.y);
    if (s.x < -40 || s.y < -40 || s.x > vw + 40 || s.y > vh + 40) continue;
    const bob = Math.sin(c.t * 4) * 2;
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.beginPath(); ctx.ellipse(s.x, s.y + 12, 14, 5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#b98422";
    ctx.fillRect(s.x - 12, s.y - 10 + bob, 24, 20);
    ctx.fillStyle = "#ffce4d";
    ctx.fillRect(s.x - 12, s.y - 4 + bob, 24, 6);
    ctx.fillStyle = "#ffe9a8";
    ctx.fillRect(s.x - 3, s.y - 12 + bob, 6, 24);
  }
}

/* Per-type bodies. Every monster keeps the same silhouette language but reads
   differently at a glance: blob, wings, armour, flame, plated boss. */
function drawEnemyBody(e, s, r) {
  const flash = e.flash > 0;
  const c = flash ? "#ffffff" : e.c;
  const dc = flash ? "#ffffff" : e.dc;
  const ea = e.look, ex = Math.cos(ea), ey = Math.sin(ea);
  const nx = -ey, ny = ex;

  if (e.type === "bat") {
    // flapping wings behind the body
    const flap = Math.sin(e.wob * 2.4);
    ctx.fillStyle = dc;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - r * 0.2);
      ctx.quadraticCurveTo(
        s.x + nx * side * r * 1.7 - ex * r * 0.3,
        s.y + ny * side * r * 1.7 - ey * r * 0.3 + flap * r * 0.7,
        s.x + nx * side * r * 2.0 - ex * r * 1.2,
        s.y + ny * side * r * 2.0 - ey * r * 1.2 + flap * r * 0.9
      );
      ctx.quadraticCurveTo(
        s.x + nx * side * r * 1.0 - ex * r * 0.5,
        s.y + ny * side * r * 1.0 - ey * r * 0.5 + flap * r * 0.3,
        s.x, s.y + r * 0.35
      );
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, r * 0.72, r * 0.92, e.look, 0, TAU);
    ctx.fill();
    return;
  }

  if (e.type === "wisp") {
    // flame tail streaming away from the player + flickering core
    const flick = 1 + Math.sin(e.wob * 3.1) * 0.1;
    const tail = r * (1.6 + Math.sin(e.wob * 2) * 0.25);
    ctx.fillStyle = dc;
    ctx.beginPath();
    ctx.moveTo(s.x + ex * r * 0.5 + nx * r * 0.6, s.y + ey * r * 0.5 + ny * r * 0.6);
    ctx.quadraticCurveTo(s.x - ex * tail * 0.6 + nx * r * 0.9, s.y - ey * tail * 0.6 + ny * r * 0.9,
      s.x - ex * tail, s.y - ey * tail);
    ctx.quadraticCurveTo(s.x - ex * tail * 0.6 - nx * r * 0.9, s.y - ey * tail * 0.6 - ny * r * 0.9,
      s.x + ex * r * 0.5 - nx * r * 0.6, s.y + ey * r * 0.5 - ny * r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * flick, 0, TAU);
    ctx.fill();
    ctx.fillStyle = flash ? "#fff" : "#d8f6ff";
    ctx.beginPath();
    ctx.arc(s.x + ex * r * 0.15, s.y + ey * r * 0.15, r * 0.45 * flick, 0, TAU);
    ctx.fill();
    return;
  }

  if (e.type === "brute") {
    // back spikes
    ctx.fillStyle = dc;
    for (let i = -1; i <= 1; i++) {
      const side = i * r * 0.5;
      const bx = s.x - ex * r * 0.75 + nx * side;
      const by = s.y - ey * r * 0.75 + ny * side;
      ctx.beginPath();
      ctx.moveTo(bx - ex * r * 0.1 - nx * r * 0.22, by - ey * r * 0.1 - ny * r * 0.22);
      ctx.lineTo(bx - ex * r * 0.62, by - ey * r * 0.62);
      ctx.lineTo(bx - ex * r * 0.1 + nx * r * 0.22, by - ey * r * 0.1 + ny * r * 0.22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fill();
    // armour plate on the leading edge
    ctx.fillStyle = dc;
    ctx.beginPath();
    ctx.arc(s.x + ex * r * 0.22, s.y + ey * r * 0.22, r * 0.6, e.look + Math.PI * 0.55, e.look + Math.PI * 1.45);
    ctx.fill();
    ctx.strokeStyle = flash ? "#fff" : "rgba(255,220,180,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x + ex * r * 0.22, s.y + ey * r * 0.22, r * 0.6, e.look + Math.PI * 0.55, e.look + Math.PI * 1.45);
    ctx.stroke();
    return;
  }

  if (e.boss) {
    // pulsing aura
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = 0.22 + Math.sin(e.wob * 0.6) * 0.06;
    ctx.drawImage(glowSprite(hexToRgb(e.c)), s.x - r * 2.2, s.y - r * 2.2, r * 4.4, r * 4.4);
    ctx.restore();
    // segmented plates
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = dc;
    for (let i = 0; i < 3; i++) {
      const a = e.look + Math.PI + (i - 1) * 0.7;
      ctx.beginPath();
      ctx.arc(s.x + ex * r * 0.15, s.y + ey * r * 0.15, r * (0.78 - i * 0.14), a - 0.45, a + 0.45);
      ctx.fill();
    }
    // jaw that opens just before a volley
    const open = e.shoot ? clamp(1 - e.shootT / 0.5, 0, 1) : 0;
    if (open > 0.05) {
      ctx.fillStyle = "#3a0b12";
      ctx.beginPath();
      ctx.ellipse(s.x + ex * r * 0.55, s.y + ey * r * 0.55, r * 0.42, r * 0.3 * open + 1, e.look, 0, TAU);
      ctx.fill();
    }
    return;
  }

  // slime: wobbling blob, squashed perpendicular to travel
  const wob = Math.sin(e.wob) * 0.1;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(e.look);
  ctx.scale(1 + wob, 1 - wob);
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = dc;
  ctx.beginPath();
  ctx.arc(0, r * 0.3, r * 0.72, 0, Math.PI);
  ctx.fill();
  ctx.restore();
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgb(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255})`;
}

function drawEnemies() {
  for (const e of G.enemies) {
    if (e.dead) continue;
    const s = w2s(e.x, e.y);
    if (s.x < -110 || s.y < -110 || s.x > vw + 110 || s.y > vh + 110) continue;
    const r = e.r;

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath(); ctx.ellipse(s.x, s.y + r * 0.8, r * 0.9, r * 0.38, 0, 0, TAU); ctx.fill();

    if (e.slowT > 0) {
      ctx.strokeStyle = "rgba(140,220,255,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 3, 0, TAU); ctx.stroke();
    }

    drawEnemyBody(e, s, r);

    // eyes looking at the player
    const ea = e.look;
    const ex = Math.cos(ea), ey = Math.sin(ea);
    const n = e.ev;
    const eyeScale = e.type === "bat" ? 0.8 : 1;
    for (let i = 0; i < n; i++) {
      const side = n === 1 ? 0 : (i - (n - 1) / 2) * r * 0.62;
      const ox = -ey * side, oy = ex * side;
      const bx = s.x + ox * 0.55 - ex * r * 0.16;
      const by = s.y + oy * 0.55 - ey * r * 0.16;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(bx, by, r * 0.3 * eyeScale, 0, TAU); ctx.fill();
      ctx.fillStyle = "#101322";
      ctx.beginPath(); ctx.arc(bx + ex * r * 0.11, by + ey * r * 0.11, r * 0.15 * eyeScale, 0, TAU); ctx.fill();
    }

    if (e.elite || e.boss) {
      ctx.strokeStyle = e.boss ? "#ffce4d" : "#fff0b8";
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.65 + Math.sin(e.wob * 0.9) * 0.3;
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 4, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (e.boss) {
      // horns
      ctx.fillStyle = "#ffd25c";
      ctx.beginPath();
      ctx.moveTo(s.x - r * 0.8, s.y - r * 0.6);
      ctx.lineTo(s.x - r * 1.15, s.y - r * 1.4);
      ctx.lineTo(s.x - r * 0.35, s.y - r * 0.95);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s.x + r * 0.8, s.y - r * 0.6);
      ctx.lineTo(s.x + r * 1.15, s.y - r * 1.4);
      ctx.lineTo(s.x + r * 0.35, s.y - r * 0.95);
      ctx.closePath(); ctx.fill();
    }
  }
}

function drawPlayer() {
  const p = P();
  const s = w2s(p.x, p.y);
  const r = p.r;

  // motion trail
  if (p.trail && p.trail.length > 1) {
    for (let i = 0; i < p.trail.length; i++) {
      const tr = p.trail[i];
      const ts = w2s(tr.x, tr.y);
      const k = i / p.trail.length;
      ctx.globalAlpha = k * 0.18;
      ctx.fillStyle = "#7fc0ff";
      ctx.beginPath();
      ctx.arc(ts.x, ts.y, r * (0.35 + k * 0.5), 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // slash arc
  if (p.slash > 0) {
    const k = p.slash / 0.14;
    ctx.strokeStyle = `rgba(255,240,190,${0.55 * k})`;
    ctx.lineWidth = 5 + 4 * k;
    ctx.beginPath();
    ctx.arc(s.x, s.y, r + 18, p.look - 0.85, p.look + 0.85);
    ctx.stroke();

    // muzzle flash at the barrel
    const mf = 1 + Math.sin(p.look * 2) * 0;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = k * 0.9;
    ctx.fillStyle = "#fff3c4";
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(p.look) * (r + 20 * mf), s.y + Math.sin(p.look) * (r + 20 * mf));
    ctx.lineTo(s.x + Math.cos(p.look + 0.5) * (r - 2), s.y + Math.sin(p.look + 0.5) * (r - 2));
    ctx.lineTo(s.x + Math.cos(p.look - 0.5) * (r - 2), s.y + Math.sin(p.look - 0.5) * (r - 2));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // drones
  const dn = droneCount();
  for (let i = 0; i < dn; i++) {
    const d = dronePos[i];
    if (!d) continue;
    const q = w2s(d.x, d.y);
    ctx.fillStyle = "#8fd0ff";
    ctx.beginPath(); ctx.arc(q.x, q.y, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = "#1b2a44";
    ctx.beginPath(); ctx.arc(q.x, q.y, 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(143,208,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(q.x, q.y, 12, 0, TAU); ctx.stroke();
  }

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(s.x, s.y + r * 0.85, r * 0.95, r * 0.4, 0, 0, TAU); ctx.fill();

  // soft halo so the player never gets lost inside a big horde
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.17 + Math.sin(p.walk * 0.35) * 0.04;
  ctx.drawImage(glowSprite("rgb(96,170,255)"), s.x - r * 2.7, s.y - r * 2.7, r * 5.4, r * 5.4);
  ctx.restore();

  // body
  const blink = p.invuln > 0 && Math.floor(p.invuln * 18) % 2 === 0;
  ctx.globalAlpha = blink ? 0.45 : 1;
  // squash along the direction of travel
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(p.face);
  ctx.scale(1 + p.squash, 1 - p.squash);
  ctx.translate(-s.x, -s.y);
  const grd = ctx.createLinearGradient(s.x, s.y - r, s.x, s.y + r);
  grd.addColorStop(0, p.flash > 0 ? "#fff" : "#bfe4ff");
  grd.addColorStop(1, p.flash > 0 ? "#fff" : "#2f6fd0");
  ctx.fillStyle = grd;
  ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = "rgba(235,248,255,0.95)";
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.restore();

  // eyes
  const ea = p.look, ex = Math.cos(ea), ey = Math.sin(ea);
  const nx = -ey, ny = ex;
  for (const side of [-1, 1]) {
    const bx = s.x + nx * side * r * 0.36 - ex * r * 0.1;
    const by = s.y + ny * side * r * 0.36 - ey * r * 0.1;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(bx, by, r * 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = "#0b1226";
    ctx.beginPath(); ctx.arc(bx + ex * r * 0.1, by + ey * r * 0.1, r * 0.15, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;

  // weapon level pips
  const wlv = p.projCount + (p.upg.drone || 0) * 1;
  if (wlv > 1) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    for (let i = 0; i < Math.min(wlv, 8); i++) {
      ctx.fillRect(s.x - (Math.min(wlv, 8) - 1) * 3 + i * 6, s.y + r + 7, 4, 3);
    }
  }
}

function drawProjectiles() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const b of G.bullets) {
    const s = w2s(b.x, b.y);
    const ps = w2s(b.px, b.py);
    ctx.strokeStyle = b.color || "rgba(255,240,170,0.5)";
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = b.r * 1.4;
    ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(ps.x, ps.y); ctx.lineTo(s.x, s.y); ctx.stroke();
    const sprite = glowSprite(b.color || "rgb(255,225,140)");
    ctx.globalAlpha = 0.42;
    ctx.drawImage(sprite, s.x - b.r * 4.4, s.y - b.r * 4.4, b.r * 8.8, b.r * 8.8);
  }
  for (const b of G.ebullets) {
    const s = w2s(b.x, b.y);
    const sprite = glowSprite(b.c);
    ctx.drawImage(sprite, s.x - b.r * 3.5, s.y - b.r * 3.5, b.r * 7, b.r * 7);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  /* solid cores, shaped per weapon kind */
  for (const b of G.bullets) {
    const s = w2s(b.x, b.y);
    ctx.fillStyle = b.color || "#fff2b0";
    if (b.kind === "boomer") {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.beginPath();
      ctx.moveTo(12, 0); ctx.lineTo(-7, -7); ctx.lineTo(-3, 0); ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (b.kind === "splash") {
      ctx.beginPath();
      ctx.arc(s.x, s.y, b.r * (b.meteor ? 1.25 : 1), 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (b.kind === "homing") {
      ctx.beginPath(); ctx.arc(s.x, s.y, b.r * 0.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.lineWidth = 1.5; ctx.stroke();
    } else if (b.kind === "fast") {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.atan2(b.vy, b.vx));
      ctx.fillRect(-b.r * 1.6, -b.r * 0.4, b.r * 3.2, b.r * 0.8);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(s.x, s.y, b.r, 0, TAU); ctx.fill();
    }
  }
  for (const b of G.ebullets) {
    const s = w2s(b.x, b.y);
    ctx.fillStyle = b.c;
    ctx.beginPath(); ctx.arc(s.x, s.y, b.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

/* melee swing arcs, orbiting blades and the merchant */
function drawWeaponFx() {
  for (const a of Armory.arcs) {
    const s = w2s(a.x, a.y);
    const k = 1 - a.t / a.life;
    const grow = 0.55 + (1 - k) * 0.45;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = k * (a.big ? 0.5 : 0.38);
    const grd = ctx.createRadialGradient(s.x, s.y, a.range * 0.25 * grow, s.x, s.y, a.range * grow);
    grd.addColorStop(0, "rgba(255,255,255,0)");
    grd.addColorStop(0.7, a.c || "#cfe4ff");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.arc(s.x, s.y, a.range * grow, a.ang - a.arc / 2, a.ang + a.arc / 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = k * 0.8;
    ctx.strokeStyle = a.c || "#cfe4ff";
    ctx.lineWidth = a.big ? 5 : 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, a.range * grow * 0.94, a.ang - a.arc / 2, a.ang + a.arc / 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const b of Armory.orbits) {
    if (!b.x) continue;
    const s = w2s(b.x, b.y);
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(b.a);
    ctx.fillStyle = b.color || "#b8f5ff";
    ctx.beginPath();
    ctx.moveTo(13, 0); ctx.lineTo(-6, -5); ctx.lineTo(-9, 0); ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function drawMerchant() {
  const m = Armory.merchant;
  if (!m) return;
  const s = w2s(m.x, m.y);
  if (s.x < -90 || s.y < -90 || s.x > vw + 90 || s.y > vh + 90) return;
  const bob = Math.sin(m.t * 2) * 2;

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath(); ctx.ellipse(s.x, s.y + 24, 18, 6, 0, 0, TAU); ctx.fill();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.26 + Math.sin(m.t * 3) * 0.08;
  ctx.drawImage(glowSprite("rgb(255,206,77)"), s.x - 60, s.y - 60 + bob, 120, 120);
  ctx.restore();

  ctx.fillStyle = "#6d4bd6";
  ctx.beginPath();
  ctx.moveTo(s.x - 14, s.y + 22 + bob);
  ctx.lineTo(s.x - 10, s.y - 6 + bob);
  ctx.lineTo(s.x + 10, s.y - 6 + bob);
  ctx.lineTo(s.x + 14, s.y + 22 + bob);
  ctx.closePath(); ctx.fill();

  ctx.fillStyle = "#8a63ff";
  ctx.beginPath(); ctx.arc(s.x, s.y - 12 + bob, 12, 0, TAU); ctx.fill();
  ctx.fillStyle = "#f2d3a8";
  ctx.beginPath(); ctx.arc(s.x, s.y - 10 + bob, 7, 0, TAU); ctx.fill();
  ctx.fillStyle = "#1b1330";
  ctx.beginPath(); ctx.arc(s.x - 3, s.y - 11 + bob, 1.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(s.x + 3, s.y - 11 + bob, 1.6, 0, TAU); ctx.fill();

  ctx.fillStyle = "#c8a03a";
  ctx.beginPath(); ctx.ellipse(s.x + 17, s.y + 12 + bob, 8, 9, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = "#ffe9a8";
  ctx.beginPath(); ctx.arc(s.x + 17, s.y + 8 + bob, 4, 0, TAU); ctx.fill();

  if (m.near) {
    ctx.font = '800 13px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = "center";
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText("E — TRADE", s.x, s.y - 38);
    ctx.fillStyle = "#ffce4d";
    ctx.fillText("E — TRADE", s.x, s.y - 38);
  }
}

function drawEffects() {
  // novas
  for (const n of G.novas) {
    const s = w2s(n.x, n.y);
    const k = 1 - clamp(n.t / n.life, 0, 1);
    ctx.strokeStyle = `rgba(143,208,255,${0.7 * k})`;
    ctx.lineWidth = 6 * k + 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, n.r, 0, TAU); ctx.stroke();
  }
  for (const r of G.rings) {
    const s = w2s(r.x, r.y);
    const k = 1 - clamp(r.t / r.life, 0, 1);
    ctx.strokeStyle = r.c + "";
    ctx.globalAlpha = 0.8 * k;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 10 + (r.max - 10) * clamp(r.t / r.life, 0, 1), 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // lightning bolts
  for (const b of G.bolts) {
    const s = w2s(b.x, b.y);
    const k = 1 - clamp(b.t / b.life, 0, 1);
    ctx.strokeStyle = `rgba(190,240,255,${k})`;
    ctx.lineWidth = 3 * k + 1;
    ctx.beginPath();
    let x = s.x, y = -10;
    const segs = 7;
    ctx.moveTo(x, y);
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      x = lerp(s.x, s.x + Math.sin(b.seed + i * 2.3) * 34, t);
      y = lerp(-10, s.y, t);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(s.x, s.y);
    ctx.stroke();
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const sprite = glowSprite("rgb(150,230,255)");
    ctx.globalAlpha = k * 0.85;
    ctx.drawImage(sprite, s.x - 44, s.y - 44, 88, 88);
    ctx.restore();
  }
  // particles
  ctx.save();
  particles.forEach((pt) => {
    const s = w2s(pt.x, pt.y);
    const k = 1 - clamp(pt.t / pt.max, 0, 1);
    if (pt.glow) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = k * 0.5;
      ctx.drawImage(glowSprite(pt.color), s.x - pt.size * 3, s.y - pt.size * 3, pt.size * 6, pt.size * 6);
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }
    ctx.globalAlpha = k;
    ctx.fillStyle = pt.color;
    if (pt.shape === SHAPE_LINE) {
      const rr = pt.size * (0.3 + (1 - k));
      ctx.globalAlpha = k * 0.55;
      ctx.strokeStyle = pt.color;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    } else if (pt.shape === SHAPE_SQUARE) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(pt.rot);
      ctx.fillRect(-pt.size * k, -pt.size * k, pt.size * 2 * k, pt.size * 2 * k);
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(s.x, s.y, Math.max(0.4, pt.size * k), 0, TAU); ctx.fill();
    }
  });
  ctx.restore();

  // damage numbers
  ctx.save();
  ctx.textAlign = "center";
  texts.forEach((t) => {
    const s = w2s(t.x, t.y);
    const k = t.t / t.max;
    ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    // punchy scale: pops up then settles, used by crits and heals
    const pop = t.pop ? 1 + (1 - clamp(k * 6, 0, 1)) * 0.55 : 1;
    const sz = t.size * pop;
    ctx.font = `800 ${sz}px "Segoe UI", system-ui, sans-serif`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.strokeText(t.text, s.x, s.y);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, s.x, s.y);
  });
  ctx.restore();
}

/* offscreen markers for bosses / elites */
function drawOffscreenMarkers() {
  const p = P();
  const cx = vw / 2, cy = vh / 2;
  const margin = 34;
  for (const e of G.enemies) {
    if (!e.boss && !e.elite) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const s = w2s(e.x, e.y);
    if (s.x > -20 && s.y > -20 && s.x < vw + 20 && s.y < vh + 20) continue;
    const a = Math.atan2(dy, dx);
    const hw = vw / 2 - margin, hh = vh / 2 - margin;
    const tx = Math.abs(Math.cos(a)) > 1e-4 ? hw / Math.abs(Math.cos(a)) : Infinity;
    const ty = Math.abs(Math.sin(a)) > 1e-4 ? hh / Math.abs(Math.sin(a)) : Infinity;
    const tt = Math.min(tx, ty);
    const mx = cx + Math.cos(a) * tt, my = cy + Math.sin(a) * tt;
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(a);
    ctx.fillStyle = e.boss ? "#ff5d6c" : "#ffce4d";
    ctx.beginPath();
    ctx.moveTo(10, 0); ctx.lineTo(-6, -7); ctx.lineTo(-6, 7);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}

function drawMinimap() {
  const S = 176, R = S / 2, range = 900, sc = R / range;
  mctx.clearRect(0, 0, S, S);
  mctx.save();
  mctx.beginPath(); mctx.arc(R, R, R - 1, 0, TAU); mctx.clip();
  mctx.fillStyle = "rgba(6,10,20,0.75)";
  mctx.fillRect(0, 0, S, S);

  mctx.strokeStyle = "rgba(120,160,255,0.08)";
  mctx.lineWidth = 1;
  for (let i = 1; i < 3; i++) {
    mctx.beginPath(); mctx.arc(R, R, (R / 3) * i, 0, TAU); mctx.stroke();
  }

  const px = P().x, py = P().y;
  const plot = (x, y, color, size) => {
    mctx.fillStyle = color;
    mctx.fillRect(R + (x - px) * sc - size / 2, R + (y - py) * sc - size / 2, size, size);
  };
  // view wedge so you know which way you are facing
  mctx.fillStyle = "rgba(143,208,255,0.10)";
  mctx.beginPath();
  mctx.moveTo(R, R);
  const fa = P().face;
  mctx.arc(R, R, R - 2, fa - 0.5, fa + 0.5);
  mctx.closePath();
  mctx.fill();

  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.boss) plot(e.x, e.y, "#ff3b52", 6);
    else if (e.elite) plot(e.x, e.y, "#ffce4d", 3.6);
    else plot(e.x, e.y, "rgba(255,110,110,0.85)", 2.4);
  }
  // old gems fade so the ring does not turn into soup
  const now = G.t;
  for (const g of G.gems) {
    const age = clamp(1 - (now - g.born) / 18, 0.25, 1);
    mctx.globalAlpha = age * 0.6;
    plot(g.x, g.y, "rgba(140,220,255,1)", 1.4);
  }
  mctx.globalAlpha = 1;
  for (const c of G.chests) plot(c.x, c.y, "#ffce4d", 4);
  // the merchant is always worth knowing about
  if (Armory.merchant) {
    const m = Armory.merchant;
    mctx.save();
    mctx.globalAlpha = 0.5 + Math.sin(m.t * 4) * 0.35;
    plot(m.x, m.y, "#ffce4d", 5);
    mctx.globalAlpha = 0.18;
    plot(m.x, m.y, "#ffce4d", 11);
    mctx.restore();
  }

  // view rect hint
  mctx.strokeStyle = "rgba(255,255,255,0.18)";
  mctx.lineWidth = 1;
  mctx.strokeRect(R - (vw / 2) * sc, R - (vh / 2) * sc, vw * sc, vh * sc);

  mctx.restore();

  // player arrow
  mctx.fillStyle = "#8fd0ff";
  mctx.beginPath();
  mctx.arc(R, R, 3.6, 0, TAU);
  mctx.fill();
  mctx.strokeStyle = "rgba(143,208,255,0.7)";
  mctx.lineWidth = 2;
  mctx.beginPath();
  mctx.arc(R, R, R - 1, 0, TAU);
  mctx.stroke();
}

function render() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawBackground();
  drawChests();
  drawGems();
  drawEnemies();
  drawWeaponFx();
  drawProjectiles();
  drawPlayer();
  drawMerchant();
  drawEffects();
  drawOffscreenMarkers();
  // the minimap is redrawn a few times a second; it is pure fill-rate
  if (mmTick++ % 5 === 0) drawMinimap();

  /* bloom: downsample the frame, crush the darks with contrast so only real
     highlights bleed, then add it back. The buffer is rebuilt every other
     frame - it is low-frequency so nobody can tell, and it halves the cost. */
  if (G.opts.bloom && bctx && bw > 2) {
    if (mmTick % 2 === 0) {
      bctx.setTransform(1, 0, 0, 1, 0, 0);
      bctx.globalCompositeOperation = "source-over";
      bctx.globalAlpha = 1;
      bctx.filter = bloomFilterOk ? "blur(2px) brightness(1.12) contrast(2.8) saturate(1.15)" : "blur(2px)";
      bctx.clearRect(0, 0, bw, bh);
      bctx.drawImage(cv, 0, 0, bw, bh);
      bctx.filter = "none";
    }
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = bloomFilterOk ? 0.34 : 0.12;
    ctx.drawImage(bloomCv, 0, 0, vw, vh);
    ctx.restore();
  }

  // screen vignette
  if (vigGrad) {
    ctx.fillStyle = vigGrad;
    ctx.fillRect(0, 0, vw, vh);
  }

  // low health: pulsing red edges
  const p = P();
  const hpK = clamp(1 - p.hp / (p.maxHp * 0.32), 0, 1);
  if (hpK > 0.01 && !p.dead) {
    const pulse = 0.10 + Math.sin(G.t * 5) * 0.035;
    const g2 = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
    g2.addColorStop(0, "rgba(255,0,20,0)");
    g2.addColorStop(1, `rgba(255,20,40,${hpK * pulse})`);
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, vw, vh);
  }

  // screen damage flash
  if (p.invuln > 0.36) {
    ctx.fillStyle = `rgba(255,40,60,${(p.invuln - 0.36) * 0.4})`;
    ctx.fillRect(0, 0, vw, vh);
  }
}

/* ---------------- HUD ---------------- */

function updateHud(dt) {
  const p = P();
  el("lvlNum").textContent = p.level;
  el("hpFill").style.transform = `scaleX(${clamp(p.hp / p.maxHp, 0, 1)})`;
  el("hpText").textContent = `${Math.ceil(Math.max(0, p.hp))} / ${Math.round(p.maxHp)}`;

  // XP ghost trails the real bar so level-ups feel earned
  const xpK = clamp(p.xp / p.xpNeed, 0, 1);
  xpGhost = xpGhost > xpK ? Math.max(xpK, xpGhost - (dt || 0.016) * 0.55) : xpK;
  el("xpFill").style.transform = `scaleX(${xpK})`;
  el("xpGhost").style.transform = `scaleX(${clamp(xpGhost, 0, 1)})`;

  el("timeTxt").textContent = fmtTime(G.t);
  el("killTxt").textContent = `${G.kills} kills`;
  el("goldTxt").textContent = `${G.gold} g`;

  // live objective chip
  const o = Run.objectiveProgress();
  const oc = el("objChip");
  if (o && state === "play") {
    oc.classList.remove("hidden");
    el("objIcon").textContent = Run.objective ? Run.objective.icon : "🎯";
    el("objText").textContent = Run.objective ? Run.objective.name : "";
    el("objNum").textContent = `${Math.floor(o.cur)}/${o.goal}`;
    el("objFill").style.transform = `scaleX(${o.pct})`;
  } else {
    oc.classList.add("hidden");
  }

  // difficulty badge
  const D = DIFFS[Meta.data.difficulty] || DIFFS.normal;
  const db = el("diffBadge");
  db.textContent = D.icon + " " + D.name;
  db.style.color = D.color;

  // boss bar for the first living boss
  let boss = null;
  for (const e of G.enemies) if (e.boss && !e.dead) { boss = e; break; }
  const bb = el("bossBar");
  if (boss) {
    bb.classList.remove("hidden");
    el("bossFill").style.transform = `scaleX(${clamp(boss.hp / boss.maxHp, 0, 1)})`;
  } else {
    bb.classList.add("hidden");
  }
}

/* ---------------- level up UI ---------------- */
let currentCards = [];

function openLevelUp() {
  state = "levelup";
  G.rerolls = 0;
  const p = P();
  el("lvNum2").textContent = p.level;
  el("levelup").classList.remove("hidden");
  Sound.play("level");
  renderCards();
}

function renderCards() {
  currentCards = rollUpgrades(3);
  const wrap = el("choices");
  wrap.innerHTML = "";
  currentCards.forEach((u, i) => {
    const lv = P().upg[u.id] || 0;
    const card = document.createElement("div");
    card.className = `card r${u.rarity}`;
    card.style.setProperty("--rc", RARITY_COLOR[u.rarity]);
    let pips = "";
    for (let k = 0; k < u.max; k++) pips += `<i class="pip ${k < lv ? "on" : ""}"></i>`;
    const isNew = lv === 0 && u.weapon;
    card.innerHTML =
      `<span class="key">${i + 1}</span>` +
      (isNew ? `<span class="new">NEW</span>` : "") +
      `<span class="ico">${u.icon}</span>` +
      `<div class="nm">${u.name}</div>` +
      `<div class="ds">${u.desc(lv + 1)}</div>` +
      `<div class="pips" style="color:${RARITY_COLOR[u.rarity]}">${pips}</div>`;
    card.addEventListener("click", () => chooseCard(i));
    card.addEventListener("mouseenter", () => Sound.play("ui", { gap: 120, vol: 0.4 }));

    // 3D tilt toward the cursor
    if (matchMedia("(pointer: fine)").matches) {
      card.addEventListener("pointermove", (ev) => {
        const b = card.getBoundingClientRect();
        const px = (ev.clientX - b.left) / b.width - 0.5;
        const py = (ev.clientY - b.top) / b.height - 0.5;
        card.style.setProperty("--ry", (px * 13).toFixed(2) + "deg");
        card.style.setProperty("--rx", (-py * 11).toFixed(2) + "deg");
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--ry", "0deg");
        card.style.setProperty("--rx", "0deg");
      });
    }
    wrap.appendChild(card);
  });
  updateRerollBtn();
}

function rerollCost() {
  const free = P().freeRerolls || 0;
  if (G.rerolls < free) return 0;
  return 20 + (G.rerolls - free) * 12;
}
function updateRerollBtn() {
  const b = el("rerollBtn");
  const cost = rerollCost();
  b.textContent = cost === 0 ? `🎲 Reroll — FREE (${G.rerolls + 1})` : `🎲 Reroll — ${cost} g`;
  b.disabled = cost > 0 && G.gold < cost;
}

function chooseCard(i) {
  if (state !== "levelup") return;
  const u = currentCards[i];
  if (u) {
    const p = P();
    buyUpgrade(u);
    showBanner(u.name.toUpperCase(), u.desc(p.upg[u.id] || 1));
    burst(p.x, p.y, "#8fd0ff", 22, 220, 4, 0.7);
  }
  Sound.play("ui");
  finishLevelUp();
}

function skipLevelUp() {
  if (state !== "levelup") return;
  Sound.play("ui");
  finishLevelUp();
}

function finishLevelUp() {
  const p = P();
  p.pendingLevels = Math.max(0, p.pendingLevels - 1);
  if (p.pendingLevels > 0) {
    openLevelUp();
  } else {
    el("levelup").classList.add("hidden");
    state = "play";
  }
}

function doReroll() {
  const p = P();
  const cost = rerollCost();
  if (cost > 0 && G.gold < cost) return;
  if (cost > 0) { G.gold -= cost; G.goldSpent += cost; }
  else { p.freeRerolls = Math.max(0, (p.freeRerolls || 0) - 1); }
  G.rerolls++;
  Sound.play("ui");
  renderCards();
}

/* ---------------- banners ---------------- */
let bannerT = 0;
function showBanner(title, sub) {
  const b = el("banner");
  b.innerHTML = title + (sub ? `<small>${sub}</small>` : "");
  b.classList.remove("show");
  void b.offsetWidth;
  b.classList.add("show");
}

/* ---------------- flow ---------------- */
function startGame() {
  Sound.init();
  Sound.resume();
  for (const id of ["menuOv", "overOv", "levelup", "pauseOv", "tradeOv", "sheetOv"]) el(id).classList.add("hidden");
  Log.clear();
  resetGame();
  // difficulty + equipped accessories + armed consumables
  applyMetaToPlayer(P(), Meta.data.difficulty);
  Run.start(Meta.data.difficulty);
  state = "play";
  // opening wave so the player is never alone
  for (let i = 0; i < 9; i++) spawnEnemy(i < 3 ? "bat" : "slime");
  for (const id of ["menuOv", "overOv", "levelup", "pauseOv"]) el(id).classList.add("hidden");
  el("hint").classList.remove("fade");
  clearTimeout(bannerT);
  setTimeout(() => el("hint").classList.add("fade"), 9000);
  showBanner("SURVIVE", "the swarm is coming");
}

function pauseGame() {
  if (state !== "play") return;
  state = "pause";
  el("pauseOv").classList.remove("hidden");
  Sound.play("ui");
}
function resumeGame() {
  if (state === "trade") { closeTrade(); return; }
  if (state !== "pause") return;
  state = "play";
  el("pauseOv").classList.add("hidden");
  Sound.play("ui");
}

function gameOver() {
  state = "over";
  const p = P();
  p.dead = true;
  burst(p.x, p.y, "#8fd0ff", 40, 280, 5, 1);
  cam.shake = 18;
  Sound.play("over");

  const best = G.best;
  const isNew = G.t > best.time;
  if (isNew) {
    best.time = G.t;
    best.level = p.level;
  }
  Store.set("survivor_best", best);

  // bank unspent gold as persistent coins, plus whatever quests paid out
  const banked = Math.max(0, Math.round((G.goldTotal - G.goldSpent) * 0.5));
  Meta.finishRun({
    kills: G.kills,
    bosses: Run.c ? Run.c.bosses : 0,
    time: G.t,
    level: p.level,
    coins: banked,
  });
  Meta.data.best = isNew ? { time: G.t, level: p.level } : Meta.data.best;
  G.banked = banked;

  el("ovTime").textContent = fmtTime(G.t);
  el("ovLevel").textContent = p.level;
  el("ovKills").textContent = G.kills;
  el("ovBest").textContent = fmtTime(best.time) + (isNew ? " ★" : "");
  el("deathBy").textContent = isNew ? "new record!" : `best: ${fmtTime(best.time)} · lv ${best.level}`;

  const build = el("ovBuild");
  build.innerHTML = "";
  const ids = Object.keys(p.upg);
  if (!ids.length) build.innerHTML = `<span class="b">no powers yet</span>`;
  for (const id of ids) {
    const u = UPG.find((x) => x.id === id);
    if (!u) continue;
    const d = document.createElement("span");
    d.className = "b";
    d.innerHTML = `${u.icon} <b>${u.name}</b> ${p.upg[id]}`;
    build.appendChild(d);
  }

  const rb = el("reviveBtn");
  if (!G.reviveUsed && G.gold >= 100) rb.classList.remove("hidden");
  else rb.classList.add("hidden");

  // summary of what this run earned
  const bank = el("ovCoins");
  if (bank) {
    const parts = [];
    if (G.banked > 0) parts.push(`+${G.banked} banked`);
    if (Run.earned > 0) parts.push(`+${Run.earned} quests`);
    bank.innerHTML = parts.length
      ? `<div class="coinrow">🪙 <b>${parts.join("</b> · <b>")}</b> coins banked</div>`
      : `<div class="coinrow dim">no coins banked this run</div>`;
  }

  // quests completed this run
  const qs = el("ovQuests");
  if (qs) {
    const done = Run.questProgress().filter((q) => q.done);
    qs.innerHTML = done.length
      ? done.map((q) => `<span class="b">${q.icon} <b>${q.name}</b></span>`).join("")
      : `<span class="b dim">no quests completed</span>`;
  }

  el("overOv").classList.remove("hidden");
  updateBestLabel();
}

function revive() {
  const cost = 100;
  if (G.reviveUsed || G.gold < cost) return;
  G.gold -= cost;
  G.goldSpent += cost;
  G.reviveUsed = true;
  const p = P();
  p.hp = p.maxHp * 0.6;
  p.invuln = 2.4;
  p.dead = false;
  // clear the immediate area
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    if (dist(e.x, e.y, p.x, p.y) < 260) { e.hp = 0; burst(e.x, e.y, e.c, 8, 160, 4, 0.5); removeEnemy(e); }
  }
  burst(p.x, p.y, "#ffd25c", 40, 300, 5, 0.9);
  el("overOv").classList.add("hidden");
  state = "play";
  showBanner("REVIVED", "you are back in the swarm");
  Sound.play("level");
}

function updateBestLabel() {
  el("menuBest").innerHTML = bestLine();
}

function quitToMenu() {
  state = "menu";
  el("pauseOv").classList.add("hidden");
  el("overOv").classList.add("hidden");
  resetGame();
  openHub();
  render();
}

/* ---------------- UI wiring ---------------- */
el("playBtn").addEventListener("click", startGame);
el("againBtn").addEventListener("click", startGame);
el("menuBtn").addEventListener("click", quitToMenu);
el("quitBtn").addEventListener("click", quitToMenu);
el("pauseBtn").addEventListener("click", () => (state === "play" ? pauseGame() : resumeGame()));
el("resumeBtn").addEventListener("click", resumeGame);
el("reviveBtn").addEventListener("click", revive);
el("rerollBtn").addEventListener("click", doReroll);
el("skipBtn").addEventListener("click", skipLevelUp);

el("soundBtn").addEventListener("click", () => {
  Sound.init();
  const on = !Sound.sfxOn;
  Sound.setSfx(on);
  G.opts.sfx = on;
  el("soundBtn").classList.toggle("off", !on);
  el("soundBtn").textContent = on ? "🔊" : "🔇";
  if (on) Sound.play("ui");
  if (state === "menu") renderSettings();
});
el("musicBtn").addEventListener("click", () => {
  Sound.init();
  Sound.resume();
  const on = !Sound.musicOn;
  Sound.setMusic(on);
  G.opts.music = on;
  el("musicBtn").classList.toggle("off", !on);
  if (state === "menu") renderSettings();
});

/* ---------------- main loop ---------------- */
let last = performance.now();
let perfAvg = 1 / 60;
let perfWindow = 0;

function frame(now) {
  const dtReal = (now - last) / 1000;
  last = now;
  let dt = dtReal;
  if (!(dt > 0)) dt = 0;
  if (dt > 0.05) dt = 0.05;

  // rolling frame-time average (skip huge gaps, e.g. returning from a
  // backgrounded tab) used to protect the framerate on weak machines
  if (dtReal > 0 && dtReal < 0.2) {
    perfAvg += (dtReal - perfAvg) * 0.05;
    perfWindow += dtReal;
    if (G.opts.bloom && G.bloomAuto && perfWindow > 3 && perfAvg > 0.026) {
      G.opts.bloom = false;
      // keep the settings screen in step if it happens to be open
      if (state === "menu" && typeof renderSettings === "function") renderSettings();
      showBanner("BLOOM OFF", "keeping your framerate smooth");
    }
  }

  if (state === "play") {
    // hit-stop: freeze the simulation for a couple of frames on big hits
    if (G.hitStop > 0) {
      G.hitStop -= dt;
      dt = 0;
    }
    G.t += dt;

    // rebuild spatial hash
    compactEnemies();
    grid.clear();
    for (const e of G.enemies) grid.insert(e);

    updatePlayer(dt);
    updateWeapons(dt);
    updateEnemies(dt);
    updateBullets(dt);
    updatePickups(dt);
    updateFx(dt);
    spawnDirector(dt);
    Run.update(dt);

    // dps meter (1s window)
    G.dpsTimer += dt;
    if (G.dpsTimer >= 1) { G.dps = Math.round(G.dpsDamage / G.dpsTimer); G.dpsDamage = 0; G.dpsTimer = 0; }

    // camera
    const p = P();
    cam.x = lerp(cam.x, p.x, clamp(dt * 9, 0, 1));
    cam.y = lerp(cam.y, p.y, clamp(dt * 9, 0, 1));
  } else if (state === "menu" || state === "over" || state === "pause") {
    updateFx(dt * 0.4);
  }

  render();
  updateHud(dt);
  renderLoadoutChip();
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

/* first paint of the menu background */
cam.x = 0; cam.y = 0;
for (let i = 0; i < 26; i++) {
  spawnEnemy("slime", { at: { x: rand(-420, 420), y: rand(-260, 260) } });
}
