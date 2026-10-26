# Pocketrealm

A calm, private, offline-first budgeting PWA with a lantern-lit dungeon. The budget comes first:
safe-to-spend today, a three-tap expense pad, envelopes, savings goals, weekly reviews, month
summaries, and a JSON backup file. The Delve is a second layer; no budgeting screen is gated behind
it, and missing a day costs nothing.

Philippine peso (PHP) is the default. The Settings currency field changes how amounts are displayed;
it never converts or rewrites stored amounts (money is kept as integer minor units).

Built with Vite 8, React 19, strict TypeScript, Dexie 4 and vite-plugin-pwa. There are no accounts,
no server, no analytics, no remote fonts, and no bank linking.

## Requirements

- Node.js 22.12 or newer (last verified on Node 22.23.1 with npm 10.9.8).
- Chromium for Playwright. `npm run lighthouse` also needs a local Chrome or Chromium.
- No environment variables, API keys, or database are required.

## Install and run

```bash
npm install
npm run dev          # Vite dev server, http://localhost:5173
```

The development server does not enable the service worker. Offline behavior is exercised against a
production build by the e2e suite and `npm run preview`.

## Verify

| Command                | What it checks                                                                |
| ---------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck`    | `tsc --noEmit`, strict TypeScript                                             |
| `npm run lint`         | ESLint over `src`, `scripts`, `tests`, `e2e`                                  |
| `npm run format:check` | Prettier formatting                                                           |
| `npm test`             | Vitest: core math, Delve engine, data layer, art, audio, 10,000-seed fuzz     |
| `npm run test:e2e`     | Playwright (Chromium): onboarding, entry, offline, update, install, a11y, CSP |
| `npm run art:validate` | Palette, canvas size, frame counts and exported art sheets                    |
| `npm run sim:delve`    | Headless balance simulation with four personas plus the Breaker               |
| `npm run lighthouse`   | Lighthouse CI through the Vercel policy emulator (builds first)               |

Last measured on 2026-10-26: typecheck, lint and formatting clean; **667/667 Vitest tests across 66
files**; **61/61 Playwright tests** in Chromium against the production build; art validation PASS for
**121 assets / 309 frames** (plus 16 preview PNGs, 12 GIFs and 44 UI PNGs). See
[docs/FINAL_REPORT.md](docs/FINAL_REPORT.md) for Lighthouse and bundle numbers and for what was not
verified.

The fuzz and golden tests are part of the default Vitest run. To run only the expensive ones:

```bash
npx vitest run tests/delve-fuzz.test.ts tests/delve-golden.test.ts
```

## Build and inspect production

```bash
npm run build        # tsc --noEmit && vite build -> dist/
npm run preview      # plain Vite preview of dist/
node scripts/serve-vercel.mjs   # http://127.0.0.1:4174 with vercel.json rewrites/headers applied
```

The production build emits a Workbox service worker. The build currently precaches **89 entries,
about 1.0 MiB** — the whole shell, every lazy chunk (including the Delve worker and Canvas scenes),
the manifest and the icons. There are no audio files; music and SFX are synthesized at runtime.

`scripts/serve-vercel.mjs` is a small local emulator for the deployment policy: it reads
`vercel.json`, applies the SPA rewrite and headers, serves `dist/`, and gzip-compresses text
responses the way Vercel does. It exists so the CSP, cache rules and manifest content type can be
tested against a real production build rather than trusted by inspection.

## Deploy to Vercel

Deployment is intentionally left to the project owner. Two paths work; neither needs a token from
this project.

### 1. Git integration (recommended)

1. Push the repository to GitHub/GitLab/Bitbucket.
2. In Vercel, **Add New → Project** and import the repository.
3. Use the detected **Vite** framework preset with:
   - Install Command: `npm install`
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Node.js: 22.x (Vite 8 requires Node 20.19+ or 22.12+)
4. Add no environment variables. There is no server, database or secret.
5. Deploy.

`vercel.json` is picked up automatically. It supplies:

- an SPA rewrite to `/index.html` that excludes real files under `/assets/`, `/ui/` and `/icons/`;
- `Cache-Control: public, max-age=31536000, immutable` for hashed assets and the Workbox runtime;
- `no-cache` for `/sw.js`, `/index.html`, the manifest and extensionless routes;
- `Content-Type: application/manifest+json` for `manifest.webmanifest`;
- a self-only CSP (`script-src 'self'`; `style-src 'self' 'unsafe-inline'` because React sets inline
  style attributes), plus `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and
  `X-Frame-Options`.

