'use strict';

const { query, queryOne, run, runBatch } = require('../db/sqlite');
const { BALANCE_BUILTIN } = require('./balance-builtin');
const { validateBalanceScript } = require('../utils/balance-script-schema');

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureBalanceTable() {
  run(`CREATE TABLE IF NOT EXISTS balance_scripts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    grade TEXT DEFAULT '',
    difficulty TEXT DEFAULT '',
    start_equation TEXT NOT NULL,
    target_equation TEXT NOT NULL,
    species_json TEXT NOT NULL,
    steps_json TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    source TEXT DEFAULT 'custom',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
}

function rowToScript(row) {
  if (!row) return null;
  let species = { left: [], right: [] };
  let steps = [];
  try { species = JSON.parse(row.species_json || '{}'); } catch {}
  try { steps = JSON.parse(row.steps_json || '[]'); } catch {}
  return {
    id: row.id,
    title: row.title,
    grade: row.grade || '',
    difficulty: row.difficulty || '',
    startEquation: row.start_equation || '',
    targetEquation: row.target_equation || '',
    species: species && typeof species === 'object' ? species : { left: [], right: [] },
    steps: Array.isArray(steps) ? steps : [],
    sortOrder: Number(row.sort_order) || 0,
    source: row.source || 'custom',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function insertScript(script, now = Date.now()) {
  run(
    `INSERT INTO balance_scripts
     (id, title, grade, difficulty, start_equation, target_equation, species_json, steps_json, sort_order, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      script.id,
      script.title,
      script.grade || '',
      script.difficulty || '',
      script.startEquation || '',
      script.targetEquation || '',
      JSON.stringify(script.species || { left: [], right: [] }),
      JSON.stringify(script.steps || []),
      script.sortOrder ?? 0,
      script.source || 'custom',
      script.createdAt || now,
      script.updatedAt || now,
    ],
  );
}

function updateScriptRow(script, now = Date.now()) {
  run(
    `UPDATE balance_scripts SET
      title = ?, grade = ?, difficulty = ?, start_equation = ?, target_equation = ?,
      species_json = ?, steps_json = ?, sort_order = ?, source = ?, updated_at = ?
     WHERE id = ?`,
    [
      script.title,
      script.grade || '',
      script.difficulty || '',
      script.startEquation || '',
      script.targetEquation || '',
      JSON.stringify(script.species || { left: [], right: [] }),
      JSON.stringify(script.steps || []),
      script.sortOrder ?? 0,
      script.source || 'custom',
      now,
      script.id,
    ],
  );
}

/**
 * 补齐缺失的内置配平脚本：只 insert 不存在的 id
 */
function ensureBalanceScriptsSeeded() {
  ensureBalanceTable();
  const now = Date.now();
  let inserted = 0;
  for (const script of BALANCE_BUILTIN) {
    const existing = queryOne('SELECT id FROM balance_scripts WHERE id = ?', [script.id]);
    if (!existing) {
      insertScript({ ...script, source: 'builtin', createdAt: now, updatedAt: now }, now);
      inserted += 1;
    }
  }
  const count = queryOne('SELECT COUNT(*) AS c FROM balance_scripts');
  return { seeded: inserted > 0, inserted, count: Number(count?.c) || 0 };
}

/** 强制恢复全部内置 id 的 seed 内容 */
function resetBuiltinBalanceScripts() {
  ensureBalanceTable();
  const now = Date.now();
  for (const script of BALANCE_BUILTIN) {
    const existing = queryOne('SELECT id FROM balance_scripts WHERE id = ?', [script.id]);
    if (existing) {
      updateScriptRow({ ...script, source: 'builtin' }, now);
    } else {
      insertScript({ ...script, source: 'builtin', createdAt: now, updatedAt: now }, now);
    }
  }
  return { reset: BALANCE_BUILTIN.length };
}

function resetOneBuiltin(id) {
  ensureBalanceTable();
  const seed = BALANCE_BUILTIN.find((s) => s.id === id);
  if (!seed) return null;
  const now = Date.now();
  const existing = queryOne('SELECT id FROM balance_scripts WHERE id = ?', [id]);
  if (existing) updateScriptRow({ ...seed, source: 'builtin' }, now);
  else insertScript({ ...seed, source: 'builtin', createdAt: now, updatedAt: now }, now);
  return rowToScript(queryOne('SELECT * FROM balance_scripts WHERE id = ?', [id]));
}

function listScripts() {
  ensureBalanceScriptsSeeded();
  return query('SELECT * FROM balance_scripts ORDER BY sort_order ASC, created_at ASC').map(rowToScript);
}

function getScript(id) {
  ensureBalanceScriptsSeeded();
  return rowToScript(queryOne('SELECT * FROM balance_scripts WHERE id = ?', [id]));
}

module.exports = {
  ensureBalanceTable,
  ensureBalanceScriptsSeeded,
  resetBuiltinBalanceScripts,
  resetOneBuiltin,
  listScripts,
  getScript,
  rowToScript,
  insertScript,
  updateScriptRow,
  BALANCE_BUILTIN,
};
