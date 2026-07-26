/**
 * 元素乱斗 · 新手/普通提示模式（localStorage）
 */

import { HINT_MODE_KEY } from './constants.js';

/** @typedef {import('./constants.js').HintMode} HintMode */

/** @type {HintMode} */
let hintMode = loadHintMode();

/** @returns {HintMode} */
export function loadHintMode() {
  try {
    const v = localStorage.getItem(HINT_MODE_KEY);
    if (v === 'beginner' || v === 'normal') return v;
  } catch {
    /* ignore */
  }
  return 'normal';
}

/** @returns {HintMode} */
export function getHintMode() {
  return hintMode;
}

/** @param {HintMode} mode */
export function setHintModeValue(mode) {
  hintMode = mode;
  try {
    localStorage.setItem(HINT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function isBeginnerHints() {
  return hintMode === 'beginner';
}
