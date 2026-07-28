/**
 * 配平脚本 · 数据模型
 * 草稿↔payload、进度读写、拼装当前方程字符串
 */

import {
  speciesFromEquation,
  equationsEquivalent,
  checkConservation,
  parseEquationSides,
} from '../equation-balance.js';

const PROGRESS_KEY = 'balance-script-progress';

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch { /* ignore */ }
}

export function emptyStep() {
  return {
    label: '',
    tip: '',
    action: 'explain',
    focus: null,
    expectedCoef: null,
  };
}

/**
 * 将 script 对象转为可编辑草稿
 */
export function scriptToDraft(script) {
  if (!script) return {
    isNew: true,
    title: '',
    grade: '',
    difficulty: '',
    startEquation: '',
    targetEquation: '',
    species: { left: [], right: [] },
    steps: [emptyStep()],
  };
  return {
    isNew: !script.id,
    id: script.id || '',
    title: script.title || '',
    grade: script.grade || '',
    difficulty: script.difficulty || '',
    startEquation: script.startEquation || '',
    targetEquation: script.targetEquation || '',
    species: script.species || { left: [], right: [] },
    steps: Array.isArray(script.steps) && script.steps.length > 0
      ? script.steps.map((s) => ({ ...s }))
      : [emptyStep()],
    source: script.source || 'custom',
  };
}

/**
 * 始终优先按起式解析 species（修改起式后不能沿用旧 species）
 * 起式无法解析时，若已有 species 则回落保留（兼容异常草稿）
 * @returns {{ ok: true, species } | { ok: false, reason: string }}
 */
export function ensureSpeciesFromStart(draft) {
  const parsed = speciesFromEquation(draft?.startEquation || '');
  if (parsed) {
    return { ok: true, species: parsed };
  }
  const left = draft?.species?.left;
  const right = draft?.species?.right;
  if (Array.isArray(left) && left.length && Array.isArray(right) && right.length) {
    return { ok: true, species: draft.species };
  }
  return { ok: false, reason: '起式无法解析为物种，请使用如 H2 + O2 = H2O 的格式' };
}

/**
 * 将草稿转为 API payload（自动补 species）
 * @returns {{ ok: true, payload: object } | { ok: false, reason: string }}
 */
export function draftToPayload(draft) {
  const filled = ensureSpeciesFromStart(draft);
  if (!filled.ok) return filled;
  // focus 越界时钳制/清空，避免改起式后保存被服务端拒绝
  const species = filled.species;
  const steps = (draft.steps || []).map((s) => {
    let focus = s.focus || null;
    if (focus) {
      const arr = focus.side === 'right' ? species.right : species.left;
      const idx = Number(focus.index);
      if (!arr || !Number.isInteger(idx) || idx < 0 || idx >= arr.length) {
        focus = s.action === 'set_coef' ? { side: 'left', index: 0 } : null;
        if (s.action === 'set_coef' && (!species.left || !species.left.length)) {
          focus = null;
        }
      } else {
        focus = { side: focus.side === 'right' ? 'right' : 'left', index: idx };
      }
    }
    return {
      label: s.label,
      tip: s.tip,
      action: s.action || 'explain',
      focus,
      expectedCoef: s.expectedCoef != null && s.expectedCoef !== '' ? Number(s.expectedCoef) : null,
    };
  });
  return {
    ok: true,
    payload: {
      title: draft.title,
      grade: draft.grade,
      difficulty: draft.difficulty,
      startEquation: draft.startEquation,
      targetEquation: draft.targetEquation,
      species,
      steps,
    },
  };
}

/**
 * 整式是否完成：约分等价 + 守恒
 */
export function isPracticeFinished(species, coefs, targetEquation) {
  const eq = buildEquation(species, coefs);
  if (!eq || !targetEquation) return false;
  const cons = checkConservation(eq);
  if (!cons.ok) return false;
  return equationsEquivalent(eq, targetEquation);
}

/**
 * 根据 startEquation + 当前系数，拼出当前方程字符串
 * species 结构：{ left: [{ formula, coef }], right: [{ formula, coef }] }
 * coefs 结构：{ left: [n, ...], right: [n, ...] }
 */
