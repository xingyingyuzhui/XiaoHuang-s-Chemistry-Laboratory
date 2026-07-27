/**
 * 实验探究：纯数据 / 草稿转换（无 DOM）
 * 与 server/utils/lab-schema 对齐：保存前不造占位教学内容。
 */

export const PROGRESS_KEY = 'lab-prestudy-progress';
export const SESSION_KEY = 'lab-explore-session';
export const DRAWER_KEY = 'lab-drawer-collapsed';

export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveProgress(progress) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    /* ignore quota */
  }
}

export function loadSession() {
  try {
    return JSON.parse(sessionStorage.getItem(SESSION_KEY) || '{}');
  } catch {
    return {};
  }
}

export function saveSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}

export function emptyStep() {
  return {
    label: '',
    tip: '',
    risk: '',
    enablePredict: true,
    question: '',
    options: ['', '', '', ''],
    answer: 0,
    explanation: '',
  };
}

/** lab API 对象 → 脚本编辑草稿（脚本步骤与预习题按索引对齐） */
export function labToDraft(lab) {
  if (!lab) {
    return {
      isNew: true,
      title: '',
      type: '',
      equation: '',
      safety: '',
      phenomena: '',
      objective: '',
      reagents: '',
      apparatus: '',
      summary: '',
      steps: [emptyStep()],
    };
  }
  const scriptSteps = Array.isArray(lab.steps) ? lab.steps : [];
  const pre = lab.prestudy || {};
  const preSteps = Array.isArray(pre.steps) ? pre.steps : [];
  const n = Math.max(scriptSteps.length, preSteps.length, 1);
  const steps = [];
  for (let i = 0; i < n; i++) {
    const s = scriptSteps[i];
    const p = preSteps[i] || {};
    const label = (typeof s === 'string' ? s : s?.label) || p.label || '';
    const tip = (typeof s === 'string' ? '' : s?.tip) || p.tip || '';
    const pred = p.predict;
    const opts = Array.isArray(pred?.options) ? [...pred.options] : ['', '', '', ''];
    while (opts.length < 4) opts.push('');
    steps.push({
      label,
      tip,
      risk: p.risk || '',
      enablePredict: !!pred,
      question: pred?.question || '',
      options: opts.slice(0, 4),
      answer: typeof pred?.answer === 'number' ? pred.answer : 0,
      explanation: pred?.explanation || '',
    });
  }
  return {
    isNew: false,
    id: lab.id,
    source: lab.source,
    title: lab.title || '',
    type: lab.type || '',
    equation: lab.equation || '',
    safety: lab.safety || '',
    phenomena: lab.phenomena || '',
    objective: pre.objective || '',
    reagents: Array.isArray(pre.reagents) ? pre.reagents.join('、') : '',
    apparatus: Array.isArray(pre.apparatus) ? pre.apparatus.join('、') : '',
    summary: pre.summary || '',
    steps,
  };
}

/**
 * 草稿 → API payload。不合格返回 { ok:false, reason }，不造占位教学内容。
 * @returns {{ ok: true, payload: object } | { ok: false, reason: string }}
 */
export function draftToPayload(draft) {
  const title = String(draft?.title || '').trim();
  if (!title) return { ok: false, reason: '名称不能为空' };

  const rawSteps = draft.steps || [];
  if (!rawSteps.length) return { ok: false, reason: '至少需要 1 个步骤' };

  const steps = [];
  const preSteps = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const st = rawSteps[i];
    const label = (st.label || '').trim();
    if (!label) return { ok: false, reason: `步骤 ${i + 1} 标题不能为空` };
    const tip = (st.tip || '').trim();
    steps.push({ label, tip });

    const base = { label, tip };
    if (st.risk) base.risk = String(st.risk).trim();
    if (st.enablePredict) {
      const question = String(st.question || '').trim();
      if (!question) return { ok: false, reason: `步骤 ${i + 1}：预习题干不能为空` };
      const options = (st.options || []).slice(0, 4).map((o) => String(o || '').trim());
      if (options.length !== 4 || options.some((o) => !o)) {
        return { ok: false, reason: `步骤 ${i + 1}：预习题须填满 4 个非空选项` };
      }
      const answer = Number(st.answer);
      if (!Number.isInteger(answer) || answer < 0 || answer > 3) {
        return { ok: false, reason: `步骤 ${i + 1}：请选择正确答案` };
      }
      base.predict = {
        question,
        options,
        answer,
        explanation: String(st.explanation || '').trim(),
      };
    }
    preSteps.push(base);
  }

  const hasAnyPredict = preSteps.some((s) => s.predict);
  const reagents = String(draft.reagents || '')
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const apparatus = String(draft.apparatus || '')
    .split(/[、,，]/)
    .map((s) => s.trim())
    .filter(Boolean);

  let prestudy = null;
  if (hasAnyPredict || draft.objective || reagents.length || apparatus.length || draft.summary) {
    prestudy = {
      objective: String(draft.objective || '').trim(),
      reagents,
      apparatus,
      steps: preSteps,
      summary: String(draft.summary || '').trim(),
    };
  }

  return {
    ok: true,
    payload: {
      title,
      type: String(draft.type || '').trim(),
      equation: String(draft.equation || '').trim(),
      safety: String(draft.safety || '').trim(),
      phenomena: String(draft.phenomena || '').trim(),
      steps,
      prestudy,
    },
  };
}

export function prestudySteps(lab) {
  const steps = lab?.prestudy?.steps;
  return Array.isArray(steps) ? steps : [];
}

export function prestudyStats(lab, progress) {
  const steps = prestudySteps(lab);
  if (!steps.length) return { hasConfig: false, done: 0, total: 0 };
  const saved = progress[lab.id] || {};
  return {
    hasConfig: true,
    done: Object.keys(saved).length,
    total: steps.length,
  };
}

/**
 * 导入结果文案（实验包 / 备课包同步 labs 共用）
 * @param {{ created?: number, renamed?: number, skipped?: number, updated?: number, errors?: string[] }} result
 */
export function formatLabsImportSummary(result) {
  const created = Number(result?.created) || 0;
  const renamed = Number(result?.renamed) || 0;
  const skipped = Number(result?.skipped) || 0;
  const updated = Number(result?.updated) || 0;
  const errors = Array.isArray(result?.errors) ? result.errors.filter(Boolean) : [];

  if (!created && !updated && skipped) {
    const head = '没有成功导入任何实验';
    if (!errors.length) return head;
    const show = errors.slice(0, 3).join('\n');
    const more = errors.length > 3 ? `\n…另有 ${errors.length - 3} 条` : '';
    return `${head}：\n${show}${more}`;
  }

  const parts = [`新增 ${created}`];
  if (renamed > 0) {
    parts.push(`${renamed} 条因 id 已存在，已用新 id 并标题加「（导入）」`);
  }
  if (skipped > 0) parts.push(`跳过 ${skipped}`);
  if (updated > 0) parts.push(`更新 ${updated}`);

  let msg = `导入完成：${parts.join('；')}`;
  if (errors.length) {
    const show = errors.slice(0, 3).join('\n');
    const more = errors.length > 3 ? `\n…另有 ${errors.length - 3} 条` : '';
    msg += `\n\n未导入原因：\n${show}${more}`;
  }
  return msg;
}

/** 触发浏览器下载 JSON */
export function downloadJsonFile(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
