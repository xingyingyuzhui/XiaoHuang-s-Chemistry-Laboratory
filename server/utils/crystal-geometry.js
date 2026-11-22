/**
 * 晶胞周期几何、硬球相切半径求解、权威配位数/最短距离/键长截断与化学计量校验
 */

const { ATOMIC_WEIGHTS, parseChemicalFormula, parseSpeciesBase, getSpeciesSeedRadiusPm } = require('./chem-reference');

const NA = 6.02214076e23;
const DEG2RAD = Math.PI / 180;
const THIRDS = [1 / 6, 1 / 3, 2 / 3, 5 / 6];
const EIGHTHS = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
const SHIFTS = [-1, 0, 1];
const CUBIC_RATIOS = [
  [1, 'd = a'], [0.5, 'd = a / 2'], [Math.SQRT2 / 2, 'd = √2/2 · a'],
  [Math.sqrt(3) / 2, 'd = √3/2 · a'], [Math.sqrt(3) / 4, 'd = √3/4 · a'], [Math.sqrt(3) / 8, 'd = √3/8 · a'],
];

const cosDeg = (d) => (Math.abs(d - 90) < 1e-6 ? 0 : Math.abs(d - 120) < 1e-6 ? -0.5 : Math.cos(d * DEG2RAD));
const sinDeg = (d) => (Math.abs(d - 90) < 1e-6 ? 1 : Math.abs(d - 120) < 1e-6 ? Math.sqrt(3) / 2 : Math.sin(d * DEG2RAD));
const clamp = (v, lo, hi, fb) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fb);
const snap = (v) => (Math.abs(v - Math.round(v)) < 1e-6 ? Math.round(v) : Number(v.toFixed(4)));
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

function normFrac(val, isHexUV = false) {
  const t = val - Math.floor(val);
  if (t < 2e-3 || 1 - t < 2e-3) return 0;
  const thirdTol = isHexUV ? 3.5e-3 : 2e-3;
  for (const r of THIRDS) if (Math.abs(t - r) < thirdTol) return Number(r.toFixed(6));
  for (const r of EIGHTHS) if (Math.abs(t - r) < 1.5e-3) return r;
  return Math.round(t * 1e6) / 1e6;
}

function dedupBasis(rawList) {
  const seen = new Set();
  const out = [];
  for (const b of rawList) {
    const key = `${b.species}|${Math.round(b.u * 1e4)}|${Math.round(b.v * 1e4)}|${Math.round(b.w * 1e4)}`;
    if (!seen.has(key)) { seen.add(key); out.push(b); }
  }
  return out;
}

function forEachPeriodicPair(list, lat, ordered, cb) {
  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    const p1 = [a.u, a.v, a.w];
    const jStart = ordered ? 0 : i;
    for (let j = jStart; j < list.length; j += 1) {
      const b = list[j];
      for (const du of SHIFTS) for (const dv of SHIFTS) for (const dw of SHIFTS) {
        if (i === j && du === 0 && dv === 0 && dw === 0) continue;
        const p2 = [b.u + du, b.v + dv, b.w + dw];
        cb(a, b, distPm(p1, p2, lat), p1, p2);
      }
    }
  }
}

function buildDistanceMatrixAndCheckCollisions(basis, species, speciesMeta, lattice) {
  const spIdx = new Map(species.map((s, i) => [s.id, i]));
  const dMinPm = Array.from({ length: species.length }, () => new Array(species.length).fill(Infinity));
  forEachPeriodicPair(basis, lattice, false, (a, b, d) => {
    const si = spIdx.get(a.species), sj = spIdx.get(b.species);
    const metaA = speciesMeta[si], metaB = speciesMeta[sj];
    const hasH = metaA?.element === 'H' || metaB?.element === 'H' || Boolean(metaA?.composition?.H || metaB?.composition?.H);
    const minAllowed = hasH ? 70 : 100;
    if (d < minAllowed) {
      throw new Error(`晶胞存在过近原子重叠（${a.species}–${b.species} 间距仅 ${Math.round(d)} pm < ${minAllowed} pm），请检查分数坐标或晶胞参数`);
    }
    if (d < dMinPm[si][sj]) { dMinPm[si][sj] = d; dMinPm[sj][si] = d; }
  });
  return dMinPm;
}

