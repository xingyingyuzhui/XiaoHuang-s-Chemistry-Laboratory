/**
 * 实验 3：冰为什么浮在水上（0°C 氢键四面体大空隙 ↔ 4°C 液态水紧密排布）
 * 左侧微观水分子氢键骨架演变 + 右侧宏观浮冰烧杯与实时密度读数。
 */

import { clamp, drawSphere, mountCanvasLoop } from './canvas-kit.js';

function waterDensity(tempC) {
  if (tempC <= 0) return 0.917 - tempC * 0.00014;
  const diff = tempC - 4;
  return clamp(1.0 - 0.0000072 * diff * diff, 0.995, 1.0);
}

const HEX_RING = [
  [-1.0, -0.58], [0, -1.15], [1.0, -0.58], [1.0, 0.58], [0, 1.15], [-1.0, 0.58],
  [-2.0, -1.15], [-2.0, 0], [-2.0, 1.15], [2.0, -1.15], [2.0, 0], [2.0, 1.15],
  [-1.0, -1.73], [1.0, -1.73], [-1.0, 1.73], [1.0, 1.73], [0, -2.15], [0, 2.15],
];

const ICE_BONDS = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
  [0, 6], [6, 7], [7, 8], [8, 5], [2, 9], [9, 10], [10, 11], [11, 3],
  [0, 12], [1, 12], [1, 13], [2, 13], [4, 14], [5, 14], [3, 15], [4, 15],
];

