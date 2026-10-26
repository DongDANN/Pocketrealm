# Pocketrealm — Final report

Date: 2026-10-26. Version: 0.1.0. This report is written from the evidence in the repository; it
does not claim anything that was not run. The live Vercel deployment and real-device checks were
intentionally **not run** by the build author.

## Outcome

Pocketrealm is a complete, usable MVP: an offline-first budgeting PWA with exact integer money math,
fast expense entry, envelopes, goals, recurring entries, reviews, insights, backups, and a full
deterministic Delve game layer. All eight build gates were completed and committed. Every gate passed
its typecheck and test checks before its commit; the final Gate 6 run is recorded below.

- **Budget first:** the budgeting routes load without the Delve; the game is lazy-loaded and
  precached for offline.
- **Local-only data:** IndexedDB, no accounts, no server, no network calls with user data, no
  analytics, no remote fonts, no bank linking, no notifications.
- **Original art and audio:** palette-indexed pixel art generated in code, and a four-channel
  WebAudio synth with no audio files.
- **Not deployed:** per the project owner's instruction, no deployment was performed and no tokens
  were requested or stored.

## Final verification (2026-10-26)

| Check                      | Result                                                                            | Evidence                                            |
| -------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| TypeScript                 | **verified clean**                                                                | `npm run typecheck`                                 |
| Lint                       | **verified clean**                                                                | `npm run lint`                                      |
| Formatting                 | **verified clean**                                                                | `npm run format:check`                              |
| Unit/property/fuzz tests   | **verified 667/667 across 66 files**                                              | `npx vitest run`                                    |
| Browser tests              | **verified 61/61**                                                                | `npx playwright test`, Chromium, production build   |
| Art validation             | **verified PASS** — 121 assets / 309 frames; 16 preview PNGs, 12 GIFs, 44 UI PNGs | `npm run art:validate`                              |
| Production build           | **verified clean** — 89 precache entries, 1000.34 KiB                             | `npm run build`                                     |
| Lighthouse                 | **verified** — performance 0.93/0.94; accessibility 1.00; best practices 1.00     | `npm run lighthouse`                                |
| Deployment policy          | **verified against the production build**                                         | `e2e/security.spec.ts` + `scripts/serve-vercel.mjs` |
| Live deployment            | **not run**                                                                       | owner deploys                                       |
| Real phone / screen reader | **not run**                                                                       | see [MANUAL_TEST.md](MANUAL_TEST.md)                |

The e2e suite runs one worker against `vite preview` (and a policy-emulating server for the security
spec) because several tests share a service worker and a browser profile. It is slower by design; it
is not an indication of app performance.

## Lighthouse numbers

Measured with Lighthouse 12.6.1 through `@lhci/cli` 0.15.1, default mobile emulation, against the
production build served by `scripts/serve-vercel.mjs` (which reads `vercel.json` and gzip-compresses
text responses). Reports are written to `.lighthouseci/` (ignored by git).

| Metric                   | `/`       | `/add`    |
| ------------------------ | --------- | --------- |
| Performance              | **0.93**  | **0.94**  |
| Accessibility            | **1.00**  | **1.00**  |
| Best practices           | **1.00**  | **1.00**  |
| First Contentful Paint   | 2.3 s     | 2.3 s     |
| Largest Contentful Paint | 2.9 s     | 2.7 s     |
| Total Blocking Time      | 50 ms     | 0 ms      |
| Cumulative Layout Shift  | 0.01      | 0.00      |
| Speed Index              | 2.3 s     | 2.3 s     |
| Total transfer           | 240 KiB   | 239 KiB   |
| Script transfer          | 224,763 B | 224,763 B |

The first run scored performance 0.43 with CLS 1.09 because the local verifier served uncompressed
JavaScript and Canvases painted at the default 300×150 before an effect resized them. Both were real
defects in the test environment/UI, not score chasing: the verifier now gzip-compresses like Vercel,
and `PixelImage` sizes its Canvas during render. No Lighthouse assertions were triggered after the
fix (accessibility/best practices errors at ≥0.90; performance warning at ≥0.80; script transfer
warning at ≤700,000 B; total ≤2,500,000 B). Lighthouse 12.6.1 has **no PWA category**, so
installability is covered by the manifest/install e2e tests and the manual checklist, not a
Lighthouse score.

## Bundle and offline-pack numbers

Measured from the final `dist/` after the lazy-validation change and Canvas fix:

