'use strict';

const { query, queryOne, run, runBatch } = require('../db/sqlite');
const { LABS_BUILTIN } = require('./labs-builtin');
const { validateLab } = require('../utils/lab-schema');

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureLabTable() {
  run(`CREATE TABLE IF NOT EXISTS lab_experiments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT DEFAULT '',
    equation TEXT DEFAULT '',
    safety TEXT DEFAULT '',
    phenomena TEXT DEFAULT '',
    steps_json TEXT DEFAULT '[]',
    prestudy_json TEXT DEFAULT 'null',
    sort_order INTEGER NOT NULL DEFAULT 0,
    source TEXT DEFAULT 'custom',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
}

function rowToLab(row) {
  if (!row) return null;
  let steps = [];
  let prestudy = null;
  try { steps = JSON.parse(row.steps_json || '[]'); } catch {}
  try { prestudy = JSON.parse(row.prestudy_json || 'null'); } catch {}
  return {
    id: row.id,
    title: row.title,
    type: row.type || '',
    equation: row.equation || '',
    safety: row.safety || '',
    phenomena: row.phenomena || '',
    steps: Array.isArray(steps) ? steps : [],
    prestudy: prestudy && typeof prestudy === 'object' ? prestudy : null,
    sortOrder: Number(row.sort_order) || 0,
    source: row.source || 'custom',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function insertLab(lab, now = Date.now()) {
  run(
    `INSERT INTO lab_experiments
     (id, title, type, equation, safety, phenomena, steps_json, prestudy_json, sort_order, source, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      lab.id,
      lab.title,
      lab.type || '',
      lab.equation || '',
      lab.safety || '',
      lab.phenomena || '',
      JSON.stringify(lab.steps || []),
      JSON.stringify(lab.prestudy ?? null),
      lab.sortOrder ?? 0,
      lab.source || 'custom',
      lab.createdAt || now,
      lab.updatedAt || now,
    ],
  );
}

function updateLabRow(lab, now = Date.now()) {
  run(
    `UPDATE lab_experiments SET
      title = ?, type = ?, equation = ?, safety = ?, phenomena = ?,
      steps_json = ?, prestudy_json = ?, sort_order = ?, source = ?, updated_at = ?
     WHERE id = ?`,
    [
      lab.title,
      lab.type || '',
      lab.equation || '',
      lab.safety || '',
      lab.phenomena || '',
      JSON.stringify(lab.steps || []),
      JSON.stringify(lab.prestudy ?? null),
      lab.sortOrder ?? 0,
      lab.source || 'custom',
      now,
      lab.id,
    ],
  );
}

/**
 * 补齐 / 同步内置实验（与配平脚本策略一致）：
 * - 不存在 → insert
 * - 仍为 source=builtin → 用 seed 覆盖内容（升级后预习题/步骤修复能落到用户机）
 * - source=custom → 不覆盖（用户改过的保留）
 *
 * 说明：旧逻辑「有 id 就永不写」会导致 seed 修 bug 后装包升级仍跑旧数据。
 */
function ensureLabsSeeded() {
  ensureLabTable();
  const now = Date.now();
  let inserted = 0;
  let updated = 0;
  for (const lab of LABS_BUILTIN) {
    const existing = queryOne('SELECT id, source FROM lab_experiments WHERE id = ?', [lab.id]);
    if (!existing) {
      insertLab({ ...lab, source: 'builtin', createdAt: now, updatedAt: now }, now);
      inserted += 1;
    } else if (String(existing.source || '') === 'builtin') {
      const row = queryOne('SELECT sort_order FROM lab_experiments WHERE id = ?', [lab.id]);
      updateLabRow({
        ...lab,
        sortOrder: Number(row?.sort_order) || lab.sortOrder || 0,
        source: 'builtin',
      }, now);
      updated += 1;
    }
  }
  const count = queryOne('SELECT COUNT(*) AS c FROM lab_experiments');
  return { seeded: inserted > 0 || updated > 0, inserted, updated, count: Number(count?.c) || 0 };
}

/** 强制恢复全部内置 id 的 seed 内容（会覆盖同 id 的用户修改） */
function resetBuiltinLabs() {
  ensureLabTable();
  const now = Date.now();
  for (const lab of LABS_BUILTIN) {
    const existing = queryOne('SELECT id FROM lab_experiments WHERE id = ?', [lab.id]);
    if (!existing) {
      insertLab({ ...lab, source: 'builtin', createdAt: now, updatedAt: now }, now);
    } else {
      updateLabRow({ ...lab, source: 'builtin' }, now);
    }
  }
  return { reset: LABS_BUILTIN.length };
}

