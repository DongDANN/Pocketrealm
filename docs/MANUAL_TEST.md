# Pocketrealm — Manual test checklist

Everything here needs a real device, a real browser install surface, or a live Vercel deployment.
None of it was run by the build author; the automated Chromium evidence is named where it exists so
the two are not confused.

Status labels: **verified** (run and passed), **partially verified** (automated/Chromium evidence
only), **not run** (no evidence), **blocked** (cannot be run until the app is deployed).

Last updated: 2026-10-29.

## Summary

| #   | Check                                               | Status                 | Automated evidence / caveat                                      |
| --- | --------------------------------------------------- | ---------------------- | ---------------------------------------------------------------- |
| 1   | Android Chrome install prompt and standalone launch | **not run**            | `e2e/pwa.spec.ts` synthesizes `beforeinstallprompt` only         |
| 2   | iOS Safari Share → Add to Home Screen               | **not run**            | `e2e/pwa.spec.ts` renders the instructions card in Chromium      |
| 3   | Airplane-mode cold launch from the installed icon   | **partially verified** | `e2e/offline.spec.ts` uses `context.setOffline(true)` + reload   |
| 4   | Storage persistence grant                           | **partially verified** | request/skip paths covered; the browser's grant is not           |
| 5   | Update flow on a deployed preview                   | **partially verified** | `e2e/offline.spec.ts` mutates `dist/sw.js` locally               |
| 6   | Screen-reader pass                                  | **not run**            | accessible names and canvas alternatives are audited in Chromium |
| 7   | Deployed CSP, headers and manifest type             | **partially verified** | `e2e/security.spec.ts` runs the local `vercel.json` emulator     |
| 8   | Deployed Lighthouse and real-device performance     | **not run**            | local Lighthouse: 0.93–0.94 performance, 1.0 a11y/BP             |
| 9   | Haptics and reduced motion on a real phone          | **not run**            | reduced-motion Canvas behavior is tested in Chromium             |
| 10  | Playing a room by hand                              | **partially verified** | `e2e/delve.spec.ts` plays a whole run in Chromium; no phone run  |
| 11  | The battle screen and the collection menus          | **partially verified** | goldens, layout and a11y sweeps in Chromium; no phone run        |
| 12  | Floor rules and boss phases in hand                 | **not run**            | every rule has an engine outcome test; no phone run              |
| 13  | The patience ledger in hand                         | **not run**            | `tests/delve-patience.test.ts` pins the terms; no phone run      |

## 1. Android Chrome: install and standalone launch

**Status: not run.** Requires an Android phone and an HTTPS deployment.

1. Open the deployed URL in Chrome. Browse for a minute so the install criteria are met.
2. Reload once and wait until the "Preparing the offline pack…" strip disappears.
3. Open the browser menu and choose **Install app** / **Add to Home screen**. The in-app install card
   may offer the native prompt first; either path is acceptable.
4. Launch from the Home Screen icon.
5. Confirm there is no browser address bar, the app opens on Today, and the safe-to-spend number is
   present.
6. Open DevTools over USB if available: Application → Manifest shows the name, icons and shortcuts;
   Application → Service Workers shows an activated worker.
7. Repeat step 3 after dismissing the first card in a previous visit; the card should stay dismissed.

Expected: standalone display, the book survives, no install errors. Record the Chrome version and
Android version.

## 2. iOS Safari: Add to Home Screen

**Status: not run.** Requires an iPhone/iPad and an HTTPS deployment. Chrome on iOS is still Safari
under the hood; use Safari for this check.

1. Open the deployed URL in Safari. There is no `beforeinstallprompt` on iOS, so the app should show
   the one-time card: Share → Add to Home Screen.
2. Dismiss the card, reload, and confirm it does not nag again (it is remembered locally).
3. Tap Share → **Add to Home Screen**, give it a name, and add it.
4. Launch from the icon. Confirm standalone mode, Today visible, no Safari chrome.
5. Note iOS Safari storage behavior: a site that is not installed can have its IndexedDB evicted
   after seven days of non-use in some versions. Keep a backup file. Installed Home Screen apps are
   more durable but still not guaranteed.
