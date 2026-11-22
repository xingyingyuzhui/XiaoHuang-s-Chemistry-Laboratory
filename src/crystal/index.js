/**
 * 晶胞（3D 晶体库）顶层模块入口 — 与「3D 分子」1:1 对称
 * 左可收起「常见晶胞」抽屉 + 右侧零遮挡三行主舞台（46px 顶栏 + 3D 画布 + 底部专有操作栏），
 * 接入全站「拉下小黄」随堂助教上下文（src/assistant/page-context.js）。
 */

import '../styles/_crystal.css';
import { bindSideDrawer } from '../side-drawer.js';
import { registerPageAssistant, notifyPageContextChange } from '../assistant/page-context.js';
import { mountLibraryView } from './modules/library-view.js';

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
      aria-label="常见晶胞"
    >
      <div class="side-drawer-head">
        <h2>常见晶胞</h2>
        <button
          type="button"
          class="side-drawer-toggle"
          aria-label="收起侧栏"
          aria-expanded="true"
          title="收起侧栏"
        >«</button>
      </div>
      <div class="side-drawer-body crystal-drawer-wrap">
        <div class="crystal-drawer-body"></div>
      </div>
    </aside>
    <div class="stage stage-3d crystal-main">
      <header class="crystal-topbar">
        <div class="crystal-topbar-info" aria-live="polite"></div>
        <div class="crystal-topbar-right">
          <div class="crystal-topbar-actions"></div>
        </div>
      </header>
      <div class="crystal-stage-viewport"></div>
      <div class="crystal-actionbar"></div>
    </div>
  `;
  root.appendChild(shell);

  const drawerEl = shell.querySelector('.crystal-drawer');
  const drawerBodyEl = shell.querySelector('.crystal-drawer-body');
  const topbarInfoEl = shell.querySelector('.crystal-topbar-info');
  const topbarActionsEl = shell.querySelector('.crystal-topbar-actions');
  const stageViewportEl = shell.querySelector('.crystal-stage-viewport');
  const actionbarEl = shell.querySelector('.crystal-actionbar');

  let assistantContext = null;
  let tabActive = true;
  let libraryInstance = null;

  registerPageAssistant('crystal', () => assistantContext);

  bindSideDrawer(drawerEl, {
    onToggle() {
      requestAnimationFrame(() => {
        libraryInstance?.resize?.();
      });
    },
  });

  const shellContext = {
    drawerBodyEl,
    topbarInfoEl,
    topbarActionsEl,
    actionbarEl,
    setPageContext(ctx) {
      assistantContext = ctx || null;
      notifyPageContextChange('crystal');
    },
  };

  function ensureMounted() {
    if (libraryInstance) return;
    libraryInstance = mountLibraryView(stageViewportEl, shellContext);
    if (!tabActive) {
      libraryInstance?.pause?.();
    } else {
      requestAnimationFrame(() => {
        libraryInstance?.resize?.();
      });
    }
  }

  ensureMounted();

  singletonApi = {
    onEnter() {
      tabActive = true;
      if (!libraryInstance) {
        ensureMounted();
      } else {
        libraryInstance.resume?.();
        libraryInstance.resize?.();
      }
      notifyPageContextChange('crystal');
    },
    onLeave() {
      tabActive = false;
      libraryInstance?.pause?.();
    },
    resize() {
      if (tabActive) {
        libraryInstance?.resize?.();
      }
    },
  };

  return singletonApi;
}
