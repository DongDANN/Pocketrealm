/**
 * Delve builds: Warden (guard), Spark (fury), Broker (fortune). Each build is a stat profile
 * applied on top of companionBase, two active skills + one passive, and a 12-node talent tree
 * (3 branches of 4) bought with Embers. Respec is free and refunds everything.
 */

import type { BoonTag, DelveMeta, HollowId } from '../types';
import type { Element } from './elements';

export type BuildId = 'warden' | 'spark' | 'broker';

export const TREE_BRANCHES = 3;
export const TREE_NODES_PER_BRANCH = 4;
export const DEFAULT_BUILD: BuildId = 'warden';

/** Cost per node by position within its branch (1st..4th). */
export const NODE_COSTS = [8, 12, 16, 20] as const;

export type TreeNodeFx =
  | { kind: 'stat'; stat: 'maxHp' | 'atk' | 'def' | 'spd' | 'luck'; add: number }
  | { kind: 'critChance'; add: number }
  | { kind: 'critDamage'; mult: number }
  | { kind: 'roomShield'; amount: number }
  | { kind: 'damageReduction'; percent: number }
  | { kind: 'healAfterCombat'; percent: number };

/** On-hit effects for active skills. */
export interface SkillHitFx {
  /** Gain shield equal to this fraction of damage dealt. */
  shieldPercent?: number;
  /** Status applied to the target. */
  status?: string;
  statusDuration?: number;
  /** Extra flat crit chance for this hit. */
  bonusCrit?: number;
  /** Damage multiplier when the target is already burning. */
  bonusIfBurning?: number;
}

export type PassiveFx =
  { kind: 'startShield'; amount: number } | { kind: 'critBurn'; duration: number };

export interface SkillDef {
  id: string;
  name: string;
  kind: 'active' | 'passive';
  /** Card roles: guard = defensive/utility, burst = heavy damage. */
  role?: 'guard' | 'burst';
  element?: Element;
  energyCost?: number;
  cooldown?: number;
  power?: number;
  effect: string;
  fx?: SkillHitFx | PassiveFx;
}

export interface TreeNodeDef {
  id: string;
  name: string;
  effect: string;
  fx: TreeNodeFx;
}

export interface TreeBranchDef {
  id: string;
  name: string;
  nodes: TreeNodeDef[];
}

export interface BuildDef {
  id: BuildId;
  name: string;
  tags: BoonTag[];
  /** Additive stat adjustments on top of companionBase. Warden is the zero baseline. */
  profile: { hpAdd: number; atkAdd: number; defAdd: number; spdAdd: number; luckAdd: number };
  skills: SkillDef[];
  treeBranches: TreeBranchDef[];
  unlock:
    | { kind: 'always' }
    | { kind: 'level'; value: number }
    | { kind: 'hollowClear'; value: HollowId };
}

interface NodeSpec {
  name: string;
  effect: string;
  fx: TreeNodeFx;
}

function branch(build: BuildId, i: number, name: string, nodes: NodeSpec[]): TreeBranchDef {
  return {
    id: `${build}-b${i + 1}`,
    name,
    nodes: nodes.map((n, j) => ({ id: `${build}-b${i + 1}-n${j + 1}`, ...n })),
  };
}

