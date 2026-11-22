/**
 * 模块 01 · 认识晶体主视图外壳
 * 导出 mountBasicsView(containerEl) -> { pause(), resume(), resize(), destroy() }
 */

import { mountCompareDemo, mountSelfFormDemo } from './basics/demo-compare.js';
import { mountMeltingDemo, mountAnisotropyDemo, mountXrdDemo } from './basics/demo-physics.js';
import { mountUnitCellDemo } from './basics/demo-unitcell.js';

const DEMOS = [
  {
    id: 'compare',
    num: '01',
    title: '晶体 vs 非晶体',
    sub: '水晶 3D 棱柱 vs 石英玻璃 · Si–O 微观网',
    tag: '本质区别',
    color: '#38bdf8',
    summary: '晶体与非晶体的本质区别在于微观粒子在三维空间里是否呈周期性有序排列。',
    question: '天然水晶与石英玻璃的化学成分都是 SiO₂，为什么一个呈规则六棱柱、另一个却没有固定外形？',
    answer:
      '本质原因在于内部微粒排布不同：水晶（晶体）内部 Si、O 原子在三维空间呈周期性长程有序排列；石英玻璃（非晶体）仅短程有序、长程无序。',
    mount: mountCompareDemo,
  },
  {
    id: 'selfform',
    num: '02',
    title: '晶体的自范性',
    sub: 'NaCl 结晶生长 · 敲掉一角 · 溶液自修复',
    tag: '宏观特征',
    color: '#34d399',
    summary: '在适宜条件下，晶体能够自发地呈现封闭的、规则的多面体外形，称为晶体的自范性。',
    question: '把玻璃打磨成规则正方体，它就变成晶体了吗？把缺角的 NaCl 放入饱和食盐水中会发生什么？',
    answer:
      '打磨的玻璃不是晶体，因为外形不是“自发”形成的；缺角 NaCl 放入饱和食盐水中会通过溶解-结晶平衡优先补齐高能断口台阶，自修复回规则立方体（注意：呈现自范性需要适当的生长速率和空间）。',
    mount: mountSelfFormDemo,
  },
  {
    id: 'melting',
    num: '03',
    title: '固定熔点',
    sub: '海波 vs 石蜡同步加热 · T-t 熔化平台',
    tag: '热学性质',
    color: '#fb923c',
    summary: '晶体在熔化过程中不断吸热但温度保持恒定（出现水平平台）；非晶体受热先软化后熔化，无固定熔点。',
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
    color: '#a78bfa',
    summary: '单晶体在不同方向上的微粒排布密度与作用力不同，因而在导热、导电、折光等物理性质上表现各向异性。',
    question: '同样涂有石蜡，为什么烫针加热后云母片上熔出椭圆、玻璃片上却熔出正圆？多晶体也有各向异性吗？',
    answer:
      '云母单晶内部沿不同晶向微粒间距不同，导致传热速率不同，故熔斑呈椭圆；玻璃内部长程无序，各方向统计性质相同，熔斑呈正圆。多晶体因晶粒取向杂乱，宏观上表现为各向同性。',
    mount: mountAnisotropyDemo,
  },
  {
    id: 'xrd',
    num: '05',
    title: 'X 射线衍射',
    sub: '锐利衍射斑点 / 尖峰 vs 弥散宽化晕环',
    tag: '最可靠鉴别',
    color: '#f43f5e',
    summary: '区分晶体与非晶体最可靠的科学方法是对固体进行 X 射线衍射实验。',
    question: '有时单看外观或硬度容易误判晶体与非晶体，实验室里最可靠的鉴别依据是什么？',
    answer:
      '进行 X 射线衍射实验：晶体内部存在周期性晶面，满足布拉格方程 2d sinθ = nλ，会产生分立锐利的衍射斑点与尖锐衍射峰；非晶体只会出现弥散宽化的晕环。',
    mount: mountXrdDemo,
  },
  {
    id: 'unitcell',
    num: '06',
    title: '从晶体到晶胞',
    sub: '3D 金属铜 FCC · 提取单晶胞 · 无隙并置',
    tag: '3D 过渡',
    color: '#f59e0b',
    summary: '晶胞是描述晶体结构的基本单元，整块晶体可看作无数晶胞沿三维方向无隙并置而成。',
    question: '为什么说整块晶体是晶胞“无隙并置”而不是随意旋转拼在一起？每个顶点原子只属于这一个晶胞吗？',
    answer:
      '“无隙”指相邻晶胞间没有空隙，“并置”指所有晶胞取向完全相同、仅通过平移重复排列。正因相邻晶胞共享界面，立方晶胞的顶点原子被 8 个晶胞共用（贡献 1/8），面心原子被 2 个晶胞共用（贡献 1/2）。',
    mount: mountUnitCellDemo,
  },
];

