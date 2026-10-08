"use strict";

/* =============================================================
   META SYSTEMS — persistent save, accessories, difficulty, quests
   Coins are earned from quests, objectives and gold banked on death.
   ============================================================= */

const META_KEY = "survivor_meta_v2";

/* ---------------- difficulty ---------------- */
const DIFFS = {
  easy: {
    key: "easy", name: "Easy", icon: "🍀", color: "#52e08a",
    hp: 0.72, dmg: 0.62, rate: 0.68, xp: 1.15, gold: 1.2, quest: 0.8, objEvery: 26, objScale: 0.7,
    blurb: "Relaxed swarm, richer rewards.",
  },
  normal: {
    key: "normal", name: "Normal", icon: "⚔️", color: "#4cc9ff",
    hp: 1, dmg: 1, rate: 1, xp: 1, gold: 1, quest: 1, objEvery: 22, objScale: 1,
    blurb: "The intended experience.",
  },
  hard: {
    key: "hard", name: "Hard", icon: "🔥", color: "#ff9d4d",
    hp: 1.28, dmg: 1.3, rate: 1.14, xp: 0.9, gold: 1.35, quest: 1.5, objEvery: 18, objScale: 1.45,
    blurb: "Denser, meaner, fatter purses.",
  },
  nightmare: {
    key: "nightmare", name: "Nightmare", icon: "💀", color: "#ff5d6c",
    hp: 2, dmg: 1.8, rate: 1.5, xp: 0.8, gold: 1.7, quest: 2.3, objEvery: 15, objScale: 2,
    blurb: "It wants you dead. Bring everything.",
  },
};
const DIFF_ORDER = ["easy", "normal", "hard", "nightmare"];

/* ---------------- accessories ----------------
   mods are additive bonuses applied to the player at run start.      */
const SHOP = [
  /* weapons */
  { id: "sw_sword", name: "Notched Sword", icon: "🗡️", cat: "weapon", cost: 150, rarity: 0,
    mods: { dmgPct: 0.07 }, desc: "+7% damage" },
  { id: "sw_hunter", name: "Hunter's Bow", icon: "🏹", cat: "weapon", cost: 320, rarity: 1,
    mods: { atkPct: 0.12 }, desc: "+12% attack speed" },
  { id: "sw_twin", name: "Twin Fangs", icon: "🦷", cat: "weapon", cost: 700, rarity: 2,
    mods: { projCount: 1 }, desc: "+1 projectile" },
  { id: "sw_rail", name: "Rail Needle", icon: "📌", cat: "weapon", cost: 1400, rarity: 3,
    mods: { pierce: 2, dmgPct: 0.15 }, desc: "+2 pierce, +15% damage" },
  /* armour */
  { id: "ar_helm", name: "Iron Helm", icon: "🔩", cat: "armour", cost: 140, rarity: 0,
    mods: { armor: 1.2 }, desc: "Take 1.2 less damage" },
  { id: "ar_pads", name: "Warded Pads", icon: "🦺", cat: "armour", cost: 300, rarity: 1,
    mods: { maxHp: 35 }, desc: "+35 max HP" },
  { id: "ar_aegis", name: "Aegis Core", icon: "🛡️", cat: "armour", cost: 850, rarity: 2,
    mods: { dr: 0.06 }, desc: "-6% damage taken" },
  /* boots / utility */
  { id: "bt_swift", name: "Swift Boots", icon: "👟", cat: "boots", cost: 180, rarity: 0,
    mods: { spdPct: 0.07 }, desc: "+7% move speed" },
  { id: "bt_grease", name: "Greased Soles", icon: "💨", cat: "boots", cost: 420, rarity: 1,
    mods: { spdPct: 0.06, dodge: 0.1 }, desc: "+6% speed, +10% dodge" },
  /* charms */
  { id: "ch_luck", name: "Rabbit's Foot", icon: "🐇", cat: "charm", cost: 200, rarity: 0,
    mods: { chestChance: 0.08 }, desc: "+8% chest drops" },
  { id: "ch_magnet", name: "Lodestone", icon: "🧲", cat: "charm", cost: 260, rarity: 0,
    mods: { magnet: 0.25 }, desc: "+25% pickup radius" },
  { id: "ch_brain", name: "Silver Brain", icon: "🧠", cat: "charm", cost: 520, rarity: 1,
    mods: { xpGain: 0.12 }, desc: "+12% XP" },
  { id: "ch_coin", name: "Gold Tooth", icon: "🦷", cat: "charm", cost: 600, rarity: 1,
    mods: { goldGain: 0.2 }, desc: "+20% gold" },
  { id: "ch_storm", name: "Storm Charm", icon: "🌩️", cat: "charm", cost: 900, rarity: 2,
    mods: { boltDmgPct: 0.4 }, desc: "+40% lightning damage" },
  { id: "ch_vamp", name: "Crimson Fang", icon: "🧛", cat: "charm", cost: 1100, rarity: 2,
    mods: { lifesteal: 0.6 }, desc: "Heal 0.6 HP per kill" },
  { id: "ch_eye", name: "Watcher Eye", icon: "👁️", cat: "charm", cost: 500, rarity: 1,
    mods: { crit: 0.07 }, desc: "+7% crit chance" },
  { id: "ch_heart", name: "Wild Heart", icon: "💚", cat: "charm", cost: 480, rarity: 1,
    mods: { regen: 0.8 }, desc: "+0.8 HP/sec" },
];
const ITEM_BY_ID = Object.fromEntries(SHOP.map((i) => [i.id, i]));

