'use strict';

const express = require('express');
const router = express.Router();
const { query, queryOne, run, runBatch } = require('../db/sqlite');
const { success, error, badRequest, notFound } = require('../utils/response');
const { validateBalanceScript } = require('../utils/balance-script-schema');
const {
  ensureBalanceScriptsSeeded,
  resetOneBuiltin,
  listScripts,
  getScript,
  insertScript,
  updateScriptRow,
  toPackScripts,
  importBalanceScriptsSafe,
  BALANCE_BUILTIN,
} = require('../seed/import-balance-scripts');

const BALANCE_PACK_FORMAT = 'xiaohuang-balance-pack';
const BALANCE_PACK_VERSION = 1;

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// GET /api/balance-scripts
router.get('/', (_req, res) => {
  try {
    const scripts = listScripts();
    success(res, { scripts, builtinCount: BALANCE_BUILTIN.length });
  } catch (err) {
    console.error('balance-scripts list', err);
    error(res, err.message || '加载配平脚本失败');
  }
});

// GET /api/balance-scripts/export — 必须在 /:id 之前
router.get('/export', (_req, res) => {
  try {
    const scripts = listScripts();
    success(res, {
      format: BALANCE_PACK_FORMAT,
      version: BALANCE_PACK_VERSION,
      exportedAt: new Date().toISOString(),
      scripts: toPackScripts(scripts),
    });
  } catch (err) {
    console.error('balance-scripts export', err);
    error(res, err.message || '导出失败');
  }
});

// POST /api/balance-scripts/import — 永不覆盖；冲突新 id +「（导入）」
router.post('/import', (req, res) => {
  try {
    ensureBalanceScriptsSeeded();
    const data = req.body;
    let scriptsIn = null;
    if (data?.format === BALANCE_PACK_FORMAT) {
      if (data.version !== BALANCE_PACK_VERSION) {
        return badRequest(res, `不支持的配平包版本：${data.version}`);
      }
      scriptsIn = data.scripts;
    } else if (Array.isArray(data?.scripts)) {
      scriptsIn = data.scripts;
    } else if (Array.isArray(data)) {
      scriptsIn = data;
    }
    if (!Array.isArray(scriptsIn) || !scriptsIn.length) {
      return badRequest(res, '配平包中没有 scripts 数组');
    }

    const result = importBalanceScriptsSafe(scriptsIn);
    if (!result.created && result.skipped) {
      return badRequest(
        res,
        result.errors?.[0] || '没有成功导入任何脚本（数据未通过校验）',
      );
    }
    success(res, {
      created: result.created,
      renamed: result.renamed,
      skipped: result.skipped,
      errors: result.errors,
      scripts: result.scripts,
    });
  } catch (err) {
    console.error('balance-scripts import', err);
    error(res, err.message || '导入失败');
  }
});

// POST /api/balance-scripts/reorder  body: { ids: string[] } — 与实验探究 labs/reorder 对齐
router.post('/reorder', (req, res) => {
  try {
    ensureBalanceScriptsSeeded();
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length) return badRequest(res, '需要 ids 数组');

    const current = query('SELECT id FROM balance_scripts').map((r) => r.id);
    const currentSet = new Set(current);
    if (ids.length !== current.length) {
      return badRequest(res, `ids 数量须与脚本总数一致（期望 ${current.length}，收到 ${ids.length}）`);
    }
    const seen = new Set();
    for (const id of ids) {
      if (typeof id !== 'string' || !id) return badRequest(res, 'ids 含无效项');
      if (seen.has(id)) return badRequest(res, `重复的 id：${id}`);
      if (!currentSet.has(id)) return badRequest(res, `未知的 id：${id}`);
      seen.add(id);
    }
    if (seen.size !== currentSet.size) {
      return badRequest(res, 'ids 未覆盖全部脚本');
    }

    const now = Date.now();
    runBatch(() => {
      ids.forEach((id, index) => {
        run('UPDATE balance_scripts SET sort_order = ?, updated_at = ? WHERE id = ?', [index, now, id]);
      });
    });
    success(res, { scripts: listScripts() });
  } catch (err) {
    console.error('balance-scripts reorder', err);
    error(res, err.message || '排序失败');
  }
});

