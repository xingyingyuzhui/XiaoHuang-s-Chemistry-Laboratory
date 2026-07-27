'use strict';

const express = require('express');
const router = express.Router();
const { query, queryOne, run } = require('../db/sqlite');
const { success, error, badRequest, notFound } = require('../utils/response');
const { getLab, listLabs, ensureLabsSeeded, importLabsSafe } = require('../seed/import-labs');

const PACK_FORMAT = 'xiaohuang-lesson-pack';
const PACK_VERSION = 1;
const LAB_PACK_FORMAT = 'xiaohuang-lab-pack';
const LAB_PACK_VERSION = 1;

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureTable() {
  try {
    run(`CREATE TABLE IF NOT EXISTS lesson_packs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      grade TEXT DEFAULT '',
      topics TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      contents_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  } catch (e) {
    console.warn('ensureTable lesson_packs', e.message);
  }
}

function sanitizePack(row) {
  if (!row) return null;
  let contents = {};
  try { contents = JSON.parse(row.contents_json || '{}'); } catch {}
  return {
    id: row.id,
    name: row.name,
    grade: row.grade || '',
    topics: row.topics || '',
    notes: row.notes || '',
    contents,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 清洗导出数据：排除敏感字段；附带 selectedLabs 的完整实验子集 */
function sanitizeForExport(row) {
  const pack = sanitizePack(row);
  if (!pack) return null;
  ensureLabsSeeded();
  const contents = { ...(pack.contents || {}) };
  const selected = Array.isArray(contents.selectedLabs) ? contents.selectedLabs : [];
  const labs = selected.map((id) => getLab(id)).filter(Boolean).map((l) => ({
    id: l.id,
    title: l.title,
    type: l.type,
    equation: l.equation,
    safety: l.safety,
    phenomena: l.phenomena,
    steps: l.steps,
    prestudy: l.prestudy,
    sortOrder: l.sortOrder,
    source: l.source,
  }));
  // 若未勾选具体实验但希望导出当前库中全部，可在 contents.includeAllLabs 时附带
  if (contents.includeAllLabs) {
    contents.labs = listLabs().map((l) => ({
      id: l.id,
      title: l.title,
      type: l.type,
      equation: l.equation,
      safety: l.safety,
      phenomena: l.phenomena,
      steps: l.steps,
      prestudy: l.prestudy,
      sortOrder: l.sortOrder,
      source: l.source,
    }));
  } else if (labs.length) {
    contents.labs = labs;
  }
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    metadata: {
      name: pack.name,
      grade: pack.grade,
      topics: pack.topics,
      notes: pack.notes,
      exportedAt: new Date().toISOString(),
    },
    contents,
  };
}

/** 备课包内 labs：与实验库导入同一策略——永不覆盖，冲突新 id +「（导入）」 */
function mergeLabsFromContents(labsIn) {
  if (!Array.isArray(labsIn) || !labsIn.length) {
    return { created: 0, renamed: 0, skipped: 0, updated: 0, errors: [] };
  }
  const result = importLabsSafe(labsIn);
  return {
    created: result.created,
    renamed: result.renamed,
    skipped: result.skipped,
    updated: 0,
    errors: result.errors || [],
  };
}

/** 校验导入数据结构 */
function validateImport(data) {
  if (!data || typeof data !== 'object') {
    return { valid: false, reason: '无效的 JSON 文件' };
  }
  if (data.format !== PACK_FORMAT) {
    return { valid: false, reason: `不支持的格式：${data.format || '(空)'}，需要 ${PACK_FORMAT}` };
  }
  if (data.version !== PACK_VERSION) {
    return { valid: false, reason: `不支持的版本：${data.version}，当前仅支持 ${PACK_VERSION}` };
  }
  if (!data.metadata || typeof data.metadata !== 'object') {
    return { valid: false, reason: '缺少 metadata 字段' };
  }
  if (!data.metadata.name || typeof data.metadata.name !== 'string') {
    return { valid: false, reason: 'metadata.name 必须是非空字符串' };
  }
  if (data.contents && typeof data.contents !== 'object') {
    return { valid: false, reason: 'contents 必须是对象' };
  }
  return { valid: true };
}

/** 生成不重名的名称 */
function uniqueName(baseName) {
  const existing = query('SELECT name FROM lesson_packs').map(r => r.name);
  if (!existing.includes(baseName)) return baseName;
  let n = 2;
  while (existing.includes(`${baseName}（${n}）`)) n++;
  return `${baseName}（${n}）`;
}

// 列出所有备课包
router.get('/', (_req, res) => {
  try {
    ensureTable();
    const rows = query('SELECT * FROM lesson_packs ORDER BY updated_at DESC');
    success(res, { packs: rows.map(sanitizePack) });
  } catch (err) {
    error(res, err.message);
  }
});

// 获取单个备课包
router.get('/:id', (req, res) => {
  try {
    ensureTable();
    const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [req.params.id]);
    if (!row) return notFound(res, '备课包不存在');
    success(res, sanitizePack(row));
  } catch (err) {
    error(res, err.message);
  }
});

// 新建备课包
router.post('/', (req, res) => {
  try {
    ensureTable();
    const { name, grade, topics, notes, contents } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return badRequest(res, '名称不能为空');
    }
    const id = uid('lp');
    const now = Date.now();
    run(
      `INSERT INTO lesson_packs (id, name, grade, topics, notes, contents_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name.trim(), grade || '', topics || '', notes || '', JSON.stringify(contents || {}), now, now],
    );
    const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [id]);
    success(res, sanitizePack(row));
  } catch (err) {
    error(res, err.message);
  }
});

