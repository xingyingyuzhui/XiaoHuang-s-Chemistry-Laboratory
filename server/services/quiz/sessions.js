const { query, queryOne, run, runBatch } = require('../../db/sqlite');
const { ensureQuizSchema } = require('../../db/ensure-quiz-schema');
const { getQuizPaper } = require('../../utils/quiz-paper-store');
const {
  uid,
  parseJsonSafe,
  parseChosen,
  parseAnswer,
  domainError,
} = require('./helpers');
const { backfillWrongBookFromItems } = require('./wrong-book');

function getQuizStats() {
  ensureQuizSchema();
  backfillWrongBookFromItems();
  const sessions = query(
    `SELECT id, created_at, grades, difficulty, topics, total, correct, answered
     FROM quiz_sessions ORDER BY created_at DESC LIMIT 50`,
  );
  const totalSessions = sessions.length;
  let totalQ = 0;
  let totalCorrect = 0;
  const topicHits = {};

  for (const s of sessions) {
    totalQ += Number(s.total) || 0;
    totalCorrect += Number(s.correct) || 0;
    const topics = parseJsonSafe(s.topics, []);
    if (Array.isArray(topics)) {
      for (const t of topics) {
        topicHits[t] = (topicHits[t] || 0) + 1;
      }
    }
  }

  const wrongActive = queryOne(
    `SELECT COUNT(*) AS c FROM quiz_wrong_book WHERE dismissed = 0`,
  );
  const weakTopics = Object.entries(topicHits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const wrongRows = query(
    `SELECT knowledge FROM quiz_wrong_book WHERE dismissed = 0 AND knowledge != ''`,
  );
  const wrongKnowledge = {};
  for (const r of wrongRows) {
    const k = r.knowledge || '未标注';
    wrongKnowledge[k] = (wrongKnowledge[k] || 0) + 1;
  }
  const weakKnowledge = Object.entries(wrongKnowledge)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));

  const recent = sessions.slice(0, 5).map((s) => ({
    id: s.id,
    createdAt: s.created_at,
    difficulty: s.difficulty,
    total: s.total,
    correct: s.correct,
    rate: s.total ? Math.round((s.correct / s.total) * 100) : 0,
  }));

  return {
    totalSessions,
    totalQuestions: totalQ,
    totalCorrect,
    accuracy: totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0,
    wrongBookCount: Number(wrongActive?.c || 0),
    weakTopics,
    weakKnowledge,
    recent,
  };
}

/**
 * 保存一整场练习；错题本收录：答错 或 使用过 AI 解答
 * @param {object} body
 */
