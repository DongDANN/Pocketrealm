/**
 * sim:delve — headless persona simulation using the real Delve core.
 *
 * Personas: Trickle (free oil only), Casual (~3 logs/day), Habit (~6 logs + check-in +
 * weekly review), Optimizer (max oil every day). Each persona runs a deterministic Autopilot
 * and spends Embers on a fixed Forge priority. Prints runs/day, floors cleared, Embers/day,
 * time to clear each Hollow, and faint rates — the §6.10 tuning targets.
 *
 * Usage: npm run sim:delve [-- --days 60] [--persona trickle|casual|habit|optimizer|all]
 */

import {
  BOSSES,
  BUILDINGS,
  BUILDS,
  CARDS,
  CODEX_SPECIES,
  CONSUMABLES,
  ELEMENTS,
  HEAT_MAX,
  HOLLOW_FLOORS,
  FORGE_NODES,
  buyForgeNode,
  buyTreeNode,
  cardUnlocked,
  buildingMilestones,
  craftConsumable,
  emptyMeta,
  equipConsumable,
  gainMastery,
  newRun,
  oilCapacity,
  spendOil,
  stepRun,
  unlockBuilding,
  upgradeBuilding,
  type AutopilotPolicy,
  type BoonTag,
  type BudgetSignals,
  type DelveMeta,
  type RunState,
  type StepContext,
} from '../src/core/delve';
import { levelForXp } from '../src/core/rewards';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PersonaDef {
  key: string;
  /** Daily oil grants before the 120/day cap, per source. */
  oil: (day: number) => {
    log: number;
    checkin: boolean;
    nospend: boolean;
    review: boolean;
    goals: number;
  };
  signals: (day: number) => BudgetSignals;
  /** Steady-state daily XP from habits, goals, check-ins and reviews (Delve XP is extra). */
  xp: (day: number) => number;
}

export const PERSONAS: Record<string, PersonaDef> = {
  trickle: {
    key: 'Trickle',
    oil: () => ({ log: 0, checkin: false, nospend: false, review: false, goals: 0 }),
    signals: () => ({
      checkedInToday: false,
      envelopesWithinAllowance: 0,
      contributedToGoalLast7d: false,
      reviewedLast7d: false,
    }),
    xp: () => 0,
  },
  casual: {
    key: 'Casual',
    oil: () => ({ log: 3, checkin: false, nospend: false, review: false, goals: 0 }),
    signals: (day) => ({
      checkedInToday: true,
      envelopesWithinAllowance: 1,
      contributedToGoalLast7d: day % 10 === 0,
      reviewedLast7d: false,
    }),
    xp: () => 12,
  },
  habit: {
    key: 'Habit',
    oil: (day) => ({ log: 6, checkin: true, nospend: false, review: day % 7 === 0, goals: 0 }),
    signals: (day) => ({
      checkedInToday: true,
      envelopesWithinAllowance: 2,
      contributedToGoalLast7d: day % 5 === 0,
      reviewedLast7d: day % 7 === 0,
    }),
    xp: () => 28,
  },
  optimizer: {
    key: 'Optimizer',
    oil: (day) => ({ log: 8, checkin: true, nospend: true, review: day % 7 === 0, goals: 3 }),
    signals: () => ({
      checkedInToday: true,
      envelopesWithinAllowance: 3,
      contributedToGoalLast7d: true,
      reviewedLast7d: true,
    }),
    xp: () => 45,
  },
};

/** Oil granted for one day, per the §6.9 sources and caps. */
function dailyOil(def: PersonaDef, day: number): number {
  const o = def.oil(day);
  let oil = 20 + Math.min(8, o.log) * 4;
  if (o.checkin) oil += 10;
  if (o.nospend) oil += 10;
  if (o.review) oil += 30;
  oil += Math.min(3, o.goals) * 15;
  return Math.min(120, oil);
}

