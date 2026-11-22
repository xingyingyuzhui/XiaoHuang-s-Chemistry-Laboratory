/**
 * AI 晶胞生成 & AI 3D 晶体助教路由
 * - POST /api/ai/crystal-generate
 * - POST /api/ai/crystal-guide
 */

const express = require('express');
const router = express.Router();
const { success, error, badRequest } = require('../../utils/response');
const { callDeepSeekChat } = require('../../services/ai/chat-service');
const { parseModelJson } = require('../../services/ai/response-parser');
const {
  validateCrystalPayload,
  normalizeCrystalGuide,
} = require('../../utils/crystal-validate');

const VALID_MODULES = new Set(['basics', 'library', 'properties']);

function mapAiError(res, err, fallback) {
  const status = err?.status || 502;
  if (status === 400) return badRequest(res, err.message || '请求参数或 AI 配置无效');
  if (status === 429) return error(res, err.message || 'AI 请求过于频繁，请稍后再试', 429);
  return error(res, err?.message || fallback, status >= 400 ? status : 502);
}

const CRYSTAL_GENERATE_SYSTEM = `你是高中及大学入门无机/合金晶体结构专家，负责根据用户的化学式（如 CaTiO3、Cu3Au、AlN、FeS2、Li2O）或高考晶胞文字题（如“某立方晶胞顶点为A、面心为B、体心为C，棱长420pm”），生成准确的 3D 晶胞结构 JSON。
你必须只输出一个合法 JSON 对象，禁止 Markdown 代码块和任何多余文字。

JSON 字段：
{
  "name": "中文晶体名",
  "formula": "化学式（可用 Unicode 下标如 CaTiO₃）",
  "category": "metallic|ionic|covalent|molecular|mixed",
  "subtitle": "结构类型短语（如 钙钛矿型 · 立方晶胞）",
  "system": "cubic|tetragonal|orthorhombic|hexagonal",
  "lattice": { "a": 382, "b": 382, "c": 382, "alpha": 90, "beta": 90, "gamma": 90 },
  "species": [
    { "id": "Ca", "symbol": "Ca²⁺", "color": "#5bb85d", "ballRadius": 0.24, "spaceRadius": 0.72, "molarMass": 40.08 }
  ],
  "basisAtoms": [
    { "species": "Ca", "u": 0, "v": 0, "w": 0 }
  ],
  "bondCutoff": 210,
  "bondRule": "any|hetero|homo",
  "coordination": { "label": "体心 Ti⁴⁺ 与 6 个面心 O²⁻ 成正八面体配位（CN = 6）", "number": 6, "neighborSpecies": "O" },
  "shortestDistance": { "formula": "d(Ti–O) = a / 2", "desc": "体心与面心距离为棱长一半", "pair": [[0.5,0.5,0.5],[0.5,0.5,0]], "valuePm": 191 },
  "density": { "Z": 1, "molarMass": 135.98, "formulaText": "ρ = (1 × M) / (Nₐ · a³)" },
  "qa": { "question": "一道贴合高考考点的思考题", "answer": "简明准确的解答" }
}

硬性规则：
1. lattice 的 a, b, c 单位为 pm（150～2500）；六方晶系必须设 gamma=120、alpha=90、beta=90。
2. species 1～5 种，color 用辨识度高的十六进制色（如 #3b82f6、#e03e3e、#22b573、#e6b800）。
3. basisAtoms 1～24 个，分数坐标 u, v, w 落在 [0, 1) 内，**只需写约化基元**，后端会自动按周期边界把 0 展开到 1（如顶点只写 [0,0,0]，3 个独立面心写 [0.5,0.5,0],[0.5,0,0.5],[0,0.5,0.5]，3 个独立棱心写 [0.5,0,0],[0,0.5,0],[0,0,0.5]，体心写 [0.5,0.5,0.5]，六方 HCP 写 [0,0,0] 与 [0.6667,0.3333,0.5]）。
4. 若为高考抽象字母题（A/B/C），如题未给具体摩尔质量，density.molarMass 可填合理参考值或在 formulaText 用 M 表示。
5. 只输出 JSON。`;

