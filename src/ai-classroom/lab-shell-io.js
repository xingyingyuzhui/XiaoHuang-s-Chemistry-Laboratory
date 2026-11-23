/**
 * 实验探究：AI 生成弹窗 + 实验包导入导出
 */

import { appAlert } from '../app-dialog.js';
import { formatLabsImportSummary, downloadJsonFile } from './lab-model.js';

export function createLabShellIo(ctx) {
  const { select, state, labsApi, aiApi, confirmLeaveDirty, loadLabs, render } = ctx;

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

    state.listEditMode = false;
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
      state.labId = null;
      state.mode = 'script';
      ctx.beginScriptDraft(fakeLab);
      state.draft.isNew = true;
      state.dirty = true;
      state.selectedStep = 0;
      state.statusMsg = '';

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
      state.statusMsg = '已导出实验包';
      ctx.renderRail();
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
      state.statusMsg = summary.split('\n')[0];
      state.dirty = false;
      state.draft = null;
      await loadLabs({ keepSelection: false });
      await appAlert(summary);
    } catch (err) {
      await appAlert(`导入失败：${err.message || ''}`);
    }
  }

  function hideGenLabModalQuietly() {
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
    bindGenLabModalOnce,
    startAiCreate,
    exportLabPack,
    pickImportFile,
    hideGenLabModalQuietly,
  };
}
