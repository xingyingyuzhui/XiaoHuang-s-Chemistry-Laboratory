/**
 * 元素乱斗 · 对局动作 / AI（有副作用：改 state + fx/sfx + 触发 UI 刷新）
 */

import { HAND_SIZE, MAX_FLIP, AI_THINK_MS } from './constants.js';
import {
  ui,
  rootEl,
  clearAiTimer,
  setAiTimer,
  isCurrentModeB,
} from './state.js';
import {
  buildDeck,
  shuffle,
  strengthOf,
  DIMENSIONS,
  canPlayElement,
  dimLabel,
  formatVal,
  drawOpeningTop,
  reshapeDeck,
  ensureElementForOpen,
  clearStack,
  pickWeakestPlayable,
  findAiFlipDim,
} from './rules.js';
import { isBeginnerHints } from './hint-settings.js';
import { pushLog, showToast } from './feedback.js';
import {
  fxDealHand,
  fxSlamTop,
  fxFlipDim,
  fxShake,
  fxNudgePlayable,
  fxFlyToSlot,
  fxWinConfetti,
  fxTurnBanner,
  fxFloatText,
  fxSpawnAmbient,
  fxResetAmbient,
  fxHighlightPlayable,
} from './fx.js';
import {
  sfxUnlock,
  sfxDeal,
  sfxFly,
  sfxSlam,
  sfxFlip,
  sfxPass,
  sfxDeny,
  sfxTurn,
  sfxOpenStack,
  sfxClear,
  sfxWin,
  sfxLose,
  sfxUiTap,
  bgmStart,
} from './sfx.js';
import { patchModeB, render } from './ui.js';

/**
 * @param {{ bgmAlreadyRequested?: boolean }} [opts]
 */
export function startModeB({ bgmAlreadyRequested = false } = {}) {
  clearAiTimer();
  const deck = shuffle(buildDeck());
  const playerHand = [];
  const aiHand = [];
  for (let i = 0; i < HAND_SIZE; i++) {
    playerHand.push(deck.pop());
    aiHand.push(deck.pop());
  }
  let top = drawOpeningTop(deck);
  if (!top) {
    const idx = playerHand.findIndex((c) => c.kind === 'element');
    if (idx >= 0) top = playerHand.splice(idx, 1)[0];
  }

  ui.modeB = {
    deck,
    discard: [],
    playerHand,
    aiHand,
    top,
    dimension: /** @type {BattleDimension} */ ('z'),
    turn: 'player',
    playerFlipsUsed: 0,
    aiFlipsUsed: 0,
    passStreak: 0,
    status: 'playing',
    log: ['[系统] 对局开始 · 默认比序数 · 先出完获胜'],
    stats: { plays: 0, flips: 0, maxHit: '' },
    busy: false,
    toast: '',
    flipPickerOpen: false,
    helpOpen: false,
    _mustOpen: false,
  };
  ui.screen = 'modeB';
  fxResetAmbient();
  if (!bgmAlreadyRequested) {
    // 尽量同步 kick play；sfxUnlock 放在 bgmStart 内部 play 之后
    bgmStart({ force: true }).catch(() => {});
  }
  render({ force: true });
  showToast('轮到你了 — 打出比顶牌更强的元素', 2400);
  requestAnimationFrame(() => {
    fxSpawnAmbient(rootEl, { force: true });
    sfxDeal();
    fxDealHand(rootEl).then(() => {
      sfxTurn();
      fxTurnBanner(rootEl, '你的回合');
      if (isBeginnerHints()) fxHighlightPlayable(rootEl);
    });
  });
}

export function checkWin(s = ui.modeB) {
  if (!s || !isCurrentModeB(s) || s.status !== 'playing') return;
  if (s.playerHand.length === 0) {
    s.status = 'playerWin';
    pushLog('你出完了手牌，获胜！');
    showToast('胜利！', 3000);
    sfxWin();
    fxWinConfetti();
  } else if (s.aiHand.length === 0) {
    s.status = 'aiWin';
    pushLog('对手出完了手牌。');
    showToast('惜败 — 试试更早 FLIP', 3000);
    sfxLose();
  }
}