// GET /api/balance-scripts/:id
router.get('/:id', (req, res) => {
  try {
    const script = getScript(req.params.id);
    if (!script) return notFound(res, '配平脚本不存在');
    success(res, script);
  } catch (err) {
    error(res, err.message);
  }
});

// POST /api/balance-scripts
router.post('/', (req, res) => {
  try {
    ensureBalanceScriptsSeeded();
    const checked = validateBalanceScript(req.body || {});
    if (!checked.ok) return badRequest(res, checked.reason);

    const maxRow = queryOne('SELECT MAX(sort_order) AS m FROM balance_scripts');
    const sortOrder = (Number(maxRow?.m) || 0) + 1;
    const now = Date.now();
    const id = req.body?.id && String(req.body.id).trim() ? String(req.body.id).trim() : uid('bs');
    if (queryOne('SELECT id FROM balance_scripts WHERE id = ?', [id])) {
      return badRequest(res, '配平脚本 ID 已存在');
    }
    insertScript({
      id,
      title: checked.script.title,
      grade: checked.script.grade || '',
      difficulty: checked.script.difficulty || '',
      startEquation: checked.script.startEquation,
      targetEquation: checked.script.targetEquation,
      species: checked.script.species,
      steps: checked.script.steps,
      sortOrder,
      source: 'custom',
      createdAt: now,
      updatedAt: now,
    }, now);
    success(res, getScript(id));
  } catch (err) {
    console.error('balance-scripts create', err);
    error(res, err.message);
  }
});

// PUT /api/balance-scripts/:id
router.put('/:id', (req, res) => {
  try {
    const existing = getScript(req.params.id);
    if (!existing) return notFound(res, '配平脚本不存在');

    const body = req.body || {};
    const mergedRaw = {
      title: body.title !== undefined ? body.title : existing.title,
      grade: body.grade !== undefined ? body.grade : existing.grade,
      difficulty: body.difficulty !== undefined ? body.difficulty : existing.difficulty,
      startEquation: body.startEquation !== undefined ? body.startEquation : existing.startEquation,
      targetEquation: body.targetEquation !== undefined ? body.targetEquation : existing.targetEquation,
      species: body.species !== undefined ? body.species : existing.species,
      steps: body.steps !== undefined ? body.steps : existing.steps,
    };
    const checked = validateBalanceScript(mergedRaw);
    if (!checked.ok) return badRequest(res, checked.reason);

    const now = Date.now();
    updateScriptRow({
      id: existing.id,
      title: checked.script.title,
      grade: checked.script.grade || '',
      difficulty: checked.script.difficulty || '',
      startEquation: checked.script.startEquation,
      targetEquation: checked.script.targetEquation,
      species: checked.script.species,
      steps: checked.script.steps,
      sortOrder: existing.sortOrder,
      source: 'custom',
    }, now);
    success(res, getScript(req.params.id));
  } catch (err) {
    error(res, err.message);
  }
});

// POST /api/balance-scripts/:id/reset
router.post('/:id/reset', (req, res) => {
  try {
    const script = resetOneBuiltin(req.params.id);
    if (!script) return badRequest(res, '该脚本不是内置项，无法重置');
    success(res, script);
  } catch (err) {
    error(res, err.message);
  }
});

// DELETE /api/balance-scripts/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = getScript(req.params.id);
    if (!existing) return notFound(res, '配平脚本不存在');
    run('DELETE FROM balance_scripts WHERE id = ?', [req.params.id]);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, err.message);
  }
});

module.exports = router;
module.exports.BALANCE_PACK_FORMAT = BALANCE_PACK_FORMAT;
module.exports.BALANCE_PACK_VERSION = BALANCE_PACK_VERSION;
