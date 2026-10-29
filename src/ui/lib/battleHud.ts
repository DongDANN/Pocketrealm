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

/**
 * The same bar drawn at a drained value. The label keeps the engine's number: the draining cells are
 * decoration, and a reader who asks the bar how much HP is left must get the truth, not a frame.
 */
export function barAt(bar: HpBar, shown: number, maxHp: number): HpBar {
  return { ...hpBar(shown, maxHp, bar.cells), label: bar.label };
}

/** A bar mid-drain: what it draws, and the number the engine says it must land on. */
export interface Drain {
  shown: number;
  target: number;
}

/** One tick of a drain: step toward the engine's number, never past it. */
export function stepDrain(shown: number, target: number, step = 1): number {
  if (shown === target) return shown;
  return shown < target ? Math.min(target, shown + step) : Math.max(target, shown - step);
}

/**
 * A room's bars stepped in lockstep, keyed by owner (`ally`, `foe:<index>`). A bar seen for the first
 * time starts at its true value — a new foe has nowhere to drain from — and a foe that left is
 * dropped. When every bar has settled the same map comes back, so a caller can stop its timer.
 */
export function stepDrains(
  drains: ReadonlyMap<string, Drain>,
  values: ReadonlyMap<string, number>,
  step = 1,
): ReadonlyMap<string, Drain> {
  let settled = drains.size === values.size;
  const next = new Map<string, Drain>();
  for (const [key, target] of values) {
    const current = drains.get(key);
    const shown = current ? stepDrain(current.shown, target, step) : target;
    if (!current || shown !== current.shown || target !== current.target) settled = false;
    next.set(key, { shown, target });
  }
  return settled ? drains : next;
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
 *
 * With a `round`, only that round's beats speak: the recap window holds the run's last blows, and a
 * new round must not replay an old room's fight over the menu. The omitted-blows line belongs to the
 * recap as a whole, so it is printed only when the queue is the whole window — the transcript still
 * carries it either way.
 */
export function dialogQueue(recap: Recap, round?: number): DialogLine[] {
  const rows = round === undefined ? recap.rows : recap.rows.filter((row) => row.round === round);
  const lines: DialogLine[] = [];
  if (round === undefined && recap.omitted > 0) {
    lines.push({ text: `${recap.omitted} earlier blows not shown.`, tone: 'system' });
  }
  for (const row of rows) lines.push({ text: dialogText(row), tone: row.side });
  return lines;
}

/** One line of the dialog, as the player sees it at a moment in playback. */
export interface DialogPlayback {
  /** Which line is speaking; -1 when the queue is empty. */
  index: number;
  /** The characters revealed so far — whole glyphs only. */
  text: string;
  typed: boolean;
  /** Lines still waiting behind this one. */
  more: boolean;
  /** Every line has been spoken, holds included. */
  done: boolean;
}

/** How long one line takes to type and then hold, in ms. */
function lineSpan(
  text: string,
  charsPerSecond: number,
  holdMs: number,
): [typeMs: number, spanMs: number] {
  const typeMs = Math.ceil((text.length * 1000) / charsPerSecond);
  return [typeMs, typeMs + holdMs];
}

/**
 * The queue's state at `elapsedMs`: which line is on screen, how much of it, and whether the
 * narration has finished. A hold after each line is what gives a GBA battle its beat; the last line
 * holds too, so the last number stays readable before the window moves on.
 */
export function dialogPlayback(
  lines: readonly DialogLine[],
  elapsedMs: number,
  charsPerSecond = 40,
  holdMs = 600,
): DialogPlayback {
  let cursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const [, spanMs] = lineSpan(line.text, charsPerSecond, holdMs);
    const typed = typedShown(line.text, elapsedMs - cursor, charsPerSecond);
    if (typed.done && elapsedMs - cursor >= spanMs) {
      cursor += spanMs;
      continue;
    }
    return {
      index,
      text: typed.shown,
      typed: typed.done,
      more: index < lines.length - 1,
      done: false,
    };
  }
  return dialogSettled(lines);
}

/**
 * The queue as it reads once nothing is still typing: the last line, whole. Reduced motion shows
 * this immediately — the beat is still told, only the telling holds still.
 */
export function dialogSettled(lines: readonly DialogLine[]): DialogPlayback {
  if (lines.length === 0) {
    return { index: -1, text: '', typed: true, more: false, done: true };
  }
  return {
    index: lines.length - 1,
    text: lines[lines.length - 1]!.text,
    typed: true,
    more: false,
    done: true,
  };
}

/**
 * Where one press of the advance button lands the playback: a half-typed line completes, a typed
 * line moves to the next one, and the end stays at the end. Pressing twice never skips a beat.
 */
export function dialogSkip(
  lines: readonly DialogLine[],
  elapsedMs: number,
  charsPerSecond = 40,
  holdMs = 600,
): number {
  let cursor = 0;
  for (const line of lines) {
    const [typeMs, spanMs] = lineSpan(line.text, charsPerSecond, holdMs);
    const typed = typedShown(line.text, elapsedMs - cursor, charsPerSecond);
    if (!typed.done) return cursor + typeMs;
    if (elapsedMs - cursor < spanMs) return cursor + spanMs;
    cursor += spanMs;
  }
  return cursor;
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
