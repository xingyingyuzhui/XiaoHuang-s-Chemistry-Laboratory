/**
 * 配平脚本 · AI 分步提示与 AI 脚本草稿生成弹窗
 */

import {
  scriptToDraft,
  buildEquation,
  buildPracticeStepsFromEquations,
  startEquationFromSides,
} from './balance-model.js';
import { mountChemKeypads } from '../chem-keypad.js';
import { appAlert } from '../app-dialog.js';
import { sanitizePracticeTip } from './balance-views.js';
import {
  balanceEquation,
  mergeMarkersFromEquation,
  formatEquation,
  parseEquationSides,
  speciesFromEquation,
} from '../equation-balance.js';
import { getAnnotateStateMarkers } from '../settings.js';

/**
 * 按「当前步骤」请求 AI 提示（非整式通用讲解）。
 * 结果写入该步缓存，显示在「AI 提示」按钮右侧独立框。
 */
export async function handleAiTip(ctx, script) {
  if (!script) return;
  // 捕获请求发起时的脚本/步号，避免切步后写错缓存
  const reqScriptId = ctx.scriptId;
  const reqStepIdx = ctx.stepIdx;
  const step = script.steps?.[reqStepIdx];
  if (!step) return;

  const isStale = () => ctx.scriptId !== reqScriptId || ctx.stepIdx !== reqStepIdx;

  ctx.aiTipLoading = true;
  ctx.renderPractice();

  try {
    if (!ctx.aiApi?.balance) {
      throw new Error('AI 接口不可用，请检查设置中的 API Key');
    }

    const focusFormula = step.focus
      ? script.species?.[step.focus.side]?.[step.focus.index]?.formula || ''
      : '';
    const currentEq = buildEquation(script.species, ctx.coefs);
    const stepGuide = sanitizePracticeTip(step.tip, step.expectedCoef);

    const data = await ctx.aiApi.balance({
      equation: script.startEquation || currentEq,
      mode: 'step_tip',
      step: {
        index: reqStepIdx,
        total: script.steps?.length || 1,
        label: step.label || `第 ${reqStepIdx + 1} 步`,
        action: step.action || 'explain',
        guide: stepGuide,
        focusSide: step.focus?.side || null,
        focusIndex: step.focus?.index ?? null,
        focusFormula,
        currentEquation: currentEq,
      },
    });

    if (isStale()) return;

    let tip = '';
    if (data?.tip) {
      tip = String(data.tip).trim();
    } else if (Array.isArray(data?.steps) && data.steps.length) {
      const pick = data.steps[Math.min(reqStepIdx, data.steps.length - 1)];
      tip = String(pick || '').trim();
    }

    tip = sanitizePracticeTip(tip, step.expectedCoef);
    if (step.expectedCoef != null) {
      const n = Number(step.expectedCoef);
      if (Number.isFinite(n)) {
        tip = tip.replace(new RegExp(`(?<![\\d.])${n}(?![\\d.])`, 'g'), '？');
      }
    }
    tip = tip.replace(/\d+\s*[A-Za-z0-9()+\[\]]+\s*(→|=)\s*.+/g, '（请自行写出完整式）');

    if (!tip) {
      tip = localStepFallbackTip(step, focusFormula);
    }
    // 写入请求步，不依赖可能已变的 stepIdx
    if (reqScriptId) {
      if (!ctx.aiTipsByScript[reqScriptId]) ctx.aiTipsByScript[reqScriptId] = {};
      ctx.aiTipsByScript[reqScriptId][reqStepIdx] = tip;
    }
  } catch (err) {
    if (isStale()) return;
    const focusFormula = step.focus
      ? script.species?.[step.focus.side]?.[step.focus.index]?.formula || ''
      : '';
    const tip = err.message
      ? `${err.message}。本步提示：${localStepFallbackTip(step, focusFormula)}`
      : localStepFallbackTip(step, focusFormula);
    if (reqScriptId) {
      if (!ctx.aiTipsByScript[reqScriptId]) ctx.aiTipsByScript[reqScriptId] = {};
      ctx.aiTipsByScript[reqScriptId][reqStepIdx] = tip;
    }
  } finally {
    if (!isStale()) {
      ctx.aiTipLoading = false;
      ctx.renderPractice();
    } else if (ctx.scriptId === reqScriptId) {
      // 同脚本仅切步：清 loading 若当前仍在 loading 态
      ctx.aiTipLoading = false;
    }
  }
}

function localStepFallbackTip(step, focusFormula) {
  const guide = sanitizePracticeTip(step?.tip, step?.expectedCoef);
  if (guide && guide.length > 8) return guide;
  if (step?.action === 'set_coef' && focusFormula) {
    return `本步只改 ${focusFormula} 的系数：先数清相关元素左右原子数，再试最小正整数，不要一次改太多。`;
  }
  if (step?.action === 'check') {
    return '本步做检查：逐元素核对左右原子数是否相等，找出仍不相等的元素。';
  }
  return `围绕「${step?.label || '本步'}」思考：先看这一步要解决哪个元素的不平衡。`;
}

