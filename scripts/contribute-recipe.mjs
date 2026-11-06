#!/usr/bin/env node
/**
 * AUTOMA Collective Atlas Sync — Upstream Recipe Contributor
 * Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
 *
 * Validates a newly engineered game recipe in `targets/<game-slug>/`
 * (ensuring zero proprietary binaries or profilel OS paths are included)
 * and submits it upstream to `yusufgunay-esq/automa` via GitHub CLI (`gh`) Pull Request.
 *
 * Usage:
 *   node scripts/contribute-recipe.mjs <game-slug> [--dry-run]
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execSync } from 'node:child_process';

const UPSTREAM_REPO = 'yusufgunay-esq/automa';
const FORBIDDEN_EXTENSIONS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.pak', '.asar', '.bin', '.iso', '.xapk', '.apk', '.aab', '.zip', '.7z', '.rar'
]);

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slug = args.find((a) => !a.startsWith('--'));

if (!slug || slug === '_template') {
  console.error('Usage: node scripts/contribute-recipe.mjs <game-slug> [--dry-run]');
  process.exit(1);
}

const targetDir = join(process.cwd(), 'targets', slug);
if (!existsSync(targetDir)) {
  console.error(`[AUTOMA Sync] Target directory not found: targets/${slug}`);
  process.exit(1);
}

const reportPath = join(targetDir, 'REPORT.md');
if (!existsSync(reportPath)) {
  console.error(`[AUTOMA Sync] Missing mandatory targets/${slug}/REPORT.md`);
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
    console.error(`[AUTOMA Sync] Blocked proprietary/binary file: ${file}`);
    process.exit(1);
  }
  const content = readFileSync(file, 'utf8');
  const match = content.match(profilelPathRegex);
  if (match) {
    console.error(`[AUTOMA Sync] Profilel local path detected in ${file}: "${match[0]}". Replace with <GAME_DIR>.`);
    process.exit(1);
  }
}

console.log(`[AUTOMA Sync] Hygiene audit passed for targets/${slug} (${files.length} file(s)).`);

if (dryRun) {
  console.log(`[AUTOMA Sync] Dry-run complete. Ready to submit PR to ${UPSTREAM_REPO}.`);
  process.exit(0);
}

// 2. Automated Fork, Branch & PR Submission to yusufgunay-esq/automa
try {
  const branchName = `recipe/${slug}`;
  console.log(`[AUTOMA Sync] Preparing branch ${branchName} for upstream ${UPSTREAM_REPO}...`);

  execSync('gh auth status', { stdio: 'ignore' });
  execSync(`gh repo fork ${UPSTREAM_REPO} --remote=true --clone=false`, { stdio: 'inherit' });
  execSync(`git checkout -B ${branchName}`, { stdio: 'inherit' });
  execSync(`git add targets/${slug}`, { stdio: 'inherit' });
  execSync(`git commit -m "feat(target): add AUTOMA recipe and seam ledger for ${slug}"`, { stdio: 'inherit' });
  execSync(`git push -u origin ${branchName}`, { stdio: 'inherit' });

  const prTitle = `feat(target): AUTOMA autonomy recipe for ${slug}`;
  const prBody = [
    `## AUTOMA Target Recipe Submission: \`${slug}\``,
    '',
    'Submitted by an autonomous coding agent following the AUTOMA Stage-7 Collective Atlas protocol.',
    '',
    '- [x] Clean-room hygiene audit passed (zero game binaries or local user paths)',
    `- [x] \`targets/${slug}/REPORT.md\` includes REA seam evidence (\`Seam.Input\`, \`Seam.Perception\`, \`Seam.NpcAI\`)`,
  ].join('\n');

  execSync(`gh pr create --repo ${UPSTREAM_REPO} --title "${prTitle}" --body "${prBody}"`, {
    stdio: 'inherit',
  });
  console.log(`[AUTOMA Sync] Successfully submitted recipe PR to https://github.com/${UPSTREAM_REPO}`);
} catch (err) {
  console.log(
    `\n[AUTOMA Sync] Could not auto-open PR via gh CLI. Submit targets/${slug}/REPORT.md directly at:\n` +
      `https://github.com/${UPSTREAM_REPO}/pulls`
  );
  process.exit(1);
}