export async function playerPlayElement(handIndex) {
  const s = ui.modeB;
  if (!s || s.busy || s.status !== 'playing' || s.turn !== 'player') return;
  const card = s.playerHand[handIndex];
  if (!card || card.kind !== 'element') return;
  if (!canPlayElement(card, s.top, s.dimension)) {
    pushLog(`打不出：当前比「${dimLabel(s.dimension)}」。`);
    showToast('压不过顶牌', 1500);
    sfxDeny();
    const btn = rootEl?.querySelector(`[data-hand="${handIndex}"]`);
    fxShake(btn);
    fxFloatText(rootEl, '无效!', 'bad');
    return;
  }

  const fromEl = rootEl?.querySelector(`[data-hand="${handIndex}"]`);
  const slot = rootEl?.querySelector('.battle-top-slot');
  s.busy = true;
  /** scheduleAi 接管 busy 后，finally 不得再清掉 */
  let handoffToAi = false;
  // 飞牌期间隐藏原位，避免整页重绘时牌突然消失又抖
  if (fromEl instanceof HTMLElement) {
    fromEl.style.opacity = '0';
    fromEl.style.pointerEvents = 'none';
  }
  try {
    sfxFly();
    if (fromEl && slot) await fxFlyToSlot(fromEl, slot);
    if (!isCurrentModeB(s)) return;

    s.playerHand.splice(handIndex, 1);
    if (s.top) s.discard.push(s.top);
    s.top = card;
    s.passStreak = 0;
    s.flipPickerOpen = false;
    const v = strengthOf(card.element, s.dimension);
    const power = `${card.element.symbol} · ${DIMENSIONS[s.dimension].short} ${formatVal(v, s.dimension)}`;
    pushLog(`[你] ${power}`);
    if (s.stats) {
      s.stats.plays += 1;
      s.stats.maxHit = power;
    }
    checkWin(s);
    if (s.status === 'playing') {
      s.turn = 'ai';
      patchModeB();
      const top = rootEl?.querySelector('.battle-top-slot .bc');
      sfxSlam();
      await fxSlamTop(top, rootEl);
      await fxFloatText(rootEl, power, 'good');
      await fxTurnBanner(rootEl, '对手回合');
      if (!isCurrentModeB(s)) return;
      handoffToAi = true;
      scheduleAi(s);
    } else {
      patchModeB();
      sfxSlam();
      await fxSlamTop(rootEl?.querySelector('.battle-top-slot .bc'), rootEl);
    }
  } finally {
    if (isCurrentModeB(s) && !handoffToAi) s.busy = false;
  }
}

/** 打开 FLIP 维度选择；失败时给出明确 toast */
export function openFlipPicker() {
  const s = ui.modeB;
  if (!s) return;
  if (s.busy) {
    showToast('请稍候…', 1200);
    return;
  }
  if (s.status !== 'playing') return;
  if (s.turn !== 'player') {
    showToast('还没到你的回合', 1400);
    return;
  }
  // mustOpen 时仍允许 FLIP 改维度，方便凑出可开叠节奏
  if (s.playerFlipsUsed >= MAX_FLIP) {
    showToast(`FLIP 已用完（限 ${MAX_FLIP} 次）`, 1600);
    return;
  }
  if (!s.playerHand.some((c) => c.kind === 'flip')) {
    showToast('手中没有 FLIP 牌', 1400);
    return;
  }
  sfxUiTap();
  s.flipPickerOpen = true;
  patchModeB();
}

/**
 * 开叠前保证手牌有至少一张元素（避免仅 FLIP 死锁）
 * @param {any} s
 */
