// AUTOMA -> Stuntdouble toplu yeniden adlandirma. Kullanim: node scripts/rename-project.mjs [--dry-run]
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
const dry = process.argv.includes('--dry-run');
const SUB = 'Competent combat hand-over for story-driven single-player games';
const rules = [
  [/AUTOMA: Autonomous Play Architecture for Single-Player Games/g, `Stuntdouble: ${SUB}`],
  [/Autonomous Play Architecture/g, SUB],
  [/automa\/automa_brain/g, 'stuntdouble/stunt_brain'],
  [/automa_brain/g, 'stunt_brain'],
  [/Automa(Brain|Runtime|Seams|Decision|Math|Kernel)/g, 'Stunt$1'],
  [/AUTOMA(?!T[A-Z])/g, 'Stuntdouble'],
  [/Automa(?!t[a-z])/g, 'Stuntdouble'],
  [/automa(?!t[a-z])/g, 'stuntdouble'],
];
const pathRules = [
  [/include\/automa\/automa_brain\.hpp$/, 'include/stuntdouble/stunt_brain.hpp'],
  [/automa_brain\.lua$/, 'stunt_brain.lua'],
  [/Automa(Brain|Seams)\.cs$/, 'Stunt$1.cs'],
  [/packages\/automa-/, 'packages/stuntdouble-'],
  [/^skills\/automa\//, 'skills/stuntdouble/'],
];
const files = execSync("git ls-files", { encoding: 'utf8' }).split('\n').filter(f => f && !f.startsWith('_claude/') && !/\.(png|jpg|ico|zip|exe|dll)$/i.test(f));
let changed = 0;
for (const f of files) {
  let t; try { t = readFileSync(f, 'utf8'); } catch { continue; }
  let head = '', body = t;
  if (f === 'LICENSE') { const i = t.indexOf('\n---\n'); head = t.slice(0, i); body = t.slice(i); }
  let h = head; for (const [r, s] of rules) h = h.replace(r, s);
  let b = body; if (f !== 'LICENSE') for (const [r, s] of rules) b = b.replace(r, s);
  const out = h + b;
  if (out !== t) { changed++; if (!dry) writeFileSync(f, out); }
}
const moves = [];
for (const f of files) { let n = f; for (const [r, s] of pathRules) n = n.replace(r, s); if (n !== f) moves.push([f, n]); }
for (const [a, b] of moves) { if (!dry) { mkdirSync(dirname(b), { recursive: true }); execSync(`git mv "${a}" "${b}"`); } }
console.log(`${dry ? 'DRY ' : ''}icerik degisen: ${changed}, tasinan: ${moves.length}`);
