import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { C } from '../../art/palette';
import { evolutionStage, speciesByKey } from '../../core/companion';
import { DEFAULT_CURRENCY, formatMoney, isCurrencyCode } from '../../core/currency';
import { guardianArtCopy } from '../../core/today';
import { Gauge } from '../components/Gauge';
import { AnimatedPixmap } from '../components/AnimatedPixmap';
import { PixelButton } from '../components/PixelButton';
import { PixelImage } from '../components/PixelImage';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { useCompanion, useQuestChips, useSettings, useToday, useTodayBoard } from '../app/hooks';
import { useDelve } from '../app/delve';
import { useSession } from '../app/session';
import { usePrefersReducedMotion } from '../hooks/useMediaQuery';
import { checkIn } from '../../data/habits';
import { ledgerEvents } from '../../data/ledger';
import { speciesIdleFrames } from '../../art/species';
import { say } from '../lib/toast';
import { LoadingPanel } from '../app/gates';
import { AppHeader } from '../components/AppHeader';

function dateLabel(today: string, locale: string): string {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d)
    .toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })
    .toUpperCase();
}

export function Today() {
  const { db, ctx } = useSession();
  const board = useTodayBoard();
  const settings = useSettings();
  const companion = useCompanion();
  const delve = useDelve();
  const today = useToday();
  const quests = useQuestChips(today);
  const systemReduced = usePrefersReducedMotion();
  const reducedMotion =
    settings?.reducedMotion === 'on'
      ? true
      : settings?.reducedMotion === 'off'
        ? false
        : systemReduced;

  const checkedIn = useLiveQuery(
    async () => (await ledgerEvents(db, { from: today, to: today, type: 'checkin' })).length > 0,
    [db, today],
  );

  const species = useMemo(
    () => (companion ? speciesByKey(companion.speciesKey) : undefined),
    [companion],
  );

  if (!board || !settings || !companion || !species)
    return <LoadingPanel label="Reading the ledger" />;

  const currency = isCurrencyCode(settings.currency) ? settings.currency : DEFAULT_CURRENCY;
  const money = (minor: number) => formatMoney(minor, currency);
  const frames = speciesIdleFrames(species, evolutionStage(board.xp.level));
  const portrait = frames[0]!;

  const onCheckIn = async () => {
    const result = await checkIn(db, ctx);
    say(
      result.granted
        ? 'Checked in. Today counts, whatever it held.'
        : 'Already checked in today. Nothing lost.',
      result.granted ? 'reward' : 'neutral',
    );
  };

  return (
    <main className="shell app-shell">
      <AppHeader title="Today" />
      <p className="today-dateline">
        <PixelText
          text={`${dateLabel(today, settings.locale)} · ${board.daysLeft} days left`}
          color={C.paper3}
          pixelScale={2}
        />
      </p>

      <PixelPanel tone="paper" className="safe-panel" aria-labelledby="safe-title">
        <div className="safe-head">
          <p id="safe-title" className="eyebrow ink">
            <PixelText text="Safe to spend" color={C.ink700} pixelScale={2} />
          </p>
          <span className="safe-days">
            <PixelText text={`${board.daysLeft} days`} color={C.paper0} pixelScale={2} />
          </span>
        </div>
        <div className="safe-amount">
          <PixelText text={money(board.safeToSpend)} color={C.ink900} pixelScale={4} />
          <span className="safe-amount-sub">
            <PixelText text={`of ${money(board.remaining)} left`} color={C.ink600} pixelScale={2} />
          </span>
        </div>
        <Gauge
          value={board.allowance > 0 ? board.remaining / board.allowance : 0}
          label="Remaining this period"
          tone={board.remaining < 0 ? 'rose' : 'moss'}
        />
        <div className="safe-meta">
          <span>
            <PixelText
              text={`Spent today ${money(board.spentToday)}`}
              color={C.ink600}
              pixelScale={2}
            />
          </span>
          <span>
            <PixelText
              text={`${board.period.start.slice(5)} → ${board.period.end.slice(5)}`}
              color={C.ink600}
              pixelScale={2}
            />
          </span>
        </div>
        <div className="today-stats">
          <span>
            <img className="ui-icon" src="/ui/ui-icon-oil.png" width={20} height={20} alt="" />
            <PixelText text={`${board.oil} oil`} color={C.ink700} pixelScale={2} />
          </span>
          <span>
            <img className="ui-icon" src="/ui/ui-icon-spark.png" width={20} height={20} alt="" />
            <PixelText text={`${board.streak}-day streak`} color={C.ink700} pixelScale={2} />
          </span>
          <span>
            <img className="ui-icon" src="/ui/ui-icon-coin.png" width={20} height={20} alt="" />
            <PixelText text={`Lv ${board.xp.level}`} color={C.ink700} pixelScale={2} />
          </span>
        </div>
      </PixelPanel>

      <div className="today-actions">
        <Link className="pixel-button wide add-link" to="/add">
          <img className="ui-icon" src="/ui/ui-icon-plus.png" width={20} height={20} alt="" />
          <PixelText text="Add an entry" color={C.ink900} pixelScale={3} />
        </Link>
        <PixelButton
          variant="secondary"
          className="wide"
          disabled={checkedIn !== false}
          onClick={() => void onCheckIn()}
        >
          <img className="ui-icon" src="/ui/ui-icon-check.png" width={20} height={20} alt="" />
          <PixelText text={checkedIn ? 'Checked in' : 'Check in'} color={C.paper0} pixelScale={2} />
        </PixelButton>
      </div>

      <PixelPanel className="envelopes" aria-labelledby="envelopes-title">
        <div className="panel-head">
          <h2 id="envelopes-title" className="panel-title">
            <PixelText text="Envelopes" color={C.paper0} pixelScale={3} />
          </h2>
          <Link className="text-link" to="/envelopes">
            <PixelText text="All →" color={C.amber2} pixelScale={2} />
          </Link>
        </div>
        {board.rows.length === 0 && (
          <p className="panel-note">
            <PixelText
              text="No envelopes yet. Make one to give your money a home."
              color={C.paper3}
              pixelScale={2}
              wrap={30}
            />
          </p>
        )}
        {board.rows.map((row) => (
          <Link className="envelope-row" key={row.envelope.id} to={`/envelopes/${row.envelope.id}`}>
            <div className="envelope-head">
              <span className="envelope-name">
                <PixelText text={row.envelope.name} color={C.paper1} pixelScale={2} wrap={14} />
              </span>
              <span className="money">
                <PixelText
                  text={`${money(row.status.remaining)} left`}
                  color={row.status.remaining < 0 ? C.ember1 : C.amber2}
                  pixelScale={2}
                />
              </span>
            </div>
            <Gauge
              value={row.status.percentUsed / 100}
              label={`${row.envelope.name}, ${row.status.percentUsed}% used`}
              tone={
                row.status.state === 'over'
                  ? 'rose'
                  : row.status.state === 'warning'
                    ? 'amber'
                    : 'moss'
              }
            />
            <div className="envelope-foot">
              <img
                className="guardian-mini"
                src={`/ui/ui-guardian-${row.guardianArt}.png`}
                width={28}
                height={28}
                alt=""
              />
              <PixelText
                text={`${guardianArtCopy(row.guardianArt)} · ${row.status.percentUsed}% used`}
                color={C.paper3}
                pixelScale={2}
              />
            </div>
          </Link>
        ))}
      </PixelPanel>

      <Link className="delve-strip-panel" to="/delve" aria-label="Open the Delve">
        {delve.snapshot ? (
          <>
            <span className="delve-strip-head">
              <PixelText
                text={
                  delve.catchingUp
                    ? 'Walking the Hollows…'
                    : delve.snapshot.active
                      ? `${delve.snapshot.active.pendingChoice ? 'Waiting at a choice' : `Floor ${delve.snapshot.active.floor} · step ${delve.snapshot.active.stepIndex}`}`
                      : 'No run out. The camp is open.'
                }
                color={C.paper0}
                pixelScale={2}
                wrap={26}
              />
            </span>
            <span className="delve-strip-meta">
              <PixelText
                text={`${delve.snapshot.oil} oil · ${delve.snapshot.meta.embers} Embers${
                  delve.catchUp ? ' · news waiting' : ''
                }`}
                color={C.paper3}
                pixelScale={2}
              />
            </span>
          </>
        ) : (
          <span className="delve-strip-head">
            <PixelText text="The Delve" color={C.paper0} pixelScale={2} />
          </span>
        )}
      </Link>

      <PixelPanel className="companion-panel" aria-labelledby="companion-title">
        <div className="companion-art">
          {reducedMotion ? (
            <PixelImage pixmap={portrait} scale={3} alt={`${companion.name}, ${board.mood}`} />
          ) : (
            <AnimatedPixmap
              frames={frames}
              frameMs={900}
              scale={3}
              playing
              alt={`${companion.name}, ${board.mood}`}
            />
          )}
        </div>
        <div className="companion-copy">
          <h2 id="companion-title" className="panel-title">
            <PixelText text={companion.name} color={C.paper0} pixelScale={3} wrap={20} />
          </h2>
          <p>
            <PixelText text={board.moodLine} color={C.paper3} pixelScale={2} wrap={30} />
          </p>
          <Gauge
            value={board.xp.need > 0 ? board.xp.intoLevel / board.xp.need : 0}
            label={`Level ${board.xp.level}, ${board.xp.intoLevel} of ${board.xp.need} XP`}
            tone="amber"
          />
        </div>
      </PixelPanel>

      {quests && quests.length > 0 && (
        <PixelPanel className="quest-panel" aria-labelledby="quests-title">
          <div className="panel-head">
            <h2 id="quests-title" className="panel-title">
              <PixelText text="Today's work" color={C.paper0} pixelScale={3} />
            </h2>
            <Link className="text-link" to="/quests">
              <PixelText text="Claim →" color={C.amber2} pixelScale={2} />
            </Link>
          </div>
          <div className="quest-chips">
            {quests.map((quest) => (
              <span className={quest.done ? 'quest-chip done' : 'quest-chip'} key={quest.id}>
                <PixelText
                  text={`${quest.done ? '✓ ' : ''}${quest.name} ${Math.min(quest.progress, quest.target)}/${quest.target}`}
                  color={quest.done ? C.moss1 : C.paper1}
                  pixelScale={2}
                  wrap={16}
                />
              </span>
            ))}
          </div>
        </PixelPanel>
      )}

      <PixelPanel className="ritual-panel" aria-labelledby="ritual-title">
        <h2 id="ritual-title" className="panel-title">
          <PixelText text="Rituals" color={C.paper0} pixelScale={3} />
        </h2>
        <div className="link-grid">
          <Link className="camp-link" to="/review">
            <PixelText text="Weekly review" color={C.amber2} pixelScale={2} />
            <PixelText
              text="About a minute. It pays the review bonus and lights the lantern buff."
              color={C.paper3}
              pixelScale={2}
              wrap={28}
            />
          </Link>
          <Link className="camp-link" to="/insights">
            <PixelText text="Insights" color={C.amber2} pixelScale={2} />
            <PixelText
              text="This period against last, six months, and the days you touched."
              color={C.paper3}
              pixelScale={2}
              wrap={28}
            />
          </Link>
          <Link className="camp-link" to="/achievements">
            <PixelText text="Achievements" color={C.amber2} pixelScale={2} />
            <PixelText
              text="Granted on the day they are met. Nothing to claim twice."
              color={C.paper3}
              pixelScale={2}
              wrap={28}
            />
          </Link>
        </div>
      </PixelPanel>

      <p className="art-footer">
        <PixelText
          text="Everything on this screen is read from your device. No accounts, no trackers, no network calls with your data."
          color={C.paper3}
          pixelScale={2}
          wrap={44}
          align="center"
        />
      </p>
    </main>
  );
}