function solveHardSphereRadii(species, speciesMeta, dMinPm, lattice, { category, isAbstractCell, rawSpaceRadii }) {
  const maxLen = Math.max(lattice.a, lattice.b, lattice.c) || 1;
  const k = 2.4 / maxLen;
  if (species.length === 1) {
    const d0 = Number.isFinite(dMinPm[0][0]) ? dMinPm[0][0] : maxLen;
    const rSpace = Number(clamp((d0 / 2) * k, 0.2, 1.25).toFixed(2));
    species[0].spaceRadius = rSpace;
    species[0].ballRadius = Number(clamp(Math.min(rSpace * 0.3, 0.32 * d0 * k), 0.11, 0.28).toFixed(2));
    return;
  }
  const r0Pm = species.map((sp, i) => (
    !isAbstractCell && speciesMeta[i].isIupac
      ? getSpeciesSeedRadiusPm(speciesMeta[i], category)
      : clamp(rawSpaceRadii[i], 0.2, 1.5, 0.7) / k
  ));
  let s = Infinity;
  for (let i = 0; i < species.length; i += 1)
    for (let j = i; j < species.length; j += 1)
      if (Number.isFinite(dMinPm[i][j])) s = Math.min(s, dMinPm[i][j] / (r0Pm[i] + r0Pm[j]));
  if (!Number.isFinite(s) || s <= 0) s = 1;
  const r = r0Pm.map((v) => v * s);
  for (let i = 0; i < species.length; i += 1) {
    let cap = isAbstractCell ? r[i] * 1.25 : r0Pm[i] * 1.2;
    for (let j = 0; j < species.length; j += 1) {
      if (Number.isFinite(dMinPm[i][j])) cap = Math.min(cap, i === j ? dMinPm[i][i] / 2 : dMinPm[i][j] - r[j]);
    }
    if (cap > r[i]) r[i] = cap;
  }
  for (let i = 0; i < species.length; i += 1) {
    const dMinI = Math.min(...dMinPm[i].filter(Number.isFinite));
    const dMinScene = (Number.isFinite(dMinI) ? dMinI : maxLen) * k;
    species[i].spaceRadius = Number(clamp(r[i] * k, 0.2, 1.25).toFixed(2));
    species[i].ballRadius = Number(clamp(Math.min(species[i].spaceRadius * 0.3, 0.32 * dMinScene), 0.11, 0.28).toFixed(2));
  }
}

function analyzePeriodicCoordination(basis, atoms, lattice, species, speciesMeta, rawCoord, category, idMap, isAbstractCell) {
  let neighborSpecies = idMap.get(String(rawCoord?.neighborSpecies || '').trim()) || null;
  let allowedCenters = null;
  const explicitCenter = idMap.get(String(rawCoord?.centerSpecies || '').trim()) || null;
  if (explicitCenter) {
    allowedCenters = new Set([explicitCenter]);
  } else if (species.length === 1) {
    allowedCenters = new Set([species[0].id]);
  } else if (neighborSpecies) {
    allowedCenters = category === 'molecular'
      ? new Set([neighborSpecies])
      : new Set(species.filter((s) => s.id !== neighborSpecies).map((s) => s.id));
  } else if (!isAbstractCell && category !== 'molecular') {
    const cations = species.filter((_, i) => speciesMeta[i].charge > 0);
    const anions = species.filter((_, i) => speciesMeta[i].charge < 0);
    if (cations.length && anions.length) {
      allowedCenters = new Set(cations.map((s) => s.id));
      if (anions.length === 1) neighborSpecies = anions[0].id;
    } else {
      const sorted = [...species].sort((a, b) => a.countPerCell - b.countPerCell);
      allowedCenters = new Set([sorted[0].id]);
      if (species.length === 2) neighborSpecies = sorted[1].id;
    }
  }
  let centerIndex = 0;
  let bestD2 = Infinity;
  atoms.forEach((at, i) => {
    if (allowedCenters && allowedCenters.size && !allowedCenters.has(at.species)) return;
    const d2 = (at.u - 0.5) ** 2 + (at.v - 0.5) ** 2 + (at.w - 0.5) ** 2;
    if (d2 < bestD2) { bestD2 = d2; centerIndex = i; }
  });
  const ctr = atoms[centerIndex] || atoms[0];
  const cp = [Math.abs(ctr.u - 1) < 1e-4 ? 0 : ctr.u, Math.abs(ctr.v - 1) < 1e-4 ? 0 : ctr.v, Math.abs(ctr.w - 1) < 1e-4 ? 0 : ctr.w];
  const dists = [];
  for (const b of basis) {
    if (neighborSpecies && b.species !== neighborSpecies) continue;
    for (const du of SHIFTS) for (const dv of SHIFTS) for (const dw of SHIFTS) {
      const d = distPm(cp, [b.u + du, b.v + dv, b.w + dw], lattice);
      if (d > 1) dists.push(d);
    }
  }
  dists.sort((a, b) => a - b);
  const tol = dists.length ? dists[0] * 1.08 + 1 : 0;
  const cn = dists.filter((d) => d <= tol).length || 6;
  let label = String(rawCoord?.label || '').trim();
  const cnMention = label.match(/(?:CN\s*[=：:]\s*|配位数(?:为|是)?\s*)(\d+)/i);
  if (!label || (cnMention && Number(cnMention[1]) !== cn)) label = `最近邻配位数 CN = ${cn}`;
  return { centerIndex, number: cn, neighborSpecies, label };
}

