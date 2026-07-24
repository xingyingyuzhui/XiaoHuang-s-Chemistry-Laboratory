/**
 * 课堂 · 随机点名
 * 本地名单 + 卡牌轮转动画
 */

import { studentApi } from './api/client.js';

const $ = (sel) => document.querySelector(sel);

/** @type {Array<{id:string,name:string}>} */
let students = [];
let spinning = false;
let spinTimer = 0;
let lastWinner = null;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setStatus(text, ok) {
  const el = $('#rollcallStatus');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'quiz-status' + (text ? (ok ? ' is-ok' : ' is-err') : '');
}

function parseNamesFromText(raw) {
  const text = String(raw || '');
  const lines = text.split(/[\n\r]+/);
  const names = [];
  for (const line of lines) {
    let part = line.trim();
    if (!part) continue;
    // CSV：取第一列
    if (part.includes(',')) part = part.split(',')[0].trim();
    if (part.includes('\t')) part = part.split('\t')[0].trim();
    // 去引号
    part = part.replace(/^["']|["']$/g, '').trim();
    if (part && !/^(name|姓名|名字)$/i.test(part)) names.push(part);
  }
  return names;
}

export async function loadStudents() {
  try {
    students = (await studentApi.getList()) || [];
  } catch (err) {
    students = [];
    setStatus(err.message || '加载名单失败', false);
  }
  renderStudentList();
  return students;
}

function renderStudentList() {
  const list = $('#rollcallStudentList');
  if (!list) return;
  if (!students.length) {
    list.innerHTML = `<li class="rollcall-empty">暂无同学，请添加或导入</li>`;
    return;
  }
  list.innerHTML = students
    .map(
      (s) => `
    <li class="rollcall-student" data-id="${escapeHtml(s.id)}">
      <span class="rollcall-student-name">${escapeHtml(s.name)}</span>
      <span class="rollcall-student-acts">
        <button type="button" class="btn ghost btn-sm" data-edit="${escapeHtml(s.id)}">改</button>
        <button type="button" class="btn ghost btn-sm" data-del="${escapeHtml(s.id)}">删</button>
      </span>
    </li>`,
    )
    .join('');

  list.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.edit;
      const stu = students.find((x) => x.id === id);
      if (!stu) return;
      const next = window.prompt('修改姓名', stu.name);
      if (next == null) return;
      const name = next.trim();
      if (!name) return;
      try {
        await studentApi.update(id, name);
        await loadStudents();
        setStatus('已更新', true);
      } catch (err) {
        setStatus(err.message || '更新失败', false);
      }
    });
  });
  list.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.del;
      if (!window.confirm('删除该同学？')) return;
      try {
        await studentApi.remove(id);
        await loadStudents();
        setStatus('已删除', true);
      } catch (err) {
        setStatus(err.message || '删除失败', false);
      }
    });
  });
}

function setCardName(name, phase = '') {
  const card = $('#rollcallCard');
  const nameEl = $('#rollcallCardName');
  if (nameEl) nameEl.textContent = name || '—';
  if (card) {
    card.dataset.phase = phase;
    card.classList.toggle('is-spinning', phase === 'spin');
    card.classList.toggle('is-winner', phase === 'win');
  }
}

function stopSpin() {
  spinning = false;
  window.clearTimeout(spinTimer);
  spinTimer = 0;
}

/**
 * 卡牌轮转：越来越慢，最后定格
 */
function spinToWinner() {
  if (spinning) return;
  if (students.length < 1) {
    setStatus('请先添加至少 1 位同学', false);
    return;
  }
  stopSpin();
  spinning = true;
  const btn = $('#btnRollcallSpin');
  const again = $('#btnRollcallAgain');
  if (btn) btn.disabled = true;
  if (again) again.hidden = true;
  setStatus('点名中…', true);

  // 尽量不与上次相同（≥2 人时）
  let pool = students;
  if (students.length > 1 && lastWinner) {
    const filtered = students.filter((s) => s.id !== lastWinner.id);
    if (filtered.length) pool = filtered;
  }
  const winner = pool[Math.floor(Math.random() * pool.length)];

  const totalTicks = 28 + Math.floor(Math.random() * 12);
  let tick = 0;
  let delay = 40;

  const step = () => {
    if (!spinning) return;
    const show =
      tick >= totalTicks - 1
        ? winner
        : students[Math.floor(Math.random() * students.length)];
    setCardName(show.name, tick >= totalTicks - 1 ? 'win' : 'spin');

    // 轻微 3D 翻转感
    const card = $('#rollcallCard');
    if (card && tick < totalTicks - 1) {
      card.style.setProperty('--flip', `${(tick % 2 === 0 ? 8 : -8) + tick * 0.3}deg`);
    }

    tick += 1;
    if (tick >= totalTicks) {
      spinning = false;
      lastWinner = winner;
      setCardName(winner.name, 'win');
      if (card) card.style.setProperty('--flip', '0deg');
      setStatus(`幸运同学：${winner.name}`, true);
      if (btn) btn.disabled = false;
      if (again) again.hidden = false;
      return;
    }
    delay = Math.min(220, 40 + tick * tick * 0.35);
    spinTimer = window.setTimeout(step, delay);
  };

  step();
}

export function initRollcall() {
  $('#btnRollcallSpin')?.addEventListener('click', spinToWinner);
  $('#btnRollcallAgain')?.addEventListener('click', spinToWinner);

  $('#btnRollcallAdd')?.addEventListener('click', async () => {
    const input = $('#rollcallNameInput');
    const name = input?.value?.trim();
    if (!name) {
      setStatus('请输入姓名', false);
      return;
    }
    try {
      await studentApi.add(name);
      if (input) input.value = '';
      await loadStudents();
      setStatus('已添加', true);
    } catch (err) {
      setStatus(err.message || '添加失败', false);
    }
  });

  $('#rollcallNameInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      $('#btnRollcallAdd')?.click();
    }
  });

  const doImport = async (mode) => {
    const names = parseNamesFromText($('#rollcallImportText')?.value);
    if (!names.length) {
      setStatus('没有解析到姓名', false);
      return;
    }
    if (mode === 'replace' && !window.confirm(`将清空现有名单并导入 ${names.length} 人，确定？`)) {
      return;
    }
    try {
      const data = await studentApi.importNames(names, mode);
      await loadStudents();
      setStatus(`已导入 ${data?.count ?? names.length} 人`, true);
      const ta = $('#rollcallImportText');
      if (ta) ta.value = '';
    } catch (err) {
      setStatus(err.message || '导入失败', false);
    }
  };

  $('#btnRollcallImportAppend')?.addEventListener('click', () => doImport('append'));
  $('#btnRollcallImportReplace')?.addEventListener('click', () => doImport('replace'));
}

export async function onRollcallSectionEnter() {
  await loadStudents();
  if (students.length && !lastWinner) {
    setCardName('准备就绪', '');
    const nameEl = $('#rollcallCardName');
    if (nameEl) nameEl.textContent = `${students.length} 人`;
  }
}
