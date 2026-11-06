/**
 * AUTOMA arena: deterministic 2D (XZ) combat simulator that drives AutomaRuntime through the
 * seams. Only a seeded PRNG is used; same scenario + seed + profile => identical result.
 * Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
 */
import type { BehaviorProfile, EntitySnapshot, Vec3 } from '../../automa-brain-ts/src/index.ts';
import { AutomaRuntime, type NativeAiSeam, type InputSeam, type InterlockSeam, type PerceptionSeam } from '../../automa-seams-ts/src/index.ts';

export interface EnemySpec {
  id: string;
  x: number;
  z: number;
  /** When set, x/z are an offset from the player's position at spawn time. */
  rel?: boolean;
  spawnAt?: number;
  hp: number;
  damage: number;
  windup: number;   // telegraph seconds
  recover: number;  // seconds after a strike (or combo)
  reach: number;    // strike reach in meters
  speed: number;    // m/s
  ranged?: boolean;
  combo?: number;   // strikes per attack chain (default 1)
  threat: number;
}

export interface LockWindow { from: number; to: number; kind: 'cutscene' | 'menu' | 'loading' | 'manual' }

export interface GateSpec {
  survive: boolean;
  winAll?: boolean;          // every enemy dead before maxTime
  minAvoid?: number;         // (parried + dodged) / reactable telegraphs
  maxAttackCommands?: number;
  maxReversal: number;
  autoEngage?: boolean;      // onCombat: 0 inputs in standby, takeover <= 0.2 s after first hostile, hand-back ~2 s after last kill
  beatsNative?: number;      // avoid ratio must exceed native-only baseline by this margin       // reversing steering ticks / moving ticks
  waypointsAll?: boolean;
  zeroLockedInput: boolean;
}

export interface Scenario {
  id: string;
  title: string;
  behaviors: number;
  profile: BehaviorProfile;
  enemies: EnemySpec[];
  obstacles: { x: number; z: number; r: number }[];
  waypoints?: { x: number; z: number; loot?: boolean }[];
  locks?: LockWindow[];
  maxTime: number;
  engage?: 'onCombat' | 'manual';
  /** 'weak' = deliberately bad native AI (ignores wind-ups, runs straight at the nearest enemy). */
  native?: 'weak';
  gates: GateSpec;
}

export interface RunResult {
  scenario: string;
  seed: number;
  time: number;
  survived: boolean;
  hpEnd: number;
  enemiesKilled: number;
  enemiesTotal: number;
  telegraphs: number;
  reactable: number;
  parried: number;
  dodged: number;
  hit: number;
  whiff: number;
  unreactableHit: number;
  attackCommands: number;
  attacksLanded: number;
  reversalRatio: number;
  lockedInputs: number;
  manualHandbackOk: boolean;
  standbyInputs: number;
  engageDelay: number;
  handbackDelay: number;
  overrides: number;
  stateTicks: Record<string, number>;
  waypointsReached: number;
  waypointsTotal: number;
  steps?: Step[];
}

export interface Step {
  t: number;
  p: [number, number, number, string]; // x, z, hp ratio, runtime state
  e: [string, number, number, number, string][]; // id, x, z, hp ratio, phase
  ev?: string[];
}

export const DT = 0.05;
const PLAYER_SPEED = 4;
const PLAYER_RADIUS = 0.5;
const ARENA = 40;
const BRAIN_IMMINENT_RANGE = 4.5; // TacticalBlackboard.refresh: wind-up counts as imminent inside 4.5 m

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Enemy {
  spec: EnemySpec;
  x: number;
  z: number;
  hp: number;
  phase: 'approach' | 'windup' | 'recover';
  timer: number;
  comboLeft: number;
  struckTick: boolean;
  reactable: boolean;
  vx: number;
  vz: number;
}

const ATTACK_CMDS = new Set(['STRIKE_COMBO', 'HEAVY_ASSAULT', 'EXECUTE_FINISHER']);

