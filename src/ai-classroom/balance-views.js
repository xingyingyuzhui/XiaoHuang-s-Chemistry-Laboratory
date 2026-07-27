/**
 * 配平脚本 · HTML 视图（布局对齐实验探究）
 */

import { renderChemKeypadHtml } from '../chem-keypad.js';
import { formatFormula, buildEquation } from './balance-model.js';

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 练习 | 脚本 — 右侧详情标题行 */
export function htmlModeTabs(mode) {
  return `
    <div class="tabs lab-mode-tabs balance-mode-tabs" role="tablist" aria-label="配平视图">
      <button type="button" role="tab" class="tab${mode === 'practice' ? ' active' : ''}"
        data-balance-mode="practice" aria-selected="${mode === 'practice'}">练习</button>
      <button type="button" role="tab" class="tab${mode === 'script' ? ' active' : ''}"
        data-balance-mode="script" aria-selected="${mode === 'script'}">脚本</button>
    </div>`;
}

export function htmlTitleRow({ title, typeLabel, dirty, mode }) {
  return `
    <div class="lab-title-row balance-title-row">
      <div class="lab-title-block">
        <span class="lab-type">${escape(typeLabel || '配平')}</span>
        <h3 class="lab-detail-title">${escape(title || '未命名')}${dirty ? ' ·' : ''}</h3>
      </div>
      ${htmlModeTabs(mode)}
    </div>`;
}

export function htmlEmptyScripts() {
  return '<div class="molar-empty" style="padding:1rem 0.5rem;font-size:0.9rem">暂无脚本，点 ＋ 或 AI 生成</div>';
}

/**
 * 系数数字键盘内容（挂到 body 的 brand-tip 风格气泡内，由 shell 管理）
 * 视觉对齐左上角「课间一句话」气泡
 */
export function htmlCoefKeypadBubbleInner() {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '清空', '0', '⌫'];
  const btns = keys
    .map((k) => {
      const cls = k === '清空' || k === '⌫' ? 'balance-num-key is-action' : 'balance-num-key';
      return `<button type="button" class="${cls}" data-coef-key="${escape(k)}">${escape(k)}</button>`;
    })
    .join('');
  return `
    <div class="brand-tip-card" id="balanceCoefKeypad">
      <div class="brand-tip-head">
        <span class="brand-tip-badge">输入系数</span>
        <button type="button" class="brand-tip-btn brand-tip-btn-close" data-coef-keypad-dismiss>收起</button>
      </div>
      <div class="brand-tip-body balance-coef-keypad-body">
        <div class="balance-coef-keypad-grid">${btns}</div>
      </div>
    </div>
    <span class="brand-tip-arrow" aria-hidden="true"></span>`;
}

/** AI 提示独立展示框（在「AI 提示」按钮右侧） */
function htmlAiTipInline(aiTipText, aiTipLoading) {
  if (aiTipLoading) {
    return `<div class="balance-ai-tip-box is-loading" id="balanceAiTipBox" role="status">思考中…</div>`;
  }
  if (aiTipText) {
    return `<div class="balance-ai-tip-box" id="balanceAiTipBox" role="status">${escape(aiTipText)}</div>`;
  }
  return `<div class="balance-ai-tip-box is-empty" id="balanceAiTipBox" hidden role="status"></div>`;
}

/**
 * 练习主区
 * @param {object} opts
 * @param {string|null} [opts.aiTipText] 当前步骤缓存的 AI 提示（与对错反馈分离）
 * @param {boolean} [opts.aiTipLoading]
 */
