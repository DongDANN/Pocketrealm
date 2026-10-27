import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { C } from '../../art/palette';
import {
  BUILDS,
  buildUnlocked,
  computeBuffs,
  consumableById,
  dailyHollow,
  heatUnlocked,
  hollowUnlocked,
  HOLLOW_FLOORS,
  anyBoonById,
  relicById,
  type BuildId,
  type HollowId,
  type RunState,
} from '../../core/delve';
import type { DelveRunResult } from '../../data/delve';
import { AppHeader } from '../components/AppHeader';
import { Gauge } from '../components/Gauge';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { FatalPanel, LoadingPanel } from '../app/gates';
import { useDelve } from '../app/delve';
import { useLedger, useReducedMotionPref } from '../app/hooks';
import {
  HOLLOWS,
  currentRoomKind,
  hollowName,
  hpPercent,
  resultLabel,
  roomKindChip,
  roomKindLabel,
  upcomingRooms,
} from '../lib/delveView';
import { cuesForRun, musicTrackFor } from '../lib/delveSound';
import { encounterOf, sceneActionFor, type SceneAction } from '../lib/delveScene';
import { recapOf, roomSwings, roomThreats } from '../lib/delveReadout';
import { playSfx, playStinger, requestMusic } from '../lib/sound';

/** The Canvas stage is a bonus, not a dependency: it is fetched only while a run is on screen. */
const BattleScene = lazy(() =>
  import('../game/BattleScene').then((m) => ({ default: m.BattleScene })),
);

function buffCopy(run: RunState, metaLevel: number): string {
  return `${run.unit.name} · Lv ${metaLevel} · Heat ${run.heat}`;
}

function boonLabel(run: RunState, id: string): string {
  const def = anyBoonById(id);
  const level = run.boonLevels[id] ?? 1;
  if (!def) return `${id} Lv${level}`;
  return `${def.name} Lv${level} · ${def.tag}`;
}

