/**
 * 课堂 · 晶体探究分区外壳（零遮挡课堂布局：顶栏子模块切换 + 紧凑横向课程条 + 开放互动舞台 + 底部操作栏）
 * 承载模块 01「认识晶体」(6) 与模块 03「晶体的性质」(4)，并与全站「拉下小黄」伴学助手联动。
 */

import '../styles/_crystal.css';
import { mountBasicsView } from '../crystal/modules/basics-view.js';
import { mountPropertiesView } from '../crystal/modules/properties-view.js';
import { registerPageAssistant, notifyPageContextChange } from '../assistant/page-context.js';

const SUB_MODULES = [
  { id: 'basics', label: '认识晶体 (6)', title: '模块 01 · 认识晶体', mount: mountBasicsView },
  { id: 'properties', label: '晶体的性质 (4)', title: '模块 03 · 晶体的性质', mount: mountPropertiesView },
];

/**
 * 创建课堂「晶体探究」控制器
 * @param {{ hostEl: HTMLElement | null }} opts
 * @returns {{ onEnter: () => void, onLeave: () => void, resize: () => void, destroy: () => void }}
 */
export function createCrystalLessonShell({ hostEl } = {}) {
  if (!hostEl) {
    return { onEnter() {}, onLeave() {}, resize() {}, destroy() {} };
  }

  hostEl.innerHTML = `
    <div class="crystal-lesson-shell">
      <header class="crystal-topbar crystal-lesson-header">
        <nav class="crystal-seg crystal-lesson-subseg" role="tablist" aria-label="晶体探究子模块">
          ${SUB_MODULES.map(
            (m, i) => `
            <button
              type="button"
              class="crystal-seg-btn crystal-lesson-subbtn${i === 0 ? ' is-active' : ''}"
              data-sub="${m.id}"
              role="tab"
              aria-selected="${i === 0 ? 'true' : 'false'}"
              title="${m.title}"
            >${m.label}</button>
          `,
          ).join('')}
        </nav>
        <div class="crystal-topbar-info crystal-lesson-info" aria-live="polite"></div>
      </header>
      <div class="crystal-lesson-strip" aria-label="课程与实验切换"></div>
      <div class="crystal-stage-viewport crystal-lesson-viewport"></div>
      <div class="crystal-actionbar crystal-lesson-actionbar"></div>
    </div>
  `;

  const subBtns = hostEl.querySelectorAll('[data-sub]');
  const topbarInfoEl = hostEl.querySelector('.crystal-lesson-info');
  const lessonStripEl = hostEl.querySelector('.crystal-lesson-strip');
  const stageViewportEl = hostEl.querySelector('.crystal-lesson-viewport');
  const actionbarEl = hostEl.querySelector('.crystal-lesson-actionbar');
  const panelAiEl = document.getElementById('panel-ai');

  let activeSub = 'basics';
  let activeInstance = null;
  let activeContext = null;
  let sectionActive = false;
  let panelVisible = panelAiEl ? !panelAiEl.hidden : true;
  let destroyed = false;
  let resizeRaf = 0;

  function isEffectivelyActive() {
    return sectionActive && panelVisible && !destroyed;
  }

  function scheduleResize() {
    if (resizeRaf || !isEffectivelyActive()) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      if (isEffectivelyActive()) {
        activeInstance?.resize?.();
      }
    });
  }

  function syncPlayback() {
    if (!activeInstance || destroyed) return;
    if (isEffectivelyActive()) {
      activeInstance.resume?.();
      scheduleResize();
    } else {
      activeInstance.pause?.();
    }
  }

  const unregisterAssistant = registerPageAssistant('ai', () => {
    if (!sectionActive || destroyed || !activeContext) return null;
    return {
      title: activeContext.title,
      ...(activeContext.formula ? { formula: activeContext.formula } : {}),
      module: activeSub === 'basics' ? 'basics' : 'properties',
      summary: activeContext.summary,
      qa: activeContext.qa,
      quickQuestions: activeContext.quickQuestions,
      onAiAction: null,
    };
  });

  const shellContext = {
    drawerBodyEl: lessonStripEl,
    topbarInfoEl,
    topbarActionsEl: null,
    actionbarEl,
    setInspectorContext(ctx) {
      activeContext = ctx
        ? {
            title: ctx.title || '',
            formula: ctx.formula || '',
            module: activeSub === 'basics' ? 'basics' : 'properties',
            summary: ctx.summary || '',
            qa: ctx.qa || null,
            quickQuestions: Array.isArray(ctx.quickQuestions) ? ctx.quickQuestions : [],
            onAiAction: null,
          }
        : null;
      if (sectionActive) {
        notifyPageContextChange('ai');
      }
    },
  };

  function mountSub(subId) {
    if (destroyed) return;
    const def = SUB_MODULES.find((m) => m.id === subId) || SUB_MODULES[0];

    if (activeInstance) {
      try {
        activeInstance.destroy?.();
      } catch (err) {
        console.warn('[classroom-crystal] destroy sub-module failed:', err);
      }
      activeInstance = null;
    }

    activeContext = null;
    lessonStripEl.innerHTML = '';
    topbarInfoEl.innerHTML = '';
    stageViewportEl.innerHTML = '';
    actionbarEl.innerHTML = '';
    activeSub = def.id;

    subBtns.forEach((btn) => {
      const on = btn.dataset.sub === activeSub;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    activeInstance = def.mount(stageViewportEl, shellContext);
    lessonStripEl.querySelector('.crystal-drawer-list')?.setAttribute('aria-orientation', 'horizontal');

    if (!isEffectivelyActive()) {
      activeInstance?.pause?.();
    } else {
      scheduleResize();
    }

    if (sectionActive && !activeContext) {
      notifyPageContextChange('ai');
    }
  }

  const onSubClick = (e) => {
    const btn = e.currentTarget;
    const next = btn?.dataset?.sub;
    if (!next || next === activeSub) return;
    mountSub(next);
  };
  subBtns.forEach((btn) => btn.addEventListener('click', onSubClick));

  const onStripClick = (e) => {
    const item = e.target.closest('.crystal-drawer-item');
    if (item && typeof item.scrollIntoView === 'function') {
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  };
  lessonStripEl.addEventListener('click', onStripClick);

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          scheduleResize();
        })
      : null;
  resizeObserver?.observe(stageViewportEl);

  const panelObserver =
    panelAiEl && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => {
          const nextVisible = !panelAiEl.hidden;
          if (nextVisible === panelVisible) return;
          panelVisible = nextVisible;
          syncPlayback();
          if (panelVisible && sectionActive) {
            notifyPageContextChange('ai');
          }
        })
      : null;
  panelObserver?.observe(panelAiEl, { attributes: true, attributeFilter: ['hidden'] });

  return {
    onEnter() {
      if (destroyed) return;
      sectionActive = true;
      panelVisible = panelAiEl ? !panelAiEl.hidden : true;
      if (!activeInstance) {
        mountSub(activeSub);
      } else {
        syncPlayback();
        notifyPageContextChange('ai');
      }
    },
    onLeave() {
      if (destroyed) return;
      sectionActive = false;
      activeInstance?.pause?.();
      notifyPageContextChange('ai');
    },
    resize() {
      scheduleResize();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      sectionActive = false;
      if (resizeRaf) {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = 0;
      }
      resizeObserver?.disconnect();
      panelObserver?.disconnect();
      subBtns.forEach((btn) => btn.removeEventListener('click', onSubClick));
      lessonStripEl.removeEventListener('click', onStripClick);
      unregisterAssistant?.();
      if (activeInstance) {
        try {
          activeInstance.destroy?.();
        } catch (err) {
          console.warn('[classroom-crystal] destroy failed:', err);
        }
        activeInstance = null;
      }
      activeContext = null;
      hostEl.innerHTML = '';
    },
  };
}
