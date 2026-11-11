/**
 * 课堂 · 随机点名
 * 本地名单 + 卡牌轮转动画
 */

import { studentApi } from './api/client.js';
import { appConfirm, appPrompt } from './app-dialog.js';

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
  renderRoster();
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
      const next = await appPrompt('修改姓名', stu.name, {
        title: '编辑同学',
        inputLabel: '姓名',
        okText: '保存',
      });
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
      const ok = await appConfirm('删除该同学？', {
        title: '删除同学',
        okText: '删除',
        danger: true,
      });
      if (!ok) return;
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

/** 本轮已点过的同学 id：全班点完一轮前不重复 */
const called = new Set();

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function setCardName(name, phase = '', label = '') {
  const card = $('#rollcallCard');
  const nameEl = $('#rollcallCardName');
  const labelEl = $('#rollcallLabel');
  if (labelEl) {
    labelEl.textContent =
      label || (phase === 'spin' ? '点名中' : phase === 'win' ? '就是你' : '准备就绪');
  }
  if (nameEl) {
    nameEl.textContent = name || '—';
    if (phase === 'spin' || phase === 'win') {
      // 每次换名字从上方滑入（老虎机滚轴）；落定时用回弹
      nameEl.classList.remove('is-tick', 'is-land');
      void nameEl.offsetWidth;
      nameEl.classList.add(phase === 'win' ? 'is-land' : 'is-tick');
    }
  }
  if (card) {
    card.dataset.phase = phase;
    card.classList.toggle('is-spinning', phase === 'spin');
    card.classList.toggle('is-winner', phase === 'win');
  }
}

/** 名单芯片：滚动时扫到的亮起，本轮点过的划掉 */
function renderRoster(hitId = null) {
  const box = $('#rollcallRoster');
  const count = $('#rollcallRoundCount');
  // 已被删除的同学不再计入本轮
  for (const id of [...called]) if (!students.some((s) => s.id === id)) called.delete(id);
  if (count) count.textContent = `${called.size} / ${students.length}`;
  if (!box) return;
  box.innerHTML = students
    .map(
      (s) =>
        `<span class="rollcall-chip${called.has(s.id) ? ' is-called' : ''}${s.id === hitId ? ' is-hit' : ''}" data-id="${escapeHtml(s.id)}">${escapeHtml(s.name)}</span>`,
    )
    .join('');
}

function highlightChip(id) {
  const box = $('#rollcallRoster');
  if (!box) return;
  box.querySelector('.rollcall-chip.is-hit')?.classList.remove('is-hit');
  box.querySelector(`.rollcall-chip[data-id="${CSS.escape(id)}"]`)?.classList.add('is-hit');
}

function stopSpin() {
  spinning = false;
  window.clearTimeout(spinTimer);
  spinTimer = 0;
}

/** 点中时的主题反馈（红笔圈 / 粉笔圈 / 纸屑 / 气泡 / 像素块） */
async function celebrateWinner() {
  if (prefersReducedMotion()) return;
  try {
    const { themeBurst, circleMark } = await import('./ai-classroom/quiz-fx.js');
    const reel = document.querySelector('#rollcallCard .rollcall-reel');
    if (!circleMark(reel)) themeBurst($('#rollcallCardName'));
  } catch {
    /* 特效失败不影响点名 */
  }
}

/**
 * 老虎机式滚动：先快后慢（每步 ×1.12），停住前有一拍悬念
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
  if (btn) btn.disabled = true;
  setStatus('', true);
  document.querySelector('#rollcallCard .fx-circle')?.remove();

  // 一轮点完自动开新一轮
  let pool = students.filter((s) => !called.has(s.id));
  let newRound = false;
  if (!pool.length) {
    called.clear();
    pool = students.slice();
    newRound = true;
  }
  // 新一轮第一个尽量不和上一位相同
  if (newRound && pool.length > 1 && lastWinner) {
    pool = pool.filter((s) => s.id !== lastWinner.id);
  }
  renderRoster();
  const winner = pool[Math.floor(Math.random() * pool.length)];

  const finish = () => {
    spinning = false;
    lastWinner = winner;
    called.add(winner.id);
    setCardName(winner.name, 'win');
    renderRoster(winner.id);
    const left = students.length - called.size;
    setStatus(
      `${newRound ? '新一轮开始 · ' : ''}${left ? `本轮还剩 ${left} 人` : '全班已点完一轮，再抽将开始新一轮'}`,
      true,
    );
    if (btn) {
      btn.disabled = false;
      btn.textContent = '再抽一个';
    }
    celebrateWinner();
  };

  if (prefersReducedMotion()) {
    finish();
    return;
  }

  // 滚动时只在本轮未点的人里跳，名单芯片同步扫过
  const reelPool = pool.length > 1 ? pool : students;
  let delay = 45;
  let prev = null;
  const step = () => {
    if (!spinning) return;
    if (delay >= 400) {
      finish();
      return;
    }
    let show = reelPool[Math.floor(Math.random() * reelPool.length)];
    if (reelPool.length > 1 && show === prev) show = reelPool[(reelPool.indexOf(show) + 1) % reelPool.length];
    prev = show;
    setCardName(show.name, 'spin');
    highlightChip(show.id);
    delay *= 1.12;
    spinTimer = window.setTimeout(step, delay);
  };
  step();
}

/** 点名区可见、焦点不在输入框时，空格 / 回车直接抽（翻页笔友好） */
function onKeydown(e) {
  if (e.key !== ' ' && e.key !== 'Enter') return;
  const section = $('#aiSectionRollcall');
  if (!section || section.hidden || section.offsetParent === null) return;
  const t = e.target;
  if (t && (t.closest?.('input, textarea, select, button, [contenteditable="true"]') || t.isContentEditable)) return;
  // 弹窗打开时不抢按键
  if (document.querySelector('.app-dialog-panel.is-open, [class*="backdrop"].is-open, [class*="backdrop"][aria-hidden="false"]')) return;
  e.preventDefault();
  spinToWinner();
}

export function initRollcall() {
  $('#btnRollcallSpin')?.addEventListener('click', spinToWinner);
  $('#btnRollcallReset')?.addEventListener('click', () => {
    called.clear();
    renderRoster();
    setStatus('已开始新一轮', true);
  });
  document.addEventListener('keydown', onKeydown);

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
    if (mode === 'replace') {
      const ok = await appConfirm(`将清空现有名单并导入 ${names.length} 人，确定？`, {
        title: '替换导入',
        okText: '确定导入',
        danger: true,
      });
      if (!ok) return;
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
    setCardName(`${students.length} 人`, '', '准备就绪');
  }
}
