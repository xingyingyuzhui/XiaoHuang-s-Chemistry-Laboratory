/**
 * 将根目录 Vite dist 复制到 server/public
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const src = path.join(root, 'dist');
const dest = path.join(__dirname, '..', 'public');

function rimraf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const a = path.join(from, name);
    const b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error('未找到前端构建产物 dist/index.html，请先在项目根目录执行 npm run build');
  process.exit(1);
}

rimraf(dest);
copyDir(src, dest);

const manifestPath = path.join(dest, 'build-manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('未找到 dist/build-manifest.json，请确认 Vite build 已写入 manifest');
  process.exit(1);
}

const serverManifest = path.join(__dirname, '..', 'build-manifest.json');
fs.copyFileSync(manifestPath, serverManifest);
console.log(`前端已复制到 ${dest}`);
console.log(`build-manifest 已同步到 ${serverManifest}`);
