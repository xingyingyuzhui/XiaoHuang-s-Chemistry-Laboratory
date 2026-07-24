import { ELEMENTS_BY_SYMBOL } from './data/elements.js';

/** 将中英文括号、全角数字/字母、下标等规范为半角 ASCII 化学式 */
export function normalizeFormulaInput(input) {
  let s = String(input || '').trim();

  // 空白
  s = s.replace(/\s+/g, '');

  // 中文/全角括号 → 半角
  s = s
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/【/g, '[')
    .replace(/】/g, ']')
    .replace(/［/g, '[')
    .replace(/］/g, ']')
    .replace(/｛/g, '{')
    .replace(/｝/g, '}');

  // 结晶水/间隔点
  s = s
    .replace(/[·•‧∙・｡。]/g, '.')
    .replace(/．/g, '.')
    .replace(/。/g, '.');

  // 全角数字、下标数字
  const fullDigits = '０１２３４５６７８９';
  const subDigits = '₀₁₂₃₄₅₆₇₈₉';
  for (let d = 0; d <= 9; d++) {
    s = s.split(fullDigits[d]).join(String(d));
    s = s.split(subDigits[d]).join(String(d));
  }

  // 全角英文字母 → 半角
  s = s.replace(/[Ａ-Ｚａ-ｚ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );

  // 常见乘号/星号当间隔时忽略（非法时后面会报）
  return s;
}

/** 扫描非法字符，返回友好说明 */
function findIllegalChars(s) {
  const bad = [];
  for (const ch of s) {
    if (/[A-Za-z0-9.()[\]]/.test(ch)) continue;
    if (ch === '{' || ch === '}') continue; // 暂不支持，单独提示
    if (!bad.includes(ch)) bad.push(ch);
  }
  return bad;
}

/** Parse chemical formula into element counts. Supports nested () [] and hydrates. */
export function parseFormula(input) {
  const raw = String(input || '').trim();
  if (!raw) {
    throw new Error('请输入化学式，例如 H2O、Ca(OH)2、CuSO4·5H2O');
  }

  const s = normalizeFormulaInput(raw);
  if (!s) {
    throw new Error('请输入化学式，例如 H2O、Ca(OH)2、CuSO4·5H2O');
  }

  if (/[{}]/.test(s)) {
    throw new Error('暂不支持花括号 { }，请使用圆括号 ( ) 或方括号 [ ]');
  }

  const illegal = findIllegalChars(s);
  if (illegal.length) {
    const shown = illegal
      .slice(0, 6)
      .map((c) => `「${c}」`)
      .join('、');
    throw new Error(
      `化学式含非法字符 ${shown}。仅支持元素符号、数字、圆括号()、方括号[]，以及结晶水间隔 · 或 .`,
    );
  }

  // 纯数字 / 纯符号
  if (/^[0-9.]+$/.test(s)) {
    throw new Error('请输入完整化学式（需包含元素符号），例如 H2O、NaCl');
  }
  if (!/[A-Z]/.test(s)) {
    throw new Error('未识别到元素符号。请使用首字母大写，例如 H2O、CO2、Fe2(SO4)3');
  }

  // Split hydrates: CuSO4.5H2O
  const parts = s.split('.');
  const total = {};

  for (const part of parts) {
    if (!part) {
      throw new Error('结晶水写法有误。正确示例：CuSO4·5H2O 或 CuSO4.5H2O');
    }
    let i = 0;
    let mult = 1;
    if (/^\d/.test(part)) {
      let n = '';
      while (i < part.length && /\d/.test(part[i])) n += part[i++];
      mult = Number(n) || 1;
      if (mult <= 0) {
        throw new Error('下标或系数必须为正整数');
      }
    }
    const chunk = part.slice(i);
    if (!chunk) {
      throw new Error('化学式不完整，请检查数字后是否缺少元素或括号');
    }
    const counts = parseSegment(chunk);
    for (const [el, c] of Object.entries(counts)) {
      total[el] = (total[el] || 0) + c * mult;
    }
  }

  if (Object.keys(total).length === 0) {
    throw new Error('未能解析出任何元素，请检查化学式是否正确');
  }

  return total;
}

