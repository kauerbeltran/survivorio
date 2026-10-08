"use strict";

/* =============================================================
   HUB UI — menu tabs, difficulty, quests, shop, inventory
   ============================================================= */

const Shop = {
  filter: "all",
  questOffers: [],
  questTab: null,
  wipeArmed: false,
};

/* ---------------- tabs ---------------- */
function showTab(name) {
  for (const t of document.querySelectorAll(".tab")) t.classList.toggle("active", t.dataset.tab === name);
  for (const p of document.querySelectorAll(".tabpane")) p.classList.toggle("active", p.id === "pane-" + name);
  if (name === "shop") renderShop();
  if (name === "inv") renderInventory();
  if (name === "quest") renderQuestLibrary();
  if (name === "play") renderPlay();
  if (name === "settings") { Shop.wipeArmed = false; renderSettings(); }
}

/* ---------------- play tab ---------------- */
function renderPlay() {
  el("coinCount").textContent = fmtCoins(Meta.data.coins);

  // difficulty
  const row = el("diffRow");
  row.innerHTML = "";
  for (const key of DIFF_ORDER) {
    const D = DIFFS[key];
    const on = Meta.data.difficulty === key;
    const b = document.createElement("button");
    b.className = "diffcard" + (on ? " on" : "");
    b.style.setProperty("--dc", D.color);
    const baseline = D.hp === 1 && D.rate === 1;
    const stats = baseline
      ? "baseline enemy stats"
      : `${D.hp > 1 ? "+" : "−"}${Math.round(Math.abs(1 - D.hp) * 100)}% enemy HP · ` +
        `${D.rate > 1 ? "+" : "−"}${Math.round(Math.abs(1 - D.rate) * 100)}% spawn rate`;
    b.innerHTML =
      `<span class="dic">${D.icon}</span>` +
      `<span class="dname">${D.name}</span>` +
      `<span class="dblurb">${D.blurb}</span>` +
      `<span class="drewards">XP ×${D.xp.toFixed(2)} · gold ×${D.gold.toFixed(2)} · quests ×${D.quest.toFixed(2)}</span>` +
      `<span class="dstat">${stats}</span>`;
    b.addEventListener("click", () => {
      Sound.init();
      Sound.play("ui");
      Meta.setDifficulty(key);
      Shop.questOffers = Meta.rollQuests(3); // fresh offers, difficulty-scaled rewards
      renderPlay();
      renderQuestLibrary();
    });
    row.appendChild(b);
  }

  // quest offers
  const qp = el("questPick");
  qp.innerHTML = "";
  if (!Shop.questOffers.length) Shop.questOffers = Meta.rollQuests(3);
  for (const q of Shop.questOffers) {
    const picked = Meta.data.loadout.indexOf(q.id) >= 0;
    const full = Meta.data.loadout.length >= 2 && !picked;
    const b = document.createElement("button");
    b.className = "qcard r" + q.rarity + (picked ? " on" : "") + (full ? " locked" : "");
    const done = Meta.data.questLog[q.id] || 0;
    b.innerHTML =
      `<span class="qicon">${q.icon}</span>` +
      `<span class="qname">${q.name}</span>` +
      `<span class="qgoal">${goalLabel(q.type, q.goal)}</span>` +
      `<span class="qrew">+${Math.round(q.reward * DIFFS[Meta.data.difficulty].quest)} coins</span>` +
      (done ? `<span class="qdone">done ×${done}</span>` : "");
    b.addEventListener("click", () => {
      Sound.init();
      const r = Meta.toggleQuest(q.id);
      if (r === false && Meta.data.loadout.length < 2) return;
      Sound.play("ui");
      renderPlay();
    });
    qp.appendChild(b);
  }
  if (!Meta.data.loadout.length) {
    const hint = document.createElement("div");
    hint.className = "qhint";
    hint.textContent = "No quest selected — you can still play, but the rewards are wasted.";
    qp.appendChild(hint);
  }

  // loadout slots
  const sr = el("slotRow");
  sr.innerHTML = "";
  for (let i = 0; i < EQUIP_SLOTS; i++) {
    const id = Meta.data.equipped[i];
    const it = id ? ITEM_BY_ID[id] : null;
    const s = document.createElement("div");
    s.className = "slot" + (it ? " filled r" + it.rarity : " empty");
    s.innerHTML = it ? `<span>${it.icon}</span><b>${it.name}</b>` : `<span>+</span>`;
    sr.appendChild(s);
  }

  // armed consumables
  const br = el("boostRow");
  br.innerHTML = "";
  const actives = Object.keys(Meta.data.active).filter((id) => Meta.data.active[id] > 0);
  if (!actives.length) {
    br.innerHTML = `<span class="b dim">no consumables armed — buy some in the shop</span>`;
  } else {
    for (const id of actives) {
      const c = CONS_BY_ID[id];
      const chip = document.createElement("span");
      chip.className = "b";
      chip.innerHTML = `${c.icon} <b>${c.name}</b> ×${Meta.data.active[id]}`;
      br.appendChild(chip);
    }
  }

  el("menuBest").innerHTML = bestLine();
}

