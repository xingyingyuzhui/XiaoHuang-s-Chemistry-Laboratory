/**
 * 课堂：侧栏二级导航 + 出题 / 错题 / 点名 / 实验
 */

import { aiApi, quizApi } from './api/client.js';
import { showAppBubble, hideBrandTip } from './brand-tip.js';
import {
  GRADES,
  CHEM_TOPICS,
  DIFFICULTIES,
  REVEAL_MODES,
  topicsForGrades,
} from './data/chem-topics.js';
import { initRollcall, onRollcallSectionEnter } from './classroom-rollcall.js';
import { LAB_SCRIPTS } from './data/lab-scripts.js';

const $ = (sel) => document.querySelector(sel);

const AI_SECTIONS = [
  {
    id: 'quiz',
    title: '智能出题',
    desc: '单选练习 · 提示与解析 · 交卷报告',
  },
  {
    id: 'wrong',
    title: '错题本',
    desc: '重练做对后自动移出',
  },
  {
    id: 'rollcall',
    title: '随机点名',
    desc: '名单与点名',
  },
  {
    id: 'lab',
    title: '实验探究',
    desc: '实验脚本',
  },
];

let config = {
  grades: [1],
  difficulty: 'medium',
  topics: [],
  count: 5,
  reveal: 'immediate',
};

/** @type {Array<any>} */
let paper = [];
let submitted = false;
/** 交卷请求进行中，防连点 */
let submitting = false;
let currentSection = 'quiz';
let lastSessionId = null;
/** 出题快照 id：交卷时交给服务端按标准答案判分 */
let currentPaperId = null;
let expandedResultIdx = null;

/** @type {Array<any>} */
let wrongListCache = [];
/** 当前展开的错题 id */
let expandedWrongId = null;
/** @type {Record<string, { chosen: number|null, locked: boolean }>} */
let wrongUiState = {};
let wrongBookBadgeCount = 0;

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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
    btn.addEventListener('click', () => selectSection(btn.dataset.aiSection));
  });
}

function selectSection(id) {
  currentSection = id;
  renderNav();
  const quiz = $('#aiSectionQuiz');
  const wrong = $('#aiSectionWrong');
  const roll = $('#aiSectionRollcall');
  const lab = $('#aiSectionLab');
  if (quiz) quiz.hidden = id !== 'quiz';
  if (wrong) wrong.hidden = id !== 'wrong';
  if (roll) roll.hidden = id !== 'rollcall';
  if (lab) lab.hidden = id !== 'lab';
  if (id === 'wrong') {
    expandedWrongId = null;
    wrongUiState = {};
    loadWrongBookPage();
  }
  if (id === 'quiz') {
    refreshStatsAndWrongBook();
  }
  if (id === 'rollcall') {
    onRollcallSectionEnter();
  }
  if (id === 'lab') {
    renderLabScripts();
  }
}

let currentLabId = LAB_SCRIPTS[0]?.id || null;

function renderLabScripts() {
  const nav = $('#labNavList');
  const detail = $('#labScriptDetail');
  if (!nav || !detail) return;

  if (!currentLabId && LAB_SCRIPTS[0]) currentLabId = LAB_SCRIPTS[0].id;

  nav.innerHTML = LAB_SCRIPTS.map((lab) => {
    const active = lab.id === currentLabId ? ' is-active' : '';
    return `
    <button type="button" class="lab-nav-item${active}" data-lab="${escapeHtml(lab.id)}" role="listitem">
      <span class="lab-nav-type">${escapeHtml(lab.type)}</span>
      <strong class="lab-nav-title">${escapeHtml(lab.title)}</strong>
    </button>`;
  }).join('');

  nav.querySelectorAll('[data-lab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentLabId = btn.dataset.lab;
      renderLabScripts();
    });
  });

  showLabDetail(currentLabId);
}

