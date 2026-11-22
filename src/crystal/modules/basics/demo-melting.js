/**
 * 模块 01 · 认识晶体：Demo 3（固定熔点：海波 vs 石蜡双试管同步加热 + T-t 熔化平台 + 微观热运动）
 */

import { setupHiDpiCanvas } from './stage-canvas.js';

function crystalTempAt(p) {
  if (p < 0.34) return 20 + (p / 0.34) * 28;
  if (p < 0.72) return 48;
  return 48 + ((p - 0.72) / 0.28) * 28;
}

function waxTempAt(p) {
  return 20 + p * 58 + Math.sin(p * Math.PI) * 3.5;
}

export function mountMeltingDemo({ stageEl, controlsEl, setCaption }) {
  let progress = 0;
  let heating = true;
  let fast = false;
  let paused = false;
  let tick = 0;
  let rafId = 0;

  const { ctx, getSize, getPalette, resize, dispose } = setupHiDpiCanvas(stageEl, () => render());

  controlsEl.innerHTML = `
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="toggle">暂停加热</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="speed">1× 速度</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">重置</button>
    </div>
    <label class="crystal-dock-group" style="font-size:0.78rem;color:var(--ink-soft,var(--muted,#475569));">
      <span>进度</span>
      <input type="range" min="0" max="100" value="0" data-el="slider" style="width:110px;accent-color:var(--accent,#3b82f6);" />
      <strong data-el="pct" style="font-family:var(--font-mono,monospace);min-width:34px;">0%</strong>
    </label>
    <div class="crystal-dock-group">
      <span class="crystal-param-pill">海波 <strong data-el="tc">20.0°C</strong></span>
      <span class="crystal-param-pill">石蜡 <strong data-el="tw">20.0°C</strong></span>
    </div>
  `;

  const btnToggle = controlsEl.querySelector('[data-act="toggle"]');
  const btnSpeed = controlsEl.querySelector('[data-act="speed"]');
  const btnReset = controlsEl.querySelector('[data-act="reset"]');
  const slider = controlsEl.querySelector('[data-el="slider"]');
  const pctEl = controlsEl.querySelector('[data-el="pct"]');
  const tcEl = controlsEl.querySelector('[data-el="tc"]');
  const twEl = controlsEl.querySelector('[data-el="tw"]');

  function syncUi() {
    btnToggle.textContent = heating ? '暂停加热' : '继续加热';
    btnSpeed.textContent = fast ? '2× 加速' : '1× 速度';
    const tc = crystalTempAt(progress);
    const tw = waxTempAt(progress);
    slider.value = String(Math.round(progress * 100));
    pctEl.textContent = `${Math.round(progress * 100)}%`;
    tcEl.textContent = `${tc.toFixed(1)}°C`;
    twEl.textContent = `${tw.toFixed(1)}°C`;

    if (progress < 0.34) {
      setCaption('升温期 · 两者吸热升温');
    } else if (progress < 0.72) {
      setCaption('48°C 恒温平台 · 海波固液共存');
    } else {
      setCaption('完全液化 · 晶体有固定熔点');
    }
  }

  btnToggle.addEventListener('click', () => {
    if (progress >= 1) progress = 0;
    heating = !heating;
    syncUi();
  });
  btnSpeed.addEventListener('click', () => { fast = !fast; syncUi(); });
  btnReset.addEventListener('click', () => { progress = 0; heating = true; syncUi(); });
  slider.addEventListener('input', () => { progress = Number(slider.value) / 100; heating = false; syncUi(); render(); });

  function drawTube(x, y, w, h, temp, meltFrac, color, textColor, title, p) {
    ctx.fillStyle = p.surface;
    ctx.strokeStyle = p.borderStrong;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [4, 4, w * 0.45, w * 0.45]);
    ctx.fill();
    ctx.stroke();

    const fillH = h * 0.54;
    const fillY = y + h - fillH - 4;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 3, fillY, w - 6, fillH, [2, 2, w * 0.4, w * 0.4]);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.24 + meltFrac * 0.48;
    ctx.fillRect(x, fillY, w, fillH);
    ctx.globalAlpha = 0.92;
    const solidCnt = Math.round((1 - meltFrac) * 9);
    for (let i = 0; i < solidCnt; i++) {
      ctx.fillStyle = color;
      ctx.fillRect(x + 8 + (i % 3) * ((w - 22) / 2.6), fillY + fillH - 12 - Math.floor(i / 3) * 12, 8, 8);
    }
    ctx.restore();

    const tx = x + w * 0.5;
    const ratio = Math.max(0, Math.min(1, (temp - 15) / 70));
    ctx.strokeStyle = p.isDark ? '#cbd5e1' : '#64748b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, y - 14);
    ctx.lineTo(tx, y + h - 18);
    ctx.stroke();
    ctx.strokeStyle = p.covalent;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx, y + h - 18);
    ctx.lineTo(tx, y + h - 18 - ratio * (h * 0.82));
    ctx.stroke();

    const flameAmp = heating ? 1 + Math.sin(tick * 0.28) * 0.16 : 0.35;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h + 13, 10 * flameAmp, 12 * flameAmp, 0, 0, Math.PI * 2);
    ctx.fillStyle = heating ? 'rgba(249, 115, 22, 0.88)' : p.grid;
    ctx.fill();

    ctx.fillStyle = p.ink;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w * 0.5, y - 22);
    ctx.fillStyle = textColor;
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillText(`${temp.toFixed(1)}°C`, x + w * 0.5, y + h + 36);
  }

  function drawMicroBox(x, y, w, h, meltFrac, isCrystal, p) {
    ctx.fillStyle = p.surface;
    ctx.strokeStyle = isCrystal ? p.crystal : p.amorphous;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();

    const cols = 5;
    const rows = 3;
    const amp = 1.2 + progress * 4.2 + meltFrac * 8.0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const baseX = x + ((c + 0.8) / (cols + 0.6)) * w;
        const baseY = y + 12 + ((r + 0.7) / (rows + 0.6)) * (h - 14);
        const disorder = isCrystal ? meltFrac : 0.55 + meltFrac * 0.5;
        const dx = Math.sin(tick * 0.12 + idx * 1.9) * amp * (0.45 + disorder);
        const dy = Math.cos(tick * 0.14 + idx * 2.3) * amp * (0.45 + disorder);
        const offX = isCrystal ? 0 : Math.sin(idx * 9.1) * 7;
        const offY = isCrystal ? 0 : Math.cos(idx * 5.7) * 5;
        ctx.beginPath();
        ctx.arc(baseX + offX + dx, baseY + offY + dy, 4.4, 0, Math.PI * 2);
        ctx.fillStyle = isCrystal ? p.crystal : p.amorphous;
        ctx.fill();
      }
    }
    ctx.fillStyle = p.muted;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(isCrystal ? '晶体微观热运动' : '非晶体微观热运动', x + 10, y + 16);
  }

  function render() {
    const { width, height } = getSize();
    const p = getPalette();

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, width, height);

    const tc = crystalTempAt(progress);
    const tw = waxTempAt(progress);
    const cMelt = progress < 0.34 ? 0 : progress > 0.72 ? 1 : (progress - 0.34) / 0.38;
    const wMelt = Math.max(0, Math.min(1, (progress - 0.15) / 0.7));

    const tubeY = 44;
    const tubeH = Math.max(88, Math.min(138, (height - 150) * 0.42));
    drawTube(width * 0.14, tubeY, 44, tubeH, tc, cMelt, p.crystal, p.crystalText, '海波（晶体）', p);
    drawTube(width * 0.34, tubeY, 44, tubeH, tw, wMelt, p.amorphous, p.amorphousText, '石蜡（非晶体）', p);

    const microX = width * 0.50;
    const microW = Math.max(150, width * 0.44);
    const microH = Math.max(54, tubeH * 0.52);
    drawMicroBox(microX, tubeY - 10, microW, microH, cMelt, true, p);
    drawMicroBox(microX, tubeY + microH + 8, microW, microH, wMelt, false, p);

    const gx = 58;
    const gy = tubeY + tubeH + 48;
    const gw = width - 88;
    const gh = Math.max(104, height - gy - 32);

    ctx.fillStyle = p.surfaceSoft;
    ctx.beginPath();
    ctx.roundRect(gx, gy, gw, gh, 8);
    ctx.fill();

    ctx.strokeStyle = p.borderStrong;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy + gh);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.stroke();

    const y48 = gy + gh - ((48 - 15) / 70) * gh;
    ctx.strokeStyle = p.crystal;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(gx, y48);
    ctx.lineTo(gx + gw, y48);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    ctx.fillStyle = p.crystalText;
    ctx.font = '700 11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('48°C', gx - 7, y48 + 4);

    ctx.fillStyle = p.crystalSoft;
    ctx.fillRect(gx + gw * 0.34, gy, gw * 0.38, gh);
    ctx.fillStyle = p.crystalText;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('恒温熔化平台（固液共存）', gx + gw * 0.53, gy + 15);

    const steps = Math.max(2, Math.floor(progress * 100));
    const drawCurve = (fn, color) => {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = i / 100;
        const px = gx + t * gw;
        const py = gy + gh - ((fn(t) - 15) / 70) * gh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.8;
      ctx.stroke();
    };
    drawCurve(crystalTempAt, p.crystal);
    drawCurve(waxTempAt, p.amorphous);

    // 曲线左上角内联图例（避开曲线与平台区）
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = p.crystalText;
    ctx.fillText('— 海波(晶体)', gx + 10, gy + 16);
    ctx.fillStyle = p.amorphousText;
    ctx.fillText('— 石蜡(非晶体)', gx + 10, gy + 32);

    ctx.fillStyle = p.muted;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('加热时间 t →', gx + gw, gy + gh + 18);
  }

  function frame() {
    if (paused) return;
    tick += 1;
    if (heating) {
      progress = Math.min(1, progress + (fast ? 0.0042 : 0.002));
      if (progress >= 1) heating = false;
      if (tick % 4 === 0) syncUi();
    }
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
