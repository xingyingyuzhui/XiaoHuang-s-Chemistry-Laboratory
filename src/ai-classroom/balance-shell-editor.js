/**
 * 配平脚本 · 脚本编辑视图（字段绑定、步骤列表/拖拽、化学键盘、保存与重置）
 */

import { scriptToDraft, draftToPayload, emptyStep } from './balance-model.js';
import { bindChemKeypad } from '../chem-keypad.js';
import { appAlert, appConfirm } from '../app-dialog.js';
import { htmlScriptEditor } from './balance-views.js';

export function renderScriptEditor(ctx) {
  const { select } = ctx;
  const body = select('#balanceDetail');
  if (!body) return;
  body.innerHTML = htmlScriptEditor(ctx.draft, ctx.selectedStep, 'script', {
    stepEditMode: ctx.stepEditMode,
    dirty: ctx.dirty,
    saving: ctx.saving,
  });
  ctx.bindModeTabs(body);
  bindEditorEvents(ctx, body);
}

async function bindEditorEvents(ctx, detail) {
  const { select } = ctx;
  const root = detail || select('#balanceDetail');
  if (!root || !ctx.draft) return;

  const onField = (id, fn) => {
    const el = root.querySelector(`#${id}`);
    if (!el) return;
    el.addEventListener('input', fn);
    if (el.tagName === 'SELECT') el.addEventListener('change', fn);
  };

  onField('balanceEditTitle', () => {
    ctx.draft.title = select('#balanceEditTitle')?.value || '';
    ctx.dirty = true;
  });
  onField('balanceEditGrade', () => {
    ctx.draft.grade = select('#balanceEditGrade')?.value || '';
    ctx.dirty = true;
  });
  onField('balanceEditDifficulty', () => {
    ctx.draft.difficulty = select('#balanceEditDifficulty')?.value || '';
    ctx.dirty = true;
  });
  onField('balanceEditStart', () => {
    ctx.draft.startEquation = select('#balanceEditStart')?.value || '';
    ctx.dirty = true;
  });
  onField('balanceEditTarget', () => {
    ctx.draft.targetEquation = select('#balanceEditTarget')?.value || '';
    ctx.dirty = true;
  });

  onField('balanceStepLabel', () => {
    if (ctx.draft.steps[ctx.selectedStep]) {
      ctx.draft.steps[ctx.selectedStep].label = select('#balanceStepLabel')?.value || '';
    }
    ctx.dirty = true;
  });
  onField('balanceStepTip', () => {
    if (ctx.draft.steps[ctx.selectedStep]) {
      ctx.draft.steps[ctx.selectedStep].tip = select('#balanceStepTip')?.value || '';
    }
    ctx.dirty = true;
  });

  const stepAction = select('#balanceStepAction');
  if (stepAction) {
    stepAction.addEventListener('change', () => {
      syncCurrentStep(ctx);
      if (ctx.draft.steps[ctx.selectedStep]) {
        ctx.draft.steps[ctx.selectedStep].action = stepAction.value;
        if (stepAction.value !== 'set_coef') {
          ctx.draft.steps[ctx.selectedStep].focus = null;
          ctx.draft.steps[ctx.selectedStep].expectedCoef = null;
        } else if (!ctx.draft.steps[ctx.selectedStep].focus) {
          ctx.draft.steps[ctx.selectedStep].focus = { side: 'left', index: 0 };
        }
      }
      ctx.dirty = true;
      renderScriptEditor(ctx);
    });
  }

  const updateFocus = () => {
    if (!ctx.draft.steps[ctx.selectedStep]) return;
    const side = select('#balanceStepSide')?.value || 'left';
    const index = Number(select('#balanceStepFocusIdx')?.value) || 0;
    ctx.draft.steps[ctx.selectedStep].focus = { side, index };
    ctx.dirty = true;
  };
  select('#balanceStepSide')?.addEventListener('change', updateFocus);
  select('#balanceStepFocusIdx')?.addEventListener('input', updateFocus);
  select('#balanceStepExpected')?.addEventListener('input', () => {
    if (ctx.draft.steps[ctx.selectedStep]) {
      const v = select('#balanceStepExpected')?.value;
      ctx.draft.steps[ctx.selectedStep].expectedCoef = v ? Number(v) : null;
    }
    ctx.dirty = true;
  });

  // 选步骤（编辑态下不切换，避免误触）
  root.querySelectorAll('[data-script-pick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (ctx.stepEditMode) return;
      syncCurrentStep(ctx);
      ctx.selectedStep = Number(btn.dataset.scriptPick);
      renderScriptEditor(ctx);
    });
  });

  select('#btnBalanceAddStep')?.addEventListener('click', async () => {
    syncCurrentStep(ctx);
    if (ctx.stepEditMode) ctx.stepEditMode = false;
    ctx.draft.steps.push(emptyStep());
    ctx.selectedStep = ctx.draft.steps.length - 1;
    ctx.dirty = true;
    renderScriptEditor(ctx);
  });

  select('#btnBalanceStepListEdit')?.addEventListener('click', async () => {
    syncCurrentStep(ctx);
    ctx.stepEditMode = !ctx.stepEditMode;
    renderScriptEditor(ctx);
  });

  // 编辑态：删除（与实验探究一致，点卡片上的 ×）
  root.querySelectorAll('[data-step-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!ctx.stepEditMode) return;
      if (ctx.draft.steps.length <= 1) {
        await appAlert('至少保留一个步骤');
        return;
      }
      if (!(await appConfirm('删除该步骤？'))) return;
      syncCurrentStep(ctx);
      const i = Number(btn.dataset.stepDel);
      ctx.draft.steps.splice(i, 1);
      if (ctx.selectedStep >= ctx.draft.steps.length) ctx.selectedStep = ctx.draft.steps.length - 1;
      else if (ctx.selectedStep > i) ctx.selectedStep -= 1;
      ctx.dirty = true;
      renderScriptEditor(ctx);
    });
  });

  // 编辑态：拖拽排序
  if (ctx.stepEditMode) {
    let dragFrom = null;
    root.querySelectorAll('.lab-step-nav-card[data-script-step]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        dragFrom = Number(card.dataset.scriptStep);
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        dragFrom = null;
        card.classList.remove('is-dragging');
        root.querySelectorAll('.lab-step-nav-card').forEach((c) => c.classList.remove('drag-over'));
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
        syncCurrentStep(ctx);
        const [item] = ctx.draft.steps.splice(dragFrom, 1);
        ctx.draft.steps.splice(to, 0, item);
        ctx.selectedStep = to;
        ctx.dirty = true;
        renderScriptEditor(ctx);
      });
    });
  }

  select('#btnBalanceSave')?.addEventListener('click', () => handleSave(ctx));
  select('#btnBalanceResetOne')?.addEventListener('click', () => resetCurrentScript(ctx));

  bindScriptChemKeypads(ctx, root);
}

