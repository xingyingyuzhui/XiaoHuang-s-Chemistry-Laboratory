/**
 * 3D 晶体结构库 — 零遮挡三行交互 + AI 生成晶胞 + 全站小黄助教 3D 联动
 * 导出 mountLibraryView(stageEl, shell) -> { pause(), resume(), resize(), destroy() }
 */

import { CRYSTAL_CATEGORIES, CRYSTALS, getCrystalById } from '../data/crystals.js';
import { createCrystalViewer } from '../scene/crystal-viewer.js';
import { createAiCrystalModal, loadCustomCrystals, saveCustomCrystals } from './ai-crystal-modal.js';
import {
  SHORT_CATEGORY_LABELS,
  renderActionbarHtml,
  renderCrystalItemHtml,
  renderTopbarInfoHtml,
  renderModeStripHtml,
  buildCrystalSummary,
  buildQuickQuestions,
} from './library-html.js';

const VALID_CATS = new Set(CRYSTAL_CATEGORIES.map((c) => c.id));
const normalizeCat = (cat) => (VALID_CATS.has(cat) ? cat : 'mixed');

const CATEGORY_TABS = [
  { id: 'all', label: SHORT_CATEGORY_LABELS.all || '全部', title: '全部晶胞' },
  ...CRYSTAL_CATEGORIES.map((cat) => ({
    id: cat.id,
    label: SHORT_CATEGORY_LABELS[cat.id] || cat.label.replace(/晶体$/, ''),
    title: cat.label,
  })),
];

