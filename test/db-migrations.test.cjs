'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const sqlWasmJsPath = require.resolve('sql.js/dist/sql-wasm.js', {
  paths: [path.join(__dirname, '../server')],
});
const sqlWasmDir = path.dirname(sqlWasmJsPath);
const rawInitSqlJs = require(sqlWasmJsPath);
const initSqlJs = () => rawInitSqlJs({ locateFile: (file) => path.join(sqlWasmDir, file) });

const {
  initDatabase,
  closeDatabase,
  getDb,
  query,
  queryOne,
  run,
  exec,
  runBatch,
  saveDatabase,
  flushSave,
  configureSaveDebounce,
  getSaveStats,
} = require('../server/db/sqlite');
const {
  LATEST_SCHEMA_VERSION,
  getSchemaVersion,
  hasTable,
  hasColumn,
  runMigrations,
  ensureLessonPacksSchema,
} = require('../server/db/migrations');
const { ensureQuizSchema } = require('../server/db/ensure-quiz-schema');
const { ensureLabTable } = require('../server/seed/import-labs');
const { ensureBalanceTable } = require('../server/seed/import-balance-scripts');

function makeTempDir(prefix = 'chem-lab-mig-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readDiskDb(dbPath) {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync(dbPath);
  return new SQL.Database(buf);
}

