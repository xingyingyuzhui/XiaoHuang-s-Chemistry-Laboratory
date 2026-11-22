'use strict';

const fs = require('fs');
const { getInitSqlPath } = require('../paths');

const IDENTIFIER_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

let cachedInitSqlPath = null;
let cachedInitSql = null;

function assertIdentifier(name, label) {
  if (typeof name !== 'string' || !IDENTIFIER_RE.test(name)) {
    throw new Error(`Invalid SQLite ${label}: ${name}`);
  }
}

function loadInitSql() {
  const sqlPath = getInitSqlPath();
  if (cachedInitSql !== null && cachedInitSqlPath === sqlPath) {
    return cachedInitSql;
  }
  cachedInitSqlPath = sqlPath;
  cachedInitSql = fs.readFileSync(sqlPath, 'utf-8');
  return cachedInitSql;
}

function queryAll(db, sql, params = []) {
  const stmt = db.prepare(sql);
  try {
    if (params.length > 0) {
      stmt.bind(params);
    }
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    return rows;
  } finally {
    stmt.free();
  }
}

function getSchemaVersion(db) {
  const rows = queryAll(db, 'PRAGMA user_version');
  const raw = rows[0] ? Object.values(rows[0])[0] : 0;
  const parsed = Number.parseInt(String(raw ?? 0), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function setSchemaVersion(db, version) {
  const safeVersion = Math.trunc(Number(version));
  if (!Number.isInteger(safeVersion) || safeVersion < 0) {
    throw new Error(`Invalid schema version: ${version}`);
  }
  db.run(`PRAGMA user_version = ${safeVersion}`);
}

function hasTable(db, tableName) {
  assertIdentifier(tableName, 'table name');
  const rows = queryAll(
    db,
    `SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
    [tableName],
  );
  return rows.length > 0;
}

function hasColumn(db, tableName, columnName) {
  assertIdentifier(tableName, 'table name');
  assertIdentifier(columnName, 'column name');
  if (!hasTable(db, tableName)) return false;
  const cols = queryAll(db, `PRAGMA table_info(${tableName})`);
  return cols.some((col) => col.name === columnName);
}

function ensureColumn(db, tableName, columnName, columnDef) {
  assertIdentifier(tableName, 'table name');
  assertIdentifier(columnName, 'column name');
  if (!hasTable(db, tableName) || hasColumn(db, tableName, columnName)) {
    return false;
  }
  db.run(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`);
  return true;
}

/**
 * Ordered, idempotent schema migrations tracked via SQLite `PRAGMA user_version`.
 * Each migration is safe to apply on both fresh databases and pre-governance
 * legacy databases (`user_version = 0`).
 */
const MIGRATIONS = [
  {
    version: 1,
    name: 'baseline_core_schema',
    up(db) {
      db.run(loadInitSql());
    },
  },
  {
    version: 2,
    name: 'molecules_physics_chemistry_columns',
    up(db) {
      ensureColumn(db, 'molecules', 'physics', "JSON DEFAULT '{}'");
      ensureColumn(db, 'molecules', 'chemistry', "JSON DEFAULT '{}'");
    },
  },
  {
    version: 3,
    name: 'quiz_source_type_and_feature_tables',
    up(db) {
      db.run(loadInitSql());
      ensureColumn(db, 'quiz_sessions', 'source_type', "TEXT DEFAULT ''");
    },
  },
];

const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Run all pending schema migrations on a sql.js Database instance.
 * Safe and idempotent; a no-op when `PRAGMA user_version >= LATEST_SCHEMA_VERSION`.
 * @param {object} db - sql.js Database instance
 * @returns {{ previousVersion: number, currentVersion: number, applied: number[], changed: boolean }}
 */
function runMigrations(db) {
  const previousVersion = getSchemaVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > previousVersion);
  if (pending.length === 0) {
    return {
      previousVersion,
      currentVersion: previousVersion,
      applied: [],
      changed: false,
    };
  }

  const applied = [];
  for (const migration of pending) {
    const sp = `mig_v${migration.version}`;
    db.run(`SAVEPOINT ${sp}`);
    try {
      migration.up(db);
      setSchemaVersion(db, migration.version);
      db.run(`RELEASE SAVEPOINT ${sp}`);
      applied.push(migration.version);
    } catch (err) {
      try {
        db.run(`ROLLBACK TO SAVEPOINT ${sp}`);
        db.run(`RELEASE SAVEPOINT ${sp}`);
      } catch {
        /* ignore rollback failure */
      }
      throw err;
    }
  }

  return {
    previousVersion,
    currentVersion: getSchemaVersion(db),
    applied,
    changed: applied.length > 0,
  };
}

function getSqliteModule() {
  // Lazy require avoids circular dependency during sqlite.js startup.
  // eslint-disable-next-line global-require
  return require('./sqlite');
}

/**
 * Ensure schema migrations and specific tables/columns exist.
 * In the common case (already migrated), performs only cheap read-only metadata
 * lookups with zero DDL writes and zero disk flushes.
 * @param {{ tables?: string[], columns?: Array<{ table: string, column: string, definition: string }> }} [requirements]
 * @param {object|null} [targetDb]
 * @returns {{ changed: boolean, version: number }}
 */
function ensureSchema(requirements = {}, targetDb = null) {
  const sqliteMod = targetDb ? null : getSqliteModule();
  const activeDb = targetDb || sqliteMod.getDb();
  const { tables = [], columns = [] } = requirements;

  let changed = false;

  if (getSchemaVersion(activeDb) < LATEST_SCHEMA_VERSION) {
    const res = runMigrations(activeDb);
    changed = changed || res.changed;
  }

  const missingTable = tables.some((t) => !hasTable(activeDb, t));
  if (missingTable) {
    activeDb.run(loadInitSql());
    changed = true;
  }

  for (const col of columns) {
    if (ensureColumn(activeDb, col.table, col.column, col.definition)) {
      changed = true;
    }
  }

  if (changed && sqliteMod) {
    sqliteMod.scheduleSave();
  }

  return {
    changed,
    version: getSchemaVersion(activeDb),
  };
}

const QUIZ_SCHEMA_REQUIREMENTS = {
  tables: ['quiz_sessions', 'quiz_items', 'quiz_wrong_book'],
  columns: [
    { table: 'quiz_sessions', column: 'source_type', definition: "TEXT DEFAULT ''" },
  ],
};

/**
 * Idempotent helper for quiz_sessions / quiz_items / quiz_wrong_book + source_type.
 * Safe to call from any route, service, or isolated test.
 */
function ensureQuizSchema(targetDb = null) {
  try {
    return ensureSchema(QUIZ_SCHEMA_REQUIREMENTS, targetDb);
  } catch (e) {
    console.warn('ensureQuizSchema', e.message);
    return { changed: false, version: 0 };
  }
}

function ensureLessonPacksSchema(targetDb = null) {
  return ensureSchema({ tables: ['lesson_packs'] }, targetDb);
}

function ensureLabExperimentsSchema(targetDb = null) {
  return ensureSchema({ tables: ['lab_experiments'] }, targetDb);
}

function ensureBalanceScriptsSchema(targetDb = null) {
  return ensureSchema({ tables: ['balance_scripts'] }, targetDb);
}

module.exports = {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  getSchemaVersion,
  setSchemaVersion,
  hasTable,
  hasColumn,
  ensureColumn,
  runMigrations,
  ensureSchema,
  ensureQuizSchema,
  ensureLessonPacksSchema,
  ensureLabExperimentsSchema,
  ensureBalanceScriptsSchema,
};