export function playerFlip(next) {
  const s = ui.modeB;
  if (!s || s.busy || s.status !== 'playing' || s.turn !== 'player') {
    showToast('现在不能 FLIP', 1400);
    return;
  }
  if (s.playerFlipsUsed >= MAX_FLIP) {
    showToast(`FLIP 已用完（限 ${MAX_FLIP} 次）`, 1600);
    return;
  }
  const flipIdx = s.playerHand.findIndex((c) => c.kind === 'flip');
  if (flipIdx < 0) {
    showToast('没有 FLIP 牌', 1400);
    s.flipPickerOpen = false;
    patchModeB();
    return;
  }
  if (!['z', 'en', 'radius'].includes(next)) return;

  s.playerHand.splice(flipIdx, 1);
  s.playerFlipsUsed += 1;
  s.dimension = next;
  s.flipPickerOpen = false;
  pushLog(`[你] FLIP → ${dimLabel(next)}`);
  if (s.stats) s.stats.flips += 1;
  showToast(`现在比：${dimLabel(next)}`, 1600);
  patchModeB();
  sfxFlip();
  fxFlipDim(rootEl, DIMENSIONS[next].short);
  fxFloatText(rootEl, `FLIP → ${DIMENSIONS[next].short}`, 'info');
  if (isBeginnerHints()) fxHighlightPlayable(rootEl);
}

export function playerDrawAndPass() {
  const s = ui.modeB;
  if (!s || s.busy || s.status !== 'playing' || s.turn !== 'player') return;

  const playable = s.playerHand.some(
    (c) => c.kind === 'element' && canPlayElement(c, s.top, s.dimension),
  );
  if (playable) {
    showToast('还有可出牌，请先出或 FLIP', 1600);
    sfxDeny();
    fxNudgePlayable(rootEl);
    return;
  }

  if (s.deck.length) {
    s.playerHand.push(s.deck.pop());
    pushLog('[你] 抽 1 张');
    sfxDeal();
  } else {
    reshapeDeck(s);
    if (s.deck.length) {
      s.playerHand.push(s.deck.pop());
      pushLog('[你] 重洗后抽 1 张');
      sfxDeal();
    } else pushLog('[你] 无牌可抽');
  }

  const canNow = s.playerHand.some(
    (c) => c.kind === 'element' && canPlayElement(c, s.top, s.dimension),
  );
  if (!canNow) {
    s.passStreak += 1;
    pushLog('[你] 过牌');
    showToast('过牌', 900);
    sfxPass();
    if (s.passStreak >= 2) {
      clearStack(s, '[系统] 清叠 — 请你开新叠', pushLog);
      s.passStreak = 0;
      s.turn = 'player';
      s._mustOpen = true;
      ensureElementForOpen(s);
      showToast('出任意元素开新叠', 2000);
      sfxClear();
      patchModeB();
      return;
    }
    s.turn = 'ai';
    patchModeB();
    scheduleAi();
    return;
  }
  showToast('可以出牌了', 1400);
  patchModeB();
}

export async function playerOpenStack(handIndex) {
  const s = ui.modeB;
  if (!s || !s._mustOpen || s.turn !== 'player' || s.busy) return;
  if (!ensureElementForOpen(s)) {
    showToast('没有可开叠的元素牌', 1600);
    s._mustOpen = false;
    patchModeB();
    return;
  }
  const card = s.playerHand[handIndex];
  if (!card || card.kind !== 'element') {
    showToast('请用元素牌开叠', 1400);
    patchModeB();
    return;
  }
  const fromEl = rootEl?.querySelector(`[data-hand="${handIndex}"]`);
  const slot = rootEl?.querySelector('.battle-top-slot');
  s.busy = true;
  let handoffToAi = false;
  if (fromEl instanceof HTMLElement) {
    fromEl.style.opacity = '0';
    fromEl.style.pointerEvents = 'none';
  }
  try {
    sfxOpenStack();
    sfxFly();
    if (fromEl && slot) await fxFlyToSlot(fromEl, slot);
    if (!isCurrentModeB(s)) return;
    const idx = s.playerHand.indexOf(card);
    if (idx >= 0) s.playerHand.splice(idx, 1);
    else s.playerHand.splice(handIndex, 1);
    s.top = card;
    s._mustOpen = false;
    s.passStreak = 0;
    pushLog(`[你] 开叠 ${card.element.symbol}`);
    if (s.stats) s.stats.plays += 1;
    checkWin(s);
    if (s.status === 'playing') {
      s.turn = 'ai';
      patchModeB();
      sfxSlam();
      await fxSlamTop(rootEl?.querySelector('.battle-top-slot .bc'), rootEl);
      if (!isCurrentModeB(s)) return;
      handoffToAi = true;
      scheduleAi(s);
    } else {
      patchModeB();
      sfxSlam();
      await fxSlamTop(rootEl?.querySelector('.battle-top-slot .bc'), rootEl);
    }
  } finally {
    if (isCurrentModeB(s) && !handoffToAi) s.busy = false;
  }
}

