/**
 * PAWA Core Brain Architecture (pawa-brain-ts)
 * Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
 *
 * Implements a zero-dependency, deterministic/stochastic 4-Layer Autonomous Proxy Agent:
 *   Layer 4: Narrative & Tactical Orchestrator (Presentation & Stance control)
 *   Layer 3: Regressive A* GOAP Planner (Goal-Oriented Action Planning) + Utility AI Scorer
 *   Layer 2: Shared Tactical Blackboard + 2D Spatial Influence Map
 *   Layer 1: 16-Slot Context Steering (Interest - Danger Vector Synthesis)
 */

// ============================================================================
// 0. CORE TYPES & INTERFACES
// ============================================================================

export type PresentationMode = 'TACTICAL' | 'CINEMATIC_LIVE' | 'CINEMATIC_RESOLVE';
export type TacticalStance = 'AGGRESSIVE' | 'BALANCED' | 'DEFENSIVE' | 'EVASIVE' | 'STEALTH';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PersonaProfile {
  id: string;
  name: string;
  aggression: number;      // [0, 1] Bias towards offensive actions and gap closing
  discipline: number;      // [0, 1] Inverse of stochastic noise; adherence to optimal score
  cinematicFlair: number;  // [0, 1] Preference for finishers, parries, and dramatic camera cuts
  reactionDelayMs: number; // Simulated human/protagonist motor latency
  preferredRange: number;  // Optimal engagement distance in meters
}

export interface EntitySnapshot {
  id: string;
  position: Vec3;
  velocity: Vec3;
  healthRatio: number;     // [0, 1]
  staminaRatio: number;    // [0, 1]
  isAttacking: boolean;
  isWindUp: boolean;       // Enemy telegraphing an incoming strike
  isRanged: boolean;
  threatWeight: number;    // Base danger level (e.g., 1.0 grunt, 3.0 elite/boss)
}

export interface WorldStateMap {
  [key: string]: boolean | number | string;
}

export interface CameraDirective {
  mode: 'PASSIVE' | 'DYNAMIC_ORBIT' | 'ACTION_TRACK' | 'IMPACT_SLOWMO' | 'FINISH_CUT';
  timeScale: number;       // 1.0 normal, 0.25 slow-mo, 2.0 fast-resolve
  fovMultiplier: number;   // e.g., 0.85 for tight dramatic focus
  focusTargetId: string | null;
}

// ============================================================================
// 1. LAYER 1: 16-SLOT CONTEXT STEERING (Andrew Fray / Craig Reynolds)
// ============================================================================

export class ContextSteering {
  private readonly slotCount: number;
  private readonly directions: Vec3[];

  constructor(slotCount = 16) {
    this.slotCount = slotCount;
    this.directions = [];
    for (let i = 0; i < slotCount; i++) {
      const angle = (i / slotCount) * Math.PI * 2;
      this.directions.push({ x: Math.cos(angle), y: 0, z: Math.sin(angle) });
    }
  }

