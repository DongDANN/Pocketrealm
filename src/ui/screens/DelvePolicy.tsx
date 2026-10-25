import { useState } from 'react';
import { Link } from 'react-router-dom';
import { C } from '../../art/palette';
import { DEFAULT_POLICY, type AutopilotPolicy } from '../../core/delve';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useDelve } from '../app/delve';
import { say } from '../lib/toast';
import { tagLabel } from '../lib/delveView';

const ROUTE_COPY: Record<AutopilotPolicy['route'], string> = {
  safe: 'Rest and shops first. Fewer fights, fewer surprises.',
  balanced: 'Treasure, then fights, then rest. A steady line down.',
  greedy: 'Elites and treasure first. More risk, more Glint.',
};

const MODE_COPY: Record<AutopilotPolicy['mode'], string> = {
  autopilot:
    'Keep going while you are away. The policy answers choices and explains them in the log.',
  camp: 'Camp at the next choice. The run waits for you, and the clock pauses until you answer.',
};

export function DelvePolicy() {
  const delve = useDelve();
  const [draft, setDraft] = useState<AutopilotPolicy>(delve.policy);

  if (delve.loading) return <LoadingPanel label="Reading the Autopilot" />;

  const moveTag = (index: number, direction: -1 | 1) => {
    const next = [...draft.tagPriority];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    const [tag] = next.splice(index, 1);
    next.splice(target, 0, tag!);
    setDraft({ ...draft, tagPriority: next });
  };

  const save = () => {
    delve.setPolicy(draft);
    say('Autopilot policy saved.', 'reward');
  };

  return (
    <main className="shell app-shell">
      <AppHeader title="Autopilot" backTo="/delve" />
      <PixelPanel className="delve-panel" aria-labelledby="mode-title">
        <h2 id="mode-title" className="panel-title">
          <PixelText text="While you are away" color={C.paper0} pixelScale={3} />
        </h2>
        <div className="choice-stack">
          {(['autopilot', 'camp'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={draft.mode === mode ? 'delve-choice on' : 'delve-choice'}
              aria-pressed={draft.mode === mode}
              onClick={() => setDraft({ ...draft, mode })}
            >
              <PixelText
                text={mode === 'autopilot' ? 'Autopilot' : 'Camp at choices'}
                color={draft.mode === mode ? C.amber1 : C.paper1}
                pixelScale={2}
              />
              <PixelText text={MODE_COPY[mode]} color={C.paper3} pixelScale={2} wrap={32} />
            </button>
          ))}
        </div>
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="priority-title">
        <h2 id="priority-title" className="panel-title">
          <PixelText text="Boon priority" color={C.paper0} pixelScale={3} />
        </h2>
        <p className="panel-note">
          <PixelText
            text="Highest first. When a boon offer arrives, the Autopilot takes the first matching tag. Bad luck protection still applies."
            color={C.paper3}
            pixelScale={2}
            wrap={34}
          />
        </p>
        <ol className="priority-list">
          {draft.tagPriority.map((tag, index) => (
            <li key={tag} className="priority-row">
              <span className="priority-rank">
                <PixelText text={`${index + 1}`} color={C.amber2} pixelScale={2} />
              </span>
              <span className="priority-name">
                <PixelText text={tagLabel(tag)} color={C.paper1} pixelScale={2} />
              </span>
              <span className="priority-actions">
                <PixelButton
                  variant="secondary"
                  className="priority-move"
                  aria-label={`Move ${tagLabel(tag)} up`}
                  disabled={index === 0}
                  onClick={() => moveTag(index, -1)}
                >
                  <PixelText text="Up" color={C.paper0} pixelScale={2} />
                </PixelButton>
                <PixelButton
                  variant="secondary"
                  className="priority-move"
                  aria-label={`Move ${tagLabel(tag)} down`}
                  disabled={index === draft.tagPriority.length - 1}
                  onClick={() => moveTag(index, 1)}
                >
                  <PixelText text="Down" color={C.paper0} pixelScale={2} />
                </PixelButton>
              </span>
            </li>
          ))}
        </ol>
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="route-title">
        <h2 id="route-title" className="panel-title">
          <PixelText text="Route" color={C.paper0} pixelScale={3} />
        </h2>
        <div className="choice-stack">
          {(['safe', 'balanced', 'greedy'] as const).map((route) => (
            <button
              key={route}
              type="button"
              className={draft.route === route ? 'delve-choice on' : 'delve-choice'}
              aria-pressed={draft.route === route}
              onClick={() => setDraft({ ...draft, route })}
            >
              <PixelText
                text={route[0]!.toUpperCase() + route.slice(1)}
                color={draft.route === route ? C.amber1 : C.paper1}
                pixelScale={2}
              />
              <PixelText text={ROUTE_COPY[route]} color={C.paper3} pixelScale={2} wrap={32} />
            </button>
          ))}
        </div>
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="retreat-title">
        <h2 id="retreat-title" className="panel-title">
          <PixelText text="Retreat threshold" color={C.paper0} pixelScale={3} />
        </h2>
        <p className="panel-note">
          <PixelText
            text={`Retreat at ${draft.retreatHpPercent}% HP or below. Retreating banks every Ember earned; fainting banks 60%.`}
            color={C.paper3}
            pixelScale={2}
            wrap={34}
          />
        </p>
        <label className="field">
          <span className="field-label">
            <PixelText text={`${draft.retreatHpPercent}%`} color={C.paper1} pixelScale={2} />
          </span>
          <input
            className="delve-range"
            type="range"
            min={0}
            max={100}
            step={5}
            value={draft.retreatHpPercent}
            aria-label="Retreat HP threshold"
            onChange={(event) =>
              setDraft({ ...draft, retreatHpPercent: Number(event.target.value) })
            }
          />
        </label>
      </PixelPanel>

      <div className="screen-actions">
        <PixelButton className="wide" onClick={save}>
          <PixelText text="Save policy" color={C.ink900} pixelScale={2} />
        </PixelButton>
        <PixelButton
          variant="secondary"
          className="wide"
          onClick={() =>
            setDraft({ ...DEFAULT_POLICY, tagPriority: [...DEFAULT_POLICY.tagPriority] })
          }
        >
          <PixelText text="Reset to the shipped policy" color={C.paper0} pixelScale={2} />
        </PixelButton>
      </div>
      <p className="panel-note">
        <PixelText
          text="Read the Habit Cards editor next: cards decide which skill fires in a fight. "
          color={C.paper3}
          pixelScale={2}
          wrap={40}
        />
        <Link className="text-link" to="/delve/cards">
          <PixelText text="Open Habit Cards" color={C.amber2} pixelScale={2} />
        </Link>
      </p>
    </main>
  );
}
