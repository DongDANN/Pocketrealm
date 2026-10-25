/**
 * Renders the Gate 0.5 contact sheets and palette/font samples into docs/art-preview.
 * Pure Node: no browser required.
 */
import { mkdirSync } from 'node:fs';
import { C, MASTER_PALETTE, RAMPS, UI } from '../src/art/palette';
import { blit, createPixmap, fillRect, scalePixmap, setPx, type Pixmap } from '../src/art/px';
import { drawText, GLYPHS } from '../src/art/font5x7';
import { buildWarden } from '../src/art/companion';
import { buildTollbug, silhouette } from '../src/art/enemies';
import { bestiaryIds, critterRecipe, enemyFrames } from '../src/art/critters';
import { BOSSES, ELITES, ENEMIES } from '../src/core/delve/data/enemies';
import { composeRoomPreview } from '../src/art/scenes/rootfall';
import { composeStage } from '../src/art/scenes/hollow';
import {
  composeRealm,
  periodForHour,
  REALM_BUILDINGS,
  type RealmPeriod,
} from '../src/art/scenes/realm';
import { ascend, coverage, impact, puff, shockwave, slash, type Effect } from '../src/art/effects';
import {
  AFFIX_ICONS,
  BUTTON_DISABLED,
  BUTTON_HOVER,
  BUTTON_NORMAL,
  BUTTON_PRESSED,
  delvePanel,
  ELEMENT_ICONS,
  focusRing,
  guardian,
  iconBackspace,
  iconCheck,
  iconCoin,
  iconGear,
  iconMusic,
  iconOil,
  iconPlus,
  iconSpark,
  KEY_NORMAL,
  KEY_PRESSED,
  ledgerPanel,
  STATUS_ICONS,
} from '../src/art/ui';
import { savePixmap } from './lib/png';
import { saveGif } from './lib/gif';
import {
  FLAME_FRAMES,
  TORCH,
  FLOOR_TILES,
  WALL_FACES,
  WALL_TOPS,
  MUSHROOM,
  FERN_LARGE,
} from '../src/art/tiles';
import { ROOM_LOOP_FRAMES } from '../src/art/scenes/rootfall';

const OUT = 'docs/art-preview';
mkdirSync(OUT, { recursive: true });

function titleBlock(sheet: Pixmap, title: string, subtitle: string, width: number): void {
  drawText(sheet, 16, 14, title, C.paper0, 2);
  drawText(sheet, 16, 34, subtitle, C.amber3, 1);
  fillRect(sheet, 16, 46, width - 32, 1, C.ink400);
}

function label(sheet: Pixmap, x: number, y: number, text: string, color = C.paper2): void {
  drawText(sheet, x, y, text, color, 1);
}

function paletteSheet(): Pixmap {
  const rowH = 58;
  const width = 720;
  const height = 90 + Object.keys(RAMPS).length * rowH + 56;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(sheet, 'MASTER PALETTE', '64 COLORS - 13 HUE-SHIFTED RAMPS - INDEX 0 = CLEAR', width);
  let y = 70;
  for (const [name, colors] of Object.entries(RAMPS)) {
    label(sheet, 16, y + 10, name.toUpperCase(), C.paper1);
    const accent = colors.length < 5 ? ' STEPS (ACCENT)' : ' STEPS';
    label(sheet, 120, y + 10, `${colors.length}${accent}`, C.steel1);
    colors.forEach((hex, i) => {
      const x = 240 + i * 64;
      fillRect(sheet, x, y, 56, 34, i + 1 + colorOffset(name));
      // frame every chip in steel: an ink frame on an ink page hid the three darkest steps
      fillRect(sheet, x, y, 56, 1, C.steel2);
      fillRect(sheet, x, y + 33, 56, 1, C.steel2);
      fillRect(sheet, x, y, 1, 34, C.steel2);
      fillRect(sheet, x + 55, y, 1, 34, C.steel2);
      // labels always sit on the dark sheet, never on the swatch
      drawText(sheet, x + 2, y + 40, hex.slice(1).toUpperCase(), C.paper2, 1);
    });
    y += rowH;
  }
  drawText(
    sheet,
    16,
    height - 28,
    'LIGHT FROM TOP-LEFT - SHADOWS COOL TO VIOLET - ALL ASSETS PALETTE-LOCKED',
    C.steel1,
    1,
  );
  return sheet;
}

function colorOffset(name: string): number {
  let offset = 0;
  for (const [key, colors] of Object.entries(RAMPS)) {
    if (key === name) break;
    offset += colors.length;
  }
  return offset;
}

function fontSheet(): Pixmap {
  const width = 760;
  const glyphKeys = Object.keys(GLYPHS);
  const cols = 26;
  const cellW = 28;
  const cellH = 26;
  const glyphRows = Math.ceil(glyphKeys.length / cols);
  const height = 380 + glyphRows * cellH;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(
    sheet,
    'LANTERN SANS 5X8',
    'ORIGINAL BITMAP FONT - UPPERCASE + CURRENCY + EXTENDED LATIN',
    width,
  );
  label(sheet, 16, 58, '1X  CALM LEDGER 0123456789 $PYG', C.paper1);
  drawText(sheet, 16, 70, 'SAFE TO SPEND TODAY $34.18 PHP 1,250.00', C.paper0, 1);
  label(sheet, 16, 90, '2X  MONEY AND HEADINGS', C.paper1);
  drawText(sheet, 16, 102, '$34.18  -  1,250.00  -  EUR 12.40', C.amber2, 2);
  label(sheet, 16, 126, '3X  HERO MONEY', C.paper1);
  drawText(sheet, 16, 138, '$34.18', C.amber1, 3);
  label(sheet, 160, 126, '4X  PESO AT HERO SIZE', C.paper1);
  drawText(sheet, 160, 132, '₱4,250.00', C.amber1, 4);
  label(sheet, 16, 172, 'CURRENCY SET  $ EUR(y) GBP(y) JPY(y) INR(r) PHP(P) KRW(W)', C.steel1);
  drawText(sheet, 16, 184, '$ € £ ¥ ₹ ₱ ₩ ¢', C.paper0, 2);
  // glyph grid
  label(sheet, 16, 216, 'GLYPH GRID - 2X', C.paper1);
  glyphKeys.forEach((key, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 16 + col * cellW;
    const y = 232 + row * cellH;
    drawText(sheet, x, y, key, C.paper1, 2);
    drawText(sheet, x, y + 18, key.charCodeAt(0).toString(16).toUpperCase(), C.steel2, 1);
  });
  drawText(
    sheet,
    16,
    height - 26,
    `GLYPHS ${glyphKeys.length} - READABLE TEXT TOGGLE SWAPS TO THE SYSTEM FACE AT THE SAME LAYOUT`,
    C.steel2,
    1,
  );
  return sheet;
}

