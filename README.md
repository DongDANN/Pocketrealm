# Pocketrealm

**A budget app that keeps a dungeon in the basement.**

You open it to find out how much you can safely spend today. Three taps, a peso amount, done. The
lantern-lit Hollow you can descend afterwards is the reward for having a life outside the app: habits
you kept, money you logged, a week you reviewed. Miss a day and the dungeon waits politely. Nothing
in here judges you.

Money first, game second. No budgeting screen is hidden behind a fight, no streak is load-bearing, and
nothing in the app is purchasable with real money.

Everything below runs offline, on your device, with no account, no server, no analytics, no remote
fonts, no bank linking, and no phone home. Data is IndexedDB; the only way to move it to another
device is the JSON backup you download.

Vite 8, React 19, strict TypeScript, Dexie 4, Workbox service worker, procedurally generated pixel
art and chiptune.

## Try it

```bash
npm install
npm run dev          # http://localhost:5173
```

The dev server has no service worker — offline is a production-build behavior, and the e2e suite
proves it there.

## The house rules

These are not marketing lines; they are the invariants the tests defend.

- **Score never comes from money.** Embers, quests and achievements track habits kept and rooms
  cleared, never account balances. Being rich in real life buys nothing here.
- **Nothing is purchasable with real money.** No store, no IAP, no ads, no subscription.
- **No compulsion mechanics.** No countdowns, no loss aversion, no "your streak is dying!" guilt.
- **No shame.** Getting knocked out in the Delve costs that run, not your progress, your materials
  bank, or your history. A faint is a beat, not a punishment.
- **Offline is the default state.** Airplane mode changes nothing except the strip that says so.
- **Deterministic.** Same seed, same floor, same fight, same numbers — which is why there is a
  10,000-seed fuzz suite and a set of golden runs whose hashes are pinned in the tests.
- **Peso by default.** The currency setting changes how amounts are displayed. It never converts or
  rewrites stored money, because money is stored as integer minor units.

## Commands

| Command                | What it checks                                                                |
| ---------------------- | ----------------------------------------------------------------------------- |
| `npm run typecheck`    | `tsc --noEmit`, strict TypeScript                                             |
| `npm run lint`         | ESLint over `src`, `scripts`, `tests`, `e2e`                                  |
| `npm run format:check` | Prettier                                                                      |
| `npm test`             | Vitest: money math, Delve engine, data layer, migrations, art, audio, fuzz    |
| `npm run test:e2e`     | Playwright (Chromium): journeys, offline, update, install, a11y, CSP, visuals |
| `npm run art:validate` | Palette, canvas size, frame counts, exported sheets                           |
| `npm run sim:delve`    | Headless balance simulation: four personas plus the Breaker                   |
| `npm run sim:golden`   | Prints the golden-run state hashes pinned in the tests                        |
| `npm run lighthouse`   | Lighthouse CI against the local Vercel policy emulator (builds first)         |

Want the slow, paranoid stuff on its own:

```bash
npx vitest run tests/delve-fuzz.test.ts tests/delve-golden.test.ts
```

Current counts and the honest list of what has _not_ been verified live in
[docs/PROGRESS.md](docs/PROGRESS.md) and [docs/FINAL_REPORT.md](docs/FINAL_REPORT.md) rather than
rotting at the top of this file.

## Production, and the little emulator

```bash
npm run build        # tsc --noEmit && vite build -> dist/
npm run preview      # plain Vite preview
node scripts/serve-vercel.mjs   # http://127.0.0.1:4174 with vercel.json rewrites + headers
```

The build emits a Workbox worker that precaches the whole shell — every lazy chunk, the Delve engine,
the Canvas scenes, the art, the icons. `scripts/serve-vercel.mjs` exists so the CSP, cache rules and
manifest content type get tested against a real build instead of being trusted by eyeballing a JSON
file. There are no audio files to precache: music and SFX are synthesized at runtime.

## How the Delve works

A run is a seeded descent through a Hollow: rows of rooms across several floors — skirmish, elite,
treasure, rest, shop, event, boss. Oil buys the run start, not each room. Fights are **yours to play**:
the room opens, waits, and takes exactly one order per round — a swing, one of your four slotted
skills, a brace, or an item. The number the menu prints is the number the engine computes; both read
the same snapshot, which is a contract several tests exist to enforce.

Each floor carries one rule out of ten (skills cost more energy, elements invert, guard reflects,
crits heal the enemy, the leader is shielded by its escort, the market flips, and so on). A boss does
not just hit harder as it degrades; each phase **adds a behaviour**. After the run, Embers bank,
materials get a provenance ledger, capsules roll into a moveset, and Skill Dust climbs a level ladder.

