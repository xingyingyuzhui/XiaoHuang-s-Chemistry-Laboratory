/**
 * 配平脚本 UI — 布局与交互对齐实验探究
 * 左：列表抽屉（＋/编辑/收起）
 * 右：标题行（练习|脚本）+ 大公式练习 / 脚本编辑
 */

import {
  loadProgress,
  saveProgress,
  scriptToDraft,
  initCoefs,
} from './balance-model.js';
import { appConfirm } from '../app-dialog.js';
import { renderRail } from './balance-shell-drawer.js';
import { renderPractice, hideCoefKeypad } from './balance-shell-practice.js';
import { renderScriptEditor } from './balance-shell-editor.js';
import {
  handleAiTip,
  bindGenBalanceModalOnce,
  closeGenBalanceModal,
  startAiCreate,
} from './balance-shell-ai.js';

const DRAWER_KEY = 'balance-drawer-collapsed';

export function createBalanceShellController({ select, escapeHtml, balanceScriptsApi, aiApi }) {
  const ctx = {
    select,
    escapeHtml,
    balanceScriptsApi,
    aiApi,

    scripts: [],
    scriptId: null,
    mode: 'practice', // practice | script
    stepIdx: 0,
    coefs: { left: [], right: [] },
    stepResult: null,
    finished: false,
    progress: {},
    listEditMode: false,
    drawerCollapsed: localStorage.getItem(DRAWER_KEY) === '1',
    /** 左侧导入/导出状态文案（与实验探究 statusMsg 一致） */
    statusMsg: '',

    draft: null,
    selectedStep: 0,
    dirty: false,
    saving: false,
    /** 脚本页左侧步骤列表编辑态（与实验探究 stepEditMode 一致） */
    stepEditMode: false,

    /** 每步独立的 AI 提示缓存：scriptId -> { [stepIdx]: text } */
    aiTipsByScript: {},
    aiTipLoading: false,
    keypadOutsideHandler: null,
    keypadBound: false,
    keypadHideTimer: 0,
  };

  function currentScript() {
    return ctx.scripts.find((s) => s.id === ctx.scriptId) || null;
  }

  function persistProgress() {
    if (!ctx.scriptId) return;
    ctx.progress[ctx.scriptId] = { stepsDone: ctx.stepIdx, finished: ctx.finished };
    savePracticeState();
    saveProgress(ctx.progress);
  }

  /** 保存练习态到本地 */
  function savePracticeState() {
    if (!ctx.scriptId) return;
    const state = {
      stepsDone: ctx.stepIdx,
      finished: ctx.finished,
      stepResult: ctx.stepResult,
      coefs: JSON.stringify(ctx.coefs),
    };
    localStorage.setItem(`balance-script-practice-${ctx.scriptId}`, JSON.stringify(state));
  }

  /** 加载练习态 */
  function loadPracticeState() {
    if (!ctx.scriptId) return;
    const saved = localStorage.getItem(`balance-script-practice-${ctx.scriptId}`);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        ctx.stepIdx = state.stepsDone || 0;
        ctx.finished = state.finished || false;
        ctx.stepResult = state.stepResult || null;
        if (state.coefs) ctx.coefs = JSON.parse(state.coefs);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function setDrawerCollapsed(v) {
    ctx.drawerCollapsed = !!v;
    localStorage.setItem(DRAWER_KEY, ctx.drawerCollapsed ? '1' : '0');
    const layout = select('#balanceLayout') || select('.ai-section-balance .lab-layout-drawer');
    if (layout) layout.classList.toggle('is-drawer-collapsed', ctx.drawerCollapsed);
    const btn = select('#btnBalanceDrawerToggle');
    if (btn) {
      btn.textContent = ctx.drawerCollapsed ? '»' : '«';
      btn.title = ctx.drawerCollapsed ? '展开脚本列表' : '收起脚本列表';
    }
  }

  function resetPractice() {
    const script = currentScript();
    if (script) ctx.coefs = initCoefs(script.species);
    ctx.stepIdx = 0;
    ctx.stepResult = null;
    ctx.finished = false;
    ctx.aiTipLoading = false;
    if (ctx.scriptId) {
      ctx.progress[ctx.scriptId] = { stepsDone: 0, finished: false };
      saveProgress(ctx.progress);
      try {
        localStorage.removeItem(`balance-script-practice-${ctx.scriptId}`);
      } catch {
        /* ignore */
      }
    }
  }

  /** 选中脚本后：恢复练习进度，并钳制 stepIdx / coefs 合法性 */
  function restoreOrResetPractice() {
    const script = currentScript();
    if (!script) {
      resetPractice();
      return;
    }
    loadPracticeState();
    const n = script.steps?.length || 0;
    if (n <= 0) {
      ctx.stepIdx = 0;
    } else if (ctx.stepIdx >= n) {
      ctx.stepIdx = n - 1;
    } else if (ctx.stepIdx < 0) {
      ctx.stepIdx = 0;
    }
    const init = initCoefs(script.species);
    ctx.coefs = {
      left: init.left.map((c, i) => {
        const v = Number(ctx.coefs?.left?.[i]);
        return Number.isFinite(v) && v >= 1 ? Math.min(12, Math.round(v)) : c;
      }),
      right: init.right.map((c, i) => {
        const v = Number(ctx.coefs?.right?.[i]);
        return Number.isFinite(v) && v >= 1 ? Math.min(12, Math.round(v)) : c;
      }),
    };
  }

  function currentAiTip() {
    if (!ctx.scriptId) return '';
    return ctx.aiTipsByScript[ctx.scriptId]?.[ctx.stepIdx] || '';
  }

  async function selectScript(id) {
    if (ctx.mode === 'script' && ctx.dirty) {
      if (!(await appConfirm('脚本有未保存的修改，确定切换？'))) return;
    }
    ctx.scriptId = id;
    ctx.dirty = false;
    ctx.draft = null;
    ctx.stepEditMode = false;
    ctx.aiTipLoading = false;
    restoreOrResetPractice();
    if (ctx.mode === 'script') {
      ctx.draft = scriptToDraft(currentScript());
      ctx.selectedStep = 0;
    }
    render();
  }

  async function confirmLeaveDirty() {
    if (ctx.mode === 'script' && ctx.dirty) {
      return appConfirm('脚本有未保存的修改，确定离开？', {
        title: '未保存修改',
        okText: '放弃修改',
        danger: true,
      });
    }
    return true;
  }

  async function bindModeTabs(root) {
    root.querySelectorAll('[data-balance-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = btn.dataset.balanceMode;
        if (next === ctx.mode) return;
        if (ctx.mode === 'script' && ctx.dirty) {
          if (!(await appConfirm('脚本有未保存的修改，确定切换？'))) return;
          ctx.dirty = false;
        }
        ctx.mode = next;
        ctx.stepEditMode = false;
        if (ctx.mode === 'script') {
          ctx.draft = scriptToDraft(currentScript());
          ctx.selectedStep = 0;
        } else {
          ctx.draft = null;
        }
        render();
      });
    });
  }

  async function loadScripts({ keepSelection = false } = {}) {
    try {
      const data = await balanceScriptsApi.list();
      ctx.scripts = data?.scripts || [];
      if (!keepSelection) {
        ctx.scriptId = ctx.scripts[0]?.id || null;
        resetPractice();
      } else if (ctx.scriptId && !ctx.scripts.find((s) => s.id === ctx.scriptId)) {
        ctx.scriptId = ctx.scripts[0]?.id || null;
        resetPractice();
      } else if (ctx.scriptId) {
        // 刷新当前练习系数对应 species
        const s = currentScript();
        if (s && ctx.mode === 'practice' && !ctx.finished) {
          // 保留 coefs 长度对齐
          const next = initCoefs(s.species);
          ctx.coefs = {
            left: next.left.map((c, i) => ctx.coefs.left?.[i] ?? c),
            right: next.right.map((c, i) => ctx.coefs.right?.[i] ?? c),
          };
        }
      }
    } catch (err) {
      console.error('加载配平脚本失败:', err);
      ctx.scripts = [];
    }
  }

  function render() {
    hideCoefKeypad(ctx);
    const layout = select('#balanceLayout') || select('.ai-section-balance .lab-layout-drawer');
    if (layout) layout.classList.toggle('is-drawer-collapsed', ctx.drawerCollapsed);
    renderRail(ctx);
    if (ctx.mode === 'practice') renderPractice(ctx);
    else renderScriptEditor(ctx);
  }

  async function init() {
    ctx.progress = loadProgress();
    bindGenBalanceModalOnce(ctx);
    await loadScripts();
    render();
  }

  /** 是否有未保存脚本修改（离开课堂分区时拦截） */
  function isDirty() {
    return !!ctx.dirty;
  }

  /** 用户确认放弃后：丢掉草稿态，回到已保存脚本或空 */
  function discardUnsaved() {
    ctx.dirty = false;
    ctx.stepEditMode = false;
    ctx.saving = false;
    hideCoefKeypad(ctx);
    if (ctx.scriptId && ctx.scripts.find((s) => s.id === ctx.scriptId)) {
      ctx.draft = scriptToDraft(currentScript());
    } else {
      ctx.draft = null;
      ctx.scriptId = ctx.scripts[0]?.id || null;
    }
    if (ctx.mode === 'script' && !ctx.draft) {
      ctx.mode = 'practice';
    }
  }

  function onDeactivate() {
    hideCoefKeypad(ctx);
    closeGenBalanceModal(ctx);
  }

  Object.assign(ctx, {
    currentScript,
    persistProgress,
    setDrawerCollapsed,
    resetPractice,
    currentAiTip,
    selectScript,
    confirmLeaveDirty,
    bindModeTabs,
    loadScripts,
    render,
    renderPractice: () => renderPractice(ctx),
    handleAiTip: (script) => handleAiTip(ctx, script),
    startAiCreate: () => startAiCreate(ctx),
  });

  return {
    init,
    render: () => {
      render();
    },
    isDirty,
    confirmLeaveDirty,
    discardUnsaved,
    onDeactivate,
  };
}