export function Delve() {
  const delve = useDelve();
  const ledger = useLedger();
  const [hollow, setHollow] = useState<HollowId>(1);
  const [buildId, setBuildId] = useState<BuildId>('warden');
  const [heat, setHeat] = useState(0);
  const [confirmRetreat, setConfirmRetreat] = useState(false);
  const [showAllLog, setShowAllLog] = useState(false);
  const reducedMotion = useReducedMotionPref();
  /** One beat per resolved step, plus the enemy that beat is about. */
  const [beat, setBeat] = useState<{
    action: SceneAction;
    enemyId: string | null;
    big: boolean;
  } | null>(null);
  const beatToken = useRef(0);

  const snapshot = delve.snapshot;
  const buffs = useMemo(() => (snapshot ? computeBuffs(snapshot.signals) : null), [snapshot]);

  const runForMusic = snapshot?.active ?? null;
  const musicTrack = musicTrackFor(runForMusic, !runForMusic && delve.lastEnded !== null);
  useEffect(() => {
    requestMusic(musicTrack);
    return () => requestMusic(null);
  }, [musicTrack]);

  if (delve.loading) return <LoadingPanel label="Lighting the lantern" />;
  if (delve.problem) return <FatalPanel message={delve.problem} />;
  if (!snapshot) return <LoadingPanel label="Lighting the lantern" />;

  const meta = snapshot.meta;
  const active = snapshot.active;
  const run = active;
  const companionLevel = snapshot.companionLevel;
  const daily = meta.daily ?? { date: '', played: false };
  const dailyDone = daily.date === snapshot.today && daily.played;
  const dailyHollowId = dailyHollow(snapshot.today);
  const oilReady = snapshot.oil > 0;
  const selectedHollowOpen = hollowUnlocked(hollow, meta, companionLevel);
  const selectedBuildOpen = buildUnlocked(buildId, meta, companionLevel);
  const heatOpen = heatUnlocked(meta, hollow);
  const sparks = ledger?.sparks ?? 0;

  /**
   * The room read as numbers, from the engine's own functions: what stands in front of us, what it is
   * about to do, what one of our swings costs it, and what the last step actually dealt.
   */
  const threats = run ? roomThreats(run, meta, snapshot.signals) : [];
  const swings = run ? roomSwings(run, meta, snapshot.signals) : [];
  const recap = run ? recapOf(run.log) : { rows: [], omitted: 0 };

  /** The engine already decided what happened in this action; the sounds only say it out loud. */
  const voice = (result: DelveRunResult | null) => {
    if (!result) return;
    if (!result.ok) {
      playSfx('error');
      return;
    }
    for (const cue of cuesForRun(run, result.run)) {
      if (cue.kind === 'stinger') playStinger(cue.id);
      else playSfx(cue.name);
    }
    const after = result.run;
    const action = after ? sceneActionFor(run, after, ++beatToken.current) : null;
    if (!action || !after) {
      setBeat(null);
      return;
    }
    // A faint belongs to the enemy that was just standing there, not the one in the room after it.
    const shown = action.kind === 'enemyFaint' && run ? encounterOf(run) : encounterOf(after);
    setBeat({ action, enemyId: shown.enemyId, big: shown.boss });
  };

  const start = async () => {
    const result = await delve.start(hollow, buildId, heat);
    voice(result);
    if (result?.ok) setConfirmRetreat(false);
  };

  const startDaily = async () => {
    const result = await delve.startDaily();
    voice(result);
    if (result?.ok) setConfirmRetreat(false);
  };

  const stepRun = async () => {
    voice(await delve.step());
  };

  const chooseOption = async (optionId: string) => {
    voice(await delve.choose(optionId));
  };

  const retreatRun = async () => {
    voice(await delve.retreat());
    setConfirmRetreat(false);
  };

  const catchUpPanel = delve.catchUp && (
    <PixelPanel className="delve-panel catchup-panel" aria-labelledby="catchup-title">
      <div className="panel-head">
        <h2 id="catchup-title" className="panel-title">
          <PixelText text="While you were away" color={C.paper0} pixelScale={3} />
        </h2>
        <PixelButton variant="secondary" onClick={delve.dismissCatchUp}>
          <PixelText text="Dismiss" color={C.paper0} pixelScale={2} />
        </PixelButton>
      </div>
      {delve.catchUp.ran ? (
        <p>
          <PixelText
            text={`${delve.catchUp.steps} steps · ${delve.catchUp.rooms} rooms · ${delve.catchUp.choices} choices answered · ${delve.catchUp.oilSpent} oil spent.`}
            color={C.paper2}
            pixelScale={2}
            wrap={36}
          />
        </p>
      ) : (
        <p>
          <PixelText
            text="The run stopped at a choice and waited for you. The clock is paused."
            color={C.paper2}
            pixelScale={2}
            wrap={36}
          />
        </p>
      )}
      <div className="stat-grid">
        <span>
          <PixelText
            text={`Floor ${delve.catchUp.fromFloor} → ${delve.catchUp.toFloor}`}
            color={C.paper1}
            pixelScale={2}
          />
        </span>
        <span>
          <PixelText
            text={`+${delve.catchUp.embersBanked} Embers`}
            color={C.amber2}
            pixelScale={2}
          />
        </span>
        <span>
          <PixelText
            text={`Ore ${delve.catchUp.materials.ore} · Herb ${delve.catchUp.materials.herb} · Echo ${delve.catchUp.materials.echo}`}
            color={C.paper2}
            pixelScale={2}
          />
        </span>
        <span>
          <PixelText
            text={`Glint ${delve.catchUp.glint >= 0 ? '+' : ''}${delve.catchUp.glint}`}
            color={delve.catchUp.glint < 0 ? C.ember1 : C.cyan2}
            pixelScale={2}
          />
        </span>
      </div>
      {delve.catchUp.ended && (
        <p className="panel-note">
          <PixelText
            text={`The run ended while you were away: ${resultLabel(delve.catchUp.result ?? 'retreated')}.`}
            color={C.amber2}
            pixelScale={2}
            wrap={36}
          />
        </p>
      )}
      {delve.catchUp.log
        .filter((entry) => entry.type === 'choice')
        .slice(-4)
        .map((entry) => (
          <p key={`${entry.step}-${entry.text}`} className="panel-note">
            <PixelText text={entry.text} color={C.paper3} pixelScale={2} wrap={38} />
          </p>
        ))}
      <div className="screen-actions">
        <Link className="text-link" to="/delve/history">
          <PixelText text="See past runs" color={C.amber2} pixelScale={2} />
        </Link>
      </div>
    </PixelPanel>
  );

  const endedPanel = !active && delve.lastEnded && (
    <PixelPanel className="delve-panel ended-panel" aria-labelledby="ended-title">
      <div className="panel-head">
        <h2 id="ended-title" className="panel-title">
          <PixelText text={resultLabel(delve.lastEnded.result)} color={C.paper0} pixelScale={3} />
        </h2>
        <PixelButton variant="secondary" onClick={delve.dismissEnded}>
          <PixelText text="Close" color={C.paper0} pixelScale={2} />
        </PixelButton>
      </div>
      <div className="stat-grid">
        <span>
          <PixelText
            text={`${hollowName(delve.lastEnded.hollowId)} · Floor ${delve.lastEnded.floor}`}
            color={C.paper1}
            pixelScale={2}
          />
        </span>
        <span>
          <PixelText
            text={`${delve.lastEnded.embersEarned} Embers earned this run`}
            color={C.amber2}
            pixelScale={2}
          />
        </span>
        <span>
          <PixelText
            text={`${delve.lastEnded.roomsVisited.length} rooms visited`}
            color={C.paper3}
            pixelScale={2}
          />
        </span>
      </div>
      <p className="panel-note">
        <PixelText
          text={
            delve.lastEnded.result === 'cleared'
              ? 'Everything earned is banked. The Hollow remembers.'
              : delve.lastEnded.result === 'fainted'
                ? 'Sixty percent of Embers were banked. No level, Spark, cosmetic, or Forge node was lost.'
                : 'Every Ember earned was banked. The lantern is still lit.'
          }
          color={C.paper3}
          pixelScale={2}
          wrap={38}
        />
      </p>
    </PixelPanel>
  );

  return (
    <main className="shell app-shell">
      <AppHeader title="The Delve" backTo="/" />

      {delve.catchingUp && (
        <PixelPanel className="delve-panel catchup-panel" role="status">
          <PixelText text="Walking the Hollows…" color={C.paper1} pixelScale={2} />
          <p className="panel-note">
            <PixelText
              text={
                delve.catchUpProgress
                  ? `${delve.catchUpProgress.applied} rooms simulated · floor ${delve.catchUpProgress.floor}`
                  : 'The Autopilot is reading the map.'
              }
              color={C.paper3}
              pixelScale={2}
              wrap={34}
            />
          </p>
          <ProgressStrip />
        </PixelPanel>
      )}

      {catchUpPanel}
      {endedPanel}

      <PixelPanel className="delve-panel" tone="paper" aria-labelledby="wallet-title">
        <div className="panel-head">
          <h2 id="wallet-title" className="eyebrow ink">
            <PixelText text="The lantern" color={C.ink700} pixelScale={2} />
          </h2>
          <Link className="text-link" to="/delve/forge">
            <PixelText text="Forge →" color={C.ink700} pixelScale={2} />
          </Link>
        </div>
        <div className="delve-wallet">
          <span>
            <img className="ui-icon" src="/ui/ui-icon-oil.png" width={20} height={20} alt="" />
            <PixelText
              text={`${snapshot.oil} / ${snapshot.capacity} oil`}
              color={C.ink800}
              pixelScale={2}
            />
          </span>
          <span>
            <PixelText text={`${meta.embers} Embers`} color={C.ink800} pixelScale={2} />
          </span>
          <span>
            <img className="ui-icon" src="/ui/ui-icon-spark.png" width={20} height={20} alt="" />
            <PixelText text={`${sparks} Sparks earned`} color={C.ink800} pixelScale={2} />
          </span>
          <span>
            <PixelText
              text={`Ore ${meta.materials.ore} · Herb ${meta.materials.herb} · Echo ${meta.materials.echo}`}
              color={C.ink700}
              pixelScale={2}
            />
          </span>
        </div>
        <p className="field-note">
          <PixelText
            text="Oil comes from the free trickle and real budgeting habits. It can never be bought or crafted."
            color={C.ink600}
            pixelScale={2}
            wrap={38}
          />
        </p>
      </PixelPanel>

      {run && (
        <>
          <PixelPanel className="delve-panel" aria-labelledby="run-title">
            <div className="panel-head">
              <h2 id="run-title" className="panel-title">
                <PixelText
                  text={`${hollowName(run.hollowId)} · F${run.floor}`}
                  color={C.paper0}
                  pixelScale={3}
                  wrap={18}
                />
              </h2>
              <span className="delve-badge">
                <PixelText
                  text={run.daily ? 'Daily' : run.pendingChoice ? 'Choice' : 'Active'}
                  color={run.pendingChoice ? C.amber2 : C.moss1}
                  pixelScale={2}
                />
              </span>
            </div>
            <p className="panel-note">
              <PixelText text={buffCopy(run, run.companionLevel)} color={C.paper3} pixelScale={2} />
            </p>
            <div className="delve-stage">
              <Suspense fallback={<div className="delve-stage-slot" aria-hidden="true" />}>
                <BattleScene
                  hollow={run.hollowId}
                  enemyId={beat?.enemyId ?? encounterOf(run).enemyId}
                  big={beat?.big ?? encounterOf(run).boss}
                  action={beat?.action ?? null}
                  reducedMotion={reducedMotion}
                  alt={`${hollowName(run.hollowId)}, floor ${run.floor}: ${roomKindLabel(currentRoomKind(run))} room`}
                />
              </Suspense>
            </div>
            {recap.rows.length > 0 && (
              <ul className="delve-recap" aria-label="The blows the last step dealt">
                {recap.omitted > 0 && (
                  <li className="recap-more">
                    <PixelText
                      text={`${recap.omitted} earlier blows not shown`}
                      color={C.paper3}
                      pixelScale={2}
                    />
                  </li>
                )}
                {recap.rows.map((row, index) => (
                  <li key={`${row.round}-${row.actor}-${row.target}-${index}`}>
                    <PixelText
                      text={`${row.crit ? 'CRIT ' : ''}${row.actor} → ${row.target}`}
                      color={row.side === 'player' ? C.moss1 : C.rose1}
                      pixelScale={2}
                      wrap={34}
                    />
                    <PixelText text={row.sum} color={C.paper3} pixelScale={2} wrap={34} />
                  </li>
                ))}
              </ul>
            )}
            <Gauge
              value={hpPercent(run) / 100}
              label={`Companion HP, ${run.unit.hp} of ${run.unit.maxHp}`}
              tone={hpPercent(run) <= 30 ? 'rose' : hpPercent(run) <= 60 ? 'amber' : 'moss'}
            />
            <div className="stat-grid">
              <span>
                <PixelText
                  text={`${run.unit.hp}/${run.unit.maxHp} HP`}
                  color={C.paper1}
                  pixelScale={2}
                />
              </span>
              <span>
                <PixelText text={`${run.glint} Glint`} color={C.cyan2} pixelScale={2} />
              </span>
              <span>
                <PixelText
                  text={`${run.embersEarned} Embers earned`}
                  color={C.amber2}
                  pixelScale={2}
                />
              </span>
              <span>
                <PixelText text={`${run.stepIndex} steps`} color={C.paper3} pixelScale={2} />
              </span>
            </div>
            <div className="stat-grid">
              <span>
                <PixelText text={`ATK ${run.unit.atk}`} color={C.paper2} pixelScale={2} />
              </span>
              <span>
                <PixelText text={`DEF ${run.unit.def}`} color={C.paper2} pixelScale={2} />
              </span>
              <span>
                <PixelText text={`SPD ${run.unit.spd}`} color={C.paper2} pixelScale={2} />
              </span>
              <span>
                <PixelText text={`LUCK ${run.unit.luck}`} color={C.paper2} pixelScale={2} />
              </span>
            </div>
            <div className="delve-map" aria-label={`Floor map, row ${run.row + 1}`}>
              {run.floorPlan.rows.slice(run.row, run.row + 3).map((row, offset) => (
                <div className="delve-map-row" key={`row-${run.row + offset}`}>
                  {row.map((room, column) => {
                    const chosen = run.path[run.row + offset] === column;
                    return (
                      <span
                        key={room.id}
                        role="img"
                        aria-label={`${roomKindLabel(room.kind)} room`}
                        className={[
                          'delve-room',
                          offset === 0 ? 'current' : '',
                          chosen ? 'chosen' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        <PixelText
                          text={roomKindChip(room.kind)}
                          color={chosen ? C.amber1 : C.paper2}
                          pixelScale={2}
                        />
                      </span>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="panel-note">
              <PixelText
                text={`Next: ${roomKindLabel(currentRoomKind(run))} room. Upcoming: ${upcomingRooms(
                  run,
                  3,
                )
                  .map((room) => roomKindLabel(room.kind))
                  .join(' · ')}.`}
                color={C.paper3}
                pixelScale={2}
                wrap={36}
              />
            </p>

            {threats.length > 0 && (
              <div className="delve-readout">
                <h3 className="delve-subtitle" id="threat-title">
                  <PixelText
                    text={`In the ${roomKindLabel(currentRoomKind(run)).toLowerCase()} room`}
                    color={C.amber2}
                    pixelScale={2}
                  />
                </h3>
                <ul className="threat-list" aria-labelledby="threat-title">
                  {threats.map((threat, index) => (
                    <li
                      key={`${threat.name}-${index}`}
                      className={threat.big ? 'threat-line big' : 'threat-line'}
                    >
                      <PixelText
                        text={`${threat.name} · ${threat.hp} HP · DEF ${threat.def}`}
                        color={C.paper1}
                        pixelScale={2}
                        wrap={34}
                      />
                      <PixelText
                        text={
                          threat.damage.length > 0
                            ? `${threat.intent} for ${threat.damage}`
                            : threat.intent
                        }
                        color={threat.big ? C.rose1 : C.paper0}
                        pixelScale={2}
                        wrap={34}
                      />
                      {threat.sum.length > 0 && (
                        <PixelText text={threat.sum} color={C.paper3} pixelScale={2} wrap={34} />
                      )}
                      {threat.shield > 0 && (
                        <PixelText
                          text={`Your ${threat.shield} Shield soaks it first`}
                          color={C.cyan2}
                          pixelScale={2}
                          wrap={34}
                        />
                      )}
                      {threat.followUp.length > 0 && (
                        <PixelText
                          text={threat.followUp}
                          color={C.paper2}
                          pixelScale={2}
                          wrap={34}
                        />
                      )}
                      {threat.traits.map((trait) => (
                        <PixelText
                          key={trait}
                          text={trait}
                          color={C.ember1}
                          pixelScale={2}
                          wrap={34}
                        />
                      ))}
                    </li>
                  ))}
                </ul>
                <h3 className="delve-subtitle" id="swing-title">
                  <PixelText text="Your basic swing" color={C.amber2} pixelScale={2} />
                </h3>
                <ul className="threat-list" aria-labelledby="swing-title">
                  {swings.map((swing, index) => (
                    <li key={`${swing.name}-${index}`} className="swing-line">
                      <PixelText
                        text={`${swing.name}: ${swing.total} (up to ${swing.crit} on a crit)`}
                        color={C.paper1}
                        pixelScale={2}
                        wrap={34}
                      />
                      <PixelText text={swing.sum} color={C.paper3} pixelScale={2} wrap={34} />
                      <PixelText
                        text={swing.notes.join(' · ')}
                        color={C.paper2}
                        pixelScale={2}
                        wrap={34}
                      />
                    </li>
                  ))}
                </ul>
                <p className="panel-note">
                  <PixelText
                    text="These are the room's own numbers, before the roll. The build may spend a skill instead of a basic swing."
                    color={C.paper3}
                    pixelScale={2}
                    wrap={36}
                  />
                </p>
              </div>
            )}

            {run.pendingChoice && (
              <div className="pending-choice" role="group" aria-labelledby="pending-title">
                <h3 id="pending-title" className="delve-subtitle">
                  <PixelText text="Choose" color={C.amber2} pixelScale={2} />
                </h3>
                <p className="panel-note">
                  <PixelText
                    text={run.pendingChoice.reason}
                    color={C.paper2}
                    pixelScale={2}
                    wrap={32}
                  />
                </p>
                <div className="choice-stack">
                  {run.pendingChoice.options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className="delve-choice"
                      disabled={delve.busy}
                      onClick={() => void chooseOption(option.id)}
                    >
                      <PixelText text={option.label} color={C.amber1} pixelScale={2} wrap={30} />
                      {option.detail && (
                        <PixelText text={option.detail} color={C.paper3} pixelScale={2} wrap={32} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="screen-actions">
              <PixelButton
                className="wide"
                disabled={
                  delve.busy ||
                  run.pendingChoice !== null ||
                  (!run.daily && snapshot.oil < 1) ||
                  run.result !== 'active'
                }
                onClick={() => void stepRun()}
              >
                <PixelText
                  text={
                    run.pendingChoice
                      ? 'Answer the choice first'
                      : !run.daily && snapshot.oil < 1
                        ? 'The lantern is dry'
                        : 'Open the next room'
                  }
                  color={C.ink900}
                  pixelScale={2}
                />
              </PixelButton>
              {!confirmRetreat ? (
                <PixelButton
                  variant="secondary"
                  className="wide"
                  disabled={delve.busy || run.result !== 'active'}
                  onClick={() => setConfirmRetreat(true)}
                >
                  <PixelText text="Retreat to camp" color={C.paper0} pixelScale={2} />
                </PixelButton>
              ) : (
                <div className="confirm-box" role="alert">
                  <p>
                    <PixelText
                      text={`Retreat now and bank ${run.embersEarned} Embers? The run ends.`}
                      color={C.paper1}
                      pixelScale={2}
                      wrap={34}
                    />
                  </p>
                  <div className="confirm-actions">
                    <PixelButton disabled={delve.busy} onClick={() => void retreatRun()}>
                      <PixelText text="Yes, retreat" color={C.ink900} pixelScale={2} />
                    </PixelButton>
                    <PixelButton variant="secondary" onClick={() => setConfirmRetreat(false)}>
                      <PixelText text="Keep going" color={C.paper0} pixelScale={2} />
                    </PixelButton>
                  </div>
                </div>
              )}
              <Link className="text-link" to="/delve/policy">
                <PixelText
                  text={`Autopilot: ${delve.policy.mode === 'camp' ? 'camp at choices' : `retreat at ${delve.policy.retreatHpPercent}%`} →`}
                  color={C.amber2}
                  pixelScale={2}
                />
              </Link>
            </div>
          </PixelPanel>

          <PixelPanel className="delve-panel" aria-labelledby="kit-title">
            <h2 id="kit-title" className="panel-title">
              <PixelText text="Kit" color={C.paper0} pixelScale={3} />
            </h2>
            <p className="panel-note">
              <PixelText text="Boons" color={C.amber2} pixelScale={2} />
            </p>
            {run.boons.length === 0 ? (
              <p className="panel-note">
                <PixelText text="No boons yet." color={C.paper3} pixelScale={2} />
              </p>
            ) : (
              <div className="chip-row">
                {run.boons.map((id) => (
                  <span className="chip passive-chip" key={id}>
                    <PixelText
                      text={boonLabel(run, id)}
                      color={C.paper1}
                      pixelScale={2}
                      wrap={18}
                    />
                  </span>
                ))}
              </div>
            )}
            <p className="panel-note">
              <PixelText text="Relics" color={C.cyan2} pixelScale={2} />
            </p>
            {run.relics.length === 0 ? (
              <p className="panel-note">
                <PixelText text="No relics yet." color={C.paper3} pixelScale={2} />
              </p>
            ) : (
              <div className="chip-row">
                {run.relics.map((id) => {
                  const def = relicById(id);
                  return (
                    <span className="chip passive-chip" key={id}>
                      <PixelText
                        text={def ? `${def.name} · ${def.effect}` : id}
                        color={C.paper1}
                        pixelScale={2}
                        wrap={24}
                      />
                    </span>
                  );
                })}
              </div>
            )}
            <p className="panel-note">
              <PixelText text="Consumables" color={C.moss1} pixelScale={2} />
            </p>
            {run.consumables.length === 0 ? (
              <p className="panel-note">
                <PixelText
                  text="No consumables equipped. Craft them in the Workshop."
                  color={C.paper3}
                  pixelScale={2}
                  wrap={34}
                />
              </p>
            ) : (
              <div className="chip-row">
                {run.consumables.map((id) => {
                  const def = consumableById(id);
                  return (
                    <span className="chip passive-chip" key={id}>
                      <PixelText
                        text={`${def?.name ?? id}${run.consumablesUsed[id] ? ' (spent)' : ''}`}
                        color={run.consumablesUsed[id] ? C.paper3 : C.paper1}
                        pixelScale={2}
                      />
                    </span>
                  );
                })}
              </div>
            )}
            <p className="panel-note">
              <PixelText
                text={`Materials this run: Ore ${run.materials.ore} · Herb ${run.materials.herb} · Echo ${run.materials.echo}`}
                color={C.paper3}
                pixelScale={2}
                wrap={36}
              />
            </p>
          </PixelPanel>

          <PixelPanel className="delve-panel" aria-labelledby="log-title">
            <div className="panel-head">
              <h2 id="log-title" className="panel-title">
                <PixelText text="Run log" color={C.paper0} pixelScale={3} />
              </h2>
              {run.log.length > 8 && (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => setShowAllLog((value) => !value)}
                >
                  <PixelText
                    text={showAllLog ? 'Show less' : `All ${run.log.length}`}
                    color={C.amber2}
                    pixelScale={2}
                  />
                </button>
              )}
            </div>
            {(showAllLog ? run.log : run.log.slice(-8)).map((entry) => (
              <p key={`${entry.step}-${entry.text}`} className="log-line">
                <PixelText text={entry.text} color={C.paper3} pixelScale={2} wrap={38} />
              </p>
            ))}
            {run.log.length === 0 && (
              <p className="panel-note">
                <PixelText
                  text="The log fills as the run moves."
                  color={C.paper3}
                  pixelScale={2}
                  wrap={26}
                />
              </p>
            )}
          </PixelPanel>
        </>
      )}

      {!run && (
        <>
          <PixelPanel className="delve-panel" aria-labelledby="start-title">
            <h2 id="start-title" className="panel-title">
              <PixelText text="Start a run" color={C.paper0} pixelScale={3} />
            </h2>
            <p className="panel-note">
              <PixelText
                text={`${snapshot.oil} oil ready. Each room costs one oil; the Daily Challenge costs none.`}
                color={C.paper3}
                pixelScale={2}
                wrap={36}
              />
            </p>
            <p className="panel-note">
              <PixelText text="Hollow" color={C.amber2} pixelScale={2} />
            </p>
            <div className="choice-stack">
              {HOLLOWS.map((info) => {
                const open = hollowUnlocked(info.id, meta, companionLevel);
                const cleared = meta.clearedHollows.includes(info.id);
                return (
                  <button
                    key={info.id}
                    type="button"
                    className={hollow === info.id ? 'delve-choice on' : 'delve-choice'}
                    aria-pressed={hollow === info.id}
                    disabled={!open}
                    onClick={() => {
                      setHollow(info.id);
                      setHeat(0);
                    }}
                  >
                    <PixelText
                      text={`${info.name}${cleared ? ' · cleared' : ''}`}
                      color={open ? (hollow === info.id ? C.amber1 : C.paper1) : C.paper3}
                      pixelScale={2}
                    />
                    <PixelText
                      text={
                        open
                          ? `${info.blurb} ${HOLLOW_FLOORS[info.id]} floors.`
                          : info.id === 2
                            ? 'Sealed. Clear Rootfall Warren and reach level 3.'
                            : 'Sealed. Clear Cinder Vault and reach level 5.'
                      }
                      color={C.paper3}
                      pixelScale={2}
                      wrap={32}
                    />
                  </button>
                );
              })}
            </div>
            <p className="panel-note">
              <PixelText text="Build" color={C.amber2} pixelScale={2} />
            </p>
            <div className="choice-stack">
              {BUILDS.map((build) => {
                const open = buildUnlocked(build.id, meta, companionLevel);
                return (
                  <button
                    key={build.id}
                    type="button"
                    className={buildId === build.id ? 'delve-choice on' : 'delve-choice'}
                    aria-pressed={buildId === build.id}
                    disabled={!open}
                    onClick={() => setBuildId(build.id)}
                  >
                    <PixelText
                      text={`${build.name} · ${build.tags.join(' / ')}`}
                      color={open ? (buildId === build.id ? C.amber1 : C.paper1) : C.paper3}
                      pixelScale={2}
                    />
                    <PixelText
                      text={
                        open
                          ? `${build.skills.map((skill) => skill.name).join(' · ')}. ${build.treeBranches.length} talent branches.`
                          : build.unlock.kind === 'level'
                            ? `Unlocks at level ${build.unlock.value}.`
                            : build.unlock.kind === 'hollowClear'
                              ? `Unlocks after clearing Hollow ${build.unlock.value}.`
                              : 'Locked.'
                      }
                      color={C.paper3}
                      pixelScale={2}
                      wrap={32}
                    />
                  </button>
                );
              })}
            </div>
            <p className="panel-note">
              <PixelText text="Heat" color={C.amber2} pixelScale={2} />
            </p>
            {heatOpen ? (
              <div className="chip-row">
                {[0, 1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={heat === level ? 'chip on' : 'chip'}
                    aria-pressed={heat === level}
                    onClick={() => setHeat(level)}
                  >
                    <PixelText
                      text={level === 0 ? 'No Heat' : `Heat ${level}`}
                      color={C.paper1}
                      pixelScale={2}
                    />
                  </button>
                ))}
              </div>
            ) : (
              <p className="panel-note">
                <PixelText
                  text="Clear this Hollow once to unlock Heat. Heat is optional and never affects budgeting."
                  color={C.paper3}
                  pixelScale={2}
                  wrap={36}
                />
              </p>
            )}
            {heat > 0 && (
              <p className="panel-note">
                <PixelText
                  text={`Heat ${heat} makes enemies stronger and pays about ${Math.round((heat + 1) * 100)}% Embers and Sparks.`}
                  color={C.amber2}
                  pixelScale={2}
                  wrap={36}
                />
              </p>
            )}

            <p className="panel-note">
              <PixelText text="Budget buffs" color={C.moss1} pixelScale={2} />
            </p>
            {buffs && buffs.reasons.length > 0 ? (
              buffs.reasons.map((reason) => (
                <p className="panel-note" key={reason}>
                  <PixelText text={reason} color={C.paper2} pixelScale={2} wrap={38} />
                </p>
              ))
            ) : (
              <p className="panel-note">
                <PixelText
                  text="No buffs today, and that is the baseline. Nothing is subtracted. The check-in is self-reported; the app does not verify it."
                  color={C.paper3}
                  pixelScale={2}
                  wrap={38}
                />
              </p>
            )}

            <PixelButton
              className="wide"
              disabled={delve.busy || !oilReady || !selectedHollowOpen || !selectedBuildOpen}
              onClick={() => void start()}
            >
              <PixelText
                text={
                  !oilReady
                    ? 'No oil yet. Log an entry or wait for the trickle.'
                    : !selectedHollowOpen
                      ? 'That Hollow is sealed'
                      : !selectedBuildOpen
                        ? 'That build is still locked'
                        : `Descend into ${hollowName(hollow)}`
                }
                color={C.ink900}
                pixelScale={2}
                wrap={28}
              />
            </PixelButton>
          </PixelPanel>

          <PixelPanel className="delve-panel" aria-labelledby="daily-title">
            <h2 id="daily-title" className="panel-title">
              <PixelText text="Daily Challenge" color={C.paper0} pixelScale={3} />
            </h2>
            <p className="panel-note">
              <PixelText
                text={`${hollowName(dailyHollowId)} · fixed Warden loadout · no oil · one attempt per day. Same dungeon for everyone on ${snapshot.today}.`}
                color={C.paper3}
                pixelScale={2}
                wrap={38}
              />
            </p>
            <p className="panel-note">
              <PixelText
                text={`Personal best: floor ${meta.dailyBest}.`}
                color={C.amber2}
                pixelScale={2}
              />
            </p>
            <PixelButton
              className="wide"
              disabled={delve.busy || dailyDone || !!active}
              onClick={() => void startDaily()}
            >
              <PixelText
                text={
                  dailyDone
                    ? 'Daily already played today'
                    : active
                      ? 'Finish your run first'
                      : 'Enter the Daily Challenge'
                }
                color={C.ink900}
                pixelScale={2}
                wrap={28}
              />
            </PixelButton>
          </PixelPanel>
        </>
      )}

      <PixelPanel className="delve-panel" aria-labelledby="more-title">
        <h2 id="more-title" className="panel-title">
          <PixelText text="The camp" color={C.paper0} pixelScale={3} />
        </h2>
        <div className="link-grid">
          <Link className="camp-link" to="/delve/forge">
            <PixelText text="Forge and talents" color={C.amber2} pixelScale={2} />
            <PixelText
              text={`${meta.embers} Embers · permanent upgrades and skill trees`}
              color={C.paper3}
              pixelScale={2}
              wrap={28}
            />
          </Link>
          <Link className="camp-link" to="/delve/workshop">
            <PixelText text="Workshop" color={C.amber2} pixelScale={2} />
            <PixelText
              text="Craft consumables from run materials."
              color={C.paper3}
              pixelScale={2}
              wrap={28}
            />
          </Link>
          <Link className="camp-link" to="/delve/cards">
            <PixelText text="Habit Cards" color={C.amber2} pixelScale={2} />
            <PixelText
              text="Decide which skill fires, in what order."
              color={C.paper3}
              pixelScale={2}
              wrap={28}
            />
          </Link>
          <Link className="camp-link" to="/delve/codex">
            <PixelText text="Codex" color={C.amber2} pixelScale={2} />
            <PixelText
              text="Species seen, weaknesses learned, mastery earned."
              color={C.paper3}
              pixelScale={2}
              wrap={28}
            />
          </Link>
          <Link className="camp-link" to="/delve/history">
            <PixelText text="Run history" color={C.amber2} pixelScale={2} />
            <PixelText
              text="Every clear, retreat, and faint."
              color={C.paper3}
              pixelScale={2}
              wrap={28}
            />
          </Link>
          <Link className="camp-link" to="/realm">
            <PixelText text="The Realm" color={C.amber2} pixelScale={2} />
            <PixelText
              text="Your companion, buildings, and Sparks keepsakes."
              color={C.paper3}
              pixelScale={2}
              wrap={28}
            />
          </Link>
        </div>
      </PixelPanel>
    </main>
  );
}

function ProgressStrip() {
  return (
    <div className="progress-strip" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}
