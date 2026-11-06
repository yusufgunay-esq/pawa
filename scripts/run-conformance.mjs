#!/usr/bin/env node
/**
 * Runs the native conformance runners. Usage: node scripts/run-conformance.mjs <cs|cpp|lua|all> [--optional]
 * --optional: skip a runner whose toolchain is missing (local dev). Without it a missing tool is a failure (CI).
 * Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONF = join(ROOT, 'packages', 'conformance');
const optional = process.argv.includes('--optional');
const which = process.argv[2] ?? 'all';

const run = (cmd, args) => spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT });
const has = (cmd, args = ['--version']) => {
  const r = spawnSync(cmd, args, { stdio: 'ignore' });
  return !r.error && r.status === 0;
};
// `dotnet --version` fails when only runtimes (no SDK) are installed, so probe the SDK list.
const hasDotnetSdk = () => {
  const r = spawnSync('dotnet', ['--list-sdks'], { encoding: 'utf8' });
  return !r.error && r.status === 0 && r.stdout.trim().length > 0;
};

const runners = {
  cs: () => {
    if (!hasDotnetSdk()) return null;
    return run('dotnet', ['run', '--project', join(CONF, 'runners', 'cs'), '-c', 'Release']).status;
  },
  cpp: () => {
    const cxx = ['g++', 'clang++'].find((c) => has(c));
    if (!cxx) return null;
    const out = join(mkdtempSync(join(tmpdir(), 'automa-cpp-')), process.platform === 'win32' ? 'runner.exe' : 'runner');
    const b = run(cxx, ['-std=c++20', '-O2', '-I', join(ROOT, 'packages', 'automa-brain-cpp', 'include'),
      '-I', join(CONF, 'fixtures'), join(CONF, 'runners', 'cpp', 'runner.cpp'), '-o', out]);
    return b.status === 0 ? run(out, []).status : b.status;
  },
  lua: () => {
    const lua = ['lua5.4', 'lua', 'luajit'].find((c) => has(c, ['-v']));
    if (!lua) return null;
    return run(lua, [join(CONF, 'runners', 'lua', 'runner.lua')]).status;
  },
};

const names = which === 'all' ? Object.keys(runners) : [which];
let failed = false;
for (const n of names) {
  if (!runners[n]) {
    console.error(`unknown runner: ${n}`);
    process.exit(2);
  }
  const status = runners[n]();
  if (status === null) {
    if (optional) console.log(`[conformance] ${n}: toolchain not found, skipped (--optional)`);
    else {
      console.error(`[conformance] ${n}: toolchain not found`);
      failed = true;
    }
  } else if (status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