function analyzeShortestDistance(basis, atoms, lattice, rawSd, category, system, speciesMeta, species) {
  let globalBest = null;
  forEachPeriodicPair(basis, lattice, false, (_a, _b, d, p1, p2) => {
    if (d > 1 && (!globalBest || d < globalBest.d)) globalBest = { pair: [p1, p2], d };
  });
  const minPm = globalBest ? globalBest.d : lattice.a;
  let bestPair = globalBest ? globalBest.pair : [[0, 0, 0], [1, 0, 0]];
  let intraBest = null;
  for (let i = 0; i < atoms.length; i += 1)
    for (let j = i + 1; j < atoms.length; j += 1) {
      const p1 = [atoms[i].u, atoms[i].v, atoms[i].w], p2 = [atoms[j].u, atoms[j].v, atoms[j].w];
      const d = distPm(p1, p2, lattice);
      if (d > 1 && d <= minPm * 1.005 + 0.5 && (!intraBest || d < intraBest.d)) intraBest = { pair: [p1, p2], d };
    }
  if (intraBest) bestPair = intraBest.pair;

  let molMinPm = null;
  if (category === 'molecular' && species.length > 1) {
    const heavyIdx = species.findIndex((_, i) => speciesMeta[i].element !== 'H');
    if (heavyIdx >= 0) {
      const heavy = basis.filter((b) => b.species === species[heavyIdx].id);
      forEachPeriodicPair(heavy, lattice, false, (_a, _b, d) => {
        if (d > 1 && (molMinPm == null || d < molMinPm)) molMinPm = d;
      });
    }
  }
  const isHex = system === 'hexagonal';
  const matchesSite = (pt) => {
    const [u, v, w] = [normFrac(pt[0], isHex), normFrac(pt[1], isHex), normFrac(pt[2], false)];
    return basis.some((b) => Math.abs(b.u - u) < 2e-2 && Math.abs(b.v - v) < 2e-2 && Math.abs(b.w - w) < 2e-2);
  };
  let pair = bestPair;
  let acceptedAi = false;
  const rp = rawSd?.pair;
  if (Array.isArray(rp) && rp.length === 2 && rp.every((pt) => Array.isArray(pt) && pt.length === 3 && pt.every((n) => Number.isFinite(Number(n))))) {
    const cand = rp.map((pt) => pt.map(Number));
    const d = distPm(cand[0], cand[1], lattice);
    const dOk = d > 1 && (d <= minPm * 1.08 || (molMinPm != null && Math.abs(d - molMinPm) <= molMinPm * 0.08));
    if (dOk && matchesSite(cand[0]) && matchesSite(cand[1])) { pair = cand; acceptedAi = true; }
  }
  const valuePm = Math.round(distPm(pair[0], pair[1], lattice));
  let derivedFormula = 'd = min(r)';
  if (system === 'cubic') {
    const ratio = distPm(pair[0], pair[1], lattice) / lattice.a;
    const hit = CUBIC_RATIOS.find(([r]) => Math.abs(ratio - r) / r <= 0.015);
    if (hit) derivedFormula = hit[1];
  }
  const rawFormula = String(rawSd?.formula || '').trim();
  const rawDesc = String(rawSd?.desc || '').trim();
  return {
    formula: (acceptedAi && rawFormula) || (!rp && rawFormula) ? rawFormula : derivedFormula,
    desc: acceptedAi && rawDesc ? rawDesc : `最近邻两粒子间距约 ${valuePm} pm`,
    pair, valuePm,
  };
}

