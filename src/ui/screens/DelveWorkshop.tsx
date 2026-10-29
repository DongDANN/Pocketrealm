import { useState } from 'react';
import { C } from '../../art/palette';
import { buildWarden } from '../../art/companion';
import { iconBurn, iconRegen, iconShield, iconSwift } from '../../art/ui';
import type { Pixmap } from '../../art/px';
import { BUILDS, DEFAULT_BUILD, buildUnlocked, type BuildId } from '../../core/delve';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
import { PixelImage } from '../components/PixelImage';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { FatalPanel, LoadingPanel } from '../app/gates';
import { useDelve } from '../app/delve';
import {
  capsuleBoard,
  dustRows,
  movesetBoard,
  tierColor,
  type CapsuleBoard,
  type DustRow,
  type MoveRow,
  type MovesetBoard,
  type PityLine,
  type RelevanceLine,
  type TierOdds,
} from '../lib/delveCollection';
import { bagBoard, elementColor, moveCells, moveLine, type BagBoard } from '../lib/delveMenus';

/**
 * The Workshop — where materials become capsules, capsules become skills, and skills become a moveset.
 *
 * Every number here is read out of the engine by `delveCollection.ts`, including the ones the player sees
 * before committing: the make a craft would produce is the make `craftCapsule` pays for, and the odds
 * beside it are the draw's own distribution. Nothing is bought with money, nothing expires, and a decision
 * the run has already locked is shown disabled with the reason printed next to it.
 */

type Tab = 'kit' | 'capsules' | 'moveset' | 'dust';

const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'kit', label: 'Consumables' },
  { id: 'capsules', label: 'Capsules' },
  { id: 'moveset', label: 'Moveset' },
  { id: 'dust', label: 'Skill Dust' },
];

type Actions = ReturnType<typeof useDelve>;

function Odds({ odds }: { odds: TierOdds[] }) {
  if (odds.length === 0) return null;
  return (
    <div className="capsule-odds">
      {odds.map((tier) => (
        <span className="delve-badge" key={tier.rarity}>
          <PixelText
            text={`${tier.label} ${tier.percent}%`}
            color={tierColor(tier.rarity)}
            pixelScale={2}
          />
        </span>
      ))}
    </div>
  );
}

function Pips({ pity }: { pity: PityLine }) {
  return (
    <div className="pity-pips" role="img" aria-label={`Hard pity ${pity.since} of ${pity.target}`}>
      {Array.from({ length: pity.target }, (_, index) => (
        <span key={index} className={index < pity.filled ? 'pip on' : 'pip'} />
      ))}
    </div>
  );
}

/**
 * The prize is already in the book before this sheet appears: `openCapsule` writes the grant and the
 * reveal in one transaction, so dismissing only clears the banner.
 */
function RevealSheet({ board, delve }: { board: CapsuleBoard; delve: Actions }) {
  const reveal = board.reveal;
  if (!reveal) return null;
  return (
    <PixelPanel className="delve-panel reveal-panel" aria-labelledby="reveal-title">
      <h2 id="reveal-title" className="panel-title">
        <PixelText text={`Capsule ${reveal.index + 1} opened`} color={C.paper0} pixelScale={3} />
      </h2>
      <PixelText text={reveal.name} color={tierColor(reveal.rarity)} pixelScale={3} wrap={30} />
      <p className="panel-note">
        <PixelText
          text={`${reveal.capsule} · ${reveal.tierLabel} ${reveal.kind.toLowerCase()}. ${reveal.effect}`}
          color={C.paper3}
          pixelScale={2}
          wrap={38}
        />
      </p>
      {reveal.level5 !== '' && (
        <p className="panel-note">
          <PixelText
            text={reveal.reached5 ? `${reveal.level5} Already in play.` : reveal.level5}
            color={C.cyan2}
            pixelScale={2}
            wrap={36}
          />
        </p>
      )}
      {reveal.duplicate && (
        <p className="panel-note">
          <PixelText
            text={`Already known — it paid ${reveal.dust} Skill Dust instead.`}
            color={C.amber1}
            pixelScale={2}
            wrap={36}
          />
        </p>
      )}
      <p className="field-note">
        <PixelText
          text="Drawn and written down the moment it opened. Closing this screen cannot roll a different capsule."
          color={C.paper3}
          pixelScale={2}
          wrap={38}
        />
      </p>
      <PixelButton
        variant="secondary"
        disabled={delve.busy}
        onClick={() => void delve.dismissCapsule()}
      >
        <PixelText text="Put it in the book" color={C.paper0} pixelScale={2} />
      </PixelButton>
    </PixelPanel>
  );
}

