import { C } from './palette';
import {
  createPixmap,
  fillRect,
  ditherCircle,
  hline,
  line,
  setPx,
  fillEllipse,
  type Pixmap,
} from './px';

/**
 * The Pocketrealm mark: a lantern over a small floating island.
 * Drawn at 32x32, scaled with nearest-neighbour for icons.
 */
export function lanternMark(size = 32, maskable = false): Pixmap {
  if (size !== 32) throw new Error('Brand mark authored at 32x32');
  const p = createPixmap(32, 32, C.ink800);

  if (maskable) {
    fillRect(p, 0, 0, 32, 32, C.ink800);
  } else {
    // stepped rounded-square card
    fillRect(p, 2, 0, 28, 32, C.ink800);
    fillRect(p, 0, 2, 32, 28, C.ink800);
    fillRect(p, 1, 1, 30, 30, C.ink800);
    setPx(p, 0, 0, 0);
    setPx(p, 31, 0, 0);
    setPx(p, 0, 31, 0);
    setPx(p, 31, 31, 0);
    // border
    hline(p, 2, 29, 0, C.ink500);
    hline(p, 2, 29, 31, C.ink500);
    hline(p, 0, 0, 0, 0);
    line(p, 0, 2, 0, 29, C.ink500);
    line(p, 31, 2, 31, 29, C.ink500);
    setPx(p, 1, 1, C.ink500);
    setPx(p, 30, 1, C.ink500);
    setPx(p, 1, 30, C.ink500);
    setPx(p, 30, 30, C.ink500);
  }

  // ambient lantern glow (dithered, never a blur)
  ditherCircle(p, 16, 15, 13, C.amber5, 4, 0.18);
  ditherCircle(p, 16, 15, 10, C.amber4, 4, 0.32);
  ditherCircle(p, 16, 15, 7, C.amber3, 2, 0.45);

  // floating island silhouette
  fillEllipse(p, 16, 25, 8, 2, C.ink600);
  fillRect(p, 9, 24, 14, 2, C.moss5);
  hline(p, 10, 21, 23, C.moss4);
  setPx(p, 11, 24, C.moss3);
  setPx(p, 16, 24, C.moss3);
  setPx(p, 20, 24, C.moss3);
  // dangling roots
  setPx(p, 12, 27, C.moss5);
  setPx(p, 13, 28, C.moss5);
  setPx(p, 18, 27, C.moss5);
  setPx(p, 19, 28, C.moss5);

  // lantern handle
  line(p, 12, 11, 13, 8, C.steel1);
  line(p, 13, 8, 16, 7, C.steel0);
  line(p, 16, 7, 19, 8, C.steel1);
  line(p, 19, 8, 20, 11, C.steel1);

  // lantern cap and base
  fillRect(p, 11, 11, 10, 2, C.ink400);
  hline(p, 12, 19, 11, C.steel1);
  fillRect(p, 12, 13, 8, 2, C.amber5);
  fillRect(p, 11, 15, 10, 7, C.amber4);
  fillRect(p, 12, 15, 8, 7, C.amber3);
  fillRect(p, 12, 16, 8, 5, C.amber2);
  fillRect(p, 14, 16, 4, 5, C.amber1);
  fillRect(p, 15, 17, 2, 3, C.amber0);
  // glass shine
  setPx(p, 13, 16, C.paper0);
  setPx(p, 13, 17, C.amber0);
  setPx(p, 18, 16, C.amber4);
  // frame ribs
  line(p, 11, 14, 11, 21, C.ink400);
  line(p, 20, 14, 20, 21, C.ink400);
  fillRect(p, 10, 22, 12, 2, C.ink400);
  hline(p, 11, 20, 22, C.steel2);
  hline(p, 12, 19, 23, C.ink300);
  // flame
  setPx(p, 16, 16, C.amber0);
  setPx(p, 16, 17, C.amber0);
  setPx(p, 15, 18, C.amber1);
  setPx(p, 16, 18, C.paper0);
  setPx(p, 17, 18, C.amber1);
  setPx(p, 16, 19, C.amber2);

  return p;
}