function resolveBondCutoffAndRule(basis, lattice, species, rawCutoff, rawRule, category, validRules) {
  const bondRule = species.length === 1 ? 'any' : (validRules.has(rawRule) ? rawRule : 'hetero');
  const pairAllowed = (a, b) => bondRule === 'any' || (bondRule === 'hetero' ? a !== b : a === b);
  const dists = [];
  forEachPeriodicPair(basis, lattice, false, (a, b, d) => {
    if (d > 1 && pairAllowed(a.species, b.species)) dists.push(d);
  });
  dists.sort((a, b) => a - b);
  const d1 = dists[0] || lattice.a;
  const d2 = dists.find((d) => d > d1 * 1.12) || null;
  if (species.length === 1 && category === 'molecular' && d1 > 400 && rawCutoff === 0) return { bondCutoff: 0, bondRule };
  const lo = 1.02 * d1;
  const hi = Math.max(lo, Math.min(1.32 * d1, d2 ? (d1 + d2) * 0.48 : 1.25 * d1));
  const ideal = Math.max(Math.ceil(lo), Math.round(Math.min(d1 * 1.15, d2 ? (d1 + d2) * 0.48 : d1 * 1.15)));
  let cut = Number.isFinite(rawCutoff) && rawCutoff >= lo && rawCutoff <= hi ? Math.round(rawCutoff) : ideal;
  let degSum = 0;
  forEachPeriodicPair(basis, lattice, true, (a, b, d) => {
    if (d > 1 && d <= cut && pairAllowed(a.species, b.species)) degSum += 1;
  });
  if (basis.length > 0 && degSum / basis.length > 16) cut = Math.round(1.08 * d1);
  return { bondCutoff: cut, bondRule };
}

function gcdInt(a, b) { let x = Math.abs(a), y = Math.abs(b); while (y) { [x, y] = [y, x % y]; } return x || 1; }

function resolveSpeciesCompositionAndMass(sp, fallbackMeta) {
  const fromSym = parseSpeciesBase(sp?.symbol);
  if (fromSym.isIupac && fromSym.composition) return { composition: fromSym.composition, mass: fromSym.mass };
  const fromFormula = parseChemicalFormula(sp?.symbol);
  if (fromFormula) return { composition: fromFormula.counts, mass: fromFormula.molarMass };
  const comp = fallbackMeta?.composition || null;
  if (!comp) return { composition: null, mass: 0 };
  const mass = Number.isFinite(fallbackMeta.mass) && fallbackMeta.mass > 0
    ? fallbackMeta.mass
    : Object.entries(comp).reduce((acc, [el, mult]) => acc + mult * ATOMIC_WEIGHTS[el], 0);
  return { composition: comp, mass };
}

function maybePromoteCoarseMolecularSpecies(species, speciesMeta, dMinPm, lattice, formula, category, isAbstractCell) {
  if (isAbstractCell || category !== 'molecular' || species.length !== 1) return false;
  const parsed = parseChemicalFormula(formula);
  if (!parsed) return false;
  const fTotal = Object.values(parsed.counts).reduce((a, b) => a + b, 0);
  if (fTotal <= 1) return false;
  const curComp = speciesMeta[0]?.composition;
  const curTotal = curComp ? Object.values(curComp).reduce((a, b) => a + b, 0) : 0;
  if (curTotal !== 1 || !(parsed.counts[speciesMeta[0].element] > 0)) return false;
  const maxLat = Math.max(lattice.a, lattice.b, lattice.c);
  const zSite = species[0].countPerCell;
  const dMin = dMinPm?.[0]?.[0];
  if (maxLat < 700 || !(zSite > 0 && zSite <= 8)) return false;
  if (!(zSite < fTotal || (Number.isFinite(dMin) && dMin >= 350))) return false;
  const promoted = parseSpeciesBase(formula);
  if (!promoted.isIupac) return false;
  species[0].symbol = formula;
  species[0].molarMass = Number(parsed.molarMass.toFixed(2));
  speciesMeta[0] = promoted;
  return true;
}

