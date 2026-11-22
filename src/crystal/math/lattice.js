/**
 * 纯数学晶格与晶胞几何引擎（零 DOM / Three.js 依赖）
 * - 分数坐标 -> 笛卡尔坐标（Y-up 约定，兼容立方/四方/正交/六方 120°）
 * - 晶胞 8 顶点 12 棱、6 个内向裁剪平面与均摊法统计
 * - 周期边界展开、化学键推断、超晶胞偏移、镁正六棱柱与理论密度
 */

const NA = 6.02214076e23;
const DEG2RAD = Math.PI / 180;
const SITE_EPS = 1e-4;

const CORNER_FRACS = [
  [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
  [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
];

const CELL_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

const CUBIC_OFFSETS = [
  [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
  [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
];

// 前 3 个六方晶胞绕共享 120° 轴 (0,0) 恰好完整包络 17 原子正六棱柱
const HEX_OFFSETS = [
  [0, 0, 0], [-1, 0, 0], [-1, -1, 0], [0, -1, 0],
  [0, 0, 1], [-1, 0, 1], [-1, -1, 1], [0, -1, 1],
];

const HEX_RING_UV = [[1, 0], [1, 1], [0, 1], [-1, 0], [-1, -1], [0, -1]];

function cosDeg(deg) {
  if (Math.abs(deg - 90) < 1e-6) return 0;
  if (Math.abs(deg - 120) < 1e-6) return -0.5;
  if (Math.abs(deg - 60) < 1e-6) return 0.5;
  return Math.cos(deg * DEG2RAD);
}

function sinDeg(deg) {
  if (Math.abs(deg - 90) < 1e-6) return 1;
  if (Math.abs(deg - 120) < 1e-6 || Math.abs(deg - 60) < 1e-6) return Math.sqrt(3) / 2;
  return Math.sin(deg * DEG2RAD);
}

function getLatticeDims(lattice) {
  const a = Number(lattice?.a) || 1;
  const b = Number(lattice?.b) || a;
  const c = Number(lattice?.c) || a;
  const alpha = Number.isFinite(lattice?.alpha) ? lattice.alpha : 90;
  const beta = Number.isFinite(lattice?.beta) ? lattice.beta : 90;
  const gamma = Number.isFinite(lattice?.gamma) ? lattice.gamma : 90;
  return { a, b, c, alpha, beta, gamma, maxLen: Math.max(a, b, c) || 1 };
}

const cross = (p, q) => [
  p[1] * q[2] - p[2] * q[1],
  p[2] * q[0] - p[0] * q[2],
  p[0] * q[1] - p[1] * q[0],
];
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const normalize = (v) => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
};
const snapFloat = (val) => (Math.abs(val - Math.round(val)) < 1e-9 ? Math.round(val) : val);

/**
 * 将约化基元（[0, 1)^3 内）按周期边界展开到闭区间 [0, 1]^3
 */
export function expandPeriodic(basis, eps = 1e-6) {
  const seen = new Set();
  const out = [];
  const norm = (val) => {
    const t = val - Math.floor(val);
    return Math.abs(t) < eps || Math.abs(t - 1) < eps ? 0 : t;
  };

  for (const item of basis || []) {
    const u0 = norm(item.u);
    const v0 = norm(item.v);
    const w0 = norm(item.w);
    for (const u of u0 === 0 ? [0, 1] : [u0]) {
      for (const v of v0 === 0 ? [0, 1] : [v0]) {
        for (const w of w0 === 0 ? [0, 1] : [w0]) {
          const key = `${item.species}|${Math.round(u * 1e5)}|${Math.round(v * 1e5)}|${Math.round(w * 1e5)}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({ species: item.species, u, v, w });
        }
      }
    }
  }
  return out;
}

/**
 * 分数坐标转居中笛卡尔坐标（Y-up：x = u*a + v*b*cos(γ), y = w*c, z = v*b*sin(γ)）
 */
export function fracToCartesian(u, v, w, lattice, scale = 2.4) {
  const { a, b, c, gamma, maxLen } = getLatticeDims(lattice);
  const k = scale / maxLen;
  const du = u - 0.5;
  const dv = v - 0.5;
  const dw = w - 0.5;
  return {
    x: (du * a + dv * b * cosDeg(gamma)) * k,
    y: dw * c * k,
    z: dv * b * sinDeg(gamma) * k,
  };
}

/**
 * 获取晶胞 8 个顶点坐标与 12 条棱索引
 */
export function getCellCorners(lattice, scale = 2.4) {
  return {
    vertices: CORNER_FRACS.map(([u, v, w]) => fracToCartesian(u, v, w, lattice, scale)),
    edges: CELL_EDGES.map(([i, j]) => [i, j]),
  };
}

/**
 * 获取 6 个指向晶胞内部的裁剪平面：n·p + constant >= 0 表示位于晶胞内部
 */
export function getCellClipPlanes(lattice, scale = 2.4) {
  const o = fracToCartesian(0, 0, 0, lattice, scale);
  const pa = fracToCartesian(1, 0, 0, lattice, scale);
  const pb = fracToCartesian(0, 1, 0, lattice, scale);
  const pc = fracToCartesian(0, 0, 1, lattice, scale);
  const far = fracToCartesian(1, 1, 1, lattice, scale);

  const origin = [o.x, o.y, o.z];
  const farPt = [far.x, far.y, far.z];
  const va = [pa.x - o.x, pa.y - o.y, pa.z - o.z];
  const vb = [pb.x - o.x, pb.y - o.y, pb.z - o.z];
  const vc = [pc.x - o.x, pc.y - o.y, pc.z - o.z];

  const makePair = (e1, e2, inward) => {
    let n = normalize(cross(e1, e2));
    if (dot(n, inward) < 0) n = [-n[0], -n[1], -n[2]];
    const negN = [-n[0], -n[1], -n[2]];
    return [
      { normal: n, constant: -dot(n, origin) },
      { normal: negN, constant: -dot(negN, farPt) },
    ];
  };

  return [...makePair(vb, vc, va), ...makePair(vc, va, vb), ...makePair(va, vb, vc)];
}

/**
 * 按晶胞均摊法判定粒子位置与权重
 */
export function classifySite(u, v, w, system = 'cubic') {
  const u0 = Math.abs(u) < SITE_EPS;
  const u1 = Math.abs(u - 1) < SITE_EPS;
  const v0 = Math.abs(v) < SITE_EPS;
  const v1 = Math.abs(v - 1) < SITE_EPS;
  const uOn = u0 || u1;
  const vOn = v0 || v1;
  const wOn = Math.abs(w) < SITE_EPS || Math.abs(w - 1) < SITE_EPS;
  const count = (uOn ? 1 : 0) + (vOn ? 1 : 0) + (wOn ? 1 : 0);

  if (count === 0) return { site: 'interior', weight: 1, fractionLabel: '1' };
  if (count === 1) return { site: 'face', weight: 0.5, fractionLabel: '1/2' };

  if (system === 'hexagonal') {
    const isObtuse120 = (u0 && v0) || (u1 && v1);
    if (count === 3) {
      return isObtuse120
        ? { site: 'vertex', weight: 1 / 6, fractionLabel: '1/6' }
        : { site: 'vertex', weight: 1 / 12, fractionLabel: '1/12' };
    }
    if (uOn && vOn) {
      return isObtuse120
        ? { site: 'edge', weight: 1 / 3, fractionLabel: '1/3' }
        : { site: 'edge', weight: 1 / 6, fractionLabel: '1/6' };
    }
    return { site: 'edge', weight: 0.25, fractionLabel: '1/4' };
  }

  return count === 3
    ? { site: 'vertex', weight: 0.125, fractionLabel: '1/8' }
    : { site: 'edge', weight: 0.25, fractionLabel: '1/4' };
}

/**
 * 统计整颗晶胞中各粒子的均摊法明细与总数
 */
export function computeAveragingBreakdown(crystal) {
  const bySpecies = {};
  const initStat = (expected = 0) => ({
    vertex: 0, edge: 0, face: 0, interior: 0, total: 0, expected, items: [],
  });

  for (const sp of crystal?.species || []) {
    bySpecies[sp.id] = initStat(sp.countPerCell ?? 0);
  }

  const system = crystal?.system || 'cubic';
  const atoms = crystal?.atoms || [];
  for (let i = 0; i < atoms.length; i++) {
    const a = atoms[i];
    if (!bySpecies[a.species]) bySpecies[a.species] = initStat(0);
    const info = classifySite(a.u, a.v, a.w, system);
    const stat = bySpecies[a.species];
    stat[info.site] += 1;
    stat.total += info.weight;
    stat.items.push({ atomIndex: i, ...info });
  }

  let totalAtoms = 0;
  for (const stat of Object.values(bySpecies)) {
    stat.total = snapFloat(stat.total);
    totalAtoms += stat.total;
  }
  return { bySpecies, totalAtoms: snapFloat(totalAtoms) };
}

/**
 * 计算晶胞内的化学键（显式 bonds 或 bondCutoff + bondRule 自动推断）
 */
export function computeBonds(crystal, scale = 2.4) {
  const atoms = crystal?.atoms || [];
  if (!atoms.length) return [];
  const positions = atoms.map((a) => fracToCartesian(a.u, a.v, a.w, crystal.lattice, scale));

  if (Array.isArray(crystal.bonds)) {
    return crystal.bonds
      .filter(([i, j]) => i >= 0 && j >= 0 && i < atoms.length && j < atoms.length && i !== j)
      .map(([i, j]) => ({
        aIndex: i, bIndex: j, p1: positions[i], p2: positions[j],
        speciesA: atoms[i].species, speciesB: atoms[j].species,
      }));
  }

  const cutoffPm = Number(crystal.bondCutoff) || 0;
  if (cutoffPm <= 0) return [];

  const { maxLen } = getLatticeDims(crystal.lattice);
  const cutoffScaled = cutoffPm * (scale / maxLen) + 1e-4;
  const cutoffSq = cutoffScaled * cutoffScaled;
  const rule = crystal.bondRule || 'any';
  const out = [];

  for (let i = 0; i < atoms.length; i++) {
    const pi = positions[i];
    const si = atoms[i].species;
    for (let j = i + 1; j < atoms.length; j++) {
      const sj = atoms[j].species;
      if ((rule === 'hetero' && si === sj) || (rule === 'homo' && si !== sj)) continue;
      const pj = positions[j];
      const d2 = (pi.x - pj.x) ** 2 + (pi.y - pj.y) ** 2 + (pi.z - pj.z) ** 2;
      if (d2 > 1e-8 && d2 <= cutoffSq) {
        out.push({ aIndex: i, bIndex: j, p1: pi, p2: pj, speciesA: si, speciesB: sj });
      }
    }
  }
  return out;
}

/**
 * 计算 1–8 个晶胞拼接时的整数平移偏移 [du, dv, dw]
 */
export function computeSupercellOffsets(count, system = 'cubic') {
  const n = Math.max(1, Math.min(8, Math.floor(Number(count) || 1)));
  const table = system === 'hexagonal' ? HEX_OFFSETS : CUBIC_OFFSETS;
  return table.slice(0, n).map(([du, dv, dw]) => [du, dv, dw]);
}

/**
 * 获取由 3 个六方晶胞拼出的正六棱柱 12 顶点与 18 条棱
 */
export function getHexPrismEdges(lattice, scale = 2.4) {
  const vertices = [];
  for (const w of [0, 1]) {
    for (const [u, v] of HEX_RING_UV) {
      vertices.push(fracToCartesian(u, v, w, lattice, scale));
    }
  }
  const edges = [];
  for (let i = 0; i < 6; i++) {
    const next = (i + 1) % 6;
    edges.push([i, next], [i + 6, next + 6], [i, i + 6]);
  }
  return { vertices, edges };
}

/**
 * 由晶胞含粒子数 Z、摩尔质量 (g/mol) 与晶格常数 (pm, °) 计算理论密度 (g/cm³)
 */
export function computeDensity(Z, molarMass, lattice) {
  const { a, b, c, alpha, beta, gamma } = getLatticeDims(lattice);
  const ca = cosDeg(alpha);
  const cb = cosDeg(beta);
  const cg = cosDeg(gamma);
  const volFactorSq = 1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg;
  if (volFactorSq <= 0 || !(Z > 0) || !(molarMass > 0)) return NaN;
  return (Z * molarMass) / (NA * a * b * c * Math.sqrt(volFactorSq) * 1e-30);
}
