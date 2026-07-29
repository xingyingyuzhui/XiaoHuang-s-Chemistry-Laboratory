/**
 * 课堂：侧栏二级导航 + 出题 / 错题 / 点名 / 实验
 */

import { aiApi, quizApi, offlineQuizApi, masteryApi, lessonPackApi, labsApi, balanceScriptsApi } from './api/client.js';
import { showAppBubble, hideBrandTip } from './brand-tip.js';
import { initRollcall, onRollcallSectionEnter } from './classroom-rollcall.js';
import { createQuizConfigController } from './ai-classroom/quiz-config.js';
import { createQuizModel, isRateLimitedError } from './ai-classroom/quiz-model.js';
import { createWrongBookController } from './ai-classroom/wrong-book.js';
import { createOfflineQuizController } from './ai-classroom/offline-quiz.js';
import { createMasteryMapController } from './ai-classroom/mastery-map.js';
import { createLabShellController } from './ai-classroom/lab-shell.js';
import { createLessonPacksController } from './ai-classroom/lesson-packs.js';
import { createBalanceShellController } from './ai-classroom/balance-shell.js';
import { appAlert, appConfirm } from './app-dialog.js';
import {
  escapeHtml,
  buildPaperHtml,
  buildResultListHtml,
} from './ai-classroom/quiz-views.js';

const $ = (sel) => document.querySelector(sel);

const AI_SECTIONS = [
  {
    id: 'quiz',
    title: '智能出题',
    desc: '单选练习 · 提示与解析 · 交卷报告',
  },
  {
    id: 'offline',
    title: '离线题库',
    desc: '历年高考题源 · 不需 AI Key',
  },
  {
    id: 'wrong',
    title: '错题本',
    desc: '重练做对后自动移出',
  },
  {
    id: 'lab',
    title: '实验探究',
    desc: '实验脚本 · 交互式预习',
  },
  {
    id: 'balance',
    title: '分步配平',
    desc: '脚本演示 · 逐步学配平',
  },
  {
    id: 'mastery',
    title: '知识地图',
    desc: '知识点掌握度 · 薄弱分析',
  },
  {
    id: 'rollcall',
    title: '随机点名',
    desc: '名单与点名',
  },
  {
    id: 'lessonpack',
    title: '备课包',
    desc: '教学材料打包 · 导入导出',
  },
];

let config = {
  grades: [1],
  difficulty: 'medium',
  topics: [],
  count: 5,
  reveal: 'immediate',
};

let currentSection = 'quiz';
let wrongBookBadgeCount = 0;

const quizConfig = createQuizConfigController({
  select: $,
  escapeHtml,
  getConfig: () => config,
  setConfig: (next) => {
    config = next;
  },
});
const quizModel = createQuizModel({
  aiApi,
  quizApi,
  getConfig: () => config,
  getGradeLabels: () => quizConfig.gradeLabels(),
  getTopicLabels: () => quizConfig.topicLabels(),
  getDiffLabel: () => quizConfig.diffLabel(),
});
const labShell = createLabShellController({ select: $, escapeHtml, labsApi, aiApi });
const wrongBook = createWrongBookController({
  select: $,
  escapeHtml,
  quizApi,
  aiApi,
  showAppBubble,
  isRateLimitedError,
  onBadgeChange: (count) => {
    wrongBookBadgeCount = count;
    renderNav();
  },
  onOpenQuiz: () => selectSection('quiz'),
  onRefreshStats: refreshStatsAndWrongBook,
});

let offlineInited = false;
const offlineQuiz = createOfflineQuizController({
  select: $,
  escapeHtml,
  offlineQuizApi,
  onRefreshStats: refreshStatsAndWrongBook,
});

let masteryInited = false;
const masteryMap = createMasteryMapController({
  select: $,
  escapeHtml,
  masteryApi,
});

let lessonPackInited = false;
const lessonPacks = createLessonPacksController({
  select: $,
  escapeHtml,
  lessonPackApi,
  labsApi,
});

let balanceInited = false;
const balanceShell = createBalanceShellController({
  select: $,
  escapeHtml,
  balanceScriptsApi,
  aiApi,
});

function setStatus(el, text, ok) {
  if (!el) return;
  el.textContent = text || '';
  el.className = 'quiz-status' + (text ? (ok ? ' is-ok' : ' is-err') : '');
}

