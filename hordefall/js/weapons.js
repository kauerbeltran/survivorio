"use strict";

/* =============================================================
   WEAPONS — purchased mid-run, each with distinct behaviour
   ============================================================= */

/* kind:
   arc        melee sweep in the facing direction
   fast       rapid single target, applies bleed
   pierce     long range, passes through enemies
   homing     projectiles that steer toward enemies
   splash     heavy shot with an area blast
   orbit      blades circling the player
   boomer     flies out, pierces, comes back
   defarc     wide defensive sweep, grants damage reduction
*/

const WEAPONS = [
  {
    id: "w_bow", name: "Shortbow", icon: "🏹", starter: true,
    kind: "pierce", dmg: 12, cd: 0.33, speed: 520, pierce: 0, max: 5,
    lvDmg: 4, lvPierce: 0, cost: 90,
    color: "#ffe9a8",
    desc: "Your first weapon. Quick, honest, replaceable.",
  },
  {
    id: "w_sword", name: "Iron Sword", icon: "🗡️",
    kind: "arc", dmg: 22, cd: 0.7, range: 112, arc: 1.9, max: 5,
    lvDmg: 7, lvArc: 0.1, cost: 140,
    color: "#cfe4ff",
    ability: { id: "whirlwind", name: "Whirlwind", cd: 6, mult: 2.5, radius: 145, desc: "Spin: 2.5x damage all around" },
    desc: "Sweeping melee arc. Hits everything in front.",
  },
  {
    id: "w_dagger", name: "Bloodfang", icon: "🗡️",
    kind: "fast", dmg: 8, cd: 0.16, speed: 560, critBonus: 0.25, max: 5,
    lvDmg: 3, lvCrit: 0.05, cost: 220,
    color: "#ff9db0",
    desc: "Very fast, crits hard, leaves bleeding targets.",
  },
  {
    id: "w_bow2", name: "Longbow", icon: "🏹",
    kind: "pierce", dmg: 26, cd: 0.75, speed: 640, pierce: 3, max: 5,
    lvDmg: 8, lvPierce: 1, cost: 280,
    color: "#a8f0c8",
    desc: "Slow, heavy, pierces a whole line of monsters.",
  },
  {
    id: "w_staff", name: "Ember Staff", icon: "🔮",
    kind: "homing", dmg: 13, cd: 1.0, speed: 330, count: 3, max: 5,
    lvDmg: 4, lvCount: 1, cost: 380,
    color: "#9ee7ff",
    ability: { id: "meteors", name: "Meteors", cd: 8, count: 5, mult: 2, desc: "Call down 5 meteors on nearby foes" },
    desc: "Slow seeking orbs that never miss.",
  },
  {
    id: "w_flail", name: "Guard Flail", icon: "⚒️",
    kind: "defarc", dmg: 18, cd: 0.85, range: 108, arc: 3.4, max: 5,
    lvDmg: 6, lvArc: 0.12, cost: 340,
    color: "#c9b6ff",
    dr: 0.12,
    desc: "Wild, wide swings. While held you take 12% less damage.",
  },
  {
    id: "w_orb", name: "Gyro Blades", icon: "⚙️",
    kind: "orbit", dmg: 17, cd: 0.34, count: 2, radius: 74, max: 5,
    lvDmg: 6, lvCount: 1, cost: 460,
    color: "#b8f5ff",
    desc: "Blades circle you, cutting whatever comes close.",
  },
  {
    id: "w_boom", name: "Boomerang", icon: "🪃",
    kind: "boomer", dmg: 30, cd: 1.15, speed: 430, pierce: 4, max: 5,
    lvDmg: 10, lvPierce: 1, cost: 520,
    color: "#ffce4d",
    desc: "Flies out through the horde and back again.",
  },
  {
    id: "w_cannon", name: "Hand Cannon", icon: "💣",
    kind: "splash", dmg: 40, cd: 1.3, speed: 380, splash: 72, max: 5,
    lvDmg: 14, lvSplash: 6, cost: 600,
    color: "#ffb37a",
    ability: { id: "slam", name: "Ground Slam", cd: 7, mult: 3, radius: 128, knock: 260, desc: "Slam the ground: 3x damage, huge knockback" },
    desc: "Slow heavy shot with a wide blast.",
  },
];
const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

