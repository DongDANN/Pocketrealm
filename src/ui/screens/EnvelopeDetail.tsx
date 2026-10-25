import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { C } from '../../art/palette';
import { envelopeStatus, spentInPeriod, validateTransfer } from '../../core/budget';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  isCurrencyCode,
  parseAmount,
  type CurrencyCode,
} from '../../core/currency';
import { periodOf } from '../../core/periods';
import type { Envelope, Transaction } from '../../core/types';
import { carryInsForPeriod } from '../../data/lifecycle';
import { listTransactions, saveEnvelope, writeTransaction } from '../../data/repos';
import { AppHeader } from '../components/AppHeader';
import { Gauge } from '../components/Gauge';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useEnvelopes, useGoals, useSettings, useToday } from '../app/hooks';
import { useSession } from '../app/session';
import { say } from '../lib/toast';

function kindLabel(transaction: Transaction): string {
  if (transaction.kind === 'income') return 'Income';
  if (transaction.kind === 'transfer') return 'Transfer';
  return 'Expense';
}

export function EnvelopeDetail() {
  const { id = '' } = useParams();
  const { db, ctx } = useSession();
  const navigate = useNavigate();
  const today = useToday();
  const settings = useSettings();
  const envelopes = useEnvelopes(true);
  const goals = useGoals();
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [allowance, setAllowance] = useState('');
  const [rollover, setRollover] = useState<Envelope['rollover']>('none');
  const [sweepGoalId, setSweepGoalId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [toEnvelopeId, setToEnvelopeId] = useState('');

  const envelope = useLiveQuery(async () => {
    if (!id) return null;
    return (await db.envelopes.get(id)) ?? null;
  }, [db, id]);

  const startDay = settings?.periodStartDay ?? 1;
  const period = periodOf(today, startDay);
  const carries = useLiveQuery(() => carryInsForPeriod(db, period.id), [db, period.id]);
  const periodTransactions = useLiveQuery(
    () => listTransactions(db, { from: period.start, to: period.end }),
    [db, period.start, period.end],
  );
  const history = useLiveQuery(
    async () =>
      (await db.transactions.filter((row) => row.deletedAt === undefined).toArray())
        .filter((row) => row.envelopeId === id || row.toEnvelopeId === id)
        .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1)),
    [db, id],
  );

  useEffect(() => {
    if (loaded || !envelope) return;
    setName(envelope.name);
    setAllowance((envelope.monthlyAllowance / 100).toFixed(2));
    setRollover(envelope.rollover);
    setSweepGoalId(envelope.sweepGoalId ?? '');
    setLoaded(true);
  }, [envelope, loaded]);

  if (!settings || !envelopes || !carries || !periodTransactions || !history) {
    return <LoadingPanel label="Opening the envelope" />;
  }
  if (envelope === undefined) return <LoadingPanel label="Opening the envelope" />;
  if (envelope === null) {
    return (
      <main className="shell app-shell">
        <AppHeader title="Envelope" backTo="/envelopes" backLabel="Jars" />
        <PixelPanel className="problem-panel" role="alert">
          <PixelText
            text="That envelope is not in the book. It may have been removed on another screen."
            color={C.ember1}
            pixelScale={2}
            wrap={40}
          />
          <Link className="pixel-button link-button" to="/envelopes">
            <PixelText text="Back to Jars" color={C.ink900} pixelScale={2} />
          </Link>
        </PixelPanel>
      </main>
    );
  }

  const coin: CurrencyCode = isCurrencyCode(settings.currency)
    ? settings.currency
    : DEFAULT_CURRENCY;
  const money = (minor: number) => formatMoney(minor, coin);
  const status = envelopeStatus(
    envelope,
    carries.get(envelope.id) ?? 0,
    spentInPeriod(envelope.id, periodTransactions, period),
  );
  const destinations = envelopes.filter((row) => row.id !== envelope.id && !row.archived);

  const save = async () => {
    if (busy) return;
    const minor = allowance.trim() === '' ? 0 : parseAmount(allowance);
    if (minor === null) {
      setError('Allowance must be an amount, like 2500 or 2500.50.');
      return;
    }
    if (name.trim() === '') {
      setError('The envelope needs a name.');
      return;
    }
    if (rollover === 'sweep-to-goal' && !sweepGoalId) {
      setError('Choose the goal this envelope should sweep into.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const next: Envelope = {
        ...envelope,
        name: name.trim(),
        monthlyAllowance: minor,
        rollover,
      };
      if (rollover === 'sweep-to-goal') next.sweepGoalId = sweepGoalId;
      else delete next.sweepGoalId;
      await saveEnvelope(db, next);
      say('Envelope saved.', 'reward');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const transfer = async () => {
    if (busy) return;
    const minor = parseAmount(transferAmount);
    if (minor === null || minor <= 0) {
      setError('Transfer an amount above zero.');
      return;
    }
    if (!toEnvelopeId) {
      setError('Choose where the money should go.');
      return;
    }
    const candidate: Transaction = {
      id: 'pending',
      kind: 'transfer',
      amount: minor,
      envelopeId: envelope.id,
      toEnvelopeId,
      date: today,
      createdAt: 0,
      updatedAt: 0,
    };
    const byId = new Map(envelopes.map((row) => [row.id, row]));
    const problem = validateTransfer(candidate, byId);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await writeTransaction(
        db,
        { kind: 'transfer', amount: minor, envelopeId: envelope.id, toEnvelopeId, date: today },
        ctx,
      );
      setTransferAmount('');
      say(
        `Moved ${money(minor)} to ${byId.get(toEnvelopeId)?.name ?? 'the other envelope'}.`,
        'reward',
      );
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const toggleArchive = async () => {
    setBusy(true);
    try {
      await saveEnvelope(db, { ...envelope, archived: !envelope.archived });
      say(
        envelope.archived ? 'Envelope restored.' : 'Envelope archived. Its history stays.',
        'neutral',
      );
      if (!envelope.archived) navigate('/envelopes');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="shell app-shell">
      <AppHeader title={envelope.name} backTo="/envelopes" backLabel="Jars" />

      <PixelPanel tone="paper" className="jar-detail-panel" aria-labelledby="jar-left-title">
        <div className="safe-head">
          <p id="jar-left-title" className="eyebrow ink">
            <PixelText
              text={envelope.archived ? 'Archived envelope' : 'Left this period'}
              color={C.ink700}
              pixelScale={2}
            />
          </p>
          <span className="safe-days">
            <PixelText text={`${status.percentUsed}% used`} color={C.paper0} pixelScale={2} />
          </span>
        </div>
        <div className="safe-amount">
          <PixelText
            text={money(status.remaining)}
            color={status.remaining < 0 ? C.ember1 : C.ink900}
            pixelScale={4}
          />
          <span className="safe-amount-sub">
            <PixelText
              text={`of ${money(status.allowance + status.carry)}${status.carry !== 0 ? ` (${money(status.carry)} carried)` : ''}`}
              color={C.ink600}
              pixelScale={2}
            />
          </span>
        </div>
        <Gauge
          value={status.percentUsed / 100}
          label={`${envelope.name}, ${status.percentUsed}% used`}
          tone={status.state === 'over' ? 'rose' : status.state === 'warning' ? 'amber' : 'moss'}
        />
        <div className="safe-meta">
          <span>
            <PixelText text={`Spent ${money(status.spent)}`} color={C.ink600} pixelScale={2} />
          </span>
          <span>
            <PixelText
              text={`${period.start.slice(5)} → ${period.end.slice(5)}`}
              color={C.ink600}
              pixelScale={2}
            />
          </span>
        </div>
      </PixelPanel>

      {!envelope.archived && (
        <PixelPanel className="form-panel" aria-labelledby="edit-jar-title">
          <h2 id="edit-jar-title" className="panel-title">
            <PixelText text="Change the plan" color={C.paper0} pixelScale={3} />
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
              value={allowance}
              onChange={(event) => setAllowance(event.target.value)}
            />
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
            </label>
          )}
          {error !== '' && (
            <p className="problem-line" role="alert">
              <PixelText text={error} color={C.ember1} pixelScale={2} wrap={40} />
            </p>
          )}
          <PixelButton className="wide" disabled={busy} onClick={() => void save()}>
            <PixelText text={busy ? 'Saving' : 'Save envelope'} color={C.ink900} pixelScale={2} />
          </PixelButton>
        </PixelPanel>
      )}

      {!envelope.archived && destinations.length > 0 && (
        <PixelPanel className="form-panel" aria-labelledby="transfer-title">
          <h2 id="transfer-title" className="panel-title">
            <PixelText text="Move money" color={C.paper0} pixelScale={3} wrap={22} />
          </h2>
          <label className="field">
            <span className="field-label">
              <PixelText text={`Amount (${coin})`} color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              inputMode="decimal"
              aria-label="Transfer amount"
              placeholder="0.00"
              value={transferAmount}
              onChange={(event) => setTransferAmount(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">
              <PixelText text="To envelope" color={C.paper3} pixelScale={2} />
            </span>
            <select
              className="currency-select wide-select"
              aria-label="Transfer destination"
              value={toEnvelopeId}
              onChange={(event) => setToEnvelopeId(event.target.value)}
            >
              <option value="">Choose an envelope</option>
              {destinations.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <PixelButton className="wide secondary" disabled={busy} onClick={() => void transfer()}>
            <PixelText text="Move it" color={C.paper0} pixelScale={2} />
          </PixelButton>
        </PixelPanel>
      )}

      <PixelPanel className="history-panel" aria-labelledby="jar-history-title">
        <div className="panel-head">
          <h2 id="jar-history-title" className="panel-title">
            <PixelText text="Entries" color={C.paper0} pixelScale={3} />
          </h2>
          <Link className="text-link" to={`/history?envelope=${envelope.id}`}>
            <PixelText text="Full log →" color={C.amber2} pixelScale={2} />
          </Link>
        </div>
        {history.length === 0 ? (
          <p className="panel-note">
            <PixelText text="Nothing in here yet." color={C.paper3} pixelScale={2} wrap={30} />
          </p>
        ) : (
          <ul className="txn-list">
            {history.slice(0, 25).map((transaction) => (
              <li key={transaction.id} className="txn-row">
                <div className="txn-copy">
                  <PixelText
                    text={
                      transaction.kind === 'transfer'
                        ? `Transfer ${transaction.envelopeId === envelope.id ? 'out' : 'in'}`
                        : kindLabel(transaction)
                    }
                    color={C.paper3}
                    pixelScale={2}
                  />
                  <PixelText
                    text={transaction.note ?? transaction.date}
                    color={C.paper1}
                    pixelScale={2}
                    wrap={26}
                  />
                </div>
                <div className="txn-amount">
                  <PixelText
                    text={`${transaction.envelopeId === envelope.id ? '−' : '+'}${money(transaction.amount)}`}
                    color={transaction.envelopeId === envelope.id ? C.amber2 : C.moss1}
                    pixelScale={2}
                  />
                  <Link
                    className="text-link small"
                    to={`/add?edit=${transaction.id}`}
                    aria-label={`Edit entry from ${transaction.date}`}
                  >
                    <PixelText text="Edit" color={C.amber2} pixelScale={2} />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PixelPanel>

      <div className="screen-actions">
        <PixelButton
          variant="secondary"
          className="wide"
          disabled={busy}
          onClick={() => void toggleArchive()}
        >
          <PixelText
            text={envelope.archived ? 'Restore envelope' : 'Archive envelope'}
            color={C.paper0}
            pixelScale={2}
          />
        </PixelButton>
        <p className="field-note center">
          <PixelText
            text={
              envelope.archived
                ? 'Restoring brings it back to this period with its plan unchanged.'
                : 'Archiving keeps every entry. You can restore it later.'
            }
            color={C.paper3}
            pixelScale={2}
            wrap={40}
            align="center"
          />
        </p>
      </div>
    </main>
  );
}
