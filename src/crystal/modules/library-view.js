/**
 * 3D 晶体结构库 — 四角浮层卡 + 右下 3D 相机操控盘 + AI 生成晶胞 + 拖拽/长按重排
 * 导出 mountLibraryView(stageEl, shell) -> { pause(), resume(), resize(), exitEditMode(), destroy() }
 */

import { CRYSTAL_CATEGORIES, CRYSTALS, getCrystalById } from '../data/crystals.js';
import { createCrystalViewer } from '../scene/crystal-viewer.js';
import { createAiCrystalModal, loadCustomCrystals, saveCustomCrystals } from './ai-crystal-modal.js';
import { appConfirm } from '../../app-dialog.js';
import { loadCrystalOrder, saveCrystalOrder, applyCrystalOrder, reorderIds, attachCrystalDnd } from './library-dnd.js';
import {
  SHORT_CATEGORY_LABELS, escapeHtml, renderDrawerShellHtml, renderStageOverlayHtml,
  renderCrystalItemHtml, renderCornerInfoHtml, renderModeStripHtml, buildCrystalSummary, buildQuickQuestions,
} from './library-html.js';

const VALID_CATS = new Set(CRYSTAL_CATEGORIES.map((c) => c.id));
const normalizeCat = (cat) => (VALID_CATS.has(cat) ? cat : 'mixed');
const STEP_AZIMUTH = 0.22;
const STEP_POLAR = 0.16;
const ZOOM_IN = 0.88;
const ZOOM_OUT = 1.14;
const HOLDABLE_CAMS = new Set(['left', 'right', 'up', 'down', 'zoom-in', 'zoom-out']);

const CATEGORY_TABS = [
  { id: 'all', label: SHORT_CATEGORY_LABELS.all || '全部', title: '全部晶胞' },
  ...CRYSTAL_CATEGORIES.map((cat) => ({
    id: cat.id,
    label: SHORT_CATEGORY_LABELS[cat.id] || cat.label.replace(/晶体$/, ''),
    title: cat.label,
  })),
];

