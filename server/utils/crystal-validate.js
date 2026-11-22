/**
 * AI 生成晶胞的权威本地数学校验与规范化 + AI 3D 助教响应清洗
 * 周期展开、均摊法计数、最短距离与理论密度全部由本地精确计算，不信任模型算术。
 */

const NA = 6.02214076e23;
const DEG2RAD = Math.PI / 180;
const SITE_EPS = 1e-4;

const VALID_SYSTEMS = new Set(['cubic', 'tetragonal', 'orthorhombic', 'hexagonal']);
const VALID_CATEGORIES = new Set(['metallic', 'ionic', 'covalent', 'molecular', 'mixed']);
const VALID_BOND_RULES = new Set(['any', 'hetero', 'homo']);
const VALID_GUIDE_ACTIONS = new Set([
  'ball-stick', 'space-filling', 'slice', 'explode',
  'tile-2', 'tile-3', 'coordination', 'distance', 'reset',
]);
const PALETTE = [0x3b82f6, 0x22b573, 0xe03e3e, 0xe6b800, 0x8b5cf6];
const SYS_SUBTITLE = {
  cubic: '立方晶胞', tetragonal: '四方晶胞', orthorhombic: '正交晶胞', hexagonal: '六方晶胞',
};

const cosDeg = (d) => (Math.abs(d - 90) < 1e-6 ? 0 : Math.abs(d - 120) < 1e-6 ? -0.5 : Math.cos(d * DEG2RAD));
const sinDeg = (d) => (Math.abs(d - 90) < 1e-6 ? 1 : Math.abs(d - 120) < 1e-6 ? Math.sqrt(3) / 2 : Math.sin(d * DEG2RAD));
const clamp = (v, lo, hi, fb) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb);
const snap = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : Number(v.toFixed(4)));
const fmt = (v) => String(Number(v.toFixed(2)));
const normFrac = (val) => {
  const t = val - Math.floor(val);
  return Math.abs(t) < 1e-5 || Math.abs(t - 1) < 1e-5 ? 0 : Math.round(t * 1e6) / 1e6;
};

