/**
 * The Forge: permanent meta progression bought with Embers. Seven stat nodes (29 levels total;
 * Gate 1.6 builds add the remaining branches); costs rise per level. Embers come only from runs
 * and can never be bought.
 */

import type { ForgeLevels } from './types';

export interface ForgeNode {
  id: string;
  name: string;
  maxLevel: number;
  /** Cost of buying level n+1 (0-based current level). */
  cost: (level: number) => number;
  effect: {
    stat:
      'maxHp' | 'atk' | 'def' | 'luck' | 'startGlint' | 'embersBonus' | 'oilCapacity' | 'rerolls';
    add: number;
  };
  blurb: string;
}

export const FORGE_NODES: readonly ForgeNode[] = [
  {
    id: 'maxhp',
    name: 'Sturdy Lantern',
    maxLevel: 5,
    cost: (l) => 15 + l * 10,
    effect: { stat: 'maxHp', add: 6 },
    blurb: '+6 max HP per level',
  },
  {
    id: 'atk',
    name: 'Sharpened Wick',
    maxLevel: 5,
    cost: (l) => 18 + l * 12,
    effect: { stat: 'atk', add: 2 },
    blurb: '+2 ATK per level',
  },
  {
    id: 'def',
    name: 'Tempered Glass',
    maxLevel: 5,
    cost: (l) => 18 + l * 12,
    effect: { stat: 'def', add: 2 },
    blurb: '+2 DEF per level',
  },
  {
    id: 'luck',
    name: "Finder's Charm",
    maxLevel: 3,
    cost: (l) => 25 + l * 15,
    effect: { stat: 'luck', add: 2 },
    blurb: '+2 LUCK per level',
  },
  {
    id: 'glint',
    name: 'Treasury Seed',
    maxLevel: 3,
    cost: (l) => 20 + l * 12,
    effect: { stat: 'startGlint', add: 10 },
    blurb: '+10 starting Glint per level',
  },
  {
    id: 'embers',
    name: 'Ember Ledger',
    maxLevel: 3,
    cost: (l) => 30 + l * 18,
    effect: { stat: 'embersBonus', add: 5 },
    blurb: '+5% Embers earned per level',
  },
  {
    id: 'oilcap',
    name: 'Wide-Mouth Lamp',
    maxLevel: 5,
    cost: (l) => 12 + l * 8,
    effect: { stat: 'oilCapacity', add: 20 },
    blurb: '+20 Lantern Oil capacity per level',
  },
  {
    id: 'reroll',
    name: 'Silver Lining',
    maxLevel: 3,
    cost: (l) => 20 + l * 15,
    effect: { stat: 'rerolls', add: 1 },
    blurb: '+1 boon-offer reroll per run per level',
  },
];

export function emptyForge(): ForgeLevels {
  return {};
}

export function buyForgeNode(
  forge: ForgeLevels,
  embers: number,
  nodeId: string,
): { forge: ForgeLevels; embers: number; bought: boolean; reason?: string } {
  const node = FORGE_NODES.find((n) => n.id === nodeId);
  if (!node) return { forge, embers, bought: false, reason: 'Unknown Forge node.' };
  const level = forge[nodeId] ?? 0;
  if (level >= node.maxLevel)
    return { forge, embers, bought: false, reason: 'Already at max level.' };
  const cost = node.cost(level);
  if (embers < cost) return { forge, embers, bought: false, reason: 'Not enough Embers.' };
  return {
    forge: { ...forge, [nodeId]: level + 1 },
    embers: embers - cost,
    bought: true,
  };
}

export function forgeTotals(forge: ForgeLevels): Record<string, number> {
  const totals: Record<string, number> = {
    maxHp: 0,
    atk: 0,
    def: 0,
    luck: 0,
    startGlint: 0,
    embersBonus: 0,
    oilCapacity: 0,
    rerolls: 0,
  };
  for (const node of FORGE_NODES) {
    const level = forge[node.id] ?? 0;
    const stat = node.effect.stat;
    if (stat in totals) totals[stat] = (totals[stat] ?? 0) + level * node.effect.add;
  }
  return totals;
}
