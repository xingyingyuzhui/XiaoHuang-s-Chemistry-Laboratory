const express = require('express');
const router = express.Router();
const { success, error, badRequest } = require('../../utils/response');
const {
  generateTip,
  tipLocalFallback,
  generateReaction,
  generateStoich,
  generateLab,
  generateBalanceStepTip,
  generateBalance,
} = require('../../services/ai/chemistry-service');

function mapAiError(res, err, fallbackMessage) {
  const status = err.status || 500;
  if (status === 400) return badRequest(res, err.message);
  if (status === 429) return error(res, err.message, 429);
  return error(res, err.message || fallbackMessage, status >= 400 ? status : 502);
}

router.post('/tip', async (req, res) => {
  try {
    const data = await generateTip();
    success(res, data);
  } catch (err) {
    console.error('AI 小知识失败:', err);
    try {
      return success(res, tipLocalFallback());
    } catch {
      error(res, err.message || 'AI 生成失败');
    }
  }
});

/**
 * POST /api/ai/reaction
 * 智能生成示意级化学反应（含分步动画）
 */
router.post('/reaction', async (req, res) => {
  try {
    const { prompt, moleculeId, moleculeName, moleculeFormula, stepCount } =
      req.body || {};
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return badRequest(res, '请描述要添加的化学反应');
    }

    const data = await generateReaction({
      prompt,
      moleculeId,
      moleculeName,
      moleculeFormula,
      stepCount,
    });
    success(res, data);
  } catch (err) {
    console.error('AI 生成反应失败:', err);
    mapAiError(res, err, '生成反应失败');
  }
});

/**
 * POST /api/ai/stoich
 * 化学计量分步解答（教学示意）
 */
router.post('/stoich', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return badRequest(res, '请输入计量题目');

    const data = await generateStoich(prompt);
    success(res, data);
  } catch (err) {
    console.error('AI 计量失败:', err);
    mapAiError(res, err, '分步解答失败');
  }
});

/**
 * POST /api/ai/lab
 * 生成实验探究草稿（脚本步骤 + 可选预习题），不落库，由前端确认后保存
 */
router.post('/lab', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return badRequest(res, '请描述要生成的实验');

    const data = await generateLab(prompt);
    success(res, data);
  } catch (err) {
    console.error('AI lab 生成失败:', err);
    mapAiError(res, err, '实验生成失败');
  }
});

/**
 * POST /api/ai/balance
 * AI 建议配平（前端仍应本地校验）
 * body.mode === 'step_tip' 时：只针对当前练习步骤给一条提示，不返回完整配平答案
 */
router.post('/balance', async (req, res) => {
  try {
    const equation = String(req.body?.equation || '').trim();
    if (!equation) return badRequest(res, '请输入方程式');

    const mode = String(req.body?.mode || '').trim();

    // ── 分步练习：只提示当前步，禁止剧透最终系数/整式 ──
    if (mode === 'step_tip') {
      const step =
        req.body?.step && typeof req.body.step === 'object' ? req.body.step : {};
      const data = await generateBalanceStepTip({ equation, step });
      return success(res, data);
    }

    const data = await generateBalance(equation);
    success(res, data);
  } catch (err) {
    console.error('AI 配平失败:', err);
    const status = err.status || 500;
    if (status === 400) return badRequest(res, err.message);
    error(res, err.message || '配平建议失败', status >= 400 ? status : 502);
  }
});

module.exports = router;