function createQuizSession(body = {}) {
  ensureQuizSchema();
  let items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw domainError('缺少题目', 400);

  // 优先用出题快照中的标准答案（忽略客户端篡改的 answer）
  const paperSnap = body.paperId ? getQuizPaper(body.paperId) : null;
  if (paperSnap?.items?.length) {
    const byIdx = paperSnap.items;
    items = items.map((it, idx) => {
      const snap =
        byIdx.find((s) => s.id && it.id && s.id === it.id) || byIdx[idx];
      if (!snap) return it;
      return {
        ...it,
        stem: snap.stem || it.stem,
        options: snap.options?.length ? snap.options : it.options,
        answer: snap.answer,
        knowledge: snap.knowledge || it.knowledge,
        hint: snap.hint || it.hint,
        explain: snap.explain || it.explain,
      };
    });
  }

  const sessionId = body.id || uid('qs');
  const now = Date.now();
  let correct = 0;
  let answered = 0;

  for (const it of items) {
    const chosen = parseChosen(it.chosen);
    const ans = parseAnswer(it.answer);
    if (chosen !== null) {
      answered += 1;
      if (chosen === ans) correct += 1;
    }
  }

  const wrongIds = [];
  let itemsSaved = 0;

  runBatch(() => {
    run(
      `INSERT OR REPLACE INTO quiz_sessions
      (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        now,
        JSON.stringify(body.grades || []),
        String(body.difficulty || ''),
        JSON.stringify(body.topics || []),
        String(body.reveal || 'immediate'),
        items.length,
        correct,
        answered,
        String(body.summary || ''),
      ],
    );

    // 清旧 items 再写（同 id 重交）
    run(`DELETE FROM quiz_items WHERE session_id = ?`, [sessionId]);

    for (let idx = 0; idx < items.length; idx++) {
      const it = items[idx] || {};
      const itemId = String(it.id || uid('qi'));
      const chosen = parseChosen(it.chosen);
      const ans = parseAnswer(it.answer);
      const isCorrect = chosen !== null && chosen === ans ? 1 : 0;
      const usedExplain = it.usedExplain === true || it.usedExplain === 1 ? 1 : 0;
      const usedHint = it.usedHint === true || it.usedHint === 1 ? 1 : 0;
      const options = JSON.stringify(
        Array.isArray(it.options) ? it.options : [],
      );
      const stem = String(it.stem || '').trim();
      if (!stem) {
        console.warn('[quiz] skip item without stem', idx);
        continue;
      }

      try {
        run(
          `INSERT INTO quiz_items
          (id, session_id, idx, stem, options, answer, knowledge, hint, explain_bank, chosen, used_hint, used_explain, is_correct)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            itemId,
            sessionId,
            idx,
            stem,
            options,
            ans,
            String(it.knowledge || ''),
            String(it.hint || ''),
            String(it.explain || it.explain_bank || ''),
            chosen,
            usedHint,
            usedExplain,
            isCorrect,
          ],
        );
        itemsSaved += 1;
      } catch (e) {
        console.error('[quiz] insert item failed', idx, e.message || e);
        // 主键冲突时换 id 重试一次
        try {
          run(
            `INSERT INTO quiz_items
            (id, session_id, idx, stem, options, answer, knowledge, hint, explain_bank, chosen, used_hint, used_explain, is_correct)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              uid('qi'),
              sessionId,
              idx,
              stem,
              options,
              ans,
              String(it.knowledge || ''),
              String(it.hint || ''),
              String(it.explain || it.explain_bank || ''),
              chosen,
              usedHint,
              usedExplain,
              isCorrect,
            ],
          );
          itemsSaved += 1;
        } catch (e2) {
          console.error('[quiz] insert item retry failed', e2.message || e2);
          continue;
        }
      }

      // 规则 A：答错或用过 AI 解答 → 入本；本题做对 → 自动出本
      const isWrong = chosen !== null && chosen !== ans;
      try {
        if (isCorrect === 1) {
          // 做对：自动从错题本移除（不可手动清）
          run(
            `UPDATE quiz_wrong_book SET dismissed = 1, last_chosen = ?, last_session_id = ?
             WHERE dismissed = 0 AND stem = ?`,
            [chosen, sessionId, stem],
          );
        } else if (isWrong || usedExplain) {
          const exists = queryOne(
            `SELECT id FROM quiz_wrong_book WHERE dismissed = 0 AND stem = ? LIMIT 1`,
            [stem],
          );
          if (exists) {
            run(
              `UPDATE quiz_wrong_book SET last_chosen = ?, last_session_id = ?, explain_bank = COALESCE(NULLIF(?, ''), explain_bank) WHERE id = ?`,
              [
                chosen,
                sessionId,
                String(it.explain || it.explain_bank || ''),
                exists.id,
              ],
            );
            wrongIds.push(exists.id);
          } else {
            const wbId = uid('wb');
            run(
              `INSERT INTO quiz_wrong_book
              (id, created_at, stem, options, answer, knowledge, hint, explain_bank, last_chosen, last_session_id, dismissed)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [
                wbId,
                now,
                stem,
                options,
                ans,
                String(it.knowledge || ''),
                String(it.hint || ''),
                String(it.explain || it.explain_bank || ''),
                chosen,
                sessionId,
              ],
            );
            wrongIds.push(wbId);
          }
        }
      } catch (e) {
        console.error('[quiz] wrong book upsert failed', e.message || e);
      }
    }
  }); // end runBatch

  console.log(
    `[quiz] session ${sessionId} itemsSaved=${itemsSaved}/${items.length} wrongBook+=${wrongIds.length}`,
  );

  return {
    id: sessionId,
    total: items.length,
    correct,
    answered,
    itemsSaved,
    wrongBookAdded: wrongIds.length,
  };
}

function updateSessionSummary(id, summary) {
  ensureQuizSchema();
  const text = String(summary || '');
  const row = queryOne(`SELECT id FROM quiz_sessions WHERE id = ?`, [id]);
  if (!row) throw domainError('场次不存在', 404);
  run(`UPDATE quiz_sessions SET summary = ? WHERE id = ?`, [text, id]);
  return { id };
}

module.exports = {
  getQuizStats,
  createQuizSession,
  updateSessionSummary,
};
