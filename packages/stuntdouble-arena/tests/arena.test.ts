import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, TIER_SCENARIOS } from '../src/scenarios.ts';
import { compare, compareGate, crowdGate, COMPARE_SEEDS } from '../src/compare.ts';
import { avoidRatio } from '../src/gates.ts';
import { runScenario } from '../src/sim.ts';
import { evaluateGates } from '../src/gates.ts';

const SEEDS = [1, 2, 3, 4, 5];

for (const sc of SCENARIOS) {
  test(`gates pass: ${sc.id} (seeds ${SEEDS.join(',')})`, () => {
    for (const seed of SEEDS) {
      const baseline = sc.native ? runScenario(sc, seed, { nativeOnly: true }) : undefined;
      const gates = evaluateGates(sc, runScenario(sc, seed), baseline);
      const bad = gates.filter((g) => !g.pass);
      assert.deepEqual(bad, [], `seed ${seed}`);
    }
  });
}

test('arena is deterministic: same seed, same result', () => {
  const sc = SCENARIOS[1];
  assert.deepEqual(runScenario(sc, 7), runScenario(sc, 7));
});

test('DEFENSIVE boss fight issues zero attack commands on every seed', () => {
  const sc = SCENARIOS.find((s) => s.id === 'boss_defensive')!;
  for (const seed of SEEDS) assert.equal(runScenario(sc, seed).attackCommands, 0);
});

test('native overlay: Stuntdouble layer clearly beats the weak native AI alone', () => {
  const sc = SCENARIOS.find((s) => s.id === 'native_overlay')!;
  for (const seed of SEEDS) {
    const withLayer = runScenario(sc, seed);
    const native = runScenario(sc, seed, { nativeOnly: true });
    assert.ok(withLayer.survived);
    assert.ok(withLayer.hpEnd > native.hpEnd, `hp ${withLayer.hpEnd} vs ${native.hpEnd}`);
    assert.ok(withLayer.hit < native.hit, `hits ${withLayer.hit} vs ${native.hit}`);
    assert.ok(withLayer.overrides > 0);
  }
});

test('profile effect is real: high aggression issues clearly more attacks than low', () => {
  const sc = SCENARIOS.find((s) => s.id === 'duel')!;
  const mk = (aggression: number) => ({ ...sc.profile, aggression });
  for (const seed of SEEDS) {
    const hi = runScenario(sc, seed, { profile: mk(0.95) });
    const lo = runScenario(sc, seed, { profile: mk(0.15) });
    assert.ok(hi.attackCommands >= lo.attackCommands * 1.2 + 3, `seed ${seed}: hi ${hi.attackCommands} lo ${lo.attackCommands}`);
  }
});

for (const sc of TIER_SCENARIOS) {
  test(`tier gates pass (Stuntdouble alone): ${sc.id}`, () => {
    for (const seed of SEEDS) assert.deepEqual(evaluateGates(sc, runScenario(sc, seed)).filter((g) => !g.pass), [], `seed ${seed}`);
  });
}

test('hard tier: Stuntdouble and native+Stuntdouble beat naive bot and weak native (fixed thresholds)', () => {
  const t3 = TIER_SCENARIOS.find((s) => s.tier === 3)!;
  const g = compareGate(compare(t3, COMPARE_SEEDS));
  assert.ok(g.pass, g.detail.join(' | '));
});

test('crowd tier (t4): Stuntdouble and native+Stuntdouble survive AND counter-attack (fixed thresholds)', () => {
  const t4 = TIER_SCENARIOS.find((s) => s.tier === 4)!;
  const st = compare(t4, COMPARE_SEEDS);
  const g = crowdGate(st);
  assert.ok(g.pass, g.detail.join(' | '));
  for (const a of ['stuntdouble', 'layered']) assert.ok(st.find((x) => x.agent === a)!.minKills >= 1, a);
});

test('crowd tier (t4): fights back instead of fleeing (kills, attack share, no wall hugging, long-range archer answered)', () => {
  const t4 = TIER_SCENARIOS.find((s) => s.tier === 4)!;
  for (const seed of SEEDS) {
    const r = runScenario(t4, seed);
    assert.ok(r.survived && r.enemiesKilled >= 1 && r.attacksLanded >= 1, `seed ${seed}`);
    assert.ok(r.attackCommands / Math.max(1, r.stateTicks.ACTIVE ?? 1) > 0.2, `seed ${seed}`);
    assert.ok(r.wallRatio <= 0.15 && r.unreactableHit === 0 && r.projectilesFired > 0, `seed ${seed}`);
  }
});

test('tier runs are deterministic', () => {
  const t3 = TIER_SCENARIOS[2];
  assert.deepEqual(runScenario(t3, 3), runScenario(t3, 3));
});

test('ranged wind-ups and projectiles are answered: shots fired, zero unreactable hits', () => {
  const t3 = TIER_SCENARIOS[2];
  for (const seed of SEEDS) {
    const r = runScenario(t3, seed);
    assert.ok(r.projectilesFired > 5);
    assert.equal(r.unreactableHit, 0);
  }
});

const mean = (sc: (typeof SCENARIOS)[number], f: (r: ReturnType<typeof runScenario>) => number, prof: object, seeds = [1, 2, 3, 4, 5, 6]) =>
  seeds.reduce((a, s) => a + f(runScenario(sc, s, { profile: { ...sc.profile, ...prof }, nativeKind: 'none' })), 0) / seeds.length;
const nonDecreasing = (xs: number[], eps: number) => xs.every((x, i) => i === 0 || x >= xs[i - 1] - eps);

test('monotone: aggression up -> attack share up (whole range, incl. 0.15-0.5)', () => {
  const duel = SCENARIOS.find((s) => s.id === 'duel')!;
  const two = { ...SCENARIOS.find((s) => s.id === 'surround3')!, enemies: SCENARIOS.find((s) => s.id === 'surround3')!.enemies.slice(0, 2) };
  for (const sc of [duel, two]) {
    const xs = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9].map((a) => mean(sc, (r) => r.attackCommands / Math.max(1, r.stateTicks.ACTIVE ?? 1), { aggression: a }));
    assert.ok(nonDecreasing(xs, 0.02), xs.join(' '));
    assert.ok(xs[5] > xs[0] * 1.5, xs.join(' '));
    assert.ok(xs[2] > xs[0] + 0.05, 'low band must not be dead: ' + xs.join(' '));
    assert.ok(xs[3] > xs[1] + 0.05, '0.3 -> 0.6 band must slope (005): ' + xs.join(' '));
  }
});

test('monotone: reactionDelayMs up -> avoidance down, damage up', () => {
  const t2 = TIER_SCENARIOS[1];
  const delays = [0, 100, 250, 400, 600];
  const avoid = delays.map((d) => mean(t2, avoidRatio, { reactionDelayMs: d }));
  const dmg = delays.map((d) => mean(t2, (r) => r.damageTaken, { reactionDelayMs: d }));
  assert.ok(nonDecreasing(avoid.map((x) => -x), 0.03), avoid.join(' '));
  assert.ok(nonDecreasing(dmg, 3), dmg.join(' '));
  assert.ok(avoid[0] > avoid[4] + 0.2);
});

test('monotone: preferredRange up -> mean enemy distance up', () => {
  const t2 = TIER_SCENARIOS[1];
  const xs = [1.5, 2.5, 4, 6, 8].map((r) => mean(t2, (x) => x.meanEnemyDist, { preferredRange: r }));
  assert.ok(nonDecreasing(xs, 0.15), xs.join(' '));
  assert.ok(xs[4] > xs[0] + 1.5, xs.join(' '));
});
