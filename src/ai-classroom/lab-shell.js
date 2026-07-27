/**
 * 实验探究 UI 控制器
 * - 预习 | 脚本（脚本页 = 编辑页）
 * - 左侧抽屉：列表 / 导入导出 / AI
 * 纯数据逻辑见 lab-model.js
 */

import { bindChemKeypad } from '../chem-keypad.js';
import { appAlert, appConfirm } from '../app-dialog.js';
import {
  DRAWER_KEY,
  loadProgress,
  saveProgress,
  loadSession,
  saveSession,
  emptyStep,
  labToDraft,
  draftToPayload,
  prestudySteps,
  prestudyStats,
  formatLabsImportSummary,
  downloadJsonFile,
} from './lab-model.js';
import {
  htmlTitleRow,
  htmlPrestudyBody,
  htmlScriptBody,
  htmlEmptyLabs,
} from './lab-views.js';

export function createLabShellController({ select, escapeHtml, labsApi, aiApi }) {
  let labs = [];
  let labId = null;
  let mode = null; // prestudy | script
  let stepIdx = 0; // 预习翻页
  let stepResults = {};
  let progress = loadProgress();
  let drawerCollapsed = localStorage.getItem(DRAWER_KEY) === '1';
  let statusMsg = '';
  /** 与 3D 分子列表一致：编辑态显示删除 × + 可拖拽排序 */
  let listEditMode = false;
  let stepEditMode = false;

  /** 脚本页工作副本（与「编辑」合一） */
  let draft = null;
  let selectedStep = 0;
  let dirty = false;
  let saving = false;

  function currentLab() {
    return labs.find((l) => l.id === labId) || null;
  }

  function persistSession() {
    saveSession({ labId, mode });
  }

  function ensureModeForLab(lab) {
    const has = prestudySteps(lab).length > 0;
    if (mode === 'prestudy' && !has) mode = 'script';
    if (mode !== 'prestudy' && mode !== 'script') {
      mode = has ? 'prestudy' : 'script';
    }
  }

  function hydrateStepResults() {
    stepResults = {};
    const saved = progress[labId] || {};
    for (const [k, v] of Object.entries(saved)) {
      stepResults[Number(k)] = v;
    }
  }

  function beginScriptDraft(lab) {
    draft = labToDraft(lab);
    selectedStep = 0;
    dirty = !!draft.isNew;
  }

  async function loadLabs({ keepSelection = true, preserveDraft = false } = {}) {
    statusMsg = statusMsg && statusMsg.includes('AI') ? statusMsg : '';
    try {
      const data = await labsApi.list();
      labs = data?.labs || [];
      const session = loadSession();
      const keepNewDraft = preserveDraft && draft?.isNew;

      if (keepNewDraft) {
        labId = null;
        mode = 'script';
      } else if (keepSelection && labId && labs.some((l) => l.id === labId)) {
        /* keep labId；mode 由调用方决定（进入页面会清空为 null → 默认预习） */
      } else if (session.labId && labs.some((l) => l.id === session.labId)) {
        labId = session.labId;
        // 只恢复实验选择，不恢复 script/prestudy，默认进预习
        if (mode !== 'prestudy' && mode !== 'script') mode = null;
      } else {
        labId = labs[0]?.id || null;
        mode = null;
      }

      const lab = currentLab();
      if (keepNewDraft) {
        // 保留未保存 AI/空白草稿，不覆盖 draft
        mode = 'script';
      } else if (lab) {
        ensureModeForLab(lab);
        if (mode === 'script') beginScriptDraft(lab);
        else draft = null;
      } else {
        draft = null;
      }
      stepIdx = 0;
      hydrateStepResults();
    } catch (err) {
      statusMsg = `加载失败：${err.message || ''}`;
      labs = [];
    }
    render();
  }

  function setDrawerCollapsed(v) {
    drawerCollapsed = !!v;
    localStorage.setItem(DRAWER_KEY, drawerCollapsed ? '1' : '0');
    const layout = select('.lab-layout-drawer');
    if (layout) layout.classList.toggle('is-drawer-collapsed', drawerCollapsed);
    const btn = select('#btnLabDrawerToggle');
    if (btn) {
      btn.textContent = drawerCollapsed ? '»' : '«';
      btn.title = drawerCollapsed ? '展开实验列表' : '收起实验列表';
    }
  }

  async function confirmLeaveDirty() {
    if (!dirty) return true;
    return appConfirm('脚本有未保存的修改，确定放弃？', {
      title: '未保存修改',
      okText: '放弃修改',
      danger: true,
    });
  }

  async function selectLab(id) {
    if (id === labId && !draft?.isNew && mode === 'prestudy') return;
    if (!(await confirmLeaveDirty())) return;
    labId = id;
    stepIdx = 0;
    // 点进实验默认预习（有预习步骤时）
    mode = null;
    const lab = currentLab();
    ensureModeForLab(lab);
    hydrateStepResults();
    if (mode === 'script') beginScriptDraft(lab);
    else draft = null;
    dirty = false;
    persistSession();
    render();
  }

  async function startCreate() {
    if (!(await confirmLeaveDirty())) return;
    labId = null;
    mode = 'script';
    beginScriptDraft(null);
    dirty = true;
    listEditMode = false;
    render();
  }

  async function openGenLabModal() {
    if (!(await confirmLeaveDirty())) return;
    if (!aiApi?.labGenerate) {
      await appAlert('AI 接口不可用');
      return;
    }
    const backdrop = select('#genLabBackdrop');
    const modal = select('#genLabModal');
    const promptEl = select('#genLabPrompt');
    const statusEl = select('#genLabStatus');
    const submitBtn = select('#btnGenLabSubmit');
    if (promptEl) promptEl.value = '';
    if (statusEl) {
      statusEl.textContent = '';
      statusEl.classList.remove('is-ok', 'is-err');
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '生成草稿';
    }
    backdrop?.classList.add('is-open');
    modal?.classList.add('is-open');
    backdrop?.setAttribute('aria-hidden', 'false');
    modal?.setAttribute('aria-hidden', 'false');
    promptEl?.focus();
  }

  function closeGenLabModal() {
    const backdrop = select('#genLabBackdrop');
    const modal = select('#genLabModal');
    const submitBtn = select('#btnGenLabSubmit');
    backdrop?.classList.remove('is-open');
    modal?.classList.remove('is-open');
    backdrop?.setAttribute('aria-hidden', 'true');
    modal?.setAttribute('aria-hidden', 'true');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '生成草稿';
    }
  }

  function bindGenLabModalOnce() {
    const root = select('#genLabModal');
    if (!root || root.dataset.bound === '1') return;
    root.dataset.bound = '1';
    select('#btnGenLabClose')?.addEventListener('click', () => closeGenLabModal());
    select('#btnGenLabCancel')?.addEventListener('click', () => closeGenLabModal());
    select('#genLabBackdrop')?.addEventListener('click', () => closeGenLabModal());
    select('#btnGenLabSubmit')?.addEventListener('click', () => handleGenLabSubmit());
  }

  /** AI 生成实验草稿 → 弹窗提示进度 → 进入脚本页确认保存 */
  async function handleGenLabSubmit() {
    const promptEl = select('#genLabPrompt');
    const statusEl = select('#genLabStatus');
    const submitBtn = select('#btnGenLabSubmit');
    const text = String(promptEl?.value || '').trim();
    if (!text) {
      if (statusEl) {
        statusEl.textContent = '请填写实验描述';
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
      statusEl.textContent = '正在调用 AI 生成实验草稿，请稍候…';
      statusEl.classList.remove('is-ok', 'is-err');
    }

    try {
      const data = await aiApi.labGenerate(text);
      const fakeLab = {
        id: null,
        title: data.title || '',
        type: data.type || '',
        equation: data.equation || '',
        safety: data.safety || '',
        phenomena: data.phenomena || '',
        steps: Array.isArray(data.steps) ? data.steps : [],
        prestudy: data.prestudy || null,
        source: 'custom',
      };
      labId = null;
      mode = 'script';
      beginScriptDraft(fakeLab);
      draft.isNew = true;
      dirty = true;
      selectedStep = 0;
      statusMsg = '';

      if (statusEl) {
        statusEl.textContent = '生成成功！即将打开脚本页，请检查后保存。';
        statusEl.classList.add('is-ok');
        statusEl.classList.remove('is-err');
      }
      window.setTimeout(() => {
        closeGenLabModal();
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

  function startAiCreate() {
    bindGenLabModalOnce();
    openGenLabModal();
  }

  async function exportLabPack() {
    if (!labsApi?.exportPack) {
      await appAlert('实验包导出不可用');
      return;
    }
    try {
      const data = await labsApi.exportPack();
      downloadJsonFile(`实验包-${new Date().toISOString().slice(0, 10)}.json`, data);
      statusMsg = '已导出实验包';
      renderRail();
    } catch (err) {
      await appAlert(`导出失败：${err.message || ''}`);
    }
  }

  function pickImportFile() {
    let input = select('#labPackImportInput');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.id = 'labPackImportInput';
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
      const result = await labsApi.importPack(data);
      const summary = formatLabsImportSummary(result);
      statusMsg = summary.split('\n')[0];
      dirty = false;
      draft = null;
      await loadLabs({ keepSelection: false });
      await appAlert(summary);
    } catch (err) {
      await appAlert(`导入失败：${err.message || ''}`);
    }
  }

  // ── 左侧抽屉（添加 / 编辑·保存，逻辑对齐 3D 分子列表） ──

  async function renderRail() {
    const rail = select('#labNavRail');
    if (!rail) return;

    rail.innerHTML = `
      <div class="lab-nav-rail-head">
        <strong class="lab-nav-brand">实验探究</strong>
        <button type="button" class="lab-drawer-toggle" id="btnLabDrawerToggle" title="${drawerCollapsed ? '展开' : '收起'}">${drawerCollapsed ? '»' : '«'}</button>
      </div>
      <div class="lab-nav-toolbar">
        <button type="button" class="lab-tool-btn lab-tool-add" id="btnLabAdd" title="空白新建">＋</button>
        <button type="button" class="lab-tool-btn lab-tool-edit${listEditMode ? ' is-active' : ''}" id="btnLabListEdit">${listEditMode ? '保存' : '编辑'}</button>
        <button type="button" class="lab-tool-btn" id="btnLabExport" title="导出全部实验为 JSON">导出</button>
        <button type="button" class="lab-tool-btn" id="btnLabImport" title="导入实验包（不覆盖已有）">导入</button>
      </div>
      <button type="button" class="lab-tool-btn lab-tool-ai" id="btnLabAi" title="用 AI 生成实验草稿">AI 生成</button>
      <nav id="labNavList" class="lab-nav-list${listEditMode ? ' is-edit-mode' : ''}" role="list" aria-label="实验列表"></nav>
      ${statusMsg ? `<p class="lab-nav-status">${escapeHtml(statusMsg)}</p>` : ''}`;

    select('#btnLabDrawerToggle')?.addEventListener('click', () => setDrawerCollapsed(!drawerCollapsed));
    select('#btnLabAdd')?.addEventListener('click', async () => {
      if (listEditMode) listEditMode = false;
      startCreate();
    });
    select('#btnLabAi')?.addEventListener('click', async () => {
      if (listEditMode) listEditMode = false;
      startAiCreate();
    });
    select('#btnLabExport')?.addEventListener('click', async () => {
      if (listEditMode) listEditMode = false;
      exportLabPack();
    });
    select('#btnLabImport')?.addEventListener('click', async () => {
      if (listEditMode) listEditMode = false;
      pickImportFile();
    });
    select('#btnLabListEdit')?.addEventListener('click', async () => {
      // 与分子列表相同：点「保存」仅退出编辑态（排序已在拖拽时写入）
      listEditMode = !listEditMode;
      render();
    });

    const nav = select('#labNavList');
    if (!nav) return;

    nav.innerHTML = labs.map((lab) => {
      const stats = prestudyStats(lab, progress);
      let progressHtml = '';
      if (stats.hasConfig) {
        const all = stats.done >= stats.total && stats.total > 0;
        progressHtml = `<span class="lab-nav-progress${all ? ' is-done' : ''}">${stats.done}/${stats.total}</span>`;
      } else {
        progressHtml = '<span class="lab-nav-progress is-read">脚本</span>';
      }
      const active = lab.id === labId && !draft?.isNew;
      return `<div class="lab-nav-card${active ? ' is-active' : ''}${listEditMode ? ' is-editing' : ''}" data-lab-id="${escapeHtml(lab.id)}" draggable="${listEditMode ? 'true' : 'false'}">
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
    if (draft?.isNew) {
      const draftTitle = (draft.title || '').trim() || '新实验（未保存）';
      nav.insertAdjacentHTML(
        'afterbegin',
        `<div class="lab-nav-card is-active is-draft${listEditMode ? ' is-editing' : ''}" data-lab-draft="1">
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

    nav.querySelectorAll('[data-lab-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (listEditMode) return;
        selectLab(btn.dataset.labPick);
      });
    });

    nav.querySelectorAll('[data-lab-draft-pick]').forEach((btn) => {
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
        if (!id) return;
        // 列表编辑态删除：不拦截「脚本未保存」
        if (!(await appConfirm('确定删除该实验？'))) return;
        try {
          const wasCurrent = labId === id;
          await labsApi.remove(id);
          if (wasCurrent) {
            labId = null;
            draft = null;
            dirty = false;
            saving = false;
            mode = null;
          }
          const preserveDraft = !!(draft?.isNew && !wasCurrent);
          await loadLabs({ keepSelection: !wasCurrent, preserveDraft });
          if (wasCurrent) {
            labId = labs[0]?.id || null;
            if (labId) {
              mode = 'script';
              beginScriptDraft(currentLab());
              dirty = false;
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
        if (!listEditMode) return;
        // 未保存草稿：编辑态可直接丢弃
        if (!(await appConfirm('丢弃这个未保存的实验？'))) return;
        draft = null;
        dirty = false;
        saving = false;
        labId = labs[0]?.id || null;
        mode = null;
        if (labId) {
          ensureModeForLab(currentLab());
          if (mode === 'script') beginScriptDraft(currentLab());
          dirty = false;
        }
        render();
      });
    });

    if (listEditMode) {
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
          const ids = labs.map((l) => l.id);
          const from = ids.indexOf(dragId);
          const to = ids.indexOf(targetId);
          if (from < 0 || to < 0) return;
          ids.splice(from, 1);
          ids.splice(to, 0, dragId);
          try {
            const data = await labsApi.reorder(ids);
            labs = data?.labs || labs;
            render();
          } catch (err) {
            await appAlert(`排序失败：${err.message || ''}`);
          }
        });
      });
    }
  }

  // ── 标题 / 预习 / 脚本 HTML（模板在 lab-views.js） ──

  function renderTitleRow(lab) {
    const title = draft?.isNew ? (draft.title || '新实验') : lab?.title || '';
    const type = draft?.isNew ? (draft.type || '实验') : lab?.type || '实验';
    const equation = mode === 'script' && draft ? draft.equation : lab?.equation;
    const phenomena = mode === 'script' && draft ? draft.phenomena : lab?.phenomena;
    const safety = mode === 'script' && draft ? draft.safety : lab?.safety;
    const hasPre = lab
      ? prestudySteps(lab).length > 0
      : !!(draft && draft.steps.some((s) => s.enablePredict));
    return htmlTitleRow({
      escapeHtml,
      title,
      type,
      equation,
      phenomena,
      safety,
      dirty,
      mode,
      hasPre,
    });
  }

  function renderPrestudyBody(lab) {
    hydrateStepResults();
    const built = htmlPrestudyBody({
      escapeHtml,
      lab,
      stepIdx,
      stepResults,
    });
    stepIdx = built.stepIdx;
    return built.html;
  }

  function renderScriptBody() {
    const built = htmlScriptBody({
      escapeHtml,
      draft,
      selectedStep,
      stepEditMode,
      saving,
      dirty,
    });
    selectedStep = built.selectedStep;
    return built.html;
  }

  function readDraftFieldsFromDom() {
    if (!draft) return;
    const t = select('#draftTitle');
    if (t) draft.title = t.value;
    const ty = select('#draftType');
    if (ty) draft.type = ty.value;
    const eq = select('#draftEquation');
    if (eq) draft.equation = eq.value;
    const ph = select('#draftPhenomena');
    if (ph) draft.phenomena = ph.value;
    const sf = select('#draftSafety');
    if (sf) draft.safety = sf.value;
    const ob = select('#draftObjective');
    if (ob) draft.objective = ob.value;
    const rg = select('#draftReagents');
    if (rg) draft.reagents = rg.value;
    const ap = select('#draftApparatus');
    if (ap) draft.apparatus = ap.value;
    const sm = select('#draftSummary');
    if (sm) draft.summary = sm.value;

    const st = draft.steps[selectedStep];
    if (!st) return;
    const lb = select('#draftStepLabel');
    if (lb) st.label = lb.value;
    const tip = select('#draftStepTip');
    if (tip) st.tip = tip.value;
    const risk = select('#draftStepRisk');
    if (risk) st.risk = risk.value;
    const en = select('#draftEnablePredict');
    if (en) st.enablePredict = en.checked;
    const q = select('#draftQuestion');
    if (q) st.question = q.value;
    select('#labDetail')?.querySelectorAll('[data-draft-opt]').forEach((inp) => {
      const i = Number(inp.dataset.draftOpt);
      st.options[i] = inp.value;
    });
    const ans = select('#draftAnswer');
    if (ans) st.answer = Number(ans.value) || 0;
    const ex = select('#draftExplanation');
    if (ex) st.explanation = ex.value;
  }

  function markDirtyAndRefreshPredict() {
    dirty = true;
    readDraftFieldsFromDom();
    const block = select('#draftPredictBlock');
    const en = select('#draftEnablePredict');
    if (block && en) block.hidden = !en.checked;
  }

  async function bindScriptEditor(detail) {
    const onMeta = () => {
      dirty = true;
      readDraftFieldsFromDom();
    };
    ['draftTitle', 'draftType', 'draftEquation', 'draftPhenomena', 'draftSafety',
      'draftObjective', 'draftReagents', 'draftApparatus', 'draftSummary',
      'draftStepLabel', 'draftStepTip', 'draftStepRisk', 'draftQuestion',
      'draftAnswer', 'draftExplanation'].forEach((id) => {
      const el = detail.querySelector(`#${id}`);
      if (el) el.addEventListener('input', onMeta);
      if (el && el.tagName === 'SELECT') el.addEventListener('change', onMeta);
    });
    detail.querySelectorAll('[data-draft-opt]').forEach((inp) => {
      inp.addEventListener('input', onMeta);
    });
    detail.querySelector('#draftEnablePredict')?.addEventListener('change', () => {
      markDirtyAndRefreshPredict();
    });

    detail.querySelectorAll('[data-script-pick]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (stepEditMode) return;
        readDraftFieldsFromDom();
        selectedStep = Number(btn.dataset.scriptPick);
        render();
      });
    });

    detail.querySelector('#btnStepAdd')?.addEventListener('click', async () => {
      readDraftFieldsFromDom();
      if (stepEditMode) stepEditMode = false;
      draft.steps.push(emptyStep());
      selectedStep = draft.steps.length - 1;
      dirty = true;
      render();
    });
    detail.querySelector('#btnStepListEdit')?.addEventListener('click', async () => {
      readDraftFieldsFromDom();
      stepEditMode = !stepEditMode;
      render();
    });

    detail.querySelectorAll('[data-step-del]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!stepEditMode) return;
        if (draft.steps.length <= 1) {
          await appAlert('至少保留一个步骤');
          return;
        }
        if (!(await appConfirm('删除该步骤？'))) return;
        readDraftFieldsFromDom();
        const i = Number(btn.dataset.stepDel);
        draft.steps.splice(i, 1);
        if (selectedStep >= draft.steps.length) selectedStep = draft.steps.length - 1;
        else if (selectedStep > i) selectedStep -= 1;
        dirty = true;
        render();
      });
    });

    if (stepEditMode) {
      let dragFrom = null;
      detail.querySelectorAll('.lab-step-nav-card[data-script-step]').forEach((card) => {
        card.addEventListener('dragstart', (e) => {
          dragFrom = Number(card.dataset.scriptStep);
          card.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
          dragFrom = null;
          card.classList.remove('is-dragging');
          detail.querySelectorAll('.lab-step-nav-card').forEach((c) => c.classList.remove('drag-over'));
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
          readDraftFieldsFromDom();
          const [item] = draft.steps.splice(dragFrom, 1);
          draft.steps.splice(to, 0, item);
          selectedStep = to;
          dirty = true;
          render();
        });
      });
    }

    detail.querySelector('#btnDraftSave')?.addEventListener('click', () => saveDraft());
    detail.querySelector('#btnDraftReset')?.addEventListener('click', () => resetOne());

    bindEquationKeypad(detail);
  }

  /** 方程式输入框聚焦时显示 Unicode 化学符号软键盘 */
  function bindEquationKeypad(detail) {
    const input = detail.querySelector('#draftEquation');
    const keypad = detail.querySelector('.chem-keypad');
    if (!input || !keypad) return;
    bindChemKeypad(input, keypad, {
      onInsert: (value) => {
        dirty = true;
        if (draft) draft.equation = value;
      },
    });
  }

  async function saveDraft() {
    if (!draft || saving) return;
    readDraftFieldsFromDom();
    const built = draftToPayload(draft);
    if (!built.ok) {
      await appAlert(built.reason || '请完善实验内容');
      return;
    }
    const payload = built.payload;
    saving = true;
    // 只更新按钮文案，避免整页重绘打断
    const saveBtn = select('#btnDraftSave');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中…';
    }
    try {
      if (draft.isNew) {
        const created = await labsApi.create(payload);
        labId = created?.id || labId;
      } else {
        await labsApi.update(labId, payload);
      }
      dirty = false;
      draft = null;
      mode = 'script';
      statusMsg = '';
      saving = false;
      await loadLabs({ keepSelection: true });
    } catch (err) {
      saving = false;
      await appAlert(`保存失败：${err.message || ''}`);
      render();
    }
  }

  async function resetOne() {
    if (!labId) return;
    if (!(await appConfirm('恢复为内置版本？当前未保存和已保存的修改都会被覆盖。'))) return;
    try {
      await labsApi.resetOne(labId);
      dirty = false;
      draft = null;
      await loadLabs();
    } catch (err) {
      await appAlert(`重置失败：${err.message || ''}`);
    }
  }

  function handleAnswer(sIdx, optIdx) {
    const lab = currentLab();
    const step = prestudySteps(lab)[sIdx];
    if (!step?.predict) return;
    if (stepResults[sIdx] !== undefined) return;
    const correct = optIdx === step.predict.answer;
    stepResults[sIdx] = { chosen: optIdx, correct };
    if (!progress[labId]) progress[labId] = {};
    progress[labId][sIdx] = { chosen: optIdx, correct };
    saveProgress(progress);
    stepIdx = sIdx;
    render();
  }

  async function bindDetail(detail, lab) {
    detail.querySelectorAll('[data-lab-mode]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        const next = btn.dataset.labMode;
        if (next === mode) return;
        if (mode === 'script' && dirty && next === 'prestudy') {
          if (!(await confirmLeaveDirty())) return;
          // 放弃未保存，从服务器副本重载 draft
          dirty = false;
        }
        mode = next;
        if (mode === 'script') {
          beginScriptDraft(currentLab());
          dirty = false;
        } else {
          draft = null;
          stepIdx = 0;
          hydrateStepResults();
        }
        persistSession();
        render();
      });
    });

    if (mode === 'prestudy' && lab) {
      detail.querySelectorAll('[data-prestudy-opt]').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          handleAnswer(Number(btn.dataset.prestudyStep), Number(btn.dataset.prestudyOpt));
        });
      });
      detail.querySelector('#btnPrestudyNext')?.addEventListener('click', async () => {
        const steps = prestudySteps(lab);
        if (stepIdx < steps.length - 1) {
          stepIdx += 1;
          render();
        }
      });
      detail.querySelector('#btnPrestudyPrev')?.addEventListener('click', async () => {
        if (stepIdx > 0) {
          stepIdx -= 1;
          render();
        }
      });
      detail.querySelector('#btnPrestudyRestart')?.addEventListener('click', async () => {
        delete progress[labId];
        saveProgress(progress);
        stepResults = {};
        stepIdx = 0;
        render();
      });
    }

    if (mode === 'script') bindScriptEditor(detail);
  }

  async function renderDetail() {
    const detail = select('#labDetail');
    if (!detail) return;

    if (!labs.length && !draft?.isNew) {
      detail.innerHTML = htmlEmptyLabs();
      detail.querySelector('#btnLabEmptyAdd')?.addEventListener('click', () => startCreate());
      detail.querySelector('#btnLabEmptyImport')?.addEventListener('click', () => pickImportFile());
      detail.querySelector('#btnLabEmptyReset')?.addEventListener('click', async () => {
        if (!(await appConfirm('恢复全部内置实验？'))) return;
        await labsApi.resetBuiltin();
        await loadLabs({ keepSelection: false });
      });
      return;
    }

    if (draft?.isNew && mode === 'script') {
      detail.innerHTML = `
        ${renderTitleRow(null)}
        <div class="lab-detail-body">${renderScriptBody()}</div>`;
      bindDetail(detail, null);
      return;
    }

    const lab = currentLab();
    if (!lab) {
      detail.innerHTML = '<div class="molar-empty">请选择左侧实验</div>';
      return;
    }
    ensureModeForLab(lab);
    if (mode === 'script' && !draft) beginScriptDraft(lab);

    const body = mode === 'prestudy' ? renderPrestudyBody(lab) : renderScriptBody();
    detail.innerHTML = `
      ${renderTitleRow(lab)}
      <div class="lab-detail-body">${body}</div>`;
    bindDetail(detail, lab);
  }

  function render() {
    const layout = select('.lab-layout-drawer');
    if (layout) layout.classList.toggle('is-drawer-collapsed', drawerCollapsed);
    renderRail();
    renderDetail();
    persistSession();
  }

  async function renderShell() {
    bindGenLabModalOnce();
    // 每次从课堂进入实验探究：默认打开预习（未保存草稿除外）
    if (!draft?.isNew) {
      mode = null;
    }
    await loadLabs({ keepSelection: true });
  }

  function isDirty() {
    return !!dirty;
  }

  /** 确认放弃后重置草稿（与切到预习时一致） */
  function discardUnsaved() {
    dirty = false;
    saving = false;
    stepEditMode = false;
    if (labId) {
      beginScriptDraft(currentLab());
      dirty = false;
    } else {
      draft = null;
    }
  }

  function onDeactivate() {
    // 关闭 AI 生成弹窗（若开着）
    try {
      const backdrop = select('#genLabBackdrop');
      const modal = select('#genLabModal');
      backdrop?.classList.remove('is-open');
      modal?.classList.remove('is-open');
      backdrop?.setAttribute('aria-hidden', 'true');
      modal?.setAttribute('aria-hidden', 'true');
    } catch {
      /* ignore */
    }
  }

  return {
    render: renderShell,
    isDirty,
    confirmLeaveDirty,
    discardUnsaved,
    onDeactivate,
  };
}
