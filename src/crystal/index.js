/**
 * 晶胞（3D 晶体与晶胞实验室）顶层模块入口
 * 零遮挡三行外壳（顶栏 46px + 无遮挡舞台 + 底部专有操作栏）+ 按需右侧滑出抽屉（思考题 / AI 助教），
 * 统一挂载 01 认识晶体 | 02 晶体库（默认） | 03 晶体的性质。
 */

import '../styles/_crystal.css';
import { bindSideDrawer } from '../side-drawer.js';
import { createInspectorDrawer } from './modules/inspector-drawer.js';
import { mountBasicsView } from './modules/basics-view.js';
import { mountLibraryView } from './modules/library-view.js';
import { mountPropertiesView } from './modules/properties-view.js';

const MODULES = [
  { id: 'basics', label: '认识', title: '01 认识晶体', mount: mountBasicsView },
  { id: 'library', label: '晶体库', title: '02 晶体结构库', mount: mountLibraryView },
  { id: 'properties', label: '性质', title: '03 晶体的性质', mount: mountPropertiesView },
];

let singletonApi = null;

/**
 * 初始化晶胞模块
 * @returns {{ onEnter: () => void, onLeave: () => void, resize: () => void }}
 */
export function initCrystalLab() {
  if (singletonApi) return singletonApi;

  const root = document.getElementById('crystal-root');
  if (!root) {
    return { onEnter() {}, onLeave() {}, resize() {} };
  }

  root.innerHTML = '';
  const shell = document.createElement('div');
  shell.className = 'crystal-shell';
  shell.innerHTML = `
    <aside
      class="sidebar side-drawer crystal-drawer"
      data-drawer="crystal"
      data-drawer-key="crystal"
      aria-label="晶胞与晶体导航"
    >
      <div class="side-drawer-head">
        <h2>晶胞与晶体</h2>
        <button
          type="button"
          class="side-drawer-toggle"
          aria-label="收起侧栏"
          aria-expanded="true"
          title="收起侧栏"
        >«</button>
      </div>
      <div class="side-drawer-body crystal-drawer-wrap">
        <nav class="crystal-mode-seg" role="tablist" aria-label="晶胞教学模块">
          ${MODULES.map(
            (m) => `
            <button
              type="button"
              class="crystal-mode-btn${m.id === 'library' ? ' is-active' : ''}"
              data-mod="${m.id}"
              role="tab"
              aria-selected="${m.id === 'library' ? 'true' : 'false'}"
              title="${m.title}"
            >${m.label}</button>
          `,
          ).join('')}
        </nav>
        <div class="crystal-drawer-body"></div>
      </div>
    </aside>
    <div class="stage stage-3d crystal-main">
      <header class="crystal-topbar">
        <div class="crystal-topbar-info" aria-live="polite"></div>
        <div class="crystal-topbar-right">
          <div class="crystal-topbar-actions"></div>
          <span class="crystal-topbar-sep" aria-hidden="true"></span>
          <button
            type="button"
            class="crystal-topbar-btn"
            data-inspector-tab="qa"
            aria-expanded="false"
            title="课堂思考题"
          >思考题</button>
          <button
            type="button"
            class="crystal-topbar-btn crystal-topbar-btn-ai"
            data-inspector-tab="ai"
            aria-expanded="false"
            title="AI 3D 助教"
          >AI 助教</button>
        </div>
      </header>
      <div class="crystal-stage-viewport"></div>
      <div class="crystal-actionbar"></div>
      <aside class="crystal-inspector" aria-label="课堂思考题与 AI 助教" hidden></aside>
    </div>
  `;
  root.appendChild(shell);

  const drawerEl = shell.querySelector('.crystal-drawer');
  const modeBtns = shell.querySelectorAll('.crystal-mode-btn');
  const drawerBodyEl = shell.querySelector('.crystal-drawer-body');
  const topbarInfoEl = shell.querySelector('.crystal-topbar-info');
  const topbarActionsEl = shell.querySelector('.crystal-topbar-actions');
  const stageViewportEl = shell.querySelector('.crystal-stage-viewport');
  const actionbarEl = shell.querySelector('.crystal-actionbar');
  const inspectorHostEl = shell.querySelector('.crystal-inspector');
  const inspectorBtns = shell.querySelectorAll('[data-inspector-tab]');

  function syncInspectorButtons({ open, tab }) {
    inspectorBtns.forEach((btn) => {
      const on = open && btn.dataset.inspectorTab === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
  }

  const inspector = createInspectorDrawer(inspectorHostEl, {
    onStateChange: syncInspectorButtons,
  });

  inspectorBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      inspector.toggle(btn.dataset.inspectorTab || 'qa');
    });
  });

  let activeId = 'library';
  let activeInstance = null;
  let tabActive = true;

  bindSideDrawer(drawerEl, {
    onToggle() {
      requestAnimationFrame(() => {
        activeInstance?.resize?.();
      });
    },
  });

  const shellContext = {
    drawerBodyEl,
    topbarInfoEl,
    topbarActionsEl,
    actionbarEl,
    openInspector: (tab = 'qa') => inspector.open(tab),
    setInspectorContext: (ctx) => inspector.setContext(ctx),
  };

  function mountModule(id) {
    const def = MODULES.find((m) => m.id === id) || MODULES[1];

    if (activeInstance) {
      try {
        activeInstance.destroy?.();
      } catch (err) {
        console.warn('[crystal] destroy module failed:', err);
      }
      activeInstance = null;
    }

    inspector.close();
    inspector.setContext(null);
    drawerBodyEl.innerHTML = '';
    topbarInfoEl.innerHTML = '';
    topbarActionsEl.innerHTML = '';
    stageViewportEl.innerHTML = '';
    actionbarEl.innerHTML = '';
    activeId = def.id;

    modeBtns.forEach((btn) => {
      const on = btn.dataset.mod === activeId;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    activeInstance = def.mount(stageViewportEl, shellContext);
    if (!tabActive) {
      activeInstance?.pause?.();
    } else {
      requestAnimationFrame(() => {
        activeInstance?.resize?.();
      });
    }
  }

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.mod;
      if (!next || next === activeId) return;
      mountModule(next);
    });
  });

  mountModule('library');

  singletonApi = {
    onEnter() {
      tabActive = true;
      if (!activeInstance) {
        mountModule(activeId);
      } else {
        activeInstance.resume?.();
        activeInstance.resize?.();
      }
    },
    onLeave() {
      tabActive = false;
      activeInstance?.pause?.();
    },
    resize() {
      if (tabActive) {
        activeInstance?.resize?.();
      }
    },
  };

  return singletonApi;
}
