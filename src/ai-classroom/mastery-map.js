/**
 * 知识掌握地图 — 前端模块
 * 按年级三列展示各知识点掌握度（进度条 + 等级色）、掌握度分布环形图、
 * 优先复习（可一键去出题）与复习建议。
 * 颜色全部取主题语义 token：掌握 --ok / 练习中 --mid / 起步 --bad / 未开始 --border-ink。
 */
import { CHEM_TOPICS, GRADES } from '../data/chem-topics.js';

const LEVELS = [
  { id: 'mastered', label: '掌握' },
  { id: 'practicing', label: '练习中' },
  { id: 'beginner', label: '起步' },
  { id: 'unstarted', label: '未开始' },
];

const GRADE_BY_LABEL = new Map(CHEM_TOPICS.map((t) => [t.label, t.grade]));

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function motionSteps() {
  const v = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--motion-steps'), 10);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** 数字滚动（像素主题逐帧） */
function countUp(el, to, suffix = '') {
  if (!el) return;
  if (prefersReducedMotion() || !to) {
    el.textContent = `${to}${suffix}`;
    return;
  }
  const steps = motionSteps();
  const dur = 700;
  const t0 = performance.now();
  const frame = (now) => {
    let p = Math.min(1, (now - t0) / dur);
    p = steps ? Math.ceil(p * steps) / steps : 1 - Math.pow(1 - p, 3);
    el.textContent = `${Math.round(to * p)}${suffix}`;
    if (p < 1) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** 两帧后再设宽度/描边，让 CSS 过渡从 0 开始 */
function reveal(root) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      root.querySelectorAll('[data-w]').forEach((el) => {
        el.style.width = `${el.dataset.w}%`;
      });
      root.querySelectorAll('[data-dash]').forEach((el) => {
        el.style.strokeDasharray = el.dataset.dash;
      });
    }),
  );
}

/** 是否需要优先复习：起步，或还有未解决错题 */
function isWeak(t) {
  return t.level === 'beginner' || (t.wrong > 0 && t.level !== 'mastered');
}

/**
 * @param {object} deps
 * @param {(sel: string) => Element|null} deps.select
 * @param {(s: string) => string} deps.escapeHtml
 * @param {{ summary: () => Promise<any> }} deps.masteryApi
 * @param {(topicName: string) => void} [deps.onPractice] 去智能出题练这个知识点
 */
