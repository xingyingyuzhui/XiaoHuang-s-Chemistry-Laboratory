/**
 * 配平脚本 UI — 布局与交互对齐实验探究
 * 左：列表抽屉（＋/编辑/收起）
 * 右：标题行（练习|脚本）+ 大公式练习 / 脚本编辑
 */

import {
  loadProgress,
  saveProgress,
  scriptToDraft,
  draftToPayload,
  initCoefs,
  emptyStep,
  isPracticeFinished,
  buildEquation,
  buildPracticeStepsFromEquations,
  formatBalanceImportSummary,
  downloadJsonFile,
} from './balance-model.js';
import { bindChemKeypad, mountChemKeypads } from '../chem-keypad.js';
import { appAlert, appConfirm } from '../app-dialog.js';
import {
  htmlEmptyScripts,
  htmlPracticeBody,
  htmlScriptEditor,
  htmlCoefKeypadBubbleInner,
  renderSpeciesEquation,
  sanitizePracticeTip,
} from './balance-views.js';

const DRAWER_KEY = 'balance-drawer-collapsed';
const KEYPAD_BUBBLE_ID = 'balanceCoefKeypadBubble';

export function createBalanceShellController({ select, escapeHtml, balanceScriptsApi, aiApi }) {
  let scripts = [];
  let scriptId = null;
  let mode = 'practice'; // practice | script
  let stepIdx = 0;
  let coefs = { left: [], right: [] };
  let stepResult = null;
  let finished = false;
  let progress = {};
  let listEditMode = false;
  let drawerCollapsed = localStorage.getItem(DRAWER_KEY) === '1';
  /** 左侧导入/导出状态文案（与实验探究 statusMsg 一致） */
  let statusMsg = '';

  let draft = null;
  let selectedStep = 0;
  let dirty = false;
  let saving = false;
  /** 脚本页左侧步骤列表编辑态（与实验探究 stepEditMode 一致） */
  let stepEditMode = false;

  /** 每步独立的 AI 提示缓存：scriptId -> { [stepIdx]: text } */
  let aiTipsByScript = {};
  let aiTipLoading = false;
  let keypadOutsideHandler = null;
  let keypadBound = false;
  let keypadHideTimer = 0;

  function currentScript() {
    return scripts.find((s) => s.id === scriptId) || null;
  }

  function persistProgress() {
    if (!scriptId) return;
    progress[scriptId] = { stepsDone: stepIdx, finished };
    savePracticeState();
    saveProgress(progress);
  }

  /** 保存练习态到本地 */
  function savePracticeState() {
    if (!scriptId) return;
    const state = {
      stepsDone: stepIdx,
      finished,
      stepResult,
      coefs: JSON.stringify(coefs),
    };
    localStorage.setItem(`balance-script-practice-${scriptId}`, JSON.stringify(state));
  }

  /** 加载练习态 */
  function loadPracticeState() {
    if (!scriptId) return;
    const saved = localStorage.getItem(`balance-script-practice-${scriptId}`);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        stepIdx = state.stepsDone || 0;
        finished = state.finished || false;
        stepResult = state.stepResult || null;
        if (state.coefs) coefs = JSON.parse(state.coefs);
      } catch (e) {
        /* ignore */
      }
    }
  }

  function setDrawerCollapsed(v) {
    drawerCollapsed = !!v;
    localStorage.setItem(DRAWER_KEY, drawerCollapsed ? '1' : '0');
    const layout = select('#balanceLayout') || select('.ai-section-balance .lab-layout-drawer');
    if (layout) layout.classList.toggle('is-drawer-collapsed', drawerCollapsed);
    const btn = select('#btnBalanceDrawerToggle');
    if (btn) {
      btn.textContent = drawerCollapsed ? '»' : '«';
      btn.title = drawerCollapsed ? '展开脚本列表' : '收起脚本列表';
    }
  }

  function resetPractice() {
    const script = currentScript();
    if (script) coefs = initCoefs(script.species);
    stepIdx = 0;
    stepResult = null;
    finished = false;
    aiTipLoading = false;
    if (scriptId) {
      progress[scriptId] = { stepsDone: 0, finished: false };
      saveProgress(progress);
      try {
        localStorage.removeItem(`balance-script-practice-${scriptId}`);
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
      stepIdx = 0;
    } else if (stepIdx >= n) {
      stepIdx = n - 1;
    } else if (stepIdx < 0) {
      stepIdx = 0;
    }
    const init = initCoefs(script.species);
    coefs = {
      left: init.left.map((c, i) => {
        const v = Number(coefs?.left?.[i]);
        return Number.isFinite(v) && v >= 1 ? Math.min(12, Math.round(v)) : c;
      }),
      right: init.right.map((c, i) => {
        const v = Number(coefs?.right?.[i]);
        return Number.isFinite(v) && v >= 1 ? Math.min(12, Math.round(v)) : c;
      }),
    };
  }

  function currentAiTip() {
    if (!scriptId) return '';
    return aiTipsByScript[scriptId]?.[stepIdx] || '';
  }

  function setCurrentAiTip(text) {
    if (!scriptId) return;
    if (!aiTipsByScript[scriptId]) aiTipsByScript[scriptId] = {};
    aiTipsByScript[scriptId][stepIdx] = text;
  }

  function unbindKeypadOutside() {
    if (keypadOutsideHandler) {
      document.removeEventListener('pointerdown', keypadOutsideHandler, true);
      keypadOutsideHandler = null;
    }
  }

  /** 与 brand-tip 相同：挂到 body 的气泡，避免被练习区 overflow 裁切 */
  function ensureCoefKeypadBubble() {
    let el = document.getElementById(KEYPAD_BUBBLE_ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = KEYPAD_BUBBLE_ID;
    el.className = 'brand-tip-bubble balance-coef-keypad-bubble';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', '输入系数');
    el.hidden = true;
    el.innerHTML = htmlCoefKeypadBubbleInner();
    document.body.appendChild(el);

    el.querySelectorAll('[data-coef-keypad-dismiss]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        hideCoefKeypad();
      });
    });
    return el;
  }

  function positionCoefKeypad(anchor) {
    const el = ensureCoefKeypadBubble();
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const gap = 14;
    const maxW = Math.min(280, window.innerWidth - 24);

    el.style.width = `${maxW}px`;
    el.style.maxWidth = `${maxW}px`;
    el.style.left = '0px';
    el.style.top = '0px';
    el.hidden = false;

    void el.offsetWidth;
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;

    let left = rect.left;
    let top = rect.bottom + gap;
    let placeAbove = false;

    if (left + bw > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - 12 - bw);
    }
    if (top + bh > window.innerHeight - 12 && rect.top - gap - bh > 12) {
      top = rect.top - gap - bh;
      placeAbove = true;
    }
    if (top < 12) top = 12;

    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.dataset.place = placeAbove ? 'above' : 'below';

    const tipX = Math.min(Math.max(rect.left + rect.width / 2 - left, 28), bw - 28);
    el.style.setProperty('--tip-x', `${Math.round(tipX)}px`);
  }

  function hideCoefKeypad() {
    unbindKeypadOutside();
    const el = document.getElementById(KEYPAD_BUBBLE_ID);
    if (!el) return;
    el.classList.remove('is-visible');
    if (keypadHideTimer) window.clearTimeout(keypadHideTimer);
    keypadHideTimer = window.setTimeout(() => {
      if (!el.classList.contains('is-visible')) el.hidden = true;
      keypadHideTimer = 0;
    }, 200);
  }

  function showCoefKeypad() {
    const input = select('#balanceCoefInput');
    if (!input) return;
    const el = ensureCoefKeypadBubble();
    if (keypadHideTimer) {
      window.clearTimeout(keypadHideTimer);
      keypadHideTimer = 0;
    }
    positionCoefKeypad(input);
    // 强制重排后再加 is-visible，触发与课间一句话相同的入场动效
    void el.offsetWidth;
    el.classList.add('is-visible');

    unbindKeypadOutside();
    keypadOutsideHandler = (e) => {
      const bubble = document.getElementById(KEYPAD_BUBBLE_ID);
      const coefInput = select('#balanceCoefInput');
      const t = e.target;
      if (bubble?.contains(t) || t === coefInput) return;
      hideCoefKeypad();
    };
    requestAnimationFrame(() => {
      document.addEventListener('pointerdown', keypadOutsideHandler, true);
    });
  }

  async function selectScript(id) {
    if (mode === 'script' && dirty) {
      if (!(await appConfirm('脚本有未保存的修改，确定切换？'))) return;
    }
    scriptId = id;
    dirty = false;
    draft = null;
    stepEditMode = false;
    aiTipLoading = false;
    restoreOrResetPractice();
    if (mode === 'script') {
      draft = scriptToDraft(currentScript());
      selectedStep = 0;
    }
    render();
  }

  // ── 左侧抽屉 ──

  async function renderRail() {
    const rail = select('#balanceNavRail');
    if (!rail) return;

    rail.innerHTML = `
      <div class="lab-nav-rail-head">
        <strong class="lab-nav-brand">分步配平</strong>
        <button type="button" class="lab-drawer-toggle" id="btnBalanceDrawerToggle"
          title="${drawerCollapsed ? '展开' : '收起'}">${drawerCollapsed ? '»' : '«'}</button>
      </div>
      <div class="lab-nav-toolbar">
        <button type="button" class="lab-tool-btn lab-tool-add" id="btnBalanceAdd" title="新建脚本">＋</button>
        <button type="button" class="lab-tool-btn lab-tool-edit${listEditMode ? ' is-active' : ''}" id="btnBalanceListEdit">${listEditMode ? '保存' : '编辑'}</button>
        <button type="button" class="lab-tool-btn" id="btnBalanceExport" title="导出全部配平脚本为 JSON">导出</button>
        <button type="button" class="lab-tool-btn" id="btnBalanceImport" title="导入配平包（不覆盖已有）">导入</button>
      </div>
      <button type="button" class="lab-tool-btn lab-tool-ai" id="btnBalanceAiGen" title="用 AI 生成配平脚本草稿">AI 生成</button>
      <nav id="balanceNavList" class="lab-nav-list${listEditMode ? ' is-edit-mode' : ''}" role="list" aria-label="配平脚本列表"></nav>
      ${statusMsg ? `<p class="lab-nav-status">${escapeHtml(statusMsg)}</p>` : ''}`;

    select('#btnBalanceDrawerToggle')?.addEventListener('click', async () => {
      setDrawerCollapsed(!drawerCollapsed);
    });
    select('#btnBalanceAdd')?.addEventListener('click', async () => {
      if (listEditMode) listEditMode = false;
      startCreate();
    });
    select('#btnBalanceListEdit')?.addEventListener('click', async () => {
      // 与实验探究相同：点「保存」仅退出编辑态（排序已在拖拽时写入）
      listEditMode = !listEditMode;
      render();
    });
    select('#btnBalanceExport')?.addEventListener('click', async () => {
      if (listEditMode) listEditMode = false;
      exportBalancePack();
    });
    select('#btnBalanceImport')?.addEventListener('click', async () => {
      if (listEditMode) listEditMode = false;
      pickImportFile();
    });
    select('#btnBalanceAiGen')?.addEventListener('click', async () => {
      if (listEditMode) listEditMode = false;
      startAiCreate();
    });

    const nav = select('#balanceNavList');
    if (!nav) return;

    if (!scripts.length && !draft?.isNew) {
      nav.innerHTML = htmlEmptyScripts();
    } else {
      nav.innerHTML = scripts.map((s) => {
        const p = progress[s.id] || {};
        const total = s.steps?.length || 0;
        const done = Math.min(Number(p.stepsDone) || 0, total);
        const allDone = p.finished || (total > 0 && done >= total);
        let progressHtml = '';
        if (total > 0) {
          progressHtml = `<span class="lab-nav-progress${allDone ? ' is-done' : ''}">${p.finished ? '✓' : `${done}/${total}`}</span>`;
        }
        const active = s.id === scriptId && !draft?.isNew;
        const type = s.difficulty || s.grade || '配平';
        return `<div class="lab-nav-card${active ? ' is-active' : ''}${listEditMode ? ' is-editing' : ''}" data-script-id="${escapeHtml(s.id)}" draggable="${listEditMode ? 'true' : 'false'}">
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

    if (draft?.isNew) {
      const draftTitle = (draft.title || '').trim() || '新脚本（未保存）';
      nav.insertAdjacentHTML(
        'afterbegin',
        `<div class="lab-nav-card is-active is-draft${listEditMode ? ' is-editing' : ''}" data-script-draft="1">
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

    nav.querySelectorAll('[data-script-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (listEditMode) return;
        selectScript(btn.dataset.scriptPick);
      });
    });
    nav.querySelectorAll('[data-script-draft-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (listEditMode) return;
        mode = 'script';
        render();
      });
    });
    nav.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!listEditMode) return;
        const id = btn.dataset.del;
        if (!id || !(await appConfirm('确定删除该配平脚本？', { title: '删除脚本', okText: '删除', danger: true }))) return;
        try {
          const wasCurrent = scriptId === id;
          await balanceScriptsApi.remove(id);
          if (wasCurrent) {
            scriptId = null;
            draft = null;
            dirty = false;
          }
          await loadScripts({ keepSelection: !wasCurrent });
          if (wasCurrent) {
            scriptId = scripts[0]?.id || null;
            mode = 'practice';
            resetPractice();
          }
          render();
        } catch (err) {
          await appAlert(err.message || '删除失败');
        }
      });
    });
    nav.querySelectorAll('[data-del-draft]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!listEditMode) return;
        if (!(await appConfirm('丢弃未保存脚本？'))) return;
        draft = null;
        dirty = false;
        scriptId = scripts[0]?.id || null;
        mode = 'practice';
        resetPractice();
        render();
      });
    });

    // 编辑态：拖拽排序（对齐实验探究列表）
    if (listEditMode) {
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
          const ids = scripts.map((s) => s.id);
          const from = ids.indexOf(dragId);
          const to = ids.indexOf(targetId);
          if (from < 0 || to < 0) return;
          ids.splice(from, 1);
          ids.splice(to, 0, dragId);
          try {
            const data = await balanceScriptsApi.reorder(ids);
            scripts = data?.scripts || scripts;
            render();
          } catch (err) {
            await appAlert(`排序失败：${err.message || ''}`);
          }
        });
      });
    }

    setDrawerCollapsed(drawerCollapsed);
  }

  async function startCreate() {
    if (mode === 'script' && dirty && !(await appConfirm('放弃未保存修改？', { title: '未保存修改', okText: '放弃', danger: true }))) return;
    mode = 'script';
    scriptId = null;
    draft = scriptToDraft(null);
    selectedStep = 0;
    dirty = true;
    listEditMode = false;
    stepEditMode = false;
    render();
  }

  async function exportBalancePack() {
    if (!balanceScriptsApi?.exportPack) {
      await appAlert('配平包导出不可用');
      return;
    }
    try {
      const data = await balanceScriptsApi.exportPack();
      downloadJsonFile(`配平脚本包-${new Date().toISOString().slice(0, 10)}.json`, data);
      statusMsg = '已导出配平脚本包';
      renderRail();
    } catch (err) {
      await appAlert(`导出失败：${err.message || ''}`);
    }
  }

  function pickImportFile() {
    let input = select('#balancePackImportInput');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.id = 'balancePackImportInput';
      input.hidden = true;
      document.body.appendChild(input);
      input.addEventListener('change', onImportFile);
    }
    input.value = '';
    input.click();
  }

  async function onImportFile(e) {
    const file = e.target?.files?.[0];
    if (!file) return;
    if (!(await confirmLeaveDirty())) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await balanceScriptsApi.importPack(data);
      const summary = formatBalanceImportSummary(result);
      statusMsg = summary.split('\n')[0];
      dirty = false;
      draft = null;
      await loadScripts({ keepSelection: false });
      render();
      await appAlert(summary, { title: '导入完成' });
    } catch (err) {
      await appAlert(`导入失败：${err.message || ''}`, { title: '导入失败' });
    }
  }

  // ── 练习 ──

  async function bindModeTabs(root) {
    root.querySelectorAll('[data-balance-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const next = btn.dataset.balanceMode;
        if (next === mode) return;
        if (mode === 'script' && dirty) {
          if (!(await appConfirm('脚本有未保存的修改，确定切换？'))) return;
          dirty = false;
        }
        mode = next;
        stepEditMode = false;
        if (mode === 'script') {
          draft = scriptToDraft(currentScript());
          selectedStep = 0;
        } else {
          draft = null;
        }
        render();
      });
    });
  }

  function renderPractice() {
    hideCoefKeypad();
    const body = select('#balanceDetail');
    if (!body) return;
    const script = currentScript();
    const totalSteps = script?.steps?.length || 0;
    const isLastStep = stepIdx >= Math.max(0, totalSteps - 1);
    body.innerHTML = htmlPracticeBody(script, stepIdx, coefs, stepResult, isLastStep, finished, totalSteps, {
      aiTipText: currentAiTip(),
      aiTipLoading,
    });
    bindModeTabs(body);
    bindCoefKeypadAndLivePreview(script);

    select('#btnBalanceCheckCoef')?.addEventListener('click', async () => {
      hideCoefKeypad();
      handleCheckCoef();
    });
    select('#btnBalanceAiTip')?.addEventListener('click', async () => {
      hideCoefKeypad();
      handleAiTip(script);
    });
    select('#btnBalanceNext')?.addEventListener('click', handleNext);
    select('#btnBalancePrev')?.addEventListener('click', async () => {
      if (stepIdx > 0) {
        stepIdx -= 1;
        stepResult = null;
        persistProgress();
        renderPractice();
      }
    });
    select('#btnBalanceCheckAll')?.addEventListener('click', handleCheckAll);
    select('#btnBalanceRestart')?.addEventListener('click', async () => {
      resetPractice();
      renderPractice();
    });
  }

  /** 系数框：课间一句话风格气泡键盘 + 实时刷新上方化学式 */
  function bindCoefKeypadAndLivePreview(script) {
    const input = select('#balanceCoefInput');
    if (!input) return;

    const applyLive = () => {
      const step = script?.steps?.[stepIdx];
      if (!step?.focus) return;
      let val = Math.round(Number(input.value));
      if (!Number.isFinite(val) || val < 1) val = 1;
      if (val > 12) val = 12;
      const { side, index: idx } = step.focus;
      if (!coefs[side]) coefs[side] = [];
      coefs[side][idx] = val;
      const hero = select('#balanceEquationHero');
      if (hero) {
        hero.innerHTML = renderSpeciesEquation(script.species, coefs, step.focus, finished);
      }
    };

    input.addEventListener('focus', showCoefKeypad);
    input.addEventListener('click', showCoefKeypad);

    // 数字键只绑一次（气泡挂在 body 上，不随练习区重绘销毁）
    if (!keypadBound) {
      const bubble = ensureCoefKeypadBubble();
      bubble.querySelectorAll('[data-coef-key]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const coefInput = select('#balanceCoefInput');
          if (!coefInput) return;
          const k = btn.dataset.coefKey;
          let v = String(coefInput.value || '');
          if (k === '清空') v = '';
          else if (k === '⌫') v = v.slice(0, -1);
          else if (/^\d$/.test(k)) {
            if (v === '0' || (v === '1' && coefInput.dataset.replaceOnce === '1')) v = k;
            else if (v.length < 2) v = (v === '0' ? '' : v) + k;
          }
          if (/^\d$/.test(k)) coefInput.dataset.replaceOnce = '0';
          let num = Math.round(Number(v));
          if (v === '') {
            coefInput.value = '';
          } else {
            if (!Number.isFinite(num) || num < 1) num = 1;
            if (num > 12) num = 12;
            coefInput.value = String(num);
          }
          // 用当前脚本刷新公式（闭包可能过期，从 DOM/状态取最新）
          const s = currentScript();
          const step = s?.steps?.[stepIdx];
          if (step?.focus && s) {
            let val = Math.round(Number(coefInput.value));
            if (!Number.isFinite(val) || val < 1) val = 1;
            if (val > 12) val = 12;
            const { side, index: idx } = step.focus;
            if (!coefs[side]) coefs[side] = [];
            coefs[side][idx] = val;
            const hero = select('#balanceEquationHero');
            if (hero) {
              hero.innerHTML = renderSpeciesEquation(s.species, coefs, step.focus, finished);
            }
          }
        });
      });
      keypadBound = true;
    }

    input.dataset.replaceOnce = '1';
    applyLive();
  }

  function handleCheckCoef() {
    const script = currentScript();
    if (!script || !script.steps?.[stepIdx]) return;
    const step = script.steps[stepIdx];
    if (step.action !== 'set_coef' || !step.focus) return;
    const input = select('#balanceCoefInput');
    if (!input) return;
    const val = Math.round(Number(input.value));
    if (!Number.isFinite(val) || val < 1) {
      stepResult = 'wrong';
      renderPractice();
      return;
    }
    const { side, index: idx } = step.focus;
    if (!coefs[side]) coefs[side] = [];
    coefs[side][idx] = val;
    // 先刷新公式再判定
    const hero = select('#balanceEquationHero');
    if (hero) {
      hero.innerHTML = renderSpeciesEquation(script.species, coefs, step.focus, finished);
    }
    if (step.expectedCoef != null) {
      stepResult = val === step.expectedCoef ? 'correct' : 'wrong';
    } else {
      stepResult = 'correct';
    }
    renderPractice();
  }

  /**
   * 按「当前步骤」请求 AI 提示（非整式通用讲解）。
   * 结果写入该步缓存，显示在「AI 提示」按钮右侧独立框。
   */
  async function handleAiTip(script) {
    if (!script) return;
    // 捕获请求发起时的脚本/步号，避免切步后写错缓存
    const reqScriptId = scriptId;
    const reqStepIdx = stepIdx;
    const step = script.steps?.[reqStepIdx];
    if (!step) return;

    const isStale = () => scriptId !== reqScriptId || stepIdx !== reqStepIdx;

    aiTipLoading = true;
    renderPractice();

    try {
      if (!aiApi?.balance) {
        throw new Error('AI 接口不可用，请检查设置中的 API Key');
      }

      const focusFormula = step.focus
        ? script.species?.[step.focus.side]?.[step.focus.index]?.formula || ''
        : '';
      const currentEq = buildEquation(script.species, coefs);
      const stepGuide = sanitizePracticeTip(step.tip, step.expectedCoef);

      const data = await aiApi.balance({
        equation: script.startEquation || currentEq,
        mode: 'step_tip',
        step: {
          index: reqStepIdx,
          total: script.steps?.length || 1,
          label: step.label || `第 ${reqStepIdx + 1} 步`,
          action: step.action || 'explain',
          guide: stepGuide,
          focusSide: step.focus?.side || null,
          focusIndex: step.focus?.index ?? null,
          focusFormula,
          currentEquation: currentEq,
        },
      });

      if (isStale()) return;

      let tip = '';
      if (data?.tip) {
        tip = String(data.tip).trim();
      } else if (Array.isArray(data?.steps) && data.steps.length) {
        const pick = data.steps[Math.min(reqStepIdx, data.steps.length - 1)];
        tip = String(pick || '').trim();
      }

      tip = sanitizePracticeTip(tip, step.expectedCoef);
      if (step.expectedCoef != null) {
        const n = Number(step.expectedCoef);
        if (Number.isFinite(n)) {
          tip = tip.replace(new RegExp(`(?<![\\d.])${n}(?![\\d.])`, 'g'), '？');
        }
      }
      tip = tip.replace(/\d+\s*[A-Za-z0-9()+\[\]]+\s*(→|=)\s*.+/g, '（请自行写出完整式）');

      if (!tip) {
        tip = localStepFallbackTip(step, focusFormula);
      }
      // 写入请求步，不依赖可能已变的 stepIdx
      if (reqScriptId) {
        if (!aiTipsByScript[reqScriptId]) aiTipsByScript[reqScriptId] = {};
        aiTipsByScript[reqScriptId][reqStepIdx] = tip;
      }
    } catch (err) {
      if (isStale()) return;
      const focusFormula = step.focus
        ? script.species?.[step.focus.side]?.[step.focus.index]?.formula || ''
        : '';
      const tip = err.message
        ? `${err.message}。本步提示：${localStepFallbackTip(step, focusFormula)}`
        : localStepFallbackTip(step, focusFormula);
      if (reqScriptId) {
        if (!aiTipsByScript[reqScriptId]) aiTipsByScript[reqScriptId] = {};
        aiTipsByScript[reqScriptId][reqStepIdx] = tip;
      }
    } finally {
      if (!isStale()) {
        aiTipLoading = false;
        renderPractice();
      } else if (scriptId === reqScriptId) {
        // 同脚本仅切步：清 loading 若当前仍在 loading 态
        aiTipLoading = false;
      }
    }
  }

  function localStepFallbackTip(step, focusFormula) {
    const guide = sanitizePracticeTip(step?.tip, step?.expectedCoef);
    if (guide && guide.length > 8) return guide;
    if (step?.action === 'set_coef' && focusFormula) {
      return `本步只改 ${focusFormula} 的系数：先数清相关元素左右原子数，再试最小正整数，不要一次改太多。`;
    }
    if (step?.action === 'check') {
      return '本步做检查：逐元素核对左右原子数是否相等，找出仍不相等的元素。';
    }
    return `围绕「${step?.label || '本步'}」思考：先看这一步要解决哪个元素的不平衡。`;
  }

  async function confirmLeaveDirty() {
    if (mode === 'script' && dirty) {
      return appConfirm('脚本有未保存的修改，确定离开？', {
        title: '未保存修改',
        okText: '放弃修改',
        danger: true,
      });
    }
    return true;
  }

  async function openGenBalanceModal() {
    if (!(await confirmLeaveDirty())) return;
    if (!aiApi?.balance) {
      await appAlert('AI 接口不可用，请在设置中配置 API Key');
      return;
    }
    const backdrop = select('#genBalanceBackdrop');
    const modal = select('#genBalanceModal');
    const promptEl = select('#genBalancePrompt');
    const statusEl = select('#genBalanceStatus');
    const submitBtn = select('#btnGenBalanceSubmit');
    if (promptEl) promptEl.value = '';
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.classList.remove('is-ok', 'is-err');
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '生成草稿';
    }
    // 弹窗内方程式：内联化学符号键盘（与脚本编辑页相同）
    const field = select('#genBalanceEqField');
    if (field && promptEl && !field.querySelector('.chem-keypad')) {
      mountChemKeypads(field, '#genBalancePrompt');
    }
    backdrop?.classList.add('is-open');
    modal?.classList.add('is-open');
    backdrop?.setAttribute('aria-hidden', 'false');
    modal?.setAttribute('aria-hidden', 'false');
    promptEl?.focus();
  }

  function closeGenBalanceModal() {
    const backdrop = select('#genBalanceBackdrop');
    const modal = select('#genBalanceModal');
    const submitBtn = select('#btnGenBalanceSubmit');
    backdrop?.classList.remove('is-open');
    modal?.classList.remove('is-open');
    backdrop?.setAttribute('aria-hidden', 'true');
    modal?.setAttribute('aria-hidden', 'true');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '生成草稿';
    }
  }

  function bindGenBalanceModalOnce() {
    const root = select('#genBalanceModal');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    select('#btnGenBalanceClose')?.addEventListener('click', () => closeGenBalanceModal());
    select('#btnGenBalanceCancel')?.addEventListener('click', () => closeGenBalanceModal());
    select('#genBalanceBackdrop')?.addEventListener('click', () => closeGenBalanceModal());
    select('#btnGenBalanceSubmit')?.addEventListener('click', () => handleGenBalanceSubmit());
  }

  function startAiCreate() {
    bindGenBalanceModalOnce();
    openGenBalanceModal();
  }

  /** AI 生成配平脚本草稿 → 弹窗进度 → 进入脚本页确认保存 */
  async function handleGenBalanceSubmit() {
    const promptEl = select('#genBalancePrompt');
    const statusEl = select('#genBalanceStatus');
    const submitBtn = select('#btnGenBalanceSubmit');
    const eq = String(promptEl?.value || '').trim();
    if (!eq) {
      if (statusEl) {
        statusEl.textContent = '请填写未配平方程式';
        statusEl.classList.add('is-err');
        statusEl.classList.remove('is-ok');
      }
      return;
    }

    listEditMode = false;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = '生成中…';
    }
    if (statusEl) {
      statusEl.textContent = '正在调用 AI 生成配平脚本，请稍候…';
      statusEl.classList.remove('is-ok', 'is-err');
    }

    try {
      if (!aiApi?.balance) throw new Error('AI 接口不可用，请在设置中配置 API Key');
      const data = await aiApi.balance({ equation: eq });
      const target = data?.equation || '';
      if (!target) throw new Error('模型未返回配平式');
      const guideSteps = Array.isArray(data?.steps) ? data.steps : [];

      mode = 'script';
      scriptId = null;
      stepEditMode = false;
      draft = scriptToDraft(null);
      draft.title = `AI 草稿：${eq.slice(0, 24)}`;
      draft.startEquation = eq.replace(/→/g, '=').replace(/\s+/g, ' ').trim();
      draft.targetEquation = String(target).replace(/→/g, '=').replace(/\s+/g, ' ').trim();
      draft.difficulty = 'AI';
      // 根据目标式系数生成 set_coef 练习步（并保留最多 3 条 AI 思路）
      draft.steps = buildPracticeStepsFromEquations(
        draft.startEquation,
        draft.targetEquation,
        guideSteps,
      );
      dirty = true;
      selectedStep = 0;

      if (statusEl) {
        statusEl.textContent = '生成成功！即将打开脚本页，请检查后保存。';
        statusEl.classList.add('is-ok');
        statusEl.classList.remove('is-err');
      }
      window.setTimeout(() => {
        closeGenBalanceModal();
        render();
      }, 480);
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = err.message || String(err);
        statusEl.classList.add('is-err');
        statusEl.classList.remove('is-ok');
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = '生成草稿';
      }
    }
  }

  function handleNext() {
    const step = currentScript()?.steps?.[stepIdx];
    // set_coef：须点「确认系数」且正确后才能下一步（禁止跳过校验）
    if (step?.action === 'set_coef' && stepResult !== 'correct') {
      return;
    }
    const script = currentScript();
    if (!script) return;
    if (stepIdx < script.steps.length - 1) {
      stepIdx += 1;
      stepResult = null;
      persistProgress();
      renderPractice();
    }
  }

  function handleCheckAll() {
    const script = currentScript();
    if (!script) return;
    if (isPracticeFinished(script.species, coefs, script.targetEquation)) {
      finished = true;
      stepResult = null;
      persistProgress();
    } else {
      stepResult = 'wrong';
      finished = false;
    }
    renderPractice();
  }

  // ── 脚本编辑 ──

  function renderScriptEditor() {
    const body = select('#balanceDetail');
    if (!body) return;
    body.innerHTML = htmlScriptEditor(draft, selectedStep, 'script', {
      stepEditMode,
      dirty,
      saving,
    });
    bindModeTabs(body);
    bindEditorEvents(body);
  }

  async function bindEditorEvents(detail) {
    const root = detail || select('#balanceDetail');
    if (!root || !draft) return;

    const onField = (id, fn) => {
      const el = root.querySelector(`#${id}`);
      if (!el) return;
      el.addEventListener('input', fn);
      if (el.tagName === 'SELECT') el.addEventListener('change', fn);
    };

    onField('balanceEditTitle', () => {
      draft.title = select('#balanceEditTitle')?.value || '';
      dirty = true;
    });
    onField('balanceEditGrade', () => {
      draft.grade = select('#balanceEditGrade')?.value || '';
      dirty = true;
    });
    onField('balanceEditDifficulty', () => {
      draft.difficulty = select('#balanceEditDifficulty')?.value || '';
      dirty = true;
    });
    onField('balanceEditStart', () => {
      draft.startEquation = select('#balanceEditStart')?.value || '';
      dirty = true;
    });
    onField('balanceEditTarget', () => {
      draft.targetEquation = select('#balanceEditTarget')?.value || '';
      dirty = true;
    });

    onField('balanceStepLabel', () => {
      if (draft.steps[selectedStep]) draft.steps[selectedStep].label = select('#balanceStepLabel')?.value || '';
      dirty = true;
    });
    onField('balanceStepTip', () => {
      if (draft.steps[selectedStep]) draft.steps[selectedStep].tip = select('#balanceStepTip')?.value || '';
      dirty = true;
    });

    const stepAction = select('#balanceStepAction');
    if (stepAction) {
      stepAction.addEventListener('change', () => {
        syncCurrentStep();
        if (draft.steps[selectedStep]) {
          draft.steps[selectedStep].action = stepAction.value;
          if (stepAction.value !== 'set_coef') {
            draft.steps[selectedStep].focus = null;
            draft.steps[selectedStep].expectedCoef = null;
          } else if (!draft.steps[selectedStep].focus) {
            draft.steps[selectedStep].focus = { side: 'left', index: 0 };
          }
        }
        dirty = true;
        renderScriptEditor();
      });
    }

    const updateFocus = () => {
      if (!draft.steps[selectedStep]) return;
      const side = select('#balanceStepSide')?.value || 'left';
      const index = Number(select('#balanceStepFocusIdx')?.value) || 0;
      draft.steps[selectedStep].focus = { side, index };
      dirty = true;
    };
    select('#balanceStepSide')?.addEventListener('change', updateFocus);
    select('#balanceStepFocusIdx')?.addEventListener('input', updateFocus);
    select('#balanceStepExpected')?.addEventListener('input', () => {
      if (draft.steps[selectedStep]) {
        const v = select('#balanceStepExpected')?.value;
        draft.steps[selectedStep].expectedCoef = v ? Number(v) : null;
      }
      dirty = true;
    });

    // 选步骤（编辑态下不切换，避免误触）
    root.querySelectorAll('[data-script-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (stepEditMode) return;
        syncCurrentStep();
        selectedStep = Number(btn.dataset.scriptPick);
        renderScriptEditor();
      });
    });

    select('#btnBalanceAddStep')?.addEventListener('click', async () => {
      syncCurrentStep();
      if (stepEditMode) stepEditMode = false;
      draft.steps.push(emptyStep());
      selectedStep = draft.steps.length - 1;
      dirty = true;
      renderScriptEditor();
    });

    select('#btnBalanceStepListEdit')?.addEventListener('click', async () => {
      syncCurrentStep();
      stepEditMode = !stepEditMode;
      renderScriptEditor();
    });

    // 编辑态：删除（与实验探究一致，点卡片上的 ×）
    root.querySelectorAll('[data-step-del]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!stepEditMode) return;
        if (draft.steps.length <= 1) {
          await appAlert('至少保留一个步骤');
          return;
        }
        if (!(await appConfirm('删除该步骤？'))) return;
        syncCurrentStep();
        const i = Number(btn.dataset.stepDel);
        draft.steps.splice(i, 1);
        if (selectedStep >= draft.steps.length) selectedStep = draft.steps.length - 1;
        else if (selectedStep > i) selectedStep -= 1;
        dirty = true;
        renderScriptEditor();
      });
    });

    // 编辑态：拖拽排序
    if (stepEditMode) {
      let dragFrom = null;
      root.querySelectorAll('.lab-step-nav-card[data-script-step]').forEach((card) => {
        card.addEventListener('dragstart', (e) => {
          dragFrom = Number(card.dataset.scriptStep);
          card.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
          dragFrom = null;
          card.classList.remove('is-dragging');
          root.querySelectorAll('.lab-step-nav-card').forEach((c) => c.classList.remove('drag-over'));
        });
        card.addEventListener('dragover', (e) => {
          e.preventDefault();
          card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', async (e) => {
          e.preventDefault();
          card.classList.remove('drag-over');
          const to = Number(card.dataset.scriptStep);
          if (dragFrom == null || dragFrom === to) return;
          syncCurrentStep();
          const [item] = draft.steps.splice(dragFrom, 1);
          draft.steps.splice(to, 0, item);
          selectedStep = to;
          dirty = true;
          renderScriptEditor();
        });
      });
    }

    select('#btnBalanceSave')?.addEventListener('click', handleSave);
    select('#btnBalanceResetOne')?.addEventListener('click', () => resetCurrentScript());

    bindScriptChemKeypads(root);
  }

  /** 起式 / 目标式 / 提示文案：内联化学符号键盘（与实验探究方程式相同，非气泡） */
  function bindScriptChemKeypads(root) {
    const pairs = [
      ['#balanceEditStart', '#chemKeypad-bal-start', (v) => { draft.startEquation = v; }],
      ['#balanceEditTarget', '#chemKeypad-bal-target', (v) => { draft.targetEquation = v; }],
      ['#balanceStepTip', '#chemKeypad-bal-tip', (v) => {
        if (draft.steps[selectedStep]) draft.steps[selectedStep].tip = v;
      }],
    ];
    pairs.forEach(([inputSel, padSel, apply]) => {
      const input = root.querySelector(inputSel);
      const keypad = root.querySelector(padSel);
      if (!input || !keypad) return;
      bindChemKeypad(input, keypad, {
        onInsert: (value) => {
          dirty = true;
          apply(value);
        },
      });
    });
  }

  function syncCurrentStep() {
    if (!draft) return;
    const title = select('#balanceEditTitle');
    if (title) draft.title = title.value;
    const grade = select('#balanceEditGrade');
    if (grade) draft.grade = grade.value;
    const difficulty = select('#balanceEditDifficulty');
    if (difficulty) draft.difficulty = difficulty.value;
    const start = select('#balanceEditStart');
    if (start) draft.startEquation = start.value;
    const target = select('#balanceEditTarget');
    if (target) draft.targetEquation = target.value;

    if (!draft.steps[selectedStep]) return;
    const stepLabel = select('#balanceStepLabel');
    const stepTip = select('#balanceStepTip');
    const stepAction = select('#balanceStepAction');
    if (stepLabel) draft.steps[selectedStep].label = stepLabel.value;
    if (stepTip) draft.steps[selectedStep].tip = stepTip.value;
    if (stepAction) draft.steps[selectedStep].action = stepAction.value;
    const stepSide = select('#balanceStepSide');
    const stepFocusIdx = select('#balanceStepFocusIdx');
    if (stepSide && stepFocusIdx && draft.steps[selectedStep].action === 'set_coef') {
      draft.steps[selectedStep].focus = {
        side: stepSide.value,
        index: Number(stepFocusIdx.value) || 0,
      };
    }
    const stepExpected = select('#balanceStepExpected');
    if (stepExpected) {
      draft.steps[selectedStep].expectedCoef = stepExpected.value ? Number(stepExpected.value) : null;
    }
  }

  async function handleSave() {
    if (saving || !draft) return;
    syncCurrentStep();
    const built = draftToPayload(draft);
    if (!built.ok) {
      await appAlert(built.reason || '请完善脚本');
      return;
    }
    const payload = built.payload;
    if (!String(payload.title || '').trim()) {
      await appAlert('名称不能为空');
      return;
    }
    if (!String(payload.startEquation || '').trim()) {
      await appAlert('起式不能为空');
      return;
    }
    if (!String(payload.targetEquation || '').trim()) {
      await appAlert('目标式不能为空');
      return;
    }
    draft.species = payload.species;
    saving = true;
    // 仅更新按钮，避免整页重绘打断；成功后再 render
    const saveBtn = select('#btnBalanceSave');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
    }
    try {
      if (draft.isNew || !draft.id) {
        const created = await balanceScriptsApi.create(payload);
        const data = created?.data || created;
        if (data?.id) {
          draft.id = data.id;
          draft.isNew = false;
          draft.source = data.source || 'custom';
          scriptId = data.id;
        }
      } else {
        const updated = await balanceScriptsApi.update(draft.id, payload);
        const data = updated?.data || updated;
        if (data?.source) draft.source = data.source;
      }
      dirty = false;
      saving = false;
      await loadScripts({ keepSelection: true });
      if (mode === 'script' && scriptId) {
        draft = scriptToDraft(currentScript());
      }
      render();
    } catch (err) {
      saving = false;
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存脚本';
      }
      await appAlert(`保存失败：${err.message || err}`);
    }
  }

  async function resetCurrentScript() {
    const script = currentScript();
    if (!script?.id) return;
    // 仅内置 id 可恢复（API 也校验）；纯自定义点了只会失败
    if (!(await appConfirm(`将「${script.title}」恢复为内置版本？当前修改会被覆盖。`, {
      title: '恢复内置',
      okText: '恢复',
      danger: true,
    }))) return;
    try {
      const res = await balanceScriptsApi.reset(script.id);
      const data = res?.data || res;
      if (data?.id) {
        scriptId = data.id;
        draft = scriptToDraft(data);
        dirty = false;
        selectedStep = 0;
        resetPractice();
        await loadScripts({ keepSelection: true });
        render();
      }
    } catch (err) {
      await appAlert(err.message || '无法重置（仅内置脚本可恢复）');
    }
  }

  async function loadScripts({ keepSelection = false } = {}) {
    try {
      const data = await balanceScriptsApi.list();
      scripts = data?.scripts || [];
      if (!keepSelection) {
        scriptId = scripts[0]?.id || null;
        resetPractice();
      } else if (scriptId && !scripts.find((s) => s.id === scriptId)) {
        scriptId = scripts[0]?.id || null;
        resetPractice();
      } else if (scriptId) {
        // 刷新当前练习系数对应 species
        const s = currentScript();
        if (s && mode === 'practice' && !finished) {
          // 保留 coefs 长度对齐
          const next = initCoefs(s.species);
          coefs = {
            left: next.left.map((c, i) => coefs.left?.[i] ?? c),
            right: next.right.map((c, i) => coefs.right?.[i] ?? c),
          };
        }
      }
    } catch (err) {
      console.error('加载配平脚本失败:', err);
      scripts = [];
    }
  }

  function render() {
    hideCoefKeypad();
    const layout = select('#balanceLayout') || select('.ai-section-balance .lab-layout-drawer');
    if (layout) layout.classList.toggle('is-drawer-collapsed', drawerCollapsed);
    renderRail();
    if (mode === 'practice') renderPractice();
    else renderScriptEditor();
  }

  async function init() {
    progress = loadProgress();
    bindGenBalanceModalOnce();
    await loadScripts();
    render();
  }

  /** 是否有未保存脚本修改（离开课堂分区时拦截） */
  function isDirty() {
    return !!dirty;
  }

  /** 用户确认放弃后：丢掉草稿态，回到已保存脚本或空 */
  function discardUnsaved() {
    dirty = false;
    stepEditMode = false;
    saving = false;
    hideCoefKeypad();
    if (scriptId && scripts.find((s) => s.id === scriptId)) {
      draft = scriptToDraft(currentScript());
    } else {
      draft = null;
      scriptId = scripts[0]?.id || null;
    }
    if (mode === 'script' && !draft) {
      mode = 'practice';
    }
  }

  function onDeactivate() {
    hideCoefKeypad();
    closeGenBalanceModal();
  }

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
