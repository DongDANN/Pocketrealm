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
- [ ] Gate 0.5 — Retro style lock: palette, px toolkit, bitmap font, UI kit seed, companion,
      enemy, tiled room, mock Today, chiptune + SFX, contact sheets + independent review.
      **Owner approval required before mass art production.**
- [ ] Gate 1 — Core logic headless: money, periods, envelopes, safe-to-spend, rollover,
      recurring, rewards ledger, XP/levels, streaks/rest tokens, quests, achievements, insights.
- [ ] Gate 1.5 — Delve engine headless: RNG, maps, auto-battle, boons/relics, Autopilot, oil,
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

