import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_POLICY,
  type AutopilotPolicy,
  type BuildId,
  type CatchUpResult,
  type CombatPause,
  type HollowId,
  type RunState,
  type TurnOrder,
} from '../../core/delve';
import {
  applyCatchUp,
  chooseDelve,
  craftAtWorkshop,
  equipConsumableAction,
  loadDelveSnapshot,
  purchaseForge,
  purchaseTreeNode,
  respecTree,
  retreatDelve,
  setHabitCards,
  startDailyDelve,
  startDelve,
  stepDelve,
  unequipConsumableAction,
  unlockRealmBuilding,
  upgradeRealmBuilding,
  type CatchUpReport,
  type DelveRunResult,
  type DelveSnapshot,
  type DelveWallet,
  type MetaActionResult,
} from '../../data/delve';
import { useSession } from './session';
import { useToday } from './hooks';
import { loadDelvePolicy, saveDelvePolicy } from '../lib/delvePolicy';
import { say } from '../lib/toast';

/**
 * One Delve session for the tab: the wallet and active run, the Autopilot policy, offline progress
 * and the actions every game screen calls. Catch-up runs on open and when the tab wakes; the
 * controller owns every guard, so a double mount or double tap cannot double-step a run.
 */

export interface CatchUpProgressState {
  applied: number;
  floor: number;
}

export interface DelveSession {
  snapshot: DelveSnapshot | null;
  loading: boolean;
  problem: string;
  busy: boolean;
  catchingUp: boolean;
  catchUpProgress: CatchUpProgressState | null;
  catchUp: CatchUpReport | null;
  lastEnded: RunState | null;
  /**
   * The room a hand-played run is waiting in, rebuilt from its stored orders. Null when no room is
   * waiting; a reload rebuilds it from the same seed without writing anything.
   */
  turn: CombatPause | null;
  policy: AutopilotPolicy;
  setPolicy(next: AutopilotPolicy): void;
  dismissCatchUp(): void;
  dismissEnded(): void;
  refresh(): Promise<void>;
  start(hollow: HollowId, buildId: BuildId, heat?: number): Promise<DelveRunResult | null>;
  startDaily(): Promise<DelveRunResult | null>;
  step(): Promise<DelveRunResult | null>;
  play(order: TurnOrder): Promise<DelveRunResult | null>;
  choose(optionId: string): Promise<DelveRunResult | null>;
  retreat(): Promise<DelveRunResult | null>;
  buyForge(nodeId: string): Promise<MetaActionResult | null>;
  buyTree(buildId: BuildId, nodeId: string): Promise<MetaActionResult | null>;
  respec(buildId: BuildId): Promise<MetaActionResult | null>;
  craft(consumableId: string): Promise<MetaActionResult | null>;
  equip(consumableId: string): Promise<MetaActionResult | null>;
  unequip(consumableId: string): Promise<MetaActionResult | null>;
  unlockBuilding(buildingId: string): Promise<MetaActionResult | null>;
  upgradeBuilding(buildingId: string): Promise<MetaActionResult | null>;
  saveCards(cardIds: string[]): Promise<MetaActionResult | null>;
}

const DelveContext = createContext<DelveSession | null>(null);

function useActionLock() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const begin = useCallback(() => {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    return true;
  }, []);
  const end = useCallback(() => {
    locked.current = false;
    setBusy(false);
  }, []);
  return { busy, begin, end };
}

