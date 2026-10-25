/**
 * Event rooms: short text choices with real risk and reward. Options are deterministic from the
 * room's optionSeed. The safer option is listed first when the "Approved Stamp" relic is held.
 */

import type { HollowId } from '../types';

export type EventOutcome =
  | { kind: 'heal'; percent: number }
  | { kind: 'damage'; amount: number }
  | { kind: 'boon' }
  | { kind: 'glint'; amount: number }
  | { kind: 'embers'; amount: number };

export interface DelveEvent {
  id: string;
  hollow: HollowId;
  title: string;
  text: string;
  options: { id: string; label: string; outcome: EventOutcome; detail: string }[];
}

export const EVENTS: readonly DelveEvent[] = [
  // Hollow 1 — Rootfall Warren
  {
    id: 'h1-roots',
    hollow: 1,
    title: 'A Wall of Roots',
    text: 'The corridor ahead is choked with old roots. Something gleams deep inside the tangle.',
    options: [
      {
        id: 'burn',
        label: 'Burn through with the lantern',
        outcome: { kind: 'boon' },
        detail: 'Risk a fight for a boon.',
      },
      {
        id: 'wait',
        label: 'Wait for the roots to settle',
        outcome: { kind: 'heal', percent: 15 },
        detail: 'Rest while the roots creak.',
      },
    ],
  },
  {
    id: 'h1-toll',
    hollow: 1,
    title: 'The Tollkeeper',
    text: 'A drowsy tollbug blocks a shortcut, rattling a coin for passage.',
    options: [
      {
        id: 'pay',
        label: 'Pay 20 Glint',
        outcome: { kind: 'glint', amount: -20 },
        detail: 'Safe passage.',
      },
      {
        id: 'sneak',
        label: 'Try to sneak past',
        outcome: { kind: 'damage', amount: 12 },
        detail: 'It might wake up. It always wakes up.',
      },
    ],
  },
  {
    id: 'h1-cache',
    hollow: 1,
    title: "A Gardener's Cache",
    text: 'A half-buried crate, wrapped in moss. The latch looks hungry.',
    options: [
      {
        id: 'open',
        label: 'Pry it open',
        outcome: { kind: 'glint', amount: 35 },
        detail: 'Gain Glint.',
      },
      {
        id: 'leave',
        label: 'Leave it be',
        outcome: { kind: 'heal', percent: 10 },
        detail: 'Peace of mind heals a little.',
      },
    ],
  },
  {
    id: 'h1-ember',
    hollow: 1,
    title: 'A Faint Ember',
    text: 'An old campfire ring holds one ember that refuses to die.',
    options: [
      {
        id: 'feed',
        label: 'Feed it a coin',
        outcome: { kind: 'embers', amount: 6 },
        detail: 'A strange trade: Glint for warmth. Gain 6 Embers.',
      },
      {
        id: 'warm',
        label: 'Warm your hands',
        outcome: { kind: 'heal', percent: 25 },
        detail: 'Heal 25% HP.',
      },
    ],
  },
  // Hollow 2 — Cinder Vault
  {
    id: 'h2-bellows',
    hollow: 2,
    title: 'Broken Bellows',
    text: 'A forge bellows wheezes in the dark. Fixing it might clear the ash — or wake something.',
    options: [
      {
        id: 'fix',
        label: 'Fix the bellows',
        outcome: { kind: 'boon' },
        detail: 'Risk an emberjaw for a boon.',
      },
      {
        id: 'rest',
        label: 'Sit in the still air',
        outcome: { kind: 'heal', percent: 15 },
        detail: 'Catch your breath.',
      },
    ],
  },
  {
    id: 'h2-slag',
    hollow: 2,
    title: 'A Pool of Slag',
    text: 'Molten metal pools across the path, cooling in strange shapes.',
    options: [
      {
        id: 'cross',
        label: 'Cross on the cooling slabs',
        outcome: { kind: 'damage', amount: 15 },
        detail: 'The slabs hold. Mostly. Lose 15 HP.',
      },
      {
        id: 'around',
        label: 'Take the long way',
        outcome: { kind: 'heal', percent: 10 },
        detail: 'The detour is quiet.',
      },
    ],
  },
  {
    id: 'h2-anvil',
    hollow: 2,
    title: 'The Last Anvil',
    text: 'An anvil still rings when struck, though no hammer hangs nearby.',
    options: [
      {
        id: 'strike',
        label: 'Strike it once',
        outcome: { kind: 'glint', amount: 40 },
        detail: 'The echo pays in Glint.',
      },
      {
        id: 'listen',
        label: 'Listen instead',
        outcome: { kind: 'heal', percent: 20 },
        detail: 'The ring soothes. Heal 20% HP.',
      },
    ],
  },
  {
    id: 'h2-coal',
    hollow: 2,
    title: 'A Coal That Still Burns',
    text: 'A single coal glows in a dead furnace. It asks for nothing, which is suspicious.',
    options: [
      {
        id: 'take',
        label: 'Take the coal',
        outcome: { kind: 'embers', amount: 8 },
        detail: 'It weighs like a debt paid. Gain 8 Embers.',
      },
      {
        id: 'tend',
        label: 'Tend the furnace',
        outcome: { kind: 'heal', percent: 30 },
        detail: 'The warmth returns. Heal 30% HP.',
      },
    ],
  },
  // Hollow 3 — Umbral Deep
  {
    id: 'h3-whisper',
    hollow: 3,
    title: 'The Whispering Gallery',
    text: "The dark ahead whispers your lantern's name in your own voice.",
    options: [
      {
        id: 'answer',
        label: 'Answer it',
        outcome: { kind: 'boon' },
        detail: 'Risk a fight for a boon.',
      },
      {
        id: 'hum',
        label: 'Hum a budget tune',
        outcome: { kind: 'heal', percent: 15 },
        detail: 'Numbers keep the dark honest.',
      },
    ],
  },
  {
    id: 'h3-bridge',
    hollow: 3,
    title: 'A Bridge of Shadows',
    text: 'A bridge that only exists when nobody looks at it.',
    options: [
      {
        id: 'run',
        label: 'Run across with eyes shut',
        outcome: { kind: 'damage', amount: 18 },
        detail: 'You trip on a shadow. Lose 18 HP.',
      },
      {
        id: 'walk',
        label: 'Walk it slowly, watching',
        outcome: { kind: 'heal', percent: 10 },
        detail: 'It holds while watched.',
      },
    ],
  },
  {
    id: 'h3-hoard',
    hollow: 3,
    title: "A Monarch's Hoard",
    text: 'A pile of Glint in the shape of a sleeping thing. Taking some might not wake it.',
    options: [
      {
        id: 'take',
        label: 'Take a handful',
        outcome: { kind: 'glint', amount: 50 },
        detail: 'The pile shifts. It does not wake. Gain 50 Glint.',
      },
      {
        id: 'bow',
        label: 'Leave an offering instead',
        outcome: { kind: 'heal', percent: 20 },
        detail: 'It accepts your respect. Heal 20% HP.',
      },
    ],
  },
  {
    id: 'h3-crown',
    hollow: 3,
    title: 'A Fallen Crown',
    text: 'A crown of dead stars, cold on the floor. It still remembers being worn.',
    options: [
      {
        id: 'wear',
        label: 'Try it on',
        outcome: { kind: 'embers', amount: 10 },
        detail: 'For one second you see the whole Deep. Gain 10 Embers.',
      },
      {
        id: 'melt',
        label: 'Melt it in the lantern',
        outcome: { kind: 'heal', percent: 35 },
        detail: 'Starfire is warm. Heal 35% HP.',
      },
    ],
  },
];

export function eventsForHollow(hollow: HollowId): readonly DelveEvent[] {
  return EVENTS.filter((e) => e.hollow === hollow);
}
