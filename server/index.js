/**
 * 小黄的化学实验室 - 后端
 * 支持：npm start 开发 / pkg 便携 exe / Electron 内嵌
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
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
const { importBuiltinReactionsIfEmpty } = require('./seed/import-reactions');

const moleculesRouter = require('./routes/molecules');
const settingsRouter = require('./routes/settings');
const aiRouter = require('./routes/ai');
const quizRouter = require('./routes/quiz');
const reactionsRouter = require('./routes/reactions');
const studentsRouter = require('./routes/students');

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
app.use('/api/reactions', reactionsRouter);
app.use('/api/students', studentsRouter);

app.get('/api/health', (req, res) => {
  const payload = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    pkg: isPkg(),
    electron: isElectron(),
  };
  // 开发模式才返回路径，降低信息暴露
  if (!isPkg() && !isElectron() && process.env.NODE_ENV !== 'production') {
    payload.publicDir = publicDir;
    payload.dataDir = getDataDir();
  }
  res.json(payload);
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

/**
 * 在 host 上尝试从 startPort 起监听；占用则 +1，避免先探测再释放的竞态
 * @returns {Promise<{ server: import('http').Server, port: number }>}
 */
function listenWithRetry(appInstance, startPort, host) {
  return new Promise((resolve, reject) => {
    let port = startPort;
    let attempts = 0;
    const maxAttempts = 50;

    const tryListen = () => {
      const s = appInstance.listen(port, host, () => {
        resolve({ server: s, port });
      });
      s.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          attempts += 1;
          port += 1;
          try {
            s.close();
          } catch {
            /* ignore */
          }
          tryListen();
        } else {
          reject(
            err.code === 'EADDRINUSE'
              ? new Error('找不到可用端口')
              : err,
          );
        }
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

    try {
      importBuiltinReactionsIfEmpty();
    } catch (e) {
      console.warn('导入内置反应失败:', e?.message || e);
    }

    // 默认仅本机；需要局域网时设 CHEM_LAB_BIND=0.0.0.0 或 options.host
    // pkg 若需局域网可环境变量覆盖（默认 127.0.0.1 更安全）
    const defaultHost =
      process.env.CHEM_LAB_BIND ||
      (isPkg() ? '127.0.0.1' : '127.0.0.1');
    const host = options.host != null ? options.host : defaultHost;

    const shouldOpenBrowser =
      options.openBrowser != null
        ? options.openBrowser
        : isPkg() || process.env.OPEN_BROWSER === '1';

    const { server, port } = await listenWithRetry(
      app,
      PREFERRED_PORT,
      host,
    );
    const url = `http://127.0.0.1:${port}`;
    const urlLocalhost = `http://localhost:${port}`;

    console.log(`\n================================`);
    console.log(`小黄的化学实验室`);
    if (isElectron()) {
      console.log(`Electron 内嵌服务: ${url}`);
    } else {
      console.log(`请用浏览器打开（勿关本窗口）:`);
      console.log(`  ${url}`);
      console.log(`  ${urlLocalhost}`);
      if (host === '0.0.0.0') {
        console.log(`（已绑定 0.0.0.0，局域网可访问；请注意 API Key 安全）`);
      }
    }
    console.log(`监听: ${host}:${port}`);
    console.log(`数据目录: ${dataDir}`);
    console.log(`================================\n`);

    if (shouldOpenBrowser) {
      setTimeout(() => openBrowser(url), 600);
    }

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
