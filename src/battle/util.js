/**
 * 元素乱斗 · 通用工具
 */

/**
 * @param {string} sel
 * @param {ParentNode} [root]
 */
export const $ = (sel, root = document) => root.querySelector(sel);

/**
 * @param {unknown} str
 */
export function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
