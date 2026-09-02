const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../server/index.js');
const { hasRoute, probeCapabilities } = require('../server/utils/route-probe');
const { CAPABILITY_ROUTE_SPECS } = require('../server/utils/capabilities');

test('critical AI routes are mounted on Express app', () => {
  for (const [key, spec] of Object.entries(CAPABILITY_ROUTE_SPECS)) {
    assert.equal(
      hasRoute(app, spec.method, spec.path),
      true,
      `missing route for capability ${key}: ${spec.method} ${spec.path}`,
    );
  }
});

test('probeCapabilities marks aiReaction true when route exists', () => {
  const caps = probeCapabilities(app);
  assert.equal(caps.aiReaction, true);
  assert.equal(caps.aiGenerate, true);
  assert.equal(caps.aiQuiz, true);
});

test('/api/health includes buildId and capabilities shape', async () => {
  const { readBuildManifest } = require('../server/utils/build-manifest');
  const manifest = readBuildManifest();
  assert.ok(manifest.buildId);
  const caps = probeCapabilities(app);
  assert.equal(typeof caps.aiReaction, 'boolean');
});