  /**
   * Computes the conflict-free movement vector on the XZ plane using Interest and Danger maps.
   * Prevents oscillation traps common in classical vector-sum steering.
   */
  public computeMoveVector(
    selfPos: Vec3,
    targetPos: Vec3,
    preferredDistance: number,
    hazards: { position: Vec3; radius: number; weight: number }[]
  ): { direction: Vec3; speedMultiplier: number } {
    const interest = new Float64Array(this.slotCount);
    const danger = new Float64Array(this.slotCount);

    const dx = targetPos.x - selfPos.x;
    const dz = targetPos.z - selfPos.z;
    const dist = Math.hypot(dx, dz);
    const toTargetDir: Vec3 = dist > 1e-5 ? { x: dx / dist, y: 0, z: dz / dist } : { x: 0, y: 0, z: 0 };

    // Populate Interest Map
    for (let i = 0; i < this.slotCount; i++) {
      const slotDir = this.directions[i];
      const dot = slotDir.x * toTargetDir.x + slotDir.z * toTargetDir.z;

      if (dist > preferredDistance * 1.15) {
        // Close the gap
        interest[i] = Math.max(0, dot);
      } else if (dist < preferredDistance * 0.8) {
        // Too close: prefer backing away or strafing
        interest[i] = Math.max(0, -dot * 0.8 + (1 - Math.abs(dot)) * 0.5);
      } else {
        // In sweet spot: prefer strafing perpendicular to target
        interest[i] = 1.0 - Math.abs(dot);
      }
    }

    // Populate Danger Map
    for (const h of hazards) {
      const hx = h.position.x - selfPos.x;
      const hz = h.position.z - selfPos.z;
      const hDist = Math.hypot(hx, hz);
      if (hDist >= h.radius || hDist < 1e-5) continue;

      const hDir: Vec3 = { x: hx / hDist, y: 0, z: hz / hDist };
      const proximityUrgency = (1.0 - hDist / h.radius) * h.weight;

      for (let i = 0; i < this.slotCount; i++) {
        const slotDir = this.directions[i];
        const alignment = slotDir.x * hDir.x + slotDir.z * hDir.z;
        if (alignment > 0) {
          const dVal = alignment * proximityUrgency;
          if (dVal > danger[i]) danger[i] = dVal;
        }
      }
    }

    // Synthesize: mask high danger and pick maximum remaining interest
    let bestSlot = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < this.slotCount; i++) {
      const score = interest[i] - danger[i] * 1.35;
      if (score > bestScore) {
        bestScore = score;
        bestSlot = i;
      }
    }

    const chosen = this.directions[bestSlot];
    const speedMultiplier = Math.max(0.2, Math.min(1.0, bestScore + 0.5));
    return { direction: { ...chosen }, speedMultiplier };
  }
}

// ============================================================================
// 2. LAYER 2: BLACKBOARD & SPATIAL INFLUENCE MAP
// ============================================================================

export class InfluenceMap2D {
  public readonly gridSize: number;
  public readonly cellSize: number;
  private readonly grid: Float64Array;

  constructor(gridSize = 16, cellSize = 2.5) {
    this.gridSize = gridSize;
    this.cellSize = cellSize;
    this.grid = new Float64Array(gridSize * gridSize);
  }

  public update(centerPos: Vec3, hostiles: EntitySnapshot[], allies: EntitySnapshot[] = []): void {
    this.grid.fill(0);
    const halfSpan = (this.gridSize * this.cellSize) / 2;

    for (let gx = 0; gx < this.gridSize; gx++) {
      for (let gz = 0; gz < this.gridSize; gz++) {
        const worldX = centerPos.x - halfSpan + (gx + 0.5) * this.cellSize;
        const worldZ = centerPos.z - halfSpan + (gz + 0.5) * this.cellSize;

        let score = 0;
        for (const h of hostiles) {
          const d = Math.hypot(worldX - h.position.x, worldZ - h.position.z);
          score -= (h.threatWeight * (h.isWindUp ? 1.75 : 1.0)) / (1.0 + d * 0.45);
        }
        for (const a of allies) {
          const d = Math.hypot(worldX - a.position.x, worldZ - a.position.z);
          score += a.threatWeight / (1.0 + d * 0.5);
        }
        this.grid[gz * this.gridSize + gx] = score;
      }
    }
  }

  /**
   * Returns the safest tactical coordinate (highest influence value) within local grid.
   */
  public findSafestPocket(centerPos: Vec3): Vec3 {
    const halfSpan = (this.gridSize * this.cellSize) / 2;
    let bestIdx = 0;
    let bestVal = -Infinity;

    for (let i = 0; i < this.grid.length; i++) {
      if (this.grid[i] > bestVal) {
        bestVal = this.grid[i];
        bestIdx = i;
      }
    }

    const gx = bestIdx % this.gridSize;
    const gz = Math.floor(bestIdx / this.gridSize);
    return {
      x: centerPos.x - halfSpan + (gx + 0.5) * this.cellSize,
      y: centerPos.y,
      z: centerPos.z - halfSpan + (gz + 0.5) * this.cellSize,
    };
  }
}

export class TacticalBlackboard {
  public self!: EntitySnapshot;
  public hostiles: EntitySnapshot[] = [];
  public persona!: PersonaProfile;
  public presentationMode: PresentationMode = 'TACTICAL';
  public stance: TacticalStance = 'BALANCED';
  public primaryTarget: EntitySnapshot | null = null;
  public imminentThreat: EntitySnapshot | null = null;
  public pressureIndex = 0;
  public influenceMap = new InfluenceMap2D(12, 2.5);
  public customData: Record<string, unknown> = {};

