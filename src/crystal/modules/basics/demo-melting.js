/**
 * 模块 01 · 认识晶体：Demo 3（固定熔点：海波 vs 石蜡双试管同步加热 + T-t 熔化平台 + 微观热运动）
 */

import { STAGE_BG, setupHiDpiCanvas } from './stage-canvas.js';

function crystalTempAt(p) {
  if (p < 0.34) return 20 + (p / 0.34) * 28;
  if (p < 0.72) return 48;
  return 48 + ((p - 0.72) / 0.28) * 28;
}

function waxTempAt(p) {
  return 20 + p * 58 + Math.sin(p * Math.PI) * 3.5;
}

export function mountMeltingDemo({ stageEl, controlsEl, setCaption, setLegend }) {
  const { ctx, getSize, resize, dispose } = setupHiDpiCanvas(stageEl);
  let progress = 0;
  let heating = true;
  let fast = false;
  let paused = false;
  let tick = 0;
  let rafId = 0;

  setLegend([
    { label: '晶体 · 海波 (mp 48°C)', color: '#38bdf8' },
    { label: '非晶体 · 石蜡', color: '#fbbf24' },
  ]);

  controlsEl.innerHTML = `
    <div class="crystal-slice-actions">
      <button type="button" class="crystal-btn crystal-btn-primary" data-act="toggle">暂停加热</button>
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="speed">1× 速度</button>
      <button type="button" class="crystal-btn crystal-btn-ghost" data-act="reset">重置</button>
    </div>
    <div class="crystal-exam-body">
      <div class="crystal-exam-metric">
        <span class="crystal-exam-k">加热进度拖动（可定格平台期）</span>
        <span class="crystal-exam-v" data-el="pct">0%</span>
      </div>
      <input type="range" min="0" max="100" value="0" data-el="slider" style="width:100%;accent-color:#38bdf8;" />
      <div class="crystal-avg-row" style="margin-top:0.35rem;">
        <span>海波温度：<strong data-el="tc" style="color:#38bdf8;">20.0°C</strong></span>
        <span>石蜡温度：<strong data-el="tw" style="color:#fbbf24;">20.0°C</strong></span>
      </div>
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
      setCaption('升温阶段：海波与石蜡均吸热升温，晶体微粒在平衡位置剧烈振动');
    } else if (progress < 0.72) {
      setCaption('熔化平台期（48°C 恒温）：海波吸收热量全部用于破坏规则晶格，温度不变；石蜡持续升温软化');
    } else {
      setCaption('完全液化：海波彻底熔化后温度重新上升；晶体具有固定熔点，非晶体没有固定熔点');
    }
  }

  btnToggle.addEventListener('click', () => {
    if (progress >= 1) progress = 0;
    heating = !heating;
    syncUi();
  });
  btnSpeed.addEventListener('click', () => {
    fast = !fast;
    syncUi();
  });
  btnReset.addEventListener('click', () => {
    progress = 0;
    heating = true;
    syncUi();
  });
  slider.addEventListener('input', () => {
    progress = Number(slider.value) / 100;
    heating = false;
    syncUi();
  });

  function drawTube(x, y, w, h, temp, meltFrac, color, title) {
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, [4, 4, w * 0.45, w * 0.45]);
    ctx.stroke();

    const fillH = h * 0.52;
    const fillY = y + h - fillH - 4;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x + 3, fillY, w - 6, fillH, [2, 2, w * 0.4, w * 0.4]);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.25 + meltFrac * 0.48;
    ctx.fillRect(x, fillY, w, fillH);
    ctx.globalAlpha = 0.9;
    const solidCnt = Math.round((1 - meltFrac) * 9);
    for (let i = 0; i < solidCnt; i++) {
      ctx.fillStyle = color;
      ctx.fillRect(x + 8 + (i % 3) * ((w - 22) / 2.6), fillY + fillH - 12 - Math.floor(i / 3) * 12, 8, 8);
    }
    ctx.restore();

    const tx = x + w * 0.5;
    const ratio = Math.max(0, Math.min(1, (temp - 15) / 70));
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(tx, y - 16);
    ctx.lineTo(tx, y + h - 18);
    ctx.stroke();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(tx, y + h - 18);
    ctx.lineTo(tx, y + h - 18 - ratio * (h * 0.85));
    ctx.stroke();

    const flameAmp = heating ? 1 + Math.sin(tick * 0.28) * 0.16 : 0.35;
    ctx.beginPath();
    ctx.ellipse(x + w * 0.5, y + h + 14, 10 * flameAmp, 13 * flameAmp, 0, 0, Math.PI * 2);
    ctx.fillStyle = heating ? 'rgba(251, 146, 60, 0.85)' : 'rgba(148, 163, 184, 0.25)';
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, x + w * 0.5, y - 24);
    ctx.fillStyle = color;
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillText(`${temp.toFixed(1)}°C`, x + w * 0.5, y + h + 38);
  }

  function drawMicroBox(x, y, w, h, meltFrac, isCrystal) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.strokeStyle = isCrystal ? 'rgba(56, 189, 248, 0.45)' : 'rgba(251, 191, 36, 0.45)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 10);
    ctx.fill();
    ctx.stroke();

    const cols = 5;
    const rows = 3;
    const amp = 1.2 + progress * 4.5 + meltFrac * 8.5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const baseX = x + ((c + 0.8) / (cols + 0.6)) * w;
        const baseY = y + ((r + 0.9) / (rows + 0.8)) * h;
        const disorder = isCrystal ? meltFrac : 0.55 + meltFrac * 0.5;
        const dx = Math.sin(tick * 0.12 + idx * 1.9) * amp * (0.45 + disorder);
        const dy = Math.cos(tick * 0.14 + idx * 2.3) * amp * (0.45 + disorder);
        const offX = isCrystal ? 0 : Math.sin(idx * 9.1) * 7;
        const offY = isCrystal ? 0 : Math.cos(idx * 5.7) * 5;
        ctx.beginPath();
        ctx.arc(baseX + offX + dx, baseY + offY + dy, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = isCrystal ? '#38bdf8' : '#fbbf24';
        ctx.fill();
      }
    }
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(isCrystal ? '晶体微观热运动' : '非晶体微观热运动', x + 8, y + 15);
  }

  function frame() {
    if (paused) return;
    tick += 1;
    if (heating) {
      progress = Math.min(1, progress + (fast ? 0.0042 : 0.002));
      if (progress >= 1) heating = false;
      if (tick % 4 === 0) syncUi();
    }

    const { width, height } = getSize();
    ctx.fillStyle = STAGE_BG;
    ctx.fillRect(0, 0, width, height);

    const tc = crystalTempAt(progress);
    const tw = waxTempAt(progress);
    const cMelt = progress < 0.34 ? 0 : progress > 0.72 ? 1 : (progress - 0.34) / 0.38;
    const wMelt = Math.max(0, Math.min(1, (progress - 0.15) / 0.7));

    const tubeY = 74;
    const tubeH = Math.max(92, Math.min(130, height * 0.28));
    drawTube(width * 0.14, tubeY, 44, tubeH, tc, cMelt, '#38bdf8', '海波（晶体）');
    drawTube(width * 0.34, tubeY, 44, tubeH, tw, wMelt, '#fbbf24', '石蜡（非晶体）');

    const microX = width * 0.54;
    const microW = Math.max(120, width * 0.4);
    const microH = Math.max(52, tubeH * 0.46);
    drawMicroBox(microX, tubeY - 8, microW, microH, cMelt, true);
    drawMicroBox(microX, tubeY + microH + 10, microW, microH, wMelt, false);

    const gx = 54;
    const gy = tubeY + tubeH + 62;
    const gw = width - 84;
    const gh = Math.max(105, height - gy - 54);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(gx, gy);
    ctx.lineTo(gx, gy + gh);
    ctx.lineTo(gx + gw, gy + gh);
    ctx.stroke();

    const y48 = gy + gh - ((48 - 15) / 70) * gh;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(gx, y48);
    ctx.lineTo(gx + gw, y48);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#7dd3fc';
    ctx.font = '600 11px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('48°C', gx - 6, y48 + 4);

    ctx.fillStyle = 'rgba(56, 189, 248, 0.1)';
    ctx.fillRect(gx + gw * 0.34, gy, gw * 0.38, gh);
    ctx.fillStyle = 'rgba(125, 211, 252, 0.85)';
    ctx.textAlign = 'center';
    ctx.fillText('恒温熔化平台（固液共存）', gx + gw * 0.53, gy + 14);

    const steps = Math.max(2, Math.floor(progress * 100));
    const drawCurve = (fn, color) => {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const p = i / 100;
        const px = gx + p * gw;
        const py = gy + gh - ((fn(p) - 15) / 70) * gh;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.8;
      ctx.stroke();
    };
    drawCurve(crystalTempAt, '#38bdf8');
    drawCurve(waxTempAt, '#fbbf24');

    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('加热时间 t →', gx + gw, gy + gh + 16);

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
