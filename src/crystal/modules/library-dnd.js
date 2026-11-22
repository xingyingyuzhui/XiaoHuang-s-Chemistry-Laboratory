/**
 * 晶胞卡片拖拽排序与长按重排（双模式：编辑模式 HTML5 DnD + 任意状态 280ms 长按指针拖拽）
 * 自定义顺序持久化至 localStorage('chem-lab-crystal-order')，新生成的 AI 晶胞始终置顶。
 */

export const ORDER_STORAGE_KEY = 'chem-lab-crystal-order';
const LONG_PRESS_MS = 280;
const EDIT_TOUCH_PRESS_MS = 160;
const MOVE_CANCEL_PX = 6;

export function loadCrystalOrder() {
  try {
    const raw = localStorage.getItem(ORDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((id) => typeof id === 'string' && id.trim()))];
  } catch {
    return [];
  }
}

export function saveCrystalOrder(ids) {
  try {
    const clean = [...new Set((ids || []).filter((id) => typeof id === 'string' && id.trim()))];
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    /* ignore quota/privacy errors */
  }
}

/**
 * 按持久化顺序排列晶胞：未入序的新 AI 晶胞排最前 -> 已保存顺序 -> 其余内置晶胞
 */
export function applyCrystalOrder(customCrystals, builtinCrystals, savedOrder) {
  const custom = Array.isArray(customCrystals) ? customCrystals : [];
  const builtin = Array.isArray(builtinCrystals) ? builtinCrystals : [];
  const order = Array.isArray(savedOrder) ? savedOrder : [];
  if (!order.length) return [...custom, ...builtin];

  const byId = new Map();
  for (const c of custom) if (c?.id) byId.set(c.id, c);
  for (const c of builtin) if (c?.id && !byId.has(c.id)) byId.set(c.id, c);

  const savedSet = new Set(order);
  const result = [];
  const placed = new Set();

  for (const c of custom) {
    if (c?.id && !savedSet.has(c.id) && !placed.has(c.id)) {
      result.push(c);
      placed.add(c.id);
    }
  }
  for (const id of order) {
    const c = byId.get(id);
    if (c && !placed.has(id)) {
      result.push(c);
      placed.add(id);
    }
  }
  for (const c of builtin) {
    if (c?.id && !placed.has(c.id)) {
      result.push(c);
      placed.add(c.id);
    }
  }
  return result;
}

export function reorderIds(currentIds, fromId, toId) {
  if (!fromId || !toId || fromId === toId) return null;
  const next = [...currentIds];
  const fi = next.indexOf(fromId);
  const ti = next.indexOf(toId);
  if (fi < 0 || ti < 0 || fi === ti) return null;
  next.splice(fi, 1);
  next.splice(ti, 0, fromId);
  return next;
}

/**
 * 绑定列表的原生拖拽（编辑模式）+ 长按指针拖拽（触摸/快捷重排）
 */
