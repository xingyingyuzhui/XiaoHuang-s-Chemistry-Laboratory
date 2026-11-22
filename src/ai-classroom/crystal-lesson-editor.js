/**
 * 晶体探究 · 侧滑备课与 AI 生成抽屉（默认隐藏，点击顶栏「备课 / AI」按需滑出）
 * 两个清晰页签：「编排本课」与「✨ AI 一键生成课例」。
 */

import { STAGE_PRESETS, normalizeLessonPlan } from '../crystal/stage-spec/schema.js';

const AI_PRESETS = [
  '对比金刚石与石墨，再对比 NaCl、KCl、MgO、SiO₂ 熔点',
  '高二离子晶体一课时，重点讲受力脆裂与三态导电',
  '晶体与非晶体入门，突出有序结构、自范性与固定熔点',
];

const STAGE_TYPE_LABELS = {
  'dual-3d-compare': '双3D对照',
  'lattice-stress': '3D剪切受力',
  'particle-field': '3D粒子场',
  'thermal-phase': '热成像相变',
  'cell-extract': '3D晶胞提取',
};

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function createCrystalLessonDrawer({
  hostEl, store, aiApi, presets = STAGE_PRESETS, normalizePlan = normalizeLessonPlan,
  getActiveSlideIndex = () => 0, onSelectSlide, onLessonChanged, onMetaChanged, onClose,
}) {
  let activeTab = 'arrange', pickerOpen = false, resetArmed = false, resetTimer = 0;
  let aiTopic = '', aiStepCount = 4, aiBusy = false, aiStatus = '', aiError = false;

  const activeLesson = () => store.getActiveLesson();
  const clampedIdx = (lesson) => {
    const len = lesson?.slides?.length || 0;
    return len ? Math.max(0, Math.min(Number(getActiveSlideIndex()) || 0, len - 1)) : 0;
  };

  function renderPickerGroup(label, category) {
    const items = (Array.isArray(presets) ? presets : []).filter((p) => p.category === category);
    if (!items.length) return '';
    return `<div class="cl-d-picker-group"><div class="cl-d-sublabel">${label}</div><div class="cl-d-chips">${
      items.map((p) => `<button type="button" class="cl-d-chip" data-add-preset="${esc(p.presetId)}" title="${esc(p.summary)}"><span>${esc(p.title)}</span>${p.badge ? `<em>${esc(p.badge)}</em>` : ''}</button>`).join('')
    }</div></div>`;
  }

  function renderArrangeTab(lesson, lessons) {
    const idx = clampedIdx(lesson), slides = lesson.slides || [], cur = slides[idx] || null;
    const canDel = slides.length > 1;
    return `
      <div class="cl-d-block">
        <label class="cl-d-field"><span>当前课例名称</span>
          <input type="text" class="cl-d-input" data-drawer-field="lesson-title" maxlength="60" value="${esc(lesson.title)}" />
        </label>
        <div class="cl-d-toolrow">
          <button type="button" class="cl-d-mini" data-d-act="new-lesson">+ 新建</button>
          <button type="button" class="cl-d-mini" data-d-act="dup-lesson">复制</button>
          <button type="button" class="cl-d-mini" data-d-act="del-lesson" ${lessons.length > 1 ? '' : 'disabled'}>删除</button>
          <button type="button" class="cl-d-mini${resetArmed ? ' is-danger' : ''}" data-d-act="reset-lessons">${resetArmed ? '再点确认' : '恢复默认'}</button>
        </div>
      </div>
      <div class="cl-d-block">
        <div class="cl-d-sec-head">
          <span>探究环节（${slides.length}）</span>
          <button type="button" class="cl-d-link" data-d-act="toggle-picker">${pickerOpen ? '收起环节库' : '+ 添加探究环节'}</button>
        </div>
        <div class="cl-d-picker"${pickerOpen ? '' : ' hidden'}>${renderPickerGroup('认识晶体', 'basics')}${renderPickerGroup('晶体性质', 'properties')}</div>
        <div class="cl-d-slide-list" role="listbox" aria-label="本课探究环节">${slides.map((s, i) => `
          <div class="cl-d-slide-row${i === idx ? ' is-active' : ''}" data-pick-slide="${i}" role="option" aria-selected="${i === idx}">
            <span class="cl-d-num">${i + 1}</span>
            <div class="cl-d-slide-meta">
              <div class="cl-d-slide-name">${esc(s.title)}</div>
              <div class="cl-d-slide-kind">${esc(STAGE_TYPE_LABELS[s.stage?.type] || s.stage?.type || '3D 舞台')}</div>
            </div>
            <div class="cl-d-ops">
              <button type="button" class="cl-d-icon" data-slide-move="${esc(s.id)}:-1" ${i === 0 ? 'disabled' : ''} title="上移" aria-label="上移">↑</button>
              <button type="button" class="cl-d-icon" data-slide-move="${esc(s.id)}:1" ${i === slides.length - 1 ? 'disabled' : ''} title="下移" aria-label="下移">↓</button>
              <button type="button" class="cl-d-icon is-del" data-slide-del="${esc(s.id)}" ${canDel ? '' : 'disabled'} title="删除" aria-label="删除">×</button>
            </div>
          </div>`).join('')}
        </div>
      </div>
      ${cur ? `<div class="cl-d-block">
        <div class="cl-d-sec-head"><span>编辑当前环节（第 ${idx + 1} 步）</span></div>
        <label class="cl-d-field"><span>环节标题</span>
          <input type="text" class="cl-d-input" data-drawer-field="slide-title" maxlength="48" value="${esc(cur.title)}" />
        </label>
        ${cur.qa?.question ? `<div class="cl-d-qa"><strong>思考题</strong><span>${esc(cur.qa.question)}</span></div>` : ''}
      </div>` : ''}`;
  }

  function renderAiTab() {
    return `<form class="cl-d-ai-form">
      <p class="cl-d-ai-desc">描述你想上的晶体探究主题或指定对比物质，AI 将直接编排可交互 3D 舞台与热成像对比实验，并立即放映。</p>
      <label class="cl-d-field"><span>教学主题 / 探究目标</span>
        <textarea class="cl-d-textarea" name="topic" rows="3" maxlength="180" placeholder="例如：对比金刚石与石墨，再对比 NaCl、KCl、MgO、SiO₂ 熔点" ${aiBusy ? 'disabled' : ''}>${esc(aiTopic)}</textarea>
      </label>
      <div class="cl-d-step-row">
        <span>探究步数</span>
        <div class="cl-d-step-pills">${[3, 4, 5].map((n) => `<button type="button" class="cl-d-step-pill${n === aiStepCount ? ' is-active' : ''}" data-ai-count="${n}" ${aiBusy ? 'disabled' : ''}>${n} 步</button>`).join('')}</div>
      </div>
      <button type="submit" class="cl-d-primary" ${aiBusy ? 'disabled' : ''}>${aiBusy ? '正在生成 3D 课例…' : '✨ AI 一键生成并放映'}</button>
      ${aiStatus ? `<div class="cl-d-status${aiError ? ' is-error' : ''}" aria-live="polite">${esc(aiStatus)}</div>` : ''}
      <div class="cl-d-presets">
        <div class="cl-d-sublabel">一键示例主题</div>
        ${AI_PRESETS.map((p) => `<button type="button" class="cl-d-preset" data-ai-preset="${esc(p)}" ${aiBusy ? 'disabled' : ''}>${esc(p)}</button>`).join('')}
      </div>
    </form>`;
  }

  function render() {
    const lessons = store.getLessons(), lesson = activeLesson();
    hostEl.innerHTML = `
      <div class="cl-drawer-head">
        <div class="cl-drawer-tabs" role="tablist">
          <button type="button" class="cl-d-tab${activeTab === 'arrange' ? ' is-active' : ''}" data-d-tab="arrange" role="tab" aria-selected="${activeTab === 'arrange'}">编排本课</button>
          <button type="button" class="cl-d-tab${activeTab === 'ai' ? ' is-active' : ''}" data-d-tab="ai" role="tab" aria-selected="${activeTab === 'ai'}">✨ AI 一键生成课例</button>
        </div>
        <button type="button" class="cl-d-close" data-d-act="close" aria-label="关闭抽屉">×</button>
      </div>
      <div class="cl-drawer-body">${activeTab === 'ai' ? renderAiTab() : renderArrangeTab(lesson, lessons)}</div>`;
  }

  async function runAiGenerate(topicText) {
    aiTopic = String(topicText || '').trim();
    if (!aiTopic) { aiError = true; aiStatus = '请先输入教学主题或对比物质'; render(); return; }
    aiBusy = true; aiError = false; aiStatus = '正在生成可交互 3D 舞台与教学节奏…'; render();
    try {
      const raw = await aiApi.generateCrystalLesson({ topic: aiTopic, stepCount: aiStepCount });
      store.importAiLesson(normalizePlan ? normalizePlan(raw) : raw);
      aiBusy = false; aiStatus = ''; aiError = false; aiTopic = ''; pickerOpen = false; activeTab = 'arrange';
      onLessonChanged?.({ closeDrawer: true, slideIdx: 0 });
    } catch (err) {
      aiBusy = false; aiError = true; aiStatus = err?.message || 'AI 生成课例失败，请检查模型配置后重试'; render();
    }
  }

  const onClick = (e) => {
    const tab = e.target.closest('[data-d-tab]')?.dataset.dTab;
    if (tab && tab !== activeTab) { activeTab = tab; aiError = false; render(); return; }
    const count = e.target.closest('[data-ai-count]')?.dataset.aiCount;
    if (count && !aiBusy) { aiStepCount = Number(count) || 4; render(); return; }
    const presetTopic = e.target.closest('[data-ai-preset]')?.dataset.aiPreset;
    if (presetTopic && !aiBusy) { runAiGenerate(presetTopic); return; }

    const addPresetId = e.target.closest('[data-add-preset]')?.dataset.addPreset;
    if (addPresetId) {
      const lesson = activeLesson();
      const preset = (Array.isArray(presets) ? presets : []).find((p) => p.presetId === addPresetId) || addPresetId;
      if (store.addSlide(lesson.id, preset)) {
        pickerOpen = false; onLessonChanged?.({ closeDrawer: false, slideIdx: lesson.slides.length - 1 }); render();
      }
      return;
    }

    const moveSpec = e.target.closest('[data-slide-move]')?.dataset.slideMove;
    if (moveSpec) {
      const sep = moveSpec.lastIndexOf(':');
      const slideId = moveSpec.slice(0, sep), delta = Number(moveSpec.slice(sep + 1));
      const lesson = activeLesson(), curId = lesson.slides[clampedIdx(lesson)]?.id;
      if (store.reorderSlide(lesson.id, slideId, delta)) {
        onSelectSlide?.(Math.max(0, lesson.slides.findIndex((s) => s.id === curId)), { keepStageIfSame: true });
        render();
      }
      return;
    }

    const delId = e.target.closest('[data-slide-del]')?.dataset.slideDel;
    if (delId) {
      const lesson = activeLesson(), prevIdx = clampedIdx(lesson);
      if (store.removeSlide(lesson.id, delId)) {
        onLessonChanged?.({ closeDrawer: false, slideIdx: Math.min(prevIdx, lesson.slides.length - 1) }); render();
      }
      return;
    }

    const pickRow = e.target.closest('[data-pick-slide]');
    if (pickRow && !e.target.closest('.cl-d-ops')) {
      const nextIdx = Number(pickRow.dataset.pickSlide);
      if (Number.isFinite(nextIdx)) { onSelectSlide?.(nextIdx); render(); }
      return;
    }

    const act = e.target.closest('[data-d-act]')?.dataset.dAct;
    if (!act) return;
    if (act === 'close') { onClose?.(); return; }
    if (act === 'toggle-picker') { pickerOpen = !pickerOpen; render(); return; }
    if (act === 'new-lesson') {
      store.createLesson({ title: '自定义晶体探究课例' }); pickerOpen = false;
      onLessonChanged?.({ closeDrawer: false, slideIdx: 0 }); render();
      hostEl.querySelector('[data-drawer-field="lesson-title"]')?.select?.();
    } else if (act === 'dup-lesson' && store.duplicateLesson(activeLesson().id)) {
      onLessonChanged?.({ closeDrawer: false, slideIdx: 0 }); render();
    } else if (act === 'del-lesson' && store.deleteLesson(activeLesson().id)) {
      onLessonChanged?.({ closeDrawer: false, slideIdx: 0 }); render();
    } else if (act === 'reset-lessons') {
      clearTimeout(resetTimer);
      if (!resetArmed) { resetArmed = true; resetTimer = setTimeout(() => { resetArmed = false; render(); }, 3500); render(); }
      else { resetArmed = false; store.resetDefaults(); onLessonChanged?.({ closeDrawer: false, slideIdx: 0 }); render(); }
    }
  };

  const onInput = (e) => {
    if (e.target.name === 'topic') { aiTopic = e.target.value; return; }
    const field = e.target.dataset?.drawerField;
    if (!field) return;
    const lesson = activeLesson();
    if (field === 'lesson-title') { if (store.renameLesson(lesson.id, e.target.value)) onMetaChanged?.(); return; }
    const idx = clampedIdx(lesson), slide = lesson.slides[idx];
    if (!slide) return;
    if (field === 'slide-title') {
      const updated = store.updateSlide(lesson.id, slide.id, { title: e.target.value });
      if (updated) {
        const el = hostEl.querySelector(`.cl-d-slide-row[data-pick-slide="${idx}"] .cl-d-slide-name`);
        if (el) el.textContent = updated.title;
        onMetaChanged?.();
      }
    }
  };

  const onSubmit = (e) => {
    if (!e.target.classList.contains('cl-d-ai-form')) return;
    e.preventDefault();
    if (!aiBusy) runAiGenerate(new FormData(e.target).get('topic'));
  };

  hostEl.addEventListener('click', onClick);
  hostEl.addEventListener('input', onInput);
  hostEl.addEventListener('submit', onSubmit);

  return {
    render,
    setTab(tab) { activeTab = tab === 'ai' ? 'ai' : 'arrange'; render(); },
    destroy() {
      clearTimeout(resetTimer);
      hostEl.removeEventListener('click', onClick);
      hostEl.removeEventListener('input', onInput);
      hostEl.removeEventListener('submit', onSubmit);
      hostEl.innerHTML = '';
    },
  };
}

export { createCrystalLessonDrawer as createCrystalLessonEditor };
