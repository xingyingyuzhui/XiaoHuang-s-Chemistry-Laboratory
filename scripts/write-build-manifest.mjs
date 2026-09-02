/**
 * 构建时写入 build-manifest.json（前端 dist / server public / electron stage 共用）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const CAPABILITY_KEYS = [
  'aiGenerate',
  'aiReaction',
  'aiQuiz',
  'aiBalance',
  'aiStoich',
  'aiLab',
  'aiTip',
];

function getGitSha() {
  if (process.env.GIT_SHA || process.env.VITE_GIT_SHA) {
    return String(process.env.GIT_SHA || process.env.VITE_GIT_SHA).trim();
  }
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'nogit';
  }
}

export function writeBuildManifest(outDir, { platform = 'web' } = {}) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const buildTime = process.env.BUILD_TIME || new Date().toISOString();
  const gitSha = getGitSha();
  const buildStamp = buildTime.replace(/[-:TZ.]/g, '').slice(0, 14);
  const buildId = `${gitSha}-${buildStamp}`;

  const manifest = {
    appVersion: pkg.version,
    buildId,
    buildTime,
    gitSha,
    platform,
    capabilities: Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, true])),
  };

  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'build-manifest.json');
  fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}

function parseArgs(argv) {
  const outIdx = argv.indexOf('--out');
  const platformIdx = argv.indexOf('--platform');
  return {
    outDir: outIdx >= 0 ? argv[outIdx + 1] : path.join(root, 'dist'),
    platform: platformIdx >= 0 ? argv[platformIdx + 1] : 'web',
  };
}

const invokedDirectly = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const { outDir, platform } = parseArgs(process.argv.slice(2));
  const manifest = writeBuildManifest(outDir, { platform });
  console.log(`build-manifest.json → ${path.join(outDir, 'build-manifest.json')} (${manifest.buildId})`);
}