function CapsulePanels({ board, delve }: { board: CapsuleBoard; delve: Actions }) {
  const relevance: RelevanceLine = board.relevance;
  return (
    <>
      <PixelPanel className="delve-panel" aria-labelledby="capsule-craft-title">
        <h2 id="capsule-craft-title" className="panel-title">
          <PixelText text="Craft a capsule" color={C.paper0} pixelScale={3} />
        </h2>
        <p className="panel-note">
          <PixelText
            text={`Costs ${board.craft.cost}. Never Embers, never oil, never money — and it waits in the book until you choose to open it.`}
            color={C.paper3}
            pixelScale={2}
            wrap={38}
          />
        </p>
        {board.craft.canCraft ? (
          <>
            <p className="panel-note">
              <PixelText
                text={`${board.craft.paidFrom} pays for this one: ${board.craft.name}, holding ${board.craft.band}.`}
                color={C.amber1}
                pixelScale={2}
                wrap={38}
              />
            </p>
            <Odds odds={board.craft.odds} />
          </>
        ) : (
          <p className="panel-note">
            <PixelText
              text={`Short of ${board.craft.missing.join(', ')}. Materials come from rooms you clear.`}
              color={C.ember1}
              pixelScale={2}
              wrap={38}
            />
          </p>
        )}
        <PixelButton
          variant="secondary"
          disabled={!board.craft.canCraft || delve.busy}
          onClick={() => void delve.craftCapsule()}
        >
          <PixelText text="Craft" color={C.paper0} pixelScale={2} />
        </PixelButton>
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="capsule-held-title">
        <div className="panel-head">
          <h2 id="capsule-held-title" className="panel-title">
            <PixelText text="Held" color={C.paper0} pixelScale={3} />
          </h2>
          <span className="delve-badge">
            <PixelText text={`${board.held} in the book`} color={C.amber2} pixelScale={2} />
          </span>
        </div>
        {board.rows.length === 0 ? (
          <p className="panel-note">
            <PixelText
              text="No capsules yet. Craft one above."
              color={C.paper3}
              pixelScale={2}
              wrap={34}
            />
          </p>
        ) : (
          <div className="choice-stack">
            {board.rows.map((row) => (
              <div className="delve-choice" key={row.ceiling}>
                <div className="delve-choice-copy">
                  <PixelText
                    text={`${row.name} · ${row.count} held`}
                    color={C.amber1}
                    pixelScale={2}
                    wrap={26}
                  />
                  <PixelText
                    text={`Holds ${row.band}. ${row.pityLine}`}
                    color={C.paper3}
                    pixelScale={2}
                    wrap={34}
                  />
                  <Odds odds={row.odds} />
                </div>
                <PixelButton
                  variant="secondary"
                  disabled={delve.busy}
                  onClick={() => void delve.openCapsule(row.ceiling)}
                >
                  <PixelText text="Open" color={C.paper0} pixelScale={2} />
                </PixelButton>
              </div>
            ))}
          </div>
        )}
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="guarantee-title">
        <h2 id="guarantee-title" className="panel-title">
          <PixelText text="Guarantees" color={C.paper0} pixelScale={3} />
        </h2>
        <p className="panel-note">
          <PixelText
            text="No dud: a capsule never holds a Common. The twenty-two Commons are what a companion can learn without one."
            color={C.paper3}
            pixelScale={2}
            wrap={38}
          />
        </p>
        <Pips pity={board.pity} />
        <p className="panel-note">
          <PixelText text={board.pity.line} color={C.paper3} pixelScale={2} wrap={38} />
        </p>
        <p className="panel-note">
          <PixelText text={relevance.line} color={C.paper3} pixelScale={2} wrap={38} />
        </p>
        {relevance.due && (
          <p className="panel-note">
            <PixelText
              text={`Two in a row missed, so the next capsule owes a match.`}
              color={C.cyan2}
              pixelScale={2}
              wrap={34}
            />
          </p>
        )}
      </PixelPanel>
    </>
  );
}

/** The four consumables' icons, drawn once at module load. */
const BAG_ICON: Record<string, Pixmap> = {
  'healing-draught': iconRegen(),
  'fire-oil': iconBurn(),
  'smoke-scroll': iconSwift(),
  'shield-charm': iconShield(),
};

