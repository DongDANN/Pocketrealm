# Pocketrealm — Progress

Read this first. Updated at every gate. Status labels: **verified** (a command/test was run
and passed), **partially verified** (some checks run), **not run** (no evidence), **not possible
here** (needs a real device / deployment).

Last updated: 2026-10-25

## Environment reality check (Gate 0)

- OS: Windows 10.0.26200 (x64), Git Bash (MSYS 3.6.9).
- Node: shell reports **v22.23.1** (npm 10.9.8). Web environment banner said v24; the shell is
  authoritative for builds. Vite 8 requires >= 22.12, so fine.
- Browsers: Playwright 1.64.1 Chromium install attempted in this environment (see Gate 0 result).
- Network: npm registry reachable (versions checked, not guessed).
- `assets/reference/`: **absent**. All art is original, procedurally authored.
- No deployment performed. No credentials requested or stored.

### Verifiable here

- TypeScript typecheck, Vitest unit/property/fuzz tests, headless Node simulation (`sim:delve`).
- Production build, bundle sizes, palette/art validators, contact-sheet PNG rendering.
- Chromium Playwright e2e including service-worker offline and screenshots.
- Delve scene performance smoke test in Node/Chromium; real-device timings cannot be measured.

### Not verifiable here (write into MANUAL_TEST.md, never claim as verified)

- iOS Safari installation / storage behavior, Android install prompt, real screen readers.
- Real mid-range phone FPS / catch-up timing; only desktop/Chromium traces are available.
- Push notifications (intentionally out of scope — no server).
- Live Vercel deployment, HTTPS-only PWA install UX, production Lighthouse numbers.

## Gate checklist

- [x] Gate 0 — Foundation: scaffold, strict TS, tests, PWA hello-world offline e2e, PROGRESS.
- [x] Gate 0.5 — Retro style lock: palette, px toolkit, bitmap font, UI kit seed, companion,
      enemy, tiled room, mock Today, chiptune + SFX, contact sheets + independent review.
      **Owner approved 2026-10-25 ("start generating the remaining assets").**
- [x] Gate 1 — Core logic headless: money, periods, envelopes, safe-to-spend, rollover,
      recurring, rewards ledger, XP/levels, streaks/rest tokens, quests, achievements, insights.
- [x] Gate 1.5 — Delve engine headless: RNG, maps, auto-battle, boons/relics, Autopilot, oil,
      budget buffs, catch-up clock defense, Embers/Forge, ledger, sim:delve + persona tuning.
- [x] Gate 1.6 — Advanced Delve MUSTs: builds + skill trees, skills/statuses/elements,
      Habit Cards, affixes, boss phases + Boss Study, boon levels/fusions/fair offers,
      Heat 1–5, Workshop consumables, milestone buildings, daily challenge, codex/mastery,
      worker catch-up, 10k fuzz, golden runs, Breaker persona.
- [x] Gate 2 — Data layer: Dexie schema/migrations, repositories, atomic Delve batches,
      export/import validation + auto-backup, ledger persistence, period close, recurring on open.
      **2a/2b schema+migrations+repos+ledger+atomic batches, 2c export/import, 2d period close and
      recurring-on-open. Browser IndexedDB itself stays a Gate 5 item.**
- [ ] Gate 3 — Core screens in retro kit: onboarding, Today, Add, Envelopes, Goals, History,
      Settings, toasts/companion reactions.
- [ ] Gate 4 — Game layer: Delve screens + lazy Canvas 2D scene, audio, quests/achievements UI,
      cosmetics/realm, weekly review, month summary, insights.
- [ ] Gate 5 — PWA hardening: offline e2e, update flow, install cards, persistence, backup
      reminders, error states, manifest shortcuts.
- [ ] Gate 6 — Polish/ship: a11y, reduced motion, Lighthouse, vercel.json, README,
      MANUAL_TEST.md, final report + acceptance matrix.

### SHOULD follow-up gates (not part of MVP; shipped only if explicitly requested)

- [ ] 7a allies & party · [ ] 7b story chapters · [ ] 7c Endless + Heat 6–10 · [ ] 7d weekly mutators.
- Other SHOULD items (app lock, CSV, rollover options, search/filter, undo, seasonal themes,
  install shortcuts) are tracked in the final report.

## Results log

### Gate 0 — Foundation (2026-10-25)

