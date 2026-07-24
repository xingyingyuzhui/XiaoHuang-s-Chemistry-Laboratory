/**
 * 品牌图标小知识 + 通用左上角气泡
 * 课堂提示/解答：持久气泡，重新生成 / 关闭，点外部关闭，不自动消失
 */

import { aiApi } from './api/client.js';

const AUTO_HIDE_MS = 7000;
const MIN_LOADING_MS = 900;

const FALLBACK_TIPS = [
  '可乐能除水垢，是因为其中的磷酸能与碳酸钙反应，把壶底的水垢慢慢溶解掉。',
  '不锈钢不易生锈，主要靠表面一层极薄的铬氧化物膜，把铁和空气、水隔开。',
  '切完洋葱爱流泪，是因为洋葱破损后释放的含硫气体刺激了眼睛。',
  '加碘盐里的碘多是碘酸钾；受潮、暴晒会损失，所以盐罐最好密封避光。',
  '铅笔芯其实是石墨和黏土，并不是铅；石墨质软、能留下痕迹才好写字。',
  '胃药里常见的小苏打是碳酸氢钠，能和过多的胃酸中和，暂时缓解不适。',
  '钻石和铅笔芯的主要成分都是碳，只是原子排列方式不同，性质天差地别。',
  '肥皂能去油，是因为一端亲水、一端亲油，把油污包裹成小液滴冲走。',
  '铁锈主要是含水氧化铁；铁在潮湿空气中更易锈，所以要保持干燥或涂层保护。',
  '柠檬能让茶水变浅，是因为酸性会改变茶中色素分子的颜色表现。',
];

let bubbleEl = null;
let hideTimer = 0;
let loading = false;
let outsideHandler = null;
let lastFallbackIdx = -1;
let seq = 0;
/** @type {null | (() => void | Promise<void>)} */
let regenerateHandler = null;
let currentAnchor = null;

function pickFallback() {
  if (FALLBACK_TIPS.length === 1) return FALLBACK_TIPS[0];
  let i = Math.floor(Math.random() * FALLBACK_TIPS.length);
  if (i === lastFallbackIdx) i = (i + 1) % FALLBACK_TIPS.length;
  lastFallbackIdx = i;
  return FALLBACK_TIPS[i];
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ensureBubble() {
  if (bubbleEl) return bubbleEl;
  bubbleEl = document.createElement('div');
  bubbleEl.id = 'brandTipBubble';
  bubbleEl.className = 'brand-tip-bubble';
  bubbleEl.setAttribute('role', 'status');
  bubbleEl.setAttribute('aria-live', 'polite');
  bubbleEl.hidden = true;
  document.body.appendChild(bubbleEl);
  return bubbleEl;
}

function clearHideTimer() {
  if (hideTimer) {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
  }
}

function unbindOutside() {
  if (outsideHandler) {
    document.removeEventListener('pointerdown', outsideHandler, true);
    outsideHandler = null;
  }
}

export function hideBrandTip() {
  clearHideTimer();
  unbindOutside();
  regenerateHandler = null;
  const el = ensureBubble();
  el.classList.remove('is-visible', 'is-loading', 'is-scrollable', 'has-actions');
  window.setTimeout(() => {
    if (!el.classList.contains('is-visible')) el.hidden = true;
  }, 200);
}

function positionBubble(anchor) {
  const el = ensureBubble();
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const gap = 14;
  const maxW = Math.min(400, window.innerWidth - 24);

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

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
  el.dataset.place = placeAbove ? 'above' : 'below';

  const tipX = Math.min(Math.max(rect.left + rect.width / 2 - left, 28), bw - 28);
  el.style.setProperty('--tip-x', `${Math.round(tipX)}px`);
}

/**
 * @param {HTMLElement} anchor
 * @param {object} opts
 */
function showBubble(anchor, opts) {
  const el = ensureBubble();
  clearHideTimer();
  unbindOutside();
  currentAnchor = anchor;

  const {
    mode,
    text = '',
    source = 'ai',
    note = '',
    badge = '课间一句话',
    sourceLabel: sourceLabelOpt,
    duration = AUTO_HIDE_MS,
    scrollable = false,
    loadingText = '老师想一想……',
    showActions = false,
    onRegenerate = null,
  } = opts;
  const isLoading = mode === 'loading';

  regenerateHandler = typeof onRegenerate === 'function' ? onRegenerate : null;

  el.classList.toggle('is-loading', isLoading);
  el.classList.toggle('is-scrollable', Boolean(scrollable) && !isLoading);
  el.classList.toggle('has-actions', Boolean(showActions) && !isLoading);

  if (isLoading) {
    el.innerHTML = `
      <div class="brand-tip-card">
        <div class="brand-tip-head">
          <span class="brand-tip-badge">${escapeHtml(badge)}</span>
        </div>
        <div class="brand-tip-body brand-tip-body-loading">
          <span class="brand-tip-spinner" aria-hidden="true"></span>
          <p class="brand-tip-text">${escapeHtml(loadingText)}</p>
        </div>
      </div>
      <span class="brand-tip-arrow" aria-hidden="true"></span>
    `;
  } else {
    const sourceLabel =
      sourceLabelOpt || (source === 'ai' ? 'AI · DeepSeek' : '本地小知识');
    const sourceClass = source === 'ai' ? 'is-ai' : 'is-local';
    const canRegen = showActions && typeof onRegenerate === 'function';
    const actionsHtml =
      showActions
        ? `<div class="brand-tip-actions">
            ${
              canRegen
                ? `<button type="button" class="brand-tip-btn brand-tip-btn-regen" data-tip-act="regen">重新生成</button>`
                : ''
            }
            <button type="button" class="brand-tip-btn brand-tip-btn-close" data-tip-act="close">关闭</button>
          </div>`
        : '';
    el.innerHTML = `
      <div class="brand-tip-card">
        <div class="brand-tip-head">
          <span class="brand-tip-badge">${escapeHtml(badge)}</span>
          <span class="brand-tip-source ${sourceClass}">${escapeHtml(sourceLabel)}</span>
        </div>
        <div class="brand-tip-body">
          <p class="brand-tip-text">${escapeHtml(text)}</p>
          ${note ? `<p class="brand-tip-note">${escapeHtml(note)}</p>` : ''}
          ${actionsHtml}
        </div>
      </div>
      <span class="brand-tip-arrow" aria-hidden="true"></span>
    `;

    el.querySelector('[data-tip-act="close"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      hideBrandTip();
    });
    el.querySelector('[data-tip-act="regen"]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!regenerateHandler) return;
      try {
        await regenerateHandler();
      } catch (err) {
        console.warn('重新生成失败', err);
      }
    });
  }

  el.hidden = false;
  el.classList.remove('is-visible');
  requestAnimationFrame(() => {
    el.classList.add('is-visible');
    positionBubble(anchor);
  });

  outsideHandler = (e) => {
    if (el.contains(e.target)) return;
    if (anchor && anchor.contains(e.target)) return;
    hideBrandTip();
  };
  requestAnimationFrame(() => {
    document.addEventListener('pointerdown', outsideHandler, true);
  });

  // duration > 0 才自动关；课堂提示/解答传 0
  if (!isLoading && duration > 0) {
    hideTimer = window.setTimeout(() => hideBrandTip(), duration);
  }
}

