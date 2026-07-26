/**
 * 元素乱斗 · 常量与标签
 */

/** @typedef {'z' | 'en' | 'radius'} BattleDimension */
/** @typedef {'beginner' | 'normal'} HintMode */
/** @typedef {'hub' | 'modeB' | 'modeASoon'} BattleScreen */
/**
 * @typedef {{ uid: string, kind: 'element' | 'flip', element?: import('../data/battle-cards.js').BattleElementDef }} BattleCard
 */

export const HAND_SIZE = 7;
export const MAX_FLIP = 2;
/** 开局顶牌 Z 上限，降低「起手全废」 */
export const OPENING_TOP_MAX_Z = 26;
export const LOG_CAP = 12;
export const AI_THINK_MS = 640;

export const BLOCK_LABEL = {
  s: 's',
  p: 'p',
  d: 'd',
  ds: 'ds',
  f: 'f',
  noble: '惰',
};

export const HINT_MODE_KEY = 'battle-hint-mode';

/** @type {BattleDimension[]} */
export const ALL_DIMS = ['z', 'en', 'radius'];
