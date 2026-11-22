/**
 * 参数化暗色科研影院热学相变引擎（view:'race' [2..16 物质热成像比拼] + view:'curve' [晶体/非晶体熔化曲线]）
 * 自包含 HiDPI Canvas + ResizeObserver + rAF，destroy() 彻底释放所有资源。
 */

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const CAT = {
  molecular: { label: '分子', col: '#38bdf8' },
  metallic: { label: '金属', col: '#f59e0b' },
  ionic: { label: '离子', col: '#a78bfa' },
  covalent: { label: '共价', col: '#f43f5e' },
  amorphous: { label: '非晶', col: '#fb923c' },
};
const DEFAULT_RACE = [
  ['O₂', '固态氧', 'molecular', -218], ['CO₂', '干冰', 'molecular', -78, 1], ['H₂O', '冰', 'molecular', 0], ['I₂', '碘', 'molecular', 114],
  ['Hg', '固态汞', 'metallic', -39], ['Na', '金属钠', 'metallic', 98], ['Cu', '金属铜', 'metallic', 1085], ['W', '金属钨', 'metallic', 3422],
  ['NaCl', '食盐', 'ionic', 801], ['CaF₂', '萤石', 'ionic', 1418], ['Al₂O₃', '刚玉', 'ionic', 2072], ['MgO', '氧化镁', 'ionic', 2852],
  ['Si', '晶体硅', 'covalent', 1414], ['SiO₂', '石英', 'covalent', 1713], ['SiC', '金刚砂', 'covalent', 2730], ['C', '金刚石', 'covalent', 3550],
].map(([formula, name, category, mpC, subl]) => ({ formula, name, category, mpC, subl: Boolean(subl) }));

const regimeOf = (t) => (
  t < 0 ? { fg: '#7dd3fc', rgb: '56,189,248', label: '极寒霜冻' }
    : t < 260 ? { fg: '#22d3ee', rgb: '34,211,238', label: '常温区间' }
      : t < 1050 ? { fg: '#fb923c', rgb: '249,115,22', label: '赤热炉温' }
        : t < 2200 ? { fg: '#f87171', rgb: '239,68,68', label: '炽熔高温' }
          : { fg: '#fef08a', rgb: '254,240,138', label: '白炽巅峰' }
);
const gridOf = (n) => (n <= 2 ? [2, 1] : n <= 4 ? [2, 2] : n <= 6 ? [3, 2] : n <= 9 ? [3, 3] : n <= 12 ? [4, 3] : [4, 4]);

function fillBox(ctx, x, y, w, h, r, fill, stroke, lw = 1.2) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}

