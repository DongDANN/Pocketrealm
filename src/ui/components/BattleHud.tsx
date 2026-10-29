import { useEffect, useRef, useState, type ReactNode } from 'react';
import { C } from '../../art/palette';
import type { TurnMenu, TurnOrder } from '../../core/delve';
import { useReducedMotionPref } from '../app/hooks';
import type { Recap } from '../lib/delveReadout';
import {
  backFocus,
  initialFocus,
  openCommand,
  viewRows,
  viewTitle,
  type BattleCommand,
  type BattleFocus,
  type MenuRow,
} from '../lib/battleMenu';
import {
  allyPlate,
  barAt,
  dialogPlayback,
  dialogQueue,
  dialogSettled,
  dialogSkip,
  enemyPlate,
  stepDrains,
  type DialogPlayback,
  type Drain,
  type HpBar,
} from '../lib/battleHud';
import { PixelText } from './PixelText';

/**
 * The battle screen (Gate 7g): a stage with plates, a dialog window and a command window, in the
 * order a GBA battle trained players to read them. Every string is placed by the models in
 * `battleHud.ts` / `battleMenu.ts`; this component only chooses where a line sits.
 *
 * The transcript is the run's own recap, folded into a disclosure rather than a second copy of the
 * dialog: a player who wants the whole exchange can open it, and the reconciliation test still reads
 * the same `.delve-recap` rows it always did.
 */

interface Props {
  menu: TurnMenu;
  busy: boolean;
  /** The encounter is a boss, so the first plate grows the tag. */
  boss: boolean;
  companion: { name: string; level: number };
  recap: Recap;
  stage: ReactNode;
  onOrder(order: TurnOrder): void;
}

const TONE_COLOR = { player: C.moss1, enemy: C.rose1, system: C.paper3 } as const;

/** One glyph every 40 ms — a GBA talk speed, not a wall of text. */
const DIALOG_TICK_MS = 40;
/** One HP cell per tick: a ten-cell bar falls in about two-thirds of a second. */
const DRAIN_TICK_MS = 60;
/** How long a plate keeps its hit flash after the round landed it. */
const HIT_FX_MS = 480;

