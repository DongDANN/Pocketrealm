# Pocketrealm

Gamified, offline-first budgeting PWA. Vite + React + TypeScript (strict) + Dexie + vite-plugin-pwa.
Deployed as a static site on Vercel. Full design: docs/SPEC.md. Live status: docs/PROGRESS.md.
READ PROGRESS.md FIRST every session.

## Commands (keep accurate; update when scripts change)

- npm run dev — Vite dev server
- npm run typecheck — tsc --noEmit
- npm test — Vitest (src/core, data layer)
- npm run test:e2e — Playwright (includes offline tests, runs against `vite preview`)
- npm run build — production build (includes service worker)
- npm run preview — serve the production build locally
- npm run lighthouse — Lighthouse CI against the preview build

## Architecture rules

- src/core is pure TypeScript: no React, no DOM, no IndexedDB, no Date.now(), no Math.random().
  Clock and RNG are injected. Same data + same date => identical result.
- MONEY IS INTEGER MINOR UNITS. Never use floating point for amounts. Format with Intl at the edge only.
- Rewards are an idempotent ledger: each reward event has a deterministic key (for example
  `log:<txId>`, `week:<weekId>`, `quest:<questId>`). Granting the same key twice does nothing.
  Editing or deleting a transaction can never create extra XP, and daily caps apply.
- The Delve (roguelike + idle mode) lives in src/core/delve and is pure and deterministic. One step
  is idempotent (keyed by runId + stepIndex). Stepping N times one by one must equal one batch of N
  steps and equal offline catch-up (this is a required property test). Randomness comes only from a
  seeded RNG whose state is saved with the run.
- The Delve reads budgeting data only through a narrow `BudgetSignals` object (check-in done today,
  envelope states, recent goal contributions, oil grants) and never writes to money data. Budgeting
  features are never gated behind the game. Budget-based Delve buffs are capped at +15% total and are
  never penalties.
- Delve simulation code must run unchanged in a Web Worker and in Node (no DOM, no window, no
  IndexedDB inside src/core/delve). The UI thread only renders and sends commands.
- Art rules (full detail in SPEC section 15): original assets only; assets/reference/ (if present) is
  inspiration, never shipped or traced. Every sprite uses only the master palette, sits on integer
  pixels, and is never rotated or fractionally scaled at runtime. Verify art by rendering contact
  sheets to PNG and LOOKING at them (and run the independent review pass) before committing art.
  Never claim hand-drawn quality or pixel-perfection you did not verify. Money amounts must always
  stay readable (see the Readable text toggle).
- Golden-run tests: a few fixed seeds must produce a stable state hash. A change to a golden hash
  needs a deliberate update plus a one-line note in docs/BALANCE_CHANGELOG.md.
- Bundle budgets: budgeting shell initial JS under about 150 KB gzipped; Delve (renderer, art, audio)
  lazy-loaded, under about 450 KB gzipped, and precached for offline. Record real numbers.
- PWAs cannot run code while closed. The Delve catches up on open (cap 12 h, clock-safe). Never
  promise background progress or notifications.
- Data lives only on the device (IndexedDB). No network calls with user data. No analytics,
  trackers, third-party scripts, or remote fonts. No bank linking.
- Every schema change is a Dexie version with a migration and a test. Import files are validated
  (zod) before touching the database, and import never destroys data without confirmation + auto-backup.
- Offline is a feature with tests: after one online visit, the whole app (including a cold launch
  from the installed icon) works with no network. Verify with Playwright offline mode.
- No dark patterns: no shame copy, no guilt streak-loss, no fake urgency, no loot boxes, no real-money
  rewards, no gambling mechanics. Never imply the app gives financial advice.

## Working agreements

- Work in gates (see SPEC.md). Do not start a gate until the previous gate's checks pass.
- After each gate: typecheck + tests (+ e2e when relevant), update PROGRESS.md, git commit.
- Never claim something works unless you ran it. Label results verified / partially verified / not run,
  and say how. Real-device behavior (iOS install, storage eviction) is "not run" unless tested on device.
- Fix root causes. Do not weaken or delete a failing test.
- Pipe long output through tail/grep; do not flood context.
- Use subagents only for independent, bounded work (art/icon sets, copywriting tables, extra tests).
- No dead buttons: a control either changes real state (covered by a test) or is removed.
- Do not ask about small technical choices. Ask only when blocked or when a choice changes scope.
- Never ask for, store, or paste tokens or credentials. Deployment is done by the user.

## Definition of done for a task

Typecheck clean, tests green, behavior exercised, PROGRESS.md updated.