/* ---------------- shop ---------------- */
const SHOP_CATS = [
  { key: "all", name: "All" },
  { key: "weapon", name: "Weapons" },
  { key: "armour", name: "Armour" },
  { key: "boots", name: "Boots" },
  { key: "charm", name: "Charms" },
  { key: "cons", name: "Consumables" },
];

function renderShop() {
  el("coinCount").textContent = fmtCoins(Meta.data.coins);
  const fr = el("shopFilters");
  if (!fr.children.length) {
    for (const c of SHOP_CATS) {
      const b = document.createElement("button");
      b.className = "chip" + (c.key === Shop.filter ? " on" : "");
      b.textContent = c.name;
      b.addEventListener("click", () => {
        Shop.filter = c.key;
        for (const x of fr.children) x.classList.toggle("on", x.textContent === c.name);
        renderShop();
      });
      fr.appendChild(b);
    }
  }

  const grid = el("shopGrid");
  grid.innerHTML = "";
  const D = DIFFS[Meta.data.difficulty];

  const items = SHOP.concat(CONSUMABLES).filter((it) => {
    if (Shop.filter === "all") return true;
    if (Shop.filter === "cons") return !!CONS_BY_ID[it.id];
    return !CONS_BY_ID[it.id] && it.cat === Shop.filter;
  });

  for (const it of items) {
    const isCons = !!CONS_BY_ID[it.id];
    const owned = isCons ? false : Meta.owns(it.id);
    const equipped = !isCons && Meta.isEquipped(it.id);
    const afford = Meta.data.coins >= it.cost;

    const card = document.createElement("div");
    card.className = `item r${it.rarity}${owned ? " owned" : ""}${equipped ? " equipped" : ""}${!afford && !owned ? " poor" : ""}`;
    card.style.setProperty("--rc", RARITY_COLOR[it.rarity]);
    const reward = isCons ? "" : owned ? `<span class="iperk">bonus while equipped</span>` : "";
    card.innerHTML =
      `<span class="iicon">${it.icon}</span>` +
      `<span class="iname">${it.name}</span>` +
      `<span class="idesc">${it.desc}</span>` +
      reward +
      `<span class="icost">${it.cost}</span>` +
      (owned ? `<span class="iowned">${equipped ? "EQUIPPED" : "OWNED"}</span>` : "");
    const btn = document.createElement("button");
    btn.className = "ibtn";
    if (owned) {
      btn.textContent = equipped ? "Unequip" : "Equip";
      btn.classList.add("ghost");
      btn.addEventListener("click", () => {
        Sound.init(); Sound.play("ui");
        if (!Meta.toggleEquip(it.id)) Sound.play("hit", { vol: .3 });
        renderShop();
      });
    } else {
      btn.textContent = afford ? "Buy" : "Too dear";
      btn.disabled = !afford;
      btn.addEventListener("click", () => {
        Sound.init();
        const ok = isCons ? Meta.buyConsumable(it) : Meta.buy(it);
        Sound.play(ok ? "coin" : "hit", { vol: 0.8 });
        renderShop();
      });
    }
    card.appendChild(btn);
    grid.appendChild(card);
  }
  void D;
}

