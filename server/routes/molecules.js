const express = require('express');
const router = express.Router();
const { query, queryOne, run, runBatch } = require('../db/sqlite');
const { success, error, notFound, badRequest } = require('../utils/response');

/**
 * GET /api/molecules
 * 获取排序后的分子列表
 */
router.get('/', (req, res) => {
  try {
    // 获取排序后的分子列表
    const molecules = query(`
      SELECT m.*, COALESCE(o.sort_order, 999999) as sort_order
      FROM molecules m
      LEFT JOIN molecule_order o ON m.id = o.molecule_id
      ORDER BY sort_order, m.created_at
    `);

    // 解析 JSON 字段
    const result = molecules.map(mol => ({
      ...mol,
      atoms: JSON.parse(mol.atoms),
      bonds: JSON.parse(mol.bonds),
      physics: JSON.parse(mol.physics || '{}'),
      chemistry: JSON.parse(mol.chemistry || '{}'),
      custom: Boolean(mol.custom)
    }));

    success(res, result);
  } catch (err) {
    console.error('获取分子列表失败:', err);
    error(res, '获取分子列表失败');
  }
});

/**
 * GET /api/molecules/:id
 * 获取单个分子
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const molecule = queryOne('SELECT * FROM molecules WHERE id = ?', [id]);

    if (!molecule) {
      return notFound(res, '分子不存在');
    }

    success(res, {
      ...molecule,
      atoms: JSON.parse(molecule.atoms),
      bonds: JSON.parse(molecule.bonds),
      physics: JSON.parse(molecule.physics || '{}'),
      chemistry: JSON.parse(molecule.chemistry || '{}'),
      custom: Boolean(molecule.custom)
    });
  } catch (err) {
    console.error('获取分子失败:', err);
    error(res, '获取分子失败');
  }
});

/**
 * POST /api/molecules
 * 新增分子（AI 生成或手动添加）
 */
router.post('/', (req, res) => {
  try {
    const { id, name, formula, desc, atoms, bonds, physics, chemistry } = req.body;

    // 参数验证
    if (!id || !name || !formula || !atoms || !bonds) {
      return badRequest(res, '缺少必要参数');
    }

    // 检查 ID 是否已存在
    const existing = queryOne('SELECT id FROM molecules WHERE id = ?', [id]);
    if (existing) {
      return badRequest(res, '分子 ID 已存在');
    }

    runBatch(() => {
      run(
        `
      INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom, physics, chemistry)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
    `,
        [
          id,
          name,
          formula,
          desc || '',
          JSON.stringify(atoms),
          JSON.stringify(bonds),
          JSON.stringify(physics || {}),
          JSON.stringify(chemistry || {}),
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
 * 删除分子
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    // 检查分子是否存在
    const molecule = queryOne('SELECT id, custom FROM molecules WHERE id = ?', [id]);
    if (!molecule) {
      return notFound(res, '分子不存在');
    }

    // 只允许删除自定义分子
    if (!molecule.custom) {
      return badRequest(res, '内置分子不能删除');
    }

    // 删除分子
    run('DELETE FROM molecules WHERE id = ?', [id]);
    run('DELETE FROM molecule_order WHERE molecule_id = ?', [id]);

    success(res, null, '分子已删除');
  } catch (err) {
    console.error('删除分子失败:', err);
    error(res, '删除分子失败');
  }
});

/**
 * PUT /api/molecules/order
 * 更新分子排序
 */
router.put('/order', (req, res) => {
  try {
    const { order } = req.body;

    if (!Array.isArray(order)) {
      return badRequest(res, '排序参数必须是数组');
    }

    // 批量写：先清空再插入，只落盘一次
    runBatch(() => {
      run('DELETE FROM molecule_order');
      order.forEach((id, index) => {
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
