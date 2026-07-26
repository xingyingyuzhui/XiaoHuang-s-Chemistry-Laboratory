/**
 * 元素乱斗 · 运行时状态（单例）
 * UI / 对局数据与定时器集中在此，避免散落全局
 */

/** @typedef {import('./constants.js').BattleScreen} BattleScreen */
/** @typedef {import('./constants.js').BattleCard} BattleCard */
/** @typedef {import('./constants.js').BattleDimension} BattleDimension */

/**
 * @typedef {{
 *   deck: BattleCard[],
 *   discard: BattleCard[],
 *   playerHand: BattleCard[],
 *   aiHand: BattleCard[],
 *   top: BattleCard | null,
 *   dimension: BattleDimension,
 *   turn: 'player' | 'ai',
 *   playerFlipsUsed: number,
 *   aiFlipsUsed: number,
 *   passStreak: number,
 *   status: 'playing' | 'playerWin' | 'aiWin',
 *   log: string[],
 *   stats: { plays: number, flips: number, maxHit: string },
 *   busy: boolean,
 *   toast: string,
 *   flipPickerOpen: boolean,
 *   helpOpen: boolean,
 *   _mustOpen: boolean,
 * }} ModeBState
 */

/** @type {{ screen: BattleScreen, modeB: ModeBState | null }} */
export const ui = {
  screen: 'hub',
  modeB: null,
};

/**
 * 异步动画/定时器恢复后，确认它仍属于当前这局对战。
 * @param {ModeBState | null | undefined} state
 */
export function isCurrentModeB(state) {
  return ui.modeB === state;
}

/** @type {HTMLElement | null} */
export let rootEl = null;

/** @type {boolean} */
export let bound = false;

/** @type {ReturnType<typeof setTimeout> | null} */
export let toastTimer = null;

/** @type {ReturnType<typeof setTimeout> | null} */
export let aiTimer = null;

/** @param {HTMLElement | null} el */
export function setRootEl(el) {
  rootEl = el;
}

/** @param {boolean} v */
export function setBound(v) {
  bound = v;
}

export function clearAiTimer() {
  if (aiTimer) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
}

/** @param {ReturnType<typeof setTimeout> | null} t */
export function setAiTimer(t) {
  aiTimer = t;
}

export function clearToastTimer() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
}

/** @param {ReturnType<typeof setTimeout> | null} t */
export function setToastTimer(t) {
  toastTimer = t;
}
