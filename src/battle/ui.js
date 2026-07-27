/**
 * 元素乱斗 · DOM 渲染 / 局部补丁 / 事件绑定
 */

import { DIMENSIONS } from '../data/battle-cards.js';
import { MAX_FLIP, LOG_CAP } from './constants.js';
import { ui, rootEl, clearAiTimer } from './state.js';
import { strengthOf, formatVal } from './rules.js';
import { getHintMode, setHintModeValue, isBeginnerHints } from './hint-settings.js';
import { getModeBView } from './view-model.js';
import { escapeHtml, $ } from './util.js';
import {
  renderHandHtml,
  renderCard,
  renderScatterPile,
  renderHelpMaskHtml,
  renderFlipMaskHtml,
  renderEndMaskHtml,
  renderHub,
  renderModeASoon,
  renderModeB,
} from './html.js';
import {
  fxHubIntro,
  fxSpawnAmbient,
  fxHighlightPlayable,
} from './fx.js';
import { appConfirm } from '../app-dialog.js';
import {
  sfxUnlock,
  sfxIsMuted,
  sfxSetMuted,
  sfxUiTap,
  sfxHubSelect,
  bgmStart,
  bgmStop,
} from './sfx.js';

/**
 * 由入口层注入对局动作，避免 UI <-> actions 的循环依赖。
 * @type {null | {
 *   startModeB: (opts?: { bgmAlreadyRequested?: boolean }) => void,
 *   playerPlayElement: (handIndex: number) => Promise<void>,
 *   playerOpenStack: (handIndex: number) => Promise<void>,
 *   playerFlip: (dimension: BattleDimension) => void,
 *   playerDrawAndPass: () => void,
 *   openFlipPicker: () => void,
 * }}
 */
let battleActions = null;

/**
 * @param {NonNullable<typeof battleActions>} actions
 */
export function setBattleActionHandlers(actions) {
  battleActions = actions;
}

export function setScreen(screen) {
  clearAiTimer();
  ui.screen = screen;
  if (screen === 'hub') {
    ui.modeB = null;
    bgmStop(1000);
  }
  render();
}

/**
 * @param {{ force?: boolean }} [opts]
 */
export function render(opts = {}) {
  if (!rootEl) return;
  if (ui.screen === 'hub') {
    rootEl.innerHTML = renderHub();
    bindHub();
    requestAnimationFrame(() => fxHubIntro(rootEl));
    return;
  }
  if (ui.screen === 'modeASoon') {
    rootEl.innerHTML = renderModeASoon();
    $('#btnBattleBackHub', rootEl)?.addEventListener('click', () => setScreen('hub'));
    return;
  }
  if (ui.screen === 'modeB') {
    if (!ui.modeB) return;
    const shell = rootEl.querySelector('.battle-play');
    if (shell && !opts.force) {
      patchModeB();
      return;
    }
    rootEl.innerHTML = renderModeB();
    bindModeB();
    fxSpawnAmbient(rootEl);
    if (isBeginnerHints()) fxHighlightPlayable(rootEl);
  }
}

export function setHintMode(mode) {
  setHintModeValue(mode);
  if (ui.screen === 'modeB' && ui.modeB) patchModeB();
}

export function bindHandInteractions() {
  rootEl?.querySelectorAll('.battle-hand [data-hand]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const i = Number(btn.getAttribute('data-hand'));
      const s = ui.modeB;
      if (!s || s.busy) return;
      const card = s.playerHand[i];
      if (!card) return;
      if (card.kind === 'flip') {
        battleActions?.openFlipPicker();
        // 音频解锁不能阻塞核心出牌流程：部分浏览器会延后 resume() 的完成。
        void sfxUnlock();
        return;
      }
      await sfxUnlock();
      if (s._mustOpen) void battleActions?.playerOpenStack(i);
      else void battleActions?.playerPlayElement(i);
    });
    const el = /** @type {HTMLElement} */ (btn);
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty('--tilt-x', `${(-py * 14).toFixed(2)}deg`);
      el.style.setProperty('--tilt-y', `${(px * 16).toFixed(2)}deg`);
    });
    el.addEventListener('pointerleave', () => {
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    });
  });
}