export function attachCrystalDnd(listEl, { isEditMode, onReorder }) {
  if (!listEl) return { destroy() {} };

  let htmlDragId = null;
  let suppressClickUntil = 0;
  let pressTimer = 0;
  let ptrState = null;

  const clearDragOver = () => {
    listEl.querySelectorAll('.crystal-drawer-item.drag-over').forEach((el) => el.classList.remove('drag-over'));
  };

  const cleanupPointer = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
    if (!ptrState) return;
    const { sourceEl, ghostEl } = ptrState;
    sourceEl?.classList.remove('is-dragging');
    ghostEl?.remove();
    listEl.classList.remove('is-pointer-dragging');
    clearDragOver();
    ptrState = null;
  };

  const activatePointerDrag = () => {
    pressTimer = 0;
    if (!ptrState || ptrState.active) return;
    ptrState.active = true;
    suppressClickUntil = Date.now() + 450;

    const { sourceEl, startX, startY } = ptrState;
    const rect = sourceEl.getBoundingClientRect();
    ptrState.offsetX = startX - rect.left;
    ptrState.offsetY = startY - rect.top;

    const ghost = sourceEl.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.className = 'crystal-drag-ghost';
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0) scale(1.04)`;
    document.body.appendChild(ghost);
    ptrState.ghostEl = ghost;

    sourceEl.classList.add('is-dragging');
    listEl.classList.add('is-pointer-dragging');
  };

  /* ── 1. 编辑模式原生 HTML5 DnD ── */
  const onDragStart = (e) => {
    const card = e.target.closest('.crystal-drawer-item[data-id]');
    if (!card || !isEditMode?.() || e.target.closest('[data-del-id]')) {
      e.preventDefault();
      return;
    }
    htmlDragId = card.dataset.id;
    card.classList.add('is-dragging');
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', htmlDragId);
    }
  };

  const onDragOver = (e) => {
    if (!htmlDragId) return;
    const card = e.target.closest('.crystal-drawer-item[data-id]');
    if (!card) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    clearDragOver();
    if (card.dataset.id !== htmlDragId) card.classList.add('drag-over');
  };

  const onDragLeave = (e) => {
    const card = e.target.closest('.crystal-drawer-item[data-id]');
    if (card && !card.contains(e.relatedTarget)) card.classList.remove('drag-over');
  };

  const onDrop = (e) => {
    const card = e.target.closest('.crystal-drawer-item[data-id]');
    if (!card) return;
    e.preventDefault();
    const from = htmlDragId || e.dataTransfer?.getData('text/plain');
    const to = card.dataset.id;
    clearDragOver();
    htmlDragId = null;
    if (from && to && from !== to) onReorder?.(from, to);
  };

  const onDragEnd = () => {
    listEl.querySelectorAll('.crystal-drawer-item.is-dragging').forEach((el) => el.classList.remove('is-dragging'));
    clearDragOver();
    htmlDragId = null;
  };

  /* ── 2. 长按指针拖拽（支持触屏 + 桌面任意状态快捷重排） ── */
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('[data-del-id]')) return;
    if (isEditMode?.() && e.pointerType === 'mouse') return; // 编辑模式桌面端走 HTML5 DnD
    const card = e.target.closest('.crystal-drawer-item[data-id]');
    if (!card) return;

    cleanupPointer();
    ptrState = {
      pointerId: e.pointerId,
      sourceEl: card,
      sourceId: card.dataset.id,
      targetId: null,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: 0,
      offsetY: 0,
      active: false,
      ghostEl: null,
    };
    const delay = isEditMode?.() ? EDIT_TOUCH_PRESS_MS : LONG_PRESS_MS;
    pressTimer = window.setTimeout(activatePointerDrag, delay);
  };

  const onPointerMove = (e) => {
    if (!ptrState || e.pointerId !== ptrState.pointerId) return;
    if (!ptrState.active) {
      if (Math.hypot(e.clientX - ptrState.startX, e.clientY - ptrState.startY) > MOVE_CANCEL_PX) {
        cleanupPointer();
      }
      return;
    }
    e.preventDefault();
    const x = e.clientX - ptrState.offsetX;
    const y = e.clientY - ptrState.offsetY;
    if (ptrState.ghostEl) {
      ptrState.ghostEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1.04)`;
    }
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('.crystal-drawer-item[data-id]');
    const targetCard = hit && listEl.contains(hit) ? hit : null;
    clearDragOver();
    if (targetCard && targetCard.dataset.id !== ptrState.sourceId) {
      targetCard.classList.add('drag-over');
      ptrState.targetId = targetCard.dataset.id;
    } else {
      ptrState.targetId = null;
    }
  };

  const onPointerUp = (e) => {
    if (!ptrState || e.pointerId !== ptrState.pointerId) return;
    const { active, sourceId, targetId } = ptrState;
    cleanupPointer();
    if (active) {
      suppressClickUntil = Date.now() + 450;
      if (targetId && targetId !== sourceId) onReorder?.(sourceId, targetId);
    }
  };

  const onPointerCancel = (e) => {
    if (ptrState && e.pointerId === ptrState.pointerId) cleanupPointer();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && ptrState) cleanupPointer();
  };

  const onClickCapture = (e) => {
    if (Date.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressClickUntil = 0;
    }
  };

  listEl.addEventListener('dragstart', onDragStart);
  listEl.addEventListener('dragover', onDragOver);
  listEl.addEventListener('dragleave', onDragLeave);
  listEl.addEventListener('drop', onDrop);
  listEl.addEventListener('dragend', onDragEnd);
  listEl.addEventListener('pointerdown', onPointerDown);
  listEl.addEventListener('click', onClickCapture, true);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  window.addEventListener('blur', cleanupPointer);
  window.addEventListener('keydown', onKeyDown);

  return {
    destroy() {
      cleanupPointer();
      listEl.removeEventListener('dragstart', onDragStart);
      listEl.removeEventListener('dragover', onDragOver);
      listEl.removeEventListener('dragleave', onDragLeave);
      listEl.removeEventListener('drop', onDrop);
      listEl.removeEventListener('dragend', onDragEnd);
      listEl.removeEventListener('pointerdown', onPointerDown);
      listEl.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('blur', cleanupPointer);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}
