import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  BuildId,
  CapsuleCeiling,
  CombatPause,
  HollowId,
  RunState,
  TurnOrder,
} from '../../core/delve';
import {
  chooseDelve,
  clearRealmPassive,
  craftAtWorkshop,
  craftCapsuleAction,
  dismissCapsuleRevealAction,
  equipConsumableAction,
  equipRealmPassive,
  equipRealmSkill,
  forgetRealmSkill,
  learnRealmSkill,
  levelUpRealmSkill,
  loadDelveSnapshot,
  openCapsuleAction,
  purchaseForge,
  purchaseTreeNode,
  respecTree,
  retreatDelve,
  startDailyDelve,
  startDelve,
  stepDelve,
  unequipConsumableAction,
  unequipRealmSkill,
  unlockRealmBuilding,
  upgradeRealmBuilding,
  type DelveRunResult,
  type DelveSnapshot,
  type DelveWallet,
  type MetaActionResult,
} from '../../data/delve';
import { useSession } from './session';
import { useToday } from './hooks';
import { say } from '../lib/toast';

/**
 * One Delve session for the tab: the wallet, the active run, the room waiting for the player's next
 * order, and the actions every game screen calls. A waiting room is rebuilt from the run's stored
 * orders on mount, so a reload resumes the exact round it left off in.
 */

export interface DelveSession {
  snapshot: DelveSnapshot | null;
  loading: boolean;
  problem: string;
  busy: boolean;
  lastEnded: RunState | null;
  /**
   * The room a run is waiting in, rebuilt from its stored orders. Null when no room is waiting; a
   * reload rebuilds it from the same seed without writing anything.
   */
  turn: CombatPause | null;
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
  /** Buy one capsule with materials. The ceiling comes from the deepest Hollow that can pay (§7 D.3). */
  craftCapsule(): Promise<MetaActionResult | null>;
  /** Draw and grant one held capsule. The prize is written before the reveal is acknowledged (§7 D.5). */
  openCapsule(ceiling: CapsuleCeiling): Promise<MetaActionResult | null>;
  dismissCapsule(): Promise<MetaActionResult | null>;
  /** Buy the next rung of one skill's Dust ladder (§7 D.6). */
  levelSkill(skillId: string): Promise<MetaActionResult | null>;
  /** The four slots and the know list are campfire decisions — refused while a run is waiting. */
  learnSkill(skillId: string, buildId: BuildId): Promise<MetaActionResult | null>;
  forgetSkill(skillId: string, buildId: BuildId): Promise<MetaActionResult | null>;
  equipMove(skillId: string, buildId: BuildId): Promise<MetaActionResult | null>;
  unequipMove(skillId: string, buildId: BuildId): Promise<MetaActionResult | null>;
  equipPassive(skillId: string, buildId: BuildId): Promise<MetaActionResult | null>;
  clearPassive(buildId: BuildId): Promise<MetaActionResult | null>;
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
  const [lastEnded, setLastEnded] = useState<RunState | null>(null);
  const [turn, setTurn] = useState<CombatPause | null>(null);
  const { busy, begin, end } = useActionLock();
  const booted = useRef(false);
  const todayRef = useRef(today);
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
        });
        setTurn(rebuilt.ok ? (rebuilt.pause ?? null) : null);
      } else {
        setTurn(null);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
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
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

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
      return acceptRun(await stepDelve(db, options()));
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
        return acceptRun(await stepDelve(db, { ...options(), order }));
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
        return acceptRun(await chooseDelve(db, { ...options(), optionId }));
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

  /**
   * The collection actions all have one shape: take the lock, run it, then either apply the wallet the
   * write returned or say the refusal. A screen never reads back what changed — the snapshot in context
   * is the same object every panel already renders from.
   */
  const withLock = useCallback(
    async (action: () => Promise<MetaActionResult>): Promise<MetaActionResult | null> => {
      if (!begin()) return null;
      try {
        return acceptMeta(await action());
      } catch (error) {
        say(error instanceof Error ? error.message : String(error), 'warn');
        return null;
      } finally {
        end();
      }
    },
    [acceptMeta, begin, end],
  );

  const craftCapsule = useCallback(
    () => withLock(() => craftCapsuleAction(db, options())),
    [db, options, withLock],
  );

  const openCapsule = useCallback(
    (ceiling: CapsuleCeiling) => withLock(() => openCapsuleAction(db, { ...options(), ceiling })),
    [db, options, withLock],
  );

  const dismissCapsule = useCallback(
    () => withLock(() => dismissCapsuleRevealAction(db, options())),
    [db, options, withLock],
  );

  const levelSkill = useCallback(
    (skillId: string) => withLock(() => levelUpRealmSkill(db, { ...options(), skillId })),
    [db, options, withLock],
  );

  const learnSkill = useCallback(
    (skillId: string, buildId: BuildId) =>
      withLock(() => learnRealmSkill(db, { ...options(), skillId, buildId })),
    [db, options, withLock],
  );

  const forgetSkill = useCallback(
    (skillId: string, buildId: BuildId) =>
      withLock(() => forgetRealmSkill(db, { ...options(), skillId, buildId })),
    [db, options, withLock],
  );

  const equipMove = useCallback(
    (skillId: string, buildId: BuildId) =>
      withLock(() => equipRealmSkill(db, { ...options(), skillId, buildId })),
    [db, options, withLock],
  );

  const unequipMove = useCallback(
    (skillId: string, buildId: BuildId) =>
      withLock(() => unequipRealmSkill(db, { ...options(), skillId, buildId })),
    [db, options, withLock],
  );

  const equipPassive = useCallback(
    (skillId: string, buildId: BuildId) =>
      withLock(() => equipRealmPassive(db, { ...options(), skillId, buildId })),
    [db, options, withLock],
  );

  const clearPassive = useCallback(
    (buildId: BuildId) => withLock(() => clearRealmPassive(db, { ...options(), buildId })),
    [db, options, withLock],
  );

  const value: DelveSession = {
    snapshot,
    loading,
    problem,
    busy,
    lastEnded,
    turn,
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
    craftCapsule,
    openCapsule,
    dismissCapsule,
    levelSkill,
    learnSkill,
    forgetSkill,
    equipMove,
    unequipMove,
    equipPassive,
    clearPassive,
  };

  return <DelveContext.Provider value={value}>{children}</DelveContext.Provider>;
}

export function useDelve(): DelveSession {
  const value = useContext(DelveContext);
  if (!value) throw new Error('useDelve used outside DelveProvider');
  return value;
}
