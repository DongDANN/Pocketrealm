import { useState } from 'react';
import { Link } from 'react-router-dom';
import { C } from '../../art/palette';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  isCurrencyCode,
  parseAmount,
  type CurrencyCode,
} from '../../core/currency';
import type { Envelope } from '../../core/types';
import { saveEnvelope } from '../../data/repos';
import { AppHeader } from '../components/AppHeader';
import { Gauge } from '../components/Gauge';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { guardianArtCopy } from '../../core/today';
import { useEnvelopes, useGoals, useSettings, useTodayBoard } from '../app/hooks';
import { useSession } from '../app/session';
import { say } from '../lib/toast';

const COLOURS = ['moss', 'amber', 'teal', 'violet', 'cyan', 'rose'];

export function Envelopes() {
  const { db, ctx } = useSession();
  const board = useTodayBoard();
  const settings = useSettings();
  const all = useEnvelopes(true);
  const goals = useGoals();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [allowance, setAllowance] = useState('');
  const [rollover, setRollover] = useState<Envelope['rollover']>('none');
  const [sweepGoalId, setSweepGoalId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!board || !settings || !all) return <LoadingPanel label="Reading the envelopes" />;

  const coin: CurrencyCode = isCurrencyCode(settings.currency)
    ? settings.currency
    : DEFAULT_CURRENCY;
  const money = (minor: number) => formatMoney(minor, coin);
  const archived = all.filter((envelope) => envelope.archived);

  const reset = () => {
    setName('');
    setAllowance('');
    setRollover('none');
    setSweepGoalId('');
    setError('');
  };

  const create = async () => {
    if (busy) return;
    if (name.trim() === '') {
      setError('Give the envelope a name.');
      return;
    }
    const minor = allowance.trim() === '' ? 0 : parseAmount(allowance);
    if (minor === null) {
      setError('Allowance must be an amount, like 2500 or 2500.50. Leave it blank for zero.');
      return;
    }
    if (rollover === 'sweep-to-goal' && !sweepGoalId) {
      setError('Choose the goal this envelope should sweep leftovers into.');
      return;
    }
    setBusy(true);
    try {
      const sortOrder = all.reduce((max, envelope) => Math.max(max, envelope.sortOrder), -1) + 1;
      await saveEnvelope(db, {
        id: ctx.newId(),
        name: name.trim(),
        icon: 'jar',
        colorKey: COLOURS[all.length % COLOURS.length]!,
        monthlyAllowance: minor,
        rollover,
        ...(rollover === 'sweep-to-goal' ? { sweepGoalId } : {}),
        archived: false,
        sortOrder,
      });
      say(`Made ${name.trim()}.`, 'reward');
      reset();
      setCreating(false);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell app-shell">
      <AppHeader title="Jars" backTo="/" />

      <PixelPanel tone="paper" className="jars-summary" aria-labelledby="jars-summary-title">
        <p id="jars-summary-title" className="eyebrow ink">
          <PixelText text="This period" color={C.ink700} pixelScale={2} />
        </p>
        <div className="safe-amount">
          <PixelText text={money(board.remaining)} color={C.ink900} pixelScale={4} />
          <span className="safe-amount-sub">
            <PixelText text={`of ${money(board.allowance)} left`} color={C.ink600} pixelScale={2} />
          </span>
        </div>
        <Gauge
          value={board.allowance > 0 ? board.remaining / board.allowance : 0}
          label="Remaining across envelopes"
          tone={board.remaining < 0 ? 'rose' : 'moss'}
        />
      </PixelPanel>

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
            text={creating ? 'Close the form' : 'New envelope'}
            color={C.ink900}
            pixelScale={2}
          />
        </PixelButton>
      </div>

      {creating && (
        <PixelPanel className="form-panel" aria-labelledby="new-jar-title">
          <h2 id="new-jar-title" className="panel-title">
            <PixelText text="A new home for money" color={C.paper0} pixelScale={3} wrap={24} />
          </h2>
          <label className="field">
            <span className="field-label">
              <PixelText text="Name" color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              aria-label="Envelope name"
              maxLength={28}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">
              <PixelText text={`Allowance each period (${coin})`} color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              inputMode="decimal"
              aria-label="Monthly allowance"
              placeholder="0.00"
              value={allowance}
              onChange={(event) => setAllowance(event.target.value)}
            />
            <span className="field-note">
              <PixelText
                text="This is not a limit on joy; it is a plan you can change any time."
                color={C.paper3}
                pixelScale={2}
                wrap={40}
              />
            </span>
          </label>
          <label className="field">
            <span className="field-label">
              <PixelText text="Leftovers" color={C.paper3} pixelScale={2} />
            </span>
            <select
              className="currency-select wide-select"
              aria-label="Rollover"
              value={rollover}
              onChange={(event) => setRollover(event.target.value as Envelope['rollover'])}
            >
              <option value="none">Reset each period</option>
              <option value="carry">Carry into the next period</option>
              <option value="sweep-to-goal">Sweep into a goal</option>
            </select>
          </label>
          {rollover === 'sweep-to-goal' && (
            <label className="field">
              <span className="field-label">
                <PixelText text="Goal to sweep into" color={C.paper3} pixelScale={2} />
              </span>
              <select
                className="currency-select wide-select"
                aria-label="Sweep goal"
                value={sweepGoalId}
                onChange={(event) => setSweepGoalId(event.target.value)}
              >
                <option value="">Choose a goal</option>
                {(goals ?? []).map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.name}
                  </option>
                ))}
              </select>
              {(goals ?? []).length === 0 && (
                <span className="field-note">
                  <PixelText
                    text="Make a goal first on the Goals screen."
                    color={C.paper3}
                    pixelScale={2}
                    wrap={40}
                  />
                </span>
              )}
            </label>
          )}
          {error !== '' && (
            <p className="problem-line" role="alert">
              <PixelText text={error} color={C.ember1} pixelScale={2} wrap={40} />
            </p>
          )}
          <PixelButton className="wide" disabled={busy} onClick={() => void create()}>
            <PixelText text={busy ? 'Saving' : 'Make envelope'} color={C.ink900} pixelScale={2} />
          </PixelButton>
        </PixelPanel>
      )}

      <PixelPanel className="jars-panel" aria-labelledby="active-jars-title">
        <h2 id="active-jars-title" className="panel-title">
          <PixelText text="Envelopes" color={C.paper0} pixelScale={3} />
        </h2>
        {board.rows.length === 0 && (
          <p className="panel-note">
            <PixelText
              text="No envelopes yet. A budget is easier to keep when each peso has a name."
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
        )}
        {board.rows.map((row) => (
          <Link className="envelope-row" key={row.envelope.id} to={`/envelopes/${row.envelope.id}`}>
            <div className="envelope-head">
              <span className="envelope-name">
                <PixelText text={row.envelope.name} color={C.paper1} pixelScale={2} wrap={16} />
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
                width={26}
                height={26}
                alt=""
              />
              <PixelText
                text={`${guardianArtCopy(row.guardianArt)} · ${money(row.envelope.monthlyAllowance)} a period`}
                color={C.paper3}
                pixelScale={2}
                wrap={30}
              />
            </div>
          </Link>
        ))}
      </PixelPanel>

      {archived.length > 0 && (
        <PixelPanel className="jars-panel" aria-labelledby="archived-jars-title">
          <h2 id="archived-jars-title" className="panel-title">
            <PixelText text="Archived" color={C.paper0} pixelScale={3} />
          </h2>
          {archived.map((envelope) => (
            <Link className="envelope-row" key={envelope.id} to={`/envelopes/${envelope.id}`}>
              <div className="envelope-head">
                <span className="envelope-name">
                  <PixelText text={envelope.name} color={C.paper3} pixelScale={2} wrap={20} />
                </span>
                <span className="money">
                  <PixelText
                    text={`${money(envelope.monthlyAllowance)} a period`}
                    color={C.paper3}
                    pixelScale={2}
                  />
                </span>
              </div>
            </Link>
          ))}
        </PixelPanel>
      )}

      <p className="art-footer">
        <PixelText
          text="An envelope is a promise to your future self, not a punishment."
          color={C.paper3}
          pixelScale={2}
          wrap={44}
          align="center"
        />
      </p>
    </main>
  );
}