export function buildEquation(species, coefs) {
  if (!species) return '';
  const fmtSide = (side, sideCoefs) =>
    side.map((sp, i) => {
      const c = (sideCoefs && sideCoefs[i]) || sp.coef || 1;
      return `${c > 1 ? c : ''}${sp.formula}`;
    }).join(' + ');
  const left = fmtSide(species.left || [], coefs?.left || []);
  const right = fmtSide(species.right || [], coefs?.right || []);
  return `${left} → ${right}`;
}

/**
 * 从 species 初始化系数数组（全 1）
 */
export function initCoefs(species) {
  return {
    left: (species?.left || []).map(() => 1),
    right: (species?.right || []).map(() => 1),
  };
}

/**
 * 格式化化学式中的数字为下标 Unicode
 */
export function formatFormula(f) {
  const SUB = '₀₁₂₃₄₅₆₇₈₉';
  return String(f || '').replace(/\d/g, (d) => SUB[Number(d)] || d);
}

/**
 * 格式化脚本导入摘要（对齐实验包）
 */
export function formatBalanceImportSummary(result) {
  if (!result) return '导入失败';
  const parts = [];
  if (result.created) parts.push(`新增 ${result.created} 条`);
  if (result.renamed) parts.push(`${result.renamed} 条改名避免冲突`);
  if (result.skipped) parts.push(`跳过 ${result.skipped} 条`);
  let text = parts.join('；') || '无变更';
  const errs = Array.isArray(result.errors) ? result.errors.filter(Boolean) : [];
  if (errs.length) {
    text += `\n\n详情：\n${errs.slice(0, 8).join('\n')}`;
    if (errs.length > 8) text += `\n…共 ${errs.length} 条问题`;
  }
  return text;
}

/** 下载 JSON（与 lab-model.downloadJsonFile 行为一致） */
export function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * 由起式/目标式生成练习步骤：观察 →（可选 AI 思路）→ 需改的 set_coef → 检查
 * 练习初始系数均为 1，故 expectedCoef 取目标式中的系数（≠1 才出改系数步）
 * @param {string} startEq
 * @param {string} targetEq
 * @param {string[]} [guideTexts]
 */
export function buildPracticeStepsFromEquations(startEq, targetEq, guideTexts = []) {
  const species = speciesFromEquation(startEq);
  const target = parseEquationSides(targetEq);

  const steps = [
    {
      label: '观察未配平式',
      tip: '先数清左右各元素原子个数，找出不相等的元素。',
      action: 'explain',
      focus: null,
      expectedCoef: null,
    },
  ];

  const guides = (Array.isArray(guideTexts) ? guideTexts : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .slice(0, 3);
  guides.forEach((g, i) => {
    const tip = g
      .replace(/\d+\s*[A-Za-z].*(→|=).*/g, '按守恒调整相关物种系数。')
      .slice(0, 400);
    steps.push({
      label: `思路 ${i + 1}`,
      tip: tip || '按原子守恒逐步调整系数。',
      action: 'explain',
      focus: null,
      expectedCoef: null,
    });
  });

  if (species && target) {
    const pushCoefSteps = (sideKey, targetArr) => {
      (targetArr || []).forEach((tsp) => {
        const formula = tsp.formula;
        const idx = (species[sideKey] || []).findIndex((s) => s.formula === formula);
        if (idx < 0) return;
        const expected = Math.round(Number(tsp.coef) || 1);
        if (!Number.isFinite(expected) || expected < 1) return;
        // 练习从全 1 起步：仅目标系数 ≠ 1 时需要改系数步
        if (expected === 1) return;
        steps.push({
          label: `确定 ${formula} 的系数`,
          tip: `比较与 ${formula} 相关的元素在左右的原子数，将系数改为合适的整数（不要一次改太多）。`,
          action: 'set_coef',
          focus: { side: sideKey, index: idx },
          expectedCoef: expected,
        });
      });
    };
    pushCoefSteps('left', target.left);
    pushCoefSteps('right', target.right);
  }

  steps.push({
    label: '检查守恒',
    tip: '核对每一种元素左右原子数是否相等，再点「检查整式」。',
    action: 'check',
    focus: null,
    expectedCoef: null,
  });

  // 至少观察 + 检查；若没有 set_coef 也保留思路步
  return steps.slice(0, 12);
}
