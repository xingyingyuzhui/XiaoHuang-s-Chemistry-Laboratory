/**
 * 小黄的化学实验室 - 主入口
 * 负责 Tab 切换和模块初始化
 */

import './styles/index.css';
import { initPeriodicTable, scheduleFit } from './periodic-table.js';
import {
  initMoleculeList,
  ensureMolViewer,
  ensureDefaultMolecule,
  getMolViewer,
  setOnMoleculeChange,
} from './molecule-list.js';
import { initMoleculeAI } from './molecule-ai.js';
import {
  initMoleculeReactions,
  onMoleculeChanged,
} from './molecule-reactions.js';
import { initMolarUI, runMolar, refreshMolarPresets } from './molar-ui.js';
import {
  initElectronList,
  setElectronViewer,
  loadElement,
  getCurrentElementZ,
} from './electron-list.js';
import { createElectronViewer } from './electron-renderer.js';
import { initSettingsUI } from './settings.js';
import { initBrandTip } from './brand-tip.js';
import { initAiClassroom } from './ai-classroom.js';

const $ = (sel) => document.querySelector(sel);

const tabs = document.querySelectorAll('.tab');
const panels = {
  table: $('#panel-table'),
  molecule: $('#panel-molecule'),
  molar: $('#panel-molar'),
  electron: $('#panel-electron'),
  ai: $('#panel-ai'),
};

let electronViewer = null;

/**
 * 确保电子排布 viewer 存在，并加载当前/默认元素
 * 先创建 viewer → setElectronViewer → 再 loadElement，避免事件竞态白屏
 */
function ensureElectronViewerAndLoad() {
  const root = $('#electron-root');
  if (!root) return;

  if (!electronViewer) {
    electronViewer = createElectronViewer(root);
    setElectronViewer(electronViewer);
  }

  // 双 rAF：等 panel 显示、布局完成后再 start + load
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      electronViewer.start();
      const z = getCurrentElementZ() || 1;
      loadElement(z);
      electronViewer.resize();
    });
  });
}

/**
 * 切换 Tab
 */
async function switchTab(name) {
  tabs.forEach((tab) => {
    const on = tab.dataset.tab === name;
    tab.classList.toggle('active', on);
    tab.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  Object.entries(panels).forEach(([key, el]) => {
    if (!el) return;
    const on = key === name;
    if (on) {
      el.hidden = false;
      // 重新触发切入动画
      el.classList.remove('active');
      void el.offsetWidth;
      el.classList.add('active');
    } else {
      el.classList.remove('active');
      el.hidden = true;
    }
  });

  if (name === 'molecule') {
    ensureMolViewer();
    // 首次进入：默认选中并展示列表第一项
    await ensureDefaultMolecule();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const viewer = getMolViewer();
        if (viewer) {
          viewer.start();
          viewer.resize();
        }
      });
    });
  } else {
    const viewer = getMolViewer();
    if (viewer) viewer.stop();
  }

  if (name === 'molar') {
    // 进入时再拉一次，确保与 3D 分子库一致
    refreshMolarPresets().catch(console.warn);
  }

  if (name === 'electron') {
    ensureElectronViewerAndLoad();
  } else if (electronViewer) {
    electronViewer.stop();
  }
}

/**
 * 初始化应用
 */
async function init() {
  initPeriodicTable();
  setOnMoleculeChange(onMoleculeChanged);
  initMoleculeList();
  initMoleculeAI();
  initMoleculeReactions();
  initMolarUI();
  await initElectronList();
  initBrandTip();
  initAiClassroom();

  const settingsApi = await initSettingsUI({
    onDefaultPageChange: () => {},
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
      if (tab.dataset.tab === 'table') {
        requestAnimationFrame(() => scheduleFit());
      }
    });
  });

  window.addEventListener('resize', () => {
    scheduleFit();
    const viewer = getMolViewer();
    if (viewer && !panels.molecule?.hidden) viewer.resize();
    if (electronViewer && !panels.electron?.hidden) electronViewer.resize();
  });

  const defaultPage = await settingsApi.getDefaultPage();
  if (defaultPage === 'molecule') {
    switchTab('molecule');
  } else if (defaultPage === 'molar') {
    switchTab('molar');
    runMolar();
  } else if (defaultPage === 'electron') {
    switchTab('electron');
  } else if (defaultPage === 'ai') {
    switchTab('ai');
  } else {
    switchTab('table');
    runMolar();
  }

  await revealApp();
}

/** 等字体与首帧布局后再显示，减少刷新闪屏 */
async function revealApp() {
  try {
    if (document.fonts?.ready) {
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 1200)),
      ]);
    }
  } catch {
    /* ignore */
  }
  // 双 rAF：等主题/布局应用完
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.documentElement.classList.remove('app-booting');
  document.documentElement.classList.add('app-ready');
  scheduleFit();
}

init().catch((err) => {
  console.error(err);
  document.documentElement.classList.remove('app-booting');
  document.documentElement.classList.add('app-ready');
});
