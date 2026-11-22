/**
 * 模块 02：晶体结构库 — 零遮挡三行外壳与纯 HTML 渲染函数
 */

import { computeAveragingBreakdown, computeDensity } from '../math/lattice.js';
import { formulaHtml } from '../../chem/formula-html.js';

export const SYSTEM_LABELS = {
  cubic: '立方',
  tetragonal: '四方',
  orthorhombic: '正交',
  hexagonal: '六方',
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
  const totalStr = formatNum(stat.total, 2);

  if (Array.isArray(stat.items) && stat.items.length) {
    const groups = new Map();
    for (const item of stat.items) {
      const label = item.fractionLabel || String(item.weight ?? '1');
      const weight = Number.isFinite(item.weight) ? item.weight : 1;
      const existing = groups.get(label);
      if (existing) existing.count += 1;
      else groups.set(label, { label, weight, count: 1 });
    }
    const parts = [...groups.values()]
      .sort((a, b) => a.weight - b.weight)
      .map((g) => `${g.count}×${g.label}`);
    return parts.length ? `${parts.join(' + ')} = ${totalStr}` : `= ${totalStr}`;
  }

  const parts = [];
  if (stat.vertex > 0) parts.push(`${stat.vertex}×1/8`);
  if (stat.edge > 0) parts.push(`${stat.edge}×1/4`);
  if (stat.face > 0) parts.push(`${stat.face}×1/2`);
  if (stat.interior > 0) parts.push(`${stat.interior}×1`);
  return parts.length ? `${parts.join(' + ')} = ${totalStr}` : `= ${totalStr}`;
}

export function renderActionbarHtml() {
  return `
    <div class="crystal-mode-strip" aria-live="polite" hidden></div>
    <div class="crystal-actionbar-row" role="toolbar" aria-label="晶胞交互控制">
      <div class="crystal-action-group crystal-seg" role="group" aria-label="外观模型">
        <button type="button" class="crystal-seg-btn is-active" data-mode="ball-stick">球棍</button>
        <button type="button" class="crystal-seg-btn" data-mode="space-filling">填充</button>
      </div>
      <span class="crystal-action-sep" aria-hidden="true"></span>
      <div class="crystal-action-group crystal-inquiry-group" role="group" aria-label="晶胞探究模式">
        <button type="button" class="crystal-tool-btn" data-tool="slice" aria-pressed="false">切开均摊</button>
        <button type="button" class="crystal-tool-btn" data-tool="tile" aria-pressed="false">拼晶胞 1/8</button>
        <button type="button" class="crystal-tool-btn" data-tool="coordination" aria-pressed="false">配位数</button>
        <button type="button" class="crystal-tool-btn" data-tool="distance" aria-pressed="false">最短距离</button>
        <button type="button" class="crystal-tool-btn" data-tool="density" aria-pressed="false">密度</button>
      </div>
    </div>
  `;
}

export function renderCrystalItemHtml(c) {
  const dotsHtml = (c.species || [])
    .map(
      (sp) =>
        `<i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}" title="${escapeHtml(sp.symbol)}"></i>`,
    )
    .join('');

  const customControls = c.isCustom
    ? `<span class="crystal-custom-tag">自定义</span>
       <button type="button" class="crystal-item-del" data-del-id="${escapeHtml(c.id)}" aria-label="删除 ${escapeHtml(c.name)}" title="删除自定义晶胞">×</button>`
    : '';

  return `
    <div class="crystal-drawer-item-top">
      <strong class="crystal-drawer-item-formula">${formulaHtml(c.formula)}</strong>
      <span class="crystal-drawer-item-meta">
        <span class="crystal-drawer-item-dots">${dotsHtml}</span>
        ${customControls}
      </span>
    </div>
    <span class="crystal-drawer-item-name">${escapeHtml(c.name)}</span>
    ${c.subtitle ? `<span class="crystal-drawer-item-sub">${escapeHtml(c.subtitle)}</span>` : ''}
  `;
}