export function BattleHud({ menu, busy, boss, companion, recap, stage, onOrder }: Props) {
  const reducedMotion = useReducedMotionPref();
  const [focus, setFocus] = useState<BattleFocus>(initialFocus);
  // A new round is a new menu: the window the last order left open is no longer the question.
  useEffect(() => {
    setFocus(initialFocus());
  }, [menu.round]);

  const rows = viewRows(focus, menu);
  const title = viewTitle(focus, menu);
  const ally = allyPlate({
    name: companion.name,
    level: companion.level,
    hp: menu.hp,
    maxHp: menu.maxHp,
    shield: menu.shield,
    energy: menu.energy,
  });

  // ── The dialog: only this round's beats, typed out and held ──────────────
  const lines = dialogQueue(recap, menu.round - 1);
  // The clock belongs to one queue. A render caused by anything else — a busy latch, a drain tick —
  // cannot restart the line, and a new round starts from the first glyph.
  const linesKey = `${menu.round}|${lines.map((line) => line.text).join('|')}`;
  const [clock, setClock] = useState({ key: linesKey, ms: 0 });
  const elapsed = clock.key === linesKey ? clock.ms : 0;
  const playback: DialogPlayback = reducedMotion
    ? dialogSettled(lines)
    : dialogPlayback(lines, elapsed);
  const speaking = lines[playback.index] ?? null;

  useEffect(() => {
    if (reducedMotion || playback.done) return;
    const id = window.setInterval(() => {
      setClock((current) => ({
        key: linesKey,
        ms: (current.key === linesKey ? current.ms : 0) + DIALOG_TICK_MS,
      }));
    }, DIALOG_TICK_MS);
    return () => window.clearInterval(id);
  }, [linesKey, reducedMotion, playback.done]);

  const advance = () => setClock({ key: linesKey, ms: dialogSkip(lines, elapsed) });

  // ── The bars: stepped drains, read from the engine's numbers ─────────────
  // A ref rather than a dependency: `turnMenu` builds a fresh target list on every render, and a
  // timer that restarted on every render would never tick.
  const latest = useRef({ hp: menu.hp, targets: menu.targets });
  useEffect(() => {
    latest.current = { hp: menu.hp, targets: menu.targets };
  });

  const [drains, setDrains] = useState<ReadonlyMap<string, Drain>>(() => new Map());
  const drainKey = `${menu.hp}|${menu.targets.map((t) => `${t.index}:${t.hp}`).join(',')}`;

  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(() => {
      setDrains((current) => {
        const values = new Map<string, number>([['ally', latest.current.hp]]);
        for (const target of latest.current.targets) values.set(`foe:${target.index}`, target.hp);
        const next = stepDrains(current, values);
        if (next === current) window.clearInterval(id);
        return next;
      });
    }, DRAIN_TICK_MS);
    return () => window.clearInterval(id);
  }, [drainKey, reducedMotion]);

  const shownHp = (key: string, truth: number) =>
    reducedMotion ? truth : (drains.get(key)?.shown ?? truth);

  // ── The beats this round landed, as the plates' motion ──────────────────
  const beats = recap.rows.filter((row) => row.round === menu.round - 1);
  const hasBeats = beats.length > 0;
  const allyHit = beats.some((row) => row.side === 'enemy');
  const crit = beats.some((row) => row.crit);
  const hitFoes = new Set(beats.filter((row) => row.side === 'player').map((row) => row.target));
  const hitKey = `${menu.round}|${allyHit ? 'ally' : ''}|${crit ? 'crit' : ''}|${[...hitFoes]
    .sort()
    .join(',')}`;

  const [fxKey, setFxKey] = useState<string | null>(null);
  useEffect(() => {
    if (reducedMotion || !hasBeats) {
      setFxKey(null);
      return;
    }
    setFxKey(hitKey);
    const id = window.setTimeout(() => setFxKey(null), HIT_FX_MS);
    return () => window.clearTimeout(id);
  }, [hitKey, hasBeats, reducedMotion]);
  const fx = fxKey === hitKey ? { allyHit, crit, hitFoes } : null;

  const choose = (row: MenuRow) => {
    if (row.order) {
      onOrder(row.order);
      return;
    }
    if (focus.view === 'moves') setFocus(openCommand(focus, row.id as `skill:${string}`));
    else setFocus(openCommand(focus, row.id as BattleCommand));
  };

  return (
    <div className={`battle-screen ${fx?.crit ? 'crit' : ''}`}>
      <div className="battle-field">
        {stage}
        <ul className="battle-foes" aria-label="What stands in the room">
          {menu.targets.map((target, position) => {
            const plate = enemyPlate(
              target,
              menu.intents[position]!,
              boss && menu.targets.length === 1,
            );
            const struck = fx?.hitFoes.has(target.name) ?? false;
            return (
              <li
                key={target.index}
                className={['battle-plate', 'foe', plate.boss ? 'boss' : '', struck ? 'struck' : '']
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="plate-head">
                  <PixelText text={plate.name} color={C.paper0} pixelScale={2} wrap={24} />
                  {plate.tag !== '' && (
                    <span className="plate-tag">
                      <PixelText text={plate.tag} color={C.ink900} pixelScale={2} />
                    </span>
                  )}
                </div>
                <HpView
                  bar={plate.bar}
                  shown={shownHp(`foe:${target.index}`, target.hp)}
                  maxHp={target.maxHp}
                />
                <PixelText text={plate.defLine} color={C.paper2} pixelScale={2} wrap={30} />
                <PixelText text={plate.intent} color={C.rose1} pixelScale={2} wrap={30} />
                {plate.sum !== '' && (
                  <PixelText text={plate.sum} color={C.paper3} pixelScale={2} wrap={34} />
                )}
                {plate.traits.map((trait) => (
                  <PixelText key={trait} text={trait} color={C.ember1} pixelScale={2} wrap={30} />
                ))}
              </li>
            );
          })}
        </ul>
        <div className={`battle-plate ally ${fx?.allyHit ? 'struck' : ''}`}>
          <div className="plate-head">
            <PixelText text={ally.name} color={C.paper0} pixelScale={2} wrap={24} />
            <span className="plate-lv">
              <PixelText text={ally.levelLabel} color={C.paper2} pixelScale={2} />
            </span>
          </div>
          <HpView bar={ally.bar} shown={shownHp('ally', menu.hp)} maxHp={menu.maxHp} />
          <div className="plate-chips">
            {ally.chips.map((chip) => (
              <span key={chip} className="plate-chip">
                <PixelText text={chip} color={C.cyan2} pixelScale={2} />
              </span>
            ))}
          </div>
        </div>
      </div>

      {/*
        The live region holds the whole line, never the typewriter. A screen reader that followed
        every revealed glyph would stutter the same sentence forty times; the drawn text is the
        performance, the announcement is the line.
      */}
      <div className="battle-dialog">
        <p className="sr-only" role="status" aria-live="polite">
          {speaking ? speaking.text : 'The room is waiting for your order.'}
        </p>
        <div className="dialog-line" aria-hidden="true">
          <PixelText
            text={speaking ? playback.text : 'The room is waiting for your order.'}
            color={speaking ? TONE_COLOR[speaking.tone] : C.paper3}
            pixelScale={2}
            wrap={40}
          />
        </div>
        {speaking && !playback.done && (
          <button
            type="button"
            className={`dialog-arrow ${playback.typed ? 'ready' : ''}`}
            aria-label="Next line"
            onClick={advance}
          >
            ▼
          </button>
        )}
      </div>

      <div
        className="turn-panel"
        role="group"
        aria-labelledby="turn-title"
        data-round={menu.round}
        data-view={focus.view}
      >
        <h3 id="turn-title" className="delve-subtitle">
          <PixelText text={title} color={C.amber2} pixelScale={2} wrap={36} />
        </h3>
        {/* Keyed by round and window: each question slides in instead of silently replacing the last. */}
        <div
          key={`${menu.round}:${focus.view}`}
          className="battle-window"
          data-layout={focus.view === 'root' ? 'grid' : 'list'}
        >
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`turn-target battle-row ${row.disabled ? 'off' : ''}`}
              data-kind={rowKind(focus, row)}
              data-skill={row.id.startsWith('skill:') ? row.id.slice(6) : undefined}
              data-target={row.id.startsWith('target:') ? row.id.slice(7) : undefined}
              aria-label={row.aria}
              disabled={busy || row.disabled}
              onClick={() => choose(row)}
            >
              <PixelText
                text={row.label}
                color={row.disabled ? C.paper3 : C.amber1}
                pixelScale={2}
                wrap={24}
              />
              {row.detail !== '' && (
                <PixelText text={row.detail} color={C.paper2} pixelScale={2} wrap={34} />
              )}
              {row.sum !== '' && (
                <PixelText text={row.sum} color={C.paper3} pixelScale={2} wrap={38} />
              )}
              {row.notes.length > 0 && (
                <PixelText text={row.notes.join(' · ')} color={C.paper2} pixelScale={2} wrap={34} />
              )}
            </button>
          ))}
        </div>
        {focus.view !== 'root' && (
          <button
            type="button"
            className="turn-target battle-back"
            data-kind="back"
            aria-label="Back"
            onClick={() => setFocus(backFocus(focus))}
          >
            <PixelText text="◀ BACK" color={C.paper1} pixelScale={2} />
          </button>
        )}
      </div>

      {recap.rows.length > 0 && (
        <details className="battle-transcript">
          <summary aria-label="The beats the last step dealt">
            <PixelText text="Recap of the last blows" color={C.paper3} pixelScale={2} />
          </summary>
          <ul className="delve-recap" aria-label="The blows the last step dealt">
            {recap.omitted > 0 && (
              <li className="recap-more">
                <PixelText
                  text={`${recap.omitted} earlier blows not shown`}
                  color={C.paper3}
                  pixelScale={2}
                />
              </li>
            )}
            {recap.rows.map((row, index) => (
              <li key={`${row.round}-${row.actor}-${row.target}-${index}`}>
                <PixelText
                  text={`${row.crit ? 'CRIT ' : ''}${row.actor} → ${row.target}`}
                  color={row.side === 'player' ? C.moss1 : C.rose1}
                  pixelScale={2}
                  wrap={34}
                />
                <PixelText text={row.sum} color={C.paper3} pixelScale={2} wrap={34} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Which of the four root commands a row belongs to, for the e2e hand's selectors. */
function rowKind(focus: BattleFocus, row: MenuRow): string {
  if (focus.view === 'root') return row.id;
  if (focus.view === 'moves') return 'skill';
  if (focus.view === 'targets') return 'attack';
  if (focus.view === 'guard') return 'guard';
  return 'item';
}

function HpView({ bar, shown, maxHp }: { bar: HpBar; shown: number; maxHp: number }) {
  const drawn = barAt(bar, shown, maxHp);
  return (
    <div className={`hp-bar ${drawn.zone}`} role="img" aria-label={bar.label}>
      {Array.from({ length: drawn.cells }, (_, cell) => (
        <span key={cell} className={cell < drawn.filled ? 'hp-cell on' : 'hp-cell'} />
      ))}
    </div>
  );
}
