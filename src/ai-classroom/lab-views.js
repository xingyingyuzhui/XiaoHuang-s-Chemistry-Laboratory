/**
 * 实验探究：纯 HTML 视图片段（无 DOM 绑定、不读全局状态）
 * 控制器负责传参与事件。
 */

import { renderChemKeypadHtml } from '../chem-keypad.js';
import { emptyStep, prestudySteps } from './lab-model.js';

/**
 * @param {{ mode: string, hasPre: boolean }} p
 */
export function htmlModePills({ mode, hasPre }) {
  return `
    <div class="tabs lab-mode-tabs" role="tablist" aria-label="实验视图">
      <button type="button" role="tab" class="tab${mode === 'prestudy' ? ' active' : ''}"
        data-lab-mode="prestudy" ${!hasPre ? 'disabled title="暂无预习题，请在脚本中为步骤开启预测题"' : ''}
        aria-selected="${mode === 'prestudy'}">预习</button>
      <button type="button" role="tab" class="tab${mode === 'script' ? ' active' : ''}"
        data-lab-mode="script" aria-selected="${mode === 'script'}">脚本</button>
    </div>`;
}

/**
 * @param {object} p
 * @param {(s: string) => string} p.escapeHtml
 */
export function htmlTitleRow({
  escapeHtml,
  title,
  type,
  equation,
  phenomena,
  safety,
  dirty,
  mode,
  hasPre,
}) {
  return `
    <div class="lab-title-row">
      <div class="lab-title-block">
        <span class="lab-type">${escapeHtml(type || '实验')}</span>
        <h3 class="lab-detail-title">${escapeHtml(title || '未命名')}${dirty ? ' ·' : ''}</h3>
      </div>
      ${htmlModePills({ mode, hasPre })}
    </div>
    ${equation ? `<p class="lab-eq">${escapeHtml(equation)}</p>` : ''}
    ${mode === 'prestudy' ? `
    <div class="lab-meta">
      <div class="lab-meta-item"><span>现象</span><strong>${escapeHtml(phenomena || '—')}</strong></div>
      <div class="lab-meta-item"><span>安全</span><strong>${escapeHtml(safety || '—')}</strong></div>
    </div>` : ''}`;
}

/**
 * @param {object} p
 * @param {(s: string) => string} p.escapeHtml
 * @param {object} p.step
 * @param {number} p.sIdx
 * @param {object} [p.saved] { chosen, correct }
 */
export function htmlPredict({ escapeHtml, step, sIdx, saved }) {
  const p = step.predict;
  if (!p) return '<p class="quiz-muted">本步无预测题，可直接下一步。</p>';
  const answered = saved !== undefined;
  const correct = saved?.correct;
  const chosenIdx = saved?.chosen;

  const opts = (p.options || []).map((opt, oi) => {
    let cls = 'quiz-opt';
    if (answered) {
      if (oi === p.answer) cls += ' is-correct';
      if (oi === chosenIdx && !correct) cls += ' is-wrong';
      if (oi === chosenIdx) cls += ' is-selected';
    }
    return `<button type="button" class="${cls}" data-prestudy-step="${sIdx}" data-prestudy-opt="${oi}" ${answered ? 'disabled' : ''}>
      <strong>${String.fromCharCode(65 + oi)}.</strong> ${escapeHtml(opt)}
    </button>`;
  }).join('');

  let feedback = '';
  if (answered) {
    feedback = `<p class="quiz-feedback ${correct ? 'is-ok' : 'is-err'}">${correct ? '回答正确' : `回答错误，正确答案是 ${String.fromCharCode(65 + p.answer)}`}</p>
      <p class="prestudy-explain">${escapeHtml(p.explanation || '')}</p>`;
  }

  return `<div class="prestudy-predict">
    <p class="prestudy-predict-q">${escapeHtml(p.question || '')}</p>
    <div class="quiz-options">${opts}</div>
    ${feedback}
  </div>`;
}

/**
 * @returns {{ html: string, stepIdx: number }}
 */
