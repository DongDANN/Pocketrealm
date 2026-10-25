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
- [ ] Gate 1.6 — Advanced Delve MUSTs: builds + skill trees, skills/statuses/elements,
      Habit Cards, affixes, boss phases + Boss Study, boon levels/fusions/fair offers,
      Heat 1–5, Workshop consumables, milestone buildings, daily challenge, codex/mastery,
      worker catch-up, 10k fuzz, golden runs, Breaker persona.
- [ ] Gate 2 — Data layer: Dexie schema/migrations, repositories, atomic Delve batches,
      export/import validation + auto-backup, ledger persistence, period close, recurring on open.
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

| Target (§6.10) | Trickle | Casual | Habit | Optimizer |
| --- | --- | --- | --- | --- |
| H1 clear: 14–21d / 5–8d / 3–5d / ≥2d | 12d | 7d | 4d | 4d |
| First-attempt faint "about 25–40%" | 26% | 38% | 27% | 22% |
| Optimizer ≤2.5× Trickle Embers/day | — | — | — | 1.86× |

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
