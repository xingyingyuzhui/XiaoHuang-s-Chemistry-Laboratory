/**
 * 3D 分子 · 常见反应（右上角入口）
 * 示意动画：方程式层 + 3D 结构淡入淡出
 */

import { reactionApi, aiApi, moleculeApi } from './api/client.js';
import { ensureMolViewer, getMolViewer } from './molecule-list.js';

const $ = (sel) => document.querySelector(sel);

/** 时间轴放大倍数：越大步骤切换越慢 */
const PLAYBACK_SCALE = 2.15;
/** 最后一步后的停留（秒，已按实际播放时间） */
const HOLD_AFTER_LAST = 3.8;

let panelEl = null;
let listEl = null;
let playerEl = null;
let badgeEl = null;
let btnToggle = null;

let currentMoleculeId = null;
let currentMoleculeMeta = { name: '', formula: '' };
let reactionsCache = [];
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
  if (mode === 'playing') {
    btn.disabled = false;
    btn.textContent = '暂停';
  } else if (mode === 'paused') {
    btn.disabled = false;
    btn.textContent = '继续';
  } else if (mode === 'ended') {
    btn.disabled = true;
    btn.textContent = '已结束';
  } else {
    btn.disabled = false;
    btn.textContent = '暂停';
  }
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightEquation(eq, frag) {
  const full = escapeHtml(eq || '');
  if (!frag) return full;
  const f = escapeHtml(frag);
  if (!f || !full.includes(f)) return full;
  return full.split(f).join(`<mark class="rxn-eq-mark">${f}</mark>`);
}

export function initMoleculeReactions() {
  btnToggle = $('#btnMolReactions');
  panelEl = $('#molReactionPanel');
  listEl = $('#molReactionList');
  playerEl = $('#molReactionPlayer');
  badgeEl = $('#molReactionBadge');

  if (!btnToggle || !panelEl) return;

  btnToggle.addEventListener('click', () => {
    const open = panelEl.classList.toggle('is-open');
    btnToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) refreshForMolecule(currentMoleculeId, currentMoleculeMeta);
  });

  $('#molReactionClose')?.addEventListener('click', () => closePanel());
  $('#molReactionPlayerClose')?.addEventListener('click', () => stopPlayback(true));
  $('#molReactionReplay')?.addEventListener('click', () => {
    const src = lastPlayedReaction || activeReaction;
    if (src) startPlayback(src);
  });
  $('#molReactionPause')?.addEventListener('click', () => togglePause());

  $('#btnAiAddReaction')?.addEventListener('click', () => openAiAdd());
  $('#rxnAiCancel')?.addEventListener('click', () => closeAiAdd());
  $('#rxnAiGenerate')?.addEventListener('click', () => generateAiReaction());
  $('#rxnAiSave')?.addEventListener('click', () => saveAiReaction());
  $('#rxnAiDiscard')?.addEventListener('click', () => {
    $('#rxnAiPreview')?.classList.add('is-hidden');
    const row = $('#rxnAiSaveRow');
    if (row) row.hidden = true;
    window.__rxnAiDraft = null;
    const status = $('#rxnAiStatus');
    if (status) status.textContent = '';
  });
}

function closePanel() {
  panelEl?.classList.remove('is-open');
  btnToggle?.setAttribute('aria-expanded', 'false');
  closeAiAdd();
  stopPlayback(true);
}

/** 仅收起反应列表（播放时腾空间，不中断动画） */
function collapseReactionPanel() {
  panelEl?.classList.remove('is-open');
  btnToggle?.setAttribute('aria-expanded', 'false');
  closeAiAdd();
}

function notifyViewerResize() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        getMolViewer()?.resize?.();
      } catch {
        /* ignore */
      }
    });
  });
}