const BAG_FALLBACK = BAG_ICON['healing-draught']!;
const WARDEN_PORTRAIT = buildWarden().portrait;

/**
 * The bag: three pockets a run starts from, then one list where every item can be crafted and moved.
 *
 * The craft button is priced by the engine (Workshop discount included) and the equip button follows
 * the same rules `equipConsumable` enforces — a full pocket row says so instead of failing silently.
 */
function BagPanel({ board, delve, busy }: { board: BagBoard; delve: Actions; busy: boolean }) {
  const pocketsFull = board.equippedCount >= board.cap;
  return (
    <PixelPanel className="delve-panel" aria-labelledby="bag-title">
      <div className="panel-head">
        <h2 id="bag-title" className="panel-title">
          <PixelText text="Bag" color={C.paper0} pixelScale={3} />
        </h2>
        <span className="delve-badge">
          <PixelText text={`${board.equippedCount}/${board.cap}`} color={C.amber2} pixelScale={2} />
        </span>
      </div>
      <p className="panel-note">
        <PixelText text={board.startLine} color={C.paper3} pixelScale={2} wrap={38} />
      </p>
      <div className="pocket-grid">
        {board.slots.map((slot, index) => (
          <div className={slot.id ? 'pocket-slot filled' : 'pocket-slot'} key={`pocket-${index}`}>
            <PixelText text={`#${index + 1}`} color={C.paper2} pixelScale={2} align="center" />
            {slot.id ? (
              <PixelImage pixmap={BAG_ICON[slot.id] ?? BAG_FALLBACK} scale={2} alt="" />
            ) : (
              <span className="pocket-gap" aria-hidden="true" />
            )}
            <PixelText
              text={slot.id ? slot.name : 'Empty'}
              color={slot.id ? C.amber1 : C.paper3}
              pixelScale={2}
              wrap={14}
              align="center"
            />
          </div>
        ))}
      </div>
      <div className="bag-list">
        {board.rows.map((row) => {
          const canEquip = !row.equipped && row.stock > 0 && !pocketsFull;
          return (
            <div className="bag-row" key={row.id}>
              <span className="bag-icon">
                <PixelImage pixmap={BAG_ICON[row.id] ?? BAG_FALLBACK} scale={2} alt="" />
              </span>
              <div className="bag-copy">
                <div className="bag-head">
                  <PixelText
                    text={row.name}
                    color={row.equipped ? C.moss1 : C.amber1}
                    pixelScale={2}
                    wrap={22}
                  />
                  <span className="delve-badge">
                    <PixelText
                      text={row.equipped ? 'Equipped' : `×${row.stock}`}
                      color={row.equipped ? C.moss1 : C.paper2}
                      pixelScale={2}
                    />
                  </span>
                </div>
                <PixelText text={row.effect} color={C.paper3} pixelScale={2} wrap={34} />
                <PixelText text={row.costLine} color={C.paper2} pixelScale={2} wrap={34} />
                {!row.canCraft && (
                  <PixelText
                    text={`Short of ${row.missing.join(', ')}.`}
                    color={C.ember1}
                    pixelScale={2}
                    wrap={34}
                  />
                )}
              </div>
              <div className="bag-actions">
                <PixelButton
                  variant="secondary"
                  disabled={!row.canCraft || busy}
                  aria-label={`Craft ${row.name}`}
                  onClick={() => void delve.craft(row.id)}
                >
                  <PixelText text="Craft" color={C.paper0} pixelScale={2} />
                </PixelButton>
                <PixelButton
                  variant="secondary"
                  disabled={busy || !(row.equipped || canEquip)}
                  aria-label={`${row.equipped ? 'Unequip' : 'Equip'} ${row.name}`}
                  onClick={() => void (row.equipped ? delve.unequip(row.id) : delve.equip(row.id))}
                >
                  <PixelText
                    text={
                      row.equipped ? 'Unequip' : pocketsFull && row.stock > 0 ? 'Full' : 'Equip'
                    }
                    color={C.paper0}
                    pixelScale={2}
                  />
                </PixelButton>
              </div>
            </div>
          );
        })}
      </div>
    </PixelPanel>
  );
}

