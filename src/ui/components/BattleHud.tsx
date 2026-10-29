import { useEffect, useState, type ReactNode } from 'react';
import { C } from '../../art/palette';
import type { TurnMenu, TurnOrder } from '../../core/delve';
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
import { allyPlate, dialogQueue, enemyPlate, type HpBar } from '../lib/battleHud';
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

export function BattleHud({ menu, busy, boss, companion, recap, stage, onOrder }: Props) {
  const [focus, setFocus] = useState<BattleFocus>(initialFocus);
  // A new round is a new menu: the window the last order left open is no longer the question.
  useEffect(() => {
    setFocus(initialFocus());
  }, [menu.round]);

  const rows = viewRows(focus, menu);
  const title = viewTitle(focus, menu);
  const dialog = dialogQueue(recap);
  const line = dialog.length > 0 ? dialog[dialog.length - 1]! : null;
  const ally = allyPlate({
    name: companion.name,
    level: companion.level,
    hp: menu.hp,
    maxHp: menu.maxHp,
    shield: menu.shield,
    energy: menu.energy,
  });

  const choose = (row: MenuRow) => {
    if (row.order) {
      onOrder(row.order);
      return;
    }
    if (focus.view === 'moves') setFocus(openCommand(focus, row.id as `skill:${string}`));
    else setFocus(openCommand(focus, row.id as BattleCommand));
  };

  return (
    <div className="battle-screen">
      <div className="battle-field">
        {stage}
        <ul className="battle-foes" aria-label="What stands in the room">
          {menu.targets.map((target, position) => {
            const plate = enemyPlate(
              target,
              menu.intents[position]!,
              boss && menu.targets.length === 1,
            );
            return (
              <li key={target.index} className={`battle-plate foe ${plate.boss ? 'boss' : ''}`}>
                <div className="plate-head">
                  <PixelText text={plate.name} color={C.paper0} pixelScale={2} wrap={24} />
                  {plate.tag !== '' && (
                    <span className="plate-tag">
                      <PixelText text={plate.tag} color={C.ink900} pixelScale={2} />
                    </span>
                  )}
                </div>
                <HpView bar={plate.bar} />
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
        <div className="battle-plate ally">
          <div className="plate-head">
            <PixelText text={ally.name} color={C.paper0} pixelScale={2} wrap={24} />
            <span className="plate-lv">
              <PixelText text={ally.levelLabel} color={C.paper2} pixelScale={2} />
            </span>
          </div>
          <HpView bar={ally.bar} />
          <div className="plate-chips">
            {ally.chips.map((chip) => (
              <span key={chip} className="plate-chip">
                <PixelText text={chip} color={C.cyan2} pixelScale={2} />
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="battle-dialog" role="status" aria-live="polite">
        <PixelText
          text={line ? line.text : 'The room is waiting for your order.'}
          color={line ? TONE_COLOR[line.tone] : C.paper3}
          pixelScale={2}
          wrap={40}
        />
        {line && (
          <span className="dialog-arrow" aria-hidden="true">
            ▼
          </span>
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
        <div className="battle-window" data-layout={focus.view === 'root' ? 'grid' : 'list'}>
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

function HpView({ bar }: { bar: HpBar }) {
  return (
    <div className={`hp-bar ${bar.zone}`} role="img" aria-label={bar.label}>
      {Array.from({ length: bar.cells }, (_, cell) => (
        <span key={cell} className={cell < bar.filled ? 'hp-cell on' : 'hp-cell'} />
      ))}
    </div>
  );
}
