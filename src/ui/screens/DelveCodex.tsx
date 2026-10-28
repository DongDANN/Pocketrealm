import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { C } from '../../art/palette';
import {
  BOSSES,
  codexProgress,
  ELITES,
  ENEMIES,
  masteryDamagePct,
  masteryLevel,
  MASTERY_XP_PER_KILL,
  MAX_MASTERY_LEVEL,
  type DelveMeta,
  type EnemyDef,
} from '../../core/delve';
import { CODEX_COSMETIC_ID } from '../../core/cosmetics';
import { claimCodexCosmetic } from '../../data/cosmetics';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { FatalPanel, LoadingPanel } from '../app/gates';
import { useDelve } from '../app/delve';
import { useSession } from '../app/session';
import { skillLibrary, tierColor } from '../lib/delveCollection';
import { say } from '../lib/toast';

const GROUPS: { label: string; rows: readonly EnemyDef[] }[] = [
  { label: 'Rootfall Warren', rows: ENEMIES.filter((e) => e.hollow === 1) },
  { label: 'Cinder Vault', rows: ENEMIES.filter((e) => e.hollow === 2) },
  { label: 'Umbral Deep', rows: ENEMIES.filter((e) => e.hollow === 3) },
  { label: 'Elites', rows: ELITES },
  { label: 'Bosses', rows: BOSSES },
];

const SHELF_TABS: readonly { id: 'species' | 'skills'; label: string }[] = [
  { id: 'species', label: 'Species' },
  { id: 'skills', label: 'Skills' },
];

export function DelveCodex() {
  const delve = useDelve();
  const { db } = useSession();
  const [tab, setTab] = useState<'species' | 'skills'>('species');
  const owned = useLiveQuery(async () => {
    const companion = await db.companions.toCollection().first();
    return companion?.cosmetics ?? [];
  }, [db]);

  if (delve.loading) return <LoadingPanel label="Dusting the shelves" />;
  if (delve.problem) return <FatalPanel message={delve.problem} />;
  const snapshot = delve.snapshot;
  if (!snapshot) return <LoadingPanel label="Dusting the shelves" />;

  const meta = snapshot.meta;
  const progress = codexProgress(meta);
  const keepsakeOwned = (owned ?? []).includes(CODEX_COSMETIC_ID);

  const claim = async () => {
    const result = await claimCodexCosmetic(db);
    say(
      result.ok ? 'The Codex Sage is yours.' : (result.reason ?? 'Not yet.'),
      result.ok ? 'reward' : 'warn',
    );
  };

  return (
    <main className="shell app-shell">
      <AppHeader title="Codex" backTo="/delve" />

      <PixelPanel className="delve-panel" tone="paper">
        <div className="delve-wallet">
          <span>
            <PixelText
              text={`${progress.seen}/${progress.total} species sighted`}
              color={C.ink800}
              pixelScale={2}
            />
          </span>
          <span>
            <PixelText
              text={`+${masteryDamagePct(Object.values(meta.mastery ?? {}).reduce((a, b) => a + b, 0))}% mastery damage`}
              color={C.ink700}
              pixelScale={2}
            />
          </span>
        </div>
        <p className="field-note">
          <PixelText
            text={`Every kill teaches ${MASTERY_XP_PER_KILL} mastery for that species. Level 2 reveals its weakness, level 3 its lore. Nothing here is bought.`}
            color={C.ink600}
            pixelScale={2}
            wrap={38}
          />
        </p>
        {progress.complete && !keepsakeOwned && (
          <PixelButton variant="secondary" onClick={() => void claim()}>
            <PixelText text="Claim the Codex Sage" color={C.paper0} pixelScale={2} />
          </PixelButton>
        )}
        {keepsakeOwned && (
          <p className="panel-note">
            <PixelText text="Codex Sage keepsake owned." color={C.moss1} pixelScale={2} />
          </p>
        )}
      </PixelPanel>

      <div className="chip-row" role="tablist" aria-label="Codex">
        {SHELF_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'chip on' : 'chip'}
            onClick={() => setTab(item.id)}
          >
            <PixelText text={item.label} color={C.paper1} pixelScale={2} />
          </button>
        ))}
      </div>

      {tab === 'species' &&
        GROUPS.map((group) => (
          <PixelPanel
            className="delve-panel"
            key={group.label}
            aria-labelledby={`codex-${group.label}`}
          >
            <h2 id={`codex-${group.label}`} className="panel-title">
              <PixelText text={group.label} color={C.paper0} pixelScale={3} />
            </h2>
            {group.rows.map((def) => {
              const xp = meta.mastery?.[def.id] ?? 0;
              const level = masteryLevel(xp);
              const seen = meta.codex?.includes(def.id) === true;
              const studied = meta.bossKnowledge?.includes(def.id) === true;
              if (!seen) return null;
              return (
                <div className="codex-row" key={def.id}>
                  <div className="delve-choice-copy">
                    <PixelText text={def.name} color={C.paper1} pixelScale={2} />
                    <PixelText
                      text={
                        level >= 3
                          ? `${def.lore} Weak to ${def.weakness}, resists ${def.resistance}.`
                          : level >= 2
                            ? `Weak to ${def.weakness}, resists ${def.resistance}. Mastery ${level}/${MAX_MASTERY_LEVEL}.`
                            : `Sighted. Mastery ${level}/${MAX_MASTERY_LEVEL} — ${xp} XP. Stats still hidden.`
                      }
                      color={C.paper3}
                      pixelScale={2}
                      wrap={36}
                    />
                    {studied && (
                      <PixelText
                        text="Studied: its phases and tells are recorded."
                        color={C.cyan2}
                        pixelScale={2}
                        wrap={34}
                      />
                    )}
                  </div>
                  <span className="delve-badge">
                    <PixelText text={`M${level}`} color={C.amber2} pixelScale={2} />
                  </span>
                </div>
              );
            })}
            {/* One line for the whole shelf of ???: identical filler made the page unreadable. */}
            {group.rows.some((def) => meta.codex?.includes(def.id) !== true) && (
              <p className="panel-note">
                <PixelText
                  text={`${group.rows.filter((def) => meta.codex?.includes(def.id) !== true).length} not sighted yet. Each appears here the first time you meet it.`}
                  color={C.paper3}
                  pixelScale={2}
                  wrap={36}
                />
              </p>
            )}
          </PixelPanel>
        ))}
      {tab === 'skills' && <SkillShelves meta={meta} />}
    </main>
  );
}

