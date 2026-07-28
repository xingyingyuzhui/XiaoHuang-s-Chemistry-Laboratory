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
 * 补齐 / 同步内置配平脚本：
 * - 不存在 → insert
 * - 仍为 source=builtin → 用 seed 覆盖内容（保证升级后步骤/focus 正确）
 * - source=custom → 不覆盖（用户改过的保留）
 */
function ensureBalanceScriptsSeeded() {
  ensureBalanceTable();
  const now = Date.now();
  let inserted = 0;
  let updated = 0;
  for (const script of BALANCE_BUILTIN) {
    const existing = queryOne('SELECT id, source FROM balance_scripts WHERE id = ?', [script.id]);
    if (!existing) {
      insertScript({ ...script, source: 'builtin', createdAt: now, updatedAt: now }, now);
      inserted += 1;
    } else if (String(existing.source || '') === 'builtin') {
      // 保留原 sort_order
      const row = queryOne('SELECT sort_order FROM balance_scripts WHERE id = ?', [script.id]);
      updateScriptRow({
        ...script,
        sortOrder: Number(row?.sort_order) || script.sortOrder || 0,
        source: 'builtin',
      }, now);
      updated += 1;
    }
  }
  const count = queryOne('SELECT COUNT(*) AS c FROM balance_scripts');
  return { seeded: inserted > 0 || updated > 0, inserted, updated, count: Number(count?.c) || 0 };
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

/**
 * 导出用：去掉内部字段，保留可校验的内容
 * @param {object[]} scripts
 */
function toPackScripts(scripts) {
  return (scripts || []).map((s) => ({
    id: s.id,
    title: s.title,
    grade: s.grade || '',
    difficulty: s.difficulty || '',
    startEquation: s.startEquation,
    targetEquation: s.targetEquation,
    species: s.species,
    steps: s.steps,
  }));
}

/**
 * 安全导入：永不覆盖已有 id；冲突时新 id + 标题「（导入）」；强制 source=custom
 * @param {unknown[]} scriptsIn
 */
function importBalanceScriptsSafe(scriptsIn) {
  ensureBalanceScriptsSeeded();
  if (!Array.isArray(scriptsIn) || !scriptsIn.length) {
    return { created: 0, renamed: 0, skipped: 0, errors: ['没有可导入的脚本'] };
  }

  const maxRow = queryOne('SELECT MAX(sort_order) AS m FROM balance_scripts');
  let nextOrder = (Number(maxRow?.m) || 0) + 1;
  let created = 0;
  let renamed = 0;
  let skipped = 0;
  /** @type {string[]} */
  const errors = [];
  /** @type {object[]} */
  const toInsert = [];

  for (let i = 0; i < scriptsIn.length; i++) {
    const raw = scriptsIn[i];
    if (!raw || typeof raw !== 'object') {
      skipped += 1;
      errors.push(`第 ${i + 1} 条：不是对象`);
      continue;
    }
    const checked = validateBalanceScript({
      title: raw.title,
      grade: raw.grade,
      difficulty: raw.difficulty,
      startEquation: raw.startEquation,
      targetEquation: raw.targetEquation,
      species: raw.species,
      steps: raw.steps,
    });
    if (!checked.ok) {
      skipped += 1;
      errors.push(`第 ${i + 1} 条「${String(raw.title || '').slice(0, 20)}」：${checked.reason}`);
      continue;
    }

    let id = String(raw.id || '').trim() || uid('bs');
    let title = checked.script.title;
    let idChanged = false;
    if (queryOne('SELECT id FROM balance_scripts WHERE id = ?', [id])) {
      id = uid('bs');
      idChanged = true;
      if (!title.includes('（导入）')) title = `${title}（导入）`;
    }

    while (
      toInsert.some((x) => x.id === id) ||
      queryOne('SELECT id FROM balance_scripts WHERE id = ?', [id])
    ) {
      id = uid('bs');
      idChanged = true;
      if (!title.includes('（导入）')) title = `${title}（导入）`;
    }

    if (idChanged) renamed += 1;

    toInsert.push({
      id,
      title,
      grade: checked.script.grade || '',
      difficulty: checked.script.difficulty || '',
      startEquation: checked.script.startEquation,
      targetEquation: checked.script.targetEquation,
      species: checked.script.species,
      steps: checked.script.steps,
      sortOrder: nextOrder++,
      source: 'custom',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  if (toInsert.length) {
    runBatch(() => {
      const now = Date.now();
      for (const script of toInsert) {
        insertScript({ ...script, createdAt: now, updatedAt: now }, now);
        created += 1;
      }
    });
  }

  return { created, renamed, skipped, errors, scripts: listScripts() };
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
  toPackScripts,
  importBalanceScriptsSafe,
  BALANCE_BUILTIN,
};
