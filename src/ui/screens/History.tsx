import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { C } from '../../art/palette';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  isCurrencyCode,
  type CurrencyCode,
} from '../../core/currency';
import type { Transaction } from '../../core/types';
import { dayHeading, filterHistory, groupByDay } from '../../core/view';
import { deleteLogged, restoreLogged } from '../../data/habits';
import { AppHeader } from '../components/AppHeader';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useAllTransactions, useEnvelopes, useSettings, useToday } from '../app/hooks';
import { useSession } from '../app/session';
import { say } from '../lib/toast';

function transactionWord(transaction: Transaction): string {
  if (transaction.kind === 'income') return 'Income';
  if (transaction.kind === 'transfer') return 'Transfer';
  return 'Expense';
}

export function History() {
  const { db, ctx } = useSession();
  const [params] = useSearchParams();
  const settings = useSettings();
  const envelopes = useEnvelopes(true);
  const transactions = useAllTransactions();
  const today = useToday();

  const [query, setQuery] = useState('');
  const [envelopeId, setEnvelopeId] = useState(() => params.get('envelope') ?? '');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [undo, setUndo] = useState<{ id: string; label: string } | null>(null);
  const [error, setError] = useState('');

  const filtered = useMemo(
    () =>
      transactions && envelopes
        ? filterHistory(transactions, envelopes, {
            query,
            envelopeId: envelopeId || undefined,
            from: from || undefined,
            to: to || undefined,
          })
        : [],
    [transactions, envelopes, query, envelopeId, from, to],
  );
  const days = useMemo(() => groupByDay(filtered), [filtered]);

  if (!settings || !envelopes || !transactions) {
    return <LoadingPanel label="Reading the log" />;
  }

  const coin: CurrencyCode = isCurrencyCode(settings.currency)
    ? settings.currency
    : DEFAULT_CURRENCY;
  const money = (minor: number) => formatMoney(minor, coin);
  const byId = new Map(envelopes.map((envelope) => [envelope.id, envelope]));

  const remove = async (transaction: Transaction) => {
    setError('');
    try {
      const outcome = await deleteLogged(db, transaction.id, ctx);
      if (!outcome) {
        setError('That entry was already removed.');
        return;
      }
      setUndo({
        id: transaction.id,
        label: `${money(transaction.amount)} from ${transaction.date}`,
      });
      say('Entry deleted. Undo is just below.', 'neutral');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  const restore = async () => {
    if (!undo) return;
    setError('');
    try {
      const outcome = await restoreLogged(db, undo.id, ctx);
      if (!outcome) {
        setError('That entry could not be restored. It may already be back.');
        return;
      }
      setUndo(null);
      say('Entry restored.', 'reward');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    }
  };

  const filtersOn = query !== '' || envelopeId !== '' || from !== '' || to !== '';

  return (
    <main className="shell app-shell">
      <AppHeader title="Log" backTo="/" />

      {undo && (
        <PixelPanel className="undo-panel" role="status" aria-labelledby="undo-title">
          <p id="undo-title" className="undo-copy">
            <PixelText text={`Deleted ${undo.label}.`} color={C.paper1} pixelScale={2} wrap={34} />
          </p>
          <PixelButton onClick={() => void restore()}>
            <PixelText text="Undo" color={C.ink900} pixelScale={2} />
          </PixelButton>
        </PixelPanel>
      )}

      <PixelPanel className="filter-panel" aria-labelledby="filters-title">
        <h2 id="filters-title" className="panel-title">
          <PixelText text="Find an entry" color={C.paper0} pixelScale={3} />
        </h2>
        <label className="field">
          <span className="field-label">
            <PixelText text="Search notes and amounts" color={C.paper3} pixelScale={2} />
          </span>
          <input
            className="text-input"
            type="search"
            aria-label="Search notes and amounts"
            placeholder="coffee, 1250…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">
            <PixelText text="Envelope" color={C.paper3} pixelScale={2} />
          </span>
          <select
            className="currency-select wide-select"
            aria-label="Envelope filter"
            value={envelopeId}
            onChange={(event) => setEnvelopeId(event.target.value)}
          >
            <option value="">Every envelope</option>
            {envelopes.map((envelope) => (
              <option key={envelope.id} value={envelope.id}>
                {envelope.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-grid two">
          <label className="field">
            <span className="field-label">
              <PixelText text="From" color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              type="date"
              aria-label="From date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">
              <PixelText text="To" color={C.paper3} pixelScale={2} />
            </span>
            <input
              className="text-input"
              type="date"
              aria-label="To date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </label>
        </div>
        <div className="filter-foot">
          <span className="filter-count">
            <PixelText
              text={`${filtered.length} ${filtered.length === 1 ? 'entry' : 'entries'}`}
              color={C.paper3}
              pixelScale={2}
            />
          </span>
          {filtersOn && (
            <button
              type="button"
              className="text-link small"
              onClick={() => {
                setQuery('');
                setEnvelopeId('');
                setFrom('');
                setTo('');
              }}
            >
              <PixelText text="Clear filters" color={C.amber2} pixelScale={2} />
            </button>
          )}
        </div>
      </PixelPanel>

      {error !== '' && (
        <PixelPanel className="problem-panel" role="alert">
          <PixelText text={error} color={C.ember1} pixelScale={2} wrap={40} />
        </PixelPanel>
      )}

      {days.length === 0 ? (
        <PixelPanel className="empty-panel">
          <PixelText
            text={
              transactions.length === 0
                ? 'The log is empty. Add your first entry when you are ready.'
                : 'No entries match these filters. Try a wider date range.'
            }
            color={C.paper3}
            pixelScale={2}
            wrap={40}
            align="center"
          />
        </PixelPanel>
      ) : (
        days.map((day) => (
          <PixelPanel className="day-panel" key={day.date} aria-labelledby={`day-${day.date}`}>
            <div className="day-head">
              <h2 id={`day-${day.date}`} className="day-title">
                <PixelText text={dayHeading(day.date, today)} color={C.paper0} pixelScale={3} />
              </h2>
              <PixelText
                text={day.spent > 0 ? `${money(day.spent)} out` : 'No money out'}
                color={C.paper3}
                pixelScale={2}
              />
            </div>
            <ul className="txn-list">
              {day.items.map((transaction) => {
                const fromName = byId.get(transaction.envelopeId ?? '')?.name;
                const toName = byId.get(transaction.toEnvelopeId ?? '')?.name;
                const sign =
                  transaction.kind === 'income' ? '+' : transaction.kind === 'transfer' ? '↔' : '−';
                return (
                  <li className="txn-row" key={transaction.id}>
                    <div className="txn-copy">
                      <PixelText
                        text={transactionWord(transaction)}
                        color={C.paper3}
                        pixelScale={2}
                      />
                      <PixelText
                        text={
                          transaction.kind === 'transfer'
                            ? `${fromName ?? 'Envelope'} → ${toName ?? 'Envelope'}`
                            : (transaction.note ?? fromName ?? 'Unassigned')
                        }
                        color={C.paper1}
                        pixelScale={2}
                        wrap={28}
                      />
                    </div>
                    <div className="txn-amount">
                      <PixelText
                        text={`${sign}${money(transaction.amount)}`}
                        color={
                          transaction.kind === 'income'
                            ? C.moss1
                            : transaction.kind === 'transfer'
                              ? C.amber2
                              : C.paper1
                        }
                        pixelScale={2}
                      />
                      <div className="txn-actions">
                        <Link
                          className="text-link small"
                          to={`/add?edit=${transaction.id}`}
                          aria-label={`Edit entry on ${transaction.date}`}
                        >
                          <PixelText text="Edit" color={C.amber2} pixelScale={2} />
                        </Link>
                        <button
                          type="button"
                          className="text-link small"
                          aria-label={`Delete entry on ${transaction.date}`}
                          onClick={() => void remove(transaction)}
                        >
                          <PixelText text="Delete" color={C.ember1} pixelScale={2} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </PixelPanel>
        ))
      )}

      <div className="screen-actions">
        <Link className="pixel-button link-button wide" to="/add">
          <img className="ui-icon" src="/ui/ui-icon-plus.png" width={20} height={20} alt="" />
          <PixelText text="Add an entry" color={C.ink900} pixelScale={2} />
        </Link>
      </div>
    </main>
  );
}
