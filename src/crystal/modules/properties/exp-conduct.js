/**
 * 实验 2：NaCl 固态 / 熔融态 / 水溶液三态导电实验
 * 直流电路 + 灯泡发光 + 烧杯内部微观离子定向迁移。
 */

import { drawSphere, mountCanvasLoop } from './canvas-kit.js';

const CONDUCT_STATES = {
  solid: { label: '固态 NaCl 晶体', current: 0, glow: 0, desc: '离子被强离子键固定在晶格，无法自由移动 → 不导电' },
  molten: { label: '熔融态 NaCl (801°C)', current: 0.78, glow: 0.85, desc: '高温破坏离子键，自由 Na⁺/Cl⁻ 定向迁移 → 导电' },
  aqueous: { label: 'NaCl 水溶液', current: 1.0, glow: 1.0, desc: '水分子电离出自由水合离子，定向迁移更快 → 强导电' },
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
    <div class="crystal-card">
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">NaCl 三态导电实验</h4>
        <span class="crystal-tag">离子迁移</span>
      </div>
      <div class="crystal-exam-tabs">
        <button type="button" class="crystal-exam-tab is-active" data-mode="solid">固态晶体</button>
        <button type="button" class="crystal-exam-tab" data-mode="molten">熔融态</button>
        <button type="button" class="crystal-exam-tab" data-mode="aqueous">水溶液</button>
      </div>
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-full" data-act="power">
        直流电源开关：已闭合（通电）
      </button>
      <div class="crystal-exam-body">
        <div class="crystal-exam-metric">
          <span class="crystal-exam-k">灯泡状态</span>
          <span class="crystal-exam-v" data-stat="bulb">熄灭</span>
        </div>
        <div class="crystal-exam-metric" style="margin-bottom:0;">
          <span class="crystal-exam-k">电流读数</span>
          <span class="crystal-exam-v" data-stat="amp">0.00 A</span>
        </div>
      </div>
      <p class="crystal-exam-tip" data-stat="desc"></p>
    </div>
  `;

  const modeBtns = controlsEl.querySelectorAll('[data-mode]');
  const btnPower = controlsEl.querySelector('[data-act="power"]');
  const statBulb = controlsEl.querySelector('[data-stat="bulb"]');
  const statAmp = controlsEl.querySelector('[data-stat="amp"]');
  const statDesc = controlsEl.querySelector('[data-stat="desc"]');

  function syncUI() {
    const info = CONDUCT_STATES[mode];
    const active = powerOn && info.current > 0;
    modeBtns.forEach((b) => b.classList.toggle('is-active', b.dataset.mode === mode));
    btnPower.textContent = powerOn ? '直流电源开关：已闭合（通电）' : '直流电源开关：已断开';
    btnPower.classList.toggle('crystal-btn-primary', powerOn);
    btnPower.classList.toggle('crystal-btn-ghost', !powerOn);
    statBulb.textContent = active ? (mode === 'aqueous' ? '明亮发光' : '发光') : '熄灭';
    statBulb.style.color = active ? '#16a34a' : '#94a3b8';
    statAmp.textContent = active ? `${(info.current * 0.85).toFixed(2)} A` : '0.00 A';
    statDesc.textContent = powerOn ? info.desc : '电源开关断开：即使存在自由离子，也只做无规则热运动，无定向电流。';
    onCaption?.(`${info.label} — ${statDesc.textContent}`);
  }

  modeBtns.forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; syncUI(); }));
  btnPower.addEventListener('click', () => { powerOn = !powerOn; syncUI(); });
  syncUI();

  const loopCtrl = mountCanvasLoop(stageEl, (ctx, w, h, dt) => {
    tAccum += dt;
    const info = CONDUCT_STATES[mode];
    const conducting = powerOn && info.current > 0;
    if (conducting) wirePhase = (wirePhase + dt * (mode === 'aqueous' ? 1.5 : 1.1)) % 1;

    ctx.fillStyle = '#0d1322';
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const circuitY = Math.max(58, h * 0.17);
    const elecL = cx - Math.min(180, w * 0.28);
    const elecR = cx + Math.min(180, w * 0.28);
    const boxTop = Math.max(138, h * 0.36);
    const boxH = Math.max(140, h - boxTop - 52);
    const boxW = (elecR - elecL) + 110;
    const boxX = cx - boxW / 2;

    // 电路连线与电子流
    ctx.strokeStyle = conducting ? '#38bdf8' : '#475569';
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
      ctx.fillStyle = '#fde047';
      for (let i = 0; i < 6; i++) {
        const px = elecL + (elecR - elecL) * ((i / 6 + wirePhase) % 1);
        ctx.beginPath();
        ctx.arc(px, circuitY, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 直流电源 + 开关
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(elecL - 28, circuitY + 26, 56, 30, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f87171';
    ctx.font = '700 12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('DC +/−', elecL, circuitY + 45);

    ctx.strokeStyle = powerOn ? '#4ade80' : '#f87171';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(elecR, circuitY + 24);
    ctx.lineTo(powerOn ? elecR : elecR + 18, circuitY + 54);
    ctx.stroke();

    // 灯泡
    const bulbR = 23;
    if (conducting) {
      const glow = ctx.createRadialGradient(cx, circuitY, 4, cx, circuitY, bulbR * 2.8);
      glow.addColorStop(0, `rgba(253, 224, 71, ${(0.85 * info.glow).toFixed(2)})`);
      glow.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, circuitY, bulbR * 2.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(cx, circuitY, bulbR, 0, Math.PI * 2);
    ctx.fillStyle = conducting ? '#fef08a' : '#1e293b';
    ctx.fill();
    ctx.strokeStyle = conducting ? '#facc15' : '#64748b';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = conducting ? '#713f12' : '#94a3b8';
    ctx.font = '700 12px system-ui';
    ctx.fillText(conducting ? '亮' : '暗', cx, circuitY + 4);

    // 电解槽容器与电极
    ctx.fillStyle = mode === 'aqueous' ? 'rgba(14,116,144,0.28)' : mode === 'molten' ? 'rgba(180,83,9,0.28)' : 'rgba(30,41,59,0.45)';
    ctx.strokeStyle = 'rgba(148,163,184,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(boxX, boxTop, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    const drawElec = (ex, sign, col) => {
      ctx.fillStyle = '#334155';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(ex - 9, boxTop - 6, 18, boxH * 0.72, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = col;
      ctx.font = '800 14px system-ui';
      ctx.fillText(sign, ex, boxTop + 16);
    };
    drawElec(elecL, '+', '#f87171');
    drawElec(elecR, '−', '#38bdf8');

    // 离子运动与绘制
    const padX = elecL + 22;
    const spanX = Math.max(80, (elecR - elecL) - 44);
    const padY = boxTop + 26;
    const spanY = Math.max(60, boxH - 48);

    if (mode === 'solid') {
      ctx.strokeStyle = 'rgba(148,163,184,0.22)';
      ctx.lineWidth = 1;
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
        ctx.strokeStyle = 'rgba(56,189,248,0.32)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      if (ion.isNa) {
        drawSphere(ctx, px, py, 10, '#e9d5ff', '#9333ea', '#581c87', '+');
      } else {
        drawSphere(ctx, px, py, 13, '#bbf7d0', '#16a34a', '#14532d', '−');
      }
    }

    if (conducting) {
      ctx.font = '700 12px system-ui';
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText('Na⁺ 向阴极 (−) 迁移 →', cx, boxTop + boxH - 14);
      ctx.fillStyle = '#bbf7d0';
      ctx.fillText('← Cl⁻ 向阳极 (+) 迁移', cx, boxTop + 14);
    }
  });

  return {
    ...loopCtrl,
    destroy() { loopCtrl.destroy(); controlsEl.innerHTML = ''; },
  };
}
