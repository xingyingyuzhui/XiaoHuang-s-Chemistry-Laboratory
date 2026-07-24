const fs = require('fs');
const path = require('path');
const { getInitSqlPath } = require('../paths');

let db = null;
let dbPath = null;
/** 批量写时暂停逐条落盘 */
let suspendSave = 0;
let dirty = false;

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
  dbPath = dbFilePath;

  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

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
  const data = db.export();
  const buffer = Buffer.from(data);
  const tmp = `${dbPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, dbPath);
    dirty = false;
  } catch (e) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    // rename 失败时退回直接写（部分环境跨设备 rename 会失败）
    try {
      fs.writeFileSync(dbPath, buffer);
      dirty = false;
    } catch (e2) {
      console.error('保存数据库失败:', e2);
      throw e2;
    }
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
  if (db) {
    if (dirty || suspendSave === 0) saveDatabase();
    db.close();
    db = null;
    console.log('数据库连接已关闭');
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
  saveDatabase,
  closeDatabase,
  query,
  queryOne,
  run,
  exec,
  runBatch,
};
