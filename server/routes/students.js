const express = require('express');
const router = express.Router();
const { query, queryOne, run, runBatch } = require('../db/sqlite');
const { success, error, badRequest, notFound } = require('../utils/response');

function mapRow(row) {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

/** GET /api/students */
router.get('/', (req, res) => {
  try {
    const rows = query(
      'SELECT * FROM class_students ORDER BY sort_order ASC, created_at ASC',
    );
    success(res, rows.map(mapRow));
  } catch (err) {
    console.error(err);
    error(res, '获取名单失败');
  }
});

/** POST /api/students  { name } */
router.post('/', (req, res) => {
  try {
    const name = String(req.body?.name || '').trim().slice(0, 40);
    if (!name) return badRequest(res, '姓名不能为空');
    const max = queryOne('SELECT MAX(sort_order) as m FROM class_students');
    const sortOrder = (max?.m != null ? Number(max.m) : -1) + 1;
    const id = `stu-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const createdAt = Date.now();
    run(
      'INSERT INTO class_students (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)',
      [id, name, sortOrder, createdAt],
    );
    success(res, mapRow(queryOne('SELECT * FROM class_students WHERE id = ?', [id])), '已添加');
  } catch (err) {
    console.error(err);
    error(res, '添加失败');
  }
});

/**
 * POST /api/students/import
 * { names: string[], mode: 'append'|'replace' }
 */
router.post('/import', (req, res) => {
  try {
    const mode = req.body?.mode === 'replace' ? 'replace' : 'append';
    let names = Array.isArray(req.body?.names) ? req.body.names : [];
    names = names
      .map((n) => String(n || '').trim().slice(0, 40))
      .filter(Boolean);
    // 去重保序
    const seen = new Set();
    names = names.filter((n) => {
      if (seen.has(n)) return false;
      seen.add(n);
      return true;
    });
    if (!names.length) return badRequest(res, '没有有效姓名');

    const created = [];
    const now = Date.now();
    runBatch(() => {
      if (mode === 'replace') {
        run('DELETE FROM class_students');
      }
      const max = queryOne('SELECT MAX(sort_order) as m FROM class_students');
      let sortOrder = max?.m != null ? Number(max.m) + 1 : 0;
      for (const name of names.slice(0, 200)) {
        const id = `stu-${now.toString(36)}-${sortOrder}-${Math.random().toString(36).slice(2, 5)}`;
        run(
          'INSERT INTO class_students (id, name, sort_order, created_at) VALUES (?, ?, ?, ?)',
          [id, name, sortOrder, now],
        );
        created.push({ id, name, sortOrder, createdAt: now });
        sortOrder += 1;
      }
    });
    success(res, { count: created.length, students: created }, `已导入 ${created.length} 人`);
  } catch (err) {
    console.error(err);
    error(res, '导入失败');
  }
});

/** PUT /api/students/:id  { name } */
router.put('/:id', (req, res) => {
  try {
    const row = queryOne('SELECT * FROM class_students WHERE id = ?', [req.params.id]);
    if (!row) return notFound(res, '同学不存在');
    const name = String(req.body?.name || '').trim().slice(0, 40);
    if (!name) return badRequest(res, '姓名不能为空');
    run('UPDATE class_students SET name = ? WHERE id = ?', [name, req.params.id]);
    success(res, mapRow(queryOne('SELECT * FROM class_students WHERE id = ?', [req.params.id])));
  } catch (err) {
    console.error(err);
    error(res, '更新失败');
  }
});

/** DELETE /api/students/:id */
router.delete('/:id', (req, res) => {
  try {
    const row = queryOne('SELECT * FROM class_students WHERE id = ?', [req.params.id]);
    if (!row) return notFound(res, '同学不存在');
    run('DELETE FROM class_students WHERE id = ?', [req.params.id]);
    success(res, null, '已删除');
  } catch (err) {
    console.error(err);
    error(res, '删除失败');
  }
});

module.exports = router;
