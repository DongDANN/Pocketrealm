import { useState } from 'react';
import { C } from '../../art/palette';
import {
  BUILDS,
  CONSUMABLE_SLOTS,
  CONSUMABLES,
  DEFAULT_BUILD,
  EQUIP_SLOTS,
  buildUnlocked,
  emberCraftCost,
  type BuildId,
} from '../../core/delve';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
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

function MovesetPanel({
  board,
  buildId,
  delve,
  busy,
}: {
  board: MovesetBoard;
  buildId: BuildId;
  delve: Actions;
  busy: boolean;
}) {
  return (
    <>
      <PixelPanel className="delve-panel" aria-labelledby="slots-title">
        <div className="panel-head">
          <h2 id="slots-title" className="panel-title">
            <PixelText text="Slots" color={C.paper0} pixelScale={3} />
          </h2>
          <span className="delve-badge">
            <PixelText
              text={`${board.slots.length}/${EQUIP_SLOTS}`}
              color={C.amber2}
              pixelScale={2}
            />
          </span>
        </div>
        <p className="panel-note">
          <PixelText text={board.capLine} color={C.paper3} pixelScale={2} wrap={38} />
        </p>
        <p className="panel-note">
          <PixelText text={board.nextCapLine} color={C.paper2} pixelScale={2} wrap={38} />
        </p>
        <p className="panel-note">
          <PixelText text={board.slotLine} color={C.paper3} pixelScale={2} wrap={38} />
        </p>
        <p className="field-note">
          <PixelText text={board.lockLine} color={C.paper2} pixelScale={2} wrap={38} />
        </p>
        <div className="choice-stack">
          {board.slots.map((slot) => (
            <div className="delve-choice" key={`slot-${slot.id}`}>
              <div className="delve-choice-copy">
                <PixelText
                  text={`${slot.name} · ${slot.tierLabel}${slot.leveled ? ` · LV${slot.level}` : ''}`}
                  color={C.amber1}
                  pixelScale={2}
                  wrap={28}
                />
                <PixelText text={slot.effect} color={C.paper3} pixelScale={2} wrap={36} />
              </div>
              {slot.innate ? (
                <span className="delve-badge">
                  <PixelText text="Innate" color={C.paper2} pixelScale={2} />
                </span>
              ) : (
                <PixelButton
                  variant="secondary"
                  disabled={busy || !slot.canUnequip}
                  onClick={() => void delve.unequipMove(slot.id, buildId)}
                >
                  <PixelText text="Unequip" color={C.paper0} pixelScale={2} />
                </PixelButton>
              )}
            </div>
          ))}
          <div className="delve-choice" key="passive">
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
  const equipped = meta.equippedConsumables ?? [];
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

      {tab === 'kit' && (
        <>
          <PixelPanel className="delve-panel" aria-labelledby="craft-title">
            <h2 id="craft-title" className="panel-title">
              <PixelText text="Craft" color={C.paper0} pixelScale={3} />
            </h2>
            <div className="choice-stack">
              {CONSUMABLES.map((def) => {
                const embers = emberCraftCost(meta, def.cost.embers);
                const missing: string[] = [];
                if (meta.materials.ore < def.cost.ore) missing.push('Ore');
                if (meta.materials.herb < def.cost.herb) missing.push('Herb');
                if (meta.materials.echo < def.cost.echo) missing.push('Echo');
                if (meta.embers < embers) missing.push('Embers');
                const canCraft = missing.length === 0;
                return (
                  <div className="delve-choice" key={def.id}>
                    <div className="delve-choice-copy">
                      <PixelText
                        text={`${def.name} · stock ${meta.consumableStock?.[def.id] ?? 0}`}
                        color={C.amber1}
                        pixelScale={2}
                        wrap={22}
                      />
                      <PixelText text={def.effect} color={C.paper3} pixelScale={2} wrap={34} />
                      <PixelText
                        text={`Costs ${def.cost.ore} ore · ${def.cost.herb} herb · ${def.cost.echo} echo · ${embers} Embers.`}
                        color={C.paper2}
                        pixelScale={2}
                        wrap={34}
                      />
                      {!canCraft && (
                        <PixelText
                          text={`Short of ${missing.join(', ')}.`}
                          color={C.ember1}
                          pixelScale={2}
                          wrap={34}
                        />
                      )}
                    </div>
                    <PixelButton
                      variant="secondary"
                      disabled={!canCraft || delve.busy}
                      onClick={() => void delve.craft(def.id)}
                    >
                      <PixelText text="Craft" color={C.paper0} pixelScale={2} />
                    </PixelButton>
                  </div>
                );
              })}
            </div>
          </PixelPanel>

          <PixelPanel className="delve-panel" aria-labelledby="equip-title">
            <div className="panel-head">
              <h2 id="equip-title" className="panel-title">
                <PixelText text="Loadout" color={C.paper0} pixelScale={3} />
              </h2>
              <span className="delve-badge">
                <PixelText
                  text={`${equipped.length}/${CONSUMABLE_SLOTS}`}
                  color={C.amber2}
                  pixelScale={2}
                />
              </span>
            </div>
            <p className="panel-note">
              <PixelText
                text="Equipped consumables start the next run with you. They are spent when they fire and must be crafted again."
                color={C.paper3}
                pixelScale={2}
                wrap={38}
              />
            </p>
            <div className="choice-stack">
              {CONSUMABLES.map((def) => {
                const stock = meta.consumableStock?.[def.id] ?? 0;
                const isEquipped = equipped.includes(def.id);
                const full = equipped.length >= CONSUMABLE_SLOTS;
                return (
                  <div className="delve-choice" key={`eq-${def.id}`}>
                    <div className="delve-choice-copy">
                      <PixelText
                        text={`${def.name}${isEquipped ? ' · equipped' : ` · ${stock} in stock`}`}
                        color={isEquipped ? C.moss1 : C.paper1}
                        pixelScale={2}
                        wrap={22}
                      />
                    </div>
                    <PixelButton
                      variant="secondary"
                      disabled={delve.busy || (!isEquipped && (stock < 1 || full))}
                      onClick={() =>
                        void (isEquipped ? delve.unequip(def.id) : delve.equip(def.id))
                      }
                    >
                      <PixelText
                        text={isEquipped ? 'Unequip' : full && stock > 0 ? 'Slots full' : 'Equip'}
                        color={C.paper0}
                        pixelScale={2}
                      />
                    </PixelButton>
                  </div>
                );
              })}
            </div>
          </PixelPanel>
        </>
      )}

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
          <MovesetPanel board={moves} buildId={buildId} delve={delve} busy={delve.busy} />
        </>
      )}

      {tab === 'dust' && <DustPanel rows={ladder} delve={delve} busy={delve.busy} />}
    </main>
  );
}
