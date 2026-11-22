/**
 * 模块 02：晶体结构库（3D 晶胞交互工作台）
 * 左侧：5 类晶体筛选 + 晶胞目录
 * 中间：全高暗棚 3D 交互画布 + 图例 + 底部状态字幕 + 3D 投影徽章
 * 右侧：晶胞参数、球棍/填充切换、真·切开数原子（均摊法）、渐进拼晶胞、高考考点工具、默认遮挡思考题
 */

import { CRYSTAL_CATEGORIES, CRYSTALS, getCrystalById } from '../data/crystals.js';
import { computeAveragingBreakdown, computeDensity } from '../math/lattice.js';
import { createCrystalViewer } from '../scene/crystal-viewer.js';
import { formulaHtml } from '../../chem/formula-html.js';

const SYSTEM_LABELS = {
  cubic: '立方晶系',
  tetragonal: '四方晶系',
  orthorhombic: '正交晶系',
  hexagonal: '六方晶系',
};

const SHORT_CATEGORY_LABELS = {
  metallic: '金属',
  ionic: '离子',
  covalent: '共价',
  molecular: '分子',
  mixed: '混合',
};

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colorIntToCss(c) {
  if (typeof c === 'string') return c;
  if (typeof c === 'number' && Number.isFinite(c)) {
    return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
  }
  return '#94a3b8';
}

function formatNum(n, digits = 1) {
  if (!Number.isFinite(n)) return '—';
  const rounded = Number(n.toFixed(digits));
  return String(rounded);
}

/**
 * 将 computeAveragingBreakdown 单元素统计渲染为直观算式，例如 `8×1/8 + 6×1/2 = 4`
 */
function buildSpeciesEquation(stat) {
  if (!stat) return '—';
  const parts = [];
  if (stat.vertex > 0) parts.push(`${stat.vertex}×1/8`);
  if (stat.edge > 0) parts.push(`${stat.edge}×1/4`);
  if (stat.face > 0) parts.push(`${stat.face}×1/2`);
  if (stat.interior > 0) parts.push(`${stat.interior}×1`);
  const totalStr = formatNum(stat.total, 2);
  if (!parts.length) return `= ${totalStr}`;
  return `${parts.join(' + ')} = ${totalStr}`;
}

/**
 * 挂载模块 02：晶体结构库
 * @param {HTMLElement} containerEl
 * @returns {{ pause: () => void, resume: () => void, resize: () => void, destroy: () => void }}
 */