/* ---------------- consumables ---------------- */
const CONSUMABLES = [
  { id: "c_potion", name: "Health Potion", icon: "🧪", cost: 90, rarity: 0,
    desc: "+25% max HP this run", run: { maxHpPct: 0.25 } },
  { id: "c_reroll", name: "Reroll Scroll", icon: "📜", cost: 140, rarity: 0,
    desc: "+2 free rerolls this run", run: { rerolls: 2 } },
  { id: "c_revive", name: "Phoenix Feather", icon: "🔥", cost: 260, rarity: 1,
    desc: "Revive once without gold", run: { revives: 1 } },
  { id: "c_xp", name: "Scholar's Brew", icon: "☕", cost: 200, rarity: 1,
    desc: "+35% XP this run", run: { xpPct: 0.35 } },
  { id: "c_gold", name: "Money Grinder", icon: "💰", cost: 200, rarity: 1,
    desc: "+45% gold this run", run: { goldPct: 0.45 } },
];
const CONS_BY_ID = Object.fromEntries(CONSUMABLES.map((i) => [i.id, i]));

const EQUIP_SLOTS = 4;

/* ---------------- quests ---------------- */
const QUESTS = [
  { id: "q_kill80", name: "Exterminator", icon: "💀", type: "kills", goal: 80, reward: 70, rarity: 0 },
  { id: "q_kill220", name: "Swarmbreaker", icon: "🪓", type: "kills", goal: 220, reward: 150, rarity: 1 },
  { id: "q_lvl10", name: "Ascendant", icon: "🌟", type: "level", goal: 10, reward: 90, rarity: 0 },
  { id: "q_lvl18", name: "Peak Form", icon: "👑", type: "level", goal: 18, reward: 190, rarity: 2 },
  { id: "q_time150", name: "Endurance", icon: "⏳", type: "time", goal: 150, reward: 110, rarity: 1 },
  { id: "q_time300", name: "Marathon", icon: "🏃", type: "time", goal: 300, reward: 240, rarity: 2 },
  { id: "q_boss1", name: "Giant Slayer", icon: "🔨", type: "boss", goal: 1, reward: 120, rarity: 1 },
  { id: "q_boss3", name: "Head Hunter", icon: "☠️", type: "boss", goal: 3, reward: 300, rarity: 3 },
  { id: "q_elite10", name: "Elite Hunter", icon: "✨", type: "elite", goal: 10, reward: 130, rarity: 1 },
  { id: "q_chest3", name: "Treasure Hunter", icon: "💰", type: "chest", goal: 3, reward: 140, rarity: 1 },
  { id: "q_gem100", name: "Gem Collector", icon: "💎", type: "gems", goal: 100, reward: 80, rarity: 0 },
  { id: "q_nodmg45", name: "Untouchable", icon: "🕊️", type: "nodmg", goal: 45, reward: 200, rarity: 2 },
];
const QUEST_BY_ID = Object.fromEntries(QUESTS.map((q) => [q.id, q]));

