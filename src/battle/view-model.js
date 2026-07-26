/**
 * 元素乱斗 · 视图模型（从 state 派生 UI 标志，单一真相源）
 */

import { DIMENSIONS } from '../data/battle-cards.js';
import { MAX_FLIP } from './constants.js';
import { ui } from './state.js';
import { canPlayElement } from './rules.js';
import { isBeginnerHints } from './hint-settings.js';

/**
 * @returns {null | {
 *   s: import('./state.js').ModeBState,
 *   dim: typeof DIMENSIONS[keyof typeof DIMENSIONS],
 *   topEl: import('../data/battle-cards.js').BattleElementDef | undefined,
 *   flipLeft: number,
 *   yourTurn: boolean,
 *   mustOpen: boolean,
 *   hasFlip: boolean,
 *   canFlip: boolean,
 *   hasPlayable: boolean,
 *   needFlip: boolean,
 *   showHints: boolean,
 *   status: string,
 *   aiPct: number,
 *   youPct: number,
 *   n: number,
 * }}
 */
export function getModeBView() {
  const s = ui.modeB;
  if (!s) return null;
  const dim = DIMENSIONS[s.dimension];
  const topEl = s.top?.element;
  const flipLeft = MAX_FLIP - s.playerFlipsUsed;
  const yourTurn = s.turn === 'player' && !s.busy && s.status === 'playing';
  const mustOpen = !!s._mustOpen;
  const hasFlip = s.playerHand.some((c) => c.kind === 'flip');
  const canFlip = hasFlip && yourTurn && flipLeft > 0;
  const hasPlayable = s.playerHand.some(
    (c) => c.kind === 'element' && canPlayElement(c, s.top, s.dimension),
  );
  const needFlip = yourTurn && !mustOpen && !hasPlayable && canFlip;
  const showHints = isBeginnerHints();
  const status =
    s.status === 'playerWin'
      ? '胜利'
      : s.status === 'aiWin'
        ? '本局结束'
        : s.busy
          ? '对手思考中…'
          : mustOpen
            ? '开新叠：点任意元素'
            : yourTurn
              ? '你的回合'
              : '请稍候';

  return {
    s,
    dim,
    topEl,
    flipLeft,
    yourTurn,
    mustOpen,
    hasFlip,
    canFlip,
    hasPlayable,
    needFlip,
    showHints,
    status,
    aiPct: Math.min(100, (s.aiHand.length / 12) * 100),
    youPct: Math.min(100, (s.playerHand.length / 12) * 100),
    n: Math.max(s.playerHand.length, 1),
  };
}
