/**
 * 路径解析：兼容
 * - Node 开发（server 目录）
 * - pkg 便携 exe（exe 同目录可写）
 * - Electron 桌面端（userData 可写，资源在 asar/源码里）
 *
 * 环境变量：
 * - CHEM_LAB_DATA_DIR：数据目录（含 chem-lab.db）
 * - CHEM_LAB_WRITABLE_ROOT：可写根（其下 data/）
 * - CHEM_LAB_ELECTRON=1：强制按 Electron 模式识别
 */

const path = require('path');
const fs = require('fs');

/** 是否被 pkg 打包 */
function isPkg() {
  return Boolean(process.pkg);
}

/** 是否在 Electron 主/渲染相关 Node 进程中 */
function isElectron() {
  return (
    process.env.CHEM_LAB_ELECTRON === '1' ||
    Boolean(process.versions && process.versions.electron)
  );
}

/**
 * 可写根目录：
 * - pkg：exe 所在目录
 * - Electron：由 main 设 CHEM_LAB_WRITABLE_ROOT / CHEM_LAB_DATA_DIR
 * - 开发：server 目录
 */
function getWritableRoot() {
  if (process.env.CHEM_LAB_WRITABLE_ROOT) {
    return process.env.CHEM_LAB_WRITABLE_ROOT;
  }
  if (process.env.CHEM_LAB_DATA_DIR) {
    return path.dirname(process.env.CHEM_LAB_DATA_DIR);
  }
  if (isPkg()) {
    return path.dirname(process.execPath);
  }
  return __dirname;
}

/**
 * 快照/源码根（只读资源：init.sql、内嵌 public）
 * Electron 打包后在 asar 内，与源码布局一致：server/
 */
function getSnapshotRoot() {
  return __dirname;
}

function getDataDir() {
  if (process.env.CHEM_LAB_DATA_DIR) {
    return process.env.CHEM_LAB_DATA_DIR;
  }
  return path.join(getWritableRoot(), 'data');
}

function getDbPath() {
  return path.join(getDataDir(), 'chem-lab.db');
}

/**
 * 前端静态资源：
 * 1) 可写根旁 public（pkg 热更新）
 * 2) 快照内 server/public（开发 / Electron asar / pkg 内嵌）
 */
function getPublicDir() {
  const beside = path.join(getWritableRoot(), 'public');
  if (fs.existsSync(path.join(beside, 'index.html'))) {
    return beside;
  }
  const snap = path.join(getSnapshotRoot(), 'public');
  return snap;
}

function getInitSqlPath() {
  return path.join(getSnapshotRoot(), 'db', 'init.sql');
}

module.exports = {
  isPkg,
  isElectron,
  getWritableRoot,
  getSnapshotRoot,
  getDataDir,
  getDbPath,
  getPublicDir,
  getInitSqlPath,
};