async function openGenBalanceModal(ctx) {
  const { select, aiApi } = ctx;
  if (!(await ctx.confirmLeaveDirty())) return;
  if (!aiApi?.balance) {
    await appAlert('AI 接口不可用，请在设置中配置 API Key');
    return;
  }
  const backdrop = select('#genBalanceBackdrop');
  const modal = select('#genBalanceModal');
  const promptEl = select('#genBalancePrompt');
  const statusEl = select('#genBalanceStatus');
  const submitBtn = select('#btnGenBalanceSubmit');
  if (promptEl) promptEl.value = '';
  if (statusEl) {
    statusEl.textContent = '';
    statusEl.classList.remove('is-ok', 'is-err');
  }
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '生成草稿';
  }
  // 弹窗内方程式：内联化学符号键盘（与脚本编辑页相同）
  const field = select('#genBalanceEqField');
  if (field && promptEl && !field.querySelector('.chem-keypad')) {
    mountChemKeypads(field, '#genBalancePrompt');
  }
  backdrop?.classList.add('is-open');
  modal?.classList.add('is-open');
  backdrop?.setAttribute('aria-hidden', 'false');
  modal?.setAttribute('aria-hidden', 'false');
  promptEl?.focus();
}

export function closeGenBalanceModal(ctx) {
  const { select } = ctx;
  const backdrop = select('#genBalanceBackdrop');
  const modal = select('#genBalanceModal');
  const submitBtn = select('#btnGenBalanceSubmit');
  backdrop?.classList.remove('is-open');
  modal?.classList.remove('is-open');
  backdrop?.setAttribute('aria-hidden', 'true');
  modal?.setAttribute('aria-hidden', 'true');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = '生成草稿';
  }
}

export function bindGenBalanceModalOnce(ctx) {
  const { select } = ctx;
  const root = select('#genBalanceModal');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  select('#btnGenBalanceClose')?.addEventListener('click', () => closeGenBalanceModal(ctx));
  select('#btnGenBalanceCancel')?.addEventListener('click', () => closeGenBalanceModal(ctx));
  select('#genBalanceBackdrop')?.addEventListener('click', () => closeGenBalanceModal(ctx));
  select('#btnGenBalanceSubmit')?.addEventListener('click', () => handleGenBalanceSubmit(ctx));
}

export function startAiCreate(ctx) {
  bindGenBalanceModalOnce(ctx);
  openGenBalanceModal(ctx);
}

/** AI 生成配平脚本草稿 → 弹窗进度 → 进入脚本页确认保存 */
async function handleGenBalanceSubmit(ctx) {
  const { select, aiApi } = ctx;
  const promptEl = select('#genBalancePrompt');
  const statusEl = select('#genBalanceStatus');
  const submitBtn = select('#btnGenBalanceSubmit');
  const eq = String(promptEl?.value || '').trim();
  if (!eq) {
    if (statusEl) {
      statusEl.textContent = '请填写未配平方程式';
      statusEl.classList.add('is-err');
      statusEl.classList.remove('is-ok');
    }
    return;
  }

  ctx.listEditMode = false;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = '生成中…';
  }
  if (statusEl) {
    statusEl.textContent = '正在调用 AI 生成配平脚本，请稍候…';
    statusEl.classList.remove('is-ok', 'is-err');
  }

  try {
    if (!aiApi?.balance) throw new Error('AI 接口不可用，请在设置中配置 API Key');
    const data = await aiApi.balance({ equation: eq });
    const target = data?.equation || '';
    if (!target) throw new Error('模型未返回配平式');
    const guideSteps = Array.isArray(data?.steps) ? data.steps : [];

    ctx.mode = 'script';
    ctx.scriptId = null;
    ctx.stepEditMode = false;
    ctx.draft = scriptToDraft(null);
    ctx.draft.title = `AI 草稿：${eq.slice(0, 24)}`;
    ctx.draft.difficulty = 'AI';

    const annotate = getAnnotateStateMarkers();
    const promptStart = eq.replace(/→/g, '=').replace(/\s+/g, ' ').trim();
    let targetEq = String(target).replace(/→/g, '=').replace(/\s+/g, ' ').trim();
    let sides = null;

    // 本地系数权威 + 合并 AI/白名单状态符号（受设置开关控制）
    try {
      const local = balanceEquation(eq, { annotate });
      sides = mergeMarkersFromEquation(
        targetEq,
        { left: local.left, right: local.right },
        { annotate },
      );
      targetEq = formatEquation(sides.left, sides.right, { annotate: false });
    } catch {
      sides = parseEquationSides(targetEq);
      if (!sides) {
        throw new Error('模型返回的式子无法解析，请改用如 H2 + O2 = H2O 的格式');
      }
      sides = mergeMarkersFromEquation(targetEq, sides, { annotate });
      targetEq = formatEquation(sides.left, sides.right, { annotate: false });
    }

    // 起式必须能解析出物种；提示词含 (g)/(aq) 等已可解析，自然语言则从目标式回退
    let startEq = promptStart;
    if (!speciesFromEquation(startEq)) {
      startEq = startEquationFromSides(sides);
    }
    if (!speciesFromEquation(startEq)) {
      throw new Error('起式无法解析，请输入如 H2 + O2 = H2O 的方程式后再生成');
    }

    ctx.draft.startEquation = startEq;
    ctx.draft.targetEquation = targetEq;
    ctx.draft.species = speciesFromEquation(startEq);
    // 根据目标式系数生成 set_coef 练习步（并保留最多 3 条 AI 思路）
    ctx.draft.steps = buildPracticeStepsFromEquations(
      ctx.draft.startEquation,
      ctx.draft.targetEquation,
      guideSteps,
    );
    ctx.dirty = true;
    ctx.selectedStep = 0;

    if (statusEl) {
      statusEl.textContent = '生成成功！即将打开脚本页，请检查后保存。';
      statusEl.classList.add('is-ok');
      statusEl.classList.remove('is-err');
    }
    window.setTimeout(() => {
      closeGenBalanceModal(ctx);
      ctx.render();
    }, 480);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message || String(err);
      statusEl.classList.add('is-err');
      statusEl.classList.remove('is-ok');
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '生成草稿';
    }
  }
}
