/**
 * 3D 分子 · 常见反应：播放器与时间轴控制器
 */

import {
  createReactionStage,
  escapeHtml,
  highlightEquation,
} from './reactions-stage.js';

const $ = (sel) => document.querySelector(sel);

/** 时间轴放大倍数：越大步骤切换越慢 */
const PLAYBACK_SCALE = 2.15;
/** 最后一步后的停留（秒，已按实际播放时间） */
const HOLD_AFTER_LAST = 3.8;

const PAUSE_UI = {
  playing: { disabled: false, text: '暂停' },
  paused: { disabled: false, text: '继续' },
  ended: { disabled: true, text: '已结束' },
  idle: { disabled: false, text: '暂停' },
};

function stepTime(step) {
  return (Number(step?.t) || 0) * PLAYBACK_SCALE;
}

function totalDuration(steps) {
  if (!steps?.length) return 8 * PLAYBACK_SCALE + HOLD_AFTER_LAST;
  return stepTime(steps[steps.length - 1]) + HOLD_AFTER_LAST;
}

function stepIndexAt(elapsed, steps) {
  let idx = 0;
  for (let i = 0; i < steps.length; i++) {
    if (elapsed >= stepTime(steps[i])) idx = i;
  }
  return idx;
}

/** @param {'playing'|'paused'|'ended'|'idle'} mode */
function setPauseButtonState(mode) {
  const btn = $('#molReactionPause');
  if (!btn) return;
  const cfg = PAUSE_UI[mode] || PAUSE_UI.idle;
  btn.disabled = cfg.disabled;
  btn.textContent = cfg.text;
}

