const fs = require('fs');
const path = require('path');
const { getInitSqlPath } = require('../paths');

let db = null;
let dbPath = null;
let databaseLockPath = null;
/** 批量写时暂停逐条落盘 */
let suspendSave = 0;
let dirty = false;

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function readLockPid(lockPath) {
  try {
    return Number.parseInt(fs.readFileSync(lockPath, 'utf8').trim(), 10);
  } catch {
    return null;
  }
}

/**
 * 每份用户数据库只允许一个进程写入，防止两个桌面实例各自整库导出后互相覆盖。
 */
function acquireDatabaseLock(targetDbPath) {
  if (databaseLockPath) {
    throw new Error('数据库正在被另一个实例使用，请先关闭已有的小黄化学实验室窗口');
  }

  const lockPath = `${targetDbPath}.lock`;
  const createLock = () => {
    const fd = fs.openSync(lockPath, 'wx');
    try {
      fs.writeFileSync(fd, String(process.pid));
    } finally {
      fs.closeSync(fd);
    }
    databaseLockPath = lockPath;
  };

  try {
    createLock();
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    const holderPid = readLockPid(lockPath);
    if (!isProcessAlive(holderPid)) {
      try {
        fs.unlinkSync(lockPath);
      } catch (unlinkError) {
        if (unlinkError?.code !== 'ENOENT') throw unlinkError;
      }
      createLock();
      return;
    }
    throw new Error('数据库正在被另一个实例使用，请先关闭已有的小黄化学实验室窗口');
  }
}

function releaseDatabaseLock() {
  if (!databaseLockPath) return;
  const lockPath = databaseLockPath;
  databaseLockPath = null;
  try {
    fs.unlinkSync(lockPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      console.warn('释放数据库锁失败:', error.message);
    }
  }
}

/**
 * 使用 sql-asm（纯 JS）而非 wasm，pkg 打包更稳
 */
async function loadSqlJs() {
  // eslint-disable-next-line import/no-unresolved
  const initSqlJs = require('sql.js/dist/sql-asm.js');
  return initSqlJs();
}

/**
 * 初始化数据库连接
 * @param {string} dbFilePath - 数据库文件路径
 */
async function initDatabase(dbFilePath) {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  acquireDatabaseLock(dbFilePath);
  dbPath = dbFilePath;
  try {
    const SQL = await loadSqlJs();

    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    const initSqlFile = getInitSqlPath();
    const initSQL = fs.readFileSync(initSqlFile, 'utf-8');
    db.run(initSQL);

    try {
      db.run('PRAGMA foreign_keys = ON');
    } catch (e) {
      /* ignore */
    }

    try {
      db.run("ALTER TABLE molecules ADD COLUMN physics JSON DEFAULT '{}'");
    } catch (e) {
      /* 列已存在 */
    }
    try {
      db.run("ALTER TABLE molecules ADD COLUMN chemistry JSON DEFAULT '{}'");
    } catch (e) {
      /* 列已存在 */
    }

    saveDatabase();
    console.log(`数据库已初始化: ${dbPath}`);
    return db;
  } catch (error) {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    db = null;
    dbPath = null;
    releaseDatabaseLock();
    throw error;
  }
}

function getDb() {
  if (!db) {
    throw new Error('数据库未初始化，请先调用 initDatabase()');
  }
  return db;
}

/**
 * 原子落盘：先写临时文件再 rename，降低半截写坏库的风险
 */
function saveDatabase() {
  if (!db || !dbPath) return;
  if (suspendSave > 0) {
    dirty = true;
    return;
  }
  const t0 = process.env.NODE_ENV !== 'production' ? performance.now() : 0;
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmp = `${dbPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dbPath);
    dirty = false;
    if (t0) {
      const elapsed = performance.now() - t0;
      if (elapsed > 100) {
        console.warn(`[db] slow save: ${elapsed.toFixed(1)}ms (${(buffer.length / 1024).toFixed(0)}KB)`);
      }
    }
  } catch (e) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    // 临时文件与目标在同一目录，rename 失败时保留旧库比直接覆盖更安全。
    console.error('保存数据库失败（已保留原数据库）:', e);
    throw e;
  }
}

/**
 * 批量写：内存中执行 fn，结束时落盘一次
 * @template T
 * @param {() => T} fn
 * @returns {T}
 */
function runBatch(fn) {
  suspendSave += 1;
  try {
    return fn();
  } finally {
    suspendSave -= 1;
    if (suspendSave === 0 && dirty) {
      saveDatabase();
    }
  }
}

/**
 * 仅执行 SQL，不强制落盘（由调用方 batch 或 run 控制）
 */
function exec(sql, params = []) {
  if (params.length > 0) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
  dirty = true;
  return { changes: db.getRowsModified() };
}

function closeDatabase() {
  try {
    if (db) {
      if (dirty || suspendSave === 0) saveDatabase();
      db.close();
      db = null;
      console.log('数据库连接已关闭');
    }
  } finally {
    dbPath = null;
    releaseDatabaseLock();
  }
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * 写操作并落盘（单步）
 */
function run(sql, params = []) {
  const result = exec(sql, params);
  if (suspendSave === 0) {
    saveDatabase();
  }
  return result;
}

module.exports = {
  initDatabase,
  getDb,
  acquireDatabaseLock,
  releaseDatabaseLock,
  saveDatabase,
  closeDatabase,
  query,
  queryOne,
  run,
  exec,
  runBatch,
};
