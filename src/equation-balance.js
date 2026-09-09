/**
 * 简易化学方程式配平（中学范围）
 * 支持：元素、数字下标、括号、+、= / →
 * 配平结果：统一用 =；生成物可按课本习惯标注 ↑ / ↓（formula 永不含标记）
 * 白名单：src/data/equation-state-markers.js（.json 为同内容副本）
 */

import { STATE_MARKER_LISTS } from './data/equation-state-markers.js';

const SUB = '₀₁₂₃₄₅₆₇₈₉';

/** 常见气体生成物（课本示意 ↑）；不含 H2O */
const STATE_GAS = new Set(STATE_MARKER_LISTS.gas || []);

/** 常见沉淀生成物（课本示意 ↓） */
const STATE_PPT = new Set(STATE_MARKER_LISTS.ppt || []);

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

/** 尾部 ↑↓ → marker；formula 保持纯净 */
function splitTrailingMarker(token) {
  let s = String(token || '');
  let marker = '';
  if (s.endsWith('↑') || s.endsWith('↓')) {
    marker = s.slice(-1);
    s = s.slice(0, -1);
  }
  return { formula: s, marker };
}

/** 解析一个物种：如 2H2O、(NH4)2SO4、CO2↑ */
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
    } else if (/[·.•\-]/.test(s[i])) {
      // 结晶水中间点等
      i += 1;
    } else {
      throw new Error(`化学式含无法识别的字符「${s[i]}」`);
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

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}

function gcdArray(arr) {
  let g = arr[0] || 1;
  for (let i = 1; i < arr.length; i++) {
    g = gcd(g, arr[i] || 1);
  }
  return g || 1;
}

export function prettyFormula(f) {
  return String(f).replace(/\d/g, (d) => SUB[Number(d)] || d);
}

/**
 * 生成物课本示意标注；已有 marker 不覆盖；反应物勿传入
 * @param {Array<{ formula: string, marker?: string }>} products
 */
export function annotateLocal(products) {
  if (!Array.isArray(products)) return products;
  for (const sp of products) {
    if (!sp || sp.marker) continue;
    const key = String(sp.formula || '');
    if (STATE_GAS.has(key)) sp.marker = '↑';
    else if (STATE_PPT.has(key)) sp.marker = '↓';
  }
  return products;
}

/**
 * 唯一拼串出口：系数 + 下标化学式 + marker，左右用 =
 * @param {Array} left
 * @param {Array} right
 * @param {{ annotate?: boolean }} [opts]
 */
export function formatEquation(left, right, opts = {}) {
  const annotate = opts.annotate !== false;
  const L = (left || []).map((s) => ({ ...s, marker: s.marker || '' }));
  const R = (right || []).map((s) => ({ ...s, marker: s.marker || '' }));
  if (annotate) annotateLocal(R);
  const fmt = (list) =>
    list
      .map((s) => {
        const coef = s.coef > 1 ? String(s.coef) : '';
        const body = prettyFormula(s.formula) + (s.marker || '');
        return `${coef}${body}`;
      })
      .join(' + ');
  return `${fmt(L)} = ${fmt(R)}`;
}

/**
 * 从另一条式子合并生成物 marker（AI 路径）：以 base 物种列表为准
 * AI 合法 ↑↓ 优先，否则保留 base 已有 / 白名单结果
 * @param {string} aiEquation
 * @param {{ left: Array, right: Array }} baseSides
 * @param {{ annotate?: boolean }} [opts] annotate 默认 true
 */
export function mergeMarkersFromEquation(aiEquation, baseSides, opts = {}) {
  if (!baseSides?.right?.length) return baseSides;
  const doAnnotate = opts.annotate !== false;
  const out = {
    left: baseSides.left.map((s) => ({ ...s, marker: s.marker || '' })),
    right: baseSides.right.map((s) => ({ ...s, marker: s.marker || '' })),
  };
  // 关闭标注：不套白名单、不合并 AI ↑↓（保留 base 上用户已写的 marker）
  if (!doAnnotate) return out;

  annotateLocal(out.right);
  const aiSides = parseEquationSides(aiEquation);
  if (!aiSides?.right?.length) return out;

  for (const sp of out.right) {
    const hit = aiSides.right.find((a) => a.formula === sp.formula);
    if (hit && (hit.marker === '↑' || hit.marker === '↓')) {
      sp.marker = hit.marker;
    }
  }
  return out;
}

/**
 * 暴力小系数搜索（物种 ≤ 6，系数 ≤ maxCoef）
 * @param {string} input
 * @param {{ annotate?: boolean }} [opts] annotate 默认 true：配平后标注生成物 ↑↓
 */
export function balanceEquation(input, opts = {}) {
  const doAnnotate = opts.annotate !== false;
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

  const finish = (steps) => {
    if (doAnnotate) annotateLocal(right);
    else {
      // 关闭标注时仍保留用户输入中已有的 marker
    }
    return {
      balanced: true,
      equation: formatEquation(left, right, { annotate: false }),
      left,
      right,
      steps,
    };
  };

  // 已配平
  if (isBalanced(left, right)) {
    return finish(['原式原子已守恒，无需调整系数。']);
  }

  // 重置系数为 1 再搜（保留已解析的 marker）
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

  let g = all[0].coef;
  for (const s of all) g = gcd(g, s.coef);
  if (g > 1) {
    all.forEach((s) => {
      s.coef = s.coef / g;
    });
  }

  if (doAnnotate) annotateLocal(right);
  const eq = formatEquation(left, right, { annotate: false });
  return finish([
    '将各物质系数设为待定整数',
    '按原子守恒枚举小系数组合',
    `得到配平式：${eq}`,
    '本地校验：左右原子数一致',
  ]);
}

/**
 * 比较两个方程式是否等价（系数约分到最简后一致；忽略 ↑↓ 与箭头字形）
 */
export function equationsEquivalent(a, b) {
  try {
    const pa = parseEquationSides(a);
    const pb = parseEquationSides(b);
    if (!pa || !pb) return false;
    const la = pa.left.map((s) => s.formula).join(',');
    const lb = pb.left.map((s) => s.formula).join(',');
    const ra = pa.right.map((s) => s.formula).join(',');
    const rb = pb.right.map((s) => s.formula).join(',');
    if (la !== lb || ra !== rb) return false;
    const ca = [...pa.left, ...pa.right].map((s) => s.coef);
    const cb = [...pb.left, ...pb.right].map((s) => s.coef);
    const ga = gcdArray(ca);
    const gb = gcdArray(cb);
    const na = ca.map((c) => c / ga);
    const nb = cb.map((c) => c / gb);
    return na.length === nb.length && na.every((v, i) => v === nb[i]);
  } catch {
    return false;
  }
}

export function parseEquationSides(input) {
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

/**
 * 起式 → 练习用 species（各物种系数置 1）
 * @returns {{ left: {formula:string,coef:number,marker:string}[], right: ... } | null}
 */
export function speciesFromEquation(input) {
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

/** 校验任意式子是否守恒 */
export function checkConservation(input) {
  try {
    const sides = parseEquationSides(input);
    if (!sides) return { ok: false, message: '缺少 = 或 →' };
    const ok = isBalanced(sides.left, sides.right);
    return {
      ok,
      message: ok ? '原子守恒 ✓' : '原子不守恒 ✗',
      left: sideCounts(sides.left),
      right: sideCounts(sides.right),
    };
  } catch (e) {
    return { ok: false, message: e.message || '无法解析' };
  }
}

export { STATE_GAS, STATE_PPT, toAscii, parseSpecies };