export function scheduleAi(s = ui.modeB) {
  if (!s || !isCurrentModeB(s)) return;
  s.busy = true;
  patchModeB();
  clearAiTimer();
  setAiTimer(setTimeout(() => {
    if (!isCurrentModeB(s)) return;
    try {
      runAiTurn(s);
    } catch (err) {
      console.error(err);
      if (isCurrentModeB(s)) {
        s.busy = false;
        s.turn = 'player';
        patchModeB();
      }
    }
  }, AI_THINK_MS));
}

export function runAiTurn(s = ui.modeB) {
  if (!s || !isCurrentModeB(s)) return;
  if (s.status !== 'playing') {
    s.busy = false;
    patchModeB();
    return;
  }
  s.turn = 'ai';
  if (s._mustOpen) {
    s.busy = false;
    s.turn = 'player';
    patchModeB();
    return;
  }

  let playable = pickWeakestPlayable(s.aiHand, s.top, s.dimension);

  let didFlip = false;
  const flipDimension = playable ? null : findAiFlipDim(s);
  if (flipDimension) {
    s.aiHand.splice(s.aiHand.findIndex((c) => c.kind === 'flip'), 1);
    s.aiFlipsUsed += 1;
    s.dimension = flipDimension;
    didFlip = true;
    pushLog(`[敌] FLIP → ${DIMENSIONS[flipDimension].short}`);
    playable = pickWeakestPlayable(s.aiHand, s.top, s.dimension);
  }

  const finishAiToPlayer = (played) => {
    if (!isCurrentModeB(s)) return;
    s.busy = false;
    if (s.status === 'playing') {
      s.turn = 'player';
      showToast(s._mustOpen ? '请你开新叠' : '轮到你了', 1200);
    }
    patchModeB();
    if (didFlip) {
      sfxFlip();
      fxFlipDim(rootEl, DIMENSIONS[s.dimension].short);
    }
    if (played) {
      sfxSlam();
      fxSlamTop(rootEl?.querySelector('.battle-top-slot .bc'), rootEl);
    }
    if (s.status === 'playing') {
      if (!played && !didFlip) sfxPass();
      sfxTurn();
      fxTurnBanner(rootEl, s._mustOpen ? '开新叠' : '你的回合');
      if (isBeginnerHints()) fxHighlightPlayable(rootEl);
    }
  };

  if (playable) {
    const { c, i } = playable;
    s.aiHand.splice(i, 1);
    if (s.top) s.discard.push(s.top);
    s.top = c;
    s.passStreak = 0;
    const v = strengthOf(c.element, s.dimension);
    pushLog(
      `[敌] ${c.element.symbol} · ${DIMENSIONS[s.dimension].short} ${formatVal(v, s.dimension)}`,
    );
    checkWin(s);
    finishAiToPlayer(true);
    return;
  }

  if (s.deck.length) s.aiHand.push(s.deck.pop());
  else {
    reshapeDeck(s);
    if (s.deck.length) s.aiHand.push(s.deck.pop());
  }

  playable = pickWeakestPlayable(s.aiHand, s.top, s.dimension);

  if (playable) {
    const { c, i } = playable;
    s.aiHand.splice(i, 1);
    if (s.top) s.discard.push(s.top);
    s.top = c;
    s.passStreak = 0;
    const v = strengthOf(c.element, s.dimension);
    pushLog(
      `[敌] 抽后 ${c.element.symbol} · ${DIMENSIONS[s.dimension].short} ${formatVal(v, s.dimension)}`,
    );
    checkWin(s);
    finishAiToPlayer(true);
    return;
  }

  s.passStreak += 1;
  pushLog('[敌] 过牌');
  if (s.passStreak >= 2) {
    clearStack(s, '[系统] 清叠 — 由你开新叠', pushLog);
    s.passStreak = 0;
    s._mustOpen = true;
    ensureElementForOpen(s);
    sfxClear();
  }
  finishAiToPlayer(false);
}
