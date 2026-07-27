/**
 * 小黄的化学实验室 - 主入口
 * 负责 Tab 切换和模块初始化
 *
 * 按需加载策略：
 * - 周期表、设置、品牌提示、侧栏抽屉：立即加载（轻量 / 首屏必需）
 * - 计算（molar-ui）：立即加载（无 Three.js 依赖，用户可能直接访问）
 * - 3D 分子、电子排布、课堂、元素乱斗：首次进入 Tab 时动态 import
 */

import './styles/index.css';
import { initPeriodicTable, scheduleFit } from './periodic-table.js';
import { initSettingsUI } from './settings.js';
import { initBrandTip } from './brand-tip.js';
import { initSideDrawers } from './side-drawer.js';
import { initMolarUI, runMolar, refreshMolarPresets } from './molar-ui.js';
import { createFeatureLoader } from './feature-loader.js';

const $ = (sel) => document.querySelector(sel);

const tabs = document.querySelectorAll('.tab');
const panels = {
  table: $('#panel-table'),
  molecule: $('#panel-molecule'),
  molar: $('#panel-molar'),
  electron: $('#panel-electron'),
  battle: $('#panel-battle'),
  ai: $('#panel-ai'),
};

// ── 按需加载器 ──
const loader = createFeatureLoader();

// ── 已加载模块引用（首次加载后填充）──
let molModule = null;    // molecule-list.js
let molAIModule = null;  // molecule-ai.js
let molRxnModule = null; // molecule-reactions.js
let elecListModule = null; // electron-list.js
let elecRendererModule = null; // electron-renderer.js
let aiClassroomModule = null;  // ai-classroom.js
let battleModule = null;       // element-battle.js

let electronViewer = null;
/** 当前 switchTab 序号，防止过期加载继续初始化 / 启动动画 */
let switchSeq = 0;

// ── resize 节流 ──
let resizePending = false;

function throttledResize() {
  if (resizePending) return;
  resizePending = true;
  requestAnimationFrame(() => {
    resizePending = false;
    scheduleFit();
    if (molModule && !panels.molecule?.hidden) {
      molModule.getMolViewer()?.resize?.();
    }
    if (electronViewer && !panels.electron?.hidden) {
      electronViewer.resize();
    }
  });
}

// ── 面板加载状态 ──

function showPanelLoading(name) {
  const panel = panels[name];
  if (!panel) return;
  let placeholder = panel.querySelector('[data-panel-loading]');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.setAttribute('data-panel-loading', '');
    placeholder.className = 'panel-loading';
    panel.prepend(placeholder);
  }
  placeholder.textContent = '加载中…';
  placeholder.hidden = false;
}

function hidePanelLoading(name) {
  const panel = panels[name];
  if (!panel) return;
  const placeholder = panel.querySelector('[data-panel-loading]');
  if (!placeholder) return;
  placeholder.hidden = true;
  // 同步清文案，避免再次显示时闪旧错误信息
  if (!placeholder.textContent.startsWith('加载失败')) {
    placeholder.textContent = '加载中…';
  }
}

function showPanelError(name, message) {
  const panel = panels[name];
  if (!panel) return;
  let placeholder = panel.querySelector('[data-panel-loading]');
  if (!placeholder) {
    placeholder = document.createElement('div');
    placeholder.setAttribute('data-panel-loading', '');
    placeholder.className = 'panel-loading';
    panel.prepend(placeholder);
  }
  placeholder.textContent = `加载失败：${message}`;
  placeholder.hidden = false;
}

/**
 * 加载功能并处理 loading / 错误 / 过期取消
 * @returns {Promise<boolean>} 是否在当前 Tab 请求下成功就绪
 */
async function runFeatureLoad(panelName, mySeq, ensureReady) {
  showPanelLoading(panelName);
  try {
    await ensureReady();
    if (mySeq !== switchSeq) {
      hidePanelLoading(panelName);
      return false;
    }
    hidePanelLoading(panelName);
    return true;
  } catch (err) {
    if (mySeq !== switchSeq) {
      hidePanelLoading(panelName);
      return false;
    }
    console.error(`[feature] ${panelName}`, err);
    showPanelError(panelName, err?.message || String(err));
    return false;
  }
}

// ── 分子 Tab 按需加载 ──

async function ensureMoleculeModules() {
  const { mod } = await loader.load('molecule', () =>
    Promise.all([
      import('./molecule-list.js'),
      import('./molecule-ai.js'),
      import('./molecule-reactions.js'),
    ]).then(([list, ai, rxn]) => ({ list, ai, rxn })),
  );
  if (!molModule) {
    molModule = mod.list;
    molAIModule = mod.ai;
    molRxnModule = mod.rxn;
    molModule.setOnMoleculeChange(molRxnModule.onMoleculeChanged);
    molModule.initMoleculeList();
    molAIModule.initMoleculeAI();
    molRxnModule.initMoleculeReactions();
  }
}

