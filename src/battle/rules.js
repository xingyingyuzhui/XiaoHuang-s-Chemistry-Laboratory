/**
 * 元素乱斗 · 纯规则层（无 DOM / 无音效）
 * 可单测：出牌合法性、开局顶牌、洗牌、补牌防死锁
 */

import {
  compareStrength,
  strengthOf,
  DIMENSIONS,
  shuffle,
} from '../data/battle-cards.js';
import { OPENING_TOP_MAX_Z, MAX_FLIP } from './constants.js';

/** @typedef {import('./constants.js').BattleCard} BattleCard */
/** @typedef {import('./constants.js').BattleDimension} BattleDimension */
/** @typedef {import('./state.js').ModeBState} ModeBState */

/**
 * @param {BattleDimension} d
 */
export function dimLabel(d) {
  return DIMENSIONS[d]?.label || d;
}

/**
 * @param {number} v
 * @param {BattleDimension} dim
 */
export function formatVal(v, dim) {
  if (dim === 'en') return v === 0 ? '—' : v.toFixed(2);
  return String(v);
}

/**
 * @param {BattleCard} card
 * @param {BattleCard | null | undefined} top
 * @param {BattleDimension} dim
 */
export function canPlayElement(card, top, dim) {
  if (card.kind !== 'element' || !card.element) return false;
  if (!top?.element) return true;
  return compareStrength(card.element, top.element, dim) > 0;
}

/**
 * @param {import('../data/battle-cards.js').BattleElementDef} el
 * @param {BattleDimension} dim
 * @param {import('../data/battle-cards.js').BattleElementDef | null | undefined} topEl
 */
export function deltaHint(el, dim, topEl) {
  if (!topEl) return { ok: true, text: '可开叠' };
  const d = compareStrength(el, topEl, dim);
  if (d > 0) {
    const v = dim === 'en' ? d.toFixed(2) : String(Math.round(d * 100) / 100);
    return { ok: true, text: `+${v}` };
  }
  if (d === 0) return { ok: false, text: '=' };
  return { ok: false, text: dim === 'en' ? d.toFixed(2) : String(Math.round(d)) };
}

/**
 * 开局顶牌：优先 Z≤OPENING_TOP_MAX_Z
 * @param {BattleCard[]} deck 会被 pop / 洗回
 * @returns {BattleCard | null}
 */
export function drawOpeningTop(deck) {
  const aside = [];
  /** @type {BattleCard | null} */
  let top = null;
  /** @type {BattleCard | null} */
  let bestHigh = null;
  while (deck.length) {
    const c = deck.pop();
    if (!c) break;
    if (c.kind !== 'element' || !c.element) {
      aside.push(c);
      continue;
    }
    if (c.element.z <= OPENING_TOP_MAX_Z) {
      top = c;
      break;
    }
    if (!bestHigh || (bestHigh.element && c.element.z < bestHigh.element.z)) {
      if (bestHigh) aside.push(bestHigh);
      bestHigh = c;
    } else {
      aside.push(c);
    }
  }
  if (!top) top = bestHigh;
  while (aside.length) deck.push(aside.pop());
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return top;
}

/**
 * @param {ModeBState} s
 */
export function reshapeDeck(s) {
  if (s.discard.length < 1) return;
  s.deck = shuffle(s.deck.concat(s.discard));
  s.discard = [];
}

/**
 * 开叠前保证手牌至少一张元素
 * @param {ModeBState} s
 */
export function ensureElementForOpen(s) {
  if (s.playerHand.some((c) => c.kind === 'element')) return true;
  for (let i = 0; i < 12; i++) {
    if (!s.deck.length) reshapeDeck(s);
    if (!s.deck.length) break;
    const c = s.deck.pop();
    if (!c) break;
    s.playerHand.push(c);
    if (c.kind === 'element') return true;
  }
  return s.playerHand.some((c) => c.kind === 'element');
}

/**
 * @param {ModeBState} s
 * @param {string} msg
 * @param {(m: string) => void} pushLog
 */
export function clearStack(s, msg, pushLog) {
  if (s.top) s.discard.push(s.top);
  s.top = null;
  pushLog(msg);
}

/**
 * @param {ModeBState} s
 * @param {BattleDimension} dim
 */
export function countPlayableInDim(s, dim) {
  return s.playerHand.filter(
    (c) => c.kind === 'element' && canPlayElement(c, s.top, dim),
  ).length;
}

/**
 * AI 选最小可压过的牌
 * @param {BattleCard[]} hand
 * @param {BattleCard | null} top
 * @param {BattleDimension} dim
 * @returns {{ c: BattleCard, i: number } | null}
 */
export function pickWeakestPlayable(hand, top, dim) {
  const playable = hand
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => c.kind === 'element' && canPlayElement(c, top, dim));
  if (!playable.length) return null;
  playable.sort(
    (a, b) =>
      strengthOf(/** @type {any} */ (a.c.element), dim) -
      strengthOf(/** @type {any} */ (b.c.element), dim),
  );
  return playable[0];
}

/**
 * AI 尝试找可 FLIP 到的维度
 * @param {ModeBState} s
 * @returns {BattleDimension | null}
 */
export function findAiFlipDim(s) {
  if (s.aiFlipsUsed >= MAX_FLIP) return null;
  if (!s.aiHand.some((c) => c.kind === 'flip')) return null;
  for (const dim of /** @type {BattleDimension[]} */ (['en', 'radius', 'z'])) {
    if (dim === s.dimension) continue;
    if (s.aiHand.some((c) => c.kind === 'element' && canPlayElement(c, s.top, dim))) {
      return dim;
    }
  }
  return null;
}

/**
 * @param {number} i
 * @param {number} n
 */
export function handArcPx(i, n) {
  const mid = (Math.max(n, 1) - 1) / 2;
  return Math.max(2, 10 - Math.abs(i - mid) * 2.2);
}

export { strengthOf, DIMENSIONS, compareStrength, shuffle, buildDeck } from '../data/battle-cards.js';