function renderNav() {
  const list = $('#aiNavList');
  if (!list) return;
  list.innerHTML = AI_SECTIONS.map((s) => {
    const badge =
      s.id === 'wrong' && wrongBookBadgeCount > 0
        ? `<em class="ai-nav-badge">${wrongBookBadgeCount}</em>`
        : '';
    return `
    <button type="button" class="ai-nav-card${currentSection === s.id ? ' is-active' : ''}" data-ai-section="${s.id}" role="listitem">
      <span class="ai-nav-card-title">
        <strong>${escapeHtml(s.title)}</strong>
        ${badge}
      </span>
      <span>${escapeHtml(s.desc)}</span>
    </button>`;
  }).join('');

  list.querySelectorAll('[data-ai-section]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectSection(btn.dataset.aiSection);
    });
  });
}

/**
 * 离开实验探究 / 分步配平时：有未保存脚本则确认，否则可直接切走
 * @returns {Promise<boolean>}
 */
async function confirmLeaveSectionIfNeeded(fromId) {
  if (fromId === 'balance' && balanceInited && typeof balanceShell.isDirty === 'function' && balanceShell.isDirty()) {
    if (!(await balanceShell.confirmLeaveDirty())) return false;
    balanceShell.discardUnsaved?.();
  }
  if (fromId === 'lab' && typeof labShell.isDirty === 'function' && labShell.isDirty()) {
    if (!(await labShell.confirmLeaveDirty())) return false;
    labShell.discardUnsaved?.();
  }
  if (fromId === 'balance') balanceShell.onDeactivate?.();
  if (fromId === 'lab') labShell.onDeactivate?.();
  return true;
}

async function selectSection(id) {
  if (!id || id === currentSection) {
    // 重复点当前分区：仍刷新入口（如实验/配平）
    if (id === 'lab') labShell.render();
    if (id === 'balance') {
      if (!balanceInited) {
        balanceInited = true;
        await balanceShell.init();
      } else {
        balanceShell.render();
      }
    }
    return;
  }

  const ok = await confirmLeaveSectionIfNeeded(currentSection);
  if (!ok) return;

  currentSection = id;
  renderNav();
  const quiz = $('#aiSectionQuiz');
  const offline = $('#aiSectionOffline');
  const wrong = $('#aiSectionWrong');
  const mastery = $('#aiSectionMastery');
  const roll = $('#aiSectionRollcall');
  const lab = $('#aiSectionLab');
  const lessonpack = $('#aiSectionLessonPack');
  const balance = $('#aiSectionBalance');
  if (quiz) quiz.hidden = id !== 'quiz';
  if (offline) offline.hidden = id !== 'offline';
  if (wrong) wrong.hidden = id !== 'wrong';
  if (mastery) mastery.hidden = id !== 'mastery';
  if (roll) roll.hidden = id !== 'rollcall';
  if (lab) lab.hidden = id !== 'lab';
  if (lessonpack) lessonpack.hidden = id !== 'lessonpack';
  if (balance) balance.hidden = id !== 'balance';
  if (id === 'offline') {
    if (!offlineInited) {
      offlineInited = true;
      offlineQuiz.init();
    }
  }
  if (id === 'wrong') {
    wrongBook.reset();
    wrongBook.load();
  }
  if (id === 'quiz') {
    refreshStatsAndWrongBook();
  }
  if (id === 'mastery') {
    if (!masteryInited) {
      masteryInited = true;
      masteryMap.init();
    } else {
      masteryMap.load();
    }
  }
  if (id === 'rollcall') {
    onRollcallSectionEnter();
  }
  if (id === 'lab') {
    labShell.render();
  }
  if (id === 'lessonpack') {
    if (!lessonPackInited) {
      lessonPackInited = true;
      lessonPacks.init();
    }
  }
  if (id === 'balance') {
    if (!balanceInited) {
      balanceInited = true;
      await balanceShell.init();
    } else {
      balanceShell.render();
    }
  }
}

