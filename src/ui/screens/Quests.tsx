import { useLiveQuery } from 'dexie-react-hooks';
import { C } from '../../art/palette';
import {
  offeredDailyQuests,
  offeredWeeklyQuests,
  questPeriodId,
  seasonQuest,
  type Quest,
  type QuestKind,
} from '../../core/quests';
import { claimQuest, type QuestState } from '../../data/questsStore';
import { questSeed } from '../../data/onboard';
import { AppHeader } from '../components/AppHeader';
import { Gauge } from '../components/Gauge';
import { PixelButton } from '../components/PixelButton';
import { PixelPanel } from '../components/PixelPanel';
import { PixelText } from '../components/PixelText';
import { LoadingPanel } from '../app/gates';
import { useSession } from '../app/session';
import { useToday } from '../app/hooks';
import { say } from '../lib/toast';

const GROUPS: { kind: QuestKind; label: string }[] = [
  { kind: 'daily', label: 'Today' },
  { kind: 'weekly', label: 'This week' },
  { kind: 'season', label: 'This season' },
];

export function Quests() {
  const { db, ctx } = useSession();
  const today = useToday();
  const periodId = questPeriodId('daily', today);

  const states = useLiveQuery(async () => {
    const seed = await questSeed(db);
    const offered: { quest: Quest; periodId: string }[] = [
      ...offeredDailyQuests(seed, today).map((quest) => ({
        quest,
        periodId: questPeriodId('daily', today),
      })),
      ...offeredWeeklyQuests(seed, today).map((quest) => ({
        quest,
        periodId: questPeriodId('weekly', today),
      })),
      { quest: seasonQuest(), periodId: questPeriodId('season', today) },
    ];
    const rows = await db.questProgress.toArray();
    return offered.map(({ quest, periodId: pid }) => {
      const row = rows.find((r) => r.questId === quest.id && r.periodId === pid);
      const state: QuestState = {
        quest,
        periodId: pid,
        progress: row?.progress ?? 0,
        ...(row?.completedAt === undefined ? {} : { completedAt: row.completedAt }),
        ...(row?.claimedAt === undefined ? {} : { claimedAt: row.claimedAt }),
      };
      return state;
    });
  }, [db, today, periodId]);

  if (!states) return <LoadingPanel label="Reading the board" />;

  const claim = async (questId: string, pid: string) => {
    const result = await claimQuest(db, ctx, questId, pid);
    if (!result.ok) {
      say(
        result.reason === 'already-claimed'
          ? 'Already claimed for this period.'
          : result.reason === 'in-progress'
            ? 'Not finished yet.'
            : 'That quest is not on today’s board.',
        'warn',
      );
      return;
    }
    say(
      result.granted
        ? `Claimed: ${result.xp} XP and ${result.sparks} Sparks.`
        : 'Quest already paid out.',
      'reward',
    );
  };

  return (
    <main className="shell app-shell">
      <AppHeader title="Quests" backTo="/" />

      {GROUPS.map((group) => {
        const rows = states.filter((state) => state.quest.kind === group.kind);
        if (rows.length === 0) return null;
        return (
          <PixelPanel className="delve-panel" key={group.kind} aria-labelledby={`q-${group.kind}`}>
            <h2 id={`q-${group.kind}`} className="panel-title">
              <PixelText text={group.label} color={C.paper0} pixelScale={3} />
            </h2>
            {rows.map((state) => {
              const done = state.progress >= state.quest.target;
              return (
                <div className="quest-row" key={`${state.quest.id}-${state.periodId}`}>
                  <PixelText
                    text={state.quest.name}
                    color={done ? C.moss1 : C.paper1}
                    pixelScale={2}
                    wrap={26}
                  />
                  <p className="panel-note">
                    <PixelText
                      text={`${state.quest.copy} · ${Math.min(state.progress, state.quest.target)}/${state.quest.target}`}
                      color={C.paper3}
                      pixelScale={2}
                      wrap={36}
                    />
                  </p>
                  <Gauge
                    value={
                      state.quest.target > 0 ? Math.min(1, state.progress / state.quest.target) : 0
                    }
                    label={`${state.quest.name}, ${Math.min(state.progress, state.quest.target)} of ${state.quest.target}`}
                    tone={done ? 'moss' : 'amber'}
                  />
                  <div className="screen-actions">
                    <PixelButton
                      disabled={!done || state.claimedAt !== undefined}
                      onClick={() => void claim(state.quest.id, state.periodId)}
                    >
                      <PixelText
                        text={
                          state.claimedAt !== undefined
                            ? 'Claimed'
                            : done
                              ? `Claim ${state.quest.xp} XP`
                              : 'In progress'
                        }
                        color={C.ink900}
                        pixelScale={2}
                      />
                    </PixelButton>
                  </div>
                </div>
              );
            })}
          </PixelPanel>
        );
      })}

      <p className="art-footer">
        <PixelText
          text="Quests ask for actions — log a thing, check in, review the week. None of them ask you to spend, and none of them withhold your budget if you skip a day."
          color={C.paper3}
          pixelScale={2}
          wrap={44}
          align="center"
        />
      </p>
    </main>
  );
}