function buildGuideSystem(mod) {
  const actionHint = mod === 'library'
    ? `当前位于「3D 晶胞结构库」模块，请像老师拿教鞭指着 3D 晶胞讲解一样，给出 2～4 个可联动 3D 视图的步骤。每个步骤的 action 必须从以下枚举中挑选最贴合该步操作的一个（若无对应动作再填 null）：
- "ball-stick"：切到球棍模型（看成键与骨架）
- "space-filling"：切到空间填充模型（看原子相切与空间利用率）
- "slice"：切开晶胞数原子（演示均摊法 1/8、1/4、1/2、1）
- "explode"：展开/分离视图观察内部粒子
- "tile-2"：拼接 2 个晶胞（看共享面/共享棱/相邻粒子）
- "tile-3"：拼接 3 个晶胞（尤其适合六方晶胞拼出正六棱柱）
- "coordination"：高亮最近邻配位数
- "distance"：显示最短距离测量线与棱长公式
- "reset"：复位 3D 晶胞默认视角`
    : `当前位于「${mod === 'basics' ? '晶体基础与晶胞概念' : '晶体类型与性质对比'}」互动实验模块，请给出 2～4 个清晰的思路步骤，步骤中的 action 填 null。`;

  return `你是「小黄的化学实验室」3D 晶体互动助教。拒绝大段堆砌文字，要求结论精准、分步清晰、贴合高中选修二《物质结构与性质》与高考考点。
${actionHint}

只输出一个 JSON 对象，禁止 Markdown 代码块：
{
  "answer": "简明核心结论（2～3 句，直击考点）",
  "steps": [
    { "title": "步骤标题（≤16字）", "detail": "具体讲解（1～2 句）", "action": "有效动作枚举或 null" }
  ]
}`;
}

router.post('/crystal-generate', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return badRequest(res, '请输入要生成的晶胞化学式或题目描述');
    if (prompt.length > 500) return badRequest(res, '描述过长，请精简到 500 字以内');

    let content;
    try {
      const chat = await callDeepSeekChat({
        system: CRYSTAL_GENERATE_SYSTEM,
        user: `请为以下晶胞需求生成 3D 晶胞 JSON：\n${prompt}`,
        temperature: 0.2,
        max_tokens: 2048,
        kind: 'crystal-generate',
      });
      content = chat.content;
    } catch (err) {
      return mapAiError(res, err, 'DeepSeek 晶胞生成请求失败');
    }

    let parsed;
    try {
      parsed = parseModelJson(content);
    } catch {
      return error(res, '模型返回不是合法 JSON，请重试', 502);
    }

    let crystalSpec;
    try {
      crystalSpec = validateCrystalPayload(parsed);
    } catch (ve) {
      return badRequest(res, ve.message || '生成的晶胞结构不合法，请换常见晶体或补充晶胞参数重试');
    }

    return success(res, crystalSpec, '生成成功');
  } catch (err) {
    console.error('AI 生成晶胞失败:', err);
    return error(res, err.message || 'AI 生成晶胞失败');
  }
});

router.post('/crystal-guide', async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const question = String(body.question || '').trim();
    if (!question) return badRequest(res, '请输入想向 AI 助教提问的问题');
    if (question.length > 400) return badRequest(res, '问题过长，请精简到 400 字以内');

    const title = String(body.title || '晶胞结构').trim().slice(0, 60);
    const formula = String(body.formula || '').trim().slice(0, 40);
    const summary = String(body.summary || '').trim().slice(0, 400);
    const rawMod = String(body.module || 'library').trim().toLowerCase();
    const mod = VALID_MODULES.has(rawMod) ? rawMod : 'library';

    const ctxLines = [
      `当前模块：${mod}`,
      `当前对象：${title}${formula ? `（${formula}）` : ''}`,
      summary && `当前结构摘要：${summary}`,
      `学生/老师提问：${question}`,
    ].filter(Boolean).join('\n');

    let content;
    try {
      const chat = await callDeepSeekChat({
        system: buildGuideSystem(mod),
        user: ctxLines,
        temperature: 0.35,
        max_tokens: 1024,
        kind: 'crystal-guide',
      });
      content = chat.content;
    } catch (err) {
      return mapAiError(res, err, 'DeepSeek 助教请求失败');
    }

    let parsed;
    try {
      parsed = parseModelJson(content);
    } catch {
      return error(res, '助教返回格式异常，请重试', 502);
    }

    let guide;
    try {
      guide = normalizeCrystalGuide(parsed);
    } catch (ve) {
      return error(res, ve.message || '助教返回内容无效', 502);
    }

    return success(res, guide);
  } catch (err) {
    console.error('AI 晶体助教失败:', err);
    return error(res, err.message || 'AI 晶体助教请求失败');
  }
});

module.exports = router;