const LOADOUT_SLOTS = 2;

/* ---------------- run state ---------------- */
const Armory = {
  owned: {},          // id -> level
  order: [],          // loadout ids, max LOADOUT_SLOTS
  merchant: null,     // { x, y, t } on the field
  merchantT: 0,
  abilityCd: {},
  arcs: [],
  orbits: [],
  booms: [],

  reset() {
    this.owned = {};
    this.order = [];
    this.merchant = null;
    this.merchantT = 22 + Math.random() * 14;
    this.abilityCd = {};
    this.arcs = [];
    this.orbits = [];
    this.booms = [];
    const s = WEAPONS.find((w) => w.starter);
    this.owned[s.id] = 1;
    this.order = [s.id];
  },

  level(id) { return this.owned[id] || 0; },
  has(id) { return this.level(id) > 0; },
  equipped(id) { return this.order.indexOf(id) >= 0; },
  defs() { return this.order.map((id) => WEAPON_BY_ID[id]).filter(Boolean); },

  /* damage for a weapon at its current level, after player upgrades */
  weaponDamage(w) {
    const p = P();
    const lv = this.level(w.id);
    let d = w.dmg + (lv - 1) * (w.lvDmg || 0);
    return d * (1 + (p.dmgPct || 0));
  },

  /* attack speed shortens the cooldown of whatever is actually held, the same
     way weaponDamage applies damage scaling, so Agility and Hunter's Bow move
     the real fire rate. Orbit weapons are exempt: their rate comes from the
     blade rotation in updateArmory, not from a per-shot cooldown. */
  weaponCooldown(w) {
    return w.cd / (1 + (P().atkPct || 0));
  },

  /* extra projectiles / pierce granted by upgrades, per weapon */
  shotStats(w) {
    const p = P();
    let count = 1, pierce = w.pierce || 0, size = w.speed ? 5 * (1 + (p.projSize || 0)) : 0;
    if (w.kind === "arc" || w.kind === "defarc" || w.kind === "orbit") {
      count = 1;
    } else {
      count = (w.count || 1) + (w.lvCount ? (this.level(w.id) - 1) * w.lvCount : 0);
      count += (p.projCount || 0) - 1;
      pierce += (p.pierce || 0) + (w.lvPierce ? (this.level(w.id) - 1) * w.lvPierce : 0);
    }
    if (w.kind === "fast") pierce += (p.projCount || 0) - 1;
    return { count: Math.max(1, count), pierce: Math.max(0, pierce), size };
  },

  critChance(w) {
    const p = P();
    return (p.crit || 0) + (w.critBonus || 0) + (w.lvCrit ? (this.level(w.id) - 1) * w.lvCrit : 0);
  },

  /* the defensive weapon grants damage reduction while it is held */
  grantedDr() {
    let dr = 0;
    for (const w of this.defs()) dr += w.dr || 0;
    return dr;
  },

  /* ---- buying ---- */
  priceOf(w, p) {
    const lv = this.level(w.id);
    if (lv === 0) return w.cost;
    if (lv >= w.max) return Infinity;
    return Math.round(w.cost * (0.55 + lv * 0.45));
  },

  canBuy(w, gold, free) {
    if (!w) return false;
    if (this.level(w.id) >= w.max) return false;
    return free || gold >= this.priceOf(w, gold);
  },

  buy(w, gold, free) {
    if (!w) return { ok: false, why: "not for sale" };
    const lv = this.level(w.id);
    if (lv >= w.max) return { ok: false, why: "already maxed" };
    const price = free ? 0 : this.priceOf(w, gold);
    if (!free && gold < price) return { ok: false, why: "not enough gold" };
    const isNew = lv === 0;
    this.owned[w.id] = lv + 1;
    if (isNew) {
      // a new weapon only takes a slot if one is free, otherwise it upgrades
      if (this.order.length < LOADOUT_SLOTS) this.order.push(w.id);
      else this.replaceHeld(w.id);
    }
    if (!free) { G.gold -= price; G.goldSpent += price; }
    return { ok: true, price, isNew };
  },

  replaceHeld(id) {
    // weakest damage-per-second held weapon makes way. DPS is damage per
    // cooldown, and both halves go through the scaling getters so an
    // attack-speed build ranks on its real fire rate.
    let worst = 0, worstScore = Infinity;
    for (let i = 0; i < this.order.length; i++) {
      const w = WEAPON_BY_ID[this.order[i]];
      const score = this.weaponDamage(w) / this.weaponCooldown(w);
      if (score < worstScore) { worstScore = score; worst = i; }
    }
    this.order[worst] = id;
  },

  /* free drops from chests / elites / bosses */
  grantRandom(rng) {
    const owned = WEAPONS.filter((w) => this.level(w.id) < w.max);
    if (!owned.length) return null;
    const w = owned[(rng || Math.random)() * owned.length | 0];
    const r = this.buy(w, 0, true);
    return r.ok ? { w, isNew: r.isNew } : null;
  },

  /* ---- merchant ---- */
  updateMerchant(dt) {
    const p = P();
    if (this.merchant) {
      this.merchant.t += dt;
      const d = dist(this.merchant.x, this.merchant.y, p.x, p.y);
      this.merchant.near = d < 110;
      if (d > 2400) this.merchant = null; // drifted too far, come back later
      return;
    }
    this.merchantT -= dt;
    if (this.merchantT <= 0) {
      this.merchantT = 40 + Math.random() * 25;
      const a = rand(0, TAU);
      const d = 320 + rand(0, 260);
      this.merchant = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, t: 0, near: false };
      showBanner("MERCHANT", "a trader wanders nearby");
      Sound.play("chest", { gap: 200 });
    }
  },
};

