/**
 * AI 生成晶胞的权威本地数学校验与规范化 + AI 3D 助教响应清洗
 * 周期展开、均摊法计数、硬球半径、配位数、最短距离、化学计量与理论密度全部由本地权威计算。
 */

const {
  parseSpeciesBase,
  detectAbstractCell,
  getElementColor,
  shiftColorLuminance,
} = require('./chem-reference');
const {
  snap,
  computeDensity,
  normFrac,
  dedupBasis,
  buildDistanceMatrixAndCheckCollisions,
  solveHardSphereRadii,
  analyzePeriodicCoordination,
  analyzeShortestDistance,
  resolveBondCutoffAndRule,
  verifyStoichiometryAndDensity,
} = require('./crystal-geometry');

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

const fmt = (v) => String(Number(v.toFixed(2)));

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
          const key = `${b.species}|${Math.round(u * 1e4)}|${Math.round(v * 1e4)}|${Math.round(w * 1e4)}`;
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

function parseSpecies(rawSpecies, raw, category) {
  if (!Array.isArray(rawSpecies) || rawSpecies.length < 1 || rawSpecies.length > 5) {
    throw new Error('粒子种类 species 需包含 1～5 种粒子');
  }
  const idMap = new Map();
  const speciesMeta = [];
  const rawSpaceRadii = [];
  const baseRows = rawSpecies.map((s, i) => {
    if (!s || typeof s !== 'object') throw new Error(`第 ${i + 1} 种粒子定义无效`);
    const id = String(s.id || s.symbol || '').trim();
    if (!id || idMap.has(id)) throw new Error(`第 ${i + 1} 种粒子 id 无效或重复`);
    const symbol = String(s.symbol || id).trim();
    const mSym = parseSpeciesBase(symbol);
    const meta = mSym.isIupac ? mSym : parseSpeciesBase(id);
    speciesMeta.push(meta);
    rawSpaceRadii.push(Number(s.spaceRadius));
    idMap.set(id, id);
    if (!idMap.has(symbol)) idMap.set(symbol, id);
    return { s, id, symbol, i };
  });

  const isAbstractCell = detectAbstractCell(raw, speciesMeta);
  const elSeen = new Map();
  const species = baseRows.map(({ s, id, symbol, i }) => {
    const meta = speciesMeta[i];
    let color;
    if (isAbstractCell) {
      color = parseColorInt(s.color, PALETTE[i % PALETTE.length]);
    } else {
      const baseColor = getElementColor(meta.element, category);
      const count = elSeen.get(meta.element) || 0;
      elSeen.set(meta.element, count + 1);
      color = count === 0 ? baseColor : shiftColorLuminance(baseColor, count === 1 ? 1.28 : 0.76);
    }
    const item = { id, symbol, color, ballRadius: 0.2, spaceRadius: 0.6, countPerCell: 0 };
    if (Number.isFinite(Number(s.molarMass)) && Number(s.molarMass) > 0) item.molarMass = Number(s.molarMass);
    return item;
  });

  return { species, speciesMeta, rawSpaceRadii, idMap, isAbstractCell };
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

  const catRaw = String(raw.category || '').trim().toLowerCase();
  const category = VALID_CATEGORIES.has(catRaw) ? catRaw : 'ionic';
  const { species, speciesMeta, rawSpaceRadii, idMap, isAbstractCell } = parseSpecies(raw.species, raw, category);

  const rawBasis = Array.isArray(raw.basisAtoms) ? raw.basisAtoms : raw.atoms;
  if (!Array.isArray(rawBasis) || rawBasis.length < 1 || rawBasis.length > 80) {
    throw new Error('基元原子 basisAtoms 数量需在 1～24 之间（展开输入不超过 80）');
  }
  const isHex = system === 'hexagonal';
  const mappedBasis = rawBasis.map((item, idx) => {
    const mapped = idMap.get(String(item?.species || '').trim());
    if (!mapped) throw new Error(`第 ${idx + 1} 个原子的粒子种类未知`);
    const [u, v, w] = [Number(item.u), Number(item.v), Number(item.w)];
    if (![u, v, w].every(Number.isFinite)) throw new Error(`第 ${idx + 1} 个原子分数坐标无效`);
    return { species: mapped, u: normFrac(u, isHex), v: normFrac(v, isHex), w: normFrac(w, false) };
  });
  const basis = dedupBasis(mappedBasis);
  if (basis.length < 1 || basis.length > 24) {
    throw new Error('去重后的基元原子 basisAtoms 数量需在 1～24 之间');
  }

  const dMinPm = buildDistanceMatrixAndCheckCollisions(basis, species, speciesMeta, lattice);
  const atoms = expandPeriodic(basis);
  if (atoms.length < 1 || atoms.length > 120) throw new Error('展开后的晶胞原子数超出合理范围');

  const averagingFormula = computeAveraging(species, atoms, system);
  solveHardSphereRadii(species, speciesMeta, dMinPm, lattice, { category, isAbstractCell, rawSpaceRadii });

  const coordination = analyzePeriodicCoordination(
    basis, atoms, lattice, species, speciesMeta, raw.coordination, category, idMap, isAbstractCell,
  );
  const shortestDistance = analyzeShortestDistance(
    basis, atoms, lattice, raw.shortestDistance, category, system, speciesMeta, species,
  );
  const rawRule = String(raw.bondRule || '').trim().toLowerCase();
  const rawCut = raw.bondCutoff == null ? NaN : Number(raw.bondCutoff);
  const { bondCutoff, bondRule } = resolveBondCutoffAndRule(
    basis, lattice, species, rawCut, rawRule, category, VALID_BOND_RULES,
  );

  const name = String(raw.name || raw.formula || '自定义晶胞').trim().slice(0, 40);
  const formula = String(raw.formula || name).trim().slice(0, 40);
  const dRaw = raw.density && typeof raw.density === 'object' ? raw.density : {};
  const density = verifyStoichiometryAndDensity(species, speciesMeta, lattice, formula, dRaw, isAbstractCell, system);
  const slug = formula.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 20) || 'cell';
  const hasOrigin = basis.some((at) => at.u === 0 && at.v === 0 && at.w === 0);

  return {
    id: `ai-${slug}-${Date.now()}`, isCustom: true, name, formula, category,
    subtitle: String(raw.subtitle || '').trim().slice(0, 60) || SYS_SUBTITLE[system],
    system, lattice, species, atoms, bonds: null, bondCutoff, bondRule,
    coordination, shortestDistance, density, averagingFormula,
    hexPrismHighlight: system === 'hexagonal' && hasOrigin,
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
