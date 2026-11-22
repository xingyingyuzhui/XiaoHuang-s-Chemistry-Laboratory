/**
 * 模块 03 · 晶体的性质主视图外壳（全幅开放舞台 + 可折叠抽屉目录 + 悬浮信息/思考题/底部控台）
 * 导出 mountPropertiesView(stageEl, { drawerBodyEl } = {}) -> { pause(), resume(), resize(), destroy() }
 */

import { createHammerExp } from './properties/exp-hammer.js';
import { createConductExp, createIceExp } from './properties/exp-conduct-ice.js';
import { createMeltRaceExp } from './properties/exp-melt-race.js';

const EXPERIMENTS = [
  {
    id: 'hammer',
    num: '01',
    title: '延展 vs 脆裂',
    formula: 'Cu vs NaCl',
    sub: '金属键滑移不断裂 · 离子键错位同号相斥',
    badge: '机械性质',
    question: '为什么用铁锤敲击铜块会压扁成薄片，而敲击食盐晶体却会瞬间碎裂？',
    answer:
      '金属晶体中阳离子浸泡在自由电子海里，金属键没有方向性；外力使原子层滑移后，自由电子仍维系各层不断裂（延展性）。离子晶体错位后同号离子正对，强烈静电斥力使晶体立刻沿解理面碎裂（脆性）。',
    mount: createHammerExp,
  },
  {
    id: 'conduct',
    num: '02',
    title: '三态导电实验',
    formula: 'NaCl (s / l / aq)',
    sub: '固态不导电 · 熔融态与水溶液均可导电',
    badge: '电学性质',
    question: '食盐晶体本身由带电的 Na⁺ 和 Cl⁻ 组成，为什么固态时不导电，熔化或溶于水后才能导电？',
    answer:
      '导电需要“能自由移动的带电微粒”。固态 NaCl 中离子被强离子键束缚在晶格中只能原位微振；高温熔融（801°C）或溶于水后，离子键被破坏，自由移动的 Na⁺ 向阴极、Cl⁻ 向阳极定向迁移形成电流。',
    mount: createConductExp,
  },
  {
    id: 'ice',
    num: '03',
    title: '冰为何浮在水面',
    formula: 'H₂O (0°C ↔ 4°C)',
    sub: '氢键四面体大空隙 ↔ 4°C 紧密排布',
    badge: '分子间氢键',
    question: '大多数物质都是固态密度大于液态，为什么冰反而比水轻，且液态水在 4°C 时密度最大？',
    answer:
      '水分子间存在具方向性和饱和性的氢键。结冰时每个 H₂O 与周围 4 个分子形成正四面体骨架，留下大量空隙导致体积膨胀（ρ = 0.917 g/cm³）。融化升温至 4°C 时，部分氢键断裂，分子坍缩填入空隙，排布最紧密，密度达最大值 1.000 g/cm³。',
    mount: createIceExp,
  },
  {
    id: 'melt-race',
    num: '04',
    title: '16 种晶体熔化赛',
    formula: '-250°C → 3600°C',
    sub: '分子 / 金属 / 离子 / 共价同步升温',
    badge: '熔沸点规律',
    question: '总体熔点排序“共价 > 离子 > 分子”背后决定因素是什么？为什么金属晶体里既有 -39°C 的汞，也有 3422°C 的钨？',
    answer:
      '晶体熔化本质是克服微粒间作用力：分子晶体只需克服很弱的范德华力/氢键；离子与共价晶体需破坏强化学键。而金属键强弱取决于价电子数与原子半径，因此金属熔点跨度横跨近 3500°C（Hg -39°C ↔ W 3422°C）。',
    mount: createMeltRaceExp,
  },
];

function buildNavHtml(activeId) {
  return `
    <div class="crystal-drawer-list" role="tablist" aria-label="晶体性质实验目录" aria-orientation="vertical">
      ${EXPERIMENTS.map((exp) => `
        <button
          type="button"
          class="crystal-drawer-item${exp.id === activeId ? ' is-active' : ''}"
          data-exp-id="${exp.id}"
          role="tab"
          aria-selected="${exp.id === activeId ? 'true' : 'false'}"
        >
          <span class="crystal-drawer-item-title">${exp.num} · ${exp.title}</span>
          <span class="crystal-drawer-item-sub">${exp.sub}</span>
        </button>
      `).join('')}
    </div>
  `;
}

