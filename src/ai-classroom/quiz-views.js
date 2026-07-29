/**
 * 智能出题：纯 HTML 视图片段（无 DOM 绑定、不读模块全局测验状态）
 * 控制器负责传参与事件。
 */

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} p
 * @param {Array} p.paper
 * @param {boolean} p.submitted
 * @param {string} p.reveal
 * @param {(s: string) => string} p.escapeHtml
 */
export function buildPaperHtml({ paper, submitted, reveal, escapeHtml }) {
  return paper
    .map((q, qi) => {
      const letters = ['A', 'B', 'C', 'D'];
      const opts = q.options
        .map((opt, oi) => {
          let cls = 'quiz-opt';
          if (q.chosen === oi) cls += ' is-selected';
          if (submitted || (reveal === 'immediate' && q.chosen !== null)) {
            if (oi === q.answer) cls += ' is-correct';
            else if (q.chosen === oi && q.chosen !== q.answer) cls += ' is-wrong';
          }
          return `<button type="button" class="${cls}" data-q="${qi}" data-opt="${oi}" ${
            submitted ? 'disabled' : ''
          }><strong>${letters[oi]}.</strong> ${escapeHtml(opt)}</button>`;
        })
        .join('');

      let feedback = '';
      if (reveal === 'immediate' && q.chosen !== null && !submitted) {
        const ok = q.chosen === q.answer;
        feedback = `<p class="quiz-feedback ${ok ? 'is-ok' : 'is-err'}">${
          ok ? '回答正确' : `回答错误，正确答案是 ${letters[q.answer]}`
        }</p>`;
      }

      return `
      <article class="quiz-card" data-qi="${qi}">
        <div class="quiz-card-top">
          <span class="quiz-card-idx">第 ${qi + 1} 题</span>
          <span class="quiz-card-tag">${escapeHtml(q.knowledge || '')}</span>
        </div>
        <p class="quiz-stem">${escapeHtml(q.stem)}</p>
        <div class="quiz-options">${opts}</div>
        <div class="quiz-card-tools">
          <button type="button" class="btn ghost" data-hint="${qi}">AI 提示</button>
          <button type="button" class="btn ghost" data-explain="${qi}">AI 解答</button>
        </div>
        ${feedback}
      </article>`;
    })
    .join('');
}

/**
 * @param {object} p
 * @param {Array} p.paper
 * @param {number|null} p.expandedResultIdx
 * @param {(s: string) => string} p.escapeHtml
 */
export function buildResultListHtml({ paper, expandedResultIdx, escapeHtml }) {
  const letters = ['A', 'B', 'C', 'D'];

  return paper
    .map((q, i) => {
      let mark = 'skip';
      let markText = '未作答';
      if (q.chosen !== null) {
        if (q.chosen === q.answer) {
          mark = 'ok';
          markText = '正确';
        } else {
          mark = 'bad';
          markText = '错误';
        }
      }
      const open = expandedResultIdx === i;
      const opts = q.options
        .map((opt, oi) => {
          let cls = 'quiz-opt';
          if (oi === q.answer) cls += ' is-correct';
          if (q.chosen === oi && q.chosen !== q.answer) cls += ' is-wrong';
          if (q.chosen === oi) cls += ' is-selected';
          return `<div class="${cls}"><strong>${letters[oi]}.</strong> ${escapeHtml(opt)}</div>`;
        })
        .join('');

      return `
      <div class="quiz-result-item${open ? ' is-expanded' : ''}" data-result-i="${i}" role="button" tabindex="0">
        <div class="quiz-result-item-summary">
          <span class="mark ${mark}">${markText}</span>
          <div class="quiz-result-item-text">
            <strong>第 ${i + 1} 题</strong>
            ${q.knowledge ? ` · ${escapeHtml(q.knowledge)}` : ''}
            <span class="quiz-result-brief">${escapeHtml(q.stem.slice(0, 48))}${q.stem.length > 48 ? '…' : ''}</span>
          </div>
          <span class="quiz-result-chevron" aria-hidden="true">${open ? '▴' : '▾'}</span>
        </div>
        <div class="quiz-result-detail" ${open ? '' : 'hidden'}>
          <p class="quiz-stem">${escapeHtml(q.stem)}</p>
          <div class="quiz-options">${opts}</div>
          <p class="quiz-result-keys">
            你的选择：<strong>${q.chosen === null ? '—' : letters[q.chosen]}</strong>
            · 正确答案：<strong>${letters[q.answer]}</strong>
            ${q.usedHint ? ' · 看过提示' : ''}
            ${q.usedExplain ? ' · 看过解答' : ''}
          </p>
          ${
            q.explain
              ? `<p class="quiz-result-explain">${escapeHtml(q.explain)}</p>`
              : ''
          }
        </div>
      </div>`;
    })
    .join('');
}
