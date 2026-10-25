import { useState } from 'react';
import { C } from '../../art/palette';
import { CARDS, cardUnlocked, type CardCondition, type CardAction } from '../../core/delve';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { FatalPanel, LoadingPanel } from '../app/gates';
import { useDelve } from '../app/delve';

function conditionText(c: CardCondition): string {
  switch (c.kind) {
    case 'hpBelow':
      return `When HP is at or below ${c.percent}%`;
    case 'roundOne':
      return 'In round 1 of a fight';
    case 'markedTarget':
      return 'When a target is marked';
    case 'targetHpBelow':
      return `When the target is at or below ${c.percent}% HP`;
    case 'enemyWeakTo':
      return `When an enemy is weak to ${c.element}`;
    case 'energyAbove':
      return `When energy is above ${c.amount}`;
    case 'always':
      return 'Always';
  }
}

function actionText(a: CardAction): string {
  switch (a.kind) {
    case 'prefer':
      return `Prefer the ${a.role} skill`;
    case 'element':
      return `Attack with ${a.element}`;
    case 'attackMarked':
      return 'Strike the marked target';
    case 'basic':
      return 'Take a basic attack';
  }
}

export function DelveCards() {
  const delve = useDelve();
  const [draft, setDraft] = useState<string[] | null>(null);

  if (delve.loading) return <LoadingPanel label="Shuffling the deck" />;
  if (delve.problem) return <FatalPanel message={delve.problem} />;
  const snapshot = delve.snapshot;
  if (!snapshot) return <LoadingPanel label="Shuffling the deck" />;

  const meta = snapshot.meta;
  const level = snapshot.companionLevel;
  const saved = meta.cards ?? [];
  const cards = draft ?? saved;
  const dirty = cards.join('|') !== saved.join('|');

  const toggle = (id: string) => {
    const open = cardUnlocked(id, meta, level);
    if (!open) return;
    setDraft(cards.includes(id) ? cards.filter((c) => c !== id) : [...cards, id]);
  };

  const move = (id: string, delta: number) => {
    const index = cards.indexOf(id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= cards.length) return;
    const next = [...cards];
    next.splice(index, 1);
    next.splice(target, 0, id);
    setDraft(next);
  };

  return (
    <main className="shell app-shell">
      <AppHeader title="Habit Cards" backTo="/delve" />

      <PixelPanel className="delve-panel" tone="paper">
        <p className="field-note">
          <PixelText
            text="Cards decide which skill your companion reaches for, in the order shown. Three slots, no more. They read the fight only — they never read your money."
            color={C.ink700}
            pixelScale={2}
            wrap={38}
          />
        </p>
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="loadout-title">
        <div className="panel-head">
          <h2 id="loadout-title" className="panel-title">
            <PixelText text="Equipped" color={C.paper0} pixelScale={3} />
          </h2>
          <span className="delve-badge">
            <PixelText text={`${cards.length}/3`} color={C.amber2} pixelScale={2} />
          </span>
        </div>
        {cards.length === 0 && (
          <p className="panel-note">
            <PixelText
              text="No cards equipped. The companion uses its build's default order."
              color={C.paper3}
              pixelScale={2}
              wrap={36}
            />
          </p>
        )}
        <div className="priority-list">
          {cards.map((id, index) => {
            const def = CARDS.find((c) => c.id === id);
            if (!def) return null;
            return (
              <div className="priority-row" key={id}>
                <span className="priority-slot">
                  <PixelText text={`${index + 1}`} color={C.amber1} pixelScale={2} />
                </span>
                <div className="delve-choice-copy">
                  <PixelText text={def.name} color={C.paper1} pixelScale={2} />
                  <PixelText
                    text={`${conditionText(def.condition)} → ${actionText(def.action)}`}
                    color={C.paper3}
                    pixelScale={2}
                    wrap={32}
                  />
                </div>
                <div className="confirm-actions">
                  <PixelButton
                    variant="secondary"
                    disabled={index === 0}
                    onClick={() => move(id, -1)}
                    aria-label={`Move ${def.name} up`}
                  >
                    <PixelText text="Up" color={C.paper0} pixelScale={2} />
                  </PixelButton>
                  <PixelButton
                    variant="secondary"
                    disabled={index === cards.length - 1}
                    onClick={() => move(id, 1)}
                    aria-label={`Move ${def.name} down`}
                  >
                    <PixelText text="Down" color={C.paper0} pixelScale={2} />
                  </PixelButton>
                </div>
              </div>
            );
          })}
        </div>
        <div className="screen-actions">
          <PixelButton
            className="wide"
            disabled={!dirty || delve.busy || cards.length > 3}
            onClick={() => {
              void delve.saveCards(cards);
              setDraft(null);
            }}
          >
            <PixelText text="Save loadout" color={C.ink900} pixelScale={2} />
          </PixelButton>
          {dirty && (
            <PixelButton variant="secondary" onClick={() => setDraft(null)}>
              <PixelText text="Discard" color={C.paper0} pixelScale={2} />
            </PixelButton>
          )}
        </div>
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="deck-title">
        <h2 id="deck-title" className="panel-title">
          <PixelText text="The deck" color={C.paper0} pixelScale={3} />
        </h2>
        <div className="choice-stack">
          {CARDS.map((def) => {
            const open = cardUnlocked(def.id, meta, level);
            const on = cards.includes(def.id);
            return (
              <button
                key={def.id}
                type="button"
                className={on ? 'delve-choice on' : 'delve-choice'}
                aria-pressed={on}
                disabled={!open}
                onClick={() => toggle(def.id)}
              >
                <PixelText
                  text={open ? def.name : `${def.name} · locked`}
                  color={open ? (on ? C.amber1 : C.paper1) : C.paper3}
                  pixelScale={2}
                  wrap={20}
                />
                <PixelText
                  text={
                    open
                      ? `${conditionText(def.condition)} → ${actionText(def.action)}. ${def.effect}`
                      : def.unlock.kind === 'level'
                        ? `Unlocks at companion level ${def.unlock.value}.`
                        : def.unlock.kind === 'hollowClear'
                          ? 'Unlocks by clearing a Hollow once.'
                          : 'Available from the start.'
                  }
                  color={C.paper3}
                  pixelScale={2}
                  wrap={34}
                />
              </button>
            );
          })}
        </div>
      </PixelPanel>
    </main>
  );
}