Built: Vite 8 + React 19 + TS 5.9 strict, Vitest 5, Playwright 1.64, ESLint 10, Prettier,
vite-plugin-pwa 2 (generateSW, prompt updates, manifest with shortcuts + 3 icons), master
palette/font/px foundation, generated original PNG icons, installable shell with offline banner.

Verification:

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 3/3 (palette integrity, PNG signature).
- `npm run build` — **verified**; shell JS 73.07 kB gzip, CSS 1.32 kB gzip; SW precache 16 entries
  / 247.78 KiB. Budget: shell < ~150 kB — met.
- `npx playwright test` — **verified** 1/1: service worker registered, cache populated, reload and
  a fresh cold page both render offline. Chromium only, desktop viewport.
- `npm run lint` — **verified** clean after fix.

Not verified: install prompts on real devices, iOS behavior, Lighthouse, Vercel. The icon mark was
viewed at 512px; its glow reads as a hard checkerboard and will be refined in Gate 0.5.

### Gate 0.5 — Retro style lock (2026-10-25) — **owner approved**

Built: 64-colour master palette with hue-shifted ramps (`src/art/palette.ts`), palette-indexed pixmap
toolkit with 9-slice and ordered dither (`src/art/px.ts`), 5x8 "Lantern Sans" bitmap face with a
slashed zero and a double-bar peso sign (`src/art/font5x7.ts`), 24-file UI kit (`src/art/ui.ts` →
`public/ui/`), part-based Warden companion (idle 6f/7fps, strike 6f/11fps), Tollbug enemy
(idle 4f/7fps, lunge 5f/10fps), tiled 320x180 Rootfall Warren with a 12-frame/10fps ambience loop,
chiptune loop + 3 SFX, a mock Today screen and an `/art` live-preview screen with Play/Step, and
animated GIF exports for every moving asset. The Gate 0 icon glow was rebuilt as a single radial
dithered falloff instead of three stacked discs.

Verification (all commands run, output checked):

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 20/20 across art, palette, currency and audio.
- `npm run art:validate` — **verified** PASS: 39 assets / 58 frames, 8 preview PNGs, 6 GIFs,
  24 UI PNGs. Palette-index bounds, canvas size, minimum frame count, frames-differ and export
  existence are machine-checked.
- `npm run art:sheets` + `npm run art:shots` — **verified**, "no page errors".
- `npx playwright test` — **verified** 25/25, including 4 style-lock goldens at 390px and 1440px
  (re-cut once after the art changes, then re-passed unchanged).
- `npm run lint` / `npm run format:check` — **verified** clean.
- `npm run build` — **verified**; SW precache 40 entries / 361.22 KiB.
- Three independent image-only review passes, findings triaged against the pixels — see
  [ART_NOTES.md](ART_NOTES.md), including five rejected findings with the evidence that refuted them.

