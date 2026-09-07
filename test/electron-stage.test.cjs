/**
 * Electron 打包 stage 契约：
 * - COPY_DIRS 必须包含 AI 路由依赖的 services
 * - 源码中 require 的 server 顶层目录都要能进 stage
 */
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function source(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

test('stage-electron-server COPY_DIRS includes services (Win 秒退根因)', () => {
  const script = source('scripts/stage-electron-server.js');
  const m = script.match(/const COPY_DIRS\s*=\s*\[([^\]]+)\]/);
  assert.ok(m, 'COPY_DIRS must be defined');
  const dirs = m[1]
    .split(',')
    .map((s) => s.replace(/['"\s]/g, ''))
    .filter(Boolean);
  assert.ok(dirs.includes('services'), `COPY_DIRS must include services, got: ${dirs.join(',')}`);
  assert.ok(dirs.includes('routes'));
  assert.ok(dirs.includes('seed'));
  assert.ok(dirs.includes('utils'));
  assert.ok(dirs.includes('db'));
  assert.ok(dirs.includes('public'));
});

test('server AI routes require services that exist on disk', () => {
  const servicesRoot = path.join(root, 'server', 'services');
  assert.ok(fs.existsSync(servicesRoot), 'server/services must exist');

  const required = [
    'server/services/ai/chat-service.js',
    'server/services/ai/response-parser.js',
    'server/services/ai/chat-client.js',
  ];
  for (const rel of required) {
    assert.ok(fs.existsSync(path.join(root, rel)), `missing ${rel}`);
  }

  // 路由里引用 services 时，路径必须落在 COPY_DIRS 会拷贝的目录
  const routesDir = path.join(root, 'server', 'routes');
  /** @type {string[]} */
  const hits = [];
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) {
        const text = fs.readFileSync(p, 'utf8');
        const re = /require\(['"](\.\.\/)+services\/[^'"]+['"]\)/g;
        let m;
        while ((m = re.exec(text))) {
          hits.push(`${path.relative(root, p)} → ${m[0]}`);
        }
      }
    }
  }
  walk(routesDir);
  assert.ok(hits.length >= 1, 'expected AI routes to require services');
  // 每个 require 解析后文件存在
  for (const line of hits) {
    const reqPath = line.split('→')[1].trim().match(/require\(['"]([^'"]+)['"]\)/)[1];
    const file = line.split('→')[0].trim();
    const abs = path.resolve(path.dirname(path.join(root, file)), reqPath);
    const withJs = abs.endsWith('.js') ? abs : `${abs}.js`;
    assert.ok(
      fs.existsSync(withJs) || fs.existsSync(abs),
      `unresolved ${line} → ${withJs}`,
    );
  }
});

test('stage script runs require smoke check after copy', () => {
  const script = source('scripts/stage-electron-server.js');
  assert.match(script, /stage require ok|smoke/i);
  assert.match(script, /Stage smoke require FAILED/);
});

test('stage script runs AI route smoke including /api/ai/reaction', () => {
  const script = source('scripts/stage-electron-server.js');
  assert.match(script, /stage-route-smoke/);
  const smoke = source('scripts/stage-route-smoke.cjs');
  assert.match(smoke, /\/api\/ai\/reaction/);
});

test('electron main enforces version lock when packaged', () => {
  const main = source('electron/main.cjs');
  assert.match(main, /version-lock/);
  assert.match(main, /assertBundleConsistency/);
  assert.match(main, /app\.isPackaged/);
});

test('electron-builder packs every relative require from main.cjs', () => {
  const main = source('electron/main.cjs');
  const yml = source('electron-builder.yml');
  const filesBlock = yml.match(/^files:\n((?:  - .+\n)+)/m);
  assert.ok(filesBlock, 'files: list must exist in electron-builder.yml');
  const packed = new Set(
    filesBlock[1]
      .split('\n')
      .map((line) => line.replace(/^\s*-\s*/, '').trim())
      .filter(Boolean),
  );
  const relRequires = [...main.matchAll(/require\(['"](\.\/[^'"]+)['"]\)/g)].map(
    (m) => m[1],
  );
  assert.ok(relRequires.length >= 1, 'main.cjs should require local modules');
  for (const rel of relRequires) {
    const asElectronPath = path.posix.join('electron', path.posix.basename(rel));
    assert.ok(
      packed.has(asElectronPath) || packed.has(rel.replace(/^\.\//, 'electron/')),
      `electron-builder.yml files must include ${asElectronPath} (required by main.cjs as ${rel})`,
    );
  }
});
