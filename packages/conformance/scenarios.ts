/**
 * AUTOMA Cross-Language Conformance — Scenario Corpus
 * Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
 *
 * The single source of truth for the differential test suite. Each scenario is a
 * self-contained snapshot of a combat tick plus the modes it should be evaluated
 * under. `npm run conformance` replays every scenario through all four kernels
 * (TypeScript, C#, C++, Lua) and diffs the decisions field by field.
 *
 * Add a scenario here rather than editing generated fixtures: fixtures are outputs.
 */

import type { AutonomyMode, EntitySnapshot, BehaviorProfile, PresentationMode, Vec3 } from '../../automa-brain-ts/src/index.ts';

export interface Scenario {
  id: string;
  note: string;
  profile: BehaviorProfile;
  self: EntitySnapshot;
  hostiles: EntitySnapshot[];
  presentation: PresentationMode;
  autonomy: AutonomyMode;
  waypoint?: Vec3;
}

const BASE_PERSONA: BehaviorProfile = {
  id: 'conformance_reference',
  name: 'Conformance Reference Protagonist',
  aggression: 0.78,
  discipline: 0.92,
  cinematicFlair: 0.88,
  reactionDelayMs: 95,
  preferredRange: 2.2,
};

const IDLE_SELF: EntitySnapshot = {
  id: 'player_0',
  position: { x: 0, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  healthRatio: 0.9,
  staminaRatio: 0.9,
  isAttacking: false,
  isWindUp: false,
  isRanged: false,
  threatWeight: 1.0,
};

function hostile(over: Partial<EntitySnapshot> & { id: string; position: Vec3 }): EntitySnapshot {
  return {
    velocity: { x: 0, y: 0, z: 0 },
    healthRatio: 0.7,
    staminaRatio: 0.7,
    isAttacking: false,
    isWindUp: false,
    isRanged: false,
    threatWeight: 1.0,
    ...over,
  };
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'deflect-windup-tactical',
    note: 'Single telegraphed strike at close range; tactical camera must stay passive.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'mercenary_1', position: { x: 1.8, y: 0, z: 0 }, isAttacking: true, isWindUp: true, threatWeight: 1.5 })],
    presentation: 'TACTICAL',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'deflect-windup-cinematic',
    note: 'Same tick under CINEMATIC_LIVE: counter must trigger hit-stop slow-mo.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'mercenary_1', position: { x: 1.8, y: 0, z: 0 }, isAttacking: true, isWindUp: true, threatWeight: 1.5 })],
    presentation: 'CINEMATIC_LIVE',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'deflect-windup-low-flair',
    note: 'cinematicFlair <= 0.5 must soften the slow-mo to 0.65 and drop counter priority.',
    profile: { ...BASE_PERSONA, cinematicFlair: 0.2 },
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'mercenary_1', position: { x: 1.8, y: 0, z: 0 }, isWindUp: true, threatWeight: 1.5 })],
    presentation: 'CINEMATIC_LIVE',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'finisher-open',
    note: 'Weak enemy at mid range: finisher utility must win and the GOAP chain must close in.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'guard_1', position: { x: 2.4, y: 0, z: 0.2 }, healthRatio: 0.18, threatWeight: 1.0 })],
    presentation: 'TACTICAL',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'evasive-critical-health',
    note: 'Critical health with two hostiles: EVASIVE stance, safest-pocket navigation.',
    profile: BASE_PERSONA,
    self: { ...IDLE_SELF, healthRatio: 0.21, staminaRatio: 0.3 },
    hostiles: [
      hostile({ id: 'brute_1', position: { x: 2.5, y: 0, z: 1.5 }, threatWeight: 2.2 }),
      hostile({ id: 'brute_2', position: { x: -1.5, y: 0, z: -2.5 }, threatWeight: 2.0, isWindUp: true }),
    ],
    presentation: 'TACTICAL',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'crowded-pressure',
    note: 'Four hostiles: DEFENSIVE via pressureIndex, repulsion hazards from every side.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [
      hostile({ id: 'h1', position: { x: 1.5, y: 0, z: 0.0 } }),
      hostile({ id: 'h2', position: { x: -1.5, y: 0, z: 0.0 } }),
      hostile({ id: 'h3', position: { x: 0.0, y: 0, z: 1.5 } }),
      hostile({ id: 'h4', position: { x: 0.0, y: 0, z: -1.5 } }),
    ],
    presentation: 'TACTICAL',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'co-pilot-pass-through',
    note: 'CO_PILOT with a calm enemy: human keeps the controller, no interception.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'boss_1', position: { x: 2.0, y: 0, z: 0 }, healthRatio: 0.8, threatWeight: 2.0 })],
    presentation: 'TACTICAL',
    autonomy: 'CO_PILOT',
  },
  {
    id: 'co-pilot-interrupt',
    note: 'CO_PILOT the instant the boss telegraphs: single-frame reflex intercept.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'boss_1', position: { x: 2.0, y: 0, z: 0 }, healthRatio: 0.8, isWindUp: true, threatWeight: 2.0 })],
    presentation: 'TACTICAL',
    autonomy: 'CO_PILOT',
  },
  {
    id: 'shadow-survival',
    note: 'SHADOW_SURVIVAL must never select STRIKE_COMBO or EXECUTE_FINISHER.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'boss_1', position: { x: 1.5, y: 0, z: 0 }, healthRatio: 0.1, threatWeight: 2.0 })],
    presentation: 'TACTICAL',
    autonomy: 'SHADOW_SURVIVAL',
  },
  {
    id: 'grind-cruise',
    note: 'GRIND_AUTOPILOT with no hostiles: cruise toward the waypoint at 0.5 ring.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [],
    presentation: 'TACTICAL',
    autonomy: 'GRIND_AUTOPILOT',
    waypoint: { x: 50, y: 0, z: 0 },
  },
  {
    id: 'grind-idle-scan',
    note: 'GRIND_AUTOPILOT without a waypoint: idle scan, no cruise command.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [],
    presentation: 'TACTICAL',
    autonomy: 'GRIND_AUTOPILOT',
  },
  {
    id: 'commander-assault',
    note: 'COMMANDER behaves like FULL_COMBAT at the motor layer (doctrine is external).',
    profile: { ...BASE_PERSONA, aggression: 0.55, discipline: 0.7 },
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'h1', position: { x: 3.2, y: 0, z: 0.4 }, threatWeight: 1.4 })],
    presentation: 'TACTICAL',
    autonomy: 'COMMANDER',
  },
  {
    id: 'empty-world-stealth',
    note: 'No hostiles at all: STEALTH stance, goal collapses to threatNeutralized.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [],
    presentation: 'TACTICAL',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'cinematic-resolve',
    note: 'CINEMATIC_RESOLVE always returns the FINISH_CUT directive at 1.75x.',
    profile: BASE_PERSONA,
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'guard_1', position: { x: 6.0, y: 0, z: 0 }, healthRatio: 0.5 })],
    presentation: 'CINEMATIC_RESOLVE',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'obstacle-steering',
    note: 'Target directly behind a wind-up hazard: steering must deflect sideways.',
    profile: { ...BASE_PERSONA, preferredRange: 1.0 },
    self: IDLE_SELF,
    hostiles: [hostile({ id: 'wall_1', position: { x: 2.0, y: 0, z: 0 }, isWindUp: true, threatWeight: 3.0 })],
    presentation: 'TACTICAL',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'wide-range-kiter',
    note: 'Arcane-style wide ring with high discipline: kite behaviour at 8m.',
    profile: {
      id: 'conformance_kiter',
      name: 'Conformance Kiter',
      aggression: 0.46,
      discipline: 1.0,
      cinematicFlair: 0.88,
      reactionDelayMs: 120,
      preferredRange: 8.0,
    },
    self: { ...IDLE_SELF, position: { x: -3.5, y: 0, z: 2.0 } },
    hostiles: [
      hostile({ id: 'melee_1', position: { x: 1.0, y: 0, z: 1.0 }, threatWeight: 1.7 }),
      hostile({ id: 'ranged_1', position: { x: 6.0, y: 0, z: -2.0 }, isRanged: true, threatWeight: 1.2 }),
    ],
    presentation: 'CINEMATIC_LIVE',
    autonomy: 'FULL_COMBAT',
  },
  {
    id: 'low-discipline-jitter',
    note: 'discipline 0.0 maximises the deterministic jitter; ordering must still match exactly.',
    profile: { ...BASE_PERSONA, discipline: 0.0, aggression: 0.5, cinematicFlair: 0.5 },
    self: { ...IDLE_SELF, healthRatio: 0.55, staminaRatio: 0.55 },
    hostiles: [hostile({ id: 'h1', position: { x: 2.6, y: 0, z: 0.6 }, healthRatio: 0.4, threatWeight: 1.3 })],
    presentation: 'TACTICAL',
    autonomy: 'FULL_COMBAT',
  },
];