function rowOfFrames(
  sheet: Pixmap,
  frames: readonly Pixmap[],
  x0: number,
  y0: number,
  scale: number,
  gap = 4,
  maxWidth = 1000,
): void {
  let x = x0;
  for (const frame of frames) {
    const s = scalePixmap(frame, scale);
    if (x + s.w > maxWidth) break;
    blit(sheet, s, x, y0);
    x += s.w + gap;
  }
}

function onionSkin(frames: readonly Pixmap[], scale: number): Pixmap {
  const out = createPixmap(frames[0]!.w * scale, frames[0]!.h * scale);
  const tints = [C.moss1, C.teal1, C.cyan2, C.violet2, C.amber2, C.rose1];
  frames.forEach((frame, i) => {
    const color = tints[i % tints.length]!;
    for (let y = 0; y < frame.h; y++) {
      for (let x = 0; x < frame.w; x++) {
        if (!frame.data[y * frame.w + x]) continue;
        const edge =
          x === 0 ||
          y === 0 ||
          x === frame.w - 1 ||
          y === frame.h - 1 ||
          !frame.data[y * frame.w + x - 1] ||
          !frame.data[y * frame.w + x + 1] ||
          !frame.data[(y - 1) * frame.w + x] ||
          !frame.data[(y + 1) * frame.w + x];
        if (!edge) continue;
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            setPx(out, x * scale + dx, y * scale + dy, color);
          }
        }
      }
    }
  });
  return out;
}

/**
 * The room has no transparent pixels, so an outline onion skin of it is empty. This paints
 * only what moves: every pixel that differs from frame zero, tinted by frame.
 */
function motionMask(frames: readonly Pixmap[]): Pixmap {
  const base = frames[0]!;
  const out = createPixmap(base.w, base.h, C.ink900);
  const tints = [C.moss1, C.teal1, C.cyan2, C.violet2, C.amber2, C.rose1];
  frames.forEach((frame, i) => {
    if (i === 0) return;
    const color = tints[i % tints.length]!;
    for (let y = 0; y < frame.h; y++) {
      for (let x = 0; x < frame.w; x++) {
        const at = y * frame.w + x;
        if (frame.data[at] === base.data[at]) continue;
        setPx(out, x, y, color);
      }
    }
  });
  return out;
}

function onionLegend(sheet: Pixmap, x: number, y: number, note?: readonly string[]): void {
  const tints = [C.moss1, C.teal1, C.cyan2, C.violet2, C.amber2, C.rose1];
  label(sheet, x, y, 'TINT = FRAME', C.paper2);
  tints.forEach((color, i) => {
    fillRect(sheet, x, y + 14 + i * 13, 8, 8, color);
    label(sheet, x + 14, y + 14 + i * 13, `${i + 1}`, C.steel1);
  });
  (note ?? ['OUTLINES ONLY.', 'OVERLAP SHOWS', 'POSE DRIFT.']).forEach((line, i) =>
    label(sheet, x, y + 100 + i * 12, line, C.steel1),
  );
}

function paperPanel(sheet: Pixmap, x: number, y: number, w: number, h: number): void {
  fillRect(sheet, x, y, w, h, C.paper2);
  fillRect(sheet, x, y, w, 1, C.paper4);
  fillRect(sheet, x, y + h - 1, w, 1, C.paper5);
  fillRect(sheet, x, y, 1, h, C.paper4);
  fillRect(sheet, x + w - 1, y, 1, h, C.paper5);
}

function companionSheet(): Pixmap {
  const warden = buildWarden();
  const width = 1020;
  const height = 1160;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(
    sheet,
    'Mossling Warden',
    'COMPANION BUILD 1 - 12 FRAMES - 48X48 - PART-BASED RIG',
    width,
  );
  label(sheet, 16, 60, 'IDLE 6 - 1X', C.amber3);
  rowOfFrames(sheet, warden.idle, 16, 72, 1, 6);
  label(sheet, 340, 60, 'ATTACK 6 - 1X', C.amber3);
  rowOfFrames(sheet, warden.attack, 340, 72, 1, 6);
  label(sheet, 780, 60, 'SILHOUETTE', C.amber3);
  // ink-on-ink proves nothing: silhouettes get checked on parchment
  paperPanel(sheet, 772, 74, 118, 60);
  blit(sheet, scalePixmap(silhouette(warden.idle)[2]!, 1), 780, 82);
  blit(sheet, scalePixmap(silhouette(warden.attack)[3]!, 1), 834, 82);

  label(sheet, 16, 138, 'IDLE - 3X', C.amber3);
  rowOfFrames(sheet, warden.idle, 16, 150, 3, 6, width - 16);
  label(sheet, 16, 310, 'ATTACK - 3X', C.amber3);
  rowOfFrames(sheet, warden.attack, 16, 322, 3, 6, width - 16);

  label(
    sheet,
    16,
    492,
    'ONION SKIN - SILHOUETTE OUTLINES @ 3X - IDLE LEFT / ATTACK RIGHT',
    C.amber3,
  );
  blit(sheet, onionSkin(warden.idle, 3), 16, 504);
  blit(sheet, onionSkin(warden.attack, 3), 176, 504);
  onionLegend(sheet, 340, 504);

  label(sheet, 16, 664, '6X KEY POSES: IDLE 3 / ATTACK 4 / SILHOUETTE IDLE 3', C.amber3);
  blit(sheet, scalePixmap(warden.idle[2]!, 6), 16, 676);
  blit(sheet, scalePixmap(warden.attack[3]!, 6), 316, 676);
  paperPanel(sheet, 608, 668, 304, 304);
  blit(sheet, scalePixmap(silhouette(warden.idle)[2]!, 6), 616, 676);
  label(sheet, 16, 980, 'PORTRAIT 64X64 - 2X', C.amber3);
  blit(sheet, scalePixmap(warden.portrait, 2), 16, 992);
  label(sheet, 160, 1000, 'CHECKLIST: SILHOUETTE READS AT 1X; LANTERN IS THE KEY LIGHT;', C.steel1);
  label(sheet, 160, 1014, 'SELOUT DARKER LOWER-RIGHT; DITHER ONLY ON THE SHADOW SIDE.', C.steel1);
  label(sheet, 160, 1036, 'NO ROTATION. FRAMES COMPOSITED FROM BODY + STAFF OFFSETS.', C.steel1);
  label(sheet, 160, 1058, 'GENERATED ART, NOT HAND-DRAWN. PALETTE-LOCKED.', C.steel1);
  label(
    sheet,
    16,
    1088,
    'ANIMATED: docs/art-preview/anim-warden-idle.gif + anim-warden-attack.gif (4X)',
    C.amber2,
  );
  return sheet;
}

