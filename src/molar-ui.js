/**
 * 计算页 UI：二级导航 — 摩尔质量 / 配平方程 / 分步计量
 */

import { calcMolarMass, normalizeFormulaInput } from './molar.js';
import { moleculeApi, aiApi } from './api/client.js';
import { balanceEquation, checkConservation } from './equation-balance.js';

const $ = (sel) => document.querySelector(sel);

const formulaInput = $('#formulaInput');
const molarResult = $('#molarResult');
const molarPresets = $('#molarPresets');

const MOLAR_SECTIONS = [
  { id: 'mass', title: '摩尔质量', desc: '化学式 · 分元素明细' },
  { id: 'balance', title: '配平方程', desc: '本地校验 · AI 建议' },
  { id: 'stoich', title: '分步计量', desc: '题目分步解答' },
];

let currentMolarSection = 'mass';

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
    b.className = 'preset-chip';
    b.textContent = formula;
    b.title = formula;
    b.addEventListener('click', () => {
      if (!formulaInput) return;
      formulaInput.value = formula;
      // 高亮当前示例
      molarPresets.querySelectorAll('.preset-chip').forEach((el) => {
        el.classList.toggle('is-active', el === b);
      });
      runMolar();
    });
    molarPresets.appendChild(b);
  }
}

/**
 * 初始化摩尔质量 UI
 */
function renderMolarNav() {
  const list = $('#molarNavList');
  if (!list) return;
  list.innerHTML = MOLAR_SECTIONS.map(
    (s) => `
    <button type="button" class="ai-nav-card${currentMolarSection === s.id ? ' is-active' : ''}" data-molar-section="${s.id}" role="listitem">
      <span class="ai-nav-card-title"><strong>${escapeHtml(s.title)}</strong></span>
      <span>${escapeHtml(s.desc)}</span>
    </button>`,
  ).join('');
  list.querySelectorAll('[data-molar-section]').forEach((btn) => {
    btn.addEventListener('click', () => selectMolarSection(btn.dataset.molarSection));
  });
}

function selectMolarSection(id) {
  currentMolarSection = id || 'mass';
  renderMolarNav();
  const mass = $('#molarSectionMass');
  const bal = $('#molarSectionBalance');
  const st = $('#molarSectionStoich');
  if (mass) mass.hidden = currentMolarSection !== 'mass';
  if (bal) bal.hidden = currentMolarSection !== 'balance';
  if (st) st.hidden = currentMolarSection !== 'stoich';
}

function runBalanceLocal() {
  const input = $('#balanceInput')?.value?.trim();
  const status = $('#balanceStatus');
  const box = $('#balanceResult');
  if (!input) {
    if (status) {
      status.textContent = '请输入方程式';
      status.className = 'quiz-status is-err';
    }
    return;
  }
  try {
    const result = balanceEquation(input);
    const check = checkConservation(result.equation.replace('→', '='));
    if (box) {
      box.innerHTML = `
        <h4>配平结果</h4>
        <p class="molar-balance-eq">${escapeHtml(result.equation)}</p>
        <p class="quiz-status ${check.ok ? 'is-ok' : 'is-err'}">${escapeHtml(check.message)}</p>
        <ol class="molar-balance-steps">
          ${(result.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ol>
      `;
    }
    if (status) {
      status.textContent = check.ok ? '已配平并校验守恒' : '配平后校验异常';
      status.className = 'quiz-status ' + (check.ok ? 'is-ok' : 'is-err');
    }
  } catch (err) {
    if (status) {
      status.textContent = err.message || '配平失败';
      status.className = 'quiz-status is-err';
    }
  }
}

async function runBalanceAi() {
  const input = $('#balanceInput')?.value?.trim();
  const status = $('#balanceStatus');
  if (!input) {
    if (status) {
      status.textContent = '请输入方程式';
      status.className = 'quiz-status is-err';
    }
    return;
  }
  if (status) {
    status.textContent = 'AI 建议中…';
    status.className = 'quiz-status';
  }
  try {
    const data = await aiApi.balance({ equation: input });
    const suggested = data?.equation || data?.balanced || '';
    if (suggested) {
      const inputEl = $('#balanceInput');
      if (inputEl) inputEl.value = String(suggested).replace(/→/g, '=');
    }
    // 始终本地再配平/校验
    runBalanceLocal();
    if (status) {
      status.textContent = (status.textContent || '') + '（含 AI 建议）';
    }
  } catch (err) {
    if (status) {
      status.textContent = err.message || 'AI 建议失败，可直接本地配平';
      status.className = 'quiz-status is-err';
    }
  }
}

async function runStoich() {
  const prompt = $('#stoichInput')?.value?.trim();
  const status = $('#stoichStatus');
  const box = $('#stoichResult');
  if (!prompt) {
    if (status) {
      status.textContent = '请输入题目';
      status.className = 'quiz-status is-err';
    }
    return;
  }
  if (status) {
    status.textContent = '生成分步解答…';
    status.className = 'quiz-status';
  }
  try {
    const data = await aiApi.stoich({ prompt });
    if (box) {
      const steps = Array.isArray(data?.steps) ? data.steps : [];
      box.innerHTML = `
        <h4>分步化学计量</h4>
        ${data?.equation ? `<p class="molar-balance-eq">${escapeHtml(data.equation)}</p>` : ''}
        <ol class="molar-balance-steps">
          ${steps
            .map(
              (s) =>
                `<li><strong>${escapeHtml(s.title || s.label || '')}</strong> ${escapeHtml(s.detail || s.text || s)}</li>`,
            )
            .join('')}
        </ol>
        ${data?.answer ? `<p><strong>结果：</strong>${escapeHtml(data.answer)}</p>` : ''}
        <p class="rxn-muted">示意教学步骤，数值请与计算过程交叉核对。</p>
      `;
    }
    if (status) {
      status.textContent = '已生成';
      status.className = 'quiz-status is-ok';
    }
  } catch (err) {
    if (status) {
      status.textContent = err.message || '生成失败';
      status.className = 'quiz-status is-err';
    }
  }
}

export function initMolarUI() {
  renderMolarNav();
  selectMolarSection('mass');
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

  $('#btnBalance')?.addEventListener('click', runBalanceLocal);
  $('#btnBalanceAi')?.addEventListener('click', runBalanceAi);
  $('#btnStoich')?.addEventListener('click', runStoich);
  $('#balanceInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runBalanceLocal();
  });
}
