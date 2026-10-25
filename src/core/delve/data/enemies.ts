/**
 * Delve bestiary. 10 ordinary enemies, 3 elites, 3 bosses. Stats scale with floor;
 * every number is an integer at simulation time. Names and copy are original.
 */

export interface EnemyDef {
  id: string;
  name: string;
  hollow: 1 | 2 | 3;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  luck: number;
  /** Flavor shown in the codex once revealed. */
  lore: string;
}

export interface EliteDef extends EnemyDef {
  elite: true;
}

export interface BossDef extends EnemyDef {
  boss: true;
  /** Readable mechanic, telegraphed one round ahead (Gate 1.5 version). */
  mechanic: string;
  /** Every N rounds the boss uses its heavy mechanic attack. */
  mechanicEvery: number;
  mechanicMultiplier: number;
}

export const ENEMIES: readonly EnemyDef[] = [
  {
    id: 'tollbug',
    name: 'Tollbug',
    hollow: 1,
    hp: 25,
    atk: 7,
    def: 2,
    spd: 6,
    luck: 3,
    lore: 'A coin-sized toll collector with a bite. It waits at doorways.',
  },
  {
    id: 'mossbite',
    name: 'Mossbite',
    hollow: 1,
    hp: 21,
    atk: 6,
    def: 1,
    spd: 8,
    luck: 2,
    lore: 'A clump of hungry moss with teeth like root fibres.',
  },
  {
    id: 'rootsnarl',
    name: 'Rootsnarl',
    hollow: 1,
    hp: 33,
    atk: 10,
    def: 4,
    spd: 4,
    luck: 2,
    lore: 'Old floor roots knotted into a slow, stubborn fist.',
  },
  {
    id: 'sparkmoth',
    name: 'Sparkmoth',
    hollow: 1,
    hp: 18,
    atk: 11,
    def: 1,
    spd: 10,
    luck: 6,
    lore: 'Drawn to lanterns. It remembers every flame it has eaten.',
  },
  {
    id: 'cinderbeetle',
    name: 'Cinderbeetle',
    hollow: 2,
    hp: 26,
    atk: 10,
    def: 5,
    spd: 6,
    luck: 3,
    lore: 'Its shell still glows where the vault fire passed.',
  },
  {
    id: 'emberjaw',
    name: 'Emberjaw',
    hollow: 2,
    hp: 24,
    atk: 12,
    def: 3,
    spd: 8,
    luck: 4,
    lore: 'A hinge of hot coals that snaps at anything cool.',
  },
  {
    id: 'smolderhusk',
    name: 'Smolderhusk',
    hollow: 2,
    hp: 34,
    atk: 9,
    def: 6,
    spd: 3,
    luck: 2,
    lore: 'What remains of a smith who would not leave the forge.',
  },
  {
    id: 'shadewisp',
    name: 'Shadewisp',
    hollow: 3,
    hp: 21,
    atk: 12,
    def: 2,
    spd: 12,
    luck: 5,
    lore: 'A draft in the dark with an opinion about you.',
  },
  {
    id: 'umbraclaw',
    name: 'Umbraclaw',
    hollow: 3,
    hp: 30,
    atk: 13,
    def: 4,
    spd: 9,
    luck: 4,
    lore: 'The shadow of a claw, attached to nothing at all.',
  },
  {
    id: 'voidveil',
    name: 'Voidveil',
    hollow: 3,
    hp: 36,
    atk: 12,
    def: 6,
    spd: 5,
    luck: 3,
    lore: 'A curtain of stillness that folds around the lantern.',
  },
];

export const ELITES: readonly EliteDef[] = [
  {
    id: 'thornheart',
    name: 'Thornheart Brute',
    hollow: 1,
    hp: 40,
    atk: 9,
    def: 4,
    spd: 5,
    luck: 4,
    elite: true,
    lore: 'A warden of the warren grown around a lantern it swallowed.',
  },
  {
    id: 'cindermaw',
    name: 'Cindermaw',
    hollow: 2,
    hp: 48,
    atk: 12,
    def: 5,
    spd: 6,
    luck: 4,
    elite: true,
    lore: 'The vault keeps one door hot. This is why.',
  },
  {
    id: 'veilweaver',
    name: 'Veilweaver',
    hollow: 3,
    hp: 44,
    atk: 12,
    def: 4,
    spd: 10,
    luck: 6,
    elite: true,
    lore: 'It stitches shadows into coats, and visitors into shadows.',
  },
];

export const BOSSES: readonly BossDef[] = [
  {
    id: 'thorncrown',
    name: 'Thorncrown Matriarch',
    hollow: 1,
    hp: 150,
    atk: 9,
    def: 6,
    spd: 6,
    luck: 3,
    boss: true,
    lore: 'She tends the warren like a garden and weeds out lanterns.',
    mechanic: 'Thorn Barrage: a heavy volley every 4 rounds (telegraphed the round before).',
    mechanicEvery: 4,
    mechanicMultiplier: 1.3,
  },
  {
    id: 'ashwrought',
    name: 'Ashwrought Sentinel',
    hollow: 2,
    hp: 170,
    atk: 11,
    def: 7,
    spd: 5,
    luck: 3,
    boss: true,
    lore: 'Built to guard a fire that went out. It has not noticed.',
    mechanic: 'Slag Wave: every 5 rounds it hardens, then slams (telegraphed; guard softens it).',
    mechanicEvery: 5,
    mechanicMultiplier: 1.4,
  },
  {
    id: 'umbralmonarch',
    name: 'Umbral Monarch',
    hollow: 3,
    hp: 190,
    atk: 13,
    def: 8,
    spd: 7,
    luck: 4,
    boss: true,
    lore: 'The dark between floors, wearing a crown of dead stars.',
    mechanic: 'Siphon: every 5 rounds it drinks the next hit back as health (telegraphed).',
    mechanicEvery: 5,
    mechanicMultiplier: 1.4,
  },
];

/** Floor scaling. Bosses keep their tuned stats as listed; elites and ordinaries grow with depth. */
export function scaledStats(
  base: Pick<EnemyDef, 'hp' | 'atk' | 'def' | 'spd' | 'luck'>,
  floor: number,
  elite = false,
  boss = false,
): { hp: number; atk: number; def: number; spd: number; luck: number } {
  const f = Math.min(Math.max(1, floor), 6);
  if (boss) return { hp: base.hp, atk: base.atk, def: base.def, spd: base.spd, luck: base.luck };
  const scale = 1 + (elite ? 0.17 : 0.17) * (f - 1);
  const round = (n: number) => Math.max(1, Math.round(n * scale));
  return {
    hp: round(base.hp),
    atk: round(base.atk),
    def: round(base.def),
    spd: round(base.spd),
    luck: round(base.luck),
  };
}

export function enemyById(id: string): EnemyDef | undefined {
  return [...ENEMIES, ...ELITES, ...BOSSES].find((e) => e.id === id);
}