/* mid-run objectives (scale with difficulty + time) */
const OBJECTIVES = [
  { id: "o_kill", name: "Kill {n} monsters", icon: "💀", type: "kills", base: 25, growth: 1.35, reward: 22 },
  { id: "o_elite", name: "Kill {n} elites", icon: "✨", type: "elite", base: 3, growth: 1.3, reward: 34 },
  { id: "o_boss", name: "Defeat a boss", icon: "🔨", type: "boss", base: 1, growth: 1, reward: 60 },
  { id: "o_time", name: "Survive {n}s", icon: "⏳", type: "time", base: 30, growth: 1.3, reward: 26 },
  { id: "o_gem", name: "Collect {n} gems", icon: "💎", type: "gems", base: 20, growth: 1.3, reward: 18 },
  { id: "o_chest", name: "Open {n} chest(s)", icon: "🧰", type: "chest", base: 1, growth: 1.5, reward: 45 },
  { id: "o_nodmg", name: "Go {n}s without being hit", icon: "🕊️", type: "nodmg", base: 20, growth: 1.25, reward: 40 },
];

/* ---------------- save ---------------- */
function defaultSave() {
  return {
    coins: 0,
    difficulty: "normal",
    owned: [],                 // accessory ids
    equipped: [],              // up to EQUIP_SLOTS accessory ids
    active: {},                // consumable id -> count, armed for next run
    loadout: [],               // quest ids chosen for next run (max 2)
    questLog: {},              // quest id -> times completed
    runs: 0, totalKills: 0, totalCoins: 0, bosses: 0, best: { time: 0, level: 1 },
  };
}

const Meta = {
  data: defaultSave(),

  load() {
    const raw = Store.get(META_KEY, null);
    this.data = Object.assign(defaultSave(), raw || {});
    if (!this.data.best) this.data.best = { time: 0, level: 1 };
    if (!DIFFS[this.data.difficulty]) this.data.difficulty = "normal";
    // drop any ids that no longer exist (e.g. after a balance change)
    this.data.owned = (this.data.owned || []).filter((id) => ITEM_BY_ID[id]);
    this.data.equipped = (this.data.equipped || []).filter((id) => ITEM_BY_ID[id]).slice(0, EQUIP_SLOTS);
    this.data.active = this.data.active || {};
    this.data.loadout = (this.data.loadout || []).filter((id) => QUEST_BY_ID[id]).slice(0, 2);
    return this.data;
  },

  save() { Store.set(META_KEY, this.data); },

  diff() { return DIFFS[this.data.difficulty] || DIFFS.normal; },

  setDifficulty(key) {
    if (!DIFFS[key]) return false;
    this.data.difficulty = key;
    this.save();
    return true;
  },

  owns(id) { return this.data.owned.indexOf(id) >= 0; },
  has(id) { return this.data.owned.indexOf(id) >= 0; },
  activeCount(id) { return this.data.active[id] || 0; },
  isEquipped(id) { return this.data.equipped.indexOf(id) >= 0; },

  buy(item) {
    if (!item || this.owns(item.id)) return false;
    if (this.data.coins < item.cost) return false;
    this.data.coins -= item.cost;
    this.data.owned.push(item.id);
    this.save();
    return true;
  },

  buyConsumable(item) {
    if (!item) return false;
    if (this.data.coins < item.cost) return false;
    this.data.coins -= item.cost;
    this.data.active[item.id] = (this.data.active[item.id] || 0) + 1;
    this.save();
    return true;
  },

  useConsumable(id) {
    if (!this.activeCount(id)) return false;
    this.data.active[id]--;
    if (this.data.active[id] <= 0) delete this.data.active[id];
    this.save();
    return true;
  },

  equip(id) {
    if (!this.owns(id) || this.isEquipped(id)) return false;
    if (this.data.equipped.length >= EQUIP_SLOTS) return false;
    this.data.equipped.push(id);
    this.save();
    return true;
  },

  unequip(id) {
    const i = this.data.equipped.indexOf(id);
    if (i < 0) return false;
    this.data.equipped.splice(i, 1);
    this.save();
    return true;
  },

  toggleEquip(id) { return this.isEquipped(id) ? (this.unequip(id), false) : this.equip(id); },

  addCoins(n) {
    n = Math.max(0, Math.round(n));
    this.data.coins += n;
    this.data.totalCoins += n;
    this.save();
  },

  /* three random quests to choose from, scaled by difficulty */
  rollQuests(n) {
    const pool = QUESTS.slice();
    shuffle(pool);
    const picks = pool.slice(0, n || 3);
    this.data.loadout = [];
    this.save();
    return picks;
  },

  toggleQuest(id) {
    const l = this.data.loadout;
    const i = l.indexOf(id);
    if (i >= 0) { l.splice(i, 1); this.save(); return false; }
    if (l.length >= 2) return false;
    l.push(id);
    this.save();
    return true;
  },

  completeQuest(id) {
    this.data.questLog[id] = (this.data.questLog[id] || 0) + 1;
    this.save();
  },

  /* consumable effects that apply to the next run */
  runMods() {
    const out = { maxHpPct: 0, rerolls: 0, revives: 0, xpPct: 0, goldPct: 0 };
    for (const id of Object.keys(this.data.active)) {
      const c = CONS_BY_ID[id];
      if (!c || !c.run) continue;
      for (const k in c.run) out[k] = (out[k] || 0) + c.run[k];
    }
    return out;
  },

  equippedMods() {
    const out = {};
    for (const id of this.data.equipped) {
      const it = ITEM_BY_ID[id];
      if (!it || !it.mods) continue;
      for (const k in it.mods) out[k] = (out[k] || 0) + it.mods[k];
    }
    return out;
  },

  finishRun(summary) {
    this.data.runs++;
    this.data.totalKills += summary.kills;
    this.data.bosses += summary.bosses || 0;
    if (summary.time > this.data.best.time) this.data.best = { time: summary.time, level: summary.level };
    if (summary.coins) this.addCoins(summary.coins);
    this.save();
  },
};

