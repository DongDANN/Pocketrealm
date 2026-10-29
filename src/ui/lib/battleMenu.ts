/**
 * The command window's state machine (Gate 7g).
 *
 * A Pokémon battle keeps one window on screen and swaps its contents: FIGHT becomes a move list,
 * a move becomes a target list, B walks back. This module is that stack, with no React in it, so the
 * flow is a table of pure transitions a test can walk.
 *
 * Two rules survive the reskin because they are the point of the screen rather than its furniture:
 * a row that would be refused is still printed with the engine's reason, and a row that commits an
 * order carries that order — the component never assembles one from loose strings.
 */

import type { TurnAction, TurnMenu } from '../../core/delve/turn';
import type { TurnOrder } from '../../core/delve/types';

export type BattleCommand = 'skills' | 'strike' | 'guard' | 'items';

/** The four commands, in the order a battle screen has trained players to expect them. */
export const BATTLE_COMMANDS: readonly { id: BattleCommand; label: string; hint: string }[] = [
  { id: 'skills', label: 'SKILL', hint: 'The moves this run carries.' },
  { id: 'strike', label: 'STRIKE', hint: 'The free blow, no energy.' },
  { id: 'guard', label: 'GUARD', hint: 'Halve what the round is bringing.' },
  { id: 'items', label: 'ITEM', hint: 'The bag you brought.' },
];

export type BattleView = 'root' | 'moves' | 'targets' | 'guard' | 'items';

export interface BattleFocus {
  view: BattleView;
  /** Which move the target window belongs to; null means the basic attack. */
  skillId: string | null;
}

export function initialFocus(): BattleFocus {
  return { view: 'root', skillId: null };
}

/** Every command opens one window; `skill:<id>` is the move row's own transition. */
export function openCommand(
  _focus: BattleFocus,
  command: BattleCommand | `skill:${string}`,
): BattleFocus {
  if (command.startsWith('skill:')) {
    return { view: 'targets', skillId: command.slice('skill:'.length) };
  }
  switch (command) {
    case 'skills':
      return { view: 'moves', skillId: null };
    case 'strike':
      return { view: 'targets', skillId: null };
    case 'guard':
      return { view: 'guard', skillId: null };
    case 'items':
      return { view: 'items', skillId: null };
    default:
      return initialFocus();
  }
}

/** B steps out one window, and out of the root stays at the root. */
export function backFocus(focus: BattleFocus): BattleFocus {
  switch (focus.view) {
    case 'root':
      return initialFocus();
    case 'moves':
    case 'guard':
    case 'items':
      return initialFocus();
    case 'targets':
      return focus.skillId === null ? initialFocus() : { view: 'moves', skillId: null };
  }
}

/** One printable row. `order` is null when the row opens another window instead of committing. */
export interface MenuRow {
  id: string;
  label: string;
  detail: string;
  /** The engine's own arithmetic, empty on rows that price nothing. */
  sum: string;
  /** What explains the price — weakness, a mark, a shield — in the engine's words. */
  notes: string[];
  disabled: boolean;
  aria: string;
  order: TurnOrder | null;
}

function targetRows(action: TurnAction): MenuRow[] {
  return action.targets.map((target) => ({
    id: `target:${target.targetIndex}`,
    label: target.name,
    detail: `likely ${target.likely} (${target.min}–${target.max}) · ${target.afterHp} HP after`,
    sum: target.sumText,
    notes: [...target.notes],
    disabled: !action.ready,
    aria: `${action.name} ${target.name}: likely ${target.likely}, ${target.sumText}`,
    order: {
      skillId: action.kind === 'skill' ? action.id : null,
      targetIndex: target.targetIndex,
      guard: false,
    },
  }));
}

/** The move row prices itself the way the old panel did: cost, refusal, and the likely number. */
function moveDetail(action: TurnAction): string {
  const pieces: string[] = [];
  if (action.cost !== '') pieces.push(action.cost);
  if (!action.ready && action.reason !== '') pieces.push(action.reason);
  const first = action.targets[0];
  if (first) pieces.push(`likely ${first.likely} (${first.min}–${first.max})`);
  return pieces.join(' · ');
}

export function viewRows(focus: BattleFocus, menu: TurnMenu): MenuRow[] {
  switch (focus.view) {
    case 'root':
      return BATTLE_COMMANDS.map((command) => ({
        id: command.id,
        label: command.label,
        detail: command.hint,
        sum: '',
        notes: [],
        disabled: false,
        aria: command.label,
        order: null,
      }));

    case 'moves':
      if (menu.skills.length === 0) {
        return [
          {
            id: 'no-skills',
            label: 'No skills equipped.',
            detail: 'The run swings a basic attack and the brace.',
            sum: '',
            notes: [],
            disabled: true,
            aria: 'No skills equipped.',
            order: null,
          },
        ];
      }
      return menu.skills.map((action) => ({
        id: `skill:${action.id ?? action.name}`,
        label: action.name,
        detail: moveDetail(action),
        sum: '',
        notes: [],
        disabled: !action.ready,
        aria: `${action.name}${action.ready ? '' : ` — ${action.reason}`}`,
        order: null,
      }));

    case 'targets': {
      const action =
        focus.skillId === null
          ? menu.attack
          : (menu.skills.find((skill) => skill.id === focus.skillId) ?? null);
      return action ? targetRows(action) : [];
    }

    case 'guard':
      return [
        {
          id: 'brace',
          label: 'Brace',
          detail: `${menu.guard.unbraced} → ${menu.guard.braced} incoming`,
          sum: menu.guard.lines.flatMap((line) => line.sums).join(' '),
          notes: [],
          disabled: false,
          aria: `Brace: ${menu.guard.unbraced} damage becomes ${menu.guard.braced}`,
          order: { skillId: null, targetIndex: 0, guard: true },
        },
      ];

    case 'items':
      if (menu.items.length === 0) {
        return [
          {
            id: 'no-items',
            label: 'The bag is empty.',
            detail: 'Craft consumables in the Workshop.',
            sum: '',
            notes: [],
            disabled: true,
            aria: 'The bag is empty.',
            order: null,
          },
        ];
      }
      return menu.items.map((item) => ({
        id: `item:${item.id ?? item.name}`,
        label: item.name,
        detail: item.reason,
        sum: '',
        notes: [],
        disabled: true,
        aria: `${item.name}: ${item.reason}`,
        order: null,
      }));
  }
}

/** The window's one-line heading, in the same voice the dialog uses. */
export function viewTitle(focus: BattleFocus, menu: TurnMenu): string {
  switch (focus.view) {
    case 'root':
      return `Round ${menu.round} · Choose an order.`;
    case 'moves':
      return 'Choose a skill, Strike or Guard.';
    case 'targets': {
      if (focus.skillId === null) return `${menu.attack.name} · choose a target.`;
      const skill = menu.skills.find((entry) => entry.id === focus.skillId);
      return skill ? `${skill.name} · choose a target.` : 'Choose a target.';
    }
    case 'guard':
      return 'Guard.';
    case 'items':
      return 'Bag.';
  }
}
