import { readFileSync } from 'node:fs';
import type { BehaviorProfile } from '../../automa-brain-ts/src/index.ts';
import { Behavior } from '../../automa-brain-ts/src/index.ts';
import type { EnemySpec, Scenario } from './sim.ts';

interface PresetFile { presets: (BehaviorProfile & { id: string })[] }
const presets = (JSON.parse(readFileSync(new URL('../../../schemas/profiles.json', import.meta.url), 'utf8')) as PresetFile).presets;

export function presetProfile(id: string): BehaviorProfile {
  const p = presets.find((x) => x.id === id);
  if (!p) throw new Error('unknown preset ' + id);
  return { id: p.id, name: p.name, aggression: p.aggression, discipline: p.discipline, cinematicFlair: p.cinematicFlair, reactionDelayMs: p.reactionDelayMs, preferredRange: p.preferredRange };
}

const spartan = presetProfile('spartan_mercenary');

const grunt = (id: string, x: number, z: number, extra: Partial<EnemySpec> = {}): EnemySpec => ({
  id, x, z, hp: 60, damage: 12, windup: 0.6, recover: 1.2, reach: 2.4, speed: 3.3, threat: 1, ...extra,
});

/**
 * Gate thresholds are fixed per scenario (not tuned per run) and protected by arena.test.ts.
 * minAvoid counts only telegraphs the brain can react to (wind-up started inside its 4.5 m
 * imminence radius); the rest is reported as `unreactableHit`.
 */
export const SCENARIOS: Scenario[] = [
  {
    id: 'duel',
    title: 'Duel: 1 melee grunt',
    behaviors: Behavior.COMBAT,
    profile: spartan,
    enemies: [grunt('g1', 7, 0)],
    obstacles: [{ x: 3, z: 4, r: 1.2 }],
    maxTime: 60,
    gates: { survive: true, winAll: true, minAvoid: 0.6, maxReversal: 0.25, zeroLockedInput: true },
  },
  {
    id: 'surround3',
    title: 'Surround: 3 grunts at 120 degrees',
    behaviors: Behavior.COMBAT,
    profile: spartan,
    enemies: [grunt('g1', 7, 0), grunt('g2', -3.5, 6.06), grunt('g3', -3.5, -6.06)],
    obstacles: [{ x: 0, z: 9, r: 1.2 }, { x: 0, z: -9, r: 1.2 }],
    maxTime: 90,
    gates: { survive: true, winAll: true, minAvoid: 0.5, maxReversal: 0.3, zeroLockedInput: true },
  },
  {
    id: 'archer_melee',
    title: 'Archer + melee grunt',
    behaviors: Behavior.COMBAT,
    profile: spartan,
    enemies: [
      grunt('m1', 6, 0),
      grunt('a1', 12, 4, { ranged: true, hp: 40, damage: 8, windup: 0.9, recover: 1.8, reach: 14, speed: 2, threat: 1.2 }),
    ],
    obstacles: [{ x: 6, z: 3, r: 1.2 }],
    maxTime: 90,
    gates: { survive: true, winAll: true, minAvoid: 0.5, maxReversal: 0.3, zeroLockedInput: true },
  },
  {
    id: 'boss_defensive',
    title: 'Boss combo, DEFENSIVE (zero offense)',
    behaviors: Behavior.DEFENSIVE,
    profile: presetProfile('covert_operative'),
    enemies: [{ id: 'boss', x: 6, z: 0, hp: 400, damage: 20, windup: 0.55, recover: 1.5, reach: 3, speed: 2.8, combo: 3, threat: 3 }],
    obstacles: [],
    maxTime: 45,
    gates: { survive: true, minAvoid: 0.6, maxAttackCommands: 0, maxReversal: 0.3, zeroLockedInput: true },
  },
  {
    id: 'cruise_ambush',
    title: 'Cruise to waypoints + ambush (CRUISE|COMBAT)',
    behaviors: Behavior.CRUISE | Behavior.COMBAT,
    profile: spartan,
    enemies: [
      grunt('x1', 5, 5, { rel: true, spawnAt: 5 }),
      grunt('x2', -5, 5, { rel: true, spawnAt: 5 }),
    ],
    obstacles: [{ x: 14, z: 1, r: 1.2 }],
    waypoints: [{ x: 10, z: 0 }, { x: 20, z: 6, loot: true }, { x: 30, z: 0 }, { x: 30, z: 12, loot: true }],
    maxTime: 90,
    gates: { survive: true, winAll: true, waypointsAll: true, minAvoid: 0.5, maxReversal: 0.3, zeroLockedInput: true },
  },
  {
    id: 'ambush_oncombat',
    title: 'onCombat hand-over: human walks, ambush appears, AUTOMA takes over then gives back',
    behaviors: Behavior.COMBAT,
    profile: spartan,
    engage: 'onCombat',
    enemies: [grunt('x1', 5, 5, { rel: true, spawnAt: 5 }), grunt('x2', -5, 5, { rel: true, spawnAt: 5 })],
    obstacles: [],
    maxTime: 60,
    gates: { survive: true, winAll: true, autoEngage: true, maxReversal: 0.3, zeroLockedInput: true },
  },
  {
    id: 'native_overlay',
    title: 'Native AI base + AUTOMA competence layer vs the same weak native AI alone',
    behaviors: Behavior.COMBAT,
    profile: spartan,
    native: 'weak',
    enemies: [grunt('g1', 7, 0, { speed: 3.5, damage: 14 }), grunt('g2', -3.5, 6.06, { speed: 3.5, damage: 14 }), grunt('g3', -3.5, -6.06, { speed: 3.5, damage: 14 })],
    obstacles: [],
    maxTime: 90,
    gates: { survive: true, winAll: true, minAvoid: 0.5, beatsNative: 0.25, maxReversal: 0.3, zeroLockedInput: true },
  },
  {
    id: 'interlock',
    title: 'Interlocks: cutscene + manual override during a fight',
    behaviors: Behavior.COMBAT,
    profile: spartan,
    enemies: [grunt('g1', 9, 0, { spawnAt: 0 }), grunt('g2', 12, 3, { spawnAt: 8 })],
    obstacles: [],
    locks: [{ from: 3, to: 5, kind: 'cutscene' }, { from: 10, to: 12, kind: 'manual' }],
    maxTime: 60,
    gates: { survive: true, maxReversal: 0.3, zeroLockedInput: true },
  },
];
