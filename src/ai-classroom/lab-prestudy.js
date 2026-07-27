/**
 * 实验交互式预习 — 前端模块
 * 复用 lab-scripts.js 的数据，提供步骤式互动预习。
 * 无配置的实验降级为预习清单。
 */

import { LAB_SCRIPTS } from '../data/lab-scripts.js';
import { getPrestudyConfig } from '../data/lab-prestudy-config.js';

const STORAGE_KEY = 'lab-prestudy-progress';

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {}
}

export function createLabPrestudyController({ select, escapeHtml }) {
  let currentLabId = null;
  let currentStepIdx = 0;
  let stepResults = {}; // { stepIdx: { chosen, correct } }
  let progress = loadProgress();

  function getLab(id) {
    return LAB_SCRIPTS.find((l) => l.id === id) || null;
  }

  function renderStepPredict(step, stepIdx) {
    const p = step.predict;
    if (!p) return '';
    const saved = stepResults[stepIdx];
    const answered = saved !== undefined;
    const correct = saved?.correct;
    const chosenIdx = saved?.chosen;

    const opts = p.options.map((opt, oi) => {
      let cls = 'quiz-opt';
      if (answered) {
        if (oi === p.answer) cls += ' is-correct';
        if (oi === chosenIdx && !correct) cls += ' is-wrong';
        if (oi === chosenIdx) cls += ' is-selected';
      }
      return `<button type="button" class="${cls}" data-prestudy-step="${stepIdx}" data-prestudy-opt="${oi}" ${answered ? 'disabled' : ''}>
        <strong>${String.fromCharCode(65 + oi)}.</strong> ${escapeHtml(opt)}
      </button>`;
    }).join('');

    let feedback = '';
    if (answered) {
      feedback = `<p class="quiz-feedback ${correct ? 'is-ok' : 'is-err'}">${correct ? '回答正确' : `回答错误，正确答案是 ${String.fromCharCode(65 + p.answer)}`}</p>
        <p class="prestudy-explain">${escapeHtml(p.explanation)}</p>`;
    }

    return `<div class="prestudy-predict">
      <p class="prestudy-predict-q">${escapeHtml(p.question)}</p>
      <div class="quiz-options">${opts}</div>
      ${feedback}
    </div>`;
  }

  function renderStepRisk(step) {
    if (!step.risk) return '';
    return `<div class="prestudy-risk"><strong>注意：</strong>${escapeHtml(step.risk)}</div>`;
  }

  function renderDetail() {
    const detail = select('#prestudyDetail');
    if (!detail) return;
    const lab = getLab(currentLabId);
    if (!lab) {
      detail.innerHTML = '<div class="molar-empty">请选择左侧实验</div>';
      return;
    }

    const config = getPrestudyConfig(currentLabId);
    if (!config) {
      // 降级：纯阅读预习清单
      const steps = lab.steps || [];
      detail.innerHTML = `
        <div class="lab-detail-head">
          <span class="lab-type">${escapeHtml(lab.type)}</span>
          <h3 class="lab-detail-title">${escapeHtml(lab.title)}</h3>
          <p class="lab-eq">${escapeHtml(lab.equation || '')}</p>
        </div>
        <div class="prestudy-notice">该实验暂未配置互动环节，以下是预习清单。</div>
        <div class="lab-meta">
          <div class="lab-meta-item"><span>现象</span><strong>${escapeHtml(lab.phenomena || '—')}</strong></div>
          <div class="lab-meta-item"><span>安全</span><strong>${escapeHtml(lab.safety || '—')}</strong></div>
        </div>
        <h4 class="lab-steps-heading">预习步骤</h4>
        <div class="lab-step-list">
          ${steps.map((step, i) => {
            const label = typeof step === 'string' ? step : step?.label || `步骤 ${i + 1}`;
            const tip = typeof step === 'string' ? '' : step?.tip || '';
            return `<div class="lab-step"><span class="lab-step-n">${i + 1}</span><div class="lab-step-body"><strong class="lab-step-label">${escapeHtml(label)}</strong>${tip ? `<p class="lab-step-tip">${escapeHtml(tip)}</p>` : ''}</div></div>`;
          }).join('')}
        </div>`;
      return;
    }

    // 交互式预习
    const steps = config.steps || [];
    const savedProgress = progress[currentLabId] || {};
    stepResults = {};
    for (const [k, v] of Object.entries(savedProgress)) {
      stepResults[Number(k)] = v;
    }

    const completedCount = Object.keys(stepResults).length;
    const allDone = steps.length > 0 && completedCount === steps.length;
    const currentAnswered = stepResults[currentStepIdx] !== undefined;
    const canGoNext = currentAnswered && currentStepIdx < steps.length - 1;

    let stepsHtml = '';
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const isCurrent = i === currentStepIdx;
      const isDone = stepResults[i] !== undefined;
      stepsHtml += `
        <div class="prestudy-step${isCurrent ? ' is-current' : ''}${isDone ? ' is-done' : ''}" data-prestudy-nav="${i}">
          <div class="prestudy-step-header">
            <span class="prestudy-step-n">${isDone ? '✓' : i + 1}</span>
            <strong class="prestudy-step-label">${escapeHtml(step.label)}</strong>
          </div>
          ${isCurrent ? `<p class="prestudy-step-tip">${escapeHtml(step.tip || '')}</p>` : ''}
          ${isCurrent ? renderStepPredict(step, i) : ''}
          ${isCurrent ? renderStepRisk(step) : ''}
        </div>`;
    }

    let headerInfo = '';
    if (config.objective) headerInfo += `<div class="prestudy-info"><strong>实验目标：</strong>${escapeHtml(config.objective)}</div>`;
    if (config.reagents?.length) headerInfo += `<div class="prestudy-info"><strong>试剂：</strong>${escapeHtml(config.reagents.join('、'))}</div>`;
    if (config.apparatus?.length) headerInfo += `<div class="prestudy-info"><strong>器材：</strong>${escapeHtml(config.apparatus.join('、'))}</div>`;

    let summaryHtml = '';
    if (allDone && config.summary) {
      summaryHtml = `<div class="prestudy-summary"><strong>总结：</strong>${escapeHtml(config.summary)}</div>`;
    }

    const nextBtn = canGoNext
      ? '<button type="button" class="btn btn-sm" id="btnPrestudyNext">下一步</button>'
      : '';

    detail.innerHTML = `
      <div class="lab-detail-head">
        <span class="lab-type">${escapeHtml(lab.type)}</span>
        <h3 class="lab-detail-title">${escapeHtml(lab.title)}</h3>
        <p class="lab-eq">${escapeHtml(lab.equation || '')}</p>
      </div>
      ${headerInfo}
      <div class="lab-meta">
        <div class="lab-meta-item"><span>现象</span><strong>${escapeHtml(lab.phenomena || '—')}</strong></div>
        <div class="lab-meta-item"><span>安全</span><strong>${escapeHtml(lab.safety || '—')}</strong></div>
      </div>
      <div class="prestudy-progress-bar"><div class="prestudy-progress-fill" style="width:${steps.length ? Math.round(completedCount / steps.length * 100) : 0}%"></div></div>
      <h4 class="lab-steps-heading">互动预习步骤（${completedCount}/${steps.length}）</h4>
      <div class="prestudy-steps">${stepsHtml}</div>
      ${canGoNext ? `<div class="prestudy-step-actions">${nextBtn}</div>` : ''}
      ${summaryHtml}
      ${allDone ? '<button type="button" class="btn" id="btnPrestudyRestart">重新开始</button>' : ''}`;

    // Bind option clicks — stopPropagation 避免冒泡到步骤导航
    detail.querySelectorAll('[data-prestudy-opt]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const stepIdx = Number(btn.dataset.prestudyStep);
        const optIdx = Number(btn.dataset.prestudyOpt);
        handleAnswer(stepIdx, optIdx);
      });
    });

    // Bind step nav clicks（仅切换步骤，不在选项点击时触发）
    detail.querySelectorAll('[data-prestudy-nav]').forEach((el) => {
      el.addEventListener('click', () => {
        currentStepIdx = Number(el.dataset.prestudyNav);
        renderDetail();
      });
    });

    const nextEl = detail.querySelector('#btnPrestudyNext');
    if (nextEl) {
      nextEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentStepIdx < steps.length - 1) {
          currentStepIdx += 1;
          renderDetail();
        }
      });
    }

    // Bind restart
    const restartBtn = detail.querySelector('#btnPrestudyRestart');
    if (restartBtn) {
      restartBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        delete progress[currentLabId];
        saveProgress(progress);
        stepResults = {};
        currentStepIdx = 0;
        renderDetail();
      });
    }
  }

  function handleAnswer(stepIdx, optIdx) {
    const lab = getLab(currentLabId);
    const config = getPrestudyConfig(currentLabId);
    if (!lab || !config) return;
    const step = config.steps[stepIdx];
    if (!step?.predict) return;
    if (stepResults[stepIdx] !== undefined) return;

    const correct = optIdx === step.predict.answer;
    stepResults[stepIdx] = { chosen: optIdx, correct };

    // Save to localStorage
    if (!progress[currentLabId]) progress[currentLabId] = {};
    progress[currentLabId][stepIdx] = { chosen: optIdx, correct };
    saveProgress(progress);

    // 留在当前步展示反馈与解析，由用户点「下一步」或侧栏步骤前进
    currentStepIdx = stepIdx;
    renderDetail();
  }

  function render() {
    const nav = select('#prestudyNavList');
    if (!nav) return;

    nav.innerHTML = LAB_SCRIPTS.map((lab) => {
      const hasConfig = getPrestudyConfig(lab.id) !== null;
      return `<button type="button" class="lab-nav-item${lab.id === currentLabId ? ' is-active' : ''}" data-prestudy-lab="${escapeHtml(lab.id)}" role="listitem">
        <span class="lab-nav-type">${escapeHtml(lab.type)}</span>
        <strong class="lab-nav-title">${escapeHtml(lab.title)}</strong>
        ${hasConfig ? '<span class="prestudy-tag">互动</span>' : '<span class="prestudy-tag prestudy-tag-read">阅读</span>'}
      </button>`;
    }).join('');

    nav.querySelectorAll('[data-prestudy-lab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        currentLabId = btn.dataset.prestudyLab;
        currentStepIdx = 0;
        stepResults = {};
        render();
      });
    });

    if (!currentLabId && LAB_SCRIPTS[0]) {
      currentLabId = LAB_SCRIPTS[0].id;
    }
    renderDetail();
  }

  return { render };
}
