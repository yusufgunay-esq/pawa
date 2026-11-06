import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AutomaBrain,
  Behavior,
  AUTONOMY_PRESETS,
  ContextSteering,
  GoapPlanner,
  TacticalBlackboard,
  type EntitySnapshot,
  type BehaviorProfile,
} from '../src/index.ts';

const PROTAGONIST_OPERATIVE: BehaviorProfile = {
  id: 'stealth_operative',
  name: 'Covert Operative Archetype',
  aggression: 0.78,
  discipline: 0.92,
  cinematicFlair: 0.88,
  reactionDelayMs: 95,
  preferredRange: 2.2,
};

test('Layer 1: 16-Slot Context Steering avoids imminent hazard while advancing toward target', () => {
  const steering = new ContextSteering(16);
  const selfPos = { x: 0, y: 0, z: 0 };
  const targetPos = { x: 10, y: 0, z: 0 };
  // Place a hazard directly on the straight line (x = 2.0, z = 0)
  const hazards = [{ position: { x: 2.0, y: 0, z: 0 }, radius: 4.0, weight: 2.0 }];

  const result = steering.computeMoveVector(selfPos, targetPos, 2.0, hazards);
  const len = Math.hypot(result.direction.x, result.direction.z);
  assert.ok(Math.abs(len - 1.0) < 1e-5, 'Steering vector must be unit normalized');
  // Since the hazard blocks +X directly, the agent should steer with a non-zero Z component
  assert.ok(
    Math.abs(result.direction.z) > 0.1,
    `Agent must deflect around direct hazard (got z=${result.direction.z})`
  );
});

test('Layer 3B: Regressive A* GOAP Planner synthesizes 3-step combat chain to eliminate enemy', () => {
  const planner = new GoapPlanner();
  const bb = new TacticalBlackboard();
  const currentState = {
    hasHostiles: true,
    inMeleeRange: false,
    staminaSufficient: true,
    targetVulnerable: false,
    enemyEliminated: false,
  };
  const goalState = { enemyEliminated: true };

  const plan = planner.plan(currentState, goalState, AutomaBrain.defaultGoapActions(), bb);
  assert.ok(plan !== null, 'Planner must find a valid action sequence');
  const names = plan.map((a) => a.name);
  assert.deepEqual(names, ['CLOSE_DISTANCE', 'HEAVY_ASSAULT', 'EXECUTE_FINISHER']);
});

