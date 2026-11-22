/**
 * 模块 01 · 认识晶体：Demo 4（各向异性导热：云母片椭圆 vs 玻璃片正圆）
 * 同时重导出 Demo 3（mountMeltingDemo）与 Demo 5（mountXrdDemo）保持对外入口兼容。
 */

import { STAGE_BG, setupHiDpiCanvas } from './stage-canvas.js';

export { mountMeltingDemo } from './demo-melting.js';
export { mountXrdDemo } from './demo-xrd.js';

export function mountAnisotropyDemo({ stageEl, controlsEl, setCaption, setLegend }) {
  const { canvas, ctx, getSize, resize, dispose } = setupHiDpiCanvas(stageEl);
  let radius = 0;
  let heating = false;
  let showLattice = true;
  let paused = false;
  let rafId = 0;

  setLegend([
    { label: '云母（椭圆熔斑 · 各向异性）', color: '#38bdf8' },
    { label: '玻璃（正圆熔斑 · 各向同性）', color: '#fbbf24' },
  ]);

  controlsEl.innerHTML = `
    <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-full" data-act="heat">
      点击烫针同时加热
    </button>
    <div class="crystal-slice-actions">
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="lattice">隐藏微观排布</button>
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="reset">重新涂蜡</button>
    </div>
    <div class="crystal-exam-body">
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">云母熔蜡长短轴比 a : b</span>
        <span class="crystal-exam-v">1.72 : 1</span>
      </div>
      <p class="crystal-exam-desc">提示：也可直接点击黑色舞台上的薄片触发或暂停烫针导热。</p>
    </div>
  `;

  const btnHeat = controlsEl.querySelector('[data-act="heat"]');
  const btnLattice = controlsEl.querySelector('[data-act="lattice"]');
  const btnReset = controlsEl.querySelector('[data-act="reset"]');

  function syncUi() {
    btnHeat.textContent = heating
      ? '移开烫针（暂停扩散）'
      : radius > 0.95
        ? '已熔穿（点击重新加热）'
        : '点击烫针同时加热';
    btnLattice.textContent = showLattice ? '隐藏微观排布' : '显示微观排布';
    setCaption(
      radius < 0.05
        ? '在云母片与玻璃片表面涂上一层薄石蜡，点击「烫针同时加热」对比导热形状'
        : '云母片上石蜡熔成椭圆（不同方向微粒间距不同 → 导热快慢不同）；玻璃片熔成正圆（各向同性）',
    );
  }

  function triggerHeat() {
    if (radius >= 0.98) radius = 0;
    heating = !heating;
    syncUi();
  }

  btnHeat.addEventListener('click', triggerHeat);
  btnLattice.addEventListener('click', () => {
    showLattice = !showLattice;
    syncUi();
  });
  btnReset.addEventListener('click', () => {
    radius = 0;
    heating = false;
    syncUi();
  });
  canvas.addEventListener('click', triggerHeat);
  syncUi();

  function drawPlate(cx, cy, w, h, isMica) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = isMica ? 'rgba(56, 189, 248, 0.14)' : 'rgba(251, 191, 36, 0.14)';
    ctx.strokeStyle = isMica ? 'rgba(125, 211, 252, 0.65)' : 'rgba(252, 211, 77, 0.65)';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 14);
    ctx.fill();
    ctx.stroke();

    if (showLattice) {
      ctx.fillStyle = isMica ? 'rgba(125, 211, 252, 0.25)' : 'rgba(252, 211, 77, 0.22)';
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
      grad.addColorStop(0, 'rgba(244, 63, 94, 0.72)');
      grad.addColorStop(0.55, isMica ? 'rgba(56, 189, 248, 0.45)' : 'rgba(251, 191, 36, 0.45)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.08)');
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = isMica ? '#7dd3fc' : '#fde047';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.strokeStyle = '#f8fafc';
      ctx.setLineDash([4, 3]);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-rx, 0);
      ctx.lineTo(rx, 0);
      ctx.moveTo(0, -ry);
      ctx.lineTo(0, ry);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    ctx.arc(0, 0, heating ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = heating ? '#fb7185' : '#94a3b8';
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isMica ? '云母单晶片（晶体）' : '玻璃片（非晶体）', 0, -h / 2 - 14);
    ctx.fillStyle = isMica ? '#7dd3fc' : '#fde047';
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillText(isMica ? '熔斑呈椭圆 → 导热各向异性' : '熔斑呈正圆 → 导热各向同性', 0, h / 2 + 22);
    ctx.restore();
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
    const { width, height } = getSize();
    ctx.fillStyle = STAGE_BG;
    ctx.fillRect(0, 0, width, height);

    const pw = Math.min(250, width * 0.39);
    const ph = Math.min(220, height * 0.52);
    drawPlate(width * 0.27, height * 0.5, pw, ph, true);
    drawPlate(width * 0.73, height * 0.5, pw, ph, false);
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
      canvas.removeEventListener('click', triggerHeat);
      dispose();
    },
  };
}
