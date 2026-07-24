/**
 * 智能出题：历史场次、错题本（SQLite）
 */

const express = require('express');
const router = express.Router();
const { query, queryOne, run, runBatch } = require('../db/sqlite');
const { success, error, badRequest, notFound } = require('../utils/response');

function ensureQuizTables() {
  try {
    run(`CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      grades TEXT DEFAULT '[]',
      difficulty TEXT DEFAULT '',
      topics TEXT DEFAULT '[]',
      reveal TEXT DEFAULT 'immediate',
      total INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0,
      answered INTEGER DEFAULT 0,
      summary TEXT DEFAULT ''
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      stem TEXT NOT NULL,
      options TEXT NOT NULL,
      answer INTEGER NOT NULL,
      knowledge TEXT DEFAULT '',
      hint TEXT DEFAULT '',
      explain_bank TEXT DEFAULT '',
      chosen INTEGER,
      used_hint INTEGER DEFAULT 0,
      used_explain INTEGER DEFAULT 0,
      is_correct INTEGER DEFAULT 0
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      stem TEXT NOT NULL,
      options TEXT NOT NULL,
      answer INTEGER NOT NULL,
      knowledge TEXT DEFAULT '',
      hint TEXT DEFAULT '',
      explain_bank TEXT DEFAULT '',
      last_chosen INTEGER,
      last_session_id TEXT,
      dismissed INTEGER DEFAULT 0
    )`);
  } catch (e) {
    console.warn('ensureQuizTables', e.message);
  }
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function parseJsonSafe(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

/** 选项下标：保留 0，区分未作答 */
function parseChosen(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function parseAnswer(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
}

/**
 * 从 quiz_items 回填错题本（修复历史：答错过但未入本）
 * 规则 A：已选且答错 或 used_explain=1
 */
function backfillWrongBookFromItems() {
  ensureQuizTables();
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

/**
 * GET /api/quiz/stats
 * 历史做题数据总结
 */
router.get('/stats', (req, res) => {
  try {
    ensureQuizTables();
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

    // 错题本知识点分布
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

    success(res, {
      totalSessions,
      totalQuestions: totalQ,
      totalCorrect,
      accuracy: totalQ ? Math.round((totalCorrect / totalQ) * 100) : 0,
      wrongBookCount: Number(wrongActive?.c || 0),
      weakTopics,
      weakKnowledge,
      recent,
    });
  } catch (err) {
    console.error('quiz stats', err);
    error(res, err.message || '统计失败');
  }
});

/**
 * POST /api/quiz/sessions
 * 保存一整场练习；错题本收录：答错 或 使用过 AI 解答
 */
router.post('/sessions', (req, res) => {
  try {
    ensureQuizTables();
    const body = req.body || {};
    let items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return badRequest(res, '缺少题目');

    // 优先用出题快照中的标准答案（忽略客户端篡改的 answer）
    const { getQuizPaper } = require('../utils/quiz-paper-store');
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

    success(res, {
      id: sessionId,
      total: items.length,
      correct,
      answered,
      itemsSaved,
      wrongBookAdded: wrongIds.length,
    });
  } catch (err) {
    console.error('save quiz session', err);
    error(res, err.message || '保存失败');
  }
});

/**
 * GET /api/quiz/wrong-book
 */
router.get('/wrong-book', (req, res) => {
  try {
    ensureQuizTables();
    backfillWrongBookFromItems();
    const rows = query(
      `SELECT * FROM quiz_wrong_book WHERE dismissed = 0 ORDER BY created_at DESC LIMIT 200`,
    );
    const list = rows.map((r) => ({
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
    }));
    success(res, { list });
  } catch (err) {
    console.error('wrong book list', err);
    error(res, err.message || '读取错题本失败');
  }
});

/**
 * POST /api/quiz/wrong-book/:id/attempt
 * 错题本内重练：做对自动出本，做错保留并更新 last_chosen
 * body: { chosen: 0-3 }
 */
router.post('/wrong-book/:id/attempt', (req, res) => {
  try {
    ensureQuizTables();
    const id = req.params.id;
    const row = queryOne(
      `SELECT * FROM quiz_wrong_book WHERE id = ? AND dismissed = 0`,
      [id],
    );
    if (!row) return notFound(res, '错题不存在或已攻克');

    const chosen = parseChosen(req.body?.chosen);
    if (chosen === null || chosen < 0 || chosen > 3) {
      return badRequest(res, '请选择一个选项');
    }

    const ans = parseAnswer(row.answer);
    const correct = chosen === ans;

    if (correct) {
      run(
        `UPDATE quiz_wrong_book SET dismissed = 1, last_chosen = ? WHERE id = ?`,
        [chosen, id],
      );
      success(res, {
        id,
        correct: true,
        answer: ans,
        cleared: true,
        message: '回答正确，已自动移出错题本',
      });
    } else {
      run(
        `UPDATE quiz_wrong_book SET last_chosen = ? WHERE id = ?`,
        [chosen, id],
      );
      success(res, {
        id,
        correct: false,
        answer: ans,
        cleared: false,
        message: '还不对，继续留在错题本中',
      });
    }
  } catch (err) {
    console.error('wrong book attempt', err);
    error(res, err.message || '提交失败');
  }
});

/**
 * PATCH session summary text
 */
router.patch('/sessions/:id/summary', (req, res) => {
  try {
    ensureQuizTables();
    const id = req.params.id;
    const text = String(req.body?.summary || '');
    const row = queryOne(`SELECT id FROM quiz_sessions WHERE id = ?`, [id]);
    if (!row) return notFound(res, '场次不存在');
    run(`UPDATE quiz_sessions SET summary = ? WHERE id = ?`, [text, id]);
    success(res, { id });
  } catch (err) {
    error(res, err.message || '更新失败');
  }
});

module.exports = router;