export const BUILDS: readonly BuildDef[] = [
  {
    id: 'warden',
    name: 'Warden',
    tags: ['guard'],
    profile: { hpAdd: 0, atkAdd: 0, defAdd: 0, spdAdd: 0, luckAdd: 0 },
    skills: [
      {
        id: 'warden-bastion',
        name: 'Bastion',
        kind: 'active',
        role: 'guard',
        element: 'frost',
        energyCost: 4,
        cooldown: 4,
        power: 1.05,
        effect: 'A steady strike that gains Shield equal to a quarter of the damage dealt.',
        fx: { shieldPercent: 0.25 },
      },
      {
        id: 'warden-shieldbash',
        name: 'Shield Bash',
        kind: 'active',
        role: 'burst',
        element: 'gale',
        energyCost: 4,
        cooldown: 4,
        power: 1.15,
        effect: 'A heavy bash that briefly Chills the target.',
        fx: { status: 'chill', statusDuration: 2 },
      },
      {
        id: 'warden-steadfast',
        name: 'Steadfast',
        kind: 'passive',
        effect: 'Gain 1 Shield at the start of every battle.',
        fx: { kind: 'startShield', amount: 1 },
      },
    ],
    treeBranches: [
      branch('warden', 0, 'Bulwark', [
        { name: 'Stone Skin', effect: '+2 DEF', fx: { kind: 'stat', stat: 'def', add: 2 } },
        { name: 'Iron Hide', effect: '+3 DEF', fx: { kind: 'stat', stat: 'def', add: 3 } },
        {
          name: 'Bastion Wall',
          effect: 'Start battles with 6 Shield',
          fx: { kind: 'roomShield', amount: 6 },
        },
        {
          name: 'Unbreakable',
          effect: 'Damage taken reduced by 5%',
          fx: { kind: 'damageReduction', percent: 5 },
        },
      ]),
      branch('warden', 1, 'Vanguard', [
        { name: 'Heavy Hand', effect: '+2 ATK', fx: { kind: 'stat', stat: 'atk', add: 2 } },
        {
          name: 'Crushing Blows',
          effect: 'Crit damage +15%',
          fx: { kind: 'critDamage', mult: 0.15 },
        },
        {
          name: 'Battle Scars',
          effect: 'Damage taken reduced by 5%',
          fx: { kind: 'damageReduction', percent: 5 },
        },
        { name: 'Juggernaut', effect: '+5 max HP', fx: { kind: 'stat', stat: 'maxHp', add: 5 } },
      ]),
      branch('warden', 2, 'Watchman', [
        { name: 'Keen Eye', effect: '+3 LUCK', fx: { kind: 'stat', stat: 'luck', add: 3 } },
        { name: 'Quick Step', effect: '+1 SPD', fx: { kind: 'stat', stat: 'spd', add: 1 } },
        {
          name: 'Stalwart',
          effect: 'Heal 5% HP after each battle',
          fx: { kind: 'healAfterCombat', percent: 5 },
        },
        { name: 'Last Stand', effect: 'Crit chance +3%', fx: { kind: 'critChance', add: 3 } },
      ]),
    ],
    unlock: { kind: 'always' },
  },
  {
    id: 'spark',
    name: 'Spark',
    tags: ['fury'],
    profile: { hpAdd: -6, atkAdd: 2, defAdd: -1, spdAdd: 0, luckAdd: 3 },
    skills: [
      {
        id: 'spark-flare',
        name: 'Flare',
        kind: 'active',
        role: 'burst',
        element: 'ember',
        energyCost: 3,
        cooldown: 2,
        power: 1.5,
        effect: 'A bright burst that Burns the target.',
        fx: { status: 'burn', statusDuration: 3 },
      },
      {
        id: 'spark-kindling',
        name: 'Kindling',
        kind: 'active',
        role: 'burst',
        element: 'ember',
        energyCost: 2,
        cooldown: 2,
        power: 1.3,
        effect: 'Quick strikes that hit 40% harder on burning targets.',
        fx: { status: 'burn', statusDuration: 3, bonusIfBurning: 0.4 },
      },
      {
        id: 'spark-ignition',
        name: 'Ignition',
        kind: 'passive',
        effect: 'Crits apply Burn to the target.',
        fx: { kind: 'critBurn', duration: 3 },
      },
    ],
    treeBranches: [
      branch('spark', 0, 'Combustion', [
        { name: 'Flash Point', effect: '+2 ATK', fx: { kind: 'stat', stat: 'atk', add: 2 } },
        { name: 'Hot Coals', effect: '+2 ATK', fx: { kind: 'stat', stat: 'atk', add: 2 } },
        { name: 'Backdraft', effect: 'Crit chance +5%', fx: { kind: 'critChance', add: 5 } },
        { name: 'Inferno', effect: 'Crit damage +25%', fx: { kind: 'critDamage', mult: 0.25 } },
      ]),
      branch('spark', 1, 'Wildfire', [
        { name: 'Sparks', effect: '+3 LUCK', fx: { kind: 'stat', stat: 'luck', add: 3 } },
        { name: 'Rekindle', effect: 'Crit damage +15%', fx: { kind: 'critDamage', mult: 0.15 } },
        {
          name: 'Cinder Guard',
          effect: 'Start battles with 4 Shield',
          fx: { kind: 'roomShield', amount: 4 },
        },
        { name: 'Scorch', effect: '+2 ATK', fx: { kind: 'stat', stat: 'atk', add: 2 } },
      ]),
      branch('spark', 2, 'Emberfall', [
        { name: 'Cinder Step', effect: '+1 SPD', fx: { kind: 'stat', stat: 'spd', add: 1 } },
        {
          name: 'Glow',
          effect: 'Heal 5% HP after each battle',
          fx: { kind: 'healAfterCombat', percent: 5 },
        },
        { name: 'Rising Heat', effect: 'Crit chance +5%', fx: { kind: 'critChance', add: 5 } },
        { name: 'Supernova', effect: 'Crit damage +25%', fx: { kind: 'critDamage', mult: 0.25 } },
      ]),
    ],
    unlock: { kind: 'level', value: 8 },
  },
  {
    id: 'broker',
    name: 'Broker',
    tags: ['fortune'],
    profile: { hpAdd: 0, atkAdd: -1, defAdd: 0, spdAdd: 1, luckAdd: 4 },
    skills: [
      {
        id: 'broker-marktrade',
        name: 'Mark & Trade',
        kind: 'active',
        role: 'guard',
        element: 'umbra',
        energyCost: 3,
        cooldown: 3,
        power: 1.5,
        effect: 'Marks the target; marked enemies take 25% more damage.',
        fx: { status: 'mark', statusDuration: 2 },
      },
      {
        id: 'broker-glintswipe',
        name: 'Glint Swipe',
        kind: 'active',
        role: 'burst',
        element: 'gale',
        energyCost: 4,
        cooldown: 4,
        power: 1.4,
        effect: 'A fast swipe that often crits.',
        fx: { bonusCrit: 30 },
      },
      {
        id: 'broker-bargain',
        name: 'Bargain',
        kind: 'passive',
        effect: 'Boon offers always include your top tag (Fortune).',
      },
    ],
    treeBranches: [
      branch('broker', 0, 'Ledger', [
        {
          name: 'Compound Interest',
          effect: '+2 LUCK',
          fx: { kind: 'stat', stat: 'luck', add: 2 },
        },
        { name: 'Margin Call', effect: '+2 ATK', fx: { kind: 'stat', stat: 'atk', add: 2 } },
        {
          name: 'Liquidity',
          effect: 'Start battles with 5 Shield',
          fx: { kind: 'roomShield', amount: 5 },
        },
        { name: 'Golden Ratio', effect: 'Crit chance +5%', fx: { kind: 'critChance', add: 5 } },
      ]),
      branch('broker', 1, 'Vault', [
        { name: 'Safety Deposit', effect: '+3 DEF', fx: { kind: 'stat', stat: 'def', add: 3 } },
        { name: 'Overdraft', effect: 'Crit damage +15%', fx: { kind: 'critDamage', mult: 0.15 } },
        { name: 'Audit', effect: '+2 LUCK', fx: { kind: 'stat', stat: 'luck', add: 2 } },
        { name: 'Fortune', effect: '+2 ATK', fx: { kind: 'stat', stat: 'atk', add: 2 } },
      ]),
      branch('broker', 2, 'Exchange', [
        { name: 'Arbitrage', effect: '+1 SPD', fx: { kind: 'stat', stat: 'spd', add: 1 } },
        {
          name: 'Hedged',
          effect: 'Damage taken reduced by 5%',
          fx: { kind: 'damageReduction', percent: 5 },
        },
        {
          name: 'Windfall',
          effect: 'Heal 5% HP after each battle',
          fx: { kind: 'healAfterCombat', percent: 5 },
        },
        {
          name: 'Closing Bell',
          effect: '+10 max HP',
          fx: { kind: 'stat', stat: 'maxHp', add: 10 },
        },
      ]),
    ],
    unlock: { kind: 'hollowClear', value: 1 },
  },
];

