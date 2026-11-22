/**
 * 实验 1：敲一下对比（金属 Cu 滑移延展 vs 食盐 NaCl 错位碎裂）
 * 暗棚单 Canvas 动画，支持正常 / 慢动作回放与连续敲击。
 */

import {
  clamp, easeOutCubic, easeInOutQuad,
  drawSphere, drawPanelCard, drawStatusPill, mountCanvasLoop,
} from './canvas-kit.js';

const COLS = 6;
const ROWS = 4;
const SPLIT_ROW = 2;

function drawHammer(ctx, x, y, angle, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);

  const handleG = ctx.createLinearGradient(-56, -5, -56, 5);
  handleG.addColorStop(0, '#d97706');
  handleG.addColorStop(1, '#78350f');
  ctx.fillStyle = handleG;
  ctx.beginPath();
  ctx.roundRect(-64, -5, 58, 10, 4);
  ctx.fill();

  const headG = ctx.createLinearGradient(-10, -22, 14, 22);
  headG.addColorStop(0, '#e2e8f0');
  headG.addColorStop(0.5, '#94a3b8');
  headG.addColorStop(1, '#475569');
  ctx.fillStyle = headG;
  ctx.beginPath();
  ctx.roundRect(-12, -22, 24, 44, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(248,250,252,0.55)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

export function createHammerExp(stageEl, controlsEl, onCaption) {
  const electrons = Array.from({ length: 40 }, (_, i) => ({
    u: (i % 7) / 6 + (Math.random() - 0.5) * 0.12,
    v: Math.floor(i / 7) / 5 + (Math.random() - 0.5) * 0.12,
    vx: (Math.random() - 0.5) * 0.28,
    vy: (Math.random() - 0.5) * 0.28,
    phase: Math.random() * Math.PI * 2,
  }));

  let state = 'idle';
  let animTime = 0;
  let strikeCount = 0;
  let cuSlipFrom = 0;
  let cuSlipTarget = 0;
  let cuSlip = 0;
  let naclSlip = 0;
  let naclRepel = 0;
  let naclExplode = 0;
  let hammerSwing = 0;
  let impactFlash = 0;
  let slowMo = false;
  let shards = [];

  function resetShards() {
    shards = [];
    for (let r = 0; r < SPLIT_ROW; r++) {
      for (let c = 0; c < COLS; c++) {
        shards.push({
          r,
          c,
          vx: (c - (COLS - 1) / 2) * 26 + 28 + (Math.random() - 0.5) * 18,
          vy: -78 - (SPLIT_ROW - r) * 32 - Math.random() * 44,
        });
      }
    }
  }
  resetShards();

  controlsEl.innerHTML = `
    <div class="crystal-card">
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">敲击对比控制台</h4>
        <span class="crystal-tag">机械外力</span>
      </div>
      <div class="crystal-slice-actions">
        <button type="button" class="crystal-btn crystal-btn-primary" data-act="strike">同时敲一下</button>
        <button type="button" class="crystal-btn crystal-btn-ghost" data-act="reset">复原</button>
      </div>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-full crystal-btn-sm" data-act="slow">
        慢动作观察（0.35×）：关闭
      </button>
      <div class="crystal-exam-body">
        <div class="crystal-exam-metric">
          <span class="crystal-exam-k">金属铜 Cu</span>
          <span class="crystal-exam-v" data-stat="cu">整齐点阵</span>
        </div>
        <div class="crystal-exam-metric" style="margin-bottom:0;">
          <span class="crystal-exam-k">食盐 NaCl</span>
          <span class="crystal-exam-v" data-stat="nacl" style="color:var(--flame,#d97706);">整齐点阵</span>
        </div>
      </div>
      <p class="crystal-exam-tip">提示：可连续敲击观察金属铜层层滑移；打开慢动作可看清 NaCl 错位时同号电荷相斥瞬间。</p>
    </div>
  `;

  const btnStrike = controlsEl.querySelector('[data-act="strike"]');
  const btnReset = controlsEl.querySelector('[data-act="reset"]');
  const btnSlow = controlsEl.querySelector('[data-act="slow"]');
  const statCu = controlsEl.querySelector('[data-stat="cu"]');
  const statNacl = controlsEl.querySelector('[data-stat="nacl"]');

  function updateStatusUI() {
    if (strikeCount === 0 && state === 'idle') {
      statCu.textContent = '整齐点阵';
      statNacl.textContent = '整齐点阵';
      btnStrike.textContent = '同时敲一下';
      btnStrike.disabled = false;
      onCaption?.('点击「同时敲一下」，对比金属晶体与离子晶体受外力后的微观变化');
    } else if (state === 'swinging' || state === 'slipping') {
      statCu.textContent = '层间滑移中…';
      statNacl.textContent = naclRepel > 0.15 ? '同号相斥！' : '发生错位…';
      btnStrike.disabled = true;
    } else {
      statCu.textContent = `已滑移 ${strikeCount} 格（不断裂）`;
      statNacl.textContent = '错位碎裂（脆性）';
      btnStrike.disabled = strikeCount >= 2;
      btnStrike.textContent = strikeCount >= 2 ? '已达最大滑移' : '再敲一下（看铜延展）';
      onCaption?.('结果：Cu 自由电子维系金属键→滑移不断裂；NaCl 错位后同号离子正对相斥→直接碎裂');
    }
  }

  btnStrike.addEventListener('click', () => {
    if (state === 'swinging' || state === 'slipping' || strikeCount >= 2) return;
    strikeCount += 1;
    cuSlipFrom = cuSlip;
    cuSlipTarget = strikeCount;
    state = 'swinging';
    animTime = 0;
    if (strikeCount === 1) resetShards();
    updateStatusUI();
  });

  btnReset.addEventListener('click', () => {
    state = 'idle';
    animTime = strikeCount = cuSlipFrom = cuSlipTarget = cuSlip = 0;
    naclSlip = naclRepel = naclExplode = hammerSwing = impactFlash = 0;
    resetShards();
    updateStatusUI();
  });

  btnSlow.addEventListener('click', () => {
    slowMo = !slowMo;
    btnSlow.textContent = `慢动作观察（0.35×）：${slowMo ? '开启' : '关闭'}`;
    btnSlow.classList.toggle('crystal-btn-primary', slowMo);
    btnSlow.classList.toggle('crystal-btn-ghost', !slowMo);
  });

  updateStatusUI();

  function step(dt) {
    for (const e of electrons) {
      e.u += e.vx * dt;
      e.v += e.vy * dt;
      e.phase += dt * 4.5;
      if (e.u < -0.06 || e.u > 1.06) e.vx *= -1;
      if (e.v < -0.06 || e.v > 1.06) e.vy *= -1;
    }

    const sdt = dt * (slowMo ? 0.35 : 1);
    if (state === 'swinging') {
      animTime += sdt;
      const t = clamp(animTime / 0.28, 0, 1);
      hammerSwing = easeInOutQuad(t);
      if (t >= 1) { state = 'slipping'; animTime = 0; impactFlash = 1; }
    } else if (state === 'slipping') {
      animTime += sdt;
      impactFlash = Math.max(0, impactFlash - sdt * 3.2);
      hammerSwing = Math.max(0, 1 - animTime / 0.35);
      cuSlip = cuSlipFrom + (cuSlipTarget - cuSlipFrom) * easeOutCubic(clamp(animTime / 0.9, 0, 1));

      if (strikeCount === 1) {
        if (animTime < 0.45) {
          naclSlip = easeOutCubic(animTime / 0.45);
          naclRepel = clamp((animTime - 0.18) / 0.25, 0, 1);
        } else if (animTime < 0.95) {
          naclSlip = 1;
          naclRepel = 1;
          statNacl.textContent = '同号离子正对相斥！';
        } else {
          const exT = clamp((animTime - 0.95) / 0.85, 0, 1);
          naclRepel = Math.max(0, 1 - exT * 1.6);
          naclExplode = easeOutCubic(exT);
        }
        if (animTime >= 1.85) { state = 'settled'; updateStatusUI(); }
      } else if (animTime >= 0.95) {
        state = 'settled';
        updateStatusUI();
      }
    }
  }

  const loopCtrl = mountCanvasLoop(stageEl, (ctx, w, h, dt) => {
    step(dt);
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.4, 40, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
    bg.addColorStop(0, '#131d36');
    bg.addColorStop(1, '#0b101d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const pad = 16;
    const gap = 14;
    const pw = (w - pad * 2 - gap) / 2;
    const ph = h - pad * 2 - 40;
    const leftX = pad;
    const rightX = pad + pw + gap;

    drawPanelCard(ctx, leftX, pad, pw, ph, '金属晶体 · Cu', '阳离子浸泡在自由电子海中', '#fbbf24');
    drawPanelCard(ctx, rightX, pad, pw, ph, '离子晶体 · NaCl', '阴阳离子交替强静电排列', '#38bdf8');

    const cell = clamp(Math.min(pw / (COLS + 3.4), (ph - 105) / (ROWS + 1.5)), 24, 44);
    const baseY = pad + ph - 52 - (ROWS - 1) * cell;
    const cuX0 = leftX + (pw - (COLS - 1) * cell) * 0.44;
    const naX0 = rightX + (pw - (COLS - 1) * cell) * 0.44;
    const shearY = baseY + (SPLIT_ROW - 0.5) * cell;

    // Cu 电子海 + 剪切虚线 + Cu2+ 点阵
    const seaX = cuX0 - cell * 0.6 + cuSlip * cell * 0.25;
    const seaY = baseY - cell * 0.65;
    const seaW = (COLS - 1 + cuSlip * 0.85) * cell + cell * 1.25;
    const seaH = (ROWS - 1) * cell + cell * 1.3;
    const seaG = ctx.createLinearGradient(seaX, seaY, seaX + seaW, seaY + seaH);
    seaG.addColorStop(0, 'rgba(56,189,248,0.14)');
    seaG.addColorStop(0.5, 'rgba(251,191,36,0.15)');
    seaG.addColorStop(1, 'rgba(56,189,248,0.14)');
    ctx.fillStyle = seaG;
    ctx.beginPath();
    ctx.roundRect(seaX, seaY, seaW, seaH, 16);
    ctx.fill();

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = 'rgba(251,191,36,0.35)';
    ctx.beginPath();
    ctx.moveTo(leftX + 18, shearY);
    ctx.lineTo(leftX + pw - 18, shearY);
    ctx.stroke();
    ctx.strokeStyle = naclRepel > 0.1 ? 'rgba(248,113,113,0.85)' : 'rgba(148,163,184,0.32)';
    ctx.lineWidth = naclRepel > 0.1 ? 2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(rightX + 18, shearY);
    ctx.lineTo(rightX + pw - 18, shearY);
    ctx.stroke();
    ctx.restore();

    const cuR = cell * 0.36;
    for (let r = 0; r < ROWS; r++) {
      const shiftX = r < SPLIT_ROW ? cuSlip * cell : 0;
      for (let c = 0; c < COLS; c++) {
        drawSphere(ctx, cuX0 + c * cell + shiftX, baseY + r * cell, cuR, '#fde68a', '#d97706', '#78350f', 'Cu²⁺');
      }
    }
    for (const e of electrons) {
      ctx.beginPath();
      ctx.arc(seaX + e.u * seaW, seaY + e.v * seaH, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(125,211,252,${(0.55 + 0.35 * Math.sin(e.phase)).toFixed(2)})`;
      ctx.fill();
    }
    if (strikeCount > 0 && state !== 'swinging') {
      drawStatusPill(ctx, leftX + 16, pad + ph - 34, pw - 32, '自由电子缓冲：层间滑移不断裂 → 延展性', 'rgba(22,163,74,0.22)', '#4ade80', '#bbf7d0');
    }

    // NaCl 下半固定层 + 同号排斥闪电 + 上半飞散碎片
    const rNa = cell * 0.29;
    const rCl = cell * 0.39;
    const drawIon = (ix, iy, isNa) => (isNa
      ? drawSphere(ctx, ix, iy, rNa, '#e9d5ff', '#9333ea', '#4c1d95', '+')
      : drawSphere(ctx, ix, iy, rCl, '#bbf7d0', '#16a34a', '#14532d', '−'));

    for (let r = SPLIT_ROW; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) drawIon(naX0 + c * cell, baseY + r * cell, (r + c) % 2 === 0);
    }

    if (naclRepel > 0.05) {
      ctx.save();
      ctx.strokeStyle = `rgba(248,113,113,${naclRepel.toFixed(2)})`;
      ctx.lineWidth = 2.5;
      for (let c = 0; c < COLS - 1; c++) {
        const px = naX0 + (c + 1) * cell;
        const y1 = baseY + (SPLIT_ROW - 1) * cell + cell * 0.32;
        const y2 = baseY + SPLIT_ROW * cell - cell * 0.32;
        ctx.beginPath();
        ctx.moveTo(px, y1);
        ctx.lineTo(px - 5, (y1 + y2) * 0.5 - 3);
        ctx.lineTo(px + 5, (y1 + y2) * 0.5 + 3);
        ctx.lineTo(px, y2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(254,202,202,${naclRepel.toFixed(2)})`;
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚡ 同号电荷正对 · 强烈排斥！', rightX + pw * 0.52, shearY - cell * 1.65);
      ctx.restore();
    }

    for (const s of shards) {
      ctx.save();
      ctx.globalAlpha = clamp(1 - naclExplode * 0.25, 0.3, 1);
      const ix = naX0 + (s.c + naclSlip) * cell + s.vx * naclExplode;
      const iy = baseY + s.r * cell + s.vy * naclExplode + 38 * naclExplode * naclExplode;
      drawIon(ix, iy, (s.r + s.c) % 2 === 0);
      ctx.restore();
    }
    if (naclExplode > 0.35) {
      drawStatusPill(ctx, rightX + 16, pad + ph - 34, pw - 32, '同号离子相斥：离子键断裂 → 晶体碎裂', 'rgba(239,68,68,0.22)', '#f87171', '#fecaca');
    }

    // 两侧同步锤子与冲击波
    const hScale = clamp(cell / 36, 0.72, 1.15);
    const angle = -0.58 + hammerSwing * 0.62;
    const hitX = hammerSwing * 14;
    const hammerY = baseY + cell * 0.5;
    drawHammer(ctx, cuX0 - cell * 1.15 + hitX, hammerY, angle, hScale);
    drawHammer(ctx, naX0 - cell * 1.15 + hitX, hammerY, angle, hScale);

    if (impactFlash > 0.02) {
      const flashR = (1 - impactFlash) * cell * 1.4 + 8;
      ctx.strokeStyle = `rgba(253,224,71,${(impactFlash * 0.85).toFixed(2)})`;
      ctx.lineWidth = 2.5;
      for (const ox of [cuX0 - cell * 0.45, naX0 - cell * 0.45]) {
        ctx.beginPath();
        ctx.arc(ox, hammerY, flashR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });

  return {
    ...loopCtrl,
    destroy() { loopCtrl.destroy(); controlsEl.innerHTML = ''; },
  };
}