  public refresh(self: EntitySnapshot, hostiles: EntitySnapshot[], persona: PersonaProfile): void {
    this.self = self;
    this.hostiles = hostiles.filter((h) => h.healthRatio > 0);
    this.persona = persona;

    // Identify imminent wind-up threat and primary target
    let nearestDist = Infinity;
    let bestTarget: EntitySnapshot | null = null;
    let windUpThreat: EntitySnapshot | null = null;
    let rawPressure = 0;

    for (const h of this.hostiles) {
      const d = Math.hypot(h.position.x - self.position.x, h.position.z - self.position.z);
      rawPressure += h.threatWeight / Math.max(1.0, d * 0.35);

      if (h.isWindUp && d < 4.5) {
        windUpThreat = h;
      }
      if (d < nearestDist) {
        nearestDist = d;
        bestTarget = h;
      }
    }

    this.primaryTarget = bestTarget;
    this.imminentThreat = windUpThreat;
    this.pressureIndex = Math.min(1.0, rawPressure / 3.5);
    this.influenceMap.update(self.position, this.hostiles);
  }

  public toWorldState(): WorldStateMap {
    const hasTarget = this.primaryTarget !== null;
    const dist = hasTarget
      ? Math.hypot(
          this.primaryTarget!.position.x - this.self.position.x,
          this.primaryTarget!.position.z - this.self.position.z
        )
      : Infinity;

    return {
      hasHostiles: this.hostiles.length > 0,
      inMeleeRange: dist <= 2.8,
      inPreferredRange: dist <= this.persona.preferredRange * 1.2,
      underImminentAttack: this.imminentThreat !== null,
      threatNeutralized: this.imminentThreat === null,
      healthCritical: this.self.healthRatio < 0.3,
      staminaSufficient: this.self.staminaRatio > 0.25,
      targetVulnerable: hasTarget && this.primaryTarget!.healthRatio < 0.25,
      enemyEliminated: !hasTarget,
      survived: this.self.healthRatio >= 0.65 && this.imminentThreat === null,
    };
  }
}

// ============================================================================
// 3. LAYER 3A: UTILITY AI CURVES & COMPENSATED SCORING (Dave Mark)
// ============================================================================

export const Curves = {
  linear: (x: number): number => Math.max(0, Math.min(1, x)),
  inverseLinear: (x: number): number => Math.max(0, Math.min(1, 1 - x)),
  quadratic: (x: number, k = 2): number => Math.pow(Math.max(0, Math.min(1, x)), k),
  logistic: (x: number, k = 10, x0 = 0.5): number => {
    const clamped = Math.max(0, Math.min(1, x));
    return 1.0 / (1.0 + Math.exp(-k * (clamped - x0)));
  },
};

export interface Consideration {
  name: string;
  evaluate: (bb: TacticalBlackboard) => number; // Must return normalized [0, 1]
  curve: (normValue: number) => number;
}

export class UtilityAction {
  public readonly id: string;
  public readonly considerations: Consideration[];

  constructor(id: string, considerations: Consideration[]) {
    this.id = id;
    this.considerations = considerations;
  }

  /**
   * Computes Dave Mark's Makeup Value Compensated multiplicative utility score:
   * Prevents actions with more considerations from being unfairly penalized.
   */
  public score(bb: TacticalBlackboard): number {
    if (this.considerations.length === 0) return 0;

    const n = this.considerations.length;
    const modificationFactor = 1.0 - 1.0 / n;
    let runningScore = 1.0;

    for (const c of this.considerations) {
      const raw = Math.max(0, Math.min(1, c.evaluate(bb)));
      const q = Math.max(0, Math.min(1, c.curve(raw)));
      const makeUpValue = (1.0 - q) * modificationFactor;
      runningScore *= q + makeUpValue * q;
      if (runningScore <= 1e-6) return 0;
    }

    return runningScore;
  }
}

// ============================================================================
// 4. LAYER 3B: REGRESSIVE A* GOAP PLANNER (Jeff Orkin / F.E.A.R.)
// ============================================================================