export function renderTopbarInfoHtml(crystal) {
  if (!crystal) return '';
  const lat = crystal.lattice || {};
  const sysLabel = SYSTEM_LABELS[crystal.system] || crystal.system || '';
  const isCubic = lat.a === lat.b && lat.b === lat.c && (lat.gamma ?? 90) === 90;
  const latText = isCubic
    ? `a=${formatNum(lat.a, 1)} pm`
    : lat.a === lat.b
      ? `a=${formatNum(lat.a, 1)} · c=${formatNum(lat.c, 1)} pm`
      : `a=${formatNum(lat.a, 0)} b=${formatNum(lat.b, 0)} c=${formatNum(lat.c, 0)} pm`;

  const zChip = crystal.density?.Z != null
    ? `<span class="crystal-topbar-chip">Z=${formatNum(crystal.density.Z, 2)}</span>`
    : '';

  const speciesChips = (crystal.species || [])
    .slice(0, 4)
    .map(
      (sp) => `
        <span class="crystal-topbar-chip crystal-topbar-species">
          <i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}"></i>
          <span>${formulaHtml(sp.symbol)}</span><em>×${formatNum(sp.countPerCell, 2)}</em>
        </span>
      `,
    )
    .join('');

  return `
    <strong class="crystal-topbar-formula">${formulaHtml(crystal.formula)}</strong>
    <span class="crystal-topbar-name">${escapeHtml(crystal.name)}</span>
    ${sysLabel ? `<span class="crystal-topbar-chip">${escapeHtml(sysLabel)}</span>` : ''}
    <span class="crystal-topbar-chip">${escapeHtml(latText)}</span>
    ${zChip}
    ${speciesChips}
  `;
}

export function renderModeStripHtml(crystal, { activeTool, exploded, tileCount }) {
  if (!crystal || activeTool === 'none') return '';

  if (activeTool === 'slice') {
    const breakdown = computeAveragingBreakdown(crystal);
    const eqChips = (crystal.species || [])
      .map((sp) => {
        const eq = buildSpeciesEquation(breakdown?.bySpecies?.[sp.id]);
        return `
          <span class="crystal-strip-chip">
            <i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}"></i>
            <b>${formulaHtml(sp.symbol)}</b>: <code>${escapeHtml(eq)}</code>
          </span>
        `;
      })
      .join('');
    return `
      <div class="crystal-strip-content">${eqChips}</div>
      <div class="crystal-strip-actions">
        <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-strip="toggle-explode">
          ${exploded ? '拼回去' : '炸开查看'}
        </button>
      </div>
    `;
  }

  if (activeTool === 'tile') {
    const hexHint = crystal.hexPrismHighlight
      ? `<span class="crystal-strip-note${tileCount >= 3 ? ' is-ok' : ''}">${
          tileCount >= 3 ? '✨ 正六棱柱已显现（3 晶胞无缝拼合）' : '提示：拼至 3 个六方晶胞可显现正六棱柱'
        }</span>`
      : '';
    return `
      <div class="crystal-strip-content">
        <div class="crystal-stepper" role="group" aria-label="拼晶胞数量">
          <button type="button" class="crystal-step-btn" data-tile="sub" aria-label="减少一个晶胞" ${tileCount <= 1 ? 'disabled' : ''}>−</button>
          <span class="crystal-step-val">${tileCount} / 8 晶胞</span>
          <button type="button" class="crystal-step-btn" data-tile="add" ${tileCount >= 8 ? 'disabled' : ''}>+ 再拼一个</button>
        </div>
        <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-tile="reset" ${tileCount <= 1 ? 'disabled' : ''}>重置单胞</button>
        ${hexHint}
      </div>
    `;
  }

  if (activeTool === 'coordination' && crystal.coordination) {
    const c = crystal.coordination;
    return `
      <div class="crystal-strip-content">
        <span class="crystal-strip-badge">配位数 CN = ${escapeHtml(c.number)}</span>
        <span class="crystal-strip-text">${escapeHtml(c.label || '')}</span>
      </div>
    `;
  }

  if (activeTool === 'distance' && crystal.shortestDistance) {
    const sd = crystal.shortestDistance;
    return `
      <div class="crystal-strip-content">
        <span class="crystal-strip-badge">${escapeHtml(sd.formula)}${sd.valuePm ? ` = ${escapeHtml(sd.valuePm)} pm` : ''}</span>
        <span class="crystal-strip-text">${escapeHtml(sd.desc || '')}</span>
      </div>
    `;
  }

  if (activeTool === 'density' && crystal.density) {
    const d = crystal.density;
    const computed = computeDensity(d.Z, d.molarMass, crystal.lattice);
    const val = Number.isFinite(computed) ? computed.toFixed(2) : formatNum(d.valueGcm3, 2);
    return `
      <div class="crystal-strip-content">
        <span class="crystal-strip-badge">ρ = ${val} g/cm³</span>
        <code class="crystal-strip-formula">${escapeHtml(d.formulaText || 'ρ = (Z · M) / (Nₐ · V)')}</code>
        <span class="crystal-strip-text">Z = ${formatNum(d.Z, 2)} · M = ${formatNum(d.molarMass, 2)} g/mol</span>
      </div>
    `;
  }

  return `<div class="crystal-strip-content"><span class="crystal-strip-text">该晶胞暂无此项数据。</span></div>`;
}

