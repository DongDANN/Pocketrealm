/**
 * Companion cosmetic overlays, drawn at the same 32x32 stage as the species sprites. These are
 * purely visual: a hat, a scarf, or a thin aura ring. A missing or unknown item draws nothing, so
 * an old save never breaks the portrait.
 */

import { C } from './palette';
import { createPixmap, fillRect, hline, setPx, type Pixmap } from './px';

const SIZE = 32;

function mossCap(p: Pixmap): void {
  fillRect(p, 9, 7, 14, 3, C.moss2);
  fillRect(p, 10, 6, 12, 1, C.moss1);
  fillRect(p, 8, 10, 2, 2, C.moss3);
  hline(p, 10, 21, 10, C.moss4);
  setPx(p, 12, 6, C.moss0);
  setPx(p, 17, 5, C.moss1);
  setPx(p, 20, 7, C.moss3);
  setPx(p, 11, 9, C.moss0);
}

function emberHood(p: Pixmap): void {
  fillRect(p, 8, 6, 16, 2, C.ember3);
  fillRect(p, 7, 8, 18, 4, C.ember2);
  hline(p, 9, 22, 12, C.ember4);
  setPx(p, 6, 10, C.ember2);
  setPx(p, 25, 10, C.ember2);
  setPx(p, 13, 5, C.amber2);
  setPx(p, 14, 5, C.amber3);
  setPx(p, 16, 9, C.amber1);
}

function copperCirclet(p: Pixmap): void {
  hline(p, 9, 22, 9, C.gold2);
  hline(p, 10, 21, 8, C.gold1);
  setPx(p, 15, 7, C.gold1);
  setPx(p, 16, 7, C.gold2);
  setPx(p, 15, 8, C.gold2);
  setPx(p, 16, 8, C.gold2);
  setPx(p, 10, 9, C.gold2);
  setPx(p, 21, 9, C.gold2);
}

function bellvineCrown(p: Pixmap): void {
  hline(p, 9, 22, 8, C.moss3);
  for (const x of [10, 14, 18, 21]) {
    setPx(p, x, 7, C.amber2);
    setPx(p, x, 6, C.gold1);
    setPx(p, x, 5, C.gold2);
  }
  setPx(p, 12, 8, C.moss1);
  setPx(p, 16, 8, C.moss0);
  setPx(p, 20, 8, C.moss1);
}

function stargazerPin(p: Pixmap): void {
  hline(p, 11, 20, 8, C.steel2);
  setPx(p, 16, 6, C.paper0);
  setPx(p, 15, 7, C.paper0);
  setPx(p, 17, 7, C.paper0);
  setPx(p, 16, 8, C.paper0);
  setPx(p, 16, 7, C.cyan1);
  setPx(p, 12, 8, C.gold1);
  setPx(p, 19, 8, C.gold1);
}

function rainHat(p: Pixmap): void {
  fillRect(p, 7, 8, 18, 2, C.teal2);
  fillRect(p, 10, 5, 12, 3, C.teal3);
  hline(p, 11, 20, 4, C.teal2);
  hline(p, 6, 25, 10, C.teal4);
  setPx(p, 13, 5, C.teal1);
  setPx(p, 16, 4, C.teal2);
  setPx(p, 12, 9, C.teal1);
  setPx(p, 20, 9, C.teal1);
}

function scarfAmber(p: Pixmap): void {
  hline(p, 9, 22, 23, C.amber3);
  hline(p, 10, 21, 24, C.amber2);
  setPx(p, 22, 25, C.amber3);
  setPx(p, 23, 26, C.amber2);
  setPx(p, 12, 24, C.amber1);
  setPx(p, 18, 24, C.amber4);
}

function scarfRootwrap(p: Pixmap): void {
  hline(p, 9, 22, 23, C.moss4);
  hline(p, 10, 21, 24, C.moss3);
  setPx(p, 21, 25, C.moss4);
  setPx(p, 22, 26, C.moss5);
  setPx(p, 13, 24, C.moss2);
  setPx(p, 17, 24, C.moss1);
}

function scarfTide(p: Pixmap): void {
  hline(p, 9, 22, 23, C.teal2);
  hline(p, 10, 21, 24, C.teal3);
  setPx(p, 22, 25, C.teal2);
  setPx(p, 23, 26, C.teal1);
  setPx(p, 12, 24, C.cyan3);
  setPx(p, 19, 24, C.cyan2);
}

