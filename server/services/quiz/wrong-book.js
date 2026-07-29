const { query, queryOne, run } = require('../../db/sqlite');
const { ensureQuizSchema } = require('../../db/ensure-quiz-schema');
const {
  uid,
  parseJsonSafe,
  parseChosen,
  parseAnswer,
  domainError,
} = require('./helpers');

/**
 * 从 quiz_items 回填错题本（修复历史：答错过但未入本）
 * 规则 A：已选且答错 或 used_explain=1
 */
function backfillWrongBookFromItems() {
  ensureQuizSchema();
  const items = query(
    `SELECT * FROM quiz_items
     WHERE used_explain = 1
        OR (chosen IS NOT NULL AND is_correct = 0)`,
  );
  let added = 0;
  for (const it of items) {
    const stem = String(it.stem || '').trim();
    if (!stem) continue;
    // 同题干只要历史上出现过（含已攻克 dismissed=1）就不再回填，避免复活
    const exists = queryOne(
      `SELECT id FROM quiz_wrong_book WHERE stem = ? LIMIT 1`,
      [stem],
    );
    if (exists) continue;

    const chosen = parseChosen(it.chosen);
    const ans = parseAnswer(it.answer);
    const usedExplain = Number(it.used_explain) === 1;
    const isWrong = chosen !== null && chosen !== ans;
    if (!isWrong && !usedExplain) continue;

    try {
      run(
        `INSERT INTO quiz_wrong_book
        (id, created_at, stem, options, answer, knowledge, hint, explain_bank, last_chosen, last_session_id, dismissed)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          uid('wb'),
          Date.now(),
          stem,
          String(it.options || '[]'),
          ans,
          String(it.knowledge || ''),
          String(it.hint || ''),
          String(it.explain_bank || ''),
          chosen,
          String(it.session_id || ''),
        ],
      );
      added += 1;
    } catch (e) {
      console.warn('backfill wrong book skip', e.message);
    }
  }
  if (added) console.log(`[quiz] 错题本回填 ${added} 条`);
  return added;
}

function listWrongBook() {
  ensureQuizSchema();
  backfillWrongBookFromItems();
  const rows = query(
    `SELECT * FROM quiz_wrong_book WHERE dismissed = 0 ORDER BY created_at DESC LIMIT 200`,
  );
  return {
    list: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      stem: r.stem,
      options: parseJsonSafe(r.options, []),
      answer: r.answer,
      knowledge: r.knowledge,
      hint: r.hint,
      explain: r.explain_bank,
      lastChosen: r.last_chosen,
      lastSessionId: r.last_session_id,
    })),
  };
}

/**
 * 错题本内重练：做对自动出本，做错保留并更新 last_chosen
 * @param {string} id
 * @param {*} chosenRaw
 */
function attemptWrongBook(id, chosenRaw) {
  ensureQuizSchema();
  const row = queryOne(
    `SELECT * FROM quiz_wrong_book WHERE id = ? AND dismissed = 0`,
    [id],
  );
  if (!row) throw domainError('错题不存在或已攻克', 404);

  const chosen = parseChosen(chosenRaw);
  if (chosen === null || chosen < 0 || chosen > 3) {
    throw domainError('请选择一个选项', 400);
  }

  const ans = parseAnswer(row.answer);
  const correct = chosen === ans;

  if (correct) {
    run(
      `UPDATE quiz_wrong_book SET dismissed = 1, last_chosen = ? WHERE id = ?`,
      [chosen, id],
    );
    return {
      id,
      correct: true,
      answer: ans,
      cleared: true,
      message: '回答正确，已自动移出错题本',
    };
  }

  run(`UPDATE quiz_wrong_book SET last_chosen = ? WHERE id = ?`, [chosen, id]);
  return {
    id,
    correct: false,
    answer: ans,
    cleared: false,
    message: '还不对，继续留在错题本中',
  };
}

module.exports = {
  backfillWrongBookFromItems,
  listWrongBook,
  attemptWrongBook,
};
