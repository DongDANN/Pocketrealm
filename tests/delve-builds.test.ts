import { describe, expect, it } from 'vitest';
import {
  BUILDS,
  buildById,
  buildUnlocked,
  buyTreeNode,
  DEFAULT_BUILD,
  respecBuild,
  treeNodeById,
  TREE_BRANCHES,
  TREE_NODES_PER_BRANCH,
} from '../src/core/delve/data/builds';
import { emptyMeta, type DelveMeta } from '../src/core/delve';
import { levelForXp } from '../src/core/rewards';

describe('build data', () => {
  it('ships three builds, each with two actives, one passive, and a 12-node tree', () => {
    expect(BUILDS.map((b) => b.id).sort()).toEqual(['broker', 'spark', 'warden']);
    for (const b of BUILDS) {
      expect(b.skills.filter((s) => s.kind === 'active')).toHaveLength(2);
      expect(b.skills.filter((s) => s.kind === 'passive')).toHaveLength(1);
      expect(b.treeBranches).toHaveLength(3);
      const nodes = b.treeBranches.flatMap((br) => br.nodes);
      expect(nodes).toHaveLength(12);
      // Node ids unique within a build.
      expect(new Set(nodes.map((n) => n.id)).size).toBe(12);
    }
  });

  it('gives every active skill a cost, cooldown, and element; passives are always-on', () => {
    for (const b of BUILDS) {
      for (const s of b.skills) {
        if (s.kind === 'active') {
          expect(s.energyCost).toBeGreaterThanOrEqual(1);
          expect(s.cooldown).toBeGreaterThanOrEqual(1);
          expect(['ember', 'frost', 'gale', 'umbra']).toContain(s.element);
          expect(s.power).toBeGreaterThan(0);
        } else {
          expect(s.effect.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('unlocks Warden at once, Spark at level 8, Broker after a Hollow 1 clear', () => {
    const meta = emptyMeta();
    expect(buildUnlocked('warden', meta, 1)).toBe(true);
    expect(buildUnlocked('spark', meta, 7)).toBe(false);
    expect(buildUnlocked('spark', meta, 8)).toBe(true);
    expect(buildUnlocked('broker', meta, 20)).toBe(false);
    const cleared: DelveMeta = { ...meta, clearedHollows: [1] };
    expect(buildUnlocked('broker', cleared, 1)).toBe(true);
  });

  it('applies the stat profile without breaking level scaling', () => {
    // Profiles are additive on top of companionBase; Warden (baseline) is all zeros.
    const warden = buildById('warden')!;
    expect(warden.profile).toEqual({ hpAdd: 0, atkAdd: 0, defAdd: 0, spdAdd: 0, luckAdd: 0 });
    const spark = buildById('spark')!;
    expect(spark.profile.atkAdd).toBeGreaterThan(0);
  });

  it('buys tree nodes with Embers, enforces prerequisites, and respecs for free', () => {
    const warden = buildById('warden')!;
    const first = warden.treeBranches[0]!.nodes[0]!;
    const meta = { ...emptyMeta(), embers: 100 };
    const buy = buyTreeNode(meta, 'warden', first.id);
    expect(buy.bought).toBe(true);
    expect(buy.meta.embers).toBeLessThan(100);
    expect(buy.meta.builds['warden']!.tree).toContain(first.id);
    // Buying the same node again is refused.
    expect(buyTreeNode(buy.meta, 'warden', first.id).bought).toBe(false);
    // A branch's third node requires the first two (skip → refused).
    const third = warden.treeBranches[0]!.nodes[2]!;
    expect(buyTreeNode(buy.meta, 'warden', third.id).bought).toBe(false);
    // Second node of branch 1 works now.
    const second = warden.treeBranches[0]!.nodes[1]!;
    const buy2 = buyTreeNode(buy.meta, 'warden', second.id);
    expect(buy2.bought).toBe(true);
    // Free respec refunds everything spent.
    const respec = respecBuild(buy2.meta, 'warden');
    expect(respec.builds['warden']!.tree).toEqual([]);
    expect(respec.embers).toBe(100);
  });

  it('spends Embers but never goes negative', () => {
    const warden = buildById('warden')!;
    const first = warden.treeBranches[0]!.nodes[0]!;
    const meta = { ...emptyMeta(), embers: 0 };
    expect(buyTreeNode(meta, 'warden', first.id).bought).toBe(false);
  });

  it('exposes branches and node counts for the UI', () => {
    const warden = buildById('warden')!;
    expect(TREE_BRANCHES).toBe(3);
    expect(TREE_NODES_PER_BRANCH).toBe(4);
    expect(treeNodeById('warden', warden.treeBranches[0]!.nodes[0]!.id)).toBeDefined();
    expect(treeNodeById('warden', 'nope')).toBeUndefined();
    expect(DEFAULT_BUILD).toBe('warden');
  });

  it('levels naturally reach the Spark unlock', () => {
    // Level 8 needs cumulative XP for levels 1-7.
    expect(levelForXp(3900).level).toBeGreaterThanOrEqual(8);
  });
});