export function mountLibraryView(containerEl) {
  if (!containerEl) {
    return { pause() {}, resume() {}, resize() {}, destroy() {} };
  }

  const defaultCrystal = getCrystalById('nacl') || CRYSTALS[0];
  let activeCategory = defaultCrystal?.category || CRYSTAL_CATEGORIES[0]?.id || 'ionic';
  let currentCrystal = defaultCrystal;
  let displayMode = 'ball-stick'; // 'ball-stick' | 'space-filling'
  let sliced = false;
  let exploded = false;
  let tileCount = 1;
  let examTab = 'none'; // 'none' | 'coordination' | 'distance' | 'density'
  let autoRotate = false;
  let qaRevealed = false;

  // 构建 3 栏工作台骨架
  containerEl.innerHTML = '';
  const workbench = document.createElement('div');
  workbench.className = 'crystal-workbench crystal-library-workbench';
  workbench.innerHTML = `
    <aside class="crystal-lib-sidebar" aria-label="晶体结构分类与目录">
      <div class="crystal-cat-tabs" role="tablist" aria-label="晶体类型"></div>
      <div class="crystal-list" role="listbox" aria-label="晶体列表"></div>
    </aside>

    <div class="crystal-stage-wrap">
      <div class="crystal-stage-canvas"></div>
      <div class="crystal-legend" aria-label="原子图例"></div>
      <div class="crystal-stage-tools" aria-label="视角控制">
        <button type="button" class="crystal-stage-btn" data-act="autorotate" aria-pressed="false" title="自动慢转">慢转</button>
        <button type="button" class="crystal-stage-btn" data-act="reset" title="复位视角">复位</button>
      </div>
      <div class="crystal-stage-caption" aria-live="polite"></div>
    </div>

    <aside class="crystal-inspector" aria-label="晶胞参数与教学工具">
      <section class="crystal-card crystal-header-card"></section>

      <section class="crystal-card crystal-mode-card">
        <h4 class="crystal-card-title">显示模型</h4>
        <div class="crystal-seg" role="group" aria-label="显示模型切换">
          <button type="button" class="crystal-seg-btn is-active" data-mode="ball-stick">球棍模型</button>
          <button type="button" class="crystal-seg-btn" data-mode="space-filling">填充模型</button>
        </div>
      </section>

      <section class="crystal-card crystal-slice-card">
        <div class="crystal-card-head">
          <h4 class="crystal-card-title">均摊法 · 切开数原子</h4>
          <span class="crystal-tag">真·裁剪</span>
        </div>
        <div class="crystal-slice-actions"></div>
        <div class="crystal-avg-breakdown"></div>
      </section>

      <section class="crystal-card crystal-tile-card">
        <div class="crystal-card-head">
          <h4 class="crystal-card-title">无隙并置 · 拼晶胞</h4>
          <span class="crystal-tile-count">1 / 8 晶胞</span>
        </div>
        <div class="crystal-tile-actions">
          <button type="button" class="crystal-btn crystal-btn-primary" data-tile="add">+ 再拼一个</button>
          <button type="button" class="crystal-btn crystal-btn-ghost" data-tile="sub" disabled>- 拆一个</button>
          <button type="button" class="crystal-btn crystal-btn-ghost" data-tile="reset" disabled>单晶胞</button>
        </div>
        <div class="crystal-hex-banner" hidden></div>
      </section>

      <section class="crystal-card crystal-exam-card">
        <h4 class="crystal-card-title">高考考点工具</h4>
        <div class="crystal-exam-tabs" role="tablist" aria-label="高考考点工具">
          <button type="button" class="crystal-exam-tab" data-exam="coordination" role="tab" aria-selected="false">配位数</button>
          <button type="button" class="crystal-exam-tab" data-exam="distance" role="tab" aria-selected="false">最短距离</button>
          <button type="button" class="crystal-exam-tab" data-exam="density" role="tab" aria-selected="false">晶胞密度</button>
        </div>
        <div class="crystal-exam-body"></div>
      </section>

      <section class="crystal-card crystal-qa-card"></section>
    </aside>
  `;
  containerEl.appendChild(workbench);

  const catTabsEl = workbench.querySelector('.crystal-cat-tabs');
  const listEl = workbench.querySelector('.crystal-list');
  const stageCanvasEl = workbench.querySelector('.crystal-stage-canvas');
  const legendEl = workbench.querySelector('.crystal-legend');
  const captionEl = workbench.querySelector('.crystal-stage-caption');
  const headerCardEl = workbench.querySelector('.crystal-header-card');
  const modeBtns = workbench.querySelectorAll('.crystal-seg-btn[data-mode]');
  const sliceActionsEl = workbench.querySelector('.crystal-slice-actions');
  const avgBreakdownEl = workbench.querySelector('.crystal-avg-breakdown');
  const tileCountEl = workbench.querySelector('.crystal-tile-count');
  const btnTileAdd = workbench.querySelector('[data-tile="add"]');
  const btnTileSub = workbench.querySelector('[data-tile="sub"]');
  const btnTileReset = workbench.querySelector('[data-tile="reset"]');
  const hexBannerEl = workbench.querySelector('.crystal-hex-banner');
  const examTabBtns = workbench.querySelectorAll('.crystal-exam-tab');
  const examBodyEl = workbench.querySelector('.crystal-exam-body');
  const qaCardEl = workbench.querySelector('.crystal-qa-card');
  const btnAutoRotate = workbench.querySelector('[data-act="autorotate"]');
  const btnResetView = workbench.querySelector('[data-act="reset"]');

  // 初始化 3D 引擎
  const viewer = createCrystalViewer(stageCanvasEl);

  // ── 渲染分类 Tabs ──
  function renderCategoryTabs() {
    catTabsEl.innerHTML = '';
    for (const cat of CRYSTAL_CATEGORIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crystal-cat-tab' + (cat.id === activeCategory ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', cat.id === activeCategory ? 'true' : 'false');
      btn.dataset.category = cat.id;
      btn.textContent = SHORT_CATEGORY_LABELS[cat.id] || cat.label.replace(/晶体$/, '');
      btn.title = cat.label;
      btn.addEventListener('click', () => {
        if (activeCategory === cat.id) return;
        activeCategory = cat.id;
        renderCategoryTabs();
        renderCrystalList();
        const inCat = CRYSTALS.filter((c) => c.category === activeCategory);
        if (inCat.length && currentCrystal?.category !== activeCategory) {
          selectCrystal(inCat[0]);
        }
      });
      catTabsEl.appendChild(btn);
    }
  }

  // ── 渲染左侧晶体列表 ──
  function renderCrystalList() {
    listEl.innerHTML = '';
    const items = CRYSTALS.filter((c) => c.category === activeCategory);
    for (const c of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crystal-list-item' + (c.id === currentCrystal?.id ? ' is-active' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', c.id === currentCrystal?.id ? 'true' : 'false');

      const dotsHtml = (c.species || [])
        .map(
          (sp) =>
            `<i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}" title="${escapeHtml(sp.symbol)}"></i>`,
        )
        .join('');

      btn.innerHTML = `
        <div class="crystal-list-top">
          <span class="crystal-list-formula">${formulaHtml(c.formula)}</span>
          <span class="crystal-list-dots">${dotsHtml}</span>
        </div>
        <div class="crystal-list-name">${escapeHtml(c.name)}</div>
        ${c.subtitle ? `<div class="crystal-list-sub">${escapeHtml(c.subtitle)}</div>` : ''}
      `;
      btn.addEventListener('click', () => selectCrystal(c));
      listEl.appendChild(btn);
    }
  }

  // ── 渲染画布左上图例 ──
  function renderLegend() {
    if (!currentCrystal) {
      legendEl.innerHTML = '';
      return;
    }
    legendEl.innerHTML = (currentCrystal.species || [])
      .map(
        (sp) => `
          <span class="crystal-legend-pill">
            <i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}"></i>
            <span class="crystal-legend-sym">${formulaHtml(sp.symbol)}</span>
            <span class="crystal-legend-cnt">×${formatNum(sp.countPerCell, 2)}</span>
          </span>
        `,
      )
      .join('');
  }

  // ── 渲染画布底部状态字幕 ──
  function renderCaption() {
    if (!currentCrystal) {
      captionEl.textContent = '';
      return;
    }
    const modeLabel = displayMode === 'space-filling' ? '填充模型' : '球棍模型';
    let text = `${currentCrystal.name}（${currentCrystal.formula}）的晶胞 · ${modeLabel}`;

    if (sliced && exploded) {
      text = `数一数：一个 ${currentCrystal.formula} 晶胞里有几个粒子？（点击「拼回去」还原）`;
    } else if (sliced) {
      text = `已沿晶胞边界切开 · 仅保留属于本晶胞的实心部分`;
    } else if (tileCount > 1) {
      text = `已拼好 ${tileCount} 个晶胞 · 无隙并置`;
      if (currentCrystal.hexPrismHighlight && tileCount >= 3) {
        text += ' · 正六棱柱已显现！';
      }
    } else if (examTab === 'coordination' && currentCrystal.coordination) {
      text = `配位数标注：${currentCrystal.coordination.label || ''}（配位数 = ${currentCrystal.coordination.number}）`;
    } else if (examTab === 'distance' && currentCrystal.shortestDistance) {
      const sd = currentCrystal.shortestDistance;
      text = `最短距离标注：${sd.formula}${sd.valuePm ? ` ≈ ${sd.valuePm} pm` : ''}`;
    } else if (examTab === 'density' && currentCrystal.density) {
      const rho = computeDensity(
        currentCrystal.density.Z,
        currentCrystal.density.molarMass,
        currentCrystal.lattice,
      );
      const val = Number.isFinite(rho) ? rho.toFixed(2) : currentCrystal.density.valueGcm3;
      text = `${currentCrystal.formula} 晶胞理论密度 ρ ≈ ${val} g/cm³`;
    }

    captionEl.textContent = text;
  }

  // ── 渲染右侧晶胞头信息 ──
  function renderHeaderCard() {
    if (!currentCrystal) return;
    const lat = currentCrystal.lattice || {};
    const sysLabel = SYSTEM_LABELS[currentCrystal.system] || currentCrystal.system || '';
    const anglePill =
      currentCrystal.system === 'hexagonal' || lat.gamma === 120
        ? `<span class="crystal-param-pill">γ = ${lat.gamma || 120}°</span>`
        : `<span class="crystal-param-pill">α=β=γ=90°</span>`;

    headerCardEl.innerHTML = `
      <div class="crystal-header-top">
        <div>
          <h3 class="crystal-header-formula">${formulaHtml(currentCrystal.formula)}</h3>
          <p class="crystal-header-name">${escapeHtml(currentCrystal.name)}${currentCrystal.subtitle ? ` · ${escapeHtml(currentCrystal.subtitle)}` : ''}</p>
        </div>
        <span class="crystal-sys-badge">${escapeHtml(sysLabel)}</span>
      </div>
      <div class="crystal-param-row">
        <span class="crystal-param-pill">a = ${formatNum(lat.a, 1)} pm</span>
        <span class="crystal-param-pill">b = ${formatNum(lat.b, 1)} pm</span>
        <span class="crystal-param-pill">c = ${formatNum(lat.c, 1)} pm</span>
        ${anglePill}
      </div>
    `;
  }

  // ── 渲染切开数原子卡片 ──
  function renderSliceCard() {
    if (!currentCrystal) return;
    sliceActionsEl.innerHTML = '';

    if (!sliced) {
      const btnSlice = document.createElement('button');
      btnSlice.type = 'button';
      btnSlice.className = 'crystal-btn crystal-btn-primary crystal-btn-full';
      btnSlice.textContent = '切开数原子（均摊法）';
      btnSlice.addEventListener('click', () => {
        tileCount = 1;
        examTab = 'none';
        sliced = true;
        exploded = true;
        viewer.setExploded(true);
        syncAllControls();
      });
      sliceActionsEl.appendChild(btnSlice);
    } else {
      const btnToggleExplode = document.createElement('button');
      btnToggleExplode.type = 'button';
      btnToggleExplode.className = 'crystal-btn crystal-btn-primary';
      btnToggleExplode.textContent = exploded ? '拼回去' : '展开数原子';
      btnToggleExplode.addEventListener('click', () => {
        exploded = !exploded;
        viewer.setExploded(exploded);
        syncAllControls();
      });

      const btnRestore = document.createElement('button');
      btnRestore.type = 'button';
      btnRestore.className = 'crystal-btn crystal-btn-ghost';
      btnRestore.textContent = '还原完整球';
      btnRestore.addEventListener('click', () => {
        sliced = false;
        exploded = false;
        viewer.setSliced(false);
        syncAllControls();
      });

      sliceActionsEl.append(btnToggleExplode, btnRestore);
    }

    // 实时计算并展示均摊法明细
    const breakdown = computeAveragingBreakdown(currentCrystal);
    const rowsHtml = (currentCrystal.species || [])
      .map((sp) => {
        const stat = breakdown?.bySpecies?.[sp.id];
        return `
          <div class="crystal-avg-row">
            <span class="crystal-avg-species">
              <i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}"></i>
              <b>${formulaHtml(sp.symbol)}</b>
            </span>
            <span class="crystal-avg-eq">${escapeHtml(buildSpeciesEquation(stat))}</span>
          </div>
        `;
      })
      .join('');

    const formulaNote = currentCrystal.averagingFormula
      ? `<p class="crystal-avg-note">${escapeHtml(currentCrystal.averagingFormula)}</p>`
      : '';

    avgBreakdownEl.innerHTML = `${rowsHtml}${formulaNote}`;
  }

  // ── 渲染拼晶胞卡片 ──
  function renderTileCard() {
    tileCountEl.textContent = `${tileCount} / 8 晶胞`;
    btnTileAdd.disabled = tileCount >= 8;
    btnTileSub.disabled = tileCount <= 1;
    btnTileReset.disabled = tileCount <= 1;

    if (currentCrystal?.hexPrismHighlight) {
      hexBannerEl.hidden = false;
      if (tileCount >= 3) {
        hexBannerEl.className = 'crystal-hex-banner is-revealed';
        hexBannerEl.textContent = '✨ 正六棱柱已显现！3 个 120° 平行六面体晶胞无缝拼出一个完整正六棱柱。';
      } else {
        hexBannerEl.className = 'crystal-hex-banner';
        hexBannerEl.textContent = '💡 提示：镁为六方晶胞，试着点「+ 再拼一个」拼到 3 个晶胞，看看出现什么形状！';
      }
    } else {
      hexBannerEl.hidden = true;
      hexBannerEl.textContent = '';
    }
  }

  // ── 渲染高考考点工具内容 ──
  function renderExamCard() {
    examTabBtns.forEach((btn) => {
      const on = btn.dataset.exam === examTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (!currentCrystal || examTab === 'none') {
      examBodyEl.innerHTML =
        '<p class="crystal-exam-placeholder">点击上方按钮，在 3D 晶胞中直观标出配位数、最短距离或计算理论密度。</p>';
      return;
    }

    if (examTab === 'coordination') {
      const c = currentCrystal.coordination;
      if (!c) {
        examBodyEl.innerHTML = '<p class="crystal-exam-placeholder">该晶体暂无配位数标注。</p>';
        return;
      }
      examBodyEl.innerHTML = `
        <div class="crystal-exam-metric">
          <span class="crystal-exam-k">配位数 (CN)</span>
          <strong class="crystal-exam-v">${escapeHtml(c.number)}</strong>
        </div>
        <p class="crystal-exam-desc">${escapeHtml(c.label || '')}</p>
        <p class="crystal-exam-tip">图中金色环为中心粒子，蓝色连线指向全部最近邻配位粒子。</p>
      `;
      return;
    }

    if (examTab === 'distance') {
      const sd = currentCrystal.shortestDistance;
      if (!sd) {
        examBodyEl.innerHTML = '<p class="crystal-exam-placeholder">该晶体暂无最短距离标注。</p>';
        return;
      }
      examBodyEl.innerHTML = `
        <div class="crystal-exam-metric">
          <span class="crystal-exam-k">几何关系</span>
          <strong class="crystal-exam-v">${escapeHtml(sd.formula)}</strong>
        </div>
        ${sd.valuePm ? `<div class="crystal-exam-submetric">数值：<b>${escapeHtml(sd.valuePm)} pm</b></div>` : ''}
        <p class="crystal-exam-desc">${escapeHtml(sd.desc || '')}</p>
      `;
      return;
    }

    if (examTab === 'density') {
      const d = currentCrystal.density;
      if (!d) {
        examBodyEl.innerHTML = '<p class="crystal-exam-placeholder">该晶体暂无密度计算数据。</p>';
        return;
      }
      const computed = computeDensity(d.Z, d.molarMass, currentCrystal.lattice);
      const displayVal = Number.isFinite(computed)
        ? computed.toFixed(2)
        : formatNum(d.valueGcm3, 2);
      examBodyEl.innerHTML = `
        <div class="crystal-exam-metric">
          <span class="crystal-exam-k">理论密度 ρ</span>
          <strong class="crystal-exam-v">${displayVal} g/cm³</strong>
        </div>
        <p class="crystal-exam-formula">${escapeHtml(d.formulaText || 'ρ = (Z · M) / (Nₐ · V)')}</p>
        <div class="crystal-density-meta">
          <span>Z = ${formatNum(d.Z, 2)}</span>
          <span>M = ${formatNum(d.molarMass, 2)} g/mol</span>
        </div>
      `;
    }
  }

  // ── 渲染默认遮挡的课堂思考题卡片 ──
  function renderQaCard() {
    const qa = currentCrystal?.qa;
    if (!qa) {
      qaCardEl.hidden = true;
      return;
    }
    qaCardEl.hidden = false;
    qaCardEl.innerHTML = `
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">课堂思考题</h4>
        <span class="crystal-tag crystal-tag-qa">${qaRevealed ? '已揭晓' : '先思考'}</span>
      </div>
      <p class="crystal-qa-question">${escapeHtml(qa.question)}</p>
      <div class="crystal-qa-answer-box ${qaRevealed ? 'is-revealed' : 'is-covered'}">
        <p class="crystal-qa-answer">${escapeHtml(qa.answer)}</p>
        ${
          qaRevealed
            ? ''
            : '<div class="crystal-qa-cover"><button type="button" class="crystal-btn crystal-btn-primary crystal-qa-reveal-btn">点击揭晓结论</button></div>'
        }
      </div>
      ${
        qaRevealed
          ? '<div class="crystal-qa-foot"><button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm crystal-qa-hide-btn">重新遮挡</button></div>'
          : ''
      }
    `;

    qaCardEl.querySelector('.crystal-qa-reveal-btn')?.addEventListener('click', () => {
      qaRevealed = true;
      renderQaCard();
    });
    qaCardEl.querySelector('.crystal-qa-hide-btn')?.addEventListener('click', () => {
      qaRevealed = false;
      renderQaCard();
    });
  }

  function syncModeButtons() {
    modeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === displayMode);
    });
  }

  function syncAllControls() {
    syncModeButtons();
    renderSliceCard();
    renderTileCard();
    renderExamCard();
    renderCaption();
  }

  function selectCrystal(crystal) {
    if (!crystal) return;
    currentCrystal = crystal;
    activeCategory = crystal.category;
    sliced = false;
    exploded = false;
    tileCount = 1;
    examTab = 'none';
    qaRevealed = false;

    viewer.setCrystal(crystal);
    renderCategoryTabs();
    renderCrystalList();
    renderLegend();
    renderHeaderCard();
    renderQaCard();
    syncAllControls();
  }

  // ── 绑定控件事件 ──
  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.mode;
      if (next === displayMode) return;
      displayMode = next;
      viewer.setDisplayMode(displayMode);
      syncAllControls();
    });
  });

  btnTileAdd.addEventListener('click', () => {
    if (tileCount >= 8) return;
    sliced = false;
    exploded = false;
    examTab = 'none';
    tileCount += 1;
    viewer.setTileCount(tileCount);
    syncAllControls();
  });

  btnTileSub.addEventListener('click', () => {
    if (tileCount <= 1) return;
    tileCount -= 1;
    viewer.setTileCount(tileCount);
    syncAllControls();
  });

  btnTileReset.addEventListener('click', () => {
    if (tileCount === 1) return;
    tileCount = 1;
    viewer.setTileCount(1);
    syncAllControls();
  });

  examTabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.exam;
      examTab = examTab === tab ? 'none' : tab;
      if (examTab !== 'none') {
        if (sliced || exploded) {
          sliced = false;
          exploded = false;
          viewer.setSliced(false);
        }
        if (tileCount > 1) {
          tileCount = 1;
          viewer.setTileCount(1);
        }
      }
      if (examTab === 'coordination' || examTab === 'distance') {
        viewer.setOverlay(examTab);
      } else {
        viewer.setOverlay('none');
      }
      syncAllControls();
    });
  });

  btnAutoRotate.addEventListener('click', () => {
    autoRotate = !autoRotate;
    btnAutoRotate.classList.toggle('is-active', autoRotate);
    btnAutoRotate.setAttribute('aria-pressed', autoRotate ? 'true' : 'false');
    viewer.setAutoRotate(autoRotate);
  });

  btnResetView.addEventListener('click', () => {
    viewer.resetCamera();
  });

  // 初始载入
  if (currentCrystal) {
    selectCrystal(currentCrystal);
  } else {
    renderCategoryTabs();
    renderCrystalList();
  }
  viewer.start();

  return {
    pause() {
      viewer.stop();
    },
    resume() {
      viewer.start();
    },
    resize() {
      viewer.resize();
    },
    destroy() {
      viewer.dispose();
      containerEl.innerHTML = '';
    },
  };
}