The design and its gate-by-gate build log are the real documentation:
[docs/DELVE_REDESIGN.md](docs/DELVE_REDESIGN.md) and [docs/PROGRESS.md](docs/PROGRESS.md).

## Your data

- **Export** — Settings → Download backup: one JSON file, schema and app version included, every
  table (book, Delve state, Forge, cosmetics, achievements).
- **Import** — validated with zod, previewed with counts and dates, backed up automatically, then
  merged or replaced (replace needs an explicit checkbox). One transaction; a failed import writes
  nothing.
- **Delete everything** — type the confirmation word, and it offers an export first.
- **Durability** — the app requests persistent storage once and reports the result in Settings.
  Browsers can still evict site data, so install to the Home Screen and keep a backup off-device.

No sync, no cloud copy, no server-side anything. That is the point.

## Art and audio

All art is original and generated in code (`src/art`): one master palette with named ramps, a
palette-indexed pixmap toolkit, a bitmap font authored as data, Canvas 2D scenes at 320×180 logical
resolution integer-scaled into device pixels. Call it **procedurally authored pixel art** — no claim of
hand-drawn authorship is made, and the palette/size/frame rules are machine-enforced. Contact sheets
and animated previews: [docs/art-preview/](docs/art-preview/).

Audio is an original four-channel WebAudio synth with tracks and SFX stored as data. Nothing plays
until you touch something.

Replacing an asset means editing the module and re-running `npm run art:validate` plus the visual
tests. There is no Aseprite/PNG importer yet; that is a real toolchain gap for a human artist.

## Accessibility

Keyboard reachable everywhere, with a visible pixel focus ring and targets of at least 44×44 CSS
pixels. Canvas text carries an accessible name; decorative canvases are hidden from assistive
technology. **Readable text** swaps the bitmap face for the system face without moving layout.
**High contrast** remaps bitmap text to the lightest tones of its ramp (measured ≥7:1 on the dark
shell) while keeping the framing. Reduced motion is honoured globally and by both Canvas scenes;
charts ship labels and a data table, and no meaning is carried by colour alone. A real screen-reader
pass is still a manual item.

## Deploy it yourself

Deployment is left to the owner, and it is genuinely simple: import the repo in Vercel, accept the
detected **Vite** preset, set Build Command `npm run build` and Output Directory `dist`, pick Node.js
22.x (Vite 8 wants 20.19+ or 22.12+), and add **zero** environment variables. Or `npx vercel` then
`npx vercel --prod`.

`vercel.json` is read automatically and carries the SPA rewrite (excluding real files under
`/assets/`, `/ui/`, `/icons/`), immutable caching for hashed assets, `no-cache` for `/sw.js` and
`index.html`, the manifest content type, and a self-only CSP plus the usual header set. The manifest
uses `start_url: "/"` and `scope: "/"`, so **deploy at a domain root**, not a subpath.

After deploying: open it over HTTPS, check Application → Manifest and Service Workers, reload once
online so the offline pack is written, then turn the network off and keep entering expenses. Push a
change to see the "A new build is ready" banner and confirm the reload keeps the book intact. The
checklist with real statuses is [docs/MANUAL_TEST.md](docs/MANUAL_TEST.md).

## What this app will not do

Give financial advice. Sync. Send push notifications. Earn while closed. Hide a limitation: the
author has not deployed it, so live install prompts, the real Vercel edge, real-phone FPS and haptics,
and iOS Add-to-Home-Screen behavior are unverified — documented as such rather than waved at. Not yet
built: allies and party, story chapters, Endless Hollow, Heat 6–10, weekly mutators, app lock, CSV
export, multiple companions, seasonal themes.

## Layout

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
docs           SPEC, DELVE_REDESIGN, PROGRESS, MANUAL_TEST, FINAL_REPORT, ART_NOTES, art previews
```

## Docs

- [docs/SPEC.md](docs/SPEC.md) — product and engineering specification.
- [docs/DELVE_REDESIGN.md](docs/DELVE_REDESIGN.md) — the Delve's redesign: player turns, the rule
  floors, the patience economy, and the gates that build it.
- [docs/PROGRESS.md](docs/PROGRESS.md) — gate-by-gate build log, decisions and evidence.
- [docs/MANUAL_TEST.md](docs/MANUAL_TEST.md) — real-device and deployment checklist.
- [docs/FINAL_REPORT.md](docs/FINAL_REPORT.md) — acceptance matrix, Lighthouse and bundle numbers.
- [docs/ART_NOTES.md](docs/ART_NOTES.md) — art review passes and known visual compromises.

Pocketrealm is a tracking tool, not financial advice. Budget responsibly; delve cheerfully.