function enemySheet(): Pixmap {
  const bug = buildTollbug();
  const width = 940;
  const height = 860;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(
    sheet,
    'Tollbug',
    'ROOTFALL WARREN ENEMY - 9 FRAMES - 32X32 - COIN-SHELL BEETLE',
    width,
  );
  label(sheet, 16, 60, 'IDLE 4 - 1X', C.amber3);
  rowOfFrames(sheet, bug.idle, 16, 72, 1, 12);
  label(sheet, 200, 60, 'ATTACK 5 - 1X', C.amber3);
  rowOfFrames(sheet, bug.attack, 200, 72, 1, 12);
  label(sheet, 450, 60, 'SILHOUETTES', C.amber3);
  paperPanel(sheet, 444, 70, 62, 44);
  rowOfFrames(sheet, silhouette(bug.idle), 450, 76, 1, 6);

  label(sheet, 16, 130, 'IDLE - 3X', C.amber3);
  rowOfFrames(sheet, bug.idle, 16, 142, 3, 8);
  label(sheet, 16, 250, 'ATTACK - 3X', C.amber3);
  rowOfFrames(sheet, bug.attack, 16, 262, 3, 8);

  label(sheet, 16, 380, 'IDLE - 6X', C.amber3);
  rowOfFrames(sheet, bug.idle, 16, 392, 6, 12, width - 16);
  label(sheet, 16, 596, 'ATTACK 3 + 4 - 6X / SILHOUETTE - 6X', C.amber3);
  blit(sheet, scalePixmap(bug.attack[2]!, 6), 16, 608);
  blit(sheet, scalePixmap(bug.attack[3]!, 6), 226, 608);
  paperPanel(sheet, 428, 600, 208, 208);
  blit(sheet, scalePixmap(silhouette(bug.idle)[0]!, 6), 436, 608);
  label(sheet, 650, 620, 'SHARP METAL HIGHLIGHTS', C.steel1);
  label(sheet, 650, 636, 'KEYHOLE SEAL = TOLL MOTIF', C.steel1);
  label(sheet, 650, 652, 'ANTENNA GLOW ANIMATES', C.steel1);
  label(sheet, 650, 668, 'NO ROTATION / NO SCALE', C.steel1);
  label(sheet, 650, 700, 'ANIMATED: anim-tollbug-idle.gif', C.amber2);
  label(sheet, 650, 714, 'anim-tollbug-attack.gif (4X)', C.amber2);
  return sheet;
}

function nineSlice(src: Pixmap, w: number, h: number, slice: number): Pixmap {
  const out = createPixmap(w, h);
  const midW = src.w - slice * 2;
  const midH = src.h - slice * 2;
  const dstMidW = w - slice * 2;
  const dstMidH = h - slice * 2;
  if (dstMidW < 0 || dstMidH < 0) throw new Error('Destination smaller than slice');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sx: number;
      let sy: number;
      if (x < slice) sx = x;
      else if (x >= w - slice) sx = src.w - (w - x);
      else sx = slice + Math.floor(((x - slice) * midW) / Math.max(1, dstMidW));
      if (y < slice) sy = y;
      else if (y >= h - slice) sy = src.h - (h - y);
      else sy = slice + Math.floor(((y - slice) * midH) / Math.max(1, dstMidH));
      setPx(out, x, y, src.data[sy * src.w + sx] ?? 0);
    }
  }
  return out;
}

function gaugePreview(value: number, width = 148): Pixmap {
  const p = createPixmap(width, 12);
  fillRect(p, 0, 0, width, 12, C.ink900);
  fillRect(p, 1, 1, width - 2, 10, C.ink500);
  fillRect(p, 2, 2, width - 4, 8, C.ink700);
  const fillW = Math.round((width - 6) * value);
  fillRect(p, 3, 3, fillW, 6, C.amber3);
  fillRect(p, 3, 3, fillW, 2, C.amber1);
  fillRect(p, 3, 7, fillW, 1, C.amber5);
  for (let x = 3; x < fillW; x += 8) fillRect(p, x, 3, 1, 6, C.amber4);
  return p;
}

