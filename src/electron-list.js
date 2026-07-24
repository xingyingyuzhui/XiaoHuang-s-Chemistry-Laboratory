/**
 * 电子排布 - 元素列表模块
 * 列表渲染、编辑排序（SQLite settings.electronOrder）、直接驱动 3D viewer
 */

import { ELECTRON_ELEMENTS } from './data/electron-configs.js';
import { settingsApi } from './api/client.js';
import { patchCachedElectronOrder } from './settings.js';

const $ = (sel) => document.querySelector(sel);

/** 旧版 localStorage 键，仅用于一次性迁移 */
const LEGACY_ORDER_KEY = 'xh-chem-lab-electron-order-v1';

/** @type {number[]} */
let elementOrder = defaultOrder();
let editMode = false;
let currentElementZ = null;
/** @type {ReturnType<import('./electron-renderer.js').createElectronViewer> | null} */
let viewerRef = null;

function defaultOrder() {
  return ELECTRON_ELEMENTS.map((el) => el.z);
}

/**
 * 规范化顺序：只保留已知 z，缺的补到末尾
 * @param {unknown} arr
 * @returns {number[]}
 */
function normalizeOrder(arr) {
  if (!Array.isArray(arr) || !arr.length) return defaultOrder();
  const known = new Set(ELECTRON_ELEMENTS.map((e) => e.z));
  const order = arr.map(Number).filter((z) => known.has(z));
  for (const z of known) {
    if (!order.includes(z)) order.push(z);
  }
  return order.length ? order : defaultOrder();
}

/**
 * 从后端 settings 读取；若无则尝试迁移 localStorage
 */
async function loadOrderFromServer() {
  try {
    const settings = await settingsApi.get();
    let raw = settings?.electronOrder;

    // 一次性：DB 无顺序时，从旧 localStorage 迁入
    if (!Array.isArray(raw) || !raw.length) {
      try {
        const legacy = localStorage.getItem(LEGACY_ORDER_KEY);
        if (legacy) {
          const parsed = JSON.parse(legacy);
          if (Array.isArray(parsed) && parsed.length) {
            raw = parsed;
            const normalized = normalizeOrder(raw);
            await settingsApi.update({ electronOrder: normalized });
            localStorage.removeItem(LEGACY_ORDER_KEY);
            elementOrder = normalized;
            return elementOrder;
          }
        }
      } catch (e) {
        console.warn('迁移本地电子列表顺序失败', e);
      }
      elementOrder = defaultOrder();
    } else {
      elementOrder = normalizeOrder(raw);
    }
  } catch (err) {
    console.warn('读取电子列表顺序失败，使用默认', err);
    elementOrder = defaultOrder();
  }
  return elementOrder;
}

/**
 * 写入 SQLite settings.electronOrder
 */
async function saveOrder() {
  try {
    const order = [...elementOrder];
    await settingsApi.update({ electronOrder: order });
    // 同步设置缓存，避免设置抽屉整包写回冲掉顺序
    patchCachedElectronOrder(order);
  } catch (e) {
    console.warn('电子列表顺序保存失败', e);
  }
}

/**
 * 注册 3D viewer（创建后调用，避免事件丢失）
 */
export function setElectronViewer(viewer) {
  viewerRef = viewer || null;
}

export function getCurrentElementZ() {
  return currentElementZ;
}

/**
 * 渲染元素列表
 */
export function renderElectronList() {
  const list = $('#electronList');
  if (!list) return;

  const orderedElements = elementOrder
    .map((z) => ELECTRON_ELEMENTS.find((el) => el.z === z))
    .filter(Boolean);

  list.innerHTML = orderedElements
    .map(
      (el) => `
    <div
      class="electron-card${currentElementZ === el.z ? ' is-active' : ''}${editMode ? ' is-editing' : ''}"
      data-z="${el.z}"
      draggable="${editMode ? 'true' : 'false'}"
    >
      <button type="button" class="mol-btn electron-card-main" data-z="${el.z}">
        <strong>${el.symbol}</strong>
        <span>${el.name}</span>
      </button>
    </div>
  `,
    )
    .join('');

  list.querySelectorAll('.electron-card-main').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (editMode) return;
      loadElement(parseInt(btn.dataset.z, 10));
    });
  });

  if (editMode) bindElectronDrag();
}

/**
 * 加载元素电子排布（直接调 viewer.load，不依赖全局事件）
 */
export function loadElement(z) {
  const el = ELECTRON_ELEMENTS.find((e) => e.z === z);
  if (!el) return;

  currentElementZ = z;
  renderElectronList();

  const symbolEl = $('#electronSymbol');
  const nameEl = $('#electronName');
  const configEl = $('#electronConfig');

  if (symbolEl) symbolEl.textContent = `${el.symbol} (${el.z})`;
  if (nameEl) nameEl.textContent = el.name;
  if (configEl) configEl.textContent = el.config;

  if (viewerRef && typeof viewerRef.load === 'function') {
    viewerRef.load(el);
  }
}

/**
 * 拖拽排序
 */
function bindElectronDrag() {
  const list = $('#electronList');
  if (!list) return;
  const cards = [...list.querySelectorAll('.electron-card')];
  let dragSrcZ = null;

  cards.forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragSrcZ = parseInt(card.dataset.z, 10);
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(dragSrcZ));
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('is-dragging');
      dragSrcZ = null;
      cards.forEach((c) => c.classList.remove('drag-over'));
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const fromZ = dragSrcZ || parseInt(e.dataTransfer.getData('text/plain'), 10);
      const toZ = parseInt(card.dataset.z, 10);
      if (!Number.isFinite(fromZ) || !Number.isFinite(toZ) || fromZ === toZ) return;

      const fi = elementOrder.indexOf(fromZ);
      const ti = elementOrder.indexOf(toZ);
      if (fi < 0 || ti < 0) return;

      elementOrder.splice(fi, 1);
      elementOrder.splice(ti, 0, fromZ);
      await saveOrder();
      renderElectronList();
    });
  });
}

/**
 * 设置编辑模式
 */
export function setElectronEditMode(on) {
  editMode = on;
  const btn = $('#btnEditElectrons');
  if (btn) {
    btn.textContent = on ? '保存' : '编辑';
    btn.classList.toggle('is-active', on);
  }
  if (!on) {
    // 退出编辑时再落盘一次
    saveOrder();
  }
  renderElectronList();
}

/**
 * 初始化列表 UI（不立即 3D load，等 main 挂上 viewer 后再 load）
 */
export async function initElectronList() {
  const btnEdit = $('#btnEditElectrons');
  if (btnEdit) {
    btnEdit.addEventListener('click', () => {
      setElectronEditMode(!editMode);
    });
  }

  // 先画默认顺序，再拉库更新（避免白屏）
  renderElectronList();
  await loadOrderFromServer();

  const firstZ = elementOrder[0] || 1;
  currentElementZ = firstZ;
  const el = ELECTRON_ELEMENTS.find((e) => e.z === firstZ);
  if (el) {
    const symbolEl = $('#electronSymbol');
    const nameEl = $('#electronName');
    const configEl = $('#electronConfig');
    if (symbolEl) symbolEl.textContent = `${el.symbol} (${el.z})`;
    if (nameEl) nameEl.textContent = el.name;
    if (configEl) configEl.textContent = el.config;
  }
  renderElectronList();
}