const POLICY: AutopilotPolicy = {
  mode: 'autopilot',
  tagPriority: ['guard', 'vigor', 'fury', 'fortune', 'thrift'],
  retreatHpPercent: 50,
  route: 'balanced',
  bossGate: { 1: 3, 2: 6, 3: 8 },
};

const FORGE_PRIORITY = ['maxhp', 'atk', 'def', 'luck', 'glint', 'embers', 'oilcap'];

function autoBuy(meta: DelveMeta): DelveMeta {
  let m = { ...meta };
  for (const nodeId of FORGE_PRIORITY) {
    for (;;) {
      const r = buyForgeNode(m.forge, m.embers, nodeId);
      if (!r.bought) break;
      m = { ...m, forge: r.forge, embers: r.embers };
    }
  }
  return m;
}

export interface PersonaStats {
  days: number;
  runs: number;
  clears: number;
  faints: number;
  retreats: number;
  embers: number;
  totalFloors: number;
  firstClear: Partial<Record<1 | 2 | 3, number>>;
  /** Runs that ended before the hollow's first clear (faint rate on first-clear attempts). */
  firstAttempts: Partial<Record<1 | 2 | 3, { faints: number; attempts: number }>>;
}

export function runPersona(def: PersonaDef, days: number, userSeed: number): PersonaStats {
  let meta = emptyMeta();
  let run: RunState | null = null;
  let oil = 0;
  let xp = 0;
  const stats: PersonaStats = {
    days,
    runs: 0,
    clears: 0,
    faints: 0,
    retreats: 0,
    embers: 0,
    totalFloors: 0,
    firstClear: {},
    firstAttempts: {},
  };
  let now = 1_700_000_000_000;

  for (let day = 1; day <= days; day++) {
    oil = Math.min(oilCapacity(meta, def.signals(day).reviewedLast7d), oil + dailyOil(def, day));
    xp += def.xp(day);
    let delveXpToday = 0; // Delve XP shares one 30/day cap.
    const today = `2026-${String(Math.floor((day - 1) / 28) + 1).padStart(2, '0')}-${String(((day - 1) % 28) + 1).padStart(2, '0')}`;

    let guard = 0;
    while (oil > 0 && guard < 500) {
      guard += 1;
      if (!run) {
        const level = levelForXp(xp).level;
        // Sensible progression: attempt the next hollow only with a 2-level buffer over its
        // unlock gate (3 for H2, 5 for H3); otherwise grind the highest cleared hollow.
        let hollow: 1 | 2 | 3 = 1;
        if (meta.clearedHollows.includes(2) && level >= 8) hollow = 3;
        else if (meta.clearedHollows.includes(1) && level >= 6) hollow = 2;
        else if (meta.clearedHollows.includes(2)) hollow = 2;
        else if (meta.clearedHollows.includes(1)) hollow = 1;
        run = newRun(userSeed, hollow, level, meta);
        meta = { ...meta, runsStarted: meta.runsStarted + 1 };
        stats.runs += 1;
      }
      const ctx: StepContext = {
        now,
        oil,
        oilCapacity: oilCapacity(meta, def.signals(day).reviewedLast7d),
        signals: def.signals(day),
        meta,
        policy: POLICY,
        today,
      };
      const out = stepRun(run, ctx);
      if (out.oilSpent === 0 && !out.ended) break; // camped (no oil / pending choice never happens under autopilot)
      run = out.run;
      meta = out.meta;
      oil = spendOil(oil, out.oilSpent);
      now += 30_000;
      for (const e of out.ledger) {
        if (delveXpToday + e.xp <= 30) {
          delveXpToday += e.xp;
          xp += e.xp;
        }
      }
      if (run.result !== 'active') {
        if (run.result === 'cleared') {
          stats.clears += 1;
          const hollow = run.hollowId as 1 | 2 | 3;
          if (stats.firstClear[hollow] === undefined) stats.firstClear[hollow] = day;
        } else if (run.result === 'fainted') stats.faints += 1;
        else stats.retreats += 1;
        const hollow = run.hollowId as 1 | 2 | 3;
        if (stats.firstClear[hollow] === undefined) {
          const fa = stats.firstAttempts[hollow] ?? { faints: 0, attempts: 0 };
          fa.attempts += 1;
          if (run.result === 'fainted') fa.faints += 1;
          stats.firstAttempts[hollow] = fa;
        }
        stats.totalFloors += run.floor - 1 + (run.result === 'cleared' ? 1 : 0);
        meta = autoBuy(meta);
        run = null;
        // A new run the same day starts after a short breather.
        if (oil < 1) break;
      }
    }
    now += DAY_MS - 30_000 * Math.min(guard, 500);
  }
  stats.embers = meta.embers;
  return stats;
}

