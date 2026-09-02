const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readManifestFile,
  formatMismatchMessage,
} = require('../electron/version-lock.cjs');

test('formatMismatchMessage includes all buildIds', () => {
  const msg = formatMismatchMessage(['aaa', 'bbb']);
  assert.match(msg, /aaa/);
  assert.match(msg, /bbb/);
  assert.match(msg, /卸载/);
});

test('readManifestFile returns null for missing file', () => {
  assert.equal(readManifestFile(path.join(__dirname, 'missing-manifest.json')), null);
});

test('readManifestFile parses valid json', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const tmp = path.join(os.tmpdir(), `chem-lock-${process.pid}.json`);
  fs.writeFileSync(tmp, JSON.stringify({ buildId: 'test-build' }));
  assert.deepEqual(readManifestFile(tmp), { buildId: 'test-build' });
  fs.unlinkSync(tmp);
});