function uiSheet(): Pixmap {
  const width = 900;
  const height = 780;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(sheet, 'UI KIT SEED', 'TWO 9-SLICE SKINS - KEYS - GAUGES - GUARDIANS - ICONS', width);
  const ledger = ledgerPanel();
  const delve = delvePanel();
  blit(sheet, nineSlice(ledger, 200, 100, 8), 16, 64);
  label(sheet, 16, 170, 'LEDGER PANEL - PARCHMENT SKIN', C.paper2);
  blit(sheet, nineSlice(delve, 200, 100, 8), 240, 64);
  label(sheet, 240, 170, 'DELVE PANEL - STEEL + CRYSTAL', C.frost1);
  // buttons
  const buttons = [
    [BUTTON_NORMAL, 'NORMAL'],
    [BUTTON_HOVER, 'HOVER'],
    [BUTTON_PRESSED, 'PRESSED'],
    [BUTTON_DISABLED, 'DISABLED'],
  ] as const;
  buttons.forEach(([pix, text], i) => {
    const bx = 470 + (i % 2) * 210;
    const by = 64 + Math.floor(i / 2) * 74;
    const pressed = i === 2;
    const bY = pressed ? by + 2 : by;
    blit(sheet, nineSlice(pix, 190, 46, 6), bx, bY);
    if (pressed) {
      // 1px compression line so pressed reads as inset, not just darker
      fillRect(sheet, bx + 2, bY + 2, 186, 1, C.ink700);
      fillRect(sheet, bx + 2, bY + 2, 1, 42, C.ink700);
    }
    drawText(sheet, bx + 18, bY + 15, 'LOG EXPENSE', i === 3 ? C.ink700 : C.ink900, 1);
    label(sheet, bx, by + 52, `UI BUTTON ${text}`, C.steel1);
  });
  // keys
  label(sheet, 16, 200, 'NUMBER PAD KEYS - 24X24 AT 3X', C.amber3);
  blit(sheet, scalePixmap(KEY_NORMAL, 3), 16, 214);
  blit(sheet, scalePixmap(KEY_PRESSED, 3), 118, 214);
  drawText(sheet, 16 + 18, 214 + 15, '7', C.ink900, 2);
  drawText(sheet, 118 + 18, 214 + 17, '4', C.ink900, 2);
  label(sheet, 16, 302, 'NORMAL', C.paper2);
  label(sheet, 118, 302, 'PRESSED', C.paper2);
  // gauge
  label(sheet, 240, 200, 'GAUGES - OIL / HP / ENVELOPE', C.amber3);
  blit(sheet, gaugePreview(0.72), 240, 216);
  blit(sheet, gaugePreview(0.38), 240, 234);
  blit(sheet, gaugePreview(0.92), 240, 252);
  label(sheet, 398, 218, 'OIL 144/200', C.amber1);
  label(sheet, 398, 236, 'HP 38/100', C.rose1);
  label(sheet, 398, 254, 'GROCERIES 92%', C.amber2);
  // guardians
  label(sheet, 590, 200, 'ENVELOPE GUARDIANS', C.amber3);
  const states = [
    ['CALM', 'calm'],
    ['ALERT', 'alert'],
    ['NEEDS ATTENTION', 'strain'],
    ['OVERSPENT', 'over'],
  ] as const;
  states.forEach(([text, state], i) => {
    const gx = 540 + (i % 2) * 150;
    const gy = 216 + Math.floor(i / 2) * 66;
    blit(sheet, scalePixmap(guardian(state), 2), gx, gy);
    label(sheet, gx + 54, gy + 10, text, C.paper2);
  });
  // icons
  label(sheet, 16, 340, 'ICONS 16X16 - 3X', C.amber3);
  const icons = [
    iconCoin(),
    iconSpark(),
    iconOil(),
    iconPlus(),
    iconCheck(),
    iconGear(),
    iconMusic(),
  ];
  icons.forEach((icon, i) => {
    blit(sheet, scalePixmap(icon, 3), 16 + i * 60, 354);
  });
  // the backspace glyph is ink-on-keycap; on the dark sheet it would be invisible
  blit(sheet, scalePixmap(KEY_NORMAL, 2), 16 + 7 * 60, 350);
  blit(sheet, scalePixmap(iconBackspace(), 2), 16 + 7 * 60 + 14, 366);
  label(
    sheet,
    16,
    410,
    'COIN / SPARK / OIL / ADD / CHECK / SETTINGS / MUSIC / BACKSPACE ON KEY',
    C.steel1,
  );
  // focus ring over both skins, drawn around a control so it reads as a ring and not a box
  label(sheet, 590, 340, 'FOCUS RING 3X - OVER PARCHMENT AND STEEL', C.amber3);
  const ring = scalePixmap(focusRing(), 3);
  blit(sheet, nineSlice(ledger, 96, 96, 12), 540, 354);
  blit(sheet, ring, 552, 366);
  blit(sheet, scalePixmap(KEY_NORMAL, 2), 564, 378);
  blit(sheet, nineSlice(delve, 96, 96, 12), 650, 354);
  blit(sheet, ring, 662, 366);
  blit(sheet, scalePixmap(KEY_NORMAL, 2), 674, 378);
  label(sheet, 540, 450, 'OUTER INK / INNER AMBER - HOLDS ON BOTH SKINS', C.steel1);
  // palette row
  label(sheet, 16, 448, 'UI CORE', C.amber3);
  const uiEntries = Object.entries(UI);
  uiEntries.forEach(([key, hex], i) => {
    const x = 16 + (i % 8) * 108;
    const y = 464 + Math.floor(i / 8) * 34;
    fillRect(sheet, x, y, 16, 16, colorIndexSafe(hex));
    label(sheet, x + 22, y + 4, key.toUpperCase(), C.paper2);
  });
  label(sheet, 16, 570, 'THE UI KIT DIFFERS FROM THE SCENE ATLAS: PARCHMENT FOR MONEY,', C.steel1);
  label(sheet, 16, 584, 'STEEL + CRYSTAL FOR THE DELVE. FOCUS RING IS ALWAYS VISIBLE.', C.steel1);
  label(sheet, 16, 606, 'MONEY INK/PARCHMENT CONTRAST CHECKED IN tests/art.test.ts.', C.steel1);
  return sheet;
}

function colorIndexSafe(hex: string): number {
  const idx = MASTER_PALETTE.indexOf(hex.toLowerCase());
  return idx > 0 ? idx : C.rose2;
}

function swatchRow(
  sheet: Pixmap,
  tiles: readonly Pixmap[],
  x0: number,
  y0: number,
  scale: number,
): number {
  let x = x0;
  for (const t of tiles) {
    const s = scalePixmap(t, scale);
    blit(sheet, s, x, y0);
    x += s.w + 4;
  }
  return x;
}

