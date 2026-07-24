const express = require('express');
const router = express.Router();
const { query, queryOne, run, runBatch } = require('../db/sqlite');
const { success, error, notFound, badRequest } = require('../utils/response');
const {
  validateMoleculePayload,
  mapMoleculeRow,
} = require('../utils/molecule-validate');

/**
 * GET /api/molecules
 */
router.get('/', (req, res) => {
  try {
    const molecules = query(`
      SELECT m.*, COALESCE(o.sort_order, 999999) as sort_order
      FROM molecules m
      LEFT JOIN molecule_order o ON m.id = o.molecule_id
      ORDER BY sort_order, m.created_at
    `);

    const result = molecules.map((mol) => {
      try {
        return mapMoleculeRow(mol);
      } catch (e) {
        console.warn('跳过损坏分子行:', mol?.id, e?.message);
        return null;
      }
    }).filter(Boolean);

    success(res, result);
  } catch (err) {
    console.error('获取分子列表失败:', err);
    error(res, '获取分子列表失败');
  }
});

/**
 * GET /api/molecules/:id
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const molecule = queryOne('SELECT * FROM molecules WHERE id = ?', [id]);
    if (!molecule) {
      return notFound(res, '分子不存在');
    }
    success(res, mapMoleculeRow(molecule));
  } catch (err) {
    console.error('获取分子失败:', err);
    error(res, '获取分子失败');
  }
});

/**
 * POST /api/molecules
 */
router.post('/', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.id) {
      return badRequest(res, '缺少分子 id');
    }
    const id = String(body.id).slice(0, 80);

    const existing = queryOne('SELECT id FROM molecules WHERE id = ?', [id]);
    if (existing) {
      return badRequest(res, '分子 ID 已存在');
    }

    let validated;
    try {
      validated = validateMoleculePayload(body);
    } catch (e) {
      return badRequest(res, e.message || '分子数据无效');
    }

    runBatch(() => {
      run(
        `INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom, physics, chemistry)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [
          id,
          validated.name,
          validated.formula,
          validated.desc,
          JSON.stringify(validated.atoms),
          JSON.stringify(validated.bonds),
          JSON.stringify(validated.physics),
          JSON.stringify(validated.chemistry),
        ],
      );

      const maxOrder = queryOne('SELECT MAX(sort_order) as max FROM molecule_order');
      const newOrder = (maxOrder?.max || 0) + 1;
      run('INSERT INTO molecule_order (molecule_id, sort_order) VALUES (?, ?)', [
        id,
        newOrder,
      ]);
    });

    success(res, { id }, '分子已添加');
  } catch (err) {
    console.error('添加分子失败:', err);
    error(res, '添加分子失败');
  }
});

/**
 * DELETE /api/molecules/:id
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const molecule = queryOne('SELECT id, custom FROM molecules WHERE id = ?', [
      id,
    ]);
    if (!molecule) {
      return notFound(res, '分子不存在');
    }
    if (!molecule.custom) {
      return badRequest(res, '内置分子不能删除');
    }

    runBatch(() => {
      run('DELETE FROM molecules WHERE id = ?', [id]);
      run('DELETE FROM molecule_order WHERE molecule_id = ?', [id]);
    });

    success(res, null, '分子已删除');
  } catch (err) {
    console.error('删除分子失败:', err);
    error(res, '删除分子失败');
  }
});

/**
 * PUT /api/molecules/order
 */
router.put('/order', (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return badRequest(res, '排序参数必须是数组');
    }
    if (!order.length) {
      return badRequest(res, '排序不能为空');
    }

    const existing = new Set(
      query('SELECT id FROM molecules').map((r) => r.id),
    );
    const clean = [];
    const seen = new Set();
    for (const raw of order) {
      const id = String(raw || '');
      if (!id || seen.has(id) || !existing.has(id)) continue;
      seen.add(id);
      clean.push(id);
    }
    if (!clean.length) {
      return badRequest(res, '排序中无有效分子 id');
    }
    // 未出现在 order 里的分子补到末尾
    for (const id of existing) {
      if (!seen.has(id)) clean.push(id);
    }

    runBatch(() => {
      run('DELETE FROM molecule_order');
      clean.forEach((id, index) => {
        run('INSERT INTO molecule_order (molecule_id, sort_order) VALUES (?, ?)', [
          id,
          index + 1,
        ]);
      });
    });

    success(res, null, '排序已更新');
  } catch (err) {
    console.error('更新排序失败:', err);
    error(res, '更新排序失败');
  }
});

module.exports = router;
