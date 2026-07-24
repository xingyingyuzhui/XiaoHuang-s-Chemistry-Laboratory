/**
 * 出题快照：服务端保存标准答案，交卷时以服务端答案为准
 */

const { queryOne, run, runBatch } = require('../db/sqlite');

function ensurePaperTable() {
  try {
    run(`CREATE TABLE IF NOT EXISTS quiz_papers (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      meta_json TEXT DEFAULT '{}',
      items_json TEXT NOT NULL
    )`);
  } catch (e) {
    console.warn('ensurePaperTable', e?.message);
  }
}

function uid() {
  return `qp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {Array} questions 规范化后的题目（含 answer）
 * @param {object} meta
 * @returns {string} paperId
 */
function storeQuizPaper(questions, meta = {}) {
  ensurePaperTable();
  const id = uid();
  const items = (questions || []).map((q, i) => ({
    id: String(q.id || `q${i + 1}`),
    stem: String(q.stem || '').trim(),
    options: Array.isArray(q.options) ? q.options.slice(0, 4).map(String) : [],
    answer: Math.trunc(Number(q.answer)) || 0,
    knowledge: String(q.knowledge || ''),
    hint: String(q.hint || ''),
    explain: String(q.explain || ''),
  }));
  run(
    `INSERT INTO quiz_papers (id, created_at, meta_json, items_json) VALUES (?, ?, ?, ?)`,
    [id, Date.now(), JSON.stringify(meta || {}), JSON.stringify(items)],
  );
  // 清理 48h 前草稿
  try {
    run(`DELETE FROM quiz_papers WHERE created_at < ?`, [
      Date.now() - 48 * 3600 * 1000,
    ]);
  } catch {
    /* ignore */
  }
  return id;
}

function getQuizPaper(paperId) {
  ensurePaperTable();
  if (!paperId) return null;
  const row = queryOne(`SELECT * FROM quiz_papers WHERE id = ?`, [String(paperId)]);
  if (!row) return null;
  let items = [];
  let meta = {};
  try {
    items = JSON.parse(row.items_json || '[]');
  } catch {
    items = [];
  }
  try {
    meta = JSON.parse(row.meta_json || '{}');
  } catch {
    meta = {};
  }
  return { id: row.id, createdAt: row.created_at, items, meta };
}

module.exports = {
  ensurePaperTable,
  storeQuizPaper,
  getQuizPaper,
};