export interface GoapAction {
  name: string;
  preconditions: WorldStateMap;
  effects: WorldStateMap;
  baseCost: number;
  dynamicCost?: (bb: TacticalBlackboard) => number;
}

interface PlanNode {
  unmetGoal: WorldStateMap;
  actions: GoapAction[];
  gCost: number;
  fCost: number;
}

export class GoapPlanner {
  /**
   * Performs backward regressive A* search from desired Goal State to Current World State.
   */
  public plan(
    currentState: WorldStateMap,
    goalState: WorldStateMap,
    availableActions: GoapAction[],
    bb: TacticalBlackboard
  ): GoapAction[] | null {
    const openSet: PlanNode[] = [
      {
        unmetGoal: { ...goalState },
        actions: [],
        gCost: 0,
        fCost: this.heuristic(currentState, goalState),
      },
    ];
    const closedSet = new Set<string>();

    let iterations = 0;
    const maxIterations = 256;

    while (openSet.length > 0 && iterations++ < maxIterations) {
      openSet.sort((a, b) => a.fCost - b.fCost);
      const current = openSet.shift()!;

      if (this.isSatisfied(currentState, current.unmetGoal)) {
        return [...current.actions].reverse();
      }

      const key = this.serializeState(current.unmetGoal);
      if (closedSet.has(key)) continue;
      closedSet.add(key);

      for (const action of availableActions) {
        if (!this.doesActionSatisfyAny(action, current.unmetGoal, currentState)) continue;

        const nextUnmet = this.regressState(current.unmetGoal, action);
        const stepCost = action.dynamicCost ? action.dynamicCost(bb) : action.baseCost;
        const g = current.gCost + Math.max(0.05, stepCost);
        const h = this.heuristic(currentState, nextUnmet);

        openSet.push({
          unmetGoal: nextUnmet,
          actions: [...current.actions, action],
          gCost: g,
          fCost: g + h,
        });
      }
    }

    return null;
  }

  private isSatisfied(current: WorldStateMap, required: WorldStateMap): boolean {
    for (const [k, v] of Object.entries(required)) {
      if (current[k] !== v) return false;
    }
    return true;
  }

  private doesActionSatisfyAny(
    action: GoapAction,
    unmetGoal: WorldStateMap,
    currentState: WorldStateMap
  ): boolean {
    let helps = false;
    for (const [k, v] of Object.entries(action.effects)) {
      if (unmetGoal[k] !== undefined) {
        if (unmetGoal[k] === v && currentState[k] !== v) {
          helps = true;
        } else if (unmetGoal[k] !== v) {
          // Conflicting effect
          return false;
        }
      }
    }
    return helps;
  }

  private regressState(unmetGoal: WorldStateMap, action: GoapAction): WorldStateMap {
    const next: WorldStateMap = { ...unmetGoal };
    for (const k of Object.keys(action.effects)) {
      delete next[k];
    }
    for (const [k, v] of Object.entries(action.preconditions)) {
      next[k] = v;
    }
    return next;
  }

  private heuristic(current: WorldStateMap, required: WorldStateMap): number {
    let diff = 0;
    for (const [k, v] of Object.entries(required)) {
      if (current[k] !== v) diff++;
    }
    return diff * 0.5;
  }

  private serializeState(state: WorldStateMap): string {
    return Object.keys(state)
      .sort()
      .map((k) => `${k}:${String(state[k])}`)
      .join('|');
  }
}

// ============================================================================
// 5. LAYER 4: ORCHESTRATOR & UNIFIED PAWA BRAIN
// ============================================================================

export interface PawaDecision {
  stance: TacticalStance;
  selectedUtilityAction: string;
  utilityScore: number;
  goapPlan: string[];
  immediateCommand: string;
  steeringMove: Vec3;
  speedMultiplier: number;
  cameraDirective: CameraDirective;
}

export class PawaBrain {
  public readonly blackboard = new TacticalBlackboard();
  public readonly steering = new ContextSteering(16);
  public readonly planner = new GoapPlanner();
  private readonly utilityActions: UtilityAction[];
  private readonly goapActions: GoapAction[];

