/**
 * 实验 4：16 种晶体同步升温熔化大比拼（-250°C → 3600°C）
 * 4×4 阵营（分子/金属/离子/共价各 4 种），单 Canvas 格点粒子动画 + 实时播报。
 */

import { clamp, mountCanvasLoop } from './canvas-kit.js';

const CRYSTALS = [
  { f: 'O₂', name: '固态氧', type: '分子', mp: -218, col: '#38bdf8' },
  { f: 'CO₂', name: '干冰', type: '分子', mp: -78, col: '#38bdf8', subl: true },
  { f: 'H₂O', name: '冰', type: '分子', mp: 0, col: '#38bdf8' },
  { f: 'I₂', name: '碘', type: '分子', mp: 114, col: '#38bdf8' },
  { f: 'Hg', name: '固态汞', type: '金属', mp: -39, col: '#fbbf24' },
  { f: 'Na', name: '金属钠', type: '金属', mp: 98, col: '#fbbf24' },
  { f: 'Cu', name: '金属铜', type: '金属', mp: 1085, col: '#fbbf24' },
  { f: 'W', name: '金属钨', type: '金属', mp: 3422, col: '#fbbf24' },
  { f: 'NaCl', name: '食盐', type: '离子', mp: 801, col: '#c084fc' },
  { f: 'CaF₂', name: '萤石', type: '离子', mp: 1418, col: '#c084fc' },
  { f: 'Al₂O₃', name: '刚玉', type: '离子', mp: 2072, col: '#c084fc' },
  { f: 'MgO', name: '氧化镁', type: '离子', mp: 2852, col: '#c084fc' },
  { f: 'Si', name: '晶体硅', type: '共价', mp: 1414, col: '#fb7185' },
  { f: 'SiO₂', name: '石英', type: '共价', mp: 1713, col: '#fb7185' },
  { f: 'SiC', name: '金刚砂', type: '共价', mp: 2730, col: '#fb7185' },
  { f: 'C', name: '金刚石', type: '共价', mp: 3550, col: '#fb7185' },
];

// 分段温标：前 36% 细扫 -250°C~200°C，后 64% 扫 200°C~3600°C
function uToTemp(u) {
  const x = clamp(u, 0, 1);
  return x <= 0.36 ? -250 + (x / 0.36) * 450 : 200 + ((x - 0.36) / 0.64) * 3400;
}

