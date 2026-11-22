/**
 * 模块 01 Demo 1 渲染器：立体 3D 水晶六棱柱、石英玻璃块体、微观 Si–O 网络与内联图例
 */

const LIGHT_KEY = [-0.46, -0.58, 0.67];
const LIGHT_HALF = [-0.25, -0.32, 0.91];

function project3D(pt, rotY, rotX, cx, cy, scale) {
  const cy1 = Math.cos(rotY);
  const sy1 = Math.sin(rotY);
  const x1 = pt[0] * cy1 - pt[2] * sy1;
  const z1 = pt[0] * sy1 + pt[2] * cy1;
  const cx1 = Math.cos(rotX);
  const sx1 = Math.sin(rotX);
  const y2 = pt[1] * cx1 - z1 * sx1;
  const z2 = pt[1] * sx1 + z1 * cx1;
  const persp = 4.4 / (4.4 - z2 * 0.44);
  return { x: cx + x1 * scale * persp, y: cy + y2 * scale * persp, z: z2, rx: x1, ry: y2, rz: z2 };
}

export function buildHexPrism() {
  const verts = [];
  const R = 0.72;
  const H = 0.72;
  const tipH = 1.24;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    verts.push([Math.cos(a) * R, -H, Math.sin(a) * R]);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    verts.push([Math.cos(a) * R, H, Math.sin(a) * R]);
  }
  verts.push([0, -tipH, 0], [0, tipH, 0]);
  const faces = [];
  for (let i = 0; i < 6; i++) {
    const n = (i + 1) % 6;
    faces.push([i, n, n + 6, i + 6], [12, n, i], [13, i + 6, n + 6]);
  }
  return { verts, faces };
}

