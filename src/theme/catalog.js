/**
 * 主题注册表（前端）
 * 新增主题：① 在此登记 id/名称 ② 添加 styles/themes/<id>/tokens.css + skin.css
 * ③ index.css 引入 ④ 可选 fonts
 */

/** @typedef {{ id: string, name: string, description: string }} ThemeMeta */

/** @type {ThemeMeta[]} */
export const THEME_CATALOG = [
  {
    id: 'default',
    name: '默认',
    description: '教材浅色 · 清爽蓝',
  },
  {
    id: 'stationery',
    name: '文具',
    description: '校刊纸张 · 红泥章',
  },
  {
    id: 'reagent',
    name: '试剂架',
    description: '冷钢柜 · 钴蓝签',
  },
];

export const THEME_IDS = new Set(THEME_CATALOG.map((t) => t.id));

/** 未选择 / 无法识别时的回落 */
export const DEFAULT_THEME_ID = 'default';

/**
 * 规范化主题（兼容旧版 { accent, bg, card, text }）
 * @param {unknown} raw
 * @returns {{ id: string }}
 */
export function normalizeTheme(raw) {
  if (!raw || typeof raw !== 'object') {
    return { id: DEFAULT_THEME_ID };
  }
  const obj = /** @type {Record<string, unknown>} */ (raw);
  if (typeof obj.id === 'string' && THEME_IDS.has(obj.id)) {
    return { id: obj.id };
  }
  // 旧配色对象 → 默认主题（不再保留自定义色）
  return { id: DEFAULT_THEME_ID };
}

/**
 * @param {string} id
 */
export function isThemeId(id) {
  return typeof id === 'string' && THEME_IDS.has(id);
}
