/**
 * 模块 01 · 认识晶体：Demo 5（X 射线衍射：单晶锐利衍射斑点与布拉格峰 vs 非晶体弥散晕环）
 */

import { setupHiDpiCanvas } from './stage-canvas.js';

export function mountXrdDemo({ stageEl, controlsEl, setCaption, setLegend }) {
  let sample = 'both';
  let thetaDeg = 22;
  let tick = 0;
  let paused = false;
  let rafId = 0;

  const { ctx, getSize, getPalette, resize, dispose } = setupHiDpiCanvas(stageEl, () => render());

  setLegend([
    { label: '晶体 · 锐利衍射斑点', color: '#0284c7' },
    { label: '非晶体 · 宽化晕环', color: '#d97706' },
  ]);

  controlsEl.innerHTML = `
    <div class="crystal-seg" role="group" aria-label="X射线样品" style="grid-template-columns:repeat(3,auto);">
      <button type="button" class="crystal-seg-btn" data-sample="crystal">单晶</button>
      <button type="button" class="crystal-seg-btn" data-sample="amorphous">玻璃</button>
      <button type="button" class="crystal-seg-btn is-active" data-sample="both">并排对比</button>
    </div>
    <label style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.78rem;color:var(--ink-soft,var(--muted,#475569));">
      <span>入射角 θ</span>
      <input type="range" min="10" max="40" value="22" data-el="slider" style="width:105px;accent-color:var(--accent,#3b82f6);" />
      <strong data-el="theta" style="font-family:var(--font-mono,monospace);min-width:28px;">22°</strong>
    </label>
    <span class="crystal-param-pill">2d sinθ = nλ</span>
  `;

  const sampleBtns = controlsEl.querySelectorAll('[data-sample]');
  const slider = controlsEl.querySelector('[data-el="slider"]');
  const thetaEl = controlsEl.querySelector('[data-el="theta"]');

  function syncUi() {
    sampleBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.sample === sample));
    thetaEl.textContent = `${thetaDeg}°`;
    setCaption(
      sample === 'crystal'
        ? '单晶 X 射线衍射：周期性晶面满足布拉格条件，产生清晰对称的锐利衍射斑点与尖峰'
        : sample === 'amorphous'
          ? '非晶体 X 射线散射：内部缺少长程周期性，仅出现弥散宽化的同心晕环与宽包'
          : '最可靠鉴别法：晶体产生分立锐利的衍射斑点与尖峰，非晶体只产生弥散晕环与宽包',
    );
  }

  sampleBtns.forEach((b) => b.addEventListener('click', () => { sample = b.dataset.sample; syncUi(); render(); }));
  slider.addEventListener('input', () => { thetaDeg = Number(slider.value); syncUi(); render(); });

  function drawDetector(cx, cy, r, isCrystal, p) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = p.inset;
    ctx.fill();
    ctx.strokeStyle = isCrystal ? p.crystal : p.amorphous;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 淡参考同心圆环
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;
    for (const frac of [0.38, 0.72]) {
      ctx.beginPath();
      ctx.arc(cx, cy, r * frac, 0, Math.PI * 2);
      ctx.stroke();
    }

    const pulse = 0.84 + 0.16 * Math.sin(tick * 0.08);
    const scaleFactor = 0.78 + ((thetaDeg - 10) / 30) * 0.36;

    if (isCrystal) {
      for (let h = -2; h <= 2; h++) {
        for (let k = -2; k <= 2; k++) {
          const dist = Math.hypot(h, k);
          if (dist === 0 || dist > 2.3) continue;
          const px = cx + h * r * 0.33 * scaleFactor;
          const py = cy + k * r * 0.33 * scaleFactor;
          const intensity = Math.max(0.32, 1 - dist * 0.25) * pulse;
          const spotR = (5.2 - dist * 1.0) * pulse;
          const g = ctx.createRadialGradient(px, py, 0.5, px, py, spotR * 2.1);
          if (p.isDark) {
            g.addColorStop(0, `rgba(224, 242, 254, ${intensity.toFixed(2)})`);
            g.addColorStop(0.5, `rgba(56, 189, 248, ${(intensity * 0.75).toFixed(2)})`);
            g.addColorStop(1, 'rgba(56, 189, 248, 0)');
          } else {
            g.addColorStop(0, `rgba(3, 105, 161, ${Math.min(1, intensity * 1.05).toFixed(2)})`);
            g.addColorStop(0.45, `rgba(2, 132, 199, ${(intensity * 0.72).toFixed(2)})`);
            g.addColorStop(1, 'rgba(2, 132, 199, 0)');
          }
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, spotR * 2.1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      const haloR = r * 0.52 * scaleFactor;
      const g = ctx.createRadialGradient(cx, cy, haloR * 0.32, cx, cy, haloR * 1.45);
      if (p.isDark) {
        g.addColorStop(0, 'rgba(251, 191, 36, 0.02)');
        g.addColorStop(0.5, `rgba(251, 191, 36, ${(0.40 * pulse).toFixed(2)})`);
        g.addColorStop(0.74, `rgba(245, 158, 11, ${(0.24 * pulse).toFixed(2)})`);
        g.addColorStop(1, 'rgba(245, 158, 11, 0)');
      } else {
        g.addColorStop(0, 'rgba(217, 119, 6, 0.02)');
        g.addColorStop(0.5, `rgba(217, 119, 6, ${(0.38 * pulse).toFixed(2)})`);
        g.addColorStop(0.74, `rgba(180, 83, 9, ${(0.20 * pulse).toFixed(2)})`);
        g.addColorStop(1, 'rgba(180, 83, 9, 0)');
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fillStyle = p.ink;
    ctx.fill();

    ctx.fillStyle = isCrystal ? p.crystalText : p.amorphousText;
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(isCrystal ? '晶体：锐利衍射斑点' : '非晶体：弥散宽化晕环', cx, cy - r - 12);
    ctx.restore();
  }

  function drawSpectrum(x, y, w, h, isCrystal, p) {
    ctx.fillStyle = p.surface;
    ctx.strokeStyle = p.border;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const t = i / 80;
      let amp = 0.08;
      if (isCrystal) {
        for (const pk of [0.22, 0.44, 0.62, 0.81]) {
          const d = (t - pk) * 32;
          amp += Math.exp(-d * d) * (pk === 0.44 ? 0.82 : 0.54);
        }
      } else {
        const d1 = (t - 0.38) * 5.2;
        const d2 = (t - 0.72) * 4.5;
        amp += Math.exp(-d1 * d1) * 0.42 + Math.exp(-d2 * d2) * 0.2;
      }
      const px = x + t * w;
      const py = y + h - Math.min(0.90, amp) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = isCrystal ? p.crystal : p.amorphous;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.fillStyle = p.muted;
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(isCrystal ? 'I(2θ) 尖锐布拉格峰' : 'I(2θ) 宽化馒头峰', x + 8, y + 15);
  }

  function render() {
    const { width, height } = getSize();
    const p = getPalette();

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, width, height);

    const topSafe = 90;
    const botSafe = 78;
    const usableH = Math.max(200, height - topSafe - botSafe);
    const detR = Math.min(width * (sample === 'both' ? 0.16 : 0.22), usableH * 0.30);
    const detY = topSafe + detR + 28;
    const specY = detY + detR + 22;
    const specH = Math.max(54, Math.min(84, height - botSafe - specY - 6));

    const waveX = (tick * 4) % width;
    ctx.strokeStyle = p.crystal;
    ctx.globalAlpha = 0.34;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.max(24, waveX - 60), topSafe - 2);
    ctx.lineTo(Math.min(width - 24, waveX), topSafe - 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (sample === 'both') {
      drawDetector(width * 0.27, detY, detR, true, p);
      drawDetector(width * 0.73, detY, detR, false, p);
      drawSpectrum(width * 0.08, specY, width * 0.38, specH, true, p);
      drawSpectrum(width * 0.54, specY, width * 0.38, specH, false, p);
    } else {
      const isC = sample === 'crystal';
      drawDetector(width * 0.5, detY, detR, isC, p);
      drawSpectrum(width * 0.18, specY, width * 0.64, specH, isC, p);
    }
  }

  function frame() {
    if (paused) return;
    tick += 1;
    render();
    rafId = requestAnimationFrame(frame);
  }

  syncUi();
  rafId = requestAnimationFrame(frame);

  return {
    pause() { paused = true; cancelAnimationFrame(rafId); },
    resume() { if (!paused) return; paused = false; rafId = requestAnimationFrame(frame); },
    resize() { resize(); render(); },
    destroy() { paused = true; cancelAnimationFrame(rafId); dispose(); },
  };
}
