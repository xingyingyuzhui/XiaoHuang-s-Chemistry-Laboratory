/**
 * 计算页 UI：二级导航 — 摩尔质量 / 配平方程 / 分步计量
 */

import { calcMolarMass, normalizeFormulaInput } from './molar.js';
import { moleculeApi, aiApi } from './api/client.js';
import { balanceEquation, checkConservation, mergeMarkersFromEquation, formatEquation } from './equation-balance.js';
import { mountChemKeypads } from './chem-keypad.js';
import { getAnnotateStateMarkers } from './settings.js';
import { formulaHtml } from './chem/formula-html.js';
import { ELEMENTS_BY_SYMBOL, blockZoneId } from './data/elements.js';

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

/** 上一次显示的总质量：新结果从这里滚动过去 */
let shownTotal = 0;
let countRaf = 0;

/** 出错时可一键试的示例 */
const TRY_FORMULAS = ['C6H12O6', 'Ca(OH)2', 'CuSO4·5H2O'];

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** 读主题动效 token：像素主题 --motion-steps > 0 时数字逐帧跳 */
function themeMotionSteps() {
  const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--motion-steps'), 10);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/**
 * 数字滚动到目标值（与进度条同时长）
 * @param {HTMLElement} el
 * @param {number} to
 */
function countTo(el, to) {
  cancelAnimationFrame(countRaf);
  const from = shownTotal;
  shownTotal = to;
  if (prefersReducedMotion() || from === to) {
    el.textContent = to.toFixed(3);
    return;
  }
  const dur =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dur-reveal')) * 1000 || 700;
  const steps = themeMotionSteps();
  const t0 = performance.now();
  const frame = (now) => {
    let p = Math.min(1, (now - t0) / dur);
    p = steps ? Math.ceil(p * steps) / steps : 1 - Math.pow(1 - p, 3);
    el.textContent = (from + (to - from) * p).toFixed(3);
    if (p < 1) countRaf = requestAnimationFrame(frame);
  };
  countRaf = requestAnimationFrame(frame);
}

/** 两帧后再设宽度，让进度条从 0 伸展（CSS 负责缓动与错峰） */
function revealBars(root) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      root.querySelectorAll('[data-w]').forEach((bar) => {
        bar.style.width = bar.dataset.w + '%';
      });
    }),
  );
}

function syncPresetActive() {
  const v = formulaInput?.value.trim() || '';
  molarPresets?.querySelectorAll('.preset-chip').forEach((el) => {
    el.classList.toggle('is-active', el.dataset.formula === v);
  });
}

