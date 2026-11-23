/**
 * 实验探究：脚本页编辑器（草稿构建 / 表单同步 / 步骤增删拖拽 / 符号键盘 / 保存与重置）
 */

import { bindChemKeypad } from '../chem-keypad.js';
import { appAlert, appConfirm } from '../app-dialog.js';
import { emptyStep, labToDraft, draftToPayload } from './lab-model.js';
import { htmlScriptBody } from './lab-views.js';

export function createLabShellEditor(ctx) {
  const { select, escapeHtml, state, labsApi, currentLab, loadLabs, render } = ctx;

  function beginScriptDraft(lab) {
    state.draft = labToDraft(lab);
    state.selectedStep = 0;
    state.dirty = !!state.draft.isNew;
  }

  function renderScriptBody() {
    const built = htmlScriptBody({
      escapeHtml,
      draft: state.draft,
      selectedStep: state.selectedStep,
      stepEditMode: state.stepEditMode,
      saving: state.saving,
      dirty: state.dirty,
    });
    state.selectedStep = built.selectedStep;
    return built.html;
  }

  /** 确认放弃后重置草稿（与切到预习时一致） */
  function discardUnsaved() {
    state.dirty = false;
    state.saving = false;
    state.stepEditMode = false;
    if (state.labId) {
      beginScriptDraft(currentLab());
      state.dirty = false;
    } else {
      state.draft = null;
    }
  }

  function readDraftFieldsFromDom() {
    const draft = state.draft;
    if (!draft) return;
    const pairs = [
      ['#draftTitle', 'title'],
      ['#draftType', 'type'],
      ['#draftEquation', 'equation'],
      ['#draftPhenomena', 'phenomena'],
      ['#draftSafety', 'safety'],
      ['#draftObjective', 'objective'],
      ['#draftReagents', 'reagents'],
      ['#draftApparatus', 'apparatus'],
      ['#draftSummary', 'summary'],
    ];
    for (const [sel, key] of pairs) {
      const el = select(sel);
      if (el) draft[key] = el.value;
    }

    const st = draft.steps[state.selectedStep];
    if (!st) return;
    const stepPairs = [
      ['#draftStepLabel', 'label'],
      ['#draftStepTip', 'tip'],
      ['#draftStepRisk', 'risk'],
      ['#draftQuestion', 'question'],
      ['#draftExplanation', 'explanation'],
    ];
    for (const [sel, key] of stepPairs) {
      const el = select(sel);
      if (el) st[key] = el.value;
    }
    const en = select('#draftEnablePredict');
    if (en) st.enablePredict = en.checked;
    select('#labDetail')?.querySelectorAll('[data-draft-opt]').forEach((inp) => {
      st.options[Number(inp.dataset.draftOpt)] = inp.value;
    });
    const ans = select('#draftAnswer');
    if (ans) st.answer = Number(ans.value) || 0;
  }

  function markDirtyAndRefreshPredict() {
    state.dirty = true;
    readDraftFieldsFromDom();
    const block = select('#draftPredictBlock');
    const en = select('#draftEnablePredict');
    if (block && en) block.hidden = !en.checked;
  }

  /** 方程式输入框旁的「符号」按钮开合 Unicode 化学符号软键盘 */
  function bindEquationKeypad(detail) {
    const input = detail.querySelector('#draftEquation');
    const keypad = detail.querySelector('.chem-keypad');
    if (!input || !keypad) return;
    bindChemKeypad(input, keypad, {
      onInsert: (value) => {
        state.dirty = true;
        if (state.draft) state.draft.equation = value;
      },
    });
  }

  async function saveDraft() {
    if (!state.draft || state.saving) return;
    readDraftFieldsFromDom();
    const built = draftToPayload(state.draft);
    if (!built.ok) {
      await appAlert(built.reason || '请完善实验内容');
      return;
    }
    const payload = built.payload;
    state.saving = true;
    // 只更新按钮文案，避免整页重绘打断
    const saveBtn = select('#btnDraftSave');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
    }
    try {
      if (state.draft.isNew) {
        const created = await labsApi.create(payload);
        state.labId = created?.id || state.labId;
      } else {
        await labsApi.update(state.labId, payload);
      }
      state.dirty = false;
      state.draft = null;
      state.mode = 'script';
      state.statusMsg = '';
      state.saving = false;
      await loadLabs({ keepSelection: true });
    } catch (err) {
      state.saving = false;
      await appAlert(`保存失败：${err.message || ''}`);
      render();
    }
  }

  async function resetOne() {
    if (!state.labId) return;
    if (!(await appConfirm('恢复为内置版本？当前未保存和已保存的修改都会被覆盖。'))) return;
    try {
      await labsApi.resetOne(state.labId);
      state.dirty = false;
      state.draft = null;
      await loadLabs();
    } catch (err) {
      await appAlert(`重置失败：${err.message || ''}`);
    }
  }

  async function bindScriptEditor(detail) {
    const onMeta = () => {
      state.dirty = true;
      readDraftFieldsFromDom();
    };
    ['draftTitle', 'draftType', 'draftEquation', 'draftPhenomena', 'draftSafety',
      'draftObjective', 'draftReagents', 'draftApparatus', 'draftSummary',
      'draftStepLabel', 'draftStepTip', 'draftStepRisk', 'draftQuestion',
      'draftAnswer', 'draftExplanation'].forEach((id) => {
      const el = detail.querySelector(`#${id}`);
      if (el) el.addEventListener('input', onMeta);
      if (el && el.tagName === 'SELECT') el.addEventListener('change', onMeta);
    });
    detail.querySelectorAll('[data-draft-opt]').forEach((inp) => {
      inp.addEventListener('input', onMeta);
    });
    detail.querySelector('#draftEnablePredict')?.addEventListener('change', () => {
      markDirtyAndRefreshPredict();
    });

    detail.querySelectorAll('[data-script-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (state.stepEditMode) return;
        readDraftFieldsFromDom();
        state.selectedStep = Number(btn.dataset.scriptPick);
        render();
      });
    });

    detail.querySelector('#btnStepAdd')?.addEventListener('click', async () => {
      readDraftFieldsFromDom();
      if (state.stepEditMode) state.stepEditMode = false;
      state.draft.steps.push(emptyStep());
      state.selectedStep = state.draft.steps.length - 1;
      state.dirty = true;
      render();
    });
    detail.querySelector('#btnStepListEdit')?.addEventListener('click', async () => {
      readDraftFieldsFromDom();
      state.stepEditMode = !state.stepEditMode;
      render();
    });

    detail.querySelectorAll('[data-step-del]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!state.stepEditMode) return;
        if (state.draft.steps.length <= 1) {
          await appAlert('至少保留一个步骤');
          return;
        }
        if (!(await appConfirm('删除该步骤？'))) return;
        readDraftFieldsFromDom();
        const i = Number(btn.dataset.stepDel);
        state.draft.steps.splice(i, 1);
        if (state.selectedStep >= state.draft.steps.length) {
          state.selectedStep = state.draft.steps.length - 1;
        } else if (state.selectedStep > i) {
          state.selectedStep -= 1;
        }
        state.dirty = true;
        render();
      });
    });

    if (state.stepEditMode) {
      bindStepDragReorder(detail);
    }

    detail.querySelector('#btnDraftSave')?.addEventListener('click', () => saveDraft());
    detail.querySelector('#btnDraftReset')?.addEventListener('click', () => resetOne());
    bindEquationKeypad(detail);
  }

  function bindStepDragReorder(detail) {
    let dragFrom = null;
    detail.querySelectorAll('.lab-step-nav-card[data-script-step]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        dragFrom = Number(card.dataset.scriptStep);
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        dragFrom = null;
        card.classList.remove('is-dragging');
        detail.querySelectorAll('.lab-step-nav-card').forEach((c) => c.classList.remove('drag-over'));
      });
      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('drag-over');
      });
      card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        const to = Number(card.dataset.scriptStep);
        if (dragFrom == null || dragFrom === to) return;
        readDraftFieldsFromDom();
        const [item] = state.draft.steps.splice(dragFrom, 1);
        state.draft.steps.splice(to, 0, item);
        state.selectedStep = to;
        state.dirty = true;
        render();
      });
    });
  }

  return {
    beginScriptDraft,
    renderScriptBody,
    discardUnsaved,
    bindScriptEditor,
  };
}
