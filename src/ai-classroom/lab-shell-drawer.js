/**
 * 实验探究：左侧抽屉（列表 / 折叠 / 删除 / 丢弃草稿 / 拖拽排序）
 */

import { appAlert, appConfirm } from '../app-dialog.js';
import { DRAWER_KEY, prestudyStats } from './lab-model.js';

export function createLabShellDrawer(ctx) {
  const {
    select,
    escapeHtml,
    state,
    labsApi,
    currentLab,
    ensureModeForLab,
    selectLab,
    startCreate,
    loadLabs,
    render,
  } = ctx;

  function setDrawerCollapsed(v) {
    state.drawerCollapsed = !!v;
    localStorage.setItem(DRAWER_KEY, state.drawerCollapsed ? '1' : '0');
    const layout = select('.lab-layout-drawer');
    if (layout) layout.classList.toggle('is-drawer-collapsed', state.drawerCollapsed);
    const btn = select('#btnLabDrawerToggle');
    if (btn) {
      btn.textContent = state.drawerCollapsed ? '»' : '«';
      btn.title = state.drawerCollapsed ? '展开实验列表' : '收起实验列表';
    }
  }

  async function renderRail() {
    const rail = select('#labNavRail');
    if (!rail) return;

    rail.innerHTML = `
      <div class="lab-nav-rail-head">
        <strong class="lab-nav-brand">实验探究</strong>
        <button type="button" class="lab-drawer-toggle" id="btnLabDrawerToggle" title="${state.drawerCollapsed ? '展开' : '收起'}">${state.drawerCollapsed ? '»' : '«'}</button>
      </div>
      <div class="lab-nav-toolbar">
        <button type="button" class="lab-tool-btn lab-tool-add" id="btnLabAdd" title="空白新建">＋</button>
        <button type="button" class="lab-tool-btn lab-tool-edit${state.listEditMode ? ' is-active' : ''}" id="btnLabListEdit">${state.listEditMode ? '保存' : '编辑'}</button>
        <button type="button" class="lab-tool-btn" id="btnLabExport" title="导出全部实验为 JSON">导出</button>
        <button type="button" class="lab-tool-btn" id="btnLabImport" title="导入实验包（不覆盖已有）">导入</button>
      </div>
      <button type="button" class="lab-tool-btn lab-tool-ai" id="btnLabAi" title="用 AI 生成实验草稿">AI 生成</button>
      <nav id="labNavList" class="lab-nav-list${state.listEditMode ? ' is-edit-mode' : ''}" role="list" aria-label="实验列表"></nav>
      ${state.statusMsg ? `<p class="lab-nav-status">${escapeHtml(state.statusMsg)}</p>` : ''}`;

    select('#btnLabDrawerToggle')?.addEventListener('click', () => setDrawerCollapsed(!state.drawerCollapsed));
    select('#btnLabAdd')?.addEventListener('click', async () => {
      if (state.listEditMode) state.listEditMode = false;
      startCreate();
    });
    select('#btnLabAi')?.addEventListener('click', async () => {
      if (state.listEditMode) state.listEditMode = false;
      ctx.io.startAiCreate();
    });
    select('#btnLabExport')?.addEventListener('click', async () => {
      if (state.listEditMode) state.listEditMode = false;
      ctx.io.exportLabPack();
    });
    select('#btnLabImport')?.addEventListener('click', async () => {
      if (state.listEditMode) state.listEditMode = false;
      ctx.io.pickImportFile();
    });
    select('#btnLabListEdit')?.addEventListener('click', async () => {
      // 与分子列表相同：点「保存」仅退出编辑态（排序已在拖拽时写入）
      state.listEditMode = !state.listEditMode;
      render();
    });

    const nav = select('#labNavList');
    if (!nav) return;

    nav.innerHTML = state.labs.map((lab) => {
      const stats = prestudyStats(lab, state.progress);
      let progressHtml = '';
      if (stats.hasConfig) {
        const all = stats.done >= stats.total && stats.total > 0;
        progressHtml = `<span class="lab-nav-progress${all ? ' is-done' : ''}">${stats.done}/${stats.total}</span>`;
      } else {
        progressHtml = '<span class="lab-nav-progress is-read">脚本</span>';
      }
      const active = lab.id === state.labId && !state.draft?.isNew;
      return `<div class="lab-nav-card${active ? ' is-active' : ''}${state.listEditMode ? ' is-editing' : ''}" data-lab-id="${escapeHtml(lab.id)}" draggable="${state.listEditMode ? 'true' : 'false'}">
        <button type="button" class="lab-nav-del" data-del="${escapeHtml(lab.id)}" title="删除" aria-label="删除">×</button>
        <button type="button" class="lab-nav-item-main" data-lab-pick="${escapeHtml(lab.id)}">
          <span class="lab-nav-text">
            <strong class="lab-nav-title">${escapeHtml(lab.title)}</strong>
            <span class="lab-nav-type">${escapeHtml(lab.type || '实验')}</span>
          </span>
          ${progressHtml}
        </button>
      </div>`;
    }).join('');

    // 未保存草稿也出现在列表中；编辑态可 × 丢弃（不拦截 dirty）
    if (state.draft?.isNew) {
      const draftTitle = (state.draft.title || '').trim() || '新实验（未保存）';
      nav.insertAdjacentHTML(
        'afterbegin',
        `<div class="lab-nav-card is-active is-draft${state.listEditMode ? ' is-editing' : ''}" data-lab-draft="1">
          <button type="button" class="lab-nav-del" data-del-draft="1" title="丢弃未保存实验" aria-label="丢弃">×</button>
          <button type="button" class="lab-nav-item-main" data-lab-draft-pick="1">
            <span class="lab-nav-text">
              <strong class="lab-nav-title">${escapeHtml(draftTitle)}</strong>
              <span class="lab-nav-type">未保存</span>
            </span>
          </button>
        </div>`,
      );
    }

    bindNavItems(nav);
  }

  function bindNavItems(nav) {
    nav.querySelectorAll('[data-lab-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (state.listEditMode) return;
        selectLab(btn.dataset.labPick);
      });
    });

    nav.querySelectorAll('[data-lab-draft-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (state.listEditMode) return;
        state.mode = 'script';
        render();
      });
    });

    nav.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!state.listEditMode) return;
        const id = btn.dataset.del;
        if (!id) return;
        // 列表编辑态删除：不拦截「脚本未保存」
        if (!(await appConfirm('确定删除该实验？'))) return;
        try {
          const wasCurrent = state.labId === id;
          await labsApi.remove(id);
          if (wasCurrent) {
            state.labId = null;
            state.draft = null;
            state.dirty = false;
            state.saving = false;
            state.mode = null;
          }
          const preserveDraft = !!(state.draft?.isNew && !wasCurrent);
          await loadLabs({ keepSelection: !wasCurrent, preserveDraft });
          if (wasCurrent) {
            state.labId = state.labs[0]?.id || null;
            if (state.labId) {
              state.mode = 'script';
              ctx.beginScriptDraft(currentLab());
              state.dirty = false;
            }
            render();
          }
        } catch (err) {
          await appAlert(`删除失败：${err.message || ''}`);
        }
      });
    });

    nav.querySelectorAll('[data-del-draft]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!state.listEditMode) return;
        // 未保存草稿：编辑态可直接丢弃
        if (!(await appConfirm('丢弃这个未保存的实验？'))) return;
        state.draft = null;
        state.dirty = false;
        state.saving = false;
        state.labId = state.labs[0]?.id || null;
        state.mode = null;
        if (state.labId) {
          ensureModeForLab(currentLab());
          if (state.mode === 'script') ctx.beginScriptDraft(currentLab());
          state.dirty = false;
        }
        render();
      });
    });

    if (state.listEditMode) {
      bindNavDragReorder(nav);
    }
  }

  function bindNavDragReorder(nav) {
    let dragId = null;
    nav.querySelectorAll('.lab-nav-card[data-lab-id]').forEach((card) => {
      card.addEventListener('dragstart', (e) => {
        dragId = card.dataset.labId;
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
        const targetId = card.dataset.labId;
        if (!dragId || dragId === targetId) return;
        const ids = state.labs.map((l) => l.id);
        const from = ids.indexOf(dragId);
        const to = ids.indexOf(targetId);
        if (from < 0 || to < 0) return;
        ids.splice(from, 1);
        ids.splice(to, 0, dragId);
        try {
          const data = await labsApi.reorder(ids);
          state.labs = data?.labs || state.labs;
          render();
        } catch (err) {
          await appAlert(`排序失败：${err.message || ''}`);
        }
      });
    });
  }

  return {
    setDrawerCollapsed,
    renderRail,
  };
}
