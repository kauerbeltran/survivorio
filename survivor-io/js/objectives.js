"use strict";

/* =============================================================
   RUN TRACKER — live counters, chosen quests, rolling objectives
   ============================================================= */

const Run = {
  c: null,        // counters for this run
  quests: [],     // { def, progress, done }
  objective: null,
  objTimer: 0,
  objIndex: 0,
  objDone: 0,
  earned: 0,      // meta coins earned during the run (quests + objectives)

  start(diffKey) {
    const D = DIFFS[diffKey] || DIFFS.normal;
    this.c = { kills: 0, bosses: 0, elites: 0, gems: 0, chests: 0, dmg: 0, lastHit: 0 };
    this.quests = [];
    for (const id of Meta.data.loadout) {
      const def = QUEST_BY_ID[id];
      if (def) this.quests.push({ def, progress: 0, done: false });
    }
    this.objTimer = D.objEvery;
    this.objIndex = 0;
    this.objDone = 0;
    this.earned = 0;
    this.objective = makeObjective(0, diffKey, 0);
  },

  /* one place for every event so quests and objectives never drift apart */
  event(type, amount) {
    if (!this.c) return;
    amount = amount || 1;
    if (type === "dmg") this.c.dmg += amount;
    else if (this.c[type] !== undefined) this.c[type] += amount;

    if (type === "hit") this.c.lastHit = G.t;

    // quests
    for (const q of this.quests) {
      if (q.done || q.def.type !== type) continue;
      q.progress += amount;
      if (q.progress >= q.def.goal) {
        q.done = true;
        const reward = Math.round(q.def.reward * (DIFFS[Meta.data.difficulty] || DIFFS.normal).quest);
        this.payout(reward, "QUEST COMPLETE", q.def.name);
        Meta.completeQuest(q.def.id);
      }
    }

    // rolling objective
    const o = this.objective;
    if (o && !o.done && o.type === type) {
      o.progress += amount;
      if (o.progress >= o.goal) {
        o.done = true;
        this.payout(o.reward, "OBJECTIVE COMPLETE", o.name);
        this.objDone++;
      }
    }
  },

  payout(coins, title, sub) {
    if (coins <= 0) return;
    this.earned += coins;
    Meta.addCoins(coins);
    showBanner(title, sub + "  +" + coins + " coins");
    Sound.play("level");
    const p = P();
    if (p) burst(p.x, p.y, "#ffce4d", 26, 240, 5, 0.8);
  },

  /* called every frame with the raw frame delta */
  update(dt) {
    if (!this.c) return;
    const D = DIFFS[Meta.data.difficulty] || DIFFS.normal;

    // time-based goals tick continuously
    this.event("time", dt);
    // "no hit" streak
    if (this.objective && this.objective.type === "nodmg") this.event("nodmg", dt);
    for (const q of this.quests) if (q.def.type === "time" || q.def.type === "nodmg") {
      if (q.done) continue;
      if (q.def.type === "time") q.progress = G.t;
      else q.progress = G.t - this.c.lastHit;
    }

    // roll a new objective when the timer expires and the last one is done
    this.objTimer -= dt;
    if (this.objTimer <= 0) {
      this.objTimer = D.objEvery;
      if (!this.objective || this.objective.done) {
        this.objIndex++;
        this.objective = makeObjective(G.t, Meta.data.difficulty, this.objIndex);
        this.notifyObjective();
      }
    }
  },

  notifyObjective() {
    const o = this.objective;
    if (!o) return;
    showBanner("NEW OBJECTIVE", o.name);
  },

  /* fraction complete, used by the HUD chip */
  objectiveProgress() {
    const o = this.objective;
    if (!o) return null;
    if (o.type === "time" || o.type === "nodmg") {
      return { cur: Math.min(o.progress, o.goal), goal: o.goal, pct: clamp(o.progress / o.goal, 0, 1) };
    }
    return { cur: Math.min(o.progress, o.goal), goal: o.goal, pct: clamp(o.progress / o.goal, 0, 1) };
  },

  questProgress() {
    return this.quests.map((q) => ({
      icon: q.def.icon, name: q.def.name, done: q.done,
      cur: Math.floor(Math.min(q.progress, q.def.goal)), goal: q.def.goal,
      pct: clamp(q.progress / q.def.goal, 0, 1),
    }));
  },
};