  constructor(customUtilityActions?: UtilityAction[], customGoapActions?: GoapAction[]) {
    this.utilityActions = customUtilityActions ?? PawaBrain.defaultUtilityActions();
    this.goapActions = customGoapActions ?? PawaBrain.defaultGoapActions();
  }

  /**
   * Executes a single cognitive tick across all 4 architectural layers.
   */
  public tick(
    self: EntitySnapshot,
    hostiles: EntitySnapshot[],
    persona: PersonaProfile,
    presentationMode: PresentationMode = 'TACTICAL'
  ): PawaDecision {
    // 1. Update Layer 2 (Blackboard + Spatial Influence Map)
    this.blackboard.presentationMode = presentationMode;
    this.blackboard.refresh(self, hostiles, persona);

    // 2. Layer 4: Orchestrator evaluates stance & high-level goal
    const stance = this.evaluateStance();
    this.blackboard.stance = stance;
    const goalState = this.selectGoalForStance(stance);

    // 3. Layer 3A: Evaluate Utility AI with compensated scoring
    let bestUtility = this.utilityActions[0];
    let bestScore = -1;
    for (const ua of this.utilityActions) {
      const s = ua.score(this.blackboard);
      if (s > bestScore) {
        bestScore = s;
        bestUtility = ua;
      }
    }

    // 4. Layer 3B: Regressive A* GOAP Plan from current WorldState to Orchestrator Goal
    const worldState = this.blackboard.toWorldState();
    const rawPlan = this.planner.plan(worldState, goalState, this.goapActions, this.blackboard) ?? [];
    const goapPlanNames = rawPlan.map((a) => a.name);

    // Immediate command merges urgent reflex utility (e.g. Parry/Dodge) with GOAP step 0
    const immediateCommand =
      bestScore > 0.78 ? bestUtility.id : goapPlanNames[0] ?? bestUtility.id;

    // 5. Layer 1: Context Steering vector synthesis
    let navTarget = self.position;
    if (stance === 'EVASIVE' || stance === 'DEFENSIVE') {
      navTarget = this.blackboard.influenceMap.findSafestPocket(self.position);
    } else if (this.blackboard.primaryTarget) {
      navTarget = this.blackboard.primaryTarget.position;
    }

    const hazards = this.blackboard.hostiles.map((h) => ({
      position: h.position,
      radius: h.isWindUp ? 4.2 : 2.5,
      weight: h.threatWeight * (h.isWindUp ? 1.8 : 1.0),
    }));

    const { direction, speedMultiplier } = this.steering.computeMoveVector(
      self.position,
      navTarget,
      persona.preferredRange,
      hazards
    );

    // 6. Layer 4: Presentation & Camera Director
    const cameraDirective = this.computeCameraDirective(
      presentationMode,
      immediateCommand,
      persona
    );

    return {
      stance,
      selectedUtilityAction: bestUtility.id,
      utilityScore: Number(bestScore.toFixed(4)),
      goapPlan: goapPlanNames,
      immediateCommand,
      steeringMove: direction,
      speedMultiplier: Number(speedMultiplier.toFixed(3)),
      cameraDirective,
    };
  }

  private evaluateStance(): TacticalStance {
    const bb = this.blackboard;
    if (bb.hostiles.length === 0) return 'STEALTH';
    if (bb.self.healthRatio < 0.28) return 'EVASIVE';
    if (bb.imminentThreat !== null || bb.pressureIndex > 0.72) return 'DEFENSIVE';
    if (bb.persona.aggression >= 0.65 && bb.self.staminaRatio > 0.35) return 'AGGRESSIVE';
    return 'BALANCED';
  }

  private selectGoalForStance(stance: TacticalStance): WorldStateMap {
    switch (stance) {
      case 'EVASIVE':
        return { survived: true };
      case 'DEFENSIVE':
        return { threatNeutralized: true };
      case 'AGGRESSIVE':
      case 'BALANCED':
        return { enemyEliminated: true };
      case 'STEALTH':
      default:
        return { threatNeutralized: true };
    }
  }

