/**
 * 模块 01 · 认识晶体主视图外壳（零遮挡三行布局：左侧抽屉目录 + 顶栏状态 + 全幅开放舞台 + 底部操作栏）
 * 导出 mountBasicsView(stageEl, shell = {}) -> { pause(), resume(), resize(), destroy() }
 */

import { mountCompareDemo, mountSelfFormDemo } from './basics/demo-compare.js';
import { mountMeltingDemo, mountAnisotropyDemo, mountXrdDemo } from './basics/demo-physics.js';
import { mountUnitCellDemo } from './basics/demo-unitcell.js';

const DEMOS = [
  {
    id: 'compare',
    num: '01',
    title: '晶体 vs 非晶体',
    formula: 'SiO₂',
    sub: '水晶与石英玻璃',
    tag: '本质区别',
    summary: '天然水晶与石英玻璃成分均为 SiO₂，本质区别在于内部微粒是否呈周期性长程有序排列。',
    question: '天然水晶与石英玻璃的化学成分都是 SiO₂，为什么一个呈规则六棱柱、另一个却没有固定外形？',
    answer:
      '本质原因在于内部微粒排布不同：水晶（晶体）内部 Si、O 原子在三维空间呈周期性长程有序排列；石英玻璃（非晶体）仅短程有序、长程无序。',
    quickQuestions: [
      '水晶和石英玻璃成分相同为何外形不同？',
      '什么是长程有序与短程有序？',
      '非晶体在什么条件下能转化为晶体？',
    ],
    mount: mountCompareDemo,
  },
  {
    id: 'selfform',
    num: '02',
    title: '晶体的自范性',
    formula: 'NaCl',
    sub: 'NaCl 生长修复',
    tag: '宏观特征',
    summary: '晶体在适宜条件下能自发呈现封闭规则多面体外形，缺角在饱和溶液中可优先自修复。',
    question: '把玻璃打磨成规则正方体，它就变成晶体了吗？把缺角的 NaCl 放入饱和食盐水中会发生什么？',
    answer:
      '打磨的玻璃不是晶体，因为外形不是“自发”形成的；缺角 NaCl 放入饱和食盐水中会通过溶解-结晶平衡优先补齐高能断口台阶，自修复回规则立方体（呈现自范性需要适当的生长速率和空间）。',
    quickQuestions: [
      '打磨成正方体的玻璃是晶体吗？',
      '缺角食盐晶体为何优先补齐缺口？',
      '呈现自范性需要满足哪些条件？',
    ],
    mount: mountSelfFormDemo,
  },
  {
    id: 'melting',
    num: '03',
    title: '固定熔点',
    formula: 'Na₂S₂O₃·5H₂O',
    sub: '海波 vs 石蜡',
    tag: '热学性质',
    summary: '晶体在熔点处存在恒温吸热熔化平台；非晶体加热时逐渐软化，无固定熔点。',
    question: '海波在 48°C 熔化平台期内仍在持续吸收酒精灯的热量，为什么温度计示数却不再升高？',
    answer:
      '晶体内部作用力均匀，达到熔点时吸收的热量全部用于克服微粒间作用力、破坏规则晶格（转化为内能中的势能），粒子平均动能不变，因此温度保持恒定直至完全熔化。',
    quickQuestions: [
      '海波 48°C 吸热为何温度不变？',
      '为什么非晶体没有固定熔点？',
      '熔化平台期吸收的热量去了哪里？',
    ],
    mount: mountMeltingDemo,
  },
  {
    id: 'anisotropy',
    num: '04',
    title: '各向异性',
    formula: '云母 / 玻璃',
    sub: '云母与玻璃导热',
    tag: '方向差异',
    summary: '单晶沿不同晶向微粒间距不同，导热等物理性质呈各向异性；玻璃与多晶体宏观各向同性。',
    question: '同样涂有石蜡，为什么烫针加热后云母片上熔出椭圆、玻璃片上却熔出正圆？多晶体也有各向异性吗？',
    answer:
      '云母单晶内部沿不同晶向微粒间距不同，导致传热速率不同，故熔斑呈椭圆；玻璃内部长程无序，各方向统计性质相同，熔斑呈正圆。多晶体因晶粒取向杂乱，宏观上表现为各向同性。',
    quickQuestions: [
      '为什么云母导热熔斑呈椭圆？',
      '多晶体为什么表现为各向同性？',
      '晶体还有哪些常见各向异性？',
    ],
    mount: mountAnisotropyDemo,
  },
  {
    id: 'xrd',
    num: '05',
    title: 'X 射线衍射',
    formula: '2d sinθ = nλ',
    sub: '斑点与晕环鉴别',
    tag: '最可靠鉴别',
    summary: 'X 射线衍射是区分晶体与非晶体最可靠的科学方法：晶体产生锐利斑点与尖峰，非晶体仅呈弥散晕环。',
    question: '有时单看外观或硬度容易误判晶体与非晶体，实验室里最可靠的鉴别依据是什么？',
    answer:
      '进行 X 射线衍射实验：晶体内部存在周期性晶面，满足布拉格方程 2d sinθ = nλ，会产生分立锐利的衍射斑点与尖锐衍射峰；非晶体只会出现弥散宽化的晕环。',
    quickQuestions: [
      '如何用 X 射线衍射区分晶体与非晶体？',
      '布拉格方程 2d sinθ = nλ 各量含义？',
      '为何外观不能作为鉴别晶体的唯一依据？',
    ],
    mount: mountXrdDemo,
  },
  {
    id: 'unitcell',
    num: '06',
    title: '从晶体到晶胞',
    formula: 'Cu (FCC)',
    sub: '铜 FCC 3D 拼装',
    tag: '3D 过渡',
    summary: '晶胞是描述晶体结构的基本单元，整块晶体由晶胞沿三维坐标轴无隙并置平移而成。',
    question: '为什么说整块晶体是晶胞“无隙并置”而不是随意旋转拼在一起？每个顶点原子只属于这一个晶胞吗？',
    answer:
      '“无隙”指相邻晶胞间没有空隙，“并置”指所有晶胞取向完全相同、仅通过平移重复排列。正因相邻晶胞共享界面，立方晶胞的顶点原子被 8 个晶胞共用（贡献 1/8），面心原子被 2 个晶胞共用（贡献 1/2）。',
    quickQuestions: [
      '为什么晶胞拼接强调“无隙并置”？',
      'FCC 晶胞顶点和面心原子各贡献多少？',
      '如何用均摊法算出铜晶胞含 4 个原子？',
    ],
    mount: mountUnitCellDemo,
  },
];

