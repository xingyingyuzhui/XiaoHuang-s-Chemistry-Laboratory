/**
 * 实验 4（旗舰热成像升级）：16 种晶体同步升温熔化大比拼（-250°C → 3600°C）
 * 4×4 阵营（分子/金属/离子/共价各 4 种）+ 热成像色彩氛围 + 熔化瞬间相位涟漪闪光，5 主题高对比自适应。
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

function thermalState(t, p) {
  if (t < 0) return { fg: p.isDark ? '#7dd3fc' : '#0284c7', rgb: '56, 189, 248', label: '极寒霜冻' };
  if (t < 300) return { fg: p.isDark ? '#22d3ee' : '#0891b2', rgb: '6, 182, 212', label: '常温区间' };
  if (t < 1100) return { fg: p.isDark ? '#fb923c' : '#ea580c', rgb: '249, 115, 22', label: '赤热炉温' };
  if (t < 2300) return { fg: p.isDark ? '#f87171' : '#dc2626', rgb: '239, 68, 68', label: '炽熔高温' };
  return { fg: p.isDark ? '#fef08a' : '#b45309', rgb: '250, 204, 21', label: '白炽巅峰' };
}

export function createMeltRaceExp(stageEl, controlsEl, onCaption) {
  const items = CRYSTALS.map((c) => {
    const pts = [];
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < 3; k++) {
        pts.push({
          gx: (k + 0.5) / 3, gy: (r + 0.5) / 3, x: (k + 0.5) / 3, y: (r + 0.5) / 3,
          vx: (Math.random() - 0.5) * 0.95, vy: (Math.random() - 0.5) * 0.85, ph: Math.random() * Math.PI * 2,
        });
      }
    }
    return { ...c, pts, melted: false, flash: 0, ripple: 0, heatRatio: 0.12 };
  });

  let u = 0, playing = false, speed = 1, tAccum = 0;

  controlsEl.innerHTML = `
    <div class="crystal-dock-group">
      <button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="play">开始升温</button>
      <button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">重置</button>
    </div>
    <div class="crystal-dock-group crystal-seg" role="group" aria-label="升温倍率">
      <button type="button" class="crystal-seg-btn" data-spd="0.5">0.5×</button>
      <button type="button" class="crystal-seg-btn is-active" data-spd="1">1×</button>
      <button type="button" class="crystal-seg-btn" data-spd="2.5">2.5×</button>
    </div>
    <div class="crystal-dock-group">
      <label style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.78rem;color:var(--ink-soft,var(--muted,#475569));">
        <input type="range" min="0" max="1000" step="1" value="0" data-act="slider" style="width:120px;accent-color:var(--accent,#3b82f6);" />
        <strong data-stat="temp" style="font-family:var(--font-mono,monospace);min-width:58px;">-250 °C</strong>
      </label>
      <span class="crystal-param-pill" data-stat="count">0 / 16 熔化</span>
    </div>
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
      if (now && !it.melted) { it.flash = 1; it.ripple = 1; fresh.push(it); }
      it.melted = now;
      if (now) count++;
    }
    if (!isScrub && fresh.length) {
      fresh.sort((a, b) => a.mp - b.mp);
      const last = fresh[fresh.length - 1];
      onCaption?.(`${temp}°C · ${last.f}（${last.type}）${last.subl ? '升华' : '熔化'}`);
    }
    statCount.textContent = `${count} / 16 熔化`;
    statTemp.textContent = `${temp} °C`;
    slider.value = String(Math.round(u * 1000));
  }

  const syncPlayBtn = () => { btnPlay.textContent = playing ? '暂停升温' : u >= 1 ? '重新开始' : '开始升温'; };
  const clearAll = () => { u = 0; for (const it of items) { it.melted = false; it.flash = 0; it.ripple = 0; } syncMelted(true); };

  btnPlay.addEventListener('click', () => { if (u >= 1) clearAll(); playing = !playing; syncPlayBtn(); });
  btnReset.addEventListener('click', () => { playing = false; clearAll(); syncPlayBtn(); onCaption?.('已重置 · -250°C 全固态霜冻'); });
  spdBtns.forEach((b) => b.addEventListener('click', () => { speed = Number(b.dataset.spd); spdBtns.forEach((x) => x.classList.toggle('is-active', x === b)); }));
  slider.addEventListener('input', () => { playing = false; u = Number(slider.value) / 1000; syncMelted(true); syncPlayBtn(); });

  syncMelted(true);
  onCaption?.('-250°C → 3600°C 四类晶体热成像升温对比');

  const loopCtrl = mountCanvasLoop(stageEl, (ctx, w, h, dt, p) => {
    tAccum += dt;
    if (playing) {
      u = clamp(u + dt * 0.048 * speed, 0, 1);
      syncMelted(false);
      if (u >= 1) { playing = false; syncPlayBtn(); onCaption?.('3600°C 白炽终点 · 共价晶体最耐高温'); }
    }

    const temp = uToTemp(u), th = thermalState(temp, p);
    for (const it of items) {
      if (it.flash > 0) it.flash = Math.max(0, it.flash - dt * 1.45);
      if (it.ripple > 0) it.ripple = Math.max(0, it.ripple - dt * 1.25);
      it.heatRatio = clamp(1 - (it.mp - temp) / 360, 0.12, 1);
      for (const pt of it.pts) {
        if (!it.melted) {
          pt.x += (pt.gx - pt.x) * Math.min(1, dt * 10);
          pt.y += (pt.gy - pt.y) * Math.min(1, dt * 10);
        } else if (it.subl) {
          pt.x = (pt.x + pt.vx * dt * 1.5 + 1) % 1;
          pt.y -= (0.48 + Math.abs(pt.vy) * 0.55) * dt;
          if (pt.y < 0.05) pt.y = 0.95;
        } else {
          pt.x += pt.vx * dt * 1.15;
          pt.y += (pt.vy * 0.72 + (0.76 - pt.y) * 1.65) * dt;
          if (pt.x < 0.08 || pt.x > 0.92) { pt.vx *= -1; pt.x = clamp(pt.x, 0.08, 0.92); }
          if (pt.y < 0.42 || pt.y > 0.92) { pt.vy *= -1; pt.y = clamp(pt.y, 0.42, 0.92); }
        }
      }
    }

    // 1. 主题底色 + 温度感应热成像环境光晕
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, w, h);
    const aura = p.isDark ? 0.24 : 0.13;
    const hearth = ctx.createRadialGradient(w * 0.5, h * 0.96, 12, w * 0.5, h * 0.72, Math.max(w, h) * 0.78);
    hearth.addColorStop(0, `rgba(${th.rgb}, ${(aura * (0.65 + u * 0.55)).toFixed(3)})`);
    hearth.addColorStop(0.55, `rgba(${th.rgb}, ${(aura * 0.35).toFixed(3)})`);
    hearth.addColorStop(1, `rgba(${th.rgb}, 0)`);
    ctx.fillStyle = hearth;
    ctx.fillRect(0, 0, w, h);

    // 2. 顶部热成像温度表头 + 五段热谱条 + 发光游标
    const padX = 16, topSafe = 14, botSafe = 14, tempInt = Math.round(temp), barBoxH = 48;
    ctx.fillStyle = p.surface;
    ctx.strokeStyle = `rgba(${th.rgb}, ${p.isDark ? 0.58 : 0.46})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.roundRect(padX, topSafe, w - padX * 2, barBoxH, 11); ctx.fill(); ctx.stroke();

    const headGlow = ctx.createLinearGradient(padX, topSafe, padX + 220, topSafe);
    headGlow.addColorStop(0, `rgba(${th.rgb}, ${p.isDark ? 0.22 : 0.12})`);
    headGlow.addColorStop(1, `rgba(${th.rgb}, 0)`);
    ctx.fillStyle = headGlow;
    ctx.beginPath(); ctx.roundRect(padX + 1, topSafe + 1, Math.min(240, w - padX * 2 - 2), barBoxH - 2, 10); ctx.fill();

    ctx.fillStyle = th.fg;
    ctx.font = '800 21px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${tempInt > 0 ? '+' : ''}${tempInt} °C`, padX + 14, topSafe + barBoxH * 0.5);

    const tagX = padX + 144;
    ctx.fillStyle = `rgba(${th.rgb}, ${p.isDark ? 0.24 : 0.14})`;
    ctx.beginPath(); ctx.roundRect(tagX, topSafe + 13, 62, 22, 999); ctx.fill();
    ctx.fillStyle = th.fg; ctx.font = '700 10.5px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(th.label, tagX + 31, topSafe + 24.5);

    const barX = tagX + 74, barW = Math.max(96, w - barX - padX - 16), barY = topSafe + barBoxH * 0.5 - 5;
    ctx.fillStyle = p.trackBg;
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, 10, 999); ctx.fill();
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#38bdf8'); grad.addColorStop(0.28, '#06b6d4');
    grad.addColorStop(0.54, '#f97316'); grad.addColorStop(0.80, '#ef4444'); grad.addColorStop(1, '#fef08a');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(barX, barY, Math.max(8, barW * u), 10, 999); ctx.fill();

    const dotX = barX + clamp(barW * u, 4, barW - 4);
    const dotGlow = ctx.createRadialGradient(dotX, barY + 5, 1, dotX, barY + 5, 13);
    dotGlow.addColorStop(0, `rgba(${th.rgb}, 0.85)`); dotGlow.addColorStop(1, `rgba(${th.rgb}, 0)`);
    ctx.fillStyle = dotGlow; ctx.beginPath(); ctx.arc(dotX, barY + 5, 13, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(dotX, barY + 5, 4.2, 0, Math.PI * 2); ctx.fill();

    // 3. 4×4 阵营卡片网格 + 预热光晕 + 熔化瞬间相变涟漪闪光
    const gridTop = topSafe + barBoxH + 10, gap = 8;
    const cw = (w - padX * 2 - gap * 3) / 4;
    const ch = Math.max(52, (h - botSafe - gridTop - gap * 3) / 4);

    items.forEach((it, idx) => {
      const x = padX + (idx % 4) * (cw + gap), y = gridTop + Math.floor(idx / 4) * (ch + gap);
      const col = p[it.kind] || p.crystal, nearMelt = !it.melted && it.heatRatio > 0.62;

      ctx.fillStyle = it.melted ? p.surfaceSoft : p.surface;
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 10); ctx.fill();

      if (nearMelt) {
        ctx.fillStyle = `rgba(${th.rgb}, ${((it.heatRatio - 0.62) * (p.isDark ? 0.45 : 0.28)).toFixed(3)})`;
        ctx.beginPath(); ctx.roundRect(x + 1, y + 1, cw - 2, ch - 2, 9); ctx.fill();
      } else if (it.melted && !it.subl) {
        ctx.save(); ctx.globalAlpha = p.isDark ? 0.24 : 0.15; ctx.fillStyle = col;
        const wy = Math.sin(tAccum * 4 + idx) * 1.6;
        ctx.beginPath(); ctx.roundRect(x + 2, y + ch * 0.54 + wy, cw - 4, ch * 0.44 - wy, 8); ctx.fill();
        ctx.restore();
      }

      if (it.ripple > 0.02) {
        ctx.save();
        ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 10); ctx.clip();
        ctx.strokeStyle = `rgba(${th.rgb}, ${(it.ripple * 0.92).toFixed(2)})`;
        ctx.lineWidth = 2.6 * it.ripple + 0.8;
        ctx.beginPath(); ctx.arc(x + cw * 0.5, y + ch * 0.5, 8 + (1 - it.ripple) * Math.max(cw, ch) * 0.72, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }

      ctx.strokeStyle = it.flash > 0.05 ? th.fg : it.melted ? col : nearMelt ? `rgba(${th.rgb}, 0.7)` : p.border;
      ctx.lineWidth = it.flash > 0.05 ? 2.4 : nearMelt ? 1.6 : 1.2;
      ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 10); ctx.stroke();

      ctx.fillStyle = col; ctx.fillRect(x + 8, y + 1, cw - 16, 2.8);
      ctx.fillStyle = p.ink; ctx.font = '800 13px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(it.f, x + 8, y + 7);
      ctx.fillStyle = p.muted; ctx.font = '500 10px system-ui, sans-serif';
      ctx.fillText(`${it.name}·${it.type}`, x + 8, y + 23);
      ctx.textAlign = 'right'; ctx.fillStyle = it.melted ? col : nearMelt ? th.fg : p.muted; ctx.font = '700 10px ui-monospace, monospace';
      ctx.fillText(it.melted ? (it.subl ? '已升华' : '已熔化') : `${it.mp}°C`, x + cw - 7, y + 8);

      const px0 = x + cw * 0.46, py0 = y + 22, pw = Math.max(24, cw * 0.48), ph = Math.max(20, ch - 28);
      const pr = clamp(Math.min(pw, ph) * 0.11, 2.4, 4.2);
      ctx.fillStyle = it.flash > 0.15 ? th.fg : col;
      ctx.globalAlpha = it.melted ? 0.82 : 1;
      for (const pt of it.pts) {
        const vib = it.melted ? 0 : Math.sin(tAccum * (16 + it.heatRatio * 14) + pt.ph) * (1.2 + it.heatRatio * 1.9);
        ctx.beginPath(); ctx.arc(px0 + pt.x * pw + vib, py0 + pt.y * ph + vib * 0.6, pr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  });

  return { ...loopCtrl, destroy() { loopCtrl.destroy(); controlsEl.innerHTML = ''; } };
}
