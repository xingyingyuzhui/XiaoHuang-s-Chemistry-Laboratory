/**
 * Electron 主进程：前后端 build-manifest 一致性校验
 */
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

function readManifestFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function readServerManifest(serverRoot) {
  return (
    readManifestFile(path.join(serverRoot, 'build-manifest.json')) ||
    readManifestFile(path.join(serverRoot, 'public', 'build-manifest.json'))
  );
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null });
        } catch (err) {
          reject(new Error(`无法解析 ${url} 的 JSON`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error(`请求超时: ${url}`));
    });
  });
}

function formatMismatchMessage(ids) {
  return [
    '程序文件不完整或版本不一致，部分功能（如 AI 添加反应）可能无法使用。',
    '',
    `检测到 buildId：${ids.join(' / ')}`,
    '',
    '请完全退出应用（Windows 任务管理器确认无残留进程）后，卸载并重新安装最新版。',
  ].join('\n');
}

async function assertBundleConsistency({ serverRoot, port }) {
  const diskManifest = readServerManifest(serverRoot);
  if (!diskManifest?.buildId) {
    throw new Error('缺少 build-manifest.json，请重新安装应用。');
  }

  const base = `http://127.0.0.1:${port}`;
  const [healthRes, publicRes] = await Promise.all([
    httpJson(`${base}/api/health`),
    httpJson(`${base}/build-manifest.json`),
  ]);

  if (healthRes.status !== 200 || !healthRes.data) {
    throw new Error('无法读取后端版本信息，请重新安装应用。');
  }
  if (publicRes.status !== 200 || !publicRes.data) {
    throw new Error('无法读取前端版本信息，请重新安装应用。');
  }

  const ids = [
    diskManifest.buildId,
    healthRes.data.buildId,
    publicRes.data.buildId,
  ].filter(Boolean);
  const unique = [...new Set(ids)];
  if (unique.length !== 1) {
    throw new Error(formatMismatchMessage(unique));
  }

  if (healthRes.data.capabilities?.aiReaction === false) {
    throw new Error(
      '当前后端缺少 AI 反应功能，请卸载并重新安装最新版（buildId 不一致或安装不完整）。',
    );
  }

  return {
    buildId: unique[0],
    appVersion: healthRes.data.appVersion || diskManifest.appVersion || null,
  };
}

module.exports = {
  assertBundleConsistency,
  readManifestFile,
  readServerManifest,
  httpJson,
  formatMismatchMessage,
};
