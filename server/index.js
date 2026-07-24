/**
 * 小黄的化学实验室 - 后端
 * 支持：npm start 开发 / pkg 便携 exe / Electron 内嵌
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const net = require('net');
const { exec } = require('child_process');
const { initDatabase, closeDatabase, queryOne } = require('./db/sqlite');
const {
  isPkg,
  isElectron,
  getDataDir,
  getDbPath,
  getPublicDir,
} = require('./paths');
const { importBuiltinMolecules } = require('./seed/import-builtin');

const moleculesRouter = require('./routes/molecules');
const settingsRouter = require('./routes/settings');
const aiRouter = require('./routes/ai');
const quizRouter = require('./routes/quiz');

const app = express();
const PREFERRED_PORT = Number(process.env.PORT) || 3000;

// 本机 Origin（含 localhost / 127.0.0.1 / [::1] / 常见内网）
const ORIGIN_OK =
  /^(https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?)$/i;
const LAN_OK =
  /^(https?:\/\/(192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?)$/i;

app.use(
  cors({
    origin(origin, cb) {
      // 同源、curl、Electron 内嵌页、部分扩展：无 Origin
      if (!origin) return cb(null, true);
      // 便携 exe：放宽，避免 Win 浏览器 Origin 细节导致 Failed to fetch
      if (isPkg()) return cb(null, true);
      if (ORIGIN_OK.test(origin) || LAN_OK.test(origin)) return cb(null, true);
      return cb(null, false);
    },
  }),
);
app.use(express.json({ limit: '10mb' }));

const publicDir = getPublicDir();
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
  console.log(`静态资源: ${publicDir}`);
} else {
  console.warn(
    `警告: 未找到前端目录 ${publicDir}，请先构建前端（npm run build:frontend）`,
  );
}

app.use('/api/molecules', moleculesRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/quiz', quizRouter);

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    pkg: isPkg(),
    electron: isElectron(),
    publicDir,
    dataDir: getDataDir(),
  });
});

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `接口不存在: ${req.method} ${req.originalUrl}`,
    data: null,
  });
});

app.get('*', (req, res) => {
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res
      .status(404)
      .type('html')
      .send(
        `<h1>前端未构建</h1><p>请先构建前端，确保 public/index.html 存在。</p><p>${indexPath}</p>`,
      );
  }
});

app.use((err, req, res, next) => {
  console.error('服务器错误:', err);
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    data: null,
  });
});

function findFreePort(startPort) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    const tryListen = () => {
      const server = net.createServer();
      server.unref();
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          port += 1;
          if (port > startPort + 50) {
            reject(new Error('找不到可用端口'));
            return;
          }
          tryListen();
        } else {
          reject(err);
        }
      });
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(port));
      });
    };
    tryListen();
  });
}

function openBrowser(url) {
  const platform = process.platform;
  let cmd;
  if (platform === 'win32') {
    cmd = `cmd /c start "" "${url}"`;
  } else if (platform === 'darwin') {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd, (err) => {
    if (err) console.warn('无法自动打开浏览器，请手动访问:', url);
  });
}

/**
 * @param {object} [options]
 * @param {boolean} [options.openBrowser] 启动后是否打开系统浏览器（pkg 默认开；Electron 关）
 * @param {string} [options.host] 监听地址；pkg 默认 0.0.0.0，其它默认 127.0.0.1
 * @returns {Promise<{ port: number, url: string, urlLocalhost: string, server: import('http').Server }>}
 */
async function startServer(options = {}) {
  const dataDir = getDataDir();
  const dbPath = getDbPath();
  fs.mkdirSync(dataDir, { recursive: true });

  const mode = isPkg() ? '打包 exe' : isElectron() ? 'Electron' : 'Node 开发';
  console.log(`数据目录: ${dataDir}`);
  console.log(`运行模式: ${mode}`);

  try {
    await initDatabase(dbPath);

    const count = queryOne('SELECT COUNT(*) as count FROM molecules');
    if (!count || Number(count.count) === 0) {
      console.log('正在导入内置分子…');
      importBuiltinMolecules();
    }

    const port = await findFreePort(PREFERRED_PORT);
    const url = `http://127.0.0.1:${port}`;
    const urlLocalhost = `http://localhost:${port}`;

    // pkg 便携版：绑 0.0.0.0，兼容 Win 上 localhost / 局域网访问
    // Electron / 开发：仅本机回环
    const defaultHost = isPkg() ? '0.0.0.0' : '127.0.0.1';
    const host = options.host != null ? options.host : defaultHost;

    const shouldOpenBrowser =
      options.openBrowser != null
        ? options.openBrowser
        : isPkg() || process.env.OPEN_BROWSER === '1';

    const server = await new Promise((resolve, reject) => {
      const s = app.listen(port, host, () => {
        console.log(`\n================================`);
        console.log(`小黄的化学实验室`);
        if (isElectron()) {
          console.log(`Electron 内嵌服务: ${url}`);
        } else {
          console.log(`请用浏览器打开（勿关本窗口）:`);
          console.log(`  ${url}`);
          console.log(`  ${urlLocalhost}`);
        }
        console.log(`监听: ${host}:${port}`);
        console.log(`数据目录: ${dataDir}`);
        console.log(`================================\n`);

        if (shouldOpenBrowser) {
          setTimeout(() => openBrowser(url), 600);
        }
        resolve(s);
      });
      s.on('error', reject);
    });

    return { port, url, urlLocalhost, server };
  } catch (err) {
    console.error('启动服务器失败:', err);
    if (isPkg()) {
      console.error('\n按任意键退出…');
      try {
        require('readline')
          .createInterface({ input: process.stdin, output: process.stdout })
          .question('', () => process.exit(1));
      } catch {
        setTimeout(() => process.exit(1), 8000);
      }
    } else if (!isElectron()) {
      process.exit(1);
    }
    throw err;
  }
}

function shutdown() {
  console.log('\n正在关闭…');
  try {
    closeDatabase();
  } catch (e) {
    console.warn('关闭数据库时出错:', e?.message || e);
  }
}

process.on('SIGINT', () => {
  shutdown();
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown();
  process.exit(0);
});

module.exports = {
  app,
  startServer,
  shutdown,
  closeDatabase,
};

// 直接 node index.js / pkg 入口时启动；被 Electron require 时不自动 listen
if (require.main === module) {
  startServer();
}
