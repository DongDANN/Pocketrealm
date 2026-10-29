/**
 * The battle screen's pure models (Gate 7g).
 *
 * A Pokémon-style battle screen is mostly arithmetic on display — a bar is a fraction of a bar, a
 * plate is two numbers and a promise — and none of that belongs in JSX. Keeping it here means the
 * same rules are testable in the node environment the repo uses, and a plate cannot drift from the
 * menu it was printed beside.
 *
 * The bars are deliberately quantised to whole cells: a half-filled pixel is not a pixel, and a bar
 * that claims 60% by drawing 6.4 cells would be a small lie of the kind this project does not print.
 */

import type { TurnIntentView, TurnTargetView } from '../../core/delve/turn';
import type { Recap, RecapRow } from './delveReadout';

export type BarZone = 'ok' | 'warn' | 'danger';

export interface HpBar {
  /** Whole percent, so the printed number and the drawn bar agree. */
  pct: number;
  cells: number;
  /** Whole cells filled — floor, never round, so the bar never overstates HP. */
  filled: number;
  zone: BarZone;
  label: string;
}

/** The classic two thresholds: green above half, amber to a fifth, red below. */
export function hpZone(pct: number): BarZone {
  if (pct < 20) return 'danger';
  if (pct < 50) return 'warn';
  return 'ok';
}

export function hpBar(hp: number, maxHp: number, cells = 10): HpBar {
  const held = Math.max(0, hp);
  const pct = maxHp > 0 ? Math.round((held * 100) / maxHp) : 0;
  const filled = maxHp > 0 ? Math.max(0, Math.min(cells, Math.floor((held * cells) / maxHp))) : 0;
  return { pct, cells, filled, zone: hpZone(pct), label: `${hp}/${maxHp} HP` };
}

export interface EnemyPlate {
  name: string;
  /** 'BOSS' or empty; the plate grows a tag rather than renaming the foe. */
  tag: string;
  boss: boolean;
  bar: HpBar;
  defLine: string;
  intent: string;
  sum: string;
  traits: string[];
}

/** One enemy as the top-right plate prints it. Every string is already in the engine's words. */
export function enemyPlate(
  target: TurnTargetView,
  intent: TurnIntentView,
  boss: boolean,
): EnemyPlate {
  const parts = [`DEF ${target.def}`, `Weak to ${target.weakness}`];
  if (target.marked) parts.push('Marked');
  return {
    name: target.name,
    tag: boss ? 'BOSS' : '',
    boss,
    bar: hpBar(target.hp, target.maxHp),
    defLine: parts.join(' · '),
    intent: intent.span.length > 0 ? `${intent.label} for ${intent.span}` : intent.label,
    sum: intent.sum,
    traits: [...intent.traits],
  };
}

export interface AllyPlate {
  name: string;
  levelLabel: string;
  bar: HpBar;
  chips: string[];
}

/** The companion as the bottom-left plate prints it: name, level, HP, and the round's resources. */
export function allyPlate(input: {
  name: string;
  level: number;
  hp: number;
  maxHp: number;
  shield: number;
  energy: number;
}): AllyPlate {
  const chips: string[] = [];
  if (input.shield > 0) chips.push(`Shield ${input.shield}`);
  chips.push(`${input.energy} energy`);
  return {
    name: input.name,
    levelLabel: `Lv ${input.level}`,
    bar: hpBar(input.hp, input.maxHp),
    chips,
  };
}

export type DialogTone = 'player' | 'enemy' | 'system';

export interface DialogLine {
  text: string;
  tone: DialogTone;
}

/**
 * The beats a room just produced, as a Pokémon dialog queue. The line is the recap row's own words —
 * actor, target, and the same sum the log carries — so the dialog is a mouthpiece, not a rewrite.
 */
export function dialogQueue(recap: Recap): DialogLine[] {
  const lines: DialogLine[] = [];
  if (recap.omitted > 0) {
    lines.push({ text: `${recap.omitted} earlier blows not shown.`, tone: 'system' });
  }
  for (const row of recap.rows) lines.push({ text: dialogText(row), tone: row.side });
  return lines;
}

function dialogText(row: RecapRow): string {
  return `${row.crit ? 'CRIT ' : ''}${row.actor} → ${row.target} · ${row.sum}`;
}

/**
 * How much of a line the typewriter has revealed. Whole characters only — a text canvas cannot draw
 * half a glyph — and an empty line is always done, so an empty queue never waits for a timer.
 */
export function typedShown(
  text: string,
  elapsedMs: number,
  charsPerSecond = 40,
): { shown: string; done: boolean } {
  if (text.length === 0) return { shown: '', done: true };
  const count = Math.floor((Math.max(0, elapsedMs) * charsPerSecond) / 1000);
  const shown = text.slice(0, Math.min(text.length, count));
  return { shown, done: shown.length === text.length };
}
