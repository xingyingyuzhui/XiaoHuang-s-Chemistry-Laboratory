/**
 * 「拉下小黄」交互与全站悬浮小黄伴侣（长按/下拉召唤、自由拖拽、拖回左上角归位）
 */

import { createXiaohuangPanel } from './xiaohuang-panel.js';

const HOLD_MS = 220;
const PULL_DOWN_Y = 14;
const CLICK_DRAG_MAX = 8;
const RETURN_RADIUS = 70;
const BADGE_SIZE = 56;
const SAFE_MARGIN = 12;

let initialized = false;
let suppressNextClick = false;
let suppressTimer = 0;

export function consumeBrandTipSuppression() {
  if (!suppressNextClick) return false;
  suppressNextClick = false;
  if (suppressTimer) { window.clearTimeout(suppressTimer); suppressTimer = 0; }
  return true;
}

function markClickSuppressed() {
  suppressNextClick = true;
  if (suppressTimer) window.clearTimeout(suppressTimer);
  suppressTimer = window.setTimeout(() => { suppressNextClick = false; suppressTimer = 0; }, 450);
}

function clampPos(left, top) {
  const maxL = Math.max(SAFE_MARGIN, window.innerWidth - BADGE_SIZE - SAFE_MARGIN);
  const maxT = Math.max(SAFE_MARGIN, window.innerHeight - BADGE_SIZE - SAFE_MARGIN);
  return {
    left: Math.round(Math.min(Math.max(SAFE_MARGIN, left), maxL)),
    top: Math.round(Math.min(Math.max(SAFE_MARGIN, top), maxT)),
  };
}

const centerOf = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

function createTetherOverlay() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'xh-tether');
  svg.setAttribute('aria-hidden', 'true');
  svg.hidden = true;
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('class', 'xh-tether-line');
  svg.appendChild(line);
  document.body.appendChild(svg);
  return {
    show(x1, y1, x2, y2) {
      svg.hidden = false;
      line.setAttribute('x1', String(Math.round(x1)));
      line.setAttribute('y1', String(Math.round(y1)));
      line.setAttribute('x2', String(Math.round(x2)));
      line.setAttribute('y2', String(Math.round(y2)));
    },
    hide: () => { svg.hidden = true; },
  };
}

