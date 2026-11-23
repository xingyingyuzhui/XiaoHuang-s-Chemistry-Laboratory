/**
 * 3D 分子 · 常见反应（右上角入口）
 * 面板与列表协调层；播放器见 reactions-player.js，舞台见 reactions-stage.js，AI/导入导出见 reactions-io.js
 */

import { reactionApi } from '../api/client.js';
import { appAlert, appConfirm } from '../app-dialog.js';
import { escapeHtml } from './reactions-stage.js';
import { createReactionPlayer } from './reactions-player.js';
import { createReactionIo } from './reactions-io.js';

const $ = (sel) => document.querySelector(sel);

let panelEl = null;
let listEl = null;
let playerEl = null;
let badgeEl = null;
let btnToggle = null;

let currentMoleculeId = null;
let currentMoleculeMeta = { name: '', formula: '' };
let reactionsCache = [];

const io = createReactionIo({
  getCurrentMoleculeId: () => currentMoleculeId,
  getCurrentMoleculeMeta: () => currentMoleculeMeta,
  refreshCurrentList: () => refreshForMolecule(currentMoleculeId, currentMoleculeMeta),
});

const player = createReactionPlayer({
  getPlayerEl: () => playerEl,
  getCurrentMoleculeId: () => currentMoleculeId,
  collapseReactionPanel,
});

export function initMoleculeReactions() {
  btnToggle = $('#btnMolReactions');
  panelEl = $('#molReactionPanel');
  listEl = $('#molReactionList');
  playerEl = $('#molReactionPlayer');
  badgeEl = $('#molReactionBadge');

  if (!btnToggle || !panelEl) return;

  btnToggle.addEventListener('click', async () => {
    const open = panelEl.classList.toggle('is-open');
    btnToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) refreshForMolecule(currentMoleculeId, currentMoleculeMeta);
  });

  $('#molReactionClose')?.addEventListener('click', () => closePanel());
  player.bindEvents();
  io.bindEvents();
}

function closePanel() {
  panelEl?.classList.remove('is-open');
  btnToggle?.setAttribute('aria-expanded', 'false');
  io.closeAiAdd();
  player.stopPlayback(true);
}

/** 仅收起反应列表（播放时腾空间，不中断动画） */
function collapseReactionPanel() {
  panelEl?.classList.remove('is-open');
  btnToggle?.setAttribute('aria-expanded', 'false');
  io.closeAiAdd();
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
    btn.addEventListener('click', async () => {
      const r = reactionsCache.find((x) => x.id === btn.dataset.play);
      if (r) player.startPlayback(r);
    });
  });
  listEl.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await appConfirm('删除这条 AI 反应？', {
        title: '删除反应',
        okText: '删除',
        danger: true,
      });
      if (!ok) return;
      try {
        await reactionApi.remove(btn.dataset.del);
        await refreshForMolecule(currentMoleculeId, currentMoleculeMeta);
      } catch (err) {
        await appAlert(err.message || '删除失败', { title: '删除失败' });
      }
    });
  });
}

export function getReactionPanelOpen() {
  return panelEl?.classList.contains('is-open');
}

/** 外部跳转：按 id 播放（课标卡片 / 实验脚本） */
export async function playReactionById(id) {
  if (!id) return;
  try {
    const list = await reactionApi.getList();
    const r = (list || []).find((x) => x.id === id);
    if (r) {
      panelEl?.classList.add('is-open');
      btnToggle?.setAttribute('aria-expanded', 'true');
      await player.startPlayback(r);
    }
  } catch (err) {
    console.warn('播放反应失败', err);
  }
}