export function htmlPrestudyBody({
  escapeHtml,
  lab,
  stepIdx: stepIdxIn,
  stepResults,
}) {
  const config = lab.prestudy;
  const steps = prestudySteps(lab);
  if (!steps.length) {
    return {
      stepIdx: 0,
      html: `
        <div class="prestudy-notice">该实验暂无互动预习。请切换到「脚本」为步骤开启预测题并保存。</div>
        <button type="button" class="btn btn-sm" data-lab-mode="script">打开脚本</button>`,
    };
  }

  let stepIdx = stepIdxIn;
  if (stepIdx < 0) stepIdx = 0;
  if (stepIdx >= steps.length) stepIdx = steps.length - 1;

  const step = steps[stepIdx];
  const completedCount = Object.keys(stepResults).length;
  const allDone = completedCount === steps.length;
  const answered = stepResults[stepIdx] !== undefined;
  const canNext = stepIdx < steps.length - 1 && (answered || !step.predict);
  const canPrev = stepIdx > 0;
  const pct = Math.round(((stepIdx + (answered ? 1 : 0)) / steps.length) * 100);

  let materials = '';
  if (config?.objective) {
    materials += `<div class="prestudy-info"><strong>实验目标：</strong>${escapeHtml(config.objective)}</div>`;
  }
  if (config?.reagents?.length || config?.apparatus?.length) {
    const parts = [];
    if (config?.reagents?.length) {
      parts.push(`<span class="prestudy-info-item"><strong>试剂：</strong>${escapeHtml(config.reagents.join('、'))}</span>`);
    }
    if (config?.apparatus?.length) {
      parts.push(`<span class="prestudy-info-item"><strong>器材：</strong>${escapeHtml(config.apparatus.join('、'))}</span>`);
    }
    materials += `<div class="prestudy-info prestudy-info-row">${parts.join('<span class="prestudy-info-sep" aria-hidden="true">·</span>')}</div>`;
  }

  const html = `
    ${stepIdx === 0 ? materials : ''}
    <div class="prestudy-progress-row">
      <div class="prestudy-progress-bar"><div class="prestudy-progress-fill" style="width:${Math.min(100, pct)}%"></div></div>
      <span class="prestudy-progress-label">第 ${stepIdx + 1} / ${steps.length} 步 · 已答 ${completedCount}</span>
    </div>
    <div class="prestudy-page">
      <div class="prestudy-page-head">
        <span class="prestudy-step-n">${answered ? '✓' : stepIdx + 1}</span>
        <strong class="prestudy-page-title">${escapeHtml(step.label || `步骤 ${stepIdx + 1}`)}</strong>
        ${step.tip ? `<span class="prestudy-page-tip">${escapeHtml(step.tip)}</span>` : ''}
      </div>
      ${htmlPredict({ escapeHtml, step, sIdx: stepIdx, saved: stepResults[stepIdx] })}
      ${step.risk ? `<div class="prestudy-risk"><strong>注意：</strong>${escapeHtml(step.risk)}</div>` : ''}
    </div>
    <div class="prestudy-pager">
      <button type="button" class="btn ghost btn-sm" id="btnPrestudyPrev" ${canPrev ? '' : 'disabled'}>上一步</button>
      ${canNext ? '<button type="button" class="btn btn-sm" id="btnPrestudyNext">下一步</button>' : ''}
      ${allDone && stepIdx === steps.length - 1 ? '<button type="button" class="btn" data-lab-mode="script">对照阅读脚本</button>' : ''}
    </div>
    ${allDone && config?.summary && stepIdx === steps.length - 1
      ? `<div class="prestudy-summary"><strong>总结：</strong>${escapeHtml(config.summary)}</div>
         <button type="button" class="btn ghost btn-sm" id="btnPrestudyRestart">重新开始预习</button>`
      : ''}`;

  return { html, stepIdx };
}

/**
 * @param {object} p
 * @param {(s: string) => string} p.escapeHtml
 * @param {object} p.draft
 * @param {number} p.selectedStep
 * @param {boolean} p.stepEditMode
 * @param {boolean} p.saving
 * @param {boolean} p.dirty
 */