/**
 * The skills shelves.
 *
 * An entry the book has never been handed is counted and not named — the same rule the species shelves
 * follow — so the Codex reports the collection without becoming a checklist of what to farm for.
 */
function SkillShelves({ meta }: { meta: DelveMeta }) {
  const library = skillLibrary(meta);
  return (
    <>
      <PixelPanel className="delve-panel" tone="paper">
        <div className="delve-wallet">
          <span>
            <PixelText
              text={`${library.discovered}/${library.total} skills recorded`}
              color={C.ink800}
              pixelScale={2}
            />
          </span>
        </div>
        <p className="field-note">
          <PixelText
            text="Commons reach these shelves the moment the companion learns one; every tier above arrives in a capsule. Levels are raised with Skill Dust in the Workshop, never bought."
            color={C.ink600}
            pixelScale={2}
            wrap={38}
          />
        </p>
      </PixelPanel>
      {library.groups.map((group) => {
        const missing = group.count - group.discovered;
        return (
          <PixelPanel
            className="delve-panel"
            key={group.rarity}
            aria-labelledby={`codex-${group.rarity}`}
          >
            <div className="panel-head">
              <h2 id={`codex-${group.rarity}`} className="panel-title">
                <PixelText text={group.label} color={C.paper0} pixelScale={3} />
              </h2>
              <span className="delve-badge">
                <PixelText
                  text={`${group.discovered}/${group.count}`}
                  color={tierColor(group.rarity)}
                  pixelScale={2}
                />
              </span>
            </div>
            {group.rows.map((row) => {
              const chain = [row.tag, row.element].filter((part) => part !== '').join(' · ');
              return (
                <div className="codex-row" key={row.id}>
                  <div className="delve-choice-copy">
                    <PixelText
                      text={row.name}
                      color={tierColor(group.rarity)}
                      pixelScale={2}
                      wrap={24}
                    />
                    <PixelText
                      text={`${row.tierLabel} ${row.kind.toLowerCase()}${chain ? ` · ${chain}` : ''}`}
                      color={C.paper1}
                      pixelScale={2}
                    />
                    <PixelText text={row.effect} color={C.paper3} pixelScale={2} wrap={36} />
                    {row.level5 !== '' && (
                      <PixelText text={row.level5} color={C.cyan2} pixelScale={2} wrap={34} />
                    )}
                    <PixelText
                      text={`LV${row.level} · ${row.usesLine}${row.known ? ' · Known.' : ' · In the book, not known.'}`}
                      color={C.paper2}
                      pixelScale={2}
                      wrap={36}
                    />
                  </div>
                  {row.known && (
                    <span className="delve-badge">
                      <PixelText text={`LV${row.level}`} color={C.amber2} pixelScale={2} />
                    </span>
                  )}
                </div>
              );
            })}
            {missing > 0 && (
              <p className="panel-note">
                <PixelText
                  text={`${missing} not recorded yet. Each appears here the first time ${
                    group.rarity === 'common'
                      ? 'the companion learns it'
                      : 'a capsule hands it over'
                  }.`}
                  color={C.paper3}
                  pixelScale={2}
                  wrap={36}
                />
              </p>
            )}
          </PixelPanel>
        );
      })}
    </>
  );
}
