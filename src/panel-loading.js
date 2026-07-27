/**
 * Tab 按需加载占位层（与 .panel-loading CSS 配套）
 * - show：插入/显示 data-panel-loading
 * - hide：设 hidden=true（CSS 必须用 .panel-loading[hidden]{display:none!important}）
 * - error：失败文案，仍显示占位
 */

const ATTR = 'data-panel-loading';
const CLASS = 'panel-loading';

function ensurePlaceholder(panel) {
  if (!panel) return null;
  let el = panel.querySelector(`[${ATTR}]`);
  if (el) return el;
  const doc = panel.ownerDocument || (typeof document !== 'undefined' ? document : null);
  if (!doc?.createElement) return null;
  el = doc.createElement('div');
  el.setAttribute(ATTR, '');
  el.className = CLASS;
  panel.prepend(el);
  return el;
}

/**
 * @param {ParentNode | null | undefined} panel
 * @param {string} [text]
 * @returns {Element | null}
 */
export function showPanelLoading(panel, text = '加载中…') {
  const el = ensurePlaceholder(panel);
  if (!el) return null;
  el.textContent = text;
  el.hidden = false;
  return el;
}

/**
 * @param {ParentNode | null | undefined} panel
 */
export function hidePanelLoading(panel) {
  if (!panel) return;
  const el = panel.querySelector(`[${ATTR}]`);
  if (!el) return;
  el.hidden = true;
  // 非错误态时复位文案，避免下次显示时闪旧错误
  if (!String(el.textContent || '').startsWith('加载失败')) {
    el.textContent = '加载中…';
  }
}

/**
 * @param {ParentNode | null | undefined} panel
 * @param {string} message
 * @returns {Element | null}
 */
export function showPanelError(panel, message) {
  const el = ensurePlaceholder(panel);
  if (!el) return null;
  el.textContent = `加载失败：${message || '未知错误'}`;
  el.hidden = false;
  return el;
}

export const PANEL_LOADING_ATTR = ATTR;
export const PANEL_LOADING_CLASS = CLASS;
