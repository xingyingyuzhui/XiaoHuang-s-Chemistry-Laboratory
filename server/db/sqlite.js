const fs = require('fs');
const path = require('path');
const { runMigrations } = require('./migrations');

const DEFAULT_SAVE_DEBOUNCE_MS = Number.isFinite(Number(process.env.CHEM_LAB_DB_SAVE_DEBOUNCE_MS))
  ? Math.max(0, Number(process.env.CHEM_LAB_DB_SAVE_DEBOUNCE_MS))
  : 150;
const DEFAULT_SAVE_MAX_WAIT_MS = 1000;

let db = null;
let dbPath = null;
let databaseLockPath = null;
/** 批量写时暂停逐条落盘 */
let suspendSave = 0;
let dirty = false;
let saveDebounceMs = DEFAULT_SAVE_DEBOUNCE_MS;
let saveMaxWaitMs = DEFAULT_SAVE_MAX_WAIT_MS;
let saveTimer = null;
let firstDirtyAt = 0;
let saveSeq = 0;
let saveCount = 0;
let exitHooksInstalled = false;

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

function clearSaveTimer() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

function installExitHooks() {
  if (exitHooksInstalled) return;
  exitHooksInstalled = true;
  const flushOnExit = () => {
    try {
      if (db && dbPath && dirty) {
        flushSave({ force: true });
      }
    } catch (err) {
      console.error('进程退出前落盘数据库失败:', err?.message || err);
    }
  };
  process.on('beforeExit', flushOnExit);
  process.on('exit', flushOnExit);
}

installExitHooks();

/**
 * 使用 sql-asm（纯 JS）而非 wasm，pkg 打包更稳
 */
async function loadSqlJs() {
  // eslint-disable-next-line import/no-unresolved
  const initSqlJs = require('sql.js/dist/sql-asm.js');
  return initSqlJs();
}

/**
 * 初始化数据库连接并执行幂等版本化迁移
 * @param {string} dbFilePath - 数据库文件路径
 */
async function initDatabase(dbFilePath) {
  const dir = path.dirname(dbFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  acquireDatabaseLock(dbFilePath);
  dbPath = dbFilePath;
  clearSaveTimer();
  suspendSave = 0;
  dirty = false;
  firstDirtyAt = 0;
  saveCount = 0;
  try {
    const SQL = await loadSqlJs();
    const existedOnDisk = fs.existsSync(dbPath);

    if (existedOnDisk) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      db = new SQL.Database();
    }

    const migrationResult = runMigrations(db);

    try {
      db.run('PRAGMA foreign_keys = ON');
    } catch (e) {
      /* ignore */
    }

    if (!existedOnDisk || migrationResult.changed) {
      dirty = true;
      saveDatabase();
    }
    console.log(`数据库已初始化: ${dbPath}`);
    return db;
  } catch (error) {
    clearSaveTimer();
    try {
      db?.close();
    } catch {
      /* ignore */
    }
    db = null;
    dbPath = null;
    suspendSave = 0;
    dirty = false;
    firstDirtyAt = 0;
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
  if (!db || !dbPath) return false;
  if (suspendSave > 0) {
    dirty = true;
    return false;
  }
  clearSaveTimer();
  const t0 = process.env.NODE_ENV !== 'production' ? performance.now() : 0;
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmp = `${dbPath}.${process.pid}.${Date.now()}.${++saveSeq}.tmp`;
  try {
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dbPath);
    dirty = false;
    firstDirtyAt = 0;
    saveCount += 1;
    if (t0) {
      const elapsed = performance.now() - t0;
      if (elapsed > 100) {
        console.warn(`[db] slow save: ${elapsed.toFixed(1)}ms (${(buffer.length / 1024).toFixed(0)}KB)`);
      }
    }
    return true;
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
 * 立即同步落盘所有未保存的脏修改（并取消挂起的防抖定时器）
 * @param {{ force?: boolean }} [options]
 * @returns {boolean} 是否实际执行了落盘
 */
function flushSave(options = {}) {
  clearSaveTimer();
  if (!db || !dbPath) return false;
  const force = Boolean(options && options.force);
  if (!dirty && !(force && !fs.existsSync(dbPath))) {
    return false;
  }
  if (force) {
    const prevSuspend = suspendSave;
    suspendSave = 0;
    try {
      return saveDatabase();
    } finally {
      suspendSave = prevSuspend;
    }
  }
  if (suspendSave > 0) {
    return false;
  }
  return saveDatabase();
}

/**
 * 合并高频写操作：在防抖窗口内只做一次整库原子落盘，
 * 同时通过 maxWaitMs 限制持续写入下的最大落盘延迟。
 * delayMs <= 0 时退化为立即同步落盘。
 * @param {number} [delayMs]
 */
function scheduleSave(delayMs = saveDebounceMs) {
  if (!db || !dbPath) return;
  dirty = true;
  if (suspendSave > 0) return;

  const effectiveDelay = Number.isFinite(delayMs) ? Math.max(0, delayMs) : saveDebounceMs;
  if (effectiveDelay === 0) {
    saveDatabase();
    return;
  }

  const now = Date.now();
  if (!firstDirtyAt) {
    firstDirtyAt = now;
  }
  const elapsed = now - firstDirtyAt;
  const remainingMaxWait = Math.max(0, saveMaxWaitMs - elapsed);
  if (remainingMaxWait === 0) {
    saveDatabase();
    return;
  }

  const waitMs = Math.min(effectiveDelay, remainingMaxWait);
  clearSaveTimer();
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      flushSave();
    } catch (err) {
      console.error('定时保存数据库失败:', err?.message || err);
    }
  }, waitMs);
  if (typeof saveTimer.unref === 'function') {
    saveTimer.unref();
  }
}