| Item                                                     | Size                    |
| -------------------------------------------------------- | ----------------------- |
| Initial JS (gzip)                                        | **190.6 kB (≈186 KiB)** |
| Initial CSS (gzip)                                       | 7.3 kB                  |
| Initial JS + CSS                                         | ≈193.5 KiB              |
| All lazy JS, every on-demand chunk (gzip)                | 110.1 KiB               |
| Delve engine + worker + scenes + game UI (approx., gzip) | ≈57 KiB                 |
| Offline precache                                         | 89 entries, 1000.34 KiB |
| Audio files shipped                                      | 0                       |
| Art assets                                               | 121 assets / 309 frames |

The initial shell is **above the soft ~150 KB gzipped budget** by roughly 36 KiB. React + React
Router (78.5 kB gzip) and Dexie (33.9 kB gzip) account for the majority; the app itself is 69.4 kB.
The validation library (zod, 27.2 kB) was moved behind the backup/import actions, and every game
route plus the Delve worker is lazy. The initial budget is a soft target in the specification; the
trade was accepted rather than shipping a hand-rolled router or database. The Delve is comfortably
under its ~450 KB budget, and the ~1.0 MiB precache is well under the ~6 MB art+audio budget. These
are reported as measured, not rounded down.

## Acceptance matrix

Statuses: **verified** = a command/test was run and passed; **partially verified** = the code path is
tested but a real device, real grant, or deployment was not; **not run** = no evidence.