/* ---------------- inventory ---------------- */
function renderInventory() {
  el("coinCount").textContent = fmtCoins(Meta.data.coins);
  el("slotCount").textContent = `${Meta.data.equipped.length}/${EQUIP_SLOTS}`;

  const sr = el("invSlots");
  sr.innerHTML = "";
  for (let i = 0; i < EQUIP_SLOTS; i++) {
    const id = Meta.data.equipped[i];
    const it = id ? ITEM_BY_ID[id] : null;
    const s = document.createElement("div");
    s.className = "slot big" + (it ? " filled r" + it.rarity : " empty");
    s.innerHTML = it
      ? `<span>${it.icon}</span><b>${it.name}</b><em>${it.desc}</em>`
      : `<span>+</span><b>Empty</b>`;
    if (it) {
      s.addEventListener("click", () => { Sound.play("ui"); Meta.unequip(it.id); renderInventory(); });
      s.title = "Click to unequip";
    }
    sr.appendChild(s);
  }

  const grid = el("invGrid");
  grid.innerHTML = "";
  if (!Meta.data.owned.length) {
    grid.innerHTML = `<div class="gridempty">Nothing here yet — visit the <b>Shop</b> to buy accessories.</div>`;
  }
  for (const id of Meta.data.owned) {
    const it = ITEM_BY_ID[id];
    if (!it) continue;
    const on = Meta.isEquipped(id);
    const card = document.createElement("div");
    card.className = `item r${it.rarity} owned${on ? " equipped" : ""}`;
    card.style.setProperty("--rc", RARITY_COLOR[it.rarity]);
    card.innerHTML =
      `<span class="iicon">${it.icon}</span>` +
      `<span class="iname">${it.name}</span>` +
      `<span class="idesc">${it.desc}</span>`;
    const btn = document.createElement("button");
    btn.className = "ibtn" + (on ? " ghost" : "");
    btn.textContent = on ? "Unequip" : "Equip";
    btn.addEventListener("click", () => {
      Sound.init(); Sound.play("ui");
      if (!Meta.toggleEquip(id) && !on) Sound.play("hit", { vol: .3 });
      renderInventory();
    });
    card.appendChild(btn);
    grid.appendChild(card);
  }

  const cg = el("consGrid");
  cg.innerHTML = "";
  for (const c of CONSUMABLES) {
    const armed = Meta.activeCount(c.id);
    const card = document.createElement("div");
    card.className = `item r${c.rarity}${armed ? " owned" : ""}`;
    card.style.setProperty("--rc", RARITY_COLOR[c.rarity]);
    card.innerHTML =
      `<span class="iicon">${c.icon}</span>` +
      `<span class="iname">${c.name}</span>` +
      `<span class="idesc">${c.desc}</span>` +
      (armed ? `<span class="iowned">ARMED ×${armed}</span>` : `<span class="icost">${c.cost}</span>`);
    const btn = document.createElement("button");
    btn.className = "ibtn";
    if (armed) {
      btn.textContent = "Disarm";
      btn.classList.add("ghost");
      btn.addEventListener("click", () => { Sound.play("ui"); Meta.useConsumable(c.id); renderInventory(); });
    } else {
      btn.textContent = Meta.data.coins >= c.cost ? "Buy & arm" : "Too dear";
      btn.disabled = Meta.data.coins < c.cost;
      btn.addEventListener("click", () => {
        Sound.init();
        const ok = Meta.buyConsumable(c);
        Sound.play(ok ? "coin" : "hit", { vol: 0.8 });
        renderInventory();
      });
    }
    card.appendChild(btn);
    cg.appendChild(card);
  }
}

