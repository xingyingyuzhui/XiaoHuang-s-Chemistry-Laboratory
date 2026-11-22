/**
 * 课堂 · 晶体探究控制台（课前备课态 Prep Mode <-> 沉浸授课态 Teach Mode）
 * 备课态编排课例与 AI 一键排课，一键进入 100% 开放 3D 舞台授课态，并向「拉下小黄」同步上下文。
 */

import '../styles/_crystal.css';
import { STAGE_CATALOG, mountCrystalStage } from '../crystal/stages/index.js';
import { aiApi } from '../api/client.js';
import { registerPageAssistant, notifyPageContextChange } from '../assistant/page-context.js';
import { createCrystalLessonStore } from './crystal-lesson-store.js';
import { createCrystalLessonEditor } from './crystal-lesson-editor.js';

const STAGE_MAP = new Map(STAGE_CATALOG.map((s) => [s.id, s]));

function isTypingTarget(el) {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(el.isContentEditable);
}

/**
 * 创建课堂「晶体探究」控制器
 * @param {{ hostEl: HTMLElement | null }} opts
 * @returns {{ onEnter: () => void, onLeave: () => void, resize: () => void, destroy: () => void }}
 */
export function createCrystalLessonShell({ hostEl } = {}) {
  if (!hostEl) return { onEnter() {}, onLeave() {}, resize() {}, destroy() {} };

  hostEl.innerHTML = `
    <div class="crystal-lesson-shell">
      <div class="cl-prep-host"></div>
      <div class="cl-teach-host" hidden>
        <header class="cl-teach-bar">
          <button type="button" class="crystal-btn crystal-btn-sm crystal-btn-ghost cl-back-btn" data-teach-act="back">← 返回备课</button>
          <div class="cl-teach-heading">
            <span class="cl-teach-progress"></span>
            <strong class="cl-teach-title"></strong>
          </div>
          <div class="cl-teach-right">
            <span class="cl-teach-status" aria-live="polite" hidden></span>
            <button type="button" class="crystal-btn crystal-btn-sm crystal-btn-ghost cl-cue-toggle" data-teach-act="toggle-cue" aria-expanded="false">教师提词</button>
          </div>
        </header>
        <div class="cl-cue-strip" hidden>
          <span class="cl-cue-badge">讲授提词</span>
          <p class="cl-cue-text"></p>
          <button type="button" class="cl-icon-btn" data-teach-act="close-cue" aria-label="收起提词">×</button>
        </div>
        <div class="crystal-stage-viewport cl-teach-viewport"></div>
        <footer class="crystal-actionbar cl-teach-footer">
          <button type="button" class="crystal-btn crystal-btn-sm crystal-btn-ghost cl-nav-btn" data-teach-act="prev">← 上一步</button>
          <div class="cl-stage-controls"></div>
          <button type="button" class="crystal-btn crystal-btn-sm crystal-btn-primary cl-nav-btn" data-teach-act="next">下一步 →</button>
        </footer>
      </div>
    </div>`;

  const q = (sel) => hostEl.querySelector(sel);
  const [prepHostEl, teachHostEl, progressEl, titleEl, statusEl, cueToggleEl, cueStripEl, cueTextEl, stageViewportEl, stageControlsEl, prevBtn, nextBtn] = [
    '.cl-prep-host', '.cl-teach-host', '.cl-teach-progress', '.cl-teach-title', '.cl-teach-status',
    '.cl-cue-toggle', '.cl-cue-strip', '.cl-cue-text', '.cl-teach-viewport', '.cl-stage-controls',
    '[data-teach-act="prev"]', '[data-teach-act="next"]',
  ].map(q);
  const panelAiEl = document.getElementById('panel-ai');

  const store = createCrystalLessonStore();
  let mode = 'prep', teachStepIdx = 0, cueOpen = false, activeStage = null;
  let sectionActive = false, panelVisible = panelAiEl ? !panelAiEl.hidden : true, destroyed = false, resizeRaf = 0;

  const isEffectivelyActive = () => sectionActive && panelVisible && !destroyed;
  const notifyAssistant = () => { if (sectionActive && !destroyed) notifyPageContextChange('ai'); };

  function currentStep() {
    const lesson = store.getActiveLesson();
    if (!lesson?.steps?.length) return null;
    if (mode === 'teach') return lesson.steps[Math.max(0, Math.min(teachStepIdx, lesson.steps.length - 1))];
    return editor.getSelectedStep() || lesson.steps[0];
  }

  function destroyTeachStage() {
    if (!activeStage) return;
    try { activeStage.destroy?.(); } catch (err) { console.warn('[classroom-crystal] destroy stage failed:', err); }
    activeStage = null;
    stageViewportEl.innerHTML = '';
    stageControlsEl.innerHTML = '';
  }

  function scheduleResize() {
    if (resizeRaf || !isEffectivelyActive()) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      if (!isEffectivelyActive()) return;
      if (mode === 'teach') activeStage?.resize?.();
      else editor.resizePreview();
    });
  }

  function syncPlayback() {
    if (destroyed) return;
    if (mode === 'teach') {
      if (!activeStage) return;
      if (isEffectivelyActive()) { activeStage.resume?.(); scheduleResize(); }
      else activeStage.pause?.();
    } else if (isEffectivelyActive()) {
      editor.resumePreview();
    } else {
      editor.pausePreview();
    }
  }

  function updateCaption(text) {
    const clean = String(text || '').trim();
    statusEl.textContent = clean;
    statusEl.hidden = !clean;
  }

  function syncCueUi(step) {
    const note = String(step?.teacherNote || '').trim();
    cueTextEl.textContent = note || '暂无课前讲授提词，可返回备课态为本环节补充提问节奏。';
    cueStripEl.hidden = !cueOpen;
    cueToggleEl.classList.toggle('is-active', cueOpen);
    cueToggleEl.setAttribute('aria-expanded', cueOpen ? 'true' : 'false');
  }

  function mountTeachStep(idx) {
    const lesson = store.getActiveLesson();
    const total = lesson?.steps?.length || 0;
    if (!total) { enterPrepMode(); return; }
    teachStepIdx = Math.max(0, Math.min(idx, total - 1));
    const step = lesson.steps[teachStepIdx];
    const stageMeta = STAGE_MAP.get(step.stageId);

    destroyTeachStage();
    updateCaption('');
    progressEl.textContent = `第 ${teachStepIdx + 1} / ${total} 步`;
    titleEl.textContent = step.title || stageMeta?.title || step.stageId;
    prevBtn.disabled = teachStepIdx <= 0;
    nextBtn.disabled = teachStepIdx >= total - 1;
    syncCueUi(step);

    activeStage = mountCrystalStage(step.stageId, stageViewportEl, stageControlsEl, {
      onCaption: (caption) => updateCaption(caption),
    });

    if (!isEffectivelyActive()) activeStage?.pause?.();
    else scheduleResize();
    notifyAssistant();
  }

  function enterTeachMode(startIdx = 0) {
    if (!store.getActiveLesson()?.steps?.length) return;
    editor.closePreview();
    mode = 'teach';
    cueOpen = false;
    prepHostEl.hidden = true;
    teachHostEl.hidden = false;
    mountTeachStep(startIdx);
  }

  function enterPrepMode() {
    destroyTeachStage();
    mode = 'prep';
    cueOpen = false;
    cueStripEl.hidden = true;
    teachHostEl.hidden = true;
    prepHostEl.hidden = false;
    editor.render();
    notifyAssistant();
  }

  const editor = createCrystalLessonEditor({
    hostEl: prepHostEl,
    store,
    stageCatalog: STAGE_CATALOG,
    mountStage: mountCrystalStage,
    aiApi,
    onStartTeach: (idx) => enterTeachMode(idx),
    onContextChange: () => notifyAssistant(),
  });

  const unregisterAssistant = registerPageAssistant('ai', () => {
    if (!sectionActive || destroyed) return null;
    const step = currentStep();
    if (!step) return null;
    const stage = STAGE_MAP.get(step.stageId);
    const lesson = store.getActiveLesson();
    return {
      title: step.title || stage?.title || '晶体探究',
      module: stage?.category === 'properties' ? 'properties' : 'basics',
      summary: [lesson?.title, stage?.summary, step.teacherNote].filter(Boolean).join(' · '),
      qa: step.qa || stage?.qa || null,
      quickQuestions: Array.isArray(stage?.quickQuestions) ? stage.quickQuestions : [],
      onAiAction: null,
    };
  });

  const onTeachClick = (e) => {
    const act = e.target.closest('[data-teach-act]')?.dataset.teachAct;
    if (!act) return;
    if (act === 'back') enterPrepMode();
    else if (act === 'prev' && teachStepIdx > 0) mountTeachStep(teachStepIdx - 1);
    else if (act === 'next') mountTeachStep(teachStepIdx + 1);
    else if (act === 'toggle-cue') { cueOpen = !cueOpen; syncCueUi(currentStep()); scheduleResize(); }
    else if (act === 'close-cue') { cueOpen = false; syncCueUi(currentStep()); scheduleResize(); }
  };
  teachHostEl.addEventListener('click', onTeachClick);

  const onKeyDown = (e) => {
    if (mode !== 'teach' || !isEffectivelyActive() || isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'ArrowLeft' && teachStepIdx > 0) {
      e.preventDefault();
      mountTeachStep(teachStepIdx - 1);
    } else if (e.key === 'ArrowRight') {
      const total = store.getActiveLesson()?.steps?.length || 0;
      if (teachStepIdx < total - 1) { e.preventDefault(); mountTeachStep(teachStepIdx + 1); }
    } else if (e.key === 'Escape' && cueOpen) {
      cueOpen = false;
      syncCueUi(currentStep());
      scheduleResize();
    }
  };
  document.addEventListener('keydown', onKeyDown);

  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleResize()) : null;
  resizeObserver?.observe(stageViewportEl);

  const panelObserver = panelAiEl && typeof MutationObserver !== 'undefined'
    ? new MutationObserver(() => {
        const nextVisible = !panelAiEl.hidden;
        if (nextVisible === panelVisible) return;
        panelVisible = nextVisible;
        syncPlayback();
        if (panelVisible && sectionActive) notifyPageContextChange('ai');
      })
    : null;
  panelObserver?.observe(panelAiEl, { attributes: true, attributeFilter: ['hidden'] });

  editor.render();

  return {
    onEnter() {
      if (destroyed) return;
      sectionActive = true;
      panelVisible = panelAiEl ? !panelAiEl.hidden : true;
      if (mode === 'prep') editor.render();
      else if (!activeStage) mountTeachStep(teachStepIdx);
      else { syncPlayback(); notifyPageContextChange('ai'); }
    },
    onLeave() {
      if (destroyed) return;
      sectionActive = false;
      activeStage?.pause?.();
      editor.pausePreview();
      const notifyLeave = () => { if (!sectionActive && !destroyed) notifyPageContextChange('ai'); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(notifyLeave);
      else setTimeout(notifyLeave, 0);
    },
    resize() { scheduleResize(); },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      sectionActive = false;
      if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0; }
      resizeObserver?.disconnect();
      panelObserver?.disconnect();
      teachHostEl.removeEventListener('click', onTeachClick);
      document.removeEventListener('keydown', onKeyDown);
      unregisterAssistant?.();
      destroyTeachStage();
      editor.destroy();
      hostEl.innerHTML = '';
    },
  };
}