/** 按 dock 实际高度抬高 3D 画布，避免分子被挡 */
function syncDockHeight() {
  const stage = document.querySelector('.stage-3d');
  if (!stage || !playerEl?.classList.contains('is-open')) {
    stage?.style.removeProperty('--rxn-dock-h');
    return;
  }
  const h = Math.ceil(playerEl.getBoundingClientRect().height + 14);
  stage.style.setProperty('--rxn-dock-h', `${Math.max(h, 180)}px`);
  notifyViewerResize();
}

/**
 * 分子切换时由 molecule-list 调用
 */
export async function onMoleculeChanged(mol) {
  currentMoleculeId = mol?.id || null;
  currentMoleculeMeta = {
    name: mol?.name || '',
    formula: mol?.formula || '',
  };
  if (panelEl?.classList.contains('is-open')) {
    await refreshForMolecule(currentMoleculeId, currentMoleculeMeta);
  } else {
    try {
      const list = currentMoleculeId
        ? await reactionApi.getList(currentMoleculeId)
        : [];
      reactionsCache = list || [];
      updateBadge(reactionsCache.length);
    } catch {
      updateBadge(0);
    }
  }
}

function updateBadge(n) {
  if (!badgeEl) return;
  if (n > 0) {
    badgeEl.textContent = String(n);
    badgeEl.hidden = false;
  } else {
    badgeEl.hidden = true;
  }
}

async function refreshForMolecule(moleculeId, meta) {
  if (!listEl) return;
  listEl.innerHTML = `<p class="rxn-muted">加载中…</p>`;
  try {
    const list = moleculeId
      ? await reactionApi.getList(moleculeId)
      : await reactionApi.getList();
    reactionsCache = list || [];
    updateBadge(reactionsCache.length);
    renderList(reactionsCache, meta);
  } catch (err) {
    listEl.innerHTML = `<p class="rxn-error">${escapeHtml(err.message || '加载失败')}</p>`;
  }
}

function renderList(list) {
  if (!listEl) return;
  if (!list.length) {
    listEl.innerHTML = `
      <div class="rxn-empty">
        <p>当前分子暂无关联反应</p>
        <p class="rxn-muted">可点击下方「AI 添加反应」扩展本地库（需 API Key）</p>
      </div>`;
    return;
  }

  listEl.innerHTML = list
    .map(
      (r) => `
    <article class="rxn-card" data-id="${escapeHtml(r.id)}">
      <div class="rxn-card-top">
        <span class="rxn-type">${escapeHtml(r.type || '反应')}</span>
        ${
          r.source === 'ai'
            ? `<button type="button" class="rxn-del" data-del="${escapeHtml(r.id)}" title="删除">×</button>`
            : `<span class="rxn-src">内置</span>`
        }
      </div>
      <h4 class="rxn-card-title">${escapeHtml(r.title)}</h4>
      <p class="rxn-card-eq">${escapeHtml(r.equation)}</p>
      <button type="button" class="btn primary btn-sm rxn-play" data-play="${escapeHtml(r.id)}">播放示意</button>
    </article>`,
    )
    .join('');

  listEl.querySelectorAll('[data-play]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const r = reactionsCache.find((x) => x.id === btn.dataset.play);
      if (r) startPlayback(r);
    });
  });
  listEl.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('删除这条 AI 反应？')) return;
      try {
        await reactionApi.remove(btn.dataset.del);
        await refreshForMolecule(currentMoleculeId, currentMoleculeMeta);
      } catch (err) {
        alert(err.message || '删除失败');
      }
    });
  });
}

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
    playerEl?.classList.remove('is-open');
    const stage = document.querySelector('.stage-3d');
    stage?.classList.remove('rxn-playing');
    stage?.style.removeProperty('--rxn-dock-h');
    if (prePlaybackMolId) {
      restoreMolecule3D(prePlaybackMolId);
      prePlaybackMolId = null;
    }
    lastPlayedReaction = null;
    const hist = $('#rxnPlayerHistory');
    if (hist) hist.innerHTML = '';
    notifyViewerResize();
  }

  const canvasWrap = $('#mol-root');
  if (canvasWrap) {
    canvasWrap.style.transition = '';
    canvasWrap.style.opacity = '1';
  }

  setPauseButtonState('idle');
}