// ── 电子排布 Tab 按需加载 ──

async function ensureElectronModules() {
  const { mod } = await loader.load('electron', () =>
    Promise.all([
      import('./electron-list.js'),
      import('./electron-renderer.js'),
    ]).then(([list, renderer]) => ({ list, renderer })),
  );
  if (!elecListModule) {
    elecListModule = mod.list;
    elecRendererModule = mod.renderer;
    await elecListModule.initElectronList();
  }
}

function ensureElectronViewerAndLoad(mySeq) {
  const root = $('#electron-root');
  if (!root || !elecRendererModule || !elecListModule) return;

  if (!electronViewer) {
    electronViewer = elecRendererModule.createElectronViewer(root);
    elecListModule.setElectronViewer(electronViewer);
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (mySeq !== switchSeq || !electronViewer) return;
      electronViewer.start();
      const z = elecListModule.getCurrentElementZ() || 1;
      elecListModule.loadElement(z);
      electronViewer.resize();
    });
  });
}

// ── 课堂 Tab 按需加载 ──

async function ensureClassroomModule() {
  const { mod } = await loader.load('classroom', () =>
    import('./ai-classroom.js'),
  );
  if (!aiClassroomModule) {
    aiClassroomModule = mod;
    aiClassroomModule.initAiClassroom();
  }
}

// ── 元素乱斗 Tab 按需加载 ──

async function ensureBattleModule() {
  const { mod } = await loader.load('battle', () =>
    import('./element-battle.js'),
  );
  if (!battleModule) {
    battleModule = mod;
    battleModule.initElementBattle();
  }
}

/**
 * 切换 Tab
 */
async function switchTab(name) {
  const mySeq = ++switchSeq;

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
      el.classList.remove('active');
      void el.offsetWidth;
      el.classList.add('active');
    } else {
      el.classList.remove('active');
      el.hidden = true;
    }
  });

  // 离开重模块页：停动画（不卸载模块，便于再进复用）
  if (name !== 'molecule' && molModule) {
    molModule.getMolViewer()?.stop();
  }
  if (name !== 'electron' && electronViewer) {
    electronViewer.stop();
  }

  // ── 分子 ──
  if (name === 'molecule') {
    const ok = await runFeatureLoad('molecule', mySeq, ensureMoleculeModules);
    if (!ok || mySeq !== switchSeq) return;
    molModule.ensureMolViewer();
    await molModule.ensureDefaultMolecule();
    if (mySeq !== switchSeq) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (mySeq !== switchSeq) return;
        const viewer = molModule.getMolViewer();
        if (viewer) {
          viewer.start();
          viewer.resize();
        }
      });
    });
  }

  // ── 计算 ──
  if (name === 'molar') {
    refreshMolarPresets().catch(console.warn);
  }

  // ── 电子排布 ──
  if (name === 'electron') {
    const ok = await runFeatureLoad('electron', mySeq, ensureElectronModules);
    if (!ok || mySeq !== switchSeq) return;
    ensureElectronViewerAndLoad(mySeq);
  }

  // ── 课堂 ──
  if (name === 'ai') {
    await runFeatureLoad('ai', mySeq, ensureClassroomModule);
  }

  // ── 元素乱斗 ──
  if (name === 'battle') {
    await runFeatureLoad('battle', mySeq, ensureBattleModule);
  }
}

/**
 * 初始化应用
 */
async function init() {
  // 立即初始化轻量模块
  initPeriodicTable();
  initMolarUI();
  initBrandTip();

  // 侧栏抽屉：resize 回调中访问已加载模块，未加载则跳过
  initSideDrawers({
    onToggle: (key, collapsed) => {
      if (collapsed && key === 'molecule' && molModule) molModule.setMolEditMode(false);
      if (collapsed && key === 'electron' && elecListModule) elecListModule.setElectronEditMode(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (key === 'table' && !panels.table?.hidden) scheduleFit();
          if (key === 'molecule' && !panels.molecule?.hidden && molModule) {
            molModule.getMolViewer()?.resize?.();
          }
          if (key === 'electron' && !panels.electron?.hidden && electronViewer) {
            electronViewer.resize();
          }
        });
      });
    },
  });

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

  window.addEventListener('resize', throttledResize);

  const defaultPage = await settingsApi.getDefaultPage();
  if (defaultPage === 'molecule') {
    switchTab('molecule');
  } else if (defaultPage === 'molar') {
    switchTab('molar');
    runMolar();
  } else if (defaultPage === 'electron') {
    switchTab('electron');
  } else if (defaultPage === 'battle') {
    switchTab('battle');
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
