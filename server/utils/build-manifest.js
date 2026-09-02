const fs = require('fs');
const path = require('path');
const { getSnapshotRoot } = require('../paths');
const { getDefaultCapabilities } = require('./capabilities');

function readRootPackageVersion() {
  try {
    const pkgPath = path.join(getSnapshotRoot(), '..', 'package.json');
    if (fs.existsSync(pkgPath)) {
      return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
    }
  } catch {
    /* ignore */
  }
  try {
    return require('../package.json').version;
  } catch {
    return '0.0.0';
  }
}

const DEV_MANIFEST = {
  appVersion: readRootPackageVersion(),
  buildId: 'dev',
  buildTime: null,
  gitSha: 'dev',
  platform: 'dev',
  capabilities: getDefaultCapabilities(),
};

function readBuildManifest() {
  const root = getSnapshotRoot();
  const candidates = [
    path.join(root, 'build-manifest.json'),
    path.join(root, 'public', 'build-manifest.json'),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* try next */
    }
  }
  return { ...DEV_MANIFEST, capabilities: { ...DEV_MANIFEST.capabilities } };
}

module.exports = {
  DEV_MANIFEST,
  readBuildManifest,
};
