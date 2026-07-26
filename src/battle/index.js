/**
 * 元素乱斗 · 模块入口
 *
 * 分层：
 * - data/battle-cards.js  牌数据
 * - battle/constants      常量
 * - battle/rules          纯规则（可测）
 * - battle/state          运行时状态
 * - battle/actions        对局动作 / AI
 * - battle/html           模板
 * - battle/ui             渲染 / 补丁 / 绑定
 * - battle/fx | sfx       视听
 */

import { setRootEl, setBound, bound, rootEl } from './state.js';
import { render, setBattleActionHandlers } from './ui.js';
import {
  startModeB,
  playerPlayElement,
  playerOpenStack,
  playerFlip,
  playerDrawAndPass,
  openFlipPicker,
} from './actions.js';

setBattleActionHandlers({
  startModeB,
  playerPlayElement,
  playerOpenStack,
  playerFlip,
  playerDrawAndPass,
  openFlipPicker,
});

/**
 * 初始化元素乱斗 Tab（幂等）
 */
export function initElementBattle() {
  const el = document.getElementById('panel-battle');
  if (!el || bound) return;
  setRootEl(el);
  setBound(true);
  render({ force: true });
}

export { setScreen } from './ui.js';
export { getHintMode, isBeginnerHints } from './hint-settings.js';
