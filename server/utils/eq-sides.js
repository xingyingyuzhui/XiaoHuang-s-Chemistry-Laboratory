'use strict';

/**
 * 方程式解析 / 守恒（CJS，供 balance-script-schema 等服务端使用）
 * 与 src/equation-balance.js 中学范围约定一致（parse / marker 剥离）。
 */

const SUB = '₀₁₂₃₄₅₆₇₈₉';

function toAscii(s) {
  return String(s || '')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => String(SUB.indexOf(d)))
    .replace(/[→⇌↔]/g, '=')
    .replace(/＝/g, '=')
    .replace(/＋/g, '+')
    // 化学键盘常见物态标注，配平解析不需要
    .replace(/\((s|l|g|aq)\)/gi, '')
    .replace(/\s+/g, '');
}

function splitTrailingMarker(token) {
  let s = String(token || '');
  let marker = '';
  if (s.endsWith('↑') || s.endsWith('↓')) {
    marker = s.slice(-1);
    s = s.slice(0, -1);
  }
  return { formula: s, marker };
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
    } else if (/[·.•\-]/.test(s[i])) {
      i += 1;
    } else {
      throw new Error(`化学式含无法识别的字符「${s[i]}」`);
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
  const { formula, marker } = splitTrailingMarker(s);
  if (!formula) throw new Error('化学式为空');
  if (/[↑↓]/.test(formula)) {
    throw new Error('状态符号只能写在化学式末尾');
  }
  const counts = parseFormula(formula);
  return { coef, formula, marker, counts };
}

/**
 * @returns {{ left: {formula,coef,marker,counts}[], right: ... } | null}
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
    left: sides.left.map((s) => ({
      formula: s.formula,
      coef: 1,
      marker: s.marker || '',
    })),
    right: sides.right.map((s) => ({
      formula: s.formula,
      coef: 1,
      marker: s.marker || '',
    })),
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
