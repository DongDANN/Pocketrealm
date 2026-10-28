import { useState } from 'react';
import { Link } from 'react-router-dom';
import { C } from '../../art/palette';
import {
  BUILDS,
  buildById,
  buildUnlocked,
  FORGE_NODES,
  NODE_COSTS,
  type BuildId,
  type ForgeLevels,
} from '../../core/delve';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { FatalPanel, LoadingPanel } from '../app/gates';
import { useDelve } from '../app/delve';

const STAT_LABEL: Record<string, string> = {
  maxHp: 'Max HP',
  atk: 'ATK',
  def: 'DEF',
  luck: 'LUCK',
  startGlint: 'Start Glint',
  embersBonus: 'Ember bonus',
  oilCapacity: 'Oil capacity',
  rerolls: 'Rerolls',
};

function forgeLevel(levels: ForgeLevels, id: string): number {
  return (levels as Record<string, number>)[id] ?? 0;
}

export function DelveForge() {
  const delve = useDelve();
  const [tab, setTab] = useState<'forge' | BuildId>('forge');

  if (delve.loading) return <LoadingPanel label="Heating the anvil" />;
  if (delve.problem) return <FatalPanel message={delve.problem} />;
  const snapshot = delve.snapshot;
  if (!snapshot) return <LoadingPanel label="Heating the anvil" />;

  const meta = snapshot.meta;
  const level = snapshot.companionLevel;
  const buildTab = tab === 'forge' ? null : buildById(tab);

  return (
    <main className="shell app-shell">
      <AppHeader title="Forge" backTo="/delve" />

      <PixelPanel className="delve-panel" tone="paper">
        <div className="delve-wallet">
          <span>
            <PixelText text={`${meta.embers} Embers`} color={C.ink800} pixelScale={2} />
          </span>
          <span>
            <PixelText
              text={`Respec refunds every Ember you spent.`}
              color={C.ink600}
              pixelScale={2}
              wrap={32}
            />
          </span>
        </div>
      </PixelPanel>

      <div className="chip-row" role="tablist" aria-label="Progression">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'forge'}
          className={tab === 'forge' ? 'chip on' : 'chip'}
          onClick={() => setTab('forge')}
        >
          <PixelText text="Forge" color={C.paper1} pixelScale={2} />
        </button>
        {BUILDS.map((build) => (
          <button
            key={build.id}
            type="button"
            role="tab"
            aria-selected={tab === build.id}
            className={tab === build.id ? 'chip on' : 'chip'}
            disabled={!buildUnlocked(build.id, meta, level)}
            onClick={() => setTab(build.id)}
          >
            <PixelText
              text={buildUnlocked(build.id, meta, level) ? build.name : `${build.name} (locked)`}
              color={C.paper1}
              pixelScale={2}
            />
          </button>
        ))}
      </div>

      {tab === 'forge' && (
        <PixelPanel className="delve-panel" aria-labelledby="forge-title">
          <h2 id="forge-title" className="panel-title">
            <PixelText text="Permanent upgrades" color={C.paper0} pixelScale={3} />
          </h2>
          <p className="panel-note">
            <PixelText
              text="Embers come only from runs. Nothing here is bought with money, and nothing here is ever lost to a faint."
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
          <div className="choice-stack">
            {FORGE_NODES.map((node) => {
              const current = forgeLevel(meta.forge, node.id);
              const maxed = current >= node.maxLevel;
              const cost = maxed ? 0 : node.cost(current);
              const canBuy = !maxed && meta.embers >= cost;
              return (
                <div className="delve-choice" key={node.id}>
                  <div className="delve-choice-copy">
                    <PixelText
                      text={`${node.name} · ${current}/${node.maxLevel}`}
                      color={C.amber1}
                      pixelScale={2}
                    />
                    <PixelText
                      text={`${node.blurb}. ${STAT_LABEL[node.effect.stat] ?? node.effect.stat}.`}
                      color={C.paper3}
                      pixelScale={2}
                      wrap={32}
                    />
                  </div>
                  <PixelButton
                    variant="secondary"
                    disabled={!canBuy || delve.busy}
                    onClick={() => void delve.buyForge(node.id)}
                  >
                    <PixelText
                      text={maxed ? 'Maxed' : `${cost} Embers`}
                      color={C.paper0}
                      pixelScale={2}
                    />
                  </PixelButton>
                </div>
              );
            })}
          </div>
        </PixelPanel>
      )}

      {buildTab && (
        <PixelPanel className="delve-panel" aria-labelledby="tree-title">
          <div className="panel-head">
            <h2 id="tree-title" className="panel-title">
              <PixelText text={`${buildTab.name} talents`} color={C.paper0} pixelScale={3} />
            </h2>
            <PixelButton
              variant="secondary"
              disabled={delve.busy}
              onClick={() => void delve.respec(buildTab.id)}
            >
              <PixelText text="Respec" color={C.paper0} pixelScale={2} />
            </PixelButton>
          </div>
          <p className="panel-note">
            <PixelText
              text={`Seeds ${buildTab.skills.map((s) => `${s.name} — ${s.effect}`).join(' · ')}. The four slots a run actually swings are set in the Workshop.`}
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
          {buildTab.treeBranches.map((branch) => {
            const learned = meta.builds[buildTab.id]?.tree ?? [];
            return (
              <div key={branch.id} className="tree-branch">
                <p className="delve-subtitle">
                  <PixelText text={branch.name} color={C.amber2} pixelScale={2} />
                </p>
                <div className="choice-stack">
                  {branch.nodes.map((node, index) => {
                    const owned = learned.includes(node.id);
                    const earlierMissing = branch.nodes
                      .slice(0, index)
                      .some((n) => !learned.includes(n.id));
                    const cost = NODE_COSTS[index] ?? 20;
                    return (
                      <div className="delve-choice" key={node.id}>
                        <div className="delve-choice-copy">
                          <PixelText
                            text={`${node.name}${owned ? ' · learned' : ''}`}
                            color={owned ? C.moss1 : C.paper1}
                            pixelScale={2}
                            wrap={26}
                          />
                          <PixelText
                            text={
                              owned
                                ? node.effect
                                : earlierMissing
                                  ? `Locked until the ${index} earlier node${index === 1 ? '' : 's'} in this branch ${index === 1 ? 'is' : 'are'} learned.`
                                  : `${node.effect} Costs ${cost} Embers.`
                            }
                            color={C.paper3}
                            pixelScale={2}
                            wrap={34}
                          />
                        </div>
                        {!owned && (
                          <PixelButton
                            variant="secondary"
                            disabled={delve.busy || earlierMissing || meta.embers < cost}
                            onClick={() => void delve.buyTree(buildTab.id, node.id)}
                          >
                            <PixelText text={`${cost}`} color={C.paper0} pixelScale={2} />
                          </PixelButton>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <p className="panel-note">
            <PixelText
              text={`Spent here: ${meta.builds[buildTab.id]?.spent ?? 0} Embers. Respec returns all of it and takes no fee.`}
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
        </PixelPanel>
      )}

      <div className="screen-actions">
        <Link className="text-link" to="/delve">
          <PixelText text="Back to the Hollow" color={C.amber2} pixelScale={2} />
        </Link>
        <Link className="text-link" to="/delve/workshop">
          <PixelText text="Workshop →" color={C.amber2} pixelScale={2} />
        </Link>
      </div>
    </main>
  );
}
