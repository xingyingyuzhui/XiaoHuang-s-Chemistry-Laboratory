/**
 * 反应原子动画舞台（Canvas 2D），叠在 3D 舞台之上。
 * 画面由 reaction-plan.frameAt(plan, t) 决定，可随进度条任意拖动；
 * 舞台自己的 rAF 只负责「呼吸感」（断键时抖动、产物轻浮动、火花），按墙钟走。
 *
 * 各主题画风：
 *   default / reagent  立体小球（径向渐变）
 *   stationery         平涂 + 墨线描边（教材插图）
 *   blackboard         粉笔描边、半透明填充
 *   pixel              方块原子、硬边
 */
import { frameAt } from './reaction-plan.js';

const CPK = {
  H: '#f2f2f2',
  C: '#3d4048',
  O: '#e5483a',
  N: '#3f6fe0',
  Cl: '#38b54a',
  Br: '#a3341e',
  S: '#e6c13a',
  F: '#8fd14f',
  I: '#7b3fa0',
};
const CHALK = {
  H: '#f4f1e6',
  C: '#c9d1c8',
  O: '#ff9a8a',
  N: '#9fbcff',
  Cl: '#a8f0a0',
  Br: '#e8a27a',
  S: '#ffe08a',
};
const SUB = '₀₁₂₃₄₅₆₇₈₉';
const subscript = (f) => String(f).replace(/\d/g, (d) => SUB[Number(d)]);

function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

