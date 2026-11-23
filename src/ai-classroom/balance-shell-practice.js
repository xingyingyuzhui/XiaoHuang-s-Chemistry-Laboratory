/**
 * 配平脚本 · 练习视图与系数气泡键盘
 */

import { isPracticeFinished } from './balance-model.js';
import {
  htmlPracticeBody,
  htmlCoefKeypadBubbleInner,
  renderSpeciesEquation,
} from './balance-views.js';

const KEYPAD_BUBBLE_ID = 'balanceCoefKeypadBubble';

function unbindKeypadOutside(ctx) {
  if (ctx.keypadOutsideHandler) {
    document.removeEventListener('pointerdown', ctx.keypadOutsideHandler, true);
    ctx.keypadOutsideHandler = null;
  }
}

/** 与 brand-tip 相同：挂到 body 的气泡，避免被练习区 overflow 裁切 */
function ensureCoefKeypadBubble(ctx) {
  let el = document.getElementById(KEYPAD_BUBBLE_ID);
  if (el) return el;
  el = document.createElement('div');
  el.id = KEYPAD_BUBBLE_ID;
  el.className = 'brand-tip-bubble balance-coef-keypad-bubble';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', '输入系数');
  el.hidden = true;
  el.innerHTML = htmlCoefKeypadBubbleInner();
  document.body.appendChild(el);

  el.querySelectorAll('[data-coef-keypad-dismiss]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      hideCoefKeypad(ctx);
    });
  });
  return el;
}

function positionCoefKeypad(ctx, anchor) {
  const el = ensureCoefKeypadBubble(ctx);
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const gap = 14;
  const maxW = Math.min(280, window.innerWidth - 24);

  el.style.width = `${maxW}px`;
  el.style.maxWidth = `${maxW}px`;
  el.style.left = '0px';
  el.style.top = '0px';
  el.hidden = false;

  void el.offsetWidth;
  const bw = el.offsetWidth;
  const bh = el.offsetHeight;

  let left = rect.left;
  let top = rect.bottom + gap;
  let placeAbove = false;

  if (left + bw > window.innerWidth - 12) {
    left = Math.max(12, window.innerWidth - 12 - bw);
  }
  if (top + bh > window.innerHeight - 12 && rect.top - gap - bh > 12) {
    top = rect.top - gap - bh;
    placeAbove = true;
  }
  if (top < 12) top = 12;

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.dataset.place = placeAbove ? 'above' : 'below';

  const tipX = Math.min(Math.max(rect.left + rect.width / 2 - left, 28), bw - 28);
  el.style.setProperty('--tip-x', `${Math.round(tipX)}px`);
}

export function hideCoefKeypad(ctx) {
  unbindKeypadOutside(ctx);
  const el = document.getElementById(KEYPAD_BUBBLE_ID);
  if (!el) return;
  el.classList.remove('is-visible');
  if (ctx.keypadHideTimer) window.clearTimeout(ctx.keypadHideTimer);
  ctx.keypadHideTimer = window.setTimeout(() => {
    if (!el.classList.contains('is-visible')) el.hidden = true;
    ctx.keypadHideTimer = 0;
  }, 200);
}

function showCoefKeypad(ctx) {
  const { select } = ctx;
  const input = select('#balanceCoefInput');
  if (!input) return;
  const el = ensureCoefKeypadBubble(ctx);
  if (ctx.keypadHideTimer) {
    window.clearTimeout(ctx.keypadHideTimer);
    ctx.keypadHideTimer = 0;
  }
  positionCoefKeypad(ctx, input);
  // 强制重排后再加 is-visible，触发与课间一句话相同的入场动效
  void el.offsetWidth;
  el.classList.add('is-visible');

  unbindKeypadOutside(ctx);
  ctx.keypadOutsideHandler = (e) => {
    const bubble = document.getElementById(KEYPAD_BUBBLE_ID);
    const coefInput = select('#balanceCoefInput');
    const t = e.target;
    if (bubble?.contains(t) || t === coefInput) return;
    hideCoefKeypad(ctx);
  };
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', ctx.keypadOutsideHandler, true);
  });
}

export function renderPractice(ctx) {
  const { select } = ctx;
  hideCoefKeypad(ctx);
  const body = select('#balanceDetail');
  if (!body) return;
  const script = ctx.currentScript();
  const totalSteps = script?.steps?.length || 0;
  const isLastStep = ctx.stepIdx >= Math.max(0, totalSteps - 1);
  body.innerHTML = htmlPracticeBody(
    script,
    ctx.stepIdx,
    ctx.coefs,
    ctx.stepResult,
    isLastStep,
    ctx.finished,
    totalSteps,
    {
      aiTipText: ctx.currentAiTip(),
      aiTipLoading: ctx.aiTipLoading,
    },
  );
  ctx.bindModeTabs(body);
  bindCoefKeypadAndLivePreview(ctx, script);

  select('#btnBalanceCheckCoef')?.addEventListener('click', async () => {
    hideCoefKeypad(ctx);
    handleCheckCoef(ctx);
  });
  select('#btnBalanceAiTip')?.addEventListener('click', async () => {
    hideCoefKeypad(ctx);
    ctx.handleAiTip(script);
  });
  select('#btnBalanceNext')?.addEventListener('click', () => handleNext(ctx));
  select('#btnBalancePrev')?.addEventListener('click', async () => {
    if (ctx.stepIdx > 0) {
      ctx.stepIdx -= 1;
      ctx.stepResult = null;
      ctx.persistProgress();
      renderPractice(ctx);
    }
  });
  select('#btnBalanceCheckAll')?.addEventListener('click', () => handleCheckAll(ctx));
  select('#btnBalanceRestart')?.addEventListener('click', async () => {
    ctx.resetPractice();
    renderPractice(ctx);
  });
}