/**
 * 调整防抖落盘参数（主要供测试或特殊运行模式配置）
 * @param {{ debounceMs?: number, maxWaitMs?: number }} [options]
 */
function configureSaveDebounce(options = {}) {
  if (options.debounceMs !== undefined) {
    const v = Number(options.debounceMs);
    if (Number.isFinite(v) && v >= 0) saveDebounceMs = v;
  }
  if (options.maxWaitMs !== undefined) {
    const v = Number(options.maxWaitMs);
    if (Number.isFinite(v) && v >= 0) saveMaxWaitMs = v;
  }
  return { debounceMs: saveDebounceMs, maxWaitMs: saveMaxWaitMs };
}

function getSaveStats() {
  return {
    dirty,
    pendingTimer: Boolean(saveTimer),
    saveCount,
    debounceMs: saveDebounceMs,
    maxWaitMs: saveMaxWaitMs,
  };
}

/**
 * 批量写：内存中执行 fn，结束时同步原子落盘一次
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
 * 仅执行 SQL，不强制落盘（由调用方 batch、run 或 saveDatabase 控制）
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
  clearSaveTimer();
  try {
    if (db) {
      flushSave({ force: true });
      db.close();
      db = null;
      console.log('数据库连接已关闭');
    }
  } finally {
    suspendSave = 0;
    dirty = false;
    firstDirtyAt = 0;
    dbPath = null;
    releaseDatabaseLock();
  }
}

function query(sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) {
      stmt.bind(params);
    }
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    return results;
  } finally {
    stmt.free();
  }
}

function queryOne(sql, params = []) {
  const results = query(sql, params);
  return results.length > 0 ? results[0] : null;
}

/**
 * 写操作并调度落盘（高频连续写入自动防抖合并；关闭/退出时保证同步落盘）
 */
function run(sql, params = []) {
  const result = exec(sql, params);
  if (suspendSave === 0) {
    scheduleSave();
  }
  return result;
}

module.exports = {
  initDatabase,
  getDb,
  acquireDatabaseLock,
  releaseDatabaseLock,
  saveDatabase,
  scheduleSave,
  flushSave,
  configureSaveDebounce,
  getSaveStats,
  closeDatabase,
  query,
  queryOne,
  run,
  exec,
  runBatch,
};
