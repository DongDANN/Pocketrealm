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
      **Owner approval required before mass art production.** Built and reviewed
      ([ART_NOTES.md](ART_NOTES.md)); box stays open until the owner signs off.
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

### Gate 0.5 — Retro style lock (2026-10-25) — **awaiting owner approval**

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
calibrated display. The Gate 0.5 checkbox stays open until the owner approves the style lock; no
further art mass production happens before that.