test('Layer 4 + 3A: AutomaBrain triggers DEFLECT_COUNTER and IMPACT_SLOWMO camera on enemy wind-up in CINEMATIC_LIVE mode', () => {
  const brain = new AutomaBrain();
  const self: EntitySnapshot = {
    id: 'player_0',
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    healthRatio: 0.85,
    staminaRatio: 0.9,
    isAttacking: false,
    isWindUp: false,
    isRanged: false,
    threatWeight: 1.0,
  };

  const hostile: EntitySnapshot = {
    id: 'mercenary_1',
    position: { x: 1.8, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    healthRatio: 0.7,
    staminaRatio: 0.8,
    isAttacking: true,
    isWindUp: true, // Telegraphing a heavy attack within 1.8m
    isRanged: false,
    threatWeight: 1.5,
  };

  const decision = brain.tick(self, [hostile], PROTAGONIST_OPERATIVE, 'CINEMATIC_LIVE');

  assert.equal(decision.stance, 'DEFENSIVE');
  assert.equal(decision.immediateCommand, 'DEFLECT_COUNTER');
  assert.ok(decision.utilityScore > 0.8, 'Deflect utility score should be high during wind-up');
  assert.equal(decision.cameraDirective.mode, 'IMPACT_SLOWMO');
  assert.ok(decision.cameraDirective.timeScale < 0.5, 'Cinematic Live must trigger slow-mo on counter');
});

test('Presentation Mode Tri-State: TACTICAL vs CINEMATIC_RESOLVE camera directives', () => {
  const brain = new AutomaBrain();
  const self: EntitySnapshot = {
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
  const hostile: EntitySnapshot = {
    id: 'guard_1',
    position: { x: 6.0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    healthRatio: 0.5,
    staminaRatio: 0.5,
    isAttacking: false,
    isWindUp: false,
    isRanged: false,
    threatWeight: 1.0,
  };

  const tacticalDecision = brain.tick(self, [hostile], PROTAGONIST_OPERATIVE, 'TACTICAL');
  assert.equal(tacticalDecision.cameraDirective.mode, 'PASSIVE');
  assert.equal(tacticalDecision.cameraDirective.timeScale, 1.0);

  const resolveDecision = brain.tick(self, [hostile], PROTAGONIST_OPERATIVE, 'CINEMATIC_RESOLVE');
  assert.equal(resolveDecision.cameraDirective.mode, 'FINISH_CUT');
  assert.equal(resolveDecision.cameraDirective.timeScale, 1.75);
});

test('Autonomy Modes: CO_PILOT passes human input through until imminent enemy wind-up triggers reflex parry', () => {
  const brain = new AutomaBrain();
  const self: EntitySnapshot = {
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

  const calmHostile: EntitySnapshot = {
    id: 'boss_1',
    position: { x: 2.0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    healthRatio: 0.8,
    staminaRatio: 0.8,
    isAttacking: false,
    isWindUp: false,
    isRanged: false,
    threatWeight: 2.0,
  };

  // When enemy is not telegraphing an attack, CO_PILOT lets human control pass through
  const passThrough = brain.tick(self, [calmHostile], PROTAGONIST_OPERATIVE, 'TACTICAL', 'CO_PILOT');
  assert.equal(passThrough.interceptHumanInput, false);
  assert.equal(passThrough.immediateCommand, 'HUMAN_PASS_THROUGH');

  // The millisecond the enemy telegraphs a strike (isWindUp: true), CO_PILOT intercepts with DEFLECT_COUNTER
  const windUpHostile: EntitySnapshot = { ...calmHostile, isWindUp: true };
  const reflexIntercept = brain.tick(self, [windUpHostile], PROTAGONIST_OPERATIVE, 'TACTICAL', 'CO_PILOT');
  assert.equal(reflexIntercept.interceptHumanInput, true);
  assert.equal(reflexIntercept.immediateCommand, 'DEFLECT_COUNTER');
});

test('Autonomy Modes: SHADOW_SURVIVAL strictly evades/deflects without attacking, GRIND_AUTOPILOT cruises to waypoint', () => {
  const brain = new AutomaBrain();
  const self: EntitySnapshot = {
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
  const weakHostile: EntitySnapshot = {
    id: 'boss_1',
    position: { x: 1.5, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    healthRatio: 0.1, // Vulnerable, normally triggers EXECUTE_FINISHER
    staminaRatio: 0.5,
    isAttacking: false,
    isWindUp: false,
    isRanged: false,
    threatWeight: 2.0,
  };

  const shadow = brain.tick(self, [weakHostile], PROTAGONIST_OPERATIVE, 'TACTICAL', 'SHADOW_SURVIVAL');
  assert.equal(shadow.stance, 'DEFENSIVE');
  assert.notEqual(shadow.selectedUtilityAction, 'EXECUTE_FINISHER');
  assert.notEqual(shadow.selectedUtilityAction, 'STRIKE_COMBO');

  const grind = brain.tick(
    self,
    [],
    PROTAGONIST_OPERATIVE,
    'TACTICAL',
    'GRIND_AUTOPILOT',
    { x: 50, y: 0, z: 0 }
  );
  assert.equal(grind.immediateCommand, 'CRUISE_OR_LOOT');
  assert.ok(grind.steeringMove.x > 0.9, 'Should steer directly toward open-world waypoint');
});

const SELF: EntitySnapshot = {
  id: 'player_0', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 },
  healthRatio: 0.9, staminaRatio: 0.9, isAttacking: false, isWindUp: false, isRanged: false, threatWeight: 1.0,
};
const FOE: EntitySnapshot = { ...SELF, id: 'foe', position: { x: 2, y: 0, z: 0 }, healthRatio: 0.8, threatWeight: 2.0 };

test('Behaviors: legacy names equal their preset masks, bit for bit', () => {
  for (const [name, mask] of Object.entries(AUTONOMY_PRESETS)) {
    for (const hostiles of [[], [FOE], [{ ...FOE, isWindUp: true }]]) {
      const a = new AutomaBrain().tick(SELF, hostiles, PROTAGONIST_OPERATIVE, 'TACTICAL', name as never, { x: 9, y: 0, z: 0 });
      const b = new AutomaBrain().tick(SELF, hostiles, PROTAGONIST_OPERATIVE, 'TACTICAL', mask, { x: 9, y: 0, z: 0 });
      assert.deepEqual({ ...a, autonomyMode: 0 }, { ...b, autonomyMode: 0 }, name);
    }
  }
});

test('Behaviors: conflict rules', () => {
  const wp = { x: 9, y: 0, z: 0 };
  const t = (m: number, h: EntitySnapshot[]) => new AutomaBrain().tick(SELF, h, PROTAGONIST_OPERATIVE, 'TACTICAL', m, wp);
  const z = t(0, [FOE]);
  assert.equal(z.interceptHumanInput, false);
  assert.equal(z.immediateCommand, 'HUMAN_PASS_THROUGH');
  assert.equal(z.speedMultiplier, 0);
  assert.equal(t(Behavior.CRUISE | Behavior.COMBAT, []).immediateCommand, 'CRUISE_OR_LOOT');
  assert.notEqual(t(Behavior.CRUISE | Behavior.COMBAT, [FOE]).immediateCommand, 'CRUISE_OR_LOOT');
  assert.equal(t(Behavior.ASSIST | Behavior.CRUISE, []).immediateCommand, 'CRUISE_OR_LOOT');
  assert.equal(t(Behavior.ASSIST | Behavior.CRUISE, [FOE]).immediateCommand, 'HUMAN_PASS_THROUGH');
  assert.equal(t(Behavior.ASSIST | Behavior.CRUISE, [{ ...FOE, isWindUp: true }]).interceptHumanInput, true);
  assert.equal(t(Behavior.ASSIST | Behavior.COMBAT, [FOE]).interceptHumanInput, true);
  const d = t(Behavior.DEFENSIVE | Behavior.COMBAT, [{ ...FOE, healthRatio: 0.1 }]);
  assert.equal(d.stance, 'DEFENSIVE');
  assert.notEqual(d.selectedUtilityAction, 'EXECUTE_FINISHER');
});
