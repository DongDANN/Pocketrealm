import { C } from '../../art/palette';
import { CONSUMABLE_SLOTS, CONSUMABLES, emberCraftCost } from '../../core/delve';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { FatalPanel, LoadingPanel } from '../app/gates';
import { useDelve } from '../app/delve';

export function DelveWorkshop() {
  const delve = useDelve();

  if (delve.loading) return <LoadingPanel label="Opening the crate" />;
  if (delve.problem) return <FatalPanel message={delve.problem} />;
  const snapshot = delve.snapshot;
  if (!snapshot) return <LoadingPanel label="Opening the crate" />;

  const meta = snapshot.meta;
  const equipped = meta.equippedConsumables ?? [];

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
            <PixelText text={`${meta.embers} Embers`} color={C.ink800} pixelScale={2} />
          </span>
        </div>
        <p className="field-note">
          <PixelText
            text="Materials drop from rooms you actually clear. Crafting costs materials and Embers — never oil, never money."
            color={C.ink600}
            pixelScale={2}
            wrap={38}
          />
        </p>
      </PixelPanel>

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
                  onClick={() => void (isEquipped ? delve.unequip(def.id) : delve.equip(def.id))}
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
    </main>
  );
}
