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
  "coordination": { "centerSpecies": "Ti", "neighborSpecies": "O", "number": 6, "label": "体心 Ti⁴⁺ 与 6 个面心 O²⁻ 成正八面体配位（CN = 6）" },
  "shortestDistance": { "formula": "d(Ti–O) = a / 2", "desc": "体心与面心距离为棱长一半", "pair": [[0.5,0.5,0.5],[0.5,0.5,0]], "valuePm": 191 },
  "density": { "Z": 1, "molarMass": 135.94, "formulaText": "ρ = (1 × M) / (Nₐ · a³)" },
  "qa": { "question": "一道贴合高考考点的思考题", "answer": "简明准确的解答" }
}

硬性规则（违反将被后端数学校验拒绝）：
1. 单位换算：1 Å = 100 pm！lattice 的 a/b/c 必须用 pm（150～2500，如 NaCl 填 564、金刚石填 357，绝不能填 5.64 或 3.57）；六方晶系必须 gamma=120、alpha=90、beta=90。
2. 配色遵循教科书 CPK 规范：C=#3f4654, O=#e03e3e, N=#3b6ef5, H=#eef2f6, Cl=#22b573, F=#73c255, S=#e6b800, Si=#7b88a8, Cu=#d97742, Au=#e6b800, Fe=#7d8a99, Na=#8b5cf6(离子)/#c8d0da(金属), Ca=#5bb85d, Ti=#738294, Mg=#8fa3b8, Zn=#7d8a99, B=#e879a0, I=#8b46a8；仅当题目是 A/B/C 或 X/Y/Z 抽象字母题时自选高对比色。
3. 必须采用教科书 [0,0,0] 原点约化基元（禁止使用 Materials Project 偏移原点，如 HCP 禁写 [1/3,2/3,1/4]，金刚石禁写 [1/8,1/8,1/8]）。后端会自动把 0 周期展开到 1。常用标准基元：
   - SC: [0,0,0]；BCC: [0,0,0],[0.5,0.5,0.5]
   - FCC/Cu₃Au: A:[0,0,0], B:[0.5,0.5,0],[0.5,0,0.5],[0,0.5,0.5]
   - NaCl: Cl:[0,0,0]+3面心, Na:[0.5,0,0],[0,0.5,0],[0,0,0.5],[0.5,0.5,0.5]
   - CsCl: Cl:[0,0,0], Cs:[0.5,0.5,0.5]
   - 金刚石/ZnS: A:[0,0,0]+3面心, B:[0.25,0.25,0.25],[0.75,0.75,0.25],[0.75,0.25,0.75],[0.25,0.75,0.75]
   - CaF₂/Li₂O: A:[0,0,0]+3面心, B:全部8个四面体位(±0.25)
   - CaTiO₃: Ca:[0,0,0], Ti:[0.5,0.5,0.5], O:3面心
   - HCP(gamma=120): [0,0,0],[0.6667,0.3333,0.5]
   - 纤锌矿(gamma=120): A:[0,0,0],[0.6667,0.3333,0.5], B:[0,0,0.375],[0.6667,0.3333,0.875]
4. 化学计量自检：按均摊法计算出的各粒子数目之比必须严格等于 formula 的下标比；多原子离子（如 S₂²⁻、CO₃²⁻）不要把同一离子拆裂到不匹配的坐标，且任意两粒子周期最小间距不得小于 100 pm（含 H 不小于 70 pm）。
5. bondCutoff 为最近邻主成键距离的 ~1.12 倍（单位 pm，切勿填成晶胞棱长 a）；coordination 建议提供 centerSpecies 与 neighborSpecies。
6. 若为高考抽象字母题（A/B/C），题未给摩尔质量时可在 formulaText 用 M 表示。只输出 JSON。`;

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

async function generateCrystalWithRetry(prompt, chatFn = callDeepSeekChat) {
  const first = await chatFn({
    system: CRYSTAL_GENERATE_SYSTEM,
    user: `请为以下晶胞需求生成 3D 晶胞 JSON：\n${prompt}`,
    temperature: 0.2,
    max_tokens: 2048,
    kind: 'crystal-generate',
  });
  let firstErr;
  try {
    return validateCrystalPayload(parseModelJson(first.content));
  } catch (e) {
    firstErr = e;
  }

  const prevSnippet = String(first.content || '').trim().slice(0, 1800);
  const repair = await chatFn({
    system: CRYSTAL_GENERATE_SYSTEM,
    user: [
      `原始需求：${prompt}`,
      `上一次输出的 JSON 未通过后端数学校验，报错：${firstErr.message}`,
      `上一次输出：\n${prevSnippet}`,
      '请严格修正上述错误（检查单位 pm、去重基元坐标、碰撞间距、化学计量比与理论密度），重新输出一个完整的合法 JSON。',
    ].join('\n\n'),
    temperature: 0.1,
    max_tokens: 2048,
    kind: 'crystal-generate',
  });

  let parsed;
  try {
    parsed = parseModelJson(repair.content);
  } catch {
    const err = new Error('模型返回不是合法 JSON，请重试');
    err.httpStatus = 502;
    throw err;
  }
  try {
    return validateCrystalPayload(parsed);
  } catch (ve) {
    ve.httpStatus = 400;
    throw ve;
  }
}

router.post('/crystal-generate', async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || '').trim();
    if (!prompt) return badRequest(res, '请输入要生成的晶胞化学式或题目描述');
    if (prompt.length > 500) return badRequest(res, '描述过长，请精简到 500 字以内');

    let crystalSpec;
    try {
      crystalSpec = await generateCrystalWithRetry(prompt);
    } catch (err) {
      if (err?.httpStatus === 400) {
        return badRequest(res, err.message || '生成的晶胞结构不合法，请换常见晶体或补充晶胞参数重试');
      }
      if (err?.httpStatus === 502) {
        return error(res, err.message || '模型返回不是合法 JSON，请重试', 502);
      }
      return mapAiError(res, err, 'DeepSeek 晶胞生成请求失败');
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

router.CRYSTAL_GENERATE_SYSTEM = CRYSTAL_GENERATE_SYSTEM;
router.generateCrystalWithRetry = generateCrystalWithRetry;

module.exports = router;