/* ---------------- firing ---------------- */
function targetEnemy(x, y, maxD) {
  let best = null, bd = (maxD || 620) * (maxD || 620);
  for (const e of G.enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - y;
    const d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

function fireWeapon(w) {
  const p = P();
  const base = Armory.weaponDamage(w);
  const st = Armory.shotStats(w);
  const aim = targetEnemy(p.x, p.y, 620);
  const ang = aim ? Math.atan2(aim.y - p.y, aim.x - p.x) : p.face;

  switch (w.kind) {
    case "arc":
    case "defarc": {
      const lv = Armory.level(w.id);
      const arc = (w.arc || 2) + (w.lvArc ? (lv - 1) * w.lvArc : 0);
      const range = (w.range || 110) * (1 + (p.projSize || 0) * 0.5);
      Armory.arcs.push({ x: p.x, y: p.y, ang, arc, range, t: 0, life: 0.2, dmg: base, c: w.color });
      let hit = 0;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d > range + e.r) continue;
        let a = Math.atan2(dy, dx) - ang;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) > arc / 2) continue;
        const nx = dx / (d || 1), ny = dy / (d || 1);
        damageEnemy(e, base, { kx: nx, ky: ny, critChance: Armory.critChance(w), color: w.color });
        hit++;
      }
      Sound.play("shoot", { pitch: w.kind === "defarc" ? 0.7 : 0.95, gap: 60 });
      break;
    }

    case "orbit": {
      // orbit weapons have no "fire" - their blades are positioned every frame
      // in updateArmory, and they are skipped by the cooldown loop below.
      break;
    }

    case "boomer": {
      G.bullets.push({
        x: p.x + Math.cos(ang) * (p.r + 6), y: p.y + Math.sin(ang) * (p.r + 6),
        px: p.x, py: p.y,
        vx: Math.cos(ang) * w.speed, vy: Math.sin(ang) * w.speed,
        dmg: base, r: 8, pierce: st.pierce, hits: [], life: 3, ang,
        kind: "boomer", home: 0, maxPierce: st.pierce, color: w.color, critChance: Armory.critChance(w),
      });
      Sound.play("shoot", { pitch: 0.85, gap: 70 });
      break;
    }

    case "splash": {
      const lv = Armory.level(w.id);
      G.bullets.push({
        x: p.x + Math.cos(ang) * (p.r + 6), y: p.y + Math.sin(ang) * (p.r + 6),
        px: p.x, py: p.y,
        vx: Math.cos(ang) * w.speed, vy: Math.sin(ang) * w.speed,
        dmg: base, r: 9, pierce: 0, hits: [], life: 1.6, ang,
        kind: "splash", splash: (w.splash || 70) + (lv - 1) * (w.lvSplash || 0),
        color: w.color, critChance: Armory.critChance(w), knock: 120,
      });
      cam.shake = Math.max(cam.shake, 3);
      Sound.play("shoot", { pitch: 0.6, gap: 90 });
      break;
    }

    case "homing": {
      for (let i = 0; i < st.count; i++) {
        const a = ang + (i - (st.count - 1) / 2) * 0.45;
        G.bullets.push({
          x: p.x + Math.cos(a) * (p.r + 6), y: p.y + Math.sin(a) * (p.r + 6),
          px: p.x, py: p.y,
          vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
          dmg: base, r: 7, pierce: 0, hits: [], life: 3.2, ang: a,
          kind: "homing", color: w.color, critChance: Armory.critChance(w),
        });
      }
      Sound.play("shoot", { pitch: 1.15, gap: 80, vol: 0.6 });
      break;
    }

    case "fast": {
      for (let i = 0; i < st.count; i++) {
        const a = ang + rand(-0.12, 0.12);
        G.bullets.push({
          x: p.x + Math.cos(a) * (p.r + 4), y: p.y + Math.sin(a) * (p.r + 4),
          px: p.x, py: p.y,
          vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
          dmg: base, r: 4, pierce: st.pierce, hits: [], life: 0.9, ang: a,
          kind: "fast", bleed: 3 + base * 0.25, color: w.color, critChance: Armory.critChance(w),
        });
      }
      Sound.play("shoot", { pitch: 1.4, gap: 45, vol: 0.35 });
      break;
    }

    default: { // pierce (shortbow / longbow)
      for (let i = 0; i < st.count; i++) {
        const a = ang + (st.count > 1 ? (i - (st.count - 1) / 2) * 0.14 : rand(-0.02, 0.02));
        G.bullets.push({
          x: p.x + Math.cos(a) * (p.r + 6), y: p.y + Math.sin(a) * (p.r + 6),
          px: p.x, py: p.y,
          vx: Math.cos(a) * w.speed, vy: Math.sin(a) * w.speed,
          dmg: base, r: st.size || 6, pierce: st.pierce, hits: [], life: 1.5, ang: a,
          kind: "pierce", color: w.color, critChance: Armory.critChance(w),
        });
      }
      Sound.play("shoot", { pitch: 1.0, gap: 40, vol: 0.5 });
    }
  }
}