function parseSegment(formula) {
  const stack = [{}];
  let i = 0;

  while (i < formula.length) {
    const ch = formula[i];

    if (ch === '(' || ch === '[') {
      stack.push({});
      i++;
      continue;
    }

    if (ch === ')' || ch === ']') {
      const open = ch === ')' ? '(' : '[';
      i++;
      let num = '';
      while (i < formula.length && /\d/.test(formula[i])) num += formula[i++];
      if (num !== '' && Number(num) <= 0) {
        throw new Error('括号后的下标必须为正整数');
      }
      const mul = num ? Number(num) : 1;
      if (stack.length <= 1) {
        throw new Error(`多余的右括号 ${ch}，请检查括号是否成对`);
      }
      const top = stack.pop();
      if (Object.keys(top).length === 0) {
        throw new Error('括号内不能为空');
      }
      const parent = stack[stack.length - 1];
      for (const [el, c] of Object.entries(top)) {
        parent[el] = (parent[el] || 0) + c * mul;
      }
      void open;
      continue;
    }

    if (/[A-Z]/.test(ch)) {
      let sym = ch;
      i++;
      if (i < formula.length && /[a-z]/.test(formula[i])) {
        sym += formula[i++];
      }
      // 三个字母元素极少，教学表只用 1–2 字母
      let num = '';
      while (i < formula.length && /\d/.test(formula[i])) num += formula[i++];
      if (num !== '' && Number(num) <= 0) {
        throw new Error(`元素 ${sym} 的下标必须为正整数`);
      }
      const count = num ? Number(num) : 1;
      if (!ELEMENTS_BY_SYMBOL[sym]) {
        // 友好提示：可能大小写写错
        const lowerTry = sym[0] + (sym[1] || '').toLowerCase();
        const hint =
          sym.length === 1
            ? `（若指「${sym.toLowerCase()}」相关元素，请确认首字母大写，如 Co 不是 CO）`
            : `（请确认大小写，如氯化钠是 NaCl 不是 NACl / nacl）`;
        throw new Error(`未知元素符号「${sym}」${hint}`);
      }
      const cur = stack[stack.length - 1];
      cur[sym] = (cur[sym] || 0) + count;
      continue;
    }

    if (/[a-z]/.test(ch)) {
      throw new Error(
        `元素符号首字母须大写，「${ch}」位置不正确。示例：H2O、NaCl、Ca(OH)2`,
      );
    }

    if (/\d/.test(ch)) {
      throw new Error('数字位置不正确：下标应写在元素或括号后面，如 H2O、Ca(OH)2');
    }

    throw new Error(`无法解析的字符「${ch}」`);
  }

  if (stack.length !== 1) {
    throw new Error('括号不匹配：左括号多于右括号，请补全 ) 或 ]');
  }
  return stack[0];
}

export function calcMolarMass(formula) {
  const counts = parseFormula(formula);
  const rows = [];
  let total = 0;

  const symbols = Object.keys(counts).sort((a, b) => {
    return ELEMENTS_BY_SYMBOL[a].z - ELEMENTS_BY_SYMBOL[b].z;
  });

  for (const sym of symbols) {
    const el = ELEMENTS_BY_SYMBOL[sym];
    const n = counts[sym];
    const sub = el.mass * n;
    total += sub;
    rows.push({
      symbol: sym,
      name: el.name,
      count: n,
      atomicMass: el.mass,
      subtotal: sub,
    });
  }

  if (!Number.isFinite(total) || total <= 0) {
    throw new Error('计算结果异常，请检查化学式');
  }

  return {
    counts,
    rows,
    total,
    normalized: normalizeFormulaInput(formula),
  };
}