export function buildById(id: string): BuildDef | undefined {
  return BUILDS.find((b) => b.id === id);
}

export function buildUnlocked(id: BuildId, meta: DelveMeta, companionLevel: number): boolean {
  const b = buildById(id);
  if (!b) return false;
  switch (b.unlock.kind) {
    case 'always':
      return true;
    case 'level':
      return companionLevel >= b.unlock.value;
    case 'hollowClear':
      return meta.clearedHollows.includes(b.unlock.value);
  }
}

export function treeNodeById(buildId: string, nodeId: string): TreeNodeDef | undefined {
  return buildById(buildId)
    ?.treeBranches.flatMap((br) => br.nodes)
    .find((n) => n.id === nodeId);
}

function buildState(meta: DelveMeta, buildId: BuildId): { tree: string[]; spent: number } {
  return meta.builds[buildId] ?? { tree: [], spent: 0 };
}

export function buyTreeNode(
  meta: DelveMeta,
  buildId: BuildId,
  nodeId: string,
): { bought: boolean; meta: DelveMeta } {
  const b = buildById(buildId);
  if (!b) return { bought: false, meta };
  const state = buildState(meta, buildId);
  if (state.tree.includes(nodeId)) return { bought: false, meta };
  const branch = b.treeBranches.find((br) => br.nodes.some((n) => n.id === nodeId));
  const index = branch?.nodes.findIndex((n) => n.id === nodeId) ?? -1;
  if (index < 0) return { bought: false, meta };
  // Sequential branch prerequisite: all earlier nodes in the branch must be bought.
  const missing = branch!.nodes.slice(0, index).filter((n) => !state.tree.includes(n.id));
  if (missing.length > 0) return { bought: false, meta };
  const cost = NODE_COSTS[index];
  if (meta.embers < cost) return { bought: false, meta };
  const next = { tree: [...state.tree, nodeId], spent: state.spent + cost };
  return {
    bought: true,
    meta: { ...meta, embers: meta.embers - cost, builds: { ...meta.builds, [buildId]: next } },
  };
}

export function respecBuild(meta: DelveMeta, buildId: BuildId): DelveMeta {
  const state = buildState(meta, buildId);
  return {
    ...meta,
    embers: meta.embers + state.spent,
    builds: { ...meta.builds, [buildId]: { tree: [], spent: 0 } },
  };
}