function KnownRow({
  row,
  buildId,
  delve,
  busy,
}: {
  row: MoveRow;
  buildId: BuildId;
  delve: Actions;
  busy: boolean;
}) {
  const isActive = row.kind === 'Active';
  const label = row.equipped ? (isActive ? 'Unequip' : 'Reset') : isActive ? 'Equip' : 'Wear';
  const allowed = row.equipped ? row.canUnequip : isActive ? row.canEquip : row.canEquipPassive;
  const run = () => {
    if (row.equipped)
      return isActive ? delve.unequipMove(row.id, buildId) : delve.clearPassive(buildId);
    return isActive ? delve.equipMove(row.id, buildId) : delve.equipPassive(row.id, buildId);
  };
  return (
    <div className="delve-choice">
      <div className="delve-choice-copy">
        <PixelText
          text={`${row.name} · ${row.tierLabel} ${row.kind.toLowerCase()}${row.equipped ? ' · in play' : ''}`}
          color={tierColor(row.rarity)}
          pixelScale={2}
          wrap={28}
        />
        <PixelText text={row.effect} color={C.paper3} pixelScale={2} wrap={36} />
        {!allowed && <PixelText text={row.equipNote} color={C.paper2} pixelScale={2} wrap={34} />}
      </div>
      <div className="delve-choice-actions">
        <PixelButton variant="secondary" disabled={busy || !allowed} onClick={() => void run()}>
          <PixelText text={label} color={C.paper0} pixelScale={2} />
        </PixelButton>
        {row.canForget && (
          <PixelButton
            variant="secondary"
            disabled={busy}
            onClick={() => void delve.forgetSkill(row.id, buildId)}
          >
            <PixelText text="Forget" color={C.paper0} pixelScale={2} />
          </PixelButton>
        )}
      </div>
    </div>
  );
}

function LearnableRow({
  row,
  buildId,
  delve,
  busy,
}: {
  row: MoveRow;
  buildId: BuildId;
  delve: Actions;
  busy: boolean;
}) {
  return (
    <div className="delve-choice">
      <div className="delve-choice-copy">
        <PixelText
          text={`${row.name} · ${row.tierLabel} ${row.kind.toLowerCase()}`}
          color={tierColor(row.rarity)}
          pixelScale={2}
          wrap={28}
        />
        <PixelText text={row.effect} color={C.paper3} pixelScale={2} wrap={36} />
      </div>
      <PixelButton
        variant="secondary"
        disabled={busy || !row.canLearn}
        onClick={() => void delve.learnSkill(row.id, buildId)}
      >
        <PixelText text={row.canLearn ? 'Learn' : 'Locked'} color={C.paper0} pixelScale={2} />
      </PixelButton>
      {!row.canLearn && (
        <PixelText text={row.learnNote} color={C.paper2} pixelScale={2} wrap={34} />
      )}
    </div>
  );
}

/** One cell of the four. The left stripe carries the move's element, so the grid reads at a glance. */
function MoveCellCard({
  cell,
  buildId,
  delve,
  busy,
}: {
  cell: ReturnType<typeof moveCells>[number];
  buildId: BuildId;
  delve: Actions;
  busy: boolean;
}) {
  const slot = cell.slot;
  const stripe = slot && slot.element !== '' ? `elem-${slot.element}` : 'elem-none';
  return (
    <div className={['move-cell', stripe].filter(Boolean).join(' ')}>
      <div className="move-head">
        <span className="move-index">
          <PixelText text={`${cell.index}`} color={C.paper1} pixelScale={2} />
        </span>
        <PixelText
          text={slot ? slot.name : 'Empty'}
          color={slot ? C.amber1 : C.paper2}
          pixelScale={2}
          wrap={18}
        />
      </div>
      {slot ? (
        <>
          <PixelText
            text={moveLine(slot)}
            color={elementColor(slot.element)}
            pixelScale={2}
            wrap={20}
          />
          <PixelText text={slot.effect} color={C.paper3} pixelScale={2} wrap={30} />
          {slot.innate ? (
            <span className="delve-badge">
              <PixelText text="Innate" color={C.paper2} pixelScale={2} />
            </span>
          ) : (
            <PixelButton
              variant="secondary"
              disabled={busy || !slot.canUnequip}
              aria-label={`Unequip ${slot.name}`}
              onClick={() => void delve.unequipMove(slot.id, buildId)}
            >
              <PixelText text="Unequip" color={C.paper0} pixelScale={2} />
            </PixelButton>
          )}
        </>
      ) : (
        <PixelText text={cell.emptyLine} color={C.paper3} pixelScale={2} wrap={28} />
      )}
    </div>
  );
}

