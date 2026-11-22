/**
 * 模块 02：晶体结构库 — DOM 模板与纯渲染函数
 */

import { computeAveragingBreakdown, computeDensity } from '../math/lattice.js';
import { formulaHtml } from '../../chem/formula-html.js';

export const SYSTEM_LABELS = {
  cubic: '立方晶系',
  tetragonal: '四方晶系',
  orthorhombic: '正交晶系',
  hexagonal: '六方晶系',
};

export const SHORT_CATEGORY_LABELS = {
  metallic: '金属',
  ionic: '离子',
  covalent: '共价',
  molecular: '分子',
  mixed: '混合',
};

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function colorIntToCss(c) {
  if (typeof c === 'string') return c;
  if (typeof c === 'number' && Number.isFinite(c)) {
    return `#${(c & 0xffffff).toString(16).padStart(6, '0')}`;
  }
  return '#94a3b8';
}

export function formatNum(n, digits = 1) {
  if (!Number.isFinite(n)) return '—';
  return String(Number(n.toFixed(digits)));
}

export function buildSpeciesEquation(stat) {
  if (!stat) return '—';
  const parts = [];
  if (stat.vertex > 0) parts.push(`${stat.vertex}×1/8`);
  if (stat.edge > 0) parts.push(`${stat.edge}×1/4`);
  if (stat.face > 0) parts.push(`${stat.face}×1/2`);
  if (stat.interior > 0) parts.push(`${stat.interior}×1`);
  const totalStr = formatNum(stat.total, 2);
  return parts.length ? `${parts.join(' + ')} = ${totalStr}` : `= ${totalStr}`;
}

export const WORKBENCH_TEMPLATE = `
  <aside class="crystal-lib-sidebar" aria-label="晶体结构分类与目录">
    <div class="crystal-cat-tabs" role="tablist" aria-label="晶体类型"></div>
    <div class="crystal-list" role="listbox" aria-label="晶体列表"></div>
  </aside>

  <div class="crystal-stage-wrap">
    <div class="crystal-stage-canvas"></div>
    <div class="crystal-legend" aria-label="原子图例"></div>
    <div class="crystal-stage-tools" aria-label="视角控制">
      <button type="button" class="crystal-stage-btn" data-act="autorotate" aria-pressed="false" title="自动慢转">慢转</button>
      <button type="button" class="crystal-stage-btn" data-act="reset" title="复位视角">复位</button>
    </div>
    <div class="crystal-stage-caption" aria-live="polite"></div>
  </div>

  <aside class="crystal-inspector" aria-label="晶胞参数与教学工具">
    <section class="crystal-card crystal-header-card"></section>

    <section class="crystal-card crystal-mode-card">
      <h4 class="crystal-card-title">显示模型</h4>
      <div class="crystal-seg" role="group" aria-label="显示模型切换">
        <button type="button" class="crystal-seg-btn is-active" data-mode="ball-stick">球棍模型</button>
        <button type="button" class="crystal-seg-btn" data-mode="space-filling">填充模型</button>
      </div>
    </section>

    <section class="crystal-card crystal-slice-card">
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">均摊法 · 切开数原子</h4>
        <span class="crystal-tag">真·裁剪</span>
      </div>
      <div class="crystal-slice-actions"></div>
      <div class="crystal-avg-breakdown"></div>
    </section>

    <section class="crystal-card crystal-tile-card">
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">无隙并置 · 拼晶胞</h4>
        <span class="crystal-tile-count">1 / 8 晶胞</span>
      </div>
      <div class="crystal-tile-actions">
        <button type="button" class="crystal-btn crystal-btn-primary" data-tile="add">+ 再拼一个</button>
        <button type="button" class="crystal-btn crystal-btn-ghost" data-tile="sub" disabled>- 拆一个</button>
        <button type="button" class="crystal-btn crystal-btn-ghost" data-tile="reset" disabled>单晶胞</button>
      </div>
      <div class="crystal-hex-banner" hidden></div>
    </section>

    <section class="crystal-card crystal-exam-card">
      <h4 class="crystal-card-title">高考考点工具</h4>
      <div class="crystal-exam-tabs" role="tablist" aria-label="高考考点工具">
        <button type="button" class="crystal-exam-tab" data-exam="coordination" role="tab" aria-selected="false">配位数</button>
        <button type="button" class="crystal-exam-tab" data-exam="distance" role="tab" aria-selected="false">最短距离</button>
        <button type="button" class="crystal-exam-tab" data-exam="density" role="tab" aria-selected="false">晶胞密度</button>
      </div>
      <div class="crystal-exam-body"></div>
    </section>

    <section class="crystal-card crystal-qa-card"></section>
  </aside>
`;

