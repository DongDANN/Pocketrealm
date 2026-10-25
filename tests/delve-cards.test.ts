import { describe, expect, it } from 'vitest';
import {
  CARDS,
  buildById,
  cardById,
  cardUnlocked,
  computeModifiers,
  emptyMeta,
  evaluateCards,
  newRun,
  runCombat,
  type DelveMeta,
  type RunLogEntry,
  type RunState,
} from '../src/core/delve';

function zeroBuffs() {
  return { wardHp: 0, luckBonus: 0 };
}

function runWith(over: Partial<RunState> = {}): RunState {
  return { ...newRun(1, 1, 1, emptyMeta()), ...over };
}

function cardIds(ids: string[]): string[] {
  return ids.map((id) => cardById(id)!.id);
}

/** Sum of companion damage from the log (basic hits and skill hits, crits included). */
function dealt(log: RunLogEntry[]): number {
  let sum = 0;
  for (const l of log) {
    if (/^(CRIT! )?You (hit|use)/.test(l.text)) {
      const m = l.text.match(/for (\d+)\./);
      if (m) sum += Number(m[1]);
    }
  }
  return sum;
}

describe('Habit Card data', () => {
  it('ships about 10 cards with unique ids, conditions, actions, and effects', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(9);
    expect(CARDS.length).toBeLessThanOrEqual(12);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
    for (const c of CARDS) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.effect.length).toBeGreaterThan(0);
      expect(c.condition).toBeDefined();
      expect(c.action).toBeDefined();
    }
  });

  it('starts with four cards and gates the rest behind levels or clears', () => {
    const meta = emptyMeta();
    const starters = CARDS.filter((c) => cardUnlocked(c.id, meta, 1));
    expect(starters).toHaveLength(4);
    expect(cardUnlocked('finisher', meta, 2)).toBe(false);
    expect(cardUnlocked('finisher', meta, 3)).toBe(true);
    expect(cardUnlocked('mark-hunter', meta, 4)).toBe(false);
    expect(cardUnlocked('mark-hunter', meta, 5)).toBe(true);
    const cleared: DelveMeta = { ...meta, clearedHollows: [1] };
    expect(cardUnlocked('ember-first', cleared, 1)).toBe(true);
    expect(cardUnlocked('nope', meta, 20)).toBe(false);
  });

  it('equips at most three cards', () => {
    const meta: DelveMeta = {
      ...emptyMeta(),
      cards: ['rainy-day', 'steady-hand', 'finisher', 'mark-hunter'],
    };
    const run = newRun(1, 1, 5, meta);
    expect(run.cards).toEqual(['rainy-day', 'steady-hand', 'finisher']);
  });
});

describe('card evaluation', () => {
  const activesOf = (buildId: string) =>
    buildById(buildId)!.skills.filter((s) => s.kind === 'active');
  const warden = activesOf('warden');
  const spark = activesOf('spark');

  it('checks conditions against combat state', () => {
    const mk = (over: Partial<Parameters<typeof evaluateCards>[1]> = {}) => ({
      round: 3,
      energy: 4,
      hp: 60,
      maxHp: 100,
      cooldowns: {},
      actives: warden,
      targets: [{ hp: 50, maxHp: 100, marked: false, weakness: 'frost' as const }],
      ...over,
    });
    const rainy = cardById('rainy-day')!;
    const finisher = cardById('finisher')!;
    const hunter = cardById('mark-hunter')!;
    const ember = cardById('ember-first')!;
    // Rainy Day: hp 34.9% fires, 35% does not ("below 35%").
    expect(evaluateCards([rainy], mk({ hp: 34, maxHp: 100 })).fired?.id).toBe('rainy-day');
    expect(evaluateCards([rainy], mk({ hp: 35, maxHp: 100 })).fired).toBeNull();
    // Finisher: target below 30% hp.
    const targ = mk({ targets: [{ hp: 29, maxHp: 100, marked: false, weakness: 'frost' }] });
    expect(evaluateCards([finisher], targ).fired?.id).toBe('finisher');
    // Mark Hunter: needs a marked enemy.
    const marked = mk({
      targets: [{ hp: 50, maxHp: 100, marked: true, weakness: 'frost' }],
    });
    expect(evaluateCards([hunter], marked).fired?.id).toBe('mark-hunter');
    expect(evaluateCards([hunter], mk()).fired).toBeNull();
    // Ember First: first living enemy weak to ember (Spark has an ember skill).
    const weak = mk({
      actives: spark,
      targets: [{ hp: 50, maxHp: 100, marked: false, weakness: 'ember' }],
    });
    expect(evaluateCards([ember], weak).fired?.id).toBe('ember-first');
  });

  it('skips a card whose action is unavailable and reports why', () => {
    const state = {
      round: 1,
      energy: 1,
      hp: 60,
      maxHp: 100,
      cooldowns: {},
      actives: warden,
      targets: [{ hp: 50, maxHp: 100, marked: false, weakness: 'frost' as const }],
    };
    const d = evaluateCards([cardById('opening-move')!], state);
    expect(d.fired).toBeNull();
    expect(d.skipped).toHaveLength(1);
    expect(d.skipped[0]!.name).toBe('Opening Move');
    expect(d.skipped[0]!.reason).toContain('ready');
  });
});

