/**
 * 元素乱斗 · 战报 / Toast（轻量 DOM，不整页重绘）
 */

import { LOG_CAP } from './constants.js';
import { ui, rootEl, clearToastTimer, setToastTimer } from './state.js';
import { escapeHtml } from './util.js';

/**
 * @param {string} msg
 */
export function pushLog(msg) {
  if (!ui.modeB) return;
  ui.modeB.log.unshift(msg);
  if (ui.modeB.log.length > LOG_CAP) ui.modeB.log.length = LOG_CAP;
  const logEl = rootEl?.querySelector('.battle-log-card .battle-log');
  if (logEl) {
    logEl.innerHTML = ui.modeB.log
      .slice(0, LOG_CAP)
      .map((l) => `<p title="${escapeHtml(l)}">${escapeHtml(l)}</p>`)
      .join('');
    logEl.scrollTop = 0;
  }
}

/**
 * @param {string} msg
 * @param {number} [ms]
 */
export function showToast(msg, ms = 2000) {
  if (!ui.modeB) return;
  ui.modeB.toast = msg;
  clearToastTimer();
  const el = rootEl?.querySelector('.battle-toast');
  if (el) {
    el.textContent = msg;
    el.classList.remove('is-show');
    void el.offsetWidth;
    el.classList.add('is-show');
  }
  setToastTimer(
    setTimeout(() => {
      if (ui.modeB) ui.modeB.toast = '';
      rootEl?.querySelector('.battle-toast')?.classList.remove('is-show');
    }, ms),
  );
}