export function renderCrystalItemHtml(c) {
  const dotsHtml = (c.species || [])
    .map(
      (sp) =>
        `<i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}" title="${escapeHtml(sp.symbol)}"></i>`,
    )
    .join('');

  return `
    <div class="crystal-list-top">
      <span class="crystal-list-formula">${formulaHtml(c.formula)}</span>
      <span class="crystal-list-dots">${dotsHtml}</span>
    </div>
    <div class="crystal-list-name">${escapeHtml(c.name)}</div>
    ${c.subtitle ? `<div class="crystal-list-sub">${escapeHtml(c.subtitle)}</div>` : ''}
  `;
}

export function renderLegendHtml(crystal) {
  if (!crystal) return '';
  return (crystal.species || [])
    .map(
      (sp) => `
        <span class="crystal-legend-pill">
          <i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}"></i>
          <span class="crystal-legend-sym">${formulaHtml(sp.symbol)}</span>
          <span class="crystal-legend-cnt">×${formatNum(sp.countPerCell, 2)}</span>
        </span>
      `,
    )
    .join('');
}

export function buildCaptionText({ crystal, displayMode, sliced, exploded, tileCount, examTab }) {
  if (!crystal) return '';
  const modeLabel = displayMode === 'space-filling' ? '填充模型' : '球棍模型';
  if (sliced && exploded) {
    return `数一数：一个 ${crystal.formula} 晶胞里有几个粒子？（点击「拼回去」还原）`;
  }
  if (sliced) {
    return '已沿晶胞边界切开 · 仅保留属于本晶胞的实心部分';
  }
  if (tileCount > 1) {
    const suffix = crystal.hexPrismHighlight && tileCount >= 3 ? ' · 正六棱柱已显现！' : '';
    return `已拼好 ${tileCount} 个晶胞 · 无隙并置${suffix}`;
  }
  if (examTab === 'coordination' && crystal.coordination) {
    return `配位数标注：${crystal.coordination.label || ''}（配位数 = ${crystal.coordination.number}）`;
  }
  if (examTab === 'distance' && crystal.shortestDistance) {
    const sd = crystal.shortestDistance;
    return `最短距离标注：${sd.formula}${sd.valuePm ? ` ≈ ${sd.valuePm} pm` : ''}`;
  }
  if (examTab === 'density' && crystal.density) {
    const rho = computeDensity(crystal.density.Z, crystal.density.molarMass, crystal.lattice);
    const val = Number.isFinite(rho) ? rho.toFixed(2) : crystal.density.valueGcm3;
    return `${crystal.formula} 晶胞理论密度 ρ ≈ ${val} g/cm³`;
  }
  return `${crystal.name}（${crystal.formula}）的晶胞 · ${modeLabel}`;
}

export function renderHeaderCardHtml(crystal) {
  if (!crystal) return '';
  const lat = crystal.lattice || {};
  const sysLabel = SYSTEM_LABELS[crystal.system] || crystal.system || '';
  const anglePill =
    crystal.system === 'hexagonal' || lat.gamma === 120
      ? `<span class="crystal-param-pill">γ = ${lat.gamma || 120}°</span>`
      : '<span class="crystal-param-pill">α=β=γ=90°</span>';

  return `
    <div class="crystal-header-top">
      <div>
        <h3 class="crystal-header-formula">${formulaHtml(crystal.formula)}</h3>
        <p class="crystal-header-name">${escapeHtml(crystal.name)}${crystal.subtitle ? ` · ${escapeHtml(crystal.subtitle)}` : ''}</p>
      </div>
      <span class="crystal-sys-badge">${escapeHtml(sysLabel)}</span>
    </div>
    <div class="crystal-param-row">
      <span class="crystal-param-pill">a = ${formatNum(lat.a, 1)} pm</span>
      <span class="crystal-param-pill">b = ${formatNum(lat.b, 1)} pm</span>
      <span class="crystal-param-pill">c = ${formatNum(lat.c, 1)} pm</span>
      ${anglePill}
    </div>
  `;
}

