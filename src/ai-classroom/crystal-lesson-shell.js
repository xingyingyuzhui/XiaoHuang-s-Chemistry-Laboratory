/**
 * 课堂 · 晶体探究影院级主舞台（Stage-First Cinema Shell）
 * 默认直接进入全画幅深曜石 3D 影院舞台，仅保留极简三区玻璃控件；
 * 「备课 / AI」按需右侧滑出抽屉，并实时同步上下文给「拉下小黄」。
 */

import '../styles/_crystal.css';
import { STAGE_PRESETS, normalizeLessonPlan } from '../crystal/stage-spec/schema.js';
import { mountChemStage } from '../crystal/stages/index.js';
import { aiApi } from '../api/client.js';
import { registerPageAssistant, notifyPageContextChange } from '../assistant/page-context.js';
import { createCrystalLessonStore } from './crystal-lesson-store.js';
import { createCrystalLessonDrawer } from './crystal-lesson-editor.js';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const isTypingTarget = (el) => Boolean(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));

/**
 * 创建课堂「晶体探究」影院舞台控制器
 * @param {{ hostEl: HTMLElement | null }} opts
 * @returns {{ onEnter: () => void, onLeave: () => void, resize: () => void, destroy: () => void }}
 */
export function createCrystalLessonShell({ hostEl } = {}) {
  if (!hostEl) return { onEnter() {}, onLeave() {}, resize() {}, destroy() {} };

  hostEl.innerHTML = `<div class="cl-cinema-frame">
    <header class="cl-topbar">
      <div class="cl-topbar-left">
        <button type="button" class="cl-lesson-trigger" data-act="toggle-menu" aria-haspopup="listbox" aria-expanded="false">
          <span class="cl-lesson-trigger-text"></span><span class="cl-caret" aria-hidden="true">▾</span>
        </button>
        <div class="cl-lesson-menu" role="listbox" aria-label="切换晶体探究课例" hidden></div>
      </div>
      <div class="cl-topbar-center">
        <div class="cl-dots" role="tablist" aria-label="本课探究环节"></div>
        <strong class="cl-slide-title"></strong>
      </div>
      <div class="cl-topbar-right">
        <button type="button" class="cl-glass-pill cl-cue-btn" data-act="toggle-cue" aria-expanded="false">提词</button>
        <button type="button" class="cl-glass-pill cl-drawer-btn" data-act="toggle-drawer" aria-expanded="false">备课 / AI</button>
      </div>
    </header>
    <div class="cl-cue-ribbon" hidden>
      <span class="cl-cue-tag">提词</span><p class="cl-cue-text"></p>
      <button type="button" class="cl-cue-close" data-act="close-cue" aria-label="收起提词">×</button>
    </div>
    <main class="cl-stage-zone">
      <div class="cl-stage-canvas"></div>
      <div class="cl-safe-rail" aria-live="polite" hidden>
        <div class="cl-dual-labels" hidden><span class="cl-dual-badge is-left"></span><span class="cl-dual-badge is-right"></span></div>
        <div class="cl-status-pill" hidden></div>
      </div>
    </main>
    <footer class="cl-bottom-dock">
      <button type="button" class="cl-nav-pill" data-act="prev">‹ 上一步</button>
      <div class="cl-stage-controls"></div>
      <button type="button" class="cl-nav-pill is-next" data-act="next">下一步 ›</button>
    </footer>
    <div class="cl-drawer-backdrop" data-act="close-drawer" hidden></div>
    <aside class="cl-drawer-host" aria-label="备课与 AI 一键生成课例" hidden></aside>
  </div>`;

  const [
    triggerBtn, triggerTextEl, menuEl, dotsEl, slideTitleEl, cueBtn, drawerBtn,
    cueRibbonEl, cueTextEl, stageCanvasEl, safeRailEl, dualLabelsEl, leftBadgeEl,
    rightBadgeEl, statusPillEl, stageControlsEl, prevBtn, nextBtn, backdropEl, drawerHostEl,
  ] = [
    '.cl-lesson-trigger', '.cl-lesson-trigger-text', '.cl-lesson-menu', '.cl-dots', '.cl-slide-title',
    '.cl-cue-btn', '.cl-drawer-btn', '.cl-cue-ribbon', '.cl-cue-text', '.cl-stage-canvas',
    '.cl-safe-rail', '.cl-dual-labels', '.cl-dual-badge.is-left', '.cl-dual-badge.is-right',
    '.cl-status-pill', '.cl-stage-controls', '[data-act="prev"]', '[data-act="next"]',
    '.cl-drawer-backdrop', '.cl-drawer-host',
  ].map((s) => hostEl.querySelector(s));

  const panelAiEl = document.getElementById('panel-ai');
  const store = createCrystalLessonStore();
  let slideIdx = 0, menuOpen = false, cueOpen = false, drawerOpen = false;
  let activeStage = null, mountedSlideId = '', sectionActive = false, destroyed = false, resizeRaf = 0;
  let panelVisible = panelAiEl ? !panelAiEl.hidden : true;

  const isEffectivelyActive = () => sectionActive && panelVisible && !destroyed;
  const notifyAssistant = () => { if (sectionActive && !destroyed) notifyPageContextChange('ai'); };
  const syncSafeRail = () => { safeRailEl.hidden = dualLabelsEl.hidden && statusPillEl.hidden; };

  function currentSlide() {
    const slides = store.getActiveLesson()?.slides || [];
    if (!slides.length) return null;
    slideIdx = Math.max(0, Math.min(slideIdx, slides.length - 1));
    return slides[slideIdx];
  }

  function setCaption(text) {
    const clean = String(text || '').trim();
    statusPillEl.textContent = clean; statusPillEl.hidden = !clean; syncSafeRail();
  }

  function setDualLabels(leftText, rightText) {
    const left = String(leftText || '').trim(), right = String(rightText || '').trim();
    leftBadgeEl.textContent = left; leftBadgeEl.hidden = !left;
    rightBadgeEl.textContent = right; rightBadgeEl.hidden = !right;
    dualLabelsEl.hidden = !left && !right; syncSafeRail();
  }

  function renderLessonMenu() {
    const active = store.getActiveLesson();
    menuEl.innerHTML = store.getLessons().map((l) => `<button type="button" class="cl-lesson-item${l.id === active.id ? ' is-active' : ''}" data-pick-lesson="${esc(l.id)}" role="option" aria-selected="${l.id === active.id}"><span class="cl-lesson-item-main">${l.isAi ? '<em class="cl-ai-tag">AI</em>' : ''}<span class="cl-lesson-item-title">${esc(l.title)}</span></span><span class="cl-lesson-item-count">${l.slides.length} 步</span></button>`).join('');
  }

  function syncChrome() {
    const lesson = store.getActiveLesson(), slides = lesson?.slides || [], slide = currentSlide();
    triggerTextEl.textContent = lesson?.title || '晶体探究';
    slideTitleEl.textContent = slide?.title || '暂无环节';
    dotsEl.innerHTML = slides.map((s, i) => `<button type="button" class="cl-dot${i === slideIdx ? ' is-active' : ''}" data-jump-slide="${i}" role="tab" aria-selected="${i === slideIdx}" title="${esc(s.title)}" aria-label="第 ${i + 1} 步：${esc(s.title)}"></button>`).join('');
    prevBtn.disabled = slideIdx <= 0;
    nextBtn.disabled = slideIdx >= slides.length - 1;
    cueTextEl.textContent = slide?.cue || '暂无讲授提词，可点击「备课 / AI」为本环节补充课堂引导。';
    cueRibbonEl.hidden = !cueOpen;
    cueBtn.classList.toggle('is-active', cueOpen);
    cueBtn.setAttribute('aria-expanded', cueOpen ? 'true' : 'false');
    if (menuOpen) renderLessonMenu();
  }

  function setMenuOpen(open) {
    menuOpen = Boolean(open);
    if (menuOpen) renderLessonMenu();
    menuEl.hidden = !menuOpen;
    triggerBtn.classList.toggle('is-open', menuOpen);
    triggerBtn.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
  }

  function setDrawerOpen(open) {
    drawerOpen = Boolean(open);
    if (drawerOpen) { setMenuOpen(false); drawer.render(); }
    drawerHostEl.hidden = !drawerOpen; backdropEl.hidden = !drawerOpen;
    drawerBtn.classList.toggle('is-active', drawerOpen);
    drawerBtn.setAttribute('aria-expanded', drawerOpen ? 'true' : 'false');
  }

  function destroyStage() {
    if (!activeStage) return;
    try { activeStage.destroy?.(); } catch (err) { console.warn('[classroom-crystal] destroy stage failed:', err); }
    activeStage = null; mountedSlideId = ''; stageCanvasEl.innerHTML = ''; stageControlsEl.innerHTML = '';
  }

  function scheduleResize() {
    if (resizeRaf || !isEffectivelyActive()) return;
    resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; if (isEffectivelyActive()) activeStage?.resize?.(); });
  }

  function syncPlayback() {
    if (destroyed || !activeStage) return;
    if (isEffectivelyActive()) { activeStage.resume?.(); scheduleResize(); } else activeStage.pause?.();
  }

  function mountSlide(idx, { keepStageIfSame = false } = {}) {
    const slides = store.getActiveLesson()?.slides || [];
    if (!slides.length) { destroyStage(); syncChrome(); return; }
    slideIdx = Math.max(0, Math.min(idx, slides.length - 1));
    const slide = slides[slideIdx];
    syncChrome();
    if (drawerOpen) drawer.render();
    if (keepStageIfSame && activeStage && mountedSlideId === slide.id) { notifyAssistant(); return; }
    destroyStage(); setCaption(''); setDualLabels(null, null);
    mountedSlideId = slide.id;
    activeStage = mountChemStage(slide.stage, stageCanvasEl, stageControlsEl, { onCaption: setCaption, onDualLabels: setDualLabels });
    if (!isEffectivelyActive()) activeStage?.pause?.(); else scheduleResize();
    notifyAssistant();
  }

  const drawer = createCrystalLessonDrawer({
    hostEl: drawerHostEl, store, aiApi, presets: STAGE_PRESETS, normalizePlan: normalizeLessonPlan,
    getActiveSlideIndex: () => slideIdx,
    onSelectSlide: (idx, opts) => mountSlide(idx, opts),
    onLessonChanged: ({ closeDrawer = false, slideIdx: nextIdx = 0 } = {}) => {
      if (closeDrawer) setDrawerOpen(false);
      mountSlide(nextIdx);
    },
    onMetaChanged: () => { syncChrome(); notifyAssistant(); },
    onClose: () => setDrawerOpen(false),
  });

  const unregisterAssistant = registerPageAssistant('ai', () => {
    if (!sectionActive || destroyed) return null;
    const slide = currentSlide();
    if (!slide) return null;
    const lesson = store.getActiveLesson();
    return {
      title: slide.title || '晶体探究',
      module: slide.category === 'properties' ? 'properties' : 'basics',
      summary: [lesson?.title, slide.summary, slide.cue].filter(Boolean).join(' · '),
      qa: slide.qa || null,
      quickQuestions: Array.isArray(slide.quickQuestions) ? slide.quickQuestions : [],
      onAiAction: null,
    };
  });

  const onHostClick = (e) => {
    const pickLesson = e.target.closest('[data-pick-lesson]')?.dataset.pickLesson;
    if (pickLesson) { store.setActiveLesson(pickLesson); setMenuOpen(false); mountSlide(0); return; }
    const jumpSlide = e.target.closest('[data-jump-slide]')?.dataset.jumpSlide;
    if (jumpSlide !== undefined) { mountSlide(Number(jumpSlide)); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'toggle-menu') setMenuOpen(!menuOpen);
    else if (act === 'toggle-cue') { cueOpen = !cueOpen; syncChrome(); scheduleResize(); }
    else if (act === 'close-cue') { cueOpen = false; syncChrome(); scheduleResize(); }
    else if (act === 'toggle-drawer') setDrawerOpen(!drawerOpen);
    else if (act === 'close-drawer') setDrawerOpen(false);
    else if (act === 'prev' && slideIdx > 0) mountSlide(slideIdx - 1);
    else if (act === 'next') mountSlide(slideIdx + 1);
  };

  const onDocClick = (e) => { if (menuOpen && !e.target.closest('.cl-topbar-left')) setMenuOpen(false); };
  const onKeyDown = (e) => {
    if (!isEffectivelyActive() || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      if (menuOpen) setMenuOpen(false);
      else if (drawerOpen) setDrawerOpen(false);
      else if (cueOpen) { cueOpen = false; syncChrome(); scheduleResize(); }
      return;
    }
    if (drawerOpen) return;
    if (e.key === 'ArrowLeft' && slideIdx > 0) { e.preventDefault(); mountSlide(slideIdx - 1); }
    else if (e.key === 'ArrowRight' && slideIdx < (store.getActiveLesson()?.slides?.length || 0) - 1) {
      e.preventDefault(); mountSlide(slideIdx + 1);
    }
  };

  hostEl.addEventListener('click', onHostClick);
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeyDown);

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleResize()) : null;
  resizeObserver?.observe(stageCanvasEl);

  const panelObserver = panelAiEl && typeof MutationObserver !== 'undefined'
    ? new MutationObserver(() => {
        const nextVisible = !panelAiEl.hidden;
        if (nextVisible === panelVisible) return;
        panelVisible = nextVisible; syncPlayback();
        if (panelVisible && sectionActive) notifyPageContextChange('ai');
      })
    : null;
  panelObserver?.observe(panelAiEl, { attributes: true, attributeFilter: ['hidden'] });
  syncChrome();

  return {
    onEnter() {
      if (destroyed) return;
      sectionActive = true;
      panelVisible = panelAiEl ? !panelAiEl.hidden : true;
      if (!activeStage) mountSlide(slideIdx);
      else { syncPlayback(); notifyPageContextChange('ai'); }
    },
    onLeave() {
      if (destroyed) return;
      sectionActive = false; setMenuOpen(false); activeStage?.pause?.();
      const notifyLeave = () => { if (!sectionActive && !destroyed) notifyPageContextChange('ai'); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(notifyLeave);
      else setTimeout(notifyLeave, 0);
    },
    resize() { scheduleResize(); },
    destroy() {
      if (destroyed) return;
      destroyed = true; sectionActive = false;
      if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0; }
      resizeObserver?.disconnect(); panelObserver?.disconnect();
      hostEl.removeEventListener('click', onHostClick);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
      unregisterAssistant?.(); destroyStage(); drawer.destroy(); hostEl.innerHTML = '';
    },
  };
}
