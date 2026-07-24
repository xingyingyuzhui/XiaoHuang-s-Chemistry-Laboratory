/**
 * 周期表模块
 * 负责周期表的渲染和交互
 */

import {
  BLOCKS,
  ELEMENTS,
  ELEMENTS_BY_Z,
  GROUP_OLD,
  blockColor,
  blockLabel,
  blockZoneId,
  groupLabelRow,
} from './data/elements.js';
import { getElectronConfigHtml } from './data/electronConfigs.js';

const $ = (sel) => document.querySelector(sel);

// DOM 元素
const tableEl = $('#periodicTable');
const detailEl = $('#elementDetail');
const legendEl = $('#blockLegend');
const groupLabelsEl = $('#groupLabels');
const periodLabelsEl = $('#periodLabels');
const sideLabelsEl = $('#sideLabels');
const ptableScroll = $('.ptable-scroll');
const tableShell = $('.table-shell');

// 状态
let selectedZ = null;
let fitRaf = 0;

// 电子层数据
const SIDE_SHELLS = [
  ['K', '2'],
  ['K<br>L', '2<br>8'],
  ['K<br>L<br>M', '2<br>8<br>8'],
  ['K<br>L<br>M<br>N', '2<br>8<br>18<br>8'],
  ['K<br>L<br>M<br>N<br>O', '2<br>8<br>18<br>18<br>8'],
  ['K<br>L<br>M<br>N<br>O<br>P', '2<br>8<br>18<br>32<br>18<br>8'],
  ['K<br>L<br>M<br>N<br>O<br>P<br>Q', '2<br>8<br>18<br>32<br>32<br>18<br>8'],
];

/**
 * 渲染分区图例
 */
export function renderLegend() {
  const items = [BLOCKS.s, BLOCKS.p, BLOCKS.d, BLOCKS.ds, BLOCKS.f, BLOCKS.noble];
  legendEl.innerHTML = items
    .map(
      (c) =>
        `<span class="legend-item"><span class="legend-dot" data-zone="${c.id}" style="--zone-bg:${c.colorCss}"></span>${c.label}</span>`,
    )
    .join('');
}

/**
 * 渲染周期号、族标、电子层侧栏
 */
export function renderChrome() {
  periodLabelsEl.innerHTML = [1, 2, 3, 4, 5, 6, 7]
    .map((n) => `<div class="period-label">${n}</div>`)
    .join('');

  groupLabelsEl.innerHTML = '';
  for (let g = 1; g <= 18; g++) {
    const div = document.createElement('div');
    div.className = 'group-label';
    div.style.setProperty('--col', String(g));
    div.style.setProperty('--row', String(groupLabelRow(g)));
    div.innerHTML = `<span class="group-old">${GROUP_OLD[g] || ''}</span><span class="group-num">${g}</span>`;
    groupLabelsEl.appendChild(div);
  }

  sideLabelsEl.innerHTML = SIDE_SHELLS.map(
    ([shell, e]) =>
      `<div class="side-cell">${shell}</div><div class="side-cell">${e}</div>`
  ).join('');
}

/**
 * 渲染周期表
 */
export function renderTable() {
  tableEl.innerHTML = '';

  // 系列标签
  const labelLa = document.createElement('div');
  labelLa.className = 'series-label';
  labelLa.style.gridRow = '9';
  labelLa.style.gridColumn = '1 / span 3';
  labelLa.textContent = '镧系';
  tableEl.appendChild(labelLa);

  const labelAc = document.createElement('div');
  labelAc.className = 'series-label';
  labelAc.style.gridRow = '10';
  labelAc.style.gridColumn = '1 / span 3';
  labelAc.textContent = '锕系';
  tableEl.appendChild(labelAc);

  for (const el of ELEMENTS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'element' + (selectedZ === el.z ? ' is-selected' : '');
    btn.style.gridColumn = String(el.gridCol);
    btn.style.gridRow = String(el.gridRow);
    btn.dataset.z = String(el.z);
    btn.dataset.block = el.block;
    const zone = blockZoneId(el);
    btn.dataset.zone = zone; /* 与图例 data-zone 对齐 */
    btn.dataset.group = String(el.group);
    /* 与图例共用同一 CSS 变量，避免 f 区等被其它规则冲掉后色差 */
    btn.style.setProperty('--zone-bg', blockColor(el));
    if (el.stair) btn.dataset.stair = 'true';
    btn.title = `${el.name} (${el.symbol})`;
    btn.setAttribute('aria-label', `${el.name} ${el.symbol}`);
    btn.innerHTML = `
      <span class="atomic-number">${el.z}</span>
      <span class="atomic-mass">${el.massDisplay}</span>
      <span class="symbol">${el.symbol}</span>
      <span class="hanzi">${el.name}</span>
    `;
    btn.addEventListener('click', () => selectElement(el.z));
    tableEl.appendChild(btn);
  }
}