export function createIceExp(stageEl, controlsEl, onCaption) {
  let temp = 0;
  let tAccum = 0;
  let morph = 0;

  const mols = HEX_RING.map(([ix, iy], i) => {
    const angle = (i / HEX_RING.length) * Math.PI * 2 + 0.3;
    const ringR = i < 4 ? 0.36 : i < 11 ? 0.92 : 1.42;
    return {
      ix,
      iy,
      lx: Math.cos(angle) * ringR,
      ly: Math.sin(angle) * ringR * 0.88,
      rot: (i * 1.1) % (Math.PI * 2),
      phase: Math.random() * Math.PI * 2,
    };
  });

  controlsEl.innerHTML = `
    <div class="crystal-card">
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">温度与氢键结构控制</h4>
        <span class="crystal-tag">分子晶体 · 氢键</span>
      </div>
      <div class="crystal-exam-tabs">
        <button type="button" class="crystal-exam-tab is-active" data-t="0">0°C 固态冰</button>
        <button type="button" class="crystal-exam-tab" data-t="4">4°C 液态水</button>
        <button type="button" class="crystal-exam-tab" data-t="20">20°C 常温水</button>
      </div>
      <label style="display:flex;flex-direction:column;gap:0.3rem;font-size:0.82rem;color:var(--ink-soft,#475569);">
        <span style="display:flex;justify-content:space-between;font-weight:700;">
          <span>调节温度</span>
          <strong data-stat="temp" style="font-family:var(--font-mono,monospace);color:var(--accent,#2563eb);">0.0 °C</strong>
        </span>
        <input type="range" min="-10" max="20" step="0.5" value="0" data-act="slider" style="width:100%;accent-color:var(--accent,#2563eb);" />
      </label>
      <div class="crystal-exam-body">
        <div class="crystal-exam-metric">
          <span class="crystal-exam-k">实时密度 ρ</span>
          <span class="crystal-exam-v" data-stat="rho">0.917 g/cm³</span>
        </div>
        <div class="crystal-exam-metric" style="margin-bottom:0;">
          <span class="crystal-exam-k">氢键完整度</span>
          <span class="crystal-exam-v" data-stat="hb" style="color:#0ea5e9;">100%</span>
        </div>
      </div>
      <p class="crystal-exam-tip" data-stat="desc"></p>
    </div>
  `;

  const presetBtns = controlsEl.querySelectorAll('[data-t]');
  const slider = controlsEl.querySelector('[data-act="slider"]');
  const statTemp = controlsEl.querySelector('[data-stat="temp"]');
  const statRho = controlsEl.querySelector('[data-stat="rho"]');
  const statHb = controlsEl.querySelector('[data-stat="hb"]');
  const statDesc = controlsEl.querySelector('[data-stat="desc"]');

  function syncUI() {
    const rho = waterDensity(temp);
    const isIce = temp <= 0;
    const hbPct = isIce ? 100 : Math.round(clamp(72 - temp * 1.1, 45, 75));
    slider.value = String(temp);
    statTemp.textContent = `${temp.toFixed(1)} °C`;
    statRho.textContent = `${rho.toFixed(3)} g/cm³`;
    statRho.style.color = isIce ? '#38bdf8' : temp === 4 ? '#16a34a' : '#2563eb';
    statHb.textContent = `${hbPct}%`;
    presetBtns.forEach((b) => b.classList.toggle('is-active', Number(b.dataset.t) === temp));
    const msg = isIce
      ? '0°C 冰：每个水分子形成 4 个方向性氢键，构成正四面体大空隙骨架，体积膨胀 → ρ = 0.917 g/cm³ < 水'
      : temp <= 4
        ? '0°C→4°C 液态水：部分氢键断裂，水分子坍缩填入空隙，排布最紧密 → 4°C 时密度达最大值 1.000 g/cm³'
        : '4°C→20°C：热运动加剧占主导，分子间距微增，密度略降至 0.998 g/cm³';
    statDesc.textContent = msg;
    onCaption?.(msg);
  }

  presetBtns.forEach((b) => b.addEventListener('click', () => { temp = Number(b.dataset.t); syncUI(); }));
  slider.addEventListener('input', () => { temp = Number(slider.value); syncUI(); });
  syncUI();

  const loopCtrl = mountCanvasLoop(stageEl, (ctx, w, h, dt) => {
    tAccum += dt;
    const targetMorph = temp <= 0 ? 0 : clamp(0.68 + Math.min(temp, 4) * 0.08, 0, 1);
    morph += (targetMorph - morph) * Math.min(1, dt * 6);
    const expand = temp > 4 ? 1 + (temp - 4) * 0.0045 : 1;

    ctx.fillStyle = '#0d1322';
    ctx.fillRect(0, 0, w, h);

    const microW = w * 0.68;
    const mcx = microW * 0.5;
    const mcy = h * 0.48;
    const unit = clamp(Math.min(microW / 5.4, (h - 90) / 5.2), 26, 56);

    if (morph < 0.55) {
      const a = 1 - morph * 1.8;
      ctx.save();
      ctx.beginPath();
      ctx.arc(mcx, mcy, unit * 0.78, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(56,189,248,${(a * 0.14).toFixed(2)})`;
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = `rgba(125,211,252,${(a * 0.75).toFixed(2)})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = `rgba(186,230,253,${(a * 0.95).toFixed(2)})`;
      ctx.font = '700 12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('氢键大空隙', mcx, mcy + 4);
      ctx.restore();
    }

    const jitter = temp <= 0 ? 1.2 : 2.8 + temp * 0.14;
    const pts = mols.map((m) => ({
      x: mcx + (m.ix * (1 - morph) + m.lx * morph) * expand * unit + Math.sin(tAccum * (3 + morph * 3) + m.phase) * jitter,
      y: mcy + (m.iy * (1 - morph) + m.ly * morph) * expand * unit + Math.cos(tAccum * (2.6 + morph * 2.5) + m.phase * 1.3) * jitter,
      rot: m.rot + morph * Math.sin(tAccum + m.phase) * 0.4,
    }));

    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1.8;
    ICE_BONDS.forEach(([a, b], idx) => {
      if (morph > 0.4 && idx % 2 === 1) return;
      ctx.strokeStyle = morph < 0.4 ? 'rgba(56,189,248,0.75)' : 'rgba(56,189,248,0.35)';
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    });
    ctx.restore();

    for (const p of pts) {
      for (const off of [-0.91, 0.91]) {
        drawSphere(ctx, p.x + Math.cos(p.rot + off) * 11, p.y + Math.sin(p.rot + off) * 11, 4.8, '#ffffff', '#e2e8f0', '#94a3b8');
      }
      drawSphere(ctx, p.x, p.y, 8.2, '#fca5a5', '#ef4444', '#991b1b');
    }

    // 右侧宏观浮冰烧杯 + 实时密度标尺
    const bkX = microW + 14;
    const bkW = Math.max(96, w - microW - 30);
    const bkTop = 44;
    const bkH = h - 102;
    ctx.fillStyle = 'rgba(15,23,42,0.75)';
    ctx.strokeStyle = 'rgba(148,163,184,0.32)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bkX, bkTop, bkW, bkH, 12);
    ctx.fill();
    ctx.stroke();

    const waterTop = bkTop + bkH * 0.42;
    ctx.fillStyle = 'rgba(14,165,233,0.28)';
    ctx.fillRect(bkX + 6, waterTop, bkW - 12, bkTop + bkH - waterTop - 6);
    const iceSize = clamp(bkW * 0.48, 36, 62);
    const iceX = bkX + (bkW - iceSize) / 2;
    const iceY = waterTop - iceSize * 0.14 + Math.sin(tAccum * 2.2) * 2.2;
    ctx.fillStyle = 'rgba(186,230,253,0.82)';
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(iceX, iceY, iceSize, iceSize, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0c4a6e';
    ctx.font = '800 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('冰', iceX + iceSize / 2, iceY + iceSize * 0.56);

    const rho = waterDensity(temp);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 16px ui-monospace, monospace';
    ctx.fillText(rho.toFixed(3), bkX + bkW / 2, bkTop + 26);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui';
    ctx.fillText('g/cm³ (宏观漂浮)', bkX + bkW / 2, bkTop + 44);
    ctx.fillStyle = '#bae6fd';
    ctx.fillText(temp <= 0 ? '冰 ρ=0.917 < 水' : `水 ρ=${rho.toFixed(3)}`, bkX + bkW / 2, bkTop + bkH - 16);
  });

  return {
    ...loopCtrl,
    destroy() { loopCtrl.destroy(); controlsEl.innerHTML = ''; },
  };
}