export function createReactionPlayer({
  getPlayerEl,
  getCurrentMoleculeId,
  collapseReactionPanel,
}) {
  let playing = false;
  let playStart = 0;
  /** 暂停时已播放秒数（实际时间，含 scale） */
  let pausedElapsed = 0;
  /** 当前播放中的反应（可变副本） */
  let activeReaction = null;
  /** 原始反应数据，供重播 */
  let lastPlayedReaction = null;
  let animRaf = 0;
  /** 播放前 3D 中的分子 id，结束时尽量还原 */
  let prePlaybackMolId = null;
  /** 最近渲染的步骤下标，避免重复刷历程 */
  let lastStepIdx = -1;
  /** 本轮是否已播放结束 */
  let playbackEnded = false;
  /** 上次写入的文字帧（步骤），避免每帧重写方程式导致弹出动画永远在第 0 帧 */
  let lastTextKey = '';

  function currentElapsed() {
    return playing ? (performance.now() - playStart) / 1000 : pausedElapsed;
  }

  const stage = createReactionStage({
    getPlayerEl,
    getCurrentMoleculeId,
    getElapsed: currentElapsed,
  });

  function togglePause() {
    if (!activeReaction || playbackEnded) return;
    if (playing) {
      playing = false;
      cancelAnimationFrame(animRaf);
      pausedElapsed = (performance.now() - playStart) / 1000;
      setPauseButtonState('paused');
      return;
    }
    playing = true;
    playStart = performance.now() - pausedElapsed * 1000;
    setPauseButtonState('playing');
    tickPlayback();
  }

  function stopPlayback(hidePlayer) {
    playing = false;
    playbackEnded = false;
    cancelAnimationFrame(animRaf);
    pausedElapsed = 0;
    lastStepIdx = -1;
    activeReaction = null;

    if (hidePlayer) {
      stage.clearAtomPlan();
      getPlayerEl()?.classList.remove('is-open');
      const stageEl = document.querySelector('.stage-3d');
      stageEl?.classList.remove('rxn-playing');
      stageEl?.style.removeProperty('--rxn-dock-h');
      if (prePlaybackMolId) {
        stage.restoreMolecule3D(prePlaybackMolId);
        prePlaybackMolId = null;
      }
      lastPlayedReaction = null;
      const hist = $('#rxnPlayerHistory');
      if (hist) hist.innerHTML = '';
      stage.notifyViewerResize();
    }

    const canvasWrap = $('#mol-root');
    if (canvasWrap) {
      canvasWrap.style.transition = '';
      canvasWrap.style.opacity = '1';
    }
    setPauseButtonState('idle');
  }

  function buildHistory(reaction) {
    const el = $('#rxnPlayerHistory');
    if (!el) return;
    const steps = reaction.steps || [];
    if (!steps.length) {
      el.innerHTML = `<li class="rxn-hist-empty">暂无分步说明</li>`;
      return;
    }
    // 横向紧凑时间轴：序号 + 步骤名；讲解在上方 tip 区
    el.innerHTML = steps
      .map((s, i) => {
        const label = s.label || `步骤 ${i + 1}`;
        const tip = s.tip || s.equationHighlight || label;
        return `
      <li class="rxn-hist-item is-pending" data-hist="${i}">
        <button type="button" class="rxn-hist-btn" data-jump="${i}" title="${escapeHtml(tip)}">
          <span class="rxn-hist-n">${i + 1}</span>
          <span class="rxn-hist-label">${escapeHtml(label)}</span>
        </button>
      </li>`;
      })
      .join('');

    el.querySelectorAll('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const idx = Number(btn.dataset.jump);
        if (Number.isFinite(idx)) jumpToStep(idx);
      });
    });
  }

  function updateHistory(currentIdx, finished = false) {
    const items = document.querySelectorAll('#rxnPlayerHistory .rxn-hist-item');
    items.forEach((li, i) => {
      li.classList.remove('is-current', 'is-done', 'is-pending');
      if (finished || i < currentIdx) li.classList.add('is-done');
      else if (i === currentIdx) li.classList.add('is-current');
      else li.classList.add('is-pending');
    });
    const cur = items[finished ? items.length - 1 : currentIdx];
    cur?.scrollIntoView?.({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  }

  function seekPaused(t, idx, finished, total) {
    const step = activeReaction.steps[idx];
    playing = false;
    playbackEnded = false;
    cancelAnimationFrame(animRaf);
    pausedElapsed = t;
    playStart = performance.now() - t * 1000;
    setPauseButtonState('paused');
    lastStepIdx = idx;
    renderPlayerFrame(activeReaction, step, Math.min(1, t / total), idx);
    updateHistory(idx, finished);
    return stage.applyStep3D(activeReaction, step, idx);
  }

  /** 点击历程：暂停并停在该步，便于对照 */
  async function jumpToStep(idx) {
    if (!activeReaction) return;
    const steps = activeReaction.steps || [];
    if (idx < 0 || idx >= steps.length) return;
    await seekPaused(stepTime(steps[idx]) + 0.08, idx, false, totalDuration(steps));
  }

  async function startPlayback(reaction) {
    stopPlayback(false);
    // 剧院模式：收起右侧列表，把舞台让给 3D + 底部 dock
    collapseReactionPanel();

    lastPlayedReaction = reaction;
    prePlaybackMolId = getCurrentMoleculeId();
    activeReaction = {
      ...reaction,
      steps: Array.isArray(reaction.steps) ? reaction.steps : [],
    };
    activeReaction.__lastMolId = null;
    lastTextKey = '';
    stage.prepareAtomPlan(activeReaction, stepTime, totalDuration(activeReaction.steps));

    playing = true;
    playbackEnded = false;
    pausedElapsed = 0;
    lastStepIdx = -1;
    playStart = performance.now();
    stage.resetMolCache();

    document.querySelector('.stage-3d')?.classList.add('rxn-playing');
    getPlayerEl()?.classList.add('is-open');
    setPauseButtonState('playing');
    buildHistory(activeReaction);
    stage.syncDockHeight();
    stage.applyViewMode();

    const steps = activeReaction.steps;
    renderPlayerFrame(activeReaction, steps[0] || null, 0, 0);
    updateHistory(0, false);
    lastStepIdx = 0;
    await stage.applyStep3D(activeReaction, steps[0] || null, 0);
    stage.syncDockHeight();
    tickPlayback();
  }

  function tickPlayback() {
    if (!playing || !activeReaction) return;
    const steps = activeReaction.steps || [];
    if (!steps.length) {
      playing = false;
      playbackEnded = true;
      setPauseButtonState('ended');
      return;
    }

    const elapsed = (performance.now() - playStart) / 1000;
    pausedElapsed = elapsed;
    const total = totalDuration(steps);
    const idx = stepIndexAt(elapsed, steps);
    const step = steps[idx];

    renderPlayerFrame(activeReaction, step, Math.min(1, elapsed / total), idx);

    if (idx !== lastStepIdx) {
      lastStepIdx = idx;
      updateHistory(idx, false);
      // 换步时切换 3D（异步，不阻塞时间轴）
      stage.applyStep3D(activeReaction, step, idx);
    }

    if (elapsed >= total) {
      playing = false;
      playbackEnded = true;
      setPauseButtonState('ended');
      updateHistory(steps.length - 1, true);
      const barEl = $('#rxnPlayerBar');
      if (barEl) barEl.style.width = '100%';
      // 结束时再确保落在产物步分子
      stage.applyStep3D(activeReaction, steps[steps.length - 1], steps.length - 1);
      return;
    }

    animRaf = requestAnimationFrame(tickPlayback);
  }

  function renderPlayerFrame(reaction, step, progress, idx = 0) {
    const playerEl = getPlayerEl();
    if (!playerEl) return;
    const eqEl = $('#rxnPlayerEquation');
    const labelEl = $('#rxnPlayerStepLabel');
    const tipEl = $('#rxnPlayerTip');
    const barEl = $('#rxnPlayerBar');
    const scrub = $('#rxnPlayerScrub');
    const metaEl = $('#rxnPlayerMeta');

    playerEl.dataset.focus = step?.focus || 'reactant';
    const textKey = `${reaction.id || reaction.title}|${idx}`;
    const textChanged = textKey !== lastTextKey;
    lastTextKey = textKey;
    if (eqEl && textChanged) {
      // 符号动画感：整式 + 高亮片段
      eqEl.innerHTML = highlightEquation(reaction.equation, step?.equationHighlight || '');
      eqEl.classList.remove('rxn-eq-pop');
      void eqEl.offsetWidth;
      eqEl.classList.add('rxn-eq-pop');
    }
    if (labelEl && textChanged) {
      labelEl.textContent = step ? `${idx + 1}. ${step.label}` : reaction.title;
    }
    if (tipEl && textChanged) tipEl.textContent = step?.tip || reaction.notes || '';
    const pct = Math.round((progress || 0) * 100);
    if (barEl) barEl.style.width = `${pct}%`;
    if (scrub && document.activeElement !== scrub) {
      scrub.value = String(Math.round((progress || 0) * 1000));
    }
    if (metaEl && textChanged) {
      metaEl.innerHTML = `
        <div title="${escapeHtml(reaction.conditions || '')}"><span>条件</span><strong>${escapeHtml(reaction.conditions || '—')}</strong></div>
        <div title="${escapeHtml(reaction.phenomena || '')}"><span>现象</span><strong>${escapeHtml(reaction.phenomena || '—')}</strong></div>
      `;
    }
  }

  function onScrubInput(e) {
    if (!activeReaction) return;
    const steps = activeReaction.steps || [];
    if (!steps.length) return;
    const v = Number(e.target.value) / 1000;
    const total = totalDuration(steps);
    const t = Math.max(0, Math.min(1, v)) * total;
    seekPaused(t, stepIndexAt(t, steps), t >= total, total);
  }

  function bindEvents() {
    $('#molReactionPlayerClose')?.addEventListener('click', () => stopPlayback(true));
    $('#molReactionReplay')?.addEventListener('click', async () => {
      const src = lastPlayedReaction || activeReaction;
      if (src) startPlayback(src);
    });
    $('#molReactionPause')?.addEventListener('click', () => togglePause());
    $('#rxnViewToggle')?.addEventListener('click', () => stage.toggleViewMode());
    window.addEventListener('chem-theme-change', () => stage.refreshAtomStage());
    window.addEventListener('resize', () => stage.refreshAtomStage());
    $('#rxnPlayerScrub')?.addEventListener('input', onScrubInput);
    $('#rxnPlayerScrub')?.addEventListener('change', onScrubInput);
  }

  return {
    bindEvents,
    startPlayback,
    stopPlayback,
  };
}
