/**
 * 晶胞模块 · 按需右侧滑出抽屉（课堂思考题 + AI 3D 助教）
 * 默认关闭，不遮挡 3D/2D 舞台；Esc 或 × 关闭。
 */

import { aiApi } from '../../api/client.js';
import { formulaHtml } from '../../chem/formula-html.js';

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

const DEFAULT_QUESTIONS = [
  '本节最容易考的核心结论是什么？',
  '请用通俗类比讲清这个结构特点',
  '高考常见易错点有哪些？',
];

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isMissingKeyError(err) {
  const msg = String(err?.message || '');
  return err?.status === 400 || /key|密钥|未配置|api\s*key/i.test(msg);
}

/**
 * 创建右侧滑出 Inspector 抽屉
 * @param {HTMLElement} hostEl - `.crystal-inspector` 容器
 * @param {{ onStateChange?: (state: { open: boolean, tab: string }) => void }} [opts]
 */
export function createInspectorDrawer(hostEl, { onStateChange } = {}) {
  let isOpen = false;
  let activeTab = 'qa';
  let ctx = null;
  let ctxKey = '';
  let qaRevealed = false;
  let aiLoading = false;
  let aiError = '';
  let aiKeyHint = false;
  let aiResult = null;
  let aiDraft = '';
  let activeStepIdx = -1;
  let reqSeq = 0;

  hostEl.hidden = true;
  hostEl.innerHTML = `
    <div class="crystal-inspector-head">
      <div class="crystal-inspector-tabs" role="tablist" aria-label="助教与思考题">
        <button type="button" class="crystal-inspector-tab is-active" data-tab="qa" role="tab" aria-selected="true">思考题</button>
        <button type="button" class="crystal-inspector-tab" data-tab="ai" role="tab" aria-selected="false">AI 助教</button>
      </div>
      <button type="button" class="crystal-inspector-close" data-act="close" aria-label="关闭侧栏" title="关闭 (Esc)">×</button>
    </div>
    <div class="crystal-inspector-body"></div>
  `;

  const tabBtns = hostEl.querySelectorAll('.crystal-inspector-tab');
  const closeBtn = hostEl.querySelector('[data-act="close"]');
  const bodyEl = hostEl.querySelector('.crystal-inspector-body');

  function notify() {
    onStateChange?.({ open: isOpen, tab: activeTab });
  }

  function syncTabs() {
    tabBtns.forEach((btn) => {
      const on = btn.dataset.tab === activeTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function renderContextBadge() {
    if (!ctx) return '';
    const formulaPart = ctx.formula ? `<strong class="crystal-ctx-formula">${formulaHtml(ctx.formula)}</strong>` : '';
    const titlePart = ctx.title ? `<span class="crystal-ctx-title">${esc(ctx.title)}</span>` : '';
    return `<div class="crystal-ai-context">${formulaPart}${titlePart}</div>`;
  }

  function renderQaTab() {
    const qa = ctx?.qa;
    const qaHtml = qa?.question
      ? `
        <section class="crystal-qa-card">
          <div class="crystal-qa-card-head">
            <span class="crystal-qa-label">课堂思考题</span>
            <span class="crystal-tag crystal-tag-qa">${qaRevealed ? '已揭晓' : '先思考'}</span>
          </div>
          <p class="crystal-qa-question">${esc(qa.question)}</p>
          <div class="crystal-qa-answer-box ${qaRevealed ? 'is-revealed' : 'is-covered'}">
            <p class="crystal-qa-answer">${esc(qa.answer || '')}</p>
            <div class="crystal-qa-cover" ${qaRevealed ? 'hidden' : ''}>
              <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-qa="reveal">点击揭晓结论</button>
            </div>
          </div>
          <div class="crystal-qa-foot" ${qaRevealed ? '' : 'hidden'}>
            <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-qa="hide">重新盖住</button>
          </div>
        </section>
      `
      : `<div class="crystal-inspector-empty">当前内容暂无预设思考题，可切换至「AI 助教」直接提问。</div>`;

    const detailsHtml = ctx?.detailsHtml
      ? `<section class="crystal-inspector-details">${ctx.detailsHtml}</section>`
      : '';

    bodyEl.innerHTML = `${renderContextBadge()}${qaHtml}${detailsHtml}`;

    bodyEl.querySelector('[data-qa="reveal"]')?.addEventListener('click', () => {
      qaRevealed = true;
      renderBody();
    });
    bodyEl.querySelector('[data-qa="hide"]')?.addEventListener('click', () => {
      qaRevealed = false;
      renderBody();
    });
  }

  function renderAiResultHtml() {
    if (aiLoading) {
      return `<div class="crystal-ai-status">AI 助教正在结合当前模型分析…</div>`;
    }
    if (aiError) {
      return `
        <div class="crystal-ai-error">
          <p>${esc(aiError)}</p>
          ${aiKeyHint ? '<p class="crystal-ai-key-tip">提示：请点击页面右上角「设置」填写 DeepSeek API Key 后重试。</p>' : ''}
        </div>
      `;
    }
    if (!aiResult) {
      return `<div class="crystal-inspector-empty">点选上方快捷问题，或输入课堂疑问，AI 助教可边讲边联动 3D 模型演示。</div>`;
    }
    const canAct = typeof ctx?.onAiAction === 'function';
    const stepsHtml = (aiResult.steps || [])
      .map((step, i) => {
        const hasAction = canAct && step?.action && ACTION_LABELS[step.action];
        const actLabel = hasAction ? ACTION_LABELS[step.action] : '';
        const cls = `crystal-ai-step${hasAction ? ' is-actionable' : ''}${activeStepIdx === i ? ' is-active' : ''}`;
        return `
          <div class="${cls}" ${hasAction ? `data-step-idx="${i}" data-ai-action="${esc(step.action)}" role="button" tabindex="0"` : ''}>
            <div class="crystal-ai-step-head">
              <span class="crystal-ai-step-num">${i + 1}</span>
              <strong class="crystal-ai-step-title">${esc(step?.title || `步骤 ${i + 1}`)}</strong>
              ${hasAction ? `<span class="crystal-ai-step-action">▶ ${esc(actLabel)}</span>` : ''}
            </div>
            ${step?.detail ? `<p class="crystal-ai-step-detail">${esc(step.detail)}</p>` : ''}
          </div>
        `;
      })
      .join('');

    return `
      <div class="crystal-ai-answer">${esc(aiResult.answer || '')}</div>
      ${stepsHtml ? `<div class="crystal-ai-steps">${stepsHtml}</div>` : ''}
    `;
  }

  async function askAi(question) {
    const q = String(question || '').trim();
    if (!q || aiLoading) return;
    aiDraft = q;
    aiLoading = true;
    aiError = '';
    aiKeyHint = false;
    activeStepIdx = -1;
    const seq = ++reqSeq;
    renderBody();

    try {
      const res = await aiApi.crystalGuide({
        title: ctx?.title || '晶胞与晶体',
        formula: ctx?.formula || '',
        module: ctx?.module || 'library',
        summary: ctx?.summary || '',
        question: q,
      });
      if (seq !== reqSeq) return;
      const payload = res?.data && !res?.answer ? res.data : res;
      aiResult = {
        answer: String(payload?.answer || '已完成分析，请查看下方分步演示。'),
        steps: Array.isArray(payload?.steps) ? payload.steps : [],
      };
    } catch (err) {
      if (seq !== reqSeq) return;
      aiError = err?.message || 'AI 助教请求失败，请稍后重试。';
      aiKeyHint = isMissingKeyError(err);
    } finally {
      if (seq === reqSeq) {
        aiLoading = false;
        renderBody();
      }
    }
  }

  function renderAiTab() {
    const questions = Array.isArray(ctx?.quickQuestions) && ctx.quickQuestions.length
      ? ctx.quickQuestions.slice(0, 3)
      : DEFAULT_QUESTIONS;

    bodyEl.innerHTML = `
      ${renderContextBadge()}
      <div class="crystal-ai-chips">
        ${questions.map((q) => `<button type="button" class="crystal-ai-chip" ${aiLoading ? 'disabled' : ''}>${esc(q)}</button>`).join('')}
      </div>
      <form class="crystal-ai-form">
        <input type="text" class="crystal-ai-input" placeholder="向 AI 助教提问，如：怎么数配位数？" value="${esc(aiDraft)}" ${aiLoading ? 'disabled' : ''} />
        <button type="submit" class="crystal-btn crystal-btn-primary crystal-btn-sm" ${aiLoading ? 'disabled' : ''}>${aiLoading ? '分析中' : '提问'}</button>
      </form>
      <div class="crystal-ai-result">${renderAiResultHtml()}</div>
    `;

    bodyEl.querySelectorAll('.crystal-ai-chip').forEach((chip) => {
      chip.addEventListener('click', () => askAi(chip.textContent));
    });

    const form = bodyEl.querySelector('.crystal-ai-form');
    const input = bodyEl.querySelector('.crystal-ai-input');
    input?.addEventListener('input', () => { aiDraft = input.value; });
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      askAi(input?.value || aiDraft);
    });

    bodyEl.querySelectorAll('.crystal-ai-step[data-ai-action]').forEach((card) => {
      const trigger = () => {
        const action = card.dataset.aiAction;
        activeStepIdx = Number(card.dataset.stepIdx);
        ctx?.onAiAction?.(action);
        renderBody();
      };
      card.addEventListener('click', trigger);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          trigger();
        }
      });
    });
  }

  function renderBody() {
    syncTabs();
    if (activeTab === 'ai') renderAiTab();
    else renderQaTab();
  }

  function open(tab = 'qa') {
    activeTab = tab === 'ai' ? 'ai' : 'qa';
    isOpen = true;
    hostEl.hidden = false;
    renderBody();
    notify();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    hostEl.hidden = true;
    notify();
  }

  function toggle(tab = 'qa') {
    const next = tab === 'ai' ? 'ai' : 'qa';
    if (isOpen && activeTab === next) close();
    else open(next);
  }

  function setContext(nextCtx) {
    const nextKey = nextCtx
      ? `${nextCtx.module || ''}|${nextCtx.formula || ''}|${nextCtx.title || ''}`
      : '';
    ctx = nextCtx || null;
    if (nextKey !== ctxKey) {
      ctxKey = nextKey;
      qaRevealed = false;
      aiLoading = false;
      aiError = '';
      aiKeyHint = false;
      aiResult = null;
      aiDraft = '';
      activeStepIdx = -1;
      reqSeq += 1;
    }
    if (isOpen) renderBody();
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.tab === 'ai' ? 'ai' : 'qa';
      if (next === activeTab) return;
      activeTab = next;
      renderBody();
      notify();
    });
  });

  closeBtn.addEventListener('click', close);

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && isOpen) close();
  };
  window.addEventListener('keydown', onKeyDown);

  return {
    open,
    toggle,
    close,
    isOpen: () => isOpen,
    getTab: () => activeTab,
    setContext,
    destroy() {
      reqSeq += 1;
      window.removeEventListener('keydown', onKeyDown);
      hostEl.innerHTML = '';
      hostEl.hidden = true;
    },
  };
}
