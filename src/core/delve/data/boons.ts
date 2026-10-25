/**
 * Boons and relics. 40 boons across 5 tags (guard/fury/fortune/vigor/thrift), 20 relics.
 * Effects are data-driven; the engine reads `fx` and applies it. No oil comes from boons or
 * relics — oil is only ever the free trickle plus logged habits (SPEC 6.9).
 */

import type { BoonTag, Rarity } from '../types';

export type BoonEffect =
  | { kind: 'stat'; stat: 'maxHp' | 'atk' | 'def' | 'spd' | 'luck'; add: number }
  | { kind: 'critChance'; add: number }
  | { kind: 'critDamage'; mult: number }
  | { kind: 'roomShield'; amount: number }
  | { kind: 'healAfterCombat'; percent: number }
  | { kind: 'healNow'; percent: number }
  | { kind: 'startGlint'; amount: number }
  | { kind: 'shopDiscount'; percent: number }
  | { kind: 'embersBonus'; percent: number }
  | { kind: 'damageReduction'; percent: number };

export interface Boon {
  id: string;
  name: string;
  tag: BoonTag;
  rarity: Rarity;
  fx: BoonEffect;
  /** Offer weight; rarity is also expressed in text and colour. */
  weight: number;
  /** Human-readable effect for logs and UI. */
  effect: string;
}

export interface Relic {
  id: string;
  name: string;
  rarity: Rarity;
  effect: string;
}

export const RARITY_WEIGHT: Record<Rarity, number> = {
  common: 60,
  uncommon: 25,
  rare: 12,
  epic: 3,
};

const boon = (
  id: string,
  name: string,
  tag: BoonTag,
  rarity: Rarity,
  fx: BoonEffect,
  weight: number,
  effect: string,
): Boon => ({ id, name, tag, rarity, fx, weight, effect });

