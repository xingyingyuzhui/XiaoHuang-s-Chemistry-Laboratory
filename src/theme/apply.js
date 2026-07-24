/**
 * 把主题 id 挂到 <html data-theme="...">，由 CSS 层完成换肤
 */
import { DEFAULT_THEME_ID, isThemeId, normalizeTheme } from './catalog.js';

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
  return id;
}

export function getActiveThemeId() {
  const id = document.documentElement.getAttribute('data-theme');
  return isThemeId(id) ? id : DEFAULT_THEME_ID;
}