function report(def: PersonaDef, s: PersonaStats): void {
  const runsPerDay = s.runs / s.days;
  const embersPerDay = s.embers / s.days;
  const faintRate = s.runs > 0 ? Math.round((s.faints / s.runs) * 100) : 0;
  const h1 = s.firstClear[1] !== undefined ? `${s.firstClear[1]}d` : '—';
  const h2 = s.firstClear[2] !== undefined ? `${s.firstClear[2]}d` : '—';
  const h3 = s.firstClear[3] !== undefined ? `${s.firstClear[3]}d` : '—';
  const attempt = (h: 1 | 2 | 3): string => {
    const fa = s.firstAttempts[h];
    if (!fa || fa.attempts === 0) return '—';
    return `${Math.round((fa.faints / fa.attempts) * 100)}%`;
  };
  console.log(
    `${def.key.padEnd(9)} | runs ${s.runs.toString().padStart(3)} (${runsPerDay.toFixed(2)}/d) | clears ${String(s.clears).padStart(3)} | ` +
      `faint ${String(s.faints).padStart(3)} (${faintRate}%) | retreat ${String(s.retreats).padStart(3)} | Embers ${String(s.embers).padStart(4)} (${embersPerDay.toFixed(1)}/d) | ` +
      `H1 ${h1} H2 ${h2} H3 ${h3}`,
  );
  console.log(
    `${''.padEnd(9)} | first-attempt faint rate: H1 ${attempt(1)}  H2 ${attempt(2)}  H3 ${attempt(3)}`,
  );
}

/** The Breaker sweeps each build with these routes, never retreating on HP. */
export const BREAKER_ROUTES: readonly AutopilotPolicy['route'][] = ['safe', 'balanced', 'greedy'];
/** The Breaker probes the level ceiling rather than a fresh account, to find the strongest case. */
export const BREAKER_LEVEL = 20;

/**
 * A maximally kitted meta: every Forge node, every talent node on every build, buildings at the
 * +10% cap, full codex mastery, three unlocked Habit Cards, and a crafted consumable loadout. Used
 * only by the Breaker probe, so a degenerate build has nowhere to hide.
 */
