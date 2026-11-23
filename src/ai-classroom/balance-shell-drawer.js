/**
 * 配平脚本 · 左侧抽屉（脚本列表、编辑态排序/删除、新建、导入/导出）
 */

import {
  scriptToDraft,
  formatBalanceImportSummary,
  downloadJsonFile,
} from './balance-model.js';
import { appAlert, appConfirm } from '../app-dialog.js';
import { htmlEmptyScripts } from './balance-views.js';

export async function renderRail(ctx) {
  const { select, escapeHtml, balanceScriptsApi } = ctx;
  const rail = select('#balanceNavRail');
  if (!rail) return;

  rail.innerHTML = `
      <div class="lab-nav-rail-head">
        <strong class="lab-nav-brand">分步配平</strong>
        <button type="button" class="lab-drawer-toggle" id="btnBalanceDrawerToggle"
          title="${ctx.drawerCollapsed ? '展开' : '收起'}">${ctx.drawerCollapsed ? '»' : '«'}</button>
      </div>
      <div class="lab-nav-toolbar">
        <button type="button" class="lab-tool-btn lab-tool-add" id="btnBalanceAdd" title="新建脚本">＋</button>
        <button type="button" class="lab-tool-btn lab-tool-edit${ctx.listEditMode ? ' is-active' : ''}" id="btnBalanceListEdit">${ctx.listEditMode ? '保存' : '编辑'}</button>
        <button type="button" class="lab-tool-btn" id="btnBalanceExport" title="导出全部配平脚本为 JSON">导出</button>
        <button type="button" class="lab-tool-btn" id="btnBalanceImport" title="导入配平包（不覆盖已有）">导入</button>
      </div>
      <button type="button" class="lab-tool-btn lab-tool-ai" id="btnBalanceAiGen" title="用 AI 生成配平脚本草稿">AI 生成</button>
      <nav id="balanceNavList" class="lab-nav-list${ctx.listEditMode ? ' is-edit-mode' : ''}" role="list" aria-label="配平脚本列表"></nav>
      ${ctx.statusMsg ? `<p class="lab-nav-status">${escapeHtml(ctx.statusMsg)}</p>` : ''}`;

  select('#btnBalanceDrawerToggle')?.addEventListener('click', async () => {
    ctx.setDrawerCollapsed(!ctx.drawerCollapsed);
  });
  select('#btnBalanceAdd')?.addEventListener('click', async () => {
    if (ctx.listEditMode) ctx.listEditMode = false;
    startCreate(ctx);
  });
  select('#btnBalanceListEdit')?.addEventListener('click', async () => {
    // 与实验探究相同：点「保存」仅退出编辑态（排序已在拖拽时写入）
    ctx.listEditMode = !ctx.listEditMode;
    ctx.render();
  });
  select('#btnBalanceExport')?.addEventListener('click', async () => {
    if (ctx.listEditMode) ctx.listEditMode = false;
    exportBalancePack(ctx);
  });
  select('#btnBalanceImport')?.addEventListener('click', async () => {
    if (ctx.listEditMode) ctx.listEditMode = false;
    pickImportFile(ctx);
  });
  select('#btnBalanceAiGen')?.addEventListener('click', async () => {
    if (ctx.listEditMode) ctx.listEditMode = false;
    ctx.startAiCreate();
  });

  const nav = select('#balanceNavList');
  if (!nav) return;

  if (!ctx.scripts.length && !ctx.draft?.isNew) {
    nav.innerHTML = htmlEmptyScripts();
  } else {
    nav.innerHTML = ctx.scripts.map((s) => {
      const p = ctx.progress[s.id] || {};
      const total = s.steps?.length || 0;
      const done = Math.min(Number(p.stepsDone) || 0, total);
      const allDone = p.finished || (total > 0 && done >= total);
      let progressHtml = '';
      if (total > 0) {
        progressHtml = `<span class="lab-nav-progress${allDone ? ' is-done' : ''}">${p.finished ? '✓' : `${done}/${total}`}</span>`;
      }
      const active = s.id === ctx.scriptId && !ctx.draft?.isNew;
      const type = s.difficulty || s.grade || '配平';
      return `<div class="lab-nav-card${active ? ' is-active' : ''}${ctx.listEditMode ? ' is-editing' : ''}" data-script-id="${escapeHtml(s.id)}" draggable="${ctx.listEditMode ? 'true' : 'false'}">
          <button type="button" class="lab-nav-del" data-del="${escapeHtml(s.id)}" title="删除" aria-label="删除">×</button>
          <button type="button" class="lab-nav-item-main" data-script-pick="${escapeHtml(s.id)}">
            <span class="lab-nav-text">
              <strong class="lab-nav-title">${escapeHtml(s.title)}</strong>
              <span class="lab-nav-type">${escapeHtml(type)}${s.source === 'custom' ? ' · 自定义' : ''}</span>
            </span>
            ${progressHtml}
          </button>
        </div>`;
    }).join('');
  }

  if (ctx.draft?.isNew) {
    const draftTitle = (ctx.draft.title || '').trim() || '新脚本（未保存）';
    nav.insertAdjacentHTML(
      'afterbegin',
      `<div class="lab-nav-card is-active is-draft${ctx.listEditMode ? ' is-editing' : ''}" data-script-draft="1">
          <button type="button" class="lab-nav-del" data-del-draft="1" title="丢弃" aria-label="丢弃">×</button>
          <button type="button" class="lab-nav-item-main" data-script-draft-pick="1">
            <span class="lab-nav-text">
              <strong class="lab-nav-title">${escapeHtml(draftTitle)}</strong>
              <span class="lab-nav-type">未保存</span>
            </span>
          </button>
        </div>`,
    );
  }

  bindRailCardEvents(ctx, nav, balanceScriptsApi);
  if (ctx.listEditMode) bindRailDragReorder(ctx, nav, balanceScriptsApi);

  ctx.setDrawerCollapsed(ctx.drawerCollapsed);
}

