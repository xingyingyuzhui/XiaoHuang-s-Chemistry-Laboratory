/**
 * 实验 1：敲一下对比（金属 Cu 滑移延展 vs 食盐 NaCl 错位碎裂）
 * 5 主题自适应 Canvas 动画，支持正常 / 慢动作回放与连续敲击。
 */

import {
  clamp, easeOutCubic, easeInOutQuad,
  drawSphere, drawPanelCard, drawStatusPill, mountCanvasLoop,
} from './canvas-kit.js';

const COLS = 6;
const ROWS = 4;
const SPLIT_ROW = 2;

function drawHammer(ctx, x, y, angle, scale, p) {
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
  headG.addColorStop(0, p.isDark ? '#e2e8f0' : '#cbd5e1');
  headG.addColorStop(0.5, '#64748b');
  headG.addColorStop(1, '#334155');
  ctx.fillStyle = headG;
  ctx.beginPath();
  ctx.roundRect(-12, -22, 24, 44, 5);
  ctx.fill();
  ctx.strokeStyle = p.isDark ? 'rgba(248,250,252,0.55)' : 'rgba(15,23,42,0.38)';
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
    <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="strike">同时敲一下</button>
    <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">复原</button>
    <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="slow">慢动作 0.35×：关</button>
    <span class="crystal-param-pill">Cu: <strong data-stat="cu">整齐点阵</strong></span>
    <span class="crystal-param-pill">NaCl: <strong data-stat="nacl">整齐点阵</strong></span>
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
      statCu.textContent = `滑移 ${strikeCount} 格`;
      statNacl.textContent = '错位碎裂';
      btnStrike.disabled = strikeCount >= 2;
      btnStrike.textContent = strikeCount >= 2 ? '已达最大滑移' : '再敲一下';
      onCaption?.('结果：Cu 自由电子维系金属键 → 滑移不断裂；NaCl 错位后同号离子正对相斥 → 直接碎裂');
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
    btnSlow.textContent = `慢动作 0.35×：${slowMo ? '开' : '关'}`;
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
          statNacl.textContent = '同号相斥！';
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

  const loopCtrl = mountCanvasLoop(stageEl, (ctx, w, h, dt, p) => {
    step(dt);
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const padX = 18;
    const topSafe = 78;
    const botSafe = 76;
    const gap = 14;
    const pw = (w - padX * 2 - gap) / 2;
    const ph = Math.max(200, h - topSafe - botSafe);
    const leftX = padX;
    const rightX = padX + pw + gap;

    drawPanelCard(ctx, leftX, topSafe, pw, ph, '金属晶体 · Cu', '阳离子浸泡在自由电子海中', p.amorphousText, p);
    drawPanelCard(ctx, rightX, topSafe, pw, ph, '离子晶体 · NaCl', '阴阳离子交替强静电排列', p.crystalText, p);

    const cell = clamp(Math.min(pw / (COLS + 3.4), (ph - 110) / (ROWS + 1.4)), 22, 44);
    const baseY = topSafe + ph - 58 - (ROWS - 1) * cell;
    const cuX0 = leftX + (pw - (COLS - 1) * cell) * 0.46;
    const naX0 = rightX + (pw - (COLS - 1) * cell) * 0.46;
    const shearY = baseY + (SPLIT_ROW - 0.5) * cell;

    const seaX = cuX0 - cell * 0.6 + cuSlip * cell * 0.25;
    const seaY = baseY - cell * 0.65;
    const seaW = (COLS - 1 + cuSlip * 0.85) * cell + cell * 1.25;
    const seaH = (ROWS - 1) * cell + cell * 1.3;
    const seaG = ctx.createLinearGradient(seaX, seaY, seaX + seaW, seaY + seaH);
    seaG.addColorStop(0, p.crystalSoft);
    seaG.addColorStop(0.5, p.amorphousSoft);
    seaG.addColorStop(1, p.crystalSoft);
    ctx.fillStyle = seaG;
    ctx.beginPath();
    ctx.roundRect(seaX, seaY, seaW, seaH, 16);
    ctx.fill();

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = p.amorphous;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(leftX + 18, shearY);
    ctx.lineTo(leftX + pw - 18, shearY);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = naclRepel > 0.1 ? p.bad : p.grid;
    ctx.lineWidth = naclRepel > 0.1 ? 2.2 : 1.3;
    ctx.beginPath();
    ctx.moveTo(rightX + 18, shearY);
    ctx.lineTo(rightX + pw - 18, shearY);
    ctx.stroke();
    ctx.restore();

    const cuR = cell * 0.36;
    for (let r = 0; r < ROWS; r++) {
      const shiftX = r < SPLIT_ROW ? cuSlip * cell : 0;
      for (let c = 0; c < COLS; c++) {
        drawSphere(ctx, cuX0 + c * cell + shiftX, baseY + r * cell, cuR, '#fde68a', '#d97706', '#78350f', 'Cu²⁺', p.sphereRim);
      }
    }
    for (const e of electrons) {
      ctx.beginPath();
      ctx.arc(seaX + e.u * seaW, seaY + e.v * seaH, 3.1, 0, Math.PI * 2);
      ctx.fillStyle = p.crystal;
      ctx.globalAlpha = 0.5 + 0.35 * Math.sin(e.phase);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (strikeCount > 0 && state !== 'swinging') {
      drawStatusPill(ctx, leftX + 16, topSafe + ph - 36, pw - 32, '自由电子缓冲：层间滑移不断裂 → 延展性', p.okSoft, p.ok, p.okText);
    }

    const rNa = cell * 0.29;
    const rCl = cell * 0.39;
    const drawIon = (ix, iy, isNa) => (isNa
      ? drawSphere(ctx, ix, iy, rNa, '#e9d5ff', '#9333ea', '#4c1d95', '+', p.sphereRim)
      : drawSphere(ctx, ix, iy, rCl, '#bbf7d0', '#16a34a', '#14532d', '−', p.sphereRim));

    for (let r = SPLIT_ROW; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) drawIon(naX0 + c * cell, baseY + r * cell, (r + c) % 2 === 0);
    }

    if (naclRepel > 0.05) {
      ctx.save();
      ctx.globalAlpha = naclRepel;
      ctx.strokeStyle = p.bad;
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
      ctx.fillStyle = p.badText;
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
      drawStatusPill(ctx, rightX + 16, topSafe + ph - 36, pw - 32, '同号离子相斥：离子键断裂 → 晶体碎裂', p.badSoft, p.bad, p.badText);
    }

    const hScale = clamp(cell / 36, 0.72, 1.15);
    const angle = -0.58 + hammerSwing * 0.62;
    const hitX = hammerSwing * 14;
    const hammerY = baseY + cell * 0.5;
    drawHammer(ctx, cuX0 - cell * 1.15 + hitX, hammerY, angle, hScale, p);
    drawHammer(ctx, naX0 - cell * 1.15 + hitX, hammerY, angle, hScale, p);

    if (impactFlash > 0.02) {
      const flashR = (1 - impactFlash) * cell * 1.4 + 8;
      ctx.strokeStyle = p.flash;
      ctx.globalAlpha = impactFlash * 0.85;
      ctx.lineWidth = 2.5;
      for (const ox of [cuX0 - cell * 0.45, naX0 - cell * 0.45]) {
        ctx.beginPath();
        ctx.arc(ox, hammerY, flashR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  });

  return {
    ...loopCtrl,
    destroy() { loopCtrl.destroy(); controlsEl.innerHTML = ''; },
  };
}