/* ---------------- active abilities ---------------- */
function triggerAbility() {
  const p = P();
  for (const w of Armory.defs()) {
    if (!w.ability) continue;
    const ab = w.ability;
    if ((Armory.abilityCd[w.id] || 0) > 0) continue;
    Armory.abilityCd[w.id] = ab.cd;
    const dmg = Armory.weaponDamage(w) * ab.mult;
    if (ab.id === "whirlwind") {
      Armory.arcs.push({ x: p.x, y: p.y, ang: rand(0, TAU), arc: TAU, range: ab.radius, t: 0, life: 0.34, dmg, c: w.color, big: true });
      for (const e of G.enemies) {
        if (e.dead) continue;
        const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
        if (d > ab.radius + e.r) continue;
        damageEnemy(e, dmg, { kx: dx / d, ky: dy / d, knock: 90, color: w.color });
      }
      cam.shake = Math.max(cam.shake, 5);
      Sound.play("nova", { vol: 0.7 });
    } else if (ab.id === "slam") {
      const t = targetEnemy(p.x, p.y, 520);
      const ang = t ? Math.atan2(t.y - p.y, t.x - p.x) : p.face;
      const cx = p.x + Math.cos(ang) * 150, cy = p.y + Math.sin(ang) * 150;
      G.novas.push({ x: cx, y: cy, r: 8, max: ab.radius, t: 0, life: 0.4 });
      G.rings.push({ x: cx, y: cy, r: 10, max: ab.radius, t: 0, life: 0.45, c: "#ffb37a" });
      for (const e of G.enemies) {
        if (e.dead) continue;
        const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy) || 1;
        if (d > ab.radius + e.r) continue;
        damageEnemy(e, dmg, { kx: dx / d, ky: dy / d, knock: ab.knock, color: w.color });
      }
      cam.shake = Math.max(cam.shake, 10);
      Sound.play("boom");
    } else if (ab.id === "meteors") {
      const pool = G.enemies.filter((e) => !e.dead);
      for (let i = 0; i < ab.count; i++) {
        const e = pool.length ? pool[(Math.random() * pool.length) | 0] : null;
        const tx = e ? e.x : p.x + rand(-260, 260);
        const ty = e ? e.y : p.y + rand(-260, 260);
        G.bullets.push({
          x: tx, y: ty - 300, px: tx, py: ty - 300,
          vx: 0, vy: 620, dmg: dmg, r: 10, pierce: 0, hits: [], life: 0.7, ang: Math.PI / 2,
          kind: "splash", splash: 62, color: "#ff9d4d", critChance: 0, knock: 80, meteor: true,
        });
      }
      showBanner("METEORS", "falling from above");
      Sound.play("zap", { vol: 0.8 });
    }
    p.slash = 0.2;
    return true;
  }
  return false;
}