/** 系数框：课间一句话风格气泡键盘 + 实时刷新上方化学式 */
function bindCoefKeypadAndLivePreview(ctx, script) {
  const { select } = ctx;
  const input = select('#balanceCoefInput');
  if (!input) return;

  const applyLive = () => {
    const step = script?.steps?.[ctx.stepIdx];
    if (!step?.focus) return;
    let val = Math.round(Number(input.value));
    if (!Number.isFinite(val) || val < 1) val = 1;
    if (val > 12) val = 12;
    const { side, index: idx } = step.focus;
    if (!ctx.coefs[side]) ctx.coefs[side] = [];
    ctx.coefs[side][idx] = val;
    const hero = select('#balanceEquationHero');
    if (hero) {
      hero.innerHTML = renderSpeciesEquation(script.species, ctx.coefs, step.focus, ctx.finished);
    }
  };

  input.addEventListener('focus', () => showCoefKeypad(ctx));
  input.addEventListener('click', () => showCoefKeypad(ctx));

  // 数字键只绑一次（气泡挂在 body 上，不随练习区重绘销毁）
  if (!ctx.keypadBound) {
    const bubble = ensureCoefKeypadBubble(ctx);
    bubble.querySelectorAll('[data-coef-key]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const coefInput = select('#balanceCoefInput');
        if (!coefInput) return;
        const k = btn.dataset.coefKey;
        let v = String(coefInput.value || '');
        if (k === '清空') v = '';
        else if (k === '⌫') v = v.slice(0, -1);
        else if (/^\d$/.test(k)) {
          if (v === '0' || (v === '1' && coefInput.dataset.replaceOnce === '1')) v = k;
          else if (v.length < 2) v = (v === '0' ? '' : v) + k;
        }
        if (/^\d$/.test(k)) coefInput.dataset.replaceOnce = '0';
        let num = Math.round(Number(v));
        if (v === '') {
          coefInput.value = '';
        } else {
          if (!Number.isFinite(num) || num < 1) num = 1;
          if (num > 12) num = 12;
          coefInput.value = String(num);
        }
        // 用当前脚本刷新公式（闭包可能过期，从 DOM/状态取最新）
        const s = ctx.currentScript();
        const step = s?.steps?.[ctx.stepIdx];
        if (step?.focus && s) {
          let val = Math.round(Number(coefInput.value));
          if (!Number.isFinite(val) || val < 1) val = 1;
          if (val > 12) val = 12;
          const { side, index: idx } = step.focus;
          if (!ctx.coefs[side]) ctx.coefs[side] = [];
          ctx.coefs[side][idx] = val;
          const hero = select('#balanceEquationHero');
          if (hero) {
            hero.innerHTML = renderSpeciesEquation(s.species, ctx.coefs, step.focus, ctx.finished);
          }
        }
      });
    });
    ctx.keypadBound = true;
  }

  input.dataset.replaceOnce = '1';
  applyLive();
}

function handleCheckCoef(ctx) {
  const { select } = ctx;
  const script = ctx.currentScript();
  if (!script || !script.steps?.[ctx.stepIdx]) return;
  const step = script.steps[ctx.stepIdx];
  if (step.action !== 'set_coef' || !step.focus) return;
  const input = select('#balanceCoefInput');
  if (!input) return;
  const val = Math.round(Number(input.value));
  if (!Number.isFinite(val) || val < 1) {
    ctx.stepResult = 'wrong';
    renderPractice(ctx);
    return;
  }
  const { side, index: idx } = step.focus;
  if (!ctx.coefs[side]) ctx.coefs[side] = [];
  ctx.coefs[side][idx] = val;
  // 先刷新公式再判定
  const hero = select('#balanceEquationHero');
  if (hero) {
    hero.innerHTML = renderSpeciesEquation(script.species, ctx.coefs, step.focus, ctx.finished);
  }
  if (step.expectedCoef != null) {
    ctx.stepResult = val === step.expectedCoef ? 'correct' : 'wrong';
  } else {
    ctx.stepResult = 'correct';
  }
  renderPractice(ctx);
}

function handleNext(ctx) {
  const step = ctx.currentScript()?.steps?.[ctx.stepIdx];
  // set_coef：须点「确认系数」且正确后才能下一步（禁止跳过校验）
  if (step?.action === 'set_coef' && ctx.stepResult !== 'correct') {
    return;
  }
  const script = ctx.currentScript();
  if (!script) return;
  if (ctx.stepIdx < script.steps.length - 1) {
    ctx.stepIdx += 1;
    ctx.stepResult = null;
    ctx.persistProgress();
    renderPractice(ctx);
  }
}

function handleCheckAll(ctx) {
  const script = ctx.currentScript();
  if (!script) return;
  if (isPracticeFinished(script.species, ctx.coefs, script.targetEquation)) {
    ctx.finished = true;
    ctx.stepResult = null;
    ctx.persistProgress();
  } else {
    ctx.stepResult = 'wrong';
    ctx.finished = false;
  }
  renderPractice(ctx);
}