function scarfEmberStole(p: Pixmap): void {
  hline(p, 8, 23, 22, C.ember2);
  hline(p, 9, 22, 23, C.ember3);
  hline(p, 10, 21, 24, C.ember4);
  setPx(p, 23, 25, C.ember2);
  setPx(p, 24, 26, C.ember1);
  setPx(p, 11, 23, C.amber2);
}

function scarfCloud(p: Pixmap): void {
  hline(p, 9, 22, 23, C.paper3);
  hline(p, 10, 21, 24, C.paper2);
  setPx(p, 21, 25, C.paper3);
  setPx(p, 22, 26, C.paper2);
  setPx(p, 14, 24, C.paper1);
  setPx(p, 17, 24, C.paper1);
}

function scarfLedger(p: Pixmap): void {
  hline(p, 9, 22, 23, C.ink400);
  hline(p, 10, 21, 24, C.ink300);
  setPx(p, 13, 23, C.amber2);
  setPx(p, 17, 23, C.amber2);
  setPx(p, 22, 25, C.ink400);
  setPx(p, 23, 26, C.ink300);
}

function aura(p: Pixmap, color: number, dim: number): void {
  for (let i = 0; i < SIZE; i += 2) {
    setPx(p, i, 0, dim);
    setPx(p, i, 31, dim);
    setPx(p, 0, i, dim);
    setPx(p, 31, i, dim);
  }
  for (let i = 2; i < SIZE - 2; i += 4) {
    setPx(p, i, 1, color);
    setPx(p, i, 30, color);
    setPx(p, 1, i, color);
    setPx(p, 30, i, color);
  }
  setPx(p, 0, 0, color);
  setPx(p, 31, 0, color);
  setPx(p, 0, 31, color);
  setPx(p, 31, 31, color);
}

/**
 * A 32x32 overlay for a cosmetic id, or null when the id is not a companion item. The caller stacks
 * this over the species portrait with both canvases at the same integer scale.
 */
export function cosmeticOverlay(id: string | undefined): Pixmap | null {
  if (!id) return null;
  const p = createPixmap(SIZE, SIZE);
  switch (id) {
    case 'hat-moss-cap':
      mossCap(p);
      break;
    case 'hat-ember-hood':
      emberHood(p);
      break;
    case 'hat-copper-circlet':
      copperCirclet(p);
      break;
    case 'hat-bellvine-crown':
      bellvineCrown(p);
      break;
    case 'hat-stargazer-pin':
      stargazerPin(p);
      break;
    case 'hat-rain-hat':
      rainHat(p);
      break;
    case 'scarf-amber':
      scarfAmber(p);
      break;
    case 'scarf-rootwrap':
      scarfRootwrap(p);
      break;
    case 'scarf-tide-ribbon':
      scarfTide(p);
      break;
    case 'scarf-ember-stole':
      scarfEmberStole(p);
      break;
    case 'scarf-cloud-collar':
      scarfCloud(p);
      break;
    case 'scarf-ledger-sash':
      scarfLedger(p);
      break;
    case 'color-lichen':
      aura(p, C.moss2, C.moss4);
      break;
    case 'color-lamp':
      aura(p, C.amber2, C.amber4);
      break;
    case 'color-deep-teal':
      aura(p, C.teal2, C.teal4);
      break;
    case 'color-ash-violet':
      aura(p, C.violet2, C.violet4);
      break;
    case 'color-paper-white':
      aura(p, C.paper1, C.paper3);
      break;
    default:
      return null;
  }
  return p;
}

/** The small swatch used by the shop row, at 12x12 rather than a full portrait overlay. */
export function cosmeticSwatch(id: string): Pixmap {
  const p = createPixmap(12, 12, C.ink700);
  const overlay = cosmeticOverlay(id);
  if (!overlay) {
    setPx(p, 5, 5, C.amber2);
    setPx(p, 6, 5, C.amber2);
    setPx(p, 5, 6, C.amber2);
    setPx(p, 6, 6, C.amber2);
    return p;
  }
  const sourceX = 10;
  const sourceY = id.startsWith('scarf-') ? 20 : id.startsWith('color-') ? 0 : 2;
  for (let y = 0; y < 12; y++) {
    for (let x = 0; x < 12; x++) {
      const color = overlay.data[(y + sourceY) * SIZE + x + sourceX];
      if (color) setPx(p, x, y, color);
    }
  }
  return p;
}