The manifest uses `start_url: "/"` and `scope: "/"`, so deploy at a domain root, not a subpath.

### 2. Vercel CLI

```bash
npx vercel          # first run links the project; accept the detected Vite settings
npx vercel --prod   # production deployment
```

Log in through the browser when the CLI asks. Keep the same build settings as above.

### After deploying

- Open the URL over HTTPS, then open DevTools → Application → Manifest and Service Workers. A
  service worker should activate after the first visit; the manifest should be recognised.
- Reload once online so the offline pack is written, then use the app with the network disabled.
- Run Lighthouse from DevTools. Lighthouse 12 has no separate PWA category; installability is covered
  by the manifest and install tests in this repository and by the manual checklist.
- Change something and redeploy to see the in-app "A new build is ready" banner; the update reload
  must keep the book intact.
- Check headers with `curl -I https://your-domain/` if you want to confirm the CSP and cache rules at
  the edge. The local verifier is evidence for the policy file, not for Vercel itself.

## How offline works

`vite-plugin-pwa` uses Workbox `generateSW` with `registerType: 'prompt'`. The first online visit
installs the service worker and precaches the entire build — the budgeting shell, every lazy route,
the Delve worker, the art and the icons. Navigation falls back to `index.html`, so deep links and the
thumb bar work with no network. The first-visit strip ("Preparing the offline pack…") stays visible
until the controller takes over, with a 30-second patience fallback; the app is usable the whole time.

Data lives in IndexedDB on this device. The service worker never stores or uploads user data. Updates
are offered in-app; clicking Update posts `SKIP_WAITING`, reloads on `controllerchange`, and keeps a
4-second fallback. The schema migrates on open after an update; nothing is cleared.

When a browser reports no network, a thin strip says "Working offline. Everything is saved on this
device." It is a status, not an alarm.

## Your data and backups

- **Export:** Settings → **Download backup** produces one JSON file with a schema version, app
  version and every table, including Delve state, Forge progress, cosmetics and achievements.
- **Import:** the file is validated with zod and previewed (counts and dates) before anything is
  written. A backup of the current book is created automatically; then choose **Merge: keep what I
  have** or **Replace: clear this book first** (replace requires an explicit confirmation
  checkbox). Import is one Dexie transaction; a failed import writes nothing.
- **Delete everything:** requires typing the confirmation word and offers an export first.
- **Storage durability:** the app asks for persistent storage once and shows the result in Settings.
  Browsers can still evict site data. Installing to the Home Screen and keeping an exported backup
  off-device are the reliable safeguards, especially on iOS Safari.

There is no sync and no cloud copy. The backup file is the only way to move the book to another device.

## Art and audio

All art is original and generated in code (`src/art`): a master palette with named ramps, a
palette-indexed pixmap toolkit, a bitmap font authored as data, and Canvas 2D scenes at 320×180
logical resolution, integer-scaled in device pixels. This is **procedurally authored pixel art**, not
hand-drawn art; no claim of hand-drawn quality is made. Contact sheets and animated previews are in
`docs/art-preview/`, and the palette/size/frame rules are enforced by `npm run art:validate` and the
art tests.

Audio is an original four-channel WebAudio synth with tracks and SFX stored as data. There are no
audio files, and audio starts only after a user gesture. Volume and mute live in Settings.

To replace an asset, edit the corresponding module and re-run `npm run art:validate` and the visual
tests. There is no Aseprite/PNG importer yet; that remains a toolchain gap for a human artist.

## Accessibility

- Every screen is keyboard reachable with a visible pixel focus ring; touch targets are at least
  44×44 CSS pixels.
- Canvas text exposes an accessible name; decorative canvases are hidden from assistive technology.
- **Readable text** switches the bitmap face for the system face without changing layout.
- **High contrast** remaps bitmap text to the lightest tones of its ramp on the dark shell (measured
  at ≥7:1) while keeping panel framing; standard mode targets AA and money labels target AAA.
