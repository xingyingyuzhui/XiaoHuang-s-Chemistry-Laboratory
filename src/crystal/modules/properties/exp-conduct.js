/**
 * 实验 2：NaCl 固态 / 熔融态 / 水溶液三态导电实验
 * 直流电路 + 灯泡发光 + 烧杯内部微观离子定向迁移（5 主题自适应）。
 */

import { drawSphere, mountCanvasLoop } from './canvas-kit.js';

const CONDUCT_STATES = {
  solid: { label: '固态 NaCl', current: 0, glow: 0, desc: '离子固定 · 不导电' },
  molten: { label: '熔融态 (801°C)', current: 0.78, glow: 0.85, desc: '自由离子 · 导电' },
  aqueous: { label: 'NaCl 水溶液', current: 1.0, glow: 1.0, desc: '水合离子 · 强导电' },
};

export function createConductExp(stageEl, controlsEl, onCaption) {
  let mode = 'solid';
  let powerOn = true;
  let wirePhase = 0;
  let tAccum = 0;

  const ions = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 6; c++) {
      ions.push({
        isNa: (r + c) % 2 === 0,
        gx: (c + 0.5) / 6,
        gy: (r + 0.5) / 4,
        x: (c + 0.5) / 6,
        y: (r + 0.5) / 4,
        vx: (Math.random() - 0.5) * 0.14,
        vy: (Math.random() - 0.5) * 0.14,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  controlsEl.innerHTML = `
    <div class="crystal-dock-group crystal-seg" role="group" aria-label="NaCl 状态">
      <button type="button" class="crystal-seg-btn is-active" data-mode="solid">固态晶体</button>
      <button type="button" class="crystal-seg-btn" data-mode="molten">熔融态</button>
      <button type="button" class="crystal-seg-btn" data-mode="aqueous">水溶液</button>
    </div>
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="power">电源：闭合通电</button>
    </div>
    <div class="crystal-dock-group">
      <span class="crystal-param-pill">灯泡 <strong data-stat="bulb">熄灭</strong></span>
      <span class="crystal-param-pill">电流 <strong data-stat="amp">0.00 A</strong></span>
    </div>
  `;

  const modeBtns = controlsEl.querySelectorAll('[data-mode]');
  const btnPower = controlsEl.querySelector('[data-act="power"]');
  const statBulb = controlsEl.querySelector('[data-stat="bulb"]');
  const statAmp = controlsEl.querySelector('[data-stat="amp"]');

  function syncUI() {
    const info = CONDUCT_STATES[mode];
    const active = powerOn && info.current > 0;
    modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
    btnPower.textContent = powerOn ? '电源：闭合通电' : '电源：已断开';
    btnPower.classList.toggle('crystal-btn-primary', powerOn);
    btnPower.classList.toggle('crystal-btn-ghost', !powerOn);
    statBulb.textContent = active ? (mode === 'aqueous' ? '明亮发光' : '发光') : '熄灭';
    statBulb.style.color = active ? 'var(--ok, #16a34a)' : 'var(--muted, #64748b)';
    statAmp.textContent = active ? `${(info.current * 0.85).toFixed(2)} A` : '0.00 A';
    onCaption?.(powerOn ? `${info.label} · ${info.desc}` : '电源已断开 · 无定向电流');
  }

  modeBtns.forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; syncUI(); }));
  btnPower.addEventListener('click', () => { powerOn = !powerOn; syncUI(); });
  syncUI();

  const loopCtrl = mountCanvasLoop(stageEl, (ctx, w, h, dt, p) => {
    tAccum += dt;
    const info = CONDUCT_STATES[mode];
    const conducting = powerOn && info.current > 0;
    if (conducting) wirePhase = (wirePhase + dt * (mode === 'aqueous' ? 1.5 : 1.1)) % 1;

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const topSafe = 24;
    const botSafe = 20;
    const usableH = Math.max(220, h - topSafe - botSafe);
    const circuitY = topSafe + Math.max(28, usableH * 0.13);
    const elecL = cx - Math.min(200, w * 0.27);
    const elecR = cx + Math.min(200, w * 0.27);
    const boxTop = circuitY + Math.max(72, usableH * 0.24);
    const boxH = Math.max(150, h - botSafe - boxTop);
    const boxW = (elecR - elecL) + 110;
    const boxX = cx - boxW / 2;

    // 电路连线与电子流
    ctx.strokeStyle = conducting ? p.wireOn : p.wireOff;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(elecL, boxTop + 36);
    ctx.lineTo(elecL, circuitY);
    ctx.lineTo(cx - 28, circuitY);
    ctx.moveTo(cx + 28, circuitY);
    ctx.lineTo(elecR, circuitY);
    ctx.lineTo(elecR, boxTop + 36);
    ctx.stroke();

    if (conducting) {
      ctx.fillStyle = p.flash;
      for (let i = 0; i < 6; i++) {
        const px = elecL + (elecR - elecL) * ((i / 6 + wirePhase) % 1);
        ctx.beginPath();
        ctx.arc(px, circuitY, 3.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 直流电源 + 开关
    ctx.fillStyle = p.surface;
    ctx.strokeStyle = p.borderStrong;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(elecL - 30, circuitY + 24, 60, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = p.covalentText;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DC +/−', elecL, circuitY + 43);

    ctx.strokeStyle = powerOn ? p.ok : p.bad;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(elecR, circuitY + 22);
    ctx.lineTo(powerOn ? elecR : elecR + 18, circuitY + 52);
    ctx.stroke();

    // 灯泡
    const bulbR = 23;
    if (conducting) {
      const glow = ctx.createRadialGradient(cx, circuitY, 4, cx, circuitY, bulbR * 2.8);
      glow.addColorStop(0, `rgba(250, 204, 21, ${(0.82 * info.glow).toFixed(2)})`);
      glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, circuitY, bulbR * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, circuitY, bulbR, 0, Math.PI * 2);
    ctx.fillStyle = conducting ? '#fef08a' : p.surfaceSoft;
    ctx.fill();
    ctx.strokeStyle = conducting ? '#eab308' : p.borderStrong;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = conducting ? '#713f12' : p.muted;
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(conducting ? '亮' : '暗', cx, circuitY + 4);

    // 电解槽容器与电极
    ctx.fillStyle = mode === 'aqueous' ? p.water : mode === 'molten' ? p.molten : p.surfaceSoft;
    ctx.strokeStyle = p.borderStrong;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxTop, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    const drawElec = (ex, sign, col) => {
      ctx.fillStyle = p.isDark ? '#334155' : '#475569';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(ex - 9, boxTop - 6, 18, boxH * 0.72, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.fillText(sign, ex, boxTop + 16);
    };
    drawElec(elecL, '+', p.covalent);
    drawElec(elecR, '−', p.crystal);

    const padX = elecL + 24;
    const spanX = Math.max(80, (elecR - elecL) - 48);
    const padY = boxTop + 28;
    const spanY = Math.max(60, boxH - 52);

    if (mode === 'solid') {
      ctx.strokeStyle = p.grid;
      ctx.lineWidth = 1.2;
      for (let r = 0; r < 4; r++) {
        const y = padY + ((r + 0.5) / 4) * spanY;
        ctx.beginPath();
        ctx.moveTo(padX + (0.5 / 6) * spanX, y);
        ctx.lineTo(padX + (5.5 / 6) * spanX, y);
        ctx.stroke();
      }
    }

    for (const ion of ions) {
      if (mode === 'solid') {
        ion.x += (ion.gx - ion.x) * Math.min(1, dt * 8);
        ion.y += (ion.gy - ion.y) * Math.min(1, dt * 8);
      } else {
        const drift = conducting ? (ion.isNa ? 1 : -1) * (mode === 'aqueous' ? 0.24 : 0.17) : 0;
        ion.x += (ion.vx + drift) * dt;
        ion.y += ion.vy * dt;
        if (ion.x < 0.04) ion.x = 0.96;
        if (ion.x > 0.96) ion.x = 0.04;
        if (ion.y < 0.08) { ion.y = 0.08; ion.vy = Math.abs(ion.vy); }
        if (ion.y > 0.92) { ion.y = 0.92; ion.vy = -Math.abs(ion.vy); }
      }
      const vib = mode === 'solid' ? Math.sin(tAccum * 12 + ion.phase) * 1.4 : 0;
      const px = padX + ion.x * spanX + vib;
      const py = padY + ion.y * spanY + vib * 0.6;
      if (mode === 'aqueous') {
        ctx.beginPath();
        ctx.arc(px, py, ion.isNa ? 15 : 18, 0, Math.PI * 2);
        ctx.strokeStyle = p.crystal;
        ctx.globalAlpha = 0.36;
        ctx.lineWidth = 1.3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (ion.isNa) {
        drawSphere(ctx, px, py, 10, '#e9d5ff', '#9333ea', '#581c87', '+', p.sphereRim);
      } else {
        drawSphere(ctx, px, py, 13, '#bbf7d0', '#16a34a', '#14532d', '−', p.sphereRim);
      }
    }

    if (conducting) {
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillStyle = p.ionicText;
      ctx.fillText('Na⁺ 向阴极 (−) 迁移 →', cx, boxTop + boxH - 12);
      ctx.fillStyle = p.okText;
      ctx.fillText('← Cl⁻ 向阳极 (+) 迁移', cx, boxTop + 16);
    }
  });

  return {
    ...loopCtrl,
    destroy() { loopCtrl.destroy(); controlsEl.innerHTML = ''; },
  };
}
