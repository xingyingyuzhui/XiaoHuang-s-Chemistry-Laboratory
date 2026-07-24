/**
 * 路径解析：兼容 node 开发 与 pkg 打包后的 Windows exe
 *
 * - 只读资源（init.sql、内嵌 public）：用 __dirname（pkg 快照内）
 * - 可写数据（chem-lab.db）：exe 同目录 data/（便携）
 */

const path = require('path');
const fs = require('fs');

/** 是否被 pkg 打包 */
function isPkg() {
  return Boolean(process.pkg);
}

/**
 * 可写根目录：exe 所在目录 / 开发时 server 目录
 */
function getWritableRoot() {
  if (isPkg()) {
    return path.dirname(process.execPath);
  }
  return __dirname;
}

/**
 * 快照/源码根（只读资源）
 */
function getSnapshotRoot() {
  return __dirname;
}

function getDataDir() {
  return path.join(getWritableRoot(), 'data');
}

function getDbPath() {
  return path.join(getDataDir(), 'chem-lab.db');
}

/**
 * 前端静态资源：优先 exe 旁 public（可热更新），否则用打包进快照的 public
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
  getWritableRoot,
  getSnapshotRoot,
  getDataDir,
  getDbPath,
  getPublicDir,
  getInitSqlPath,
};
