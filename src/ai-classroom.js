/**
 * 课堂：侧栏二级导航 + 分区宿主（出题 / 错题 / 点名 / 实验…）
 */

import { aiApi, quizApi, offlineQuizApi, masteryApi, lessonPackApi, labsApi, balanceScriptsApi } from './api/client.js';
import { showAppBubble, hideBrandTip } from './brand-tip.js';
import { initRollcall, onRollcallSectionEnter } from './classroom-rollcall.js';
import { createQuizConfigController } from './ai-classroom/quiz-config.js';
import { createQuizModel, isRateLimitedError } from './ai-classroom/quiz-model.js';
import { createQuizShellController } from './ai-classroom/quiz-shell.js';
import { createWrongBookController } from './ai-classroom/wrong-book.js';
import { createOfflineQuizController } from './ai-classroom/offline-quiz.js';
import { createMasteryMapController } from './ai-classroom/mastery-map.js';
import { createLabShellController } from './ai-classroom/lab-shell.js';
import { createLessonPacksController } from './ai-classroom/lesson-packs.js';
import { createBalanceShellController } from './ai-classroom/balance-shell.js';
import { escapeHtml } from './ai-classroom/quiz-views.js';
import { appAlert, appConfirm } from './app-dialog.js';

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

/** @type {ReturnType<typeof createQuizShellController>} */
let quizShell;

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
  onRefreshStats: () => quizShell.refreshStats(),
});

let offlineInited = false;
const offlineQuiz = createOfflineQuizController({
  select: $,
  escapeHtml,
  offlineQuizApi,
  onRefreshStats: () => quizShell.refreshStats(),
});

quizShell = createQuizShellController({
  select: $,
  escapeHtml,
  quizModel,
  quizConfig,
  getConfig: () => config,
  aiApi,
  quizApi,
  showAppBubble,
  hideBrandTip,
  appAlert,
  appConfirm,
  isRateLimitedError,
  onBadgeChange: (count) => {
    wrongBookBadgeCount = count;
    renderNav();
  },
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
    quizShell.refreshStats();
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
  return quizShell.exportQuizMarkdown();
}

export function initAiClassroom() {
  renderNav();
  selectSection('quiz');
  quizConfig.renderGradeChips();
  quizConfig.renderTopicChips();
  quizConfig.renderDifficultyChips();
  quizConfig.renderRevealChips();
  quizConfig.bindCount();
  quizShell.showView('config');
  initRollcall();

  const defaults = quizConfig.defaultTopics();
  if (!config.topics.length) {
    config.topics = defaults;
    quizConfig.renderTopicChips();
  }

  quizShell.bindEvents();
  $('#btnWrongRefresh')?.addEventListener('click', async () => {
    wrongBook.reset();
    wrongBook.load();
  });
}