function showLabDetail(id) {
  const lab = LAB_SCRIPTS.find((x) => x.id === id);
  const detail = $('#labScriptDetail');
  if (!detail) return;
  if (!lab) {
    detail.innerHTML = `<div class="molar-empty">请选择左侧实验</div>`;
    return;
  }

  const steps = Array.isArray(lab.steps) ? lab.steps : [];
  detail.innerHTML = `
    <div class="lab-detail-head">
      <span class="lab-type">${escapeHtml(lab.type)}</span>
      <h3 class="lab-detail-title">${escapeHtml(lab.title)}</h3>
      <p class="lab-eq">${escapeHtml(lab.equation || '')}</p>
    </div>
    <div class="lab-meta">
      <div class="lab-meta-item">
        <span>现象</span>
        <strong>${escapeHtml(lab.phenomena || '—')}</strong>
      </div>
      <div class="lab-meta-item">
        <span>安全</span>
        <strong>${escapeHtml(lab.safety || '—')}</strong>
      </div>
    </div>
    <h4 class="lab-steps-heading">实验步骤</h4>
    <div class="lab-step-list">
      ${
        steps.length
          ? steps
              .map((s, i) => {
                const label = typeof s === 'string' ? s : s?.label || `步骤 ${i + 1}`;
                const tip = typeof s === 'string' ? '' : s?.tip || '';
                return `
          <div class="lab-step">
            <span class="lab-step-n">${i + 1}</span>
            <div class="lab-step-body">
              <strong class="lab-step-label">${escapeHtml(label)}</strong>
              ${tip ? `<p class="lab-step-tip">${escapeHtml(tip)}</p>` : ''}
            </div>
          </div>`;
              })
              .join('')
          : `<p class="rxn-muted">暂无步骤说明</p>`
      }
    </div>
  `;
}

