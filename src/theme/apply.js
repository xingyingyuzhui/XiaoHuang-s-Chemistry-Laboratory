/**
 * 把主题 id 挂到 <html data-theme="...">，由 CSS 层完成换肤
 */
import { DEFAULT_THEME_ID, isThemeId, normalizeTheme } from './catalog.js';

/** 顶栏眉题（文具刊头 / 试剂瓶签等） */
const THEME_EYEBROW = {
  default: '',
  stationery: '兴趣小组 · 第 1 期',
  reagent: 'REAGENT · SHELF',
  blackboard: 'CHALK · BOARD',
  pixel: 'PIXEL · LAB',
};

/**
 * @param {{ id?: string } | string | null | undefined} theme
 * @returns {string} 实际应用的 theme id
 */
export function applyTheme(theme) {
  let id = DEFAULT_THEME_ID;
  if (typeof theme === 'string') {
    id = isThemeId(theme) ? theme : DEFAULT_THEME_ID;
  } else {
    id = normalizeTheme(theme).id;
  }
  document.documentElement.setAttribute('data-theme', id);
  const eye = document.querySelector('.brand-eyebrow');
  if (eye) {
    eye.textContent = THEME_EYEBROW[id] || '';
  }
  // 通知 3D 场景同步 --stage-3d-bg（分子 / 电子排布画布）
  try {
    window.dispatchEvent(new CustomEvent('chem-theme-change', { detail: { id } }));
  } catch {
    /* ignore */
  }
  return id;
}

export function getActiveThemeId() {
  const id = document.documentElement.getAttribute('data-theme');
  return isThemeId(id) ? id : DEFAULT_THEME_ID;
}