export function DelveProvider({ children }: { children: ReactNode }) {
  const { db } = useSession();
  const today = useToday();
  const [snapshot, setSnapshot] = useState<DelveSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState('');
  const [policy, setPolicyState] = useState<AutopilotPolicy>(() => loadDelvePolicy());
  const [catchUp, setCatchUp] = useState<CatchUpReport | null>(null);
  const [lastEnded, setLastEnded] = useState<RunState | null>(null);
  const [turn, setTurn] = useState<CombatPause | null>(null);
  const [catchingUp, setCatchingUp] = useState(false);
  const [catchUpProgress, setCatchUpProgress] = useState<CatchUpProgressState | null>(null);
  const { busy, begin, end } = useActionLock();
  const booted = useRef(false);
  const catchUpRunning = useRef(false);
  const lastCatchUpAt = useRef(0);
  const policyRef = useRef(policy);
  const todayRef = useRef(today);
  policyRef.current = policy;
  todayRef.current = today;

  const options = useCallback(() => ({ today: todayRef.current, now: Date.now() }), []);

  const applyWallet = useCallback((wallet: DelveWallet) => {
    setSnapshot((current) =>
      current
        ? {
            ...current,
            meta: wallet.meta,
            oil: wallet.oil,
            capacity: wallet.capacity,
            oilGranted: wallet.oilGranted,
          }
        : current,
    );
  }, []);

  const acceptRun = useCallback((result: DelveRunResult): DelveRunResult => {
    // A refused order still carries the room it refused to move, so the menu stays on screen.
    if (result.pause) setTurn(result.pause);
    else if (result.ok) setTurn(null);
    if (!result.ok) {
      if (result.reason) say(result.reason, 'warn');
      return result;
    }
    setSnapshot((current) =>
      current
        ? {
            ...current,
            meta: result.wallet.meta,
            oil: result.wallet.oil,
            capacity: result.wallet.capacity,
            oilGranted: result.wallet.oilGranted,
            active:
              result.run && result.run.result === 'active'
                ? result.run
                : result.run === null
                  ? current.active
                  : null,
            activeStartedAt:
              result.run && result.run.result === 'active'
                ? current.active
                  ? current.activeStartedAt
                  : Date.now()
                : null,
          }
        : current,
    );
    if (result.daily) {
      say(
        `Daily Challenge settled: ${result.daily.embers} Embers and ${result.daily.sparks} Sparks.`,
        'reward',
      );
    }
    if (result.ended && result.run) {
      setLastEnded(result.run);
      if (result.run.result === 'cleared') say('The Hollow is clear.', 'reward');
      if (result.run.result === 'fainted') say('The lantern went out. 60% banked.', 'warn');
      if (result.run.result === 'retreated') say('Retreated. Everything earned is banked.');
    }
    return result;
  }, []);

  const acceptMeta = useCallback(
    (result: MetaActionResult): MetaActionResult => {
      if (!result.ok) {
        if (result.reason) say(result.reason, 'warn');
        return result;
      }
      applyWallet(result.wallet);
      return result;
    },
    [applyWallet],
  );

  const refresh = useCallback(async () => {
    try {
      const next = await loadDelveSnapshot(db, { today: todayRef.current, now: Date.now() });
      setSnapshot(next);
      setProblem('');
      // A waiting room is not stored: the snapshot only says one is waiting. Rebuild the menu from
      // the orders and the seed — the same read the data layer proves writes nothing.
      if (next.active?.pendingTurn) {
        const rebuilt = await stepDelve(db, {
          today: todayRef.current,
          now: Date.now(),
          policy: policyRef.current,
          play: true,
        });
        setTurn(rebuilt.ok ? (rebuilt.pause ?? null) : null);
      } else {
        setTurn(null);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  }, [db]);

  const doCatchUp = useCallback(async () => {
    if (catchUpRunning.current) return;
    catchUpRunning.current = true;
    setCatchingUp(true);
    setCatchUpProgress(null);
    try {
      const before = await loadDelveSnapshot(db, { today: todayRef.current, now: Date.now() });
      setSnapshot(before);
      if (before.active && before.active.pendingChoice === null && !before.active.pendingTurn) {
        const report = await applyCatchUp(db, {
          today: todayRef.current,
          now: Date.now(),
          policy: policyRef.current,
          onProgress: (chunk: CatchUpResult) => {
            setCatchUpProgress({ applied: chunk.applied, floor: chunk.run.floor });
          },
        });
        if (report.ran || report.ended || report.pending) setCatchUp(report);
        const after = await loadDelveSnapshot(db, {
          today: todayRef.current,
          now: Date.now(),
        });
        setSnapshot(after);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      catchUpRunning.current = false;
      lastCatchUpAt.current = Date.now();
      setCatchingUp(false);
      setCatchUpProgress(null);
    }
  }, [db]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
      setLoading(false);
      await doCatchUp();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, doCatchUp]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastCatchUpAt.current < 60_000) return;
      void doCatchUp();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [doCatchUp]);

  const setPolicy = useCallback((next: AutopilotPolicy) => {
    const clean = saveDelvePolicy(next);
    setPolicyState(clean);
  }, []);

  const start = useCallback(
    async (hollow: HollowId, buildId: BuildId, heat = 0) => {
      if (!begin()) return null;
      try {
        return acceptRun(await startDelve(db, { ...options(), hollow, buildId, heat }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptRun, begin, db, end, options],
  );

  const startDaily = useCallback(async () => {
    if (!begin()) return null;
    try {
      return acceptRun(await startDailyDelve(db, options()));
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), 'warn');
      return null;
    } finally {
      end();
    }
  }, [acceptRun, begin, db, end, options]);

  const step = useCallback(async () => {
    if (!begin()) return null;
    try {
      // A fight room opens and waits for an order; only the player resolves it now.
      return acceptRun(
        await stepDelve(db, { ...options(), policy: policyRef.current, play: true }),
      );
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), 'warn');
      return null;
    } finally {
      end();
    }
  }, [acceptRun, begin, db, end, options]);

  const play = useCallback(
    async (order: TurnOrder) => {
      if (!begin()) return null;
      try {
        return acceptRun(
          await stepDelve(db, { ...options(), policy: policyRef.current, play: true, order }),
        );
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptRun, begin, db, end, options],
  );

  const choose = useCallback(
    async (optionId: string) => {
      if (!begin()) return null;
      try {
        return acceptRun(
          await chooseDelve(db, { ...options(), policy: policyRef.current, optionId }),
        );
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptRun, begin, db, end, options],
  );

  const retreat = useCallback(async () => {
    if (!begin()) return null;
    try {
      return acceptRun(await retreatDelve(db, options()));
    } catch (error) {
      say(error instanceof Error ? error.message : String(error), 'warn');
      return null;
    } finally {
      end();
    }
  }, [acceptRun, begin, db, end, options]);

  const buyForge = useCallback(
    async (nodeId: string) => {
      if (!begin()) return null;
      try {
        return acceptMeta(await purchaseForge(db, { ...options(), nodeId }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, db, end, options],
  );

  const buyTree = useCallback(
    async (buildId: BuildId, nodeId: string) => {
      if (!begin()) return null;
      try {
        return acceptMeta(await purchaseTreeNode(db, { ...options(), buildId, nodeId }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, db, end, options],
  );

  const respec = useCallback(
    async (buildId: BuildId) => {
      if (!begin()) return null;
      try {
        return acceptMeta(await respecTree(db, { ...options(), buildId }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, db, end, options],
  );

  const craft = useCallback(
    async (consumableId: string) => {
      if (!begin()) return null;
      try {
        return acceptMeta(await craftAtWorkshop(db, { ...options(), consumableId }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, db, end, options],
  );

  const equip = useCallback(
    async (consumableId: string) => {
      if (!begin()) return null;
      try {
        return acceptMeta(await equipConsumableAction(db, { ...options(), consumableId }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, db, end, options],
  );

  const unequip = useCallback(
    async (consumableId: string) => {
      if (!begin()) return null;
      try {
        return acceptMeta(await unequipConsumableAction(db, { ...options(), consumableId }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, db, end, options],
  );

  const unlockBuilding = useCallback(
    async (buildingId: string) => {
      if (!begin()) return null;
      try {
        return acceptMeta(await unlockRealmBuilding(db, { ...options(), buildingId }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, db, end, options],
  );

  const upgradeBuilding = useCallback(
    async (buildingId: string) => {
      if (!begin()) return null;
      try {
        return acceptMeta(await upgradeRealmBuilding(db, { ...options(), buildingId }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, db, end, options],
  );

  const saveCards = useCallback(
    async (cardIds: string[]) => {
      if (!begin()) return null;
      try {
        return acceptMeta(await setHabitCards(db, { ...options(), cardIds }));
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, db, end, options],
  );

  const value: DelveSession = {
    snapshot,
    loading,
    problem,
    busy,
    catchingUp,
    catchUpProgress,
    catchUp,
    lastEnded,
    turn,
    policy,
    setPolicy,
    dismissCatchUp: () => setCatchUp(null),
    dismissEnded: () => setLastEnded(null),
    refresh,
    start,
    startDaily,
    step,
    play,
    choose,
    retreat,
    buyForge,
    buyTree,
    respec,
    craft,
    equip,
    unequip,
    unlockBuilding,
    upgradeBuilding,
    saveCards,
  };

  return <DelveContext.Provider value={value}>{children}</DelveContext.Provider>;
}

export function useDelve(): DelveSession {
  const value = useContext(DelveContext);
  if (!value) throw new Error('useDelve used outside DelveProvider');
  return value;
}

export { DEFAULT_POLICY };