function queryRaw(rawDb, sql, params = []) {
  const stmt = rawDb.prepare(sql);
  try {
    if (params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    return rows;
  } finally {
    stmt.free();
  }
}

test('fresh DB init sets PRAGMA user_version, creates all tables, and is idempotent on reopen', async () => {
  const dir = makeTempDir('chem-lab-fresh-');
  const dbPath = path.join(dir, 'chem-lab.db');
  try {
    await initDatabase(dbPath);
    const db = getDb();
    assert.equal(getSchemaVersion(db), LATEST_SCHEMA_VERSION);

    const expectedTables = [
      'ai_global_calls',
      'ai_quiz_assist_calls',
      'ai_tip_calls',
      'balance_scripts',
      'chem_reactions',
      'chem_tips',
      'class_students',
      'lab_experiments',
      'lesson_packs',
      'molecule_order',
      'molecules',
      'quiz_items',
      'quiz_papers',
      'quiz_sessions',
      'quiz_wrong_book',
      'settings',
    ];
    for (const table of expectedTables) {
      assert.equal(hasTable(db, table), true, `expected table ${table}`);
    }
    assert.equal(hasColumn(db, 'molecules', 'physics'), true);
    assert.equal(hasColumn(db, 'molecules', 'chemistry'), true);
    assert.equal(hasColumn(db, 'quiz_sessions', 'source_type'), true);

    const rerun = runMigrations(db);
    assert.deepEqual(rerun.applied, []);
    assert.equal(rerun.changed, false);
    assert.equal(rerun.currentVersion, LATEST_SCHEMA_VERSION);

    closeDatabase();

    // Reopening an up-to-date DB should not trigger unnecessary rewrites
    await initDatabase(dbPath);
    assert.equal(getSchemaVersion(getDb()), LATEST_SCHEMA_VERSION);
    assert.equal(getSaveStats().saveCount, 0);
  } finally {
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('upgrades legacy DB without user_version or physics/chemistry/source_type columns while preserving data', async () => {
  const dir = makeTempDir('chem-lab-legacy-');
  const dbPath = path.join(dir, 'chem-lab.db');
  try {
    const SQL = await initSqlJs();
    const legacy = new SQL.Database();
    legacy.run(`
      CREATE TABLE molecules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        formula TEXT NOT NULL,
        desc TEXT DEFAULT '',
        atoms JSON NOT NULL,
        bonds JSON NOT NULL,
        custom INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom)
      VALUES ('legacy-h2o', '旧版水分子', 'H2O', 'legacy row', '[]', '[]', 1);

      CREATE TABLE quiz_sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL,
        grades TEXT DEFAULT '[]',
        difficulty TEXT DEFAULT '',
        topics TEXT DEFAULT '[]',
        reveal TEXT DEFAULT 'immediate',
        total INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        answered INTEGER DEFAULT 0,
        summary TEXT DEFAULT ''
      );
      INSERT INTO quiz_sessions (id, created_at, total, correct, answered)
      VALUES ('qs-legacy-1', 1700000000000, 5, 4, 5);
    `);
    assert.equal(getSchemaVersion(legacy), 0);
    fs.writeFileSync(dbPath, Buffer.from(legacy.export()));
    legacy.close();

    await initDatabase(dbPath);
    const db = getDb();

    assert.equal(getSchemaVersion(db), LATEST_SCHEMA_VERSION);
    assert.equal(hasColumn(db, 'molecules', 'physics'), true);
    assert.equal(hasColumn(db, 'molecules', 'chemistry'), true);
    assert.equal(hasColumn(db, 'quiz_sessions', 'source_type'), true);
    assert.equal(hasTable(db, 'lesson_packs'), true);
    assert.equal(hasTable(db, 'balance_scripts'), true);
    assert.equal(hasTable(db, 'lab_experiments'), true);
    assert.equal(hasTable(db, 'quiz_papers'), true);

    const mol = queryOne('SELECT id, name, physics, chemistry FROM molecules WHERE id = ?', [
      'legacy-h2o',
    ]);
    assert.deepEqual(mol, {
      id: 'legacy-h2o',
      name: '旧版水分子',
      physics: '{}',
      chemistry: '{}',
    });

    const session = queryOne('SELECT id, total, correct, source_type FROM quiz_sessions WHERE id = ?', [
      'qs-legacy-1',
    ]);
    assert.deepEqual(session, {
      id: 'qs-legacy-1',
      total: 5,
      correct: 4,
      source_type: '',
    });

    // Migration should have been durably persisted to disk immediately during initDatabase
    const diskDb = await readDiskDb(dbPath);
    try {
      assert.equal(getSchemaVersion(diskDb), LATEST_SCHEMA_VERSION);
      assert.equal(hasColumn(diskDb, 'quiz_sessions', 'source_type'), true);
    } finally {
      diskDb.close();
    }
  } finally {
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runMigrations incrementally upgrades a partially migrated DB (user_version = 1)', async () => {
  const SQL = await initSqlJs();
  const rawDb = new SQL.Database();
  try {
    rawDb.run(`
      CREATE TABLE molecules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        formula TEXT NOT NULL,
        atoms JSON NOT NULL,
        bonds JSON NOT NULL,
        custom INTEGER DEFAULT 0
      );
      CREATE TABLE quiz_sessions (
        id TEXT PRIMARY KEY,
        created_at INTEGER NOT NULL
      );
      PRAGMA user_version = 1;
    `);
    const result = runMigrations(rawDb);
    assert.equal(result.previousVersion, 1);
    assert.equal(result.currentVersion, LATEST_SCHEMA_VERSION);
    assert.deepEqual(result.applied, [2, 3]);
    assert.equal(hasColumn(rawDb, 'molecules', 'physics'), true);
    assert.equal(hasColumn(rawDb, 'molecules', 'chemistry'), true);
    assert.equal(hasColumn(rawDb, 'quiz_sessions', 'source_type'), true);
  } finally {
    rawDb.close();
  }
});

test('standalone ensure helpers are read-only no-ops when current and repair missing tables/columns', async () => {
  const dir = makeTempDir('chem-lab-ensure-');
  const dbPath = path.join(dir, 'chem-lab.db');
  try {
    await initDatabase(dbPath);
    const savesAfterInit = getSaveStats().saveCount;

    ensureQuizSchema();
    ensureLessonPacksSchema();
    ensureLabTable();
    ensureBalanceTable();

    assert.equal(getSaveStats().saveCount, savesAfterInit);
    assert.equal(getSaveStats().dirty, false);

    // Simulate an isolated test dropping feature tables / reverting quiz_sessions
    const db = getDb();
    db.run('DROP TABLE lesson_packs');
    db.run('DROP TABLE lab_experiments');
    db.run('DROP TABLE balance_scripts');
    db.run('DROP TABLE quiz_sessions');
    db.run('CREATE TABLE quiz_sessions (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL)');

    ensureLessonPacksSchema();
    ensureLabTable();
    ensureBalanceTable();
    ensureQuizSchema();

    assert.equal(hasTable(db, 'lesson_packs'), true);
    assert.equal(hasTable(db, 'lab_experiments'), true);
    assert.equal(hasTable(db, 'balance_scripts'), true);
    assert.equal(hasColumn(db, 'quiz_sessions', 'source_type'), true);
  } finally {
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('debounced run() coalesces bursts into one atomic save and flushSave/closeDatabase persist synchronously', async () => {
  const dir = makeTempDir('chem-lab-debounce-');
  const dbPath = path.join(dir, 'chem-lab.db');
  const prevConfig = getSaveStats();
  try {
    configureSaveDebounce({ debounceMs: 50, maxWaitMs: 300 });
    await initDatabase(dbPath);
    const beforeBurst = getSaveStats().saveCount;

    for (let i = 0; i < 20; i += 1) {
      run('INSERT INTO settings (key, value) VALUES (?, ?)', [`k_${i}`, JSON.stringify(i)]);
    }

    // Writes are immediately visible in memory, coalesced on disk
    assert.equal(query('SELECT key FROM settings').length, 20);
    const midStats = getSaveStats();
    assert.equal(midStats.dirty, true);
    assert.equal(midStats.pendingTimer, true);
    assert.equal(midStats.saveCount, beforeBurst);

    await sleep(110);

    const afterDebounce = getSaveStats();
    assert.equal(afterDebounce.dirty, false);
    assert.equal(afterDebounce.pendingTimer, false);
    assert.equal(afterDebounce.saveCount, beforeBurst + 1);

    // Verify no leftover .tmp files and disk file has all 20 rows
    const tmpFiles = fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    assert.deepEqual(tmpFiles, []);
    let diskDb = await readDiskDb(dbPath);
    try {
      assert.equal(queryRaw(diskDb, 'SELECT COUNT(*) AS c FROM settings')[0].c, 20);
    } finally {
      diskDb.close();
    }

    // Explicit flushSave() persists synchronously without waiting for debounce timer
    run('INSERT INTO settings (key, value) VALUES (?, ?)', ['flushed', JSON.stringify(true)]);
    assert.equal(getSaveStats().dirty, true);
    assert.equal(flushSave(), true);
    assert.equal(getSaveStats().dirty, false);
    assert.equal(getSaveStats().pendingTimer, false);
    assert.equal(flushSave(), false); // clean no-op

    diskDb = await readDiskDb(dbPath);
    try {
      const row = queryRaw(diskDb, 'SELECT value FROM settings WHERE key = ?', ['flushed'])[0];
      assert.equal(row.value, 'true');
    } finally {
      diskDb.close();
    }

    // runBatch() coalesces multiple run() calls into exactly one immediate atomic save
    const beforeBatch = getSaveStats().saveCount;
    runBatch(() => {
      for (let i = 0; i < 5; i += 1) {
        run('INSERT INTO settings (key, value) VALUES (?, ?)', [`batch_${i}`, JSON.stringify(i)]);
      }
    });
    assert.equal(getSaveStats().dirty, false);
    assert.equal(getSaveStats().saveCount, beforeBatch + 1);

    // saveDatabase() flushes exec() writes immediately
    const beforeExec = getSaveStats().saveCount;
    exec('INSERT INTO settings (key, value) VALUES (?, ?)', ['direct_save', '"ok"']);
    assert.equal(saveDatabase(), true);
    assert.equal(getSaveStats().saveCount, beforeExec + 1);

    // closeDatabase() flushes pending debounced writes synchronously before closing
    run('INSERT INTO settings (key, value) VALUES (?, ?)', ['before_close', '"durable"']);
    assert.equal(getSaveStats().dirty, true);
    assert.equal(getSaveStats().pendingTimer, true);
    closeDatabase();

    diskDb = await readDiskDb(dbPath);
    try {
      const row = queryRaw(diskDb, 'SELECT value FROM settings WHERE key = ?', ['before_close'])[0];
      assert.equal(row.value, '"durable"');
    } finally {
      diskDb.close();
    }
  } finally {
    configureSaveDebounce({
      debounceMs: prevConfig.debounceMs,
      maxWaitMs: prevConfig.maxWaitMs,
    });
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('maxWaitMs bounds continuous debounced writes and debounceMs=0 flushes immediately', async () => {
  const dir = makeTempDir('chem-lab-maxwait-');
  const dbPath = path.join(dir, 'chem-lab.db');
  const prevConfig = getSaveStats();
  try {
    configureSaveDebounce({ debounceMs: 80, maxWaitMs: 120 });
    await initDatabase(dbPath);
    const startSaves = getSaveStats().saveCount;

    // Emit writes every 30ms for ~180ms; debounce (80ms) alone would keep resetting,
    // so maxWaitMs (120ms) must force a flush during the stream.
    for (let i = 0; i < 6; i += 1) {
      run('INSERT INTO settings (key, value) VALUES (?, ?)', [`stream_${i}`, JSON.stringify(i)]);
      await sleep(30);
    }
    assert.ok(
      getSaveStats().saveCount > startSaves,
      'maxWaitMs should force at least one flush during continuous writes',
    );

    // Setting debounceMs=0 restores strict immediate synchronous save on every run()
    configureSaveDebounce({ debounceMs: 0, maxWaitMs: 1000 });
    flushSave();
    const beforeImmediate = getSaveStats().saveCount;
    run('INSERT INTO settings (key, value) VALUES (?, ?)', ['immediate_1', '"yes"']);
    assert.equal(getSaveStats().saveCount, beforeImmediate + 1);
    assert.equal(getSaveStats().dirty, false);
    assert.equal(getSaveStats().pendingTimer, false);
  } finally {
    configureSaveDebounce({
      debounceMs: prevConfig.debounceMs,
      maxWaitMs: prevConfig.maxWaitMs,
    });
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('process exit hook flushes pending debounced writes even if closeDatabase is not called', async () => {
  const dir = makeTempDir('chem-lab-exit-flush-');
  const dbPath = path.join(dir, 'chem-lab.db');
  const sqliteModPath = path.resolve(__dirname, '../server/db/sqlite.js');
  try {
    const childScript = `
      const sqlite = require(${JSON.stringify(sqliteModPath)});
      (async () => {
        sqlite.configureSaveDebounce({ debounceMs: 5000, maxWaitMs: 10000 });
        await sqlite.initDatabase(${JSON.stringify(dbPath)});
        sqlite.run("INSERT INTO settings (key, value) VALUES ('exit_key', '\\"persisted\\"')");
        // Intentionally exit without calling closeDatabase()
      })().catch((err) => {
        console.error(err);
        process.exit(1);
      });
    `;
    const res = spawnSync(process.execPath, ['-e', childScript], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(res.status, 0, res.stderr || res.stdout);

    const diskDb = await readDiskDb(dbPath);
    try {
      const row = queryRaw(diskDb, 'SELECT value FROM settings WHERE key = ?', ['exit_key'])[0];
      assert.ok(row, 'exit hook must flush dirty writes to disk');
      assert.equal(row.value, '"persisted"');
    } finally {
      diskDb.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('electron/main.cjs cleanup() is idempotent across window-all-closed and before-quit', async () => {
  const mainPath = path.resolve(__dirname, '../electron/main.cjs');
  const serverEntryPath = path.resolve(__dirname, '../server/index.js');
  const originalLoad = Module._load;

  const handlers = new Map();
  let serverCloseCalls = 0;
  let shutdownCalls = 0;
  let quitCalls = 0;
  let resolveReady;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const fakeElectron = {
    app: {
      name: 'test-app',
      isPackaged: false,
      getPath: () => os.tmpdir(),
      requestSingleInstanceLock: () => true,
      whenReady: () => readyPromise,
      on: (event, fn) => {
        handlers.set(event, fn);
      },
      quit: () => {
        quitCalls += 1;
        // Mirror Electron lifecycle: app.quit() fires before-quit
        const beforeQuit = handlers.get('before-quit');
        if (beforeQuit) beforeQuit();
      },
      isReady: () => true,
    },
    BrowserWindow: class FakeBrowserWindow {
      constructor() {
        this.webContents = {
          setVisualZoomLevelLimits() {},
          on() {},
          setWindowOpenHandler() {},
          getZoomFactor: () => 1,
          setZoomFactor() {},
        };
      }
      once() {}
      on() {}
      show() {}
      loadURL() {
        return Promise.resolve();
      }
      static getAllWindows() {
        return [];
      }
    },
    shell: { openExternal() {} },
    screen: {
      getPrimaryDisplay: () => ({
        scaleFactor: 1,
        workAreaSize: { width: 1440, height: 900 },
      }),
    },
    Menu: {
      buildFromTemplate: () => ({}),
      setApplicationMenu() {},
    },
    dialog: { showMessageBox: async () => {} },
  };

  const fakeServer = {
    startServer: async () => ({
      url: 'http://127.0.0.1:39999',
      port: 39999,
      server: {
        close() {
          serverCloseCalls += 1;
        },
      },
    }),
    shutdown() {
      shutdownCalls += 1;
    },
  };

  const prevEnv = {
    CHEM_LAB_ELECTRON: process.env.CHEM_LAB_ELECTRON,
    CHEM_LAB_DATA_DIR: process.env.CHEM_LAB_DATA_DIR,
    OPEN_BROWSER: process.env.OPEN_BROWSER,
  };

  delete require.cache[mainPath];
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === 'electron') return fakeElectron;
    if (path.resolve(request) === serverEntryPath) return fakeServer;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    require(mainPath);
    resolveReady();
    // Wait for bootstrap() microtasks to finish
    await sleep(30);

    const onAllClosed = handlers.get('window-all-closed');
    const onBeforeQuit = handlers.get('before-quit');
    assert.equal(typeof onAllClosed, 'function');
    assert.equal(typeof onBeforeQuit, 'function');

    // window-all-closed calls cleanup() then app.quit() which triggers before-quit -> cleanup()
    onAllClosed();
    // Calling before-quit again directly must still be a no-op
    onBeforeQuit();

    assert.equal(quitCalls, 1);
    assert.equal(serverCloseCalls, 1, 'httpServer.close must only be called once');
    assert.equal(shutdownCalls, 1, 'shutdownServer must only be called once');
  } finally {
    Module._load = originalLoad;
    delete require.cache[mainPath];
    for (const [key, value] of Object.entries(prevEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
