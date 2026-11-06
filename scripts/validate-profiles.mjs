#!/usr/bin/env node
/**
 * Stuntdouble Profile Validator
 * Copyright (c) 2026 Yusuf Günay. Licensed under MPL-2.0.
 *
 * Zero-dependency validation of every profile document in the repository against
 * `schemas/profile.schema.json` (required fields, ranges, enums, label shape,
 * unknown keys). Also validates targets/<game>/profile.json when present.
 *
 * The schema imposes NO fixed playstyle taxonomy: any free-form `archetype`
 * label is accepted, so a game-specific profile never has to squeeze itself
 * into a preset.
 *
 * Usage:
 *   node scripts/validate-profiles.mjs             # validate all profiles
 *   node scripts/validate-profiles.mjs <slug>      # validate targets/<slug>/profile.json
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA_PATH = join(ROOT, 'schemas', 'profile.schema.json');

const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
const props = schema.properties ?? {};
const required = schema.required ?? [];
const forbidExtras = schema.additionalProperties === false;

/** Minimal JSON Schema subset evaluator: type, enum, pattern, min/max, items. */
function validate(value, spec, path, errors) {
  if (spec.enum && !spec.enum.includes(value)) {
    errors.push(`${path}: "${value}" is not one of ${spec.enum.join(', ')}`);
    return;
  }

  switch (spec.type) {
    case 'string':
      if (typeof value !== 'string') {
        errors.push(`${path}: expected string, got ${typeof value}`);
        return;
      }
      if (spec.minLength !== undefined && value.length < spec.minLength) {
        errors.push(`${path}: shorter than ${spec.minLength} char(s)`);
      }
      if (spec.maxLength !== undefined && value.length > spec.maxLength) {
        errors.push(`${path}: longer than ${spec.maxLength} char(s)`);
      }
      if (spec.pattern && !new RegExp(spec.pattern).test(value)) {
        errors.push(`${path}: "${value}" does not match ${spec.pattern}`);
      }
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        errors.push(`${path}: expected finite number, got ${value}`);
        return;
      }
      if (spec.minimum !== undefined && value < spec.minimum) {
        errors.push(`${path}: ${value} < minimum ${spec.minimum}`);
      }
      if (spec.maximum !== undefined && value > spec.maximum) {
        errors.push(`${path}: ${value} > maximum ${spec.maximum}`);
      }
      break;
    case 'integer':
      if (!Number.isInteger(value)) {
        errors.push(`${path}: expected integer, got ${value}`);
        return;
      }
      if (spec.minimum !== undefined && value < spec.minimum) {
        errors.push(`${path}: ${value} < minimum ${spec.minimum}`);
      }
      if (spec.maximum !== undefined && value > spec.maximum) {
        errors.push(`${path}: ${value} > maximum ${spec.maximum}`);
      }
      break;
    case 'array':
      if (!Array.isArray(value)) {
        errors.push(`${path}: expected array`);
        return;
      }
      if (spec.minItems !== undefined && value.length < spec.minItems) {
        errors.push(`${path}: fewer than ${spec.minItems} item(s)`);
      }
      if (spec.items) {
        value.forEach((item, i) => validate(item, spec.items, `${path}[${i}]`, errors));
      }
      break;
    default:
      break;
  }
}

function validateProfile(profile, label) {
  const errors = [];
  if (profile === null || typeof profile !== 'object' || Array.isArray(profile)) {
    return [`${label}: not a JSON object`];
  }

  for (const key of required) {
    if (!(key in profile)) errors.push(`${label}: missing required "${key}"`);
  }
  for (const [key, value] of Object.entries(profile)) {
    const spec = props[key];
    if (!spec) {
      if (forbidExtras) errors.push(`${label}: unknown property "${key}"`);
      continue;
    }
    validate(value, spec, `${label}.${key}`, errors);
  }
  return errors;
}

const slug = process.argv[2];
const documents = [];

if (slug) {
  const file = join(ROOT, 'targets', slug, 'profile.json');
  if (!existsSync(file)) {
    console.error(`[profile] Missing targets/${slug}/profile.json`);
    process.exit(1);
  }
  documents.push({ label: `targets/${slug}/profile.json`, data: JSON.parse(readFileSync(file, 'utf8')) });
} else {
  const presetsFile = join(ROOT, 'schemas', 'profiles.json');
  const presets = JSON.parse(readFileSync(presetsFile, 'utf8')).presets ?? [];
  presets.forEach((p, i) => documents.push({ label: `schemas/profiles.json[${i}] (${p.id ?? '?'})`, data: p }));

  const targetsDir = join(ROOT, 'targets');
  if (existsSync(targetsDir)) {
    for (const entry of readdirSync(targetsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
      const file = join(targetsDir, entry.name, 'profile.json');
      if (existsSync(file)) {
        documents.push({ label: `targets/${entry.name}/profile.json`, data: JSON.parse(readFileSync(file, 'utf8')) });
      }
    }
  }
}

let errorCount = 0;
for (const doc of documents) {
  const errors = validateProfile(doc.data, doc.label);
  errorCount += errors.length;
  for (const e of errors) console.error(`[profile] ${e}`);
}

if (errorCount > 0) {
  console.error(`\n[profile] FAILED — ${errorCount} error(s) across ${documents.length} document(s).`);
  process.exit(1);
}

const labels = documents.map((d) => d.data.archetype).filter(Boolean);
console.log(
  `[profile] OK — ${documents.length} document(s) valid against profile.schema.json. ` +
    `Free-form labels in use: ${labels.join(', ')}`
);