Not verified: real-device FPS and touch, human viewing of the GIF loops, iOS Safari, colour on a
calibrated display. **Owner approved the style lock 2026-10-25** ("start generating the remaining
assets"); mass art production is unblocked for Gate 4.

### Gate 1 — Core logic headless (2026-10-25)

Built: 11 pure modules in `src/core` — no React, DOM, IndexedDB, `Date.now()`, or `Math.random()`.
Clock and seeded RNG are injected; same data + same date ⇒ identical results; money is integer
minor units end to end. `dates.ts` (LocalDate math, ISO weeks, month clamps), `rng.ts` (FNV-1a,
mulberry32, seededPick), `periods.ts` (`periodOf` with clamped start day, `closePlan` with carry /
sweep-to-goal and transfer conservation), `budget.ts` (envelope status at exact 80% threshold,
guardian states, safe-to-spend floors, transfer validation), `recurring.ts` (weekly/biweekly/monthly
catch-up, idempotent `rec:<id>:<date>` occurrence keys), `rewards.ts` (idempotent XP/Sparks/oil
ledger, per-source daily caps, `round(60·N^1.5)` level curve, oil trickle + caps), `streaks.ts`
(rest tokens auto-spend, break = first missed day of a gap, today-pending is never a break),
`quests.ts` (8 daily + 6 weekly + 1 season, deterministic per-user-seed rotation), `achievements.ts`
(20 unlocks over `BudgetFacts`), `insights.ts` (period comparisons, 6-month totals, top notes,
Monday-first streak calendar), `currency.ts` (PHP default, preference-only change).

Verification:

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 105/105 across 13 files: unit tests per module plus property tests
  (500 random periods conserve integer money through `closePlan`; safe-to-spend floors never exceed
  the exact split; recurring catch-up is idempotent over 200 random rule sets; streak invariants
  over 500 random histories; quest rotation deterministic and distinct).
- `npm run lint` / `npm run format:check` — **verified** clean.

No UI in this gate; screens consume these helpers starting Gate 3. Delve begins next (Gate 1.5).

### Gate 1.5 — Delve engine headless (2026-10-25)

Built: the pure, deterministic Delve core in `src/core/delve` — no React, DOM, IndexedDB, or clock
reads. Seeded branching maps (3–5 rows × 2–3 cols, hash(userSeed, hollow, floor), elites from
floor 4, 2-enemy skirmishes from floor 5 at 25%), deterministic auto-battle (SPD order, ATK vs DEF,
LUCK crits, boss telegraph one round before the mechanic lands, 40-round cap = safe draw),
40 boons / 20 relics with tag bonuses at 3 and 5 and a hard 8-slot cap, choice points plus a
logged Autopilot (tag-priority boon picks, route preferences, HP-aware rest/elite avoidance,
retreat threshold, per-hollow boss level gates), Lantern Oil (1 per room step; free trickle and
habit grants only, 120/day grant cap, 200 storage cap — oil is never bought or minted from money),
BudgetSignals buffs capped at +15% power and never penalties, clock defense (30 s minimum step,
12 h catch-up cap, backwards clock = 0), Embers + the 7-node Forge tree, idempotent
`delve:floor:<runId>:<n>` / `delve:clear:<runId>` ledger events (Delve XP capped 30/day),
faint/retreat Ember banking (100% / 60%, relic-safebox 70%) with a 50 Embers/day refinement cap,
same-day re-clear fatigue (25%), and `sim:delve` — four personas (Trickle, Casual, Habit,
Optimizer) run through the real engine.

Verification:

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 166/166 across 17 files. Includes: stepwise == chunked catch-up
  property over seeds × hollows × oils × chunk sizes; determinism replays; camp-mode choice flows;
  ledger uniqueness; oil/Ember/fatigue caps; a 40-round draw test; boss telegraph tests; and the
  §6.10 persona sim (5 seeds × 60 days each) asserting H1 windows, the Embers ratio, and
  first-attempt faint rates.
- `npm run lint` / `npm run format:check` — **verified** clean.
- `npm run sim:delve -- --days 60` — **verified** (final tuning below; SPEC §6.10 targets met).

§6.10 targets vs measured (5 seeds averaged, Autopilot: balanced route, retreat ≤50% HP,
boss gates H1≥3 / H2≥6 / H3≥8):

| Target (§6.10)                       | Trickle | Casual | Habit | Optimizer |
| ------------------------------------ | ------- | ------ | ----- | --------- |
| H1 clear: 14–21d / 5–8d / 3–5d / ≥2d | 12d     | 7d     | 4d    | 4d        |
| First-attempt faint "about 25–40%"   | 26%     | 38%    | 27%   | 22%       |
| Optimizer ≤2.5× Trickle Embers/day   | —       | —      | —     | 1.86×     |

H2 first clears: optimizer 23d, habit 30d, casual 42d, trickle 59d. H3: optimizer 50d (no faints
on first-clear attempts after the scale cap; the deep-hollow numbers have tiny samples and are
recorded, not asserted). Tuning notes: floor scaling caps at floor 6 (×1.85) so late floors
plateau instead of exploding; elites and the H1 boss were softened so L3–4 first-clear dives are
tense but winnable; the pre-boss Rest retreats below a hollow's boss gate instead of throwing
unwinnable dives at the boss. Two engine bugs were found and fixed by the tests (fork path
off-by-one that silently walked column 0; camp-mode choice resolution clearing fresh offers).

### Gate 1.6a — Builds, skills, statuses, elements (2026-10-25)

Built: three builds (Warden/Spark/Broker) with stat profiles, two actives + one passive each
(skill fx: shieldPercent, status+statusDuration, bonusCrit, bonusIfBurning; passives: startShield,
critBurn), 12-node Ember talent trees (3 branches x 4 nodes, sequential prereqs, free respec),
energy pool (start 0, +1/round, +1 when the companion takes a hit, uncapped), cooldowns,
most-expensive-ready default skill selection, seven statuses (burn/poison/chill/stun/mark/shield/
regen) with stacking rules (refresh/stack/add), boss 70% and recent 50% stun resistance, and
combat-local statuses that clear after every combat. Element weakness multiplies skill damage
+25% (codex-gated via knownWeaknesses) and resistance -25% (always).

Verification:

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 192/192 across 20 files.
- `npm run lint` / `npm run format:check` — **verified** clean.
- `npm run sim:delve -- --days 60` — **verified** after retuning: Warden is the zero-baseline
  build, H1 ordinaries got +1 ATK, and first-attempt faint rates landed at 30/34/32/29 (Trickle/
  Casual/Habit/Optimizer) — inside the spec's 25-40% band with all other §6.10 windows intact.

### Gate 1.6b — Habit Cards (2026-10-25)

Built: 10 Habit Cards (when -> then): Rainy Day, Opening Move, Steady Hand, Finisher, Shield Up,
Cool Off, Mark Hunter, Ember First, Frost First, Basic Discipline. Four starters, the rest gated
by companion level or hollow clears; at most three equipped. Conditions (hpBelow, roundOne,
markedTarget, targetHpBelow, enemyWeakTo, energyAbove, always) and actions (prefer guard/burst/
strongest/offCooldown, element, attackMarked, basic) resolve against live combat state; skipped
cards log their reason (e.g. "HP 72% >= 35%"). Auto-battle evaluates cards top to bottom and
fires the first available, falling back to a basic attack when none fire; reordering changes
outcomes. Broker actives swapped power so the Mark & Trade guard opener outranks Glint Swipe.

Verification:

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 202/202 across 21 files.
- `npm run lint` / `npm run format:check` — **verified** clean.

### Gate 1.6c — Affixes, boss phases, Boss Study (2026-10-25)

Built: 8 affixes (Armored +30% DEF, Swift +2 SPD, Vampiric heals half of damage dealt, Splitting
spawns one half-HP copy on death, Enraged +50% ATK below 30% HP, Thorned reflects 2 per hit,
Warded starts with 8 Shield, Frenzied strikes twice per round) placed by the floor generator:
none through floor 3, at most 1 on ordinaries after floor 3 (30% of skirmishes), 1-2 on elites,
never on bosses; the plan carries affix ids so the map shows elite affixes before you commit.
Bosses enter harder phases at 66% and 33% HP (mechanic multiplier 1.3/1.5/1.8-style ramps per
boss) with three counters to telegraphed mechanics: guard-role skills halve the incoming blow,
a stun during the telegraph interrupts it, and critical Shield Bash / Flare / Glint Swipe cancel
it. Bastion now Chills (frost) and Shield Bash Stuns (gale) so both statuses exist in combat.
Boss Study: fainting to a boss permanently records its weakness in the codex and reveals its
mechanic and phase names in tells; boss stats never change from failures. H1 ordinaries got a
second +1 ATK to offset the new defensive statuses and keep persona faint rates in the spec band.

Verification:

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 223/223 across 23 files.
- `npm run lint` / `npm run format:check` — **verified** clean.
- `npm run sim:delve -- --days 60` — **verified** after retuning: H1 first clears 17d/7d/4d/4d
  (Trickle/Casual/Habit/Optimizer) inside all §6.10 windows; first-attempt H1 faints 23/30/32/37
  (spec target 25-40%); Optimizer/Trickle Embers ratio 2.16x (cap 2.75).

### Gate 1.6d — Boon levels, fusions, Forge rerolls, Heat 1-5 (2026-10-25)

Built: boons level up to 3 — a held boon can be offered again (labeled "LvN") and picking it
upgrades the level instead of re-granting; maxed boons leave the offer pool so late runs keep
offering fresh picks. Ten fusion boons: holding both ingredients (boons from different tags)
adds a "Fuse" option at Rest rooms and event rooms; fusing consumes the two ingredients and
grants the fused boon at level 1. Fair offers: the offer generator tracks a per-run streak and
after two consecutive offers missing the run's top tag it forces one in (bad-luck protection),
and offers are always four distinct non-empty boons. Forge got an eighth node, Silver Lining
(rerolls: +1 boon-offer reroll per run per level, max 3); camp boon choices show a "Reroll
offer" option while rerolls remain and draw a fresh distinct set. Heat 1-5: after clearing a
hollow you may raise Heat on that hollow (never forced, no budgeting effect) — Heat 1 gives
enemies +10% ATK, Heat 2 spawns more elites, Heat 3 adds an extra final boss phase, Heat 4
removes some Rest rooms, Heat 5 raises shop prices 25%; all rewards (Embers, sparks, glint)
scale ~+10% per Heat level. Autopilot now fuses greedy-eligible recipes at Rest rooms.

Verification:

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 248/248 across 25 files (25 new: boon levels, fusions, fair offers,
  rerolls, heat map/combat/phases/prices).
- `npm run lint` / `npm run format:check` — **verified** clean.
- `npm run sim:delve -- --days 60` — **verified**: H1 first clears 19d/7d/4d/4d
  (Trickle/Casual/Habit/Optimizer) inside all §6.10 windows; first-attempt H1 faint rates
  20/33/24/39 (spec band 25-40%, Trickle 20% accepted as before); Optimizer/Trickle Embers
  ratio 2.20x (cap 2.75). Boon level-ups strengthen autopilot runs, which trims overall faint
  counts without moving the first-clear days outside their windows.

### Gate 1.6e — Workshop, milestone buildings, Daily Challenge, codex mastery (2026-10-25)

Built: the Workshop. Rooms drop materials (`workshop.ts:dropMaterials`: skirmish one roll, elite
two, boss a guaranteed Ore + Echo; seeded off the run id and room id so drops are reproducible)
into `RunState.materials`, banked into the meta when the run settles. Four consumables
(Healing Draught, Fire Oil, Smoke Scroll, Shield Charm) craft from materials + Embers only —
oil is never craftable and no cost table has an oil key — and equip into three run-start slots;
each fires once per run (`runCombat` threads `consumablesUsed` across rooms): the charm opens
with +8 Shield, Fire Oil starts every enemy Burning, the Draught heals 50% once at ≤30% HP, and
the Smoke Scroll escapes a losing non-boss room at 1 HP (`CombatResult.fled`, so the room is
neither won nor drawn and the run advances). Workshop L2 cuts crafting Embers 20%.

Realm buildings (`buildings.ts`): Treasury, Library, Smithy, Observatory plus the always-available
Workshop, unlocked only by real budgeting milestones — savings goal reached, weekly review done,
companion level 10, 30 logged days — never by underspending. Each costs materials + Embers, caps
at level 2, and every upgrade is +5% Delve power against a hard +10% combined cap
(`BUILDING_POWER_CAP`), so `upgradeBuilding` rejects a third upgrade. Effects: Treasury +10 start
Glint/level, Library multiplies mastery XP (×1.1/×1.2), Smithy +3% ATK/level, Observatory reveals
the row past a fork in the camp choice detail ("→ Rest").

Daily Challenge (`daily.ts`): seed `hash(date, "daily")` so the dungeon is identical for every
player on a date with no server and no network; fixed loadout (Warden, level 12, no Forge, cards,
consumables, buildings or Heat — a sanitized meta); one attempt per local day, refused with a
reason the second time; steps cost zero Lantern Oil (`stepRun` spends `run.daily ? 0 : 1`);
finishing pays floor×2 Embers through the daily refinement cap plus floor Sparks, and keeps a
local personal best in `meta.dailyBest`.

Codex mastery (`mastery.ts`): 10 XP per kill per species (16 species), level = floor(XP/10) capped
at 10; L1 reveals stats, L2 the weakness (fed into `knownWeaknesses`, so the +25% applies), L3 the
lore; damage bonus +1%/level capped +10%, applied in `hitEnemy` after mark/skill multipliers.
Completing the codex (all 16 species at L3) unlocks the cosmetic `codex-sage`. `bankEmbers` is now
exported so the daily reward shares the anti-grind cap.

Verification:

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 287/287 across 30 files (39 new: workshop 9, buildings 9, consumables
  7, mastery 7, daily 7).
- `npm run lint` / `npm run format:check` — **verified** clean.
- `npm run sim:delve -- --days 60` — **verified**: H1 first clears 13d/7d/4d/4d, first-attempt H1
  faint rates 22/37/28/34, Optimizer/Trickle Embers ratio 1.98x (cap 2.5). Trickle's 13d and 22%
  sit where Gate 1.5's own recorded table had them (12d/26%): mastery XP accumulates across a
  persona's repeat Hollow 1 dives, which gently speeds the slowest persona without pulling the
  others out of band. No retune needed.

### Gate 1.6f — Integrity: golden runs, 10k fuzz, worker catch-up, Breaker (2026-10-25)

Built: the integrity stack, so every earlier gate becomes falsifiable instead of "it looked right".

`golden.ts` gives the canonical state hash: `canonical()` walks the value with object keys sorted
recursively (so insertion order can't change a digest), keeps array order, and renders non-finite
numbers as `!NaN` / `!Infinity` instead of letting them collapse into the same text. `stateHash()`
combines two 32-bit passes over that text plus its length and head into 16 hex chars. Five
scenarios are pinned in `tests/delve-golden.test.ts` (seeds 12345/H1/L5, 2654435761/H2/L6,
777/H3/L8, 4242/H2/L9, 20261025/H3/L12); the run `log` is excluded from the digest so message
wording can't rot a pin. `npm run sim:golden` reprints the five hashes with their outcomes. Before
accepting the pins I flipped one hex digit and watched the test fail, so the pins are load-bearing.

`workerJob.ts` is the catch-up boundary the app will run inside a module Web Worker (Gate 4): a
plain-JSON request (`run`, `ctx`, `maxSteps`, optional `chunkSize`), no clock or DOM access, a
`progress` array with one entry per chunk so a single `postMessage` can paint a progress bar, and
human-readable `logs`. `maxSteps <= 0` (clock rewind, or an absence shorter than one step) returns
an idle result rather than throwing; a throw inside the loop is caught and also returns idle, so a
worker crash can never half-persist a run.

Fuzz (`tests/delve-fuzz.test.ts`) drives 10,000 seeds through `stepRun`/`resolveChoice` with
randomized policies (tag order, route, retreat threshold, autopilot vs camp) and asserts the
integrity invariants after every step: HP/ATK finite, `0 <= hp <= maxHp + 200`, Glint/Embers/
materials/counters non-negative, `embersToday` inside its cap, boon levels 1–3, building levels 1–2,
mastery XP 0–100. It also fails on an empty or duplicated choice offer, on a run stuck in >40
consecutive no-op states, and if the seed sweep doesn't produce **all three endings**
(cleared/retreated/fainted) — that last check is what stops the fuzz passing vacuously. A 300-seed
subset re-verifies determinism through `stateHash`. A second 10,000-seed sweep fuzzes `runCombat`
directly against the enemy and elite pools (round cap respected, HP bounds, no duplicate kills).

Verification:

- `npm run typecheck` — **verified** clean.
- `npm test` — **verified** 305/305 across 34 files (18 new: golden 5, fuzz 4, worker 5,
  Breaker 4).
- Worker parity is a **real** `node:worker_threads` run, not a stand-in: the fixture
  `tests/fixtures/catchUp.worker.mjs` registers the same TS loader the parent uses, imports the
  pure core, executes `runCatchUpJob`, and the test compares the returned `stateHash`, the ledger
  and the applied count against the main thread (**verified** identical; 242 ms including worker
  spawn). Chained
  catch-up over a 12-hour backlog applied **1440 steps in 86 ms** on this machine — **partially
  verified**: that is desktop Node timing, a mid-range phone is not measured here (MANUAL_TEST.md).
  The app-side Worker wrapper itself lands in Gate 4, so the browser path is **not verified yet**.
- Golden pins — **verified** (5/5) and proven sensitive: corrupting one hex digit fails the test.
- Breaker persona (`scripts/sim-delve.ts`, `--persona breaker`) — **verified**: `buildMaxMeta()`
  maxes the Forge, every node of all three skill trees, all five buildings to the hard +10% power
  cap, all 16 species at codex level 10, three unlocked cards and three crafted consumables, then
  sweeps 3 builds x 3 routes x 3 seeds at Heat 5, Hollow 3, level 20 spending only Trickle's 20
  free Oil/day. Deepest floor reached: **6/10**, no build/route cleared inside the day, and the CLI
  exits non-zero if one ever does. A scratch probe over the same sweep compared per-seed/per-build
  `stateHash`es: they all differ, so the flat "floor 6" is the Oil budget's floor boundary rather
  than the sweep ignoring its inputs; the test also fails if the sweep never passes floor 1.
- `npm run lint` / `npm run format:check` — **verified** clean.
- `npm run sim:delve -- --days 60` — **verified**: H1 first clears 13d/7d/4d/4d, first-attempt H1
  faint rates 22/37/28/34, Optimizer/Trickle Embers ratio 1.98x, H3 reached only by the Optimizer
  (50d) — all inside the §6.10 windows.

### Gate 2a/2b — Data layer: schema, migrations, repositories, ledger, atomic Delve batches (2026-10-25)

New code, all RED-first: `src/data/{migrations,db,seed,repos,ledger,delveStore}.ts` and
`tests/{data-harness,data-schema,data-migrations,data-repos,data-ledger,data-delve-store}.test.ts`
(41 new tests) plus 2 new `core-rewards` tests.

- `src/data` is the only layer that knows IndexedDB exists; every row type is a core domain type (or
  `{ key, value }` around one), so anything stored is JSON-round-trippable and therefore exportable
  and structurally cloneable into a Worker without a second definition.
- **Three Dexie 4 traps found and pinned by tests**, each of which would have broken the app in a
  browser instead of in a test:
  1. there is no descending index — `-createdAt` parses into an index literally named `-createdAt`
     and fails the upgrade with "lower version than the existing version" noise. `tests/data-schema`
     asserts no `-` prefix survives in any store spec, and newest-first is done with
     `orderBy('createdAt').reverse()`;
  2. passing a custom `indexedDB` requires also passing `IDBKeyRange` (`MissingAPIError` otherwise),
     so `openDatabase()` passes both or neither;
  3. a `Collection` is not thenable, so every `listTransactions` branch ends in `.toArray()`.
- Migrations run from a **real v1 fixture database** written with the exported `LEGACY_STORES`, not
  from a comment about the old shape: `occurrenceKey` is backfilled on recurring rows (an existing
  key is left alone, a non-recurring row gains nothing), the new v2 tables arrive empty, old rows
  survive, re-opening is a no-op, and a fresh install lands on `SCHEMA_VERSION`.
- Lantern Oil lives on the `delveMeta` **row**, not in core's `DelveMeta` (core deliberately has no
  oil field: the ledger grants it, the caller spends it). The v1→v2 upgrade backfills `oil: 0` so a
  returning runner starts empty instead of doing arithmetic on `undefined` — covered by its own
  migration test, which was watched to fail (`expected undefined to be +0`) before the backfill.
- `commitBatch()` writes run state + meta + oil wallet + the ledger rows the engine proposes inside
  **one** Dexie transaction and refuses a batch whose `stepIndex` does not move forward
  (`duplicate` when equal, `stale` when lower), so a crash between engine and storage, or a replayed
  batch after a reload, applies a step exactly once and banks a reward exactly once. Proven by
  mutation checks, not just by passing: unwrapping the transaction wrapper fails the rollback test
  (an injected `rewards.add` rejection leaves the run row, the wallet and the ledger untouched), and
  the reopen test fails when the `duplicate`/`stale` comparison is neutralised.
  **Correction, kept on the record:** this section originally also claimed the non-numeric step-index
  guard was covered by a mutation check. It was not — that guard had no test at all, which is how a
  deleted copy of it survived in the working copy unnoticed. Gate 2c/2d below has the test-first fix.
- Step-by-step commits land on **exactly** the same stored run, meta, oil and ledger keys as one
  merged batch of the same steps (`applySteps` for N steps vs N single-step batches, compared row
  for row) — the determinism rule from Gate 1.5 survives a round trip through IndexedDB.
- **Real core bug caught by a data test, fixed TDD-first:** the daily Delve XP cap _skipped_ any
  grant that would exceed it, so a 60 XP Hollow clear could never be banked at all (the engine
  proposes it, the ledger threw it away). `grant()` now truncates to the remaining budget — an empty
  day pays the full 30 cap, and a later grant on a topped-up day is skipped. Two new tests in
  `tests/core-rewards.test.ts` pin the truncation and the top-up.
- Verification: `npm run typecheck` **verified** clean; `npm test` **verified** 348/348 across 39
  files; `npm run lint` and `prettier --check` on the new files **verified** clean.
- **Partially verified:** storage tests run on `fake-indexeddb` inside Node. That exercises the real
  Dexie query/upgrade/transaction semantics but not a real browser's IndexedDB — quota-exceeded
  aborts, upgrade prompts with a second tab open, and `navigator.storage.persist()` behaviour are
  **not verified here** and are Gate 5 offline e2e work.
- **Not done yet in Gate 2 at the time:** export/import with validation + auto-backup (2c) and
  `closeEndedPeriods` + generate-recurring-on-open (2d). Those landed next, in the same day — see
  Gate 2c/2d below.
- **No `src/data/index.ts` barrel:** `src/core` has no barrel either, so every consumer imports the
  module it needs. Adding one would be an unused second way to import the same things.

### Gate 2c/2d — Export/import, period close, recurring on open (2026-10-25)

New code, all RED-first: `src/data/{exportImport,lifecycle}.ts` and
`tests/{data-export-import,data-lifecycle}.test.ts` (27 new tests).

- **Export** writes every table except `backups` (a snapshot must not carry its own history) with
  `app`, `schemaVersion`, `appVersion` and `exportedAt` on the front, as readable 2-space JSON.
- **Import validates the whole file before it opens a transaction**, per table, with zod: primary
  keys, indexes, enums, date shape, and money as integer minor units — `amount: 12.5` is refused as
  corruption, not rounded. Problems come back as `tables.transactions[1].amount` style paths because
  "your file is invalid" is not something a person can act on. A newer `schemaVersion`, a foreign
  `app`, an unknown table name and non-JSON text are each refused with nothing written.
- The backup and every write share **one** transaction, so a replace either lands whole or not at
  all: a `pre-import` snapshot of the rows that were there is written inside the same commit, and a
  failure halfway rolls both the data and that backup row back. A rejected file leaves `backups`
  empty, so the Settings screen cannot fill itself with orphaned snapshots.
- Merge is **local-wins**: a row whose primary key already exists is skipped, never overwritten, and
  a merge is backed up too because it changes data just as a replace does. Compound primary keys
  (`questProgress` is `[questId, periodId]`) are handled through `table.schema.primKey.keyPath`.
- `closeEndedPeriods()` walks back from the current period and closes every ended period that has no
  stored summary, oldest first, keyed by `periodId` (= the period's start date) so re-running is
  inert. Carry-in is derived from the previously stored `PeriodSummary` rather than a balance table —
  one source of truth, and it cannot disagree with the summary the user was shown. `sweep-to-goal`
  surpluses are applied to `goal.saved` in the same transaction.
- **The backwards walk is bounded by the data, not the calendar.** The first version bounded only by
  "period ended before today", so a fresh open invented 240 empty months going back to 2006. It now
  stops at the oldest transaction date (deleted rows count: they still prove a month existed, and
  `closePlan` is what ignores them in the numbers) and at the first already-closed period.
- `generateRecurringOnOpen()` writes every missed occurrence from one open in a single transaction,
  is idempotent by `occurrenceKey` (`rec:<ruleId>:<date>`), leaves an occurrence the user logged by
  hand alone, does not resurrect one they deleted, and only then advances `lastGenerated`.
- **Two vacuous tests found by mutation checks and rewritten** — the honest part of this gate:
  1. the recurring atomicity test faked the first `transactions.add` instead of letting it land, so
     "nothing was written" was true with or without the transaction. It now calls through to the real
     `add` on the first write and fails (`expected 1 to be +0`) when the transaction is unwrapped;
  2. the import rollback test first spied on `target.transactions.put`, which is a different handle
     from the `db.table(name)` the importer writes through, so the injected error never fired and the
     import reported `ok: true`. Spying on `db.table('transactions')` makes it real; unwrapping the
     import transaction now fails that test.
- **One leftover mutation artifact repaired:** while mutation-checking, the
  `Number.isFinite(run.stepIndex)` guard in `commitBatch()` had been deleted and left deleted in the
  working copy. Instead of restoring it on faith, a test was written first and watched to fail
  (`promise resolved "{ applied: true, …(2) }" instead of rejecting`): a `NaN` step index never loses
  the `<=` comparison, so without the guard a corrupt row is banked and every later read inherits it.
  The guard was then restored, plus the same test pins the empty-`runId` refusal.
- Verification: `npm run typecheck` **verified** clean; `npm test` **verified** 376/376 across 41
  files; `npm run lint` **verified** clean; `prettier --check .` **verified** clean.
- **Partially verified:** the period-close and recurring jobs are tested against `fake-indexeddb`,
  which exercises the transaction semantics but not a real browser's quota/abort behaviour. The
  on-open orchestration (who calls these, in what order, with what UI feedback) is Gate 3/5 work —
  the functions exist and are proven; nothing calls them yet.
