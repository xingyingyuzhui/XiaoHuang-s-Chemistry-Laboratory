/**
 * 模块 02：晶体结构库 — 状态与交互控制
 * 导出 mountLibraryView(containerEl) -> { pause(), resume(), resize(), destroy() }
 */

import { CRYSTAL_CATEGORIES, CRYSTALS, getCrystalById } from '../data/crystals.js';
import { createCrystalViewer } from '../scene/crystal-viewer.js';
import {
  SHORT_CATEGORY_LABELS,
  WORKBENCH_TEMPLATE,
  renderCrystalItemHtml,
  renderLegendHtml,
  buildCaptionText,
  renderHeaderCardHtml,
  renderAveragingBreakdownHtml,
  renderExamBodyHtml,
  renderQaCardHtml,
} from './library-html.js';

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
  let displayMode = 'ball-stick';
  let sliced = false;
  let exploded = false;
  let tileCount = 1;
  let examTab = 'none';
  let autoRotate = false;
  let qaRevealed = false;

  containerEl.innerHTML = '';
  const workbench = document.createElement('div');
  workbench.className = 'crystal-workbench crystal-library-workbench';
  workbench.innerHTML = WORKBENCH_TEMPLATE;
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

  const viewer = createCrystalViewer(stageCanvasEl);

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

  function renderCrystalList() {
    listEl.innerHTML = '';
    for (const c of CRYSTALS.filter((item) => item.category === activeCategory)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crystal-list-item' + (c.id === currentCrystal?.id ? ' is-active' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', c.id === currentCrystal?.id ? 'true' : 'false');
      btn.innerHTML = renderCrystalItemHtml(c);
      btn.addEventListener('click', () => selectCrystal(c));
      listEl.appendChild(btn);
    }
  }

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
      const btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.className = 'crystal-btn crystal-btn-primary';
      btnToggle.textContent = exploded ? '拼回去' : '展开数原子';
      btnToggle.addEventListener('click', () => {
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

      sliceActionsEl.append(btnToggle, btnRestore);
    }

    avgBreakdownEl.innerHTML = renderAveragingBreakdownHtml(currentCrystal);
  }

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

  function renderExamCard() {
    examTabBtns.forEach((btn) => {
      const on = btn.dataset.exam === examTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    examBodyEl.innerHTML = renderExamBodyHtml(currentCrystal, examTab);
  }

  function renderQaCard() {
    const qa = currentCrystal?.qa;
    if (!qa) {
      qaCardEl.hidden = true;
      return;
    }
    qaCardEl.hidden = false;
    qaCardEl.innerHTML = renderQaCardHtml(qa, qaRevealed);
    qaCardEl.querySelector('.crystal-qa-reveal-btn')?.addEventListener('click', () => {
      qaRevealed = true;
      renderQaCard();
    });
    qaCardEl.querySelector('.crystal-qa-hide-btn')?.addEventListener('click', () => {
      qaRevealed = false;
      renderQaCard();
    });
  }

  function syncAllControls() {
    modeBtns.forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.mode === displayMode);
    });
    renderSliceCard();
    renderTileCard();
    renderExamCard();
    captionEl.textContent = buildCaptionText({
      crystal: currentCrystal,
      displayMode,
      sliced,
      exploded,
      tileCount,
      examTab,
    });
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
    legendEl.innerHTML = renderLegendHtml(crystal);
    headerCardEl.innerHTML = renderHeaderCardHtml(crystal);
    renderQaCard();
    syncAllControls();
  }

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
      viewer.setOverlay(examTab === 'coordination' || examTab === 'distance' ? examTab : 'none');
      syncAllControls();
    });
  });

  btnAutoRotate.addEventListener('click', () => {
    autoRotate = !autoRotate;
    btnAutoRotate.classList.toggle('is-active', autoRotate);
    btnAutoRotate.setAttribute('aria-pressed', autoRotate ? 'true' : 'false');
    viewer.setAutoRotate(autoRotate);
  });

  btnResetView.addEventListener('click', () => viewer.resetCamera());

  if (currentCrystal) {
    selectCrystal(currentCrystal);
  } else {
    renderCategoryTabs();
    renderCrystalList();
  }
  viewer.start();

  return {
    pause() { viewer.stop(); },
    resume() { viewer.start(); },
    resize() { viewer.resize(); },
    destroy() {
      viewer.dispose();
      containerEl.innerHTML = '';
    },
  };
}