export function renderInspectorDetailsHtml(crystal) {
  if (!crystal) return '';
  const breakdown = computeAveragingBreakdown(crystal);
  const avgRows = (crystal.species || [])
    .map((sp) => `
      <div class="crystal-avg-row">
        <span class="crystal-avg-species">
          <i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}"></i>
          <b>${formulaHtml(sp.symbol)}</b>
        </span>
        <span class="crystal-avg-eq">${escapeHtml(buildSpeciesEquation(breakdown?.bySpecies?.[sp.id]))}</span>
      </div>
    `)
    .join('');

  const d = crystal.density;
  const computed = d ? computeDensity(d.Z, d.molarMass, crystal.lattice) : NaN;
  const rho = Number.isFinite(computed) ? computed.toFixed(2) : formatNum(d?.valueGcm3, 2);
  const densityHtml = d
    ? `
      <div class="crystal-detail-block">
        <h4 class="crystal-detail-title">晶胞密度公式</h4>
        <div class="crystal-exam-metric">
          <span class="crystal-exam-k">Z = ${formatNum(d.Z, 2)} · M = ${formatNum(d.molarMass, 2)} g/mol</span>
          <strong class="crystal-exam-v">${rho} g/cm³</strong>
        </div>
        <p class="crystal-exam-formula">${escapeHtml(d.formulaText || 'ρ = (Z · M) / (Nₐ · V)')}</p>
      </div>
    `
    : '';

  return `
    <div class="crystal-detail-block">
      <h4 class="crystal-detail-title">均摊法粒子数拆解</h4>
      <div class="crystal-avg-breakdown">${avgRows}</div>
    </div>
    ${densityHtml}
  `;
}

export function buildCrystalSummary(crystal) {
  if (!crystal) return '';
  const lat = crystal.lattice || {};
  const parts = [
    crystal.subtitle,
    `晶系:${SYSTEM_LABELS[crystal.system] || crystal.system || ''}`,
    lat.a ? `a=${formatNum(lat.a, 1)}pm` : '',
    crystal.averagingFormula ? `均摊:${crystal.averagingFormula}` : '',
    crystal.coordination?.number != null ? `CN=${crystal.coordination.number}` : '',
    crystal.shortestDistance?.formula ? `最短距离:${crystal.shortestDistance.formula}` : '',
  ].filter(Boolean);
  return parts.join('；');
}

export function buildQuickQuestions(crystal) {
  const f = crystal?.formula || '该晶胞';
  if (crystal?.hexPrismHighlight) {
    return [
      `${f} 六方晶胞的均摊法怎么算？`,
      `为什么 3 个 ${f} 晶胞能拼出正六棱柱？`,
      `${f} 的配位数与晶胞密度怎么推导？`,
    ];
  }
  return [
    `${f} 晶胞用均摊法怎么算出粒子数？`,
    `${f} 的配位数和最短距离怎么看？`,
    `${f} 晶胞密度公式怎么推导？`,
  ];
}
