const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

test('write-build-manifest script exists and declares capability keys', () => {
  const script = fs.readFileSync(path.join(root, 'scripts/write-build-manifest.mjs'), 'utf8');
  assert.match(script, /aiReaction/);
  assert.match(script, /buildId/);
  assert.match(script, /writeBuildManifest/);
});

test('writeBuildManifest writes schema fields', async () => {
  const os = require('node:os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-manifest-'));
  const { writeBuildManifest } = await import(
    path.join(root, 'scripts/write-build-manifest.mjs')
  );
  const manifest = writeBuildManifest(tmp, { platform: 'test' });
  assert.ok(manifest.buildId);
  assert.equal(manifest.platform, 'test');
  assert.equal(manifest.capabilities.aiReaction, true);
  const onDisk = JSON.parse(
    fs.readFileSync(path.join(tmp, 'build-manifest.json'), 'utf8'),
  );
  assert.equal(onDisk.buildId, manifest.buildId);
});

test('readBuildManifest falls back to dev manifest', () => {
  const { readBuildManifest, DEV_MANIFEST } = require('../server/utils/build-manifest');
  const manifest = readBuildManifest();
  assert.ok(manifest.buildId);
  assert.equal(typeof manifest.capabilities, 'object');
  assert.equal(DEV_MANIFEST.buildId, 'dev');
});