/** 局部更新对局 UI：外壳不动，只改数据区 */
export function patchModeB() {
  if (!rootEl || !ui.modeB) return;
  const shell = rootEl.querySelector('.battle-play');
  if (!shell) {
    render({ force: true });
    return;
  }
  const v = getModeBView();
  if (!v) return;
  const {
    s,
    dim,
    topEl,
    yourTurn,
    mustOpen,
    canFlip,
    needFlip,
    showHints,
    status,
    aiPct,
    youPct,
    n,
    flipLeft,
  } = v;

  shell.setAttribute('data-turn', s.turn);
  shell.setAttribute('data-dim', s.dimension);
  shell.setAttribute('data-hint', showHints ? 'beginner' : 'normal');

  const dimPill = shell.querySelector('.battle-dim-pill');
  if (dimPill) {
    dimPill.setAttribute('data-dim', s.dimension);
    dimPill.textContent = dim.short;
  }

  const scoreAi = shell.querySelector('.battle-score-pill.is-ai');
  const scoreYou = shell.querySelector('.battle-score-pill.is-you');
  if (scoreAi) scoreAi.textContent = `敌 ${s.aiHand.length}`;
  if (scoreYou) scoreYou.textContent = `我 ${s.playerHand.length}`;

  // 状态条
  const statusEl = shell.querySelector('.battle-status');
  if (statusEl) {
    statusEl.className = `battle-status ${yourTurn ? 'is-yours' : ''} ${s.busy ? 'is-thinking' : ''} ${s.status !== 'playing' ? 'is-end' : ''}`;
    statusEl.innerHTML = `<span class="battle-status-pulse"></span>${status}`;
  }

  // 对手面板
  const aiPanel = shell.querySelector('.battle-ai-panel');
  if (aiPanel) {
    aiPanel.classList.toggle('is-active-side', s.busy || s.turn === 'ai');
    const meta = aiPanel.querySelector('.battle-row-meta p');
    if (meta) meta.textContent = `FLIP ${s.aiFlipsUsed}/${MAX_FLIP} · ${s.aiHand.length} 张`;
    const hp = aiPanel.querySelector('.battle-hp i');
    if (hp instanceof HTMLElement) hp.style.setProperty('--w', `${aiPct}%`);
    const wall = aiPanel.querySelector('.battle-ai-wall');
    if (wall) {
      wall.innerHTML = s.aiHand
        .map((_, i) => `<span class="battle-card-back battle-card-back-lg" style="--i:${i}"></span>`)
        .join('');
    }
  }

  // 你面板
  const youPanel = shell.querySelector('.battle-you-panel');
  if (youPanel) {
    youPanel.classList.toggle('is-active-side', yourTurn);
    const meta = youPanel.querySelector('.battle-row-meta p');
    if (meta) meta.textContent = `FLIP 剩 ${flipLeft} · ${s.playerHand.length} 张`;
    const hp = youPanel.querySelector('.battle-hp i');
    if (hp instanceof HTMLElement) hp.style.setProperty('--w', `${youPct}%`);
  }

  const drawBtn = shell.querySelector('#btnBattleDrawPass');
  if (drawBtn instanceof HTMLButtonElement) {
    drawBtn.disabled = !(yourTurn && !mustOpen);
  }
  const flipBtn = shell.querySelector('#btnBattleFlipOpen');
  if (flipBtn instanceof HTMLButtonElement) {
    flipBtn.disabled = !canFlip;
    // 跳动：仅手里有 FLIP 且 needFlip（canFlip 已含 hasFlip）
    flipBtn.className = `btn primary battle-flip-cta ${canFlip && needFlip ? 'is-urgent' : ''} ${canFlip ? 'is-ready' : ''}`;
    const remain = flipBtn.querySelector('.battle-flip-remain');
    if (remain) remain.textContent = String(flipLeft);
  }

  // 新手：简短阶段提示；普通：整块隐藏
  const nudge = shell.querySelector('.battle-nudge-flip');
  if (nudge) {
    if (!showHints) {
      nudge.hidden = true;
      nudge.textContent = '';
    } else {
      nudge.hidden = false;
      nudge.classList.toggle('is-idle', !needFlip && !mustOpen);
      if (mustOpen) nudge.textContent = '点任意元素开新叠';
      else if (needFlip) nudge.textContent = '可试 FLIP 改维度，或抽牌/过';
      else nudge.textContent = '';
      if (!mustOpen && !needFlip) nudge.hidden = true;
    }
  }

  shell.querySelectorAll('[data-hint-mode]').forEach((btn) => {
    const mode = btn.getAttribute('data-hint-mode');
    btn.classList.toggle('is-on', mode === getHintMode());
  });
  syncSfxButton();

  // 牌库 / 弃牌
  const piles = shell.querySelectorAll('.battle-pile-lg .battle-pile-label');
  if (piles[0]) piles[0].textContent = `牌库 ${s.deck.length}`;
  const discardN = shell.querySelector('.battle-discard-n');
  if (discardN) discardN.textContent = String(s.discard.length);

  const topSlot = shell.querySelector('.battle-top-slot');
  if (topSlot) {
    let halo = topSlot.querySelector('.battle-top-halo');
    if (!halo) {
      topSlot.innerHTML = `<div class="battle-top-halo" aria-hidden="true"></div>`;
      halo = topSlot.querySelector('.battle-top-halo');
    }
    const oldCard = topSlot.querySelector('.bc');
    if (oldCard) oldCard.remove();
    if (s.top?.element) {
      topSlot.insertAdjacentHTML(
        'beforeend',
        renderCard(s.top, { large: true, dim: s.dimension }),
      );
    } else {
      topSlot.insertAdjacentHTML(
        'beforeend',
        `<div class="bc bc-empty"><span>空</span></div>`,
      );
    }
  }
  // 桌面散落弃牌
  const scatter = shell.querySelector('.battle-scatter-pile');
  if (scatter) scatter.innerHTML = renderScatterPile(s.discard);

  // 比较 chip（始终挂在 stage 内，避免挪位置导致高度闪一下）
  let compare = shell.querySelector('.battle-stage .battle-compare-chip');
  const stage = shell.querySelector('.battle-stage');
  if (topEl && stage) {
    const html = `<div class="battle-compare-chip">
      <span class="battle-compare-dot"></span>
      比 <b>${dim.short}</b> · 顶牌 <b>${formatVal(strengthOf(topEl, s.dimension), s.dimension)}${s.dimension === 'radius' ? ' pm' : ''}</b>
    </div>`;
    if (compare) compare.outerHTML = html;
    else stage.insertAdjacentHTML('beforeend', html);
  } else if (compare) {
    compare.remove();
  }

  // 维度轨道 + 右栏键
  const dimTrack = shell.querySelector('.battle-dim-track');
  if (dimTrack) {
    dimTrack.querySelectorAll('.battle-dim-seg').forEach((seg) => {
      const d = seg.getAttribute('data-dim');
      seg.classList.toggle('is-on', d === s.dimension);
    });
    const slider = dimTrack.querySelector('.battle-dim-slider');
    if (slider instanceof HTMLElement) {
      slider.style.setProperty(
        '--dim-i',
        String(s.dimension === 'z' ? 0 : s.dimension === 'en' ? 1 : 2),
      );
    }
  }
  const tipTitle = shell.querySelector('.battle-tip-fill h4, .battle-tip-card h4');
  if (tipTitle) tipTitle.textContent = `维度 · ${dim.short}`;
  shell.querySelectorAll('.battle-dim-key').forEach((key, i) => {
    const d = i === 0 ? 'z' : i === 1 ? 'en' : 'radius';
    key.classList.toggle('is-on', d === s.dimension);
  });

  // 手牌：仅在牌组/维度/回合态/提示模式变化时重绘
  const hand = shell.querySelector('.battle-hand');
  if (hand) {
    hand.style.setProperty('--n', String(n));
    const handKey = [
      s.playerHand.map((c) => c.uid || c.kind + (c.element?.symbol || '')).join(','),
      s.dimension,
      s.turn,
      s.busy ? '1' : '0',
      mustOpen ? '1' : '0',
      s.playerFlipsUsed,
      showHints ? 'b' : 'n',
    ].join('|');
    if (hand.getAttribute('data-key') !== handKey) {
      hand.setAttribute('data-key', handKey);
      hand.innerHTML = renderHandHtml(v);
      bindHandInteractions();
    }
  }
  // 底栏教学句已移除，保留占位避免高度抖
  const hint = shell.querySelector('.battle-hand-hint');
  if (hint) {
    hint.classList.add('is-hidden');
    hint.textContent = '';
  }

  // 战报（pushLog 已可能写过；这里同步一次）
  const logEl = shell.querySelector('.battle-log-card .battle-log');
  if (logEl) {
    logEl.innerHTML = s.log
      .slice(0, LOG_CAP)
      .map((l) => `<p title="${escapeHtml(l)}">${escapeHtml(l)}</p>`)
      .join('');
  }

  // 规则弹窗
  let helpMask = shell.querySelector('.battle-help-mask');
  if (s.helpOpen && !helpMask) {
    shell.insertAdjacentHTML('beforeend', renderHelpMaskHtml());
    bindHelpOverlay();
  } else if (!s.helpOpen && helpMask) {
    helpMask.remove();
  }

  // FLIP 弹层
  let flipMask = shell.querySelector('.battle-flip-mask');
  if (s.flipPickerOpen && !flipMask) {
    shell.insertAdjacentHTML(
      'beforeend',
      renderFlipMaskHtml(s),
    );
    bindFlipOverlay();
  } else if (!s.flipPickerOpen && flipMask) {
    flipMask.remove();
  }

  // 结算弹窗
  let endMask = shell.querySelector('.battle-end-mask');
  if (s.status !== 'playing' && !endMask) {
    shell.insertAdjacentHTML('beforeend', renderEndMaskHtml(s));
    $('#btnBattleAgain', rootEl)?.addEventListener('click', () => battleActions?.startModeB());
    $('#btnBattleToHub', rootEl)?.addEventListener('click', () => setScreen('hub'));
  } else if (s.status === 'playing' && endMask) {
    endMask.remove();
  }

  if (isBeginnerHints()) fxHighlightPlayable(rootEl);
}

