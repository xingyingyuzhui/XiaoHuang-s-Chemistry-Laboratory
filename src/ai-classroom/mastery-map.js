/**
 * 知识掌握地图 — 前端模块
 * 展示各知识点练习情况、薄弱点和复习建议。
 */

export function createMasteryMapController({ select, escapeHtml, masteryApi }) {
  const LEVEL_COLORS = {
    unstarted: 'var(--text-secondary)',
    beginner: 'var(--stamp)',
    practicing: 'var(--accent)',
    mastered: 'var(--success, #4caf50)',
  };

  const LEVEL_ICONS = {
    unstarted: '○',
    beginner: '△',
    practicing: '◐',
    mastered: '●',
  };

  function renderSummary(data) {
    const el = select('#masterySummary');
    if (!el) return;
    const s = data.summary;
    if (!s.totalQuestions) {
      el.innerHTML = '<p class="quiz-muted">还没有练习记录。完成一次练习后，这里会显示你的知识掌握地图。</p>';
      return;
    }
    el.innerHTML = `
      <div class="quiz-stats-grid">
        <div><em>已练题数</em><strong>${s.totalQuestions}</strong></div>
        <div><em>正确数</em><strong>${s.totalCorrect}</strong></div>
        <div><em>正确率</em><strong>${s.accuracy}%</strong></div>
        <div><em>未解决错题</em><strong>${s.totalWrong}</strong></div>
      </div>`;
  }

  function renderTopics(topics) {
    const el = select('#masteryTopics');
    if (!el) return;
    if (!topics.length) {
      el.innerHTML = '<p class="quiz-muted">暂无知识点数据</p>';
      return;
    }
    el.innerHTML = topics.map((t) => {
      const color = LEVEL_COLORS[t.level] || LEVEL_COLORS.unstarted;
      const icon = LEVEL_ICONS[t.level] || '○';
      const accText = t.accuracy !== null ? `${t.accuracy}%` : '—';
      const detail = t.total > 0
        ? `${t.total}题 · 正确率 ${accText}`
        : '暂无练习';
      return `
        <div class="mastery-topic-row">
          <span class="mastery-topic-icon" style="color:${color}">${icon}</span>
          <div class="mastery-topic-info">
            <strong class="mastery-topic-name">${escapeHtml(t.name)}</strong>
            <span class="mastery-topic-detail">${detail}${t.wrong > 0 ? ` · <span class="mastery-wrong-count">${t.wrong} 错题</span>` : ''}</span>
          </div>
          <span class="mastery-topic-level" style="color:${color}">${escapeHtml(t.levelLabel)}</span>
        </div>`;
    }).join('');
  }

  function renderWeakTopics(weakTopics) {
    const el = select('#masteryWeak');
    if (!el) return;
    if (!weakTopics.length) {
      el.innerHTML = '<p class="quiz-muted">目前没有薄弱知识点，继续保持！</p>';
      return;
    }
    el.innerHTML = '<ul class="mastery-weak-list">' +
      weakTopics.map((t) =>
        `<li><strong>${escapeHtml(t.name)}</strong>：正确率 ${t.accuracy !== null ? t.accuracy + '%' : '—'}${t.wrong > 0 ? `，${t.wrong} 道错题` : ''}</li>`
      ).join('') + '</ul>';
  }

  function renderSuggestions(suggestions) {
    const el = select('#masterySuggestions');
    if (!el) return;
    if (!suggestions.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML = '<ul class="mastery-suggestion-list">' +
      suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('') +
      '</ul>';
  }

  async function load() {
    const status = select('#masteryStatus');
    try {
      if (status) status.textContent = '加载中…';
      const data = await masteryApi.summary();
      renderSummary(data);
      renderTopics(data.topics || []);
      renderWeakTopics(data.weakTopics || []);
      renderSuggestions(data.suggestions || []);
      if (status) status.textContent = '';
    } catch (err) {
      if (status) status.textContent = `加载失败：${err.message || ''}`;
    }
  }

  async function init() {
    await load();
  }

  return { init, load };
}