function bindRailCardEvents(ctx, nav, balanceScriptsApi) {
  nav.querySelectorAll('[data-script-pick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (ctx.listEditMode) return;
      ctx.selectScript(btn.dataset.scriptPick);
    });
  });
  nav.querySelectorAll('[data-script-draft-pick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (ctx.listEditMode) return;
      ctx.mode = 'script';
      ctx.render();
    });
  });
  nav.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!ctx.listEditMode) return;
      const id = btn.dataset.del;
      if (!id || !(await appConfirm('确定删除该配平脚本？', { title: '删除脚本', okText: '删除', danger: true }))) return;
      try {
        const wasCurrent = ctx.scriptId === id;
        await balanceScriptsApi.remove(id);
        if (wasCurrent) {
          ctx.scriptId = null;
          ctx.draft = null;
          ctx.dirty = false;
        }
        await ctx.loadScripts({ keepSelection: !wasCurrent });
        if (wasCurrent) {
          ctx.scriptId = ctx.scripts[0]?.id || null;
          ctx.mode = 'practice';
          ctx.resetPractice();
        }
        ctx.render();
      } catch (err) {
        await appAlert(err.message || '删除失败');
      }
    });
  });
  nav.querySelectorAll('[data-del-draft]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!ctx.listEditMode) return;
      if (!(await appConfirm('丢弃未保存脚本？'))) return;
      ctx.draft = null;
      ctx.dirty = false;
      ctx.scriptId = ctx.scripts[0]?.id || null;
      ctx.mode = 'practice';
      ctx.resetPractice();
      ctx.render();
    });
  });
}

/** 编辑态：拖拽排序（对齐实验探究列表） */
function bindRailDragReorder(ctx, nav, balanceScriptsApi) {
  let dragId = null;
  nav.querySelectorAll('.lab-nav-card[data-script-id]').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      dragId = card.dataset.scriptId;
      card.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => {
      dragId = null;
      card.classList.remove('is-dragging');
      nav.querySelectorAll('.lab-nav-card').forEach((c) => c.classList.remove('drag-over'));
    });
    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', async (e) => {
      e.preventDefault();
      card.classList.remove('drag-over');
      const targetId = card.dataset.scriptId;
      if (!dragId || dragId === targetId) return;
      const ids = ctx.scripts.map((s) => s.id);
      const from = ids.indexOf(dragId);
      const to = ids.indexOf(targetId);
      if (from < 0 || to < 0) return;
      ids.splice(from, 1);
      ids.splice(to, 0, dragId);
      try {
        const data = await balanceScriptsApi.reorder(ids);
        ctx.scripts = data?.scripts || ctx.scripts;
        ctx.render();
      } catch (err) {
        await appAlert(`排序失败：${err.message || ''}`);
      }
    });
  });
}

async function startCreate(ctx) {
  if (ctx.mode === 'script' && ctx.dirty && !(await appConfirm('放弃未保存修改？', { title: '未保存修改', okText: '放弃', danger: true }))) return;
  ctx.mode = 'script';
  ctx.scriptId = null;
  ctx.draft = scriptToDraft(null);
  ctx.selectedStep = 0;
  ctx.dirty = true;
  ctx.listEditMode = false;
  ctx.stepEditMode = false;
  ctx.render();
}

async function exportBalancePack(ctx) {
  const { balanceScriptsApi } = ctx;
  if (!balanceScriptsApi?.exportPack) {
    await appAlert('配平包导出不可用');
    return;
  }
  try {
    const data = await balanceScriptsApi.exportPack();
    downloadJsonFile(`配平脚本包-${new Date().toISOString().slice(0, 10)}.json`, data);
    ctx.statusMsg = '已导出配平脚本包';
    renderRail(ctx);
  } catch (err) {
    await appAlert(`导出失败：${err.message || ''}`);
  }
}

function pickImportFile(ctx) {
  const { select } = ctx;
  let input = select('#balancePackImportInput');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.id = 'balancePackImportInput';
    input.hidden = true;
    document.body.appendChild(input);
    input.addEventListener('change', (e) => onImportFile(ctx, e));
  }
  input.value = '';
  input.click();
}

async function onImportFile(ctx, e) {
  const file = e.target?.files?.[0];
  if (!file) return;
  if (!(await ctx.confirmLeaveDirty())) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    const result = await ctx.balanceScriptsApi.importPack(data);
    const summary = formatBalanceImportSummary(result);
    ctx.statusMsg = summary.split('\n')[0];
    ctx.dirty = false;
    ctx.draft = null;
    await ctx.loadScripts({ keepSelection: false });
    ctx.render();
    await appAlert(summary, { title: '导入完成' });
  } catch (err) {
    await appAlert(`导入失败：${err.message || ''}`, { title: '导入失败' });
  }
}