/* ---------------- quest library ---------------- */
function renderQuestLibrary() {
  el("coinCount").textContent = fmtCoins(Meta.data.coins);
  const st = el("questStats");
  const total = Object.keys(Meta.data.questLog).reduce((a, k) => a + Meta.data.questLog[k], 0);
  st.innerHTML =
    `<div class="qs"><span>COMPLETED</span><b>${total}</b></div>` +
    `<div class="qs"><span>ACTIVE</span><b>${Meta.data.loadout.length}/2</b></div>` +
    `<div class="qs"><span>DIFFICULTY</span><b>${DIFFS[Meta.data.difficulty].name}</b></div>` +
    `<div class="qs"><span>QUEST REWARD</span><b>×${DIFFS[Meta.data.difficulty].quest.toFixed(2)}</b></div>`;

  const grid = el("questGrid");
  grid.innerHTML = "";
  for (const q of QUESTS) {
    const picked = Meta.data.loadout.indexOf(q.id) >= 0;
    const done = Meta.data.questLog[q.id] || 0;
    const card = document.createElement("div");
    card.className = `item q r${q.rarity}${picked ? " equipped" : ""}`;
    card.style.setProperty("--rc", RARITY_COLOR[q.rarity]);
    card.innerHTML =
      `<span class="iicon">${q.icon}</span>` +
      `<span class="iname">${q.name}</span>` +
      `<span class="idesc">${goalLabel(q.type, q.goal)}</span>` +
      `<span class="icost">+${Math.round(q.reward * DIFFS[Meta.data.difficulty].quest)} coins</span>` +
      (done ? `<span class="iowned">COMPLETED ×${done}</span>` : "");
    const btn = document.createElement("button");
    btn.className = "ibtn" + (picked ? " ghost" : "");
    btn.textContent = picked ? "Remove" : "Select";
    btn.addEventListener("click", () => {
      Sound.init(); Sound.play("ui");
      Meta.toggleQuest(q.id);
      renderQuestLibrary();
      renderPlay();
    });
    card.appendChild(btn);
    grid.appendChild(card);
  }
}

/* ---------------- merchant / weapon trade ---------------- */
function openTrade() {
  state = "trade";
  el("tradeOv").classList.remove("hidden");
  renderTrade();
  Sound.play("ui");
}
function closeTrade() {
  state = "play";
  el("tradeOv").classList.add("hidden");
  Sound.play("ui");
}