export function mountBasicsView(containerEl) {
  containerEl.innerHTML = '';

  const workbench = document.createElement('div');
  workbench.className = 'crystal-workbench';
  workbench.innerHTML = `
    <aside class="crystal-lib-sidebar" aria-label="认识晶体演示目录">
      <div class="crystal-card-head" style="padding:0.72rem 0.85rem;border-bottom:1px solid var(--border,#e2e8f0);">
        <h3 class="crystal-card-title">01 认识晶体 · 6 个互动实验</h3>
      </div>
      <div class="crystal-list" role="tablist" aria-orientation="vertical">
        ${DEMOS.map(
          (d, i) => `
          <button
            type="button"
            class="crystal-list-item${i === 0 ? ' is-active' : ''}"
            data-demo="${d.id}"
            role="tab"
            aria-selected="${i === 0 ? 'true' : 'false'}"
          >
            <div class="crystal-list-top">
              <span class="crystal-list-formula">${d.num} · ${d.title}</span>
              <span class="crystal-swatch-dot" style="background:${d.color};"></span>
            </div>
            <div class="crystal-list-sub">${d.sub}</div>
          </button>
        `,
        ).join('')}
      </div>
    </aside>

    <section class="crystal-stage-wrap" aria-label="互动演示舞台">
      <div class="crystal-legend" data-el="legend"></div>
      <div class="crystal-stage-canvas" data-el="stage"></div>
      <div class="crystal-stage-caption" data-el="caption"></div>
    </section>

    <aside class="crystal-inspector" aria-label="控制与课堂思考题">
      <div class="crystal-card">
        <div class="crystal-header-top">
          <div>
            <h3 class="crystal-header-formula" data-el="title" style="font-size:1.18rem;"></h3>
            <p class="crystal-header-name" data-el="summary"></p>
          </div>
          <span class="crystal-tag" data-el="tag"></span>
        </div>
      </div>

      <div class="crystal-card">
        <div class="crystal-card-head">
          <h4 class="crystal-card-title">课堂互动操作</h4>
          <span class="crystal-sys-badge">实时演示</span>
        </div>
        <div data-el="controls" style="display:flex;flex-direction:column;gap:0.55rem;"></div>
      </div>

      <div class="crystal-card">
        <div class="crystal-card-head">
          <h4 class="crystal-card-title">思考题 · 点击揭晓结论</h4>
          <span class="crystal-tag crystal-tag-qa">随堂问答</span>
        </div>
        <p class="crystal-qa-question" data-el="qa-q"></p>
        <div class="crystal-qa-answer-box is-covered" data-el="qa-box">
          <p class="crystal-qa-answer" data-el="qa-a"></p>
          <div class="crystal-qa-cover" data-el="qa-cover">
            <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="reveal">
              思考题 · 点击揭晓结论
            </button>
          </div>
        </div>
        <div class="crystal-qa-foot">
          <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="toggle-qa" hidden>
            重新遮挡结论
          </button>
        </div>
      </div>
    </aside>
  `;
  containerEl.appendChild(workbench);

  const navBtns = workbench.querySelectorAll('[data-demo]');
  const legendEl = workbench.querySelector('[data-el="legend"]');
  const stageEl = workbench.querySelector('[data-el="stage"]');
  const captionEl = workbench.querySelector('[data-el="caption"]');
  const titleEl = workbench.querySelector('[data-el="title"]');
  const summaryEl = workbench.querySelector('[data-el="summary"]');
  const tagEl = workbench.querySelector('[data-el="tag"]');
  const controlsEl = workbench.querySelector('[data-el="controls"]');
  const qaQEl = workbench.querySelector('[data-el="qa-q"]');
  const qaAEl = workbench.querySelector('[data-el="qa-a"]');
  const qaBoxEl = workbench.querySelector('[data-el="qa-box"]');
  const qaCoverEl = workbench.querySelector('[data-el="qa-cover"]');
  const btnReveal = workbench.querySelector('[data-act="reveal"]');
  const btnToggleQa = workbench.querySelector('[data-act="toggle-qa"]');

  let activeDemo = null;
  let activeId = null;
  let isPaused = false;
  let qaRevealed = false;

  function setQaState(revealed) {
    qaRevealed = revealed;
    qaBoxEl.classList.toggle('is-covered', !revealed);
    qaCoverEl.hidden = revealed;
    btnToggleQa.hidden = !revealed;
  }

  function setCaption(text) {
    captionEl.textContent = text || '';
  }

  function setLegend(items = []) {
    legendEl.innerHTML = items
      .map(
        (it) => `
        <span class="crystal-legend-pill">
          <span class="crystal-swatch-dot" style="background:${it.color};"></span>
          <span>${it.label}</span>
        </span>
      `,
      )
      .join('');
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

    stageEl.innerHTML = '';
    controlsEl.innerHTML = '';
    activeId = def.id;

    navBtns.forEach((b) => {
      const on = b.dataset.demo === activeId;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    titleEl.textContent = `${def.num} ${def.title}`;
    summaryEl.textContent = def.summary;
    tagEl.textContent = def.tag;
    qaQEl.textContent = def.question;
    qaAEl.textContent = def.answer;
    setQaState(false);

    activeDemo = def.mount({ stageEl, controlsEl, setCaption, setLegend });
    if (isPaused) {
      activeDemo?.pause?.();
    }
  }

  navBtns.forEach((b) => b.addEventListener('click', () => selectDemo(b.dataset.demo)));
  btnReveal.addEventListener('click', () => setQaState(true));
  btnToggleQa.addEventListener('click', () => setQaState(false));

  selectDemo(DEMOS[0].id);

  return {
    pause() {
      isPaused = true;
      activeDemo?.pause?.();
    },
    resume() {
      isPaused = false;
      activeDemo?.resume?.();
    },
    resize() {
      activeDemo?.resize?.();
    },
    destroy() {
      isPaused = true;
      if (activeDemo) {
        activeDemo.destroy?.();
        activeDemo = null;
      }
      containerEl.innerHTML = '';
    },
  };
}