function buildNavHtml(activeId) {
  return `
    <div class="crystal-drawer-list" role="tablist" aria-label="认识晶体演示目录" aria-orientation="vertical">
      ${DEMOS.map((d) => `
        <button
          type="button"
          class="crystal-drawer-item${d.id === activeId ? ' is-active' : ''}"
          data-demo="${d.id}"
          role="tab"
          aria-selected="${d.id === activeId ? 'true' : 'false'}"
        >
          <span class="crystal-drawer-item-title">${d.num} ${d.title}</span>
          <span class="crystal-drawer-item-sub">${d.sub}</span>
        </button>
      `).join('')}
    </div>
  `;
}

export function mountBasicsView(stageEl, shell = {}) {
  const {
    drawerBodyEl,
    topbarInfoEl,
    topbarActionsEl,
    actionbarEl,
    setInspectorContext,
  } = shell;

  stageEl.innerHTML = '';
  if (topbarActionsEl) topbarActionsEl.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'crystal-open-stage';
  root.style.cssText = 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;background:var(--stage-3d-bg);overflow:hidden;';

  const canvasHost = document.createElement('div');
  canvasHost.className = 'crystal-stage-canvas';
  canvasHost.dataset.el = 'canvas-host';
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
  navHost.innerHTML = buildNavHtml(DEMOS[0].id);

  let statusEl = null;
  let activeDemo = null;
  let activeId = null;
  let isPaused = false;
  let destroyed = false;

  function renderTopbarInfo(def) {
    if (!topbarInfoEl) return;
    topbarInfoEl.innerHTML = `
      <strong class="crystal-topbar-title">${def.num} ${def.title}</strong>
      <span class="crystal-tag">${def.tag}</span>
      <span class="crystal-param-pill" data-el="status" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px;" hidden></span>
    `;
    statusEl = topbarInfoEl.querySelector('[data-el="status"]');
  }

  function setCaption(text) {
    if (!statusEl) return;
    const clean = (text || '').trim();
    statusEl.textContent = clean;
    statusEl.hidden = !clean;
  }

  function selectDemo(id) {
    const def = DEMOS.find((d) => d.id === id) || DEMOS[0];
    if (activeId === def.id && activeDemo) return;

    if (activeDemo) {
      try {
        activeDemo.destroy?.();
      } catch (err) {
        console.warn('[crystal-basics] destroy demo failed:', err);
      }
      activeDemo = null;
    }

    canvasHost.innerHTML = '';
    controlsHost.innerHTML = '';
    if (topbarActionsEl) topbarActionsEl.innerHTML = '';
    activeId = def.id;

    navHost.querySelectorAll('[data-demo]').forEach((b) => {
      const on = b.dataset.demo === activeId;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    renderTopbarInfo(def);

    const row = document.createElement('div');
    row.className = 'crystal-actionbar-row';
    row.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:0.45rem;width:100%;';
    controlsHost.appendChild(row);

    setInspectorContext?.({
      title: `${def.num} ${def.title}`,
      formula: def.formula,
      module: 'basics',
      summary: def.summary,
      qa: { question: def.question, answer: def.answer },
      quickQuestions: def.quickQuestions,
      onAiAction: null,
    });

    activeDemo = def.mount({
      stageEl: canvasHost,
      controlsEl: row,
      setCaption,
      setLegend() {},
    });
    if (isPaused) activeDemo?.pause?.();
  }

  const onNavClick = (e) => {
    const btn = e.target.closest('[data-demo]');
    if (!btn) return;
    selectDemo(btn.dataset.demo);
  };
  navHost.addEventListener('click', onNavClick);

  selectDemo(DEMOS[0].id);

  return {
    pause() {
      isPaused = true;
      activeDemo?.pause?.();
    },
    resume() {
      if (destroyed) return;
      isPaused = false;
      activeDemo?.resume?.();
    },
    resize() {
      if (destroyed) return;
      activeDemo?.resize?.();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      isPaused = true;
      navHost.removeEventListener('click', onNavClick);
      if (activeDemo) {
        activeDemo.destroy?.();
        activeDemo = null;
      }
      if (drawerBodyEl) drawerBodyEl.innerHTML = '';
      if (topbarInfoEl) topbarInfoEl.innerHTML = '';
      if (topbarActionsEl) topbarActionsEl.innerHTML = '';
      if (actionbarEl) actionbarEl.innerHTML = '';
      stageEl.innerHTML = '';
    },
  };
}
