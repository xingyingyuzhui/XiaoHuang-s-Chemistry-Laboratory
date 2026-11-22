/**
 * 实验 4：16 种晶体同步升温熔化大比拼（-250°C → 3600°C）
 * 4×4 阵营（分子/金属/离子/共价各 4 种），5 主题自适应 Canvas 动画。
 */

import { clamp, mountCanvasLoop } from './canvas-kit.js';

const CRYSTALS = [
  { f: 'O₂', name: '固态氧', type: '分子', kind: 'crystal', mp: -218 },
  { f: 'CO₂', name: '干冰', type: '分子', kind: 'crystal', mp: -78, subl: true },
  { f: 'H₂O', name: '冰', type: '分子', kind: 'crystal', mp: 0 },
  { f: 'I₂', name: '碘', type: '分子', kind: 'crystal', mp: 114 },
  { f: 'Hg', name: '固态汞', type: '金属', kind: 'amorphous', mp: -39 },
  { f: 'Na', name: '金属钠', type: '金属', kind: 'amorphous', mp: 98 },
  { f: 'Cu', name: '金属铜', type: '金属', kind: 'amorphous', mp: 1085 },
  { f: 'W', name: '金属钨', type: '金属', kind: 'amorphous', mp: 3422 },
  { f: 'NaCl', name: '食盐', type: '离子', kind: 'ionic', mp: 801 },
  { f: 'CaF₂', name: '萤石', type: '离子', kind: 'ionic', mp: 1418 },
  { f: 'Al₂O₃', name: '刚玉', type: '离子', kind: 'ionic', mp: 2072 },
  { f: 'MgO', name: '氧化镁', type: '离子', kind: 'ionic', mp: 2852 },
  { f: 'Si', name: '晶体硅', type: '共价', kind: 'covalent', mp: 1414 },
  { f: 'SiO₂', name: '石英', type: '共价', kind: 'covalent', mp: 1713 },
  { f: 'SiC', name: '金刚砂', type: '共价', kind: 'covalent', mp: 2730 },
  { f: 'C', name: '金刚石', type: '共价', kind: 'covalent', mp: 3550 },
];

// 分段温标：前 36% 细扫 -250°C~200°C，后 64% 扫 200°C~3600°C
function uToTemp(u) {
  const x = clamp(u, 0, 1);
  return x <= 0.36 ? -250 + (x / 0.36) * 450 : 200 + ((x - 0.36) / 0.64) * 3400;
}

function tempToColor(t, p) {
  if (t < 0) return p.crystal;
  if (t < 250) return p.isDark ? '#22d3ee' : '#0891b2';
  if (t < 1100) return p.amorphous;
  if (t < 2300) return p.isDark ? '#fb923c' : '#ea580c';
  return p.covalent;
}

function familyColor(kind, p) {
  return p[kind] || p.crystal;
}