function createCanvasLoop(stageEl, onFrame) {
  stageEl.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  stageEl.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  let w = 640, h = 420, paused = false, destroyed = false, rafId = 0, lastTs = 0;

  function resize() {
    const r = stageEl.getBoundingClientRect();
    w = Math.max(320, r.width || 640); h = Math.max(260, r.height || 420);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  ro?.observe(stageEl);
  resize();

  function tick(ts) {
    if (destroyed || paused) { rafId = 0; return; }
    const dt = lastTs ? clamp((ts - lastTs) / 1000, 0, 0.05) : 0.016;
    lastTs = ts; onFrame(ctx, w, h, dt);
    if (!destroyed && !paused) rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  return {
    pause() { paused = true; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } },
    resume() { if (destroyed) return; paused = false; lastTs = 0; if (!rafId) rafId = requestAnimationFrame(tick); },
    resize() { resize(); if (!destroyed) onFrame(ctx, w, h, 0); },
    destroy() { destroyed = true; paused = true; if (rafId) { cancelAnimationFrame(rafId); rafId = 0; } ro?.disconnect(); stageEl.innerHTML = ''; },
  };
}

function drawObsidianBg(ctx, w, h, rgb, alpha) {
  const bg = ctx.createRadialGradient(w * 0.5, h * 0.4, 20, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
  bg.addColorStop(0, '#121e36'); bg.addColorStop(0.65, '#0a1120'); bg.addColorStop(1, '#060a14');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.96, 10, w * 0.5, h * 0.72, Math.max(w, h) * 0.72);
  g.addColorStop(0, `rgba(${rgb},${alpha.toFixed(3)})`); g.addColorStop(0.55, `rgba(${rgb},${(alpha * 0.32).toFixed(3)})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

function drawRaceHeader(ctx, w, padX, topY, headH, banH, temp, th, u, meltedN, total, milestone) {
  const tempInt = Math.round(temp);
  fillBox(ctx, padX, topY, w - padX * 2, headH, 12, 'rgba(15,23,42,0.84)', `rgba(${th.rgb},0.48)`, 1.4);
  ctx.fillStyle = th.fg; ctx.font = '800 22px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`${tempInt > 0 ? '+' : ''}${tempInt} °C`, padX + 16, topY + headH * 0.5);
  const tagX = padX + 148, countX = w - padX - 16;
  fillBox(ctx, tagX, topY + 13, 64, 22, 999, `rgba(${th.rgb},0.22)`);
  ctx.fillStyle = th.fg; ctx.font = '700 10.5px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(th.label, tagX + 32, topY + 24.5);
  ctx.fillStyle = '#cbd5e1'; ctx.font = '700 12px ui-monospace, monospace'; ctx.textAlign = 'right';
  ctx.fillText(`${meltedN}/${total} 已熔`, countX, topY + headH * 0.5);
  const barX = tagX + 76, barW = Math.max(90, countX - 78 - barX), barY = topY + headH * 0.5 - 4.5;
  fillBox(ctx, barX, barY, barW, 9, 999, 'rgba(2,6,23,0.72)');
  const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  grad.addColorStop(0, '#38bdf8'); grad.addColorStop(0.28, '#22d3ee'); grad.addColorStop(0.55, '#f97316'); grad.addColorStop(0.8, '#ef4444'); grad.addColorStop(1, '#fef08a');
  fillBox(ctx, barX, barY, Math.max(8, barW * u), 9, 999, grad);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(barX + clamp(barW * u, 4, barW - 4), barY + 4.5, 4.2, 0, Math.PI * 2); ctx.fill();
  const banY = topY + headH + 7;
  fillBox(ctx, padX, banY, w - padX * 2, banH, 999,
    milestone.pulse > 0.05 ? `rgba(${th.rgb},${(0.14 + milestone.pulse * 0.16).toFixed(2)})` : 'rgba(15,23,42,0.58)',
    milestone.pulse > 0.05 ? milestone.col : 'rgba(148,163,184,0.18)', 1);
  ctx.fillStyle = milestone.col; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(milestone.text, w * 0.5, banY + banH * 0.5 + 0.5);
  return banY + banH + 9;
}

function mountRaceView(spec, stageEl, actionbarEl, onCaption) {
  const raw = Array.isArray(spec?.substances) && spec.substances.length >= 2 ? spec.substances.slice(0, 16) : DEFAULT_RACE;
  const side = raw.length <= 6 ? 4 : 3;
  const items = raw.map((s) => {
    const mpC = Number.isFinite(Number(s.mpC)) ? Number(s.mpC) : 800;
    const formula = s.formula || s.name || 'X';
    const pts = Array.from({ length: side * side }, (_, i) => {
      const gx = ((i % side) + 0.5) / side, gy = (Math.floor(i / side) + 0.5) / side;
      return { gx, gy, x: gx, y: gy, vx: (Math.random() - 0.5) * 0.95, vy: (Math.random() - 0.5) * 0.85, ph: Math.random() * Math.PI * 2 };
    });
    return { formula, name: s.name || formula, category: s.category || 'ionic', mpC, subl: Boolean(s.subl) || formula === 'CO₂', pts, melted: false, flash: 0, ripple: 0, heat: 0.1 };
  });

  const mps = items.map((i) => i.mpC);
  const minMp = Math.min(...mps), maxMp = Math.max(...mps);
  const minT = Array.isArray(spec?.tempRange) ? Number(spec.tempRange[0]) : (minMp < 100 ? -250 : Math.min(20, minMp - 80));
  const maxT = Array.isArray(spec?.tempRange) ? Number(spec.tempRange[1]) : Math.max(maxMp + 150, minT + 400);
  const split = minT < 0 && maxT > 1000;
  const uToTemp = (u) => {
    const x = clamp(u, 0, 1);
    if (!split) return minT + x * (maxT - minT);
    return x <= 0.36 ? minT + (x / 0.36) * (200 - minT) : 200 + ((x - 0.36) / 0.64) * (maxT - 200);
  };

  let u = 0, playing = false, speed = 1, tAccum = 0;
  let milestone = { text: '点击「开始加热」观察各类晶体依次突破熔点', col: '#7dd3fc', pulse: 0 };

  actionbarEl.innerHTML = `<div class="crystal-dock-group"><button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="play">开始加热</button><button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">重置</button></div><div class="crystal-dock-group crystal-seg" role="group" aria-label="加热倍率"><button type="button" class="crystal-seg-btn is-active" data-spd="1">1×</button><button type="button" class="crystal-seg-btn" data-spd="2">2×</button><button type="button" class="crystal-seg-btn" data-spd="4">4×</button></div><label class="crystal-dock-group" style="font-size:0.78rem;color:#cbd5e1;gap:0.4rem;"><input type="range" min="0" max="1000" step="1" value="0" data-act="slider" style="width:124px;accent-color:#fb923c;" /><strong data-stat="temp" style="font-family:ui-monospace,monospace;min-width:60px;color:#7dd3fc;">${Math.round(minT)} °C</strong></label>`;
  const btnPlay = actionbarEl.querySelector('[data-act="play"]'), btnReset = actionbarEl.querySelector('[data-act="reset"]');
  const spdBtns = actionbarEl.querySelectorAll('[data-spd]'), slider = actionbarEl.querySelector('[data-act="slider"]');
  const statTemp = actionbarEl.querySelector('[data-stat="temp"]');
  const syncPlay = () => { btnPlay.textContent = playing ? '暂停' : u >= 1 ? '重新加热' : '开始加热'; };

  function syncMelted(isScrub) {
    const temp = Math.round(uToTemp(u)), fresh = [];
    for (const it of items) {
      const now = temp >= it.mpC;
      if (now && !it.melted) { it.flash = 1; it.ripple = 1; fresh.push(it); }
      it.melted = now;
    }
    if (!isScrub && fresh.length) {
      fresh.sort((a, b) => a.mpC - b.mpC);
      const last = fresh[fresh.length - 1], meta = CAT[last.category] || CAT.ionic;
      milestone = { text: `里程碑 · ${last.formula}（${last.name}）于 ${last.mpC}°C ${last.subl ? '升华' : '熔化'}`, col: meta.col, pulse: 1 };
    }
    statTemp.textContent = `${temp} °C`; slider.value = String(Math.round(u * 1000));
  }
  const resetAll = () => {
    u = 0; playing = false;
    items.forEach((it) => { it.melted = false; it.flash = 0; it.ripple = 0; });
    milestone = { text: `${Math.round(minT)}°C 初始全固态 · 准备同步升温`, col: '#7dd3fc', pulse: 0 };
    syncMelted(true); syncPlay(); onCaption?.('');
  };

  btnPlay.addEventListener('click', () => { if (u >= 1) resetAll(); playing = !playing; syncPlay(); });
  btnReset.addEventListener('click', resetAll);
  spdBtns.forEach((b) => b.addEventListener('click', () => { speed = Number(b.dataset.spd); spdBtns.forEach((x) => x.classList.toggle('is-active', x === b)); }));
  slider.addEventListener('input', () => { playing = false; u = Number(slider.value) / 1000; syncMelted(true); syncPlay(); });
  resetAll();

  const [cols, rows] = gridOf(items.length);
  const loop = createCanvasLoop(stageEl, (ctx, w, h, dt) => {
    tAccum += dt;
    if (playing) {
      u = clamp(u + dt * 0.042 * speed, 0, 1); syncMelted(false);
      if (u >= 1) { playing = false; syncPlay(); milestone = { text: `${Math.round(maxT)}°C 加热终点 · 微粒间作用力越强熔点越高`, col: '#fef08a', pulse: 1 }; }
    }
    milestone.pulse = Math.max(0, milestone.pulse - dt * 1.4);

    const temp = uToTemp(u), th = regimeOf(temp);
    let meltedN = 0;
    for (const it of items) {
      if (it.melted) meltedN++;
      it.flash = Math.max(0, it.flash - dt * 1.5); it.ripple = Math.max(0, it.ripple - dt * 1.2);
      it.heat = clamp(1 - (it.mpC - temp) / 340, 0.1, 1);
      for (const pt of it.pts) {
        if (!it.melted) { pt.x += (pt.gx - pt.x) * Math.min(1, dt * 10); pt.y += (pt.gy - pt.y) * Math.min(1, dt * 10); }
        else if (it.subl) { pt.x = (pt.x + pt.vx * dt * 1.5 + 1) % 1; pt.y -= (0.48 + Math.abs(pt.vy) * 0.5) * dt; if (pt.y < 0.06) pt.y = 0.94; }
        else {
          pt.x += pt.vx * dt * 1.15; pt.y += (pt.vy * 0.72 + (0.76 - pt.y) * 1.65) * dt;
          if (pt.x < 0.08 || pt.x > 0.92) { pt.vx *= -1; pt.x = clamp(pt.x, 0.08, 0.92); }
          if (pt.y < 0.42 || pt.y > 0.92) { pt.vy *= -1; pt.y = clamp(pt.y, 0.42, 0.92); }
        }
      }
    }

    drawObsidianBg(ctx, w, h, th.rgb, 0.18 + u * 0.14);
    const padX = 18, botSafe = 18;
    const gridTop = drawRaceHeader(ctx, w, padX, 14, 48, 24, temp, th, u, meltedN, items.length, milestone);
    const gap = rows <= 2 ? 14 : 9, compact = rows >= 4;
    const cw = (w - padX * 2 - gap * (cols - 1)) / cols;
    const ch = Math.max(56, (h - botSafe - gridTop - gap * (rows - 1)) / rows);

    items.forEach((it, idx) => {
      const x = padX + (idx % cols) * (cw + gap), y = gridTop + Math.floor(idx / cols) * (ch + gap);
      const meta = CAT[it.category] || CAT.ionic, near = !it.melted && it.heat > 0.62;
      fillBox(ctx, x, y, cw, ch, 11, it.melted ? 'rgba(15,23,42,0.56)' : 'rgba(15,23,42,0.86)');
      if (near) fillBox(ctx, x + 1, y + 1, cw - 2, ch - 2, 10, `rgba(${th.rgb},${((it.heat - 0.62) * 0.44).toFixed(3)})`);
      else if (it.melted && !it.subl) {
        ctx.save(); ctx.globalAlpha = 0.22;
        const wy = Math.sin(tAccum * 4.2 + idx) * 2;
        fillBox(ctx, x + 2, y + ch * 0.54 + wy, cw - 4, ch * 0.44 - wy, 9, meta.col); ctx.restore();
      }
      if (it.ripple > 0.02) {
        ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, cw, ch, 11); ctx.clip();
        ctx.strokeStyle = `rgba(${th.rgb},${(it.ripple * 0.92).toFixed(2)})`; ctx.lineWidth = 2.6 * it.ripple + 0.8;
        ctx.beginPath(); ctx.arc(x + cw * 0.5, y + ch * 0.5, 10 + (1 - it.ripple) * Math.max(cw, ch) * 0.72, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
      fillBox(ctx, x, y, cw, ch, 11, null, it.flash > 0.05 ? th.fg : it.melted ? meta.col : near ? `rgba(${th.rgb},0.72)` : 'rgba(148,163,184,0.22)', it.flash > 0.05 ? 2.4 : near ? 1.6 : 1.1);

      ctx.fillStyle = meta.col; ctx.fillRect(x + 10, y + 1.5, cw - 20, 2.8);
      ctx.fillStyle = '#f8fafc'; ctx.font = `800 ${compact ? 13 : 16}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(it.formula, x + 10, y + 9);
      ctx.fillStyle = '#94a3b8'; ctx.font = `500 ${compact ? 10 : 11.5}px system-ui, sans-serif`;
      ctx.fillText(`${it.name} · ${meta.label}`, x + 10, y + (compact ? 25 : 30));
      ctx.textAlign = 'right'; ctx.fillStyle = it.melted ? meta.col : near ? th.fg : '#94a3b8';
      ctx.font = `700 ${compact ? 10.5 : 12}px ui-monospace, monospace`;
      ctx.fillText(it.melted ? (it.subl ? '已升华' : '已熔化') : `${it.mpC}°C`, x + cw - 10, y + 10);

      const px0 = compact ? x + cw * 0.46 : x + cw * 0.14, py0 = compact ? y + 24 : y + 52;
      const pw = compact ? Math.max(26, cw * 0.48) : cw * 0.72, ph = Math.max(20, y + ch - py0 - 8);
      const pr = clamp(Math.min(pw, ph) * (compact ? 0.11 : 0.09), 2.5, 5.2);
      ctx.fillStyle = it.flash > 0.15 ? th.fg : meta.col; ctx.globalAlpha = it.melted ? 0.85 : 1;
      for (const pt of it.pts) {
        const vib = it.melted ? 0 : Math.sin(tAccum * (16 + it.heat * 15) + pt.ph) * (1.2 + it.heat * 2.1);
        ctx.beginPath(); ctx.arc(px0 + pt.x * pw + vib, py0 + pt.y * ph + vib * 0.6, pr, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  });
  return { ...loop, destroy() { loop.destroy(); actionbarEl.innerHTML = ''; } };
}

function mountCurveView(spec, stageEl, actionbarEl, onCaption) {
  const s0 = spec?.substances?.[0] || { name: '海波', mpC: 48 }, s1 = spec?.substances?.[1] || { name: '石蜡', mpC: null };
  const n0 = s0.name || s0.formula || '海波', n1 = s1.name || s1.formula || '石蜡';
  const mp = Number.isFinite(Number(s0.mpC)) ? Number(s0.mpC) : 48;
  const tMin = Math.max(0, mp - 28), tMax = mp + 32, tSpan = tMax - tMin;
  const crysT = (p) => (p < 0.34 ? tMin + (p / 0.34) * (mp - tMin) : p < 0.72 ? mp : mp + ((p - 0.72) / 0.28) * (tMax - mp - 4));
  const amorT = (p) => tMin + p * (tSpan - 2) + Math.sin(p * Math.PI) * 3.2;

  let progress = 0, playing = true, tAccum = 0;
  actionbarEl.innerHTML = `<div class="crystal-dock-group"><button type="button" class="crystal-btn crystal-btn-primary crystal-btn-sm" data-act="play">暂停</button><button type="button" class="crystal-btn crystal-btn-ghost crystal-btn-sm" data-act="reset">重置</button></div><label class="crystal-dock-group" style="font-size:0.78rem;color:#cbd5e1;gap:0.4rem;"><span>加热进度</span><input type="range" min="0" max="100" value="0" data-act="slider" style="width:124px;accent-color:#38bdf8;" /><strong data-stat="pct" style="font-family:ui-monospace,monospace;min-width:36px;color:#7dd3fc;">0%</strong></label>`;
  const btnPlay = actionbarEl.querySelector('[data-act="play"]'), btnReset = actionbarEl.querySelector('[data-act="reset"]');
  const slider = actionbarEl.querySelector('[data-act="slider"]'), statPct = actionbarEl.querySelector('[data-stat="pct"]');

  function syncUi() {
    btnPlay.textContent = playing ? '暂停' : progress >= 1 ? '重新加热' : '开始加热';
    slider.value = String(Math.round(progress * 100)); statPct.textContent = `${Math.round(progress * 100)}%`;
    onCaption?.(progress < 0.34 ? `升温期 · ${n0}（晶体）与${n1}（非晶体）同步吸热升温` : progress < 0.72 ? `${mp}℃ 固定熔点平台 · ${n0}固液共存恒温吸热，${n1}持续升温软化` : `完全液化 · 晶体具有明确固定熔点（${mp}℃），非晶体无固定熔点`);
  }
  btnPlay.addEventListener('click', () => { if (progress >= 1) progress = 0; playing = !playing; syncUi(); });
  btnReset.addEventListener('click', () => { progress = 0; playing = true; syncUi(); });
  slider.addEventListener('input', () => { progress = Number(slider.value) / 100; playing = false; syncUi(); });
  syncUi();

  const loop = createCanvasLoop(stageEl, (ctx, w, h, dt) => {
    tAccum += dt;
    if (playing) { progress = clamp(progress + dt * 0.085, 0, 1); if (progress >= 1) playing = false; syncUi(); }
    const tc = crysT(progress), ta = amorT(progress);
    const cMelt = progress < 0.34 ? 0 : progress > 0.72 ? 1 : (progress - 0.34) / 0.38;
    const aMelt = clamp((progress - 0.14) / 0.72, 0, 1);

    drawObsidianBg(ctx, w, h, '56,189,248', 0.16);
    const pad = 18, botSafe = 48, gap = 14, innerH = h - pad - botSafe;
    const chartW = Math.floor((w - pad * 2 - gap) * 0.6), rightX = pad + chartW + gap, rightW = w - pad - rightX;

    fillBox(ctx, pad, pad, chartW, innerH, 14, 'rgba(15,23,42,0.84)', 'rgba(148,163,184,0.22)');
    const gx = pad + 52, gy = pad + 44, gw = chartW - 72, gh = innerH - 76;
    const yOf = (t) => gy + gh - ((t - (tMin - 5)) / (tSpan + 10)) * gh, yMp = yOf(mp);

    ctx.fillStyle = 'rgba(56,189,248,0.12)'; ctx.fillRect(gx + gw * 0.34, gy, gw * 0.38, gh);
    ctx.strokeStyle = 'rgba(56,189,248,0.52)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(gx, yMp); ctx.lineTo(gx + gw, yMp); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#7dd3fc'; ctx.font = '700 11px ui-monospace, monospace'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(`${mp}℃`, gx - 8, yMp);
    ctx.textAlign = 'center'; ctx.font = '700 11.5px system-ui, sans-serif';
    ctx.fillText(`${mp}℃ 固定熔点平台`, gx + gw * 0.53, gy + 15);
    ctx.strokeStyle = 'rgba(148,163,184,0.45)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();

    for (const [fn, col] of [[crysT, '#38bdf8'], [amorT, '#fb923c']]) {
      const steps = Math.max(2, Math.round(progress * 100));
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 10;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) { const t = i / 100; i === 0 ? ctx.moveTo(gx + t * gw, yOf(fn(t))) : ctx.lineTo(gx + t * gw, yOf(fn(t))); }
      ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(gx + progress * gw, yOf(fn(progress)), 4.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.textAlign = 'left'; ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillStyle = '#38bdf8'; ctx.fillText(`● ${n0}（晶体） ${tc.toFixed(1)}℃`, pad + 18, pad + 22);
    ctx.fillStyle = '#fb923c'; ctx.fillText(`● ${n1}（非晶体） ${ta.toFixed(1)}℃`, pad + Math.min(220, chartW * 0.52), pad + 22);
    ctx.fillStyle = '#94a3b8'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'right';
    ctx.fillText('加热时间 t →', gx + gw, gy + gh + 18);

    const chH = (innerH - gap) / 2;
    [[pad, `${n0}（晶体）`, tc, cMelt, true, '#38bdf8'], [pad + chH + gap, `${n1}（非晶体）`, ta, aMelt, false, '#fb923c']].forEach(([y, title, temp, melt, isC, col]) => {
      fillBox(ctx, rightX, y, rightW, chH, 14, 'rgba(15,23,42,0.84)', isC ? 'rgba(56,189,248,0.4)' : 'rgba(251,146,60,0.4)', 1.3);
      const phase = isC ? (melt <= 0.02 ? '固态有序晶格' : melt < 0.98 ? '固液共存坍解' : '液态自由流动') : (melt < 0.45 ? '无序逐步软化' : '粘稠无序流动');
      ctx.fillStyle = '#f8fafc'; ctx.font = '700 13px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(title, rightX + 14, y + 12);
      ctx.fillStyle = col; ctx.font = '700 12px ui-monospace, monospace'; ctx.textAlign = 'right';
      ctx.fillText(`${temp.toFixed(1)}℃`, rightX + rightW - 14, y + 12);
      ctx.fillStyle = '#94a3b8'; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(phase, rightX + 14, y + 31);
      const amp = 1.4 + progress * 4.2 + melt * 8.5;
      for (let i = 0; i < 18; i++) {
        const c = i % 6, r = Math.floor(i / 6), dis = isC ? melt : 0.65 + melt * 0.45;
        const bx = rightX + 26 + ((c + 0.5) / 6) * (rightW - 52), by = y + 54 + ((r + 0.5) / 3) * (chH - 68);
        const dx = (isC ? 0 : Math.sin(i * 8.3) * 10) + Math.sin(tAccum * 4.5 + i * 1.9) * amp * (0.4 + dis);
        const dy = (isC ? 0 : Math.cos(i * 6.1) * 7) + Math.cos(tAccum * 5.1 + i * 2.3) * amp * (0.4 + dis);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(bx + dx, by + dy, 5.2, 0, Math.PI * 2); ctx.fill();
      }
    });
  });
  return { ...loop, destroy() { loop.destroy(); actionbarEl.innerHTML = ''; } };
}

export function mountThermalStage(spec, stageEl, actionbarEl, { onCaption } = {}) {
  return spec?.view === 'curve' ? mountCurveView(spec, stageEl, actionbarEl, onCaption) : mountRaceView(spec, stageEl, actionbarEl, onCaption);
}
