/**
 * 智能出题：历史场次、错题本（SQLite）
 */

const express = require('express');
const router = express.Router();
const { success, error, badRequest, notFound } = require('../utils/response');
const {
  getQuizStats,
  createQuizSession,
  updateSessionSummary,
} = require('../services/quiz/sessions');
const {
  listWrongBook,
  attemptWrongBook,
} = require('../services/quiz/wrong-book');

function mapQuizError(res, err, fallbackMessage) {
  const status = err.status || 500;
  if (status === 400) return badRequest(res, err.message);
  if (status === 404) return notFound(res, err.message);
  return error(res, err.message || fallbackMessage);
}

/**
 * GET /api/quiz/stats
 * 历史做题数据总结
 */
router.get('/stats', (req, res) => {
  try {
    success(res, getQuizStats());
  } catch (err) {
    console.error('quiz stats', err);
    mapQuizError(res, err, '统计失败');
  }
});

/**
 * POST /api/quiz/sessions
 * 保存一整场练习；错题本收录：答错 或 使用过 AI 解答
 */
router.post('/sessions', (req, res) => {
  try {
    success(res, createQuizSession(req.body || {}));
  } catch (err) {
    console.error('save quiz session', err);
    mapQuizError(res, err, '保存失败');
  }
});

/**
 * GET /api/quiz/wrong-book
 */
router.get('/wrong-book', (req, res) => {
  try {
    success(res, listWrongBook());
  } catch (err) {
    console.error('wrong book list', err);
    mapQuizError(res, err, '读取错题本失败');
  }
});

/**
 * POST /api/quiz/wrong-book/:id/attempt
 * 错题本内重练：做对自动出本，做错保留并更新 last_chosen
 * body: { chosen: 0-3 }
 */
router.post('/wrong-book/:id/attempt', (req, res) => {
  try {
    success(res, attemptWrongBook(req.params.id, req.body?.chosen));
  } catch (err) {
    console.error('wrong book attempt', err);
    mapQuizError(res, err, '提交失败');
  }
});

/**
 * PATCH session summary text
 */
router.patch('/sessions/:id/summary', (req, res) => {
  try {
    success(res, updateSessionSummary(req.params.id, req.body?.summary));
  } catch (err) {
    mapQuizError(res, err, '更新失败');
  }
});

module.exports = router;