export function mountLibraryView(stageEl, shell = {}) {
  if (!stageEl) return { pause() {}, resume() {}, resize() {}, exitEditMode() {}, destroy() {} };

  const { drawerBodyEl, setPageContext } = shell;
  let customCrystals = loadCustomCrystals(VALID_CATS);
  let crystalOrder = loadCrystalOrder();
  let activeCategory = 'all', editMode = false;
  let currentCrystal = getCrystalById('nacl') || CRYSTALS[0];
  let displayMode = 'ball-stick', activeTool = 'none';
  let sliced = false, exploded = false, tileCount = 1, autoRotate = false, showFrame = true;

  stageEl.innerHTML = renderStageOverlayHtml();
  const q = (sel) => stageEl.querySelector(sel);
  const canvasHost = q('.crystal-stage-canvas');
  const cornerInfoEl = q('.crystal-corner-info');
  const hexToastEl = q('.crystal-hex-toast');
  const modeStripEl = q('.crystal-mode-strip');
  const modeBtns = stageEl.querySelectorAll('.crystal-seg-btn[data-mode]');
  const toolBtns = stageEl.querySelectorAll('.crystal-tool-btn[data-tool]');
  const tileToolBtn = q('.crystal-tool-btn[data-tool="tile"]');
  const btnFrameToggle = q('.crystal-frame-toggle');
  const camPadEl = q('.crystal-cam-pad');
  const btnAutoRotate = camPadEl?.querySelector('[data-cam="auto"]');

  const navHost = drawerBodyEl || document.createElement('div');
  if (drawerBodyEl) drawerBodyEl.innerHTML = '';
  else { navHost.className = 'crystal-fallback-nav'; stageEl.prepend(navHost); }
  navHost.innerHTML = renderDrawerShellHtml();

  const btnAiAdd = navHost.querySelector('[data-act="ai-add"]');
  const btnEdit = navHost.querySelector('[data-act="edit"]');
  const catTabsEl = navHost.querySelector('.crystal-cat-tabs');
  const listEl = navHost.querySelector('.crystal-lib-grid');
  const viewer = createCrystalViewer(canvasHost);

  const getOrderedAll = () => applyCrystalOrder(customCrystals, CRYSTALS, crystalOrder);
  const getVisibleCrystals = (catId) => {
    const ordered = getOrderedAll();
    return catId === 'all' ? ordered : ordered.filter((c) => c.category === catId);
  };
  const findCrystalById = (id) => customCrystals.find((c) => c.id === id) || getCrystalById(id);

  function renderCategoryTabs() {
    catTabsEl.innerHTML = CATEGORY_TABS.map((tab) => {
      const on = tab.id === activeCategory;
      return `<button type="button" class="crystal-cat-tab${on ? ' is-active' : ''}" data-cat="${escapeHtml(tab.id)}" role="tab" aria-selected="${on}" title="${escapeHtml(tab.title)}">${escapeHtml(tab.label)}</button>`;
    }).join('');
  }

  async function deleteCustomCrystal(id) {
    const ok = await appConfirm('确定删除该 AI 晶胞卡片？', { title: '删除晶胞', okText: '删除', danger: true });
    if (!ok) return;
    customCrystals = customCrystals.filter((c) => c.id !== id);
    saveCustomCrystals(customCrystals);
    if (crystalOrder.length) {
      crystalOrder = crystalOrder.filter((item) => item !== id);
      saveCrystalOrder(crystalOrder);
    }
    if (currentCrystal?.id === id) {
      const next = getVisibleCrystals(activeCategory)[0] || getCrystalById('nacl') || CRYSTALS[0];
      selectCrystal(next, { keepCategory: true });
    } else {
      renderCrystalList();
    }
  }

  function renderCrystalList() {
    listEl.innerHTML = getVisibleCrystals(activeCategory).map((c) => {
      const on = c.id === currentCrystal?.id;
      const cls = `crystal-drawer-item${c.isCustom ? ' is-custom' : ''}${on ? ' is-active' : ''}${editMode ? ' is-editing' : ''}`;
      const title = editMode ? `${c.name}（拖动排序）` : c.name;
      return `<div class="${cls}" data-id="${escapeHtml(c.id)}" draggable="${editMode}" role="option" tabindex="0" aria-selected="${on}" title="${escapeHtml(title)}">${renderCrystalItemHtml(c)}</div>`;
    }).join('');
  }

  function setEditMode(on) {
    editMode = Boolean(on);
    if (btnEdit) {
      btnEdit.textContent = editMode ? '完成' : '编辑';
      btnEdit.classList.toggle('is-active', editMode);
      btnEdit.setAttribute('aria-pressed', String(editMode));
    }
    listEl.classList.toggle('is-edit-mode', editMode);
    renderCrystalList();
  }

  const dnd = attachCrystalDnd(listEl, {
    isEditMode: () => editMode,
    onReorder(fromId, toId) {
      const nextOrder = reorderIds(getOrderedAll().map((c) => c.id), fromId, toId);
      if (!nextOrder) return;
      crystalOrder = nextOrder;
      saveCrystalOrder(crystalOrder);
      renderCrystalList();
    },
  });

  function syncAllControls() {
    if (cornerInfoEl) cornerInfoEl.innerHTML = renderCornerInfoHtml(currentCrystal);
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

    const hexOn = Boolean(currentCrystal?.hexPrismHighlight && tileCount >= 2);
    hexToastEl.hidden = !hexOn;
    hexToastEl.className = 'crystal-hex-toast' + (hexOn && tileCount >= 3 ? ' is-revealed' : '');
    hexToastEl.textContent = !hexOn ? '' : tileCount >= 3 ? '✨ 正六棱柱已显现 · 3 个六方晶胞无缝拼合' : '再拼 1 个晶胞，显现正六棱柱';
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
    if (tool === activeTool) { activeTool = 'none'; clearInquiryModes(); }
    else {
      clearInquiryModes(); activeTool = tool;
      if (tool === 'slice') { sliced = true; exploded = true; viewer.setExploded(true); }
      else if (tool === 'tile') { tileCount = 2; viewer.setTileCount(2); }
      else if (tool === 'coordination' || tool === 'distance') viewer.setOverlay(tool);
    }
    syncAllControls();
  }

  function handleAiAction(action) {
    if (!currentCrystal) return;
    if (action === 'ball-stick' || action === 'space-filling') {
      displayMode = action; viewer.setDisplayMode(displayMode);
    } else if (action === 'slice' || action === 'explode') {
      clearInquiryModes(); activeTool = 'slice'; sliced = true; exploded = action === 'explode';
      if (exploded) viewer.setExploded(true);
      else { viewer.setSliced(true); viewer.setExploded(false); }
    } else if (action === 'tile-2' || action === 'tile-3') {
      clearInquiryModes(); activeTool = 'tile'; tileCount = action === 'tile-3' ? 3 : 2;
      viewer.setTileCount(tileCount);
    } else if (action === 'coordination' || action === 'distance') {
      clearInquiryModes(); activeTool = action; viewer.setOverlay(action);
    } else if (action === 'reset') {
      activeTool = 'none'; displayMode = 'ball-stick'; clearInquiryModes();
      viewer.setDisplayMode('ball-stick'); viewer.resetCamera();
    }
    syncAllControls();
  }

  function selectCrystal(crystal, { keepCategory = false } = {}) {
    if (!crystal) return;
    currentCrystal = crystal;
    if (!keepCategory && activeCategory !== 'all') activeCategory = normalizeCat(crystal.category);
    activeTool = 'none'; sliced = false; exploded = false; tileCount = 1;
    viewer.setCrystal(crystal);
    renderCategoryTabs(); renderCrystalList(); syncAllControls();
    setPageContext?.({
      title: crystal.name, formula: crystal.formula, module: 'library',
      summary: buildCrystalSummary(crystal), qa: crystal.qa || null,
      quickQuestions: buildQuickQuestions(crystal), onAiAction: handleAiAction,
    });
  }

  function runCamAct(act, fine = false) {
    const k = fine ? 0.55 : 1;
    if (act === 'left') viewer.stepRotate(STEP_AZIMUTH * k, 0);
    else if (act === 'right') viewer.stepRotate(-STEP_AZIMUTH * k, 0);
    else if (act === 'up') viewer.stepRotate(0, -STEP_POLAR * k);
    else if (act === 'down') viewer.stepRotate(0, STEP_POLAR * k);
    else if (act === 'zoom-in') viewer.stepZoom(fine ? 0.96 : ZOOM_IN);
    else if (act === 'zoom-out') viewer.stepZoom(fine ? 1.04 : ZOOM_OUT);
    else if (act === 'reset') viewer.resetCamera();
    else if (act === 'auto') {
      autoRotate = !autoRotate;
      viewer.setAutoRotate(autoRotate);
      if (btnAutoRotate) {
        btnAutoRotate.classList.toggle('is-on', autoRotate);
        btnAutoRotate.setAttribute('aria-pressed', String(autoRotate));
        btnAutoRotate.textContent = autoRotate ? '慢转·开' : '慢转';
      }
    }
  }

  let holdTimer = 0, holdAct = null;
  const stopHold = () => { holdAct = null; clearTimeout(holdTimer); holdTimer = 0; };
  const startHold = (act) => {
    stopHold(); holdAct = act;
    const loop = () => { if (!holdAct) return; runCamAct(holdAct, true); holdTimer = window.setTimeout(loop, 48); };
    holdTimer = window.setTimeout(loop, 320);
  };

  catTabsEl.addEventListener('click', (e) => {
    const tabId = e.target.closest('[data-cat]')?.dataset.cat;
    if (!tabId || tabId === activeCategory) return;
    activeCategory = tabId;
    renderCategoryTabs(); renderCrystalList();
    const items = getVisibleCrystals(activeCategory);
    if (items.length && !items.some((c) => c.id === currentCrystal?.id)) selectCrystal(items[0], { keepCategory: true });
  });

  listEl.addEventListener('click', (e) => {
    const delBtn = e.target.closest('[data-del-id]');
    if (delBtn) { e.stopPropagation(); deleteCustomCrystal(delBtn.dataset.delId); return; }
    if (editMode) return;
    const c = findCrystalById(e.target.closest('.crystal-drawer-item[data-id]')?.dataset.id);
    if (c) selectCrystal(c, { keepCategory: true });
  });

  listEl.addEventListener('keydown', (e) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || editMode) return;
    const c = findCrystalById(e.target.closest('.crystal-drawer-item[data-id]')?.dataset.id);
    if (c) { e.preventDefault(); selectCrystal(c, { keepCategory: true }); }
  });

  camPadEl?.addEventListener('pointerdown', (e) => {
    const act = e.target.closest('[data-cam]')?.dataset.cam;
    if (!act) return;
    e.preventDefault(); runCamAct(act, false);
    if (HOLDABLE_CAMS.has(act)) startHold(act);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) camPadEl?.addEventListener(ev, stopHold);
  window.addEventListener('blur', stopHold);

  btnFrameToggle?.addEventListener('click', () => {
    showFrame = !showFrame;
    btnFrameToggle.setAttribute('aria-pressed', String(showFrame));
    viewer.setShowFrame(showFrame);
  });

  const aiModal = createAiCrystalModal({
    onCreated(crystal) {
      const normalized = { ...crystal, isCustom: true, category: normalizeCat(crystal.category) };
      customCrystals = [normalized, ...customCrystals.filter((c) => c.id !== normalized.id)];
      saveCustomCrystals(customCrystals);
      if (crystalOrder.length) {
        crystalOrder = [normalized.id, ...crystalOrder.filter((id) => id !== normalized.id)];
        saveCrystalOrder(crystalOrder);
      }
      activeCategory = 'all';
      selectCrystal(normalized, { keepCategory: true });
    },
  });

  btnAiAdd?.addEventListener('click', () => aiModal.open());
  btnEdit?.addEventListener('click', () => setEditMode(!editMode));

  modeStripEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-strip="toggle-explode"]')) {
      exploded = !exploded; viewer.setExploded(exploded); syncAllControls(); return;
    }
    const tileAct = e.target.closest('[data-tile]')?.dataset.tile;
    if (tileAct === 'sub') setTileCount(tileCount - 1);
    else if (tileAct === 'add') setTileCount(tileCount + 1);
    else if (tileAct === 'reset') setTileCount(1);
  });

  modeBtns.forEach((btn) => btn.addEventListener('click', () => {
    if (btn.dataset.mode === displayMode) return;
    displayMode = btn.dataset.mode; viewer.setDisplayMode(displayMode); syncAllControls();
  }));
  toolBtns.forEach((btn) => btn.addEventListener('click', () => activateTool(btn.dataset.tool)));

  if (currentCrystal) selectCrystal(currentCrystal, { keepCategory: true });
  else { renderCategoryTabs(); renderCrystalList(); }
  viewer.start();

  return {
    pause() { stopHold(); viewer.stop(); },
    resume() { viewer.start(); },
    resize() { viewer.resize(); },
    exitEditMode() { if (editMode) setEditMode(false); },
    destroy() {
      stopHold(); window.removeEventListener('blur', stopHold);
      dnd.destroy(); aiModal.destroy(); viewer.dispose();
      stageEl.innerHTML = '';
      if (drawerBodyEl) drawerBodyEl.innerHTML = '';
    },
  };
}
