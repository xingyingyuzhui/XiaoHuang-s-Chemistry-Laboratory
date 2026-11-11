/**
 * 判题反馈特效（智能出题 / 离线题库 / 错题本共用）
 *
 * 只在「刚揭晓」的那一刻调用；列表重绘不会重放（CSS 动画挂在 .is-just-revealed 上）。
 * 每个主题有自己的反馈语言：
 *   default    彩色纸屑
 *   stationery 红笔批改 ✓ / ✗（中国老师改卷的红勾）
 *   reagent    气泡上浮
 *   blackboard 粉笔画勾 + 粉笔灰
 *   pixel      方块像素纸屑
 * 系统「减少动态效果」时全部跳过，只保留颜色变化。
 */
import confetti from 'canvas-confetti';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TICK = 'M6 26 L18 38 L42 10';
const CROSS = 'M10 10 L38 38 M38 10 L10 38';

/** 用手写批改记号的主题 */
const MARK_THEMES = new Set(['stationery', 'blackboard']);

export function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function themeId() {
  return document.documentElement.getAttribute('data-theme') || 'default';
}

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 元素中心 → confetti 归一化坐标 */
function originOf(el) {
  const r = el.getBoundingClientRect();
  return {
    x: (r.left + r.width / 2) / window.innerWidth,
    y: (r.top + r.height / 2) / window.innerHeight,
  };
}

/**
 * 主题粒子（点名点中也用）
 * @param {HTMLElement} el
 * @param {boolean} [big]
 */
export function themeBurst(el, big = false) {
  if (!el || prefersReducedMotion()) return;
  burst(el, big);
}

/**
 * 文具 / 黑板主题：在元素外圈一个手绘椭圆（红笔圈 / 粉笔圈）
 * @param {HTMLElement} host 需为定位容器
 * @returns {boolean} 是否画了
 */
export function circleMark(host) {
  if (!host || !MARK_THEMES.has(themeId()) || prefersReducedMotion()) return false;
  host.querySelector('.fx-circle')?.remove();
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 200 100');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('fx-circle');
  const path = document.createElementNS(SVG_NS, 'path');
  // 不闭合、略微出头的手绘椭圆
  path.setAttribute('d', 'M150 12 C 196 20, 198 80, 110 90 C 30 98, 2 70, 8 44 C 14 16, 70 4, 120 8 C 150 10, 170 18, 176 24');
  path.setAttribute('pathLength', '1');
  svg.appendChild(path);
  host.appendChild(svg);
  return true;
}

function burst(el, big) {
  const origin = originOf(el);
  const theme = themeId();
  const palette = [cssVar('--ok', '#16a34a'), cssVar('--accent', '#3b82f6'), cssVar('--note', '#fbbf24'), cssVar('--flame', '#f59e0b')];
  const base = { origin, disableForReducedMotion: true, zIndex: 3000 };
  const n = big ? 3 : 1;

  if (theme === 'pixel') {
    confetti({ ...base, particleCount: 36 * n, spread: 70 + 20 * n, startVelocity: 28 + 6 * n, shapes: ['square'], flat: true, scalar: 1.1, ticks: 140, colors: palette });
  } else if (theme === 'reagent') {
    // 气泡：圆形、负重力上浮、慢速
    confetti({ ...base, particleCount: 28 * n, spread: 40 + 20 * n, startVelocity: 10 + 4 * n, gravity: -0.35, drift: 0.15, decay: 0.95, shapes: ['circle'], scalar: 1.25, ticks: 160, colors: [cssVar('--ok', '#3f7f5f'), cssVar('--diagram', '#2f6f8f'), cssVar('--ok-soft', '#e4eee6')] });
  } else if (theme === 'blackboard') {
    // 粉笔灰：细小、偏白、落得快
    confetti({ ...base, particleCount: 26 * n, spread: 60 + 20 * n, startVelocity: 16 + 6 * n, gravity: 1.2, shapes: ['circle'], scalar: 0.55, ticks: 90, colors: ['#f4f1e6', cssVar('--note', '#ffd166'), cssVar('--ok', '#8fe3a8')] });
  } else if (theme === 'stationery') {
    // 批改记号是主角；满分时补一点纸屑
    if (big) confetti({ ...base, particleCount: 60, spread: 90, startVelocity: 30, scalar: 0.9, colors: [cssVar('--stamp', '#c0392b'), cssVar('--note', '#e0b04a'), cssVar('--ink', '#1a2230')] });
  } else {
    confetti({ ...base, particleCount: 40 * n, spread: 65 + 25 * n, startVelocity: 30 + 6 * n, scalar: 0.95, ticks: 160, colors: palette });
  }
}

