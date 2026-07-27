'use strict';

const express = require('express');
const router = express.Router();
const { query, queryOne, run, runBatch } = require('../db/sqlite');
const { success, error, badRequest, notFound } = require('../utils/response');
const { validateLab } = require('../utils/lab-schema');
const {
  ensureLabsSeeded,
  resetBuiltinLabs,
  resetOneBuiltin,
  listLabs,
  getLab,
  insertLab,
  updateLabRow,
  importLabsSafe,
  LABS_BUILTIN,
} = require('../seed/import-labs');

const LAB_PACK_FORMAT = 'xiaohuang-lab-pack';
const LAB_PACK_VERSION = 1;

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toPackLabs(labs) {
  return labs.map((l) => ({
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
}

// GET /api/labs
router.get('/', (_req, res) => {
  try {
    const labs = listLabs();
    success(res, { labs, builtinCount: LABS_BUILTIN.length });
  } catch (err) {
    console.error('labs list', err);
    error(res, err.message || '加载实验失败');
  }
});

// GET /api/labs/export
router.get('/export', (_req, res) => {
  try {
    const labs = listLabs();
    success(res, {
      format: LAB_PACK_FORMAT,
      version: LAB_PACK_VERSION,
      exportedAt: new Date().toISOString(),
      labs: toPackLabs(labs),
    });
  } catch (err) {
    error(res, err.message);
  }
});

// POST /api/labs/import — 永不覆盖：冲突则新 ID + 标题「（导入）」；强制 custom
router.post('/import', (req, res) => {
  try {
    ensureLabsSeeded();
    const data = req.body;
    let labsIn = null;
    if (data?.format === LAB_PACK_FORMAT) {
      if (data.version !== LAB_PACK_VERSION) {
        return badRequest(res, `不支持的实验包版本：${data.version}`);
      }
      labsIn = data.labs;
    } else if (data?.format === 'xiaohuang-lesson-pack' && data?.contents?.labs) {
      labsIn = data.contents.labs;
    } else if (Array.isArray(data?.labs)) {
      labsIn = data.labs;
    }
    if (!Array.isArray(labsIn) || !labsIn.length) {
      return badRequest(res, '实验包中没有 labs 数组');
    }

    const result = importLabsSafe(labsIn);
    if (!result.created && result.skipped) {
      return badRequest(
        res,
        result.errors?.[0] || '没有成功导入任何实验（数据未通过校验）',
      );
    }
    success(res, {
      created: result.created,
      renamed: result.renamed,
      skipped: result.skipped,
      errors: result.errors,
      // 兼容旧前端字段名
      updated: 0,
      labs: result.labs,
    });
  } catch (err) {
    console.error('labs import', err);
    error(res, err.message);
  }
});

// POST /api/labs/reset-builtin
router.post('/reset-builtin', (_req, res) => {
  try {
    const result = resetBuiltinLabs();
    success(res, { ...result, labs: listLabs() });
  } catch (err) {
    error(res, err.message);
  }
});

// POST /api/labs/reorder  body: { ids: string[] } — 必须覆盖当前全部 id 且无重复
router.post('/reorder', (req, res) => {
  try {
    ensureLabsSeeded();
    const ids = req.body?.ids;
    if (!Array.isArray(ids) || !ids.length) return badRequest(res, '需要 ids 数组');

    const current = query('SELECT id FROM lab_experiments').map((r) => r.id);
    const currentSet = new Set(current);
    if (ids.length !== current.length) {
      return badRequest(res, `ids 数量须与实验总数一致（期望 ${current.length}，收到 ${ids.length}）`);
    }
    const seen = new Set();
    for (const id of ids) {
      if (typeof id !== 'string' || !id) return badRequest(res, 'ids 含无效项');
      if (seen.has(id)) return badRequest(res, `重复的 id：${id}`);
      if (!currentSet.has(id)) return badRequest(res, `未知的 id：${id}`);
      seen.add(id);
    }
    if (seen.size !== currentSet.size) {
      return badRequest(res, 'ids 未覆盖全部实验');
    }

    const now = Date.now();
    runBatch(() => {
      ids.forEach((id, index) => {
        run('UPDATE lab_experiments SET sort_order = ?, updated_at = ? WHERE id = ?', [index, now, id]);
      });
    });
    success(res, { labs: listLabs() });
  } catch (err) {
    error(res, err.message);
  }
});

// GET /api/labs/:id
router.get('/:id', (req, res) => {
  try {
    const lab = getLab(req.params.id);
    if (!lab) return notFound(res, '实验不存在');
    success(res, lab);
  } catch (err) {
    error(res, err.message);
  }
});

// POST /api/labs
router.post('/', (req, res) => {
  try {
    ensureLabsSeeded();
    const checked = validateLab(req.body || {});
    if (!checked.ok) return badRequest(res, checked.reason);

    const maxRow = queryOne('SELECT MAX(sort_order) AS m FROM lab_experiments');
    const sortOrder = checked.lab.sortOrder != null && !Number.isNaN(checked.lab.sortOrder)
      ? checked.lab.sortOrder
      : (Number(maxRow?.m) || 0) + 1;
    const now = Date.now();
    const id = req.body?.id && String(req.body.id).trim() ? String(req.body.id).trim() : uid('lab');
    if (queryOne('SELECT id FROM lab_experiments WHERE id = ?', [id])) {
      return badRequest(res, '实验 ID 已存在');
    }
    insertLab({
      id,
      title: checked.lab.title,
      type: checked.lab.type || '',
      equation: checked.lab.equation || '',
      safety: checked.lab.safety || '',
      phenomena: checked.lab.phenomena || '',
      steps: checked.lab.steps || [],
      prestudy: checked.lab.prestudy ?? null,
      sortOrder,
      source: 'custom',
      createdAt: now,
      updatedAt: now,
    }, now);
    success(res, getLab(id));
  } catch (err) {
    console.error('labs create', err);
    error(res, err.message);
  }
});

// PUT /api/labs/:id
router.put('/:id', (req, res) => {
  try {
    const existing = getLab(req.params.id);
    if (!existing) return notFound(res, '实验不存在');

    const body = req.body || {};
    const mergedRaw = {
      title: body.title !== undefined ? body.title : existing.title,
      type: body.type !== undefined ? body.type : existing.type,
      equation: body.equation !== undefined ? body.equation : existing.equation,
      safety: body.safety !== undefined ? body.safety : existing.safety,
      phenomena: body.phenomena !== undefined ? body.phenomena : existing.phenomena,
      steps: body.steps !== undefined ? body.steps : existing.steps,
      prestudy: body.prestudy !== undefined ? body.prestudy : existing.prestudy,
      sortOrder: body.sortOrder !== undefined ? body.sortOrder : existing.sortOrder,
    };
    const checked = validateLab(mergedRaw);
    if (!checked.ok) return badRequest(res, checked.reason);

    const now = Date.now();
    // 任意手工修改 → custom（reset 接口单独写回 builtin）
    updateLabRow({
      id: existing.id,
      title: checked.lab.title,
      type: checked.lab.type || '',
      equation: checked.lab.equation || '',
      safety: checked.lab.safety || '',
      phenomena: checked.lab.phenomena || '',
      steps: checked.lab.steps || [],
      prestudy: checked.lab.prestudy ?? null,
      sortOrder: checked.lab.sortOrder != null ? checked.lab.sortOrder : existing.sortOrder,
      source: 'custom',
    }, now);
    success(res, getLab(req.params.id));
  } catch (err) {
    error(res, err.message);
  }
});

// POST /api/labs/:id/reset
router.post('/:id/reset', (req, res) => {
  try {
    const lab = resetOneBuiltin(req.params.id);
    if (!lab) return badRequest(res, '该实验不是内置项，无法重置');
    success(res, lab);
  } catch (err) {
    error(res, err.message);
  }
});

// DELETE /api/labs/:id
router.delete('/:id', (req, res) => {
  try {
    const existing = getLab(req.params.id);
    if (!existing) return notFound(res, '实验不存在');
    run('DELETE FROM lab_experiments WHERE id = ?', [req.params.id]);
    success(res, { deleted: true, id: req.params.id });
  } catch (err) {
    error(res, err.message);
  }
});

module.exports = router;
module.exports.LAB_PACK_FORMAT = LAB_PACK_FORMAT;
module.exports.LAB_PACK_VERSION = LAB_PACK_VERSION;
