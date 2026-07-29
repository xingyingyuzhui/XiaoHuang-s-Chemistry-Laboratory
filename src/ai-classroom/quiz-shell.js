/**
 * 智能出题 · UI 壳（试卷 / 结果 / 统计 / 导出）
 * 领域逻辑见 quiz-model.js；HTML 片段见 quiz-views.js
 */

import { buildPaperHtml, buildResultListHtml } from './quiz-views.js';

/**
 * @param {object} deps
 * @param {(sel: string) => Element|null} deps.select
 * @param {(s: string) => string} deps.escapeHtml
 * @param {ReturnType<import('./quiz-model.js').createQuizModel>} deps.quizModel
 * @param {object} deps.quizConfig
 * @param {() => { grades: number[], difficulty: string, topics: string[], count: number, reveal: string }} deps.getConfig
 * @param {object} deps.aiApi
 * @param {object} deps.quizApi
 * @param {typeof import('../brand-tip.js').showAppBubble} deps.showAppBubble
 * @param {typeof import('../brand-tip.js').hideBrandTip} deps.hideBrandTip
 * @param {typeof import('../app-dialog.js').appAlert} deps.appAlert
 * @param {typeof import('../app-dialog.js').appConfirm} deps.appConfirm
 * @param {(err: any) => boolean} deps.isRateLimitedError
 * @param {(count: number) => void} deps.onBadgeChange
 */
