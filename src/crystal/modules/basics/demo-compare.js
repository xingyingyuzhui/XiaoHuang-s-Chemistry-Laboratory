/**
 * 模块 01 · 认识晶体：Demo 1（晶体 vs 非晶体：水晶 3D 棱柱 vs 石英玻璃 + 一键放大 Si–O 微观网）
 * 同时重导出 Demo 2（mountSelfFormDemo）保持对外入口兼容。
 */

import { STAGE_BG, setupHiDpiCanvas } from './stage-canvas.js';

export { mountSelfFormDemo } from './demo-selfform.js';

function project3D(pt, rotY, rotX, cx, cy, scale) {
  const cy1 = Math.cos(rotY);
  const sy1 = Math.sin(rotY);
  const x1 = pt[0] * cy1 - pt[2] * sy1;
  const z1 = pt[0] * sy1 + pt[2] * cy1;
  const cx1 = Math.cos(rotX);
  const sx1 = Math.sin(rotX);
  const y2 = pt[1] * cx1 - z1 * sx1;
  const z2 = pt[1] * sx1 + z1 * cx1;
  const persp = 4.2 / (4.2 - z2 * 0.45);
  return { x: cx + x1 * scale * persp, y: cy + y2 * scale * persp, z: z2 };
}

function buildHexPrism() {
  const verts = [];
  const R = 0.72;
  const H = 0.76;
  const tipH = 1.24;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    verts.push([Math.cos(a) * R, -H, Math.sin(a) * R]);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    verts.push([Math.cos(a) * R, H, Math.sin(a) * R]);
  }
  verts.push([0, -tipH, 0], [0, tipH, 0]);
  const faces = [];
  for (let i = 0; i < 6; i++) {
    const n = (i + 1) % 6;
    faces.push([i, n, n + 6, i + 6], [12, n, i], [13, i + 6, n + 6]);
  }
  return { verts, faces };
}