function parseColorInt(val, fallback) {
  if (typeof val === 'number' && Number.isFinite(val) && val >= 0 && val <= 0xffffff) return Math.round(val) & 0xffffff;
  if (typeof val === 'string') {
    const s = val.trim().replace(/^(?:#|0x)/i, '');
    if (/^[0-9a-f]{3}$/i.test(s)) return parseInt(s.replace(/./g, '$&$&'), 16);
    if (/^[0-9a-f]{6}$/i.test(s)) return parseInt(s, 16);
  }
  return fallback;
}

function expandPeriodic(basis) {
  const seen = new Set();
  const atoms = [];
  for (const b of basis) {
    for (const u of b.u === 0 ? [0, 1] : [b.u])
      for (const v of b.v === 0 ? [0, 1] : [b.v])
        for (const w of b.w === 0 ? [0, 1] : [b.w]) {
          const key = `${b.species}|${Math.round(u * 1e5)}|${Math.round(v * 1e5)}|${Math.round(w * 1e5)}`;
          if (!seen.has(key)) { seen.add(key); atoms.push({ species: b.species, u, v, w }); }
        }
  }
  return atoms;
}

function classifySite(u, v, w, system) {
  const [u0, u1, v0, v1] = [Math.abs(u) < SITE_EPS, Math.abs(u - 1) < SITE_EPS, Math.abs(v) < SITE_EPS, Math.abs(v - 1) < SITE_EPS];
  const [uOn, vOn, wOn] = [u0 || u1, v0 || v1, Math.abs(w) < SITE_EPS || Math.abs(w - 1) < SITE_EPS];
  const n = (uOn ? 1 : 0) + (vOn ? 1 : 0) + (wOn ? 1 : 0);
  if (n === 0) return { weight: 1, label: '1' };
  if (n === 1) return { weight: 0.5, label: '1/2' };
  if (system === 'hexagonal') {
    const obtuse = (u0 && v0) || (u1 && v1);
    if (n === 3) return obtuse ? { weight: 1 / 6, label: '1/6' } : { weight: 1 / 12, label: '1/12' };
    if (uOn && vOn) return obtuse ? { weight: 1 / 3, label: '1/3' } : { weight: 1 / 6, label: '1/6' };
    return { weight: 0.25, label: '1/4' };
  }
  return n === 3 ? { weight: 0.125, label: '1/8' } : { weight: 0.25, label: '1/4' };
}

const fracToPm = (u, v, w, lat) => [u * lat.a + v * lat.b * cosDeg(lat.gamma), w * lat.c, v * lat.b * sinDeg(lat.gamma)];
function distPm(p1, p2, lat) {
  const [x1, y1, z1] = fracToPm(p1[0], p1[1], p1[2], lat);
  const [x2, y2, z2] = fracToPm(p2[0], p2[1], p2[2], lat);
  return Math.hypot(x1 - x2, y1 - y2, z1 - z2);
}

function computeDensity(Z, molarMass, lat) {
  const [ca, cb, cg] = [cosDeg(lat.alpha), cosDeg(lat.beta), cosDeg(lat.gamma)];
  const vf2 = 1 - ca * ca - cb * cb - cg * cg + 2 * ca * cb * cg;
  if (vf2 <= 0 || !(Z > 0) || !(molarMass > 0)) return NaN;
  return (Z * molarMass) / (NA * lat.a * lat.b * lat.c * Math.sqrt(vf2) * 1e-30);
}

function analyzeGeometry(atoms, lat, centerIndex, neighborSpecies) {
  let best = null;
  const check = (p1, p2) => {
    const d = distPm(p1, p2, lat);
    if (d > 1e-2 && (!best || d < best.d)) best = { pair: [p1, p2], d };
  };
  for (let i = 0; i < atoms.length; i += 1)
    for (let j = i + 1; j < atoms.length; j += 1)
      check([atoms[i].u, atoms[i].v, atoms[i].w], [atoms[j].u, atoms[j].v, atoms[j].w]);
  const ctr = atoms[centerIndex] || atoms[0];
  if (!best && ctr) [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(([du, dv, dw]) => check([ctr.u, ctr.v, ctr.w], [ctr.u + du, ctr.v + dv, ctr.w + dw]));
  const cp = fracToPm(ctr.u, ctr.v, ctr.w, lat);
  const cands = [];
  for (let du = -1; du <= 1; du += 1)
    for (let dv = -1; dv <= 1; dv += 1)
      for (let dw = -1; dw <= 1; dw += 1)
        for (const a of atoms) {
          if (neighborSpecies && a.species !== neighborSpecies) continue;
          const p = fracToPm(a.u + du, a.v + dv, a.w + dw, lat);
          const d = Math.hypot(p[0] - cp[0], p[1] - cp[1], p[2] - cp[2]);
          if (d > 1) cands.push({ p, d });
        }
  cands.sort((x, y) => x.d - y.d);
  const dedup = new Set();
  const tol = cands.length ? cands[0].d * 1.08 + 1 : 0;
  for (const x of cands) {
    if (x.d > tol) break;
    dedup.add(`${Math.round(x.p[0])}_${Math.round(x.p[1])}_${Math.round(x.p[2])}`);
  }
  return { pair: best ? best.pair : [[0, 0, 0], [1, 0, 0]], minPm: best ? best.d : lat.a, cn: dedup.size || 6 };
}

function parseSpecies(rawSpecies) {
  if (!Array.isArray(rawSpecies) || rawSpecies.length < 1 || rawSpecies.length > 5) {
    throw new Error('粒子种类 species 需包含 1～5 种粒子');
  }
  const idMap = new Map();
  const species = rawSpecies.map((s, i) => {
    if (!s || typeof s !== 'object') throw new Error(`第 ${i + 1} 种粒子定义无效`);
    const id = String(s.id || s.symbol || '').trim();
    if (!id || idMap.has(id)) throw new Error(`第 ${i + 1} 种粒子 id 无效或重复`);
    const symbol = String(s.symbol || id).trim();
    const item = {
      id, symbol, color: parseColorInt(s.color, PALETTE[i % PALETTE.length]),
      ballRadius: Number(clamp(Number(s.ballRadius), 0.12, 0.36, 0.22).toFixed(2)),
      spaceRadius: Number(clamp(Number(s.spaceRadius), 0.35, 1.35, 0.78).toFixed(2)),
      countPerCell: 0,
    };
    if (Number.isFinite(Number(s.molarMass)) && Number(s.molarMass) > 0) item.molarMass = Number(s.molarMass);
    idMap.set(id, id);
    if (!idMap.has(symbol)) idMap.set(symbol, id);
    return item;
  });
  return { species, idMap };
}

function computeAveraging(species, atoms, system) {
  const parts = [];
  for (const sp of species) {
    const groups = new Map();
    let total = 0;
    for (const at of atoms) {
      if (at.species !== sp.id) continue;
      const info = classifySite(at.u, at.v, at.w, system);
      total += info.weight;
      const g = groups.get(info.label) || { label: info.label, weight: info.weight, count: 0 };
      g.count += 1;
      groups.set(info.label, g);
    }
    sp.countPerCell = snap(total);
    const expr = [...groups.values()].sort((x, y) => x.weight - y.weight).map((g) => `${g.count}×${g.label}`).join(' + ');
    if (expr) parts.push(`${sp.symbol}：${expr} = ${fmt(sp.countPerCell)}`);
  }
  return parts.join('；') || '按晶胞均摊法计算';
}

function clampSpaceRadii(species, basis, lattice) {
  const maxLen = Math.max(lattice.a, lattice.b, lattice.c) || 1;
  const k = 2.4 / maxLen;
  const spMap = new Map(species.map((s) => [s.id, s]));
  let scale = 1;
  for (let i = 0; i < basis.length; i += 1) {
    const a = basis[i];
    const spA = spMap.get(a.species);
    if (!spA) continue;
    for (let j = i; j < basis.length; j += 1) {
      const b = basis[j];
      const spB = spMap.get(b.species);
      if (!spB) continue;
      const rSum = spA.spaceRadius + spB.spaceRadius;
      for (let du = -1; du <= 1; du += 1)
        for (let dv = -1; dv <= 1; dv += 1)
          for (let dw = -1; dw <= 1; dw += 1) {
            if (i === j && du === 0 && dv === 0 && dw === 0) continue;
            const dScene = distPm([a.u, a.v, a.w], [b.u + du, b.v + dv, b.w + dw], lattice) * k;
            if (dScene > 1e-4 && rSum > dScene) scale = Math.min(scale, dScene / rSum);
          }
    }
  }
  if (scale < 1) {
    for (const sp of species) {
      sp.spaceRadius = Number(Math.max(0.12, sp.spaceRadius * scale).toFixed(2));
      sp.ballRadius = Number(Math.min(sp.ballRadius, Math.max(0.1, sp.spaceRadius * 0.75)).toFixed(2));
    }
  }
}

function validateCrystalPayload(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('晶胞结构数据无效');
  const system = String(raw.system || '').trim().toLowerCase();
  if (!VALID_SYSTEMS.has(system)) throw new Error('晶系必须是 cubic / tetragonal / orthorhombic / hexagonal 之一');
  if (!raw.lattice || typeof raw.lattice !== 'object') throw new Error('缺少晶胞参数 lattice');
  const a = Number(raw.lattice.a);
  const b = raw.lattice.b == null ? a : Number(raw.lattice.b);
  const c = raw.lattice.c == null ? a : Number(raw.lattice.c);
  if (![a, b, c].every((n) => Number.isFinite(n) && n >= 150 && n <= 2500)) {
    throw new Error('晶胞参数 a/b/c 必须在 150～2500 pm 之间');
  }
  const lattice = {
    a: Number(a.toFixed(2)),
    b: Number((system === 'orthorhombic' ? b : a).toFixed(2)),
    c: Number((system === 'cubic' ? a : c).toFixed(2)),
    alpha: 90, beta: 90, gamma: system === 'hexagonal' ? 120 : 90,
  };

  const { species, idMap } = parseSpecies(raw.species);
  const rawBasis = Array.isArray(raw.basisAtoms) ? raw.basisAtoms : raw.atoms;
  if (!Array.isArray(rawBasis) || rawBasis.length < 1 || rawBasis.length > 24) {
    throw new Error('基元原子 basisAtoms 数量需在 1～24 之间');
  }
  const basis = rawBasis.map((item, idx) => {
    const mapped = idMap.get(String(item?.species || '').trim());
    if (!mapped) throw new Error(`第 ${idx + 1} 个原子的粒子种类未知`);
    const [u, v, w] = [Number(item.u), Number(item.v), Number(item.w)];
    if (![u, v, w].every(Number.isFinite)) throw new Error(`第 ${idx + 1} 个原子分数坐标无效`);
    return { species: mapped, u: normFrac(u), v: normFrac(v), w: normFrac(w) };
  });

  const atoms = expandPeriodic(basis);
  if (atoms.length < 1 || atoms.length > 120) throw new Error('展开后的晶胞原子数超出合理范围');
  clampSpaceRadii(species, basis, lattice);
  const averagingFormula = computeAveraging(species, atoms, system);

  let centerIndex = Number.isInteger(raw.coordination?.centerIndex) ? raw.coordination.centerIndex : -1;
  if (centerIndex < 0 || centerIndex >= atoms.length) {
    let bestD = Infinity;
    atoms.forEach((at, i) => {
      const d = (at.u - 0.5) ** 2 + (at.v - 0.5) ** 2 + (at.w - 0.5) ** 2;
      if (d < bestD) { bestD = d; centerIndex = i; }
    });
  }
  const neighborSpecies = idMap.get(String(raw.coordination?.neighborSpecies || '').trim()) || null;
  const geom = analyzeGeometry(atoms, lattice, centerIndex, neighborSpecies);
  const cnRaw = Number(raw.coordination?.number);
  const cn = Number.isInteger(cnRaw) && cnRaw >= 1 && cnRaw <= 24 ? cnRaw : geom.cn;

  let sdPair = geom.pair;
  const rp = raw.shortestDistance?.pair;
  if (Array.isArray(rp) && rp.length === 2
      && rp.every((pt) => Array.isArray(pt) && pt.length === 3 && pt.every((n) => Number.isFinite(Number(n))))) {
    const cand = rp.map((pt) => pt.map(Number));
    if (distPm(cand[0], cand[1], lattice) > 1e-2) sdPair = cand;
  }
  const sdValuePm = Math.round(distPm(sdPair[0], sdPair[1], lattice));

  const dRaw = raw.density && typeof raw.density === 'object' ? raw.density : {};
  const zVal = Number.isFinite(Number(dRaw.Z)) && Number(dRaw.Z) > 0 ? Number(Number(dRaw.Z).toFixed(2)) : 1;
  let mVal = Number(dRaw.molarMass);
  if (!(mVal > 0) && species.every((s) => s.molarMass > 0)) {
    mVal = species.reduce((sum, s) => sum + s.countPerCell * s.molarMass, 0) / zVal;
  }
  mVal = Number.isFinite(mVal) && mVal > 0 ? Number(mVal.toFixed(2)) : 0;
  const rho = mVal > 0 ? computeDensity(zVal, mVal, lattice) : NaN;

  const name = String(raw.name || raw.formula || '自定义晶胞').trim().slice(0, 40);
  const formula = String(raw.formula || name).trim().slice(0, 40);
  const cat = String(raw.category || '').trim().toLowerCase();
  const rule = String(raw.bondRule || '').trim().toLowerCase();
  const cut = Number(raw.bondCutoff);
  const slug = formula.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'cell';

  return {
    id: `ai-${slug}-${Date.now()}`, isCustom: true, name, formula,
    category: VALID_CATEGORIES.has(cat) ? cat : 'ionic',
    subtitle: String(raw.subtitle || '').trim().slice(0, 60) || SYS_SUBTITLE[system],
    system, lattice, species, atoms, bonds: null,
    bondCutoff: Number.isFinite(cut) && cut >= 50 && cut <= 2500 ? Math.round(cut) : Math.round(geom.minPm * 1.15),
    bondRule: VALID_BOND_RULES.has(rule) ? rule : (species.length > 1 ? 'hetero' : 'any'),
    coordination: { centerIndex, number: cn, neighborSpecies, label: String(raw.coordination?.label || '').trim() || `最近邻配位数 CN = ${cn}` },
    shortestDistance: {
      formula: String(raw.shortestDistance?.formula || '').trim() || 'd = min(r)',
      desc: String(raw.shortestDistance?.desc || '').trim() || `最近邻两粒子间距约 ${sdValuePm} pm`,
      pair: sdPair, valuePm: sdValuePm,
    },
    density: {
      Z: zVal, molarMass: mVal, valueGcm3: Number.isFinite(rho) ? Number(rho.toFixed(2)) : null,
      formulaText: String(dRaw.formulaText || '').trim()
        || (system === 'hexagonal' ? 'ρ = (Z × M) / (Nₐ · √3/2 · a² · c)' : 'ρ = (Z × M) / (Nₐ · a · b · c)'),
    },
    averagingFormula, hexPrismHighlight: system === 'hexagonal',
    qa: {
      question: String(raw.qa?.question || '').trim() || `请用均摊法计算 ${formula} 晶胞中各粒子的数目。`,
      answer: String(raw.qa?.answer || '').trim() || averagingFormula,
    },
  };
}

function normalizeCrystalGuide(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('AI 助教返回数据无效');
  const answer = String(raw.answer || '').trim();
  if (!answer) throw new Error('AI 助教未返回有效结论');
  const steps = [];
  for (const item of Array.isArray(raw.steps) ? raw.steps : []) {
    if (steps.length >= 5) break;
    const title = String(item?.title || '').trim().slice(0, 60);
    const detail = String(item?.detail || '').trim().slice(0, 240);
    if (!title && !detail) continue;
    const act = typeof item?.action === 'string' ? item.action.trim() : '';
    steps.push({ title: title || `步骤 ${steps.length + 1}`, detail, action: VALID_GUIDE_ACTIONS.has(act) ? act : null });
  }
  return { answer: answer.slice(0, 600), steps };
}

module.exports = { VALID_GUIDE_ACTIONS, expandPeriodic, classifySite, computeDensity, validateCrystalPayload, normalizeCrystalGuide };