/** 导出本场测验为 Markdown 文本并下载 */
export function exportQuizMarkdown() {
  if (!paper.length) {
    alert('当前没有可导出的题目（请先生成并进入练习或交卷结果）');
    return;
  }
  const lines = [
    '# 课堂练习导出',
    '',
    `导出时间：${new Date().toLocaleString()}`,
    `题量：${paper.length}`,
    '',
  ];
  paper.forEach((q, i) => {
    lines.push(`## ${i + 1}. ${q.stem || q.question || ''}`);
    (q.options || []).forEach((opt, j) => {
      const mark = String.fromCharCode(65 + j);
      lines.push(`- ${mark}. ${opt}`);
    });
    if (submitted || q.answer != null) {
      const ans = typeof q.answer === 'number' ? String.fromCharCode(65 + q.answer) : q.answer;
      lines.push(`- **答案**：${ans ?? ''}`);
    }
    if (q.explain) lines.push(`- **解析**：${q.explain}`);
    lines.push('');
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `课堂练习-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function renderGradeChips() {
  const box = $('#quizGrades');
  if (!box) return;
  box.innerHTML = GRADES.map(
    (g) =>
      `<button type="button" class="quiz-chip${config.grades.includes(g.id) ? ' is-on' : ''}" data-grade="${g.id}">${g.label}</button>`,
  ).join('');
  box.querySelectorAll('[data-grade]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.grade);
      if (config.grades.includes(id)) {
        if (config.grades.length === 1) return;
        config.grades = config.grades.filter((x) => x !== id);
      } else {
        config.grades = [...config.grades, id].sort();
      }
      const allowed = new Set(topicsForGrades(config.grades).map((t) => t.id));
      config.topics = config.topics.filter((tid) => allowed.has(tid));
      renderGradeChips();
      renderTopicChips();
    });
  });
}

function renderTopicChips() {
  const box = $('#quizTopics');
  if (!box) return;
  const topics = topicsForGrades(config.grades);
  if (!topics.length) {
    box.innerHTML = '<span class="quiz-status">请先选择年级</span>';
    return;
  }
  box.innerHTML = topics
    .map(
      (t) =>
        `<button type="button" class="quiz-topic${config.topics.includes(t.id) ? ' is-on' : ''}" data-topic="${t.id}">${escapeHtml(t.label)}</button>`,
    )
    .join('');
  box.querySelectorAll('[data-topic]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.topic;
      if (config.topics.includes(id)) {
        config.topics = config.topics.filter((x) => x !== id);
      } else {
        config.topics = [...config.topics, id];
      }
      renderTopicChips();
    });
  });
}

function renderDifficultyChips() {
  const box = $('#quizDifficulty');
  if (!box) return;
  box.innerHTML = DIFFICULTIES.map(
    (d) =>
      `<button type="button" class="quiz-chip${config.difficulty === d.id ? ' is-on' : ''}" data-diff="${d.id}" title="${escapeHtml(d.desc)}">${d.label}</button>`,
  ).join('');
  box.querySelectorAll('[data-diff]').forEach((btn) => {
    btn.addEventListener('click', () => {
      config.difficulty = btn.dataset.diff;
      renderDifficultyChips();
    });
  });
}

function renderRevealChips() {
  const box = $('#quizReveal');
  if (!box) return;
  box.innerHTML = REVEAL_MODES.map(
    (m) =>
      `<button type="button" class="quiz-chip${config.reveal === m.id ? ' is-on' : ''}" data-reveal="${m.id}">${m.label}</button>`,
  ).join('');
  box.querySelectorAll('[data-reveal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      config.reveal = btn.dataset.reveal;
      renderRevealChips();
    });
  });
}

function bindCount() {
  const range = $('#quizCount');
  const label = $('#quizCountLabel');
  if (!range || !label) return;
  range.value = String(config.count);
  label.textContent = String(config.count);
  range.addEventListener('input', () => {
    config.count = Math.min(10, Math.max(1, Number(range.value) || 5));
    label.textContent = String(config.count);
  });
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

function gradeLabels() {
  return GRADES.filter((g) => config.grades.includes(g.id)).map((g) => g.label);
}

function topicLabels() {
  return config.topics.map((id) => CHEM_TOPICS.find((t) => t.id === id)?.label || id);
}

function diffLabel() {
  return DIFFICULTIES.find((d) => d.id === config.difficulty)?.label || config.difficulty;
}

async function refreshStatsAndWrongBook() {
  const statsBody = $('#quizStatsBody');

  try {
    const stats = await quizApi.stats();
    wrongBookBadgeCount = Number(stats.wrongBookCount || 0);
    // 角标只在左侧「错题本」导航上展示
    if (currentSection === 'quiz') renderNav();

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

function formatWrongTime(ts) {
  if (!ts) return '';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '';
  }
}

function getWrongState(id) {
  if (!wrongUiState[id]) {
    wrongUiState[id] = { chosen: null, locked: false };
  }
  return wrongUiState[id];
}

/** Fisher–Yates 打乱，防止按固定顺序背题 */
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function loadWrongBookPage() {
  const root = $('#wrongBookList');
  const meta = $('#wbListMeta');
  if (root) {
    root.innerHTML = `<p class="quiz-muted" style="padding:1rem 0">加载中…</p>`;
  }
  try {
    const data = await quizApi.wrongBook();
    wrongListCache = data?.list || [];
    // 每次进入/刷新打乱顺序
    shuffleInPlace(wrongListCache);
    wrongBookBadgeCount = wrongListCache.length;
    // 进入/刷新：清空作答状态，不保留「再试」
    wrongUiState = {};
    expandedWrongId = null;
    // 默认展开打乱后的第一题
    if (wrongListCache[0]) {
      expandedWrongId = wrongListCache[0].id;
    }
    if (meta) {
      meta.textContent = `做对后自动移出 · 共 ${wrongListCache.length} 题 · 顺序已打乱`;
    }
    renderNav();
    renderWrongBookList();
  } catch (err) {
    if (root) {
      root.innerHTML = `<p class="quiz-muted">加载失败：${escapeHtml(err.message || '')}</p>`;
    }
  }
}

function renderWrongBookList() {
  const root = $('#wrongBookList');
  if (!root) return;
  const letters = ['A', 'B', 'C', 'D'];

  if (!wrongListCache.length) {
    root.innerHTML = `
      <div class="quiz-result-item" style="cursor:default;padding:1.25rem 1rem;text-align:center">
        <p class="quiz-muted" style="margin:0 0 0.75rem">暂无错题。答错或查看 AI 解答后会出现在这里；做对后自动移出。</p>
        <button type="button" class="btn primary btn-sm" id="btnWrongGoQuiz">去智能出题</button>
      </div>`;
    $('#btnWrongGoQuiz')?.addEventListener('click', () => selectSection('quiz'));
    return;
  }

  root.innerHTML = wrongListCache
    .map((item, i) => {
      const open = expandedWrongId === item.id;
      const st = getWrongState(item.id);
      const last =
        item.lastChosen !== null && item.lastChosen !== undefined
          ? letters[item.lastChosen]
          : '—';
      const brief = item.stem.length > 56 ? `${item.stem.slice(0, 56)}…` : item.stem;

      const opts = (item.options || [])
        .map((opt, oi) => {
          let cls = 'quiz-opt';
          if (st.chosen === oi) cls += ' is-selected';
          if (st.locked) {
            if (oi === item.answer) cls += ' is-correct';
            else if (st.chosen === oi) cls += ' is-wrong';
          }
          return `<button type="button" class="${cls}" data-wb-id="${escapeHtml(item.id)}" data-wb-opt="${oi}" ${
            st.locked ? 'disabled' : ''
          }><strong>${letters[oi]}.</strong> ${escapeHtml(opt)}</button>`;
        })
        .join('');

      let feedback = '';
      if (st.locked) {
        const ok = st.chosen === item.answer;
        feedback = ok
          ? `<p class="quiz-feedback is-ok">回答正确，已自动移出错题本</p>`
          : `<p class="quiz-feedback is-err">还不对，正确答案是 ${letters[item.answer]}；本题仍保留</p>`;
      }

      return `
      <div class="quiz-result-item${open ? ' is-expanded' : ''}" data-wb-card="${escapeHtml(item.id)}">
        <div class="quiz-result-item-summary" data-wb-toggle="${escapeHtml(item.id)}" role="button" tabindex="0">
          <span class="mark bad">错题</span>
          <div class="quiz-result-item-text">
            <strong>第 ${i + 1} 题</strong>
            ${item.knowledge ? ` · ${escapeHtml(item.knowledge)}` : ''}
            <span class="quiz-result-brief">${escapeHtml(brief)}</span>
            <span class="quiz-result-brief">上次选择：${last}</span>
          </div>
          <span class="quiz-result-chevron" aria-hidden="true">${open ? '▴' : '▾'}</span>
        </div>
        <div class="quiz-result-detail" ${open ? '' : 'hidden'}>
          <p class="quiz-stem">${escapeHtml(item.stem)}</p>
          <div class="quiz-options">${opts}</div>
          ${feedback}
          <div class="quiz-card-tools" style="margin-top:0.65rem">
            <button type="button" class="btn ghost btn-sm" data-wb-hint="${escapeHtml(item.id)}" ${st.locked ? 'disabled' : ''}>AI 提示</button>
            <button type="button" class="btn ghost btn-sm" data-wb-explain="${escapeHtml(item.id)}">AI 解答</button>
            <button type="button" class="btn primary btn-sm" data-wb-submit="${escapeHtml(item.id)}" ${
              st.chosen === null || st.locked ? 'disabled' : ''
            }>提交答案</button>
          </div>
        </div>
      </div>`;
    })
    .join('');

  // 展开 / 收起
  root.querySelectorAll('[data-wb-toggle]').forEach((el) => {
    const toggle = () => {
      const id = el.dataset.wbToggle;
      expandedWrongId = expandedWrongId === id ? null : id;
      if (expandedWrongId) {
        const st = getWrongState(expandedWrongId);
        // 展开新题时若未锁定则重置选择，便于直接作答
        if (!st.locked) st.chosen = null;
      }
      renderWrongBookList();
      if (expandedWrongId) {
        root
          .querySelector(`[data-wb-card="${CSS.escape(expandedWrongId)}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  // 选选项
  root.querySelectorAll('[data-wb-opt]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.wbId;
      const st = getWrongState(id);
      if (st.locked) return;
      st.chosen = Number(btn.dataset.wbOpt);
      renderWrongBookList();
    });
  });

  root.querySelectorAll('[data-wb-hint]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrongItemHint(btn.dataset.wbHint);
    });
  });
  root.querySelectorAll('[data-wb-explain]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrongItemExplain(btn.dataset.wbExplain);
    });
  });
  root.querySelectorAll('[data-wb-submit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      wrongItemSubmit(btn.dataset.wbSubmit);
    });
  });
}

