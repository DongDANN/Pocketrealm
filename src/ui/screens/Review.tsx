import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { C } from '../../art/palette';
import { isoWeekBounds, isoWeekId } from '../../core/dates';
import { periodOf } from '../../core/periods';
import { DEFAULT_CURRENCY, formatMoney, isCurrencyCode } from '../../core/currency';
import { completeReview } from '../../data/habits';
import { ledgerEvents } from '../../data/ledger';
import { getSettings, listEnvelopes, listTransactions } from '../../data/repos';
import { AppHeader } from '../components/AppHeader';
import { Gauge } from '../components/Gauge';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useSession } from '../app/session';
import { useToday } from '../app/hooks';
import { say } from '../lib/toast';

const FOCUSES = [
  'Log everything, no judging.',
  'Check in once a day.',
  'Give one envelope a real number.',
  'Move a little into a goal.',
  'Notes on the purchases that matter.',
];

export function Review() {
  const { db, ctx } = useSession();
  const today = useToday();
  const [focus, setFocus] = useState(FOCUSES[0]!);
  const [step, setStep] = useState(0);

  const week = isoWeekId(today);
  const bounds = isoWeekBounds(today);
  const period = periodOf(today, 1);

  const data = useLiveQuery(async () => {
    const settings = await getSettings(db);
    const [envelopes, transactions, reviews, closes] = await Promise.all([
      listEnvelopes(db),
      listTransactions(db, { from: bounds.start, to: bounds.end }),
      ledgerEvents(db, { type: 'review' }),
      db.periodCloses.toArray(),
    ]);
    const startDay = settings.periodStartDay;
    const current = periodOf(today, startDay);
    const periodTxns = await listTransactions(db, { from: current.start, to: current.end });
    return {
      settings,
      envelopes,
      weekTxns: transactions,
      reviewed: reviews.some((e) => e.meta?.weekId === week),
      current,
      periodTxns,
      lastClose: closes.sort((a, b) => (a.periodId < b.periodId ? 1 : -1))[0],
    };
  }, [db, today, week, bounds.start, bounds.end, period.id]);

  if (!data) return <LoadingPanel label="Gathering the week" />;

  const currency = isCurrencyCode(data.settings.currency)
    ? data.settings.currency
    : DEFAULT_CURRENCY;
  const money = (minor: number) => formatMoney(minor, currency);
  const spentThisWeek = data.weekTxns
    .filter((t) => t.kind === 'expense')
    .reduce((sum, t) => sum + t.amount, 0);
  const loggedDays = new Set(data.weekTxns.map((t) => t.date)).size;

  const finish = async () => {
    const result = await completeReview(db, ctx, week);
    say(
      result.granted
        ? `Review done. ${result.events[result.events.length - 1]?.xp ?? 0} XP and a lantern buff for the next 7 days.`
        : 'This week is already reviewed. Nothing lost.',
      result.granted ? 'reward' : 'neutral',
    );
    if (result.granted) setStep(0);
  };

  // Short labels so the three steps share one line at 390px; the panel heading carries the detail.
  const steps = ['Numbers', 'Envelopes', 'Focus'];

  return (
    <main className="shell app-shell">
      <AppHeader title="Weekly review" backTo="/" />

      <PixelPanel className="delve-panel" tone="paper">
        <p className="field-note">
          <PixelText
            text="About sixty seconds. Nothing here is graded, and skipping a review costs you nothing but the bonus."
            color={C.ink700}
            pixelScale={2}
            wrap={38}
          />
        </p>
      </PixelPanel>

      <div className="chip-row" role="tablist" aria-label="Review steps">
        {steps.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={step === index}
            className={step === index ? 'chip on' : 'chip'}
            onClick={() => setStep(index)}
          >
            <PixelText text={label} color={C.paper1} pixelScale={2} wrap={20} />
          </button>
        ))}
      </div>

      {step === 0 && (
        <PixelPanel className="delve-panel" aria-labelledby="week-title">
          <h2 id="week-title" className="panel-title">
            <PixelText text={`${bounds.start} → ${bounds.end}`} color={C.paper0} pixelScale={2} />
          </h2>
          <div className="stat-grid">
            <span>
              <PixelText text={money(spentThisWeek)} color={C.amber2} pixelScale={3} />
            </span>
            <span>
              <PixelText text={`${data.weekTxns.length} entries`} color={C.paper1} pixelScale={2} />
            </span>
            <span>
              <PixelText text={`${loggedDays} of 7 days`} color={C.paper3} pixelScale={2} />
            </span>
          </div>
          <p className="panel-note">
            <PixelText
              text="A quiet week is a week like any other. This is a glance, not a verdict."
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
          <div className="screen-actions">
            <Link className="text-link" to="/add">
              <PixelText text="Add what you missed →" color={C.amber2} pixelScale={2} />
            </Link>
          </div>
        </PixelPanel>
      )}

      {step === 1 && (
        <PixelPanel className="delve-panel" aria-labelledby="env-title">
          <h2 id="env-title" className="panel-title">
            <PixelText text={`Period ${data.current.start}`} color={C.paper0} pixelScale={2} />
          </h2>
          {data.envelopes.length === 0 && (
            <p className="panel-note">
              <PixelText text="No envelopes yet." color={C.paper3} pixelScale={2} />
            </p>
          )}
          {data.envelopes.map((env) => {
            const spent = data.periodTxns
              .filter((t) => t.kind === 'expense' && t.envelopeId === env.id)
              .reduce((sum, t) => sum + t.amount, 0);
            const percent =
              env.monthlyAllowance > 0 ? Math.round((spent / env.monthlyAllowance) * 100) : 0;
            return (
              <div className="quest-row" key={env.id}>
                <PixelText text={env.name} color={C.paper1} pixelScale={2} wrap={20} />
                <Gauge
                  value={env.monthlyAllowance > 0 ? spent / env.monthlyAllowance : 0}
                  label={`${env.name}, ${percent}% used`}
                  tone={percent > 100 ? 'rose' : percent > 80 ? 'amber' : 'moss'}
                />
                <p className="panel-note">
                  <Link className="text-link" to={`/envelopes/${env.id}`}>
                    <PixelText text="Adjust the allowance →" color={C.amber2} pixelScale={2} />
                  </Link>
                </p>
              </div>
            );
          })}
        </PixelPanel>
      )}

      {step === 2 && (
        <PixelPanel className="delve-panel" aria-labelledby="focus-title">
          <h2 id="focus-title" className="panel-title">
            <PixelText text="Next week" color={C.paper0} pixelScale={3} />
          </h2>
          <p className="panel-note">
            <PixelText
              text="Pick one. It stays on this device and is never shared."
              color={C.paper3}
              pixelScale={2}
              wrap={36}
            />
          </p>
          <div className="choice-stack">
            {FOCUSES.map((option) => (
              <button
                key={option}
                type="button"
                className={focus === option ? 'delve-choice on' : 'delve-choice'}
                aria-pressed={focus === option}
                onClick={() => setFocus(option)}
              >
                <PixelText
                  text={option}
                  color={focus === option ? C.amber1 : C.paper1}
                  pixelScale={2}
                  wrap={34}
                />
              </button>
            ))}
          </div>
          <div className="screen-actions">
            <PixelButton className="wide" onClick={() => void finish()}>
              <PixelText
                text={data.reviewed ? 'Review again (no second reward)' : 'Finish the review'}
                color={C.ink900}
                pixelScale={2}
                wrap={26}
              />
            </PixelButton>
          </div>
        </PixelPanel>
      )}

      {data.lastClose && (
        <PixelPanel className="delve-panel" aria-labelledby="close-title">
          <h2 id="close-title" className="panel-title">
            <PixelText
              text={`Last close: ${data.lastClose.periodId}`}
              color={C.paper0}
              pixelScale={2}
            />
          </h2>
          <div className="stat-grid">
            <span>
              <PixelText
                text={`${money(data.lastClose.totalSaved)} left the period`}
                color={C.amber2}
                pixelScale={2}
              />
            </span>
            <span>
              <PixelText
                text={`${data.lastClose.activeDays} active days`}
                color={C.paper3}
                pixelScale={2}
              />
            </span>
          </div>
          <div className="chip-row">
            {data.lastClose.perEnvelope.map((row) => (
              <span className="chip passive-chip" key={row.envelopeId}>
                <PixelText
                  text={`${row.name}: ${money(row.spent)} of ${money(row.allowance)}${
                    row.carryIn > 0 ? ` (+${money(row.carryIn)} in)` : ''
                  }`}
                  color={C.paper2}
                  pixelScale={2}
                  wrap={30}
                />
              </span>
            ))}
          </div>
        </PixelPanel>
      )}
    </main>
  );
}
