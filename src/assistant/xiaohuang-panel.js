/**
 * 随堂小黄统一助手卡片（思考题 + AI 生成思考题 + AI 助教问答与 3D 联动）
 */

import { aiApi } from '../api/client.js';
import { formulaHtml } from '../chem/formula-html.js';
import { getActivePageContext, onPageContextChange } from './page-context.js';

const ACTION_LABELS = {
  'ball-stick': '切换球棍模型',
  'space-filling': '切换比例填充',
  slice: '切开晶胞',
  explode: '炸开看均摊',
  'tile-2': '拼接 2 晶胞',
  'tile-3': '拼接 3 晶胞',
  coordination: '高亮配位数',
  distance: '标注最短距离',
  reset: '复位单胞视角',
};
const FALLBACK_CHIPS = ['本节最容易考的核心结论是什么？', '请用通俗类比讲清这个知识点', '高考常见易错点有哪些？'];
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isKeyErr = (err) => /key|密钥|未配置|api\s*key/i.test(String(err?.message || ''));
const avatarSrc = () => document.getElementById('appBrandIcon')?.getAttribute('src') || '/brand-avatar.png';
const ctxKeyOf = (c) => `${c?.tab || ''}|${c?.module || ''}|${c?.formula || ''}|${c?.title || ''}`;

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

