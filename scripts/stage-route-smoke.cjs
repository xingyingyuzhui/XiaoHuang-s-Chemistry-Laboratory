/**
 * Electron 打包后关键 AI 路由冒烟（404 = 坏包）
 */
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const ROUTES = [
  '/api/ai/generate',
  '/api/ai/reaction',
  '/api/ai/tip',
  '/api/ai/balance',
  '/api/ai/quiz/generate',
];

function postJson(port, routePath, body = '{}') {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: routePath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({ status: res.statusCode, body: data });
        });
      },
    );
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.setTimeout(8000, () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout' });
    });
    req.write(body);
    req.end();
  });
}

async function smokeRoutes(stageServerEntry, tmpRoot) {
  process.env.CHEM_LAB_ELECTRON = '1';
  process.env.CHEM_LAB_DATA_DIR = path.join(tmpRoot, 'data');
  process.env.OPEN_BROWSER = '0';

  /** @type {{ server?: import('http').Server, port?: number } | null} */
  let started = null;
  /** @type {(() => void) | null} */
  let shutdown = null;

  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const serverMod = require(stageServerEntry);
    started = await serverMod.startServer({ openBrowser: false, host: '127.0.0.1' });
    shutdown = serverMod.shutdown;

    for (const route of ROUTES) {
      const result = await postJson(started.port, route);
      if (result.status === 404) {
        throw new Error(`Stage route smoke FAILED: POST ${route} → 404`);
      }
      if (!result.status) {
        throw new Error(`Stage route smoke FAILED: POST ${route} → ${result.error || 'no response'}`);
      }
    }

    console.log('Stage route smoke ok:', ROUTES.join(', '));
  } finally {
    try {
      started?.server?.close?.();
    } catch {
      /* ignore */
    }
    try {
      shutdown?.();
    } catch {
      /* ignore */
    }
  }
}

async function smokeRoutesFromEntry(stageServerEntry) {
  const tmpRoot = path.join(
    os.tmpdir(),
    `chem-lab-stage-route-smoke-${Date.now()}-${process.pid}`,
  );
  await smokeRoutes(stageServerEntry, tmpRoot);
}

module.exports = {
  ROUTES,
  smokeRoutes,
  smokeRoutesFromEntry,
};