export const BOONS: readonly Boon[] = [
  // --- guard: shields, armour, damage taken ---
  boon(
    'guard-ironhide',
    'Ironhide',
    'guard',
    'common',
    { kind: 'stat', stat: 'maxHp', add: 5 },
    14,
    '+10 max HP',
  ),
  boon(
    'guard-rootshell',
    'Rootshell',
    'guard',
    'common',
    { kind: 'stat', stat: 'def', add: 1 },
    14,
    '+2 DEF',
  ),
  boon(
    'guard-lanternbuckler',
    'Lantern Buckler',
    'guard',
    'uncommon',
    { kind: 'roomShield', amount: 3 },
    8,
    'Start each room with a 6 HP shield',
  ),
  boon(
    'guard-doorstop',
    'Doorstop',
    'guard',
    'uncommon',
    { kind: 'damageReduction', percent: 5 },
    8,
    'Take 8% less damage',
  ),
  boon(
    'guard-secondledger',
    'Second Ledger',
    'guard',
    'rare',
    { kind: 'stat', stat: 'maxHp', add: 9 },
    5,
    '+18 max HP',
  ),
  boon(
    'guard-hollowward',
    'Hollowward',
    'guard',
    'rare',
    { kind: 'roomShield', amount: 5 },
    5,
    'Start each room with a 10 HP shield',
  ),
  boon(
    'guard-copperplate',
    'Copperplate Skin',
    'guard',
    'epic',
    { kind: 'stat', stat: 'def', add: 2 },
    2,
    '+4 DEF',
  ),
  boon(
    'guard-vaultdoor',
    'Vault Door',
    'guard',
    'epic',
    { kind: 'damageReduction', percent: 9 },
    2,
    'Take 15% less damage',
  ),
  // --- fury: damage and crits ---
  boon(
    'fury-sharpquill',
    'Sharp Quill',
    'fury',
    'common',
    { kind: 'stat', stat: 'atk', add: 1 },
    14,
    '+3 ATK',
  ),
  boon(
    'fury-emberfist',
    'Ember Fist',
    'fury',
    'common',
    { kind: 'stat', stat: 'atk', add: 1 },
    12,
    '+2 ATK',
  ),
  boon(
    'fury-reckless',
    'Reckless Ledger',
    'fury',
    'uncommon',
    { kind: 'stat', stat: 'atk', add: 2 },
    8,
    '+4 ATK',
  ),
  boon(
    'fury-hawkeye',
    "Hawkeye's Coin",
    'fury',
    'uncommon',
    { kind: 'critChance', add: 2 },
    8,
    '+8% crit chance',
  ),
  boon(
    'fury-doubledown',
    'Double Down',
    'fury',
    'rare',
    { kind: 'critDamage', mult: 0.25 },
    5,
    'Crits hit 25% harder',
  ),
  boon(
    'fury-sundown',
    'Sundown Clause',
    'fury',
    'rare',
    { kind: 'stat', stat: 'atk', add: 3 },
    5,
    '+6 ATK',
  ),
  boon(
    'fury-lionheart',
    "Lionheart's Quill",
    'fury',
    'epic',
    { kind: 'stat', stat: 'atk', add: 4 },
    2,
    '+8 ATK',
  ),
  boon(
    'fury-gamblersgrin',
    "Gambler's Grin",
    'fury',
    'epic',
    { kind: 'critChance', add: 3 },
    2,
    '+15% crit chance',
  ),
  // --- fortune: luck and riches ---
  boon(
    'fortune-luckyclover',
    'Ledger Clover',
    'fortune',
    'common',
    { kind: 'stat', stat: 'luck', add: 1 },
    14,
    '+3 LUCK',
  ),
  boon(
    'fortune-glimmer',
    'Glimmer Pouch',
    'fortune',
    'common',
    { kind: 'startGlint', amount: 5 },
    14,
    '+10 starting Glint per floor',
  ),
  boon(
    'fortune-fourleaf',
    'Four-Leaf Note',
    'fortune',
    'uncommon',
    { kind: 'stat', stat: 'luck', add: 2 },
    8,
    '+5 LUCK',
  ),
  boon(
    'fortune-shiny',
    'Shiny Things',
    'fortune',
    'uncommon',
    { kind: 'startGlint', amount: 10 },
    8,
    '+20 starting Glint per floor',
  ),
  boon(
    'fortune-interest',
    'Compound Interest',
    'fortune',
    'rare',
    { kind: 'stat', stat: 'luck', add: 4 },
    5,
    '+8 LUCK',
  ),
  boon(
    'fortune-royalties',
    'Royalties',
    'fortune',
    'rare',
    { kind: 'embersBonus', percent: 6 },
    5,
    '+10% Embers earned',
  ),
  boon(
    'fortune-jackpot',
    'Jackpot',
    'fortune',
    'epic',
    { kind: 'embersBonus', percent: 12 },
    2,
    '+20% Embers earned',
  ),
  boon(
    'fortune-midas',
    'Midas Touch',
    'fortune',
    'epic',
    { kind: 'startGlint', amount: 20 },
    2,
    '+40 starting Glint per floor',
  ),
  // --- vigor: healing and endurance ---
  boon(
    'vigor-bandaid',
    'Bandage',
    'vigor',
    'common',
    { kind: 'healNow', percent: 12 },
    14,
    'Heal 20% HP now',
  ),
  boon(
    'vigor-canteen',
    'Canteen',
    'vigor',
    'common',
    { kind: 'healAfterCombat', percent: 4 },
    14,
    'Heal 6% HP after each combat',
  ),
  boon(
    'vigor-freshair',
    'Fresh Air',
    'vigor',
    'uncommon',
    { kind: 'healAfterCombat', percent: 6 },
    8,
    'Heal 10% HP after each combat',
  ),
  boon(
    'vigor-camping',
    'Campfire Stew',
    'vigor',
    'uncommon',
    { kind: 'healNow', percent: 21 },
    8,
    'Heal 35% HP now',
  ),
  boon(
    'vigor-secondwind',
    'Second Wind',
    'vigor',
    'rare',
    { kind: 'stat', stat: 'maxHp', add: 7 },
    5,
    '+14 max HP',
  ),
  boon(
    'vigor-trollblood',
    'Trollblood Tonic',
    'vigor',
    'rare',
    { kind: 'healAfterCombat', percent: 9 },
    5,
    'Heal 15% HP after each combat',
  ),
  boon(
    'vigor-phoenix',
    'Phoenix Down Payment',
    'vigor',
    'epic',
    { kind: 'healAfterCombat', percent: 13 },
    2,
    'Heal 22% HP after each combat',
  ),
  boon(
    'vigor-fountain',
    'Fountain Pen',
    'vigor',
    'epic',
    { kind: 'stat', stat: 'maxHp', add: 12 },
    2,
    '+24 max HP',
  ),
  // --- thrift: economy of the run ---
  boon(
    'thrift-coupon',
    'Coupon Clipper',
    'thrift',
    'common',
    { kind: 'shopDiscount', percent: 6 },
    14,
    'Shop prices -10%',
  ),
  boon(
    'thrift-budget',
    'Budget Binder',
    'thrift',
    'common',
    { kind: 'startGlint', amount: 7 },
    14,
    '+15 starting Glint per floor',
  ),
  boon(
    'thrift-bargain',
    'Bargain Bin',
    'thrift',
    'uncommon',
    { kind: 'shopDiscount', percent: 12 },
    8,
    'Shop prices -20%',
  ),
  boon(
    'thrift-sparechange',
    'Spare Change',
    'thrift',
    'uncommon',
    { kind: 'startGlint', amount: 12 },
    8,
    '+25 starting Glint per floor',
  ),
  boon(
    'thrift-rainyday',
    'Rainy Day Fund',
    'thrift',
    'rare',
    { kind: 'healAfterCombat', percent: 5 },
    5,
    'Heal 8% HP after each combat',
  ),
  boon(
    'thrift-wholesale',
    'Wholesale',
    'thrift',
    'rare',
    { kind: 'shopDiscount', percent: 18 },
    5,
    'Shop prices -30%',
  ),
  boon(
    'thrift-sinkingfund',
    'Sinking Fund',
    'thrift',
    'epic',
    { kind: 'startGlint', amount: 25 },
    2,
    '+50 starting Glint per floor',
  ),
  boon(
    'thrift-auditor',
    "Auditor's Eye",
    'thrift',
    'epic',
    { kind: 'embersBonus', percent: 9 },
    2,
    '+15% Embers earned',
  ),
];

