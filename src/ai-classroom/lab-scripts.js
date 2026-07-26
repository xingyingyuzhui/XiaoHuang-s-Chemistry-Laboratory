import { LAB_SCRIPTS } from '../data/lab-scripts.js';

/** 实验脚本导航与详情渲染。 */
export function createLabScriptsRenderer({ select, escapeHtml }) {
  let currentLabId = LAB_SCRIPTS[0]?.id || null;

  function showDetail(id) {
    const lab = LAB_SCRIPTS.find((item) => item.id === id);
    const detail = select('#labScriptDetail');
    if (!detail) return;
    if (!lab) {
      detail.innerHTML = '<div class="molar-empty">请选择左侧实验</div>';
      return;
    }
    const steps = Array.isArray(lab.steps) ? lab.steps : [];
    detail.innerHTML = `
      <div class="lab-detail-head">
        <span class="lab-type">${escapeHtml(lab.type)}</span>
        <h3 class="lab-detail-title">${escapeHtml(lab.title)}</h3>
        <p class="lab-eq">${escapeHtml(lab.equation || '')}</p>
      </div>
      <div class="lab-meta">
        <div class="lab-meta-item"><span>现象</span><strong>${escapeHtml(lab.phenomena || '—')}</strong></div>
        <div class="lab-meta-item"><span>安全</span><strong>${escapeHtml(lab.safety || '—')}</strong></div>
      </div>
      <h4 class="lab-steps-heading">实验步骤</h4>
      <div class="lab-step-list">
        ${
          steps.length
            ? steps
                .map((step, index) => {
                  const label = typeof step === 'string' ? step : step?.label || `步骤 ${index + 1}`;
                  const tip = typeof step === 'string' ? '' : step?.tip || '';
                  return `<div class="lab-step"><span class="lab-step-n">${index + 1}</span><div class="lab-step-body"><strong class="lab-step-label">${escapeHtml(label)}</strong>${tip ? `<p class="lab-step-tip">${escapeHtml(tip)}</p>` : ''}</div></div>`;
                })
                .join('')
            : '<p class="rxn-muted">暂无步骤说明</p>'
        }
      </div>`;
  }

  function render() {
    const nav = select('#labNavList');
    const detail = select('#labScriptDetail');
    if (!nav || !detail) return;
    if (!currentLabId && LAB_SCRIPTS[0]) currentLabId = LAB_SCRIPTS[0].id;
    nav.innerHTML = LAB_SCRIPTS.map((lab) => `
      <button type="button" class="lab-nav-item${lab.id === currentLabId ? ' is-active' : ''}" data-lab="${escapeHtml(lab.id)}" role="listitem">
        <span class="lab-nav-type">${escapeHtml(lab.type)}</span>
        <strong class="lab-nav-title">${escapeHtml(lab.title)}</strong>
      </button>`).join('');
    nav.querySelectorAll('[data-lab]').forEach((button) => {
      button.addEventListener('click', () => {
        currentLabId = button.dataset.lab;
        render();
      });
    });
    showDetail(currentLabId);
  }

  return { render };
}