function elementBadge(symbol) {
  const el = ELEMENTS_BY_SYMBOL[symbol];
  const zone = el ? blockZoneId(el) : 'p';
  return `<span class="molar-el" data-zone="${zone}">${escapeHtml(symbol)}</span>`;
}

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
  syncPresetActive();
  try {
    const { rows, total, normalized } = calcMolarMass(raw);
    const label = normalizeFormulaInput(raw.trim()) || normalized;
    molarResult.innerHTML = `
      <div class="molar-total">
        <div class="molar-total-left">
          <div class="molar-total-label">摩尔质量</div>
          <div class="molar-total-formula">${formulaHtml(label)}</div>
        </div>
        <div class="molar-total-right">
          <span class="value" data-total>${shownTotal.toFixed(3)}</span><span class="unit">g/mol</span>
        </div>
      </div>
      <table class="molar-table">
        <thead>
          <tr>
            <th>元素</th>
            <th>个数 × 原子质量</th>
            <th class="num">小计</th>
            <th class="molar-share-head">质量分数</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map((r, i) => {
              const share = (r.subtotal / total) * 100;
              return `
            <tr style="--i:${i}">
              <td><div class="molar-el-cell">${elementBadge(r.symbol)}<span class="name">${escapeHtml(r.name)}</span></div></td>
              <td class="mono">${r.count} × ${r.atomicMass}</td>
              <td class="mono num">${r.subtotal.toFixed(3)}</td>
              <td>
                <div class="molar-share">
                  <span class="molar-bar"><i data-zone="${blockZoneId(ELEMENTS_BY_SYMBOL[r.symbol])}" data-w="${share.toFixed(2)}"></i></span>
                  <span class="mono molar-pct">${share.toFixed(1)}%</span>
                </div>
              </td>
            </tr>`;
            })
            .join('')}
        </tbody>
      </table>
    `;
    countTo(molarResult.querySelector('[data-total]'), total);
    revealBars(molarResult);
  } catch (err) {
    formulaInput.classList.add('is-invalid');
    const msg = escapeHtml(err.message || String(err));
    molarResult.innerHTML = `
      <div class="molar-error" role="alert">
        <div class="molar-error-title">无法计算</div>
        <p class="molar-error-msg">${msg}</p>
        <div class="presets molar-try">
          <span>试试</span>
          ${TRY_FORMULAS.map(
            (f) =>
              `<button type="button" class="preset-chip" data-try="${escapeHtml(f)}">${formulaHtml(f)}</button>`,
          ).join('')}
        </div>
        <ul class="molar-error-tips">
          <li>元素符号首字母大写，如 <code>NaCl</code>、<code>H2O</code></li>
          <li>中英文括号均可：<code>Ca(OH)2</code> 或 <code>Ca（OH）2</code></li>
          <li>结晶水可用 <code>·</code> 或 <code>.</code>：<code>CuSO4·5H2O</code></li>
        </ul>
      </div>
    `;
    molarResult.querySelectorAll('[data-try]').forEach((b) => {
      b.addEventListener('click', () => {
        formulaInput.value = b.dataset.try;
        runMolar();
      });
    });
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

  // 按列表顺序；同式只出一次
  const seen = new Set();
  for (const m of molecules) {
    const formula = toInputFormula(m.formula);
    if (!formula) continue;
    if (seen.has(formula)) continue;
    seen.add(formula);

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset-chip';
    b.dataset.formula = formula;
    // 显示带下标；点击填入的仍是可键盘输入的 ASCII
    b.innerHTML = formulaHtml(formula);
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

/**
 * 配平结果：方程式拆成 token（系数依次弹出），再逐元素亮出守恒核对
 * @param {HTMLElement} box
 * @param {{ left: Array, right: Array, equation: string, hint?: string, steps?: Array<string> }} r
 */
function renderBalanceResult(box, { left, right, equation, hint, steps }) {
  const check = checkConservation(equation);
  let k = 0;
  const side = (list) =>
    list
      .map((sp, idx) => {
        const coef = sp.coef > 1 ? String(sp.coef) : '';
        const mark = sp.marker ? `<span class="eq-mark">${escapeHtml(sp.marker)}</span>` : '';
        const html = `<span class="eq-sp" style="--i:${k++}"><span class="eq-coef">${coef}</span>${formulaHtml(sp.formula)}${mark}</span>`;
        return (idx ? '<span class="eq-op">+</span>' : '') + html;
      })
      .join('');
  // 元素按方程式中首次出现的顺序
  const order = [];
  for (const sp of [...left, ...right]) {
    for (const el of Object.keys(sp.counts || {})) if (!order.includes(el)) order.push(el);
  }
  const L = check.left || {};
  const R = check.right || {};
  box.innerHTML = `
    <h4>配平结果</h4>
    <p class="molar-balance-eq" aria-label="${escapeHtml(equation)}">${side(left)}<span class="eq-op eq-eq">=</span>${side(right)}</p>
    <div class="molar-cons" style="--n:${k}" aria-label="逐元素原子守恒核对">
      ${order
        .map((el, i) => {
          const ok = (L[el] || 0) === (R[el] || 0);
          return `<span class="molar-cons-chip ${ok ? 'is-ok' : 'is-err'}" style="--i:${i}">${elementBadge(el)}<span class="mono">${L[el] || 0} = ${R[el] || 0}</span><b aria-hidden="true">${ok ? '✓' : '✗'}</b></span>`;
        })
        .join('')}
    </div>
    <p class="quiz-status ${check.ok ? 'is-ok' : 'is-err'}">${escapeHtml(check.message)}</p>
    ${hint ? `<p class="molar-balance-hint">${escapeHtml(hint)}</p>` : ''}
    <ol class="molar-balance-steps">
      ${(steps || []).map((st) => `<li>${escapeHtml(st)}</li>`).join('')}
    </ol>
  `;
  return check;
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
    const annotate = getAnnotateStateMarkers();
    const result = balanceEquation(input, { annotate });
    const check = box
      ? renderBalanceResult(box, {
          left: result.left,
          right: result.right,
          equation: result.equation,
          hint: annotate ? '状态符号（↑↓）为课本示意，可按题意改写' : '',
          steps: result.steps,
        })
      : checkConservation(result.equation);
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
  const box = $('#balanceResult');
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
    const annotate = getAnnotateStateMarkers();
    // 本地系数权威
    const local = balanceEquation(input, { annotate });
    const merged = suggested
      ? mergeMarkersFromEquation(
          String(suggested),
          {
            left: local.left,
            right: local.right,
          },
          { annotate },
        )
      : { left: local.left, right: local.right };
    const equation = formatEquation(merged.left, merged.right, {
      annotate: false,
    });
    const inputEl = $('#balanceInput');
    if (inputEl) inputEl.value = equation;
    const check = box
      ? renderBalanceResult(box, {
          left: merged.left,
          right: merged.right,
          equation,
          hint: annotate ? '状态符号（↑↓）为课本示意；系数经本地校验，标注已合并 AI 建议' : '',
          steps: Array.isArray(data?.steps) ? data.steps : local.steps || [],
        })
      : checkConservation(equation);
    if (status) {
      status.textContent = check.ok
        ? '已配平并校验守恒（含 AI 建议）'
        : '配平后校验异常';
      status.className = 'quiz-status ' + (check.ok ? 'is-ok' : 'is-err');
    }
  } catch (err) {
    // 无 Key / 失败：降级本地配平
    try {
      runBalanceLocal();
      if (status) {
        status.textContent =
          (status.textContent || '已本地配平') +
          `（AI：${err.message || '不可用'}）`;
      }
    } catch {
      if (status) {
        status.textContent = err.message || 'AI 建议失败，可直接本地配平';
        status.className = 'quiz-status is-err';
      }
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

function setupMolarChemKeypads() {
  const panel = $('#panel-molar');
  if (!panel) return;
  // 摩尔质量 / 配平 / 分步计量 三个输入框共用符号键盘（下标会被摩尔计算自动规范成 ASCII）
  mountChemKeypads(panel, '#formulaInput, #balanceInput, #stoichInput');
}

export function initMolarUI() {
  renderMolarNav();
  selectMolarSection('mass');
  refreshMolarPresets();
  setupMolarChemKeypads();

  $('#btnCalcMolar')?.addEventListener('click', runMolar);

  $('#btnClearMolar')?.addEventListener('click', () => {
    if (!formulaInput || !molarResult) return;
    formulaInput.value = '';
    formulaInput.classList.remove('is-invalid');
    molarResult.innerHTML = `<div class="molar-empty">输入化学式后点击计算</div>`;
    shownTotal = 0;
    syncPresetActive();
    formulaInput.focus();
  });

  formulaInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runMolar();
  });

  formulaInput?.addEventListener('input', () => {
    formulaInput.classList.remove('is-invalid');
    syncPresetActive();
  });

  $('#btnBalance')?.addEventListener('click', runBalanceLocal);
  $('#btnBalanceAi')?.addEventListener('click', runBalanceAi);
  $('#btnStoich')?.addEventListener('click', runStoich);
  $('#balanceInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runBalanceLocal();
  });
}