6. Export a backup on iOS and confirm the download/share sheet appears. Re-import it and confirm the
   preview counts match.

Expected: standalone launch, no white screen, export works through the iOS share sheet. Record the
iOS/Safari version and whether storage persisted across a few days.

## 3. Airplane-mode cold launch

**Status: partially verified.** `e2e/offline.spec.ts` covers load-online-then-offline, cold reload,
deep links, a second tab, and logging while offline in Chromium. Real airplane mode and a real
installed icon are not run.

1. Open the deployed app online and wait for the offline pack to finish (the strip disappears; Settings
   reports the pack ready).
2. Close the tab/app completely.
3. Turn on airplane mode (or disable Wi-Fi and mobile data).
4. Launch the app from the Home Screen icon.
5. Confirm the book, Today's number, and the thumb bar appear; log one expense; navigate to
   Envelopes, History and the Delve.
6. Confirm the subtle offline strip appears and is not alarming.
7. Reload once while still offline; the app must still start.
8. Turn the network back on. The offline strip should disappear; the entry logged offline must still
   be present and no duplicate should appear.

Expected: full cold start with no network after one online visit. If the app shows a browser error,
record the exact step and whether the service worker was active before going offline.

## 4. Storage persistence

**Status: partially verified.** `e2e/offline.spec.ts` verifies that the first open asks
`navigator.storage.persist()` once and that a refusal is non-fatal. Whether the browser actually
grants persistence is not testable here.

1. Open Settings → Storage on a real browser. The status should say persisted or not persisted; it
   must not claim a guarantee.
2. If not persisted, tap the request button (if shown) and accept any browser prompt.
3. Reload and check the status again.
4. On Android, use `chrome://settings` → Site settings → storage, or the browser's site-information
   sheet, to see whether storage is marked persistent.
5. Leave the app unused for several days (especially on iOS Safari) and reopen. Record whether the
   book survived.
6. Export a backup before the wait, and import it if the data was evicted.

Expected: an honest status, no crash if permission is denied, and a recoverable path through the
backup file.

## 5. Update flow on a deployed preview

**Status: partially verified.** `e2e/offline.spec.ts` appends a comment to the built `sw.js`, triggers
`registration.update()`, waits for the banner, clicks Update, and asserts the book and a logged amount
survive. The test mutates files locally and restores them; a real Vercel deployment is not tested.

1. Deploy build A. Open it, wait for the offline pack, and log one distinctive expense.
2. Deploy build B (a visible copy change is enough).
3. Leave the first tab open (or reopen it). Within a short time the in-app update banner should appear.
4. Click **Update**. The page should reload once and the distinctive expense must remain.
5. Check that no half-typed entry is silently discarded; the update only runs when clicked.
6. Repeat while offline: an update banner must not appear from nowhere, and the app must stay usable.

Expected: a prompt, one reload, no data loss, and no silent swap mid-entry. Record the deploy IDs and
the time to banner.

## 6. Screen-reader pass

**Status: not run.** Automated checks verify accessible names, canvas alternatives (`aria-label` on
text canvases, `aria-hidden` on decorative ones), 44×44 targets, keyboard focus visibility, and
landmarks across seven screens (`e2e/a11y.spec.ts`). A human listening pass is different.

Use VoiceOver (iOS/macOS), TalkBack (Android), or NVDA (Windows):

1. On Today: the safe-to-spend number and its label must be announced as one meaningful phrase; the
   canvas text must not read as "graphic" or silence. The thumb bar must announce five destinations
   and the current one.
2. Tab through Today, Add, Envelopes, History and Settings. Every focus stop must have a visible ring
   and a name. The file-import control must be operable with Enter/Space.
3. On Add: the number pad must announce digits, and Save must announce the amount and envelope.
4. Turn on **High contrast** and re-check that the bitmap text is still readable and that nothing
   disappears.
