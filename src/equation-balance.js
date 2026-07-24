/**
 * 简易化学方程式配平（中学范围）
 * 支持：元素、数字下标、括号、+、= / →
 */

const SUB = '₀₁₂₃₄₅₆₇₈₉';

function toAscii(s) {
  return String(s || '')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => String(SUB.indexOf(d)))
    .replace(/[→⇌↔]/g, '=')
    .replace(/\s+/g, '');
}

/** 解析一个物种：如 2H2O、(NH4)2SO4 */
function parseSpecies(raw) {
  let s = toAscii(raw);
  let coef = 1;
  const m = s.match(/^(\d+)(.*)$/);
  if (m) {
    coef = parseInt(m[1], 10) || 1;
    s = m[2];
  }
  const counts = parseFormula(s);
  return { coef, formula: s, counts };
}

function parseFormula(formula) {
  const counts = {};
  const stack = [{}];
  let i = 0;
  const s = formula;
  while (i < s.length) {
    if (s[i] === '(') {
      stack.push({});
      i += 1;
    } else if (s[i] === ')') {
      i += 1;
      let n = '';
      while (i < s.length && /\d/.test(s[i])) {
        n += s[i];
        i += 1;
      }
      const mult = n ? parseInt(n, 10) : 1;
      if (stack.length < 2) {
        throw new Error('化学式括号不匹配');
      }
      const top = stack.pop();
      const parent = stack[stack.length - 1];
      if (!parent || typeof parent !== 'object') {
        throw new Error('化学式括号不匹配');
      }
      for (const [el, c] of Object.entries(top || {})) {
        parent[el] = (parent[el] || 0) + c * mult;
      }
    } else if (/[A-Z]/.test(s[i])) {
      let el = s[i];
      i += 1;
      if (i < s.length && /[a-z]/.test(s[i])) {
        el += s[i];
        i += 1;
      }
      let n = '';
      while (i < s.length && /\d/.test(s[i])) {
        n += s[i];
        i += 1;
      }
      const mult = n ? parseInt(n, 10) : 1;
      const top = stack[stack.length - 1];
      top[el] = (top[el] || 0) + mult;
    } else {
      i += 1;
    }
  }
  if (stack.length !== 1) {
    throw new Error('化学式括号不匹配');
  }
  return stack[0] || {};
}

function sideCounts(speciesList) {
  const total = {};
  for (const sp of speciesList) {
    for (const [el, c] of Object.entries(sp.counts)) {
      total[el] = (total[el] || 0) + c * sp.coef;
    }
  }
  return total;
}

function isBalanced(left, right) {
  const L = sideCounts(left);
  const R = sideCounts(right);
  const els = new Set([...Object.keys(L), ...Object.keys(R)]);
  for (const el of els) {
    if ((L[el] || 0) !== (R[el] || 0)) return false;
  }
  return true;
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b);
}

/**
 * 暴力小系数搜索（物种 ≤ 6，系数 ≤ maxCoef）
 */
export function balanceEquation(input) {
  const raw = toAscii(input);
  if (!raw.includes('=')) {
    throw new Error('请使用 = 或 → 分隔反应物与生成物');
  }
  const [ls, rs] = raw.split('=');
  if (!ls || !rs) throw new Error('方程式不完整');

  const left = ls.split('+').filter(Boolean).map(parseSpecies);
  const right = rs.split('+').filter(Boolean).map(parseSpecies);
  if (!left.length || !right.length) throw new Error('两侧至少各有一种物质');
  if (left.length + right.length > 7) {
    throw new Error('物种过多，请用 AI 建议或拆分');
  }

  // 已配平
  if (isBalanced(left, right)) {
    return {
      balanced: true,
      equation: formatEq(left, right),
      left,
      right,
      steps: ['原式原子已守恒，无需调整系数。'],
    };
  }

  // 重置系数为 1 再搜
  left.forEach((s) => {
    s.coef = 1;
  });
  right.forEach((s) => {
    s.coef = 1;
  });

  const maxCoef = 8;
  const n = left.length + right.length;
  const all = [...left, ...right];

  function tryAssign(idx) {
    if (idx === n) return isBalanced(left, right);
    for (let c = 1; c <= maxCoef; c++) {
      all[idx].coef = c;
      if (tryAssign(idx + 1)) return true;
    }
    return false;
  }

  if (!tryAssign(0)) {
    throw new Error('未能在小系数内自动配平，可改写式子或用 AI 建议');
  }

  // 约分
  let g = all[0].coef;
  for (const s of all) g = gcd(g, s.coef);
  if (g > 1) all.forEach((s) => {
    s.coef = s.coef / g;
  });

  return {
    balanced: true,
    equation: formatEq(left, right),
    left,
    right,
    steps: [
      '将各物质系数设为待定整数',
      '按原子守恒枚举小系数组合',
      `得到配平式：${formatEq(left, right)}`,
      '本地校验：左右原子数一致',
    ],
  };
}

function formatEq(left, right) {
  const fmt = (list) =>
    list
      .map((s) => `${s.coef > 1 ? s.coef : ''}${prettyFormula(s.formula)}`)
      .join(' + ');
  return `${fmt(left)} → ${fmt(right)}`;
}

function prettyFormula(f) {
  return String(f).replace(/\d/g, (d) => SUB[Number(d)] || d);
}

/** 校验任意式子是否守恒 */
export function checkConservation(input) {
  try {
    const raw = toAscii(input);
    if (!raw.includes('=')) return { ok: false, message: '缺少 = 或 →' };
    const [ls, rs] = raw.split('=');
    const left = ls.split('+').filter(Boolean).map(parseSpecies);
    const right = rs.split('+').filter(Boolean).map(parseSpecies);
    const ok = isBalanced(left, right);
    return {
      ok,
      message: ok ? '原子守恒 ✓' : '原子不守恒 ✗',
      left: sideCounts(left),
      right: sideCounts(right),
    };
  } catch (e) {
    return { ok: false, message: e.message || '无法解析' };
  }
}