export function createMeltRaceExp(stageEl, controlsEl, onCaption) {
  const items = CRYSTALS.map((c) => {
    const pts = [];
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 3; k++) {
        pts.push({
          gx: (k + 0.5) / 3,
          gy: (r + 0.5) / 3,
          x: (k + 0.5) / 3,
          y: (r + 0.5) / 3,
          vx: (Math.random() - 0.5) * 0.9,
          vy: (Math.random() - 0.5) * 0.8,
          ph: Math.random() * Math.PI * 2,
        });
      }
    }
    return { ...c, pts, melted: false, flash: 0, heatRatio: 0.12 };
  });

  let u = 0;
  let playing = false;
  let speed = 1;
  let tAccum = 0;

  controlsEl.innerHTML = `
    <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="play">开始升温</button>
    <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">重置</button>
    <div class="crystal-seg" role="group" aria-label="升温倍率" style="grid-template-columns:repeat(3,auto);">
      <button type="button" class="crystal-seg-btn" data-spd="0.5">0.5×</button>
      <button type="button" class="crystal-seg-btn is-active" data-spd="1">1×</button>
      <button type="button" class="crystal-seg-btn" data-spd="2.5">2.5×</button>
    </div>
    <label style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.78rem;color:var(--ink-soft,var(--muted,#475569));">
      <input type="range" min="0" max="1000" step="1" value="0" data-act="slider" style="width:120px;accent-color:var(--accent,#3b82f6);" />
      <strong data-stat="temp" style="font-family:var(--font-mono,monospace);min-width:58px;">-250 °C</strong>
    </label>
    <span class="crystal-param-pill" data-stat="count">0 / 16 熔化</span>
  `;

  const btnPlay = controlsEl.querySelector('[data-act="play"]');
  const btnReset = controlsEl.querySelector('[data-act="reset"]');
  const spdBtns = controlsEl.querySelectorAll('[data-spd]');
  const slider = controlsEl.querySelector('[data-act="slider"]');
  const statCount = controlsEl.querySelector('[data-stat="count"]');
  const statTemp = controlsEl.querySelector('[data-stat="temp"]');

  function syncMelted(isScrub) {
    const temp = Math.round(uToTemp(u));
    let count = 0;
    const fresh = [];
    for (const it of items) {
      const now = temp >= it.mp;
      if (now && !it.melted) { it.flash = 1; fresh.push(it); }
      it.melted = now;
      if (now) count++;
    }
    if (!isScrub && fresh.length) {
      fresh.sort((a, b) => a.mp - b.mp);
      const last = fresh[fresh.length - 1];
      onCaption?.(`${temp}°C：${last.f}（${last.name} · ${last.type}晶体）${last.subl ? '升华' : '熔化'}！`);
    }
    statCount.textContent = `${count} / 16 熔化`;
    statTemp.textContent = `${temp} °C`;
    slider.value = String(Math.round(u * 1000));
  }

  function syncPlayBtn() {
    btnPlay.textContent = playing ? '暂停升温' : u >= 1 ? '重新开始' : '开始升温';
  }

  btnPlay.addEventListener('click', () => {
    if (u >= 1) {
      u = 0;
      for (const it of items) { it.melted = false; it.flash = 0; }
      syncMelted(true);
    }
    playing = !playing;
    syncPlayBtn();
  });

  btnReset.addEventListener('click', () => {
    playing = false;
    u = 0;
    for (const it of items) { it.melted = false; it.flash = 0; }
    syncMelted(true);
    syncPlayBtn();
    onCaption?.('已重置到 -250°C：4 类晶体全部处于固态，点击「开始升温」观看熔化大比拼');
  });

  spdBtns.forEach((b) => {
    b.addEventListener('click', () => {
      speed = Number(b.dataset.spd);
      spdBtns.forEach((x) => x.classList.toggle('is-active', x === b));
    });
  });

  slider.addEventListener('input', () => {
    playing = false;
    u = Number(slider.value) / 1000;
    syncMelted(true);
    syncPlayBtn();
  });

  syncMelted(true);
  onCaption?.('4×4 晶体熔化大比拼：从 -250°C 同步升温至 3600°C，直观感受四类晶体的熔点鸿沟');

  const loopCtrl = mountCanvasLoop(stageEl, (ctx, w, h, dt, p) => {
    tAccum += dt;
    if (playing) {
      u = clamp(u + dt * 0.048 * speed, 0, 1);
      syncMelted(false);
      if (u >= 1) {
        playing = false;
        syncPlayBtn();
        onCaption?.('3600°C 终点！分子晶体最先全军覆没，金属跨度极大（Hg↔W），共价晶体笑到最后');
      }
    }

    const temp = uToTemp(u);
    for (const it of items) {
      if (it.flash > 0) it.flash = Math.max(0, it.flash - dt * 1.6);
      it.heatRatio = clamp(1 - (it.mp - temp) / 380, 0.12, 1);
      for (const pt of it.pts) {
        if (!it.melted) {
          pt.x += (pt.gx - pt.x) * Math.min(1, dt * 10);
          pt.y += (pt.gy - pt.y) * Math.min(1, dt * 10);
        } else if (it.subl) {
          pt.x = (pt.x + pt.vx * dt * 1.4 + 1) % 1;
          pt.y -= (0.45 + Math.abs(pt.vy) * 0.5) * dt;
          if (pt.y < 0.05) pt.y = 0.95;
        } else {
          pt.x += pt.vx * dt * 1.1;
          pt.y += (pt.vy * 0.7 + (0.76 - pt.y) * 1.6) * dt;
          if (pt.x < 0.08 || pt.x > 0.92) { pt.vx *= -1; pt.x = clamp(pt.x, 0.08, 0.92); }
          if (pt.y < 0.42 || pt.y > 0.92) { pt.vy *= -1; pt.y = clamp(pt.y, 0.42, 0.92); }
        }
      }
    }

    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);

    const padX = 16;
    const topSafe = 74;
    const botSafe = 76;
    const tempInt = Math.round(temp);
    const barBoxH = 44;

    // 顶部大字温度表
    ctx.fillStyle = p.surface;
    ctx.strokeStyle = p.border;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(padX, topSafe, w - padX * 2, barBoxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = tempToColor(tempInt, p);
    ctx.font = '800 22px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${tempInt > 0 ? '+' : ''}${tempInt} °C`, padX + 14, topSafe + barBoxH / 2);

    const barX = padX + 152;
    const barW = Math.max(100, w - barX - padX - 16);
    ctx.fillStyle = p.trackBg;
    ctx.beginPath();
    ctx.roundRect(barX, topSafe + barBoxH / 2 - 5, barW, 10, 999);
    ctx.fill();
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, p.crystal);
    grad.addColorStop(0.36, p.isDark ? '#22d3ee' : '#0891b2');
    grad.addColorStop(0.68, p.amorphous);
    grad.addColorStop(1, p.covalent);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX, topSafe + barBoxH / 2 - 5, Math.max(6, barW * u), 10, 999);
    ctx.fill();

    // 4×4 阵营卡片网格
    const gridTop = topSafe + barBoxH + 10;
    const gap = 8;
    const cw = (w - padX * 2 - gap * 3) / 4;
    const ch = Math.max(52, (h - botSafe - gridTop - gap * 3) / 4);

    items.forEach((it, idx) => {
      const x = padX + (idx % 4) * (cw + gap);
      const y = gridTop + Math.floor(idx / 4) * (ch + gap);
      const col = familyColor(it.kind, p);

      ctx.fillStyle = it.melted ? p.surfaceSoft : p.surface;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 10);
      ctx.fill();

      if (it.melted && !it.subl) {
        ctx.save();
        ctx.globalAlpha = p.isDark ? 0.22 : 0.14;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + ch * 0.56, cw - 4, ch * 0.42, 8);
        ctx.fill();
        ctx.restore();
      }

      ctx.strokeStyle = it.flash > 0.05 ? p.flash : it.melted ? col : p.border;
      ctx.lineWidth = it.flash > 0.05 ? 2.2 : 1.2;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 10);
      ctx.stroke();

      ctx.fillStyle = col;
      ctx.fillRect(x + 8, y + 1, cw - 16, 2.8);

      ctx.fillStyle = p.ink;
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(it.f, x + 8, y + 7);
      ctx.fillStyle = p.muted;
      ctx.font = '500 10px system-ui, sans-serif';
      ctx.fillText(`${it.name}·${it.type}`, x + 8, y + 23);

      ctx.textAlign = 'right';
      ctx.fillStyle = it.melted ? col : p.muted;
      ctx.font = '700 10px ui-monospace, monospace';
      ctx.fillText(it.melted ? (it.subl ? '已升华' : '已熔化') : `${it.mp}°C`, x + cw - 7, y + 8);

      const px0 = x + cw * 0.46;
      const py0 = y + 22;
      const pw = Math.max(24, cw * 0.48);
      const ph = Math.max(20, ch - 28);
      const pr = clamp(Math.min(pw, ph) * 0.11, 2.4, 4.2);

      ctx.fillStyle = col;
      ctx.globalAlpha = it.melted ? 0.8 : 1;
      for (const pt of it.pts) {
        const vib = it.melted ? 0 : Math.sin(tAccum * 18 + pt.ph) * 1.4 * it.heatRatio;
        ctx.beginPath();
        ctx.arc(px0 + pt.x * pw + vib, py0 + pt.y * ph + vib * 0.6, pr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  });

  return {
    ...loopCtrl,
    destroy() { loopCtrl.destroy(); controlsEl.innerHTML = ''; },
  };
}
