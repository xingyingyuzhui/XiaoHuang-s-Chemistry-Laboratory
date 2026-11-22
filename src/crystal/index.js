/**
 * 晶胞（3D 晶体与晶胞实验室）顶层模块入口
 * 原生双列可收起侧栏 + 全幅开放舞台外壳（与 3D 分子页一致），
 * 统一挂载 01 认识晶体 | 02 晶体库（默认） | 03 晶体的性质。
 */

import '../styles/_crystal.css';
import { bindSideDrawer } from '../side-drawer.js';
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
      <div class="crystal-stage-slot"></div>
    </div>
  `;
  root.appendChild(shell);

  const drawerEl = shell.querySelector('.crystal-drawer');
  const modeBtns = shell.querySelectorAll('.crystal-mode-btn');
  const drawerBodyEl = shell.querySelector('.crystal-drawer-body');
  const stageSlotEl = shell.querySelector('.crystal-stage-slot');

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

    drawerBodyEl.innerHTML = '';
    stageSlotEl.innerHTML = '';
    activeId = def.id;

    modeBtns.forEach((btn) => {
      const on = btn.dataset.mod === activeId;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    activeInstance = def.mount(stageSlotEl, { drawerBodyEl });
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