/** 起式 / 目标式 / 提示文案：内联化学符号键盘（与实验探究方程式相同，非气泡） */
function bindScriptChemKeypads(ctx, root) {
  const pairs = [
    ['#balanceEditStart', '#chemKeypad-bal-start', (v) => { ctx.draft.startEquation = v; }],
    ['#balanceEditTarget', '#chemKeypad-bal-target', (v) => { ctx.draft.targetEquation = v; }],
    ['#balanceStepTip', '#chemKeypad-bal-tip', (v) => {
      if (ctx.draft.steps[ctx.selectedStep]) ctx.draft.steps[ctx.selectedStep].tip = v;
    }],
  ];
  pairs.forEach(([inputSel, padSel, apply]) => {
    const input = root.querySelector(inputSel);
    const keypad = root.querySelector(padSel);
    if (!input || !keypad) return;
    bindChemKeypad(input, keypad, {
      onInsert: (value) => {
        ctx.dirty = true;
        apply(value);
      },
    });
  });
}

function syncCurrentStep(ctx) {
  const { select } = ctx;
  if (!ctx.draft) return;
  const title = select('#balanceEditTitle');
  if (title) ctx.draft.title = title.value;
  const grade = select('#balanceEditGrade');
  if (grade) ctx.draft.grade = grade.value;
  const difficulty = select('#balanceEditDifficulty');
  if (difficulty) ctx.draft.difficulty = difficulty.value;
  const start = select('#balanceEditStart');
  if (start) ctx.draft.startEquation = start.value;
  const target = select('#balanceEditTarget');
  if (target) ctx.draft.targetEquation = target.value;

  const step = ctx.draft.steps[ctx.selectedStep];
  if (!step) return;
  const stepLabel = select('#balanceStepLabel');
  const stepTip = select('#balanceStepTip');
  const stepAction = select('#balanceStepAction');
  if (stepLabel) step.label = stepLabel.value;
  if (stepTip) step.tip = stepTip.value;
  if (stepAction) step.action = stepAction.value;
  const stepSide = select('#balanceStepSide');
  const stepFocusIdx = select('#balanceStepFocusIdx');
  if (stepSide && stepFocusIdx && step.action === 'set_coef') {
    step.focus = {
      side: stepSide.value,
      index: Number(stepFocusIdx.value) || 0,
    };
  }
  const stepExpected = select('#balanceStepExpected');
  if (stepExpected) {
    step.expectedCoef = stepExpected.value ? Number(stepExpected.value) : null;
  }
}