export function htmlScriptBody({
  escapeHtml,
  draft,
  selectedStep: selectedStepIn,
  stepEditMode,
  saving,
  dirty,
}) {
  if (!draft) return { html: '<p class="quiz-muted">无法加载脚本</p>', selectedStep: 0 };

  let selectedStep = selectedStepIn;
  if (selectedStep < 0) selectedStep = 0;
  if (selectedStep >= draft.steps.length) selectedStep = Math.max(0, draft.steps.length - 1);
  const st = draft.steps[selectedStep] || emptyStep();

  const listHtml = draft.steps.map((step, i) => {
    const label = step.label?.trim() || `步骤 ${i + 1}`;
    return `<div class="lab-step-nav-card${i === selectedStep ? ' is-active' : ''}${stepEditMode ? ' is-editing' : ''}" data-script-step="${i}" draggable="${stepEditMode ? 'true' : 'false'}">
      <button type="button" class="lab-nav-del" data-step-del="${i}" title="删除步骤" aria-label="删除步骤">×</button>
      <button type="button" class="lab-step-nav-item" data-script-pick="${i}">
        <span class="lab-step-n">${i + 1}</span>
        <span class="lab-step-nav-label">${escapeHtml(label)}</span>
      </button>
    </div>`;
  }).join('');

  const answerOpts = [0, 1, 2, 3].map((i) =>
    `<option value="${i}" ${Number(st.answer) === i ? 'selected' : ''}>${String.fromCharCode(65 + i)}</option>`,
  ).join('');

  const optFields = [0, 1, 2, 3].map((i) =>
    `<label class="field lab-opt-field"><span>选项 ${String.fromCharCode(65 + i)}</span>
      <input type="text" class="lab-input" data-draft-opt="${i}" value="${escapeHtml(st.options[i] || '')}" /></label>`,
  ).join('');

  const html = `
    <div class="lab-script-meta">
      <label class="field"><span>名称</span><input type="text" class="lab-input" id="draftTitle" value="${escapeHtml(draft.title)}" /></label>
      <label class="field"><span>类型</span><input type="text" class="lab-input" id="draftType" value="${escapeHtml(draft.type)}" placeholder="如：气体制备" /></label>
      <label class="field field-span2 lab-equation-field">
        <span>方程式</span>
        <input type="text" class="lab-input" id="draftEquation" value="${escapeHtml(draft.equation)}" placeholder="字母用键盘；下标/箭头点下方符号" autocomplete="off" />
        ${renderChemKeypadHtml('lab-eq')}
      </label>
      <label class="field"><span>现象</span><input type="text" class="lab-input" id="draftPhenomena" value="${escapeHtml(draft.phenomena)}" /></label>
      <label class="field field-span2"><span>安全</span><input type="text" class="lab-input" id="draftSafety" value="${escapeHtml(draft.safety)}" /></label>
    </div>

    <div class="lab-script-workspace">
      <div class="lab-step-nav-panel">
        <div class="lab-nav-toolbar lab-step-toolbar">
          <button type="button" class="lab-tool-btn lab-tool-add" id="btnStepAdd" title="添加步骤">＋</button>
          <button type="button" class="lab-tool-btn lab-tool-edit${stepEditMode ? ' is-active' : ''}" id="btnStepListEdit">${stepEditMode ? '保存' : '编辑'}</button>
        </div>
        <div class="lab-step-nav-list${stepEditMode ? ' is-edit-mode' : ''}" role="list">${listHtml}</div>
      </div>
      <div class="lab-step-editor">
        <h4 class="lab-steps-heading">步骤 ${selectedStep + 1}</h4>
        <label class="field"><span>步骤标题</span><input type="text" class="lab-input" id="draftStepLabel" value="${escapeHtml(st.label)}" placeholder="如：组装装置" /></label>
        <label class="field"><span>脚本提示</span><textarea class="lab-input" id="draftStepTip" rows="2" placeholder="操作要点、键变化等">${escapeHtml(st.tip)}</textarea></label>
        <label class="field"><span>安全注意（可选）</span><input type="text" class="lab-input" id="draftStepRisk" value="${escapeHtml(st.risk)}" /></label>
        <label class="lab-check">
          <input type="checkbox" id="draftEnablePredict" ${st.enablePredict ? 'checked' : ''} />
          <span>本步含预习预测题</span>
        </label>
        <div class="lab-predict-editor" id="draftPredictBlock" ${st.enablePredict ? '' : 'hidden'}>
          <label class="field"><span>题目</span><input type="text" class="lab-input" id="draftQuestion" value="${escapeHtml(st.question)}" /></label>
          ${optFields}
          <label class="field"><span>正确答案</span><select class="lab-input" id="draftAnswer">${answerOpts}</select></label>
          <label class="field"><span>解释</span><textarea class="lab-input" id="draftExplanation" rows="2">${escapeHtml(st.explanation)}</textarea></label>
        </div>
      </div>
    </div>

    <details class="lab-prestudy-meta">
      <summary>预习总述（目标 / 试剂 / 器材 / 总结）</summary>
      <div class="lab-script-meta" style="margin-top:0.5rem">
        <label class="field field-span2"><span>实验目标</span><input type="text" class="lab-input" id="draftObjective" value="${escapeHtml(draft.objective)}" /></label>
        <label class="field"><span>试剂（顿号分隔）</span><input type="text" class="lab-input" id="draftReagents" value="${escapeHtml(draft.reagents)}" /></label>
        <label class="field"><span>器材（顿号分隔）</span><input type="text" class="lab-input" id="draftApparatus" value="${escapeHtml(draft.apparatus)}" /></label>
        <label class="field field-span2"><span>总结</span><textarea class="lab-input" id="draftSummary" rows="2">${escapeHtml(draft.summary)}</textarea></label>
      </div>
    </details>

    <div class="lab-script-actions">
      <button type="button" class="btn" id="btnDraftSave" ${saving ? 'disabled' : ''}>${saving ? '保存中…' : '保存脚本'}</button>
      ${!draft.isNew && draft.source === 'builtin' ? '<button type="button" class="btn ghost" id="btnDraftReset">恢复内置</button>' : ''}
      ${dirty ? '<span class="quiz-muted">有未保存修改</span>' : ''}
    </div>`;

  return { html, selectedStep };
}

export function htmlEmptyLabs() {
  return `
    <div class="molar-empty">
      <p>还没有实验</p>
      <button type="button" class="btn" id="btnLabEmptyAdd">新建实验</button>
      <button type="button" class="btn ghost" id="btnLabEmptyImport">导入实验包</button>
      <button type="button" class="btn ghost" id="btnLabEmptyReset">恢复内置实验</button>
    </div>`;
}
