const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  acquireDatabaseLock,
  releaseDatabaseLock,
} = require('../server/db/sqlite');

test('database lock prevents a second writer and is released cleanly', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-lock-test-'));
  const dbPath = path.join(dir, 'chem-lab.db');
  try {
    acquireDatabaseLock(dbPath);
    assert.throws(
      () => acquireDatabaseLock(dbPath),
      /正在被另一个实例使用/,
    );
    releaseDatabaseLock();

    assert.doesNotThrow(() => acquireDatabaseLock(dbPath));
  } finally {
    releaseDatabaseLock();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
