/**
 * 模块 01 · 认识晶体：Demo 2（NaCl 自范性生长 + 敲掉一角 + 饱和食盐水自修复）
 */

import { setupHiDpiCanvas } from './stage-canvas.js';

export function mountSelfFormDemo({ stageEl, controlsEl, setCaption, setLegend }) {
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
  let mode = 'grow';
  let hammerAnim = 0;
  let tick = 0;
  let paused = false;
  let rafId = 0;

  const { canvas, ctx, getSize, getPalette, resize, dispose } = setupHiDpiCanvas(stageEl, () => render());

  setLegend([
    { label: 'Na⁺ 离子', color: '#6366f1' },
    { label: 'Cl⁻ 离子', color: '#16a34a' },
    { label: '饱和食盐水', color: '#0284c7' },
  ]);

  controlsEl.innerHTML = `
    <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="grow">1. 自发生长</button>
    <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="chip">2. 敲掉一角</button>
    <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="heal">3. 溶液自修复</button>
    <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">重置晶核</button>
  `;

  const btnGrow = controlsEl.querySelector('[data-act="grow"]');
  const btnChip = controlsEl.querySelector('[data-act="chip"]');
  const btnHeal = controlsEl.querySelector('[data-act="heal"]');
  const btnReset = controlsEl.querySelector('[data-act="reset"]');

  function updateCaption() {
    const filledCnt = sites.filter((s) => s.filled).length;
    if (mode === 'grow') {
      setCaption(`自范性生长中（${filledCnt}/${sites.length}）：离子按周期性点阵有序堆积，自发长成规则立方外形`);
    } else if (mode === 'chipped') {
      setCaption('已敲掉右上角！点击「3. 溶液自修复」或直接点击晶体见证缺角优先补齐');
    } else if (mode === 'heal') {
      setCaption('自修复中：溶液中 Na⁺、Cl⁻ 优先落位到高能断口台阶，恢复规整多面体');
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

  btnGrow.addEventListener('click', () => { mode = 'grow'; updateCaption(); });
  btnChip.addEventListener('click', chipCorner);
  btnHeal.addEventListener('click', () => {
    if (sites.every((s) => s.filled)) chipCorner();
    mode = 'heal';
    updateCaption();
  });
  btnReset.addEventListener('click', resetSeed);

  const onCanvasClick = () => {
    if (mode === 'full') chipCorner();
    else if (mode === 'chipped') { mode = 'heal'; updateCaption(); }
  };
  canvas.addEventListener('click', onCanvasClick);
  updateCaption();

  function render() {
    const { width, height } = getSize();
    const p = getPalette();

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, width, height);

    const padX = Math.max(40, width * 0.08);
    const padY = 82;
    const boxW = width - padX * 2;
    const boxH = Math.max(180, height - padY - 78);
    const waterGrad = ctx.createLinearGradient(0, padY, 0, padY + boxH);
    waterGrad.addColorStop(0, p.water);
    waterGrad.addColorStop(1, p.waterDeep);
    ctx.fillStyle = waterGrad;
    ctx.beginPath();
    ctx.roundRect(padX, padY, boxW, boxH, 16);
    ctx.fill();
    ctx.strokeStyle = p.crystal;
    ctx.globalAlpha = p.isDark ? 0.42 : 0.36;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = p.crystalText;
    ctx.font = '600 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('饱和 NaCl 水溶液（溶解—结晶动态平衡）', padX + 14, padY + 22);

    const cx = width * 0.5;
    const cy = padY + boxH * 0.54;
    const step = Math.min(boxW, boxH) / 10.6;
    const originX = cx - (N - 1) * step * 0.5;
    const originY = cy - (N - 1) * step * 0.5;

    for (const ion of freeIons) {
      ctx.beginPath();
      ctx.arc(padX + ion.x * boxW, padY + ion.y * boxH, ion.type === 'Cl' ? 5.2 : 4.0, 0, Math.PI * 2);
      ctx.fillStyle = ion.type === 'Cl'
        ? (p.isDark ? 'rgba(52, 211, 153, 0.48)' : 'rgba(22, 163, 74, 0.36)')
        : (p.isDark ? 'rgba(129, 140, 248, 0.52)' : 'rgba(99, 102, 241, 0.40)');
      ctx.fill();
    }

    ctx.strokeStyle = p.grid;
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(originX - step * 0.55, originY - step * 0.55, N * step + step * 0.1, N * step + step * 0.1);
    ctx.setLineDash([]);

    if (mode === 'chipped' || mode === 'heal') {
      for (const s of sites) {
        if (s.filled) continue;
        ctx.beginPath();
        ctx.arc(originX + s.c * step, originY + s.r * step, step * 0.34, 0, Math.PI * 2);
        ctx.strokeStyle = mode === 'heal' ? p.amorphous : p.covalent;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    for (const s of sites) {
      if (!s.filled) continue;
      const sx = originX + s.c * step;
      const sy = originY + s.r * step;
      const r = (s.type === 'Cl' ? step * 0.42 : step * 0.3) * s.scale;
      const g = ctx.createRadialGradient(sx - r * 0.3, sy - r * 0.3, r * 0.1, sx, sy, r);
      if (s.type === 'Cl') {
        g.addColorStop(0, '#bbf7d0');
        g.addColorStop(0.55, '#16a34a');
        g.addColorStop(1, '#14532d');
      } else {
        g.addColorStop(0, '#c7d2fe');
        g.addColorStop(0.55, '#6366f1');
        g.addColorStop(1, '#312e81');
      }
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = p.sphereRim;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    for (const d of debris) {
      if (d.alpha <= 0.02) continue;
      ctx.save();
      ctx.globalAlpha = d.alpha;
      ctx.beginPath();
      ctx.arc(originX + (N - 1.4) * step + d.dx, originY + step * 0.8 + d.dy, d.type === 'Cl' ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = d.type === 'Cl' ? p.ok : '#6366f1';
      ctx.fill();
      ctx.restore();
    }

    if (hammerAnim > 0.02) {
      ctx.save();
      ctx.translate(originX + N * step + 18, originY - 12);
      ctx.rotate(-0.4 - hammerAnim * 0.75);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(-34, -8, 36, 6);
      ctx.fillStyle = p.isDark ? '#e2e8f0' : '#475569';
      ctx.fillRect(-44, -18, 16, 26);
      ctx.restore();
    }
  }

  function frame() {
    if (paused) return;
    tick += 1;

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
      if (ion.y < 0.12 || ion.y > 0.94) ion.vy *= -1;
    }
    for (const s of sites) {
      if (s.filled) s.scale = Math.min(1, s.scale + 0.12);
    }
    for (const d of debris) {
      if (d.alpha <= 0.02) continue;
      d.dx += d.vx;
      d.dy += d.vy;
      d.vy += 0.14;
      d.alpha *= 0.96;
    }
    if (hammerAnim > 0.02) hammerAnim *= 0.9;

    render();
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);

  return {
    pause() { paused = true; cancelAnimationFrame(rafId); },
    resume() { if (!paused) return; paused = false; rafId = requestAnimationFrame(frame); },
    resize() { resize(); render(); },
    destroy() {
      paused = true;
      cancelAnimationFrame(rafId);
      canvas.removeEventListener('click', onCanvasClick);
      dispose();
    },
  };
}
