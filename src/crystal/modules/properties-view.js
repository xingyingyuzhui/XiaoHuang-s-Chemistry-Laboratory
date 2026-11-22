/**
 * 模块 03：晶体的性质（交互实验合集外壳）
 * 复用 .crystal-workbench 三栏暗棚布局与默认遮挡思考题卡，
 * 按需挂载 4 个独立实验并严格管理 pause / resume / resize / destroy 生命周期。
 */

import { createHammerExp } from './properties/exp-hammer.js';
import { createConductExp, createIceExp } from './properties/exp-conduct-ice.js';
import { createMeltRaceExp } from './properties/exp-melt-race.js';

const EXPERIMENTS = [
  {
    id: 'hammer',
    num: '01',
    formula: 'Cu vs NaCl',
    name: '敲一下对比：延展 vs 脆裂',
    sub: '金属键滑移不断裂 · 离子键错位同号相斥',
    badge: '机械性质',
    dots: ['#fbbf24', '#c084fc', '#4ade80'],
    tags: ['金属键无方向性', '自由电子海', '同号电荷相斥'],
    question: '为什么用铁锤敲击铜块会压扁成薄片，而敲击食盐晶体却会瞬间碎裂？',
    answer:
      '金属晶体中阳离子浸泡在自由电子海里，金属键没有方向性；外力使原子层滑移后，自由电子仍维系各层不断裂（延展性）。离子晶体错位后同号离子正对，强烈静电斥力使晶体立刻沿解理面碎裂（脆性）。',
    mount: createHammerExp,
  },
  {
    id: 'conduct',
    num: '02',
    formula: 'NaCl (s / l / aq)',
    name: '三态导电与离子定向迁移',
    sub: '固态不导电 · 熔融态与水溶液均可导电',
    badge: '电学性质',
    dots: ['#c084fc', '#4ade80', '#fde047'],
    tags: ['固态无自由离子', '熔融电离', '水合离子定向迁移'],
    question: '食盐晶体本身由带电的 Na⁺ 和 Cl⁻ 组成，为什么固态时不导电，熔化或溶于水后才能导电？',
    answer:
      '导电需要“能自由移动的带电微粒”。固态 NaCl 中离子被强离子键束缚在晶格中只能原位微振；高温熔融（801°C）或溶于水后，离子键被破坏，自由移动的 Na⁺ 向阴极、Cl⁻ 向阳极定向迁移形成电流。',
    mount: createConductExp,
  },
  {
    id: 'ice',
    num: '03',
    formula: 'H₂O (0°C ↔ 4°C)',
    name: '冰为什么能浮在水面上？',
    sub: '氢键四面体大空隙晶体 ↔ 液态紧密排布',
    badge: '分子间氢键',
    dots: ['#f87171', '#f8fafc', '#38bdf8'],
    tags: ['方向性氢键', '0°C 冰 0.917 g/cm³', '4°C 水 1.000 g/cm³'],
    question: '大多数物质都是固态密度大于液态，为什么冰反而比水轻，且液态水在 4°C 时密度最大？',
    answer:
      '水分子间存在具方向性和饱和性的氢键。结冰时每个 H₂O 与周围 4 个分子形成正四面体骨架，留下大量空隙导致体积膨胀（ρ = 0.917 g/cm³）。融化升温至 4°C 时，部分氢键断裂，分子坍缩填入空隙，排布最紧密，密度达最大值 1.000 g/cm³。',
    mount: createIceExp,
  },
  {
    id: 'melt-race',
    num: '04',
    formula: '16 种晶体比拼',
    name: '同步升温熔化大比拼',
    sub: '分子 / 金属 / 离子 / 共价，-250°C → 3600°C',
    badge: '熔沸点规律',
    dots: ['#38bdf8', '#fbbf24', '#c084fc', '#fb7185'],
    tags: ['范德华力最弱', '金属跨度极大', '共价键极强'],
    question: '总体熔点排序“共价 > 离子 > 分子”背后决定因素是什么？为什么金属晶体里既有 -39°C 的汞，也有 3422°C 的钨？',
    answer:
      '晶体熔化本质是克服微粒间作用力：分子晶体只需克服很弱的范德华力/氢键；离子与共价晶体需破坏强化学键。而金属键强弱取决于价电子数与原子半径，因此金属熔点跨度横跨近 3500°C（Hg -39°C ↔ W 3422°C）。',
    mount: createMeltRaceExp,
  },
];

