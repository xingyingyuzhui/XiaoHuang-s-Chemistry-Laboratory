/**
 * 模块 02：晶体结构库 — 开放舞台模板与纯 HTML 渲染函数
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

export const STAGE_TEMPLATE = `
  <div class="crystal-stage-canvas"></div>

  <div class="crystal-float-info" aria-live="polite"></div>

  <div class="crystal-float-actions" aria-label="舞台操作">
    <button type="button" class="crystal-action-btn" data-act="qa" aria-expanded="false" title="课堂思考题">思考题 💡</button>
    <button type="button" class="crystal-action-btn" data-act="autorotate" aria-pressed="false" title="自动慢转">慢转</button>
    <button type="button" class="crystal-action-btn" data-act="reset" title="复位视角">复位</button>
  </div>

  <div class="crystal-qa-popover" role="dialog" aria-label="课堂思考题" hidden></div>
  <div class="crystal-hex-toast" aria-live="polite" hidden></div>
  <div class="crystal-exam-popover" role="region" aria-label="考点详情" hidden></div>

  <div class="crystal-dock" role="toolbar" aria-label="晶胞交互控制">
    <div class="crystal-dock-group crystal-seg" role="group" aria-label="显示模型">
      <button type="button" class="crystal-seg-btn is-active" data-mode="ball-stick">球棍</button>
      <button type="button" class="crystal-seg-btn" data-mode="space-filling">填充</button>
    </div>
    <span class="crystal-dock-sep" aria-hidden="true"></span>
    <div class="crystal-dock-group crystal-slice-group">
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-slice="toggle">切开数原子</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-slice="restore" hidden>还原</button>
    </div>
    <span class="crystal-dock-sep" aria-hidden="true"></span>
    <div class="crystal-dock-group crystal-stepper" role="group" aria-label="拼晶胞数量">
      <button type="button" class="crystal-step-btn" data-tile="sub" aria-label="减少一个晶胞" disabled>−</button>
      <button type="button" class="crystal-step-val" data-tile="reset" title="点击恢复单晶胞">1/8 晶胞</button>
      <button type="button" class="crystal-step-btn crystal-step-add" data-tile="add" aria-label="再拼一个晶胞">+ 拼</button>
    </div>
    <span class="crystal-dock-sep" aria-hidden="true"></span>
    <div class="crystal-dock-group crystal-exam-group" role="group" aria-label="高考考点工具">
      <button type="button" class="crystal-exam-tab" data-exam="coordination" aria-pressed="false">配位数</button>
      <button type="button" class="crystal-exam-tab" data-exam="distance" aria-pressed="false">最短距离</button>
      <button type="button" class="crystal-exam-tab" data-exam="density" aria-pressed="false">密度</button>
    </div>
  </div>
`;

export function renderCrystalItemHtml(c) {
  const dotsHtml = (c.species || [])
    .map(
      (sp) =>
        `<i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}" title="${escapeHtml(sp.symbol)}"></i>`,
    )
    .join('');

  return `
    <div class="crystal-drawer-item-top">
      <strong class="crystal-drawer-item-formula">${formulaHtml(c.formula)}</strong>
      <span class="crystal-drawer-item-dots">${dotsHtml}</span>
    </div>
    <span class="crystal-drawer-item-name">${escapeHtml(c.name)}</span>
    ${c.subtitle ? `<span class="crystal-drawer-item-sub">${escapeHtml(c.subtitle)}</span>` : ''}
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
  return `<div class="crystal-avg-breakdown">${rowsHtml}</div>`;
}

export function renderFloatInfoHtml(crystal, { sliced }) {
  if (!crystal) return '';
  const lat = crystal.lattice || {};
  const sysLabel = SYSTEM_LABELS[crystal.system] || crystal.system || '';
  const isCubic = lat.a === lat.b && lat.b === lat.c && (lat.gamma ?? 90) === 90;
  const paramHtml = isCubic
    ? `<span class="crystal-param-pill">a = b = c = ${formatNum(lat.a, 1)} pm</span>`
    : `
      <span class="crystal-param-pill">a = ${formatNum(lat.a, 1)}</span>
      <span class="crystal-param-pill">b = ${formatNum(lat.b, 1)}</span>
      <span class="crystal-param-pill">c = ${formatNum(lat.c, 1)} pm</span>
      ${crystal.system === 'hexagonal' || lat.gamma === 120 ? `<span class="crystal-param-pill">γ=${lat.gamma || 120}°</span>` : ''}
    `;

  const speciesHtml = (crystal.species || [])
    .map(
      (sp) => `
        <span class="crystal-species-chip">
          <i class="crystal-swatch-dot" style="background:${colorIntToCss(sp.color)}"></i>
          <span>${formulaHtml(sp.symbol)}</span>
          <em>×${formatNum(sp.countPerCell, 2)}</em>
        </span>
      `,
    )
    .join('');

  return `
    <div class="crystal-float-head">
      <div class="crystal-float-titles">
        <strong class="crystal-float-formula">${formulaHtml(crystal.formula)}</strong>
        <span class="crystal-float-name">${escapeHtml(crystal.name)}</span>
      </div>
      <span class="crystal-sys-badge">${escapeHtml(sysLabel)}</span>
    </div>
    <div class="crystal-species-row">${speciesHtml}</div>
    <div class="crystal-param-row">${paramHtml}</div>
    ${sliced ? renderAveragingBreakdownHtml(crystal) : ''}
  `;
}

export function renderExamPopoverHtml(crystal, examTab) {
  if (!crystal || examTab === 'none') return '';
  let title = '';
  let body = '';

  if (examTab === 'coordination' && crystal.coordination) {
    const c = crystal.coordination;
    title = '配位数 (CN)';
    body = `
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">最近邻配位数</span>
        <strong class="crystal-exam-v">${escapeHtml(c.number)}</strong>
      </div>
      <p class="crystal-exam-desc">${escapeHtml(c.label || '')}</p>
    `;
  } else if (examTab === 'distance' && crystal.shortestDistance) {
    const sd = crystal.shortestDistance;
    title = '最短距离';
    body = `
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">${escapeHtml(sd.formula)}</span>
        ${sd.valuePm ? `<strong class="crystal-exam-v">${escapeHtml(sd.valuePm)} pm</strong>` : ''}
      </div>
      <p class="crystal-exam-desc">${escapeHtml(sd.desc || '')}</p>
    `;
  } else if (examTab === 'density' && crystal.density) {
    const d = crystal.density;
    const computed = computeDensity(d.Z, d.molarMass, crystal.lattice);
    const val = Number.isFinite(computed) ? computed.toFixed(2) : formatNum(d.valueGcm3, 2);
    title = '晶胞理论密度';
    body = `
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">Z = ${formatNum(d.Z, 2)} · M = ${formatNum(d.molarMass, 2)} g/mol</span>
        <strong class="crystal-exam-v">${val} g/cm³</strong>
      </div>
      <p class="crystal-exam-formula">${escapeHtml(d.formulaText || 'ρ = (Z · M) / (Nₐ · V)')}</p>
    `;
  }

  if (!body) return '';
  return `
    <div class="crystal-pop-head">
      <h4 class="crystal-pop-title">${title}</h4>
      <button type="button" class="crystal-pop-close" data-exam-close aria-label="关闭">×</button>
    </div>
    ${body}
  `;
}

export function renderQaPopoverHtml(qa, qaRevealed) {
  if (!qa) return '';
  return `
    <div class="crystal-pop-head">
      <h4 class="crystal-pop-title">课堂思考题 💡</h4>
      <div class="crystal-pop-head-right">
        <span class="crystal-tag crystal-tag-qa">${qaRevealed ? '已揭晓' : '先思考'}</span>
        <button type="button" class="crystal-pop-close" data-qa-close aria-label="关闭">×</button>
      </div>
    </div>
    <p class="crystal-qa-question">${escapeHtml(qa.question)}</p>
    <div class="crystal-qa-answer-box ${qaRevealed ? 'is-revealed' : 'is-covered'}">
      <p class="crystal-qa-answer">${escapeHtml(qa.answer)}</p>
      <div class="crystal-qa-cover" ${qaRevealed ? 'hidden' : ''}>
        <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm crystal-qa-reveal-btn">点击揭晓结论</button>
      </div>
    </div>
    <div class="crystal-qa-foot" ${qaRevealed ? '' : 'hidden'}>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm crystal-qa-hide-btn">重新遮挡</button>
    </div>
  `;
}