function renderTrade() {
  el("slotCap").textContent = LOADOUT_SLOTS;
  el("goldTrade") && (el("goldTrade").textContent = G.gold);

  // held slots
  const held = el("heldRow");
  held.innerHTML = "";
  for (let i = 0; i < LOADOUT_SLOTS; i++) {
    const id = Armory.order[i];
    const w = id ? WEAPON_BY_ID[id] : null;
    const d = document.createElement("div");
    d.className = "slot big" + (w ? " filled" : " empty");
    d.innerHTML = w
      ? `<span>${w.icon}</span><b>${w.name}</b><em>lv ${Armory.level(w.id)} / ${w.max}</em>`
      : `<span>+</span><b>Empty</b>`;
    if (w) d.title = w.desc;
    held.appendChild(d);
  }

  const grid = el("weaponGrid");
  grid.innerHTML = "";
  for (const w of WEAPONS) {
    const lv = Armory.level(w.id);
    const maxed = lv >= w.max;
    const price = maxed ? 0 : Armory.priceOf(w);
    const afford = G.gold >= price;
    const equipped = Armory.equipped(w.id);

    const card = document.createElement("div");
    card.className = `wcard${equipped ? " on" : ""}${maxed ? " maxed" : afford ? "" : " poor"}`;
    card.style.setProperty("--wc", w.color || "#cfe4ff");
    card.innerHTML =
      `<span class="wc-icon">${w.icon}</span>` +
      `<span class="wc-name">${w.name}</span>` +
      `<span class="wc-lv">${lv === 0 ? "new" : "level " + lv + " / " + w.max}</span>` +
      `<span class="wc-desc">${w.desc}</span>` +
      (w.ability ? `<span class="wc-ab">Q — ${w.ability.name}: ${w.ability.desc}</span>` : "") +
      `<span class="wc-cost">${maxed ? "MAX" : price + " g"}</span>`;

    const btn = document.createElement("button");
    btn.className = "ibtn";
    if (maxed) {
      btn.textContent = "Fully upgraded";
      btn.disabled = true;
    } else {
      const label = lv === 0 ? "Buy" : "Upgrade";
      btn.textContent = afford ? label + " — " + price + " g" : "Too dear";
      btn.disabled = !afford;
      btn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const r = Armory.buy(w, G.gold, false);
        if (r.ok) {
          Sound.play("coin");
          showBanner(r.isNew ? w.name.toUpperCase() : w.name + " UPGRADED",
            r.isNew ? "equipped" : "level " + Armory.level(w.id));
        } else {
          Sound.play("hit", { vol: 0.4 });
        }
        renderTrade();
      });
    }
    card.appendChild(btn);
    grid.appendChild(card);
  }
}

/* held-weapon readout under the HUD */
function renderLoadoutChip() {
  const box = el("loadout");
  if (!box) return;
  if (state !== "play") { box.innerHTML = ""; return; }
  box.innerHTML = "";
  for (const w of Armory.defs()) {
    const d = document.createElement("div");
    d.className = "lwchip";
    d.style.setProperty("--wc", w.color || "#cfe4ff");
    const lv = Armory.level(w.id);
    let ab = "";
    if (w.ability) {
      const cd = Armory.abilityCd[w.id] || 0;
      ab = cd > 0
        ? `<em class="cd">${cd.toFixed(1)}s</em>`
        : `<em class="ready">Q</em>`;
    }
    d.innerHTML = `<span>${w.icon}</span><b>${lv}</b>${ab}`;
    box.appendChild(d);
  }
}

/* ---------------- settings ---------------- */
const SETTINGS = [
  { id: "sfx", label: "Sound Effects", desc: "Hits, coins, level-ups", get: () => Sound.sfxOn, set: (v) => { Sound.init(); Sound.setSfx(v); G.opts.sfx = v; el("soundBtn").classList.toggle("off", !v); el("soundBtn").textContent = v ? "🔊" : "🔇"; } },
  { id: "music", label: "Music", desc: "A wandering ambient loop", get: () => Sound.musicOn, set: (v) => { Sound.init(); Sound.resume(); Sound.setMusic(v); G.opts.music = v; el("musicBtn").classList.toggle("off", !v); } },
  { id: "log", label: "Message Log", desc: "Classic scrolling log, lower left", get: () => !el("logBox").classList.contains("hidden"), set: (v) => el("logBox").classList.toggle("hidden", !v) },
  { id: "bloom", label: "Bloom & Glow", desc: "Switches itself off on slow frames", get: () => G.opts.bloom, set: (v) => { G.opts.bloom = v; G.bloomAuto = false; perfWindow = 0; } },
  { id: "shake", label: "Screen Shake", desc: "Impact feedback on hits", get: () => G.opts.shake, set: (v) => { G.opts.shake = v; cam.enabled = v; } },
  { id: "dmg", label: "Damage Numbers", desc: "Floating hit values", get: () => G.opts.dmg, set: (v) => { G.opts.dmg = v; } },
];