/**
 * 选中元素并显示详情
 */
export function selectElement(z) {
  selectedZ = z;
  const el = ELEMENTS_BY_Z[z];
  if (!el) return;

  document.querySelectorAll('.element').forEach((node) => {
    node.classList.toggle('is-selected', Number(node.dataset.z) === z);
  });

  const zone = blockZoneId(el);
  const color = blockColor(el);
  const groupText =
    el.block === 'f'
      ? el.series === 'lanthanide'
        ? '镧系'
        : '锕系'
      : `${el.group}${GROUP_OLD[el.group] ? ` (${GROUP_OLD[el.group]})` : ''}`;

  const configHtml = getElectronConfigHtml(el.z);
  const tip = buildElementTip(el);
  detailEl.innerHTML = `
    <div class="detail-head">
      <div class="detail-badge" data-zone="${zone}" style="--zone-bg:${color}">${el.symbol}</div>
      <div>
        <h2>${el.name} · ${el.symbol}</h2>
        <p>${el.nameEn} · Z = ${el.z}</p>
      </div>
    </div>
    <div class="kv">
      <div><span>相对原子质量</span><strong>${el.massDisplay}</strong></div>
      <div><span>分区</span><strong>${blockLabel(el)}</strong></div>
      <div><span>周期</span><strong>${el.period}</strong></div>
      <div><span>族</span><strong>${groupText}</strong></div>
      <div class="kv-config"><span>电子排布</span><strong class="electron-config">${configHtml}</strong></div>
    </div>
    <div class="detail-teach">
      <h4>课堂提示</h4>
      <p>${tip}</p>
    </div>
  `;
}

/** 中学向趋势 / 误区提示（本地模板，非百科） */
function buildElementTip(el) {
  const parts = [];
  if (el.block === 's' && el.group === 1) {
    parts.push('碱金属：同主族从上到下金属性增强；钾比钠更易失电子（中学表述）。');
  } else if (el.block === 's' && el.group === 2) {
    parts.push('碱土金属：较活泼金属；钙、镁是地壳常见元素。');
  } else if (el.group === 17) {
    parts.push('卤素：同主族从上到下非金属性减弱；氟的非金属性最强。');
  } else if (el.group === 18) {
    parts.push('稀有气体：最外层稳定，化学性质很不活泼（一般不形成化合物）。');
  } else if (el.block === 'd' || el.block === 'ds') {
    parts.push('过渡元素：常有多种化合价与有色离子，中学记代表物即可。');
  } else if (el.symbol === 'C') {
    parts.push('碳：有机物骨架；同主族硅是半导体与地壳重要元素。');
  } else if (el.symbol === 'O') {
    parts.push('氧：地壳中含量最高的元素；非金属性很强，易形成氧化物。');
  } else if (el.symbol === 'N') {
    parts.push('氮：空气中约 78%；氮分子三键稳定，工业固氮重要。');
  } else if (el.period) {
    parts.push(
      `位于第 ${el.period} 周期：同周期从左到右原子半径总体减小、非金属性增强（中学规律）。`,
    );
  }
  parts.push('易错：比较活泼性时要分清「金属性 / 非金属性」与「氧化性 / 还原性」对象。');
  return parts.join(' ');
}

/**
 * 响应式缩放周期表
 * 按容器可用宽高尽量「铺满」；上限随窗口增大（4K 大窗不再卡在 100px）
 */