- Reduced motion is respected globally and by both Canvas scenes; charts provide labels and a data
  table, and no meaning relies on colour alone.
- Playwright audits visible controls and names on seven screens; Lighthouse accessibility is **1.0**.
  A real screen-reader pass is still a manual item.

## Performance and bundle measurements

Measured on the production build (2026-10-26, local Vercel policy emulator, desktop Chromium):

| Metric                 | `/`           | `/add`        |
| ---------------------- | ------------- | ------------- |
| Lighthouse performance | 0.93          | 0.94          |
| Accessibility          | 1.00          | 1.00          |
| Best practices         | 1.00          | 1.00          |
| FCP / LCP              | 2.3 s / 2.9 s | 2.3 s / 2.7 s |
| TBT / CLS              | 50 ms / 0.01  | 0 ms / 0.00   |
| Total transfer         | 240 KiB       | 239 KiB       |

Initial JS is **190.6 kB gzipped (≈186 KiB)** plus 7.3 kB gzipped CSS. That is above the soft
~150 KB initial-shell budget; React + React Router (78.5 kB) and Dexie (33.9 kB) account for most of
it. All game code is lazy: the remaining JS totals 110.1 kB gzipped across every on-demand chunk,
including the Delve engine/worker/scene and the lazy zod validator — well under the ~450 KB Delve
budget. The precache is ~1.0 MiB including art, under the ~6 MB art+audio budget. These numbers are
recorded honestly rather than hidden; see the final report for the trade-off.

## Known limitations

- The project is **not deployed** by its author. Live HTTPS install prompts, the real Vercel edge and
  the production update flow are unverified.
- Android/desktop install prompts and iOS Safari Add to Home Screen have only been simulated in
  Chromium; real-device behavior is not verified. Storage-persistence grants depend on browser
  engagement rules and are not verified.
- Lighthouse runs locally against the policy emulator; scores vary by machine. Lighthouse 12.6.1 has
  no PWA category.
- Real-phone FPS, haptics, catch-up wall-clock time and screen-reader behavior are not measured. The
  catch-up timing and rendering smoke tests are desktop/Node evidence only.
- SHOULD items not built: allies and party, story chapters, Endless Hollow, Heat 6–10, weekly
  mutators, app lock, CSV export, multiple companions and seasonal themes. Undo, transaction
  search/filter, envelope rollover options and install shortcuts are present.
- The Aseprite/PNG override importer from the art direction is not implemented; art is replaced by
  editing code.
- There is no sync, no push notifications, no background progress while the app is closed, and no
  financial advice. The Delve catches up on open, capped at 12 hours.

## Project layout

```
src/core       pure TypeScript: money, periods, budgets, rewards, quests, streaks, Delve engine
src/data       Dexie schema, migrations, repositories, ledger, export/import, backups
src/game       content tables: levels, quests, achievements, cosmetics, Delve data, audio data
src/ui         React components, screens, hooks, app shell, styles
src/art        palette, pixmap toolkit, bitmap font, generated art modules, scenes
src/pwa        service-worker registration, install prompt, update flow, storage persistence
scripts        art sheets/validator, Delve simulation, golden hashes, Vercel policy emulator
tests          Vitest unit/property/fuzz/migration/art tests and fixtures
e2e            Playwright journeys: app, offline, update, install, a11y, security, visuals
docs           SPEC, PROGRESS, MANUAL_TEST, FINAL_REPORT, ART_NOTES, art previews
```

## Docs

- [docs/SPEC.md](docs/SPEC.md) — product and engineering specification.
- [docs/PROGRESS.md](docs/PROGRESS.md) — gate-by-gate build log, decisions and evidence.
- [docs/MANUAL_TEST.md](docs/MANUAL_TEST.md) — real-device and deployment checklist, with honest
  statuses.
- [docs/FINAL_REPORT.md](docs/FINAL_REPORT.md) — acceptance matrix, Lighthouse and bundle numbers,
  known limitations, suggested next features.
- [docs/ART_NOTES.md](docs/ART_NOTES.md) — art review passes and known visual compromises.

Pocketrealm is a tracking tool, not financial advice.
