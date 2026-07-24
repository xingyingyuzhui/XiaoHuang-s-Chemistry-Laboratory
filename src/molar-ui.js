/**
 * 摩尔质量 UI 模块
 * 示例化学式与「3D 分子」库同步，仅作快捷填入
 */

import { calcMolarMass, normalizeFormulaInput } from './molar.js';
import { moleculeApi } from './api/client.js';

const $ = (sel) => document.querySelector(sel);

const formulaInput = $('#formulaInput');
const molarResult = $('#molarResult');
const molarPresets = $('#molarPresets');

/**
 * 示例/输入框一律用可键盘输入的 ASCII 化学式（H2O，不要 H₂O）
 * 3D 分子库里的下标会在此被规范掉
 */
function toInputFormula(formula) {
  return normalizeFormulaInput(formula || '');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 执行摩尔质量计算
 */
export function runMolar() {
  if (!formulaInput || !molarResult) return;

  const raw = formulaInput.value;
  formulaInput.classList.remove('is-invalid');
  try {
    const { rows, total, normalized } = calcMolarMass(raw);
    const label = raw.trim() || normalized;
    molarResult.innerHTML = `
      <div class="molar-total">
        <div class="molar-total-left">
          <div class="molar-total-label">摩尔质量</div>
          <div class="molar-total-formula">${escapeHtml(label)}</div>
        </div>
        <div class="molar-total-right">
          <span class="value">${total.toFixed(3)}</span><span class="unit">g/mol</span>
        </div>
      </div>
      <table class="molar-table">
        <thead>
          <tr>
            <th>元素</th>
            <th>名称</th>
            <th>个数</th>
            <th>原子质量</th>
            <th>小计</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `
            <tr>
              <td>${r.symbol}</td>
              <td class="name">${r.name}</td>
              <td>${r.count}</td>
              <td>${r.atomicMass}</td>
              <td>${r.subtotal.toFixed(3)}</td>
            </tr>
          `,
            )
            .join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    formulaInput.classList.add('is-invalid');
    const msg = escapeHtml(err.message || String(err));
    molarResult.innerHTML = `
      <div class="molar-error">
        <div class="molar-error-title">无法计算</div>
        <p class="molar-error-msg">${msg}</p>
        <ul class="molar-error-tips">
          <li>元素符号首字母大写，如 <code>NaCl</code>、<code>H2O</code></li>
          <li>中英文括号均可：<code>Ca(OH)2</code> 或 <code>Ca（OH）2</code></li>
          <li>结晶水可用 <code>·</code> 或 <code>.</code>：<code>CuSO4·5H2O</code></li>
          <li>也可点击下方示例快速填入（与 3D 分子列表同步）</li>
        </ul>
      </div>
    `;
  }
}

/**
 * 用 3D 分子库刷新示例按钮（只显示化学式）
 * @param {Array<{formula?: string}> | null} [list] 已有列表则不再请求
 */
export async function refreshMolarPresets(list = null) {
  if (!molarPresets) return;

  let molecules = list;
  if (!molecules) {
    try {
      molecules = await moleculeApi.getList();
    } catch (err) {
      console.warn('加载分子列表示例失败', err);
      molecules = [];
    }
  }

  // 保留标题「示例」，清空按钮
  const title =
    molarPresets.querySelector(':scope > span.presets-label') ||
    molarPresets.querySelector(':scope > span');
  molarPresets.innerHTML = '';
  const labelEl = document.createElement('span');
  labelEl.className = 'presets-label';
  labelEl.textContent = title?.textContent?.trim() || '示例';
  molarPresets.appendChild(labelEl);

  if (!molecules.length) {
    const empty = document.createElement('span');
    empty.className = 'presets-empty';
    empty.textContent = '暂无：请先在「3D 分子」添加';
    molarPresets.appendChild(empty);
    return;
  }

  // 按列表顺序；展示/填入均为普通数字，同式只出一次
  const seen = new Set();
  for (const m of molecules) {
    const formula = toInputFormula(m.formula);
    if (!formula) continue;
    if (seen.has(formula)) continue;
    seen.add(formula);

    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = formula;
    b.title = formula;
    b.addEventListener('click', () => {
      if (!formulaInput) return;
      formulaInput.value = formula;
      runMolar();
    });
    molarPresets.appendChild(b);
  }
}

/**
 * 初始化摩尔质量 UI
 */
export function initMolarUI() {
  refreshMolarPresets();

  $('#btnCalcMolar')?.addEventListener('click', runMolar);

  $('#btnClearMolar')?.addEventListener('click', () => {
    if (!formulaInput || !molarResult) return;
    formulaInput.value = '';
    formulaInput.classList.remove('is-invalid');
    molarResult.innerHTML = `<div class="molar-empty">输入化学式后点击计算</div>`;
    formulaInput.focus();
  });

  formulaInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runMolar();
  });

  formulaInput?.addEventListener('input', () => {
    formulaInput.classList.remove('is-invalid');
  });
}
