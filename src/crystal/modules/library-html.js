/**
 * 3D 晶体库 — 四角浮层卡、相机操控盘与左侧抽屉纯 HTML 渲染函数
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
  all: '全部',
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

export function renderDrawerShellHtml() {
  return `
    <div class="mol-toolbar crystal-toolbar">
      <button type="button" class="mol-btn mol-btn-add crystal-btn-add" data-act="ai-add" title="AI 生成晶胞" aria-label="AI 生成晶胞">
        <strong class="mol-add-plus">＋</strong>
      </button>
      <button type="button" class="mol-btn mol-btn-edit crystal-btn-edit" data-act="edit" title="编辑列表" aria-pressed="false">
        编辑
      </button>
    </div>
    <div class="crystal-cat-tabs" role="tablist" aria-label="晶体类型"></div>
    <div class="crystal-drawer-list crystal-lib-grid" role="listbox" aria-label="常见晶胞列表"></div>
  `;
}

export function renderStageOverlayHtml() {
  return `
    <div class="crystal-stage-canvas"></div>
    <div class="mol-info-card crystal-corner-info" aria-live="polite"></div>
    <div class="crystal-hex-toast" aria-live="polite" hidden></div>
    <div class="mol-props-card crystal-corner-tools">
      <div class="crystal-mode-strip" aria-live="polite" hidden></div>
      <div class="crystal-tools-rows" role="toolbar" aria-label="晶胞交互控制">
        <div class="crystal-action-group crystal-seg" role="group" aria-label="外观模型">
          <button type="button" class="crystal-seg-btn is-active" data-mode="ball-stick">球棍</button>
          <button type="button" class="crystal-seg-btn" data-mode="space-filling">填充</button>
        </div>
        <div class="crystal-action-group crystal-inquiry-group" role="group" aria-label="晶胞探究模式">
          <button type="button" class="crystal-tool-btn" data-tool="slice" aria-pressed="false">切开均摊</button>
          <button type="button" class="crystal-tool-btn" data-tool="tile" aria-pressed="false">拼晶胞 1/8</button>
          <button type="button" class="crystal-tool-btn" data-tool="coordination" aria-pressed="false">配位数</button>
          <button type="button" class="crystal-tool-btn" data-tool="distance" aria-pressed="false">最短距离</button>
          <button type="button" class="crystal-tool-btn" data-tool="density" aria-pressed="false">密度</button>
        </div>
      </div>
    </div>
    <div class="crystal-pad-toggles" role="group" aria-label="晶胞视图开关">
      <button
        type="button"
        class="mol-label-toggle crystal-frame-toggle is-active"
        data-action="toggle-frame"
        title="显示/隐藏晶胞边框"
        aria-pressed="true"
      >边框</button>
      <button
        type="button"
        class="mol-label-toggle crystal-label-toggle is-active"
        data-action="toggle-labels"
        title="显示/隐藏晶胞标签"
        aria-pressed="true"
      >标签</button>
    </div>
    <div class="mol-controls crystal-cam-pad" aria-label="视角控制">
      <button type="button" class="mol-ctrl" data-cam="left" title="左转">←</button>
      <button type="button" class="mol-ctrl" data-cam="right" title="右转">→</button>
      <button type="button" class="mol-ctrl" data-cam="zoom-in" title="放大">＋</button>
      <button type="button" class="mol-ctrl" data-cam="up" title="上仰">↑</button>
      <button type="button" class="mol-ctrl" data-cam="down" title="下俯">↓</button>
      <button type="button" class="mol-ctrl" data-cam="zoom-out" title="缩小">－</button>
      <button type="button" class="mol-ctrl mol-ctrl-auto" data-cam="auto" title="自动慢转" aria-pressed="false">慢转</button>
      <button type="button" class="mol-ctrl" data-cam="reset" title="复位">⌂</button>
    </div>
  `;
}

export function renderCrystalItemHtml(c) {
  const firstColor = c.species?.[0]?.color;
  const markerHtml = c.isCustom
    ? '<span class="crystal-ai-badge">AI</span>'
    : firstColor != null
      ? `<i class="crystal-swatch-dot" style="background:${colorIntToCss(firstColor)}" aria-hidden="true"></i>`
      : '';

  const delBtn = c.isCustom
    ? `<button type="button" class="crystal-item-del" data-del-id="${escapeHtml(c.id)}" aria-label="删除 ${escapeHtml(c.name)}" title="删除 AI 晶胞">×</button>`
    : '';

  return `
    ${delBtn}
    <div class="crystal-drawer-item-top">
      <strong class="crystal-drawer-item-formula">${formulaHtml(c.formula)}</strong>
      ${markerHtml}
    </div>
    <span class="crystal-drawer-item-name">${escapeHtml(c.name)}</span>
  `;
}

export function renderCornerInfoHtml(crystal) {
  if (!crystal) return '<h3>当前晶胞</h3><p class="mol-info-title">—</p>';
  const lat = crystal.lattice || {};
  const sysLabel = SYSTEM_LABELS[crystal.system] || crystal.system || '';
  const isCubic = lat.a === lat.b && lat.b === lat.c && (lat.gamma ?? 90) === 90;
  const latText = isCubic
    ? `a=${formatNum(lat.a, 1)} pm`
    : lat.a === lat.b
      ? `a=${formatNum(lat.a, 1)} · c=${formatNum(lat.c, 1)} pm`
      : `a=${formatNum(lat.a, 0)} b=${formatNum(lat.b, 0)} c=${formatNum(lat.c, 0)} pm`;

  const zChip = crystal.density?.Z != null
    ? `<span class="crystal-corner-chip">Z=${formatNum(crystal.density.Z, 2)}</span>`
    : '';

  const speciesChips = (crystal.species || [])
    .slice(0, 4)
    .map(
      (sp) => `
        <span class="crystal-corner-chip crystal-corner-species">
          <i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}"></i>
          <span>${formulaHtml(sp.symbol)}</span><em>×${formatNum(sp.countPerCell, 2)}</em>
        </span>
      `,
    )
    .join('');

  return `
    <h3>当前晶胞</h3>
    <p class="mol-info-title crystal-corner-title">
      <strong class="crystal-corner-formula">${formulaHtml(crystal.formula)}</strong>
      <span>${escapeHtml(crystal.name)}</span>
    </p>
    <div class="crystal-corner-chips">
      ${sysLabel ? `<span class="crystal-corner-chip">${escapeHtml(sysLabel)}</span>` : ''}
      <span class="crystal-corner-chip">${escapeHtml(latText)}</span>
      ${zChip}
      ${speciesChips}
    </div>
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
          tileCount >= 3 ? '✨ 正六棱柱已显现' : '拼至 3 胞显现正六棱柱'
        }</span>`
      : '';
    return `
      <div class="crystal-strip-content">
        <div class="crystal-stepper" role="group" aria-label="拼晶胞数量">
          <button type="button" class="crystal-step-btn" data-tile="sub" aria-label="减少一个晶胞" ${tileCount <= 1 ? 'disabled' : ''}>−</button>
          <span class="crystal-step-val">${tileCount}/8</span>
          <button type="button" class="crystal-step-btn" data-tile="add" aria-label="增加一个晶胞" ${tileCount >= 8 ? 'disabled' : ''}>+</button>
        </div>
        <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-tile="reset" ${tileCount <= 1 ? 'disabled' : ''}>重置</button>
        ${hexHint}
      </div>
    `;
  }

  if (activeTool === 'coordination' && crystal.coordination) {
    const c = crystal.coordination;
    return `
      <div class="crystal-strip-content">
        <span class="crystal-strip-badge">CN = ${escapeHtml(c.number)}</span>
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
        <span class="crystal-strip-text">Z=${formatNum(d.Z, 2)} · M=${formatNum(d.molarMass, 2)}</span>
      </div>
    `;
  }

  return '<div class="crystal-strip-content"><span class="crystal-strip-text">该晶胞暂无此项数据。</span></div>';
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
