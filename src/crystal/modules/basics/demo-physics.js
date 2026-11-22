/**
 * 模块 01 · 认识晶体：Demo 4（各向异性导热：云母片椭圆 vs 玻璃片正圆）
 * 同时重导出 Demo 3（mountMeltingDemo）与 Demo 5（mountXrdDemo）保持对外入口兼容。
 */

import { setupHiDpiCanvas } from './stage-canvas.js';

export { mountMeltingDemo } from './demo-melting.js';
export { mountXrdDemo } from './demo-xrd.js';

export function mountAnisotropyDemo({ stageEl, controlsEl, setCaption }) {
  let radius = 0;
  let heating = false;
  let showLattice = true;
  let paused = false;
  let rafId = 0;

  const { canvas, ctx, getSize, getPalette, resize, dispose } = setupHiDpiCanvas(stageEl, () => render());

  controlsEl.innerHTML = `
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="heat">烫针同时加热</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">重新涂蜡</button>
    </div>
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="lattice">隐藏微观排布</button>
    </div>
    <div class="crystal-dock-group">
      <span class="crystal-param-pill">云母长短轴比 a : b = <strong>1.72 : 1</strong></span>
    </div>
  `;

  const btnHeat = controlsEl.querySelector('[data-act="heat"]');
  const btnLattice = controlsEl.querySelector('[data-act="lattice"]');
  const btnReset = controlsEl.querySelector('[data-act="reset"]');

  function syncUi() {
    btnHeat.textContent = heating
      ? '移开烫针'
      : radius > 0.95
        ? '重新加热'
        : '烫针同时加热';
    btnLattice.textContent = showLattice ? '隐藏微观排布' : '显示微观排布';
    setCaption(radius < 0.05 ? '涂蜡待加热 · 点击舞台开始' : '云母椭圆(异性) vs 玻璃正圆(同性)');
  }

  function triggerHeat() {
    if (radius >= 0.98) radius = 0;
    heating = !heating;
    syncUi();
  }

  btnHeat.addEventListener('click', triggerHeat);
  btnLattice.addEventListener('click', () => { showLattice = !showLattice; syncUi(); render(); });
  btnReset.addEventListener('click', () => { radius = 0; heating = false; syncUi(); render(); });
  canvas.addEventListener('click', triggerHeat);
  syncUi();

  function drawPlate(cx, cy, w, h, isMica, p) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = isMica ? p.crystalSoft : p.amorphousSoft;
    ctx.strokeStyle = isMica ? p.crystal : p.amorphous;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 14);
    ctx.fill();
    ctx.stroke();

    if (showLattice) {
      ctx.fillStyle = isMica
        ? (p.isDark ? 'rgba(125, 211, 252, 0.30)' : 'rgba(2, 132, 199, 0.28)')
        : (p.isDark ? 'rgba(252, 211, 77, 0.26)' : 'rgba(180, 83, 9, 0.26)');
      if (isMica) {
        for (let r = -3; r <= 3; r++) {
          for (let c = -5; c <= 5; c++) {
            ctx.beginPath();
            ctx.arc(c * (w / 12), r * (h / 8), 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        for (let i = 0; i < 48; i++) {
          ctx.beginPath();
          ctx.arc(Math.sin(i * 19.3) * 0.43 * w, Math.cos(i * 31.7) * 0.42 * h, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const maxR = Math.min(w, h) * 0.34;
    const rx = isMica ? radius * maxR * 1.32 : radius * maxR;
    const ry = isMica ? radius * maxR * 0.77 : radius * maxR;
    if (radius > 0.01) {
      const grad = ctx.createRadialGradient(0, 0, 2, 0, 0, Math.max(rx, ry, 6));
      grad.addColorStop(0, p.isDark ? 'rgba(244, 63, 94, 0.72)' : 'rgba(225, 29, 72, 0.56)');
      grad.addColorStop(
        0.55,
        isMica
          ? (p.isDark ? 'rgba(56, 189, 248, 0.45)' : 'rgba(2, 132, 199, 0.34)')
          : (p.isDark ? 'rgba(251, 191, 36, 0.45)' : 'rgba(217, 119, 6, 0.34)'),
      );
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = isMica ? p.crystal : p.amorphous;
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.strokeStyle = p.ink;
      ctx.globalAlpha = 0.75;
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-rx, 0);
      ctx.lineTo(rx, 0);
      ctx.moveTo(0, -ry);
      ctx.lineTo(0, ry);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }

    ctx.beginPath();
    ctx.arc(0, 0, heating ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = heating ? p.covalent : p.muted;
    ctx.fill();

    ctx.fillStyle = p.ink;
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isMica ? '云母单晶片（晶体）' : '玻璃片（非晶体）', 0, -h / 2 - 14);
    ctx.fillStyle = isMica ? p.crystalText : p.amorphousText;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(isMica ? '熔斑呈椭圆 → 导热各向异性' : '熔斑呈正圆 → 导热各向同性', 0, h / 2 + 22);
    ctx.restore();
  }

  function render() {
    const { width, height } = getSize();
    const p = getPalette();

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, width, height);

    const topSafe = 44;
    const botSafe = 44;
    const cy = topSafe + (height - topSafe - botSafe) * 0.5;
    const pw = Math.min(310, width * 0.39);
    const ph = Math.min(260, (height - topSafe - botSafe) * 0.74);
    drawPlate(width * 0.27, cy, pw, ph, true, p);
    drawPlate(width * 0.73, cy, pw, ph, false, p);
  }

  function frame() {
    if (paused) return;
    if (heating) {
      radius = Math.min(1, radius + 0.0065);
      if (radius >= 1) {
        heating = false;
        syncUi();
      }
    }
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
      canvas.removeEventListener('click', triggerHeat);
      dispose();
    },
  };
}
