#!/usr/bin/env node
/**
 * Stuntdouble Atlas Bundle - local recipe verification and packaging
 * Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
 *
 * Audits a game recipe in `targets/<game-slug>/` (no proprietary binaries, no personal OS paths)
 * and, only with explicit user approval, writes a local atlas bundle.
 * It opens NO pull request and contacts NO repository: the atlas is a separate data repo with a
 * single writer (docs/ROADMAP.md) and its intake does not exist yet.
 *
 * Usage:
 *   node scripts/contribute-recipe.mjs <game-slug> --dry-run
 *   node scripts/contribute-recipe.mjs <game-slug> --bundle out.json --user-approved
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, extname, relative } from 'node:path';

// Flip to true only when the atlas intake exists (separate data repo, bot-owned queue).
const ATLAS_INTAKE_OPEN = false;
const FORBIDDEN_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.pak', '.asar', '.bin', '.iso', '.xapk', '.apk', '.aab', '.zip', '.7z', '.rar'
]);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const approved = args.includes('--user-approved');
const bundleIdx = args.indexOf('--bundle');
const bundlePath = bundleIdx >= 0 ? args[bundleIdx + 1] : undefined;
const slug = args.find((a, i) => !a.startsWith('--') && (bundleIdx < 0 || i !== bundleIdx + 1));

if (!slug || slug === '_template') {
  console.error('Usage: node scripts/contribute-recipe.mjs <game-slug> (--dry-run | --bundle out.json --user-approved)');
  process.exit(1);
}

const targetDir = join(process.cwd(), 'targets', slug);
if (!existsSync(targetDir)) {
  console.error(`[Stuntdouble Sync] Target directory not found: targets/${slug}`);
  process.exit(1);
}

const reportPath = join(targetDir, 'REPORT.md');
if (!existsSync(reportPath)) {
  console.error(`[Stuntdouble Sync] Missing mandatory targets/${slug}/REPORT.md`);
  process.exit(1);
}

// 1. Hygiene & Privacy Audit (No binaries, no profilel home directory paths)
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else {
      files.push(full);
    }
  }
}
walk(targetDir);

const profilelPathRegex = /([A-Za-z]:\\Users\\[^\\/\s"']+|\/Users\/[^/\s"']+|\/home\/[^/\s"']+)/i;

for (const file of files) {
  const ext = extname(file).toLowerCase();
  if (FORBIDDEN_EXTENSIONS.has(ext)) {
    console.error(`[Stuntdouble Sync] Blocked proprietary/binary file: ${file}`);
    process.exit(1);
  }
  const content = readFileSync(file, 'utf8');
  const match = content.match(profilelPathRegex);
  if (match) {
    console.error(`[Stuntdouble Sync] Profilel local path detected in ${file}: "${match[0]}". Replace with <GAME_DIR>.`);
    process.exit(1);
  }
}

console.log(`[Stuntdouble Sync] Hygiene audit passed for targets/${slug} (${files.length} file(s)).`);

if (dryRun || !bundlePath) {
  console.log('[Stuntdouble Sync] Audit complete. Show the user what would be sent, then re-run with --bundle out.json --user-approved.');
  process.exit(0);
}

if (!approved) {
  console.error('[Stuntdouble Sync] Refusing to write a bundle without --user-approved (pass it only after the user said yes).');
  process.exit(1);
}

// 2. Local bundle (data only). No git, no gh, no network.
const bundle = {
  schema: 'stuntdouble-atlas-bundle/1',
  slug,
  createdAt: new Date().toISOString(),
  files: files.map((f) => ({ path: relative(targetDir, f).split('\\').join('/'), content: readFileSync(f, 'utf8') })),
};
writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));
console.log(`[Stuntdouble Sync] Wrote local bundle ${bundlePath} (${bundle.files.length} file(s)).`);
if (!ATLAS_INTAKE_OPEN) {
  console.log('[Stuntdouble Sync] Atlas submission is not open yet. The bundle stays on your disk; nothing was sent.');
}
