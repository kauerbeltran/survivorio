"use strict";

/* =============================================================
   RPG UI — character sheet, status readout, message log
   Classic fantasy-menu conventions: stone frames, gold trim,
   keyboard-first navigation. The look is permanent, not a toggle.
   ============================================================= */

/* ---------------- character sheet ---------------- */
/* Derived entirely from the live player stat block - never hardcoded. */
function sheetStats() {
  const p = P();
  const dps = Armory.defs().reduce((a, w) => a + Armory.weaponDamage(w) / w.cd, 0);
  const mods = Meta.equippedMods();
  return {
    level: p.level,
    hp: p.hp, maxHp: p.maxHp,
    xp: p.xp, xpNeed: p.xpNeed,
    dmg: Math.round(dps),
    atk: Math.round(p.dmgPct * 100),
    def: Math.round(p.armor + Armory.grantedDr() * 100 + p.dr * 100),
    spd: Math.round(p.spdPct * 100),
    crit: Math.round(p.crit * 100),
    luck: Math.round((p.chestChance || 0) * 100 + (p.goldGain || 0) * 50),
    weaponDps: Math.round(dps),
    gold: G.gold,
    kills: G.kills,
    diff: DIFFS[Meta.data.difficulty],
    weapons: Armory.defs().map((w) => ({ w, lv: Armory.level(w.id) })),
    accessories: Meta.data.equipped.map((id) => ITEM_BY_ID[id]).filter(Boolean),
    accessoryCount: Meta.data.equipped.length + "/" + EQUIP_SLOTS,
  };
}

function openSheet() {
  if (state !== "play" && state !== "pause") return;
  state = "sheet";
  el("sheetOv").classList.remove("hidden");
  renderSheet();
  Sound.play("ui");
}
function closeSheet() {
  el("sheetOv").classList.add("hidden");
  state = "pause";
  el("pauseOv").classList.remove("hidden");
}

function renderSheet() {
  const s = sheetStats();
  const box = el("sheetBody");
  if (!box) return;
  box.innerHTML = "";

  // portrait medallion
  const port = document.createElement("div");
  port.className = "medallion";
  port.innerHTML =
    `<div class="portrait">⚔</div>` +
    `<div class="pname">${s.level >= 40 ? "Wanderer" : s.level >= 25 ? "Slayer" : s.level >= 12 ? "Adventurer" : "Novice"}</div>` +
    `<div class="plevel">LEVEL ${s.level}</div>`;
  box.appendChild(port);

  // bars
  const bars = document.createElement("div");
  bars.className = "sheetbars";
  bars.innerHTML =
    `<div class="sbar hp"><i style="width:${clamp((s.hp / s.maxHp) * 100, 0, 100)}%"></i>` +
      `<span>VITALITY</span><b>${Math.ceil(s.hp)} / ${Math.round(s.maxHp)}</b></div>` +
    `<div class="sbar xp"><i style="width:${clamp((s.xp / s.xpNeed) * 100, 0, 100)}%"></i>` +
      `<span>EXPERIENCE</span><b>${Math.floor(s.xp)} / ${s.xpNeed}</b></div>`;
  box.appendChild(bars);

  // stat grid
  const grid = document.createElement("div");
  grid.className = "statgrid";
  const stat = (name, val, hint) =>
    `<div class="stat"><span>${name}</span><b>${val}</b>${hint ? `<em>${hint}</em>` : ""}</div>`;
  grid.innerHTML =
    stat("ATTACK", s.dmg + "%", "of base") +
    stat("DEFENCE", s.def + "%", "damage cut") +
    stat("SPEED", s.spd + "%", "movement") +
    stat("CRIT", s.crit + "%", "chance") +
    stat("LUCK", s.luck + "%", "chests") +
    stat("GOLD", s.gold + " g", "in purse");
  box.appendChild(grid);

  // equipment
  const eq = document.createElement("div");
  eq.className = "paperdoll";
  const slotRow = (label, content) =>
    `<div class="dollslot"><span class="dl">${label}</span>${content}</div>`;
  const wA = s.weapons[0], wB = s.weapons[1];
  eq.innerHTML =
    `<div class="dollhead">WIELDING</div>` +
    slotRow("MAIN HAND", wA ? `<b>${wA.w.icon} ${wA.w.name}</b><em>lv ${wA.lv}/${wA.w.max}</em>` : `<b>—</b>`) +
    slotRow("OFF HAND", wB ? `<b>${wB.w.icon} ${wB.w.name}</b><em>lv ${wB.lv}/${wB.w.max}</em>` : `<b>—</b>`) +
    slotRow("CHARMS", s.accessories.length
      ? s.accessories.map((a) => `<b>${a.icon} ${a.name}</b><em>${a.desc}</em>`).join("")
      : `<b>—</b><em>${s.accessoryCount} slots filled</em>`) +
    slotRow("QUEST", `<b>${Meta.data.loadout.length}/2 chosen</b><em>${Meta.data.difficulty === "normal" ? "" : "×" + DIFFS[Meta.data.difficulty].quest.toFixed(2) + " reward"}</em>`);
  box.appendChild(eq);
}

/* ---------------- message log ----------------
   Deliberately uses document.getElementById directly rather than the `el`
   helper: this file loads before game.js, so it must not depend on it. */
const Log = {
  lines: [],
  max: 6,
  push(text, tone) {
    this.lines.push({ text, tone: tone || "" });
    if (this.lines.length > this.max) this.lines.shift();
    this.render();
  },
  render() {
    const box = document.getElementById("logBox");
    if (!box) return;
    box.innerHTML = this.lines
      .map((l) => `<div class="logline ${l.tone}">${l.text}</div>`)
      .join("");
  },
  clear() {
    this.lines.length = 0;
    this.render();
  },
};

/* The message log needs to see things that happen deep in the engine. That
   patching lives at the bottom of ui.js (the last script to load) because it
   rewrites functions declared in game.js - this file only defines things. */

// Log the opening line. defer scripts run after parsing, so the box exists.
Log.push("The horde gathers. Survive.", "");
