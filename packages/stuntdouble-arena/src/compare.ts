import type { Scenario, RunResult } from './sim.ts';
import { runScenario } from './sim.ts';

export type Agent = 'naive' | 'native' | 'stuntdouble' | 'layered';
export const AGENTS: { id: Agent; label: string }[] = [
  { id: 'naive', label: '(a) naive bot' },
  { id: 'native', label: '(b) weak native AI' },
  { id: 'stuntdouble', label: '(c) Stuntdouble' },
  { id: 'layered', label: '(d) native + Stuntdouble' },
];

export function runAgent(sc: Scenario, seed: number, agent: Agent, record = false): RunResult {
  switch (agent) {
    case 'naive': return runScenario(sc, seed, { nativeKind: 'weak', nativeOnly: true, record });
    case 'native': return runScenario(sc, seed, { nativeKind: 'basic', nativeOnly: true, record });
    case 'stuntdouble': return runScenario(sc, seed, { nativeKind: 'none', record });
    case 'layered': return runScenario(sc, seed, { nativeKind: 'basic', record });
  }
}

export interface AgentStats { agent: Agent; label: string; runs: number; survived: number; hpEnd: number; damage: number; kills: number; minKills: number; hits: number; attackRatio: number }

export function compare(sc: Scenario, seeds: number[]): AgentStats[] {
  return AGENTS.map(({ id, label }) => {
    const rs = seeds.map((s) => runAgent(sc, s, id));
    const avg = (f: (r: RunResult) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    return { agent: id, label, runs: rs.length, survived: rs.filter((r) => r.survived).length, hpEnd: avg((r) => r.hpEnd), damage: avg((r) => r.damageTaken), kills: avg((r) => r.enemiesKilled), minKills: Math.min(...rs.map((r) => r.enemiesKilled)), hits: avg((r) => r.hit), attackRatio: avg((r) => r.attackCommands / Math.max(1, r.stateTicks.ACTIVE ?? 1)) };
  });
}

export const COMPARE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/**
 * Fixed hard-tier thresholds (seeds 1-8). Protected by arena.test.ts; never tuned per run.
 * (a)/(b) must die or take heavy damage; (c)/(d) must survive every seed with clearly less damage.
 */
export function compareGate(stats: AgentStats[]): { pass: boolean; detail: string[] } {
  const by = Object.fromEntries(stats.map((s) => [s.agent, s])) as Record<Agent, AgentStats>;
  const detail: string[] = [];
  const check = (name: string, ok: boolean, info: string) => detail.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${info}`);
  const n = by.stuntdouble.runs;
  check('(a) naive dies', by.naive.survived <= 1, `${by.naive.survived}/${n} survived (max 1)`);
  check('(b) native hurt', by.native.survived <= n - 2 && by.native.damage >= 100, `${by.native.survived}/${n} survived (max ${n - 2}), damage ${by.native.damage.toFixed(0)} (min 100)`);
  for (const k of ['stuntdouble', 'layered'] as Agent[]) {
    const s = by[k];
    check(`${s.label} survives`, s.survived === n, `${s.survived}/${n}`);
    check(`${s.label} far less damage`, s.damage <= 50 && s.damage <= 0.5 * by.native.damage && s.damage <= 0.5 * by.naive.damage, `damage ${s.damage.toFixed(0)} (max 50 and <= half of (a)/(b))`);
  }
  return { pass: detail.every((d) => d.startsWith('ok')), detail };
}

/**
 * Crowd tier (t4_crowd, 005): same survival/damage idea as the hard tier, plus the counter-attack
 * requirement. Surviving by running away is not enough: every seed must kill at least one enemy and
 * the attack share of active ticks must be above zero. Thresholds fixed (seeds 1-8).
 */
export function crowdGate(stats: AgentStats[]): { pass: boolean; detail: string[] } {
  const by = Object.fromEntries(stats.map((s) => [s.agent, s])) as Record<Agent, AgentStats>;
  const detail: string[] = [];
  const check = (name: string, ok: boolean, info: string) => detail.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${info}`);
  const n = by.stuntdouble.runs;
  check('(a) naive dies', by.naive.survived <= 1, `${by.naive.survived}/${n} survived (max 1)`);
  check('(b) native hurt', by.native.survived <= n - 2 && by.native.damage >= 100, `${by.native.survived}/${n} survived (max ${n - 2}), damage ${by.native.damage.toFixed(0)} (min 100)`);
  for (const k of ['stuntdouble', 'layered'] as Agent[]) {
    const s = by[k];
    check(`${s.label} survives`, s.survived === n, `${s.survived}/${n}`);
    check(`${s.label} counter-attacks`, s.minKills >= 1 && s.attackRatio > 0, `kills min ${s.minKills} (need >= 1), attack share ${(s.attackRatio * 100).toFixed(0)}% of active ticks (need > 0)`);
    check(`${s.label} less damage`, s.damage <= 100 && s.damage <= 0.75 * by.native.damage && s.damage <= 0.75 * by.naive.damage, `damage ${s.damage.toFixed(0)} (max 100 and <= 0.75 x (a)/(b))`);
  }
  return { pass: detail.every((d) => d.startsWith('ok')), detail };
}