async function restoreMolecule3D(id) {
  if (!id) return;
  try {
    ensureMolViewer();
    const m = await moleculeApi.getById(id);
    if (m) getMolViewer()?.load(m);
  } catch {
    /* ignore */
  }
}

/** 规范化化学式便于匹配库内分子 */
function normFormula(f) {
  return String(f || '')
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (d) => '0123456789'['₀₁₂₃₄₅₆₇₈₉'.indexOf(d)])
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase();
}

let molListCache = null;
async function getMolListCached() {
  if (molListCache) return molListCache;
  try {
    molListCache = (await moleculeApi.getList()) || [];
  } catch {
    molListCache = [];
  }
  return molListCache;
}

async function formulaToMoleculeId(formula) {
  if (!formula) return null;
  const list = await getMolListCached();
  const n = normFormula(formula);
  if (!n) return null;
  const hit = list.find((m) => normFormula(m.formula) === n || m.id === formula);
  return hit?.id || null;
}

/**
 * 解析某步应展示的 3D 分子 id
 */
async function resolveStepMoleculeId(reaction, step, stepIdx = 0) {
  if (step?.moleculeId) return step.moleculeId;

  const reactants = (reaction.reactants || []).filter((r) => r.moleculeId);
  const products = (reaction.products || []).filter((p) => p.moleculeId);
  const focus = step?.focus || 'reactant';

  if (focus === 'product' || focus === 'done') {
    if (products[0]?.moleculeId) return products[0].moleculeId;
    // 按化学式在库中找
    for (const p of reaction.products || []) {
      const id = await formulaToMoleculeId(p.formula);
      if (id) return id;
    }
    // 分子 ids 里取非反应物的
    const rset = new Set(reactants.map((r) => r.moleculeId));
    const extra = (reaction.moleculeIds || []).find((id) => id && !rset.has(id));
    if (extra) return extra;
  }

  if (focus === 'join') {
    if (reactants.length > 1) return reactants[1].moleculeId;
    if (products[0]?.moleculeId) return products[0].moleculeId;
  }

  if (focus === 'break' && reactants.length > 1 && stepIdx > 0) {
    return reactants[Math.min(1, reactants.length - 1)].moleculeId;
  }

  if (reactants[0]?.moleculeId) return reactants[0].moleculeId;
  if (reaction.moleculeIds?.[0]) return reaction.moleculeIds[0];
  return currentMoleculeId;
}

async function loadReactant3D(reaction) {
  const first =
    reaction.steps?.[0]?.moleculeId ||
    reaction.reactants?.find((r) => r.moleculeId)?.moleculeId ||
    reaction.moleculeIds?.[0] ||
    currentMoleculeId;
  if (!first) return;
  await fadeLoadMolecule(first, false);
}

/**
 * 淡入淡出加载分子；sameId 时也可做一次轻闪提示切换感
 */
async function fadeLoadMolecule(id, fade = true) {
  if (!id) return false;
  const root = $('#mol-root');
  try {
    ensureMolViewer();
    if (fade && root) {
      root.style.transition = 'opacity 0.45s ease';
      root.style.opacity = '0.12';
      await new Promise((r) => setTimeout(r, 380));
    }
    const m = await moleculeApi.getById(id);
    if (m) getMolViewer()?.load(m);
    if (root) root.style.opacity = '1';
    return true;
  } catch {
    if (root) root.style.opacity = '1';
    return false;
  }
}

/**
 * 步骤变化时切换 3D；返回是否成功换到目标 id
 */
async function applyStep3D(reaction, step, stepIdx) {
  if (!reaction) return;
  const id = await resolveStepMoleculeId(reaction, step, stepIdx);
  if (!id) {
    setMol3dHint(step, false);
    return;
  }
  if (reaction.__lastMolId === id) {
    setMol3dHint(step, true, id);
    return;
  }
  reaction.__lastMolId = id;
  const ok = await fadeLoadMolecule(id, true);
  setMol3dHint(step, ok, id);
}