  private computeCameraDirective(
    mode: PresentationMode,
    command: string,
    persona: PersonaProfile
  ): CameraDirective {
    const targetId = this.blackboard.primaryTarget?.id ?? null;

    if (mode === 'TACTICAL') {
      return {
        mode: 'PASSIVE',
        timeScale: 1.0,
        fovMultiplier: 1.0,
        focusTargetId: targetId,
      };
    }

    if (mode === 'CINEMATIC_RESOLVE') {
      return {
        mode: 'FINISH_CUT',
        timeScale: 1.75,
        fovMultiplier: 0.82,
        focusTargetId: targetId,
      };
    }

    // CINEMATIC_LIVE: Action Director dynamically frames parries, finishers, and dodges
    if (command === 'EXECUTE_FINISHER' || command === 'DEFLECT_COUNTER') {
      return {
        mode: 'IMPACT_SLOWMO',
        timeScale: persona.cinematicFlair > 0.5 ? 0.35 : 0.65,
        fovMultiplier: 0.85,
        focusTargetId: targetId,
      };
    }

    return {
      mode: 'ACTION_TRACK',
      timeScale: 1.0,
      fovMultiplier: 0.92,
      focusTargetId: targetId,
    };
  }

  public static defaultUtilityActions(): UtilityAction[] {
    return [
      new UtilityAction('DEFLECT_COUNTER', [
        {
          name: 'ImminentStrike',
          evaluate: (bb) => (bb.imminentThreat ? 1.0 : 0.0),
          curve: Curves.linear,
        },
        {
          name: 'ProtagonistFlair',
          evaluate: (bb) => bb.persona.cinematicFlair * 0.5 + 0.5,
          curve: Curves.linear,
        },
      ]),
      new UtilityAction('EXECUTE_FINISHER', [
        {
          name: 'TargetNearDeath',
          evaluate: (bb) =>
            bb.primaryTarget ? 1.0 - bb.primaryTarget.healthRatio : 0.0,
          curve: Curves.logistic,
        },
        {
          name: 'CloseProximity',
          evaluate: (bb) => {
            if (!bb.primaryTarget) return 0;
            const d = Math.hypot(
              bb.primaryTarget.position.x - bb.self.position.x,
              bb.primaryTarget.position.z - bb.self.position.z
            );
            return Math.max(0, 1.0 - d / 3.5);
          },
          curve: Curves.quadratic,
        },
      ]),
      new UtilityAction('EVADE_REPOSITION', [
        {
          name: 'LowHealthUrgency',
          evaluate: (bb) => 1.0 - bb.self.healthRatio,
          curve: (x) => Curves.logistic(x, 12, 0.65),
        },
        {
          name: 'HighCrowdPressure',
          evaluate: (bb) => bb.pressureIndex,
          curve: Curves.linear,
        },
      ]),
      new UtilityAction('STRIKE_COMBO', [
        {
          name: 'StaminaAvailable',
          evaluate: (bb) => bb.self.staminaRatio,
          curve: Curves.linear,
        },
        {
          name: 'AggressionDrive',
          evaluate: (bb) => bb.persona.aggression,
          curve: Curves.linear,
        },
      ]),
    ];
  }

  public static defaultGoapActions(): GoapAction[] {
    return [
      {
        name: 'CLOSE_DISTANCE',
        preconditions: { hasHostiles: true },
        effects: { inMeleeRange: true, inPreferredRange: true },
        baseCost: 1.0,
      },
      {
        name: 'DEFLECT_COUNTER',
        preconditions: { underImminentAttack: true },
        effects: { underImminentAttack: false, threatNeutralized: true, targetVulnerable: true },
        baseCost: 0.6,
      },
      {
        name: 'HEAVY_ASSAULT',
        preconditions: { inMeleeRange: true, staminaSufficient: true },
        effects: { targetVulnerable: true },
        baseCost: 1.1,
      },
      {
        name: 'EXECUTE_FINISHER',
        preconditions: { inMeleeRange: true, targetVulnerable: true },
        effects: { enemyEliminated: true, threatNeutralized: true },
        baseCost: 0.4,
      },
      {
        name: 'TACTICAL_HEAL',
        preconditions: { healthCritical: true },
        effects: { healthCritical: false, survived: true },
        baseCost: 0.8,
      },
      {
        name: 'EVADE_TO_COVER',
        preconditions: { underImminentAttack: true },
        effects: { underImminentAttack: false, survived: true, threatNeutralized: true },
        baseCost: 0.9,
      },
    ];
  }
}
