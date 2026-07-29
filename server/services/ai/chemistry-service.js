const { callDeepSeekChat } = require('./chat-service');
const { parseModelJson } = require('./response-parser');
const { validateLab } = require('../../utils/lab-schema');
const {
  ensureTablesAndSeed,
  tryReserveAiCall,
  releaseAiCall,
  normalizeTip,
  saveAiTip,
  pickLocalTip,
} = require('../../utils/chem-tips');

function serviceError(message, status = 502) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function generateTip() {
  ensureTablesAndSeed();

  // 先占位计次，避免并发打穿限额；失败/无效则 release
  const tipReservation = tryReserveAiCall();
  if (!tipReservation.allowed) {
    return { tip: pickLocalTip(), source: 'local' };
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
      releaseAiCall(tipReservation.reservationId);
      return { tip: pickLocalTip(), source: 'local' };
    }

    const saved = saveAiTip(tip);
    tip = saved || tip;

    return { tip, source: 'ai' };
  } catch (aiErr) {
    releaseAiCall(tipReservation.reservationId);
    console.warn('AI 小知识调模型失败，回落本地:', aiErr.message || aiErr);
    return { tip: pickLocalTip(), source: 'local' };
  }
}

/** tip 路由最外层失败时再回落本地，与原先一致 */
function tipLocalFallback() {
  return { tip: pickLocalTip(), source: 'local' };
}

async function generateReaction({
  prompt,
  moleculeId,
  moleculeName,
  moleculeFormula,
  stepCount,
} = {}) {
  let nSteps = Number(stepCount);
  if (![4, 5, 6].includes(nSteps)) nSteps = 5;

  const knownIds =
    'h2,o2,n2,cl2,o3,h2o,h2o2,hcl,h2s,nh3,co,co2,so2,so3,no,no2,nacl,ch4,c2h6,c2h4,c2h2,ch3oh,ethanol,hcho,ch3cooh,benzene';

  const ctx = [
    moleculeName && `当前分子名称：${moleculeName}`,
    moleculeFormula && `当前分子式：${moleculeFormula}`,
    moleculeId && `当前分子 id：${moleculeId}`,
    `要求 steps 数组长度必须正好为 ${nSteps} 步`,
    `库中已有分子 id（优先用于 moleculeId）：${knownIds}`,
  ]
    .filter(Boolean)
    .join('\n');

  const system = `你是高中化学教学助手。用户要为「3D 分子实验室」添加一条示意级化学反应。
只输出一个 JSON 对象，不要 Markdown，不要其它文字。

格式：
{
  "title": "短标题（≤20字）",
  "type": "加成|取代|氧化|酯化|加聚|化合|分解|置换|复分解|氧化还原|其他",
  "equation": "已配平的化学方程式（可用 Unicode 下标）",
  "reactants": [{ "formula": "C2H4", "name": "乙烯", "moleculeId": "c2h4或null" }],
  "products": [{ "formula": "…", "name": "…", "moleculeId": "h2o或null" }],
  "conditions": "反应条件一句",
  "phenomena": "实验现象一句",
  "notes": "教学要点一句，并注明示意图",
  "steps": [
    {
      "t": 0,
      "label": "步骤名",
      "equationHighlight": "高亮片段",
      "focus": "reactant|break|join|product|done",
      "moleculeId": "该步3D展示的分子id或null",
      "tip": "一句讲解"
    }
  ],
  "moleculeIds": ["可关联的已有分子id"]
}

规则：
1. 面向高中，科学正确，配平正确。
2. steps 必须正好 ${nSteps} 步（不少于 4、不多于 6），t 为秒且递增（约 0～11）。
3. focus 只能是 reactant|break|join|product|done；建议含认识反应物、键变、结合、产物、小结。
4. 每步尽量填 moleculeId（仅限库中已有 id）。多反应物时分步切换；产物步优先用产物 id，若无则用库中有的副产物。
5. 动画为示意级，notes 不要声称量子真实过程。
6. 只输出 JSON。`;

  const user = `${ctx ? `${ctx}\n\n` : ''}请生成反应（必须 ${nSteps} 步）：\n${prompt.trim()}`;

  const { content } = await callDeepSeekChat({
    system,
    user,
    temperature: 0.35,
    max_tokens: 2048,
  });

  const parsed = parseModelJson(content);
  if (!parsed || typeof parsed !== 'object') {
    throw serviceError('模型返回无法解析', 502);
  }

  const title = String(parsed.title || '').trim().slice(0, 80);
  const equation = String(parsed.equation || '').trim().slice(0, 200);
  if (!title || !equation) {
    throw serviceError('模型未返回完整标题或方程式', 502);
  }

  const steps = Array.isArray(parsed.steps)
    ? parsed.steps.slice(0, 8).map((s, i) => ({
        t: Number(s.t) || i * 1.8,
        label: String(s.label || `步骤${i + 1}`).slice(0, 40),
        equationHighlight: String(s.equationHighlight || '').slice(0, 80),
        focus: ['reactant', 'break', 'join', 'product', 'done'].includes(s.focus)
          ? s.focus
          : 'reactant',
        moleculeId: s.moleculeId ? String(s.moleculeId).slice(0, 40) : null,
        tip: String(s.tip || '').slice(0, 120),
      }))
    : [];

  const mapSide = (arr) =>
    (Array.isArray(arr) ? arr : []).slice(0, 6).map((x) => ({
      formula: String(x.formula || '').slice(0, 40),
      name: String(x.name || '').slice(0, 40),
      moleculeId: x.moleculeId ? String(x.moleculeId).slice(0, 40) : null,
    }));

  return {
    title,
    type: String(parsed.type || '其他').slice(0, 20),
    equation,
    reactants: mapSide(parsed.reactants),
    products: mapSide(parsed.products),
    conditions: String(parsed.conditions || '').slice(0, 200),
    phenomena: String(parsed.phenomena || '').slice(0, 200),
    notes: String(parsed.notes || '示意图，非真实微观过程。').slice(0, 400),
    steps:
      steps.length > 0
        ? steps
        : [
            {
              t: 0,
              label: '反应物',
              equationHighlight: equation,
              focus: 'reactant',
              tip: '观察反应物',
            },
            {
              t: 3,
              label: '生成物',
              equationHighlight: equation,
              focus: 'product',
              tip: '观察生成物',
            },
          ],
    moleculeIds: Array.isArray(parsed.moleculeIds)
      ? parsed.moleculeIds.map((x) => String(x)).slice(0, 12)
      : moleculeId
        ? [String(moleculeId)]
        : [],
  };
}

