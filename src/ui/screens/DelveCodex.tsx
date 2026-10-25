import { useLiveQuery } from 'dexie-react-hooks';
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
import { say } from '../lib/toast';

const GROUPS: { label: string; rows: readonly EnemyDef[] }[] = [
  { label: 'Rootfall Warren', rows: ENEMIES.filter((e) => e.hollow === 1) },
  { label: 'Cinder Vault', rows: ENEMIES.filter((e) => e.hollow === 2) },
  { label: 'Umbral Deep', rows: ENEMIES.filter((e) => e.hollow === 3) },
  { label: 'Elites', rows: ELITES },
  { label: 'Bosses', rows: BOSSES },
];

export function DelveCodex() {
  const delve = useDelve();
  const { db } = useSession();
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

      {GROUPS.map((group) => (
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
    </main>
  );
}
