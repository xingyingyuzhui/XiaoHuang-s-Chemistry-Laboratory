/**
 * 模块 03 · 晶体的性质主视图外壳（零遮挡三行布局：左侧抽屉目录 + 顶栏状态 + 全幅开放舞台 + 底部操作栏）
 * 导出 mountPropertiesView(stageEl, shell = {}) -> { pause(), resume(), resize(), destroy() }
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
    sub: 'Cu 与 NaCl 敲击',
    badge: '机械性质',
    summary: '金属键无方向性使金属受力滑移不断裂（延展性）；离子晶体错位后同号离子正对相斥即碎裂（脆性）。',
    question: '为什么用铁锤敲击铜块会压扁成薄片，而敲击食盐晶体却会瞬间碎裂？',
    answer:
      '金属晶体中阳离子浸泡在自由电子海里，金属键没有方向性；外力使原子层滑移后，自由电子仍维系各层不断裂（延展性）。离子晶体错位后同号离子正对，强烈静电斥力使晶体立刻沿解理面碎裂（脆性）。',
    quickQuestions: [
      '为什么金属有延展性而离子晶体易碎？',
      '金属键没有方向性是什么意思？',
      '共价晶体受力为什么也很脆？',
    ],
    mount: createHammerExp,
  },
  {
    id: 'conduct',
    num: '02',
    title: '三态导电实验',
    formula: 'NaCl (s / l / aq)',
    sub: 'NaCl 固 / 熔 / 水',
    badge: '电学性质',
    summary: '固态 NaCl 离子被固定在晶格中不能自由移动；熔融态与水溶液释放自由离子定向迁移而导电。',
    question: '食盐晶体本身由带电的 Na⁺ 和 Cl⁻ 组成，为什么固态时不导电，熔化或溶于水后才能导电？',
    answer:
      '导电需要“能自由移动的带电微粒”。固态 NaCl 中离子被强离子键束缚在晶格中只能原位微振；高温熔融（801°C）或溶于水后，离子键被破坏，自由移动的 Na⁺ 向阴极、Cl⁻ 向阳极定向迁移形成电流。',
    quickQuestions: [
      '固态食盐有离子为何不导电？',
      '熔融态与水溶液导电有何区别？',
      '共价化合物如 HCl 熔融态能导电吗？',
    ],
    mount: createConductExp,
  },
  {
    id: 'ice',
    num: '03',
    title: '冰为何浮在水面',
    formula: 'H₂O (0°C ↔ 4°C)',
    sub: '氢键空隙与密度',
    badge: '分子间氢键',
    summary: '结冰时水分子形成方向性四面体氢键大空隙骨架，密度降至 0.917 g/cm³；4°C 液态水排布最紧密。',
    question: '大多数物质都是固态密度大于液态，为什么冰反而比水轻，且液态水在 4°C 时密度最大？',
    answer:
      '水分子间存在具方向性和饱和性的氢键。结冰时每个 H₂O 与周围 4 个分子形成正四面体骨架，留下大量空隙导致体积膨胀（ρ = 0.917 g/cm³）。融化升温至 4°C 时，部分氢键断裂，分子坍缩填入空隙，排布最紧密，密度达最大值 1.000 g/cm³。',
    quickQuestions: [
      '为什么冰的密度比液态水小？',
      '水为何在 4°C 时密度最大？',
      '一个水分子平均形成几个氢键？',
    ],
    mount: createIceExp,
  },
  {
    id: 'melt-race',
    num: '04',
    title: '16 种晶体熔化赛',
    formula: '-250°C → 3600°C',
    sub: '四类晶体熔点',
    badge: '熔沸点规律',
    summary: '同步升温对比分子、金属、离子、共价四类晶体熔点，揭示微粒间作用力强弱与熔沸点关系。',
    question: '总体熔点排序“共价 > 离子 > 分子”背后决定因素是什么？为什么金属晶体里既有 -39°C 的汞，也有 3422°C 的钨？',
    answer:
      '晶体熔化本质是克服微粒间作用力：分子晶体只需克服很弱的范德华力/氢键；离子与共价晶体需破坏强化学键。而金属键强弱取决于价电子数与原子半径，因此金属熔点跨度横跨近 3500°C（Hg -39°C ↔ W 3422°C）。',
    quickQuestions: [
      '四类晶体熔沸点总体规律是什么？',
      '同为金属为何汞熔点低而钨极高？',
      '如何比较 NaCl 与 MgO 的熔点？',
    ],
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
          <span class="crystal-drawer-item-title">${exp.num} ${exp.title}</span>
          <span class="crystal-drawer-item-sub">${exp.sub}</span>
        </button>
      `).join('')}
    </div>
  `;
}

export function mountPropertiesView(stageEl, shell = {}) {
  const {
    drawerBodyEl,
    topbarInfoEl,
    topbarActionsEl,
    actionbarEl,
    setInspectorContext,
  } = shell;

  let activeId = null;
  let activeExp = null;
  let statusEl = null;
  let paused = false;
  let destroyed = false;

  stageEl.innerHTML = '';
  if (topbarActionsEl) topbarActionsEl.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'crystal-open-stage';
  root.style.cssText = 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;background:var(--stage-3d-bg);overflow:hidden;';

  const canvasHost = document.createElement('div');
  canvasHost.className = 'crystal-stage-canvas';
  canvasHost.dataset.role = 'stage';
  canvasHost.style.cssText = 'position:relative;flex:1 1 0;min-height:0;width:100%;background:var(--stage-3d-bg);';
  root.appendChild(canvasHost);
  stageEl.appendChild(root);

  let controlsHost = actionbarEl;
  if (!controlsHost) {
    controlsHost = document.createElement('div');
    controlsHost.style.cssText = 'flex:0 0 auto;padding:8px 14px;border-top:1px solid var(--border);background:var(--surface,var(--card-elevated));';
    root.appendChild(controlsHost);
  }

  let navHost = drawerBodyEl;
  if (!navHost) {
    navHost = document.createElement('div');
    navHost.className = 'crystal-fallback-nav';
    root.insertBefore(navHost, canvasHost);
  }
  navHost.innerHTML = buildNavHtml(EXPERIMENTS[0].id);

  function renderTopbarInfo(exp) {
    if (!topbarInfoEl) return;
    topbarInfoEl.innerHTML = `
      <strong class="crystal-topbar-title">${exp.num} ${exp.title}</strong>
      <span class="crystal-tag">${exp.badge}</span>
      <span class="crystal-param-pill" data-role="status" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;" hidden></span>
    `;
    statusEl = topbarInfoEl.querySelector('[data-role="status"]');
  }

  function setCaption(text) {
    if (!statusEl) return;
    const clean = (text || '').trim();
    statusEl.textContent = clean;
    statusEl.hidden = !clean;
  }

  function selectExperiment(id) {
    const exp = EXPERIMENTS.find((e) => e.id === id) || EXPERIMENTS[0];
    if (activeId === exp.id && activeExp) return;
    if (activeExp) {
      activeExp.destroy?.();
      activeExp = null;
    }

    canvasHost.innerHTML = '';
    controlsHost.innerHTML = '';
    if (topbarActionsEl) topbarActionsEl.innerHTML = '';
    activeId = exp.id;

    navHost.querySelectorAll('[data-exp-id]').forEach((b) => {
      const on = b.dataset.expId === activeId;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    renderTopbarInfo(exp);

    const row = document.createElement('div');
    row.className = 'crystal-actionbar-row';
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0.45rem;width:100%;';
    controlsHost.appendChild(row);

    setInspectorContext?.({
      title: `${exp.num} ${exp.title}`,
      formula: exp.formula,
      module: 'properties',
      summary: exp.summary,
      qa: { question: exp.question, answer: exp.answer },
      quickQuestions: exp.quickQuestions,
      onAiAction: null,
    });

    activeExp = exp.mount(canvasHost, row, setCaption);
    if (paused && activeExp?.pause) activeExp.pause();
  }

  const onNavClick = (e) => {
    const btn = e.target.closest('[data-exp-id]');
    if (!btn || btn.dataset.expId === activeId) return;
    selectExperiment(btn.dataset.expId);
  };
  navHost.addEventListener('click', onNavClick);

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
      if (topbarInfoEl) topbarInfoEl.innerHTML = '';
      if (topbarActionsEl) topbarActionsEl.innerHTML = '';
      if (actionbarEl) actionbarEl.innerHTML = '';
      stageEl.innerHTML = '';
    },
  };
}
