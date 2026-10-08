# HORDEFALL

A complete, dependency-free horde survival roguelite that runs in any modern
browser. Move with WASD/arrows, your weapon fires automatically, and every monster you kill
drops XP. Level up, pick a power, keep the horde off you as long as you can.

```
hordefall/
├── index.html      markup, HUD, hub (menu / shop / inventory / quests / settings)
├── style.css       classic-RPG theme (stone, parchment, gold)
└── js/
    ├── util.js     math helpers, spatial hash, object pools
    ├── audio.js    WebAudio synth (SFX + ambient music, zero assets)
    ├── meta.js     save file, accessories, difficulty, quest catalogue
    ├── objectives.js run counters, quest + rolling objective tracking
    ├── upgrades.js 26 in-run power-ups with rarity weighting
    ├── weapons.js  9 purchasable weapons, abilities, the wandering merchant
    ├── rpgui.js    character sheet + message log
    ├── game.js     engine: player, enemies, XP, rendering
    └── ui.js       hub tabs, merchant, settings
```

## Play

Double-click `index.html`, or drag the folder into a browser window. No build step, no
dependencies, works offline from `file://`.

Prefer a local server (optional):

```bash
npx serve hordefall
```

## Controls

| Input | Action |
| --- | --- |
| `W A S D` / arrows | Move |
| `1` `2` `3` | Pick a power-up while levelling |
| `Esc` / `P` | Pause |
| `M` | Toggle sound |
| Touch joystick (bottom-left) | Move on mobile |

Your weapon aims at the nearest monster automatically.

## The hub (before you play)

Five tabs on the main menu:

- **Play** — pick a difficulty, pick up to 2 quests from 3 offers, review your loadout,
  then start. The PLAY button is always in reach.
- **Shop** — 17 permanent accessories and 5 stackable consumables, filtered by category.
- **Inventory** — equip up to 4 accessories, arm consumables for your next run.
- **Quests** — browse all 12 quests, see how many you have completed.
- **Settings** — sound, music, message log, bloom, screen shake, damage numbers, plus
  lifetime statistics and a two-press "abandon all progress" reset.

**Difficulty** changes the run *and* the pay:

| | Enemy HP | Spawn rate | XP | Gold | Quests | Objective cadence |
| --- | --- | --- | --- | --- | --- | --- |
| Easy | −28% | −32% | ×1.15 | ×1.20 | ×0.80 | every 26s, small goals |
| Normal | — | — | ×1.00 | ×1.00 | ×1.00 | every 22s |
| Hard | +28% | +14% | ×0.90 | ×1.35 | ×1.50 | every 18s, bigger goals |
| Nightmare | +100% | +50% | ×0.80 | ×1.70 | ×2.30 | every 15s, big goals |

**Currency.** In-run **gold** buys weapons, level-up rerolls and a revive. Half of
whatever you did *not* spend is banked as **coins** when you die, and coins are what
the shop wants. Quests and mid-run objectives pay coins immediately.

**Mid-run objectives** roll automatically as the run goes on. Each one pays coins, then a
new one appears — the goals grow with elapsed time and with the difficulty you picked, so
Nightmare objectives arrive more often and ask for far more. The bottom-left HUD chip shows
the current one and your progress.

## Weapons (bought mid-run)

You start with a Shortbow and can carry **two** weapons. Gold spent on weapons is the
same gold spent on rerolls and revives, so every purchase is a real trade-off.

| Weapon | Behaviour |
| --- | --- |
| Shortbow | Starter. Fast, single target. |
| Iron Sword | Melee arc sweep hitting everything in front. **Q — Whirlwind** |
| Bloodfang | Very fast, +crit, leaves targets **bleeding** |
| Longbow | Slow, heavy, pierces a whole line |
| Ember Staff | Seeking orbs that never miss. **Q — Meteors** |
| Guard Flail | Wild wide swings; **12% damage reduction while held** |
| Gyro Blades | Blades circle you, cutting what comes close |
| Boomerang | Flies out through the horde and back again |
| Hand Cannon | Slow heavy shot with a wide blast. **Q — Ground Slam** |

Weapons are bought from a **wandering merchant** who appears every 40–65s (marked on the
minimap and by an off-screen arrow — walk up and press `E`), or any time from the pause
menu. Chests, elites and bosses can also grant one for free. Every weapon has 5 levels;
buying again upgrades the one you hold. If both slots are full, a new weapon replaces
whichever held weapon has the worse damage-per-second.

Your existing upgrades (Might, Multishot, Piercing, Crit, Slam) apply to whatever you
are actually holding. Drones, Lightning and Nova are always-available **skills**, not
weapons, so the weapon roster stays distinct.

## Classic RPG interface

The whole game uses a stone-and-parchment fantasy-menu look: gold-trimmed frames, serif
display type, bevelled panels, no neon. Press **`C`** at any time for the character
sheet — portrait medallion, vitality and experience bars, a live stat grid
(attack / defence / speed / crit / luck / gold), and a paper-doll showing what you are
wielding. A scrolling **message log** sits in the lower left, in the style of an
Dragon Quest dialogue box.

## Features

- **Auto-attack combat** — projectiles, knockback, crits, pierce, multishot.
- **26 upgrades** across 4 rarities: damage, attack speed, move speed, max HP, regen, armor,
  damage reduction, crit, magnet, XP/gold gain, lifesteal, thorns, frost, explosive kills,
  knockback, and a one-time Phoenix revive.
- **3 unlockable weapons** — orbiting drones, chain lightning, and shockwave novas.
- **5 enemy types** — slimes, fast bats, armoured brutes, ranged wisps, and bosses with
  radial bullet barrages, plus random gold elites.
- **Escalating difficulty** — spawn rate, burst size, HP and damage all scale with time;
  a boss spawns every 75s after the first minute.
- **Chests & gold** — elites and bosses drop chests; gold buys weapons, level-up rerolls and
  one revive.
- **Systems** — main-menu settings screen, run summary with your build, localStorage best run,
  pooled particles/damage numbers for smooth frame times, WebAudio synth for all sound.

### Visuals

- **Bloom pass** — the frame is downsampled to a quarter-resolution buffer, its darks crushed
  with `contrast()` so only real highlights survive, then blurred and added back. Toggleable on
  the main-menu **Settings** tab, and it switches itself off if the frame rate drops (never
  overriding a manual choice). Falls back to a weaker bloom if `ctx.filter` is unsupported.
- **Distinct silhouettes** — slimes wobble and squash as they run, bats flap wings, brutes wear
  an armour plate and back spikes, wisps trail flame, bosses have segmented plates and a jaw
  that opens before a volley.
- **Decals & depth** — kills leave fading ground splats, a parallax dust layer and world-space
  ground scuffs give the arena depth, plus a screen vignette.
- **Juice** — hit-stop on crits and kills, impact rings, motion trail and squash on the player,
  muzzle flash, crit/heal/damage number treatments, screen shake, low-HP pulsing vignette.
- **HUD** — boss health bar across the top, XP bar with a trailing ghost segment, minimap with a
  view-facing wedge, off-screen markers for elites and bosses, 3D-tilting level-up cards with
  rarity bloom.