function roomSheet(): Pixmap {
  const width = 1000;
  const height = 2140;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(
    sheet,
    'Rootfall Warren',
    'HOLLOW 1 ROOM - 320X180 - PARALLAX + DITHERED LIGHT - NO BLUR',
    width,
  );
  label(sheet, 16, 58, 'SCENE 1X', C.amber3);
  const scene = composeRoomPreview(2);
  blit(sheet, scene, 16, 70);
  label(sheet, 16, 262, 'SCENE 3X', C.amber3);
  blit(sheet, scalePixmap(scene, 3), 16, 274);
  label(sheet, 16, 822, 'LANTERN LIGHT DETAIL 6X (CROP)', C.amber3);
  const crop = createPixmap(160, 90);
  blit(crop, scene, -80, -74);
  blit(sheet, scalePixmap(crop, 6), 16, 834);

  // Tile variants: the room is built from these, so a repeat has to be judgeable on its own.
  label(sheet, 16, 1382, 'TILE VARIANTS 4X - FLOOR 4 / WALL FACE 3 / CEILING LIP 3', C.amber3);
  let cursor = swatchRow(sheet, FLOOR_TILES, 16, 1398, 4);
  cursor += 12;
  cursor = swatchRow(sheet, WALL_FACES, cursor, 1398, 4);
  cursor += 12;
  swatchRow(sheet, WALL_TOPS, cursor, 1398, 4);
  label(sheet, 16, 1478, 'PROPS 4X - TORCH / MUSHROOM / FERN', C.amber3);
  swatchRow(sheet, [TORCH, MUSHROOM, FERN_LARGE], 16, 1494, 4);

  // Ambience loop as stills: a GIF cannot be reviewed frame-by-frame by an image-only pass.
  const frames = Array.from({ length: ROOM_LOOP_FRAMES }, (_, i) => composeRoomPreview(i));
  label(
    sheet,
    16,
    1620,
    'AMBIENCE LOOP - 12 FRAMES - 160X90 CROP AT THE LANTERN AND TORCHES',
    C.amber3,
  );
  frames.forEach((frame, i) => {
    const c = createPixmap(160, 90);
    blit(c, frame, -60, -30);
    blit(sheet, c, 16 + (i % 6) * 160, 1636 + Math.floor(i / 6) * 92);
  });
  // Full frame, not a crop: the fireflies live at the arches and a cropped mask hides half the loop.
  label(sheet, 16, 1830, 'MOTION MASK 1X - PIXELS DIFFERING FROM FRAME 0', C.amber3);
  blit(sheet, motionMask(frames), 16, 1846);
  label(sheet, 356, 1830, 'FRAME 0 REF 1X', C.amber3);
  blit(sheet, frames[0]!, 356, 1846);
  onionLegend(sheet, 700, 1846, [
    'A PIXEL SHOWS ONLY WHEN IT',
    'CHANGES FROM FRAME 0, SO BLANK',
    'STONE IS STONE AND MOTION IS',
    'CONFINED TO LIGHT, MOSS, FLIES.',
  ]);
  label(
    sheet,
    16,
    2060,
    'PARALLAX: FAR 1/4X - MAIN 1X - FOREGROUND 1.5X. CAMERA ON INTEGER PIXELS.',
    C.steel1,
  );
  label(
    sheet,
    16,
    2074,
    'LIGHT IS A DITHERED ADDITIVE SPRITE; VIGNETTE IS A DITHERED MASK.',
    C.steel1,
  );
  label(
    sheet,
    16,
    2088,
    'SCENE IS A PREVIEW COMPOSITE; THE RUNTIME DRAWS LAYERS TO A 320X180 CANVAS.',
    C.steel1,
  );
  label(
    sheet,
    16,
    2102,
    'ANIMATED LOOP: docs/art-preview/anim-room.gif (12 FRAMES @ 10 FPS)',
    C.amber2,
  );
  return sheet;
}

function spritesheet(): Pixmap {
  // Flat silhouettes on parchment: black-on-near-black proves nothing.
  const width = 720;
  const height = 464;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(sheet, 'SILHOUETTE CHECK', 'FLAT INK SHAPES ON PARCHMENT - IDENTIFIABLE AT 1X', width);
  const warden = buildWarden();
  const bug = buildTollbug();

  const panel = (x: number, y: number, w: number, h: number): void => {
    fillRect(sheet, x, y, w, h, C.paper2);
    fillRect(sheet, x, y, w, 1, C.paper4);
    fillRect(sheet, x, y + h - 1, w, 1, C.paper5);
  };

  // 1x row
  panel(24, 76, 64, 64);
  blit(sheet, silhouette(warden.idle)[2]!, 32, 84);
  panel(92, 76, 64, 64);
  blit(sheet, silhouette(warden.attack)[3]!, 100, 84);
  panel(166, 84, 48, 48);
  blit(sheet, silhouette(bug.idle)[0]!, 174, 92);
  panel(214, 84, 48, 48);
  blit(sheet, silhouette(bug.attack)[3]!, 222, 92);
  label(sheet, 24, 150, 'WARDEN IDLE', C.steel1);
  label(sheet, 104, 150, 'SWING', C.steel1);
  label(sheet, 166, 150, 'TOLLBUG', C.steel1);
  label(sheet, 228, 150, 'LUNGE', C.steel1);

  // large row: 4x companions, 6x enemy
  panel(24, 176, 208, 208);
  blit(sheet, scalePixmap(silhouette(warden.idle)[2]!, 4), 32, 184);
  panel(248, 176, 208, 208);
  blit(sheet, scalePixmap(silhouette(warden.attack)[3]!, 4), 256, 184);
  panel(492, 192, 208, 208);
  blit(sheet, scalePixmap(silhouette(bug.attack)[3]!, 6), 500, 200);
  label(sheet, 24, 394, 'WARDEN IDLE 4X', C.steel1);
  label(sheet, 248, 394, 'WARDEN SWING 4X', C.steel1);
  label(sheet, 492, 410, 'TOLLBUG LUNGE 6X', C.steel1);
  label(sheet, 24, 430, 'NO INTERIOR DETAIL - ONLY THE OUTLINE MAY CARRY IDENTITY', C.amber2);
  return sheet;
}

/**
 * One row per species: the whole set at 1x, three key poses at 4x, and the flat shape on
 * parchment. A family that only reads at 4x is a family that will read as noise in the battle
 * scene, so 1x comes first and gets the widest column.
 */
