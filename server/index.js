/**
 * 小黄的化学实验室 - 后端
 * 支持：npm start 开发 / pkg 打包为 Windows 便携 exe
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
  getDataDir,
  getDbPath,
  getPublicDir,
  getWritableRoot,
} = require('./paths');
const { importBuiltinMolecules } = require('./seed/import-builtin');

const moleculesRouter = require('./routes/molecules');
const settingsRouter = require('./routes/settings');
const aiRouter = require('./routes/ai');
const quizRouter = require('./routes/quiz');

const app = express();
const PREFERRED_PORT = Number(process.env.PORT) || 3000;

const ORIGIN_OK =
  /^(https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:\d+)?|https?:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?|https?:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}(:\d+)?)$/i;

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (ORIGIN_OK.test(origin)) return cb(null, true);
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
  console.warn(`警告: 未找到前端目录 ${publicDir}，请先执行 npm run build:exe 的前端步骤`);
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
        `<h1>前端未构建</h1><p>请先在项目根目录执行打包脚本，确保 public/index.html 存在。</p><p>${indexPath}</p>`,
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

async function startServer() {
  const dataDir = getDataDir();
  const dbPath = getDbPath();
  fs.mkdirSync(dataDir, { recursive: true });

  console.log(`数据目录: ${dataDir}`);
  console.log(`运行模式: ${isPkg() ? '打包 exe' : 'Node 开发'}`);

  try {
    await initDatabase(dbPath);

    const count = queryOne('SELECT COUNT(*) as count FROM molecules');
    if (!count || Number(count.count) === 0) {
      console.log('正在导入内置分子…');
      importBuiltinMolecules();
    }

    const port = await findFreePort(PREFERRED_PORT);
    const url = `http://127.0.0.1:${port}`;

    app.listen(port, '127.0.0.1', () => {
      console.log(`\n================================`);
      console.log(`小黄的化学实验室`);
      console.log(`访问地址: ${url}`);
      console.log(`数据目录: ${dataDir}`);
      console.log(`请勿关闭本窗口`);
      console.log(`================================\n`);

      // 打包运行时自动打开浏览器
      if (isPkg() || process.env.OPEN_BROWSER === '1') {
        setTimeout(() => openBrowser(url), 400);
      }
    });
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
    } else {
      process.exit(1);
    }
  }
}

process.on('SIGINT', () => {
  console.log('\n正在关闭…');
  closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n正在关闭…');
  closeDatabase();
  process.exit(0);
});

startServer();
