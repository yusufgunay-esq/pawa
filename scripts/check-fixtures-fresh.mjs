#!/usr/bin/env node
/**
 * Fixture freshness gate. Regenerates expected.json / scenarios.json / native fixtures from
 * scenarios.ts + the TS kernel and fails if any committed file differs. Files are restored
 * afterwards, so the check never dirties the working tree.
 * Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'packages', 'conformance', 'fixtures');
const snap = () => Object.fromEntries(readdirSync(DIR).map((f) => [f, readFileSync(join(DIR, f))]));

const before = snap();
for (const script of ['emit-reference.mjs', 'gen-fixtures.mjs']) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', join(ROOT, 'packages', 'conformance', script)], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(1);
  }
}
const after = snap();
const stale = [];
for (const f of new Set([...Object.keys(before), ...Object.keys(after)])) {
  const a = before[f];
  const b = after[f];
  // Compare ignoring CRLF/LF so autocrlf checkouts do not trip the gate.
  const norm = (x) => (x ? x.toString('utf8').replace(/\r\n/g, '\n') : null);
  if (norm(a) !== norm(b)) stale.push(f);
}
for (const [f, buf] of Object.entries(before)) writeFileSync(join(DIR, f), buf);

if (stale.length) {
  console.error(`[fixtures] STALE: ${stale.join(', ')}\n  run: npm run fixtures:gen`);
  process.exit(1);
}
console.log(`[fixtures] fresh (${Object.keys(after).length} files match regenerated output)`);
