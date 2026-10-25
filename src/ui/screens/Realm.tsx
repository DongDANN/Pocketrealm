import { useLiveQuery } from 'dexie-react-hooks';
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { C } from '../../art/palette';
import { cosmeticOverlay, cosmeticSwatch } from '../../art/cosmetics';
import { speciesIdleFrames } from '../../art/species';
import { evolutionStage, speciesByKey } from '../../core/companion';
import { COSMETICS, cosmeticSlot, cosmeticsByKind, type CosmeticKind } from '../../core/cosmetics';
import { BUILDINGS } from '../../core/delve';
import { levelForXp } from '../../core/rewards';
import { buyCosmetic, equipCosmetic, loadCosmeticState } from '../../data/cosmetics';
import { PixelImage } from '../components/PixelImage';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { PixelButton } from '../components/PixelButton';
import { AppHeader } from '../components/AppHeader';
import { LoadingPanel } from '../app/gates';
import { useSession } from '../app/session';
import { useDelve } from '../app/delve';
import { useLedger, useReducedMotionPref } from '../app/hooks';
import { periodForHour, type RealmBuilding } from '../../art/scenes/realm';
import { systemHour } from '../lib/systemContext';
import { say } from '../lib/toast';

/** The diorama pulls the whole art module in behind it, so it is not on the critical path. */
const RealmDiorama = lazy(() =>
  import('../game/RealmDiorama').then((m) => ({ default: m.RealmDiorama })),
);

const KINDS: { kind: CosmeticKind; label: string }[] = [
  { kind: 'hat', label: 'Hats' },
  { kind: 'scarf', label: 'Scarves' },
  { kind: 'color', label: 'Aura colors' },
  { kind: 'realm', label: 'Realm keepsakes' },
];