export function createMasteryMapController({ select, escapeHtml, masteryApi, onPractice }) {
  function renderSummary(data, topics) {
    const el = select('#masterySummary');
    if (!el) return;
    const s = data.summary || {};
    const covered = topics.filter((t) => t.total > 0).length;
    const tiles = [
      { label: '已练题数', value: s.totalQuestions || 0, suffix: '' },
      { label: '总正确率', value: s.accuracy || 0, suffix: '%' },
      { label: '已覆盖知识点', value: covered, suffix: ` / ${topics.length}` },
      { label: '未解决错题', value: s.totalWrong || 0, suffix: '', tone: s.totalWrong ? 'bad' : '' },
    ];
    el.innerHTML = tiles
      .map(
        (t, i) => `
        <div class="mastery-stat${t.tone ? ` is-${t.tone}` : ''}" style="--i:${i}">
          <strong data-count="${t.value}" data-suffix="${escapeHtml(t.suffix)}">0${escapeHtml(t.suffix)}</strong>
          <em>${t.label}</em>
        </div>`,
      )
      .join('');
    el.querySelectorAll('[data-count]').forEach((n) => countUp(n, Number(n.dataset.count), n.dataset.suffix));
  }

  /** 掌握度分布环形图：按知识点个数分段 */
  function renderRing(data, topics) {
    const el = select('#masteryRing');
    if (!el) return;
    const total = topics.length || 1;
    const R = 52;
    const C = 2 * Math.PI * R;
    let offset = 0;
    const segs = LEVELS.map((lv) => {
      const n = topics.filter((t) => t.level === lv.id).length;
      const len = (n / total) * C;
      // 段间留 2px 缝；只有一段时不留
      const gap = n && n < total ? 2 : 0;
      const seg = n
        ? `<circle class="mastery-ring-seg" data-level="${lv.id}" r="${R}" cx="60" cy="60"
             stroke-dasharray="0 ${C}" data-dash="${Math.max(0, len - gap)} ${C}"
             stroke-dashoffset="${-offset}"></circle>`
        : '';
      offset += len;
      return { ...lv, n, seg };
    });
    const acc = data.summary?.accuracy || 0;
    el.innerHTML = `
      <svg viewBox="0 0 120 120" role="img" aria-label="${segs.map((s) => `${s.label} ${s.n} 个`).join('，')}">
        <circle class="mastery-ring-track" r="${R}" cx="60" cy="60"></circle>
        <g transform="rotate(-90 60 60)">${segs.map((s) => s.seg).join('')}</g>
        <text x="60" y="58" class="mastery-ring-value">${data.summary?.totalQuestions ? `${acc}%` : '—'}</text>
        <text x="60" y="76" class="mastery-ring-caption">总正确率</text>
      </svg>
      <ul class="mastery-legend">
        ${segs
          .map(
            (s) =>
              `<li data-level="${s.id}"><i></i>${s.label}<b>${s.n}</b></li>`,
          )
          .join('')}
      </ul>`;
  }

  function topicTile(t, i) {
    const acc = t.accuracy;
    const weak = isWeak(t);
    return `
      <div class="mastery-tile${weak ? ' is-weak' : ''}" data-level="${t.level}" style="--i:${i}"
           title="${escapeHtml(`${t.name}：${t.total ? `${t.total} 题 · 正确率 ${acc}%` : '暂无练习'}${t.wrong ? ` · ${t.wrong} 道错题` : ''}`)}">
        <i class="mastery-tile-fill" data-w="${acc ?? 0}"></i>
        <span class="mastery-tile-name">${escapeHtml(t.name)}</span>
        <span class="mastery-tile-meta">
          ${weak ? '<i class="mastery-tile-stamp">待复习</i>' : ''}
          ${t.wrong ? `<em class="mastery-tile-wrong">${t.wrong} 错</em>` : ''}
          <b>${acc === null ? '—' : `${acc}%`}</b>
        </span>
      </div>`;
  }

  /** 按年级三列；不在章节表里的（如「综合/待归类」）放到最后一列 */
  function renderTopics(topics) {
    const el = select('#masteryTopics');
    if (!el) return;
    if (!topics.length) {
      el.innerHTML = '<p class="quiz-muted">暂无知识点数据</p>';
      return;
    }
    const cols = GRADES.map((g) => ({ ...g, items: [] }));
    const other = [];
    // 列内保持章节顺序，方便老师按教材找
    const order = new Map(CHEM_TOPICS.map((t, i) => [t.label, i]));
    for (const t of topics) {
      const grade = GRADE_BY_LABEL.get(t.name);
      const col = cols.find((c) => c.id === grade);
      (col ? col.items : other).push(t);
    }
    cols.forEach((c) => c.items.sort((a, b) => order.get(a.name) - order.get(b.name)));
    if (other.length) cols[cols.length - 1].items.push(...other);

    let k = 0;
    el.innerHTML = cols
      .map((c) => {
        const practiced = c.items.filter((t) => t.total > 0);
        const avg = practiced.length
          ? Math.round(practiced.reduce((sum, t) => sum + t.accuracy, 0) / practiced.length)
          : null;
        return `
        <section class="mastery-col">
          <h5>${c.label}<span>${c.items.length} 个主题${avg === null ? '' : ` · 平均 ${avg}%`}</span></h5>
          ${c.items.map((t) => topicTile(t, k++)).join('')}
        </section>`;
      })
      .join('');
  }

  function renderWeakTopics(topics) {
    const el = select('#masteryWeak');
    if (!el) return;
    const weak = topics
      .filter(isWeak)
      .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || b.wrong - a.wrong)
      .slice(0, 4);
    if (!weak.length) {
      const any = topics.some((t) => t.total > 0);
      el.innerHTML = `<p class="quiz-muted">${any ? '目前没有薄弱知识点，继续保持！' : '做完第一套练习后，这里会列出最需要复习的知识点。'}</p>`;
      return;
    }
    const canPractice = typeof onPractice === 'function';
    el.innerHTML = `<div class="mastery-weak">${weak
      .map(
        (t, i) => `
        <div class="mastery-weak-card" data-level="${t.level}" style="--i:${i}">
          <span class="mastery-weak-rank">${i + 1}</span>
          <div class="mastery-weak-body">
            <strong>${escapeHtml(t.name)}</strong>
            <span>${t.accuracy === null ? '暂无作答' : `正确率 ${t.accuracy}%`}${t.wrong ? ` · ${t.wrong} 道错题` : ''}</span>
          </div>
          ${
            canPractice && GRADE_BY_LABEL.has(t.name)
              ? `<button type="button" class="btn ghost btn-sm" data-practice="${escapeHtml(t.name)}">去练这个</button>`
              : ''
          }
        </div>`,
      )
      .join('')}</div>`;
    el.querySelectorAll('[data-practice]').forEach((btn) => {
      btn.addEventListener('click', () => onPractice(btn.dataset.practice));
    });
  }

  function renderSuggestions(suggestions) {
    const el = select('#masterySuggestions');
    if (!el) return;
    if (!suggestions.length) {
      el.innerHTML = '';
      return;
    }
    el.innerHTML =
      '<ul class="mastery-suggestion-list">' +
      suggestions.map((s) => `<li>${escapeHtml(s)}</li>`).join('') +
      '</ul>';
  }

  async function load() {
    const status = select('#masteryStatus');
    try {
      if (status) status.textContent = '加载中…';
      const data = await masteryApi.summary();
      const topics = data.topics || [];
      // 「综合/待归类」不是章节，不计入覆盖率与分布图
      const catalog = topics.filter((t) => t.id !== 'uncategorized');
      renderSummary(data, catalog);
      renderRing(data, catalog);
      renderWeakTopics(topics);
      renderTopics(topics);
      renderSuggestions(data.suggestions || []);
      const root = select('#aiSectionMastery');
      if (root) reveal(root);
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