/** 导出本场测验为 Markdown 文本并下载 */
export async function exportQuizMarkdown() {
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

function showView(name) {
  const cfg = $('#quizConfig');
  const paperEl = $('#quizPaper');
  const result = $('#quizResult');
  if (cfg) cfg.hidden = name !== 'config';
  if (paperEl) paperEl.hidden = name !== 'paper';
  if (result) result.hidden = name !== 'result';
  if (name === 'config') {
    refreshStatsAndWrongBook();
  }
}

async function loadAiScore(_stats) {
  const cell = $('#quizAiScoreCell');
  const tip = $('#quizAiScoreTip');
  if (!cell) return;
  try {
    // 后端按库内数据指纹缓存：数据未变不调模型
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

async function refreshStatsAndWrongBook() {
  const statsBody = $('#quizStatsBody');

  try {
    const stats = await quizApi.stats();
    wrongBookBadgeCount = Number(stats.wrongBookCount || 0);
    // 任意入口刷新后都更新错题本角标（离线题库交卷也会回调这里）
    renderNav();

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
  const status = $('#quizConfigStatus');
  const btn = $('#btnQuizGenerate');
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
    const meta = $('#quizPaperMeta');
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
  const root = $('#quizQuestions');
  if (!root) return;
  const paper = quizModel.getPaper();

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
      // 限流：只提示重置时间，不偷偷用本地解析绕过
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
      // 仅展示了出题自带解析也算「看过解答」
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
  const btnSubmit = $('#btnQuizSubmit');
  if (btnSubmit) btnSubmit.disabled = true;
  hideBrandTip();

  const { correct, answered, total, saveOk, error, skipped } = await quizModel.submitSession();
  if (skipped) {
    if (btnSubmit) btnSubmit.disabled = false;
    return;
  }

  const scoreLine = $('#quizScoreLine');
  if (scoreLine) {
    scoreLine.textContent = `得分 ${correct} / ${total}（已作答 ${answered} 题）· ${quizConfig.diffLabel()}`;
  }

  if (!saveOk && error) {
    await appAlert(
      `练习记录保存失败：${error.message || error}\n仍可查看本场结果，但错题本/历史可能未更新。`,
    );
  }

  renderResultList();
  const report = $('#quizReport');
  const reportBody = $('#quizReportBody');
  if (report) report.hidden = true;
  if (reportBody) reportBody.textContent = '';
  showView('result');
  if (!saveOk && btnSubmit) {
    /* 已交卷展示，按钮保持禁用 */
  }
}

function renderResultList() {
  const list = $('#quizResultList');
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
    el.addEventListener('click', async (e) => {
      // 避免选中文字误触多次 — 整卡可点
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
  const report = $('#quizReport');
  const body = $('#quizReportBody');
  const btn = $('#btnQuizSummary');
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
  const btnSubmit = $('#btnQuizSubmit');
  if (btnSubmit) btnSubmit.disabled = false;
  showView('config');
  const report = $('#quizReport');
  if (report) report.hidden = true;
}

export function initAiClassroom() {
  renderNav();
  selectSection('quiz');
  quizConfig.renderGradeChips();
  quizConfig.renderTopicChips();
  quizConfig.renderDifficultyChips();
  quizConfig.renderRevealChips();
  quizConfig.bindCount();
  showView('config');
  initRollcall();

  const defaults = quizConfig.defaultTopics();
  if (!config.topics.length) {
    config.topics = defaults;
    quizConfig.renderTopicChips();
  }

  $('#btnQuizGenerate')?.addEventListener('click', generateQuiz);
  $('#btnQuizSubmit')?.addEventListener('click', async () => {
    if (!quizModel.getPaper().length) return;
    if (!(await appConfirm('确定交卷？交卷后将显示本场结果并写入练习记录。', { title: '交卷确认', okText: '交卷' }))) return;
    submitPaper();
  });
  $('#btnQuizBackConfig')?.addEventListener('click', async () => {
    if (quizModel.getPaper().length && !quizModel.getSubmitted()) {
      if (!(await appConfirm('当前练习尚未交卷，确定放弃并重新出题？', { title: '放弃练习', okText: '放弃', danger: true }))) return;
    }
    backToConfig();
  });
  $('#btnQuizAgain')?.addEventListener('click', backToConfig);
  $('#btnQuizSummary')?.addEventListener('click', runSummary);
  $('#btnQuizStatsRefresh')?.addEventListener('click', refreshStatsAndWrongBook);
  $('#btnWrongRefresh')?.addEventListener('click', async () => {
    wrongBook.reset();
    wrongBook.load();
  });
  document.querySelectorAll('.btn-quiz-export').forEach((btn) => {
    btn.addEventListener('click', exportQuizMarkdown);
  });

}