export function bindFlipOverlay() {
  $('#btnFlipCancel', rootEl)?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ui.modeB) return;
    sfxUiTap();
    ui.modeB.flipPickerOpen = false;
    patchModeB();
  });
  $('#btnFlipMask', rootEl)?.addEventListener('click', async (e) => {
    if (e.target === e.currentTarget) {
      if (!ui.modeB) return;
      sfxUiTap();
      ui.modeB.flipPickerOpen = false;
      patchModeB();
    }
  });
  rootEl?.querySelectorAll('[data-flip]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const d = btn.getAttribute('data-flip');
      sfxUiTap();
      battleActions?.playerFlip(/** @type {BattleDimension} */ (d));
    });
  });
}

export function bindHelpOverlay() {
  $('#btnHelpClose', rootEl)?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ui.modeB) return;
    sfxUiTap();
    ui.modeB.helpOpen = false;
    patchModeB();
  });
  $('#btnHelpMask', rootEl)?.addEventListener('click', async (e) => {
    if (e.target === e.currentTarget && ui.modeB) {
      sfxUiTap();
      ui.modeB.helpOpen = false;
      patchModeB();
    }
  });
}


export function bindHub() {
  $('#btnStartModeB', rootEl)?.addEventListener('click', async () => {
    // 手势同步路径：先 kick BGM.play()，再开局；勿在 play 之前 await
    const bgmP = bgmStart({ force: true });
    sfxUnlock()
      .then(() => sfxHubSelect())
      .catch(() => {});
    battleActions?.startModeB({ bgmAlreadyRequested: true });
    bgmP.catch(() => {});
  });
  rootEl.querySelector('[data-mode="a"]')?.addEventListener('click', async (e) => {
    if (e.target.closest('button')) return;
    await sfxUnlock();
    sfxUiTap();
    setScreen('modeASoon');
  });
}

