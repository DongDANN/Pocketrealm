import type { Achievement } from '../../core/achievements';
import { say } from './toast';

/** Every newly earned badge gets the same line, whether it came from an open or a finished action. */
export function announceAchievements(achievements: readonly Achievement[]): void {
  for (const achievement of achievements) {
    say(`Achievement: ${achievement.name} · +${achievement.xp} XP`, 'reward');
  }
}