function token(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** 浅色还是深色：决定原子上字的颜色 */
function isDark(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l < 140;
}

export function createAtomStage(host) {
  const canvas = document.createElement('canvas');
  canvas.className = 'rxn-atom-stage';
  canvas.setAttribute('aria-hidden', 'true');
  host.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let plan = null;
  let getTime = () => 0;
  let raf = 0;
  let running = false;
  let theme = {};
  const sparks = [];
  let lastPhase = '';

  function readTheme() {
    const id = document.documentElement.getAttribute('data-theme') || 'default';
    theme = {
      id,
      bg: token('--stage-3d-bg', '#ffffff'),
      ink: token('--ink', '#1e293b'),
      muted: token('--text-muted', '#64748b'),
      ok: token('--ok', '#16a34a'),
      bad: token('--bad', '#dc2626'),
      stamp: token('--stamp', '#3b82f6'),
      mono: token('--font-mono', 'monospace'),
      main: token('--font-main', 'sans-serif'),
    };
  }

  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function atomColor(el) {
    if (theme.id === 'blackboard') return CHALK[el] || '#e8c8f0';
    return CPK[el] || '#b06cc4';
  }

  function drawAtom(x, y, r, el, alpha) {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    const col = atomColor(el);
    const id = theme.id;
    if (id === 'pixel') {
      const s = Math.round(r * 1.7);
      const px = Math.round(x - s / 2);
      const py = Math.round(y - s / 2);
      ctx.fillStyle = '#2d3436';
      ctx.fillRect(px + 3, py + 3, s, s);
      ctx.fillStyle = col;
      ctx.fillRect(px, py, s, s);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#2d3436';
      ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);
    } else if (id === 'blackboard') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = col + '30';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = col;
      ctx.stroke();
    } else if (id === 'stationery') {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = theme.ink;
      ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, col);
      g.addColorStop(1, shade(col, -0.35));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      if (el === 'H') {
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.stroke();
      }
    }
    // 元素符号
    const fs = Math.max(10, Math.round(r * (el.length > 1 ? 0.8 : 0.95)));
    ctx.font = `800 ${fs}px ${theme.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.id === 'blackboard' ? col : isDark(col) ? '#ffffff' : '#1e293b';
    ctx.fillText(el, x, y + 1);
    ctx.globalAlpha = 1;
  }

  function line(ax, ay, bx, by, off, width, color, alpha) {
    if (alpha <= 0.01) return;
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * off;
    const ny = (dx / L) * off;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = theme.id === 'pixel' ? 'butt' : 'round';
    if (theme.id === 'blackboard') ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(ax + nx, ay + ny);
    ctx.lineTo(bx + nx, by + ny);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function bondColor() {
    if (theme.id === 'blackboard') return '#d8e2d6';
    if (theme.id === 'pixel') return '#2d3436';
    if (theme.id === 'stationery') return theme.ink;
    return '#8a93a6';
  }

  function drawBond(A, B, b, unit) {
    const w = Math.max(3, unit * 0.11);
    const gap = w * 1.6;
    const base = bondColor();
    const alpha = b.alpha * Math.min(A.alpha, B.alpha);
    // 高亮：断键红、成键绿（外发光）
    if (b.flash > 0.02) {
      const col = b.fate === 'form' || (b.fate === 'keep' && !b.shrink) ? theme.ok : theme.bad;
      ctx.save();
      if (theme.id !== 'pixel') {
        ctx.shadowColor = col;
        ctx.shadowBlur = 14 * b.flash;
      }
      line(A.x, A.y, B.x, B.y, 0, w + 6 * b.flash, col, 0.55 * b.flash);
      ctx.restore();
    }
    const n = b.lines;
    for (let k = 0; k < n; k++) {
      const off = (k - (n - 1) / 2) * gap;
      // 键级变化：保留的那几根常亮，多出来的按 extraAlpha 淡入淡出
      const isExtra = b.fate === 'keep' && k >= b.keepLines;
      const a = isExtra ? b.extraAlpha * Math.min(A.alpha, B.alpha) : alpha;
      const col = b.flash > 0.3 && (b.fate !== 'keep' || isExtra) ? (b.fate === 'form' || !b.shrink ? theme.ok : theme.bad) : base;
      line(A.x, A.y, B.x, B.y, off, w, col, a);
    }
  }

  function drawLabel(text, x, y, alpha, coef) {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    ctx.font = `700 15px ${theme.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = theme.id === 'blackboard' ? '#e8eee6' : theme.ink;
    ctx.fillText(`${coef > 1 ? coef : ''}${subscript(text)}`, x, y);
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    raf = 0;
    if (!running || !plan) return;
    const t = getTime();
    const f = frameAt(plan, t);
    const r = canvas.getBoundingClientRect();
    const W = r.width;
    const H = r.height;
    ctx.clearRect(0, 0, W, H);

    const b = plan.bounds;
    const unit = Math.min((W - 40) / (b.maxX - b.minX), (H - 40) / (b.maxY - b.minY), 92);
    const ox = W / 2 - ((b.minX + b.maxX) / 2) * unit;
    const oy = H / 2 - ((b.minY + b.maxY) / 2) * unit;
    const calm = prefersReducedMotion();
    const wall = now / 1000;

    // 断键阶段原子轻微抖动；产物阶段轻浮动（减少动态效果时都关掉）
    const pts = f.atoms.map((a, i) => {
      let jx = 0;
      let jy = 0;
      if (!calm) {
        if (f.jitter > 0) {
          jx = Math.sin(wall * 38 + i * 1.7) * f.jitter * unit * 0.05;
          jy = Math.cos(wall * 33 + i * 2.3) * f.jitter * unit * 0.05;
        } else if (f.phase === 'product') {
          jy = Math.sin(wall * 2 + (plan.nodes[i].pMol || 0)) * unit * 0.03;
        }
      }
      let x = ox + a.x * unit + jx;
      let y = oy + a.y * unit + jy;
      if (theme.id === 'pixel') {
        x = Math.round(x / 4) * 4;
        y = Math.round(y / 4) * 4;
      }
      return { x, y, alpha: a.alpha, el: a.el };
    });

    // 箭头
    const ax = ox + plan.arrowX * unit;
    const ay = oy;
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = theme.id === 'blackboard' ? '#e8eee6' : theme.muted;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax - unit * 0.55, ay);
    ctx.lineTo(ax + unit * 0.45, ay);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax + unit * 0.6, ay);
    ctx.lineTo(ax + unit * 0.38, ay - unit * 0.14);
    ctx.lineTo(ax + unit * 0.38, ay + unit * 0.14);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;

    f.bonds.forEach((bd) => drawBond(pts[bd.a], pts[bd.b], bd, unit));

    // 火花：进入断键阶段时从断开的键中点迸出
    if (f.phase === 'break' && lastPhase !== 'break' && !calm) {
      f.bonds.forEach((bd) => {
        if (bd.fate !== 'break' && !bd.shrink) return;
        const mx = (pts[bd.a].x + pts[bd.b].x) / 2;
        const my = (pts[bd.a].y + pts[bd.b].y) / 2;
        for (let k = 0; k < 7; k++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 40 + Math.random() * 90;
          sparks.push({ x: mx, y: my, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 0.6 + Math.random() * 0.4, born: wall });
        }
      });
    }
    lastPhase = f.phase;
    for (let k = sparks.length - 1; k >= 0; k--) {
      const s = sparks[k];
      const age = wall - s.born;
      if (age > s.life) {
        sparks.splice(k, 1);
        continue;
      }
      const u = age / s.life;
      ctx.globalAlpha = 1 - u;
      ctx.fillStyle = theme.id === 'blackboard' ? '#ffd166' : theme.id === 'pixel' ? theme.bad : '#ffb02e';
      const sz = theme.id === 'pixel' ? 4 : 3;
      ctx.fillRect(s.x + s.vx * age - sz / 2, s.y + s.vy * age + 60 * age * age - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;

    const R = (el) => unit * (el === 'H' ? 0.24 : 0.36);
    // 先画氢再画重原子，重原子压在上面
    pts.forEach((p) => p.el === 'H' && drawAtom(p.x, p.y, R(p.el), p.el, p.alpha));
    pts.forEach((p) => p.el !== 'H' && drawAtom(p.x, p.y, R(p.el), p.el, p.alpha));

    plan.labels.left.forEach((l) => drawLabel(l.formula, ox + l.x * unit, oy + l.y * unit, f.labelAlpha.left, l.coef));
    plan.labels.right.forEach((l) => drawLabel(l.formula, ox + l.x * unit, oy + l.y * unit, f.labelAlpha.right, l.coef));

    raf = requestAnimationFrame(frame);
  }

  return {
    /** @param {object} p 计划；@param {() => number} timeFn 当前播放秒数 */
    start(p, timeFn) {
      plan = p;
      getTime = timeFn;
      sparks.length = 0;
      lastPhase = '';
      // 先显示再量尺寸：display:none 时量到的是 0
      canvas.classList.add('is-on');
      readTheme();
      resize();
      running = true;
      if (!raf) raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      plan = null;
      cancelAnimationFrame(raf);
      raf = 0;
      canvas.classList.remove('is-on');
    },
    /** 主题切换 / 尺寸变化后调用 */
    refresh() {
      readTheme();
      resize();
    },
    get active() {
      return running;
    },
  };
}

function shade(hex, amt) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c : 255 - c) * amt)));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
