/**
 * Electron 主进程（路线 A）
 * - 启动内嵌 Express（与 pkg 共用 server/）
 * - 数据写入 userData，避免装在 Program Files 无法写库
 * - 窗口加载 http://127.0.0.1:port，无黑色控制台、无需外置浏览器
 * - 高分屏：随显示器尺寸开窗；Ctrl+/-/0 与 Ctrl+滚轮缩放（等同浏览器）
 *
 * 打包布局：
 *   app.asar → electron/main.cjs
 *   resources/server → Express + public + node_modules（extraResources）
 */

const { app, BrowserWindow, shell, screen, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// 在 require server 之前固定数据目录与模式标记
process.env.CHEM_LAB_ELECTRON = '1';
process.env.CHEM_LAB_DATA_DIR = path.join(app.getPath('userData'), 'data');
process.env.OPEN_BROWSER = '0';

const ZOOM_MIN = 0.75;
const ZOOM_MAX = 2.5;
const ZOOM_STEP = 0.1;
const ZOOM_STORE = 'ui-zoom.json';

let mainWindow = null;
let httpServer = null;
let shutdownServer = null;

function getServerEntry() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'server', 'index.js');
  }
  return path.join(__dirname, '..', 'server', 'index.js');
}

/** 窗口图标：小黄头像（与左上角品牌标同源） */
function getAppIcon() {
  const candidates = [
    path.join(__dirname, 'build', 'icon.png'),
    path.join(__dirname, 'build', 'icon.ico'),
    path.join(__dirname, '..', 'public', 'brand-avatar.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

function zoomStorePath() {
  return path.join(app.getPath('userData'), ZOOM_STORE);
}

function loadSavedZoom() {
  try {
    const raw = fs.readFileSync(zoomStorePath(), 'utf8');
    const z = Number(JSON.parse(raw)?.zoomFactor);
    if (Number.isFinite(z) && z >= ZOOM_MIN && z <= ZOOM_MAX) return z;
  } catch {
    /* ignore */
  }
  return null;
}

function saveZoom(factor) {
  try {
    fs.writeFileSync(
      zoomStorePath(),
      JSON.stringify({ zoomFactor: factor }, null, 2),
      'utf8',
    );
  } catch {
    /* ignore */
  }
}

/**
 * 4K / 大屏且系统缩放偏低时，给一点初始放大，避免「窗口很大字很小」
 * 用户改过缩放则以保存值为准
 */
function pickInitialZoom(display) {
  const saved = loadSavedZoom();
  if (saved != null) return saved;

  const sf = display.scaleFactor || 1;
  const { width, height } = display.workAreaSize || display.size || {};
  // 逻辑分辨率很大 + 系统 DPI 缩放偏小 → 整体略放大
  if (sf <= 1.1 && width >= 3000) return 1.35;
  if (sf <= 1.1 && width >= 2500) return 1.25;
  if (sf <= 1.25 && width >= 3000) return 1.15;
  if (sf < 1.5 && width >= 2560 && height >= 1400) return 1.1;
  return 1;
}

function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}

function applyZoom(wc, factor, persist = true) {
  const z = clampZoom(factor);
  wc.setZoomFactor(z);
  if (persist) saveZoom(z);
  return z;
}

function buildAppMenu() {
  // 隐藏菜单栏仍保留快捷键（Win: Ctrl+/-/0；Mac: Cmd+/-/0）
  const template = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: '查看',
      submenu: [
        {
          label: '放大',
          accelerator: 'CommandOrControl+=',
          click: () => {
            if (!mainWindow) return;
            const wc = mainWindow.webContents;
            applyZoom(wc, wc.getZoomFactor() + ZOOM_STEP);
          },
        },
        {
          label: '缩小',
          accelerator: 'CommandOrControl+-',
          click: () => {
            if (!mainWindow) return;
            const wc = mainWindow.webContents;
            applyZoom(wc, wc.getZoomFactor() - ZOOM_STEP);
          },
        },
        {
          label: '实际大小',
          accelerator: 'CommandOrControl+0',
          click: () => {
            if (!mainWindow) return;
            applyZoom(mainWindow.webContents, 1);
          },
        },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具', visible: !app.isPackaged },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'close', label: '关闭' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupPageZoom(win) {
  const wc = win.webContents;

  try {
    wc.setVisualZoomLevelLimits(1, 3);
  } catch {
    /* older electron */
  }

  // 备用：部分键盘布局 role 拦不住时仍可用
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const mod = input.control || input.meta;
    if (!mod) return;

    const key = input.key;
    const cur = wc.getZoomFactor();

    if (key === '=' || key === '+' || key === 'Add' || key === 'NumpadAdd') {
      applyZoom(wc, cur + ZOOM_STEP);
      event.preventDefault();
      return;
    }
    if (key === '-' || key === '_' || key === 'Subtract' || key === 'NumpadSubtract') {
      applyZoom(wc, cur - ZOOM_STEP);
      event.preventDefault();
      return;
    }
    if (key === '0' || key === 'Numpad0') {
      applyZoom(wc, 1);
      event.preventDefault();
    }
  });

  // 触控板捏合 / 部分 Ctrl+滚轮 路径
  wc.on('zoom-changed', (_event, zoomDirection) => {
    const cur = wc.getZoomFactor();
    if (zoomDirection === 'in') applyZoom(wc, cur + ZOOM_STEP);
    else if (zoomDirection === 'out') applyZoom(wc, cur - ZOOM_STEP);
  });

  wc.on('did-finish-load', () => {
    saveZoom(wc.getZoomFactor());
  });
}

async function startBackend() {
  const serverEntry = getServerEntry();
  if (!fs.existsSync(serverEntry)) {
    throw new Error(`找不到后端入口: ${serverEntry}`);
  }
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const { startServer, shutdown } = require(serverEntry);
  shutdownServer = shutdown;
  const result = await startServer({ openBrowser: false, host: '127.0.0.1' });
  httpServer = result.server;
  return result;
}

function createWindow(url) {
  const icon = getAppIcon();
  const display = screen.getPrimaryDisplay();
  const work = display.workAreaSize;
  // 默认约占工作区 88%，但不超过 1600×1000 逻辑像素；小屏再夹紧
  const width = Math.min(1600, Math.max(1100, Math.floor(work.width * 0.88)));
  const height = Math.min(1000, Math.max(720, Math.floor(work.height * 0.88)));
  const initialZoom = pickInitialZoom(display);

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: 960,
    minHeight: 640,
    title: '小黄的化学实验室',
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f0f4f8',
    ...(icon ? { icon } : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      zoomFactor: initialZoom,
      // 跟随系统高 DPI（默认 true；显式写出避免被改）
      // Windows 4K 下由 OS scaleFactor 处理物理像素
    },
  });

  setupPageZoom(mainWindow);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow) {
      // 再次确保 zoom（部分版本 ready 时才会稳定）
      applyZoom(mainWindow.webContents, initialZoom, false);
      mainWindow.show();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (
      /^https?:\/\//i.test(target) &&
      !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(target)
    ) {
      shell.openExternal(target);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow.loadURL(url);
}

async function bootstrap() {
  try {
    const { url } = await startBackend();
    await createWindow(url);
  } catch (err) {
    console.error('Electron 启动失败:', err);
    app.quit();
  }
}

function cleanup() {
  try {
    if (httpServer) {
      httpServer.close();
      httpServer = null;
    }
  } catch (_) {
    /* ignore */
  }
  try {
    if (typeof shutdownServer === 'function') shutdownServer();
  } catch (_) {
    /* ignore */
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    buildAppMenu();
    return bootstrap();
  });

  app.on('window-all-closed', () => {
    cleanup();
    app.quit();
  });

  app.on('before-quit', () => {
    cleanup();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && app.isReady()) {
      bootstrap();
    }
  });
}
