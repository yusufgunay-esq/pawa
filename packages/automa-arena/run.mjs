#!/usr/bin/env node
/**
 * AUTOMA arena runner.
 *   node packages/automa-arena/run.mjs [--scenario id] [--seed n] [--json] [--html out.html]
 * Exit code 1 if any gate fails. Copyright (c) 2026 Yusuf Günay. MPL-2.0.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (!process.features.typescript) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

const { writeFileSync } = await import('node:fs');
const { SCENARIOS } = await import('./src/scenarios.ts');
const { runScenario } = await import('./src/sim.ts');
const { evaluateGates } = await import('./src/gates.ts');
const { renderHtml } = await import('./src/html.ts');

const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const only = opt('--scenario');
const seed = Number(opt('--seed') ?? 1);
const htmlOut = opt('--html');
const json = argv.includes('--json');

const list = only ? SCENARIOS.filter((s) => s.id === only) : SCENARIOS;
if (!list.length) { console.error('unknown scenario: ' + only + ' (have: ' + SCENARIOS.map((s) => s.id).join(', ') + ')'); process.exit(2); }

const rows = [];
let allPass = true;
for (const sc of list) {
  const result = runScenario(sc, seed, { record: !!htmlOut });
  const baseline = sc.native ? runScenario(sc, seed, { nativeOnly: true }) : undefined;
  const gates = evaluateGates(sc, result, baseline);
  const pass = gates.every((g) => g.pass);
  allPass &&= pass;
  rows.push({ sc, result, gates, pass });
}

if (htmlOut) {
  writeFileSync(htmlOut, renderHtml(rows.map((r) => ({ id: r.sc.id, title: r.sc.title, obstacles: r.sc.obstacles, waypoints: r.sc.waypoints ?? [], result: r.result, gates: r.gates }))));
  console.error('wrote ' + htmlOut);
}

if (json) {
  console.log(JSON.stringify(rows.map((r) => ({ scenario: r.sc.id, pass: r.pass, gates: r.gates, result: { ...r.result, steps: undefined } })), null, 2));
} else {
  console.log(`AUTOMA arena  seed=${seed}`);
  for (const r of rows) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.sc.id.padEnd(14)} ${r.sc.title}`);
    for (const g of r.gates) console.log(`        ${g.pass ? 'ok  ' : 'FAIL'} ${g.name.padEnd(12)} ${g.detail}`);
  }
  console.log(allPass ? 'ALL GATES PASS' : 'GATES FAILED');
}
process.exit(allPass ? 0 : 1);