async function wrongItemHint(id) {
  const item = wrongListCache.find((x) => x.id === id);
  if (!item) return;
  const run = async (force = false) => {
    showAppBubble({
      title: 'AI 提示',
      loading: true,
      persistent: true,
      loadingText: '老师想一想……',
    });
    try {
      // 非强制且已有题库自带提示：不占次数
      let text = !force && item.hint ? item.hint : '';
      if (!text || force) {
        const data = await aiApi.quizHint({
          stem: item.stem,
          options: item.options,
          knowledge: item.knowledge,
        });
        text = data?.text || '先排除明显错误的选项，再联系核心概念。';
        item.hint = text;
      }
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
        text: err.message || '提示失败',
        source: 'local',
        persistent: true,
        showActions: true,
        onRegenerate: isRateLimitedError(err) ? null : () => run(true),
      });
    }
  };
  await run(false);
}

async function wrongItemExplain(id) {
  const item = wrongListCache.find((x) => x.id === id);
  if (!item) return;
  const run = async () => {
    showAppBubble({
      title: 'AI 解答',
      loading: true,
      persistent: true,
      loadingText: '正在讲解……',
    });
    try {
      const data = await aiApi.quizExplain({
        stem: item.stem,
        options: item.options,
        answer: item.answer,
        knowledge: item.knowledge,
        explain: item.explain,
      });
      const text =
        data?.text ||
        item.explain ||
        `正确答案是 ${String.fromCharCode(65 + item.answer)}。`;
      item.explain = text;
      showAppBubble({
        title: 'AI 解答',
        text,
        persistent: true,
        scrollable: true,
        onRegenerate: () => run(),
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
      showAppBubble({
        title: 'AI 解答',
        text: item.explain || err.message || '解答失败',
        source: 'local',
        persistent: true,
        onRegenerate: () => run(),
      });
    }
  };
  await run();
}

async function wrongItemSubmit(id) {
  const item = wrongListCache.find((x) => x.id === id);
  const st = getWrongState(id);
  if (!item || st.chosen === null || st.locked) return;
  try {
    const data = await quizApi.attemptWrong(item.id, st.chosen);
    st.locked = true;
    if (typeof data.answer === 'number') item.answer = data.answer;
    if (data.cleared) {
      wrongBookBadgeCount = Math.max(0, wrongBookBadgeCount - 1);
      renderNav();
      // 做对后短暂展示反馈，再刷新列表移出
      renderWrongBookList();
      window.setTimeout(async () => {
        expandedWrongId = null;
        delete wrongUiState[id];
        await loadWrongBookPage();
        await refreshStatsAndWrongBook();
      }, 900);
      return;
    }
    renderWrongBookList();
  } catch (err) {
    window.alert(err.message || '提交失败');
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
    const data = await aiApi.quizGenerate({
      grades: gradeLabels(),
      difficulty: config.difficulty,
      topics: topicLabels(),
      count: config.count,
    });

    const list = data?.questions || [];
    if (!list.length) throw new Error('未生成题目');

    paper = list
      .map((q, i) => {
        const ans = Number(q.answer);
        if (!Number.isInteger(ans) || ans < 0 || ans > 3) return null;
        const options = (q.options || []).slice(0, 4);
        if (options.length < 4) return null;
        return {
          id: q.id || `q${i + 1}`,
          stem: q.stem,
          options,
          answer: ans,
          knowledge: q.knowledge || '',
          hint: q.hint || '',
          explain: q.explain || '',
          chosen: null,
          usedHint: false,
          usedExplain: false,
        };
      })
      .filter(Boolean);
    if (!paper.length) throw new Error('生成的题目无效，请重试');
    currentPaperId = data?.paperId || null;
    submitted = false;
    submitting = false;
    lastSessionId = null;
    expandedResultIdx = null;

    const meta = $('#quizPaperMeta');
    if (meta) {
      meta.textContent = `${gradeLabels().join('、')} · ${diffLabel()} · ${paper.length} 题 · ${
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

  root.innerHTML = paper
    .map((q, qi) => {
      const letters = ['A', 'B', 'C', 'D'];
      const opts = q.options
        .map((opt, oi) => {
          let cls = 'quiz-opt';
          if (q.chosen === oi) cls += ' is-selected';
          if (submitted || (config.reveal === 'immediate' && q.chosen !== null)) {
            if (oi === q.answer) cls += ' is-correct';
            else if (q.chosen === oi && q.chosen !== q.answer) cls += ' is-wrong';
          }
          return `<button type="button" class="${cls}" data-q="${qi}" data-opt="${oi}" ${
            submitted ? 'disabled' : ''
          }><strong>${letters[oi]}.</strong> ${escapeHtml(opt)}</button>`;
        })
        .join('');

      let feedback = '';
      if (config.reveal === 'immediate' && q.chosen !== null && !submitted) {
        const ok = q.chosen === q.answer;
        feedback = `<p class="quiz-feedback ${ok ? 'is-ok' : 'is-err'}">${
          ok ? '回答正确' : `回答错误，正确答案是 ${letters[q.answer]}`
        }</p>`;
      }

      return `
      <article class="quiz-card" data-qi="${qi}">
        <div class="quiz-card-top">
          <span class="quiz-card-idx">第 ${qi + 1} 题</span>
          <span class="quiz-card-tag">${escapeHtml(q.knowledge || '')}</span>
        </div>
        <p class="quiz-stem">${escapeHtml(q.stem)}</p>
        <div class="quiz-options">${opts}</div>
        <div class="quiz-card-tools">
          <button type="button" class="btn ghost" data-hint="${qi}">AI 提示</button>
          <button type="button" class="btn ghost" data-explain="${qi}">AI 解答</button>
        </div>
        ${feedback}
      </article>`;
    })
    .join('');

  root.querySelectorAll('.quiz-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (submitted) return;
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

async function fetchHintText(q, forceRemote = false) {
  if (!forceRemote && (q.hint || '').trim()) return q.hint.trim();
  const data = await aiApi.quizHint({
    stem: q.stem,
    options: q.options,
    knowledge: q.knowledge,
  });
  const text = (data?.text || '').trim();
  if (text) q.hint = text;
  return text || '先找出题干关键词，再联系对应概念，排除明显不合理的选项。';
}

async function fetchExplainText(q, forceRemote = false) {
  if (!forceRemote && false) {
    /* always can use remote for regenerate */
  }
  const data = await aiApi.quizExplain({
    stem: q.stem,
    options: q.options,
    answer: q.answer,
    knowledge: q.knowledge,
    explain: q.explain,
  });
  const text =
    (data?.text || '').trim() ||
    q.explain ||
    `正确答案是 ${String.fromCharCode(65 + q.answer)}。`;
  q.explain = text;
  return text;
}

function isRateLimitedError(err) {
  return err?.status === 429 || err?.payload?.limited === true;
}

async function onHint(qi) {
  const q = paper[qi];
  if (!q) return;

  const run = async (force = false) => {
    showAppBubble({
      title: 'AI 提示',
      loading: true,
      loadingText: '老师想一想……',
      persistent: true,
    });
    try {
      const text = await fetchHintText(q, force);
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
  const q = paper[qi];
  if (!q) return;

  const run = async (force = false) => {
    showAppBubble({
      title: 'AI 解答',
      loading: true,
      loadingText: '正在讲解……',
      persistent: true,
    });
    try {
      const text = await fetchExplainText(q, force);
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
  if (!paper.length || submitting) return;
  submitting = true;
  submitted = true;
  const btnSubmit = $('#btnQuizSubmit');
  if (btnSubmit) btnSubmit.disabled = true;
  hideBrandTip();
  expandedResultIdx = null;

  let correct = 0;
  let answered = 0;
  paper.forEach((q) => {
    if (q.chosen !== null) {
      answered += 1;
      if (q.chosen === q.answer) correct += 1;
    }
  });

  const scoreLine = $('#quizScoreLine');
  if (scoreLine) {
    scoreLine.textContent = `得分 ${correct} / ${paper.length}（已作答 ${answered} 题）· ${diffLabel()}`;
  }

  // 入库（错题本在服务端按：答错 或 用过 AI 解答）
  let saveOk = false;
  try {
    const payloadItems = paper.map((q, i) => ({
      id: q.id || `q${i + 1}`,
      stem: q.stem,
      options: q.options,
      answer: Number(q.answer),
      knowledge: q.knowledge,
      hint: q.hint,
      explain: q.explain,
      chosen: q.chosen === null || q.chosen === undefined ? null : Number(q.chosen),
      usedHint: Boolean(q.usedHint),
      usedExplain: Boolean(q.usedExplain),
    }));
    const saved = await quizApi.saveSession({
      paperId: currentPaperId,
      grades: gradeLabels(),
      difficulty: diffLabel(),
      topics: topicLabels(),
      reveal: config.reveal,
      items: payloadItems,
    });
    lastSessionId = saved?.id || null;
    saveOk = true;
  } catch (err) {
    console.error('保存练习场次失败', err);
    window.alert(
      `练习记录保存失败：${err.message || err}\n仍可查看本场结果，但错题本/历史可能未更新。`,
    );
  } finally {
    submitting = false;
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
  const letters = ['A', 'B', 'C', 'D'];

  list.innerHTML = paper
    .map((q, i) => {
      let mark = 'skip';
      let markText = '未作答';
      if (q.chosen !== null) {
        if (q.chosen === q.answer) {
          mark = 'ok';
          markText = '正确';
        } else {
          mark = 'bad';
          markText = '错误';
        }
      }
      const open = expandedResultIdx === i;
      const opts = q.options
        .map((opt, oi) => {
          let cls = 'quiz-opt';
          if (oi === q.answer) cls += ' is-correct';
          if (q.chosen === oi && q.chosen !== q.answer) cls += ' is-wrong';
          if (q.chosen === oi) cls += ' is-selected';
          return `<div class="${cls}"><strong>${letters[oi]}.</strong> ${escapeHtml(opt)}</div>`;
        })
        .join('');

      return `
      <div class="quiz-result-item${open ? ' is-expanded' : ''}" data-result-i="${i}" role="button" tabindex="0">
        <div class="quiz-result-item-summary">
          <span class="mark ${mark}">${markText}</span>
          <div class="quiz-result-item-text">
            <strong>第 ${i + 1} 题</strong>
            ${q.knowledge ? ` · ${escapeHtml(q.knowledge)}` : ''}
            <span class="quiz-result-brief">${escapeHtml(q.stem.slice(0, 48))}${q.stem.length > 48 ? '…' : ''}</span>
          </div>
          <span class="quiz-result-chevron" aria-hidden="true">${open ? '▴' : '▾'}</span>
        </div>
        <div class="quiz-result-detail" ${open ? '' : 'hidden'}>
          <p class="quiz-stem">${escapeHtml(q.stem)}</p>
          <div class="quiz-options">${opts}</div>
          <p class="quiz-result-keys">
            你的选择：<strong>${q.chosen === null ? '—' : letters[q.chosen]}</strong>
            · 正确答案：<strong>${letters[q.answer]}</strong>
            ${q.usedHint ? ' · 看过提示' : ''}
            ${q.usedExplain ? ' · 看过解答' : ''}
          </p>
          ${
            q.explain
              ? `<p class="quiz-result-explain">${escapeHtml(q.explain)}</p>`
              : ''
          }
        </div>
      </div>`;
    })
    .join('');

  list.querySelectorAll('[data-result-i]').forEach((el) => {
    const toggle = () => {
      const i = Number(el.dataset.resultI);
      expandedResultIdx = expandedResultIdx === i ? null : i;
      renderResultList();
      if (expandedResultIdx !== null) {
        const card = list.querySelector(`[data-result-i="${expandedResultIdx}"]`);
        card?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    };
    el.addEventListener('click', (e) => {
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

  const letters = ['A', 'B', 'C', 'D'];
  const results = paper.map((q) => ({
    answered: q.chosen !== null,
    correct: q.chosen !== null && q.chosen === q.answer,
    knowledge: q.knowledge,
    chosenLabel: q.chosen === null ? null : letters[q.chosen],
    answerLabel: letters[q.answer],
    usedHint: q.usedHint,
    usedExplain: q.usedExplain,
  }));

  try {
    const data = await aiApi.quizSummary({
      difficulty: diffLabel(),
      topics: topicLabels(),
      results,
    });
    body.className = 'quiz-report-body';
    body.textContent = data?.text || '暂无报告内容';
    if (lastSessionId && data?.text) {
      quizApi.saveSummary(lastSessionId, data.text).catch(() => {});
    }
  } catch (err) {
    body.className = 'quiz-report-body';
    body.textContent = err.message || '报告生成失败';
  } finally {
    if (btn) btn.disabled = false;
  }
}

function backToConfig() {
  submitted = false;
  submitting = false;
  paper = [];
  lastSessionId = null;
  expandedResultIdx = null;
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
  renderGradeChips();
  renderTopicChips();
  renderDifficultyChips();
  renderRevealChips();
  bindCount();
  showView('config');
  initRollcall();

  const defaults = topicsForGrades(config.grades).slice(0, 2).map((t) => t.id);
  if (!config.topics.length) {
    config.topics = defaults;
    renderTopicChips();
  }

  $('#btnQuizGenerate')?.addEventListener('click', generateQuiz);
  $('#btnQuizSubmit')?.addEventListener('click', () => {
    if (!paper.length) return;
    if (!window.confirm('确定交卷？交卷后将显示本场结果并写入练习记录。')) return;
    submitPaper();
  });
  $('#btnQuizBackConfig')?.addEventListener('click', () => {
    if (paper.length && !submitted) {
      if (!window.confirm('当前练习尚未交卷，确定放弃并重新出题？')) return;
    }
    backToConfig();
  });
  $('#btnQuizAgain')?.addEventListener('click', backToConfig);
  $('#btnQuizSummary')?.addEventListener('click', runSummary);
  $('#btnQuizStatsRefresh')?.addEventListener('click', refreshStatsAndWrongBook);
  $('#btnWrongRefresh')?.addEventListener('click', () => {
    expandedWrongId = null;
    wrongUiState = {};
    loadWrongBookPage();
  });
  document.querySelectorAll('.btn-quiz-export').forEach((btn) => {
    btn.addEventListener('click', exportQuizMarkdown);
  });
}