export const RELICS: readonly Relic[] = [
  {
    id: 'relic-rainyday',
    name: 'Rainy Day Fund',
    rarity: 'rare',
    effect: 'Once per run: when HP drops below 30%, heal to 50%',
  },
  {
    id: 'relic-interest',
    name: 'Compound Interest',
    rarity: 'rare',
    effect: '+2% ATK for every floor cleared this run',
  },
  { id: 'relic-coupon', name: 'Coupon Clipper', rarity: 'uncommon', effect: 'Shop prices -20%' },
  {
    id: 'relic-lanternwick',
    name: 'Lantern Wick',
    rarity: 'uncommon',
    effect: 'Start each room with +4 shield',
  },
  {
    id: 'relic-piggybank',
    name: 'Piggy Bank',
    rarity: 'common',
    effect: '+20 starting Glint per floor',
  },
  {
    id: 'relic-firstcoin',
    name: 'First Coin',
    rarity: 'common',
    effect: 'The first room of each floor gives double Glint',
  },
  {
    id: 'relic-nightlight',
    name: 'Night Light',
    rarity: 'uncommon',
    effect: 'Rest rooms heal an extra 15%',
  },
  {
    id: 'relic-ledgerlace',
    name: 'Ledger Lace',
    rarity: 'rare',
    effect: '+1 boon choice from offers',
  },
  {
    id: 'relic-inkwell',
    name: 'Bottomless Inkwell',
    rarity: 'epic',
    effect: 'Boons can be offered one rarity higher',
  },
  {
    id: 'relic-quill',
    name: "Scribe's Quill",
    rarity: 'uncommon',
    effect: '+1 LUCK per boon held',
  },
  {
    id: 'relic-eraser',
    name: 'Big Eraser',
    rarity: 'rare',
    effect: 'Once per run: refuse a boon offer and reroll it',
  },
  {
    id: 'relic-stamp',
    name: 'Approved Stamp',
    rarity: 'common',
    effect: 'Events always show their safer option first',
  },
  {
    id: 'relic-safebox',
    name: 'Safe Box',
    rarity: 'uncommon',
    effect: 'Fainting banks 70% of Embers instead of 60%',
  },
  {
    id: 'relic-trailmix',
    name: 'Trail Mix',
    rarity: 'common',
    effect: 'Heal 8% HP when entering a new floor',
  },
  {
    id: 'relic-compass',
    name: 'Brass Compass',
    rarity: 'rare',
    effect: 'Route forks show room types one row deeper',
  },
  {
    id: 'relic-matchbook',
    name: 'Matchbook',
    rarity: 'uncommon',
    effect: 'Elites take 5% more damage',
  },
  {
    id: 'relic-bell',
    name: 'Dinner Bell',
    rarity: 'common',
    effect: 'The boss telegraphs one round earlier',
  },
  {
    id: 'relic-scale',
    name: "Merchant's Scale",
    rarity: 'rare',
    effect: 'Shops gain one extra item',
  },
  {
    id: 'relic-hammock',
    name: 'Travel Hammock',
    rarity: 'uncommon',
    effect: 'Retreat keeps your Glint for the next run',
  },
  { id: 'relic-fossil', name: 'Amber Fossil', rarity: 'epic', effect: 'Embers earned are +25%' },
];

export function boonById(id: string): Boon | undefined {
  return BOONS.find((x) => x.id === id);
}

export function relicById(id: string): Relic | undefined {
  return RELICS.find((x) => x.id === id);
}