function drawQuartzPrism(ctx, cx, cy, scale, rotY, rotX, prism) {
  const proj = prism.verts.map((v) => project3D(v, rotY, rotX, cx, cy, scale));
  const sorted = prism.faces
    .map((f) => ({ f, zAvg: f.reduce((s, i) => s + proj[i].z, 0) / f.length }))
    .sort((a, b) => a.zAvg - b.zAvg);

  for (const { f, zAvg } of sorted) {
    ctx.beginPath();
    f.forEach((vi, i) => (i === 0 ? ctx.moveTo(proj[vi].x, proj[vi].y) : ctx.lineTo(proj[vi].x, proj[vi].y)));
    ctx.closePath();
    const shade = Math.max(0.18, Math.min(0.68, 0.34 + zAvg * 0.24));
    ctx.fillStyle = `rgba(56, 189, 248, ${shade.toFixed(2)})`;
    ctx.fill();
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
}

function drawGlassLump(ctx, cx, cy, scale, rotY) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.beginPath();
  for (let i = 0; i <= 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const w = 1 + 0.16 * Math.sin(a * 2 + rotY * 0.7) + 0.11 * Math.cos(a * 3 - rotY * 0.5) + 0.06 * Math.sin(a * 5 + 0.9);
    const rx = Math.cos(a) * scale * 0.92 * w;
    const ry = Math.sin(a) * scale * 0.78 * w;
    if (i === 0) ctx.moveTo(rx, ry);
    else ctx.lineTo(rx, ry);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(-scale * 0.28, -scale * 0.3, scale * 0.08, 0, 0, scale * 1.1);
  grad.addColorStop(0, 'rgba(253, 230, 138, 0.62)');
  grad.addColorStop(0.55, 'rgba(245, 158, 11, 0.32)');
  grad.addColorStop(1, 'rgba(180, 83, 9, 0.16)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(253, 224, 71, 0.68)';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(-scale * 0.28, -scale * 0.24, scale * 0.26, scale * 0.11, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fill();
  ctx.restore();
}

function buildMicroNetworks() {
  const ordered = { si: [], o: [], bonds: [] };
  const s = 34;
  const dx = s * 1.732;
  const dy = s * 1.5;
  for (let row = -2; row <= 2; row++) {
    for (let col = -2; col <= 2; col++) {
      const ox = col * dx + (row % 2 !== 0 ? dx * 0.5 : 0);
      const oy = row * dy;
      ordered.si.push([ox, oy - s * 0.5], [ox + dx * 0.5, oy]);
    }
  }
  for (let i = 0; i < ordered.si.length; i++) {
    for (let j = i + 1; j < ordered.si.length; j++) {
      const p1 = ordered.si[i];
      const p2 = ordered.si[j];
      const dist = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
      if (dist > 4 && dist < s * 1.35) {
        ordered.bonds.push([i, j]);
        ordered.o.push([(p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5]);
      }
    }
  }

  const disordered = { si: [], o: [], bonds: [] };
  ordered.si.forEach((pt, idx) => {
    disordered.si.push([pt[0] + Math.sin(idx * 12.9898) * 14.5, pt[1] + Math.cos(idx * 78.233) * 14.5]);
  });
  ordered.bonds.forEach(([i, j], idx) => {
    if (idx % 7 === 0) return;
    const p1 = disordered.si[i];
    const p2 = disordered.si[j];
    const mx = (p1[0] + p2[0]) * 0.5 - (p2[1] - p1[1]) * 0.08 + Math.sin(idx * 4.3) * 2.8;
    const my = (p1[1] + p2[1]) * 0.5 + (p2[0] - p1[0]) * 0.08;
    disordered.bonds.push([i, j, mx, my]);
    disordered.o.push([mx, my]);
  });
  return { ordered, disordered };
}

function drawMicroNetwork(ctx, cx, cy, radius, net, isDisordered, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#09101f';
  ctx.fill();
  ctx.clip();

  ctx.strokeStyle = isDisordered ? 'rgba(251, 191, 36, 0.52)' : 'rgba(125, 211, 252, 0.65)';
  ctx.lineWidth = 2.2;
  for (const b of net.bonds) {
    const p1 = net.si[b[0]];
    const p2 = net.si[b[1]];
    ctx.beginPath();
    ctx.moveTo(cx + p1[0], cy + p1[1]);
    if (b.length === 4) ctx.quadraticCurveTo(cx + b[2], cy + b[3], cx + p2[0], cy + p2[1]);
    else ctx.lineTo(cx + p2[0], cy + p2[1]);
    ctx.stroke();
  }
  for (const o of net.o) {
    ctx.beginPath();
    ctx.arc(cx + o[0], cy + o[1], 4.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fb7185';
    ctx.fill();
  }
  for (const si of net.si) {
    ctx.beginPath();
    ctx.arc(cx + si[0], cy + si[1], 6.4, 0, Math.PI * 2);
    ctx.fillStyle = isDisordered ? '#fbbf24' : '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = isDisordered ? '#fbbf24' : '#38bdf8';
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.restore();
}

export function mountCompareDemo({ stageEl, controlsEl, setCaption, setLegend }) {
  const { canvas, ctx, getSize, resize, dispose } = setupHiDpiCanvas(stageEl);
  const prism = buildHexPrism();
  const nets = buildMicroNetworks();

  let rotY = 0.55;
  let rotX = 0.28;
  let autoRotate = true;
  let targetZoom = 0;
  let zoom = 0;
  let paused = false;
  let rafId = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  setLegend([
    { label: 'Si 原子', color: '#38bdf8' },
    { label: 'O 原子', color: '#fb7185' },
    { label: '玻璃无序态', color: '#fbbf24' },
  ]);

  controlsEl.innerHTML = `
    <div class="crystal-seg" role="group" aria-label="观察视角">
      <button type="button" class="crystal-seg-btn is-active" data-mode="macro">宏观外形</button>
      <button type="button" class="crystal-seg-btn" data-mode="micro">微观排布</button>
    </div>
    <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-full" data-act="toggle-zoom">
      一键放大微观 Si–O 结构
    </button>
    <div class="crystal-slice-actions">
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="rotate">暂停旋转</button>
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="reset">重置角度</button>
    </div>
    <p class="crystal-exam-desc">提示：在黑色舞台上拖动鼠标或手指，可 360° 观察水晶棱柱的规则晶面与玻璃的无定形轮廓。</p>
  `;

  const modeBtns = controlsEl.querySelectorAll('[data-mode]');
  const zoomBtn = controlsEl.querySelector('[data-act="toggle-zoom"]');
  const rotBtn = controlsEl.querySelector('[data-act="rotate"]');
  const resetBtn = controlsEl.querySelector('[data-act="reset"]');

  function syncUi() {
    const isMicro = targetZoom > 0.5;
    modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === (isMicro ? 'micro' : 'macro')));
    zoomBtn.textContent = isMicro ? '缩小回到宏观外形' : '一键放大微观 Si–O 结构';
    rotBtn.textContent = autoRotate ? '暂停旋转' : '继续旋转';
    setCaption(
      isMicro
        ? '微观本质：晶体（水晶）长程有序排列；非晶体（石英玻璃）短程有序、长程无序'
        : '宏观对比：天然水晶呈规则六棱柱外形，石英玻璃无固定几何外形（可拖拽旋转）',
    );
  }

  modeBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      targetZoom = btn.dataset.mode === 'micro' ? 1 : 0;
      syncUi();
    }),
  );
  zoomBtn.addEventListener('click', () => {
    targetZoom = targetZoom > 0.5 ? 0 : 1;
    syncUi();
  });
  rotBtn.addEventListener('click', () => {
    autoRotate = !autoRotate;
    syncUi();
  });
  resetBtn.addEventListener('click', () => {
    rotY = 0.55;
    rotX = 0.28;
    targetZoom = 0;
    autoRotate = true;
    syncUi();
  });

  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    if (!dragging) return;
    rotY += (e.clientX - lastX) * 0.01;
    rotX = Math.max(-0.9, Math.min(0.9, rotX + (e.clientY - lastY) * 0.008));
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onUp = () => { dragging = false; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  syncUi();

  function frame() {
    if (paused) return;
    const { width, height } = getSize();
    if (autoRotate && !dragging) rotY += 0.008;
    zoom += (targetZoom - zoom) * 0.09;

    ctx.fillStyle = STAGE_BG;
    ctx.fillRect(0, 0, width, height);

    const midX = width * 0.5;
    const cy = height * 0.5;
    const scale = Math.min(width * 0.16, height * 0.25);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(midX, 48);
    ctx.lineTo(midX, height - 52);
    ctx.stroke();
    ctx.setLineDash([]);

    const leftX = width * 0.255;
    const rightX = width * 0.745;

    if (zoom < 0.98) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - zoom * 1.15);
      const s = scale * (1 + zoom * 0.55);
      drawQuartzPrism(ctx, leftX, cy, s, rotY, rotX, prism);
      drawGlassLump(ctx, rightX, cy, s, rotY);
      ctx.restore();
    }

    if (zoom > 0.02) {
      const microR = Math.min(width * 0.19, height * 0.31) * (0.45 + zoom * 0.55);
      drawMicroNetwork(ctx, leftX, cy, microR, nets.ordered, false, zoom);
      drawMicroNetwork(ctx, rightX, cy, microR, nets.disordered, true, zoom);
    }

    ctx.textAlign = 'center';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText('水晶 · 晶体 (SiO₂)', leftX, 66);
    ctx.fillStyle = '#fcd34d';
    ctx.fillText('石英玻璃 · 非晶体 (SiO₂)', rightX, 66);

    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(zoom > 0.5 ? '微观：周期性长程有序六元环' : '宏观：规则六棱柱多面体', leftX, height - 56);
    ctx.fillText(zoom > 0.5 ? '微观：键角畸变、长程无序' : '宏观：无规则几何外形', rightX, height - 56);

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
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      dispose();
    },
  };
}
