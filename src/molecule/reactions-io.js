/**
 * 3D 分子 · 常见反应：AI 添加反应 + 反应包导入导出
 */

import { reactionApi, aiApi } from '../api/client.js';
import { appAlert } from '../app-dialog.js';
import {
  checkBundleVersion,
  isAiReactionAvailable,
  REINSTALL_HINT,
} from '../boot/version-check.js';
import { escapeHtml } from './reactions-stage.js';

const $ = (sel) => document.querySelector(sel);

export function createReactionIo({
  getCurrentMoleculeId,
  getCurrentMoleculeMeta,
  refreshCurrentList,
}) {
  async function exportReactionsPack() {
    try {
      const list = await reactionApi.getList();
      const pack = {
        type: 'xiaohuang-reactions',
        version: 1,
        exportedAt: new Date().toISOString(),
        reactions: list || [],
      };
      const blob = new Blob([JSON.stringify(pack, null, 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `reactions-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      await appAlert(err.message || '导出失败', { title: '导出失败' });
    }
  }

  async function onImportReactionsFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const pack = JSON.parse(text);
      const list = Array.isArray(pack)
        ? pack
        : Array.isArray(pack.reactions)
          ? pack.reactions
          : [];
      if (!list.length) {
        await appAlert('文件中没有反应数据', { title: '导入失败' });
        return;
      }
      let ok = 0;
      let fail = 0;
      for (const r of list) {
        try {
          const payload = { ...r, source: 'ai' };
          delete payload.createdAt;
          if (!payload.id) payload.id = `rxn-import-${Date.now()}-${ok}`;
          else payload.id = `${payload.id}-imp-${Date.now().toString(36).slice(-4)}`;
          await reactionApi.add(payload);
          ok += 1;
        } catch {
          fail += 1;
        }
      }
      await refreshCurrentList();
      await appAlert(`导入完成：成功 ${ok}，失败 ${fail}`, { title: '导入结果' });
    } catch (err) {
      await appAlert(err.message || '导入失败', { title: '导入失败' });
    }
  }

  function openAiAdd() {
    const box = $('#rxnAiBox');
    if (!box) return;
    box.classList.add('is-open');
    $('#rxnAiPreview')?.classList.add('is-hidden');
    const row = $('#rxnAiSaveRow');
    if (row) row.hidden = true;
    const meta = getCurrentMoleculeMeta();
    const input = $('#rxnAiPrompt');
    if (input) {
      input.value = meta.name
        ? `与${meta.name}（${meta.formula || ''}）相关的高中常见反应`
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
      const version = await checkBundleVersion();
      if (!isAiReactionAvailable(version)) {
        if (status) status.textContent = REINSTALL_HINT;
        return;
      }
      const moleculeId = getCurrentMoleculeId();
      const meta = getCurrentMoleculeMeta();
      const data = await aiApi.reaction({
        prompt,
        moleculeId,
        moleculeName: meta.name,
        moleculeFormula: meta.formula,
        stepCount,
      });
      // 保证与当前分子关联，便于列表筛选
      if (moleculeId) {
        const ids = Array.isArray(data.moleculeIds) ? [...data.moleculeIds] : [];
        if (!ids.includes(moleculeId)) ids.unshift(moleculeId);
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
      await refreshCurrentList();
    } catch (err) {
      if (status) status.textContent = err.message || '保存失败';
    }
  }

  function bindEvents() {
    $('#btnAiAddReaction')?.addEventListener('click', () => openAiAdd());
    $('#rxnAiCancel')?.addEventListener('click', () => closeAiAdd());
    $('#rxnAiGenerate')?.addEventListener('click', () => generateAiReaction());
    $('#rxnAiSave')?.addEventListener('click', () => saveAiReaction());
    $('#btnExportReactions')?.addEventListener('click', exportReactionsPack);
    $('#btnImportReactions')?.addEventListener('change', onImportReactionsFile);
    $('#rxnAiDiscard')?.addEventListener('click', async () => {
      $('#rxnAiPreview')?.classList.add('is-hidden');
      const row = $('#rxnAiSaveRow');
      if (row) row.hidden = true;
      window.__rxnAiDraft = null;
      const status = $('#rxnAiStatus');
      if (status) status.textContent = '';
    });
  }

  return {
    bindEvents,
    closeAiAdd,
  };
}
