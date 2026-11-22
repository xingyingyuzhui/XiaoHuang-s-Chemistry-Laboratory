/**
 * 晶体探究 · 课前备课态（Prep Mode）控制器
 * 负责：课例胶囊栏、✨ AI 一键排课抽屉、左侧环节排序与舞台选择器、右侧步骤编辑与按需实时预览。
 */

const AI_PRESETS = [
  '高二离子晶体一课时，重点讲脆性与导电性',
  '晶体与非晶体入门一课时，突出有序与固定熔点',
  '四大晶体类型熔点对比与氢键反常专题',
];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function createCrystalLessonEditor({ hostEl, store, stageCatalog, mountStage, aiApi, onStartTeach, onContextChange }) {
  const stageMap = new Map(stageCatalog.map((s) => [s.id, s]));
  let selectedStepId = '', aiOpen = false, aiBusy = false, aiStatus = '', aiError = false, aiTopic = '', aiStepCount = 4;
  let pickerOpen = false, previewOpen = false, resetArmed = false, resetTimer = 0, previewInstance = null;

  const activeLesson = () => store.getActiveLesson();

  function ensureSelectedStep() {
    const lesson = activeLesson();
    if (!lesson?.steps?.length) { selectedStepId = ''; return null; }
    const hit = lesson.steps.find((s) => s.id === selectedStepId);
    if (hit) return hit;
    selectedStepId = lesson.steps[0].id;
    return lesson.steps[0];
  }

  function destroyPreview() {
    if (!previewInstance) return;
    try { previewInstance.destroy?.(); } catch { /* ignore */ }
    previewInstance = null;
  }

  function mountPreviewIfOpen() {
    destroyPreview();
    if (!previewOpen) return;
    const step = ensureSelectedStep();
    const vp = hostEl.querySelector('.cl-preview-viewport');
    const bar = hostEl.querySelector('.cl-preview-actionbar');
    if (step && vp && bar) previewInstance = mountStage(step.stageId, vp, bar, {});
  }

  const renderPickerGroup = (label, cat) => `<div class="cl-picker-group"><div class="cl-picker-label">${label}</div><div class="cl-picker-chips">${
    stageCatalog.filter((s) => s.category === cat).map((s) =>
      `<button type="button" class="cl-picker-chip" data-add-stage="${esc(s.id)}" title="${esc(s.summary)}"><span>${esc(s.title)}</span>${s.badge ? `<em>${esc(s.badge)}</em>` : ''}</button>`
    ).join('')
  }</div></div>`;

  function renderStepRows(lesson) {
    if (!lesson.steps.length) return '<div class="cl-empty-hint">暂无环节，请点击下方「+ 添加互动环节」</div>';
    return lesson.steps.map((s, i) => {
      const meta = stageMap.get(s.stageId);
      const sel = s.id === selectedStepId;
      return `<div class="cl-step-row${sel ? ' is-selected' : ''}" data-step-id="${esc(s.id)}" role="option" aria-selected="${sel}">
        <span class="cl-step-num">${i + 1}</span>
        <div class="cl-step-main"><div class="cl-step-title">${esc(s.title)}</div><div class="cl-step-sub">${esc(meta?.title || s.stageId)}${meta?.badge ? ` · ${esc(meta.badge)}` : ''}</div></div>
        <div class="cl-step-ops">
          <button type="button" class="cl-icon-btn" data-step-up="${esc(s.id)}" ${i === 0 ? 'disabled' : ''} title="上移" aria-label="上移">↑</button>
          <button type="button" class="cl-icon-btn" data-step-down="${esc(s.id)}" ${i === lesson.steps.length - 1 ? 'disabled' : ''} title="下移" aria-label="下移">↓</button>
          <button type="button" class="cl-icon-btn is-del" data-step-del="${esc(s.id)}" title="移除" aria-label="移除">×</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderDetail(step) {
    if (!step) return '<div class="cl-empty-panel">请从左侧添加互动环节，或点击「✨ AI 一键排课」自动生成整节晶体课例。</div>';
    const stage = stageMap.get(step.stageId);
    const qa = step.qa || stage?.qa || null;
    return `
      <div class="cl-detail-head">
        <div class="cl-detail-tags">
          <span class="crystal-tag">${stage?.category === 'properties' ? '晶体性质' : '认识晶体'}</span>
          ${stage?.badge ? `<span class="crystal-tag crystal-tag-qa">${esc(stage.badge)}</span>` : ''}
          <span class="cl-detail-stage-name">${esc(stage?.title || step.stageId)}</span>
        </div>
        <div class="cl-detail-btns">
          <button type="button" class="crystal-btn crystal-btn-sm crystal-btn-ghost${previewOpen ? ' is-active' : ''}" data-action="toggle-preview">${previewOpen ? '收起实时预览' : '实时预览舞台'}</button>
          <button type="button" class="crystal-btn crystal-btn-sm crystal-btn-primary" data-action="start-here">从此步上课</button>
        </div>
      </div>
      ${stage?.summary ? `<p class="cl-detail-summary">${esc(stage.summary)}</p>` : ''}
      <div class="cl-preview-wrap"${previewOpen ? '' : ' hidden'}>
        <div class="crystal-stage-viewport cl-preview-viewport"></div>
        <div class="crystal-actionbar cl-preview-actionbar"></div>
      </div>
      <label class="cl-field"><span>步骤标题（授课时显示在顶部进度条）</span>
        <input type="text" class="cl-field-input" data-field="title" maxlength="48" value="${esc(step.title)}" />
      </label>
      <label class="cl-field"><span>教师讲授提词（课前备忘：什么时候停下来提问）</span>
        <textarea class="cl-field-textarea" data-field="teacherNote" rows="3" maxlength="260" placeholder="例如：点击敲击后暂停，请学生对比金属滑移与食盐碎裂的微观原因…">${esc(step.teacherNote)}</textarea>
      </label>
      ${qa ? `<div class="cl-qa-preview"><strong>随堂思考题</strong><span>${esc(qa.question)}</span></div>` : ''}`;
  }

  function render() {
    destroyPreview();
    const lessons = store.getLessons();
    const lesson = activeLesson();
    const step = ensureSelectedStep();

    hostEl.innerHTML = `
      <header class="cl-prep-bar">
        <div class="cl-lesson-pills" role="tablist" aria-label="晶体探究课例列表">
          ${lessons.map((l) => `<button type="button" class="cl-lesson-pill${l.id === lesson.id ? ' is-active' : ''}" data-lesson-id="${esc(l.id)}" role="tab" aria-selected="${l.id === lesson.id}">${l.aiGenerated ? '<em class="cl-mini-ai">AI</em>' : ''}<span>${esc(l.title)}</span></button>`).join('')}
        </div>
        <div class="cl-prep-actions">
          <button type="button" class="crystal-btn crystal-btn-sm crystal-btn-ghost cl-btn-ai${aiOpen ? ' is-active' : ''}" data-action="toggle-ai">✨ AI 一键排课</button>
          <button type="button" class="crystal-btn crystal-btn-sm crystal-btn-ghost" data-action="new-lesson">+ 新建课例</button>
          <button type="button" class="crystal-btn crystal-btn-sm crystal-btn-primary cl-btn-start" data-action="start-teach" ${lesson.steps.length ? '' : 'disabled'}>▶ 开始上课</button>
        </div>
      </header>
      <section class="cl-ai-drawer"${aiOpen ? '' : ' hidden'} aria-label="AI 一键排课">
        <div class="cl-ai-head"><strong>✨ AI 一键排课 · 自动匹配内置 3D 晶体互动环节</strong><button type="button" class="cl-icon-btn" data-action="close-ai" aria-label="关闭">×</button></div>
        <form class="cl-ai-form">
          <input type="text" class="cl-ai-input" name="topic" maxlength="160" value="${esc(aiTopic)}" placeholder="输入本节主题或重点，如：高二离子晶体一课时，重点讲脆性与导电性" ${aiBusy ? 'disabled' : ''} />
          <select class="cl-ai-count" name="stepCount" aria-label="环节数量" ${aiBusy ? 'disabled' : ''}>${[3, 4, 5].map((n) => `<option value="${n}"${n === aiStepCount ? ' selected' : ''}>${n} 步</option>`).join('')}</select>
          <button type="submit" class="crystal-btn crystal-btn-sm crystal-btn-primary" ${aiBusy ? 'disabled' : ''}>${aiBusy ? '排课中…' : '生成课例'}</button>
        </form>
        <div class="cl-ai-presets"><span>快捷选题：</span>${AI_PRESETS.map((p) => `<button type="button" class="cl-preset-chip" data-ai-preset="${esc(p)}" ${aiBusy ? 'disabled' : ''}>${esc(p)}</button>`).join('')}</div>
        ${aiStatus ? `<div class="cl-ai-status${aiError ? ' is-error' : ''}" aria-live="polite">${esc(aiStatus)}</div>` : ''}
      </section>
      <div class="cl-prep-grid">
        <aside class="cl-prep-left">
          <div class="cl-lesson-meta">
            <input type="text" class="cl-lesson-title-input" value="${esc(lesson.title)}" maxlength="60" aria-label="课例名称" />
            <div class="cl-lesson-tools">
              <button type="button" class="cl-mini-btn" data-action="dup-lesson">复制</button>
              <button type="button" class="cl-mini-btn" data-action="del-lesson" ${lessons.length > 1 ? '' : 'disabled'}>删除</button>
              <button type="button" class="cl-mini-btn${resetArmed ? ' is-danger' : ''}" data-action="reset-lessons">${resetArmed ? '再点确认' : '恢复默认'}</button>
            </div>
          </div>
          <div class="cl-step-list" role="listbox" aria-label="课堂环节顺序">${renderStepRows(lesson)}</div>
          <div class="cl-picker-bar"><button type="button" class="crystal-btn crystal-btn-sm crystal-btn-ghost cl-add-step-btn" data-action="toggle-picker">${pickerOpen ? '收起环节库' : '+ 添加互动环节'}</button></div>
          <div class="cl-stage-picker"${pickerOpen ? '' : ' hidden'}>${renderPickerGroup('认识晶体 (6)', 'basics')}${renderPickerGroup('晶体性质 (4)', 'properties')}</div>
        </aside>
        <section class="cl-prep-right">${renderDetail(step)}</section>
      </div>`;

    mountPreviewIfOpen();
    onContextChange?.();
  }

  async function runAiGenerate(topicText, stepCount) {
    aiTopic = String(topicText || '').trim();
    aiStepCount = Number(stepCount) || 4;
    if (!aiTopic) { aiStatus = '请先输入本节课的主题或教学重点'; aiError = true; render(); return; }
    aiBusy = true; aiError = false; aiStatus = '小黄正在结合 10 个 3D 晶体舞台为您排课…';
    render();
    try {
      const plan = await aiApi.generateCrystalLesson({ topic: aiTopic, stepCount: aiStepCount });
      const created = store.createLesson({ title: plan.title, steps: plan.steps, aiGenerated: true });
      selectedStepId = created.steps[0]?.id || '';
      aiOpen = false; aiBusy = false; aiStatus = ''; aiTopic = ''; pickerOpen = false; previewOpen = false;
      render();
    } catch (err) {
      aiBusy = false; aiError = true; aiStatus = err?.message || 'AI 一键排课失败，请检查 AI 配置后重试';
      render();
    }
  }

  const onClick = (e) => {
    const lessonId = e.target.closest('[data-lesson-id]')?.dataset.lessonId;
    if (lessonId) { store.setActiveLesson(lessonId); selectedStepId = ''; previewOpen = false; render(); return; }
    const preset = e.target.closest('[data-ai-preset]')?.dataset.aiPreset;
    if (preset && !aiBusy) { runAiGenerate(preset, hostEl.querySelector('.cl-ai-count')?.value || 4); return; }
    const stageId = e.target.closest('[data-add-stage]')?.dataset.addStage;
    if (stageId) {
      const added = store.addStep(activeLesson().id, stageMap.get(stageId) || stageId);
      if (added) { selectedStepId = added.id; pickerOpen = false; render(); }
      return;
    }
    const up = e.target.closest('[data-step-up]')?.dataset.stepUp;
    if (up) { store.reorderStep(activeLesson().id, up, -1); render(); return; }
    const down = e.target.closest('[data-step-down]')?.dataset.stepDown;
    if (down) { store.reorderStep(activeLesson().id, down, 1); render(); return; }
    const del = e.target.closest('[data-step-del]')?.dataset.stepDel;
    if (del) { store.removeStep(activeLesson().id, del); if (selectedStepId === del) selectedStepId = ''; render(); return; }
    const row = e.target.closest('[data-step-id]');
    if (row && !e.target.closest('.cl-step-ops')) {
      if (selectedStepId !== row.dataset.stepId) { selectedStepId = row.dataset.stepId; render(); }
      return;
    }
    const act = e.target.closest('[data-action]')?.dataset.action;
    if (!act) return;
    if (act === 'toggle-ai') { aiOpen = !aiOpen; aiError = false; render(); }
    else if (act === 'close-ai') { aiOpen = false; render(); }
    else if (act === 'new-lesson') {
      const created = store.createLesson({ title: '自定义晶体探究课例' });
      selectedStepId = created.steps[0]?.id || ''; previewOpen = false; render();
      hostEl.querySelector('.cl-lesson-title-input')?.select?.();
    } else if (act === 'dup-lesson') {
      const copy = store.duplicateLesson(activeLesson().id);
      if (copy) { selectedStepId = copy.steps[0]?.id || ''; render(); }
    } else if (act === 'del-lesson') {
      if (store.deleteLesson(activeLesson().id)) { selectedStepId = ''; previewOpen = false; render(); }
    } else if (act === 'reset-lessons') {
      clearTimeout(resetTimer);
      if (!resetArmed) {
        resetArmed = true;
        resetTimer = setTimeout(() => { resetArmed = false; render(); }, 3500);
        render();
      } else {
        resetArmed = false; store.resetDefaults(); selectedStepId = ''; previewOpen = false; render();
      }
    } else if (act === 'toggle-picker') { pickerOpen = !pickerOpen; render(); }
    else if (act === 'toggle-preview') { previewOpen = !previewOpen; render(); }
    else if (act === 'start-teach' || act === 'start-here') {
      const idx = act === 'start-here' ? Math.max(0, activeLesson().steps.findIndex((s) => s.id === selectedStepId)) : 0;
      destroyPreview(); previewOpen = false; onStartTeach?.(idx);
    }
  };

  const onInput = (e) => {
    const lesson = activeLesson();
    if (e.target.classList.contains('cl-lesson-title-input')) {
      if (store.renameLesson(lesson.id, e.target.value)) {
        const span = hostEl.querySelector(`.cl-lesson-pill[data-lesson-id="${lesson.id}"] span`);
        if (span) span.textContent = lesson.title;
      }
      return;
    }
    const field = e.target.dataset?.field;
    if (!field || !selectedStepId) return;
    const updated = store.updateStep(lesson.id, selectedStepId, { [field]: e.target.value });
    if (updated && field === 'title') {
      const el = hostEl.querySelector(`.cl-step-row[data-step-id="${selectedStepId}"] .cl-step-title`);
      if (el) el.textContent = updated.title;
      onContextChange?.();
    }
  };

  const onSubmit = (e) => {
    if (!e.target.classList.contains('cl-ai-form')) return;
    e.preventDefault();
    if (aiBusy) return;
    const fd = new FormData(e.target);
    runAiGenerate(fd.get('topic'), fd.get('stepCount'));
  };

  hostEl.addEventListener('click', onClick);
  hostEl.addEventListener('input', onInput);
  hostEl.addEventListener('submit', onSubmit);

  return {
    render,
    getSelectedStep: () => ensureSelectedStep(),
    getSelectedIndex: () => Math.max(0, activeLesson().steps.findIndex((s) => s.id === selectedStepId)),
    pausePreview: () => previewInstance?.pause?.(),
    resumePreview: () => { previewInstance?.resume?.(); previewInstance?.resize?.(); },
    closePreview: () => { previewOpen = false; destroyPreview(); },
    resizePreview: () => previewInstance?.resize?.(),
    destroy() {
      clearTimeout(resetTimer);
      destroyPreview();
      hostEl.removeEventListener('click', onClick);
      hostEl.removeEventListener('input', onInput);
      hostEl.removeEventListener('submit', onSubmit);
      hostEl.innerHTML = '';
    },
  };
}
