/**
 * 模块 01 · 认识晶体主视图外壳（全幅开放舞台 + 可折叠抽屉目录 + 悬浮信息/思考题/底部控台）
 * 导出 mountBasicsView(stageEl, { drawerBodyEl } = {}) -> { pause(), resume(), resize(), destroy() }
 */

import { mountCompareDemo, mountSelfFormDemo } from './basics/demo-compare.js';
import { mountMeltingDemo, mountAnisotropyDemo, mountXrdDemo } from './basics/demo-physics.js';
import { mountUnitCellDemo } from './basics/demo-unitcell.js';

const DEMOS = [
  {
    id: 'compare',
    num: '01',
    title: '晶体 vs 非晶体',
    sub: '水晶六棱柱 vs 石英玻璃 · Si–O 微观网',
    tag: '本质区别',
    color: '#0284c7',
    question: '天然水晶与石英玻璃的化学成分都是 SiO₂，为什么一个呈规则六棱柱、另一个却没有固定外形？',
    answer:
      '本质原因在于内部微粒排布不同：水晶（晶体）内部 Si、O 原子在三维空间呈周期性长程有序排列；石英玻璃（非晶体）仅短程有序、长程无序。',
    mount: mountCompareDemo,
  },
  {
    id: 'selfform',
    num: '02',
    title: '晶体的自范性',
    sub: 'NaCl 结晶生长 · 敲角 · 溶液自修复',
    tag: '宏观特征',
    color: '#16a34a',
    question: '把玻璃打磨成规则正方体，它就变成晶体了吗？把缺角的 NaCl 放入饱和食盐水中会发生什么？',
    answer:
      '打磨的玻璃不是晶体，因为外形不是“自发”形成的；缺角 NaCl 放入饱和食盐水中会通过溶解-结晶平衡优先补齐高能断口台阶，自修复回规则立方体（呈现自范性需要适当的生长速率和空间）。',
    mount: mountSelfFormDemo,
  },
  {
    id: 'melting',
    num: '03',
    title: '固定熔点',
    sub: '海波 vs 石蜡同步加热 · T-t 平台',
    tag: '热学性质',
    color: '#d97706',
    question: '海波在 48°C 熔化平台期内仍在持续吸收酒精灯的热量，为什么温度计示数却不再升高？',
    answer:
      '晶体内部作用力均匀，达到熔点时吸收的热量全部用于克服微粒间作用力、破坏规则晶格（转化为内能中的势能），粒子平均动能不变，因此温度保持恒定直至完全熔化。',
    mount: mountMeltingDemo,
  },
  {
    id: 'anisotropy',
    num: '04',
    title: '各向异性',
    sub: '云母片椭圆熔斑 vs 玻璃片正圆熔斑',
    tag: '方向差异',
    color: '#7c3aed',
    question: '同样涂有石蜡，为什么烫针加热后云母片上熔出椭圆、玻璃片上却熔出正圆？多晶体也有各向异性吗？',
    answer:
      '云母单晶内部沿不同晶向微粒间距不同，导致传热速率不同，故熔斑呈椭圆；玻璃内部长程无序，各方向统计性质相同，熔斑呈正圆。多晶体因晶粒取向杂乱，宏观上表现为各向同性。',
    mount: mountAnisotropyDemo,
  },
  {
    id: 'xrd',
    num: '05',
    title: 'X 射线衍射',
    sub: '锐利衍射斑点 / 尖峰 vs 弥散晕环',
    tag: '最可靠鉴别',
    color: '#e11d48',
    question: '有时单看外观或硬度容易误判晶体与非晶体，实验室里最可靠的鉴别依据是什么？',
    answer:
      '进行 X 射线衍射实验：晶体内部存在周期性晶面，满足布拉格方程 2d sinθ = nλ，会产生分立锐利的衍射斑点与尖锐衍射峰；非晶体只会出现弥散宽化的晕环。',
    mount: mountXrdDemo,
  },
  {
    id: 'unitcell',
    num: '06',
    title: '从晶体到晶胞',
    sub: '3D 金属铜 FCC · 提取晶胞 · 无隙并置',
    tag: '3D 过渡',
    color: '#ea580c',
    question: '为什么说整块晶体是晶胞“无隙并置”而不是随意旋转拼在一起？每个顶点原子只属于这一个晶胞吗？',
    answer:
      '“无隙”指相邻晶胞间没有空隙，“并置”指所有晶胞取向完全相同、仅通过平移重复排列。正因相邻晶胞共享界面，立方晶胞的顶点原子被 8 个晶胞共用（贡献 1/8），面心原子被 2 个晶胞共用（贡献 1/2）。',
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
          <span class="crystal-drawer-item-title">${d.num} · ${d.title}</span>
          <span class="crystal-drawer-item-sub">${d.sub}</span>
        </button>
      `).join('')}
    </div>
  `;
}

export function mountBasicsView(stageEl, { drawerBodyEl } = {}) {
  stageEl.innerHTML = '';

  const root = document.createElement('div');
  root.className = 'crystal-open-stage';
  root.style.cssText = 'position:relative;width:100%;height:100%;background:var(--stage-3d-bg);overflow:hidden;';
  root.innerHTML = `
    <div class="crystal-stage-canvas" data-el="canvas-host" style="position:absolute;inset:0;width:100%;height:100%;background:var(--stage-3d-bg);"></div>
    <div class="crystal-float-info" data-el="info">
      <div class="crystal-float-head">
        <strong class="crystal-float-title" data-el="title"></strong>
        <span class="crystal-tag" data-el="tag"></span>
      </div>
      <div class="crystal-float-caption" data-el="caption"></div>
      <div class="crystal-float-legend" data-el="legend"></div>
    </div>
    <div class="crystal-float-actions">
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="qa-toggle" aria-expanded="false">
        思考题 💡
      </button>
    </div>
    <div class="crystal-qa-popover" data-el="qa-popover" hidden>
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">课堂思考题</h4>
        <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="qa-close" aria-label="关闭思考题">✕</button>
      </div>
      <p class="crystal-qa-question" data-el="qa-q"></p>
      <div class="crystal-qa-answer-box is-covered" data-el="qa-box">
        <p class="crystal-qa-answer" data-el="qa-a"></p>
        <div class="crystal-qa-cover" data-el="qa-cover">
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
    <div class="crystal-dock" data-el="dock"></div>
  `;
  stageEl.appendChild(root);

  let navHost = drawerBodyEl;
  let fallbackNav = null;
  if (!navHost) {
    fallbackNav = document.createElement('div');
    fallbackNav.className = 'crystal-fallback-nav';
    fallbackNav.style.cssText = 'position:absolute;top:0.5rem;left:50%;transform:translateX(-50%);z-index:8;max-width:92%;overflow-x:auto;';
    root.appendChild(fallbackNav);
    navHost = fallbackNav;
  }
  navHost.innerHTML = buildNavHtml(DEMOS[0].id);

  const canvasHost = root.querySelector('[data-el="canvas-host"]');
  const titleEl = root.querySelector('[data-el="title"]');
  const tagEl = root.querySelector('[data-el="tag"]');
  const captionEl = root.querySelector('[data-el="caption"]');
  const legendEl = root.querySelector('[data-el="legend"]');
  const dockEl = root.querySelector('[data-el="dock"]');
  const qaPopoverEl = root.querySelector('[data-el="qa-popover"]');
  const qaQEl = root.querySelector('[data-el="qa-q"]');
  const qaAEl = root.querySelector('[data-el="qa-a"]');
  const qaBoxEl = root.querySelector('[data-el="qa-box"]');
  const qaCoverEl = root.querySelector('[data-el="qa-cover"]');
  const btnQaToggle = root.querySelector('[data-act="qa-toggle"]');
  const btnQaClose = root.querySelector('[data-act="qa-close"]');
  const btnReveal = root.querySelector('[data-act="qa-reveal"]');
  const btnHide = root.querySelector('[data-act="qa-hide"]');

  let activeDemo = null;
  let activeId = null;
  let isPaused = false;
  let destroyed = false;

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

  function setCaption(text) {
    captionEl.textContent = text || '';
  }

  function setLegend(items = []) {
    legendEl.innerHTML = items
      .map((it) => `<span class="crystal-legend-chip"><span class="crystal-swatch-dot" style="background:${it.color};"></span>${it.label}</span>`)
      .join('');
    legendEl.hidden = !items.length;
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
    dockEl.innerHTML = '';
    activeId = def.id;

    navHost.querySelectorAll('[data-demo]').forEach((b) => {
      const on = b.dataset.demo === activeId;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    titleEl.textContent = `${def.num} · ${def.title}`;
    tagEl.textContent = def.tag;
    qaQEl.textContent = def.question;
    qaAEl.textContent = def.answer;
    setQaOpen(false);
    setQaRevealed(false);

    activeDemo = def.mount({ stageEl: canvasHost, controlsEl: dockEl, setCaption, setLegend });
    if (isPaused) activeDemo?.pause?.();
  }

  const onNavClick = (e) => {
    const btn = e.target.closest('[data-demo]');
    if (!btn) return;
    selectDemo(btn.dataset.demo);
  };
  navHost.addEventListener('click', onNavClick);
  btnQaToggle.addEventListener('click', () => setQaOpen(qaPopoverEl.hidden));
  btnQaClose.addEventListener('click', () => setQaOpen(false));
  btnReveal.addEventListener('click', () => setQaRevealed(true));
  btnHide.addEventListener('click', () => setQaRevealed(false));

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
      stageEl.innerHTML = '';
    },
  };
}