async function generateStoich(prompt) {
  const system = `你是高中化学老师。对学生的化学计量题给出分步解答。
只输出 JSON：
{
  "equation": "相关配平方程式（若有）",
  "steps": [
    { "title": "步骤名", "detail": "计算与说明" }
  ],
  "answer": "最终答案含单位"
}
规则：步骤 3～6 步；数值合理；不要 Markdown。`;

  const { content } = await callDeepSeekChat({
    system,
    user: prompt,
    temperature: 0.3,
    max_tokens: 1200,
  });
  const parsed = parseModelJson(content);
  if (!parsed || typeof parsed !== 'object') {
    throw serviceError('模型返回无法解析', 502);
  }
  const steps = Array.isArray(parsed.steps)
    ? parsed.steps.slice(0, 8).map((s, i) => ({
        title: String(s.title || s.label || `步骤${i + 1}`).slice(0, 40),
        detail: String(s.detail || s.text || '').slice(0, 300),
      }))
    : [];
  return {
    equation: String(parsed.equation || '').slice(0, 200),
    steps,
    answer: String(parsed.answer || '').slice(0, 200),
  };
}

async function generateLab(prompt) {
  const system = `你是高中化学实验教学助手，为「实验探究」模块生成可编辑的实验草稿。
只输出一个 JSON 对象，不要 Markdown 代码块，不要其它文字。

格式：
{
  "title": "实验名称（≤30字）",
  "type": "气体制备|性质实验|中和|有机|定量|其他",
  "equation": "主要化学方程式（可用 Unicode 下标）",
  "phenomena": "主要实验现象一句",
  "safety": "安全注意事项一句",
  "objective": "实验目标一句",
  "reagents": ["试剂1", "试剂2"],
  "apparatus": ["器材1", "器材2"],
  "summary": "预习完成后的总结一句",
  "steps": [
    {
      "label": "步骤名",
      "tip": "脚本操作提示一句",
      "risk": "可选，安全提醒一句或空字符串",
      "predict": {
        "question": "预习预测题（四选一）",
        "options": ["选项A", "选项B", "选项C", "选项D"],
        "answer": 0,
        "explanation": "简短解释"
      }
    }
  ]
}

规则：
1. 面向高中，科学正确；步骤 4～6 步，按真实实验顺序。
2. 每步必须有 label、tip；predict 必填，options 必须正好 4 项，answer 为 0～3。
3. risk 可选；危险操作步（加热、验纯、防倒吸等）务必写 risk。
4. reagents、apparatus 各 2～8 项，用中学常见名称。
5. 只输出 JSON。`;

  const { content } = await callDeepSeekChat({
    system,
    user: `请生成实验：\n${prompt}`,
    temperature: 0.4,
    max_tokens: 2800,
    kind: 'lab',
  });

  const parsed = parseModelJson(content);
  if (!parsed || typeof parsed !== 'object') {
    throw serviceError('模型返回无法解析', 502);
  }

  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps.slice(0, 8) : [];
  if (rawSteps.length < 2) {
    throw serviceError('模型返回的步骤过少', 502);
  }

  // 不补造占位选项/题干：结构不完整直接 502，由前端提示重试
  for (let i = 0; i < rawSteps.length; i++) {
    const s = rawSteps[i];
    if (!s || typeof s !== 'object') {
      throw serviceError(`步骤 ${i + 1} 无效`, 502);
    }
    if (!String(s.label || '').trim()) {
      throw serviceError(`步骤 ${i + 1} 缺少标题`, 502);
    }
    const p = s.predict;
    if (!p || typeof p !== 'object') {
      throw serviceError(`步骤 ${i + 1} 缺少预习预测题`, 502);
    }
  }

  const reagents = Array.isArray(parsed.reagents)
    ? parsed.reagents.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const apparatus = Array.isArray(parsed.apparatus)
    ? parsed.apparatus.map((x) => String(x).trim()).filter(Boolean)
    : [];

  const prestudySteps = rawSteps.map((s) => {
    const out = {
      label: s.label,
      tip: s.tip || '',
    };
    if (s.risk) out.risk = s.risk;
    out.predict = s.predict;
    return out;
  });

  const checked = validateLab({
    title: parsed.title,
    type: parsed.type || '其他',
    equation: parsed.equation,
    safety: parsed.safety,
    phenomena: parsed.phenomena,
    steps: rawSteps.map((s) => ({ label: s.label, tip: s.tip || '' })),
    prestudy: {
      objective: parsed.objective || '',
      reagents,
      apparatus,
      steps: prestudySteps,
      summary: parsed.summary || '',
    },
  });
  if (!checked.ok) {
    throw serviceError(`模型输出未通过校验：${checked.reason}`, 502);
  }

  return {
    title: checked.lab.title,
    type: checked.lab.type || '其他',
    equation: checked.lab.equation || '',
    phenomena: checked.lab.phenomena || '',
    safety: checked.lab.safety || '',
    steps: checked.lab.steps,
    prestudy: checked.lab.prestudy,
  };
}