export function syncSfxButton() {
  const btn = rootEl?.querySelector('#btnBattleSfx');
  if (!(btn instanceof HTMLButtonElement)) return;
  const m = sfxIsMuted();
  btn.classList.toggle('is-muted', m);
  btn.setAttribute('aria-pressed', m ? 'true' : 'false');
  btn.title = m ? '声音已关 · 点击开启并试听' : '声音已开 · 点击静音';
  btn.textContent = m ? '静音' : '有声';
}


export function bindModeB() {
  // 绑定后等下一次用户点击再真正 resume；这里只创建 context
  sfxUnlock().catch(() => {});
  $('#btnBattleExit', rootEl)?.addEventListener('click', async () => {
    await sfxUnlock();
    sfxUiTap();
    setScreen('hub');
  });
  $('#btnBattleRestart', rootEl)?.addEventListener('click', async () => {
    const ok = await appConfirm('确定重开本局？当前进度将丢失。', {
      title: '重开对局',
      okText: '重开',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    // confirm 后手势可能失效，仍 force 尝试；失败则依赖下一手势
    bgmStart({ force: true }).catch(() => {});
    battleActions?.startModeB({ bgmAlreadyRequested: true });
  });
  $('#btnBattleAgain', rootEl)?.addEventListener('click', async () => {
    bgmStart({ force: true }).catch(() => {});
    battleActions?.startModeB({ bgmAlreadyRequested: true });
  });
  $('#btnBattleToHub', rootEl)?.addEventListener('click', async () => {
    await sfxUnlock();
    sfxUiTap();
    setScreen('hub');
  });
  $('#btnBattleDrawPass', rootEl)?.addEventListener('click', async () => {
    await sfxUnlock();
    battleActions?.playerDrawAndPass();
  });
  $('#btnBattleHelp', rootEl)?.addEventListener('click', async () => {
    if (!ui.modeB) return;
    await sfxUnlock();
    sfxUiTap();
    ui.modeB.helpOpen = !ui.modeB.helpOpen;
    // 打开规则时关掉 FLIP 弹层，避免叠两层
    if (ui.modeB.helpOpen) ui.modeB.flipPickerOpen = false;
    patchModeB();
  });
  $('#btnBattleSfx', rootEl)?.addEventListener('click', async () => {
    // 手势内 resume；静音→开启并试听 + BGM；有声→静音
    const ok = await sfxUnlock();
    if (sfxIsMuted()) {
      sfxSetMuted(false);
      if (ok) sfxUiTap();
      bgmStart({ force: true }).catch(() => {});
    } else {
      sfxSetMuted(true);
    }
    syncSfxButton();
  });
  rootEl?.querySelectorAll('[data-hint-mode]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.getAttribute('data-hint-mode');
      if (mode === 'beginner' || mode === 'normal') {
        await sfxUnlock();
        sfxUiTap();
        setHintMode(mode);
      }
    });
  });
  $('#btnBattleFlipOpen', rootEl)?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!ui.modeB) return;
    if (ui.modeB.flipPickerOpen) {
      ui.modeB.flipPickerOpen = false;
      patchModeB();
      return;
    }
    battleActions?.openFlipPicker();
    // 与手牌 FLIP 一致，先执行对局动作，再异步准备音频。
    void sfxUnlock();
  });
  bindFlipOverlay();
  if (ui.modeB?.helpOpen) bindHelpOverlay();
  bindHandInteractions();
  syncSfxButton();
}