function resetOneBuiltin(id) {
  ensureLabTable();
  const seed = LABS_BUILTIN.find((l) => l.id === id);
  if (!seed) return null;
  const now = Date.now();
  const existing = queryOne('SELECT id FROM lab_experiments WHERE id = ?', [id]);
  if (existing) updateLabRow({ ...seed, source: 'builtin' }, now);
  else insertLab({ ...seed, source: 'builtin', createdAt: now, updatedAt: now }, now);
  return rowToLab(queryOne('SELECT * FROM lab_experiments WHERE id = ?', [id]));
}

function listLabs() {
  ensureLabsSeeded();
  return query('SELECT * FROM lab_experiments ORDER BY sort_order ASC, created_at ASC').map(rowToLab);
}

function getLab(id) {
  ensureLabsSeeded();
  return rowToLab(queryOne('SELECT * FROM lab_experiments WHERE id = ?', [id]));
}

/**
 * 安全导入：永不覆盖已有 id；冲突时分配新 id 并标题加「（导入）」；强制 source=custom
 * @param {unknown[]} labsIn
 */
function importLabsSafe(labsIn) {
  ensureLabsSeeded();
  if (!Array.isArray(labsIn) || !labsIn.length) {
    return { created: 0, renamed: 0, skipped: 0, errors: ['没有可导入的实验'] };
  }

  const maxRow = queryOne('SELECT MAX(sort_order) AS m FROM lab_experiments');
  let nextOrder = (Number(maxRow?.m) || 0) + 1;
  let created = 0;
  let renamed = 0;
  let skipped = 0;
  /** @type {string[]} */
  const errors = [];
  /** @type {object[]} */
  const toInsert = [];

  for (let i = 0; i < labsIn.length; i++) {
    const raw = labsIn[i];
    if (!raw || typeof raw !== 'object') {
      skipped += 1;
      errors.push(`第 ${i + 1} 条：不是对象`);
      continue;
    }
    const checked = validateLab({
      title: raw.title,
      type: raw.type,
      equation: raw.equation,
      safety: raw.safety,
      phenomena: raw.phenomena,
      steps: raw.steps,
      prestudy: raw.prestudy,
    });
    if (!checked.ok) {
      skipped += 1;
      errors.push(`第 ${i + 1} 条「${String(raw.title || '').slice(0, 20)}」：${checked.reason}`);
      continue;
    }

    let id = String(raw.id || '').trim() || uid('lab');
    let title = checked.lab.title;
    let idChanged = false;
    if (queryOne('SELECT id FROM lab_experiments WHERE id = ?', [id])) {
      id = uid('lab');
      idChanged = true;
      if (!title.includes('（导入）')) title = `${title}（导入）`;
    }

    // 导入过程中同一批也可能撞新 id（极少）
    while (toInsert.some((x) => x.id === id) || queryOne('SELECT id FROM lab_experiments WHERE id = ?', [id])) {
      id = uid('lab');
      idChanged = true;
      if (!title.includes('（导入）')) title = `${title}（导入）`;
    }

    if (idChanged) renamed += 1;

    toInsert.push({
      id,
      title,
      type: checked.lab.type || '',
      equation: checked.lab.equation || '',
      safety: checked.lab.safety || '',
      phenomena: checked.lab.phenomena || '',
      steps: checked.lab.steps || [],
      prestudy: checked.lab.prestudy ?? null,
      sortOrder: nextOrder++,
      source: 'custom',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  if (toInsert.length) {
    runBatch(() => {
      const now = Date.now();
      for (const lab of toInsert) {
        insertLab({ ...lab, createdAt: now, updatedAt: now }, now);
        created += 1;
      }
    });
  }

  return { created, renamed, skipped, errors, labs: listLabs() };
}

module.exports = {
  ensureLabTable,
  ensureLabsSeeded,
  resetBuiltinLabs,
  resetOneBuiltin,
  listLabs,
  getLab,
  rowToLab,
  insertLab,
  updateLabRow,
  importLabsSafe,
  LABS_BUILTIN,
};
