/**
 * The single master palette. Every shipped pixel uses one of these colors.
 * Index 0 is transparent and is not a color.
 *
 * Ramps are hue-shifted: shadows drift toward violet/ink, highlights toward warm light.
 */

export interface Ramp {
  readonly name: string;
  readonly colors: readonly string[];
}

export const RAMPS = {
  ink: ['#08070d', '#0e0d17', '#151322', '#1d1b2e', '#27243c', '#353150', '#474169'],
  parchment: ['#fff6dd', '#f3dfb5', '#e3c58d', '#cba267', '#a97c4d', '#7f5838'],
  amber: ['#fff6c9', '#ffe79a', '#ffd166', '#ffb13b', '#e88322', '#b85d14'],
  ember: ['#ff9d66', '#ed6a3b', '#bd4329', '#7f2820'],
  moss: ['#d9f0bf', '#aad68c', '#7db56a', '#57935a', '#396f4d', '#224a39'],
  teal: ['#7fe6cf', '#45bda8', '#2a8b7f', '#1a5f5a'],
  cyan: ['#d6fbfd', '#99edf4', '#5ad6e6', '#2fa8c6', '#1e7b99', '#145670'],
  frost: ['#e8f0ff', '#bcd0ff', '#8fa9ef', '#667fd1', '#465fab', '#2d3f7b'],
  violet: ['#eedcff', '#d3b0f2', '#b283e0', '#8d5ac4', '#683a9c', '#44256d'],
  rose: ['#ffd6e6', '#f2a3c2', '#d4719d', '#a94a7c', '#712c54'],
  gold: ['#ffe9a3', '#e9b845', '#b78120'],
  steel: ['#e6ecf4', '#aab7c8', '#6b7a90'],
  skin: ['#ffd9bb', '#c98b62'],
} as const;

export type RampName = keyof typeof RAMPS;

const rampColors = Object.values(RAMPS).flatMap((r) => r);
if (new Set(rampColors).size !== rampColors.length) {
  const dupes = rampColors.filter((c, i) => rampColors.indexOf(c) !== i);
  throw new Error(`Master palette contains duplicate colors: ${dupes.join(',')}`);
}
if (rampColors.length !== 64) {
  throw new Error(`Master palette must contain 64 colors, found ${rampColors.length}`);
}

/** Palette indices are 1-based; 0 means transparent. */
export const MASTER_PALETTE: readonly string[] = ['#000000', ...rampColors];
const indexByHex = new Map<string, number>(MASTER_PALETTE.map((hex, i) => [hex.toLowerCase(), i]));

if (MASTER_PALETTE.length - 1 > 255) throw new Error('Palette exceeds 8-bit sprite indices');

export const TRANSPARENT = 0;

export function colorIndex(hex: string): number {
  const index = indexByHex.get(hex.toLowerCase());
  if (index === undefined) throw new Error(`Color ${hex} is not in the master palette`);
  return index;
}

export function colorHex(index: number): string {
  const hex = MASTER_PALETTE[index];
  if (hex === undefined) throw new Error(`Palette index ${index} out of range`);
  return hex;
}

export function isMasterColor(hex: string): boolean {
  return indexByHex.has(hex.toLowerCase());
}

