import { useLiveQuery } from 'dexie-react-hooks';
import { C } from '../../art/palette';
import { listDelveHistory } from '../../data/delve';
import { hollowName, resultLabel } from '../lib/delveView';
import { AppHeader } from '../components/AppHeader';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { FatalPanel, LoadingPanel } from '../app/gates';
import { useDelve } from '../app/delve';
import { useSession } from '../app/session';

function dayLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function DelveHistory() {
  const { db } = useSession();
  const delve = useDelve();
  const rows = useLiveQuery(() => listDelveHistory(db, 50), [db]);

  if (delve.problem) return <FatalPanel message={delve.problem} />;
  if (!rows) return <LoadingPanel label="Reading the chronicle" />;

  return (
    <main className="shell app-shell">
      <AppHeader title="Run history" backTo="/delve" />

      <PixelPanel className="delve-panel" aria-labelledby="history-title">
        <h2 id="history-title" className="panel-title">
          <PixelText text="Chronicle" color={C.paper0} pixelScale={3} />
        </h2>
        {rows.length === 0 && (
          <p className="panel-note">
            <PixelText
              text="No runs yet. The first entry appears the moment a run ends."
              color={C.paper3}
              pixelScale={2}
              wrap={36}
            />
          </p>
        )}
        {rows.map((row) => (
          <div className="codex-row" key={row.runId}>
            <div className="delve-choice-copy">
              <PixelText
                text={`${resultLabel(row.result)} · ${hollowName(row.hollowId)} · Floor ${row.floor}`}
                color={row.result === 'cleared' ? C.moss1 : C.paper1}
                pixelScale={2}
                wrap={30}
              />
              <PixelText
                text={`${row.rooms} rooms · ${row.embersEarned} Embers · ${dayLabel(row.updatedAt)}${
                  row.daily ? ' · Daily Challenge' : ''
                }${row.heat > 0 ? ` · Heat ${row.heat}` : ''}`}
                color={C.paper3}
                pixelScale={2}
                wrap={36}
              />
            </div>
          </div>
        ))}
      </PixelPanel>

      <p className="art-footer">
        <PixelText
          text="History is a record, not a scoreboard. Nothing here compares you to anyone, and no run changes your budget."
          color={C.paper3}
          pixelScale={2}
          wrap={44}
          align="center"
        />
      </p>
    </main>
  );
}