export function mountPropertiesView(stageEl, { drawerBodyEl } = {}) {
  let activeId = null;
  let activeExp = null;
  let paused = false;
  let destroyed = false;

  stageEl.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'crystal-open-stage';
  root.style.cssText = 'position:relative;width:100%;height:100%;background:var(--stage-3d-bg);overflow:hidden;';
  root.innerHTML = `
    <div class="crystal-stage-canvas" data-role="stage" style="position:absolute;inset:0;width:100%;height:100%;background:var(--stage-3d-bg);"></div>
    <div class="crystal-float-info" data-role="info">
      <div class="crystal-float-head">
        <strong class="crystal-float-title" data-role="title"></strong>
        <span class="crystal-tag" data-role="badge"></span>
      </div>
      <div class="crystal-float-caption" data-role="caption">加载实验中…</div>
    </div>
    <div class="crystal-float-actions">
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="qa-toggle" aria-expanded="false">
        思考题 💡
      </button>
    </div>
    <div class="crystal-qa-popover" data-role="qa-popover" hidden>
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">课堂思考题</h4>
        <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="qa-close" aria-label="关闭思考题">✕</button>
      </div>
      <p class="crystal-qa-question" data-role="qa-q"></p>
      <div class="crystal-qa-answer-box is-covered" data-role="qa-box">
        <p class="crystal-qa-answer" data-role="qa-a"></p>
        <div class="crystal-qa-cover" data-role="qa-cover">
          <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="qa-reveal">
            点击揭晓结论
          </button>
        </div>
      </div>
      <div class="crystal-qa-foot">
        <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="qa-hide" hidden>
          重新遮挡
        </button>
      </div>
    </div>
    <div class="crystal-dock" data-role="dock"></div>
  `;
  stageEl.appendChild(root);

  let navHost = drawerBodyEl;
  if (!navHost) {
    const strip = document.createElement('div');
    strip.className = 'crystal-fallback-nav';
    strip.style.cssText = 'position:absolute;top:0.5rem;left:50%;transform:translateX(-50%);z-index:8;max-width:92%;overflow-x:auto;';
    root.appendChild(strip);
    navHost = strip;
  }
  navHost.innerHTML = buildNavHtml(EXPERIMENTS[0].id);

  const canvasHost = root.querySelector('[data-role="stage"]');
  const titleEl = root.querySelector('[data-role="title"]');
  const badgeEl = root.querySelector('[data-role="badge"]');
  const captionEl = root.querySelector('[data-role="caption"]');
  const dockEl = root.querySelector('[data-role="dock"]');
  const qaPopoverEl = root.querySelector('[data-role="qa-popover"]');
  const qaQEl = root.querySelector('[data-role="qa-q"]');
  const qaAEl = root.querySelector('[data-role="qa-a"]');
  const qaBoxEl = root.querySelector('[data-role="qa-box"]');
  const qaCoverEl = root.querySelector('[data-role="qa-cover"]');
  const btnQaToggle = root.querySelector('[data-act="qa-toggle"]');
  const btnQaClose = root.querySelector('[data-act="qa-close"]');
  const btnReveal = root.querySelector('[data-act="qa-reveal"]');
  const btnHide = root.querySelector('[data-act="qa-hide"]');

  function setCaption(text) {
    if (captionEl && text) captionEl.textContent = text;
  }

  function setQaOpen(open) {
    qaPopoverEl.hidden = !open;
    btnQaToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    btnQaToggle.classList.toggle('is-active', open);
  }

  function setQaRevealed(revealed) {
    qaBoxEl.classList.toggle('is-covered', !revealed);
    qaCoverEl.hidden = revealed;
    btnHide.hidden = !revealed;
  }

  function selectExperiment(id) {
    const exp = EXPERIMENTS.find((e) => e.id === id) || EXPERIMENTS[0];
    if (activeId === exp.id && activeExp) return;
    if (activeExp) {
      activeExp.destroy?.();
      activeExp = null;
    }
    canvasHost.innerHTML = '';
    dockEl.innerHTML = '';
    activeId = exp.id;

    navHost.querySelectorAll('[data-exp-id]').forEach((b) => {
      const on = b.dataset.expId === activeId;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    titleEl.textContent = `${exp.num} · ${exp.title}（${exp.formula}）`;
    badgeEl.textContent = exp.badge;
    qaQEl.textContent = exp.question;
    qaAEl.textContent = exp.answer;
    setQaOpen(false);
    setQaRevealed(false);

    activeExp = exp.mount(canvasHost, dockEl, setCaption);
    if (paused && activeExp?.pause) activeExp.pause();
  }

  const onNavClick = (e) => {
    const btn = e.target.closest('[data-exp-id]');
    if (!btn || btn.dataset.expId === activeId) return;
    selectExperiment(btn.dataset.expId);
  };
  navHost.addEventListener('click', onNavClick);
  btnQaToggle.addEventListener('click', () => setQaOpen(qaPopoverEl.hidden));
  btnQaClose.addEventListener('click', () => setQaOpen(false));
  btnReveal.addEventListener('click', () => setQaRevealed(true));
  btnHide.addEventListener('click', () => setQaRevealed(false));

  selectExperiment(EXPERIMENTS[0].id);

  return {
    pause() {
      paused = true;
      activeExp?.pause?.();
    },
    resume() {
      if (destroyed) return;
      paused = false;
      activeExp?.resume?.();
    },
    resize() {
      if (destroyed) return;
      activeExp?.resize?.();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      navHost.removeEventListener('click', onNavClick);
      activeExp?.destroy?.();
      activeExp = null;
      if (drawerBodyEl) drawerBodyEl.innerHTML = '';
      stageEl.innerHTML = '';
    },
  };
}