/** Named constants for the most common drawing colors. */
export const C = {
  clear: 0,
  ink900: colorIndex(RAMPS.ink[0]),
  ink800: colorIndex(RAMPS.ink[1]),
  ink700: colorIndex(RAMPS.ink[2]),
  ink600: colorIndex(RAMPS.ink[3]),
  ink500: colorIndex(RAMPS.ink[4]),
  ink400: colorIndex(RAMPS.ink[5]),
  ink300: colorIndex(RAMPS.ink[6]),
  paper0: colorIndex(RAMPS.parchment[0]),
  paper1: colorIndex(RAMPS.parchment[1]),
  paper2: colorIndex(RAMPS.parchment[2]),
  paper3: colorIndex(RAMPS.parchment[3]),
  paper4: colorIndex(RAMPS.parchment[4]),
  paper5: colorIndex(RAMPS.parchment[5]),
  amber0: colorIndex(RAMPS.amber[0]),
  amber1: colorIndex(RAMPS.amber[1]),
  amber2: colorIndex(RAMPS.amber[2]),
  amber3: colorIndex(RAMPS.amber[3]),
  amber4: colorIndex(RAMPS.amber[4]),
  amber5: colorIndex(RAMPS.amber[5]),
  ember1: colorIndex(RAMPS.ember[0]),
  ember2: colorIndex(RAMPS.ember[1]),
  ember3: colorIndex(RAMPS.ember[2]),
  ember4: colorIndex(RAMPS.ember[3]),
  moss0: colorIndex(RAMPS.moss[0]),
  moss1: colorIndex(RAMPS.moss[1]),
  moss2: colorIndex(RAMPS.moss[2]),
  moss3: colorIndex(RAMPS.moss[3]),
  moss4: colorIndex(RAMPS.moss[4]),
  moss5: colorIndex(RAMPS.moss[5]),
  teal1: colorIndex(RAMPS.teal[0]),
  teal2: colorIndex(RAMPS.teal[1]),
  teal3: colorIndex(RAMPS.teal[2]),
  teal4: colorIndex(RAMPS.teal[3]),
  cyan0: colorIndex(RAMPS.cyan[0]),
  cyan1: colorIndex(RAMPS.cyan[1]),
  cyan2: colorIndex(RAMPS.cyan[2]),
  cyan3: colorIndex(RAMPS.cyan[3]),
  cyan4: colorIndex(RAMPS.cyan[4]),
  cyan5: colorIndex(RAMPS.cyan[5]),
  frost0: colorIndex(RAMPS.frost[0]),
  frost1: colorIndex(RAMPS.frost[1]),
  frost2: colorIndex(RAMPS.frost[2]),
  frost3: colorIndex(RAMPS.frost[3]),
  frost4: colorIndex(RAMPS.frost[4]),
  frost5: colorIndex(RAMPS.frost[5]),
  violet0: colorIndex(RAMPS.violet[0]),
  violet1: colorIndex(RAMPS.violet[1]),
  violet2: colorIndex(RAMPS.violet[2]),
  violet3: colorIndex(RAMPS.violet[3]),
  violet4: colorIndex(RAMPS.violet[4]),
  violet5: colorIndex(RAMPS.violet[5]),
  rose0: colorIndex(RAMPS.rose[0]),
  rose1: colorIndex(RAMPS.rose[1]),
  rose2: colorIndex(RAMPS.rose[2]),
  rose3: colorIndex(RAMPS.rose[3]),
  rose4: colorIndex(RAMPS.rose[4]),
  gold0: colorIndex(RAMPS.gold[0]),
  gold1: colorIndex(RAMPS.gold[1]),
  gold2: colorIndex(RAMPS.gold[2]),
  steel0: colorIndex(RAMPS.steel[0]),
  steel1: colorIndex(RAMPS.steel[1]),
  steel2: colorIndex(RAMPS.steel[2]),
  skin0: colorIndex(RAMPS.skin[0]),
  skin1: colorIndex(RAMPS.skin[1]),
} as const;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export const RARITY_RAMPS: Record<Rarity, readonly string[]> = {
  common: RAMPS.steel,
  uncommon: [RAMPS.moss[1], RAMPS.moss[2], RAMPS.moss[3], RAMPS.moss[4]],
  rare: [RAMPS.frost[1], RAMPS.frost[2], RAMPS.frost[3], RAMPS.frost[4]],
  epic: [RAMPS.violet[1], RAMPS.violet[2], RAMPS.violet[3], RAMPS.violet[4]],
  legendary: RAMPS.gold,
  mythic: [RAMPS.rose[0], RAMPS.rose[1], RAMPS.rose[2], RAMPS.rose[3]],
};

export const ELEMENTS = ['ember', 'frost', 'gale', 'umbra'] as const;
export type Element = (typeof ELEMENTS)[number];

export const ELEMENT_RAMPS: Record<Element, readonly string[]> = {
  ember: [RAMPS.amber[1], RAMPS.amber[3], RAMPS.ember[1], RAMPS.ember[3]],
  frost: RAMPS.frost,
  gale: [RAMPS.teal[1], RAMPS.teal[2], RAMPS.teal[3], RAMPS.moss[3]],
  umbra: [RAMPS.violet[1], RAMPS.violet[3], RAMPS.violet[5], RAMPS.rose[3]],
};

export interface HollowPalette {
  readonly bg: readonly string[];
  readonly accent: readonly string[];
  readonly light: string;
}

export const HOLLOW_PALETTES: Record<'hollow1' | 'hollow2' | 'hollow3', HollowPalette> = {
  hollow1: {
    bg: ['#0e0d17', '#151322', '#1d1b2e', '#224a39'],
    accent: [RAMPS.moss[2], RAMPS.teal[2], RAMPS.amber[3]],
    light: RAMPS.amber[2],
  },
  hollow2: {
    bg: ['#0e0d17', '#151322', '#2d3f7b', '#465fab'],
    accent: [RAMPS.frost[2], RAMPS.cyan[2], RAMPS.violet[2]],
    light: RAMPS.cyan[1],
  },
  hollow3: {
    bg: ['#08070d', '#151322', '#44256d', '#712c54'],
    accent: [RAMPS.ember[2], RAMPS.rose[2], RAMPS.gold[1]],
    light: RAMPS.ember[0],
  },
};

export const UI = {
  ledgerBg: RAMPS.ink[1],
  ledgerPanel: RAMPS.ink[2],
  ledgerPanelAlt: RAMPS.ink[3],
  ledgerBorder: RAMPS.parchment[4],
  ledgerText: RAMPS.parchment[0],
  ledgerTextDim: RAMPS.parchment[2],
  ledgerAccent: RAMPS.amber[2],
  delvePanel: RAMPS.ink[3],
  delveBorder: RAMPS.frost[3],
  delveText: RAMPS.frost[0],
  good: RAMPS.moss[2],
  warn: RAMPS.amber[2],
  bad: RAMPS.rose[2],
  info: RAMPS.cyan[2],
  focus: RAMPS.gold[0],
} as const;

export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string): number => {
    const v = hex.replace('#', '');
    const channel = (i: number): number => {
      const c = parseInt(v.slice(i * 2, i * 2 + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const l1 = lum(a);
  const l2 = lum(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
