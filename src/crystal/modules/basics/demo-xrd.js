/**
 * 模块 01 · 认识晶体：Demo 5（X 射线衍射：单晶锐利衍射斑点与布拉格峰 vs 非晶体弥散晕环）
 */

import { STAGE_BG, setupHiDpiCanvas } from './stage-canvas.js';

export function mountXrdDemo({ stageEl, controlsEl, setCaption, setLegend }) {
  const { ctx, getSize, resize, dispose } = setupHiDpiCanvas(stageEl);
  let sample = 'both';
  let thetaDeg = 22;
  let tick = 0;
  let paused = false;
  let rafId = 0;

  setLegend([
    { label: '晶体 · 锐利衍射斑点', color: '#38bdf8' },
    { label: '非晶体 · 宽化晕环', color: '#fbbf24' },
  ]);

  controlsEl.innerHTML = `
    <div class="crystal-exam-tabs" role="group" aria-label="X射线样品">
      <button type="button" class="crystal-exam-tab" data-sample="crystal">单晶样品</button>
      <button type="button" class="crystal-exam-tab" data-sample="amorphous">玻璃样品</button>
      <button type="button" class="crystal-exam-tab is-active" data-sample="both">并排对比</button>
    </div>
    <div class="crystal-exam-body">
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">X 射线入射角 θ</span>
        <span class="crystal-exam-v" data-el="theta">22°</span>
      </div>
      <input type="range" min="10" max="40" value="22" data-el="slider" style="width:100%;accent-color:#38bdf8;" />
      <p class="crystal-exam-formula">布拉格方程：2d sinθ = nλ</p>
      <p class="crystal-exam-desc">区分晶体与非晶体<strong>最可靠的科学方法</strong>是对固体进行 X 射线衍射实验。</p>
    </div>
  `;

  const sampleBtns = controlsEl.querySelectorAll('[data-sample]');
  const slider = controlsEl.querySelector('[data-el="slider"]');
  const thetaEl = controlsEl.querySelector('[data-el="theta"]');

  function syncUi() {
    sampleBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.sample === sample));
    thetaEl.textContent = `${thetaDeg}°`;
    setCaption(
      sample === 'crystal'
        ? '单晶 X 射线衍射：周期性晶面满足布拉格条件，在荧光屏上形成清晰对称的衍射斑点'
        : sample === 'amorphous'
          ? '非晶体 X 射线散射：内部缺少长程周期性，仅出现弥散宽化的同心晕环'
          : '并排对比：晶体产生分立锐利的衍射斑点与尖峰，非晶体只产生弥散晕环与宽包',
    );
  }

  sampleBtns.forEach((b) =>
    b.addEventListener('click', () => {
      sample = b.dataset.sample;
      syncUi();
    }),
  );
  slider.addEventListener('input', () => {
    thetaDeg = Number(slider.value);
    syncUi();
  });

  function drawDetector(cx, cy, r, isCrystal) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#070c18';
    ctx.fill();
    ctx.strokeStyle = isCrystal ? 'rgba(56, 189, 248, 0.7)' : 'rgba(251, 191, 36, 0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const pulse = 0.82 + 0.18 * Math.sin(tick * 0.08);
    const scaleFactor = 0.78 + ((thetaDeg - 10) / 30) * 0.36;

    if (isCrystal) {
      for (let h = -2; h <= 2; h++) {
        for (let k = -2; k <= 2; k++) {
          const dist = Math.hypot(h, k);
          if (dist === 0 || dist > 2.3) continue;
          const px = cx + h * r * 0.33 * scaleFactor;
          const py = cy + k * r * 0.33 * scaleFactor;
          const intensity = Math.max(0.25, 1 - dist * 0.28) * pulse;
          const spotR = (5.2 - dist * 1.1) * pulse;
          const g = ctx.createRadialGradient(px, py, 0.5, px, py, spotR * 2.1);
          g.addColorStop(0, `rgba(224, 242, 254, ${intensity.toFixed(2)})`);
          g.addColorStop(0.5, `rgba(56, 189, 248, ${(intensity * 0.7).toFixed(2)})`);
          g.addColorStop(1, 'rgba(56, 189, 248, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, spotR * 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      const haloR = r * 0.52 * scaleFactor;
      const g = ctx.createRadialGradient(cx, cy, haloR * 0.35, cx, cy, haloR * 1.45);
      g.addColorStop(0, 'rgba(251, 191, 36, 0.02)');
      g.addColorStop(0.5, `rgba(251, 191, 36, ${(0.36 * pulse).toFixed(2)})`);
      g.addColorStop(0.72, `rgba(245, 158, 11, ${(0.22 * pulse).toFixed(2)})`);
      g.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#f8fafc';
    ctx.fill();
    ctx.fillStyle = isCrystal ? '#7dd3fc' : '#fcd34d';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isCrystal ? '晶体：锐利衍射斑点' : '非晶体：弥散宽化晕环', cx, cy - r - 12);
    ctx.restore();
  }

  function drawSpectrum(x, y, w, h, isCrystal) {
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.strokeRect(x, y, w, h);
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      let amp = 0.06;
      if (isCrystal) {
        for (const pk of [0.22, 0.44, 0.62, 0.81]) {
          const d = (t - pk) * 32;
          amp += Math.exp(-d * d) * (pk === 0.44 ? 0.84 : 0.56);
        }
      } else {
        const d1 = (t - 0.38) * 5.2;
        const d2 = (t - 0.72) * 4.5;
        amp += Math.exp(-d1 * d1) * 0.42 + Math.exp(-d2 * d2) * 0.2;
      }
      const px = x + t * w;
      const py = y + h - Math.min(0.92, amp) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = isCrystal ? '#38bdf8' : '#fbbf24';
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(isCrystal ? 'I(2θ) 尖锐布拉格峰' : 'I(2θ) 宽化馒头峰', x + 6, y + 14);
  }

  function frame() {
    if (paused) return;
    tick += 1;
    const { width, height } = getSize();
    ctx.fillStyle = STAGE_BG;
    ctx.fillRect(0, 0, width, height);

    const detR = Math.min(width * (sample === 'both' ? 0.17 : 0.24), height * 0.27);
    const detY = height * 0.42;
    const specY = detY + detR + 28;
    const specH = Math.max(54, Math.min(82, height - specY - 56));

    const waveX = (tick * 4) % width;
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.max(24, waveX - 60), 54);
    ctx.lineTo(Math.min(width - 24, waveX), 54);
    ctx.stroke();

    if (sample === 'both') {
      drawDetector(width * 0.27, detY, detR, true);
      drawDetector(width * 0.73, detY, detR, false);
      drawSpectrum(width * 0.08, specY, width * 0.38, specH, true);
      drawSpectrum(width * 0.54, specY, width * 0.38, specH, false);
    } else {
      const isC = sample === 'crystal';
      drawDetector(width * 0.5, detY, detR, isC);
      drawSpectrum(width * 0.18, specY, width * 0.64, specH, isC);
    }

    rafId = requestAnimationFrame(frame);
  }

  syncUi();
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
      dispose();
    },
  };
}
