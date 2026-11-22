/**
 * 随堂小黄统一交互面板：3 道可选随堂问题芯片 + AI 换一批 + 1 行自定义提问 → 思路提示与模糊遮盖「点击揭晓结论」
 */

import { aiApi } from '../api/client.js';
import { formulaHtml } from '../chem/formula-html.js';
import { getActivePageContext, observeActivePageChanges } from './page-context.js';

const ACTION_LABELS = {
  'ball-stick': '球棍模型',
  'space-filling': '比例填充',
  slice: '切开晶胞',
  explode: '炸开看均摊',
  'tile-2': '拼接 2 晶胞',
  'tile-3': '拼接 3 晶胞',
  coordination: '高亮配位',
  distance: '标注最短距离',
  reset: '复位视角',
};
const FALLBACK_CHIPS = [
  '本节最常考的核心结论是什么？',
  '微观结构如何决定这里的宏观性质？',
  '这部分高考常见易错点有哪些？',
];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isKeyErr = (err) => /key|密钥|未配置|api\s*key/i.test(String(err?.message || ''));
const normKey = (q) => String(q || '').replace(/\s+/g, '').toLowerCase();
export const buildContextKey = (c) => [
  c?.tab || '',
  c?.module || '',
  c?.title || '',
  c?.formula || '',
  c?.summary || '',
  c?.qa?.question || '',
].join('|');

function makeItem(raw = {}) {
  return {
    question: String(raw.question || '').trim(),
    hint: String(raw.hint || '').trim(),
    answer: String(raw.answer || '').trim(),
    action: raw.action || null,
    steps: Array.isArray(raw.steps) ? raw.steps : [],
    source: raw.source || 'curated',
    revealed: false,
    loading: false,
    error: '',
    keyHint: false,
  };
}

function renderErr(msg, keyHint) {
  if (!msg) return '';
  const tip = keyHint ? '<p class="xh-key-tip">提示：请在右上角「设置 → AI」填写 DeepSeek API Key 后重试。</p>' : '';
  return `<div class="xh-error"><p>${esc(msg)}</p>${tip}</div>`;
}

function buildContextLabel(c) {
  const f = String(c?.formula || '').trim();
  const t = String(c?.title || '小黄的化学实验室').trim();
  return f && !t.includes(f)
    ? `<strong class="xh-ctx-formula">${formulaHtml(f)}</strong><span class="xh-ctx-sep">·</span><span>${esc(t)}</span>`
    : `<span>${esc(t)}</span>`;
}

function buildInitialChoices(c) {
  const choices = [];
  const seen = new Set();
  const push = (raw) => {
    const it = makeItem(raw);
    if (!it.question || choices.length >= 3) return;
    const k = normKey(it.question);
    if (seen.has(k)) return;
    seen.add(k);
    choices.push(it);
  };
  if (c?.qa?.question) push({ ...c.qa, source: 'builtin' });
  if (Array.isArray(c?.quickQuestions)) c.quickQuestions.forEach((q) => push({ question: q }));
  FALLBACK_CHIPS.forEach((q) => push({ question: q }));
  return choices;
}

function collectActionPills(item, canAct) {
  if (!canAct || !item) return [];
  const acts = [];
  const add = (a) => { if (a && ACTION_LABELS[a] && !acts.includes(a)) acts.push(a); };
  add(item.action);
  if (Array.isArray(item.steps)) item.steps.forEach((s) => add(s?.action));
  return acts;
}