function setMol3dHint(step, hasModel, molId) {
  // 在 tip 后附加轻提示：无对应 3D 时不误导
  const tipEl = $('#rxnPlayerTip');
  if (!tipEl || !step) return;
  const base = step.tip || '';
  if (hasModel && molId) {
    tipEl.dataset.molId = molId;
  }
  // tip 正文仍用 base；缺少模型时若 tip 未说明则补一句
  if (!hasModel && base && !/暂无|无 3D|无3D/.test(base)) {
    tipEl.textContent = `${base}（本步无独立 3D，请看方程式）`;
  }
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
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.jump);
      if (Number.isFinite(idx)) jumpToStep(idx);
    });
  });
}

/**
 * @param {number} currentIdx
 * @param {boolean} [finished]
 */
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

/**
 * 点击历程：暂停并停在该步，便于对照
 */
async function jumpToStep(idx) {
  if (!activeReaction) return;
  const steps = activeReaction.steps || [];
  if (idx < 0 || idx >= steps.length) return;

  playing = false;
  playbackEnded = false;
  cancelAnimationFrame(animRaf);

  const t = stepTime(steps[idx]) + 0.08;
  pausedElapsed = t;
  playStart = performance.now() - t * 1000;
  setPauseButtonState('paused');

  const step = steps[idx];
  const total = totalDuration(steps);
  lastStepIdx = idx;
  renderPlayerFrame(activeReaction, step, Math.min(1, t / total), idx);
  updateHistory(idx, false);
  await applyStep3D(activeReaction, step, idx);
}

async function startPlayback(reaction) {
  stopPlayback(false);
  // 剧院模式：收起右侧列表，把舞台让给 3D + 底部 dock
  collapseReactionPanel();

  lastPlayedReaction = reaction;
  prePlaybackMolId = currentMoleculeId;
  activeReaction = {
    ...reaction,
    steps: Array.isArray(reaction.steps) ? reaction.steps : [],
  };
  activeReaction.__lastMolId = null;
  playing = true;
  playbackEnded = false;
  pausedElapsed = 0;
  lastStepIdx = -1;
  playStart = performance.now();
  molListCache = null;

  const stage = document.querySelector('.stage-3d');
  stage?.classList.add('rxn-playing');
  playerEl?.classList.add('is-open');
  setPauseButtonState('playing');
  buildHistory(activeReaction);
  syncDockHeight();

  const steps = activeReaction.steps;
  renderPlayerFrame(activeReaction, steps[0] || null, 0, 0);
  updateHistory(0, false);
  lastStepIdx = 0;
  await applyStep3D(activeReaction, steps[0] || null, 0);
  syncDockHeight();
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
    applyStep3D(activeReaction, step, idx);
  }

  if (elapsed >= total) {
    playing = false;
    playbackEnded = true;
    setPauseButtonState('ended');
    updateHistory(steps.length - 1, true);
    const barEl = $('#rxnPlayerBar');
    if (barEl) barEl.style.width = '100%';
    // 结束时再确保落在产物步分子
    applyStep3D(activeReaction, steps[steps.length - 1], steps.length - 1);
    return;
  }

  animRaf = requestAnimationFrame(tickPlayback);
}

function renderPlayerFrame(reaction, step, progress, idx = 0) {
  if (!playerEl) return;
  const eqEl = $('#rxnPlayerEquation');
  const labelEl = $('#rxnPlayerStepLabel');
  const tipEl = $('#rxnPlayerTip');
  const barEl = $('#rxnPlayerBar');
  const metaEl = $('#rxnPlayerMeta');
  const focus = step?.focus || 'reactant';

  playerEl.dataset.focus = focus;
  if (eqEl) {
    eqEl.innerHTML = highlightEquation(
      reaction.equation,
      step?.equationHighlight || '',
    );
  }
  if (labelEl) {
    labelEl.textContent = step
      ? `${idx + 1}. ${step.label}`
      : reaction.title;
  }
  if (tipEl) tipEl.textContent = step?.tip || reaction.notes || '';
  if (barEl) barEl.style.width = `${Math.round((progress || 0) * 100)}%`;
  if (metaEl) {
    metaEl.innerHTML = `
      <div title="${escapeHtml(reaction.conditions || '')}"><span>条件</span><strong>${escapeHtml(reaction.conditions || '—')}</strong></div>
      <div title="${escapeHtml(reaction.phenomena || '')}"><span>现象</span><strong>${escapeHtml(reaction.phenomena || '—')}</strong></div>
    `;
  }
}

