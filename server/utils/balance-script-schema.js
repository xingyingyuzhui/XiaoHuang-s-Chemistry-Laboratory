'use strict';

/**
 * 配平脚本结构校验（保存、导入共用）
 * - 可从起式自动补全 species
 * - 目标式必须原子守恒
 */

const { speciesFromEquation, isEquationConserved, parseEquationSides } = require('./eq-sides');

const LIMITS = {
  title: 80,
  equation: 200,
  stepLabel: 60,
  stepTip: 400,
  maxSteps: 12,
  minSteps: 1,
};

const VALID_ACTIONS = new Set(['explain', 'set_coef', 'check']);

function clip(s, n) {
  return String(s || '').trim().slice(0, n);
}

/** 化学式：字母、数字、括号、中间点；拒绝 HTML/脚本字符 */
const FORMULA_SAFE_RE = /^[A-Za-z0-9()[\]{}·.•\-]+$/;
const SUB_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

function isSafeFormula(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 60) return false;
  if (/[<>&"'`\\/]/.test(s)) return false;
  const plain = s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => {
    const i = SUB_DIGITS.indexOf(d);
    return i >= 0 ? String(i) : d;
  });
  return FORMULA_SAFE_RE.test(plain);
}

function validateSpeciesSide(side, sideName) {
  if (!Array.isArray(side) || side.length === 0) {
    return { ok: false, reason: `${sideName} 至少需要一种物质` };
  }
  for (let i = 0; i < side.length; i++) {
    const sp = side[i];
    if (!sp || typeof sp !== 'object') return { ok: false, reason: `${sideName} 第 ${i + 1} 项无效` };
    const formula = clip(sp.formula, 60);
    if (!formula) return { ok: false, reason: `${sideName} 第 ${i + 1} 项化学式不能为空` };
    if (!isSafeFormula(sp.formula)) {
      return { ok: false, reason: `${sideName} 第 ${i + 1} 项化学式格式无效` };
    }
  }
  return { ok: true };
}

function sideName(side) {
  return side === 'left' ? '左侧' : '右侧';
}

/**
 * @param {unknown} step
 * @param {object} species
 */
function validateStep(step, species) {
  if (!step || typeof step !== 'object') return { ok: false, reason: '步骤必须是对象' };
  const label = clip(step.label, LIMITS.stepLabel);
  if (!label) return { ok: false, reason: '步骤标题不能为空' };
  const tip = clip(step.tip, LIMITS.stepTip);
  if (!tip) return { ok: false, reason: '步骤提示不能为空' };
  const action = String(step.action || 'explain').trim();
  if (!VALID_ACTIONS.has(action)) return { ok: false, reason: `未知 action: ${action}` };

  let focus = null;
  if (step.focus != null) {
    if (typeof step.focus !== 'object') return { ok: false, reason: 'focus 必须是对象' };
    const side = step.focus.side;
    if (side !== 'left' && side !== 'right') return { ok: false, reason: 'focus.side 必须是 left 或 right' };
    const index = Number(step.focus.index);
    if (!Number.isInteger(index) || index < 0) return { ok: false, reason: 'focus.index 必须是非负整数' };
    const sideArr = side === 'left' ? species.left : species.right;
    if (index >= sideArr.length) return { ok: false, reason: `focus.index 超出 ${sideName(side)} 物种范围` };
    focus = { side, index };
  }

  if (action === 'set_coef') {
    if (!focus) return { ok: false, reason: 'set_coef 步骤必须指定 focus' };
  }

  let expectedCoef = null;
  if (step.expectedCoef != null && step.expectedCoef !== '') {
    expectedCoef = Number(step.expectedCoef);
    if (!Number.isFinite(expectedCoef) || expectedCoef < 1) {
      return { ok: false, reason: 'expectedCoef 必须是正整数' };
    }
    expectedCoef = Math.round(expectedCoef);
  }

  return {
    ok: true,
    step: { label, tip, action, focus, expectedCoef },
  };
}

/**
 * @param {object} raw
 * @returns {{ ok: true, script: object } | { ok: false, reason: string }}
 */
function validateBalanceScript(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: '无效的脚本数据' };

  const title = clip(raw.title, LIMITS.title);
  if (!title) return { ok: false, reason: '名称不能为空' };

  const startEquation = clip(raw.startEquation, LIMITS.equation);
  if (!startEquation) return { ok: false, reason: '起式不能为空' };

  const targetEquation = clip(raw.targetEquation, LIMITS.equation);
  if (!targetEquation) return { ok: false, reason: '目标式不能为空' };

  // 目标式必须可解析且守恒
  if (!parseEquationSides(targetEquation)) {
    return { ok: false, reason: '目标式无法解析，请使用 = 或 → 连接，并用 + 分隔物种' };
  }
  if (!isEquationConserved(targetEquation)) {
    return { ok: false, reason: '目标式原子不守恒，请先配平后再保存' };
  }

  // species：允许缺失/空侧，从起式自动生成
  let speciesIn = raw.species;
  const emptySides =
    !speciesIn ||
    typeof speciesIn !== 'object' ||
    !Array.isArray(speciesIn.left) ||
    !speciesIn.left.length ||
    !Array.isArray(speciesIn.right) ||
    !speciesIn.right.length;

  if (emptySides) {
    const parsed = speciesFromEquation(startEquation);
    if (!parsed) {
      return { ok: false, reason: '起式无法解析为物种，请检查格式（如 H2 + O2 = H2O）' };
    }
    speciesIn = parsed;
  }

  const leftCheck = validateSpeciesSide(speciesIn.left, '左侧');
  if (!leftCheck.ok) return leftCheck;
  const rightCheck = validateSpeciesSide(speciesIn.right, '右侧');
  if (!rightCheck.ok) return rightCheck;

  const normalizedSpecies = {
    left: speciesIn.left.map((sp) => ({ formula: clip(sp.formula, 60), coef: Number(sp.coef) || 1 })),
    right: speciesIn.right.map((sp) => ({ formula: clip(sp.formula, 60), coef: Number(sp.coef) || 1 })),
  };

  if (!Array.isArray(raw.steps)) return { ok: false, reason: 'steps 必须是数组' };
  if (raw.steps.length < LIMITS.minSteps) return { ok: false, reason: '至少需要 1 个步骤' };
  if (raw.steps.length > LIMITS.maxSteps) {
    return { ok: false, reason: `步骤不能超过 ${LIMITS.maxSteps} 个` };
  }

  const steps = [];
  for (let i = 0; i < raw.steps.length; i++) {
    const checked = validateStep(raw.steps[i], normalizedSpecies);
    if (!checked.ok) return { ok: false, reason: `步骤 ${i + 1}：${checked.reason}` };
    steps.push(checked.step);
  }

  return {
    ok: true,
    script: {
      title,
      grade: clip(raw.grade, 20),
      difficulty: clip(raw.difficulty, 20),
      startEquation,
      targetEquation,
      species: normalizedSpecies,
      steps,
    },
  };
}

module.exports = {
  LIMITS,
  validateBalanceScript,
  validateStep,
};