export function createQuizShellController({
  select,
  escapeHtml,
  quizModel,
  quizConfig,
  getConfig,
  aiApi,
  quizApi,
  showAppBubble,
  hideBrandTip,
  appAlert,
  appConfirm,
  isRateLimitedError,
  onBadgeChange,
}) {
  function setStatus(el, text, ok) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'quiz-status' + (text ? (ok ? ' is-ok' : ' is-err') : '');
  }

  function showView(name) {
    const cfg = select('#quizConfig');
    const paperEl = select('#quizPaper');
    const result = select('#quizResult');
    if (cfg) cfg.hidden = name !== 'config';
    if (paperEl) paperEl.hidden = name !== 'paper';
    if (result) result.hidden = name !== 'result';
    if (name === 'config') {
      refreshStats();
    }
  }

  async function loadAiScore(_stats) {
    const cell = select('#quizAiScoreCell');
    const tip = select('#quizAiScoreTip');
    if (!cell) return;
    try {
      const data = await aiApi.quizScore({});
      const score = data?.score;
      const comment = data?.comment || '';
      const strong = cell.querySelector('strong');
      if (strong) {
        strong.className = 'quiz-ai-score-value';
        strong.textContent =
          score === 0 || score ? `${Number(score).toFixed(1)}` : '—';
      }
      if (tip) {
        tip.textContent = comment;
        tip.title = comment + (data?.cached ? '（数据未变，沿用上次评分）' : '');
      }
    } catch (err) {
      const strong = cell.querySelector('strong');
      if (strong) {
        strong.className = '';
        strong.textContent = '—';
      }
      if (tip) tip.textContent = err.message || '评分失败';
    }
  }

  async function refreshStats() {
    const statsBody = select('#quizStatsBody');

    try {
      const stats = await quizApi.stats();
      onBadgeChange?.(Number(stats.wrongBookCount || 0));

      if (statsBody) {
        if (!stats.totalSessions) {
          statsBody.innerHTML = `<p class="quiz-muted">还没有练习记录，生成一套题开始吧。</p>`;
        } else {
          const weak =
            (stats.weakKnowledge || [])
              .slice(0, 3)
              .map((w) => escapeHtml(w.name))
              .join('、') || '—';
          const recent = (stats.recent || [])
            .slice(0, 3)
            .map(
              (r) =>
                `<span class="quiz-stats-recent-item">${escapeHtml(
                  new Date(r.createdAt).toLocaleString(),
                )} · ${escapeHtml(r.difficulty || '')} · ${r.correct}/${r.total}（${r.rate}%）</span>`,
            )
            .join('');
          statsBody.innerHTML = `
          <div class="quiz-stats-grid">
            <div><em>练习场次</em><strong>${stats.totalSessions}</strong></div>
            <div><em>累计题量</em><strong>${stats.totalQuestions}</strong></div>
            <div><em>总正确率</em><strong>${stats.accuracy}%</strong></div>
            <div class="quiz-stats-ai" id="quizAiScoreCell">
              <em>AI 评分</em><strong class="quiz-ai-score-pending">…</strong>
              <span class="quiz-ai-score-tip" id="quizAiScoreTip">评分中</span>
            </div>
          </div>
          <p class="quiz-stats-weak"><em>薄弱知识点：</em>${weak}</p>
          <div class="quiz-stats-recent">${recent || '<span class="quiz-muted">暂无近场记录</span>'}</div>
        `;
          loadAiScore(stats);
        }
      }
    } catch (err) {
      if (statsBody) {
        statsBody.innerHTML = `<p class="quiz-muted">统计加载失败：${escapeHtml(err.message || '')}</p>`;
      }
    }
  }

  async function generateQuiz() {
    const config = getConfig();
    const status = select('#quizConfigStatus');
    const btn = select('#btnQuizGenerate');
    if (!config.grades.length) {
      setStatus(status, '请至少选择一个年级', false);
      return;
    }
    if (!config.topics.length) {
      setStatus(status, '请至少选择一个章节/主题', false);
      return;
    }

    setStatus(status, '正在出题，请稍候…', true);
    if (btn) btn.disabled = true;

    try {
      const { paper } = await quizModel.generate();
      const meta = select('#quizPaperMeta');
      if (meta) {
        meta.textContent = `${quizConfig.gradeLabels().join('、')} · ${quizConfig.diffLabel()} · ${paper.length} 题 · ${
          config.reveal === 'immediate' ? '选完即显示对错' : '交卷后显示对错'
        }`;
      }
      renderPaper();
      showView('paper');
      setStatus(status, '', true);
    } catch (err) {
      setStatus(status, err.message || '出题失败', false);
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function renderPaper() {
    const root = select('#quizQuestions');
    if (!root) return;
    const paper = quizModel.getPaper();
    const config = getConfig();

    root.innerHTML = buildPaperHtml({
      paper,
      submitted: quizModel.getSubmitted(),
      reveal: config.reveal,
      escapeHtml,
    });

    root.querySelectorAll('.quiz-opt').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (quizModel.getSubmitted()) return;
        paper[Number(btn.dataset.q)].chosen = Number(btn.dataset.opt);
        renderPaper();
      });
    });

    root.querySelectorAll('[data-hint]').forEach((btn) => {
      btn.addEventListener('click', () => onHint(Number(btn.dataset.hint)));
    });
    root.querySelectorAll('[data-explain]').forEach((btn) => {
      btn.addEventListener('click', () => onExplain(Number(btn.dataset.explain)));
    });
  }

  async function onHint(qi) {
    const q = quizModel.getPaper()[qi];
    if (!q) return;

    const run = async (force = false) => {
      showAppBubble({
        title: 'AI 提示',
        loading: true,
        loadingText: '老师想一想……',
        persistent: true,
      });
      try {
        const text = await quizModel.fetchHint(q, force);
        q.usedHint = true;
        showAppBubble({
          title: 'AI 提示',
          text,
          persistent: true,
          scrollable: true,
          onRegenerate: () => run(true),
        });
      } catch (err) {
        showAppBubble({
          title: 'AI 提示',
          text: err.message || '提示获取失败',
          source: 'local',
          persistent: true,
          onRegenerate: isRateLimitedError(err) ? null : () => run(true),
          showActions: true,
        });
      }
    };
    await run(false);
  }

  async function onExplain(qi) {
    const q = quizModel.getPaper()[qi];
    if (!q) return;

    const run = async (force = false) => {
      showAppBubble({
        title: 'AI 解答',
        loading: true,
        loadingText: '正在讲解……',
        persistent: true,
      });
      try {
        const text = await quizModel.fetchExplain(q, force);
        q.usedExplain = true;
        showAppBubble({
          title: 'AI 解答',
          text,
          persistent: true,
          scrollable: true,
          onRegenerate: () => run(true),
        });
      } catch (err) {
        if (isRateLimitedError(err)) {
          showAppBubble({
            title: 'AI 解答',
            text: err.message || '本小时次数已用完',
            source: 'local',
            persistent: true,
            showActions: true,
            onRegenerate: null,
          });
          return;
        }
        const fallback =
          q.explain || err.message || `正确答案是 ${String.fromCharCode(65 + q.answer)}。`;
        if (q.explain) q.usedExplain = true;
        showAppBubble({
          title: 'AI 解答',
          text: fallback,
          source: 'local',
          persistent: true,
          onRegenerate: () => run(true),
        });
      }
    };
    await run(true);
  }

  async function submitPaper() {
    if (!quizModel.getPaper().length || quizModel.isSubmitting()) return;
    const btnSubmit = select('#btnQuizSubmit');
    if (btnSubmit) btnSubmit.disabled = true;
    hideBrandTip();

    const { correct, answered, total, saveOk, error, skipped } = await quizModel.submitSession();
    if (skipped) {
      if (btnSubmit) btnSubmit.disabled = false;
      return;
    }

    const scoreLine = select('#quizScoreLine');
    if (scoreLine) {
      scoreLine.textContent = `得分 ${correct} / ${total}（已作答 ${answered} 题）· ${quizConfig.diffLabel()}`;
    }

    if (!saveOk && error) {
      await appAlert(
        `练习记录保存失败：${error.message || error}\n仍可查看本场结果，但错题本/历史可能未更新。`,
      );
    }

    renderResultList();
    const report = select('#quizReport');
    const reportBody = select('#quizReportBody');
    if (report) report.hidden = true;
    if (reportBody) reportBody.textContent = '';
    showView('result');
  }

  function renderResultList() {
    const list = select('#quizResultList');
    if (!list) return;

    list.innerHTML = buildResultListHtml({
      paper: quizModel.getPaper(),
      expandedResultIdx: quizModel.getExpandedResultIdx(),
      escapeHtml,
    });

    list.querySelectorAll('[data-result-i]').forEach((el) => {
      const toggle = () => {
        const i = Number(el.dataset.resultI);
        const cur = quizModel.getExpandedResultIdx();
        quizModel.setExpandedResultIdx(cur === i ? null : i);
        renderResultList();
        const expanded = quizModel.getExpandedResultIdx();
        if (expanded !== null) {
          const card = list.querySelector(`[data-result-i="${expanded}"]`);
          card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
      el.addEventListener('click', () => {
        toggle();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  async function runSummary() {
    const report = select('#quizReport');
    const body = select('#quizReportBody');
    const btn = select('#btnQuizSummary');
    if (!report || !body) return;

    report.hidden = false;
    body.className = 'quiz-report-body is-loading';
    body.textContent = '正在生成本场分析报告…';
    if (btn) btn.disabled = true;

    try {
      const { text } = await quizModel.summary();
      body.className = 'quiz-report-body';
      body.textContent = text;
    } catch (err) {
      body.className = 'quiz-report-body';
      body.textContent = err.message || '报告生成失败';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function backToConfig() {
    quizModel.resetSession();
    hideBrandTip();
    const btnSubmit = select('#btnQuizSubmit');
    if (btnSubmit) btnSubmit.disabled = false;
    showView('config');
    const report = select('#quizReport');
    if (report) report.hidden = true;
  }

  async function exportQuizMarkdown() {
    const paper = quizModel.getPaper();
    if (!paper.length) {
      await appAlert('当前没有可导出的题目（请先生成并进入练习或交卷结果）');
      return;
    }
    const lines = quizModel.buildExportMarkdownLines();
    const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `课堂练习-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function bindEvents() {
    select('#btnQuizGenerate')?.addEventListener('click', generateQuiz);
    select('#btnQuizSubmit')?.addEventListener('click', async () => {
      if (!quizModel.getPaper().length) return;
      if (
        !(await appConfirm('确定交卷？交卷后将显示本场结果并写入练习记录。', {
          title: '交卷确认',
          okText: '交卷',
        }))
      ) {
        return;
      }
      submitPaper();
    });
    select('#btnQuizBackConfig')?.addEventListener('click', async () => {
      if (quizModel.getPaper().length && !quizModel.getSubmitted()) {
        if (
          !(await appConfirm('当前练习尚未交卷，确定放弃并重新出题？', {
            title: '放弃练习',
            okText: '放弃',
            danger: true,
          }))
        ) {
          return;
        }
      }
      backToConfig();
    });
    select('#btnQuizAgain')?.addEventListener('click', backToConfig);
    select('#btnQuizSummary')?.addEventListener('click', runSummary);
    select('#btnQuizStatsRefresh')?.addEventListener('click', refreshStats);
    document.querySelectorAll('.btn-quiz-export').forEach((btn) => {
      btn.addEventListener('click', exportQuizMarkdown);
    });
  }

  return {
    showView,
    refreshStats,
    exportQuizMarkdown,
    bindEvents,
  };
}