export function initXiaohuangDock({ onSummon } = {}) {
  if (initialized) return;
  const brandIcon = document.getElementById('appBrandIcon');
  if (!brandIcon) return;
  initialized = true;
  brandIcon.classList.add('xh-brand-anchor');

  const companion = document.createElement('div');
  companion.className = 'xh-companion';
  companion.setAttribute('role', 'button');
  companion.setAttribute('tabindex', '0');
  companion.setAttribute('title', '点击打开小黄助教 · 拖回左上角收起');
  companion.setAttribute('aria-label', '小黄随堂助教，点击打开面板，拖回左上角或双击收起');
  companion.hidden = true;
  companion.innerHTML = `
    <img class="xh-companion-img" src="/brand-avatar.png" alt="小黄助教" draggable="false" />
    <span class="xh-companion-ring" aria-hidden="true"></span>
    <button type="button" class="xh-dock-close" aria-label="收起小黄" title="收起小黄">×</button>
  `;
  document.body.appendChild(companion);

  const imgEl = companion.querySelector('.xh-companion-img');
  const closeBtn = companion.querySelector('.xh-dock-close');
  const tether = createTetherOverlay();
  const panel = createXiaohuangPanel({ onClose: () => companion.classList.remove('is-panel-open') });

  let dockedOut = false;
  let posLeft = 24;
  let posTop = 88;
  let clickGuardUntil = 0;

  const syncAvatar = () => {
    const src = brandIcon.getAttribute('src') || '/brand-avatar.png';
    if (imgEl && imgEl.getAttribute('src') !== src) imgEl.setAttribute('src', src);
  };
  const applyPos = (left, top) => {
    const p = clampPos(left, top);
    posLeft = p.left;
    posTop = p.top;
    companion.style.left = `${posLeft}px`;
    companion.style.top = `${posTop}px`;
  };
  const distToBrand = (cx, cy) => {
    const c = centerOf(brandIcon.getBoundingClientRect());
    return Math.hypot(cx - c.x, cy - c.y);
  };

  function showCompanionAt(cx, cy) {
    syncAvatar();
    dockedOut = true;
    companion.hidden = false;
    applyPos(cx - BADGE_SIZE / 2, cy - BADGE_SIZE / 2);
    requestAnimationFrame(() => companion.classList.add('is-visible'));
  }

  function dockHome() {
    panel.close();
    tether.hide();
    dockedOut = false;
    brandIcon.classList.remove('xh-brand-pulling', 'xh-brand-pressing', 'xh-return-target');
    companion.classList.remove('is-visible', 'is-dragging', 'is-returning', 'is-panel-open');
    companion.hidden = true;
  }

  function togglePanel() {
    if (!dockedOut) return;
    panel.toggle(companion.getBoundingClientRect());
    companion.classList.toggle('is-panel-open', panel.isOpen());
  }

  // 1. 左上角 #appBrandIcon：短点小知识，长按(≥220ms)或下拉(>14px)召唤小黄
  brandIcon.addEventListener('pointerdown', (downEv) => {
    if (downEv.pointerType === 'mouse' && downEv.button !== 0) return;
    const pointerId = downEv.pointerId;
    const startX = downEv.clientX;
    const startY = downEv.clientY;
    let lastX = startX;
    let lastY = startY;
    let pullActive = false;
    let everLeftHome = false;
    const wasDockedOut = dockedOut;

    brandIcon.classList.add('xh-brand-pressing');
    const enterPull = (cx, cy) => {
      if (pullActive) return;
      pullActive = true;
      markClickSuppressed();
      onSummon?.();
      brandIcon.classList.remove('xh-brand-pressing');
      brandIcon.classList.add('xh-brand-pulling');
      panel.close();
      showCompanionAt(cx, cy);
      companion.classList.add('is-dragging');
      const bc = centerOf(brandIcon.getBoundingClientRect());
      tether.show(bc.x, bc.y, posLeft + BADGE_SIZE / 2, posTop + BADGE_SIZE / 2);
      try { brandIcon.setPointerCapture(pointerId); } catch { /* ignore */ }
    };
    const holdTimer = window.setTimeout(() => enterPull(lastX, lastY), HOLD_MS);

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      lastX = ev.clientX;
      lastY = ev.clientY;
      const dx = lastX - startX;
      const dy = lastY - startY;
      if (!pullActive) {
        if (dy > PULL_DOWN_Y) { window.clearTimeout(holdTimer); enterPull(lastX, lastY); }
        else if (Math.hypot(dx, dy) > PULL_DOWN_Y) { window.clearTimeout(holdTimer); brandIcon.classList.remove('xh-brand-pressing'); }
        return;
      }
      ev.preventDefault();
      applyPos(lastX - BADGE_SIZE / 2, lastY - BADGE_SIZE / 2);
      const bc = centerOf(brandIcon.getBoundingClientRect());
      const ccx = posLeft + BADGE_SIZE / 2;
      const ccy = posTop + BADGE_SIZE / 2;
      tether.show(bc.x, bc.y, ccx, ccy);
      const d = Math.hypot(ccx - bc.x, ccy - bc.y);
      if (d > RETURN_RADIUS) everLeftHome = true;
      const returning = everLeftHome && d <= RETURN_RADIUS;
      brandIcon.classList.toggle('xh-return-target', returning);
      companion.classList.toggle('is-returning', returning);
    };

    const finish = (ev) => {
      if (ev.pointerId !== pointerId) return;
      window.clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      try { brandIcon.releasePointerCapture(pointerId); } catch { /* ignore */ }
      brandIcon.classList.remove('xh-brand-pressing', 'xh-brand-pulling', 'xh-return-target');
      tether.hide();
      if (!pullActive) return;
      companion.classList.remove('is-dragging', 'is-returning');
      clickGuardUntil = performance.now() + 260;
      if (ev.type === 'pointercancel') { if (!wasDockedOut) dockHome(); return; }
      const d = distToBrand(posLeft + BADGE_SIZE / 2, posTop + BADGE_SIZE / 2);
      if (everLeftHome && d <= RETURN_RADIUS) { dockHome(); return; }
      if (!everLeftHome && d < 46) {
        const rect = brandIcon.getBoundingClientRect();
        applyPos(rect.left + 8, rect.bottom + 18);
      }
      panel.open(companion.getBoundingClientRect());
      companion.classList.add('is-panel-open');
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  });

  // 2. 悬浮小黄：自由拖拽、拖回左上角归位、单击开关面板、双击/×收起
  closeBtn?.addEventListener('pointerdown', (e) => e.stopPropagation());
  closeBtn?.addEventListener('click', (e) => { e.stopPropagation(); dockHome(); });
  companion.addEventListener('dblclick', (e) => { e.preventDefault(); dockHome(); });
  companion.addEventListener('keydown', (e) => {
    if (e.target !== closeBtn && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); togglePanel(); }
  });

  companion.addEventListener('pointerdown', (downEv) => {
    if (downEv.target?.closest?.('.xh-dock-close')) return;
    if (downEv.pointerType === 'mouse' && downEv.button !== 0) return;
    const pointerId = downEv.pointerId;
    const startX = downEv.clientX;
    const startY = downEv.clientY;
    const origLeft = posLeft;
    const origTop = posTop;
    let moved = false;

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > CLICK_DRAG_MAX) {
        moved = true;
        companion.classList.add('is-dragging');
        try { companion.setPointerCapture(pointerId); } catch { /* ignore */ }
      }
      if (!moved) return;
      ev.preventDefault();
      applyPos(origLeft + dx, origTop + dy);
      if (panel.isOpen()) panel.reposition(companion.getBoundingClientRect());
      const returning = distToBrand(posLeft + BADGE_SIZE / 2, posTop + BADGE_SIZE / 2) <= RETURN_RADIUS;
      brandIcon.classList.toggle('xh-return-target', returning);
      companion.classList.toggle('is-returning', returning);
    };

    const finish = (ev) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      try { companion.releasePointerCapture(pointerId); } catch { /* ignore */ }
      brandIcon.classList.remove('xh-return-target');
      companion.classList.remove('is-dragging', 'is-returning');
      if (!moved) {
        if (ev.type === 'pointerup' && performance.now() > clickGuardUntil) togglePanel();
        return;
      }
      if (distToBrand(posLeft + BADGE_SIZE / 2, posTop + BADGE_SIZE / 2) <= RETURN_RADIUS) dockHome();
      else if (panel.isOpen()) panel.reposition(companion.getBoundingClientRect());
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  });

  window.addEventListener('resize', () => {
    if (!dockedOut) return;
    applyPos(posLeft, posTop);
    if (panel.isOpen()) panel.reposition(companion.getBoundingClientRect());
  });
}