/**
 * 在选项上画一个手写批改记号（仅文具 / 黑板主题）
 * @param {HTMLElement} opt
 * @param {boolean} ok
 */
function drawMark(opt, ok) {
  if (!MARK_THEMES.has(themeId()) || !opt || opt.querySelector('.quiz-mark')) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('quiz-mark', ok ? 'is-ok' : 'is-bad');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', ok ? TICK : CROSS);
  path.setAttribute('pathLength', '1');
  svg.appendChild(path);
  opt.appendChild(svg);
}

/**
 * 一道题刚揭晓对错
 * @param {HTMLElement|null} card 题目卡片（含 .quiz-opt）
 * @param {{ ok: boolean, delayMs?: number, quiet?: boolean }} opts quiet：不放粒子（批量揭晓时用）
 */
export function revealQuestion(card, { ok, delayMs = 0, quiet = false } = {}) {
  if (!card) return;
  card.classList.add('is-just-revealed');
  card.style.setProperty('--reveal-delay', `${delayMs}ms`);
  const chosen = card.querySelector('.quiz-opt.is-selected');
  if (prefersReducedMotion()) return;
  window.setTimeout(() => {
    drawMark(chosen, ok);
    if (ok && !quiet && chosen) burst(chosen, false);
  }, delayMs);
}

/**
 * 交卷后结果列表揭晓：每题的「正确 / 错误」标记依次盖下
 * 只播一次：动画结束后摘掉类名，之后展开/收起重绘不会重放
 * @param {HTMLElement|null} list
 */
export function revealResultList(list) {
  if (!list || prefersReducedMotion()) return;
  [...list.children].forEach((item, i) => item.style.setProperty('--i', String(Math.min(i, 12))));
  list.classList.add('is-just-revealed');
  window.setTimeout(() => list.classList.remove('is-just-revealed'), 2200);
}

/**
 * 全对庆祝（交卷成绩处）
 * @param {HTMLElement|null} anchor
 */
export function celebrate(anchor) {
  if (!anchor || prefersReducedMotion()) return;
  anchor.classList.remove('is-perfect');
  void anchor.offsetWidth;
  anchor.classList.add('is-perfect');
  burst(anchor, true);
}

/**
 * 成绩数字滚动：「得分 0 → n / total」
 * @param {HTMLElement|null} el
 * @param {(n: number) => string} format
 * @param {number} to
 */
export function countScore(el, format, to) {
  if (!el) return;
  if (prefersReducedMotion() || to <= 0) {
    el.textContent = format(to);
    return;
  }
  const steps = Math.max(1, Math.min(to, 20));
  let i = 0;
  el.textContent = format(0);
  const tick = () => {
    i += 1;
    el.textContent = format(Math.round((to * i) / steps));
    if (i < steps) window.setTimeout(tick, 600 / steps);
  };
  window.setTimeout(tick, 120);
}

/**
 * 错题本徽章数字增加时弹出「+N」
 * @param {HTMLElement|null} badge
 * @param {number} delta
 */
export function bumpBadge(badge, delta) {
  if (!badge || prefersReducedMotion()) return;
  badge.classList.remove('is-bump');
  void badge.offsetWidth;
  badge.classList.add('is-bump');
  if (delta > 0) {
    const tag = document.createElement('span');
    tag.className = 'ai-nav-badge-delta';
    tag.textContent = `+${delta}`;
    badge.parentElement?.appendChild(tag);
    tag.addEventListener('animationend', () => tag.remove());
  }
}
