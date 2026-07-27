'use strict';

/**
 * 实验 / 预习 结构校验（保存、导入、AI 共用）
 * 不合格直接拒绝，不用占位符「补造」教学内容。
 */

const LIMITS = {
  title: 80,
  type: 40,
  equation: 200,
  safety: 300,
  phenomena: 300,
  stepLabel: 60,
  stepTip: 400,
  risk: 300,
  question: 240,
  option: 160,
  explanation: 400,
  objective: 300,
  summary: 400,
  listItem: 60,
  maxSteps: 12,
  minSteps: 1,
};

function clip(s, n) {
  return String(s || '').trim().slice(0, n);
}

/**
 * @param {unknown} predict
 * @returns {{ ok: true, predict: object } | { ok: false, reason: string }}
 */
function validatePredict(predict) {
  if (predict == null) return { ok: true, predict: null };
  if (typeof predict !== 'object') return { ok: false, reason: 'predict 必须是对象' };
  const question = clip(predict.question, LIMITS.question);
  if (!question) return { ok: false, reason: '预习题干不能为空' };
  if (!Array.isArray(predict.options) || predict.options.length !== 4) {
    return { ok: false, reason: '预习题必须恰好 4 个选项' };
  }
  const options = predict.options.map((o) => clip(o, LIMITS.option));
  if (options.some((o) => !o)) {
    return { ok: false, reason: '预习题选项不能为空' };
  }
  const answer = Number(predict.answer);
  if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
    return { ok: false, reason: '预习题答案必须是 0～3 的整数' };
  }
  return {
    ok: true,
    predict: {
      question,
      options,
      answer,
      explanation: clip(predict.explanation, LIMITS.explanation),
    },
  };
}

/**
 * @param {unknown} prestudy
 * @returns {{ ok: true, prestudy: object|null } | { ok: false, reason: string }}
 */
function validatePrestudy(prestudy) {
  if (prestudy == null) return { ok: true, prestudy: null };
  if (typeof prestudy !== 'object') return { ok: false, reason: 'prestudy 必须是对象或 null' };

  const stepsIn = prestudy.steps;
  if (stepsIn != null && !Array.isArray(stepsIn)) {
    return { ok: false, reason: 'prestudy.steps 必须是数组' };
  }
  const steps = [];
  if (Array.isArray(stepsIn)) {
    if (stepsIn.length > LIMITS.maxSteps) {
      return { ok: false, reason: `预习步骤不能超过 ${LIMITS.maxSteps} 步` };
    }
    for (let i = 0; i < stepsIn.length; i++) {
      const s = stepsIn[i];
      if (!s || typeof s !== 'object') {
        return { ok: false, reason: `预习步骤 ${i + 1} 无效` };
      }
      const label = clip(s.label, LIMITS.stepLabel);
      if (!label) return { ok: false, reason: `预习步骤 ${i + 1} 标题不能为空` };
      const tip = clip(s.tip, LIMITS.stepTip);
      const risk = clip(s.risk, LIMITS.risk);
      const pred = validatePredict(s.predict);
      if (!pred.ok) return { ok: false, reason: `预习步骤 ${i + 1}：${pred.reason}` };
      const out = { label, tip };
      if (risk) out.risk = risk;
      if (pred.predict) out.predict = pred.predict;
      steps.push(out);
    }
  }

  const reagents = Array.isArray(prestudy.reagents)
    ? prestudy.reagents.map((x) => clip(x, LIMITS.listItem)).filter(Boolean).slice(0, 16)
    : [];
  const apparatus = Array.isArray(prestudy.apparatus)
    ? prestudy.apparatus.map((x) => clip(x, LIMITS.listItem)).filter(Boolean).slice(0, 16)
    : [];

  const hasContent =
    steps.length > 0 ||
    clip(prestudy.objective, LIMITS.objective) ||
    reagents.length ||
    apparatus.length ||
    clip(prestudy.summary, LIMITS.summary);

  if (!hasContent) return { ok: true, prestudy: null };

  return {
    ok: true,
    prestudy: {
      objective: clip(prestudy.objective, LIMITS.objective),
      reagents,
      apparatus,
      steps,
      summary: clip(prestudy.summary, LIMITS.summary),
    },
  };
}

/**
 * 规范化并校验完整实验（创建 / 导入 / AI）
 * @param {object} raw
 * @param {{ partial?: boolean }} [opts] partial=true 时允许缺 title（用于 PUT 合并前片段）
 */
function validateLab(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: '无效的实验数据' };
  const partial = !!opts.partial;

  const title = raw.title != null ? clip(raw.title, LIMITS.title) : '';
  if (!partial && !title) return { ok: false, reason: '名称不能为空' };

  let steps;
  if (raw.steps !== undefined) {
    if (!Array.isArray(raw.steps)) return { ok: false, reason: 'steps 必须是数组' };
    if (raw.steps.length < LIMITS.minSteps) return { ok: false, reason: '至少需要 1 个步骤' };
    if (raw.steps.length > LIMITS.maxSteps) {
      return { ok: false, reason: `步骤不能超过 ${LIMITS.maxSteps} 个` };
    }
    steps = [];
    for (let i = 0; i < raw.steps.length; i++) {
      const s = raw.steps[i];
      if (typeof s === 'string') {
        const label = clip(s, LIMITS.stepLabel);
        if (!label) return { ok: false, reason: `步骤 ${i + 1} 标题不能为空` };
        steps.push({ label, tip: '' });
      } else if (s && typeof s === 'object') {
        const label = clip(s.label, LIMITS.stepLabel);
        if (!label) return { ok: false, reason: `步骤 ${i + 1} 标题不能为空` };
        steps.push({ label, tip: clip(s.tip, LIMITS.stepTip) });
      } else {
        return { ok: false, reason: `步骤 ${i + 1} 无效` };
      }
    }
  } else if (!partial) {
    return { ok: false, reason: 'steps 必填' };
  }

  let prestudy;
  if (raw.prestudy !== undefined) {
    const p = validatePrestudy(raw.prestudy);
    if (!p.ok) return p;
    prestudy = p.prestudy;
  } else if (!partial) {
    prestudy = null;
  }

  const lab = {};
  if (raw.title != null || !partial) lab.title = title;
  if (raw.type != null) lab.type = clip(raw.type, LIMITS.type);
  else if (!partial) lab.type = '';
  if (raw.equation != null) lab.equation = clip(raw.equation, LIMITS.equation);
  else if (!partial) lab.equation = '';
  if (raw.safety != null) lab.safety = clip(raw.safety, LIMITS.safety);
  else if (!partial) lab.safety = '';
  if (raw.phenomena != null) lab.phenomena = clip(raw.phenomena, LIMITS.phenomena);
  else if (!partial) lab.phenomena = '';
  if (steps !== undefined) lab.steps = steps;
  if (prestudy !== undefined) lab.prestudy = prestudy;
  if (raw.sortOrder != null && Number.isFinite(Number(raw.sortOrder))) {
    lab.sortOrder = Number(raw.sortOrder);
  }

  return { ok: true, lab };
}

module.exports = {
  LIMITS,
  validatePredict,
  validatePrestudy,
  validateLab,
};