export function createXiaohuangPanel({ onClose } = {}) {
  const panelEl = document.createElement('section');
  panelEl.className = 'xh-panel';
  panelEl.setAttribute('role', 'dialog');
  panelEl.setAttribute('aria-label', '小黄随堂助教');
  panelEl.hidden = true;
  document.body.appendChild(panelEl);

  const qaCache = new Map();
  let isOpen = false;
  let lastAnchor = null;
  let ctx = null;
  let curKey = '';
  let qaState = { loading: false, error: '', keyHint: false, seq: 0 };
  let aiState = { loading: false, error: '', keyHint: false, draft: '', result: null, stepIdx: -1, seq: 0 };

  function ensureQa(c) {
    const key = ctxKeyOf(c);
    let st = qaCache.get(key);
    if (!st) {
      const items = c?.qa?.question
        ? [{ question: String(c.qa.question).trim(), answer: String(c.qa.answer || '').trim(), hint: '', action: null, source: 'builtin', revealed: false }]
        : [];
      st = { items, idx: 0 };
      if (qaCache.size >= 24) qaCache.delete(qaCache.keys().next().value);
      qaCache.set(key, st);
    }
    return { key, st };
  }

  function syncContext(force = false) {
    const nextCtx = getActivePageContext();
    const { key } = ensureQa(nextCtx);
    const changed = key !== curKey;
    ctx = nextCtx;
    if (changed) {
      curKey = key;
      qaState = { loading: false, error: '', keyHint: false, seq: qaState.seq + 1 };
      aiState = { loading: false, error: '', keyHint: false, draft: '', result: null, stepIdx: -1, seq: aiState.seq + 1 };
    }
    if (isOpen && (changed || force)) {
      render();
      if (lastAnchor) reposition(lastAnchor);
    }
  }

  function renderQa(st) {
    const total = st.items.length;
    st.idx = total ? Math.min(Math.max(0, st.idx), total - 1) : 0;
    const item = st.items[st.idx] || null;
    const actLabel = item?.action && typeof ctx?.onAiAction === 'function' ? ACTION_LABELS[item.action] : '';
    const pager = total > 1
      ? `<div class="xh-qa-pager"><button type="button" class="xh-icon-btn" data-xh="prev-qa" aria-label="上一题" ${st.idx === 0 ? 'disabled' : ''}>‹</button><span class="xh-qa-count">${st.idx + 1} / ${total}</span><button type="button" class="xh-icon-btn" data-xh="next-qa" aria-label="下一题" ${st.idx >= total - 1 ? 'disabled' : ''}>›</button></div>`
      : '';
    const card = item
      ? `<div class="xh-qa-card">
          <div class="xh-qa-meta"><span class="xh-badge ${item.source === 'ai' ? 'is-ai' : ''}">${item.source === 'ai' ? 'AI 思考题' : '随堂思考题'}</span>${pager}</div>
          <p class="xh-qa-question">${esc(item.question)}</p>
          ${item.hint ? `<p class="xh-qa-hint">💡 思路：${esc(item.hint)}</p>` : ''}
          <div class="xh-qa-answer-wrap ${item.revealed ? 'is-revealed' : 'is-covered'}">
            <p class="xh-qa-answer">${esc(item.answer)}</p>
            ${item.revealed ? '' : '<div class="xh-qa-cover"><button type="button" class="xh-btn xh-btn-primary" data-xh="reveal">点击揭晓结论</button></div>'}
          </div>
          <div class="xh-qa-tools">
            ${item.revealed ? '<button type="button" class="xh-btn xh-btn-ghost" data-xh="hide">重新盖住</button>' : ''}
            ${actLabel ? `<button type="button" class="xh-action-pill" data-xh-action="${esc(item.action)}">▶ 联动画面演示 · ${esc(actLabel)}</button>` : ''}
          </div>
        </div>`
      : '<div class="xh-empty">当前页面暂无预设思考题，点击右上角按钮让小黄即兴出一道！</div>';
    return `<section class="xh-section"><div class="xh-section-head"><h3 class="xh-section-title">随堂思考题</h3><button type="button" class="xh-btn xh-btn-ai" data-xh="gen-qa" ${qaState.loading ? 'disabled' : ''}>${qaState.loading ? '✨ 正在出题…' : '✨ AI 生成思考题'}</button></div>${renderErr(qaState.error, qaState.keyHint)}${card}</section>`;
  }

  function renderAiReply() {
    if (aiState.loading) return '<div class="xh-status">小黄正在结合当前内容思考…</div>';
    if (aiState.error) return renderErr(aiState.error, aiState.keyHint);
    if (!aiState.result) return '';
    const canAct = typeof ctx?.onAiAction === 'function';
    const steps = (aiState.result.steps || []).map((s, i) => {
      const label = canAct && s?.action ? ACTION_LABELS[s.action] : '';
      const cls = `xh-step${label ? ' is-actionable' : ''}${aiState.stepIdx === i ? ' is-active' : ''}`;
      return `<div class="${cls}" ${label ? `data-xh-step="${i}" data-xh-action="${esc(s.action)}" role="button" tabindex="0"` : ''}><div class="xh-step-head"><span class="xh-step-num">${i + 1}</span><strong>${esc(s?.title || `步骤 ${i + 1}`)}</strong>${label ? `<span class="xh-step-act">▶ ${esc(label)}</span>` : ''}</div>${s?.detail ? `<p class="xh-step-detail">${esc(s.detail)}</p>` : ''}</div>`;
    }).join('');
    return `<div class="xh-ai-answer">${esc(aiState.result.answer || '')}</div>${steps ? `<div class="xh-steps">${steps}</div>` : ''}`;
  }

  async function generateQuestion() {
    if (qaState.loading || !ctx) return;
    const { key, st } = ensureQa(ctx);
    const seq = ++qaState.seq;
    qaState = { loading: true, error: '', keyHint: false, seq };
    render();
    try {
      const data = await aiApi.thinkingQuestion({
        title: ctx.title || '高中化学',
        formula: ctx.formula || '',
        module: typeof ctx.onAiAction === 'function' ? (ctx.module || 'library') : (ctx.module || ctx.tab || ''),
        summary: ctx.summary || '',
        existingQuestions: st.items.map((x) => x.question),
      });
      if (seq !== qaState.seq || key !== curKey) return;
      const question = String(data?.question || '').trim();
      if (!question) throw new Error('AI 未返回有效思考题');
      st.items.push({
        question,
        answer: String(data?.answer || '').trim(),
        hint: String(data?.hint || '').trim(),
        action: data?.action || null,
        source: 'ai',
        revealed: false,
      });
      st.idx = st.items.length - 1;
    } catch (err) {
      if (seq !== qaState.seq || key !== curKey) return;
      qaState.error = err?.message || '生成思考题失败，请稍后重试';
      qaState.keyHint = isKeyErr(err);
    } finally {
      if (seq === qaState.seq) {
        qaState.loading = false;
        render();
        if (lastAnchor) reposition(lastAnchor);
      }
    }
  }

  async function askAi(question) {
    const q = String(question || '').trim();
    if (!q || aiState.loading || !ctx) return;
    const key = curKey;
    const seq = ++aiState.seq;
    aiState = { ...aiState, draft: q, loading: true, error: '', keyHint: false, stepIdx: -1, seq };
    render();
    const mod = typeof ctx.onAiAction === 'function'
      ? (ctx.module || 'library')
      : (ctx.module === 'properties' ? 'properties' : 'basics');
    try {
      const res = await aiApi.crystalGuide({
        title: ctx.title || '高中化学',
        formula: ctx.formula || '',
        module: mod,
        summary: ctx.summary || '',
        question: q,
      });
      if (seq !== aiState.seq || key !== curKey) return;
      aiState.result = { answer: String(res?.answer || '已完成解答。'), steps: Array.isArray(res?.steps) ? res.steps : [] };
    } catch (err) {
      if (seq !== aiState.seq || key !== curKey) return;
      aiState.error = err?.message || 'AI 助教请求失败，请稍后重试';
      aiState.keyHint = isKeyErr(err);
    } finally {
      if (seq === aiState.seq) {
        aiState.loading = false;
        render();
        if (lastAnchor) reposition(lastAnchor);
      }
    }
  }

  function render() {
    if (!ctx) syncContext(false);
    const { st } = ensureQa(ctx);
    const chips = Array.isArray(ctx?.quickQuestions) && ctx.quickQuestions.length ? ctx.quickQuestions.slice(0, 3) : FALLBACK_CHIPS;
    panelEl.innerHTML = `
      <header class="xh-panel-head">
        <div class="xh-panel-brand"><img class="xh-panel-avatar" src="${esc(avatarSrc())}" alt="" draggable="false" /><div class="xh-ctx-pill">${buildContextLabel(ctx)}</div></div>
        <button type="button" class="xh-panel-close" data-xh="close" aria-label="关闭小黄助教" title="关闭 (Esc)">×</button>
      </header>
      <div class="xh-panel-body">
        ${renderQa(st)}
        <section class="xh-section xh-ask-section">
          <div class="xh-section-head"><h3 class="xh-section-title">问小黄助教</h3></div>
          <div class="xh-chips">${chips.map((q) => `<button type="button" class="xh-chip" data-xh-chip="${esc(q)}" ${aiState.loading ? 'disabled' : ''}>${esc(q)}</button>`).join('')}</div>
          <form class="xh-ask-form">
            <input type="text" class="xh-ask-input" placeholder="输入课堂疑问，按回车提问…" value="${esc(aiState.draft)}" ${aiState.loading ? 'disabled' : ''} />
            <button type="submit" class="xh-btn xh-btn-primary" ${aiState.loading ? 'disabled' : ''}>${aiState.loading ? '分析中' : '发送'}</button>
          </form>
          <div class="xh-ai-reply">${renderAiReply()}</div>
        </section>
      </div>`;
    panelEl.querySelector('[data-xh="close"]')?.addEventListener('click', close);
    panelEl.querySelector('[data-xh="gen-qa"]')?.addEventListener('click', generateQuestion);
    panelEl.querySelector('[data-xh="prev-qa"]')?.addEventListener('click', () => { st.idx = Math.max(0, st.idx - 1); render(); });
    panelEl.querySelector('[data-xh="next-qa"]')?.addEventListener('click', () => { st.idx = Math.min(st.items.length - 1, st.idx + 1); render(); });
    panelEl.querySelector('[data-xh="reveal"]')?.addEventListener('click', () => { if (st.items[st.idx]) { st.items[st.idx].revealed = true; render(); } });
    panelEl.querySelector('[data-xh="hide"]')?.addEventListener('click', () => { if (st.items[st.idx]) { st.items[st.idx].revealed = false; render(); } });
    panelEl.querySelectorAll('[data-xh-chip]').forEach((b) => b.addEventListener('click', () => askAi(b.dataset.xhChip)));
    panelEl.querySelectorAll('[data-xh-action]').forEach((el) => {
      const fire = () => {
        if (el.dataset.xhStep !== undefined) aiState.stepIdx = Number(el.dataset.xhStep);
        ctx?.onAiAction?.(el.dataset.xhAction);
        if (el.dataset.xhStep !== undefined) render();
      };
      el.addEventListener('click', fire);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fire(); } });
    });
    const input = panelEl.querySelector('.xh-ask-input');
    input?.addEventListener('input', () => { aiState.draft = input.value; });
    panelEl.querySelector('.xh-ask-form')?.addEventListener('submit', (e) => { e.preventDefault(); askAi(input?.value || aiState.draft); });
  }

  function reposition(anchorRect) {
    if (!anchorRect || !isOpen) return;
    lastAnchor = anchorRect;
    const pad = 12;
    const gap = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = panelEl.offsetWidth || Math.min(392, vw - pad * 2);
    const ph = panelEl.offsetHeight || Math.min(460, vh - pad * 2);
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

  const unsub = onPageContextChange(() => syncContext(true));
  const onDocClick = (e) => { if (e.target?.closest?.('.tab[data-tab]')) requestAnimationFrame(() => syncContext(true)); };
  const onKey = (e) => { if (e.key === 'Escape' && isOpen) close(); };
  document.addEventListener('click', onDocClick, true);
  window.addEventListener('keydown', onKey);

  return {
    open, close, toggle: (r) => (isOpen ? close() : open(r)), isOpen: () => isOpen, reposition, refreshContext: () => syncContext(true),
    destroy() { unsub(); document.removeEventListener('click', onDocClick, true); window.removeEventListener('keydown', onKey); panelEl.remove(); },
  };
}