async function handleSave(ctx) {
  const { select, balanceScriptsApi } = ctx;
  if (ctx.saving || !ctx.draft) return;
  syncCurrentStep(ctx);
  const built = draftToPayload(ctx.draft);
  if (!built.ok) {
    await appAlert(built.reason || '请完善脚本');
    return;
  }
  const payload = built.payload;
  if (!String(payload.title || '').trim()) {
    await appAlert('名称不能为空');
    return;
  }
  if (!String(payload.startEquation || '').trim()) {
    await appAlert('起式不能为空');
    return;
  }
  if (!String(payload.targetEquation || '').trim()) {
    await appAlert('目标式不能为空');
    return;
  }
  ctx.draft.species = payload.species;
  ctx.saving = true;
  // 仅更新按钮，避免整页重绘打断；成功后再 render
  const saveBtn = select('#btnBalanceSave');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中…';
  }
  try {
    if (ctx.draft.isNew || !ctx.draft.id) {
      const created = await balanceScriptsApi.create(payload);
      const data = created?.data || created;
      if (data?.id) {
        ctx.draft.id = data.id;
        ctx.draft.isNew = false;
        ctx.draft.source = data.source || 'custom';
        ctx.scriptId = data.id;
      }
    } else {
      const updated = await balanceScriptsApi.update(ctx.draft.id, payload);
      const data = updated?.data || updated;
      if (data?.source) ctx.draft.source = data.source;
    }
    ctx.dirty = false;
    ctx.saving = false;
    await ctx.loadScripts({ keepSelection: true });
    if (ctx.mode === 'script' && ctx.scriptId) {
      ctx.draft = scriptToDraft(ctx.currentScript());
    }
    ctx.render();
  } catch (err) {
    ctx.saving = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '保存脚本';
    }
    await appAlert(`保存失败：${err.message || err}`);
  }
}

async function resetCurrentScript(ctx) {
  const { balanceScriptsApi } = ctx;
  const script = ctx.currentScript();
  if (!script?.id) return;
  // 仅内置 id 可恢复（API 也校验）；纯自定义点了只会失败
  if (!(await appConfirm(`将「${script.title}」恢复为内置版本？当前修改会被覆盖。`, {
    title: '恢复内置',
    okText: '恢复',
    danger: true,
  }))) return;
  try {
    const res = await balanceScriptsApi.reset(script.id);
    const data = res?.data || res;
    if (data?.id) {
      ctx.scriptId = data.id;
      ctx.draft = scriptToDraft(data);
      ctx.dirty = false;
      ctx.selectedStep = 0;
      ctx.resetPractice();
      await ctx.loadScripts({ keepSelection: true });
      ctx.render();
    }
  } catch (err) {
    await appAlert(err.message || '无法重置（仅内置脚本可恢复）');
  }
}