function renderSettings() {
  const list = el("settingsList");
  if (!list) return;
  list.innerHTML = "";
  for (const s of SETTINGS) {
    const row = document.createElement("label");
    row.className = "sw";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = !!s.get();
    input.addEventListener("change", (e) => {
      s.set(e.target.checked);
      Sound.play("ui", { vol: 0.5 });
    });
    const knob = document.createElement("span");
    const text = document.createElement("div");
    text.className = "swtext";
    text.innerHTML = `<b>${s.label}</b><em>${s.desc}</em>`;
    row.appendChild(input);
    row.appendChild(knob);
    row.appendChild(text);
    list.appendChild(row);
  }

  const prog = el("progBox");
  if (prog) {
    const m = Meta.data;
    prog.innerHTML =
      `<div class="qs"><span>RUNS</span><b>${m.runs}</b></div>` +
      `<div class="qs"><span>KILLS</span><b>${m.totalKills}</b></div>` +
      `<div class="qs"><span>BOSSES</span><b>${m.bosses}</b></div>` +
      `<div class="qs"><span>ACCESSORIES</span><b>${m.owned.length}/${SHOP.length}</b></div>` +
      `<div class="qs"><span>QUESTS DONE</span><b>${Object.values(m.questLog).reduce((a, b) => a + b, 0)}</b></div>` +
      `<div class="qs"><span>BEST TIME</span><b>${m.best.time ? fmtTime(m.best.time) : "—"}</b></div>`;
  }
  const wipe = el("wipeBtn");
  if (wipe) {
    wipe.textContent = Shop.wipeArmed ? "Tap again to erase everything" : "Abandon all progress";
    wipe.classList.toggle("armed", Shop.wipeArmed);
  }
}

function wipeProgress() {
  if (!Shop.wipeArmed) {
    Shop.wipeArmed = true;
    renderSettings();
    return;
  }
  Store.set(META_KEY, defaultSave());
  Meta.load();
  Shop.wipeArmed = false;
  Shop.questOffers = [];
  renderSettings();
  renderShop();
  renderInventory();
  renderQuestLibrary();
  renderPlay();
  el("coinCount").textContent = fmtCoins(Meta.data.coins);
}

/* ---------------- open / close ---------------- */
function openHub() {
  state = "menu";
  el("menuOv").classList.remove("hidden");
  Shop.questOffers = Shop.questOffers.length ? Shop.questOffers : Meta.rollQuests(3);
  renderPlay();
  renderShop();
  renderInventory();
  renderQuestLibrary();
}

/* ---------------- route engine feedback into the message log ----------------
   Done here because ui.js is the last script to load, so every function we
   rewrite (declared in game.js) already exists. */
{
  const realBanner = showBanner;
  showBanner = function (title, sub) {
    Log.push(sub ? `${title} — ${sub}` : title, "good");
    realBanner(title, sub);
  };

  const realKill = killEnemy;
  killEnemy = function (e) {
    const big = e.boss || e.elite;
    realKill(e);
    if (big) Log.push(e.boss ? "You fell a BOSS!" : "An elite falls!", "good");
  };

  const realLevel = checkLevel;
  checkLevel = function () {
    const before = P().level;
    realLevel();
    if (P().level > before) Log.push(`Level ${P().level}!`, "good");
  };

  const realOver = gameOver;
  gameOver = function () {
    Log.push(`You died after ${fmtTime(G.t)}.`, "bad");
    realOver();
  };
}

/* ---------------- bootstrap ----------------
   ui.js loads after game.js, so anything touching ui-owned elements or
   functions is wired from here (never from game.js, which runs first). */
document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tab");
  if (tab) { Sound.init(); Sound.play("ui"); showTab(tab.dataset.tab); }
});
el("tradeBtn").addEventListener("click", () => { if (state === "pause") openTrade(); });
el("tradeClose").addEventListener("click", closeTrade);
el("sheetBtn").addEventListener("click", () => { if (state === "pause") openSheet(); });
el("sheetClose").addEventListener("click", closeSheet);
el("wipeBtn").addEventListener("click", wipeProgress);

openHub();
