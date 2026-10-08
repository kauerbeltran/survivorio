"use strict";

/*
  Upgrade pool.
  rarity: 0 = common, 1 = rare, 2 = epic, 3 = legendary
  apply(p) runs when a level is bought; it mutates the player stat block.
*/

const UPG = [
  /* ---- offensive basics ---- */
  { id: "might", name: "Might", icon: "🗡️", rarity: 0, max: 6,
    desc: (l) => `+20% damage`, apply: (p) => { p.dmgPct += 0.20; } },
  { id: "wrath", name: "Wrath", icon: "🔥", rarity: 1, max: 4,
    desc: (l) => `+${15 * l}% damage`, apply: (p) => { p.dmgPct += 0.15; } },
  { id: "agility", name: "Agility", icon: "⚡", rarity: 0, max: 5,
    desc: (l) => `+${12 * l}% attack speed`, apply: (p) => { p.atkPct += 0.12; } },
  { id: "heavyshot", name: "Heavy Shots", icon: "💥", rarity: 0, max: 4,
    desc: (l) => `+${10 * l}% projectile size, +6% damage`, apply: (p) => { p.projSize += 0.10; p.dmgPct += 0.06; } },
  { id: "crit", name: "Crit", icon: "🎲", rarity: 1, max: 4,
    desc: (l) => `+${6 * l}% critical chance`, apply: (p) => { p.crit += 0.06; } },
  { id: "deadly", name: "Deadly", icon: "☠️", rarity: 1, max: 3,
    desc: (l) => `+${30 * l}% critical damage`, apply: (p) => { p.critDmg += 0.30; } },
  { id: "multi", name: "Multishot", icon: "🎯", rarity: 1, max: 4,
    desc: (l) => `+${l} projectile${l > 1 ? "s" : ""}`, apply: (p) => { p.projCount += 1; } },
  { id: "pierce", name: "Piercing", icon: "➰", rarity: 1, max: 3,
    desc: (l) => `Shots pierce ${l} extra enem${l > 1 ? "ies" : "y"}`, apply: (p) => { p.pierce += 1; } },
  { id: "slam", name: "Slam", icon: "🔨", rarity: 1, max: 3,
    desc: (l) => `+${70 * l} knockback`, apply: (p) => { p.knock += 70; } },

  /* ---- survivability ---- */
  { id: "haste", name: "Haste", icon: "👟", rarity: 0, max: 5,
    desc: (l) => `+${8 * l}% move speed`, apply: (p) => { p.spdPct += 0.08; } },
  { id: "vitality", name: "Vitality", icon: "❤️", rarity: 0, max: 5,
    desc: (l) => `+${20 * l} max HP, heal ${20 * l}`, apply: (p) => { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); } },
  { id: "regen", name: "Regeneration", icon: "🍀", rarity: 0, max: 4,
    desc: (l) => `+${(0.6 * l).toFixed(1)} HP per second`, apply: (p) => { p.regen += 0.6; } },
  { id: "armor", name: "Armor", icon: "🛡️", rarity: 1, max: 4,
    desc: (l) => `Take ${(1.5 * l).toFixed(1)} less damage`, apply: (p) => { p.armor += 1.5; } },
  { id: "dr", name: "Damage Reduction", icon: "💎", rarity: 2, max: 3,
    desc: (l) => `-${5 * l}% damage taken`, apply: (p) => { p.dr += 0.05; } },
  { id: "thorns", name: "Thorns", icon: "🌵", rarity: 2, max: 3,
    desc: (l) => `Reflect ${8 * l} damage when touched`, apply: (p) => { p.thorns += 8; } },
  { id: "phoenix", name: "Phoenix", icon: "🕊️", rarity: 3, max: 1,
    desc: () => "Cheat death once, revive with 50% HP", apply: (p) => { p.phoenix = true; } },

  /* ---- utility ---- */
  { id: "magnet", name: "Magnet", icon: "🧲", rarity: 0, max: 4,
    desc: (l) => `+${30 * l}% pickup radius`, apply: (p) => { p.magnet += 0.30; } },
  { id: "scholar", name: "Scholar", icon: "📘", rarity: 0, max: 4,
    desc: (l) => `+${12 * l}% XP gain`, apply: (p) => { p.xpGain += 0.12; } },
  { id: "greed", name: "Greed", icon: "💰", rarity: 0, max: 3,
    desc: (l) => `+${20 * l}% gold gain`, apply: (p) => { p.goldGain += 0.20; } },
  { id: "booster", name: "Booster", icon: "📦", rarity: 1, max: 3,
    desc: (l) => `+${10 * l}% chest drop chance`, apply: (p) => { p.chestChance += 0.10; } },
  { id: "vamp", name: "Vampirism", icon: "🧛", rarity: 2, max: 3,
    desc: (l) => `Heal ${(0.7 * l).toFixed(1)} HP per kill`, apply: (p) => { p.lifesteal += 0.7; } },
  { id: "frost", name: "Frost", icon: "❄️", rarity: 1, max: 3,
    desc: (l) => `${10 * l}% chance to slow enemies 45%`, apply: (p) => { p.freezeChance += 0.10; } },
  { id: "explosive", name: "Explosive", icon: "🧨", rarity: 2, max: 3,
    desc: (l) => `Kills explode for ${45 * l} damage`, apply: (p) => { p.boomDmg += 45; } },

  /* ---- weapons ---- */
  { id: "drone", name: "Drone", icon: "🛸", rarity: 1, max: 4, weapon: true,
    desc: (l) => `Gain ${l} orbiting drone${l > 1 ? "s" : ""}`, apply: (p) => { p.droneDmg += 10; } },
  { id: "bolt", name: "Lightning", icon: "🌩️", rarity: 1, max: 5, weapon: true,
    desc: (l) => l === 1 ? "Unlock lightning strikes" : `+${30 * l}% lightning damage, +1 target at 4`,
    apply: (p) => { p.boltDmgPct += 0.30; } },
  { id: "nova", name: "Nova", icon: "🔆", rarity: 1, max: 5, weapon: true,
    desc: (l) => l === 1 ? "Unlock shockwave novas" : `+${30 * l}% nova damage, +15% radius`,
    apply: (p) => { p.novaDmgPct += 0.30; p.novaSize += 0.15; } },
];

const RARITY_NAME = ["Common", "Rare", "Epic", "Legendary"];
const RARITY_COLOR = ["#6fa8ff", "#b98bff", "#ff9d4d", "#ff5d6c"];
const RARITY_BASE_WEIGHT = [100, 58, 24, 7];

function upgWeight(u) {
  const p = G && G.player;
  let w = RARITY_BASE_WEIGHT[u.rarity];
  // Epics / legendaries wait a bit so early picks feel generous.
  if (u.rarity >= 2 && p && p.level < 3) w = 0;
  if (u.rarity === 0 && p) w *= clamp(1 - p.level / 45, 0.25, 1);
  // Slight nudge toward the newest unlock so builds stay varied.
  if (p && p.upg[u.id] > 0) w *= 0.85;
  return w;
}

function rollUpgrades(n) {
  const p = G.player;
  const pool = UPG.filter((u) => (p.upg[u.id] || 0) < u.max);
  const out = [];
  while (out.length < n && pool.length) {
    const u = weightedPick(pool, upgWeight);
    pool.splice(pool.indexOf(u), 1);
    out.push(u);
  }
  return out;
}

function buyUpgrade(u) {
  const p = G.player;
  p.upg[u.id] = (p.upg[u.id] || 0) + 1;
  u.apply(p);
  if (u.id === "phoenix") showBanner("PHOENIX", "you will rise once");
  return u;
}
