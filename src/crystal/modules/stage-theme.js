/**
 * 模块 01 & 模块 03 共享 5 主题舞台色板与主题切换监听
 * 动态读取 data-theme 与 CSS 变量，确保默认/文具/试剂/像素（浅色）与黑板（深色）均高对比清晰。
 */

function readCssVar(names, fallback) {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const style = getComputedStyle(document.documentElement);
  for (const name of Array.isArray(names) ? names : [names]) {
    const val = style.getPropertyValue(name).trim();
    if (val) return val;
  }
  return fallback;
}

export function getStagePalette() {
  const theme = typeof document !== 'undefined'
    ? document.documentElement.getAttribute('data-theme') || 'default'
    : 'default';
  const isDark = theme === 'blackboard';
  const isWarm = theme === 'stationery' || theme === 'reagent';

  const bg = readCssVar('--stage-3d-bg', isDark ? '#0a1613' : '#ffffff');
  const surfaceRaw = readCssVar(['--surface', '--card-bg'], isDark ? '#243f37' : '#ffffff');
  const surface2Raw = readCssVar(['--surface-2', '--paper-deep', '--paper'], isDark ? '#132e26' : '#f1f5f9');
  const ink = readCssVar('--ink', isDark ? '#eef4ef' : '#1e293b');
  const muted = readCssVar(['--muted', '--text-muted', '--ink-soft'], isDark ? '#a8bfb2' : '#475569');
  const borderRaw = readCssVar('--border', isDark ? '#3d5c50' : '#cbd5e1');
  const accent = readCssVar('--accent', isDark ? '#f0d060' : '#3b82f6');
  const accentSoft = readCssVar('--accent-soft', isDark ? '#3d4a28' : '#eff6ff');

  if (isDark) {
    return {
      theme, isDark: true, bg, bgAlt: '#142f27',
      surface: 'rgba(26, 61, 50, 0.82)', surfaceSoft: 'rgba(26, 61, 50, 0.48)',
      inset: '#0f241d', surfaceRaw, surface2Raw, ink, muted,
      border: 'rgba(200, 217, 206, 0.28)', borderStrong: 'rgba(200, 217, 206, 0.56)',
      grid: 'rgba(200, 217, 206, 0.24)', accent, accentSoft,
      crystal: '#38bdf8', crystalSoft: 'rgba(56, 189, 248, 0.20)', crystalText: '#7dd3fc',
      amorphous: '#fbbf24', amorphousSoft: 'rgba(251, 191, 36, 0.20)', amorphousText: '#fde047',
      ionic: '#c084fc', ionicText: '#e9d5ff',
      covalent: '#fb7185', covalentText: '#fecdd3',
      ok: '#4ade80', okSoft: 'rgba(34, 197, 94, 0.22)', okText: '#bbf7d0',
      bad: '#f87171', badSoft: 'rgba(239, 68, 68, 0.24)', badText: '#fecaca',
      water: 'rgba(14, 165, 233, 0.20)', waterDeep: 'rgba(2, 132, 199, 0.34)',
      molten: 'rgba(217, 119, 6, 0.30)', wireOff: '#6b877a', wireOn: '#38bdf8',
      trackBg: 'rgba(10, 22, 19, 0.72)', flash: '#fde047', sphereRim: 'rgba(255, 255, 255, 0.30)',
    };
  }

  return {
    theme, isDark: false, bg, bgAlt: surface2Raw,
    surface: isWarm ? 'rgba(255, 252, 246, 0.88)' : 'rgba(255, 255, 255, 0.88)',
    surfaceSoft: isWarm ? 'rgba(243, 235, 223, 0.74)' : 'rgba(241, 245, 249, 0.78)',
    inset: isWarm ? '#f3ece0' : '#eef3f8', surfaceRaw, surface2Raw, ink, muted,
    border: borderRaw,
    borderStrong: isWarm ? 'rgba(42, 36, 32, 0.45)' : 'rgba(30, 41, 59, 0.42)',
    grid: isWarm ? 'rgba(92, 83, 76, 0.26)' : 'rgba(71, 85, 105, 0.24)',
    accent, accentSoft,
    crystal: '#0284c7', crystalSoft: 'rgba(2, 132, 199, 0.14)', crystalText: '#0369a1',
    amorphous: '#d97706', amorphousSoft: 'rgba(217, 119, 6, 0.14)', amorphousText: '#92400e',
    ionic: '#7c3aed', ionicText: '#6d28d9',
    covalent: '#e11d48', covalentText: '#be123c',
    ok: '#16a34a', okSoft: 'rgba(22, 163, 74, 0.14)', okText: '#166534',
    bad: '#dc2626', badSoft: 'rgba(220, 38, 38, 0.12)', badText: '#991b1b',
    water: 'rgba(14, 165, 233, 0.12)', waterDeep: 'rgba(2, 132, 199, 0.22)',
    molten: 'rgba(217, 119, 6, 0.15)', wireOff: '#94a3b8', wireOn: '#0284c7',
    trackBg: 'rgba(15, 23, 42, 0.10)', flash: '#d97706', sphereRim: 'rgba(15, 23, 42, 0.24)',
  };
}

export function observeThemeChange(cb) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  const mo = new MutationObserver(() => cb?.(getStagePalette()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}