/* ---------------- helpers used by the UI ---------------- */
function goalLabel(type, goal) {
  switch (type) {
    case "kills": return `Kill ${goal} monsters`;
    case "level": return `Reach level ${goal}`;
    case "time": return `Survive ${Math.round(goal)}s`;
    case "boss": return `Defeat ${goal} boss${goal > 1 ? "es" : ""}`;
    case "elite": return `Kill ${goal} elites`;
    case "gems": return `Collect ${goal} gems`;
    case "chest": return `Open ${goal} chest${goal > 1 ? "s" : ""}`;
    case "nodmg": return `${Math.round(goal)}s without being hit`;
    case "dmg": return `Deal ${goal} damage`;
    default: return `${goal}`;
  }
}

function fmtCoins(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 10000) return (n / 1000).toFixed(1) + "k";
  return String(Math.floor(n));
}

function bestLine() {
  const b = Meta.data.best;
  const s = Meta.data;
  const bits = [];
  if (b.time > 0) bits.push(`Best <b>${fmtTime(b.time)}</b> · lv <b>${b.level}</b>`);
  if (s.runs) bits.push(`<b>${s.runs}</b> runs · <b>${s.totalKills}</b> kills · <b>${s.bosses}</b> bosses`);
  return bits.length ? bits.join(" &nbsp;·&nbsp; ") : "No runs yet — good luck!";
}

/* Build the next objective for the given difficulty and elapsed time. */
function makeObjective(t, diffKey, index) {
  const D = DIFFS[diffKey] || DIFFS.normal;
  const o = OBJECTIVES[Math.floor(Math.random() * OBJECTIVES.length)];
  let n = Math.round((o.base + t / 26) * o.growth * D.objScale * (1 + index * 0.18));
  if (o.type === "boss" || o.type === "chest") n = Math.max(1, Math.round(n * D.objScale));
  if (o.type === "nodmg") n = Math.max(15, Math.round(n / 2));
  const reward = Math.round(o.reward * D.objScale * (1 + index * 0.2));
  return { id: o.id + "_" + Math.floor(Math.random() * 1e6), name: o.name.replace("{n}", n), icon: o.icon, type: o.type, goal: n, reward, progress: 0, done: false };
}

/* Apply equipped accessories + armed consumables to a fresh player. */
function applyMetaToPlayer(p, diffKey) {
  const mods = Meta.equippedMods();
  const run = Meta.runMods();
  const D = DIFFS[diffKey] || DIFFS.normal;

  for (const k in mods) {
    if (k === "maxHp") { p.maxHp += mods.maxHp; p.hp += mods.maxHp; }
    else if (k === "projCount" || k === "pierce") p[k] = (p[k] || 0) + mods[k];
    else p[k] = (p[k] || 0) + mods[k];
  }
  if (run.maxHpPct) { const add = Math.round(p.maxHp * run.maxHpPct); p.maxHp += add; p.hp += add; }
  if (run.xpPct) p.xpGain += run.xpPct;
  if (run.goldPct) p.goldGain += run.goldPct;
  if (run.revives) p.revives = (p.revives || 0) + run.revives;

  // difficulty reward multipliers apply on top
  p.diffXp = D.xp;
  p.diffGold = D.gold;

  // scale the base level-1 feel per difficulty without touching the curve
  p.freeRerolls = run.rerolls || 0;
  return p;
}

Meta.load();
