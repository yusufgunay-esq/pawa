import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StuntRuntime, type InputSeam, type InterlockSeam, type PerceptionSeam } from '../src/index.ts';
import type { EntitySnapshot, BehaviorProfile } from '../../stuntdouble-brain-ts/src/index.ts';

const mk = (id: string, x: number, o: Partial<EntitySnapshot> = {}): EntitySnapshot => ({
  id, position: { x, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, healthRatio: 1, staminaRatio: 1,
  isAttacking: false, isWindUp: false, isRanged: false, threatWeight: 1, ...o,
});
const profile: BehaviorProfile = { id: 't', name: 't', aggression: 0.8, discipline: 0.9, cinematicFlair: 0.8, reactionDelayMs: 90, preferredRange: 2.2 };

function rig() {
  const log: string[] = [];
  const st = { cut: false, menu: false, load: false, manual: false, hostiles: [mk('e', 3)] };
  const perception: PerceptionSeam = { self: () => mk('p', 0), hostiles: () => st.hostiles, waypoint: () => undefined };
  const input: InputSeam = {
    command: (c) => log.push('cmd:' + c),
    steer: () => log.push('steer'),
    release: () => log.push('release'),
  };
  const interlock: InterlockSeam = { cutscene: () => st.cut, menu: () => st.menu, loading: () => st.load, manualOverride: () => st.manual };
  const rt = new StuntRuntime({ perception, input, interlock, profile });
  return { log, st, rt };
}

test('active tick drives command + steering', () => {
  const { log, rt } = rig();
  assert.equal(rt.tick().state, 'ACTIVE');
  assert.ok(log.some((l) => l.startsWith('cmd:')) && log.includes('steer'));
});

for (const k of ['cut', 'menu', 'load'] as const) {
  test(`${k} lock: zero command/steer, one neutral release`, () => {
    const { log, st, rt } = rig();
    rt.tick();
    log.length = 0;
    st[k] = true;
    for (let i = 0; i < 5; i++) assert.equal(rt.tick().state, 'LOCKED');
    assert.deepEqual(log, ['release']);
    st[k] = false;
    assert.equal(rt.tick().state, 'ACTIVE');
  });
}

test('manual override hands control back in the same tick, resumes after', () => {
  const { log, st, rt } = rig();
  rt.tick();
  log.length = 0;
  st.manual = true;
  assert.equal(rt.tick().state, 'MANUAL');
  assert.deepEqual(log, ['release']);
  st.manual = false;
  assert.equal(rt.tick().state, 'ACTIVE');
});

test('F5 toggle off releases and stays inert; toggle on resumes', () => {
  const { log, rt } = rig();
  rt.tick();
  log.length = 0;
  assert.equal(rt.toggle(), false);
  assert.equal(rt.tick().state, 'OFF');
  assert.deepEqual(log, ['release']);
  assert.equal(rt.toggle(), true);
  assert.equal(rt.tick().state, 'ACTIVE');
});

test('no active behavior (mask 0) passes human input through and never writes', () => {
  const { log, rt } = rig();
  rt.setBehaviors(0);
  assert.equal(rt.tick().state, 'PASS_THROUGH');
  assert.deepEqual(log, []);
});

test('onCombat: standby without hostiles, engages on sight, hands back after 2 s calm', () => {
  const { log, st } = rig();
  const rt = (() => {
    const perception: PerceptionSeam = { self: () => mk('p', 0), hostiles: () => st.hostiles, waypoint: () => undefined };
    const input: InputSeam = { command: (c) => log.push('cmd:' + c), steer: () => log.push('steer'), release: () => log.push('release') };
    const interlock: InterlockSeam = { cutscene: () => false, menu: () => false, loading: () => false, manualOverride: () => st.manual };
    return new StuntRuntime({ perception, input, interlock, profile, engage: 'onCombat' });
  })();
  st.hostiles = [];
  assert.equal(rt.tick(0.05).state, 'STANDBY');
  assert.deepEqual(log, []);
  st.hostiles = [mk('e', 3)];
  assert.equal(rt.tick(0.05).state, 'ACTIVE');
  st.hostiles = [];
  let t = 0;
  while (rt.tick(0.05).state === 'ACTIVE') t += 0.05;
  assert.ok(t >= 1.9 && t <= 2.2, 'handback after ~2 s, got ' + t);
  assert.equal(log.at(-1), 'release');
});

test('manual engage: off until toggled, no fixed key', () => {
  const { st } = rig();
  const log: string[] = [];
  const rt = new StuntRuntime({
    perception: { self: () => mk('p', 0), hostiles: () => st.hostiles, waypoint: () => undefined },
    input: { command: (c) => log.push(c), steer: () => {}, release: () => log.push('release') },
    interlock: { cutscene: () => false, menu: () => false, loading: () => false, manualOverride: () => false },
    profile, engage: 'manual', toggleKey: 'F9',
  });
  assert.equal(rt.toggleKey, 'F9');
  assert.equal(rt.tick().state, 'OFF');
  assert.deepEqual(log, []);
  rt.toggle();
  assert.equal(rt.tick().state, 'ACTIVE');
});

test('native AI is base layer; Stuntdouble overrides only on imminent strike and records why', () => {
  const { st } = rig();
  const cmds: string[] = [];
  const mkRt = (overrideNative: boolean) =>
    new StuntRuntime({
      perception: { self: () => mk('p', 0), hostiles: () => st.hostiles, waypoint: () => undefined },
      input: { command: (c) => cmds.push(c), steer: () => {}, release: () => {} },
      interlock: { cutscene: () => false, menu: () => false, loading: () => false, manualOverride: () => false },
      profile, overrideNative,
      native: { available: () => true, proposeCommand: () => ({ command: 'STRIKE_COMBO' }) },
    });
  st.hostiles = [mk('e', 3)];
  let r = mkRt(true).tick();
  assert.equal(r.override, undefined);
  assert.equal(cmds.at(-1), 'STRIKE_COMBO');
  st.hostiles = [mk('e', 2.5, { isWindUp: true })];
  r = mkRt(true).tick();
  assert.equal(r.override?.reason, 'imminent-strike');
  assert.equal(r.override?.native, 'STRIKE_COMBO');
  assert.notEqual(cmds.at(-1), 'STRIKE_COMBO');
  mkRt(false).tick();
  assert.equal(cmds.at(-1), 'STRIKE_COMBO');
});

test('danger stance: native command stands but Stuntdouble keeps the steering (native cannot walk the player back in)', () => {
  const steers: { x: number; z: number }[] = [];
  const mkRt = (overrideNative: boolean) =>
    new StuntRuntime({
      perception: { self: () => mk('p', 0), hostiles: () => [mk('e', 2.5, { isWindUp: true })], waypoint: () => undefined },
      input: { command: () => {}, steer: (d) => steers.push({ x: d.x, z: d.z }), release: () => {} },
      interlock: { cutscene: () => false, menu: () => false, loading: () => false, manualOverride: () => false },
      profile, overrideNative,
      native: { available: () => true, proposeCommand: () => ({ command: 'DEFLECT_COUNTER', steer: { direction: { x: 1, y: 0, z: 0 }, speed: 1 } }) },
    });
  mkRt(true).tick();
  mkRt(false).tick();
  assert.ok(steers[0].x < 0.5, 'Stuntdouble steering expected, got ' + JSON.stringify(steers[0]));
  assert.deepEqual(steers[1], { x: 1, z: 0 });
});