5. Turn on **Readable text** and re-check that labels do not clip and money is still fully readable.
6. On Insights: confirm the chart has a useful text/data-table alternative, not just an image.
7. On the Delve: choice buttons and the map must be reachable and named; the battle scene must have a
   text log fallback or an accessible summary.

Expected: no unlabeled controls, no focus traps, no "button button", no amount read as an unlabelled
graphic. Record the screen reader and browser versions and any awkward phrasing.

## 7. Deployed CSP, headers and manifest type

**Status: partially verified.** `e2e/security.spec.ts` serves the production build through
`scripts/serve-vercel.mjs`, which reads `vercel.json`, and asserts the CSP/security headers, cache
rules, manifest content type, no inline scripts, inline style attributes still working, service worker
control, and a cold offline launch under CSP. Vercel's edge is not exercised.

1. `curl -I https://your-domain/` and confirm the CSP, `X-Content-Type-Options`, `Referrer-Policy`,
   `Permissions-Policy`, `X-Frame-Options` and `Cache-Control: no-cache`.
2. `curl -I https://your-domain/assets/<hashed-file>.js` and confirm the immutable cache header.
3. `curl -I https://your-domain/sw.js` and confirm `no-cache` and `application/javascript`.
4. `curl -I https://your-domain/manifest.webmanifest` and confirm
   `Content-Type: application/manifest+json` and `no-cache`.
5. Open DevTools → Console on every route after a reload and confirm there are no CSP violations.
6. Confirm the service worker registers, the app is controllable offline, and fonts/audio still work
   (there are no remote fonts and no audio files).

Expected: no console CSP errors, no blocked inline style attributes, the worker still controls the
page. Record any edge-specific header differences.

## 8. Deployed Lighthouse and real-device performance

**Status: not run.** Local Lighthouse on the production build through the policy emulator, re-measured
at Gate 7f: performance 0.91 (`/`) and 0.93 (`/add`), accessibility 1.0, best practices 1.0, CLS
0.00/0.00. Lighthouse 12.6.1 has no PWA category.

1. Run Lighthouse (Chrome DevTools → Lighthouse, mobile emulation) against the deployed URL with a
   cold cache. Record performance, accessibility and best-practices scores and FCP/LCP/TBT/CLS.
2. Install the app on a mid-range Android phone. Open the Delve and the Realm; watch for dropped
   frames while the scenes animate. Record the device model and observed smoothness.
3. Log an expense and time the interaction; the aim is three taps and no wait for the game layer.
4. Put the phone in low-power mode and repeat the Delve check. The app should remain usable, and
   reduced motion should be respected if enabled.
5. Open the app after 12+ hours away. There is nothing to catch up on — Autopilot and catch-up were
   removed at Gate 7b, so the app should open straight to Today, the oil meter should show the new
   day's trickle, and an open run should still be waiting at the room it stopped in. Record how long
   the cold open takes and whether any progress bar appears (it must not).

Expected: 90+ accessibility and best practices; performance reported honestly even if below the
local numbers. Real-device FPS and cold-open timing are not currently verified anywhere.

## 9. Haptics and reduced motion on a real phone

**Status: not run.** Reduced-motion Canvas behavior is tested in Chromium
(`e2e/visual.spec.ts`, `e2e/delve.spec.ts`); haptics require a device that supports
`navigator.vibrate`.

1. With haptics enabled in Settings, trigger a hit, a level-up and a quest claim. Confirm a short,
   non-repeating vibration where supported, and no vibration when the setting is off.
2. Enable the OS reduced-motion setting and reload. Both Canvas scenes should hold still, the
   auto-advance animations should stop, and the text log should carry the meaning.
3. Disable the OS setting and confirm motion returns without a reload if the app listens (or note
   that a reload is required).

Expected: haptics are optional and never the only feedback; reduced motion removes decorative motion
without removing information.

