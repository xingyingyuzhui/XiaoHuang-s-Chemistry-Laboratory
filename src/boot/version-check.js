/**
 * 启动时校验前后端 build-manifest / capabilities（Electron 桌面版友好阻断）
 */

let cachedCheck = null;

const REINSTALL_HINT =
  '桌面版程序文件不完整或版本过旧。请完全退出应用（任务管理器确认无残留）后卸载并重新安装最新版。';

export async function checkBundleVersion({ force = false } = {}) {
  if (cachedCheck && !force) return cachedCheck;

  try {
    const [publicRes, healthRes] = await Promise.all([
      fetch('/build-manifest.json', { cache: 'no-store' }),
      fetch('/api/health', { cache: 'no-store' }),
    ]);

    if (!healthRes.ok) {
      cachedCheck = { ok: true, buildId: 'unknown', missingCapabilities: [], reinstallHint: REINSTALL_HINT };
      return cachedCheck;
    }

    const health = await healthRes.json();
    const pub = publicRes.ok ? await publicRes.json() : null;

    /** @type {string[]} */
    const missingCapabilities = [];
    const caps = health.capabilities || {};
    for (const key of ['aiReaction', 'aiGenerate', 'aiQuiz']) {
      if (caps[key] === false) missingCapabilities.push(key);
    }

    const mismatch = Boolean(pub?.buildId && health.buildId && pub.buildId !== health.buildId);
    const ok = !mismatch && missingCapabilities.length === 0;

    cachedCheck = {
      ok,
      buildId: health.buildId || pub?.buildId || 'unknown',
      appVersion: health.appVersion || pub?.appVersion || null,
      missingCapabilities,
      mismatch,
      reinstallHint: REINSTALL_HINT,
    };
    return cachedCheck;
  } catch {
    cachedCheck = { ok: true, buildId: 'unknown', missingCapabilities: [], reinstallHint: REINSTALL_HINT };
    return cachedCheck;
  }
}

export function showVersionMismatchBanner(result) {
  if (!result || result.ok) return;
  if (document.getElementById('versionMismatchBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'versionMismatchBanner';
  banner.className = 'version-mismatch-banner';
  banner.setAttribute('role', 'alert');
  banner.textContent = result.mismatch
    ? `${REINSTALL_HINT}（buildId 不一致）`
    : `${REINSTALL_HINT}（缺少：${result.missingCapabilities.join(', ') || '关键 AI 能力'}）`;

  document.body.prepend(banner);
}

export function isAiReactionAvailable(result) {
  if (!result) return true;
  if (result.mismatch) return false;
  if (result.missingCapabilities?.includes('aiReaction')) return false;
  return true;
}

export { REINSTALL_HINT };
