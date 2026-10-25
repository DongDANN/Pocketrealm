import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { C } from '../../art/palette';
import { validateTransfer } from '../../core/budget';
import { speciesByKey } from '../../core/companion';
import { addDays, addMonths, isLocalDate } from '../../core/dates';
import {
  DEFAULT_CURRENCY,
  formatMoney,
  isCurrencyCode,
  parseAmount,
  type CurrencyCode,
} from '../../core/currency';
import type { Transaction, TransactionKind } from '../../core/types';
import { recentEnvelopeIds } from '../../core/view';
import { logWithReward } from '../../data/habits';
import { editTransaction, upsertRecurring } from '../../data/repos';
import { AppHeader } from '../components/AppHeader';
import { NumberPad, type NumberPadKey } from '../components/NumberPad';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useCompanion, useEnvelopes, useSettings, useToday } from '../app/hooks';
import { useSession } from '../app/session';
import { say } from '../lib/toast';

const KINDS: readonly { kind: TransactionKind; label: string }[] = [
  { kind: 'expense', label: 'Expense' },
  { kind: 'income', label: 'Income' },
  { kind: 'transfer', label: 'Transfer' },
];

const CADENCES = [
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every two weeks' },
  { value: 'monthly', label: 'Every month' },
] as const;

/** Whole units of the display currency; two taps (amount, Save) finish a common entry. */
const QUICK_AMOUNTS = [50, 100, 250, 500, 1000] as const;

type Cadence = (typeof CADENCES)[number]['value'];

function nextOccurrence(date: string, cadence: Cadence): string {
  return cadence === 'monthly' ? addMonths(date, 1) : addDays(date, cadence === 'weekly' ? 7 : 14);
}

/**
 * Quick entry. Opening the screen preselects the envelope used most recently, today's date and the
 * expense kind, so the common case is: amount, Save. Editing reuses the same form but never pays a
 * reward: XP belongs to logging something new (SPEC 6.1).
 */