export function htmlPracticeBody(script, stepIdx, coefs, stepResult, isLastStep, finished, totalSteps, opts = {}) {
  const aiTipText = opts.aiTipText || '';
  const aiTipLoading = !!opts.aiTipLoading;

  if (!script) {
    return `${htmlTitleRow({ title: '分步配平', typeLabel: '配平', mode: 'practice' })}
      <div class="molar-empty">请选择左侧配平脚本</div>`;
  }
  const step = script.steps?.[stepIdx];
  if (!step) {
    return `${htmlTitleRow({ title: script.title, typeLabel: script.difficulty || '配平', mode: 'practice' })}
      <div class="molar-empty">步骤数据异常</div>`;
  }

  const focusCls = step.focus && !finished
    ? ` is-focus-${escape(step.focus.side)}-${Number(step.focus.index)}`
    : '';
  const eqHtml = renderSpeciesEquation(script.species, coefs, step.focus, finished);

  // 练习提示：避免直接给出期望系数
  const tipText = sanitizePracticeTip(step.tip, step.expectedCoef);
  const aiTipHtml = !finished ? htmlAiTipInline(aiTipText, aiTipLoading) : '';

  let inputHtml = '';
  if (step.action === 'set_coef' && step.focus && !finished) {
    const side = step.focus.side;
    const idx = step.focus.index;
    const currentVal = coefs?.[side]?.[idx] ?? 1;
    const formula = script.species?.[side]?.[idx]?.formula || '';
    inputHtml = `
      <div class="balance-coef-block">
        <div class="balance-coef-input-row">
          <label>将 <strong>${formatFormula(formula)}</strong> 的系数改为</label>
          <input type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off"
                 class="balance-coef-input" id="balanceCoefInput" readonly
                 value="${currentVal}" data-side="${side}" data-index="${idx}"
                 aria-label="系数" />
          <button type="button" class="btn" id="btnBalanceCheckCoef">确认系数</button>
          <button type="button" class="btn ghost" id="btnBalanceAiTip">AI 提示</button>
          ${aiTipHtml}
        </div>
        <p class="balance-coef-hint">点击系数框弹出数字键盘</p>
      </div>`;
  } else if (!finished && step.action !== 'set_coef') {
    inputHtml = `
      <div class="balance-coef-block balance-coef-block-actions">
        <div class="balance-coef-input-row">
          <button type="button" class="btn ghost" id="btnBalanceAiTip">AI 提示</button>
          ${aiTipHtml}
        </div>
      </div>`;
  }

  let feedbackHtml = '';
  if (stepResult === 'correct') {
    feedbackHtml = '<div class="balance-feedback is-ok">系数正确 ✓</div>';
  } else if (stepResult === 'wrong') {
    feedbackHtml = isLastStep
      ? '<div class="balance-feedback is-err">尚未配平正确，请再检查各物种系数</div>'
      : '<div class="balance-feedback is-err">还不对，再想想这一步该改哪个系数</div>';
  }

  let finishHtml = '';
  if (finished) {
    finishHtml = '<div class="balance-feedback is-ok">整式配平完成！守恒校验通过。</div>';
  }

  return `
    ${htmlTitleRow({
      title: script.title,
      typeLabel: script.difficulty || script.grade || '配平',
      mode: 'practice',
    })}
    <div class="balance-practice">
      <div class="balance-equation-hero${focusCls}" id="balanceEquationHero" aria-label="当前方程式">
        ${eqHtml}
      </div>
      <div class="balance-step-nav">
        <div class="balance-step-progress-bar">
          <div class="balance-step-progress-fill" style="width:${totalSteps ? Math.round(((stepIdx + (finished ? 1 : 0)) / totalSteps) * 100) : 0}%"></div>
        </div>
        <span class="balance-step-indicator">第 ${stepIdx + 1} / ${totalSteps} 步</span>
      </div>
      <div class="balance-step-card">
        <h4 class="balance-step-label">${escape(step.label)}</h4>
        <p class="balance-step-tip">${escape(tipText)}</p>
        ${inputHtml}
        ${feedbackHtml}
        ${finishHtml}
      </div>
      <div class="balance-practice-actions">
        ${stepIdx > 0 && !finished ? '<button type="button" class="btn ghost" id="btnBalancePrev">上一步</button>' : ''}
        ${!isLastStep && !finished ? '<button type="button" class="btn" id="btnBalanceNext">下一步</button>' : ''}
        ${isLastStep && !finished ? '<button type="button" class="btn" id="btnBalanceCheckAll">检查整式</button>' : ''}
        ${finished ? '<button type="button" class="btn ghost" id="btnBalanceRestart">重新开始</button>' : ''}
      </div>
    </div>`;
}

/** 去掉明显剧透期望系数的表述（练习时展示） */
export function sanitizePracticeTip(tip, expectedCoef) {
  let t = String(tip || '');
  if (expectedCoef != null) {
    const n = Number(expectedCoef);
    if (Number.isFinite(n)) {
      t = t
        .replace(new RegExp(`系数\\s*(改为|改成|取|设为|是)\\s*${n}`, 'g'), '系数调整到合适的整数')
        .replace(new RegExp(`改为\\s*${n}`, 'g'), '改为合适的整数')
        .replace(new RegExp(`改成\\s*${n}`, 'g'), '改成合适的整数')
        .replace(new RegExp(`取\\s*${n}`, 'g'), '取合适的整数')
        .replace(new RegExp(`×\\s*${n}`, 'g'), '×？')
        .replace(new RegExp(`(?<![\\d.])${n}(?![\\d.])`, 'g'), (m, offset, str) => {
          // 仅当附近像在说系数时弱化；简单策略：若前后有「系数」则替换
          const slice = str.slice(Math.max(0, offset - 4), offset + 4);
          if (/系数|改为|改成|取/.test(slice)) return '？';
          return m;
        });
    }
  }
  // 隐藏完整结果式
  t = t.replace(/结果[：:].+$/g, '配平后请自行检验左右原子是否守恒。');
  t = t.replace(/\d+\s*[A-Z][a-z]?(?:\d+)?(?:\s*\+\s*\d*\s*[A-Z][a-z]?(?:\d+)?)*\s*(→|=)\s*.+$/g, '请根据守恒自行得出完整配平式。');
  return t.trim() || '仔细比较该元素在左右两边的原子个数，再试着改系数。';
}

