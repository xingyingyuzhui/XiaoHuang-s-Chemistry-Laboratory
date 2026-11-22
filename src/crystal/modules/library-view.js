/**
 * 模块 02：晶体结构库 — 状态与悬浮交互控制
 * 导出 mountLibraryView(stageEl, { drawerBodyEl } = {}) -> { pause(), resume(), resize(), destroy() }
 */

import { CRYSTAL_CATEGORIES, CRYSTALS, getCrystalById } from '../data/crystals.js';
import { createCrystalViewer } from '../scene/crystal-viewer.js';
import {
  SHORT_CATEGORY_LABELS,
  STAGE_TEMPLATE,
  renderCrystalItemHtml,
  renderFloatInfoHtml,
  renderExamPopoverHtml,
  renderQaPopoverHtml,
} from './library-html.js';

export function mountLibraryView(stageEl, { drawerBodyEl } = {}) {
  if (!stageEl) return { pause() {}, resume() {}, resize() {}, destroy() {} };

  const defaultCrystal = getCrystalById('nacl') || CRYSTALS[0];
  let activeCategory = defaultCrystal?.category || CRYSTAL_CATEGORIES[0]?.id || 'ionic';
  let currentCrystal = defaultCrystal;
  let displayMode = 'ball-stick';
  let sliced = false;
  let exploded = false;
  let tileCount = 1;
  let examTab = 'none';
  let autoRotate = false;
  let qaOpen = false;
  let qaRevealed = false;

  stageEl.innerHTML = '';
  const stageRoot = document.createElement('div');
  stageRoot.className = 'crystal-stage-inner';
  stageRoot.innerHTML = STAGE_TEMPLATE;
  stageEl.appendChild(stageRoot);

  const navHost = drawerBodyEl || document.createElement('div');
  if (drawerBodyEl) {
    drawerBodyEl.innerHTML = '';
  } else {
    navHost.className = 'crystal-fallback-nav';
    stageRoot.prepend(navHost);
  }
  navHost.innerHTML = `
    <div class="crystal-cat-tabs" role="tablist" aria-label="晶体类型"></div>
    <div class="crystal-drawer-list crystal-lib-grid" role="listbox" aria-label="晶体列表"></div>
  `;

  const q = (sel) => stageRoot.querySelector(sel);
  const catTabsEl = navHost.querySelector('.crystal-cat-tabs');
  const listEl = navHost.querySelector('.crystal-lib-grid');
  const floatInfoEl = q('.crystal-float-info');
  const btnQa = q('[data-act="qa"]');
  const btnAutoRotate = q('[data-act="autorotate"]');
  const btnResetView = q('[data-act="reset"]');
  const qaPopoverEl = q('.crystal-qa-popover');
  const hexToastEl = q('.crystal-hex-toast');
  const examPopoverEl = q('.crystal-exam-popover');
  const modeBtns = stageRoot.querySelectorAll('.crystal-seg-btn[data-mode]');
  const btnSliceToggle = q('[data-slice="toggle"]');
  const btnSliceRestore = q('[data-slice="restore"]');
  const btnTileSub = q('[data-tile="sub"]');
  const btnTileReset = q('[data-tile="reset"]');
  const btnTileAdd = q('[data-tile="add"]');
  const examTabBtns = stageRoot.querySelectorAll('.crystal-exam-tab');

  const viewer = createCrystalViewer(q('.crystal-stage-canvas'));

  function renderCategoryTabs() {
    catTabsEl.innerHTML = '';
    for (const cat of CRYSTAL_CATEGORIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crystal-cat-tab' + (cat.id === activeCategory ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', cat.id === activeCategory ? 'true' : 'false');
      btn.textContent = SHORT_CATEGORY_LABELS[cat.id] || cat.label.replace(/晶体$/, '');
      btn.title = cat.label;
      btn.addEventListener('click', () => {
        if (activeCategory === cat.id) return;
        activeCategory = cat.id;
        renderCategoryTabs();
        renderCrystalList();
        const inCat = CRYSTALS.filter((c) => c.category === activeCategory);
        if (inCat.length && currentCrystal?.category !== activeCategory) selectCrystal(inCat[0]);
      });
      catTabsEl.appendChild(btn);
    }
  }

  function renderCrystalList() {
    listEl.innerHTML = '';
    for (const c of CRYSTALS.filter((item) => item.category === activeCategory)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crystal-drawer-item' + (c.id === currentCrystal?.id ? ' is-active' : '');
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', c.id === currentCrystal?.id ? 'true' : 'false');
      btn.innerHTML = renderCrystalItemHtml(c);
      btn.title = `${c.name} · ${c.subtitle || ''}`;
      btn.addEventListener('click', () => selectCrystal(c));
      listEl.appendChild(btn);
    }
  }

  function renderQaPopover() {
    const qa = currentCrystal?.qa;
    btnQa.hidden = !qa;
    btnQa.classList.toggle('is-active', qaOpen);
    btnQa.setAttribute('aria-expanded', qaOpen ? 'true' : 'false');
    if (!qa || !qaOpen) {
      qaPopoverEl.hidden = true;
      return;
    }
    qaPopoverEl.hidden = false;
    qaPopoverEl.innerHTML = renderQaPopoverHtml(qa, qaRevealed);
    qaPopoverEl.querySelector('[data-qa-close]')?.addEventListener('click', () => {
      qaOpen = false;
      renderQaPopover();
    });
    qaPopoverEl.querySelector('.crystal-qa-reveal-btn')?.addEventListener('click', () => {
      qaRevealed = true;
      renderQaPopover();
    });
    qaPopoverEl.querySelector('.crystal-qa-hide-btn')?.addEventListener('click', () => {
      qaRevealed = false;
      renderQaPopover();
    });
  }

  function renderExamPopover() {
    examTabBtns.forEach((btn) => {
      const on = btn.dataset.exam === examTab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const html = renderExamPopoverHtml(currentCrystal, examTab);
    if (!html) {
      examPopoverEl.hidden = true;
      examPopoverEl.innerHTML = '';
      return;
    }
    examPopoverEl.hidden = false;
    examPopoverEl.innerHTML = html;
    examPopoverEl.querySelector('[data-exam-close]')?.addEventListener('click', () => {
      examTab = 'none';
      viewer.setOverlay('none');
      syncAllControls();
    });
  }

  function renderHexToast() {
    if (currentCrystal?.hexPrismHighlight && tileCount >= 3) {
      hexToastEl.hidden = false;
      hexToastEl.className = 'crystal-hex-toast is-revealed';
      hexToastEl.textContent = '✨ 正六棱柱已显现 · 3 个六方晶胞无缝拼合';
    } else if (currentCrystal?.hexPrismHighlight && tileCount === 2) {
      hexToastEl.hidden = false;
      hexToastEl.className = 'crystal-hex-toast';
      hexToastEl.textContent = '再点一次「+ 拼」，看看 3 个六方晶胞拼出什么形状';
    } else {
      hexToastEl.hidden = true;
      hexToastEl.textContent = '';
    }
  }

  function syncAllControls() {
    floatInfoEl.innerHTML = renderFloatInfoHtml(currentCrystal, { sliced });
    modeBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.mode === displayMode));

    btnSliceToggle.textContent = !sliced ? '切开数原子' : exploded ? '拼回去' : '展开数原子';
    btnSliceToggle.classList.toggle('is-active', sliced);
    btnSliceRestore.hidden = !sliced;

    btnTileReset.textContent = `${tileCount}/8 晶胞`;
    btnTileReset.disabled = tileCount <= 1;
    btnTileSub.disabled = tileCount <= 1;
    btnTileAdd.disabled = tileCount >= 8;

    renderHexToast();
    renderExamPopover();
  }

  function selectCrystal(crystal) {
    if (!crystal) return;
    currentCrystal = crystal;
    activeCategory = crystal.category;
    sliced = false;
    exploded = false;
    tileCount = 1;
    examTab = 'none';
    qaOpen = false;
    qaRevealed = false;
    viewer.setCrystal(crystal);
    renderCategoryTabs();
    renderCrystalList();
    renderQaPopover();
    syncAllControls();
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === displayMode) return;
      displayMode = btn.dataset.mode;
      viewer.setDisplayMode(displayMode);
      syncAllControls();
    });
  });

  btnSliceToggle.addEventListener('click', () => {
    if (!sliced) {
      tileCount = 1;
      examTab = 'none';
      sliced = true;
      exploded = true;
      viewer.setExploded(true);
    } else {
      exploded = !exploded;
      viewer.setExploded(exploded);
    }
    syncAllControls();
  });

  btnSliceRestore.addEventListener('click', () => {
    sliced = false;
    exploded = false;
    viewer.setSliced(false);
    syncAllControls();
  });

  function updateTileCount(next) {
    const clamped = Math.max(1, Math.min(8, next));
    if (clamped === tileCount) return;
    if (clamped > 1) {
      sliced = false;
      exploded = false;
      examTab = 'none';
    }
    tileCount = clamped;
    viewer.setTileCount(tileCount);
    syncAllControls();
  }

  btnTileAdd.addEventListener('click', () => updateTileCount(tileCount + 1));
  btnTileSub.addEventListener('click', () => updateTileCount(tileCount - 1));
  btnTileReset.addEventListener('click', () => updateTileCount(1));

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

  btnQa.addEventListener('click', () => {
    qaOpen = !qaOpen;
    renderQaPopover();
  });

  btnAutoRotate.addEventListener('click', () => {
    autoRotate = !autoRotate;
    btnAutoRotate.classList.toggle('is-active', autoRotate);
    btnAutoRotate.setAttribute('aria-pressed', autoRotate ? 'true' : 'false');
    viewer.setAutoRotate(autoRotate);
  });

  btnResetView.addEventListener('click', () => viewer.resetCamera());

  const onKeyDown = (e) => {
    if (e.key !== 'Escape') return;
    if (qaOpen) {
      qaOpen = false;
      renderQaPopover();
    } else if (examTab !== 'none') {
      examTab = 'none';
      viewer.setOverlay('none');
      syncAllControls();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  if (currentCrystal) selectCrystal(currentCrystal);
  else {
    renderCategoryTabs();
    renderCrystalList();
  }
  viewer.start();

  return {
    pause() { viewer.stop(); },
    resume() { viewer.start(); },
    resize() { viewer.resize(); },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      viewer.dispose();
      stageEl.innerHTML = '';
      if (drawerBodyEl) drawerBodyEl.innerHTML = '';
    },
  };
}