function drawGroundShadow(ctx, cx, y, rx, ry, p) {
  const g = ctx.createRadialGradient(cx, y, rx * 0.08, cx, y, rx);
  g.addColorStop(0, p.isDark ? 'rgba(0, 0, 0, 0.42)' : 'rgba(15, 23, 42, 0.16)');
  g.addColorStop(0.65, p.isDark ? 'rgba(0, 0, 0, 0.16)' : 'rgba(15, 23, 42, 0.06)');
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.translate(cx, y);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function faceNormalOutward(pts) {
  const [a, b, c] = pts;
  const ux = b.rx - a.rx, uy = b.ry - a.ry, uz = b.rz - a.rz;
  const vx = c.rx - a.rx, vy = c.ry - a.ry, vz = c.rz - a.rz;
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  nx /= len; ny /= len; nz /= len;
  const cx = pts.reduce((s, t) => s + t.rx, 0) / pts.length;
  const cy = pts.reduce((s, t) => s + t.ry, 0) / pts.length;
  const cz = pts.reduce((s, t) => s + t.rz, 0) / pts.length;
  if (nx * cx + ny * cy + nz * cz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  return { nx, ny, nz };
}

export function drawQuartzPrism(ctx, cx, cy, scale, rotY, rotX, prism, p) {
  drawGroundShadow(ctx, cx, cy + scale * 1.36, scale * 1.05, scale * 0.21, p);
  const proj = prism.verts.map((v) => project3D(v, rotY, rotX, cx, cy, scale));
  const items = prism.faces.map((f) => {
    const pts = f.map((vi) => proj[vi]);
    const zAvg = pts.reduce((s, t) => s + t.z, 0) / pts.length;
    return { pts, zAvg, ...faceNormalOutward(pts) };
  }).sort((a, b) => a.zAvg - b.zAvg);

  for (const { pts, nx, ny, nz } of items) {
    const isFront = nz >= -0.05;
    const diff = Math.max(0, nx * LIGHT_KEY[0] + ny * LIGHT_KEY[1] + nz * LIGHT_KEY[2]);
    const spec = Math.pow(Math.max(0, nx * LIGHT_HALF[0] + ny * LIGHT_HALF[1] + nz * LIGHT_HALF[2]), 10);

    let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
    for (const pt of pts) {
      if (pt.x < minX) minX = pt.x;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.y > maxY) maxY = pt.y;
    }

    ctx.beginPath();
    pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
    ctx.closePath();

    const grad = ctx.createLinearGradient(minX, minY, maxX, maxY);
    if (!isFront) {
      grad.addColorStop(0, p.isDark ? 'rgba(14, 116, 144, 0.20)' : 'rgba(2, 132, 199, 0.14)');
      grad.addColorStop(1, p.isDark ? 'rgba(8, 47, 73, 0.28)' : 'rgba(12, 74, 110, 0.22)');
    } else if (p.isDark) {
      grad.addColorStop(0, `rgba(${Math.round(140 + spec * 115)}, ${Math.round(224 + spec * 31)}, 254, ${(0.34 + diff * 0.42 + spec * 0.22).toFixed(2)})`);
      grad.addColorStop(1, `rgba(14, 165, 233, ${(0.24 + diff * 0.24).toFixed(2)})`);
    } else {
      grad.addColorStop(0, `rgba(${Math.round(115 + diff * 110)}, ${Math.round(200 + diff * 45 + spec * 10)}, 254, ${(0.48 + diff * 0.34).toFixed(2)})`);
      grad.addColorStop(1, `rgba(2, 132, 199, ${(0.32 + diff * 0.22).toFixed(2)})`);
    }
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = isFront
      ? (p.isDark ? `rgba(224, 242, 254, ${(0.52 + spec * 0.45).toFixed(2)})` : `rgba(3, 105, 161, ${(0.52 + diff * 0.32).toFixed(2)})`)
      : (p.isDark ? 'rgba(125, 211, 252, 0.22)' : 'rgba(2, 132, 199, 0.20)');
    ctx.lineWidth = isFront ? 1.55 : 0.9;
    ctx.lineJoin = 'round';
    ctx.stroke();

    if (isFront && spec > 0.38) {
      ctx.save();
      ctx.clip();
      const sx = (minX + maxX) * 0.5;
      const sy = minY + (maxY - minY) * 0.32;
      const hl = ctx.createRadialGradient(sx, sy, 1, sx, sy, Math.max(16, scale * 0.55));
      hl.addColorStop(0, `rgba(255, 255, 255, ${(spec * (p.isDark ? 0.55 : 0.72)).toFixed(2)})`);
      hl.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = hl;
      ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
      ctx.restore();
    }
  }
}

function traceSmoothClosed(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  ctx.moveTo((pts[n - 1][0] + pts[0][0]) * 0.5, (pts[n - 1][1] + pts[0][1]) * 0.5);
  for (let i = 0; i < n; i++) {
    const cur = pts[i];
    const nxt = pts[(i + 1) % n];
    ctx.quadraticCurveTo(cur[0], cur[1], (cur[0] + nxt[0]) * 0.5, (cur[1] + nxt[1]) * 0.5);
  }
  ctx.closePath();
}

export function drawGlassLump(ctx, cx, cy, scale, rotY, rotX, p) {
  drawGroundShadow(ctx, cx, cy + scale * 1.18, scale * 1.12, scale * 0.22, p);
  ctx.save();
  ctx.translate(cx, cy + scale * 0.04);

  const pts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const w = 1 + 0.15 * Math.sin(a * 2 + rotY * 0.75) + 0.11 * Math.cos(a * 3 - rotY * 0.55 + rotX * 0.4) + 0.06 * Math.sin(a * 5 + 0.9);
    pts.push([Math.cos(a) * scale * 0.96 * w, Math.sin(a) * scale * 0.80 * w]);
  }

  traceSmoothClosed(ctx, pts);
  const g = ctx.createRadialGradient(-scale * 0.30, -scale * 0.32, scale * 0.06, scale * 0.06, scale * 0.08, scale * 1.18);
  if (p.isDark) {
    g.addColorStop(0, 'rgba(254, 243, 199, 0.86)');
    g.addColorStop(0.38, 'rgba(251, 191, 36, 0.52)');
    g.addColorStop(0.78, 'rgba(217, 119, 6, 0.34)');
    g.addColorStop(1, 'rgba(120, 53, 15, 0.45)');
  } else {
    g.addColorStop(0, 'rgba(255, 251, 235, 0.95)');
    g.addColorStop(0.36, 'rgba(253, 212, 108, 0.74)');
    g.addColorStop(0.76, 'rgba(217, 119, 6, 0.48)');
    g.addColorStop(1, 'rgba(146, 64, 14, 0.56)');
  }
  ctx.fillStyle = g;
  ctx.fill();

  ctx.save();
  ctx.clip();
  const caustic = ctx.createRadialGradient(scale * 0.28, scale * 0.26, scale * 0.04, scale * 0.24, scale * 0.22, scale * 0.72);
  caustic.addColorStop(0, p.isDark ? 'rgba(254, 240, 138, 0.36)' : 'rgba(255, 247, 214, 0.62)');
  caustic.addColorStop(1, 'rgba(251, 191, 36, 0)');
  ctx.fillStyle = caustic;
  ctx.fillRect(-scale * 1.3, -scale * 1.1, scale * 2.6, scale * 2.2);

  ctx.beginPath();
  ctx.ellipse(-scale * 0.30, -scale * 0.28, scale * 0.34, scale * 0.14, -0.52, 0, Math.PI * 2);
  ctx.fillStyle = p.isDark ? 'rgba(255, 255, 255, 0.34)' : 'rgba(255, 255, 255, 0.68)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-scale * 0.48, -scale * 0.06, scale * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = p.isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.56)';
  ctx.fill();
  ctx.restore();

  traceSmoothClosed(ctx, pts);
  ctx.strokeStyle = p.isDark ? 'rgba(253, 224, 71, 0.78)' : 'rgba(180, 83, 9, 0.74)';
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.restore();
}