function rosterSheet(hollow: 1 | 2 | 3): Pixmap {
  const ids = [...ENEMIES, ...ELITES, ...BOSSES].filter((enemy) => enemy.hollow === hollow);
  const width = 1160;
  const rowH = 152;
  const height = 92 + ids.length * rowH + 64;
  const sheet = createPixmap(width, height, C.ink800);
  const names: Record<1 | 2 | 3, string> = {
    1: 'Rootfall Warren',
    2: 'Vault of Cinders',
    3: 'Hollow of Umbra',
  };
  titleBlock(
    sheet,
    `HOLLOW ${hollow} - ${names[hollow].toUpperCase()}`,
    `${ids.length} SPECIES - 32X32 - 1X SET / 4X KEY POSES / SILHOUETTE ON PARCHMENT`,
    width,
  );
  ids.forEach((enemy, row) => {
    const frames = enemyFrames(enemy.id);
    const y = 78 + row * rowH;
    const kind = enemy.id === 'tollbug' ? 'HAND-AUTHORED' : critterRecipe(enemy.id)?.archetype;
    const role = 'elite' in enemy ? 'ELITE' : 'boss' in enemy ? 'BOSS' : 'ORDINARY';
    label(sheet, 16, y, `${enemy.name.toUpperCase()} - ${String(kind)} - ${role}`, C.amber3);
    if (!frames) {
      label(sheet, 16, y + 14, 'NO SPRITE FAMILY', C.rose1);
      return;
    }
    const set: [Pixmap[], string][] = [
      [frames.idle, 'IDLE'],
      [frames.attack, 'ATTACK'],
      [frames.hurt, 'HURT'],
      [frames.faint, 'FAINT'],
    ];
    let x = 16;
    for (const [framesOfSet, name] of set) {
      label(sheet, x, y + 14, name, C.steel1);
      rowOfFrames(sheet, framesOfSet, x, y + 24, 1, 2);
      x += framesOfSet.length * 34 + 10;
    }
    // three poses that decide whether the animation is worth watching
    blit(sheet, scalePixmap(frames.idle[1]!, 4), x + 8, y + 8);
    blit(
      sheet,
      scalePixmap(frames.attack[Math.min(3, frames.attack.length - 1)]!, 4),
      x + 148,
      y + 8,
    );
    blit(sheet, scalePixmap(frames.faint[frames.faint.length - 1]!, 4), x + 288, y + 8);
    label(sheet, x + 8, y, '4X: IDLE / STRIKE / LAST', C.steel1);
    paperPanel(sheet, x + 428, y + 8, 80, 80);
    blit(sheet, scalePixmap(silhouette(frames.idle)[1]!, 2), x + 436, y + 16);
    label(sheet, x + 428, y + 92, 'SHAPE ONLY', C.steel1);
    fillRect(sheet, x + 2, y + 8, 1, 136, C.ink600);
  });
  drawText(
    sheet,
    16,
    height - 40,
    'SAME 32X32 CANVAS, SAME INK OUTLINE, ONE READABLE MARK EACH - NO ROTATION, NO SCALE, NO FILTERS',
    C.steel1,
    1,
  );
  return sheet;
}

/**
 * Statuses, affixes and elements on one sheet. The three families sit in separate bands because the
 * question is different for each: can you tell burn from poison at 16px, and does an affix badge
 * still read next to a status glyph in the same combat panel?
 */
function glyphSheet(): Pixmap {
  const width = 640;
  const cell = 72;
  const bands: [string, readonly (readonly [string, Pixmap])[]][] = [
    ['STATUS', Object.entries(STATUS_ICONS).map(([id, draw]) => [id, draw()] as const)],
    ['AFFIX', Object.entries(AFFIX_ICONS).map(([id, draw]) => [id, draw()] as const)],
    ['ELEMENT', Object.entries(ELEMENT_ICONS).map(([id, draw]) => [id, draw()] as const)],
  ];
  const height = 84 + bands.length * (100 + cell) + 96;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(sheet, 'DELVE GLYPHS', 'STATUS - AFFIX - ELEMENT - 16X16, SHOWN AT 4X', width);
  let y = 84;
  for (const [name, items] of bands) {
    label(sheet, 16, y, `${name} - 4X`, C.amber3);
    items.forEach(([id, pix], index) => {
      const x = 16 + index * cell;
      fillRect(sheet, x, y + 14, 64, 64, C.ink500);
      blit(sheet, scalePixmap(pix, 4), x, y + 14);
      label(sheet, x, y + 82, id.toUpperCase(), C.steel1);
    });
    y += 100;
    label(sheet, 16, y, `${name} - 1X ON PARCHMENT, THE SIZE IT ACTUALLY SHIPS AT`, C.steel2);
    items.forEach(([id, pix], index) => {
      const x = 16 + index * cell;
      paperPanel(sheet, x, y + 14, 48, 48);
      blit(sheet, pix, x + 16, y + 30);
      label(sheet, x, y + 66, id.toUpperCase(), C.steel1);
    });
    y += 100;
  }
  drawText(sheet, 16, height - 20, 'NO HAIRLINES - EVERY STROKE IS TWO PIXELS WIDE', C.steel1, 1);
  return sheet;
}

function torchPreviewFrames(): Pixmap[] {
  return FLAME_FRAMES.map((flame) => {
    const out = createPixmap(96, 112, C.ink500);
    blit(out, scalePixmap(TORCH, 4), 16, 16);
    blit(out, scalePixmap(flame, 4), 16, 0);
    return out;
  });
}

/**
 * One reel per Hollow: every species' idle cycle back to back at 4x. A still roster shows shape;
 * this shows whether the loop actually reads as breathing rather than jitter.
 */
function idleReel(hollow: 1 | 2 | 3): Pixmap[] {
  return [...ENEMIES, ...ELITES, ...BOSSES]
    .filter((enemy) => enemy.hollow === hollow)
    .flatMap((enemy) => (enemyFrames(enemy.id)?.idle ?? []).map((frame) => scalePixmap(frame, 4)));
}

/**
 * Every species reduced to its outline, on parchment, in codex order. This is the sheet the
 * silhouette-distance gate corresponds to: two rows here that look like the same drawing are the
 * bug that gate exists to catch, and colour separation on the roster sheets hides it.
 */