describe('cards in auto-battle', () => {
  it('evaluates top to bottom, fires the first available card, and logs skips', () => {
    const run = runWith({
      buildId: 'warden',
      companionLevel: 1,
      unit: {
        id: 'c',
        kind: 'companion',
        name: 'Warden',
        hp: 960,
        maxHp: 60,
        atk: 10,
        def: 4,
        spd: 8,
        luck: 5,
      },
      cards: cardIds(['rainy-day', 'steady-hand']),
    });
    const mods = { ...computeModifiers(run, {}, zeroBuffs()), maxHp: 900 };
    const result = runCombat(run, { enemies: ['umbralmonarch'] }, mods, 1);
    expect(result.drawn).toBe(true);
    expect(result.log.some((l) => l.text.includes('fired Steady Hand'))).toBe(true);
    expect(result.log.some((l) => l.text.includes('skipped Rainy Day (HP'))).toBe(true);
  });

  it('fires Rainy Day when HP drops below 35% and uses the guard skill', () => {
    const run = runWith({
      buildId: 'warden',
      companionLevel: 1,
      unit: {
        id: 'c',
        kind: 'companion',
        name: 'Warden',
        hp: 100,
        maxHp: 60,
        atk: 10,
        def: 4,
        spd: 8,
        luck: 5,
      },
      cards: cardIds(['rainy-day', 'basic-discipline']),
    });
    const mods = { ...computeModifiers(run, {}, zeroBuffs()), maxHp: 900 };
    const result = runCombat(run, { enemies: ['umbralmonarch'] }, mods, 1);
    expect(result.log.some((l) => l.text.includes('fired Rainy Day'))).toBe(true);
    expect(result.log.some((l) => l.text.includes('use Bastion'))).toBe(true);
  });

  it('falls back to basic attacks when no card fires and logs why', () => {
    const run = runWith({
      buildId: 'warden',
      cards: cardIds(['opening-move']),
    });
    const result = runCombat(
      run,
      { enemies: ['tollbug'] },
      computeModifiers(run, {}, zeroBuffs()),
      1,
    );
    expect(result.log.some((l) => l.text.includes('none fired'))).toBe(true);
    // Round 1: condition true but no affordable skill; later rounds: condition false.
    expect(result.log.some((l) => l.text.includes('skipped Opening Move'))).toBe(true);
  });

  it('attacks marked enemies when Mark Hunter fires', () => {
    const run = runWith({
      buildId: 'broker',
      companionLevel: 1,
      unit: {
        id: 'c',
        kind: 'companion',
        name: 'Broker',
        hp: 960,
        maxHp: 60,
        atk: 10,
        def: 4,
        spd: 8,
        luck: 5,
      },
      cards: cardIds(['steady-hand', 'mark-hunter']),
    });
    const mods = { ...computeModifiers(run, {}, zeroBuffs()), maxHp: 900 };
    const result = runCombat(run, { enemies: ['umbralmonarch'] }, mods, 1);
    // Steady Hand casts Mark & Trade (marks the boss), then Mark Hunter takes over gaps.
    expect(result.log.some((l) => l.text.includes('use Mark & Trade'))).toBe(true);
    expect(result.log.some((l) => l.text.includes('fired Mark Hunter'))).toBe(true);
  });

  it('changes outcomes when cards are reordered', () => {
    // Basic Discipline (always -> basic) blocks every card after it, so order
    // decides whether Finisher ever gets to fire.
    const base = runWith({ buildId: 'warden', companionLevel: 6 });
    const mods = computeModifiers(base, {}, zeroBuffs());
    const room = { enemies: ['thorncrown'] };
    const a = runCombat(
      { ...base, cards: cardIds(['finisher', 'basic-discipline']) },
      room,
      mods,
      6,
    );
    const b = runCombat(
      { ...base, cards: cardIds(['basic-discipline', 'finisher']) },
      room,
      mods,
      6,
    );
    expect(a.log.some((l) => l.text.includes('fired Finisher'))).toBe(true);
    expect(b.log.some((l) => l.text.includes('fired Finisher'))).toBe(false);
    expect(b.log.some((l) => l.text.includes('fired Basic Discipline'))).toBe(true);
    expect(dealt(a.log)).not.toBe(dealt(b.log));
  });
});
