# Pocketrealm — Art Notes (Gate 0.5 style lock)

Everything in `src/art/` is authored in code: no bitmaps were traced, no stock or AI images are
shipped, and `assets/reference/` does not exist in this repo. This file records what was reviewed,
what changed, what was rejected, and what still cannot be proven here.

## What is in the locked set

| Item                         | Count                                                     | Where                                            |
| ---------------------------- | --------------------------------------------------------- | ------------------------------------------------ |
| Master palette               | 64 colours, 13 hue-shifted ramps, index 0 = transparent   | `src/art/palette.ts`                             |
| Bitmap face ("Lantern Sans") | 5x8 glyphs, 6px advance, uppercase                        | `src/art/font5x7.ts`                             |
| Pixel primitives             | pixmap/9-slice/Bayer dither/ordered light blend           | `src/art/px.ts`                                  |
| UI kit                       | 9-slice panels, buttons, keycaps, icons, focus ring       | `src/art/ui.ts` → `public/ui/*.png` (24 files)   |
| Companion                    | part-based rig, idle 6f/7fps, strike 6f/11fps             | `src/art/companion.ts`                           |
| Enemy                        | Tollbug idle 4f/7fps, lunge 5f/10fps                      | `src/art/enemies.ts`                             |
| Room                         | 320x180, 4 floor / 3 wall / 3 ceiling-lip variants, props | `src/art/tiles.ts`, `src/art/scenes/rootfall.ts` |
| Ambience loop                | 12 frames @ 10 FPS                                        | `ROOM_LOOP_FRAMES`                               |
| Audio                        | 1 chiptune loop + 3 SFX, pure Node wav writer             | `src/audio/`                                     |

Validator (`npm run art:validate`): **39 assets / 58 frames**, exports **8 preview PNGs, 6 animated
GIFs, 24 UI PNGs** — PASS. Assets are stored as palette _indices_, so an in-range index is proof the
pixel is a master-palette colour; the validator checks that bound plus canvas size, minimum frame
count, frames actually differing, and that every export exists on disk.

## Review process

Three independent passes. Each reviewer got **only the rendered PNGs** (no code, no descriptions),
was told to report concrete defects with the image and region, was warned that GIFs may render as
their first frame in their viewer, and had to keep it under 500 words. Sheets reviewed:
`palette.png`, `silhouettes.png`, `font.png`, `ui-kit.png`, `companion-contact.png`,
`enemy-contact.png`, `room-contact.png`, `room-1x.png`, plus the in-app captures
`app-today-mobile.png`, `app-today-numpad.png`, `app-art-mobile.png`, `app-art-desktop.png`.

### Round 1 → fixed

- **Peso sign was missing from the face.** Added `₱` (double-bar) and `₩`, and a real `*` so the
  `·`-free copy still parses. `src/art/font5x7.ts`.
- **Mock UI used system text next to bitmap text.** Every string on the Today mock, the number pad
  and the art page now goes through `PixelText`; the face is uppercase-only, so copy was shortened
  and a Readable-text toggle was added as the accessibility escape hatch.
- **Warden's lantern read as floating.** Lantern now attaches to the paw with a lit rim; the strike
  swing leaves a visible trail. `src/art/companion.ts`.
- **Torch plates were absent** — the flame looked painted onto the wall. Added a solid 2px stem and
  a 1px bracket arm.
- **Sheets were unjudgeable**: palette chips moved to steel frames on an ink page, silhouettes were
  re-cut onto parchment (black-on-near-black proves nothing).

### Round 2 → fixed (13-item defect list)

Tollbug shell ramp re-cut through `#ffd166`/`#ffb13b`; 64 confetti specks consolidated into two
2px L-specs; legs rebuilt as 2px with a joint and a lifted head; the room's cyan ellipses replaced
by dithered amber light pools and explicit props; contact shadow plus AO added at the wall/floor
seam; dithered amber cast from each torch onto the bricks; Warden gained a 1px idle bob and a 2–3px
forward step with squash on the strike; the staff column width was locked (it varied 6→11px between
frames); UI kit got a focus-ring sample, pressed fill one ramp darker, and a backspace key that
matches the digit keys; top-root fringing reduced.

### Round 3 → fixed

- **Floor joints vanished at 1x.** Mortar went to `ink900` and the stone faces sit three steps
  above it, so the tile grid survives downscaling; moss-in-joint probability dropped 22 → 10
  because it was reading as green noise. `src/art/tiles.ts`.
- **The ceiling was one continuous stripe.** The lip keeps a single lit row, notched per variant,
  over a single dark joint instead of three full-width rows.