/**
 * 通用气泡
 * @param {{ title?: string, text?: string, loading?: boolean, duration?: number, scrollable?: boolean, source?: string, persistent?: boolean, onRegenerate?: function, showActions?: boolean, loadingText?: string }} opts
 */
export function showAppBubble(opts = {}) {
  const anchor = document.getElementById('appBrandIcon');
  if (!anchor) return;
  const {
    title = 'AI 课堂',
    text = '',
    loading = false,
    duration,
    scrollable = true,
    source = 'ai',
    persistent = false,
    onRegenerate = null,
    showActions = false,
    loadingText = '老师想一想……',
  } = opts;

  const autoMs = persistent ? 0 : duration !== undefined ? duration : 10000;
  // 持久气泡默认有关闭；是否有「重新生成」取决于 onRegenerate
  const actions = persistent || showActions || typeof onRegenerate === 'function';

  if (loading) {
    showBubble(anchor, {
      mode: 'loading',
      badge: title,
      loadingText,
      duration: 0,
    });
    return;
  }

  showBubble(anchor, {
    mode: 'ready',
    badge: title,
    text,
    source,
    duration: autoMs,
    scrollable,
    showActions: actions,
    onRegenerate,
  });
}

async function onBrandClick(anchor) {
  if (loading) return;
  loading = true;
  const mySeq = ++seq;

  showBubble(anchor, { mode: 'loading', duration: 0 });
  const t0 = performance.now();

  let tip = '';
  let source = 'ai';

  try {
    const data = await aiApi.tip();
    tip = (data?.tip || '').trim();
    source = data?.source === 'local' ? 'local' : 'ai';
    if (!tip) {
      tip = pickFallback();
      source = 'local';
    }
  } catch (err) {
    console.warn('化学小知识请求失败，使用前端本地兜底:', err?.message || err);
    tip = pickFallback();
    source = 'local';
  }

  const elapsed = performance.now() - t0;
  if (elapsed < MIN_LOADING_MS) await sleep(MIN_LOADING_MS - elapsed);

  if (mySeq !== seq) {
    loading = false;
    return;
  }

  // 课间小知识：可自动消失，无重新生成按钮
  showBubble(anchor, {
    mode: 'ready',
    text: tip,
    source,
    duration: AUTO_HIDE_MS,
    showActions: false,
  });
  loading = false;
}

export function initBrandTip() {
  const icon = document.getElementById('appBrandIcon');
  if (!icon) return;

  icon.classList.add('brand-mark-clickable');
  icon.setAttribute('role', 'button');
  icon.setAttribute('tabindex', '0');
  icon.setAttribute('title', '点我听一条化学小知识');
  icon.setAttribute('aria-label', '点击获取化学小知识');

  const trigger = () => onBrandClick(icon);

  icon.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    trigger();
  });

  icon.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      trigger();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideBrandTip();
  });

  window.addEventListener('resize', () => {
    if (bubbleEl && bubbleEl.classList.contains('is-visible') && currentAnchor) {
      positionBubble(currentAnchor);
    }
  });
}
