import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  StuntBrain,
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

  const plan = planner.plan(currentState, goalState, StuntBrain.defaultGoapActions(), bb);
  assert.ok(plan !== null, 'Planner must find a valid action sequence');
  const names = plan.map((a) => a.name);
  assert.deepEqual(names, ['CLOSE_DISTANCE', 'HEAVY_ASSAULT', 'EXECUTE_FINISHER']);
});

test('Layer 4 + 3A: StuntBrain triggers DEFLECT_COUNTER and IMPACT_SLOWMO camera on enemy wind-up in CINEMATIC_LIVE mode', () => {
  const brain = new StuntBrain();
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
  const brain = new StuntBrain();
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
  const brain = new StuntBrain();
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
  const brain = new StuntBrain();
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
      const a = new StuntBrain().tick(SELF, hostiles, PROTAGONIST_OPERATIVE, 'TACTICAL', name as never, { x: 9, y: 0, z: 0 });
      const b = new StuntBrain().tick(SELF, hostiles, PROTAGONIST_OPERATIVE, 'TACTICAL', mask, { x: 9, y: 0, z: 0 });
      assert.deepEqual({ ...a, autonomyMode: 0 }, { ...b, autonomyMode: 0 }, name);
    }
  }
});

test('Behaviors: conflict rules', () => {
  const wp = { x: 9, y: 0, z: 0 };
  const t = (m: number, h: EntitySnapshot[]) => new StuntBrain().tick(SELF, h, PROTAGONIST_OPERATIVE, 'TACTICAL', m, wp);
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

// ---- 005: crowd counter-attack, pressure hysteresis, ranged range, aggression pacing ----
const CSELF: EntitySnapshot = { id: 'p', position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, healthRatio: 0.9, staminaRatio: 0.9, isAttacking: false, isWindUp: false, isRanged: false, threatWeight: 1 };
const grunt = (id: string, x: number, z: number, over: Partial<EntitySnapshot> = {}): EntitySnapshot => ({ ...CSELF, id, position: { x, y: 0, z }, healthRatio: 0.7, ...over });
const RING = [grunt('a', 2, 0), grunt('b', -1, 1.8), grunt('c', -1, -1.8), grunt('d', 0, 2.6)];

test('005 crowd: no wind-up inside reach -> counter strike; a wind-up flips back to parry; DEFENSIVE flag never attacks', () => {
  assert.equal(new StuntBrain().tick(CSELF, RING, PROTAGONIST_OPERATIVE, 'TACTICAL', Behavior.COMBAT).immediateCommand, 'STRIKE_COMBO');
  const wind = [{ ...RING[0], isWindUp: true }, ...RING.slice(1)];
  assert.equal(new StuntBrain().tick(CSELF, wind, PROTAGONIST_OPERATIVE, 'TACTICAL', Behavior.COMBAT).immediateCommand, 'DEFLECT_COUNTER');
  assert.notEqual(new StuntBrain().tick(CSELF, RING, PROTAGONIST_OPERATIVE, 'TACTICAL', Behavior.DEFENSIVE).immediateCommand, 'STRIKE_COMBO');
  assert.equal(new StuntBrain().tick({ ...CSELF, healthRatio: 0.25 }, RING, PROTAGONIST_OPERATIVE, 'TACTICAL', Behavior.COMBAT).stance, 'EVASIVE');
});

test('005 crowd positioning stays local (no flight to the far grid edge)', () => {
  const d = new StuntBrain().tick(CSELF, RING, PROTAGONIST_OPERATIVE, 'TACTICAL', Behavior.COMBAT);
  assert.ok(Math.hypot(d.steeringMove.x, d.steeringMove.z) > 0.99);
  const bb = new TacticalBlackboard();
  bb.refresh(CSELF, RING, PROTAGONIST_OPERATIVE);
  const p = bb.influenceMap.findLocalPocket(CSELF.position, bb.hostiles, RING[0].position, 2.5);
  assert.ok(Math.hypot(p.x, p.z) <= 2.5 + 1e-9);
});

test('005 pressure hysteresis: in above 0.72, stays until below 0.6', () => {
  const bb = new TacticalBlackboard();
  const at = (d: number) => bb.refresh(CSELF, [grunt('a', d, 0), grunt('b', -d, 0), grunt('c', 0, d), grunt('d', 0, -d)], PROTAGONIST_OPERATIVE);
  at(2.5); assert.equal(bb.pressureHigh, true);
  at(4.5); // raw 4 / (4.5*.35)=2.54 -> 0.73
  assert.equal(bb.pressureHigh, true);
  at(5.5); // 4 / 1.925 = 2.08 -> 0.59 -> released
  assert.equal(bb.pressureHigh, false);
  at(4.6); // 0.71: below the 0.72 entry threshold, so it stays released
  assert.equal(bb.pressureHigh, false);
});

test('005 ranged threat range follows attackRange (default 16 m)', () => {
  const archer = (r?: number) => grunt('arc', 18, 3, { isRanged: true, isWindUp: true, attackRange: r });
  const bb = new TacticalBlackboard();
  bb.refresh(CSELF, [archer()], PROTAGONIST_OPERATIVE);
  assert.equal(bb.rangedThreat, null);
  bb.refresh(CSELF, [archer(22)], PROTAGONIST_OPERATIVE);
  assert.equal(bb.rangedThreat?.id, 'arc');
});

test('005 aggression pacing: strike requests go out in proportion to aggression', () => {
  const share = (a: number) => {
    const b = new StuntBrain();
    let n = 0;
    for (let i = 0; i < 100; i++) if (b.tick(CSELF, [grunt('a', 2, 0)], { ...PROTAGONIST_OPERATIVE, aggression: a, discipline: 1 }, 'TACTICAL', Behavior.COMBAT).immediateCommand === 'STRIKE_COMBO' || false) n++;
    return n;
  };
  assert.ok(share(0.9) >= share(0.6) && share(0.6) >= share(0.3), `${share(0.3)} ${share(0.6)} ${share(0.9)}`);
});