export function runScenario(sc: Scenario, seed: number, opts: { record?: boolean; profile?: BehaviorProfile; nativeOnly?: boolean } = {}): RunResult {
  const rng = mulberry32(seed);
  const profile = opts.profile ?? sc.profile;
  const latencyTicks = Math.max(0, Math.round(profile.reactionDelayMs / 1000 / DT));

  // ---- world state ----
  let time = 0;
  const player = { x: 0, z: 0, hp: 100, stamina: 100, atkCd: 0, parryUntil: -1, dodgeUntil: -1, dodgeCd: 0, heals: 2, lastAtk: -9, vx: 0, vz: 0 };
  const enemies: Enemy[] = [];
  const pending = sc.enemies.slice().sort((a, b) => (a.spawnAt ?? 0) - (b.spawnAt ?? 0));
  let wpIdx = 0;
  let killed = 0;
  const res: RunResult = {
    scenario: sc.id, seed, time: 0, survived: true, hpEnd: 100, enemiesKilled: 0, enemiesTotal: sc.enemies.length,
    telegraphs: 0, reactable: 0, parried: 0, dodged: 0, hit: 0, whiff: 0, unreactableHit: 0,
    attackCommands: 0, attacksLanded: 0, reversalRatio: 0, lockedInputs: 0, manualHandbackOk: true, standbyInputs: 0, engageDelay: -1, handbackDelay: -1, overrides: 0, stateTicks: {},
    waypointsReached: 0, waypointsTotal: sc.waypoints?.length ?? 0,
  };
  const steps: Step[] = [];
  let events: string[] = [];

  // ---- seams ----
  const queue: { at: number; kind: 'cmd' | 'steer' | 'release'; cmd?: string; dir?: Vec3; speed?: number }[] = [];
  let tickNo = 0;
  let steerDir: Vec3 = { x: 0, y: 0, z: 0 };
  let steerSpeed = 0;
  let lockNow = false;
  let manualRising = false;
  let wasManual = false;
  let inputThisTick = 0;
  let releasedThisTick = false;

  const activeLock = (kind?: 'manual') => {
    for (const l of sc.locks ?? []) {
      if (time >= l.from && time < l.to && (kind ? l.kind === kind : l.kind !== 'manual')) return true;
    }
    return false;
  };

  const snap = (e: Enemy): EntitySnapshot => ({
    id: e.spec.id,
    position: { x: e.x, y: 0, z: e.z },
    velocity: { x: e.vx, y: 0, z: e.vz },
    healthRatio: Math.max(0, e.hp / e.spec.hp),
    staminaRatio: 1,
    isAttacking: e.struckTick,
    isWindUp: e.phase === 'windup',
    isRanged: !!e.spec.ranged,
    threatWeight: e.spec.threat,
  });

  const perception: PerceptionSeam = {
    self: () => ({
      id: 'player',
      position: { x: player.x, y: 0, z: player.z },
      velocity: { x: player.vx, y: 0, z: player.vz },
      healthRatio: Math.max(0, player.hp / 100),
      staminaRatio: player.stamina / 100,
      isAttacking: time - player.lastAtk < 0.3,
      isWindUp: false,
      isRanged: false,
      threatWeight: 1,
    }),
    hostiles: () => enemies.filter((e) => e.hp > 0).map(snap),
    waypoint: () => {
      const w = sc.waypoints?.[wpIdx];
      return w ? { x: w.x, y: 0, z: w.z } : undefined;
    },
  };

  const input: InputSeam = {
    command: (id) => {
      inputThisTick++;
      if (lockNow || manualRising) res.lockedInputs++;
      if (ATTACK_CMDS.has(id)) res.attackCommands++;
      queue.push({ at: tickNo + latencyTicks, kind: 'cmd', cmd: id });
    },
    steer: (d, s) => {
      inputThisTick++;
      if (lockNow || manualRising) res.lockedInputs++;
      queue.push({ at: tickNo + latencyTicks, kind: 'steer', dir: { x: d.x, y: 0, z: d.z }, speed: s });
    },
    release: () => {
      releasedThisTick = true;
      queue.length = 0;
      steerDir = { x: 0, y: 0, z: 0 };
      steerSpeed = 0;
    },
  };

  const interlock: InterlockSeam = {
    cutscene: () => sc.locks?.some((l) => l.kind === 'cutscene' && time >= l.from && time < l.to) ?? false,
    menu: () => sc.locks?.some((l) => l.kind === 'menu' && time >= l.from && time < l.to) ?? false,
    loading: () => sc.locks?.some((l) => l.kind === 'loading' && time >= l.from && time < l.to) ?? false,
    manualOverride: () => activeLock('manual'),
  };

  const native: NativeAiSeam | undefined = sc.native
    ? {
        available: () => true,
        proposeCommand: () => {
          const t = nearestEnemy();
          if (!t) return null;
          const dx = t.x - player.x;
          const dz = t.z - player.z;
          const d = Math.hypot(dx, dz);
          // Deliberately weak: never reads wind-ups, never retreats, runs straight and swings.
          if (d <= 2.4) return { command: 'STRIKE_COMBO', steer: { direction: { x: 0, y: 0, z: 0 }, speed: 0 } };
          return { command: 'CLOSE_DISTANCE', steer: { direction: { x: dx / d, y: 0, z: dz / d }, speed: 1 } };
        },
      }
    : undefined;
  const runtime = new AutomaRuntime({
    perception, input, interlock, profile, behaviors: sc.behaviors,
    engage: sc.engage ?? 'onCombat', native, overrideNative: !opts.nativeOnly,
  });

  const applyCommand = (cmd: string): void => {
    const tgt = nearestEnemy();
    if (ATTACK_CMDS.has(cmd)) {
      if (!tgt || player.atkCd > 0) return;
      const d = Math.hypot(tgt.x - player.x, tgt.z - player.z);
      if (d > 2.8) return;
      const heavy = cmd === 'HEAVY_ASSAULT';
      const fin = cmd === 'EXECUTE_FINISHER';
      const cost = heavy ? 20 : fin ? 10 : 8;
      if (player.stamina < cost) return;
      player.stamina -= cost;
      player.atkCd = heavy ? 0.9 : 0.5;
      player.lastAtk = time;
      const dmg = fin && tgt.hp / tgt.spec.hp < 0.25 ? tgt.spec.hp : heavy ? 18 : 10;
      tgt.hp -= dmg;
      res.attacksLanded++;
      events.push('hit:' + tgt.spec.id);
      if (tgt.hp <= 0) { killed++; events.push('kill:' + tgt.spec.id); }
    } else if (cmd === 'DEFLECT_COUNTER') {
      if (player.parryUntil < time) {
        if (player.stamina < 6) return;
        player.stamina -= 6;
      }
      player.parryUntil = time + 0.3;
    } else if (cmd === 'EVADE_REPOSITION' || cmd === 'EVADE_TO_COVER') {
      if (player.dodgeCd <= 0) {
        player.dodgeUntil = time + 0.35;
        player.dodgeCd = 0.9;
      }
    } else if (cmd === 'TACTICAL_HEAL') {
      if (player.heals > 0 && player.hp < 100) {
        player.heals--;
        player.hp = Math.min(100, player.hp + 40);
        events.push('heal');
      }
    }
  };

  const nearestEnemy = (): Enemy | null => {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const d = Math.hypot(e.x - player.x, e.z - player.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  const pushOut = (o: { x: number; z: number }, r: number): void => {
    for (const ob of sc.obstacles) {
      const dx = o.x - ob.x;
      const dz = o.z - ob.z;
      const d = Math.hypot(dx, dz);
      const min = ob.r + r;
      if (d < min && d > 1e-6) { o.x = ob.x + (dx / d) * min; o.z = ob.z + (dz / d) * min; }
    }
    o.x = Math.max(-ARENA, Math.min(ARENA, o.x));
    o.z = Math.max(-ARENA, Math.min(ARENA, o.z));
  };

  const startWindup = (e: Enemy, d: number): void => {
    e.phase = 'windup';
    e.timer = e.spec.windup * (0.9 + 0.2 * rng());
    e.reactable = d < BRAIN_IMMINENT_RANGE;
    res.telegraphs++;
    if (e.reactable) res.reactable++;
  };

  const resolveStrike = (e: Enemy): void => {
    const d = Math.hypot(e.x - player.x, e.z - player.z);
    e.struckTick = true;
    if (time < player.parryUntil && d <= e.spec.reach + 1.2) {
      res.parried++;
      e.phase = 'recover';
      e.timer = 1.0;
      e.comboLeft = 0;
      events.push('parry');
      return;
    }
    if (time < player.dodgeUntil) { res.dodged++; events.push('dodge'); return; }
    if (d > e.spec.reach + 0.8) { res.whiff++; events.push('whiff'); return; }
    res.hit++;
    if (!e.reactable) res.unreactableHit++;
    player.hp -= e.spec.damage;
    events.push('hurt');
  };

  // ---- main loop ----
  const maxTicks = Math.round(sc.maxTime / DT);
  let moving = 0;
  let reversals = 0;
  let prevDir: Vec3 | null = null;
  let manualFirstTick = false;
  let firstSpawn = -1;
  let allDeadAt = -1;

  for (tickNo = 0; tickNo < maxTicks; tickNo++) {
    time = tickNo * DT;
    events = [];
    // spawns
    while (pending.length && (pending[0].spawnAt ?? 0) <= time) {
      const s = pending.shift()!;
      if (firstSpawn < 0) firstSpawn = time;
      enemies.push({
        spec: s, x: s.rel ? player.x + s.x : s.x, z: s.rel ? player.z + s.z : s.z, hp: s.hp,
        phase: 'approach', timer: 0.6 + rng() * 0.6, comboLeft: 0, struckTick: false, reactable: false, vx: 0, vz: 0,
      });
    }

    // runtime control step
    lockNow = activeLock();
    const manualNow = activeLock('manual');
    manualRising = manualNow && !wasManual;
    wasManual = manualNow;
    inputThisTick = 0;
    releasedThisTick = false;
    const out = runtime.tick(DT);
    res.stateTicks[out.state] = (res.stateTicks[out.state] ?? 0) + 1;
    if (out.override) res.overrides++;
    if (out.state === 'STANDBY') res.standbyInputs += inputThisTick;
    if (out.state === 'ACTIVE' && res.engageDelay < 0 && firstSpawn >= 0) res.engageDelay = Math.round((time - firstSpawn) * 100) / 100;
    if (allDeadAt >= 0 && res.handbackDelay < 0 && out.state === 'STANDBY') res.handbackDelay = Math.round((time - allDeadAt) * 100) / 100;
    if (manualRising) manualFirstTick = inputThisTick === 0;
    if (manualRising && !manualFirstTick) res.manualHandbackOk = false;
    manualRising = false;

    // deliver due inputs
    for (let i = 0; i < queue.length; ) {
      if (queue[i].at <= tickNo) {
        const q = queue.splice(i, 1)[0];
        if (q.kind === 'cmd') applyCommand(q.cmd!);
        else if (q.kind === 'steer') { steerDir = q.dir!; steerSpeed = q.speed!; }
      } else i++;
    }

    // player timers & movement
    player.atkCd = Math.max(0, player.atkCd - DT);
    player.dodgeCd = Math.max(0, player.dodgeCd - DT);
    player.stamina = Math.min(100, player.stamina + 12 * DT);
    const sp = steerSpeed * PLAYER_SPEED;
    player.vx = steerDir.x * sp;
    player.vz = steerDir.z * sp;
    player.x += player.vx * DT;
    player.z += player.vz * DT;
    pushOut(player, PLAYER_RADIUS);
    if (sp > 0.05 && out.state === 'ACTIVE') {
      moving++;
      if (prevDir && prevDir.x * steerDir.x + prevDir.z * steerDir.z < -0.5) reversals++;
      prevDir = { ...steerDir };
    } else prevDir = null;

    // waypoints
    const w = sc.waypoints?.[wpIdx];
    if (w && Math.hypot(w.x - player.x, w.z - player.z) < 1.0) {
      wpIdx++;
      res.waypointsReached++;
      events.push(w.loot ? 'loot' : 'waypoint');
    }

    // enemies
    for (const e of enemies) {
      e.struckTick = false;
      e.vx = 0;
      e.vz = 0;
      if (e.hp <= 0) continue;
      const dx = player.x - e.x;
      const dz = player.z - e.z;
      const d = Math.hypot(dx, dz);
      const ux = d > 1e-6 ? dx / d : 0;
      const uz = d > 1e-6 ? dz / d : 0;
      if (e.phase === 'approach') {
        e.timer -= DT;
        let dir = 0;
        if (e.spec.ranged) {
          if (d > 11) dir = 1; else if (d < 7) dir = -1;
        } else if (d > e.spec.reach * 0.9) dir = 1;
        e.vx = ux * dir * e.spec.speed;
        e.vz = uz * dir * e.spec.speed;
        e.x += e.vx * DT;
        e.z += e.vz * DT;
        pushOut(e, 0.5);
        const inRange = e.spec.ranged ? d <= 13 : d <= e.spec.reach;
        if (inRange && e.timer <= 0) { e.comboLeft = e.spec.combo ?? 1; startWindup(e, d); }
      } else if (e.phase === 'windup') {
        e.timer -= DT;
        if (e.timer <= 0) {
          e.comboLeft--;
          resolveStrike(e);
          if (e.phase === 'windup') {
            if (e.comboLeft > 0) { e.timer = e.spec.windup * 0.8; res.telegraphs++; e.reactable = d < BRAIN_IMMINENT_RANGE; if (e.reactable) res.reactable++; }
            else { e.phase = 'recover'; e.timer = e.spec.recover; }
          }
        }
      } else {
        e.timer -= DT;
        if (e.timer <= 0) { e.phase = 'approach'; e.timer = 0.2; }
      }
    }

    if (opts.record && tickNo % 2 === 0) {
      steps.push({
        t: Math.round(time * 100) / 100,
        p: [round(player.x), round(player.z), round(Math.max(0, player.hp) / 100), out.state],
        e: enemies.map((e) => [e.spec.id, round(e.x), round(e.z), round(Math.max(0, e.hp) / e.spec.hp), e.hp <= 0 ? 'dead' : e.phase]),
        ev: events.length ? events : undefined,
      });
    }

    if (player.hp <= 0) { res.survived = false; break; }
    const allDead = pending.length === 0 && enemies.every((e) => e.hp <= 0);
    const wpsDone = !sc.waypoints || wpIdx >= sc.waypoints.length;
    if (allDead && wpsDone && sc.enemies.length > 0) {
      if (allDeadAt < 0) allDeadAt = time;
      if (sc.waypoints || time - allDeadAt >= 3) break;
    }
  }

  res.time = Math.round((allDeadAt >= 0 ? allDeadAt : time) * 100) / 100;
  res.hpEnd = Math.max(0, Math.round(player.hp));
  res.enemiesKilled = killed;
  res.reversalRatio = moving > 0 ? Math.round((reversals / moving) * 1000) / 1000 : 0;
  if (opts.record) res.steps = steps;
  void releasedThisTick;
  return res;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
