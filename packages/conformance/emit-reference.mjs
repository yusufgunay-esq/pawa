/**
 * AUTOMA Cross-Language Conformance — TypeScript reference emitter
 * Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
 *
 * Runs the scenario corpus through the TypeScript reference kernel and writes:
 *   expected.json  — machine-readable reference decisions (consumed by every runner)
 *   scenarios.json — the scenario inputs serialized for non-JS kernels
 *
 * Usage: node packages/conformance/emit-reference.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AutomaBrain } from '../automa-brain-ts/src/index.ts';
import { SCENARIOS } from './scenarios.ts';

const HERE = dirname(fileURLToPath(import.meta.url));

export function runScenario(scenario) {
  // Fresh brain per scenario: the discipline jitter cursor and blackboard must not leak.
  const brain = new AutomaBrain();
  const decision = brain.tick(
    scenario.self,
    scenario.hostiles,
    scenario.profile,
    scenario.presentation,
    scenario.autonomy,
    scenario.waypoint
  );

  return {
    id: scenario.id,
    stance: decision.stance,
    interceptHumanInput: decision.interceptHumanInput,
    selectedUtilityAction: decision.selectedUtilityAction,
    utilityScore: decision.utilityScore,
    goapPlan: decision.goapPlan,
    immediateCommand: decision.immediateCommand,
    steering: [decision.steeringMove.x, decision.steeringMove.z],
    speedMultiplier: decision.speedMultiplier,
    camera: {
      mode: decision.cameraDirective.mode,
      timeScale: decision.cameraDirective.timeScale,
      fovMultiplier: decision.cameraDirective.fovMultiplier,
      focusTargetId: decision.cameraDirective.focusTargetId,
    },
  };
}

mkdirSync(join(HERE, 'fixtures'), { recursive: true });

const decisions = SCENARIOS.map(runScenario);
writeFileSync(join(HERE, 'fixtures', 'expected.json'), JSON.stringify(decisions, null, 2) + '\n', 'utf8');
writeFileSync(join(HERE, 'fixtures', 'scenarios.json'), JSON.stringify(SCENARIOS, null, 2) + '\n', 'utf8');

console.log(`[conformance] TS reference emitted ${decisions.length} decisions -> fixtures/expected.json`);