export function buildMaxMeta(): DelveMeta {
  let meta: DelveMeta = {
    ...emptyMeta(),
    embers: 100_000,
    clearedHollows: [1, 2, 3],
    materials: { ore: 99, herb: 99, echo: 99 },
    knownWeaknesses: Object.keys(ELEMENTS) as DelveMeta['knownWeaknesses'],
    bossKnowledge: BOSSES.map((b) => b.id),
  };
  for (const node of FORGE_NODES) {
    for (let lvl = 0; lvl < node.maxLevel; lvl++) {
      const r = buyForgeNode(meta.forge, meta.embers, node.id);
      if (r.bought) meta = { ...meta, forge: r.forge, embers: r.embers };
    }
  }
  for (const build of BUILDS) {
    for (const branch of build.treeBranches) {
      for (const node of branch.nodes) {
        const r = buyTreeNode(meta, build.id, node.id);
        if (r.bought) meta = r.meta;
      }
    }
  }
  meta = { ...meta, embers: 100_000, materials: { ore: 99, herb: 99, echo: 99 } };
  const milestones = buildingMilestones({
    savingsGoalReached: true,
    weeklyReviewDone: true,
    companionLevel: BREAKER_LEVEL,
    totalLoggedDays: 99,
  });
  for (const b of BUILDINGS) meta = unlockBuilding(meta, b.id, milestones).meta;
  for (const b of BUILDINGS) {
    for (let lvl = 1; lvl < b.maxLevel; lvl++) {
      const r = upgradeBuilding(meta, b.id);
      if (r.ok) meta = r.meta;
    }
  }
  meta = gainMastery(
    meta,
    CODEX_SPECIES.flatMap((id) => Array.from({ length: 11 }, () => id)),
  );
  meta = {
    ...meta,
    cards: CARDS.filter((c) => cardUnlocked(c.id, meta, BREAKER_LEVEL))
      .slice(0, 3)
      .map((c) => c.id),
  };
  for (const c of CONSUMABLES) {
    const r = craftConsumable(meta, c.id);
    if (r.ok) meta = r.meta;
  }
  for (const c of CONSUMABLES.slice(0, 3)) {
    const r = equipConsumable(meta, c.id);
    if (r.ok) meta = r.meta;
  }
  return meta;
}

export interface BreakerResult {
  buildId: string;
  route: AutopilotPolicy['route'];
  heat: number;
  /** Floors the hollow needs to clear (10 in Hollow 3). */
  floorTarget: number;
  deepestFloor: number;
  clearedInADay: boolean;
  steps: number;
}

/**
 * Breaker probe (SPEC 6.11 N): with the maxed meta, Heat 5 and Hollow 3, spend only Trickle's free
 * oil for `days` days and see whether any build clears. A clear inside a day is a balance failure.
 */
export function runBreaker(
  days = 1,
  seeds: readonly number[] = [0xb1e0001, 0xb1e0002],
): BreakerResult[] {
  const out: BreakerResult[] = [];
  for (const build of BUILDS) {
    for (const route of BREAKER_ROUTES) {
      let deepestFloor = 0;
      let clearedInADay = false;
      let steps = 0;
      for (const userSeed of seeds) {
        let meta = buildMaxMeta();
        let oil = 0;
        let now = 1_700_000_000_000;
        let run: RunState | null = null;
        const policy: AutopilotPolicy = {
          mode: 'autopilot',
          tagPriority: ['fury', 'guard', 'vigor', 'fortune', 'thrift'] as BoonTag[],
          retreatHpPercent: 0,
          route,
        };
        let clearedToday = false;
        for (let day = 1; day <= days; day++) {
          oil = Math.min(oilCapacity(meta, false), oil + dailyOil(PERSONAS.trickle, day));
          let guard = 0;
          while (oil > 0 && guard < 500) {
            guard += 1;
            if (!run) {
              run = newRun(userSeed, 3, BREAKER_LEVEL, meta, build.id, HEAT_MAX);
              meta = { ...meta, runsStarted: meta.runsStarted + 1 };
            }
            const ctx: StepContext = {
              now,
              oil,
              oilCapacity: oilCapacity(meta, false),
              signals: PERSONAS.trickle.signals(day),
              meta,
              policy,
              today: `2026-10-${String(day).padStart(2, '0')}`,
            };
            const step = stepRun(run, ctx);
            if (step.oilSpent === 0 && !step.ended) break;
            run = step.run;
            meta = step.meta;
            oil = spendOil(oil, step.oilSpent);
            now += 30_000;
            steps += 1;
            if (run.floor > deepestFloor) deepestFloor = run.floor;
            if (run.result !== 'active') {
              if (day === 1 && run.result === 'cleared') clearedToday = true;
              run = null;
              if (oil < 1) break;
            }
          }
        }
        clearedInADay ||= clearedToday;
      }
      out.push({
        buildId: build.id,
        route,
        heat: HEAT_MAX,
        floorTarget: HOLLOW_FLOORS[3],
        deepestFloor,
        clearedInADay,
        steps,
      });
    }
  }
  return out;
}