function shapeSheet(): Pixmap {
  const ids = bestiaryIds();
  const perRow = 8;
  const cell = 76;
  const width = 32 + perRow * cell;
  const rows = Math.ceil(ids.length / perRow);
  const height = 92 + rows * 108 + 40;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(
    sheet,
    'BESTIARY SHAPES',
    'OUTLINE ONLY - IF TWO OF THESE MATCH, THE ROSTER IS CLONED',
    width,
  );
  ids.forEach((id, index) => {
    const frames = enemyFrames(id);
    if (!frames) return;
    const x = 32 + (index % perRow) * cell;
    const y = 92 + Math.floor(index / perRow) * 108;
    paperPanel(sheet, x, y, 64, 64);
    blit(sheet, scalePixmap(silhouette([frames.idle[1] ?? frames.idle[0]!])[0]!, 2), x + 1, y + 1);
    label(sheet, x, y + 70, id.toUpperCase(), C.steel1);
  });
  drawText(
    sheet,
    16,
    height - 24,
    'MEASURED PAIRWISE: MINIMUM DIFFERENCE MUST STAY ABOVE 18 PERCENT',
    C.steel1,
    1,
  );
  return sheet;
}

/**
 * The three battle stages, empty, at 2x. Judged as flats: does each Hollow read as a different place
 * before any sprite stands in it, and is the middle of the frame clear of decoration the actors would
 * have to fight.
 */
function stageSheet(): Pixmap {
  const names: Record<1 | 2 | 3, string> = {
    1: 'ROOTFALL WARREN',
    2: 'CINDER VAULT',
    3: 'UMBRAL DEEP',
  };
  const warden = buildWarden().idle[0]!;
  const bug = buildTollbug().idle[0]!;
  const width = 656;
  const height = 40 + 3 * 2 * (360 + 34);
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(sheet, 'BATTLE STAGES', '320X180 AT 2X - EMPTY, THEN LIT WITH ACTORS', width);
  ([1, 2, 3] as const).forEach((hollow, index) => {
    const base = 40 + index * 2 * 394;
    const note =
      hollow === 1
        ? 'CAPS LEAN, DUST SINKS, LANTERN AMBER'
        : hollow === 2
          ? 'CUT STONE, EMBERS RISE, CYAN LIGHT ON WARM SOOT'
          : 'HUNG MASONRY, SPORES DRIFT, EMBER LIGHT';
    label(sheet, 8, base, `HOLLOW ${hollow} - ${names[hollow]} - STAGE`, C.amber3);
    blit(sheet, scalePixmap(composeStage(hollow, 4), 2), 8, base + 14);
    label(sheet, 8, base + 372, note, C.steel1);
    const lit = base + 394;
    label(sheet, 8, lit, `HOLLOW ${hollow} - ACTORS AT 1X, LIGHT PULLED BACK`, C.amber3);
    blit(
      sheet,
      scalePixmap(composeStage(hollow, 4, 0.4, { companion: warden, enemy: bug }, 1), 2),
      8,
      lit + 14,
    );
    label(
      sheet,
      8,
      lit + 372,
      'PARALLAX +0.4 - SILHOUETTES MUST STAY READABLE OVER THE LIGHT',
      C.steel1,
    );
  });
  return sheet;
}

const PERIODS: readonly RealmPeriod[] = ['dawn', 'day', 'dusk', 'night'];
const ALL_BUILT: Record<string, number> = Object.fromEntries(REALM_BUILDINGS.map((id) => [id, 2]));
const ALL_BARE: Record<string, number> = Object.fromEntries(REALM_BUILDINGS.map((id) => [id, 0]));

function sceneCell(
  sheet: Pixmap,
  scene: Pixmap,
  x: number,
  y: number,
  scale: number,
  caption: string,
  note: string,
): void {
  label(sheet, x, y, caption, C.amber3);
  const s = scalePixmap(scene, scale);
  blit(sheet, s, x, y + 14);
  label(sheet, x, y + 14 + s.h + 6, note, C.steel1);
}

/**
 * The Realm diorama. Two things are being judged here: whether the four skies are distinguishable
 * without a single gradient, and whether an unbuilt plot reads as *a plot* rather than as a hole in
 * the ground — the honest state, since a building appears only when the ledger earns it.
 */
function realmSheet(): Pixmap {
  const warden = buildWarden().idle[0]!;
  const width = 1300;
  const bandH = 396;
  const height = 70 + bandH * 4 + 260;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(
    sheet,
    'REALM DIORAMA',
    '320X180 - FOUR HAND-PICKED SKIES - PLOTS ARE LANTERNS UNTIL THE LEDGER BUILDS THEM',
    width,
  );
  PERIODS.forEach((period, i) => {
    const y = 70 + (i % 2) * bandH;
    const x = 8 + Math.floor(i / 2) * 652;
    sceneCell(
      sheet,
      composeRealm(4, 0, period, ALL_BUILT, { companion: warden, companionX: 152 }),
      x,
      y,
      2,
      `${period.toUpperCase()} - ALL FIVE BUILT AT LEVEL 2`,
      'THE ISLAND AND THE BUILDINGS SHARE THE SKY TONES; NO LIGHT SOURCE IS A GRADIENT.',
    );
  });
  PERIODS.forEach((period, i) => {
    const y = 70 + 2 * bandH + (i % 2) * bandH;
    const x = 8 + Math.floor(i / 2) * 652;
    sceneCell(
      sheet,
      composeRealm(4, 0, period, ALL_BARE, { companion: warden, companionX: 152 }),
      x,
      y,
      2,
      `${period.toUpperCase()} - NOTHING BUILT`,
      'A LANTERN POST ON A CLEARED PAD. THIS IS DAY ONE AND IT MUST NOT LOOK BROKEN.',
    );
  });
  // progression, at the size it ships
  const steps: [string, Record<string, number>][] = [
    ['0 BUILT', ALL_BARE],
    ['TREASURY', { treasury: 1 }],
    ['LIB + TREAS + FORGE', { treasury: 1, library: 1, smithy: 1 }],
    ['ALL FIVE', { treasury: 2, library: 2, smithy: 2, observatory: 2, workshop: 2 }],
  ];
  label(
    sheet,
    8,
    70 + 4 * bandH,
    'PROGRESSION - 1X - DUSK - THE STATE THE SCREEN STARTS IN',
    C.amber3,
  );
  steps.forEach(([caption, levels], i) => {
    const x = 8 + i * 324;
    blit(
      sheet,
      composeRealm(6, 0, 'dusk', levels, { companion: warden, companionX: 152 }),
      x,
      70 + 4 * bandH + 14,
    );
    label(sheet, x, 70 + 4 * bandH + 200, caption, C.steel1);
  });
  label(
    sheet,
    8,
    70 + 4 * bandH + 224,
    `HOURS 0-4 -> ${periodForHour(3).toUpperCase()}; 5-7 -> ${periodForHour(6).toUpperCase()}; 8-16 -> ${periodForHour(12).toUpperCase()}; 17-20 -> ${periodForHour(18).toUpperCase()}`,
    C.steel2,
  );
  label(
    sheet,
    8,
    70 + 4 * bandH + 240,
    'PARALLAX IS INTEGER: SKY -2, ISLAND -4, FOREGROUND -8 AT FULL LEAN.',
    C.steel2,
  );
  return sheet;
}

