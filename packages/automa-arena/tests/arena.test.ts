import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS } from '../src/scenarios.ts';
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

test('native overlay: AUTOMA layer clearly beats the weak native AI alone', () => {
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