function MovesetPanel({
  board,
  buildId,
  level,
  delve,
  busy,
}: {
  board: MovesetBoard;
  buildId: BuildId;
  level: number;
  delve: Actions;
  busy: boolean;
}) {
  const buildName = BUILDS.find((build) => build.id === buildId)?.name ?? 'Companion';
  return (
    <>
      <PixelPanel className="delve-panel" aria-labelledby="summary-title">
        <div className="panel-head">
          <h2 id="summary-title" className="panel-title">
            <PixelText text="Summary" color={C.paper0} pixelScale={3} />
          </h2>
          <span className="delve-badge">
            <PixelText text={`Lv ${level}`} color={C.amber2} pixelScale={2} />
          </span>
        </div>
        <div className="summary-head">
          <PixelImage
            pixmap={WARDEN_PORTRAIT}
            scale={1}
            alt={`${buildName} portrait`}
            className="summary-portrait"
          />
          <div className="summary-copy">
            <PixelText text={buildName} color={C.amber1} pixelScale={3} />
            <PixelText text={board.capLine} color={C.paper3} pixelScale={2} wrap={34} />
            <PixelText text={board.nextCapLine} color={C.paper2} pixelScale={2} wrap={34} />
          </div>
        </div>
        <div className="move-grid">
          {moveCells(board).map((cell) => (
            <MoveCellCard
              key={`move-${cell.index}`}
              cell={cell}
              buildId={buildId}
              delve={delve}
              busy={busy}
            />
          ))}
        </div>
        <p className="panel-note">
          <PixelText text={board.slotLine} color={C.paper3} pixelScale={2} wrap={38} />
        </p>
        <p className="field-note">
          <PixelText text={board.lockLine} color={C.paper2} pixelScale={2} wrap={38} />
        </p>
        <div className="delve-choice">
          <div className="delve-choice-copy">
            <PixelText
              text={`Passive · ${board.passive?.name ?? 'None'}`}
              color={C.amber1}
              pixelScale={2}
              wrap={28}
            />
            <PixelText
              text={`${board.passiveLine}${board.passive ? ` ${board.passive.effect}` : ''}`}
              color={C.paper3}
              pixelScale={2}
              wrap={36}
            />
          </div>
          <PixelButton
            variant="secondary"
            disabled={busy || !(board.passive?.canUnequip ?? false)}
            onClick={() => void delve.clearPassive(buildId)}
          >
            <PixelText text="Reset" color={C.paper0} pixelScale={2} />
          </PixelButton>
        </div>
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="known-title">
        <h2 id="known-title" className="panel-title">
          <PixelText text="Known skills" color={C.paper0} pixelScale={3} />
        </h2>
        {board.known.length === 0 ? (
          <p className="panel-note">
            <PixelText
              text="Nothing learned yet. The twenty-two Commons below cost a know slot and nothing else."
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
        ) : (
          <div className="choice-stack">
            {board.known.map((row) => (
              <KnownRow key={row.id} row={row} buildId={buildId} delve={delve} busy={busy} />
            ))}
          </div>
        )}
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="learnable-title">
        <h2 id="learnable-title" className="panel-title">
          <PixelText text="Could learn" color={C.paper0} pixelScale={3} />
        </h2>
        {board.learnable.length === 0 ? (
          <p className="panel-note">
            <PixelText
              text="Every skill the companion can hold is already known. A capsule hands over the rest."
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
        ) : (
          <div className="choice-stack">
            {board.learnable.map((row) => (
              <LearnableRow key={row.id} row={row} buildId={buildId} delve={delve} busy={busy} />
            ))}
          </div>
        )}
      </PixelPanel>
    </>
  );
}