function verifyStoichiometryAndDensity(species, speciesMeta, lattice, formula, dRaw, isAbstractCell, system) {
  const defaultFormulaText = (z) => (
    system === 'hexagonal' ? `ρ = (${z} × M) / (Nₐ · √3/2 · a² · c)`
      : system === 'cubic' ? `ρ = (${z} × M) / (Nₐ · a³)`
        : `ρ = (${z} × M) / (Nₐ · a · b · c)`
  );
  const gcdFromSpecies = () => {
    const ints = species.map((s) => s.countPerCell).filter((c) => c > 0 && Math.abs(c - Math.round(c)) < 1e-3).map(Math.round);
    return ints.length === species.length && ints.length ? ints.reduce((a, b) => gcdInt(a, b)) : 1;
  };
  if (isAbstractCell) {
    const zVal = Number.isFinite(Number(dRaw.Z)) && Number(dRaw.Z) > 0 ? Number(Number(dRaw.Z).toFixed(2)) : gcdFromSpecies();
    let mVal = Number(dRaw.molarMass);
    if (!(mVal > 0) && species.every((s) => s.molarMass > 0)) mVal = species.reduce((sum, s) => sum + s.countPerCell * s.molarMass, 0) / zVal;
    mVal = Number.isFinite(mVal) && mVal > 0 ? Number(mVal.toFixed(2)) : 0;
    const rho = mVal > 0 ? computeDensity(zVal, mVal, lattice) : NaN;
    return { Z: zVal, molarMass: mVal, valueGcm3: Number.isFinite(rho) ? Number(rho.toFixed(2)) : null, formulaText: String(dRaw.formulaText || '').trim() || defaultFormulaText(zVal) };
  }
  const cellCounts = Object.create(null);
  let cellMass = 0;
  for (let i = 0; i < species.length; i += 1) {
    const { composition: comp, mass } = resolveSpeciesCompositionAndMass(species[i], speciesMeta[i]);
    if (!comp) continue;
    for (const [el, mult] of Object.entries(comp)) {
      cellCounts[el] = (cellCounts[el] || 0) + species[i].countPerCell * mult;
    }
    cellMass += species[i].countPerCell * mass;
  }
  const parsedFormula = parseChemicalFormula(formula);
  let zVal = 1;
  if (parsedFormula) {
    const fKeys = Object.keys(parsedFormula.counts).sort();
    const cKeys = Object.keys(cellCounts).sort();
    if (fKeys.join(',') !== cKeys.join(',')) throw new Error(`晶胞粒子元素（${cKeys.join('/')}）与化学式 ${formula}（${fKeys.join('/')}）不一致`);
    const ratios = fKeys.map((el) => cellCounts[el] / parsedFormula.counts[el]);
    if (!(ratios[0] > 0) || ratios.some((r) => Math.abs(r - ratios[0]) > 1e-2)) {
      const actual = cKeys.map((el) => `${el}:${Number(cellCounts[el].toFixed(2))}`).join(', ');
      throw new Error(`晶胞均摊计量比（${actual}）与化学式 ${formula} 不符，请核对 basisAtoms`);
    }
    zVal = snap(ratios[0]);
  } else {
    zVal = gcdFromSpecies();
  }
  const mVal = cellMass > 0 ? Number((cellMass / zVal).toFixed(2)) : (Number(dRaw.molarMass) > 0 ? Number(Number(dRaw.molarMass).toFixed(2)) : 0);
  const rho = mVal > 0 ? computeDensity(zVal, mVal, lattice) : NaN;
  if (Number.isFinite(rho) && (rho < 0.3 || rho > 26)) {
    throw new Error(`晶胞理论密度 ρ = ${rho.toFixed(2)} g/cm³ 超出真实晶体合理范围（0.3～26 g/cm³），请检查晶胞参数（单位 pm）或原子数`);
  }
  let formulaText = String(dRaw.formulaText || '').trim();
  formulaText = formulaText ? formulaText.replace(/\(\s*\d+(?:\.\d+)?\s*×\s*M\s*\)/, `(${zVal} × M)`) : defaultFormulaText(zVal);
  return { Z: zVal, molarMass: mVal, valueGcm3: Number.isFinite(rho) ? Number(rho.toFixed(2)) : null, formulaText };
}

module.exports = {
  clamp, snap, fracToPm, distPm, computeDensity, normFrac, dedupBasis,
  buildDistanceMatrixAndCheckCollisions, solveHardSphereRadii,
  analyzePeriodicCoordination, analyzeShortestDistance,
  resolveBondCutoffAndRule, resolveSpeciesCompositionAndMass,
  maybePromoteCoarseMolecularSpecies, verifyStoichiometryAndDensity,
};