export function renderSpeciesEquation(species, coefs, focus, finished) {
  if (!species) return '<span class="balance-eq-text">—</span>';
  const sideHtml = (sideKey, arr) =>
    (arr || []).map((sp, i) => {
      const c = coefs?.[sideKey]?.[i] ?? sp.coef ?? 1;
      const focused = !finished && focus && focus.side === sideKey && focus.index === i;
      const safeCoef = Number.isFinite(Number(c)) ? Number(c) : 1;
      const coefStr = safeCoef > 1 ? `<strong class="balance-coef">${safeCoef}</strong>` : '';
      // 先 escape 再下标，避免恶意 formula 注入 HTML
      const formulaHtml = formatFormula(escape(sp.formula));
      return `<span class="balance-species${focused ? ' is-focused' : ''}" data-side="${escape(sideKey)}" data-index="${i}">${coefStr}${formulaHtml}</span>`;
    }).join('<span class="balance-plus">+</span>');

  return `
    <div class="balance-eq-line">
      <span class="balance-eq-side">${sideHtml('left', species.left)}</span>
      <span class="balance-eq-arrow">→</span>
      <span class="balance-eq-side">${sideHtml('right', species.right)}</span>
    </div>`;
}

/**
 * 脚本编辑（布局/组件 class 对齐实验探究 htmlScriptBody）
 * @param {object} draft
 * @param {number} selectedStep
 * @param {string} [mode]
 * @param {{ stepEditMode?: boolean, dirty?: boolean, saving?: boolean }} [opts]
 */
