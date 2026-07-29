'use strict';

const express = require('express');
const router = express.Router();
const { success, error, badRequest } = require('../utils/response');
const { query, queryOne, run, runBatch } = require('../db/sqlite');
const { ensureQuizSchema } = require('../db/ensure-quiz-schema');
const { OFFLINE_QUESTIONS } = require('../seed/offline-quiz-bank');

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const offlinePapers = new Map();

function stripAnswer(q) {
  return {
    sourceQuestionId: q.sourceQuestionId,
    question: q.stem,
    options: q.options,
    sourceExam: q.sourceExam,
    sourceYear: q.sourceYear,
  };
}

router.get('/years', (_req, res) => {
  try {
    const years = [...new Set(OFFLINE_QUESTIONS.map(q => q.sourceYear))].filter(Boolean).sort((a, b) => a - b);
    success(res, { years });
  } catch (err) {
    error(res, err.message);
  }
});

router.get('/list', (req, res) => {
  try {
    let questions = OFFLINE_QUESTIONS;
    const year = req.query.year ? Number(req.query.year) : null;
    if (year) questions = questions.filter(q => q.sourceYear === year);
    const years = [...new Set(OFFLINE_QUESTIONS.map(q => q.sourceYear))].filter(Boolean).sort((a, b) => a - b);

    const total = questions.length;
    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    const paged = questions.slice(start, start + pageSize);
    const safe = paged.map(stripAnswer);

    success(res, { questions: safe, total, page, pageSize, totalPages, years });
  } catch (err) {
    error(res, err.message);
  }
});

router.post('/generate', (req, res) => {
  try {
    const count = Math.min(OFFLINE_QUESTIONS.length, Math.max(1, Number(req.body?.count) || 5));
    const year = req.body?.year ? Number(req.body.year) : null;
    let pool = OFFLINE_QUESTIONS;
    if (year) pool = pool.filter(q => q.sourceYear === year);
    if (!pool.length) return badRequest(res, '没有匹配的题目');

    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const picked = shuffled.slice(0, Math.min(count, shuffled.length));
    const paperId = uid('op');

    offlinePapers.set(paperId, {
      created: Date.now(),
      questions: picked.map(q => ({
        sourceQuestionId: q.sourceQuestionId,
        question: q.stem,
        options: q.options,
        answer: q.answer,
        sourceExam: q.sourceExam,
        sourceYear: q.sourceYear,
      })),
    });

    const cutoff = Date.now() - 2 * 3600 * 1000;
    for (const [k, v] of offlinePapers) {
      if (v.created < cutoff) offlinePapers.delete(k);
    }

    const questions = picked.map(stripAnswer);
    success(res, { paperId, questions, total: questions.length });
  } catch (err) {
    error(res, err.message);
  }
});

router.post('/submit', (req, res) => {
  try {
    ensureQuizSchema();
    const { paperId, answers } = req.body || {};
    if (!paperId || !Array.isArray(answers) || !answers.length) {
      return badRequest(res, '缺少 paperId 或 answers');
    }
    const paper = offlinePapers.get(paperId);
    if (!paper) return badRequest(res, '试卷不存在或已过期，请重新生成');

    const sessionId = uid('qs');
    const now = Date.now();
    let correct = 0;
    let answered = 0;

    runBatch(() => {
      run(
        `INSERT INTO quiz_sessions (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary, source_type)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, now, '[]', '离线题库', '[]', 'immediate', paper.questions.length, 0, 0, '', 'offline'],
      );

      for (let idx = 0; idx < paper.questions.length; idx++) {
        const q = paper.questions[idx];
        const a = answers.find(x => x.id === q.sourceQuestionId) || {};
        const chosen = (a.chosen === null || a.chosen === undefined || a.chosen === -1) ? null : Number(a.chosen);
        const isCorrect = chosen !== null && chosen === q.answer ? 1 : 0;
        if (chosen !== null) answered++;
        if (isCorrect) correct++;

        run(
          `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, hint, explain_bank, chosen, used_hint, used_explain, is_correct)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uid('qi'), sessionId, idx, q.question, JSON.stringify(q.options), q.answer, q.sourceExam || '', '', '', chosen, 0, 0, isCorrect],
        );
      }

      run(
        `UPDATE quiz_sessions SET correct = ?, answered = ? WHERE id = ?`,
        [correct, answered, sessionId],
      );

      for (let idx = 0; idx < paper.questions.length; idx++) {
        const q = paper.questions[idx];
        const a = answers.find(x => x.id === q.sourceQuestionId) || {};
        const chosen = (a.chosen === null || a.chosen === undefined || a.chosen === -1) ? null : Number(a.chosen);
        const isCorrect = chosen !== null && chosen === q.answer;
        const stem = q.question;
        if (!isCorrect && chosen !== null) {
          const exists = queryOne(
            `SELECT id FROM quiz_wrong_book WHERE dismissed = 0 AND stem = ? LIMIT 1`,
            [stem],
          );
          if (exists) {
            run(
              `UPDATE quiz_wrong_book SET last_chosen = ?, last_session_id = ? WHERE id = ?`,
              [chosen, sessionId, exists.id],
            );
          } else {
            run(
              `INSERT INTO quiz_wrong_book
              (id, created_at, stem, options, answer, knowledge, hint, explain_bank, last_chosen, last_session_id, dismissed)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [uid('wb'), now, stem, JSON.stringify(q.options), q.answer, q.sourceExam || '', '', '', chosen, sessionId],
            );
          }
        }
      }
    });

    const items = paper.questions.map((q) => {
      const a = answers.find(x => x.id === q.sourceQuestionId) || {};
      const chosen = (a.chosen === null || a.chosen === undefined || a.chosen === -1) ? null : Number(a.chosen);
      return {
        sourceQuestionId: q.sourceQuestionId,
        question: q.question,
        options: q.options,
        answer: q.answer,
        chosen,
        correct: chosen !== null && chosen === q.answer,
        sourceExam: q.sourceExam,
      };
    });

    success(res, {
      sessionId,
      total: paper.questions.length,
      correct,
      answered,
      items,
    });

    offlinePapers.delete(paperId);
  } catch (err) {
    console.error('offline quiz submit', err);
    error(res, err.message);
  }
});

module.exports = router;