/* ---------------- per-frame ---------------- */
function updateArmory(dt) {
  const p = P();
  // rebuilt from scratch every frame - these are current positions, not a
  // history. Leaving them to accumulate smears the blades across the screen.
  Armory.orbits.length = 0;

  // weapon cooldowns
  if (!p.weaponCd) p.weaponCd = {};
  for (const w of Armory.defs()) {
    if (w.kind === "orbit") continue;
    p.weaponCd[w.id] = (p.weaponCd[w.id] || 0) - dt;
    if (p.weaponCd[w.id] <= 0) {
      p.weaponCd[w.id] = Armory.weaponCooldown(w);
      fireWeapon(w);
    }
  }

  // orbiting blades
  const orbitDefs = Armory.defs().filter((w) => w.kind === "orbit");
  p.orbitAng = (p.orbitAng || 0) + dt * 3.1;
  if (orbitDefs.length) {
    let total = 0;
    for (const w of orbitDefs) total += (w.count || 1) + (w.lvCount ? (Armory.level(w.id) - 1) * w.lvCount : 0);
    let i = 0;
    for (const w of orbitDefs) {
      const n = (w.count || 1) + (w.lvCount ? (Armory.level(w.id) - 1) * w.lvCount : 0);
      for (let k = 0; k < n; k++, i++) {
        const a = p.orbitAng + (i / Math.max(1, total)) * TAU;
        const bx = p.x + Math.cos(a) * (w.radius || 74);
        const by = p.y + Math.sin(a) * (w.radius || 74);
        Armory.orbits.push({ id: w.id, x: bx, y: by, a, dmg: Armory.weaponDamage(w), color: w.color });
      }
    }
    // damage anything the blades touch
    for (const b of Armory.orbits) {
      for (const e of G.enemies) {
        if (e.dead || e.orbitHit > 0) continue;
        if (dist(e.x, e.y, b.x, b.y) < 20 + e.r) {
          e.orbitHit = 0.3;
          const dx = e.x - b.x, dy = e.y - b.y, d = Math.hypot(dx, dy) || 1;
          damageEnemy(e, b.dmg, { kx: dx / d, ky: dy / d, knock: 20, critChance: Armory.critChance(WEAPON_BY_ID[b.id]) });
        }
      }
    }
  }

  // swing arcs
  for (let i = Armory.arcs.length - 1; i >= 0; i--) {
    const a = Armory.arcs[i];
    a.t += dt;
    if (a.t >= a.life) Armory.arcs.splice(i, 1);
  }

  for (const k in Armory.abilityCd) {
    if (Armory.abilityCd[k] > 0) Armory.abilityCd[k] = Math.max(0, Armory.abilityCd[k] - dt);
  }

  Armory.updateMerchant(dt);
}

/* bleed / orbit-hit timers live on enemies */
function tickWeaponStatuses(dt) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (e.orbitHit > 0) e.orbitHit -= dt;
    if (e.bleed > 0) {
      e.bleed -= dt;
      if (Math.random() < dt * 6) {
        damageEnemy(e, e.bleedDps, { color: "#ff9db0" });
      }
    }
  }
}