## 10. Playing a room by hand

**Status: partially verified.** Chromium plays a whole run end to end
(`e2e/delve.spec.ts` → "a whole Hollow is playable by hand"), and the open panel has a golden
(`e2e/visual.spec.ts` → `delve-turn-panel.png`). What Chromium cannot tell anyone is whether the
panel is usable with a thumb, in daylight, on a phone.

1. Descend into a Hollow with one payment. Confirm nothing moves until you press, and that the only
   thing the payment bought is the run — not rooms inside it.
2. Walk to a fight and read the room before committing. Every option should print its own arithmetic
   (`ATK 9 −4 DEF = 5` style) and the enemy row should say what each one is about to do. Check the
   numbers are legible at arm's length in daylight, without zooming.
3. Order a Brace with one thumb. Confirm the button is a thumb-sized target and that you did not
   have to re-read the panel after scrolling to find the incoming total it halves.
4. Scroll to the foot of the panel and read its note — each sum is computed by the function that
   resolves the hit. It sits under the Brace button, and the thumb bar is `position: fixed` over the
   bottom of the viewport, so confirm the note is reachable by scrolling rather than permanently
   parked behind the bar. (The full-page golden paints the bar across that line; in a stitched
   full-page capture a fixed element always lands mid-frame, so that part is the screenshot, not the
   layout.)
5. Commit one attack and compare what you pressed with what the recap charged. The printed sum and
   the log's sum must be the same number. A mis-tap costs the round, not the run — there is no undo,
   so confirm the price you read is the price you got.
6. Kill the app mid-fight and relaunch. The room should reopen at the same round with the same
   prices, not restart or resolve itself behind your back.
7. Lose a run. The summary should say what was banked and confirm nothing outside the run moved:
   level, Spark, cosmetics and Forge nodes stay where they were.

Expected: the room waits for you, prices what it will charge, and charges exactly that. The panel is
the game now, so its reachability and legibility are the checks that matter on a phone.

## 11. The battle screen and the collection menus

**Status: partially verified.** Chromium covers the layout at six viewports down to 360 px
(`e2e/layout.spec.ts`), the controls are audited for names and thumb size on every Workshop and
Codex tab (`e2e/a11y.spec.ts`), and the screens have goldens (`e2e/visual.spec.ts`). What Chromium
cannot tell anyone is whether the GBA-style plates read in daylight, or whether the dialog and the
bars feel right in the hand.

1. Fight one round and read the dialog box aloud. The line should type itself out, and one press
   anywhere on the box should finish it; a second press should advance. Confirm the arrow is the
   only small control and that it is never the only way to advance — pressing the box must work.
2. Compare the HP number with the bar. Drain a hit and check the bar steps down in hard blocks and
   the label lands on the number the engine charged, not a rounded one. A bar that arrives before
   the number, or a number that lags the bar, is a bug.
3. Turn on reduced motion at the OS level and repeat the round. Nothing should slide or shake; the
   numbers must still change in the same order, and the same inputs must produce the same recap.
4. Open the Bag. Craft one consumable and confirm the price printed is the price charged (the
   Workshop discount is already in the line), then equip it and watch a pocket fill. Fill all three
   pockets and confirm the fourth item says `Full` rather than silently replacing a pocket.
5. Start the next run and let the equipped item fire. Confirm it is spent, that the Bag shows the
   stock it actually has, and that crafting it again costs what the line says.
6. Between runs, open Summary. Unequip one move and confirm the slot reads
   `Empty — equip a known active below.` and that the loss is not permanent — re-equip it and the
   move is back. The grid holds four cells and never a fifth, whatever the level.
7. Open the Codex while one species is still unseen. Its tile must say `???` and its group header
   must be readable; a screen reader must announce it as `Entry N, not sighted` and must not leak
   the name. Kill it once, reopen, and confirm the name, lore and numbers appear as the mastery
   climbs — stat detail at 3, the weakness line at 2.