async function generateBalanceStepTip({ equation, step = {} } = {}) {
  const idx = Number(step.index);
  const total = Number(step.total) || 1;
  const label = String(step.label || '').slice(0, 80);
  const action = String(step.action || 'explain').slice(0, 20);
  const guide = String(step.guide || '').slice(0, 200);
  const focusFormula = String(step.focusFormula || '').slice(0, 40);
  const currentEquation = String(step.currentEquation || equation).slice(0, 200);

  const system = `你是高中化学老师，辅导学生「分步配平」练习。
学生正处在第 ${Number.isFinite(idx) ? idx + 1 : 1}/${total} 步。
只输出 JSON：{ "tip": "一两句中文提示" }
硬性要求：
1. 只谈当前这一步怎么想，不要讲解整道题的全部配平过程；
2. 禁止直接给出最终配平式、禁止说出具体该填的系数数字；
3. 可以提示看哪个元素、左右原子数如何比较、为什么要改某个物种的系数；
4. tip 不超过 80 字；不要 Markdown。`;

  const user = [
    `起式：${equation}`,
    `学生当前式：${currentEquation}`,
    `本步标题：${label || '（无）'}`,
    `本步动作：${action}`,
    focusFormula ? `本步焦点物种：${focusFormula}` : '',
    guide ? `脚本引导（勿重复剧透数字）：${guide}` : '',
    '请只给本步的思路提示。',
  ]
    .filter(Boolean)
    .join('\n');

  const { content } = await callDeepSeekChat({
    system,
    user,
    temperature: 0.35,
    max_tokens: 220,
  });
  const parsed = parseModelJson(content);
  const tip = String(parsed?.tip || parsed?.steps?.[0] || '').trim();
  if (!tip) {
    throw serviceError('模型未返回步骤提示', 502);
  }
  return {
    tip: tip.slice(0, 160),
    equation: '',
    steps: [],
  };
}

async function generateBalance(equation) {
  const system = `你是高中化学老师。将用户给出的化学方程式配平。
只输出 JSON：{ "equation": "配平后的式子，用 → 连接", "steps": ["步骤说明"] }
系数用最小整数；不要 Markdown。`;

  const { content } = await callDeepSeekChat({
    system,
    user: equation,
    temperature: 0.2,
    max_tokens: 512,
  });
  const parsed = parseModelJson(content);
  if (!parsed?.equation) {
    throw serviceError('模型未返回配平式', 502);
  }
  return {
    equation: String(parsed.equation).slice(0, 200),
    steps: Array.isArray(parsed.steps)
      ? parsed.steps.map((s) => String(s).slice(0, 120)).slice(0, 6)
      : [],
  };
}

module.exports = {
  generateTip,
  tipLocalFallback,
  generateReaction,
  generateStoich,
  generateLab,
  generateBalanceStepTip,
  generateBalance,
};