export function htmlScriptEditor(draft, selectedStep, mode = 'script', opts = {}) {
  const stepEditMode = !!opts.stepEditMode;
  const dirty = !!opts.dirty;
  const saving = !!opts.saving;

  if (!draft) {
    return `${htmlTitleRow({ title: '脚本编辑', typeLabel: '配平', mode })}
      <div class="molar-empty">请新建或选择左侧脚本</div>`;
  }

  let sel = Number(selectedStep) || 0;
  const steps = draft.steps || [];
  if (sel < 0) sel = 0;
  if (sel >= steps.length) sel = Math.max(0, steps.length - 1);
  const current = steps[sel] || {};
  const typeLabel = draft.isNew ? '新脚本' : (draft.difficulty || '脚本');

  // 与实验探究相同：左侧步骤卡 + 编辑态删除叉 + 无英文 action 标签
  const listHtml = steps.map((s, i) => {
    const label = String(s.label || '').trim() || `步骤 ${i + 1}`;
    return `<div class="lab-step-nav-card${i === sel ? ' is-active' : ''}${stepEditMode ? ' is-editing' : ''}" data-script-step="${i}" draggable="${stepEditMode ? 'true' : 'false'}">
      <button type="button" class="lab-nav-del" data-step-del="${i}" title="删除步骤" aria-label="删除步骤">×</button>
      <button type="button" class="lab-step-nav-item" data-script-pick="${i}">
        <span class="lab-step-n">${i + 1}</span>
        <span class="lab-step-nav-label">${escape(label)}</span>
      </button>
    </div>`;
  }).join('');

  return `
    ${htmlTitleRow({
      title: draft.title || (draft.isNew ? '新配平脚本' : '未命名'),
      typeLabel,
      dirty,
      mode,
    })}
    <div class="balance-script-detail lab-script-detail">
      <div class="lab-script-meta">
        <label class="field"><span>标题</span>
          <input type="text" class="lab-input" id="balanceEditTitle" value="${escape(draft.title)}" maxlength="80" placeholder="如：氢氧燃烧" />
        </label>
        <label class="field"><span>年级</span>
          <input type="text" class="lab-input" id="balanceEditGrade" value="${escape(draft.grade)}" maxlength="20" placeholder="高一" />
        </label>
        <label class="field"><span>难度</span>
          <input type="text" class="lab-input" id="balanceEditDifficulty" value="${escape(draft.difficulty)}" maxlength="20" placeholder="入门" />
        </label>
        <label class="field field-span2 lab-equation-field">
          <span>起式（未配平）</span>
          <input type="text" class="lab-input" id="balanceEditStart" value="${escape(draft.startEquation)}" maxlength="200"
                 placeholder="字母用键盘；下标/箭头点下方符号" autocomplete="off" />
          ${renderChemKeypadHtml('bal-start')}
        </label>
        <label class="field field-span2 lab-equation-field">
          <span>目标式（已配平，须守恒）</span>
          <input type="text" class="lab-input" id="balanceEditTarget" value="${escape(draft.targetEquation)}" maxlength="200"
                 placeholder="2H₂ + O₂ → 2H₂O" autocomplete="off" />
          ${renderChemKeypadHtml('bal-target')}
        </label>
      </div>

      <div class="lab-script-workspace">
        <div class="lab-step-nav-panel">
          <div class="lab-nav-toolbar lab-step-toolbar">
            <button type="button" class="lab-tool-btn lab-tool-add" id="btnBalanceAddStep" title="添加步骤">＋</button>
            <button type="button" class="lab-tool-btn lab-tool-edit${stepEditMode ? ' is-active' : ''}" id="btnBalanceStepListEdit">${stepEditMode ? '保存' : '编辑'}</button>
          </div>
          <div class="lab-step-nav-list${stepEditMode ? ' is-edit-mode' : ''}" id="balanceStepsList" role="list">${listHtml}</div>
        </div>
        <div class="lab-step-editor" id="balanceStepDetail">
          ${htmlStepDetail(current, sel)}
        </div>
      </div>

      <div class="lab-script-actions">
        <button type="button" class="btn" id="btnBalanceSave" ${saving ? 'disabled' : ''}>${saving ? '保存中…' : '保存脚本'}</button>
        ${!draft.isNew && draft.id && String(draft.id).startsWith('bal-')
          ? '<button type="button" class="btn ghost" id="btnBalanceResetOne">恢复内置</button>'
          : ''}
        ${dirty ? '<span class="quiz-muted">有未保存修改</span>' : ''}
      </div>
    </div>`;
}

function htmlStepDetail(step, stepIndex = 0) {
  const n = Number(stepIndex) + 1;
  return `
    <h4 class="lab-steps-heading">步骤 ${n}</h4>
    <label class="field"><span>步骤标题</span>
      <input type="text" class="lab-input" id="balanceStepLabel" value="${escape(step.label || '')}" maxlength="60" placeholder="如：配平铁" />
    </label>
    <label class="field lab-equation-field">
      <span>提示文案（练习时会弱化具体数字答案）</span>
      <textarea class="lab-input" id="balanceStepTip" maxlength="400" rows="3"
                placeholder="讲解思路，尽量不要直接写最终系数…">${escape(step.tip || '')}</textarea>
      ${renderChemKeypadHtml('bal-tip')}
    </label>
    <label class="field"><span>动作</span>
      <select class="lab-input" id="balanceStepAction">
        <option value="explain"${step.action === 'explain' ? ' selected' : ''}>讲解（只读）</option>
        <option value="set_coef"${step.action === 'set_coef' ? ' selected' : ''}>改系数</option>
        <option value="check"${step.action === 'check' ? ' selected' : ''}>检查</option>
      </select>
    </label>
    <div class="lab-script-meta" id="balanceFocusFields" style="margin-bottom:0" ${step.action === 'set_coef' ? '' : 'hidden'}>
      <label class="field"><span>侧</span>
        <select class="lab-input" id="balanceStepSide">
          <option value="left"${step.focus?.side === 'left' ? ' selected' : ''}>左侧</option>
          <option value="right"${step.focus?.side === 'right' ? ' selected' : ''}>右侧</option>
        </select>
      </label>
      <label class="field"><span>物种下标（从 0 起）</span>
        <input type="number" class="lab-input" id="balanceStepFocusIdx" value="${step.focus?.index ?? 0}" min="0" max="10" />
      </label>
      <label class="field field-span2" id="balanceExpectedField">
        <span>期望系数（校验用，练习提示会隐藏）</span>
        <input type="number" class="lab-input" id="balanceStepExpected" value="${step.expectedCoef ?? ''}" min="1" max="12" placeholder="留空不校验" />
      </label>
    </div>`;
}