- **The two arches were identical.** `drawArchDepth()` now takes a seed that shifts the Bayer phase,
  the hanging-root paths and the firefly positions; arch-base moss is sized per cluster with
  orphan-pixel guards. `src/art/scenes/rootfall.ts`.
- **The Warden's silhouette fused into one mass** where the staff and lantern cross the cloak. A
  `punchGap()` pass carves a 1px transparent trench around those parts before compositing, and the
  right paw moved onto the shaft column so the pole is actually held.
- **Paper grain looked like dirt** (3px L-clumps, asymmetric). Now symmetric pairs of 2px diagonal
  fibres, clear of the corner brackets. The Delve panel's quarter-density dither checkerboarded
  under the digits and is now a 10% ore-dust dither.
- **Guardians disappeared on dark panels.** The stone ring got a lit rim (steel on the upper-left
  arc, ink on the lower-right), the `over` face dropped to `steel1`, and `alert` got an open mouth
  so calm/alert differ by mass at 1x.
- **Coin underside collapsed** at small scale: the arc now carries an `ember4` edge with an `amber5`
  inner row.
- **Evidence gap closed.** `room-contact.png` previously had no way to audit animation from a still.
  It now carries the tile variants at 4x, the props at 4x, a 12-frame still strip of the ambience
  loop, and a full-frame **motion mask** (every pixel that differs from frame 0, tinted per frame)
  beside a frame-0 reference — so "the room is alive" is checkable without playing a GIF.

### In-app defects from the live captures

- The number-pad note clipped off the left edge of the display box: it now wraps at 22 characters,
  right-aligned, and `.numpad-display p` stretches instead of hugging the right edge.
- The art stage clipped both ends of an over-wide canvas on a 390px phone: `.stage-frame` uses
  `overflow-x: auto` with `margin-inline: auto` on the canvas, which centres it and still lets
  every pixel be scrolled to. `justify-content: center` alone clipped.

## Findings rejected, with evidence

Image-only reviewers also produce wrong claims. These were checked against the pixels and the code
and refused:

1. **"0 and O are indistinguishable."** The zero is a slashed zero (`01110 / 10001 / 10011 / 10101 /
11001 / 10001 / 01110`) — the longest diagonal a 5-wide rounded box allows. It renders in the app
   (visible on the `0` key in `app-today-numpad.png`) and is legible at 1x.
2. **"The Tollbug disc is squashed/rotated between frames."** `BugPose` only carries integer `dx`
   and `dy`; there is no scale or rotation path in the rig.
3. **"The keypad and submit button use a smooth hinted font."** That capture is a 780px-wide
   device-scale-factor-2 image being downscaled by the viewer. At native resolution the digits are
   the bitmap face.
4. **"The room thumbnail is drawn at a fractional scale."** The canvas is 640 backing pixels inside
   a 780px DPR-2 capture — an exact 2x integer scale.
5. **"ROSE `#ff0e66` is off-palette."** That hex is not in the master palette and does not appear in
   any asset; the validator would have failed it.

## What is deliberately outside the palette

Two things cannot be pixel-styled without faking a control, and both are opt-in and rare:

- The native `<select>` in the currency picker (OS-drawn arrow and list).
- The modal scrim behind the number pad (a flat alpha wash over the page, not a sprite).

## Not verified here — do not claim otherwise

- **Real-device FPS and touch behaviour.** All captures are headless Chromium (desktop 1440x900 and
  an emulated 390x844 @ DPR 2). No phone, no iOS Safari.
- **GIF motion itself.** Reviewers see stills; the GIFs were verified structurally (frame count,
  per-frame palette-index bounds, frames actually differ, all frames share dimensions) and by the
  motion mask. Infinite looping is gifenc's default and was not separately asserted, and no human
  watched each loop on a phone.
- **Perceptual style judgement is one person's.** Three machine reviews cannot substitute for the
  owner's eye — which is why this gate stops for approval instead of continuing into mass production.
- **Colour on real displays.** Everything was judged on one desktop profile; no calibration target.

## Commands behind the claims

```
npm run typecheck     # clean
npm test              # 20 passed (art, palette, currency, audio)
npm run art:sheets    # contact sheets + 6 GIFs + 24 UI PNGs
npm run art:validate  # PASS - 39 assets / 58 frames
npm run build         # 40 precache entries, 361.87 KiB
npm run art:shots     # in-app captures, "no page errors"
npx playwright test   # 25 passed (goldens re-cut after the art changes)
```
