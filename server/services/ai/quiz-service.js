const { query, queryOne, run } = require('../../db/sqlite');
const { ensureQuizSchema } = require('../../db/ensure-quiz-schema');
const { storeQuizPaper } = require('../../utils/quiz-paper-store');
const { callDeepSeekChat } = require('./chat-service');
const { parseModelJson, normalizeQuizQuestions } = require('./response-parser');

const SCORE_CACHE_KEY = 'quiz_ai_score';

const DIFF_MAP = {
  basic: '初级：基础概念与生活常识，题干简短，少计算',
  medium: '中级：高中课本对应知识点的课后练习水平，可有简单计算或判断',
  hard: '高级：高考常见设问方式与综合应用，可多知识点结合（勿声称摘自某年真题原文）',
};

/**
 * 根据库内练习/错题数据生成指纹；数据不变则不应重新调模型
 */
function buildQuizScoreFingerprint() {
  ensureQuizSchema();

  const agg = queryOne(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(total), 0) AS tq,
            COALESCE(SUM(correct), 0) AS tc,
            COALESCE(MAX(created_at), 0) AS last_at
     FROM quiz_sessions`,
  );
  const wrongOpen = queryOne(
    `SELECT COUNT(*) AS c, COALESCE(MAX(created_at), 0) AS last_at
     FROM quiz_wrong_book WHERE dismissed = 0`,
  );
  const wrongDismissed = queryOne(
    `SELECT COUNT(*) AS c FROM quiz_wrong_book WHERE dismissed = 1`,
  );
  // 近 5 场明细也进指纹，避免「总数相同但场次不同」漏更新
  const recent = query(
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
  run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [
    SCORE_CACHE_KEY,
    JSON.stringify(payload),
  ]);
}

function collectScoreStats() {
  const sessions = query(
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
    queryOne(`SELECT COUNT(*) AS c FROM quiz_wrong_book WHERE dismissed = 0`)?.c || 0,
  );
  const wrongRows = query(
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

function formatOptions(options) {
  return Array.isArray(options)
    ? options.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('\n')
    : '';
}

function answerLetter(answer) {
  return typeof answer === 'number' && answer >= 0 && answer <= 3
    ? String.fromCharCode(65 + answer)
    : '?';
}

async function generateQuiz({
  grades = [],
  difficulty = 'medium',
  topics = [],
  count = 5,
} = {}) {
  const n = Math.min(10, Math.max(1, parseInt(count, 10) || 5));
  const gradeLabels = Array.isArray(grades)
    ? grades.map((g) => String(g)).filter(Boolean)
    : [];
  const topicLabels = Array.isArray(topics)
    ? topics.map((t) => String(t)).filter(Boolean)
    : [];

  const diffText = DIFF_MAP[difficulty] || DIFF_MAP.medium;

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
    kind: 'quiz-generate',
  });

  const parsed = parseModelJson(content);
  const questions = normalizeQuizQuestions(parsed, n);
  const meta = {
    count: questions.length,
    difficulty,
    grades: gradeLabels,
    topics: topicLabels,
  };
  // 服务端快照标准答案，交卷时不信客户端 answer
  let paperId = null;
  try {
    paperId = storeQuizPaper(questions, meta);
  } catch (e) {
    console.warn('保存出题快照失败', e?.message || e);
  }
  return { questions, paperId, meta };
}

async function generateHint({ stem, options, knowledge } = {}) {
  const system = `你是高中化学老师。学生卡关了，只给提示、不给最终答案、不指出正确选项字母。
只输出 1～3 句中文提示，不要标题、不要列表编号。`;

  const user = `题干：${stem}
选项：
${formatOptions(options)}
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
  return { text };
}

async function generateExplain({
  stem,
  options,
  answer,
  knowledge,
  explain,
} = {}) {
  const system = `你是高中化学老师，讲解单选题。
要求：先给出正确选项（如 B），再分步说明理由，最后一句点出其它选项常见误区。
用简洁中文，控制在 120～220 字。不要 Markdown 标题。`;

  const ans = answerLetter(answer);
  const user = `题干：${stem}
选项：
${formatOptions(options)}
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
  return { text };
}

/** 非模型失败时回落到本地解析文案 */
function explainFallback({ explain, answer } = {}) {
  if (!explain) return null;
  const ans =
    typeof answer === 'number' && answer >= 0 && answer <= 3
      ? String.fromCharCode(65 + answer)
      : '';
  return {
    text: `${ans ? `正确答案 ${ans}。` : ''}${explain}`,
    fromCache: true,
  };
}

async function scoreQuiz() {
  const fingerprint = buildQuizScoreFingerprint();
  const cached = readScoreCache();
  if (
    cached &&
    cached.fingerprint === fingerprint &&
    cached.score !== undefined &&
    cached.score !== null
  ) {
    return {
      score: cached.score,
      comment: cached.comment || '',
      cached: true,
    };
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
    return empty;
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

  return { score, comment, cached: false };
}

async function summarizeQuiz({ difficulty, topics = [], results = [] } = {}) {
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
  return { text, score: { correct, total, wrong, skipped } };
}

module.exports = {
  generateQuiz,
  generateHint,
  generateExplain,
  explainFallback,
  scoreQuiz,
  summarizeQuiz,
};