export function createXiaohuangPanel({ onClose } = {}) {
  const panelEl = document.createElement('section');
  panelEl.className = 'xh-panel';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-label', '小黄随堂助教');
  panelEl.hidden = true;
  document.body.appendChild(panelEl);

  const stateCache = new Map();
  let isOpen = false;
  let lastAnchor = null;
  let ctx = null;
  let curKey = '';
  let reqSeq = 0;

  function ensureState(c) {
    const key = buildContextKey(c);
    let st = stateCache.get(key);
    if (!st) {
      const choices = buildInitialChoices(c);
      const hasBuiltin = choices[0]?.source === 'builtin' && Boolean(choices[0]?.answer);
      st = { choices, seen: choices.map((x) => x.question), activeIdx: hasBuiltin ? 0 : -1, customItem: null, draft: '', batchLoading: false, batchError: '', batchKeyHint: false };
      if (stateCache.size >= 24) stateCache.delete(stateCache.keys().next().value);
      stateCache.set(key, st);
    }
    return { key, st };
  }

  const getActiveItem = (st) => st.customItem || (st.activeIdx >= 0 ? st.choices[st.activeIdx] || null : null);

  function syncContext(force = false) {
    const nextCtx = getActivePageContext();
    const { key } = ensureState(nextCtx);
    const changed = key !== curKey;
    ctx = nextCtx;
    if (changed) { curKey = key; reqSeq += 1; }
    if (isOpen && (changed || force)) {
      render();
      if (lastAnchor) reposition(lastAnchor);
    }
  }

  async function fetchAnswerForItem(item, key) {
    if (!item || !ctx || item.loading) return;
    const seq = ++reqSeq;
    Object.assign(item, { loading: true, error: '', keyHint: false, revealed: false });
    render();
    if (lastAnchor) reposition(lastAnchor);

    const canAct = typeof ctx.onAiAction === 'function';
    try {
      const payload = { title: ctx.title || '高中化学', formula: ctx.formula || '', summary: ctx.summary || '', question: item.question };
      if (canAct) {
        const res = await aiApi.crystalGuide({ ...payload, module: ctx.module || 'library' });
        if (seq !== reqSeq || key !== curKey) return;
        const steps = Array.isArray(res?.steps) ? res.steps : [];
        item.answer = String(res?.answer || '').trim() || '已完成解析。';
        item.steps = steps;
        if (!item.hint && steps[0]?.title) item.hint = `观察角度：${steps[0].title}`;
        if (!item.action) item.action = steps.find((s) => s?.action && ACTION_LABELS[s.action])?.action || null;
      } else {
        const res = await aiApi.thinkingQuestion({ ...payload, module: ctx.module || ctx.tab || '', count: 1 });
        if (seq !== reqSeq || key !== curKey) return;
        item.answer = String(res?.answer || '').trim() || '已完成解析。';
        if (res?.hint) item.hint = String(res.hint).trim();
        item.action = res?.action || null;
      }
    } catch (err) {
      if (seq !== reqSeq || key !== curKey) return;
      item.error = err?.message || '小黄暂时无法回答，请稍后重试';
      item.keyHint = isKeyErr(err);
    } finally {
      item.loading = false;
      if (seq === reqSeq && key === curKey) { render(); if (lastAnchor) reposition(lastAnchor); }
    }
  }

  async function refreshBatch() {
    if (!ctx) return;
    const { key, st } = ensureState(ctx);
    if (st.batchLoading) return;
    const seq = ++reqSeq;
    Object.assign(st, { batchLoading: true, batchError: '', batchKeyHint: false });
    render();
    try {
      const data = await aiApi.thinkingQuestion({
        title: ctx.title || '高中化学',
        formula: ctx.formula || '',
        module: typeof ctx.onAiAction === 'function' ? (ctx.module || 'library') : (ctx.module || ctx.tab || ''),
        summary: ctx.summary || '',
        existingQuestions: st.seen.slice(-12),
        count: 3,
      });
      if (seq !== reqSeq || key !== curKey) return;
      const list = Array.isArray(data?.questions) && data.questions.length ? data.questions : data?.question ? [data] : [];
      if (!list.length) throw new Error('AI 未返回有效思考题');
      st.choices = list.slice(0, 3).map((q) => makeItem({ ...q, source: 'ai' }));
      st.choices.forEach((c) => { if (c.question && !st.seen.includes(c.question)) st.seen.push(c.question); });
      st.customItem = null;
      st.activeIdx = -1;
    } catch (err) {
      if (seq !== reqSeq || key !== curKey) return;
      st.batchError = err?.message || '换一批思考题失败，已保留当前题目';
      st.batchKeyHint = isKeyErr(err);
    } finally {
      st.batchLoading = false;
      if (seq === reqSeq && key === curKey) { render(); if (lastAnchor) reposition(lastAnchor); }
    }
  }

  function selectChoice(idx) {
    if (!ctx) return;
    const { key, st } = ensureState(ctx);
    const item = st.choices[idx];
    if (!item || st.batchLoading) return;
    Object.assign(st, { batchError: '', batchKeyHint: false, customItem: null, activeIdx: idx });
    if (item.answer && !item.error) { render(); if (lastAnchor) reposition(lastAnchor); return; }
    fetchAnswerForItem(item, key);
  }

  function submitCustomQuestion(raw) {
    const q = String(raw || '').trim();
    if (!ctx || !q) return;
    const { key, st } = ensureState(ctx);
    const custom = makeItem({ question: q, source: 'custom' });
    Object.assign(st, { batchError: '', batchKeyHint: false, draft: '', activeIdx: -1, customItem: custom });
    fetchAnswerForItem(custom, key);
  }

  function renderChoices(st) {
    if (st.batchLoading) {
      return '<div class="xh-choices" aria-busy="true"><div class="xh-chip-skeleton"></div><div class="xh-chip-skeleton"></div><div class="xh-chip-skeleton"></div></div>';
    }
    return `<div class="xh-choices" role="list">${st.choices.map((item, i) => {
      const active = !st.customItem && st.activeIdx === i;
      return `<button type="button" class="xh-choice-chip${active ? ' is-active' : ''}${item.answer ? ' is-ready' : ''}" data-xh-choice="${i}" aria-pressed="${active ? 'true' : 'false'}"><span class="xh-choice-idx">${i + 1}</span><span class="xh-choice-text">${esc(item.question)}</span></button>`;
    }).join('')}</div>`;
  }

  function renderActiveCard(st) {
    const item = getActiveItem(st);
    if (!item) return '';
    const actions = collectActionPills(item, typeof ctx?.onAiAction === 'function');
    const stepsHtml = item.steps?.length
      ? `<ul class="xh-step-list">${item.steps.map((s) => `<li><strong>${esc(s?.title || '')}</strong>${s?.detail ? `：${esc(s.detail)}` : ''}</li>`).join('')}</ul>`
      : '';
    let bodyHtml = '';
    if (item.loading) bodyHtml = '<div class="xh-status">小黄正在结合当前内容整理提示与结论…</div>';
    else if (item.error) bodyHtml = renderErr(item.error, item.keyHint);
    else if (item.answer) {
      const tools = item.revealed
        ? `<div class="xh-qa-tools">${actions.map((a) => `<button type="button" class="xh-action-pill" data-xh-action="${esc(a)}">▶ ${esc(ACTION_LABELS[a])}</button>`).join('')}<button type="button" class="xh-btn xh-btn-ghost" data-xh="hide">重新盖住</button></div>`
        : '';
      bodyHtml = `<div class="xh-qa-answer-wrap ${item.revealed ? 'is-revealed' : 'is-covered'}"><p class="xh-qa-answer">${esc(item.answer)}</p>${stepsHtml}${item.revealed ? '' : '<div class="xh-qa-cover"><button type="button" class="xh-btn xh-btn-primary" data-xh="reveal">点击揭晓结论</button></div>'}</div>${tools}`;
    }
    return `<div class="xh-qa-card"><p class="xh-qa-question">${esc(item.question)}</p>${item.hint ? `<p class="xh-qa-hint">💡 思路：${esc(item.hint)}</p>` : ''}${bodyHtml}</div>`;
  }

  function render() {
    if (!ctx) syncContext(false);
    const { st } = ensureState(ctx);
    const busy = Boolean(getActiveItem(st)?.loading);
    panelEl.innerHTML = `
      <header class="xh-panel-head">
        <div class="xh-ctx-pill">${buildContextLabel(ctx)}</div>
        <div class="xh-head-actions">
          <button type="button" class="xh-refresh-btn${st.batchLoading ? ' is-loading' : ''}" data-xh="refresh-batch" ${st.batchLoading ? 'disabled' : ''} title="用 AI 换一批随堂问题">
            <span class="xh-refresh-ico" aria-hidden="true">↻</span><span>${st.batchLoading ? '换题中…' : '换一批'}</span>
          </button>
          <button type="button" class="xh-panel-close" data-xh="close" aria-label="关闭小黄助教" title="关闭 (Esc)">×</button>
        </div>
      </header>
      <div class="xh-panel-body">
        ${renderErr(st.batchError, st.batchKeyHint)}
        ${renderChoices(st)}
        ${renderActiveCard(st)}
        <form class="xh-ask-form">
          <input type="text" class="xh-ask-input" placeholder="想问别的？输入后回车…" value="${esc(st.draft)}" ${busy ? 'disabled' : ''} />
          <button type="submit" class="xh-btn xh-btn-primary" ${busy ? 'disabled' : ''}>提问</button>
        </form>
      </div>`;

    panelEl.querySelector('[data-xh="close"]')?.addEventListener('click', close);
    panelEl.querySelector('[data-xh="refresh-batch"]')?.addEventListener('click', refreshBatch);
    panelEl.querySelectorAll('[data-xh-choice]').forEach((b) => b.addEventListener('click', () => selectChoice(Number(b.dataset.xhChoice))));
    panelEl.querySelector('[data-xh="reveal"]')?.addEventListener('click', () => { const it = getActiveItem(st); if (it) { it.revealed = true; render(); if (lastAnchor) reposition(lastAnchor); } });
    panelEl.querySelector('[data-xh="hide"]')?.addEventListener('click', () => { const it = getActiveItem(st); if (it) { it.revealed = false; render(); if (lastAnchor) reposition(lastAnchor); } });
    panelEl.querySelectorAll('[data-xh-action]').forEach((el) => el.addEventListener('click', () => ctx?.onAiAction?.(el.dataset.xhAction)));
    const input = panelEl.querySelector('.xh-ask-input');
    input?.addEventListener('input', () => { st.draft = input.value; });
    panelEl.querySelector('.xh-ask-form')?.addEventListener('submit', (e) => { e.preventDefault(); submitCustomQuestion(input?.value || st.draft); });
  }

  function reposition(anchorRect) {
    if (!anchorRect || !isOpen) return;
    lastAnchor = anchorRect;
    const pad = 12;
    const gap = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panelEl.offsetWidth || Math.min(384, vw - pad * 2);
    const ph = panelEl.offsetHeight || Math.min(440, vh - pad * 2);
    let left = anchorRect.right + gap;
    let top = anchorRect.top;
    if (left + pw > vw - pad) {
      const leftSide = anchorRect.left - gap - pw;
      if (leftSide >= pad) left = leftSide;
      else { left = Math.min(Math.max(pad, anchorRect.left + anchorRect.width / 2 - pw / 2), vw - pad - pw); top = anchorRect.bottom + gap; }
    }
    panelEl.style.left = `${Math.round(Math.min(Math.max(pad, left), Math.max(pad, vw - pad - pw)))}px`;
    panelEl.style.top = `${Math.round(Math.min(Math.max(pad, top), Math.max(pad, vh - pad - ph)))}px`;
  }

  function open(anchorRect) {
    isOpen = true;
    lastAnchor = anchorRect || lastAnchor;
    panelEl.hidden = false;
    syncContext(true);
    requestAnimationFrame(() => { panelEl.classList.add('is-open'); if (lastAnchor) reposition(lastAnchor); });
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    panelEl.classList.remove('is-open');
    panelEl.hidden = true;
    onClose?.();
  }

  const unsubChanges = observeActivePageChanges(() => syncContext(false));
  const onKey = (e) => { if (e.key === 'Escape' && isOpen) close(); };
  window.addEventListener('keydown', onKey);

  return {
    open, close, toggle: (r) => (isOpen ? close() : open(r)), isOpen: () => isOpen, reposition, refreshContext: () => syncContext(true),
    destroy() { unsubChanges(); window.removeEventListener('keydown', onKey); panelEl.remove(); },
  };
}
