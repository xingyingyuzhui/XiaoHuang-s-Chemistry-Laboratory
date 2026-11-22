/**
 * 随堂小黄 AI 助教路由
 * - POST /api/ai/thinking-question：根据当前页面上下文生成一道启发性课堂思考题
 */

const express = require('express');
const router = express.Router();
const { success, error, badRequest } = require('../../utils/response');
const { callDeepSeekChat } = require('../../services/ai/chat-service');
const { parseModelJson } = require('../../services/ai/response-parser');
const { VALID_GUIDE_ACTIONS } = require('../../utils/crystal-validate');

function mapAiError(res, err, fallback) {
  const status = err?.status || 502;
  if (status === 400) return badRequest(res, err.message || '请求参数或 AI 配置无效');
  if (status === 429) return error(res, err.message || 'AI 请求过于频繁，请稍后再试', 429);
  return error(res, err?.message || fallback, status >= 400 ? status : 502);
}

function normalizeThinkingQuestion(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('AI 思考题返回数据无效');
  }
  const question = String(raw.question || '').trim().slice(0, 260);
  const answer = String(raw.answer || '').trim().slice(0, 600);
  if (!question) throw new Error('AI 未返回有效思考题题干');
  if (!answer) throw new Error('AI 未返回有效解析结论');

  const hint = String(raw.hint || '').trim().slice(0, 180);
  const rawAction = typeof raw.action === 'string' ? raw.action.trim() : '';
  const action = VALID_GUIDE_ACTIONS.has(rawAction) ? rawAction : null;

  const result = { question, answer, action };
  if (hint) result.hint = hint;
  return result;
}

function buildThinkingSystem(allow3dAction) {
  const actionRule = allow3dAction
    ? `"action": 若该思考题非常适合配合 3D 晶胞演示，可选用以下枚举之一，否则填 null：
"ball-stick" | "space-filling" | "slice" | "explode" | "tile-2" | "tile-3" | "coordination" | "distance" | "reset"`
    : '"action": 固定填 null';

  return `你是「小黄的化学实验室」资深高中化学课堂助教，擅长根据当前展示内容现场出一道有启发性、贴合课标与高考核心素养的随堂思考题。
要求：
1. 紧扣当前展示对象，避免泛泛而谈；必须避开已出现过的题目，换一个新角度设问（如微观结构与宏观性质联系、反常规律、定量均摊/比例、易错辨析等）。
2. 语言精练适合课堂大屏展示。
3. 只输出一个合法 JSON 对象，禁止 Markdown 代码块和多余文字：
{
  "question": "简明启发性思考题（1-2句）",
  "answer": "清晰结论与解析（2-4句）",
  "hint": "简短思路提示（1句）",
  ${actionRule}
}`;
}

router.post('/thinking-question', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const title = String(body.title || '').trim().slice(0, 100);
    if (!title) return badRequest(res, '缺少当前页面主题 title');

    const formula = String(body.formula || '').trim().slice(0, 60);
    const mod = String(body.module || '').trim().slice(0, 40);
    const summary = String(body.summary || '').trim().slice(0, 500);
    const existing = Array.isArray(body.existingQuestions)
      ? body.existingQuestions
          .map((q) => String(q || '').trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, 8)
      : [];

    const allow3dAction = mod === 'library';
    const userLines = [
      `当前主题：${title}${formula ? `（${formula}）` : ''}`,
      mod && `所在模块：${mod}`,
      summary && `当前内容摘要：${summary}`,
      existing.length
        ? `以下思考题已展示过，请勿重复，必须从新角度命制：\n${existing.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
        : '',
      '请生成 1 道全新的高质量高中化学随堂思考题。',
    ]
      .filter(Boolean)
      .join('\n');

    let content;
    try {
      const chat = await callDeepSeekChat({
        system: buildThinkingSystem(allow3dAction),
        user: userLines,
        temperature: 0.7,
        max_tokens: 512,
        kind: 'thinking-question',
      });
      content = chat.content;
    } catch (err) {
      return mapAiError(res, err, 'DeepSeek 思考题生成失败');
    }

    let parsed;
    try {
      parsed = parseModelJson(content);
    } catch {
      return error(res, '模型返回格式异常，请重试', 502);
    }

    let result;
    try {
      result = normalizeThinkingQuestion(parsed);
      if (!allow3dAction) result.action = null;
    } catch (ve) {
      return error(res, ve.message || '生成的思考题内容无效', 502);
    }

    return success(res, result);
  } catch (err) {
    console.error('AI 生成思考题失败:', err);
    return error(res, err.message || 'AI 生成思考题失败', 502);
  }
});

router.normalizeThinkingQuestion = normalizeThinkingQuestion;
router.VALID_ACTIONS = VALID_GUIDE_ACTIONS;

module.exports = router;