export function buildMicroNetworks() {
  const ordered = { si: [], o: [], bonds: [] };
  const s = 34;
  const dx = s * 1.732;
  const dy = s * 1.5;
  for (let row = -2; row <= 2; row++) {
    for (let col = -2; col <= 2; col++) {
      const ox = col * dx + (row % 2 !== 0 ? dx * 0.5 : 0);
      const oy = row * dy;
      ordered.si.push([ox, oy - s * 0.5], [ox + dx * 0.5, oy]);
    }
  }
  for (let i = 0; i < ordered.si.length; i++) {
    for (let j = i + 1; j < ordered.si.length; j++) {
      const [p1, p2] = [ordered.si[i], ordered.si[j]];
      const dist = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
      if (dist > 4 && dist < s * 1.35) {
        ordered.bonds.push([i, j]);
        ordered.o.push([(p1[0] + p2[0]) * 0.5, (p1[1] + p2[1]) * 0.5]);
      }
    }
  }

  const disordered = { si: [], o: [], bonds: [] };
  ordered.si.forEach((pt, idx) => {
    disordered.si.push([pt[0] + Math.sin(idx * 12.9898) * 14.5, pt[1] + Math.cos(idx * 78.233) * 14.5]);
  });
  ordered.bonds.forEach(([i, j], idx) => {
    if (idx % 7 === 0) return;
    const [p1, p2] = [disordered.si[i], disordered.si[j]];
    const mx = (p1[0] + p2[0]) * 0.5 - (p2[1] - p1[1]) * 0.08 + Math.sin(idx * 4.3) * 2.8;
    const my = (p1[1] + p2[1]) * 0.5 + (p2[0] - p1[0]) * 0.08;
    disordered.bonds.push([i, j, mx, my]);
    disordered.o.push([mx, my]);
  });
  return { ordered, disordered };
}

export function drawMicroNetwork(ctx, cx, cy, radius, net, isDisordered, alpha, p) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = p.inset;
  ctx.fill();
  ctx.clip();

  ctx.strokeStyle = isDisordered
    ? (p.isDark ? 'rgba(251, 191, 36, 0.55)' : 'rgba(180, 83, 9, 0.48)')
    : (p.isDark ? 'rgba(125, 211, 252, 0.68)' : 'rgba(2, 132, 199, 0.56)');
  ctx.lineWidth = 2.1;
  for (const b of net.bonds) {
    const [p1, p2] = [net.si[b[0]], net.si[b[1]]];
    ctx.beginPath();
    ctx.moveTo(cx + p1[0], cy + p1[1]);
    if (b.length === 4) ctx.quadraticCurveTo(cx + b[2], cy + b[3], cx + p2[0], cy + p2[1]);
    else ctx.lineTo(cx + p2[0], cy + p2[1]);
    ctx.stroke();
  }
  for (const o of net.o) {
    ctx.beginPath();
    ctx.arc(cx + o[0], cy + o[1], 4.2, 0, Math.PI * 2);
    ctx.fillStyle = p.covalent;
    ctx.fill();
  }
  for (const si of net.si) {
    ctx.beginPath();
    ctx.arc(cx + si[0], cy + si[1], 6.4, 0, Math.PI * 2);
    ctx.fillStyle = p.crystal;
    ctx.fill();
    ctx.strokeStyle = p.isDark ? '#ffffff' : p.bg;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = isDisordered ? p.amorphous : p.crystal;
  ctx.lineWidth = 2.4;
  ctx.stroke();
  ctx.restore();
}

export function drawMicroLegend(ctx, midX, y, alpha, p) {
  if (alpha <= 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const items = [
    { label: 'Si 原子', color: p.crystal, r: 5 },
    { label: 'O 原子', color: p.covalent, r: 4 },
  ];
  const gap = 22;
  const widths = items.map((it) => it.r * 2 + 6 + ctx.measureText(it.label).width);
  let x = midX - (widths[0] + widths[1] + gap) * 0.5;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    ctx.beginPath();
    ctx.arc(x + it.r, y, it.r, 0, Math.PI * 2);
    ctx.fillStyle = it.color;
    ctx.fill();
    ctx.fillStyle = p.muted;
    ctx.fillText(it.label, x + it.r * 2 + 6, y + 0.5);
    x += widths[i] + gap;
  }
  ctx.restore();
}
