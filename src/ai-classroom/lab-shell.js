/**
 * 实验探究 UI 控制器
 * - 预习 | 脚本（脚本页 = 编辑页）
 * - 左侧抽屉见 lab-shell-drawer.js，脚本编辑见 lab-shell-editor.js，AI/导入导出见 lab-shell-io.js
 * - 纯数据逻辑见 lab-model.js，模板见 lab-views.js
 */

import { appConfirm } from '../app-dialog.js';
import {
  DRAWER_KEY,
  loadProgress,
  saveProgress,
  loadSession,
  saveSession,
  prestudySteps,
} from './lab-model.js';
import { htmlTitleRow, htmlPrestudyBody, htmlEmptyLabs } from './lab-views.js';
import { createLabShellIo } from './lab-shell-io.js';
import { createLabShellDrawer } from './lab-shell-drawer.js';
import { createLabShellEditor } from './lab-shell-editor.js';

export function createLabShellController({ select, escapeHtml, labsApi, aiApi }) {
  const state = {
    labs: [],
    labId: null,
    mode: null, // prestudy | script
    stepIdx: 0, // 预习翻页
    stepResults: {},
    progress: loadProgress(),
    drawerCollapsed: localStorage.getItem(DRAWER_KEY) === '1',
    statusMsg: '',
    /** 与 3D 分子列表一致：编辑态显示删除 × + 可拖拽排序 */
    listEditMode: false,
    stepEditMode: false,
    /** 脚本页工作副本（与「编辑」合一） */
    draft: null,
    selectedStep: 0,
    dirty: false,
    saving: false,
  };

  function currentLab() {
    return state.labs.find((l) => l.id === state.labId) || null;
  }

  function persistSession() {
    saveSession({ labId: state.labId, mode: state.mode });
  }

  function ensureModeForLab(lab) {
    const has = prestudySteps(lab).length > 0;
    if (state.mode === 'prestudy' && !has) state.mode = 'script';
    if (state.mode !== 'prestudy' && state.mode !== 'script') {
      state.mode = has ? 'prestudy' : 'script';
    }
  }

  function hydrateStepResults() {
    state.stepResults = {};
    const saved = state.progress[state.labId] || {};
    for (const [k, v] of Object.entries(saved)) {
      state.stepResults[Number(k)] = v;
    }
  }

  async function confirmLeaveDirty() {
    if (!state.dirty) return true;
    return appConfirm('脚本有未保存的修改，确定放弃？', {
      title: '未保存修改',
      okText: '放弃修改',
      danger: true,
    });
  }

  async function loadLabs({ keepSelection = true, preserveDraft = false } = {}) {
    state.statusMsg = state.statusMsg && state.statusMsg.includes('AI') ? state.statusMsg : '';
    try {
      const data = await labsApi.list();
      state.labs = data?.labs || [];
      const session = loadSession();
      const keepNewDraft = preserveDraft && state.draft?.isNew;

      if (keepNewDraft) {
        state.labId = null;
        state.mode = 'script';
      } else if (keepSelection && state.labId && state.labs.some((l) => l.id === state.labId)) {
        /* keep labId；mode 由调用方决定（进入页面会清空为 null → 默认预习） */
      } else if (session.labId && state.labs.some((l) => l.id === session.labId)) {
        state.labId = session.labId;
        // 只恢复实验选择，不恢复 script/prestudy，默认进预习
        if (state.mode !== 'prestudy' && state.mode !== 'script') state.mode = null;
      } else {
        state.labId = state.labs[0]?.id || null;
        state.mode = null;
      }

      const lab = currentLab();
      if (keepNewDraft) {
        // 保留未保存 AI/空白草稿，不覆盖 draft
        state.mode = 'script';
      } else if (lab) {
        ensureModeForLab(lab);
        if (state.mode === 'script') editor.beginScriptDraft(lab);
        else state.draft = null;
      } else {
        state.draft = null;
      }
      state.stepIdx = 0;
      hydrateStepResults();
    } catch (err) {
      state.statusMsg = `加载失败：${err.message || ''}`;
      state.labs = [];
    }
    render();
  }

  async function selectLab(id) {
    if (id === state.labId && !state.draft?.isNew && state.mode === 'prestudy') return;
    if (!(await confirmLeaveDirty())) return;
    state.labId = id;
    state.stepIdx = 0;
    // 点进实验默认预习（有预习步骤时）
    state.mode = null;
    const lab = currentLab();
    ensureModeForLab(lab);
    hydrateStepResults();
    if (state.mode === 'script') editor.beginScriptDraft(lab);
    else state.draft = null;
    state.dirty = false;
    persistSession();
    render();
  }

  async function startCreate() {
    if (!(await confirmLeaveDirty())) return;
    state.labId = null;
    state.mode = 'script';
    editor.beginScriptDraft(null);
    state.dirty = true;
    state.listEditMode = false;
    render();
  }

  const ctx = {
    select,
    escapeHtml,
    labsApi,
    aiApi,
    state,
    currentLab,
    ensureModeForLab,
    confirmLeaveDirty,
    loadLabs,
    selectLab,
    startCreate,
    render,
    beginScriptDraft: (lab) => editor.beginScriptDraft(lab),
    renderRail: () => drawer.renderRail(),
  };
  const editor = createLabShellEditor(ctx);
  const io = createLabShellIo(ctx);
  ctx.io = io;
  const drawer = createLabShellDrawer(ctx);

  function renderTitleRow(lab) {
    const isDraft = state.mode === 'script' && state.draft;
    const hasPre = lab
      ? prestudySteps(lab).length > 0
      : !!(state.draft && state.draft.steps.some((s) => s.enablePredict));
    return htmlTitleRow({
      escapeHtml,
      title: state.draft?.isNew ? (state.draft.title || '新实验') : lab?.title || '',
      type: state.draft?.isNew ? (state.draft.type || '实验') : lab?.type || '实验',
      equation: isDraft ? state.draft.equation : lab?.equation,
      phenomena: isDraft ? state.draft.phenomena : lab?.phenomena,
      safety: isDraft ? state.draft.safety : lab?.safety,
      dirty: state.dirty,
      mode: state.mode,
      hasPre,
    });
  }

  function renderPrestudyBody(lab) {
    hydrateStepResults();
    const built = htmlPrestudyBody({
      escapeHtml,
      lab,
      stepIdx: state.stepIdx,
      stepResults: state.stepResults,
    });
    state.stepIdx = built.stepIdx;
    return built.html;
  }

  function handleAnswer(sIdx, optIdx) {
    const lab = currentLab();
    const step = prestudySteps(lab)[sIdx];
    if (!step?.predict || state.stepResults[sIdx] !== undefined) return;
    const res = { chosen: optIdx, correct: optIdx === step.predict.answer };
    state.stepResults[sIdx] = res;
    if (!state.progress[state.labId]) state.progress[state.labId] = {};
    state.progress[state.labId][sIdx] = res;
    saveProgress(state.progress);
    state.stepIdx = sIdx;
    render();
  }

  async function bindDetail(detail, lab) {
    detail.querySelectorAll('[data-lab-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        const next = btn.dataset.labMode;
        if (next === state.mode) return;
        if (state.mode === 'script' && state.dirty && next === 'prestudy') {
          if (!(await confirmLeaveDirty())) return;
          // 放弃未保存，从服务器副本重载 draft
          state.dirty = false;
        }
        state.mode = next;
        if (state.mode === 'script') {
          editor.beginScriptDraft(currentLab());
          state.dirty = false;
        } else {
          state.draft = null;
          state.stepIdx = 0;
          hydrateStepResults();
        }
        persistSession();
        render();
      });
    });

    if (state.mode === 'prestudy' && lab) {
      detail.querySelectorAll('[data-prestudy-opt]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          handleAnswer(Number(btn.dataset.prestudyStep), Number(btn.dataset.prestudyOpt));
        });
      });
      detail.querySelector('#btnPrestudyNext')?.addEventListener('click', async () => {
        if (state.stepIdx < prestudySteps(lab).length - 1) {
          state.stepIdx += 1;
          render();
        }
      });
      detail.querySelector('#btnPrestudyPrev')?.addEventListener('click', async () => {
        if (state.stepIdx > 0) {
          state.stepIdx -= 1;
          render();
        }
      });
      detail.querySelector('#btnPrestudyRestart')?.addEventListener('click', async () => {
        delete state.progress[state.labId];
        saveProgress(state.progress);
        state.stepResults = {};
        state.stepIdx = 0;
        render();
      });
    }

    if (state.mode === 'script') editor.bindScriptEditor(detail);
  }

  async function renderDetail() {
    const detail = select('#labDetail');
    if (!detail) return;

    if (!state.labs.length && !state.draft?.isNew) {
      detail.innerHTML = htmlEmptyLabs();
      detail.querySelector('#btnLabEmptyAdd')?.addEventListener('click', () => startCreate());
      detail.querySelector('#btnLabEmptyImport')?.addEventListener('click', () => io.pickImportFile());
      detail.querySelector('#btnLabEmptyReset')?.addEventListener('click', async () => {
        if (!(await appConfirm('恢复全部内置实验？'))) return;
        await labsApi.resetBuiltin();
        await loadLabs({ keepSelection: false });
      });
      return;
    }

    if (state.draft?.isNew && state.mode === 'script') {
      detail.innerHTML = `${renderTitleRow(null)}<div class="lab-detail-body">${editor.renderScriptBody()}</div>`;
      bindDetail(detail, null);
      return;
    }

    const lab = currentLab();
    if (!lab) {
      detail.innerHTML = '<div class="molar-empty">请选择左侧实验</div>';
      return;
    }
    ensureModeForLab(lab);
    if (state.mode === 'script' && !state.draft) editor.beginScriptDraft(lab);

    const body = state.mode === 'prestudy' ? renderPrestudyBody(lab) : editor.renderScriptBody();
    detail.innerHTML = `${renderTitleRow(lab)}<div class="lab-detail-body">${body}</div>`;
    bindDetail(detail, lab);
  }

  function render() {
    const layout = select('.lab-layout-drawer');
    if (layout) layout.classList.toggle('is-drawer-collapsed', state.drawerCollapsed);
    drawer.renderRail();
    renderDetail();
    persistSession();
  }

  async function renderShell() {
    io.bindGenLabModalOnce();
    // 每次从课堂进入实验探究：默认打开预习（未保存草稿除外）
    if (!state.draft?.isNew) state.mode = null;
    await loadLabs({ keepSelection: true });
  }

  return {
    render: renderShell,
    isDirty: () => !!state.dirty,
    confirmLeaveDirty,
    discardUnsaved: () => editor.discardUnsaved(),
    onDeactivate: () => io.hideGenLabModalQuietly(),
  };
}
