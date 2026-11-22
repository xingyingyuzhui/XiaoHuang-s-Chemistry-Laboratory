/**
 * 晶体性质实验共享 Canvas 工具（暗棚高 DPI 循环、球体/卡片/缓动绘制）。
 */

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

export function easeInOutQuad(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function drawSphere(ctx, x, y, r, cLight, cMid, cDark, label) {
  const g = ctx.createRadialGradient(x - r * 0.34, y - r * 0.36, r * 0.1, x, y, r);
  g.addColorStop(0, cLight);
  if (cMid) g.addColorStop(0.55, cMid);
  g.addColorStop(1, cDark);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.stroke();

  if (label) {
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.max(10, Math.round(r * 0.8))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y + 0.5);
  }
}

export function drawPanelCard(ctx, x, y, pw, ph, title, subtitle, accent) {
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, y, pw, ph, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = accent;
  ctx.font = '700 15px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(title, x + 16, y + 14);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '500 12px system-ui, sans-serif';
  ctx.fillText(subtitle, x + 16, y + 36);
  ctx.restore();
}

export function drawStatusPill(ctx, x, y, w, text, bg, border, fg) {
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, 24, 999);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = fg;
  ctx.font = '700 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + 12);
}

export function mountCanvasLoop(stageEl, onFrame) {
  stageEl.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;';
  stageEl.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let w = 640;
  let h = 420;
  let paused = false;
  let destroyed = false;
  let rafId = 0;
  let lastTs = 0;

  function resize() {
    const rect = stageEl.getBoundingClientRect();
    w = Math.max(320, rect.width || 640);
    h = Math.max(280, rect.height || 420);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(stageEl);
  resize();

  function loop(ts) {
    if (destroyed || paused) {
      rafId = 0;
      return;
    }
    if (!lastTs) lastTs = ts;
    const dt = clamp((ts - lastTs) / 1000, 0, 0.05);
    lastTs = ts;
    onFrame(ctx, w, h, dt);
    if (!destroyed && !paused) rafId = requestAnimationFrame(loop);
  }
  rafId = requestAnimationFrame(loop);

  return {
    pause() {
      paused = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
    resume() {
      if (destroyed) return;
      paused = false;
      lastTs = 0;
      if (!rafId) rafId = requestAnimationFrame(loop);
    },
    resize() { resize(); if (!destroyed) onFrame(ctx, w, h, 0); },
    destroy() {
      destroyed = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      ro.disconnect();
      stageEl.innerHTML = '';
    },
  };
}
