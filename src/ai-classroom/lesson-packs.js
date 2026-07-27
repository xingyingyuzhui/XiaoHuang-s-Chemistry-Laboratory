/**
 * 备课包管理 — 前端模块
 * 新建、编辑、导出、导入、删除备课包。
 */

import { CHEM_TOPICS } from '../data/chem-topics.js';
import { formatLabsImportSummary, downloadJsonFile } from './lab-model.js';
import { appAlert, appConfirm } from '../app-dialog.js';

export function createLessonPacksController({ select, escapeHtml, lessonPackApi, labsApi }) {
  let packs = [];
  let editingId = null;
  let viewingId = null;
  /** 编辑器内临时多选状态 */
  let editSelectedTopics = [];
  let editSelectedLabs = [];
  /** @type {Array<{id:string,title:string}>} */
  let labOptions = [];

  function labTitle(id) {
    return labOptions.find((l) => l.id === id)?.title || id;
  }

  async function refreshLabOptions() {
    if (!labsApi?.list) return;
    try {
      const data = await labsApi.list();
      labOptions = (data?.labs || []).map((l) => ({ id: l.id, title: l.title }));
    } catch {
      labOptions = [];
    }
  }

  function renderList() {
    const el = select('#lessonPackList');
    if (!el) return;
    if (!packs.length) {
      el.innerHTML = '<p class="quiz-muted">还没有备课包。点击"新建备课包"创建第一个。</p>';
      return;
    }
    el.innerHTML = packs.map((p) => `
      <div class="lesson-pack-card${viewingId === p.id ? ' is-active' : ''}" data-pack-id="${escapeHtml(p.id)}">
        <div class="lesson-pack-card-head">
          <strong>${escapeHtml(p.name)}</strong>
          <span class="lesson-pack-date">${new Date(p.updatedAt).toLocaleDateString()}</span>
        </div>
        ${p.grade ? `<span class="lesson-pack-tag">${escapeHtml(p.grade)}</span>` : ''}
        ${p.topics ? `<p class="lesson-pack-topics">${escapeHtml(p.topics)}</p>` : ''}
        <div class="lesson-pack-actions">
          <button type="button" class="btn ghost btn-sm" data-pack-view="${escapeHtml(p.id)}">查看</button>
          <button type="button" class="btn ghost btn-sm" data-pack-export="${escapeHtml(p.id)}">导出</button>
          <button type="button" class="btn ghost btn-sm" data-pack-delete="${escapeHtml(p.id)}">删除</button>
        </div>
      </div>`).join('');

    el.querySelectorAll('[data-pack-view]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        viewingId = btn.dataset.packView;
        renderDetail();
        renderList();
      });
    });
    el.querySelectorAll('[data-pack-export]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        exportPack(btn.dataset.packExport);
      });
    });
    el.querySelectorAll('[data-pack-delete]').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        deletePack(btn.dataset.packDelete);
      });
    });
    // 点卡片空白处也可查看
    el.querySelectorAll('.lesson-pack-card').forEach((card) => {
      card.addEventListener('click', async () => {
        viewingId = card.dataset.packId;
        renderDetail();
        renderList();
      });
    });
  }

  function renderDetail() {
    const el = select('#lessonPackDetail');
    if (!el) return;
    if (!viewingId) {
      el.innerHTML = '<p class="quiz-muted">选择左侧备课包查看详情</p>';
      return;
    }
    const pack = packs.find((p) => p.id === viewingId);
    if (!pack) {
      el.innerHTML = '<p class="quiz-muted">备课包不存在</p>';
      return;
    }
    const contents = pack.contents || {};
    const selectedTopics = contents.selectedTopics || [];
    const selectedLabs = contents.selectedLabs || [];
    const labLabels = selectedLabs.map((id) => labTitle(id));

    el.innerHTML = `
      <div class="lesson-pack-detail-head">
        <h3>${escapeHtml(pack.name)}</h3>
        <button type="button" class="btn ghost btn-sm" id="btnPackEdit">编辑</button>
      </div>
      ${pack.grade ? `<p><strong>年级：</strong>${escapeHtml(pack.grade)}</p>` : ''}
      ${pack.topics ? `<p><strong>主题：</strong>${escapeHtml(pack.topics)}</p>` : ''}
      ${pack.notes ? `<p><strong>备注：</strong>${escapeHtml(pack.notes)}</p>` : ''}
      <div class="lesson-pack-contents">
        <h4>包含材料</h4>
        ${selectedTopics.length ? `<p><strong>知识点：</strong>${escapeHtml(selectedTopics.join('、'))}</p>` : ''}
        ${labLabels.length ? `<p><strong>实验：</strong>${escapeHtml(labLabels.join('、'))}</p>` : ''}
        ${!selectedTopics.length && !labLabels.length ? '<p class="quiz-muted">暂无选择材料（编辑时可选知识点与实验）</p>' : ''}
      </div>
      <p class="quiz-muted" style="margin-top:1rem;font-size:0.78rem">创建于 ${new Date(pack.createdAt).toLocaleString()} · 更新于 ${new Date(pack.updatedAt).toLocaleString()}</p>`;

    const editBtn = el.querySelector('#btnPackEdit');
    if (editBtn) {
      editBtn.addEventListener('click', async () => { editingId = viewingId; renderEditor(); });
    }
  }

  function renderEditor() {
    const el = select('#lessonPackEditor');
    if (!el) return;
    const pack = editingId ? packs.find((p) => p.id === editingId) : null;
    const contents = pack?.contents || {};
    editSelectedTopics = [...(contents.selectedTopics || [])];
    editSelectedLabs = [...(contents.selectedLabs || [])];

    el.innerHTML = `
      <h4>${pack ? '编辑备课包' : '新建备课包'}</h4>
      <label class="field"><span>名称</span><input type="text" id="lpEditName" value="${escapeHtml(pack?.name || '')}" placeholder="例如：高一第一章备课" /></label>
      <label class="field"><span>年级</span><input type="text" id="lpEditGrade" value="${escapeHtml(pack?.grade || '')}" placeholder="例如：高一" /></label>
      <label class="field"><span>主题</span><input type="text" id="lpEditTopics" value="${escapeHtml(pack?.topics || '')}" placeholder="例如：物质分类" /></label>
      <label class="field"><span>备注</span><textarea id="lpEditNotes" rows="3" placeholder="教学备注">${escapeHtml(pack?.notes || '')}</textarea></label>
      <div class="lesson-pack-pick">
        <span class="quiz-label">知识点（可多选）</span>
        <div class="quiz-topics lesson-pack-topic-chips" id="lpEditTopicChips" role="group" aria-label="知识点"></div>
      </div>
      <div class="lesson-pack-pick">
        <span class="quiz-label">实验（可多选）</span>
        <div class="quiz-chips lesson-pack-lab-chips" id="lpEditLabChips" role="group" aria-label="实验"></div>
      </div>
      <div class="lesson-pack-editor-actions">
        <button type="button" class="btn" id="btnLpSave">保存</button>
        <button type="button" class="btn ghost" id="btnLpCancel">取消</button>
      </div>`;
    el.hidden = false;

    renderEditorChips();
    el.querySelector('#btnLpSave').addEventListener('click', savePack);
    el.querySelector('#btnLpCancel').addEventListener('click', async () => { el.hidden = true; editingId = null; });
  }

  function renderEditorChips() {
    const topicBox = select('#lpEditTopicChips');
    if (topicBox) {
      topicBox.innerHTML = CHEM_TOPICS.map((t) =>
        `<button type="button" class="quiz-topic${editSelectedTopics.includes(t.label) ? ' is-on' : ''}" data-lp-topic="${escapeHtml(t.label)}">${escapeHtml(t.label)}</button>`,
      ).join('');
      topicBox.querySelectorAll('[data-lp-topic]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const label = btn.dataset.lpTopic;
          editSelectedTopics = editSelectedTopics.includes(label)
            ? editSelectedTopics.filter((x) => x !== label)
            : [...editSelectedTopics, label];
          renderEditorChips();
        });
      });
    }

    const labBox = select('#lpEditLabChips');
    if (labBox) {
      if (!labOptions.length) {
        labBox.innerHTML = '<span class="quiz-muted">暂无实验，请先在「实验探究」中添加</span>';
      } else {
        labBox.innerHTML = labOptions.map((lab) =>
          `<button type="button" class="quiz-chip${editSelectedLabs.includes(lab.id) ? ' is-on' : ''}" data-lp-lab="${escapeHtml(lab.id)}">${escapeHtml(lab.title)}</button>`,
        ).join('');
        labBox.querySelectorAll('[data-lp-lab]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const id = btn.dataset.lpLab;
            editSelectedLabs = editSelectedLabs.includes(id)
              ? editSelectedLabs.filter((x) => x !== id)
              : [...editSelectedLabs, id];
            renderEditorChips();
          });
        });
      }
    }
  }

  async function savePack() {
    const name = select('#lpEditName')?.value?.trim();
    if (!name) { await appAlert('名称不能为空'); return; }
    const payload = {
      name,
      grade: select('#lpEditGrade')?.value?.trim() || '',
      topics: select('#lpEditTopics')?.value?.trim() || '',
      notes: select('#lpEditNotes')?.value?.trim() || '',
      contents: {
        selectedTopics: [...editSelectedTopics],
        selectedLabs: [...editSelectedLabs],
      },
    };
    try {
      if (editingId) {
        await lessonPackApi.update(editingId, payload);
      } else {
        const created = await lessonPackApi.create(payload);
        if (created?.id) viewingId = created.id;
      }
      await loadPacks();
      select('#lessonPackEditor').hidden = true;
      editingId = null;
    } catch (err) {
      await appAlert(`保存失败：${err.message || ''}`);
    }
  }

  async function deletePack(id) {
    const pack = packs.find((p) => p.id === id);
    if (!pack) return;
    if (!(await appConfirm(`确定删除备课包"${pack.name}"？此操作不可撤销。`))) return;
    try {
      await lessonPackApi.remove(id);
      if (viewingId === id) viewingId = null;
      await loadPacks();
    } catch (err) {
      await appAlert(`删除失败：${err.message || ''}`);
    }
  }

  async function exportPack(id) {
    try {
      const data = await lessonPackApi.exportData(id);
      downloadJsonFile(`备课包-${data.metadata?.name || id}.json`, data);
    } catch (err) {
      await appAlert(`导出失败：${err.message || ''}`);
    }
  }

  function handleImport() {
    const input = select('#lessonPackImportInput');
    if (!input) return;
    input.value = '';
    input.click();
  }

  async function onImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const result = await lessonPackApi.importData(data);
      await loadPacks();
      await refreshLabOptions();
      if (result.kind === 'lab-pack') {
        await appAlert(formatLabsImportSummary(result.labsResult || result));
      } else if (result.nameChanged) {
        const lr = result.labsResult;
        const labMsg = lr && (lr.created || lr.skipped || lr.renamed)
          ? `\n\n${formatLabsImportSummary(lr)}`
          : '';
        await appAlert(`备课包已导入，名称改为「${result.pack.name}」以避免冲突。${labMsg}`);
      } else {
        const lr = result.labsResult;
        const labMsg = lr && (lr.created || lr.skipped || lr.renamed || lr.updated)
          ? `\n\n${formatLabsImportSummary(lr)}`
          : '';
        await appAlert(`备课包导入成功。${labMsg}`);
      }
    } catch (err) {
      await appAlert(`导入失败：${err.message || ''}`);
    }
  }

  async function exportLabPackBranch() {
    if (!labsApi?.exportPack) {
      await appAlert('实验包导出不可用');
      return;
    }
    try {
      const data = await labsApi.exportPack();
      downloadJsonFile(`实验包-${new Date().toISOString().slice(0, 10)}.json`, data);
    } catch (err) {
      await appAlert(`导出实验包失败：${err.message || ''}`);
    }
  }

  async function loadPacks() {
    const detail = select('#lessonPackDetail');
    try {
      const data = await lessonPackApi.list();
      packs = data.packs || [];
      renderList();
      if (viewingId) renderDetail();
      else if (detail && !packs.length) {
        detail.innerHTML = '<p class="quiz-muted">选择左侧备课包查看详情。也可使用工具栏导入/导出「实验包」子集。</p>';
      }
    } catch (err) {
      packs = [];
      renderList();
      if (detail) {
        detail.innerHTML = `<p class="quiz-muted">加载失败：${escapeHtml(err.message || '请检查服务是否运行')}</p>`;
      }
    }
  }

  async function init() {
    await refreshLabOptions();
    await loadPacks();
    const importBtn = select('#btnLessonPackImport');
    if (importBtn) importBtn.addEventListener('click', handleImport);
    const importInput = select('#lessonPackImportInput');
    if (importInput) importInput.addEventListener('change', onImportFile);
    const newBtn = select('#btnLessonPackNew');
    if (newBtn) newBtn.addEventListener('click', async () => {
      editingId = null;
      await refreshLabOptions();
      renderEditor();
    });
    const labExportBtn = select('#btnLabPackExport');
    if (labExportBtn) labExportBtn.addEventListener('click', exportLabPackBranch);
  }

  return { init, loadPacks };
}
