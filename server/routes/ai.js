const express = require('express');
const router = express.Router();
const { queryOne } = require('../db/sqlite');
const { success, error, badRequest } = require('../utils/response');

// DeepSeek 模型白名单
const ALLOWED_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'];
const DEFAULT_MODEL = 'deepseek-v4-flash';
const DEFAULT_API_BASE = 'https://api.deepseek.com';

/**
 * 修复常见的 JSON 格式问题
 */
/** 仅做保守修复，避免全局替换破坏合法 JSON */
function fixJson(str) {
  let fixed = String(str || '').trim();
  // 去掉 Markdown 残留
  fixed = fixed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  // 移除对象/数组尾部多余逗号
  fixed = fixed.replace(/,\s*([\]}])/g, '$1');
  return fixed;
}

/**
 * POST /api/ai/generate
 * 代理 DeepSeek API 调用生成分子
 */
router.post('/generate', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return badRequest(res, '请输入要生成的分子描述');
    }

    // 从数据库读取 AI 设置
    const settingsRow = queryOne("SELECT value FROM settings WHERE key = 'ai'");
    let aiSettings = {};

    if (settingsRow) {
      try {
        aiSettings = JSON.parse(settingsRow.value);
      } catch (e) {
        console.warn('解析 AI 设置失败:', e);
      }
    }

    const apiKey = aiSettings.apiKey;
    if (!apiKey) {
      return badRequest(res, '请先在设置 → AI 中填写 DeepSeek API Key');
    }

    let apiBase = (aiSettings.apiBase || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
    if (!apiBase) apiBase = DEFAULT_API_BASE;

    let model = (aiSettings.model || DEFAULT_MODEL).trim();
    if (!ALLOWED_MODELS.includes(model)) {
      model = DEFAULT_MODEL;
    }

    // System Prompt
    const systemPrompt = `你是高中化学教学助手，负责生成可用于 3D 球棍模型展示的分子结构数据。
用户会用中文描述分子名称、化学式或用途。你必须只输出一个 JSON 对象，不要 Markdown 代码块，不要其它说明文字。

JSON 字段：
{
  "name": "中文名",
  "formula": "化学式（可用 unicode 下标如 H₂O，也可用 H2O）",
  "desc": "一两句中文教学说明",
  "atoms": [ { "el": "元素符号", "x": 数字, "y": 数字, "z": 数字 } ],
  "bonds": [ [原子索引i, 原子索引j], ... ],
  "physics": {
    "state": "常温状态（固态/液态/气态）",
    "density": "密度（如 1 g/cm³）",
    "meltingPoint": "熔点（如 0°C）",
    "boilingPoint": "沸点（如 100°C）"
  },
  "chemistry": {
    "acidity": "酸碱性（如 酸性/碱性/中性）",
    "solubility": "溶解性（如 易溶/微溶/难溶）",
    "reactivity": "化学活性（如 稳定/活泼/强氧化性）"
  }
}

规则：
1. el 必须是合法元素符号（H, C, O, N, Cl, S, P, Na, Fe 等），首字母大写。
2. 坐标为埃(Å)量级示意坐标，分子大致居中，键长合理（约 0.9–2.0）。
3. bonds 中的索引从 0 开始，且必须落在 atoms 范围内；多重键可重复写多次 [i,j]。
4. 原子数控制在 2–24 个，适合课堂展示。
5. 若用户描述无法对应真实分子，选最接近的常见高中分子，desc 中说明。
6. physics 和 chemistry 字段必须提供，使用简洁的中文描述。
7. 只输出 JSON。`;

    // 调用 DeepSeek API
    const url = `${apiBase}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `请为以下描述生成分子 JSON：\n${prompt.trim()}` }
        ],
        temperature: 0.3,
        max_tokens: 4096,
        // 禁用思考模式，直接返回结果
        thinking: { type: 'disabled' }
      })
    });

    if (!response.ok) {
      let detail = '';
      try {
        const errBody = await response.json();
        detail = errBody?.error?.message || JSON.stringify(errBody);
      } catch {
        detail = await response.text();
      }
      return error(res, `DeepSeek 请求失败（${response.status}）：${detail || response.statusText}`, 502);
    }

    const body = await response.json();
    console.log('DeepSeek API 响应:', JSON.stringify(body).substring(0, 500));
    // 优先从 content 获取，如果为空则从 reasoning_content 获取
    const content = body?.choices?.[0]?.message?.content || 
                    body?.choices?.[0]?.message?.reasoning_content || '';
    console.log('提取的内容:', content.substring(0, 200));

    // 提取 JSON
    let parsed;
    console.log('DeepSeek 返回内容:', content.substring(0, 500));
    try {
      // 尝试直接解析
      parsed = JSON.parse(content.trim());
    } catch (e1) {
      console.log('直接解析失败:', e1.message);
      // 去除 Markdown 代码块
      let s = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      try {
        parsed = JSON.parse(s);
      } catch (e2) {
        console.log('去除代码块后解析失败:', e2.message);
        // 截取第一个 { 到最后一个 }
        const a = s.indexOf('{');
        const b = s.lastIndexOf('}');
        if (a >= 0 && b > a) {
          let jsonStr = s.slice(a, b + 1);
          console.log('截取的 JSON:', jsonStr.substring(0, 200));
          // 修复常见的 JSON 问题
          jsonStr = fixJson(jsonStr);
          console.log('修复后的 JSON:', jsonStr.substring(0, 200));
          parsed = JSON.parse(jsonStr);
        } else {
          return error(res, '模型返回不是合法 JSON', 502);
        }
      }
    }

    // 验证并规范化数据
    const validated = validateMoleculePayload(parsed);

    success(res, validated);
  } catch (err) {
    console.error('AI 生成分子失败:', err);
    error(res, err.message || 'AI 生成失败');
  }
});

/**
 * 读取 AI 设置并调用 DeepSeek Chat Completions
 * @returns {Promise<{ content: string, model: string }>}
 */
async function callDeepSeekChat({ system, user, temperature = 0.8, max_tokens = 256 }) {
  const settingsRow = queryOne("SELECT value FROM settings WHERE key = 'ai'");
  let aiSettings = {};
  if (settingsRow) {
    try {
      aiSettings = JSON.parse(settingsRow.value);
    } catch (e) {
      console.warn('解析 AI 设置失败:', e);
    }
  }

  const apiKey = aiSettings.apiKey;
  if (!apiKey) {
    const err = new Error('请先在设置 → AI 中填写 DeepSeek API Key');
    err.status = 400;
    throw err;
  }

  let apiBase = (aiSettings.apiBase || DEFAULT_API_BASE).trim().replace(/\/+$/, '');
  if (!apiBase) apiBase = DEFAULT_API_BASE;

  let model = (aiSettings.model || DEFAULT_MODEL).trim();
  if (!ALLOWED_MODELS.includes(model)) {
    model = DEFAULT_MODEL;
  }

  const url = `${apiBase}/chat/completions`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature,
      max_tokens,
      thinking: { type: 'disabled' },
    }),
  });

  if (!response.ok) {
    let detail = '';
    try {
      const errBody = await response.json();
      detail = errBody?.error?.message || JSON.stringify(errBody);
    } catch {
      detail = await response.text();
    }
    const err = new Error(
      `DeepSeek 请求失败（${response.status}）：${detail || response.statusText}`,
    );
    err.status = 502;
    throw err;
  }

  const body = await response.json();
  const content =
    body?.choices?.[0]?.message?.content ||
    body?.choices?.[0]?.message?.reasoning_content ||
    '';
  return { content: String(content).trim(), model };
}

/**
 * POST /api/ai/tip
 * 高中化学小知识：1h 内最多 20 次调模型；超额或失败走本地库。
 * 成功调模型后写入本地库（去重积累）。不向前端暴露剩余次数。
 */
router.post('/tip', async (req, res) => {
  const {
    ensureTablesAndSeed,
    canCallModel,
    recordAiCall,
    normalizeTip,
    saveAiTip,
    pickLocalTip,
  } = require('../utils/chem-tips');

  try {
    ensureTablesAndSeed();

    // 超限：静默走本地，不报错、不返回剩余次数
    if (!canCallModel()) {
      return success(res, { tip: pickLocalTip(), source: 'local' });
    }

    const system = `你是一位亲切的高中化学老师，正在课间随口跟同学分享化学小知识。
要求：
1. 只输出 1～2 句中文，总共不超过 60 个汉字（可略超但尽量短）
2. 内容要真实、有趣，最好联系日常生活或生活常识
3. 不要标题、不要列表、不要 emoji、不要引号包裹全文
4. 不要提问、不要让同学回答
5. 每次换不同的知识点，语气自然像老师说话`;

    const user =
      '请随机分享一条高中化学小知识（可涉及生活中的化学现象）。只输出那一两句话。';

    try {
      const { content } = await callDeepSeekChat({
        system,
        user,
        temperature: 0.95,
        max_tokens: 120,
      });

      let tip = normalizeTip(content);
      if (!tip) {
        // 模型废话：不记调用次数，直接本地
        return success(res, { tip: pickLocalTip(), source: 'local' });
      }

      // 仅成功产出有效 tip 时计次 + 入库
      recordAiCall();
      const saved = saveAiTip(tip);
      tip = saved || tip;

      return success(res, { tip, source: 'ai' });
    } catch (aiErr) {
      console.warn('AI 小知识调模型失败，回落本地:', aiErr.message || aiErr);
      // 失败不计次，本地兜底，接口仍 200
      return success(res, { tip: pickLocalTip(), source: 'local' });
    }
  } catch (err) {
    console.error('AI 小知识失败:', err);
    try {
      const { pickLocalTip: pick } = require('../utils/chem-tips');
      return success(res, { tip: pick(), source: 'local' });
    } catch {
      error(res, err.message || 'AI 生成失败');
    }
  }
});

/**
 * 从模型文本中解析 JSON
 */
function parseModelJson(content) {
  let s = String(content || '').trim();
  try {
    return JSON.parse(s);
  } catch {
    /* continue */
  }
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(s);
  } catch {
    /* continue */
  }
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) {
    let jsonStr = s.slice(a, b + 1);
    jsonStr = fixJson(jsonStr);
    return JSON.parse(jsonStr);
  }
  const c = s.indexOf('[');
  const d = s.lastIndexOf(']');
  if (c >= 0 && d > c) {
    return JSON.parse(s.slice(c, d + 1));
  }
  throw new Error('模型返回不是合法 JSON');
}

function normalizeQuizQuestions(raw, expectCount) {
  let list = raw;
  if (raw && Array.isArray(raw.questions)) list = raw.questions;
  if (!Array.isArray(list)) throw new Error('题目列表无效');

  const out = [];
  for (let i = 0; i < list.length; i++) {
    const q = list[i] || {};
    const stem = String(q.stem || q.question || '').trim();
    let options = q.options;
    if (!Array.isArray(options)) options = [q.A, q.B, q.C, q.D].filter((x) => x != null);
    options = options.map((o) => String(o ?? '').trim()).filter(Boolean);
    if (options.length > 4) options = options.slice(0, 4);
    while (options.length < 4) options.push(`选项${options.length + 1}`);

    let answer = q.answer;
    if (typeof answer === 'string') {
      const m = answer.trim().toUpperCase().match(/^[A-D]/);
      if (m) answer = m[0].charCodeAt(0) - 65;
      else answer = Number(answer);
    }
    answer = Number(answer);
    // 非法答案：丢弃该题，不用默认 0 伪装成 A
    if (!Number.isInteger(answer) || answer < 0 || answer > 3) continue;
    if (options.length < 4) continue;

    if (!stem) continue;
    out.push({
      id: String(q.id || `q${i + 1}`),
      stem,
      options,
      answer,
      knowledge: String(q.knowledge || q.topic || '').trim(),
      hint: String(q.hint || '').trim(),
      explain: String(q.explain || q.explanation || '').trim(),
    });
  }

  if (!out.length) throw new Error('未生成有效题目');
  if (expectCount > 0 && out.length > expectCount) return out.slice(0, expectCount);
  return out;
}

/**
 * POST /api/ai/quiz/generate
 * 智能出题：单选四选一
 */
router.post('/quiz/generate', async (req, res) => {
  try {
    const {
      grades = [],
      difficulty = 'medium',
      topics = [],
      count = 5,
    } = req.body || {};

    const n = Math.min(10, Math.max(1, parseInt(count, 10) || 5));
    const gradeLabels = Array.isArray(grades)
      ? grades.map((g) => String(g)).filter(Boolean)
      : [];
    const topicLabels = Array.isArray(topics)
      ? topics.map((t) => String(t)).filter(Boolean)
      : [];

    const diffMap = {
      basic: '初级：基础概念与生活常识，题干简短，少计算',
      medium: '中级：高中课本对应知识点的课后练习水平，可有简单计算或判断',
      hard: '高级：高考常见设问方式与综合应用，可多知识点结合（勿声称摘自某年真题原文）',
    };
    const diffText = diffMap[difficulty] || diffMap.medium;

    const system = `你是高中化学命题老师。只输出一个 JSON 对象，不要 Markdown，不要其它说明。
格式：
{
  "questions": [
    {
      "id": "q1",
      "stem": "题干",
      "options": ["选项A", "选项B", "选项C", "选项D"],
      "answer": 0,
      "knowledge": "知识点",
      "hint": "不透露答案的提示（一句）",
      "explain": "完整解析，说明正确项并简述错项误区"
    }
  ]
}
硬性要求：
1. 仅单选题，options 必须恰好 4 项；answer 为 0～3 的整数下标
2. 干扰项要有迷惑性，对应学生常见错误
3. 中文命题，科学准确
4. 题目数量必须为 ${n} 道`;

    const user = `请出 ${n} 道化学单选题。
年级范围：${gradeLabels.length ? gradeLabels.join('、') : '高中不限'}
难度：${diffText}
章节/主题：${topicLabels.length ? topicLabels.join('、') : '从上述年级常见章节中合理选取'}
请覆盖所选主题，难度符合要求。`;

    const { content } = await callDeepSeekChat({
      system,
      user,
      temperature: 0.55,
      max_tokens: 4096,
    });

    const parsed = parseModelJson(content);
    const questions = normalizeQuizQuestions(parsed, n);
    success(res, { questions, meta: { count: questions.length, difficulty, grades: gradeLabels, topics: topicLabels } });
  } catch (err) {
    console.error('智能出题失败:', err);
    const status = err.status || 500;
    if (status === 400) return badRequest(res, err.message);
    error(res, err.message || '出题失败', status >= 400 ? status : 502);
  }
});

/**
 * POST /api/ai/quiz/hint
 * 单题提示（气泡用）；1h 内最多 10 次成功调模型
 */
router.post('/quiz/hint', async (req, res) => {
  const { reserveCall, releaseCall } = require('../utils/quiz-assist-limit');
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

    const system = `你是高中化学老师。学生卡关了，只给提示、不给最终答案、不指出正确选项字母。
只输出 1～3 句中文提示，不要标题、不要列表编号。`;

    const opts = Array.isArray(options)
      ? options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
      : '';
    const user = `题干：${stem}
选项：
${opts}
知识点：${knowledge || '未标注'}
请给提示。`;

    const { content } = await callDeepSeekChat({
      system,
      user,
      temperature: 0.5,
      max_tokens: 300,
    });

    let text = String(content || '').trim().replace(/^["'「]|["'」]$/g, '');
    if (!text) text = '先标出题干里的已知量与所求，再联系相关概念或守恒关系试一试。';
    success(res, { text });
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
 * 单题解答；1h 内最多 10 次成功调模型（与提示分开计数）
 */
router.post('/quiz/explain', async (req, res) => {
  const { reserveCall, releaseCall } = require('../utils/quiz-assist-limit');
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

    const system = `你是高中化学老师，讲解单选题。
要求：先给出正确选项（如 B），再分步说明理由，最后一句点出其它选项常见误区。
用简洁中文，控制在 120～220 字。不要 Markdown 标题。`;

    const opts = Array.isArray(options)
      ? options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
      : '';
    const ans =
      typeof answer === 'number' && answer >= 0 && answer <= 3
        ? String.fromCharCode(65 + answer)
        : '?';
    const user = `题干：${stem}
选项：
${opts}
正确答案：${ans}
知识点：${knowledge || '未标注'}
参考解析：${explain || '无'}
请给出讲解。`;

    const { content } = await callDeepSeekChat({
      system,
      user,
      temperature: 0.35,
      max_tokens: 500,
    });

    let text = String(content || '').trim();
    if (!text && explain) text = String(explain);
    if (!text) {
      text = `正确答案是 ${ans}。请结合课本中「${knowledge || '相关知识点'}」再梳理一遍推理过程。`;
    }
    success(res, { text });
  } catch (err) {
    releaseCall(reservationId);
    console.error('题目解答失败:', err);
    // 非限流错误：可回落本地解析（占位已释放，不计成功调用）
    const { explain, answer } = req.body || {};
    if (explain) {
      const ans =
        typeof answer === 'number' && answer >= 0 && answer <= 3
          ? String.fromCharCode(65 + answer)
          : '';
      return success(res, {
        text: `${ans ? `正确答案 ${ans}。` : ''}${explain}`,
        fromCache: true,
      });
    }
    const status = err.status || 500;
    if (status === 400) return badRequest(res, err.message);
    error(res, err.message || '解答失败', status >= 400 ? status : 502);
  }
});

const SCORE_CACHE_KEY = 'quiz_ai_score';

/**
 * 根据库内练习/错题数据生成指纹；数据不变则不应重新调模型
 */
function buildQuizScoreFingerprint() {
  const { query: q, queryOne: q1, run: r } = require('../db/sqlite');
  try {
    r(`CREATE TABLE IF NOT EXISTS quiz_sessions (
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
    r(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
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
  } catch {
    /* ignore */
  }

  const agg = q1(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(total), 0) AS tq,
            COALESCE(SUM(correct), 0) AS tc,
            COALESCE(MAX(created_at), 0) AS last_at
     FROM quiz_sessions`,
  );
  const wrongOpen = q1(
    `SELECT COUNT(*) AS c, COALESCE(MAX(created_at), 0) AS last_at
     FROM quiz_wrong_book WHERE dismissed = 0`,
  );
  const wrongDismissed = q1(
    `SELECT COUNT(*) AS c FROM quiz_wrong_book WHERE dismissed = 1`,
  );
  // 近 5 场明细也进指纹，避免「总数相同但场次不同」漏更新
  const recent = q(
    `SELECT id, total, correct, difficulty FROM quiz_sessions
     ORDER BY created_at DESC LIMIT 5`,
  );
  const recentSig = recent
    .map((s) => `${s.id}:${s.correct}/${s.total}:${s.difficulty || ''}`)
    .join(',');

  return [
    Number(agg?.n || 0),
    Number(agg?.tq || 0),
    Number(agg?.tc || 0),
    Number(agg?.last_at || 0),
    Number(wrongOpen?.c || 0),
    Number(wrongOpen?.last_at || 0),
    Number(wrongDismissed?.c || 0),
    recentSig,
  ].join('|');
}

function readScoreCache() {
  const row = queryOne(`SELECT value FROM settings WHERE key = ?`, [SCORE_CACHE_KEY]);
  if (!row?.value) return null;
  try {
    return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  } catch {
    return null;
  }
}

function writeScoreCache(payload) {
  const { run: r } = require('../db/sqlite');
  r(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [
    SCORE_CACHE_KEY,
    JSON.stringify(payload),
  ]);
}

function collectScoreStats() {
  const { query: q, queryOne: q1 } = require('../db/sqlite');
  const sessions = q(
    `SELECT id, created_at, difficulty, total, correct
     FROM quiz_sessions ORDER BY created_at DESC LIMIT 50`,
  );
  const totalSessions = sessions.length;
  let totalQuestions = 0;
  let totalCorrect = 0;
  for (const s of sessions) {
    totalQuestions += Number(s.total) || 0;
    totalCorrect += Number(s.correct) || 0;
  }
  const wrongBookCount = Number(
    q1(`SELECT COUNT(*) AS c FROM quiz_wrong_book WHERE dismissed = 0`)?.c || 0,
  );
  const wrongRows = q(
    `SELECT knowledge FROM quiz_wrong_book WHERE dismissed = 0 AND knowledge != ''`,
  );
  const wrongKnowledge = {};
  for (const row of wrongRows) {
    const k = row.knowledge || '未标注';
    wrongKnowledge[k] = (wrongKnowledge[k] || 0) + 1;
  }
  const weakKnowledge = Object.entries(wrongKnowledge)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }));
  const recent = sessions.slice(0, 5).map((s) => ({
    id: s.id,
    difficulty: s.difficulty,
    total: s.total,
    correct: s.correct,
    rate: s.total ? Math.round((s.correct / s.total) * 100) : 0,
  }));
  const accuracy = totalQuestions
    ? Math.round((totalCorrect / totalQuestions) * 100)
    : 0;
  return {
    totalSessions,
    totalQuestions,
    totalCorrect,
    accuracy,
    wrongBookCount,
    weakKnowledge,
    recent,
  };
}

/**
 * POST /api/ai/quiz/score
 * 0～10 AI 评分；练习/错题数据指纹未变时直接返回缓存，不重复调模型
 */
router.post('/quiz/score', async (req, res) => {
  try {
    const fingerprint = buildQuizScoreFingerprint();
    const cached = readScoreCache();
    if (
      cached &&
      cached.fingerprint === fingerprint &&
      cached.score !== undefined &&
      cached.score !== null
    ) {
      return success(res, {
        score: cached.score,
        comment: cached.comment || '',
        cached: true,
      });
    }

    const stats = collectScoreStats();
    const {
      totalSessions,
      totalQuestions,
      totalCorrect,
      accuracy,
      wrongBookCount,
      weakKnowledge,
      recent,
    } = stats;

    if (!totalSessions || !totalQuestions) {
      const empty = {
        score: 0,
        comment: '尚无练习记录，完成几套题后再来看 AI 评分。',
        fingerprint,
        cached: false,
      };
      writeScoreCache({
        fingerprint,
        score: empty.score,
        comment: empty.comment,
        updatedAt: Date.now(),
      });
      return success(res, empty);
    }

    const recentLine = recent
      .map((r) => `${r.difficulty || ''} ${r.correct}/${r.total}（${r.rate}%）`)
      .join('；');
    const weakLine = weakKnowledge.map((w) => `${w.name}×${w.count}`).join('、');

    const system = `你是高中化学学习顾问。根据学生练习数据给出 0～10 的综合评分（一位小数，如 7.5）。
只输出 JSON，不要 Markdown：
{"score": 数字, "comment": "一两句中文评语"}
评分参考：
- 正确率权重最高
- 场次过少（样本不足）略降分
- 错题本未消除较多说明薄弱点待消化
- 近期正确率可微调
comment 具体、鼓励，不超过 40 字。同一组数据应给出稳定分数。`;

    const user = `练习场次：${totalSessions}
累计题量：${totalQuestions}
累计答对：${totalCorrect}
总正确率：${accuracy}%
错题本未消除：${wrongBookCount}
薄弱知识点：${weakLine || '无'}
近几场：${recentLine || '无'}
请评分。`;

    let score;
    let comment;
    try {
      const { content } = await callDeepSeekChat({
        system,
        user,
        temperature: 0,
        max_tokens: 200,
      });
      let parsed;
      try {
        parsed = parseModelJson(content);
      } catch {
        const m = String(content).match(/(\d+(?:\.\d+)?)/);
        parsed = {
          score: m ? Number(m[1]) : null,
          comment: String(content).trim().slice(0, 80),
        };
      }
      score = Number(parsed.score);
      if (!Number.isFinite(score)) {
        score = Math.round((accuracy / 10) * 10) / 10;
      }
      score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));
      comment =
        String(parsed.comment || '').trim() ||
        `综合正确率约 ${accuracy}%，继续针对薄弱点巩固。`;
    } catch (aiErr) {
      console.warn('AI 评分调模型失败，使用估算:', aiErr.message || aiErr);
      score = accuracy / 10;
      if (totalSessions < 2) score *= 0.85;
      if (wrongBookCount > totalQuestions * 0.5) score -= 0.8;
      if (wrongBookCount === 0 && accuracy >= 80) score += 0.3;
      score = Math.max(0, Math.min(10, Math.round(score * 10) / 10));
      comment = `正确率 ${accuracy}%，场次 ${totalSessions}。`;
    }

    writeScoreCache({
      fingerprint,
      score,
      comment,
      updatedAt: Date.now(),
    });

    success(res, { score, comment, cached: false });
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

    const total = results.length;
    const correct = results.filter((r) => r.correct).length;
    const wrong = results.filter((r) => r.answered && !r.correct).length;
    const skipped = results.filter((r) => !r.answered).length;
    const usedHint = results.filter((r) => r.usedHint).length;
    const usedExplain = results.filter((r) => r.usedExplain).length;

    const lines = results
      .map((r, i) => {
        const st = !r.answered ? '未作答' : r.correct ? '对' : '错';
        return `${i + 1}.[${st}] ${r.knowledge || ''} | 选:${r.chosenLabel || '-'} 对:${r.answerLabel || '-'}${r.usedHint ? ' |看过提示' : ''}${r.usedExplain ? ' |看过解答' : ''}`;
      })
      .join('\n');

    const system = `你是高中化学老师，根据学生本场单选练习写「分析报告」。
要求：
1. 用中文，分 3 段：总评、薄弱点、改进建议
2. 语气鼓励、具体，不要空洞鸡汤
3. 不要使用 Markdown 标题符号 #，可用「一、二、三」或换行分段
4. 总字数约 180～320 字`;

    const user = `难度：${difficulty || '未知'}
主题：${Array.isArray(topics) ? topics.join('、') : ''}
得分：${correct}/${total}（错 ${wrong}，未作答 ${skipped}）
使用提示 ${usedHint} 次，查看解答 ${usedExplain} 次
明细：
${lines}
请写分析报告。`;

    const { content } = await callDeepSeekChat({
      system,
      user,
      temperature: 0.45,
      max_tokens: 800,
    });

    let text = String(content || '').trim();
    if (!text) {
      text = `本场共 ${total} 题，答对 ${correct} 题。建议针对错题涉及的知识点回顾课本例题，并限时再练一套同主题题目。`;
    }
    success(res, { text, score: { correct, total, wrong, skipped } });
  } catch (err) {
    console.error('练习总结失败:', err);
    const status = err.status || 500;
    if (status === 400) return badRequest(res, err.message);
    error(res, err.message || '总结失败', status >= 400 ? status : 502);
  }
});

/**
 * 验证并规范化分子数据
 */
function validateMoleculePayload(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('结构数据无效');
  }

  const name = String(data.name || '').trim() || '未命名分子';
  const formula = String(data.formula || '').trim() || '?';
  const desc = String(data.desc || '').trim() || '由 AI 生成的教学示意结构。';

  if (!Array.isArray(data.atoms) || data.atoms.length < 1) {
    throw new Error('缺少 atoms 原子坐标');
  }
  if (data.atoms.length > 40) {
    throw new Error('原子数过多，请换更简单的分子');
  }

  const atoms = data.atoms.map((a, i) => {
    const el = String(a.el || a.element || '').trim();
    if (!/^[A-Z][a-z]?$/.test(el)) {
      throw new Error(`第 ${i + 1} 个原子元素符号无效：${el || '(空)'}`);
    }
    const x = Number(a.x);
    const y = Number(a.y);
    const z = Number(a.z);
    if (![x, y, z].every(Number.isFinite)) {
      throw new Error(`第 ${i + 1} 个原子坐标无效`);
    }
    return { el, x, y, z };
  });

  const n = atoms.length;
  const bonds = [];
  const rawBonds = Array.isArray(data.bonds) ? data.bonds : [];
  for (const b of rawBonds) {
    if (!Array.isArray(b) || b.length < 2) continue;
    const i = Number(b[0]);
    const j = Number(b[1]);
    if (!Number.isInteger(i) || !Number.isInteger(j)) continue;
    if (i < 0 || j < 0 || i >= n || j >= n || i === j) continue;
    bonds.push([i, j]);
  }

  // 兜底：无键时串联相邻原子
  if (bonds.length === 0 && n > 1) {
    for (let i = 0; i < n - 1; i++) {
      bonds.push([i, i + 1]);
    }
  }

  // 物理性质
  const physics = {
    state: String(data.physics?.state || '').trim() || '未知',
    density: String(data.physics?.density || '').trim() || '未知',
    meltingPoint: String(data.physics?.meltingPoint || '').trim() || '未知',
    boilingPoint: String(data.physics?.boilingPoint || '').trim() || '未知'
  };

  // 化学性质
  const chemistry = {
    acidity: String(data.chemistry?.acidity || '').trim() || '未知',
    solubility: String(data.chemistry?.solubility || '').trim() || '未知',
    reactivity: String(data.chemistry?.reactivity || '').trim() || '未知'
  };

  return { name, formula, desc, atoms, bonds, physics, chemistry };
}

module.exports = router;
