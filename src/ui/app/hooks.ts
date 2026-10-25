import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { questById, questPeriodId, type QuestKind } from '../../core/quests';
import { periodOf } from '../../core/periods';
import { clampOil } from '../../core/rewards';
import { todayBoard, type TodayBoard } from '../../core/today';
import type { Companion, Envelope, Goal, LocalDate, Settings, Transaction } from '../../core/types';
import { loadFacts } from '../../data/factsStore';
import { carryInsForPeriod } from '../../data/lifecycle';
import { ledgerTotals, type LedgerTotals } from '../../data/ledger';
import {
  getCompanion,
  getSettings,
  listEnvelopes,
  listGoals,
  listTransactions,
} from '../../data/repos';
import { useSession } from './session';
import { systemClock } from '../lib/systemContext';

/** Earliest date a book can hold, for the all-time facts window. */
const ALL_TIME_START = '0000-01-01';

/** The local day, refreshed when the tab wakes so a phone left open overnight is not stale. */
export function useToday(): LocalDate {
  const [day, setDay] = useState(() => systemClock().today());
  useEffect(() => {
    const check = () =>
      setDay((current) => {
        const next = systemClock().today();
        return next === current ? current : next;
      });
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(check, 60_000);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, []);
  return day;
}

export function useSettings(): Settings | undefined {
  const { db } = useSession();
  return useLiveQuery(() => getSettings(db), [db]);
}

export function useCompanion(): Companion | null | undefined {
  const { db } = useSession();
  return useLiveQuery(() => getCompanion(db), [db]);
}

export function useEnvelopes(includeArchived = false): Envelope[] | undefined {
  const { db } = useSession();
  return useLiveQuery(() => listEnvelopes(db, { includeArchived }), [db, includeArchived]);
}

export function useGoals(includeArchived = false): Goal[] | undefined {
  const { db } = useSession();
  return useLiveQuery(() => listGoals(db, { includeArchived }), [db, includeArchived]);
}

export function useAllTransactions(): Transaction[] | undefined {
  const { db } = useSession();
  return useLiveQuery(() => listTransactions(db, {}), [db]);
}

export function useLedger(): LedgerTotals | undefined {
  const { db } = useSession();
  return useLiveQuery(() => ledgerTotals(db), [db]);
}

export interface QuestChip {
  id: string;
  kind: QuestKind;
  name: string;
  copy: string;
  progress: number;
  target: number;
  done: boolean;
  claimed: boolean;
}

/** The quests on offer today, read from the rows the open jobs refreshed. */
export function useQuestChips(today: LocalDate): QuestChip[] | undefined {
  const { db } = useSession();
  return useLiveQuery(async () => {
    const rows = await db.questProgress.toArray();
    const chips: QuestChip[] = [];
    for (const row of rows) {
      const quest = questById(row.questId);
      if (!quest) continue;
      if (row.periodId !== questPeriodId(quest.kind, today)) continue;
      chips.push({
        id: quest.id,
        kind: quest.kind,
        name: quest.name,
        copy: quest.copy,
        progress: row.progress,
        target: quest.target,
        done: row.completedAt !== undefined || row.progress >= quest.target,
        claimed: row.claimedAt !== undefined,
      });
    }
    return chips.sort((a, b) => a.kind.localeCompare(b.kind));
  }, [db, today]);
}

/**
 * Everything Today shows, in one hook. Returns undefined until every read has landed, so the screen
 * never paints a zero it will replace a frame later.
 */
export function useTodayBoard(): TodayBoard | undefined {
  const { db } = useSession();
  const today = useToday();
  const settings = useSettings();
  const companion = useCompanion();
  const envelopes = useEnvelopes();
  const startDay = settings?.periodStartDay ?? 1;
  const period = useMemo(() => periodOf(today, startDay), [today, startDay]);
  const carries = useLiveQuery(() => carryInsForPeriod(db, period.id), [db, period.id]);
  const transactions = useLiveQuery(
    () => listTransactions(db, { from: period.start, to: period.end }),
    [db, period.start, period.end],
  );
  const lastLogged = useLiveQuery(
    () =>
      db.transactions
        .orderBy('date')
        .reverse()
        .filter((row) => row.deletedAt === undefined)
        .first()
        .then((row) => row?.date ?? null),
    [db],
  );
  const facts = useLiveQuery(
    () => loadFacts(db, { today, window: { start: ALL_TIME_START, end: today } }),
    [db, today],
  );
  const ledger = useLedger();

  if (
    !settings ||
    !envelopes ||
    companion === undefined ||
    !companion ||
    !carries ||
    !transactions ||
    lastLogged === undefined ||
    !facts ||
    !ledger
  ) {
    return undefined;
  }

  return todayBoard({
    today,
    startDay,
    envelopes,
    transactions,
    carries,
    companion,
    lastLogged,
    oil: clampOil(ledger.oil),
    xp: ledger.xp,
    streak: facts.streak,
  });
}
