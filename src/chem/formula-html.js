/**
 * ASCII 化学式 → 展示用安全 HTML（下标用 <sub>，不改原字符串）。
 * 输入框里仍保留可键盘输入的 ASCII（H2O），只在显示层排版。
 *
 *   formulaHtml('C6H12O6')      → C<sub>6</sub>H<sub>12</sub>O<sub>6</sub>
 *   formulaHtml('CuSO4·5H2O')   → CuSO<sub>4</sub>·5H<sub>2</sub>O   （结晶水系数不下标）
 *   formulaHtml('Ca(OH)2')      → Ca(OH)<sub>2</sub>
 */

const SUB_DIGITS = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string} formula ASCII 或含 Unicode 下标的化学式
 * @returns {string} HTML
 */
export function formulaHtml(formula) {
  const s = String(formula ?? '').replace(/[₀-₉]/g, (d) => SUB_DIGITS[d]);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\d/.test(ch)) {
      let j = i;
      while (j < s.length && /\d/.test(s[j])) j++;
      const digits = s.slice(i, j);
      const prev = s[i - 1] || '';
      // 紧跟在元素符号或右括号后的数字是下标；开头或 · 后的是系数（结晶水数目）
      out += /[A-Za-z)\]]/.test(prev) ? `<sub>${digits}</sub>` : digits;
      i = j;
      continue;
    }
    out += escapeHtml(ch);
    i++;
  }
  return out;
}