export function Add() {
  const { db, ctx } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const settings = useSettings();
  const companion = useCompanion();
  const envelopes = useEnvelopes(true);
  const transactions = useLiveQuery(() => db.transactions.toArray(), [db]);
  const today = useToday();

  const editingRow = useLiveQuery(
    async () => (editId ? ((await db.transactions.get(editId)) ?? null) : null),
    [db, editId],
  );

  const [ready, setReady] = useState(false);
  const [kind, setKind] = useState<TransactionKind>('expense');
  const [amount, setAmount] = useState('');
  const [envelopeId, setEnvelopeId] = useState('');
  const [toEnvelopeId, setToEnvelopeId] = useState('');
  const [date, setDate] = useState(today);
  const [note, setNote] = useState('');
  const [repeat, setRepeat] = useState(false);
  const [cadence, setCadence] = useState<Cadence>('monthly');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const editing = editingRow ?? undefined;
  const species = useMemo(
    () => (companion ? speciesByKey(companion.speciesKey) : undefined),
    [companion],
  );

  useEffect(() => {
    if (ready || !envelopes || !transactions) return;
    if (editId) {
      if (editingRow === undefined) return;
      if (editingRow === null) {
        setError('That entry is not in the book. It may have been deleted on another screen.');
        setReady(true);
        return;
      }
      setKind(editingRow.kind);
      setAmount((editingRow.amount / 100).toFixed(2));
      setEnvelopeId(editingRow.envelopeId ?? '');
      setToEnvelopeId(editingRow.toEnvelopeId ?? '');
      setDate(editingRow.date);
      setNote(editingRow.note ?? '');
      setReady(true);
      return;
    }
    const recent = recentEnvelopeIds(transactions, envelopes, envelopes.length);
    setEnvelopeId(recent[0] ?? '');
    setToEnvelopeId(recent.find((id) => id !== recent[0]) ?? '');
    setReady(true);
  }, [ready, envelopes, transactions, editingRow, editId]);

  if (!settings || !envelopes || !transactions || !ready) {
    return <LoadingPanel label="Opening the ledger" />;
  }

  const coin: CurrencyCode = isCurrencyCode(settings.currency)
    ? settings.currency
    : DEFAULT_CURRENCY;
  const money = (minor: number) => formatMoney(minor, coin);
  const envelopeById = new Map(envelopes.map((envelope) => [envelope.id, envelope]));
  const chips = recentEnvelopeIds(transactions, envelopes, envelopes.length);
  const parsed = parseAmount(amount);
  const amountMinor = parsed ?? 0;
  const needsEnvelope = kind !== 'income';
  const destinationProblem =
    kind === 'transfer' && envelopeId === toEnvelopeId
      ? 'Choose a destination different from the source.'
      : '';
  const canSave =
    !busy &&
    amountMinor > 0 &&
    !destinationProblem &&
    (!needsEnvelope || envelopeId !== '') &&
    (kind !== 'transfer' || toEnvelopeId !== '') &&
    (!editId || editing?.goalId === undefined);

  const onKey = (key: NumberPadKey) => {
    setError('');
    setAmount((value) => {
      if (key === 'back') return value.slice(0, -1);
      if (key === '.') {
        if (value.includes('.')) return value;
        return value === '' ? '0.' : `${value}.`;
      }
      if (value.includes('.') && value.split('.')[1]!.length >= 2) return value;
      if (value.replace('.', '').length >= 10) return value;
      if (value === '0') return key;
      return value + key;
    });
  };

  const changeKind = (next: TransactionKind) => {
    setKind(next);
    setError('');
    if (next === 'income') {
      setEnvelopeId('');
      setToEnvelopeId('');
    } else if (next === 'expense') {
      setEnvelopeId((id) => id || chips[0] || '');
      setToEnvelopeId('');
    } else {
      setEnvelopeId((id) => id || chips[0] || '');
      setToEnvelopeId((id) =>
        id !== envelopeId ? id : (chips.find((c) => c !== envelopeId) ?? ''),
      );
    }
  };

  const save = async () => {
    if (busy) return;
    const minor = parseAmount(amount);
    if (minor === null || minor <= 0) {
      setError('Enter an amount above zero. The number pad takes digits and up to two decimals.');
      return;
    }
    if (!isLocalDate(date)) {
      setError('Pick a real date in the calendar.');
      return;
    }
    if (needsEnvelope && !envelopeById.has(envelopeId)) {
      setError(
        envelopes.length === 0
          ? 'Make an envelope on the Jars screen before logging money out of it.'
          : 'Choose the envelope this entry belongs to.',
      );
      return;
    }

    const candidate: Transaction = {
      id: editId ?? 'pending',
      kind,
      amount: minor,
      ...(kind === 'income' ? {} : { envelopeId }),
      ...(kind === 'transfer' ? { toEnvelopeId } : {}),
      date,
      ...(note.trim() ? { note: note.trim() } : {}),
      createdAt: 0,
      updatedAt: 0,
    };
    const transferProblem = validateTransfer(candidate, envelopeById);
    if (transferProblem) {
      setError(transferProblem);
      return;
    }

    setBusy(true);
    setError('');
    try {
      if (editId) {
        const current = editing;
        if (!current) {
          setError('That entry is no longer in the book.');
          return;
        }
        if (current.goalId !== undefined) {
          setError(
            'Goal contributions cannot be edited here. Delete it and add a new contribution.',
          );
          return;
        }
        await editTransaction(
          db,
          editId,
          {
            kind,
            amount: minor,
            envelopeId: kind === 'income' ? undefined : envelopeId,
            toEnvelopeId: kind === 'transfer' ? toEnvelopeId : undefined,
            date,
            note: note.trim() ? note.trim() : undefined,
          },
          ctx.clock,
        );
        say('Saved. No extra rewards for an edit.', 'neutral');
        navigate(-1);
        return;
      }

      const outcome = await logWithReward(
        db,
        {
          kind,
          amount: minor,
          ...(kind === 'income' ? {} : { envelopeId }),
          ...(kind === 'transfer' ? { toEnvelopeId } : {}),
          date,
          ...(note.trim() ? { note: note.trim() } : {}),
        },
        ctx,
      );
      if (!outcome.ok) {
        setError('That goal is not in the book any more. Nothing was saved.');
        return;
      }

      if (repeat) {
        await upsertRecurring(db, {
          id: ctx.newId(),
          template: {
            kind,
            amount: minor,
            ...(kind === 'income' ? {} : { envelopeId }),
            ...(kind === 'transfer' ? { toEnvelopeId } : {}),
            ...(note.trim() ? { note: note.trim() } : {}),
          },
          cadence,
          startDate: nextOccurrence(date, cadence),
        });
      }

      // `events` is the whole updated ledger, so only the last row of each granted result is new.
      const gained = outcome.rewards.reduce(
        (sum, reward) => {
          const added = reward.granted ? reward.events[reward.events.length - 1] : undefined;
          return added ? { xp: sum.xp + added.xp, oil: sum.oil + (added.oil ?? 0) } : sum;
        },
        { xp: 0, oil: 0 },
      );
      const rewardBits = [
        gained.xp > 0 ? `+${gained.xp} XP` : '',
        gained.oil > 0 ? `+${gained.oil} oil` : '',
      ].filter(Boolean);
      say(
        `Logged ${money(minor)}${rewardBits.length > 0 ? ` · ${rewardBits.join(' · ')}` : ''}`,
        'reward',
      );
      if (repeat) {
        say(`This entry returns ${cadence === 'monthly' ? 'monthly' : cadence}.`, 'neutral');
      }
      if (companion) {
        say(`${companion.name} writes it down carefully.`, 'neutral');
      }
      navigate('/', { replace: true });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : String(problem));
    } finally {
      setBusy(false);
    }
  };

  const chipLabel = kind === 'transfer' ? 'From envelope' : 'Envelope';

  return (
    <main className="shell app-shell add-shell">
      <AppHeader title={editId ? 'Edit entry' : 'Add entry'} backTo={editId ? '/history' : '/'} />

      <div className="add-kind" role="group" aria-label="Entry kind">
        {KINDS.map((option) => (
          <button
            key={option.kind}
            type="button"
            className={option.kind === kind ? 'seg-button on' : 'seg-button'}
            aria-pressed={option.kind === kind}
            onClick={() => changeKind(option.kind)}
          >
            <PixelText text={option.label} color={C.paper1} pixelScale={2} />
          </button>
        ))}
      </div>

      <PixelPanel tone="paper" className="add-amount-panel" aria-labelledby="amount-title">
        <p id="amount-title" className="eyebrow ink">
          <PixelText
            text={kind === 'income' ? 'Money in' : kind === 'transfer' ? 'Moving' : 'Money out'}
            color={C.ink700}
            pixelScale={2}
          />
        </p>
        <div className="add-amount">
          <PixelText
            text={`${money(amountMinor).replace(/\.\d\d$/, '')}${amount.includes('.') ? `.${amount.split('.')[1] ?? ''}` : ''}`}
            color={C.ink900}
            pixelScale={4}
          />
        </div>
        <p className="add-amount-note">
          <PixelText
            text={
              parsed === null
                ? 'Type digits and up to two decimals.'
                : `${formatMoney(parsed, coin)} · ${envelopeById.get(envelopeId)?.name ?? (kind === 'income' ? 'unassigned' : 'no envelope')}`
            }
            color={C.ink600}
            pixelScale={2}
            wrap={38}
          />
        </p>
        <div className="chip-row quick-row" role="group" aria-label="Quick amounts">
          {QUICK_AMOUNTS.map((value) => (
            <button
              key={value}
              type="button"
              className={amount === String(value) ? 'chip quick-chip on' : 'chip quick-chip'}
              aria-pressed={amount === String(value)}
              aria-label={`Amount ${formatMoney(value * 100, coin)}`}
              onClick={() => setAmount(String(value))}
            >
              <PixelText
                text={formatMoney(value * 100, coin).replace(/\.00$/, '')}
                color={C.paper1}
                pixelScale={2}
              />
            </button>
          ))}
        </div>
      </PixelPanel>

      <PixelPanel className="add-pad-panel">
        <NumberPad onKey={onKey} />
      </PixelPanel>

      <PixelPanel className="add-chip-panel" aria-labelledby="chips-title">
        <h2 id="chips-title" className="panel-title">
          <PixelText text={chipLabel} color={C.paper0} pixelScale={3} wrap={22} />
        </h2>
        {kind === 'income' ? (
          <p className="panel-note">
            <PixelText
              text="Income is not assigned to an envelope; it is there to be shared out."
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
        ) : envelopes.length === 0 ? (
          <p className="panel-note">
            <PixelText
              text="No envelopes yet. Make one on the Jars screen, then come back."
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
        ) : (
          <div className="chip-row">
            {chips.map((id) => {
              const envelope = envelopeById.get(id);
              if (!envelope) return null;
              const disabled = kind === 'transfer' && id === toEnvelopeId;
              return (
                <button
                  key={id}
                  type="button"
                  className={id === envelopeId ? 'chip on' : 'chip'}
                  aria-pressed={id === envelopeId}
                  aria-label={`${envelope.name}${disabled ? ', chosen as destination' : ''}`}
                  disabled={disabled}
                  onClick={() => setEnvelopeId(id)}
                >
                  <PixelText text={envelope.name} color={C.paper1} pixelScale={2} wrap={16} />
                </button>
              );
            })}
          </div>
        )}

        {kind === 'transfer' && (
          <>
            <h3 className="panel-subtitle">
              <PixelText text="To envelope" color={C.paper0} pixelScale={3} wrap={22} />
            </h3>
            <div className="chip-row">
              {chips.map((id) => {
                const envelope = envelopeById.get(id);
                if (!envelope) return null;
                const disabled = id === envelopeId;
                return (
                  <button
                    key={id}
                    type="button"
                    className={id === toEnvelopeId ? 'chip on' : 'chip'}
                    aria-pressed={id === toEnvelopeId}
                    aria-label={`${envelope.name}${disabled ? ', chosen as source' : ''}`}
                    disabled={disabled}
                    onClick={() => setToEnvelopeId(id)}
                  >
                    <PixelText text={envelope.name} color={C.paper1} pixelScale={2} wrap={16} />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </PixelPanel>

      <PixelPanel className="add-detail-panel" aria-labelledby="detail-title">
        <h2 id="detail-title" className="panel-title">
          <PixelText text="Details" color={C.paper0} pixelScale={3} />
        </h2>
        <label className="field">
          <span className="field-label">
            <PixelText text="Date" color={C.paper3} pixelScale={2} />
          </span>
          <input
            className="text-input"
            type="date"
            aria-label="Date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">
            <PixelText text="Note (optional)" color={C.paper3} pixelScale={2} />
          </span>
          <input
            className="text-input"
            aria-label="Note"
            maxLength={80}
            placeholder="Lunch with friends"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {!editId && (
          <div className="repeat-block">
            <label className="toggle-row">
              <input
                type="checkbox"
                aria-label="Repeat this entry"
                checked={repeat}
                onChange={(event) => setRepeat(event.target.checked)}
              />
              <PixelText text="Repeat this entry" color={C.paper1} pixelScale={2} />
            </label>
            {repeat && (
              <select
                className="currency-select wide-select"
                aria-label="Repeat cadence"
                value={cadence}
                onChange={(event) => setCadence(event.target.value as Cadence)}
              >
                {CADENCES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
            {repeat && (
              <p className="field-note">
                <PixelText
                  text={`Next one lands ${nextOccurrence(date, cadence)} and is written when you open the app.`}
                  color={C.paper3}
                  pixelScale={2}
                  wrap={40}
                />
              </p>
            )}
          </div>
        )}
        {editId && editing?.goalId !== undefined && (
          <p className="panel-note">
            <PixelText
              text="This entry funds a goal, so it cannot be edited here. Delete it in History and add a new contribution."
              color={C.ember1}
              pixelScale={2}
              wrap={38}
            />
          </p>
        )}
      </PixelPanel>

      {error !== '' && (
        <PixelPanel className="problem-panel" role="alert" aria-label="Entry problem">
          <PixelText text={error} color={C.ember1} pixelScale={2} wrap={40} />
        </PixelPanel>
      )}

      <div className="add-save">
        <PixelButton className="wide" disabled={!canSave} onClick={() => void save()}>
          <img className="ui-icon" src="/ui/ui-icon-check.png" width={20} height={20} alt="" />
          <PixelText
            text={busy ? 'Saving' : editId ? 'Save changes' : 'Save entry'}
            color={C.ink900}
            pixelScale={3}
          />
        </PixelButton>
        {!canSave && !busy && (
          <p className="field-note center">
            <PixelText
              text={
                editing?.goalId !== undefined
                  ? 'Change the amount, envelope or note to save.'
                  : destinationProblem ||
                    (amountMinor <= 0
                      ? 'Type an amount above zero to save.'
                      : 'Pick an envelope to save.')
              }
              color={C.paper3}
              pixelScale={2}
              wrap={38}
              align="center"
            />
          </p>
        )}
      </div>

      {companion && species && (
        <div className="add-companion">
          <PixelText
            text={`${species.name}s keep a good ledger. ${companion.name} is watching this one.`}
            color={C.paper3}
            pixelScale={2}
            wrap={36}
            align="center"
          />
        </div>
      )}
    </main>
  );
}
