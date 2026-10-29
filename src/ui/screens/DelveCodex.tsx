import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { C } from '../../art/palette';
import { enemyFrames } from '../../art/critters';
import {
  codexProgress,
  masteryDamagePct,
  MASTERY_XP_PER_KILL,
  MAX_MASTERY_LEVEL,
  type DelveMeta,
} from '../../core/delve';
import { CODEX_COSMETIC_ID } from '../../core/cosmetics';
import { claimCodexCosmetic } from '../../data/cosmetics';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
import { PixelImage } from '../components/PixelImage';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { FatalPanel, LoadingPanel } from '../app/gates';
import { useDelve } from '../app/delve';
import { useSession } from '../app/session';
import { skillLibrary, tierColor } from '../lib/delveCollection';
import { dexBoard, type DexBoard, type DexEntry } from '../lib/delveMenus';
import { say } from '../lib/toast';

const SHELF_TABS: readonly { id: 'species' | 'skills'; label: string }[] = [
  { id: 'species', label: 'Species' },
  { id: 'skills', label: 'Skills' },
];

/** A page's window: the sprite once the species is sighted, a question mark until then. */
function DexArt({ entry }: { entry: DexEntry }) {
  const frames = entry.sighted ? enemyFrames(entry.id) : null;
  return (
    <span className="dex-art-slot">
      {frames ? (
        <PixelImage pixmap={frames.idle[0]!} scale={2} alt="" className="dex-art" />
      ) : (
        <PixelText text="?" color={C.paper2} pixelScale={3} />
      )}
    </span>
  );
}

/**
 * The species dex: one numbered tile per species, and the selected page above the grid.
 *
 * The whole shelf is visible, sighted or not — a tile the book has never met prints `???` and keeps
 * its species name off the page and off its accessible name, so the shelf counts what is missing
 * without handing out a list to farm.
 */
function PokedexPanel({
  board,
  selected,
  onPick,
}: {
  board: DexBoard;
  selected: DexEntry;
  onPick: (id: string) => void;
}) {
  const unseen = board.total - board.seen;
  return (
    <>
      <PixelPanel className="delve-panel" aria-labelledby="dex-detail-title">
        <div className="panel-head">
          <h2 id="dex-detail-title" className="panel-title">
            <PixelText text={selected.label} color={C.paper0} pixelScale={3} />
          </h2>
          <span className="delve-badge">
            <PixelText text={selected.group} color={C.paper2} pixelScale={2} />
          </span>
        </div>
        <div className="dex-detail-head">
          <DexArt entry={selected} />
          <div className="dex-detail-copy">
            <PixelText
              text={selected.name}
              color={selected.sighted ? C.amber1 : C.paper3}
              pixelScale={2}
              wrap={20}
            />
            {selected.sighted && (
              <span className="delve-badge">
                <PixelText text={`M${selected.masteryLevel}`} color={C.amber2} pixelScale={2} />
              </span>
            )}
            <PixelText text={selected.detail} color={C.paper3} pixelScale={2} wrap={32} />
            {selected.sighted && (
              <PixelText
                text={`Mastery ${selected.masteryLevel}/${MAX_MASTERY_LEVEL}. Level 2 reveals its weakness, level 3 its lore.`}
                color={C.paper2}
                pixelScale={2}
                wrap={32}
              />
            )}
            {selected.studied && (
              <PixelText
                text="Studied: its phases and tells are recorded."
                color={C.cyan2}
                pixelScale={2}
                wrap={32}
              />
            )}
          </div>
        </div>
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="dex-grid-title">
        <div className="panel-head">
          <h2 id="dex-grid-title" className="panel-title">
            <PixelText text="Species" color={C.paper0} pixelScale={3} />
          </h2>
          <span className="delve-badge">
            <PixelText text={`${board.seen}/${board.total}`} color={C.amber2} pixelScale={2} />
          </span>
        </div>
        {unseen > 0 && (
          <p className="panel-note">
            <PixelText
              text={`${unseen} not sighted yet. Each page fills in the first time you meet its species.`}
              color={C.paper3}
              pixelScale={2}
              wrap={36}
            />
          </p>
        )}
        {board.groups.map((group) => (
          <section className="dex-group" key={group.key} aria-label={group.label}>
            <div className="dex-group-head">
              <h3 className="dex-group-title">
                <PixelText text={group.label} color={C.paper1} pixelScale={2} />
              </h3>
              <span className="delve-badge">
                <PixelText text={`${group.seen}/${group.total}`} color={C.paper2} pixelScale={2} />
              </span>
            </div>
            <div className="dex-grid">
              {group.entries.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={[
                    'dex-cell',
                    entry.sighted ? 'on' : '',
                    selected.id === entry.id ? 'picked' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-pressed={selected.id === entry.id}
                  aria-label={entry.aria}
                  onClick={() => onPick(entry.id)}
                >
                  <PixelText text={entry.label} color={C.paper2} pixelScale={2} />
                  <DexArt entry={entry} />
                  {entry.sighted ? (
                    <span className="delve-badge">
                      <PixelText text={entry.badge} color={C.amber2} pixelScale={2} />
                    </span>
                  ) : (
                    <PixelText text="???" color={C.paper3} pixelScale={2} />
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </PixelPanel>
    </>
  );
}

export function DelveCodex() {
  const delve = useDelve();
  const { db } = useSession();
  const [tab, setTab] = useState<'species' | 'skills'>('species');
  const [picked, setPicked] = useState<string | null>(null);
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
  const dex = dexBoard(meta);
  const selected =
    dex.entries.find((entry) => entry.id === picked) ??
    dex.entries.find((entry) => entry.id === dex.firstId) ??
    dex.entries[0]!;

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

      {tab === 'species' && <PokedexPanel board={dex} selected={selected} onPick={setPicked} />}
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