function DustPanel({ rows, delve, busy }: { rows: DustRow[]; delve: Actions; busy: boolean }) {
  return (
    <PixelPanel className="delve-panel" aria-labelledby="dust-title">
      <h2 id="dust-title" className="panel-title">
        <PixelText text="Skill Dust ladder" color={C.paper0} pixelScale={3} />
      </h2>
      <p className="panel-note">
        <PixelText
          text="Ten swings pay 1 dust and a duplicate pays its tier. Each rung is +8% on that skill alone, and the fifth attaches its modifier."
          color={C.paper3}
          pixelScale={2}
          wrap={38}
        />
      </p>
      {rows.length === 0 ? (
        <p className="panel-note">
          <PixelText
            text="Nothing written down yet. A run records the skills it actually used."
            color={C.paper3}
            pixelScale={2}
            wrap={36}
          />
        </p>
      ) : (
        <div className="choice-stack">
          {rows.map((row) => (
            <div className="delve-choice" key={row.id}>
              <div className="delve-choice-copy">
                <PixelText
                  text={`${row.name} · LV${row.level} ${row.potency}`}
                  color={tierColor(row.rarity)}
                  pixelScale={2}
                  wrap={28}
                />
                <PixelText text={row.rungLine} color={C.paper3} pixelScale={2} wrap={36} />
                <PixelText text={row.usesLine} color={C.paper2} pixelScale={2} wrap={36} />
                {row.hasRung && (
                  <PixelText
                    text={row.reached5 ? `${row.rung5} Already in play.` : row.rung5}
                    color={row.reached5 ? C.cyan2 : C.paper2}
                    pixelScale={2}
                    wrap={36}
                  />
                )}
              </div>
              <PixelButton
                variant="secondary"
                disabled={busy || row.maxed || !row.afford}
                onClick={() => void delve.levelSkill(row.id)}
              >
                <PixelText
                  text={row.maxed ? 'Maxed' : row.afford ? `Raise to LV${row.level + 1}` : 'Short'}
                  color={C.paper0}
                  pixelScale={2}
                />
              </PixelButton>
            </div>
          ))}
        </div>
      )}
    </PixelPanel>
  );
}

export function DelveWorkshop() {
  const delve = useDelve();
  const [tab, setTab] = useState<Tab>('kit');
  const [buildId, setBuildId] = useState<BuildId>(DEFAULT_BUILD as BuildId);

  if (delve.loading) return <LoadingPanel label="Opening the crate" />;
  if (delve.problem) return <FatalPanel message={delve.problem} />;
  const snapshot = delve.snapshot;
  if (!snapshot) return <LoadingPanel label="Opening the crate" />;

  const meta = snapshot.meta;
  const bag = bagBoard(meta);
  const board = capsuleBoard(meta);
  const moves = movesetBoard(meta, snapshot.companionLevel, buildId, snapshot.active !== null);
  const ladder = dustRows(meta);

  return (
    <main className="shell app-shell">
      <AppHeader title="Workshop" backTo="/delve" />

      <PixelPanel className="delve-panel" tone="paper">
        <div className="delve-wallet">
          <span>
            <PixelText
              text={`Ore ${meta.materials.ore} · Herb ${meta.materials.herb} · Echo ${meta.materials.echo}`}
              color={C.ink800}
              pixelScale={2}
            />
          </span>
          <span>
            <PixelText text={`Embers ${meta.embers}`} color={C.ink800} pixelScale={2} />
          </span>
          <span>
            <PixelText text={`Skill Dust ${meta.dust ?? 0}`} color={C.ink800} pixelScale={2} />
          </span>
        </div>
        <p className="field-note">
          <PixelText
            text="Materials drop from rooms you actually clear. Consumables cost materials and Embers; capsules cost materials alone."
            color={C.ink600}
            pixelScale={2}
            wrap={38}
          />
        </p>
      </PixelPanel>

      <div className="chip-row" role="tablist" aria-label="Workshop">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={tab === entry.id ? 'chip on' : 'chip'}
            onClick={() => setTab(entry.id)}
          >
            <PixelText text={entry.label} color={C.paper1} pixelScale={2} />
          </button>
        ))}
      </div>

      {tab === 'kit' && <BagPanel board={bag} delve={delve} busy={delve.busy} />}

      {tab === 'capsules' && (
        <>
          <RevealSheet board={board} delve={delve} />
          <CapsulePanels board={board} delve={delve} />
        </>
      )}

      {tab === 'moveset' && (
        <>
          <div className="chip-row" role="tablist" aria-label="Build">
            {BUILDS.filter((build) => buildUnlocked(build.id, meta, snapshot.companionLevel)).map(
              (build) => (
                <button
                  key={build.id}
                  type="button"
                  role="tab"
                  aria-selected={buildId === build.id}
                  className={buildId === build.id ? 'chip on' : 'chip'}
                  onClick={() => setBuildId(build.id)}
                >
                  <PixelText text={build.name} color={C.paper1} pixelScale={2} />
                </button>
              ),
            )}
          </div>
          <MovesetPanel
            board={moves}
            buildId={buildId}
            level={snapshot.companionLevel}
            delve={delve}
            busy={delve.busy}
          />
        </>
      )}

      {tab === 'dust' && <DustPanel rows={ladder} delve={delve} busy={delve.busy} />}
    </main>
  );
}
