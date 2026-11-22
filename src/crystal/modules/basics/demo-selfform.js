/**
 * 模块 01 · 认识晶体：Demo 2（NaCl 自范性生长 + 敲掉一角 + 饱和食盐水自修复）
 */

import { STAGE_BG, setupHiDpiCanvas } from './stage-canvas.js';

export function mountSelfFormDemo({ stageEl, controlsEl, setCaption, setLegend }) {
  const { canvas, ctx, getSize, resize, dispose } = setupHiDpiCanvas(stageEl);

  const N = 7;
  const sites = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      const distCenter = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      const isCornerChip = r <= 2 && c >= 4 && r + (N - 1 - c) <= 3;
      sites.push({
        r,
        c,
        type: (r + c) % 2 === 0 ? 'Na' : 'Cl',
        layer: distCenter,
        isCornerChip,
        filled: distCenter <= 1,
        scale: distCenter <= 1 ? 1 : 0,
      });
    }
  }

  const freeIons = Array.from({ length: 34 }, (_, i) => ({
    x: ((i * 73) % 100) / 100,
    y: ((i * 41 + 19) % 100) / 100,
    vx: Math.sin(i * 3.1) * 0.0022,
    vy: Math.cos(i * 2.7) * 0.0022,
    type: i % 2 === 0 ? 'Na' : 'Cl',
  }));

  let debris = [];
  let mode = 'grow'; // 'grow' | 'chipped' | 'heal' | 'full'
  let hammerAnim = 0;
  let tick = 0;
  let paused = false;
  let rafId = 0;

  setLegend([
    { label: 'Na⁺ 离子', color: '#818cf8' },
    { label: 'Cl⁻ 离子', color: '#34d399' },
    { label: '饱和食盐水', color: '#38bdf8' },
  ]);

  controlsEl.innerHTML = `
    <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-full" data-act="grow">
      1. 饱和溶液中自发生长
    </button>
    <div class="crystal-slice-actions">
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="chip">2. 敲掉一角</button>
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="heal">3. 放入溶液自修复</button>
    </div>
    <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-full" data-act="reset">
      重置为晶核
    </button>
    <p class="crystal-exam-desc">提示：缺角处暴露的高能台阶面会优先吸引溶液中的 Na⁺ 与 Cl⁻，自动补全为规整立方体。</p>
  `;

  const btnGrow = controlsEl.querySelector('[data-act="grow"]');
  const btnChip = controlsEl.querySelector('[data-act="chip"]');
  const btnHeal = controlsEl.querySelector('[data-act="heal"]');
  const btnReset = controlsEl.querySelector('[data-act="reset"]');

  function updateCaption() {
    const filledCnt = sites.filter((s) => s.filled).length;
    if (mode === 'grow') {
      setCaption(`自范性生长中（${filledCnt}/${sites.length}）：离子按周期性点阵有序堆积，自发形成规则立方外形`);
    } else if (mode === 'chipped') {
      setCaption('已敲掉右上角！观察断口台阶——点击「3. 放入溶液自修复」见证晶体自动长回棱角');
    } else if (mode === 'heal') {
      setCaption('自修复中：溶液中的 Na⁺、Cl⁻ 优先落位到缺角台阶处，恢复完美几何多面体');
    } else {
      setCaption('完整 NaCl 立方晶体已长成！可点击「2. 敲掉一角」或直接点击晶体测试自修复');
    }
  }

  function resetSeed() {
    mode = 'grow';
    debris = [];
    hammerAnim = 0;
    sites.forEach((s) => {
      s.filled = s.layer <= 1;
      s.scale = s.filled ? 1 : 0;
    });
    updateCaption();
  }

  function chipCorner() {
    sites.forEach((s) => {
      s.filled = !s.isCornerChip;
      s.scale = s.filled ? 1 : 0;
    });
    mode = 'chipped';
    hammerAnim = 1;
    debris = Array.from({ length: 8 }, (_, i) => ({
      dx: 12 + i * 6,
      dy: -16 - (i % 3) * 10,
      vx: 2.2 + (i % 4) * 0.9,
      vy: -3.2 + (i % 3) * 0.8,
      type: i % 2 === 0 ? 'Na' : 'Cl',
      alpha: 1,
    }));
    updateCaption();
  }

  btnGrow.addEventListener('click', () => {
    mode = 'grow';
    updateCaption();
  });
  btnChip.addEventListener('click', chipCorner);
  btnHeal.addEventListener('click', () => {
    if (sites.every((s) => s.filled)) chipCorner();
    mode = 'heal';
    updateCaption();
  });
  btnReset.addEventListener('click', resetSeed);

  const onCanvasClick = () => {
    if (mode === 'full') chipCorner();
    else if (mode === 'chipped') {
      mode = 'heal';
      updateCaption();
    }
  };
  canvas.addEventListener('click', onCanvasClick);
  updateCaption();

  function frame() {
    if (paused) return;
    tick += 1;
    const { width, height } = getSize();

    ctx.fillStyle = STAGE_BG;
    ctx.fillRect(0, 0, width, height);

    const padX = Math.max(36, width * 0.08);
    const padY = 58;
    const boxW = width - padX * 2;
    const boxH = height - padY - 58;
    const waterGrad = ctx.createLinearGradient(0, padY, 0, padY + boxH);
    waterGrad.addColorStop(0, 'rgba(14, 116, 144, 0.16)');
    waterGrad.addColorStop(1, 'rgba(30, 58, 138, 0.34)');
    ctx.fillStyle = waterGrad;
    ctx.beginPath();
    ctx.roundRect(padX, padY, boxW, boxH, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.32)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const cx = width * 0.5;
    const cy = padY + boxH * 0.52;
    const step = Math.min(boxW, boxH) / 10.5;
    const originX = cx - (N - 1) * step * 0.5;
    const originY = cy - (N - 1) * step * 0.5;

    if ((mode === 'grow' || mode === 'heal') && tick % 10 === 0) {
      const pending = sites.filter((s) => !s.filled).sort((a, b) => a.layer - b.layer || a.r - b.r);
      if (pending.length > 0) {
        pending[0].filled = true;
        updateCaption();
      } else {
        mode = 'full';
        updateCaption();
      }
    }

    for (const ion of freeIons) {
      ion.x += ion.vx;
      ion.y += ion.vy;
      if (ion.x < 0.04 || ion.x > 0.96) ion.vx *= -1;
      if (ion.y < 0.06 || ion.y > 0.94) ion.vy *= -1;
      ctx.beginPath();
      ctx.arc(padX + ion.x * boxW, padY + ion.y * boxH, ion.type === 'Cl' ? 5.5 : 4.2, 0, Math.PI * 2);
      ctx.fillStyle = ion.type === 'Cl' ? 'rgba(52, 211, 153, 0.45)' : 'rgba(129, 140, 248, 0.5)';
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(125, 211, 252, 0.38)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(originX - step * 0.55, originY - step * 0.55, N * step + step * 0.1, N * step + step * 0.1);
    ctx.setLineDash([]);

    if (mode === 'chipped' || mode === 'heal') {
      for (const s of sites) {
        if (s.filled) continue;
        ctx.beginPath();
        ctx.arc(originX + s.c * step, originY + s.r * step, step * 0.34, 0, Math.PI * 2);
        ctx.strokeStyle = mode === 'heal' ? 'rgba(251, 191, 36, 0.7)' : 'rgba(244, 63, 94, 0.45)';
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }

    for (const s of sites) {
      if (!s.filled) continue;
      s.scale = Math.min(1, s.scale + 0.12);
      const sx = originX + s.c * step;
      const sy = originY + s.r * step;
      const r = (s.type === 'Cl' ? step * 0.42 : step * 0.3) * s.scale;
      const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r);
      if (s.type === 'Cl') {
        g.addColorStop(0, '#a7f3d0');
        g.addColorStop(1, '#059669');
      } else {
        g.addColorStop(0, '#c7d2fe');
        g.addColorStop(1, '#4f46e5');
      }
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
    }

    for (const d of debris) {
      if (d.alpha <= 0.02) continue;
      d.dx += d.vx;
      d.dy += d.vy;
      d.vy += 0.14;
      d.alpha *= 0.96;
      ctx.save();
      ctx.globalAlpha = d.alpha;
      ctx.beginPath();
      ctx.arc(originX + (N - 1.4) * step + d.dx, originY + step * 0.8 + d.dy, d.type === 'Cl' ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = d.type === 'Cl' ? '#34d399' : '#818cf8';
      ctx.fill();
      ctx.restore();
    }

    if (hammerAnim > 0.02) {
      hammerAnim *= 0.9;
      ctx.save();
      ctx.translate(originX + N * step + 18, originY - 12);
      ctx.rotate(-0.4 - hammerAnim * 0.75);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(-34, -8, 36, 6);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-44, -18, 16, 26);
      ctx.restore();
    }

    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  return {
    pause() {
      paused = true;
      cancelAnimationFrame(rafId);
    },
    resume() {
      if (!paused) return;
      paused = false;
      rafId = requestAnimationFrame(frame);
    },
    resize,
    destroy() {
      paused = true;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('click', onCanvasClick);
      dispose();
    },
  };
}