export function renderAveragingBreakdownHtml(crystal) {
  if (!crystal) return '';
  const breakdown = computeAveragingBreakdown(crystal);
  const rowsHtml = (crystal.species || [])
    .map((sp) => {
      const stat = breakdown?.bySpecies?.[sp.id];
      return `
        <div class="crystal-avg-row">
          <span class="crystal-avg-species">
            <i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}"></i>
            <b>${formulaHtml(sp.symbol)}</b>
          </span>
          <span class="crystal-avg-eq">${escapeHtml(buildSpeciesEquation(stat))}</span>
        </div>
      `;
    })
    .join('');
  const note = crystal.averagingFormula
    ? `<p class="crystal-avg-note">${escapeHtml(crystal.averagingFormula)}</p>`
    : '';
  return `${rowsHtml}${note}`;
}

export function renderExamBodyHtml(crystal, examTab) {
  if (!crystal || examTab === 'none') {
    return '<p class="crystal-exam-placeholder">点击上方按钮，在 3D 晶胞中直观标出配位数、最短距离或计算理论密度。</p>';
  }
  if (examTab === 'coordination') {
    const c = crystal.coordination;
    if (!c) return '<p class="crystal-exam-placeholder">该晶体暂无配位数标注。</p>';
    return `
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">配位数 (CN)</span>
        <strong class="crystal-exam-v">${escapeHtml(c.number)}</strong>
      </div>
      <p class="crystal-exam-desc">${escapeHtml(c.label || '')}</p>
      <p class="crystal-exam-tip">图中金色环为中心粒子，蓝色连线指向全部最近邻配位粒子。</p>
    `;
  }
  if (examTab === 'distance') {
    const sd = crystal.shortestDistance;
    if (!sd) return '<p class="crystal-exam-placeholder">该晶体暂无最短距离标注。</p>';
    return `
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">几何关系</span>
        <strong class="crystal-exam-v">${escapeHtml(sd.formula)}</strong>
      </div>
      ${sd.valuePm ? `<div class="crystal-exam-submetric">数值：<b>${escapeHtml(sd.valuePm)} pm</b></div>` : ''}
      <p class="crystal-exam-desc">${escapeHtml(sd.desc || '')}</p>
    `;
  }
  if (examTab === 'density') {
    const d = crystal.density;
    if (!d) return '<p class="crystal-exam-placeholder">该晶体暂无密度计算数据。</p>';
    const computed = computeDensity(d.Z, d.molarMass, crystal.lattice);
    const displayVal = Number.isFinite(computed) ? computed.toFixed(2) : formatNum(d.valueGcm3, 2);
    return `
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">理论密度 ρ</span>
        <strong class="crystal-exam-v">${displayVal} g/cm³</strong>
      </div>
      <p class="crystal-exam-formula">${escapeHtml(d.formulaText || 'ρ = (Z · M) / (Nₐ · V)')}</p>
      <div class="crystal-density-meta">
        <span>Z = ${formatNum(d.Z, 2)}</span>
        <span>M = ${formatNum(d.molarMass, 2)} g/mol</span>
      </div>
    `;
  }
  return '';
}

export function renderQaCardHtml(qa, qaRevealed) {
  return `
    <div class="crystal-card-head">
      <h4 class="crystal-card-title">课堂思考题</h4>
      <span class="crystal-tag crystal-tag-qa">${qaRevealed ? '已揭晓' : '先思考'}</span>
    </div>
    <p class="crystal-qa-question">${escapeHtml(qa.question)}</p>
    <div class="crystal-qa-answer-box ${qaRevealed ? 'is-revealed' : 'is-covered'}">
      <p class="crystal-qa-answer">${escapeHtml(qa.answer)}</p>
      ${
        qaRevealed
          ? ''
          : '<div class="crystal-qa-cover"><button type="button" class="crystal-btn crystal-btn-primary crystal-qa-reveal-btn">点击揭晓结论</button></div>'
      }
    </div>
    ${
      qaRevealed
        ? '<div class="crystal-qa-foot"><button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm crystal-qa-hide-btn">重新遮挡</button></div>'
        : ''
    }
  `;
}
