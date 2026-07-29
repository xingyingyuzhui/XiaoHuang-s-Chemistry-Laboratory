'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initDatabase,
  closeDatabase,
  query,
} = require('../server/db/sqlite');
const { ensureQuizSchema } = require('../server/db/ensure-quiz-schema');

async function withTempDb(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-quiz-schema-'));
  const dbPath = path.join(dir, 'chem-lab.db');
  try {
    await initDatabase(dbPath);
    return await fn();
  } finally {
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('ensureQuizSchema is idempotent and owns quiz tables + source_type', async () => {
  await withTempDb(() => {
    ensureQuizSchema();
    ensureQuizSchema();

    const tables = query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('quiz_sessions','quiz_items','quiz_wrong_book') ORDER BY name`,
    ).map((r) => r.name);
    assert.deepEqual(tables, ['quiz_items', 'quiz_sessions', 'quiz_wrong_book']);

    const cols = query('PRAGMA table_info(quiz_sessions)');
    assert.ok(
      cols.some((c) => c.name === 'source_type'),
      'quiz_sessions.source_type must exist after ensureQuizSchema',
    );
  });
});