/**
 * The combat strips on the flat they will be blitted over. Each frame gets its own panel so a strip
 * that is empty on frame 3 — which is what a bad fade-out looks like — is visible immediately.
 */
function effectsSheet(): Pixmap {
  const warden = buildWarden().idle[0]!;
  const rows: [string, Effect, number][] = [
    ['SLASH - LIGHT ELEMENT', slash(C.frost1), 5],
    ['SLASH - HEAVY', slash(C.ember2, C.amber1), 5],
    ['IMPACT - HIT', impact(C.amber2), 5],
    ['IMPACT - FAINT', impact(C.violet3, C.rose1), 5],
    ['SHOCKWAVE - BOSS SLAM', shockwave(C.steel1), 5],
    ['ASCEND - HEAL', ascend(C.moss2), 5],
    ['PUFF - LUNGE DUST', puff(C.ink400), 5],
  ];
  const width = 1160;
  const height = 76 + rows.length * 148 + 60;
  const sheet = createPixmap(width, height, C.ink800);
  titleBlock(
    sheet,
    'COMBAT EFFECTS',
    '32X32 STRIPS AT 4X - PLAYED ONCE OVER THE ACTOR, NEVER LOOPS',
    width,
  );
  rows.forEach(([caption, effect, pad], row) => {
    const y = 76 + row * 148;
    label(sheet, 16, y, `${caption} - ${effect.frames.length} FRAMES @ ${effect.fps}FPS`, C.amber3);
    effect.frames.forEach((frame, i) => {
      const x = 16 + i * (128 + pad);
      fillRect(sheet, x, y + 14, 128, 128, C.ink500);
      blit(sheet, scalePixmap(warden, 2), x + 32, y + 32);
      blit(sheet, scalePixmap(frame, 4), x, y + 14);
      label(sheet, x + 2, y + 146, `F${i} ${coverage(effect, i)}PX`, C.steel1);
    });
  });
  label(
    sheet,
    16,
    height - 40,
    'THE ACTOR BEHIND EACH FRAME IS THE WARDEN AT 2X: AN EFFECT THAT HIDES IT IS TOO THICK.',
    C.steel1,
  );
  label(
    sheet,
    16,
    height - 24,
    'DEBRIS IS HASH-SEEDED PARTICLES, NOT A STRIP, SO A REPLAYED RUN THROWS THE SAME PIXELS.',
    C.steel2,
  );
  return sheet;
}

savePixmap(`${OUT}/palette.png`, paletteSheet());
savePixmap(`${OUT}/font.png`, fontSheet());
savePixmap(`${OUT}/companion-contact.png`, companionSheet());
savePixmap(`${OUT}/enemy-contact.png`, enemySheet());
savePixmap(`${OUT}/ui-kit.png`, uiSheet());
savePixmap(`${OUT}/room-contact.png`, roomSheet());
savePixmap(`${OUT}/silhouettes.png`, spritesheet());
savePixmap(`${OUT}/room-1x.png`, composeRoomPreview(2));
savePixmap(`${OUT}/delve-hollow-1.png`, rosterSheet(1));
savePixmap(`${OUT}/delve-hollow-2.png`, rosterSheet(2));
savePixmap(`${OUT}/delve-hollow-3.png`, rosterSheet(3));
savePixmap(`${OUT}/delve-shapes.png`, shapeSheet());
savePixmap(`${OUT}/delve-glyphs.png`, glyphSheet());
savePixmap(`${OUT}/delve-stages.png`, stageSheet());
savePixmap(`${OUT}/realm-diorama.png`, realmSheet());
savePixmap(`${OUT}/delve-effects.png`, effectsSheet());

const wardenGif = buildWarden();
const tollbugGif = buildTollbug();
saveGif(
  `${OUT}/anim-warden-idle.gif`,
  wardenGif.idle.map((frame) => scalePixmap(frame, 4)),
  120,
);
saveGif(
  `${OUT}/anim-warden-attack.gif`,
  wardenGif.attack.map((frame) => scalePixmap(frame, 4)),
  90,
);
saveGif(
  `${OUT}/anim-tollbug-idle.gif`,
  tollbugGif.idle.map((frame) => scalePixmap(frame, 4)),
  140,
);
saveGif(
  `${OUT}/anim-tollbug-attack.gif`,
  tollbugGif.attack.map((frame) => scalePixmap(frame, 4)),
  100,
);
saveGif(`${OUT}/anim-torch.gif`, torchPreviewFrames(), 100);
saveGif(
  `${OUT}/anim-room.gif`,
  Array.from({ length: 12 }, (_, i) => scalePixmap(composeRoomPreview(i), 2)),
  100,
);
saveGif(`${OUT}/anim-hollow-1-idle.gif`, idleReel(1), 140);
saveGif(`${OUT}/anim-hollow-2-idle.gif`, idleReel(2), 140);
saveGif(`${OUT}/anim-hollow-3-idle.gif`, idleReel(3), 140);
const realmWarden = buildWarden().idle[0]!;
saveGif(
  `${OUT}/anim-realm.gif`,
  Array.from({ length: 12 }, (_, i) =>
    scalePixmap(
      composeRealm(
        i,
        0,
        'dusk',
        { treasury: 2, library: 1, smithy: 1 },
        { companion: realmWarden, companionX: 152 },
      ),
      2,
    ),
  ),
  110,
);
saveGif(
  `${OUT}/anim-effect-slash.gif`,
  slash(C.frost1).frames.map((frame) => scalePixmap(frame, 4)),
  45,
);
saveGif(
  `${OUT}/anim-effect-impact.gif`,
  impact(C.amber2).frames.map((frame) => scalePixmap(frame, 4)),
  40,
);

console.log('Wrote contact sheets and animated GIFs to', OUT);