export function Realm() {
  const { db, ctx } = useSession();
  const delve = useDelve();
  const ledger = useLedger();
  const reducedMotion = useReducedMotionPref();
  const state = useLiveQuery(() => loadCosmeticState(db), [db]);
  const [focus, setFocus] = useState<RealmBuilding | null>(null);
  const [celebrate, setCelebrate] = useState<RealmBuilding | null>(null);
  const clearTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(clearTimer.current), []);

  /** A build is worth one sparkle, not a confetti cannon; it clears itself after a couple of seconds. */
  const flashBuild = (id: RealmBuilding) => {
    setFocus(id);
    setCelebrate(id);
    window.clearTimeout(clearTimer.current);
    clearTimer.current = window.setTimeout(() => setCelebrate(null), 2400);
    document.getElementById(`building-${id}`)?.scrollIntoView({ block: 'center' });
  };

  const levels = delve.snapshot?.meta.buildingLevels ?? {};

  const worn = useMemo(() => {
    const equipped = state?.companion?.equipped ?? {};
    return ['color', 'scarf', 'hat']
      .map((slot) => equipped[slot])
      .filter(Boolean)
      .map((id) => ({ id: id as string, pixmap: cosmeticOverlay(id as string) }))
      .filter((entry) => entry.pixmap !== null);
  }, [state]);

  if (!state) return <LoadingPanel label="Walking the realm" />;

  const companion = state.companion;
  const species = companion ? speciesByKey(companion.speciesKey) : undefined;
  const level = ledger ? levelForXp(ledger.xp).level : 1;
  const base = species ? speciesIdleFrames(species, evolutionStage(level))[0] : undefined;
  const equipped = companion?.equipped ?? {};

  const buy = async (id: string) => {
    const result = await buyCosmetic(db, ctx, id);
    say(result.ok ? 'Bought.' : (result.reason ?? 'Not yet.'), result.ok ? 'reward' : 'warn');
  };

  const wear = async (id: string) => {
    const result = await equipCosmetic(db, id);
    say(
      result.ok ? 'Wardrobe updated.' : (result.reason ?? 'Not yet.'),
      result.ok ? 'reward' : 'warn',
    );
  };

  const unlock = async (id: RealmBuilding) => {
    if ((await delve.unlockBuilding(id))?.ok) flashBuild(id);
  };

  const upgrade = async (id: RealmBuilding) => {
    if ((await delve.upgradeBuilding(id))?.ok) flashBuild(id);
  };

  const lookAt = (id: RealmBuilding) => {
    setFocus(id);
    document.getElementById(`building-${id}`)?.scrollIntoView({ block: 'center' });
  };

  return (
    <main className="shell app-shell">
      <AppHeader title="The Realm" backTo="/delve" />

      <div className="realm-diorama">
        <Suspense fallback={<div className="delve-stage-slot" aria-hidden="true" />}>
          <RealmDiorama
            levels={levels}
            period={periodForHour(systemHour())}
            companion={companion !== null}
            focus={focus}
            celebrate={celebrate}
            reducedMotion={reducedMotion}
            alt="The realm island, drawn with the buildings unlocked so far."
            onSelect={lookAt}
          />
        </Suspense>
      </div>

      <PixelPanel className="delve-panel" tone="paper">
        <div className="realm-scene">
          <div className="realm-avatar">
            {base && <PixelImage pixmap={base} scale={3} alt={companion ? companion.name : ''} />}
            {worn.map(({ id, pixmap }) => (
              <PixelImage key={id} pixmap={pixmap!} scale={3} alt="" className="realm-overlay" />
            ))}
          </div>
          <div className="delve-choice-copy">
            <PixelText
              text={companion ? companion.name : 'No companion yet'}
              color={C.ink800}
              pixelScale={3}
              wrap={18}
            />
            <PixelText
              text={`Lv ${level} · ${state.available} Sparks free · ${state.spent} of ${state.sparks} spent`}
              color={C.ink700}
              pixelScale={2}
              wrap={32}
            />
          </div>
        </div>
        <p className="field-note">
          <PixelText
            text="Cosmetics change how things look. They never change a number in your budget, a quest, or a run. Sparks come from budgeting actions, never from money."
            color={C.ink600}
            pixelScale={2}
            wrap={38}
          />
        </p>
      </PixelPanel>

      {KINDS.map((group) => (
        <PixelPanel className="delve-panel" key={group.kind} aria-labelledby={`cos-${group.kind}`}>
          <h2 id={`cos-${group.kind}`} className="panel-title">
            <PixelText text={group.label} color={C.paper0} pixelScale={3} />
          </h2>
          <div className="shop-grid">
            {cosmeticsByKind(group.kind).map((def) => {
              const owned = state.owned.includes(def.id);
              const slot = cosmeticSlot(def.kind);
              const isWorn = slot !== undefined && equipped[slot] === def.id;
              const canBuy = !owned && state.available >= def.price;
              return (
                <div className={isWorn ? 'shop-card on' : 'shop-card'} key={def.id}>
                  <span className="shop-swatch">
                    <PixelImage pixmap={cosmeticSwatch(def.id)} scale={2} alt="" />
                  </span>
                  <PixelText text={def.name} color={C.paper1} pixelScale={2} wrap={16} />
                  <PixelText text={def.blurb} color={C.paper3} pixelScale={2} wrap={24} />
                  {owned ? (
                    slot === undefined ? (
                      <PixelText text="Keepsake" color={C.moss1} pixelScale={2} />
                    ) : (
                      <PixelButton variant="secondary" onClick={() => void wear(def.id)}>
                        <PixelText
                          text={isWorn ? 'Remove' : 'Wear'}
                          color={C.paper0}
                          pixelScale={2}
                        />
                      </PixelButton>
                    )
                  ) : (
                    <PixelButton
                      variant="secondary"
                      disabled={!canBuy || delve.busy}
                      onClick={() => void buy(def.id)}
                    >
                      <PixelText
                        text={`${def.price} Sparks`}
                        color={canBuy ? C.paper0 : C.paper3}
                        pixelScale={2}
                      />
                    </PixelButton>
                  )}
                </div>
              );
            })}
          </div>
        </PixelPanel>
      ))}

      <PixelPanel className="delve-panel" aria-labelledby="buildings-title">
        <h2 id="buildings-title" className="panel-title">
          <PixelText text="Buildings" color={C.paper0} pixelScale={3} />
        </h2>
        <p className="panel-note">
          <PixelText
            text="A building unlocks from a real budgeting milestone — a savings goal, a weekly review, days of logging. Never from spending less than you need."
            color={C.paper3}
            pixelScale={2}
            wrap={38}
          />
        </p>
        <div className="choice-stack">
          {BUILDINGS.map((def) => {
            const bLevel = levels[def.id] ?? 0;
            const maxed = bLevel >= def.maxLevel;
            const cost = def.cost(Math.max(0, bLevel - 1));
            return (
              <div className="delve-choice" key={def.id} id={`building-${def.id}`}>
                <div className="delve-choice-copy">
                  <PixelText
                    text={`${def.name} · ${bLevel}/${def.maxLevel}`}
                    color={bLevel > 0 ? C.moss1 : C.paper3}
                    pixelScale={2}
                  />
                  <PixelText text={def.effect} color={C.paper3} pixelScale={2} wrap={34} />
                  <PixelText
                    text={
                      bLevel > 0 ? `Milestone met: ${def.milestone}` : `Locked: ${def.milestone}`
                    }
                    color={C.paper2}
                    pixelScale={2}
                    wrap={34}
                  />
                  {bLevel > 0 && !maxed && (
                    <PixelText
                      text={`Upgrade costs ${cost.ore} ore · ${cost.herb} herb · ${cost.echo} echo · ${cost.embers} Embers.`}
                      color={C.paper3}
                      pixelScale={2}
                      wrap={34}
                    />
                  )}
                </div>
                {bLevel === 0 ? (
                  <PixelButton
                    variant="secondary"
                    disabled={delve.busy}
                    onClick={() => void unlock(def.id as RealmBuilding)}
                  >
                    <PixelText text="Unlock" color={C.paper0} pixelScale={2} />
                  </PixelButton>
                ) : (
                  !maxed && (
                    <PixelButton
                      variant="secondary"
                      disabled={delve.busy}
                      onClick={() => void upgrade(def.id as RealmBuilding)}
                    >
                      <PixelText text="Upgrade" color={C.paper0} pixelScale={2} />
                    </PixelButton>
                  )
                )}
              </div>
            );
          })}
        </div>
      </PixelPanel>

      <p className="art-footer">
        <PixelText
          text={`${COSMETICS.length} looks, one shop, no timers. Nothing here is random and nothing here is sold for money.`}
          color={C.paper3}
          pixelScale={2}
          wrap={44}
          align="center"
        />
      </p>
    </main>
  );
}