8. In high contrast, repeat steps 4 and 7. The cost lines, the element stripe on each move cell and
   the pocket frames must stay distinguishable; nothing should wash into the panel border.
9. At 360 px wide, craft one item and unequip one move with a thumb only. Every button must be
   reachable without horizontal scrolling and no label may clip.

Expected: the shell looks like a handheld cartridge, but every number on it is the engine's. The
type-out, the stepped bars and the dex reveal are decoration over decisions already made; if a
number and the model ever disagree, the model is right and the screen is wrong.

## 12. Floor rules and boss phases in hand

**Status: not run.** Each of the ten floor rules and five boss rules has an engine outcome test
(`tests/delve-rule-outcomes.test.ts`) and the data is pinned in `tests/delve-bosses.test.ts`. What
no test can judge is whether the rule reads clearly at the moment it matters, or whether a boss's
second phase feels like a change of behaviour rather than a damage spike.

1. Start a run and read the two lines under the map: `Floor rule:` and `Next floor:`. The rule
   under the map must be the one the run's log announced when the floor began.
2. Turn the floor over (rest or clear it) and confirm the map header now names the rule that was
   printed as "Next floor" before, and the log announced it again.
3. Play a `leader-guarded` floor against two enemies. The first enemy must refuse an attack in the
   menu with a reason that says it is guarded, and a stored order naming it must not be honoured.
4. Play a `guard-reflects` floor and brace. The menu must show the reflected number before the
   swing, and the log must give the enemy back the same 25% after it lands.
5. Fight a boss across both thresholds. With the boss studied, each phase must print its name and
   rule sentence; on an unstudied save it must print "shifts stance" and nothing more. Watch the
   phase rule do something visible — thorns cutting each swing, a shield soaking the next hit, a
   second blow, a Mark, or drained HP.

Expected: the rule is known before the floor is committed to, and the boss's phase changes what the
fight asks of the player rather than only how hard it hits.

## 13. The patience ledger in hand

**Status: not run.** The arithmetic, the seams and the guardrails are pinned by
`tests/delve-patience.test.ts` (interest math and its cap, skip ordering at the Forge grant, both
rooms' offers, the two-reward countdown, costs and interest never boosted, the ledger strings). What
no test can judge is whether the two terms read plainly on a phone before the player commits, or
whether declining a reward feels like a reasonable trade rather than a trick.

1. Open a run and expand the Kit. Under `Patience`, read both lines. The skip line must describe the
   offer before any skip exists ("decline a Treasure or Rest reward for ×1.8 on the next 2 Glint
   rewards"), and the interest line must name the exact Glint that will be paid at the current
   floor's end and the 40 cap.
2. Find a Treasure room. It must ask before paying, offering `Take N Glint` and `Skip the reward`
   with the same ×1.8 terms. Take it once and confirm the Glint lands and no boost exists.
3. In a later run, skip a Treasure reward. The Kit's skip line must count `2 more`, then `1 more`
   after the next boosted Glint reward, then return to the offer line; every boosted payout must be
   the base ×1.8 rounded and the log must say so.
4. Watch interest across a floor boundary: take note of held Glint and the Kit's promised amount,
   then finish the floor. The log must pay exactly that amount, and the camp's Glint must show it.
   Spend Glint just before a floor's end and confirm the paid interest falls with it.
5. On a `no-rest-heal` floor, a Rest room must not offer `Skip the rest`; on any floor, a room whose
   resting heals must offer it.
6. Confirm nothing else pays a multiplier: a skipped run must still heal, bank materials, earn
   Embers and take boons at their printed values.

Expected: a player can state both terms from the Kit before choosing either, and every boosted or
interest number they see is the one the ledger promised.

## Sign-off

| Date | Device / browser | Check | Result | Notes |
| ---- | ---------------- | ----- | ------ | ----- |
|      |                  |       |        |       |
|      |                  |       |        |       |
|      |                  |       |        |       |

Do not mark a check verified without the device, browser version, and observed result recorded here.
