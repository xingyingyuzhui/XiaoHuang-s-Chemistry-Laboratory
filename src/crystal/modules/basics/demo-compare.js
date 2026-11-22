/**
 * 模块 01 · 认识晶体：Demo 1（晶体 vs 非晶体：水晶六棱柱 vs 石英玻璃 + 微观 Si–O 网络）
 * 同时重导出 Demo 2（mountSelfFormDemo）保持对外入口兼容。
 */

import { setupHiDpiCanvas } from './stage-canvas.js';
import {
  buildHexPrism,
  buildMicroNetworks,
  drawGlassLump,
  drawMicroLegend,
  drawMicroNetwork,
  drawQuartzPrism,
} from './compare-render.js';

export { mountSelfFormDemo } from './demo-selfform.js';

export function mountCompareDemo({ stageEl, controlsEl, setCaption }) {
  const prism = buildHexPrism();
  const nets = buildMicroNetworks();
  let rotY = 0.55;
  let rotX = 0.26;
  let autoRotate = true;
  let targetZoom = 0;
  let zoom = 0;
  let paused = false;
  let rafId = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const { canvas, ctx, getSize, getPalette, resize, dispose } = setupHiDpiCanvas(stageEl, () => render());

  controlsEl.innerHTML = `
    <div class="crystal-dock-group crystal-seg" role="group" aria-label="观察视角">
      <button type="button" class="crystal-seg-btn is-active" data-mode="macro">宏观外形</button>
      <button type="button" class="crystal-seg-btn" data-mode="micro">微观 Si–O 网</button>
    </div>
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="rotate">暂停旋转</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">重置</button>
    </div>
  `;

  const modeBtns = controlsEl.querySelectorAll('[data-mode]');
  const rotBtn = controlsEl.querySelector('[data-act="rotate"]');
  const resetBtn = controlsEl.querySelector('[data-act="reset"]');

  function syncUi() {
    const isMicro = targetZoom > 0.5;
    modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === (isMicro ? 'micro' : 'macro')));
    rotBtn.textContent = autoRotate ? '暂停旋转' : '继续旋转';
    setCaption(isMicro ? '微观对比 · 长程有序 vs 无序' : '宏观对比 · 拖拽可 360° 旋转');
  }

  modeBtns.forEach((btn) =>
    btn.addEventListener('click', () => { targetZoom = btn.dataset.mode === 'micro' ? 1 : 0; syncUi(); }),
  );
  rotBtn.addEventListener('click', () => { autoRotate = !autoRotate; syncUi(); });
  resetBtn.addEventListener('click', () => { rotY = 0.55; rotX = 0.26; targetZoom = 0; autoRotate = true; syncUi(); });

  const onDown = (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture?.(e.pointerId); };
  const onMove = (e) => {
    if (!dragging) return;
    rotY += (e.clientX - lastX) * 0.01;
    rotX = Math.max(-0.85, Math.min(0.85, rotX + (e.clientY - lastY) * 0.008));
    lastX = e.clientX;
    lastY = e.clientY;
  };
  const onUp = () => { dragging = false; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  syncUi();

  function render() {
    const { width, height } = getSize();
    const p = getPalette();

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, width, height);

    const titleY = Math.max(30, Math.min(44, height * 0.08));
    const subY = height - 42;
    const midX = width * 0.5;
    const bodyTop = titleY + 20;
    const bodyBot = subY - 18;
    const bodyH = Math.max(160, bodyBot - bodyTop);
    const cy = bodyTop + bodyH * 0.48;
    const scale = Math.min(width * 0.145, bodyH * 0.32);

    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(midX, titleY - 10);
    ctx.lineTo(midX, subY + 8);
    ctx.stroke();
    ctx.setLineDash([]);

    const leftX = width * 0.26;
    const rightX = width * 0.74;

    if (zoom < 0.98) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - zoom * 1.15);
      const s = scale * (1 + zoom * 0.45);
      drawQuartzPrism(ctx, leftX, cy, s, rotY, rotX, prism, p);
      drawGlassLump(ctx, rightX, cy, s, rotY, rotX, p);
      ctx.restore();
    }

    if (zoom > 0.02) {
      const microR = Math.min(width * 0.175, bodyH * 0.41) * (0.48 + zoom * 0.52);
      drawMicroNetwork(ctx, leftX, cy, microR, nets.ordered, false, zoom, p);
      drawMicroNetwork(ctx, rightX, cy, microR, nets.disordered, true, zoom, p);
      drawMicroLegend(ctx, midX, height - 16, Math.max(0, (zoom - 0.1) / 0.9), p);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.font = '700 16px system-ui, sans-serif';
    ctx.fillStyle = p.crystalText;
    ctx.fillText('水晶 · 晶体 (SiO₂)', leftX, titleY);
    ctx.fillStyle = p.amorphousText;
    ctx.fillText('石英玻璃 · 非晶体 (SiO₂)', rightX, titleY);

    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = p.muted;
    ctx.fillText(zoom > 0.5 ? '周期性长程有序六元环' : '规则六棱柱多面体', leftX, subY);
    ctx.fillText(zoom > 0.5 ? '键角畸变 · 长程无序' : '无规则几何外形', rightX, subY);
  }

  function frame() {
    if (paused) return;
    if (autoRotate && !dragging) rotY += 0.008;
    zoom += (targetZoom - zoom) * 0.09;
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
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      dispose();
    },
  };
}