| #   | Acceptance item                                                                             | Status                                    | How / caveat                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Installable PWA; passes installability checks                                               | **partially verified**                    | `e2e/pwa.spec.ts` validates name, icons, standalone display, start/scope and shortcuts, and fetches every icon/shortcut; install card and synthetic `beforeinstallprompt` path covered. Real Android/desktop install **not run**.                                                                                               |
| 2   | Cold launch and full use offline after one online visit                                     | **verified (Chromium)**                   | `e2e/offline.spec.ts`: online load, `setOffline(true)`, cold reload, deep links, second tab, logging offline. Real airplane mode **not run**.                                                                                                                                                                                   |
| 3   | Update flow does not lose data or interrupt entry                                           | **verified (Chromium, simulated update)** | `e2e/offline.spec.ts` mutates the built `sw.js`, triggers an update, clicks Update, and asserts Today and a logged amount survive. Live Vercel update **not run**.                                                                                                                                                              |
| 4   | Add expense in at most 3 taps; safe-to-spend updates immediately                            | **verified**                              | `e2e/app.spec.ts` “a common expense is three taps”; screenshot checks confirm the updated number.                                                                                                                                                                                                                               |
| 5   | Envelope math exact (integer money), period boundaries correct                              | **verified**                              | `core-budget`, `core-dates`, `core-properties`, `currency` tests, including leap year, month ends, custom start day and DST-safe local dates.                                                                                                                                                                                   |
| 6   | Rollover and period close idempotent                                                        | **verified**                              | `core-budget.test.ts` (“is deterministic and safe to run twice”), `data-lifecycle.test.ts`; carry and sweep-to-goal included.                                                                                                                                                                                                   |
| 7   | Recurring catch-up correct after long absence                                               | **verified**                              | `core-recurring.test.ts`, `data-open.test.ts`; generation is keyed by recurring id + date.                                                                                                                                                                                                                                      |
| 8   | XP ledger idempotent; edit/delete/recreate cannot mint XP; caps work                        | **verified**                              | `core-rewards`, `data-ledger`, `core-properties` (edit/delete/recreate paths), cap tests.                                                                                                                                                                                                                                       |
| 9   | Streaks with rest tokens work; no loss of level on a miss                                   | **verified**                              | `core-streaks.test.ts`; rest tokens, month boundary, clock changes and idempotence.                                                                                                                                                                                                                                             |
| 10  | Quests rotate deterministically; claims work once                                           | **verified**                              | `core-quests.test.ts`, `data-quests.test.ts`; daily/weekly/season quests.                                                                                                                                                                                                                                                       |
| 11  | Achievements unlock correctly                                                               | **verified**                              | `core-achievements.test.ts`, `data-achievements.test.ts`, including install/offline/backup honesty fixes from Gate 5.                                                                                                                                                                                                           |
| 12  | Cosmetics purchase and equip persist; Sparks can't go negative                              | **verified**                              | Data tests, `e2e/delve.spec.ts` “the realm spends Sparks on looks and never touches the budget”.                                                                                                                                                                                                                                |
| 13  | Delve: same seed gives the same run; stepwise, batch, catch-up identical                    | **verified**                              | `delve-map`, `delve-engine`, `delve-golden`, 10,000-seed fuzz; explicit stepwise/batch/catch-up equivalence property tests.                                                                                                                                                                                                     |
| 14  | Delve oil only from trickle and logged habits; caps hold                                    | **verified**                              | `delve-economy.test.ts`; no amount- or category-derived oil; daily/storage caps.                                                                                                                                                                                                                                                |
| 15  | Catch-up capped at 12 h, clock-safe, chunked, claimable once                                | **partially verified**                    | Clock defense, caps, idempotent claiming and worker chunking tests pass; a real 12 h backlog ran in a real Node worker thread. Real-phone UI smoothness/timing **not run**.                                                                                                                                                     |
| 16  | Autopilot deterministic and explained; camp waits for the player                            | **verified**                              | Delve Autopilot tests and UI logs; camp/pending choice behavior in controller tests and e2e.                                                                                                                                                                                                                                    |
| 17  | Budget buffs capped at +15%, never penalties, never change data/access                      | **verified**                              | `delve-economy`/engine tests; budget writes are outside the Delve layer.                                                                                                                                                                                                                                                        |
| 18  | Retreat/faint/clear bank correct Embers; never remove meta                                  | **verified**                              | `delve-economy`, `delve-engine`; meta state not reduced by failure.                                                                                                                                                                                                                                                             |
| 19  | Delve and Forge state in export/import and migrations                                       | **verified**                              | `data-export-import.test.ts` round-trips every table; migration fixture tests upgrade v1 to v2.                                                                                                                                                                                                                                 |
| 20  | Delve not required for budgeting; never delays quick-add                                    | **verified**                              | All game routes/worker are lazy chunks; `e2e/app.spec.ts` quick-add runs without opening the Delve; bundle inspection confirms no game code in the initial chunks.                                                                                                                                                              |
| 21  | No notifications, limited-time events, or login-streak gates                                | **verified by audit**                     | Source search finds no Notification/push APIs, no scheduling or time-limited content; the Delve has no login streak or event clock. No automated absence test can prove a negative; this is a code/content review.                                                                                                              |
| 22  | `sim:delve` recorded; personas within targets                                               | **verified with caveat**                  | H1 first clears Trickle 13 d / Casual 7 d / Habit 4 d / Optimizer 4 d; no persona under 2 days; Optimizer/Trickle Embers 1.98× (cap 2.5×); Breaker reached floor 6/10 at Heat 5 with only trickle oil. First-attempt H1 faint rates 22/37/28/34 — Trickle is 3 points below the 25–40% band, accepted and recorded in PROGRESS. |
| 23  | 3 builds, skill trees, statuses, elements, affixes, boss phases                             | **verified**                              | `delve-builds`, `delve-skills`, `delve-elements`, `delve-affixes`, `delve-bosses`.                                                                                                                                                                                                                                              |
| 24  | Habit Cards change combat in priority order, with a why log                                 | **verified**                              | `delve-cards.test.ts`; reordering changes outcomes; skipped-card reasons are logged.                                                                                                                                                                                                                                            |
| 25  | Boss Study reveals information only; bosses never strengthen from failure                   | **verified**                              | `delve-bosses.test.ts`.                                                                                                                                                                                                                                                                                                         |
| 26  | Fusions, bad-luck protection, Heat 1–5, Workshop, milestone buildings                       | **verified**                              | `delve-boondepth`, `delve-heat`, `delve-workshop`, `delve-consumables`, `delve-buildings`.                                                                                                                                                                                                                                      |
| 27  | Oil can't be crafted/bought; milestones don't reward hiding spending                        | **verified**                              | `delve-workshop` and building milestone tests; only process/savings milestones.                                                                                                                                                                                                                                                 |
| 28  | Daily challenge identical per date and playable offline                                     | **verified**                              | `delve-daily.test.ts`; seeded by date, one attempt, local best, included in the offline pack.                                                                                                                                                                                                                                   |
| 29  | Fuzz (10k) + golden runs pass; Breaker finds no degenerate build                            | **verified**                              | `delve-fuzz.test.ts`, `delve-golden.test.ts`, `delve-breaker.test.ts`; Breaker CLI exits non-zero on a degenerate clear.                                                                                                                                                                                                        |
| 30  | Worker and Node simulations match; 12 h catch-up does not freeze UI; timing recorded        | **partially verified**                    | Real `node:worker_threads` parity test; 1440 steps in 86 ms in Node; UI uses a worker and progress events. Real mid-range phone UI timing **not run** (MANUAL_TEST #8).                                                                                                                                                         |
| 31  | Delve chunk lazy-loaded and precached; budgets recorded; reduced motion works               | **verified**                              | `e2e/delve.spec.ts` asserts the battle scene arrives as its own chunk; precache includes it; bundle table above; reduced-motion tests for both Canvas scenes.                                                                                                                                                                   |
| 32  | Art passes palette, size and frame-count validation; no runtime rotation/fractional scaling | **verified**                              | `npm run art:validate` PASS; art tests; the renderer uses integer `pixelGrid` sizes and no rotation.                                                                                                                                                                                                                            |
| 33  | Scenes crisp at integer scales across viewport/DPR combinations                             | **verified**                              | `e2e/visual.spec.ts` and `e2e/layout.spec.ts` across 390/1440 widths and DPR settings; `pixelGrid` tests.                                                                                                                                                                                                                       |
| 34  | Style-lock approval before mass production                                                  | **verified**                              | Owner approved on 2026-10-25 (“start generating the remaining assets”); recorded in PROGRESS.                                                                                                                                                                                                                                   |
| 35  | Independent art review notes and contact-sheet evidence; no hand-drawn claim                | **verified**                              | `docs/ART_NOTES.md`, `docs/art-preview/`; README states procedurally authored art.                                                                                                                                                                                                                                              |
| 36  | Pixel UI kit everywhere; Readable text and High contrast; money contrast                    | **verified**                              | `e2e/visual.spec.ts` (readable face), `e2e/a11y.spec.ts` (high contrast ≥7:1 bitmap remap), `tests/art-high-contrast.test.ts`; Lighthouse a11y 1.0.                                                                                                                                                                             |
| 37  | Audio works offline, starts after a gesture, respects volume/mute                           | **verified (Chromium)**                   | `tests/audio.test.ts` (tracks/presets/volumes), `e2e/sound.spec.ts` (no AudioContext before a gesture, one context, mute); no audio files, so offline needs no extra fetch. Real-device audio **not run**.                                                                                                                      |
| 38  | Offline pack precaches all art/audio; first-run progress; size budgets                      | **verified (Chromium)**                   | `e2e/pwa.spec.ts`/`offline.spec.ts`; 89 entries, 1000.34 KiB, 0 audio files; pack strip behavior covered. Real install download **not run**.                                                                                                                                                                                    |
| 39  | Weekly review and month summary work                                                        | **verified**                              | `e2e/delve.spec.ts` weekly review pays once; core/lifecycle tests for period close and month summary.                                                                                                                                                                                                                           |
| 40  | Export/import round trip; invalid import rejected with no partial writes; auto-backup       | **verified**                              | `data-export-import.test.ts` (round trip, invalid/newer file, rollback, merge/replace + backup); `e2e/app.spec.ts` second-browser round trip.                                                                                                                                                                                   |
| 41  | Migrations from every old schema fixture                                                    | **verified**                              | `data-migrations.test.ts`: v1 → v2 fixture upgrade, oil column backfill, empty-table creation, idempotent current version. Only v1 is older than the current schema.                                                                                                                                                            |
| 42  | Storage persistence status and backup reminder work                                         | **partially verified**                    | Settings status and one-time persistence request covered; backup nudge after 5 entries/7 days and export badge covered. A real browser persistence grant **not run**.                                                                                                                                                           |
| 43  | No network requests carry user data                                                         | **verified**                              | Source audit: no `fetch`/XHR/`sendBeacon`/WebSocket/EventSource and no external URLs in `src`, `public` or `index.html`; CSP `connect-src 'self'`; new `e2e/security.spec.ts` test listens to every request while onboarding and visiting six routes and asserts every request stays on the app's origin.                       |
| 44  | Accessibility basics (keyboard, labels, contrast, reduced motion)                           | **verified (automated)**                  | `e2e/a11y.spec.ts` audits seven screens (names, 44 px targets, canvas alternatives), focus ring, high contrast; reduced-motion tests; Lighthouse a11y 1.0. Human screen-reader pass **not run**.                                                                                                                                |
| 45  | `vercel.json` correct; preview deploy instructions documented                               | **partially verified**                    | `e2e/security.spec.ts` verifies rewrite, CSP/security headers, immutable hashed assets, no-cache for shell/sw/manifest and manifest content type through the local policy emulator; README documents both deploy paths and post-deploy checks. Live Vercel edge **not run**.                                                    |
| 46  | No dead buttons; no placeholder UI or lorem ipsum                                           | **partially verified**                    | All screens exercise real state in e2e; controls were reviewed for names/sizes; there is no placeholder copy. There is no exhaustive click-every-button test. The Theme field is deliberately static (see gaps).                                                                                                                |

## MUST deviations and other gaps

These are the places where the build intentionally or unavoidably diverges from the specification.
None of these were silently dropped.

1. **No daylight theme.** Settings shows the active theme (“Realm night”) and explains that a daylight
   theme is planned after the MVP. The specification lists a theme setting; only the night theme
   ships. The Realm has day/night variation in the art direction; the rest of the app does not.
2. **No read-only fallback for blocked storage.** A blocked/corrupt IndexedDB produces a full-screen
   explanatory panel with a reload action and no partial writes, not a read-only mode. The required
   “clear message, not blank screen” part is verified; the read-only fallback is not implemented.
3. **Initial JS over the soft budget.** 190.6 kB gzip vs ~150 KB. See the bundle table and trade-off
   above. Performance still scores 0.93–0.94 in Lighthouse.
4. **No Aseprite/PNG asset importer or atlas packing.** Art is replaced by editing the generated
   modules. The specification’s hand-drawn replacement path is not implemented. Contact sheets and
   animated previews exist for review.
5. **No manifest screenshots.** Name, icons, shortcuts, theme, standalone display and scope are
   present; screenshots were optional and are absent.
6. **SHOULD items not built:** allies and party, story chapters, Endless Hollow, Heat 6–10, weekly
   mutators, app lock (passcode/WebCrypto), CSV export, multiple companions, seasonal themes.
   Search/filter, undo, envelope rollover options, install shortcuts and the daily challenge are
   present.
7. **Real-device and deployment evidence absent.** No Android/iOS install, no real persistence grant,
   no real airplane mode, no live Vercel CSP/header check, no real-phone FPS or catch-up timing, and
   no human screen-reader session. These are the items in [MANUAL_TEST.md](MANUAL_TEST.md).
8. **`@lhci/cli` dev-tool advisories.** `npm install` reported 16 advisories in the Lighthouse CI
   dependency chain (dev-only); `npm audit --omit=dev` reports **0** production vulnerabilities.
   Lighthouse CI is not shipped in the app bundle.
9. **PWA category unavailable in Lighthouse 12.6.1.** Installability evidence is the manifest test,
   the install-card e2e, the offline e2e, and the manual device checklist.

## Suggested next features

In the specification’s own order and with the existing architecture in mind:

1. **SHOULD follow-up gates:** allies and party (7a), story chapters (7b), Endless Hollow and Heat
   6–10 (7c), weekly mutators (7d). Each should ship with its own tests and a `sim:delve` balance run.
2. **Daylight / system theme** and a real read-only storage mode; then the Aseprite/PNG override
   importer and atlas packing for a human artist.
3. **CSV export** alongside the JSON backup, and restore-to-new-device guidance (the JSON file already
   contains every table).
4. **Push notifications and sync** are explicitly out of scope for this local-only build: both need a
   server and an account model. If added, keep the privacy promise explicit and never gate budgeting
   behind the game.
5. **Localization** beyond number/date formatting; all UI strings already live in data modules for the
   game layer, but the React screens still use English literals.
6. **Real-device verification** of the manual checklist and a screen-reader listening pass before any
   public launch.

## Evidence pointers

- Gate-by-gate build log and decisions: [PROGRESS.md](PROGRESS.md).
- Manual device/deployment checklist: [MANUAL_TEST.md](MANUAL_TEST.md).
- Art review passes and compromises: [ART_NOTES.md](ART_NOTES.md).
- Product and engineering specification: [SPEC.md](SPEC.md).
- Install/run/deploy and privacy/backup guidance: [README.md](../README.md).

Pocketrealm is a tracking tool, not financial advice. No deployment was performed by the build
author; the owner deploys with the steps in the README.
