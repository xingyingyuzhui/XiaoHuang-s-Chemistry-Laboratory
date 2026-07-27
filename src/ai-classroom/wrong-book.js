import { appAlert } from '../app-dialog.js';

/** 错题本独立控制器：本地展开/作答状态与 API、气泡提示解耦于课堂入口。 */
export function createWrongBookController({
  select,
  escapeHtml,
  quizApi,
  aiApi,
  showAppBubble,
  isRateLimitedError,
  onBadgeChange,
  onOpenQuiz,
  onRefreshStats,
}) {
  let list = [];
  let expandedId = null;
  let uiState = {};
  const letters = ['A', 'B', 'C', 'D'];

  const stateFor = (id) => (uiState[id] ||= { chosen: null, locked: false });
  const currentItem = (id) => list.find((item) => item.id === id);
  const shuffle = (items) => {
    for (let index = items.length - 1; index > 0; index -= 1) {
      const target = Math.floor(Math.random() * (index + 1));
      [items[index], items[target]] = [items[target], items[index]];
    }
    return items;
  };

  async function load() {
    const root = select('#wrongBookList');
    const meta = select('#wbListMeta');
    if (root) root.innerHTML = '<p class="quiz-muted" style="padding:1rem 0">加载中…</p>';
    try {
      const data = await quizApi.wrongBook();
      list = shuffle([...(data?.list || [])]);
      uiState = {};
      expandedId = list[0]?.id || null;
      onBadgeChange(list.length);
      if (meta) meta.textContent = `做对后自动移出 · 共 ${list.length} 题 · 顺序已打乱`;
      render();
    } catch (error) {
      if (root) root.innerHTML = `<p class="quiz-muted">加载失败：${escapeHtml(error.message || '')}</p>`;
    }
  }

  function reset() {
    uiState = {};
    expandedId = null;
  }

  function render() {
    const root = select('#wrongBookList');
    if (!root) return;
    if (!list.length) {
      root.innerHTML = `<div class="quiz-result-item" style="cursor:default;padding:1.25rem 1rem;text-align:center"><p class="quiz-muted" style="margin:0 0 0.75rem">暂无错题。答错或查看 AI 解答后会出现在这里；做对后自动移出。</p><button type="button" class="btn primary btn-sm" id="btnWrongGoQuiz">去智能出题</button></div>`;
      select('#btnWrongGoQuiz')?.addEventListener('click', onOpenQuiz);
      return;
    }
    root.innerHTML = list.map((item, index) => {
      const open = expandedId === item.id;
      const state = stateFor(item.id);
      const last = item.lastChosen == null ? '—' : letters[item.lastChosen];
      const brief = item.stem.length > 56 ? `${item.stem.slice(0, 56)}…` : item.stem;
      const options = (item.options || []).map((option, optionIndex) => {
        let className = 'quiz-opt';
        if (state.chosen === optionIndex) className += ' is-selected';
        if (state.locked && optionIndex === item.answer) className += ' is-correct';
        else if (state.locked && state.chosen === optionIndex) className += ' is-wrong';
        return `<button type="button" class="${className}" data-wb-id="${escapeHtml(item.id)}" data-wb-opt="${optionIndex}" ${state.locked ? 'disabled' : ''}><strong>${letters[optionIndex]}.</strong> ${escapeHtml(option)}</button>`;
      }).join('');
      const feedback = !state.locked ? '' : state.chosen === item.answer
        ? '<p class="quiz-feedback is-ok">回答正确，已自动移出错题本</p>'
        : `<p class="quiz-feedback is-err">还不对，正确答案是 ${letters[item.answer]}；本题仍保留</p>`;
      return `<div class="quiz-result-item${open ? ' is-expanded' : ''}" data-wb-card="${escapeHtml(item.id)}"><div class="quiz-result-item-summary" data-wb-toggle="${escapeHtml(item.id)}" role="button" tabindex="0"><span class="mark bad">错题</span><div class="quiz-result-item-text"><strong>第 ${index + 1} 题</strong>${item.knowledge ? ` · ${escapeHtml(item.knowledge)}` : ''}<span class="quiz-result-brief">${escapeHtml(brief)}</span><span class="quiz-result-brief">上次选择：${last}</span></div><span class="quiz-result-chevron" aria-hidden="true">${open ? '▴' : '▾'}</span></div><div class="quiz-result-detail" ${open ? '' : 'hidden'}><p class="quiz-stem">${escapeHtml(item.stem)}</p><div class="quiz-options">${options}</div>${feedback}<div class="quiz-card-tools" style="margin-top:0.65rem"><button type="button" class="btn ghost btn-sm" data-wb-hint="${escapeHtml(item.id)}" ${state.locked ? 'disabled' : ''}>AI 提示</button><button type="button" class="btn ghost btn-sm" data-wb-explain="${escapeHtml(item.id)}">AI 解答</button><button type="button" class="btn primary btn-sm" data-wb-submit="${escapeHtml(item.id)}" ${state.chosen === null || state.locked ? 'disabled' : ''}>提交答案</button></div></div></div>`;
    }).join('');

    root.querySelectorAll('[data-wb-toggle]').forEach((element) => {
      const toggle = () => {
        const id = element.dataset.wbToggle;
        expandedId = expandedId === id ? null : id;
        if (expandedId && !stateFor(expandedId).locked) stateFor(expandedId).chosen = null;
        render();
        root.querySelector(`[data-wb-card="${CSS.escape(expandedId)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
      element.addEventListener('click', (event) => { event.stopPropagation(); toggle(); });
      element.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggle(); }
      });
    });
    root.querySelectorAll('[data-wb-opt]').forEach((button) => button.addEventListener('click', (event) => {
      event.stopPropagation();
      const state = stateFor(button.dataset.wbId);
      if (!state.locked) { state.chosen = Number(button.dataset.wbOpt); render(); }
    }));
    root.querySelectorAll('[data-wb-hint]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); showHint(button.dataset.wbHint); }));
    root.querySelectorAll('[data-wb-explain]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); showExplain(button.dataset.wbExplain); }));
    root.querySelectorAll('[data-wb-submit]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); submit(button.dataset.wbSubmit); }));
  }

  async function showHint(id) {
    const item = currentItem(id);
    if (!item) return;
    const request = async (force = false) => {
      showAppBubble({ title: 'AI 提示', loading: true, persistent: true, loadingText: '老师想一想……' });
      try {
        let text = !force && item.hint ? item.hint : '';
        if (!text || force) {
          text = (await aiApi.quizHint({ stem: item.stem, options: item.options, knowledge: item.knowledge }))?.text || '先排除明显错误的选项，再联系核心概念。';
          item.hint = text;
        }
        showAppBubble({ title: 'AI 提示', text, persistent: true, scrollable: true, onRegenerate: () => request(true) });
      } catch (error) {
        showAppBubble({ title: 'AI 提示', text: error.message || '提示失败', source: 'local', persistent: true, showActions: true, onRegenerate: isRateLimitedError(error) ? null : () => request(true) });
      }
    };
    await request();
  }

  async function showExplain(id) {
    const item = currentItem(id);
    if (!item) return;
    const request = async () => {
      showAppBubble({ title: 'AI 解答', loading: true, persistent: true, loadingText: '正在讲解……' });
      try {
        const data = await aiApi.quizExplain({ stem: item.stem, options: item.options, answer: item.answer, knowledge: item.knowledge, explain: item.explain });
        const text = data?.text || item.explain || `正确答案是 ${String.fromCharCode(65 + item.answer)}。`;
        item.explain = text;
        showAppBubble({ title: 'AI 解答', text, persistent: true, scrollable: true, onRegenerate: request });
      } catch (error) {
        showAppBubble({ title: 'AI 解答', text: isRateLimitedError(error) ? error.message || '本小时次数已用完' : item.explain || error.message || '解答失败', source: 'local', persistent: true, showActions: isRateLimitedError(error), onRegenerate: isRateLimitedError(error) ? null : request });
      }
    };
    await request();
  }

  async function submit(id) {
    const item = currentItem(id);
    const state = stateFor(id);
    if (!item || state.chosen === null || state.locked) return;
    try {
      const data = await quizApi.attemptWrong(item.id, state.chosen);
      state.locked = true;
      if (typeof data.answer === 'number') item.answer = data.answer;
      if (data.cleared) {
        onBadgeChange(Math.max(0, list.length - 1));
        render();
        window.setTimeout(async () => { reset(); await load(); await onRefreshStats(); }, 900);
      } else render();
    } catch (error) {
      await appAlert(error.message || '提交失败', { title: '提交失败' });
    }
  }

  return { load, reset };
}