/* —— AI 添加 —— */
function openAiAdd() {
  const box = $('#rxnAiBox');
  if (!box) return;
  box.classList.add('is-open');
  $('#rxnAiPreview')?.classList.add('is-hidden');
  const row = $('#rxnAiSaveRow');
  if (row) row.hidden = true;
  const input = $('#rxnAiPrompt');
  if (input) {
    input.value = currentMoleculeMeta.name
      ? `与${currentMoleculeMeta.name}（${currentMoleculeMeta.formula || ''}）相关的高中常见反应`
      : '';
    input.focus();
  }
  const status = $('#rxnAiStatus');
  if (status) status.textContent = '';
  window.__rxnAiDraft = null;
}

function closeAiAdd() {
  $('#rxnAiBox')?.classList.remove('is-open');
  $('#rxnAiPreview')?.classList.add('is-hidden');
  const row = $('#rxnAiSaveRow');
  if (row) row.hidden = true;
  window.__rxnAiDraft = null;
}

async function generateAiReaction() {
  const prompt = $('#rxnAiPrompt')?.value?.trim();
  const status = $('#rxnAiStatus');
  if (!prompt) {
    if (status) status.textContent = '请先描述反应';
    return;
  }
  if (status) status.textContent = '生成中…';
  let stepCount = Number($('#rxnAiStepCount')?.value || 5);
  if (![4, 5, 6].includes(stepCount)) stepCount = 5;
  try {
    const data = await aiApi.reaction({
      prompt,
      moleculeId: currentMoleculeId,
      moleculeName: currentMoleculeMeta.name,
      moleculeFormula: currentMoleculeMeta.formula,
      stepCount,
    });
    // 保证与当前分子关联，便于列表筛选
    if (currentMoleculeId) {
      const ids = Array.isArray(data.moleculeIds) ? [...data.moleculeIds] : [];
      if (!ids.includes(currentMoleculeId)) ids.unshift(currentMoleculeId);
      data.moleculeIds = ids;
    }
    window.__rxnAiDraft = data;
    const prev = $('#rxnAiPreview');
    if (prev) {
      prev.classList.remove('is-hidden');
      prev.innerHTML = `
        <h5>${escapeHtml(data.title)}</h5>
        <p class="rxn-card-eq">${escapeHtml(data.equation)}</p>
        <p class="rxn-muted">${escapeHtml(data.type)} · ${escapeHtml(data.conditions || '')}</p>
        <p class="rxn-muted">${escapeHtml(data.notes || '')}</p>
      `;
    }
    const row = $('#rxnAiSaveRow');
    if (row) row.hidden = false;
    if (status) status.textContent = '已生成预览，确认无误后保存到本地';
  } catch (err) {
    if (status) status.textContent = err.message || '生成失败';
  }
}

async function saveAiReaction() {
  const draft = window.__rxnAiDraft;
  const status = $('#rxnAiStatus');
  if (!draft) {
    if (status) status.textContent = '请先生成预览';
    return;
  }
  try {
    await reactionApi.add(draft);
    if (status) status.textContent = '已保存';
    closeAiAdd();
    await refreshForMolecule(currentMoleculeId, currentMoleculeMeta);
  } catch (err) {
    if (status) status.textContent = err.message || '保存失败';
  }
}

export function getReactionPanelOpen() {
  return panelEl?.classList.contains('is-open');
}
