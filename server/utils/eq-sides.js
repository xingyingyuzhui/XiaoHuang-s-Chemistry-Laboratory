'use strict';

/**
 * 方程式解析 / 守恒（CJS，供 balance-script-schema 等服务端使用）
 * 与 src/equation-balance.js 中学范围约定一致。
 */

const SUB = '₀₁₂₃₄₅₆₇₈₉';

function toAscii(s) {
  return String(s || '')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => String(SUB.indexOf(d)))
    .replace(/[→⇌↔]/g, '=')
    .replace(/\s+/g, '');
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
      if (stack.length < 2) throw new Error('化学式括号不匹配');
      const top = stack.pop();
      const parent = stack[stack.length - 1];
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
  if (stack.length !== 1) throw new Error('化学式括号不匹配');
  return stack[0] || {};
}

function parseSpecies(raw) {
  let s = toAscii(raw);
  let coef = 1;
  const m = s.match(/^(\d+)(.*)$/);
  if (m) {
    coef = parseInt(m[1], 10) || 1;
    s = m[2];
  }
  if (!s) throw new Error('化学式为空');
  const counts = parseFormula(s);
  return { coef, formula: s, counts };
}

/**
 * @returns {{ left: {formula,coef,counts}[], right: {formula,coef,counts}[] } | null}
 */
function parseEquationSides(input) {
  try {
    const raw = toAscii(input);
    if (!raw.includes('=')) return null;
    const [ls, rs] = raw.split('=');
    if (!ls || !rs) return null;
    const left = ls.split('+').filter(Boolean).map(parseSpecies);
    const right = rs.split('+').filter(Boolean).map(parseSpecies);
    if (!left.length || !right.length) return null;
    return { left, right };
  } catch {
    return null;
  }
}

function sideCounts(speciesList) {
  const total = {};
  for (const sp of speciesList) {
    for (const [el, c] of Object.entries(sp.counts || {})) {
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

/** 起式 → species（系数统一为 1，供练习初始） */
function speciesFromEquation(input) {
  const sides = parseEquationSides(input);
  if (!sides) return null;
  return {
    left: sides.left.map((s) => ({ formula: s.formula, coef: 1 })),
    right: sides.right.map((s) => ({ formula: s.formula, coef: 1 })),
  };
}

function isEquationConserved(input) {
  const sides = parseEquationSides(input);
  if (!sides) return false;
  return isBalanced(sides.left, sides.right);
}

module.exports = {
  toAscii,
  parseEquationSides,
  speciesFromEquation,
  isEquationConserved,
  isBalanced,
};
