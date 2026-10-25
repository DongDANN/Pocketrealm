import { useEffect, useState } from 'react';
import { C } from '../../art/palette';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  isCurrencyCode,
  parseAmount,
  type CurrencyCode,
} from '../../core/currency';
import { daysBetween, parseDate } from '../../core/dates';
import { weeksUntil } from '../../core/view';
import { saveGoal } from '../../data/repos';
import { logWithReward } from '../../data/habits';
import { AppHeader } from '../components/AppHeader';
import { Gauge } from '../components/Gauge';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useEnvelopes, useGoals, useSettings, useToday } from '../app/hooks';
import { useSession } from '../app/session';
import { say } from '../lib/toast';

function dueCopy(
  dueDate: string | undefined,
  remaining: number,
  today: string,
  money: (m: number) => string,
): string {
  if (!dueDate) return 'No due date. Every contribution counts.';
  const weeks = weeksUntil(dueDate, today);
  if (weeks === null) return 'The due date has passed. The goal can still be finished.';
  if (remaining <= 0) return 'Reached.';
  const perWeek = Math.ceil(remaining / weeks);
  return `About ${money(perWeek)} a week reaches it by ${dueDate}.`;
}

export function Goals() {
  const { db, ctx } = useSession();
  const settings = useSettings();
  const goals = useGoals();
  const envelopes = useEnvelopes();
  const today = useToday();

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState('');

  const [goalId, setGoalId] = useState('');
  const [amount, setAmount] = useState('');
  const [fromEnvelopeId, setFromEnvelopeId] = useState('');
  const [busy, setBusy] = useState(false);
  const [celebrated, setCelebrated] = useState('');

  useEffect(() => {
    if (!goalId && goals && goals.length > 0) setGoalId(goals[0]!.id);
    if (goalId && goals && !goals.some((goal) => goal.id === goalId)) setGoalId(goals[0]?.id ?? '');
  }, [goals, goalId]);

  if (!settings || !goals || !envelopes) return <LoadingPanel label="Counting the goals" />;

  const coin: CurrencyCode = isCurrencyCode(settings.currency)
    ? settings.currency
    : DEFAULT_CURRENCY;
  const money = (minor: number) => formatMoney(minor, coin);

  const create = async () => {
    if (busy) return;
    if (name.trim() === '') {
      setError('Give the goal a name.');
      return;
    }
    const minor = parseAmount(target);
    if (minor === null || minor <= 0) {
      setError('Target must be an amount above zero.');
      return;
    }
    if (dueDate && daysBetween(today, dueDate) < 0) {
      setError('Pick a due date today or later, or leave it blank.');
      return;
    }
    if (dueDate && Number.isNaN(parseDate(dueDate).getTime())) {
      setError('That due date is not a real day.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await saveGoal(db, {
        id: ctx.newId(),
        name: name.trim(),
        target: minor,
        saved: 0,
        ...(dueDate ? { dueDate } : {}),
        icon: 'spark',
        archived: false,
      });
      setName('');
      setTarget('');
      setDueDate('');
      setCreating(false);
      say('Goal added.', 'reward');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const contribute = async () => {
    if (busy) return;
    const goal = goals.find((row) => row.id === goalId);
    if (!goal) {
      setError('Choose a goal to contribute to.');
      return;
    }
    const minor = parseAmount(amount);
    if (minor === null || minor <= 0) {
      setError('Contribute an amount above zero.');
      return;
    }
    setBusy(true);
    setError('');
    setCelebrated('');
    try {
      const outcome = await logWithReward(
        db,
        {
          kind: 'expense',
          amount: minor,
          goalId: goal.id,
          ...(fromEnvelopeId ? { envelopeId: fromEnvelopeId } : {}),
          date: today,
          note: `Goal: ${goal.name}`,
        },
        ctx,
      );
      if (!outcome.ok) {
        setError('That goal is no longer in the book. Nothing was saved.');
        return;
      }
      setAmount('');
      if (outcome.grantedTypes.includes('goalDone')) {
        setCelebrated(goal.name);
        say(`${goal.name} reached! The whole realm feels it.`, 'reward');
      } else {
        say(`Added ${money(minor)} to ${goal.name}.`, 'reward');
      }
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell app-shell">
      <AppHeader title="Goals" backTo="/" />

      {celebrated !== '' && (
        <PixelPanel className="celebrate-panel" role="status" aria-label="Goal reached">
          <img className="ui-icon big" src="/ui/ui-icon-spark.png" width={40} height={40} alt="" />
          <PixelText
            text={`${celebrated} is fully funded. Take a moment; this one is yours.`}
            color={C.moss1}
            pixelScale={3}
            wrap={30}
            align="center"
          />
          <PixelButton variant="secondary" onClick={() => setCelebrated('')}>
            <PixelText text="Thank you" color={C.paper0} pixelScale={2} />
          </PixelButton>
        </PixelPanel>
      )}

      <div className="screen-actions">
        <PixelButton
          className="wide"
          onClick={() => {
            setCreating((open) => !open);
            setError('');
          }}
        >
          <img className="ui-icon" src="/ui/ui-icon-plus.png" width={20} height={20} alt="" />
          <PixelText
            text={creating ? 'Close the form' : 'New goal'}
            color={C.ink900}
            pixelScale={2}
          />
        </PixelButton>
      </div>

      {creating && (
        <PixelPanel className="form-panel" aria-labelledby="new-goal-title">
          <h2 id="new-goal-title" className="panel-title">
            <PixelText text="Something to save for" color={C.paper0} pixelScale={3} wrap={24} />
          </h2>
          <label className="field">
            <span className="field-label">
              <PixelText text="Name" color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              aria-label="Goal name"
              maxLength={36}
              placeholder="Emergency fund"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">
              <PixelText text={`Target (${coin})`} color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              inputMode="decimal"
              aria-label="Goal target"
              placeholder="0.00"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">
              <PixelText text="Due date (optional)" color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              type="date"
              aria-label="Goal due date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          {error !== '' && (
            <p className="problem-line" role="alert">
              <PixelText text={error} color={C.ember1} pixelScale={2} wrap={40} />
            </p>
          )}
          <PixelButton className="wide" disabled={busy} onClick={() => void create()}>
            <PixelText text={busy ? 'Saving' : 'Make goal'} color={C.ink900} pixelScale={2} />
          </PixelButton>
        </PixelPanel>
      )}

      {goals.length === 0 ? (
        <PixelPanel className="empty-panel">
          <PixelText
            text="No goals yet. A goal is a small future you are buying with today's care."
            color={C.paper3}
            pixelScale={2}
            wrap={40}
            align="center"
          />
        </PixelPanel>
      ) : (
        <PixelPanel className="goals-panel" aria-labelledby="goals-title">
          <h2 id="goals-title" className="panel-title">
            <PixelText text="What you are building" color={C.paper0} pixelScale={3} wrap={24} />
          </h2>
          {goals.map((goal) => {
            const progress = goal.target > 0 ? Math.min(1, goal.saved / goal.target) : 1;
            const remaining = Math.max(0, goal.target - goal.saved);
            const reached = goal.saved >= goal.target && goal.target > 0;
            return (
              <div className="goal-row" key={goal.id}>
                <div className="goal-head">
                  <span className="goal-name">
                    <PixelText text={goal.name} color={C.paper1} pixelScale={3} wrap={22} />
                  </span>
                  <span className="goal-amount">
                    <PixelText
                      text={`${money(goal.saved)} / ${money(goal.target)}`}
                      color={reached ? C.moss1 : C.amber2}
                      pixelScale={2}
                    />
                  </span>
                </div>
                <Gauge
                  value={progress}
                  label={`${goal.name}, ${Math.round(progress * 100)}% saved`}
                  tone={reached ? 'moss' : 'amber'}
                />
                <div className="goal-foot">
                  <PixelText
                    text={
                      reached
                        ? 'Reached. The goal stays here as a record.'
                        : dueCopy(goal.dueDate, remaining, today, money)
                    }
                    color={reached ? C.moss1 : C.paper3}
                    pixelScale={2}
                    wrap={34}
                  />
                  {goal.dueDate && !reached && (
                    <PixelText text={`${money(remaining)} to go`} color={C.paper3} pixelScale={2} />
                  )}
                </div>
              </div>
            );
          })}
        </PixelPanel>
      )}

      {goals.length > 0 && (
        <PixelPanel className="form-panel" aria-labelledby="contribute-title">
          <h2 id="contribute-title" className="panel-title">
            <PixelText text="Put something aside" color={C.paper0} pixelScale={3} wrap={24} />
          </h2>
          <label className="field">
            <span className="field-label">
              <PixelText text="Goal" color={C.paper3} pixelScale={2} />
            </span>
            <select
              className="currency-select wide-select"
              aria-label="Goal"
              value={goalId}
              onChange={(event) => setGoalId(event.target.value)}
            >
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">
              <PixelText text={`Amount (${coin})`} color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              inputMode="decimal"
              aria-label="Contribution amount"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">
              <PixelText text="From an envelope (optional)" color={C.paper3} pixelScale={2} />
            </span>
            <select
              className="currency-select wide-select"
              aria-label="Contribution source envelope"
              value={fromEnvelopeId}
              onChange={(event) => setFromEnvelopeId(event.target.value)}
            >
              <option value="">Unassigned money</option>
              {envelopes.map((envelope) => (
                <option key={envelope.id} value={envelope.id}>
                  {envelope.name}
                </option>
              ))}
            </select>
            <span className="field-note">
              <PixelText
                text="Choosing an envelope moves the amount out of that envelope's plan."
                color={C.paper3}
                pixelScale={2}
                wrap={40}
              />
            </span>
          </label>
          {error !== '' && (
            <p className="problem-line" role="alert">
              <PixelText text={error} color={C.ember1} pixelScale={2} wrap={40} />
            </p>
          )}
          <PixelButton className="wide" disabled={busy} onClick={() => void contribute()}>
            <PixelText text={busy ? 'Adding' : 'Contribute'} color={C.ink900} pixelScale={2} />
          </PixelButton>
        </PixelPanel>
      )}
    </main>
  );
}
