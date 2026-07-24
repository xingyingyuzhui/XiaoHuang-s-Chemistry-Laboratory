const express = require('express');
const router = express.Router();
const { query, queryOne, run } = require('../db/sqlite');
const { success, error, badRequest, notFound } = require('../utils/response');
const { insertReaction, rowFromReaction } = require('../seed/import-reactions');

function parseJson(str, fallback) {
  try {
    return JSON.parse(str || '');
  } catch {
    return fallback;
  }
}

function mapRow(row) {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    equation: row.equation,
    reactants: parseJson(row.reactants_json, []),
    products: parseJson(row.products_json, []),
    conditions: row.conditions,
    phenomena: row.phenomena,
    notes: row.notes,
    steps: parseJson(row.steps_json, []),
    moleculeIds: parseJson(row.molecule_ids_json, []),
    source: row.source,
    createdAt: row.created_at,
  };
}

/**
 * GET /api/reactions
 * ?moleculeId=c2h4  筛选与该分子相关的反应
 */
router.get('/', (req, res) => {
  try {
    const { moleculeId } = req.query;
    let rows = query(
      'SELECT * FROM chem_reactions ORDER BY source ASC, created_at ASC',
    );
    let list = rows.map(mapRow);
    if (moleculeId && String(moleculeId).trim()) {
      const mid = String(moleculeId).trim();
      list = list.filter((r) => {
        if ((r.moleculeIds || []).includes(mid)) return true;
        const inR = (r.reactants || []).some((x) => x.moleculeId === mid);
        const inP = (r.products || []).some((x) => x.moleculeId === mid);
        return inR || inP;
      });
    }
    success(res, list);
  } catch (err) {
    console.error(err);
    error(res, '获取反应列表失败');
  }
});

router.get('/:id', (req, res) => {
  try {
    const row = queryOne('SELECT * FROM chem_reactions WHERE id = ?', [
      req.params.id,
    ]);
    if (!row) return notFound(res, '反应不存在');
    success(res, mapRow(row));
  } catch (err) {
    console.error(err);
    error(res, '获取反应失败');
  }
});

/**
 * POST /api/reactions
 * 保存 AI 生成的反应（确认后入库）
 */
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.title || !body.equation) {
      return badRequest(res, '标题和方程式不能为空');
    }
    const id =
      body.id && String(body.id).trim()
        ? String(body.id).trim()
        : `rxn-ai-${Date.now().toString(36)}`;
    const existing = queryOne('SELECT id FROM chem_reactions WHERE id = ?', [
      id,
    ]);
    if (existing) {
      return badRequest(res, '反应 id 已存在');
    }

    const moleculeIds = Array.isArray(body.moleculeIds)
      ? body.moleculeIds
      : [];
    // 从 reactants/products 收集 moleculeId
    for (const side of [body.reactants, body.products]) {
      if (!Array.isArray(side)) continue;
      side.forEach((x) => {
        if (x?.moleculeId && !moleculeIds.includes(x.moleculeId)) {
          moleculeIds.push(x.moleculeId);
        }
      });
    }

    const reaction = {
      id,
      title: String(body.title).slice(0, 80),
      type: String(body.type || '其他').slice(0, 20),
      equation: String(body.equation).slice(0, 200),
      reactants: Array.isArray(body.reactants) ? body.reactants : [],
      products: Array.isArray(body.products) ? body.products : [],
      conditions: String(body.conditions || '').slice(0, 200),
      phenomena: String(body.phenomena || '').slice(0, 200),
      notes: String(body.notes || '').slice(0, 400),
      steps: Array.isArray(body.steps) ? body.steps.slice(0, 12) : [],
      moleculeIds,
      source: 'ai',
      created_at: Date.now(),
    };

    insertReaction(rowFromReaction(reaction, 'ai'));
    success(res, mapRow(
      queryOne('SELECT * FROM chem_reactions WHERE id = ?', [id]),
    ), '已保存反应');
  } catch (err) {
    console.error(err);
    error(res, '保存反应失败');
  }
});

/**
 * DELETE /api/reactions/:id
 * 仅允许删除 AI 添加的反应
 */
router.delete('/:id', (req, res) => {
  try {
    const row = queryOne('SELECT * FROM chem_reactions WHERE id = ?', [
      req.params.id,
    ]);
    if (!row) return notFound(res, '反应不存在');
    if (row.source === 'builtin') {
      return badRequest(res, '内置反应不可删除');
    }
    run('DELETE FROM chem_reactions WHERE id = ?', [req.params.id]);
    success(res, null, '已删除');
  } catch (err) {
    console.error(err);
    error(res, '删除失败');
  }
});

module.exports = router;