function reportBreaker(results: BreakerResult[]): boolean {
  const degenerate = results.filter((r) => r.clearedInADay);
  for (const r of results) {
    console.log(
      `Breaker  | ${r.buildId.padEnd(7)} ${r.route.padEnd(9)} | Heat ${r.heat} Hollow 3 | ` +
        `deepest floor ${r.deepestFloor}/${r.floorTarget} | ` +
        `${String(r.steps).padStart(3)} steps | ${r.clearedInADay ? 'CLEARED IN A DAY' : 'no clear'}`,
    );
  }
  return degenerate.length === 0;
}

// CLI entry: only run the report when executed directly (tests import the runner instead).
const isCli = process.argv[1]?.includes('sim-delve');
if (isCli) {
  const args = process.argv.slice(2);
  const days = Number(args.find((_a, i) => args[i - 1] === '--days') ?? 60);
  const personaArg = args.find((_a, i) => args[i - 1] === '--persona') ?? 'all';
  const SEEDS = 5;

  console.log(
    `sim:delve — ${days} simulated days, deterministic Autopilot (${POLICY.route}, retreat ≤${POLICY.retreatHpPercent}% HP), ${SEEDS} seeds averaged`,
  );
  console.log('');

  const keys =
    personaArg === 'all' ? Object.keys(PERSONAS) : personaArg === 'breaker' ? [] : [personaArg];
  for (const key of keys) {
    const def = PERSONAS[key];
    if (!def) {
      console.error(`Unknown persona: ${key}`);
      process.exit(1);
    }
    const runs: PersonaStats[] = [];
    for (let s = 0; s < SEEDS; s++) {
      runs.push(runPersona(def, days, 0x5eed0000 + def.key.length * 0x1000 + s));
    }
    const avg: PersonaStats = {
      days,
      runs: 0,
      clears: 0,
      faints: 0,
      retreats: 0,
      embers: 0,
      totalFloors: 0,
      firstClear: {},
      firstAttempts: {},
    };
    for (const r of runs) {
      avg.runs += r.runs;
      avg.clears += r.clears;
      avg.faints += r.faints;
      avg.retreats += r.retreats;
      avg.embers += r.embers;
      avg.totalFloors += r.totalFloors;
    }
    avg.runs = Math.round(avg.runs / SEEDS);
    avg.clears = Math.round(avg.clears / SEEDS);
    avg.faints = Math.round(avg.faints / SEEDS);
    avg.retreats = Math.round(avg.retreats / SEEDS);
    avg.embers = Math.round(avg.embers / SEEDS);
    for (const hollow of [1, 2, 3] as const) {
      const days_ = runs
        .map((r) => r.firstClear[hollow])
        .filter((d): d is number => d !== undefined);
      if (days_.length > 0)
        avg.firstClear[hollow] = Math.round(days_.reduce((a, b) => a + b, 0) / days_.length);
      const faints = runs.reduce((sum, r) => sum + (r.firstAttempts[hollow]?.faints ?? 0), 0);
      const attempts = runs.reduce((sum, r) => sum + (r.firstAttempts[hollow]?.attempts ?? 0), 0);
      if (attempts > 0) avg.firstAttempts[hollow] = { faints, attempts };
    }
    report(def, avg);
  }

  if (personaArg === 'all' || personaArg === 'breaker') {
    console.log('');
    console.log('Breaker check — every build at max meta, Heat 5 Hollow 3, on Trickle daily oil:');
    const ok = reportBreaker(runBreaker(1, [0xb1e0001, 0xb1e0002, 0xb1e0003]));
    if (!ok) {
      console.error(
        'Balance check FAILED: a maxed build cleared Heat 5 Hollow 3 within one day of Trickle oil.',
      );
      process.exit(1);
    }
    console.log('Breaker check passed: no build one-days the deepest Hollow.');
  }
}