export function mountLibraryView(stageEl, shell = {}) {
  if (!stageEl) return { pause() {}, resume() {}, resize() {}, destroy() {} };

  const { drawerBodyEl, topbarInfoEl, topbarActionsEl, actionbarEl, setPageContext } = shell;
  let customCrystals = loadCustomCrystals(VALID_CATS);
  const defaultCrystal = getCrystalById('nacl') || CRYSTALS[0];
  let activeCategory = 'all';
  let currentCrystal = defaultCrystal;
  let displayMode = 'ball-stick';
  let activeTool = 'none';
  let sliced = false;
  let exploded = false;
  let tileCount = 1;
  let autoRotate = false;

  stageEl.innerHTML = `
    <div class="crystal-stage-inner">
      <div class="crystal-stage-canvas"></div>
      <div class="crystal-hex-toast" aria-live="polite" hidden></div>
    </div>
  `;
  const hexToastEl = stageEl.querySelector('.crystal-hex-toast');

  const navHost = drawerBodyEl || document.createElement('div');
  if (drawerBodyEl) drawerBodyEl.innerHTML = '';
  else { navHost.className = 'crystal-fallback-nav'; stageEl.prepend(navHost); }
  navHost.innerHTML = `
    <button type="button" class="crystal-btn-add" data-act="ai-add">
      <span class="crystal-add-plus">+</span><span>AI 生成晶胞</span>
    </button>
    <div class="crystal-cat-tabs" role="tablist" aria-label="晶体类型"></div>
    <div class="crystal-drawer-list crystal-lib-grid" role="listbox" aria-label="常见晶胞列表"></div>
  `;
  const btnAiAdd = navHost.querySelector('[data-act="ai-add"]');
  const catTabsEl = navHost.querySelector('.crystal-cat-tabs');
  const listEl = navHost.querySelector('.crystal-lib-grid');

  if (topbarActionsEl) {
    topbarActionsEl.innerHTML = `
      <button type="button" class="crystal-topbar-btn" data-act="autorotate" aria-pressed="false" title="自动慢转">慢转</button>
      <button type="button" class="crystal-topbar-btn" data-act="reset" title="复位视角">复位</button>
    `;
  }
  const btnAutoRotate = topbarActionsEl?.querySelector('[data-act="autorotate"]');
  const btnResetView = topbarActionsEl?.querySelector('[data-act="reset"]');

  const barHost = actionbarEl || document.createElement('div');
  barHost.innerHTML = renderActionbarHtml();
  const modeStripEl = barHost.querySelector('.crystal-mode-strip');
  const modeBtns = barHost.querySelectorAll('.crystal-seg-btn[data-mode]');
  const toolBtns = barHost.querySelectorAll('.crystal-tool-btn[data-tool]');
  const tileToolBtn = barHost.querySelector('.crystal-tool-btn[data-tool="tile"]');

  const viewer = createCrystalViewer(stageEl.querySelector('.crystal-stage-canvas'));

  function getVisibleCrystals(catId) {
    if (catId === 'all') return [...customCrystals, ...CRYSTALS];
    return [...customCrystals.filter((c) => c.category === catId), ...CRYSTALS.filter((c) => c.category === catId)];
  }

  function renderCategoryTabs() {
    catTabsEl.innerHTML = '';
    for (const tab of CATEGORY_TABS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'crystal-cat-tab' + (tab.id === activeCategory ? ' is-active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', String(tab.id === activeCategory));
      btn.textContent = tab.label;
      btn.title = tab.title;
      btn.addEventListener('click', () => {
        if (activeCategory === tab.id) return;
        activeCategory = tab.id;
        renderCategoryTabs();
        renderCrystalList();
        const items = getVisibleCrystals(activeCategory);
        if (items.length && !items.some((c) => c.id === currentCrystal?.id)) {
          selectCrystal(items[0], { keepCategory: true });
        }
      });
      catTabsEl.appendChild(btn);
    }
  }

  function deleteCustomCrystal(id) {
    customCrystals = customCrystals.filter((c) => c.id !== id);
    saveCustomCrystals(customCrystals);
    if (currentCrystal?.id === id) {
      const next = getVisibleCrystals(activeCategory)[0] || getCrystalById('nacl') || CRYSTALS[0];
      selectCrystal(next, { keepCategory: true });
    } else {
      renderCrystalList();
    }
  }

  function renderCrystalList() {
    listEl.innerHTML = '';
    for (const c of getVisibleCrystals(activeCategory)) {
      const item = document.createElement('div');
      item.className = 'crystal-drawer-item' + (c.isCustom ? ' is-custom' : '') + (c.id === currentCrystal?.id ? ' is-active' : '');
      item.setAttribute('role', 'option');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-selected', String(c.id === currentCrystal?.id));
      item.innerHTML = renderCrystalItemHtml(c);
      item.title = c.name;
      item.addEventListener('click', (e) => {
        const delBtn = e.target.closest('[data-del-id]');
        if (delBtn) { e.stopPropagation(); deleteCustomCrystal(delBtn.dataset.delId); return; }
        selectCrystal(c, { keepCategory: true });
      });
      item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCrystal(c, { keepCategory: true }); }
      });
      listEl.appendChild(item);
    }
  }

  function syncAllControls() {
    if (topbarInfoEl) topbarInfoEl.innerHTML = renderTopbarInfoHtml(currentCrystal);
    modeBtns.forEach((btn) => btn.classList.toggle('is-active', btn.dataset.mode === displayMode));
    toolBtns.forEach((btn) => {
      const on = btn.dataset.tool === activeTool;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', String(on));
    });
    if (tileToolBtn) tileToolBtn.textContent = `拼晶胞 ${tileCount}/8`;

    const stripHtml = renderModeStripHtml(currentCrystal, { activeTool, exploded, tileCount });
    modeStripEl.hidden = !stripHtml;
    modeStripEl.innerHTML = stripHtml;

    if (currentCrystal?.hexPrismHighlight && tileCount >= 3) {
      hexToastEl.hidden = false;
      hexToastEl.className = 'crystal-hex-toast is-revealed';
      hexToastEl.textContent = '✨ 正六棱柱已显现 · 3 个六方晶胞无缝拼合';
    } else if (currentCrystal?.hexPrismHighlight && tileCount === 2) {
      hexToastEl.hidden = false;
      hexToastEl.className = 'crystal-hex-toast';
      hexToastEl.textContent = '再拼 1 个晶胞，观察 3 个六方晶胞如何拼成正六棱柱';
    } else {
      hexToastEl.hidden = true;
      hexToastEl.textContent = '';
    }
  }

  function clearInquiryModes() {
    if (sliced || exploded) { sliced = false; exploded = false; viewer.setSliced(false); }
    if (tileCount > 1) { tileCount = 1; viewer.setTileCount(1); }
    viewer.setOverlay('none');
  }

  function setTileCount(next) {
    const clamped = Math.max(1, Math.min(8, next));
    if (clamped === tileCount && activeTool === 'tile') return;
    if (sliced || exploded) { sliced = false; exploded = false; viewer.setSliced(false); }
    viewer.setOverlay('none');
    tileCount = clamped;
    viewer.setTileCount(tileCount);
    syncAllControls();
  }

  function activateTool(tool) {
    if (tool === activeTool) {
      activeTool = 'none';
      clearInquiryModes();
    } else {
      clearInquiryModes();
      activeTool = tool;
      if (tool === 'slice') { sliced = true; exploded = true; viewer.setExploded(true); }
      else if (tool === 'tile') { tileCount = 2; viewer.setTileCount(2); }
      else if (tool === 'coordination' || tool === 'distance') viewer.setOverlay(tool);
    }
    syncAllControls();
  }

  function handleAiAction(action) {
    if (!currentCrystal) return;
    if (action === 'ball-stick' || action === 'space-filling') {
      displayMode = action;
      viewer.setDisplayMode(displayMode);
    } else if (action === 'slice' || action === 'explode') {
      clearInquiryModes();
      activeTool = 'slice';
      sliced = true;
      exploded = action === 'explode';
      if (exploded) viewer.setExploded(true);
      else { viewer.setSliced(true); viewer.setExploded(false); }
    } else if (action === 'tile-2' || action === 'tile-3') {
      clearInquiryModes();
      activeTool = 'tile';
      tileCount = action === 'tile-3' ? 3 : 2;
      viewer.setTileCount(tileCount);
    } else if (action === 'coordination' || action === 'distance') {
      clearInquiryModes();
      activeTool = action;
      viewer.setOverlay(action);
    } else if (action === 'reset') {
      activeTool = 'none';
      displayMode = 'ball-stick';
      clearInquiryModes();
      viewer.setDisplayMode('ball-stick');
      viewer.resetCamera();
    }
    syncAllControls();
  }

  function selectCrystal(crystal, { keepCategory = false } = {}) {
    if (!crystal) return;
    currentCrystal = crystal;
    if (!keepCategory && activeCategory !== 'all') activeCategory = normalizeCat(crystal.category);
    activeTool = 'none';
    sliced = false;
    exploded = false;
    tileCount = 1;
    viewer.setCrystal(crystal);
    renderCategoryTabs();
    renderCrystalList();
    syncAllControls();

    setPageContext?.({
      title: crystal.name,
      formula: crystal.formula,
      module: 'library',
      summary: buildCrystalSummary(crystal),
      qa: crystal.qa || null,
      quickQuestions: buildQuickQuestions(crystal),
      onAiAction: handleAiAction,
    });
  }

  const aiModal = createAiCrystalModal({
    onCreated(crystal) {
      const normalized = { ...crystal, isCustom: true, category: normalizeCat(crystal.category) };
      customCrystals = [normalized, ...customCrystals.filter((c) => c.id !== normalized.id)];
      saveCustomCrystals(customCrystals);
      activeCategory = 'all';
      selectCrystal(normalized, { keepCategory: true });
    },
  });

  btnAiAdd?.addEventListener('click', () => aiModal.open());

  modeStripEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-strip="toggle-explode"]')) {
      exploded = !exploded;
      viewer.setExploded(exploded);
      syncAllControls();
      return;
    }
    const tileAct = e.target.closest('[data-tile]')?.dataset.tile;
    if (tileAct === 'sub') setTileCount(tileCount - 1);
    else if (tileAct === 'add') setTileCount(tileCount + 1);
    else if (tileAct === 'reset') setTileCount(1);
  });

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode === displayMode) return;
      displayMode = btn.dataset.mode;
      viewer.setDisplayMode(displayMode);
      syncAllControls();
    });
  });

  toolBtns.forEach((btn) => btn.addEventListener('click', () => activateTool(btn.dataset.tool)));

  btnAutoRotate?.addEventListener('click', () => {
    autoRotate = !autoRotate;
    btnAutoRotate.classList.toggle('is-active', autoRotate);
    btnAutoRotate.setAttribute('aria-pressed', String(autoRotate));
    viewer.setAutoRotate(autoRotate);
  });

  btnResetView?.addEventListener('click', () => viewer.resetCamera());

  if (currentCrystal) selectCrystal(currentCrystal, { keepCategory: true });
  else { renderCategoryTabs(); renderCrystalList(); }
  viewer.start();

  return {
    pause() { viewer.stop(); },
    resume() { viewer.start(); },
    resize() { viewer.resize(); },
    destroy() {
      aiModal.destroy();
      viewer.dispose();
      stageEl.innerHTML = '';
      if (drawerBodyEl) drawerBodyEl.innerHTML = '';
      if (topbarInfoEl) topbarInfoEl.innerHTML = '';
      if (topbarActionsEl) topbarActionsEl.innerHTML = '';
      if (actionbarEl) actionbarEl.innerHTML = '';
    },
  };
}
