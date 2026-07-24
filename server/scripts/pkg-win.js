/**
 * 调用 pkg 打包 Windows x64 便携 exe
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const serverDir = path.join(__dirname, '..');
const outDir = path.join(serverDir, '..', 'dist-exe');
const outFile = path.join(outDir, 'XiaoHuang-ChemLab.exe');

fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(path.join(serverDir, 'public', 'index.html'))) {
  console.error('缺少 server/public，请先 npm run build:frontend');
  process.exit(1);
}

console.log('正在打包 Windows exe（可能需数分钟，首次会下载 node 基座）…');

const r = spawnSync(
  'npx',
  ['pkg', '.', '--targets', 'node18-win-x64', '--output', outFile],
  {
    cwd: serverDir,
    stdio: 'inherit',
    shell: true,
  },
);

if (r.status !== 0) {
  console.error('pkg 打包失败');
  process.exit(r.status || 1);
}

// 附带简短使用说明
const readme = `小黄的化学实验室 · Windows 便携版（路线 B）

使用方法：
1. 双击 XiaoHuang-ChemLab.exe
2. 保持黑色控制台窗口不要关闭
3. 浏览器应自动打开 http://127.0.0.1:3000 （若端口占用会自动换端口，请看控制台提示）
4. 数据保存在本程序同目录的 data/ 文件夹（chem-lab.db）
5. DeepSeek API Key 请在软件「设置 → AI」中填写

注意：
- 未做代码签名时，Windows 智能筛选可能提示「未知发布者」，选择「仍要运行」即可
- 杀毒软件误报时可添加信任
- 需要本机联网才能使用 AI 功能
`;

fs.writeFileSync(path.join(outDir, '使用说明.txt'), readme, 'utf8');
console.log(`\n完成: ${outFile}`);
console.log(`说明: ${path.join(outDir, '使用说明.txt')}`);
