/**
 * 晶体探究 · AI 一键排课路由：POST /api/ai/crystal-lesson
 * 根据教师课时主题，从 10 个内置互动舞台中编排 2~6 步教学课例并做严格白名单清洗。
 */

const express = require('express');
const router = express.Router();
const { success, error, badRequest } = require('../../utils/response');
const { callDeepSeekChat } = require('../../services/ai/chat-service');
const { parseModelJson } = require('../../services/ai/response-parser');

const STAGE_SPECS = [
  { id: 'compare-3d', title: '水晶 vs 石英玻璃 · 真3D光学', cat: '认识晶体', focus: '晶体与非晶体宏观外形及微观Si-O有序/无序网络' },
  { id: 'selfform', title: '食盐自范性与修角', cat: '认识晶体', focus: '晶体自发呈现规则几何多面体外形' },
  { id: 'melting-curve', title: '固定熔点对比', cat: '认识晶体', focus: '晶体恒温熔化平台与非晶体持续升温曲线' },
  { id: 'anisotropy', title: '云母 vs 玻璃各向异性', cat: '认识晶体', focus: '晶体不同方向物理性质差异与非晶体各向同性' },
  { id: 'xray', title: 'X 射线衍射', cat: '认识晶体', focus: '区分晶体与非晶体的最可靠科学方法' },
  { id: 'unitcell-3d', title: '铜晶胞提取与并置', cat: '认识晶体', focus: '晶胞最小重复单元提取与无隙并置' },
  { id: 'hammer-3d', title: 'Cu vs NaCl 真3D受力冲击', cat: '晶体性质', focus: '金属延展滑移不断裂 vs 离子晶体同号相斥脆裂' },
  { id: 'conduct', title: '食盐三态导电', cat: '晶体性质', focus: '离子晶体固态不导电、熔融与水溶液导电' },
  { id: 'ice-3d', title: '冰浮水上 · 真3D氢键笼', cat: '晶体性质', focus: '氢键方向性形成空旷六边形笼，熔化坍塌密度变大' },
  { id: 'melt-race', title: '16 晶体热成像熔化大比拼', cat: '晶体性质', focus: '共价/离子/金属/分子四大晶体熔点跨越与作用力' },
];

const STAGE_MAP = new Map(STAGE_SPECS.map((s) => [s.id, s]));
const VALID_STAGE_IDS = new Set(STAGE_SPECS.map((s) => s.id));
const FALLBACK_ORDER = ['compare-3d', 'hammer-3d', 'melt-race', 'melting-curve', 'unitcell-3d', 'conduct'];

function clampCount(val, fallback = 4) {
  const n = Number(val);
  return Number.isFinite(n) ? Math.min(6, Math.max(2, Math.round(n))) : fallback;
}

function mapAiError(res, err, fallback) {
  const status = err?.status || 502;
  if (status === 400) return badRequest(res, err.message || '请求参数或 AI 配置无效');
  if (status === 429) return error(res, err.message || 'AI 请求过于频繁，请稍后再试', 429);
  return error(res, err?.message || fallback, status >= 400 ? status : 502);
}

function normalizeQa(rawQa) {
  if (!rawQa || typeof rawQa !== 'object') return null;
  const question = String(rawQa.question || '').trim().slice(0, 180);
  const answer = String(rawQa.answer || '').trim().slice(0, 360);
  return question && answer ? { question, answer } : null;
}

function makeFallbackStep(stageId) {
  const spec = STAGE_MAP.get(stageId) || STAGE_SPECS[0];
  return {
    stageId: spec.id,
    title: spec.title,
    teacherNote: `引导学生观察「${spec.title}」核心现象：${spec.focus}，操作后归纳微观结论。`,
    qa: null,
  };
}

function normalizeCrystalLesson(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('AI 课例返回数据无效');
  const targetCount = clampCount(opts.targetCount, 4);
  const fallbackTopic = String(opts.fallbackTopic || '').trim().slice(0, 48);
  const title = String(raw.title || '').trim().slice(0, 60) || (fallbackTopic ? `AI 课例 · ${fallbackTopic}` : 'AI 晶体探究课例');
  const summary = String(raw.summary || '').trim().slice(0, 160);

  const seen = new Set();
  const steps = [];
  for (const item of (Array.isArray(raw.steps) ? raw.steps : [])) {
    if (steps.length >= 6) break;
    if (!item || typeof item !== 'object') continue;
    const stageId = String(item.stageId || '').trim();
    if (!VALID_STAGE_IDS.has(stageId) || seen.has(stageId)) continue;
    seen.add(stageId);
    const spec = STAGE_MAP.get(stageId);
    const stepTitle = String(item.title || '').trim().slice(0, 48) || spec.title;
    const teacherNote = String(item.teacherNote || '').trim().slice(0, 240)
      || `演示「${spec.title}」，停顿引导学生结合${spec.focus}回答问题。`;
    steps.push({ stageId, title: stepTitle, teacherNote, qa: normalizeQa(item.qa) });
  }

  let usedFallback = false;
  if (steps.length < 2) {
    usedFallback = true;
    const desired = Math.max(2, Math.min(targetCount, 4));
    for (const id of FALLBACK_ORDER) {
      if (steps.length >= desired) break;
      if (seen.has(id)) continue;
      seen.add(id);
      steps.push(makeFallbackStep(id));
    }
  }
  return { title, summary, steps, usedFallback };
}

function buildSystemPrompt(stepCount) {
  const list = STAGE_SPECS.map((s) => `- ${s.id}（${s.cat}｜${s.title}）：${s.focus}`).join('\n');
  return `你是「小黄的化学实验室」高中化学教研员，请从以下 10 个内置互动舞台中选择 stageId（严禁编造或重复）编排 ${stepCount} 步课例：
${list}
要求：只输出合法 JSON 对象（禁止 Markdown 代码块）：
{"title":"课例标题","summary":"一句话目标","steps":[{"stageId":"10个ID之一","title":"环节标题","teacherNote":"讲授提词与停顿提问建议","qa":{"question":"思考题","answer":"简明解析"}}]}`;
}

router.post('/crystal-lesson', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const topic = String(body.topic || '').trim().slice(0, 160);
    if (!topic) return badRequest(res, '请填写本节课的主题或教学重点');

    const stepCount = clampCount(body.stepCount, 4);
    let content;
    try {
      const chat = await callDeepSeekChat({
        system: buildSystemPrompt(stepCount),
        user: `请围绕以下主题编排 ${stepCount} 步晶体探究课例：\n${topic}`,
        temperature: 0.55,
        max_tokens: 1400,
        kind: 'crystal-lesson',
      });
      content = chat.content;
    } catch (err) {
      return mapAiError(res, err, 'DeepSeek 一键排课失败');
    }

    let parsed;
    try {
      parsed = parseModelJson(content);
    } catch {
      return error(res, '模型返回课例格式异常，请重试', 502);
    }

    try {
      return success(res, normalizeCrystalLesson(parsed, { fallbackTopic: topic, targetCount: stepCount }));
    } catch (ve) {
      return error(res, ve.message || '生成的课例内容无效', 502);
    }
  } catch (err) {
    console.error('AI 晶体排课失败:', err);
    return error(res, err.message || 'AI 晶体排课失败', 502);
  }
});

router.normalizeCrystalLesson = normalizeCrystalLesson;
router.VALID_STAGE_IDS = VALID_STAGE_IDS;
router.STAGE_SPECS = STAGE_SPECS;

module.exports = router;