export function mountPropertiesView(containerEl) {
  let activeId = EXPERIMENTS[0].id;
  let activeExp = null;
  let paused = false;
  let destroyed = false;
  let qaRevealed = false;

  containerEl.innerHTML = `
    <div class="crystal-workbench">
      <aside class="crystal-lib-sidebar" aria-label="晶体性质实验目录">
        <div class="crystal-list" data-role="nav-list"></div>
      </aside>

      <section class="crystal-stage-wrap" aria-label="晶体性质交互实验舞台">
        <div class="crystal-stage-canvas" data-role="stage"></div>
        <div class="crystal-stage-caption" data-role="caption">加载实验中…</div>
      </section>

      <aside class="crystal-inspector" aria-label="实验控制与课堂思考题">
        <div class="crystal-card" data-role="header-card"></div>
        <div data-role="exp-controls"></div>
        <div class="crystal-card" data-role="qa-card"></div>
      </aside>
    </div>
  `;

  const navListEl = containerEl.querySelector('[data-role="nav-list"]');
  const stageEl = containerEl.querySelector('[data-role="stage"]');
  const captionEl = containerEl.querySelector('[data-role="caption"]');
  const headerCardEl = containerEl.querySelector('[data-role="header-card"]');
  const controlsEl = containerEl.querySelector('[data-role="exp-controls"]');
  const qaCardEl = containerEl.querySelector('[data-role="qa-card"]');

  function setCaption(text) {
    if (captionEl && text) captionEl.textContent = text;
  }

  function renderNav() {
    navListEl.innerHTML = EXPERIMENTS.map(
      (exp) => `
        <button type="button" class="crystal-list-item ${exp.id === activeId ? 'is-active' : ''}" data-exp-id="${exp.id}">
          <div class="crystal-list-top">
            <span class="crystal-list-formula">${exp.num} · ${exp.formula}</span>
            <span class="crystal-list-dots">
              ${exp.dots.map((c) => `<span class="crystal-swatch-dot" style="background:${c};"></span>`).join('')}
            </span>
          </div>
          <div class="crystal-list-name">${exp.name}</div>
          <div class="crystal-list-sub">${exp.sub}</div>
        </button>
      `
    ).join('');
  }

  function renderHeader(exp) {
    headerCardEl.innerHTML = `
      <div class="crystal-header-top">
        <div>
          <h3 class="crystal-header-formula">${exp.formula}</h3>
          <p class="crystal-header-name">${exp.name}</p>
        </div>
        <span class="crystal-sys-badge">${exp.badge}</span>
      </div>
      <div class="crystal-param-row">
        ${exp.tags.map((t) => `<span class="crystal-param-pill">${t}</span>`).join('')}
      </div>
    `;
  }

  function renderQA(exp) {
    qaCardEl.innerHTML = `
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">思考题 · 点击揭晓结论</h4>
        <span class="crystal-tag crystal-tag-qa">${qaRevealed ? '已揭晓' : '课堂提问'}</span>
      </div>
      <p class="crystal-qa-question">${exp.question}</p>
      <div class="crystal-qa-answer-box ${qaRevealed ? '' : 'is-covered'}">
        <p class="crystal-qa-answer">${exp.answer}</p>
        ${
          qaRevealed
            ? ''
            : `<div class="crystal-qa-cover">
                <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="reveal-qa">
                  点击揭晓结论
                </button>
              </div>`
        }
      </div>
      ${
        qaRevealed
          ? `<div class="crystal-qa-foot">
              <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="hide-qa">
                重新遮挡
              </button>
            </div>`
          : ''
      }
    `;
  }

  function selectExperiment(id) {
    const exp = EXPERIMENTS.find((e) => e.id === id) || EXPERIMENTS[0];
    if (activeExp) {
      activeExp.destroy();
      activeExp = null;
    }
    activeId = exp.id;
    qaRevealed = false;
    renderNav();
    renderHeader(exp);
    renderQA(exp);
    activeExp = exp.mount(stageEl, controlsEl, setCaption);
    if (paused && activeExp?.pause) activeExp.pause();
  }

  navListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-exp-id]');
    if (!btn || btn.dataset.expId === activeId) return;
    selectExperiment(btn.dataset.expId);
  });

  qaCardEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const exp = EXPERIMENTS.find((x) => x.id === activeId);
    if (!exp) return;
    if (btn.dataset.act === 'reveal-qa') {
      qaRevealed = true;
      renderQA(exp);
    } else if (btn.dataset.act === 'hide-qa') {
      qaRevealed = false;
      renderQA(exp);
    }
  });

  selectExperiment(activeId);

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
      activeExp?.destroy?.();
      activeExp = null;
      containerEl.innerHTML = '';
    },
  };
}