function tempToColor(t) {
  if (t < 0) return '#38bdf8';
  if (t < 250) return '#22d3ee';
  if (t < 1100) return '#fbbf24';
  if (t < 2300) return '#fb923c';
  return '#f43f5e';
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
  let feedLog = [];

  controlsEl.innerHTML = `
    <div class="crystal-card">
      <div class="crystal-card-head">
        <h4 class="crystal-card-title">熔化升温控制台</h4>
        <span class="crystal-tag" data-stat="count">0 / 16 熔化</span>
      </div>
      <div class="crystal-slice-actions">
        <button type="button" class="crystal-btn crystal-btn-primary" data-act="play">开始升温</button>
        <button type="button" class="crystal-btn crystal-btn-ghost" data-act="reset">回到 -250°C</button>
      </div>
      <div class="crystal-exam-tabs">
        <button type="button" class="crystal-exam-tab" data-spd="0.5">0.5× 慢速</button>
        <button type="button" class="crystal-exam-tab is-active" data-spd="1">1× 标准</button>
        <button type="button" class="crystal-exam-tab" data-spd="2.5">2.5× 极速</button>
      </div>
      <label style="display:flex;flex-direction:column;gap:0.28rem;font-size:0.82rem;color:var(--ink-soft,#475569);">
        <span style="display:flex;justify-content:space-between;font-weight:700;">
          <span>手动拖拽温度</span>
          <strong data-stat="temp" style="font-family:var(--font-mono,monospace);color:var(--accent,#2563eb);">-250 °C</strong>
        </span>
        <input type="range" min="0" max="1000" step="1" value="0" data-act="slider" style="width:100%;accent-color:var(--accent,#2563eb);" />
      </label>
      <div class="crystal-exam-body" style="max-height:142px;overflow-y:auto;">
        <div style="font-size:0.76rem;font-weight:700;color:var(--ink-soft,#475569);margin-bottom:0.25rem;">熔化实时播报</div>
        <div data-stat="feed" style="display:flex;flex-direction:column;gap:0.22rem;font-size:0.78rem;color:var(--ink,#1e293b);"></div>
      </div>
    </div>
  `;

  const btnPlay = controlsEl.querySelector('[data-act="play"]');
  const btnReset = controlsEl.querySelector('[data-act="reset"]');
  const spdBtns = controlsEl.querySelectorAll('[data-spd]');
  const slider = controlsEl.querySelector('[data-act="slider"]');
  const statCount = controlsEl.querySelector('[data-stat="count"]');
  const statTemp = controlsEl.querySelector('[data-stat="temp"]');
  const statFeed = controlsEl.querySelector('[data-stat="feed"]');

  function renderFeed() {
    if (!feedLog.length) {
      statFeed.innerHTML = '<span style="color:var(--muted,#64748b);">全员固态（-250°C），点击「开始升温」观察依次熔化…</span>';
      return;
    }
    statFeed.innerHTML = feedLog
      .slice(0, 6)
      .map(
        (m) => `<div style="display:flex;justify-content:space-between;gap:0.4rem;">
          <span><strong style="color:${m.col};">${m.f}</strong> ${m.name}（${m.type}）</span>
          <span style="font-family:var(--font-mono,monospace);color:var(--muted,#64748b);">${m.mp}°C ${m.subl ? '升华' : '熔化'}</span>
        </div>`
      )
      .join('');
  }

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
    if (isScrub) {
      feedLog = items.filter((it) => it.melted).sort((a, b) => b.mp - a.mp);
    } else if (fresh.length) {
      fresh.sort((a, b) => a.mp - b.mp);
      for (const m of fresh) feedLog = [m, ...feedLog.filter((x) => x.f !== m.f)];
      const last = fresh[fresh.length - 1];
      onCaption?.(`${temp}°C：${last.f}（${last.name} · ${last.type}晶体）${last.subl ? '升华' : '熔化'}！`);
    }
    statCount.textContent = `${count} / 16 熔化`;
    statTemp.textContent = `${temp} °C`;
    slider.value = String(Math.round(u * 1000));
    renderFeed();
  }

  function syncPlayBtn() {
    btnPlay.textContent = playing ? '暂停升温' : u >= 1 ? '重新开始' : '开始升温';
  }

  btnPlay.addEventListener('click', () => {
    if (u >= 1) {
      u = 0;
      feedLog = [];
      for (const it of items) { it.melted = false; it.flash = 0; }
      syncMelted(true);
    }
    playing = !playing;
    syncPlayBtn();
  });

  btnReset.addEventListener('click', () => {
    playing = false;
    u = 0;
    feedLog = [];
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

  const loopCtrl = mountCanvasLoop(stageEl, (ctx, w, h, dt) => {
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
      for (const p of it.pts) {
        if (!it.melted) {
          p.x += (p.gx - p.x) * Math.min(1, dt * 10);
          p.y += (p.gy - p.y) * Math.min(1, dt * 10);
        } else if (it.subl) {
          p.x = (p.x + p.vx * dt * 1.4 + 1) % 1;
          p.y -= (0.45 + Math.abs(p.vy) * 0.5) * dt;
          if (p.y < 0.05) p.y = 0.95;
        } else {
          p.x += p.vx * dt * 1.1;
          p.y += (p.vy * 0.7 + (0.76 - p.y) * 1.6) * dt;
          if (p.x < 0.08 || p.x > 0.92) { p.vx *= -1; p.x = clamp(p.x, 0.08, 0.92); }
          if (p.y < 0.42 || p.y > 0.92) { p.vy *= -1; p.y = clamp(p.y, 0.42, 0.92); }
        }
      }
    }

    ctx.fillStyle = '#0d1322';
    ctx.fillRect(0, 0, w, h);

    // 顶部大字温度表
    const tempInt = Math.round(temp);
    const topH = 52;
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    ctx.fillRect(12, 10, w - 24, topH);
    ctx.strokeStyle = 'rgba(148,163,184,0.24)';
    ctx.lineWidth = 1;
    ctx.strokeRect(12, 10, w - 24, topH);

    ctx.fillStyle = tempToColor(tempInt);
    ctx.font = '800 26px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${tempInt > 0 ? '+' : ''}${tempInt} °C`, 24, 36);

    const barX = 175;
    const barW = Math.max(120, w - barX - 28);
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.roundRect(barX, 31, barW, 10, 999);
    ctx.fill();
    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#38bdf8');
    grad.addColorStop(0.36, '#22d3ee');
    grad.addColorStop(0.68, '#fbbf24');
    grad.addColorStop(1, '#f43f5e');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(barX, 31, Math.max(6, barW * u), 10, 999);
    ctx.fill();

    // 4×4 阵营卡片网格
    const padX = 12;
    const gridTop = topH + 18;
    const gap = 8;
    const cw = (w - padX * 2 - gap * 3) / 4;
    const ch = Math.max(54, (h - 42 - gridTop - gap * 3) / 4);

    items.forEach((it, idx) => {
      const x = padX + (idx % 4) * (cw + gap);
      const y = gridTop + Math.floor(idx / 4) * (ch + gap);

      ctx.fillStyle = it.melted ? 'rgba(30,41,59,0.45)' : 'rgba(15,23,42,0.86)';
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 10);
      ctx.fill();

      if (it.melted && !it.subl) {
        ctx.fillStyle = `${it.col}28`;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + ch * 0.56, cw - 4, ch * 0.42, 8);
        ctx.fill();
      }

      ctx.strokeStyle = it.flash > 0.05 ? '#fde047' : it.melted ? `${it.col}88` : 'rgba(148,163,184,0.25)';
      ctx.lineWidth = it.flash > 0.05 ? 2.2 : 1.1;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 10);
      ctx.stroke();

      ctx.fillStyle = it.col;
      ctx.fillRect(x + 8, y + 1, cw - 16, 2.5);

      ctx.fillStyle = '#f8fafc';
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(it.f, x + 8, y + 7);
      ctx.fillStyle = '#94a3b8';
      ctx.font = '500 10px system-ui, sans-serif';
      ctx.fillText(it.name, x + 8, y + 23);

      ctx.textAlign = 'right';
      ctx.fillStyle = it.melted ? '#fde047' : '#cbd5e1';
      ctx.font = '700 10px ui-monospace, monospace';
      ctx.fillText(it.melted ? (it.subl ? '已升华' : '已熔化') : `${it.mp}°C`, x + cw - 7, y + 8);

      const px0 = x + cw * 0.42;
      const py0 = y + 22;
      const pw = Math.max(26, cw * 0.54);
      const ph = Math.max(22, ch - 28);
      const pr = clamp(Math.min(pw, ph) * 0.11, 2.4, 4.2);

      ctx.fillStyle = it.melted ? `${it.col}cc` : it.col;
      for (const p of it.pts) {
        const vib = it.melted ? 0 : Math.sin(tAccum * 18 + p.ph) * 1.4 * it.heatRatio;
        ctx.beginPath();
        ctx.arc(px0 + p.x * pw + vib, py0 + p.y * ph + vib * 0.6, pr, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  });

  return {
    ...loopCtrl,
    destroy() { loopCtrl.destroy(); controlsEl.innerHTML = ''; },
  };
}
