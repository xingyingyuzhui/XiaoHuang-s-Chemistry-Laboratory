/**
 * 晶胞（3D 晶体与晶胞实验室）顶层模块入口
 * 按需加载 _crystal.css，提供 01 认识晶体 | 02 晶体结构库（默认） | 03 晶体的性质 三模块切换。
 */

import '../styles/_crystal.css';
import { mountBasicsView } from './modules/basics-view.js';
import { mountLibraryView } from './modules/library-view.js';
import { mountPropertiesView } from './modules/properties-view.js';

const MODULES = [
  { id: 'basics', num: '01', label: '认识晶体', mount: mountBasicsView },
  { id: 'library', num: '02', label: '晶体结构库', mount: mountLibraryView },
  { id: 'properties', num: '03', label: '晶体的性质', mount: mountPropertiesView },
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
    <header class="crystal-topbar">
      <nav class="crystal-mod-rail" role="tablist" aria-label="晶胞教学模块">
        ${MODULES.map(
          (m) => `
          <button
            type="button"
            class="crystal-mod-tab${m.id === 'library' ? ' is-active' : ''}"
            data-mod="${m.id}"
            role="tab"
            aria-selected="${m.id === 'library' ? 'true' : 'false'}"
          >
            <span class="crystal-mod-num">${m.num}</span>
            <span class="crystal-mod-label">${m.label}</span>
          </button>
        `,
        ).join('')}
      </nav>
    </header>
    <div class="crystal-module-host"></div>
  `;
  root.appendChild(shell);

  const railBtns = shell.querySelectorAll('.crystal-mod-tab');
  const hostEl = shell.querySelector('.crystal-module-host');

  let activeId = 'library';
  let activeInstance = null;
  let tabActive = true;

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

    hostEl.innerHTML = '';
    activeId = def.id;

    railBtns.forEach((btn) => {
      const on = btn.dataset.mod === activeId;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    activeInstance = def.mount(hostEl);
    if (!tabActive) {
      activeInstance?.pause?.();
    } else {
      requestAnimationFrame(() => {
        activeInstance?.resize?.();
      });
    }
  }

  railBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = btn.dataset.mod;
      if (!next || next === activeId) return;
      mountModule(next);
    });
  });

  // 默认进入 02 晶体结构库
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
