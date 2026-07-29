const express = require('express');
const router = express.Router();
const { success, error, badRequest } = require('../../utils/response');
const { reserveCall, releaseCall } = require('../../utils/quiz-assist-limit');
const {
  generateQuiz,
  generateHint,
  generateExplain,
  explainFallback,
  scoreQuiz,
  summarizeQuiz,
} = require('../../services/ai/quiz-service');

function mapAiError(res, err, fallbackMessage) {
  const status = err.status || 500;
  if (status === 400) return badRequest(res, err.message);
  if (status === 429) {
    return res.status(429).json({
      success: false,
      message: err.message,
      data: null,
    });
  }
  return error(res, err.message || fallbackMessage, status >= 400 ? status : 502);
}

router.post('/quiz/generate', async (req, res) => {
  try {
    const data = await generateQuiz(req.body || {});
    success(res, data);
  } catch (err) {
    console.error('智能出题失败:', err);
    mapAiError(res, err, '出题失败');
  }
});

/**
 * POST /api/ai/quiz/hint
 * 单题提示（气泡用）；1h 内最多 20 次成功调模型
 */
router.post('/quiz/hint', async (req, res) => {
  let reservationId = null;
  try {
    const { stem, options, knowledge } = req.body || {};
    if (!stem) return badRequest(res, '缺少题干');

    const lim = reserveCall('hint');
    if (!lim.allowed) {
      return res.status(429).json({
        success: false,
        message: lim.message,
        data: {
          limited: true,
          kind: 'hint',
          resetInMs: lim.resetInMs,
          resetLabel: lim.resetLabel,
          used: lim.used,
          limit: lim.limit,
        },
      });
    }
    reservationId = lim.reservationId;

    const data = await generateHint({ stem, options, knowledge });
    success(res, data);
  } catch (err) {
    releaseCall(reservationId);
    console.error('题目提示失败:', err);
    const status = err.status || 500;
    if (status === 400) return badRequest(res, err.message);
    error(res, err.message || '提示失败', status >= 400 ? status : 502);
  }
});

/**
 * POST /api/ai/quiz/explain
 * 单题解答；1h 内最多 20 次成功调模型（与提示分开计数）
 */
router.post('/quiz/explain', async (req, res) => {
  let reservationId = null;
  try {
    const { stem, options, answer, knowledge, explain } = req.body || {};
    if (!stem) return badRequest(res, '缺少题干');

    const lim = reserveCall('explain');
    if (!lim.allowed) {
      return res.status(429).json({
        success: false,
        message: lim.message,
        data: {
          limited: true,
          kind: 'explain',
          resetInMs: lim.resetInMs,
          resetLabel: lim.resetLabel,
          used: lim.used,
          limit: lim.limit,
        },
      });
    }
    reservationId = lim.reservationId;

    const data = await generateExplain({
      stem,
      options,
      answer,
      knowledge,
      explain,
    });
    success(res, data);
  } catch (err) {
    releaseCall(reservationId);
    console.error('题目解答失败:', err);
    // 非限流错误：可回落本地解析（占位已释放，不计成功调用）
    const fallback = explainFallback(req.body || {});
    if (fallback) return success(res, fallback);
    const status = err.status || 500;
    if (status === 400) return badRequest(res, err.message);
    error(res, err.message || '解答失败', status >= 400 ? status : 502);
  }
});

/**
 * POST /api/ai/quiz/score
 * 0～10 AI 评分；练习/错题数据指纹未变时直接返回缓存，不重复调模型
 */
router.post('/quiz/score', async (req, res) => {
  try {
    const data = await scoreQuiz();
    success(res, data);
  } catch (err) {
    console.error('AI 评分失败:', err);
    const status = err.status || 500;
    if (status === 400) return badRequest(res, err.message);
    error(res, err.message || '评分失败', status >= 400 ? status : 502);
  }
});

/**
 * POST /api/ai/quiz/summary
 * 交卷后 AI 分析报告（右侧展示）
 */
router.post('/quiz/summary', async (req, res) => {
  try {
    const { difficulty, topics = [], results = [] } = req.body || {};
    if (!Array.isArray(results) || !results.length) {
      return badRequest(res, '缺少答题结果');
    }

    const data = await summarizeQuiz({ difficulty, topics, results });
    success(res, data);
  } catch (err) {
    console.error('练习总结失败:', err);
    const status = err.status || 500;
    if (status === 400) return badRequest(res, err.message);
    error(res, err.message || '总结失败', status >= 400 ? status : 502);
  }
});

module.exports = router;
