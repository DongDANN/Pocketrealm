import { useLiveQuery } from 'dexie-react-hooks';
import { C } from '../../art/palette';
import { ACHIEVEMENTS } from '../../core/achievements';
import { listAchievements } from '../../data/repos';
import { AppHeader } from '../components/AppHeader';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useSession } from '../app/session';

function dayLabel(ms?: number): string {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function Achievements() {
  const { db } = useSession();
  const rows = useLiveQuery(() => listAchievements(db), [db]);

  if (!rows) return <LoadingPanel label="Reading the hall" />;

  const earned = new Map(rows.map((row) => [row.id, row.unlockedAt]));

  return (
    <main className="shell app-shell">
      <AppHeader title="Achievements" backTo="/quests" />

      <PixelPanel className="delve-panel" aria-labelledby="ach-title">
        <div className="panel-head">
          <h2 id="ach-title" className="panel-title">
            <PixelText text="Hall of small wins" color={C.paper0} pixelScale={3} wrap={11} />
          </h2>
          <span className="delve-badge">
            <PixelText
              text={`${earned.size}/${ACHIEVEMENTS.length}`}
              color={C.amber2}
              pixelScale={2}
            />
          </span>
        </div>
        <p className="panel-note">
          <PixelText
            text="Each one is met by doing the thing, not by paying. They are already granted on the day you meet them; nothing here needs claiming."
            color={C.paper3}
            pixelScale={2}
            wrap={38}
          />
        </p>
        <div className="shop-grid">
          {ACHIEVEMENTS.map((def) => {
            const at = earned.get(def.id);
            return (
              <div className={at ? 'shop-card on' : 'shop-card'} key={def.id}>
                <PixelText
                  text={def.name}
                  color={at ? C.moss1 : C.paper3}
                  pixelScale={2}
                  wrap={18}
                />
                <PixelText text={def.copy} color={C.paper3} pixelScale={2} wrap={26} />
                <PixelText
                  text={
                    at
                      ? `Earned ${dayLabel(at)} · ${def.xp} XP, ${def.sparks} Sparks`
                      : `Worth ${def.xp} XP and ${def.sparks} Sparks`
                  }
                  color={at ? C.amber2 : C.paper2}
                  pixelScale={2}
                  wrap={26}
                />
              </div>
            );
          })}
        </div>
      </PixelPanel>
    </main>
  );
}