// 更新备课包
router.put('/:id', (req, res) => {
  try {
    ensureTable();
    const existing = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [req.params.id]);
    if (!existing) return notFound(res, '备课包不存在');
    const { name, grade, topics, notes, contents } = req.body || {};
    const now = Date.now();
    run(
      `UPDATE lesson_packs SET name = ?, grade = ?, topics = ?, notes = ?, contents_json = ?, updated_at = ?
       WHERE id = ?`,
      [
        (name && name.trim()) || existing.name,
        grade !== undefined ? grade : existing.grade,
        topics !== undefined ? topics : existing.topics,
        notes !== undefined ? notes : existing.notes,
        contents !== undefined ? JSON.stringify(contents) : existing.contents_json,
        now,
        req.params.id,
      ],
    );
    const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [req.params.id]);
    success(res, sanitizePack(row));
  } catch (err) {
    error(res, err.message);
  }
});

// 删除备课包
router.delete('/:id', (req, res) => {
  try {
    ensureTable();
    const existing = queryOne('SELECT id FROM lesson_packs WHERE id = ?', [req.params.id]);
    if (!existing) return notFound(res, '备课包不存在');
    run('DELETE FROM lesson_packs WHERE id = ?', [req.params.id]);
    success(res, { deleted: true });
  } catch (err) {
    error(res, err.message);
  }
});

// 导出备课包（返回可下载的 JSON 结构）
router.get('/:id/export', (req, res) => {
  try {
    ensureTable();
    const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [req.params.id]);
    if (!row) return notFound(res, '备课包不存在');
    success(res, sanitizeForExport(row));
  } catch (err) {
    error(res, err.message);
  }
});

// 导入备课包（若 contents.labs 存在则合并进实验库）
router.post('/import', (req, res) => {
  try {
    ensureTable();
    const data = req.body;

    // 分支：纯实验包也可从备课包入口导入
    if (data?.format === LAB_PACK_FORMAT) {
      if (data.version !== LAB_PACK_VERSION) {
        return badRequest(res, `不支持的实验包版本：${data.version}`);
      }
      const labsResult = mergeLabsFromContents(data.labs);
      return success(res, {
        kind: 'lab-pack',
        labsResult,
        nameChanged: false,
      });
    }

    const validation = validateImport(data);
    if (!validation.valid) {
      return badRequest(res, validation.reason);
    }
    const name = uniqueName(data.metadata.name.trim());
    const id = uid('lp');
    const now = Date.now();
    const contents = data.contents || {};
    run(
      `INSERT INTO lesson_packs (id, name, grade, topics, notes, contents_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        name,
        data.metadata.grade || '',
        data.metadata.topics || '',
        data.metadata.notes || '',
        JSON.stringify(contents),
        now,
        now,
      ],
    );
    const labsResult = mergeLabsFromContents(contents.labs);
    const row = queryOne('SELECT * FROM lesson_packs WHERE id = ?', [id]);
    success(res, {
      kind: 'lesson-pack',
      pack: sanitizePack(row),
      nameChanged: name !== data.metadata.name,
      labsResult,
    });
  } catch (err) {
    error(res, err.message);
  }
});

module.exports = router;
