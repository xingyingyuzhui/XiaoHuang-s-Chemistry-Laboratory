/**
 * Sync offline quiz bank: ESM source → CJS seed
 *
 * Source of truth: src/data/offline-quiz-bank.js (ESM)
 * Generated target: server/seed/offline-quiz-bank.js (CJS)
 *
 * Run: node scripts/sync-offline-quiz-bank.mjs
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const SRC_PATH = resolve(ROOT, 'src/data/offline-quiz-bank.js');
const SEED_PATH = resolve(ROOT, 'server/seed/offline-quiz-bank.js');

// Dynamic import the ESM source
const src = await import(SRC_PATH);
const questions = src.OFFLINE_QUESTIONS;

// Build CJS content
const lines = [
  '/** CJS seed data — auto-generated from src/data/offline-quiz-bank.js, do not hand-edit */',
  '',
  'const OFFLINE_QUESTIONS = ' + JSON.stringify(questions, null, 2) + ';',
  '',
  'module.exports = { OFFLINE_QUESTIONS };',
  '',
];

const cjsContent = lines.join('\n');

// Check if seed already matches
let existing = '';
try {
  existing = readFileSync(SEED_PATH, 'utf-8');
} catch {}

if (existing === cjsContent) {
  console.log(`✓ seed is up to date (${questions.length} questions)`);
  process.exit(0);
}

writeFileSync(SEED_PATH, cjsContent, 'utf-8');
console.log(`✓ synced ${questions.length} questions → ${SEED_PATH.replace(ROOT + '/', '')}`);
