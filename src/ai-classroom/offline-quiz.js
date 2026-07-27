/**
 * 离线基础练习库 — UI 控制器
 * 复用课堂练习的卡片/结果/错题机制，不依赖 AI API Key。
 * 数据来源：AGIEval v1.1 gaokao-chemistry（逐字原文）。
 */

import { formatChemOption, formatChemPreview, formatChemStem } from './chem-text.js';
import { appAlert, appConfirm } from '../app-dialog.js';

export function createOfflineQuizController({
  select,
  escapeHtml,
  offlineQuizApi,
  onRefreshStats,
}) {
  const letters = ['A', 'B', 'C', 'D'];

  let paper = [];
  let submitted = false;
  let submitting = false;
  let currentPaperId = null;
  let expandedResultIdx = null;
  let yearFilter = null;
  let availableYears = [];
  let bankPage = 1;
  let bankTotalPages = 1;

  // ── view switching ──

  function showView(name) {
    const cfg = select('#offlineQuizConfig');
    const paperEl = select('#offlineQuizPaper');
    const result = select('#offlineQuizResult');
    if (cfg) cfg.hidden = name !== 'config';
    if (paperEl) paperEl.hidden = name !== 'paper';
    if (result) result.hidden = name !== 'result';
  }

  // ── config panel ──

  async function loadYears() {
    try {
      const data = await offlineQuizApi.years();
      availableYears = data?.years || [];
      renderYearChips();
    } catch {
      availableYears = [];
      renderYearChips();
    }
  }

  function renderYearChips() {
    const root = select('#offlineQuizYears');
    if (!root) return;
    const all = [{ label: '全部', value: null }, ...availableYears.map((y) => ({ label: `${y}年`, value: y }))];
    root.innerHTML = all.map((y) =>
      `<button type="button" class="quiz-chip${yearFilter === y.value ? ' is-on' : ''}" data-offline-year="${y.value ?? ''}">${escapeHtml(y.label)}</button>`,
    ).join('');
    root.querySelectorAll('[data-offline-year]').forEach((btn) => {
      btn.addEventListener('click', () => {
        yearFilter = btn.dataset.offlineYear === '' ? null : Number(btn.dataset.offlineYear);
        bankPage = 1;
        renderYearChips();
        renderBankList();
      });
    });
  }

  async function renderBankList() {
    const body = select('#offlineQuizBankBody');
    if (!body) return;
    body.innerHTML = '<p class="quiz-muted">加载中…</p>';
    try {
      const data = await offlineQuizApi.list(yearFilter, bankPage, 20);
      const questions = data?.questions || [];
      const total = data?.total || 0;
      const page = data?.page || 1;
      const pageSize = data?.pageSize || 20;
      bankTotalPages = data?.totalPages || 1;
      bankPage = page;

      if (!total) {
        body.innerHTML = '<p class="quiz-muted">暂无题目</p>';
        return;
      }

      const yearLabel = yearFilter ? `${yearFilter}年 · ` : '';
      const start = (page - 1) * pageSize + 1;
      const end = Math.min(page * pageSize, total);

      const listHtml = questions.map((q, i) => {
        const globalIdx = start + i;
        return `<div class="quiz-result-item" style="cursor:default"><div class="quiz-result-item-summary"><span class="quiz-card-idx">${globalIdx}</span><div class="quiz-result-item-text"><span class="quiz-result-brief">${formatChemPreview(q.question || '', 60)}</span><span class="quiz-card-tag">${escapeHtml(q.sourceExam || '')}</span></div></div></div>`;
      }).join('');

      const pagerHtml = bankTotalPages > 1
        ? `<div class="quiz-pager">
            <button type="button" class="quiz-chip" data-bank-prev ${page <= 1 ? 'disabled' : ''}>上一页</button>
            <span class="quiz-muted">${start}-${end} / ${total}</span>
            <button type="button" class="quiz-chip" data-bank-next ${page >= bankTotalPages ? 'disabled' : ''}>下一页</button>
          </div>`
        : '';

      body.innerHTML = `<p class="quiz-muted">${yearLabel}${yearLabel ? '' : ''}共 ${total} 题 · 历年高考题源（AGIEval）</p>` +
        listHtml + pagerHtml;

      body.querySelector('[data-bank-prev]')?.addEventListener('click', () => {
        if (bankPage > 1) { bankPage--; renderBankList(); }
      });
      body.querySelector('[data-bank-next]')?.addEventListener('click', () => {
        if (bankPage < bankTotalPages) { bankPage++; renderBankList(); }
      });
    } catch (err) {
      body.innerHTML = `<p class="quiz-muted">加载失败：${escapeHtml(err.message || '')}</p>`;
    }
  }

  // ── generate ──

  async function generate() {
    const status = select('#offlineQuizStatus');
    const btn = select('#btnOfflineQuizStart');
    const countEl = select('#offlineQuizCount');
    const count = countEl ? Math.max(1, Number(countEl.value) || 5) : 5;

    if (status) status.textContent = '正在生成…';
    if (btn) btn.disabled = true;

    try {
      const data = await offlineQuizApi.generate({ count, year: yearFilter || undefined });
      const list = data?.questions || [];
      if (!list.length) throw new Error('没有匹配的题目');

      paper = list.map((q, i) => ({
        id: q.sourceQuestionId || `oq${i}`,
        stem: q.question || '',
        options: q.options || [],
        answer: null,
        sourceExam: q.sourceExam || '',
        sourceYear: q.sourceYear || null,
        chosen: null,
      }));
      currentPaperId = data?.paperId || null;
      submitted = false;
      submitting = false;
      expandedResultIdx = null;

      const meta = select('#offlinePaperMeta');
      if (meta) {
        const yearLabel = yearFilter ? `${yearFilter}年` : '全部年份';
        meta.textContent = `离线题库 · ${yearLabel} · ${paper.length} 题`;
      }
      renderPaper();
      showView('paper');
      if (status) status.textContent = '';
    } catch (err) {
      if (status) status.textContent = err.message || '生成失败';
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // ── paper rendering ──

  function renderPaper() {
    const root = select('#offlineQuizQuestions');
    if (!root) return;

    root.innerHTML = paper.map((q, qi) => {
      const opts = q.options.map((opt, oi) => {
        let cls = 'quiz-opt';
        if (q.chosen === oi) cls += ' is-selected';
        if (submitted && q.answer !== null) {
          if (oi === q.answer) cls += ' is-correct';
          else if (q.chosen === oi && q.chosen !== q.answer) cls += ' is-wrong';
        }
        return `<button type="button" class="${cls}" data-oq="${qi}" data-opt="${oi}" ${submitted ? 'disabled' : ''}><strong>${letters[oi]}.</strong> ${formatChemOption(opt)}</button>`;
      }).join('');

      let feedback = '';
      if (submitted && q.chosen !== null && q.answer !== null) {
        const ok = q.chosen === q.answer;
        feedback = `<p class="quiz-feedback ${ok ? 'is-ok' : 'is-err'}">${ok ? '回答正确' : `回答错误，正确答案是 ${letters[q.answer]}`}</p>`;
      }

      return `
      <article class="quiz-card" data-oq-qi="${qi}">
        <div class="quiz-card-top">
          <span class="quiz-card-idx">第 ${qi + 1} 题</span>
          <span class="quiz-card-tag">${escapeHtml(q.sourceExam)}</span>
        </div>
        <div class="quiz-stem">${formatChemStem(q.stem)}</div>
        <div class="quiz-options">${opts}</div>
        <div class="quiz-card-tools"><span class="quiz-muted" style="font-size:0.82em">题源原题，暂无内置解析</span></div>
        ${feedback}
      </article>`;
    }).join('');

    root.querySelectorAll('.quiz-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (submitted) return;
        const qi = Number(btn.dataset.oq);
        paper[qi].chosen = Number(btn.dataset.opt);
        renderPaper();
      });
    });
  }

  // ── submit ──

  async function submitPaper() {
    if (!paper.length || submitting || !currentPaperId) return;

    submitting = true;
    submitted = true;
    const btnSubmit = select('#btnOfflineQuizSubmit');
    if (btnSubmit) btnSubmit.disabled = true;
    expandedResultIdx = null;

    try {
      const answers = paper.map((q) => ({
        id: q.id,
        chosen: q.chosen === null ? -1 : q.chosen,
      }));
      const data = await offlineQuizApi.submit({ paperId: currentPaperId, answers });

      // Fill in answers from server response
      const items = data?.items || [];
      for (let i = 0; i < paper.length; i++) {
        const item = items.find((it) => (it.sourceQuestionId || it.id) === paper[i].id);
        if (item) {
          paper[i].answer = item.answer;
        }
      }

      const scoreLine = select('#offlineScoreLine');
      if (scoreLine) {
        scoreLine.textContent = `得分 ${data?.correct ?? 0} / ${data?.total ?? paper.length}（已作答 ${data?.answered ?? 0} 题）· 离线题库`;
      }

      renderResultList();
      showView('result');

      if (typeof onRefreshStats === 'function') {
        try {
          await onRefreshStats();
        } catch {
          /* 角标刷新失败不阻断结果页 */
        }
      }
    } catch (err) {
      await appAlert(`提交失败：${err.message || err}`, { title: '提交失败' });
      submitted = false;
      if (btnSubmit) btnSubmit.disabled = false;
    } finally {
      submitting = false;
    }
  }

  // ── result list ──

  function renderResultList() {
    const root = select('#offlineResultList');
    if (!root) return;

    root.innerHTML = paper.map((q, i) => {
      let mark = 'skip';
      let markText = '未作答';
      if (q.chosen !== null && q.answer !== null) {
        if (q.chosen === q.answer) { mark = 'ok'; markText = '正确'; }
        else { mark = 'bad'; markText = '错误'; }
      }
      const open = expandedResultIdx === i;
      const opts = q.options.map((opt, oi) => {
        let cls = 'quiz-opt';
        if (q.answer !== null) {
          if (oi === q.answer) cls += ' is-correct';
          if (q.chosen === oi && q.chosen !== q.answer) cls += ' is-wrong';
        }
        if (q.chosen === oi) cls += ' is-selected';
        return `<div class="${cls}"><strong>${letters[oi]}.</strong> ${formatChemOption(opt)}</div>`;
      }).join('');

      return `
      <div class="quiz-result-item${open ? ' is-expanded' : ''}" data-oq-result="${i}" role="button" tabindex="0">
        <div class="quiz-result-item-summary">
          <span class="mark ${mark}">${markText}</span>
          <div class="quiz-result-item-text">
            <strong>第 ${i + 1} 题</strong>
            ${q.sourceExam ? ` · ${escapeHtml(q.sourceExam)}` : ''}
            <span class="quiz-result-brief">${formatChemPreview(q.stem, 48)}</span>
          </div>
          <span class="quiz-result-chevron" aria-hidden="true">${open ? '▴' : '▾'}</span>
        </div>
        <div class="quiz-result-detail" ${open ? '' : 'hidden'}>
          <div class="quiz-stem">${formatChemStem(q.stem)}</div>
          <div class="quiz-options">${opts}</div>
          <p class="quiz-result-keys">
            你的选择：<strong>${q.chosen === null ? '—' : letters[q.chosen]}</strong>
            ${q.answer !== null ? ` · 正确答案：<strong>${letters[q.answer]}</strong>` : ''}
          </p>
          <p class="quiz-muted" style="margin-top:0.4rem;font-size:0.82em">题源原题，暂无内置解析</p>
        </div>
      </div>`;
    }).join('');

    root.querySelectorAll('[data-oq-result]').forEach((el) => {
      const toggle = () => {
        const i = Number(el.dataset.oqResult);
        expandedResultIdx = expandedResultIdx === i ? null : i;
        renderResultList();
        if (expandedResultIdx !== null) {
          root.querySelector(`[data-oq-result="${expandedResultIdx}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
    });
  }

  // ── back to config ──

  function backToConfig() {
    submitted = false;
    submitting = false;
    paper = [];
    currentPaperId = null;
    expandedResultIdx = null;
    const btnSubmit = select('#btnOfflineQuizSubmit');
    if (btnSubmit) btnSubmit.disabled = false;
    showView('config');
    renderBankList();
  }

  // ── public API ──

  async function init() {
    await loadYears();
    renderBankList();
    showView('config');

    const countEl = select('#offlineQuizCount');
    const countLabel = select('#offlineQuizCountLabel');
    if (countEl && countLabel) {
      countLabel.textContent = countEl.value;
      countEl.addEventListener('input', () => {
        countLabel.textContent = countEl.value;
      });
    }

    select('#btnOfflineQuizStart')?.addEventListener('click', generate);
    select('#btnOfflineQuizSubmit')?.addEventListener('click', () => {
      if (!paper.length) return;
      submitPaper();
    });
    select('#btnOfflineQuizBackConfig')?.addEventListener('click', async () => {
      if (paper.length && !submitted) {
        const ok = await appConfirm('当前练习尚未交卷，确定放弃？', {
          title: '放弃练习',
          okText: '放弃',
          danger: true,
        });
        if (!ok) return;
      }
      backToConfig();
    });
    select('#btnOfflineQuizAgain')?.addEventListener('click', backToConfig);
  }

  return { init, backToConfig };
}
