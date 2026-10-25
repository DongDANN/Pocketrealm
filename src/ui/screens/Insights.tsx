import { useLiveQuery } from 'dexie-react-hooks';
import { C, colorHex } from '../../art/palette';
import {
  envelopeRowsForPeriod,
  monthlyTotals,
  previousPeriod,
  streakCalendar,
  topNotes,
} from '../../core/insights';
import { DEFAULT_CURRENCY, formatMoney, isCurrencyCode } from '../../core/currency';
import { getSettings, listEnvelopes, listTransactions } from '../../data/repos';
import { loadFacts } from '../../data/factsStore';
import { AppHeader } from '../components/AppHeader';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useSession } from '../app/session';
import { useToday } from '../app/hooks';

const ALL_TIME_START = '0000-01-01';

/**
 * The numbers behind a chart, for assistive tech. A real `<table>` would be better semantics, but its
 * minimum content width blows past a phone screen even when clipped, so the same grid is expressed
 * with ARIA roles on boxes that obey the one-pixel hidden container.
 */
function SrTable({ caption, head, rows }: { caption: string; head: string[]; rows: string[][] }) {
  return (
    <div className="sr-only" role="table" aria-label={caption}>
      <div role="rowgroup">
        <div role="row">
          {head.map((label) => (
            <span key={label} role="columnheader">
              {label}
            </span>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {rows.map((row, index) => (
          <div role="row" key={index}>
            {row.map((cell, position) => (
              <span role="cell" key={position}>
                {cell}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PixelBar({
  label,
  value,
  max,
  color,
  text,
}: {
  label: string;
  value: number;
  max: number;
  color: number;
  text: string;
}) {
  const cells = 20;
  const filled = max > 0 ? Math.min(cells, Math.round((value / max) * cells)) : 0;
  return (
    <div className="pixel-bar-row">
      <span className="pixel-bar-label">
        <PixelText text={label} color={C.paper2} pixelScale={2} wrap={18} />
      </span>
      <span className="pixel-bar" role="img" aria-label={`${label}: ${text}`}>
        {Array.from({ length: cells }, (_, index) => (
          <span
            key={index}
            className={index < filled ? 'pixel-bar-cell on' : 'pixel-bar-cell'}
            style={index < filled ? { background: colorHex(color) } : undefined}
          />
        ))}
      </span>
      <span className="pixel-bar-value">
        <PixelText text={text} color={C.paper1} pixelScale={2} wrap={14} />
      </span>
    </div>
  );
}

export function Insights() {
  const { db } = useSession();
  const today = useToday();

  const data = useLiveQuery(async () => {
    const settings = await getSettings(db);
    const [envelopes, transactions, facts] = await Promise.all([
      listEnvelopes(db, { includeArchived: true }),
      listTransactions(db, {}),
      loadFacts(db, { today, window: { start: ALL_TIME_START, end: today } }),
    ]);
    const startDay = settings.periodStartDay;
    const current = envelopeRowsForPeriod(envelopes, transactions, today, startDay);
    const prior = (() => {
      const prev = previousPeriod(today, startDay);
      const inPrev = transactions.filter(
        (t) => t.date >= prev.start && t.date <= prev.end && t.deletedAt === undefined,
      );
      return envelopes
        .filter((e) => !e.archived)
        .map((env) => {
          const spent = inPrev
            .filter((t) => t.kind === 'expense' && t.envelopeId === env.id)
            .reduce((sum, t) => sum + t.amount, 0);
          return { envelopeId: env.id, name: env.name, spent };
        });
    })();
    return {
      settings,
      current,
      prior,
      months: monthlyTotals(transactions, 6, today),
      notes: topNotes(transactions, 5),
      calendar: streakCalendar(facts.activeDates, today, 8),
    };
  }, [db, today]);

  if (!data) return <LoadingPanel label="Counting the coins" />;

  const currency = isCurrencyCode(data.settings.currency)
    ? data.settings.currency
    : DEFAULT_CURRENCY;
  const money = (minor: number) => formatMoney(minor, currency);
  const maxSpend = Math.max(1, ...data.current.rows.map((r) => r.spent));
  const maxMonth = Math.max(1, ...data.months.flatMap((m) => [m.income, m.expenses]));

  return (
    <main className="shell app-shell">
      <AppHeader title="Insights" backTo="/" />

      <PixelPanel className="delve-panel" aria-labelledby="ins-current">
        <h2 id="ins-current" className="panel-title">
          <PixelText
            text={`This period · ${data.current.start} → ${data.current.end}`}
            color={C.paper0}
            pixelScale={2}
            wrap={24}
          />
        </h2>
        {data.current.rows.length === 0 && (
          <p className="panel-note">
            <PixelText text="No envelopes yet." color={C.paper3} pixelScale={2} />
          </p>
        )}
        {data.current.rows.map((row) => {
          const before = data.prior.find((p) => p.envelopeId === row.envelopeId)?.spent ?? 0;
          return (
            <PixelBar
              key={row.envelopeId}
              label={row.name}
              value={row.spent}
              max={maxSpend}
              color={row.spent > row.allowance ? C.ember1 : C.amber2}
              text={`${money(row.spent)} · last ${money(before)}`}
            />
          );
        })}
        <p className="panel-note">
          <PixelText
            text={`Total spent ${money(data.current.totalSpent)}. The number after the dot is the same envelope in the previous period.`}
            color={C.paper3}
            pixelScale={2}
            wrap={38}
          />
        </p>
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="ins-months">
        <h2 id="ins-months" className="panel-title">
          <PixelText text="Six months" color={C.paper0} pixelScale={3} />
        </h2>
        <SrTable
          caption="Income and spending per month, oldest first."
          head={['Month', 'In', 'Out', 'Net']}
          rows={data.months.map((row) => [
            row.month,
            money(row.income),
            money(row.expenses),
            money(row.net),
          ])}
        />
        {data.months.map((row) => (
          <div key={`bars-${row.month}`}>
            <PixelBar
              label={`${row.month} in`}
              value={row.income}
              max={maxMonth}
              color={C.moss1}
              text={money(row.income)}
            />
            <PixelBar
              label={`${row.month} out`}
              value={row.expenses}
              max={maxMonth}
              color={C.ember1}
              text={money(row.expenses)}
            />
          </div>
        ))}
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="ins-notes">
        <h2 id="ins-notes" className="panel-title">
          <PixelText text="Most written notes" color={C.paper0} pixelScale={3} wrap={11} />
        </h2>
        {data.notes.length === 0 ? (
          <p className="panel-note">
            <PixelText
              text="No notes yet. A note on a purchase is what turns this list into something useful."
              color={C.paper3}
              pixelScale={2}
              wrap={38}
            />
          </p>
        ) : (
          <>
            <div className="choice-stack">
              {data.notes.map((note) => (
                <div className="insight-row" key={note.note}>
                  <PixelText text={note.note} color={C.paper1} pixelScale={2} wrap={22} />
                  <PixelText
                    text={`${note.count} entries · ${money(note.total)}`}
                    color={C.amber2}
                    pixelScale={2}
                    wrap={18}
                  />
                </div>
              ))}
            </div>
            <SrTable
              caption="Top expense notes grouped by text, all time."
              head={['Note', 'Times', 'Total']}
              rows={data.notes.map((note) => [note.note, `${note.count}`, money(note.total)])}
            />
          </>
        )}
      </PixelPanel>

      <PixelPanel className="delve-panel" aria-labelledby="ins-calendar">
        <h2 id="ins-calendar" className="panel-title">
          <PixelText text="Days touched" color={C.paper0} pixelScale={3} />
        </h2>
        <div className="streak-grid" role="img" aria-label="Calendar of the last eight weeks">
          {data.calendar.map((week, index) => (
            <div className="streak-week" key={index}>
              {week.days.map((day) => (
                <span
                  key={day.date}
                  className={day.active ? 'streak-day on' : 'streak-day'}
                  title={`${day.date}${day.active ? ' · touched' : ''}`}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="panel-note">
          <PixelText
            text={`A square is a day with an entry, a check-in, or a declared no-spend. ${data.calendar.flatMap((week) => week.days).filter((d) => d.active).length} of the last 56 days. Empty squares cost nothing.`}
            color={C.paper3}
            pixelScale={2}
            wrap={38}
          />
        </p>
      </PixelPanel>
    </main>
  );
}