export function fitPeriodicTable() {
  if (!ptableScroll) return;
  const cs = getComputedStyle(ptableScroll);
  const padX = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const padY = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
  const availW = Math.max(200, ptableScroll.clientWidth - padX - 2);
  const availH = Math.max(200, ptableScroll.clientHeight - padY - 2);
  const showSide = window.matchMedia('(min-width: 1101px)').matches;
  const frameGap = 4;

  const measure = (box) => {
    // 间隙与字号随格子等比，大窗时允许更大（原先硬顶 6/8/34 导致大屏「放大了却不长大」）
    const gap = Math.min(12, Math.max(2, box * 0.065));
    const fGap = Math.min(16, Math.max(3, box * 0.1));
    const labelH = Math.min(52, Math.max(20, box * 0.46));
    const periodW = Math.min(44, Math.max(16, box * 0.34));
    const sideCol = box * 0.48;
    const sideW = showSide ? 2 * sideCol + gap : 0;
    const tableW = 18 * box + 17 * gap;
    const totalW = periodW + frameGap + tableW + (showSide ? frameGap + sideW : 0);
    const totalH = labelH + 9 * box + fGap + 9 * gap;
    return { gap, fGap, labelH, periodW, sideCol, sideW, totalW, totalH, box };
  };

  // 由可用空间估上限：约 18 列 × 10 行（含 f 区与轴标签），再软顶防止极端超大
  const estMax = Math.min(availW / 19.2, availH / 10.2);
  let lo = 28;
  let hi = Math.min(220, Math.max(72, estMax * 1.08));
  let best = measure(Math.min(hi, 48));
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const m = measure(mid);
    if (m.totalW <= availW && m.totalH <= availH) {
      best = m;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const box = Math.floor(best.box * 10) / 10;
  const m = measure(box);
  const root = document.documentElement;
  root.style.setProperty('--box-size', `${box}px`);
  root.style.setProperty('--gap-size', `${m.gap.toFixed(1)}px`);
  root.style.setProperty('--f-gap-size', `${m.fGap.toFixed(1)}px`);
  root.style.setProperty('--label-height', `${m.labelH.toFixed(1)}px`);
  root.style.setProperty('--period-label-width', `${m.periodW.toFixed(1)}px`);
  root.style.setProperty('--frame-col-gap', `${frameGap}px`);
  root.style.setProperty('--side-col-width', `${m.sideCol.toFixed(1)}px`);
  root.style.setProperty('--radius-box', `${Math.max(6, box * 0.16).toFixed(1)}px`);
  root.style.setProperty('--font-symbol', `${Math.max(12, box * 0.34).toFixed(1)}px`);
  root.style.setProperty('--font-hanzi', `${Math.max(9, box * 0.2).toFixed(1)}px`);
  root.style.setProperty('--font-atomic', `${Math.max(8, box * 0.16).toFixed(1)}px`);
  root.style.setProperty('--font-mass', `${Math.max(7, box * 0.13).toFixed(1)}px`);
  root.style.setProperty('--font-axis', `${Math.max(13, box * 0.3).toFixed(1)}px`);
  root.style.setProperty('--font-axis-old', `${Math.max(10, box * 0.2).toFixed(1)}px`);
  if (!showSide) {
    root.style.setProperty('--side-cols-width', '0px');
  } else {
    root.style.setProperty('--side-cols-width', `${m.sideW.toFixed(1)}px`);
  }
}

/**
 * 防抖调度缩放
 */
export function scheduleFit() {
  cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => {
    fitPeriodicTable();
  });
}

/**
 * 初始化周期表
 */
export function initPeriodicTable() {
  renderLegend();
  renderChrome();
  renderTable();
  selectElement(8);

  // 绑定分界/分区切换
  document.querySelectorAll('.chip[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle;
      if (key === 'zones') {
        tableEl.classList.toggle('show-zones');
        btn.classList.toggle('active', tableEl.classList.contains('show-zones'));
      }
      if (key === 'stair') {
        tableEl.classList.toggle('show-stair');
        btn.classList.toggle('active', tableEl.classList.contains('show-stair'));
      }
    });
  });

  // 首次缩放
  scheduleFit();

  // ResizeObserver
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!$('#panel-table').hidden) scheduleFit();
    });
    if (ptableScroll) ro.observe(ptableScroll);
    if (tableShell) ro.observe(tableShell);
  }

  // 窗口 resize
  window.addEventListener('resize', () => scheduleFit());
}
