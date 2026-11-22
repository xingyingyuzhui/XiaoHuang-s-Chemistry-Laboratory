/**
 * 权威化学参考数据与化学式解析器（晶胞校验与分子校验共用）
 * 涵盖 118 种 IUPAC 元素原子量、共价/金属/香农离子半径、教科书 CPK 配色与化学式解析。
 */

// [元素符号, 标准原子量(g/mol), 共价半径(pm)]
const ELEMENT_ROWS = [
  ['H', 1.008, 31], ['He', 4.003, 28], ['Li', 6.94, 128], ['Be', 9.012, 96], ['B', 10.81, 84],
  ['C', 12.011, 76], ['N', 14.007, 71], ['O', 15.999, 66], ['F', 18.998, 57], ['Ne', 20.18, 58],
  ['Na', 22.99, 166], ['Mg', 24.305, 141], ['Al', 26.982, 121], ['Si', 28.085, 111], ['P', 30.974, 107],
  ['S', 32.06, 105], ['Cl', 35.45, 102], ['Ar', 39.948, 106], ['K', 39.098, 203], ['Ca', 40.078, 176],
  ['Sc', 44.956, 170], ['Ti', 47.867, 160], ['V', 50.942, 153], ['Cr', 51.996, 139], ['Mn', 54.938, 139],
  ['Fe', 55.845, 132], ['Co', 58.933, 126], ['Ni', 58.693, 124], ['Cu', 63.546, 132], ['Zn', 65.38, 122],
  ['Ga', 69.723, 122], ['Ge', 72.63, 120], ['As', 74.922, 119], ['Se', 78.971, 120], ['Br', 79.904, 120],
  ['Kr', 83.798, 116], ['Rb', 85.468, 220], ['Sr', 87.62, 195], ['Y', 88.906, 190], ['Zr', 91.224, 175],
  ['Nb', 92.906, 164], ['Mo', 95.95, 154], ['Tc', 98, 147], ['Ru', 101.07, 146], ['Rh', 102.91, 142],
  ['Pd', 106.42, 139], ['Ag', 107.87, 145], ['Cd', 112.41, 144], ['In', 114.82, 142], ['Sn', 118.71, 139],
  ['Sb', 121.76, 139], ['Te', 127.6, 138], ['I', 126.9, 139], ['Xe', 131.29, 140], ['Cs', 132.91, 244],
  ['Ba', 137.33, 215], ['La', 138.91, 207], ['Ce', 140.12, 204], ['Pr', 140.91, 203], ['Nd', 144.24, 201],
  ['Pm', 145, 199], ['Sm', 150.36, 198], ['Eu', 151.96, 198], ['Gd', 157.25, 196], ['Tb', 158.93, 194],
  ['Dy', 162.5, 192], ['Ho', 164.93, 192], ['Er', 167.26, 189], ['Tm', 168.93, 190], ['Yb', 173.05, 187],
  ['Lu', 174.97, 187], ['Hf', 178.49, 175], ['Ta', 180.95, 170], ['W', 183.84, 162], ['Re', 186.21, 151],
  ['Os', 190.23, 144], ['Ir', 192.22, 141], ['Pt', 195.08, 136], ['Au', 196.97, 136], ['Hg', 200.59, 132],
  ['Tl', 204.38, 145], ['Pb', 207.2, 146], ['Bi', 208.98, 148], ['Po', 208.98, 140], ['At', 210, 150],
  ['Rn', 222, 150], ['Fr', 223, 260], ['Ra', 226, 221], ['Ac', 227, 215], ['Th', 232.04, 206],
  ['Pa', 231.04, 200], ['U', 238.03, 196], ['Np', 237, 190], ['Pu', 244, 187], ['Am', 243, 180],
  ['Cm', 247, 169], ['Bk', 247, 166], ['Cf', 251, 168], ['Es', 252, 165], ['Fm', 257, 167],
  ['Md', 258, 173], ['No', 259, 176], ['Lr', 266, 161], ['Rf', 267, 157], ['Db', 268, 149],
  ['Sg', 269, 143], ['Bh', 270, 141], ['Hs', 277, 134], ['Mt', 278, 129], ['Ds', 281, 128],
  ['Rg', 282, 121], ['Cn', 285, 122], ['Nh', 286, 136], ['Fl', 289, 143], ['Mc', 290, 162],
  ['Lv', 293, 175], ['Ts', 294, 165], ['Og', 294, 157],
];

const IUPAC_ELEMENTS = new Set();
const ATOMIC_WEIGHTS = Object.create(null);
const COVALENT_RADII_PM = Object.create(null);
for (const [sym, wt, rad] of ELEMENT_ROWS) {
  IUPAC_ELEMENTS.add(sym);
  ATOMIC_WEIGHTS[sym] = wt;
  COVALENT_RADII_PM[sym] = rad;
}

const CPK_COLORS = {
  H: 0xeef2f6, He: 0x9ad8e8, Li: 0xb57edc, Be: 0x74b856, B: 0xe879a0,
  C: 0x3f4654, N: 0x3b6ef5, O: 0xe03e3e, F: 0x73c255, Ne: 0x82c8e5,
  Na: 0x8b5cf6, Mg: 0x8fa3b8, Al: 0xa8b0b8, Si: 0x7b88a8, P: 0xf08c2b,
  S: 0xe6b800, Cl: 0x22b573, Ar: 0x6ab8de, K: 0x7c4dff, Ca: 0x5bb85d,
  Ti: 0x738294, V: 0x8a95a5, Cr: 0x6c88b5, Mn: 0x9c72b8, Fe: 0xc2653b,
  Co: 0x4a77b5, Ni: 0x58a86a, Cu: 0xd97742, Zn: 0x7d8a99, Ga: 0xa28c9c,
  Ge: 0x6b8e8e, As: 0x9d75c8, Se: 0xe6952e, Br: 0xa63a3a, Rb: 0x7645c8,
  Sr: 0x52b768, Zr: 0x689fb8, Nb: 0x62a4b8, Mo: 0x5c94a8, Ag: 0xc0cad4,
  Cd: 0xcfb568, Sn: 0x708090, Te: 0xc47d3b, I: 0x8b46a8, Cs: 0xd9822b,
  Ba: 0x45a854, W: 0x5f748c, Pt: 0xb8c2cc, Au: 0xe6b800, Hg: 0x9fa8b8,
  Pb: 0x5b6472, Po: 0x9b82e0,
};
const METALLIC_COLOR_OVERRIDE = { Na: 0xc8d0da, Fe: 0x7d8a99 };

const METALLIC_RADII_PM = {
  Li: 152, Be: 112, Na: 186, Mg: 160, Al: 143, K: 227, Ca: 197, Ti: 147, V: 134,
  Cr: 128, Mn: 127, Fe: 126, Co: 125, Ni: 124, Cu: 128, Zn: 134, Ga: 135, Rb: 248,
  Sr: 215, Zr: 160, Nb: 146, Mo: 139, Ru: 134, Rh: 134, Pd: 137, Ag: 144, Cd: 151,
  In: 167, Sn: 158, Cs: 265, Ba: 222, W: 139, Os: 135, Ir: 136, Pt: 139, Au: 144,
  Hg: 151, Pb: 175, Bi: 156, Po: 168,
};

const IONIC_RADII_PM = {
  'Li+': 76, 'Na+': 102, 'K+': 138, 'Rb+': 152, 'Cs+': 167, 'Be2+': 45, 'Mg2+': 72,
  'Ca2+': 112, 'Sr2+': 126, 'Ba2+': 142, 'Al3+': 53.5, 'Ti4+': 60.5, 'Ti3+': 67,
  'Cr3+': 61.5, 'Mn2+': 83, 'Fe2+': 78, 'Fe3+': 64.5, 'Co2+': 74.5, 'Ni2+': 69,
  'Cu+': 77, 'Cu2+': 73, 'Zn2+': 74, 'Ga3+': 62, 'Ag+': 115, 'Cd2+': 95, 'Sn4+': 69,
  'Pb2+': 119, 'Zr4+': 72, 'Si4+': 40, 'B3+': 27, 'La3+': 103,
  'H-': 154, 'F-': 133, 'Cl-': 181, 'Br-': 196, 'I-': 220, 'O2-': 140,
  'S2-': 184, 'Se2-': 198, 'Te2-': 221, 'N3-': 146, 'P3-': 212,
};
const DEFAULT_ION_KEY = {
  Li: 'Li+', Na: 'Na+', K: 'K+', Rb: 'Rb+', Cs: 'Cs+', Be: 'Be2+', Mg: 'Mg2+',
  Ca: 'Ca2+', Sr: 'Sr2+', Ba: 'Ba2+', Al: 'Al3+', Ti: 'Ti4+', Cr: 'Cr3+', Mn: 'Mn2+',
  Fe: 'Fe2+', Co: 'Co2+', Ni: 'Ni2+', Cu: 'Cu2+', Zn: 'Zn2+', Ga: 'Ga3+', Ag: 'Ag+',
  Cd: 'Cd2+', Sn: 'Sn4+', Pb: 'Pb2+', Zr: 'Zr4+', Si: 'Si4+', B: 'B3+',
  F: 'F-', Cl: 'Cl-', Br: 'Br-', I: 'I-', O: 'O2-', S: 'S2-', Se: 'Se2-',
  Te: 'Te2-', N: 'N3-', P: 'P3-',
};

const VALENCE_MAX = {
  H: 1, F: 1, Li: 1, Na: 1, K: 1, Rb: 1, Cs: 1, He: 0, Ne: 0, Ar: 0,
  Be: 4, Mg: 2, Ca: 2, Sr: 2, Ba: 2, B: 4, Al: 6, C: 4, Si: 6,
  N: 4, P: 6, As: 5, O: 3, S: 6, Se: 6, Te: 6, Cl: 7, Br: 7, I: 7,
};

const SUB_MAP = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
const SUP_MAP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-' };
const ABSTRACT_TEXT_RE = /抽象|陌生|未知|假想|某立方|某晶胞|某晶体/;

const normalizeSub = (s) => String(s || '').replace(/[₀-₉]/g, (c) => SUB_MAP[c]);
const normalizeSup = (s) => String(s || '').replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻]/g, (c) => SUP_MAP[c]);

function parseFormulaSegment(seg) {
  const stack = [Object.create(null)];
  let i = 0;
  while (i < seg.length) {
    const ch = seg[i];
    if (ch === '(' || ch === '[') { stack.push(Object.create(null)); i += 1; continue; }
    if (ch === ')' || ch === ']') {
      if (stack.length < 2) return null;
      i += 1;
      const numM = seg.slice(i).match(/^\d+/);
      const mult = numM ? parseInt(numM[0], 10) : 1;
      if (numM) i += numM[0].length;
      const top = stack.pop();
      const dst = stack[stack.length - 1];
      for (const [el, cnt] of Object.entries(top)) dst[el] = (dst[el] || 0) + cnt * mult;
      continue;
    }
    const elM = seg.slice(i).match(/^([A-Z][a-z]?)(\d*)/);
    if (!elM) return null;
    const [, el, nStr] = elM;
    if (!IUPAC_ELEMENTS.has(el)) return null;
    const cnt = nStr ? parseInt(nStr, 10) : 1;
    if (!(cnt > 0)) return null;
    const dst = stack[stack.length - 1];
    dst[el] = (dst[el] || 0) + cnt;
    i += elM[0].length;
  }
  return stack.length === 1 ? stack[0] : null;
}

function parseChemicalFormula(raw) {
  let s = normalizeSub(String(raw || '').trim()).replace(/\s+/g, '');
  if (!s) return null;
  if (/[δ~≈?]|(?:^|[^A-Za-z])[xyz](?:$|[^a-z])/i.test(s) && !/^Xe|^Zn|^Zr|^Yb|^Y\b/.test(s)) {
    if (/[δ~≈?]|[0-9][+-][xyz]|[a-z][+-][xyz]|[₀-₉][xyz]|[^A-Za-z][xyz]$/i.test(s)) return null;
  }
  s = normalizeSup(s).replace(/(?:\d+[+-]|[+-]\d*)$/, '');
  if (!s || /[^A-Za-z0-9()[\]·.]/.test(s)) return null;
  const parts = s.split(/[·.]/).filter(Boolean);
  if (!parts.length) return null;
  const counts = Object.create(null);
  for (const part of parts) {
    const lead = part.match(/^(\d+)(.+)$/);
    const mult = lead ? parseInt(lead[1], 10) : 1;
    const body = lead ? lead[2] : part;
    const seg = parseFormulaSegment(body);
    if (!seg || !Object.keys(seg).length) return null;
    for (const [el, cnt] of Object.entries(seg)) counts[el] = (counts[el] || 0) + cnt * mult;
  }
  let molarMass = 0;
  for (const [el, cnt] of Object.entries(counts)) molarMass += ATOMIC_WEIGHTS[el] * cnt;
  return { counts, molarMass };
}

function parseSpeciesBase(rawStr) {
  const s0 = normalizeSup(normalizeSub(String(rawStr || '').trim())).replace(/\s+/g, '');
  if (!s0) return { base: '', element: null, charge: 0, composition: null, mass: null, isIupac: false };
  let charge = 0;
  let base = s0;
  const cMatch = s0.match(/(\d*)([+-])$/);
  if (cMatch) {
    const mag = cMatch[1] ? parseInt(cMatch[1], 10) : 1;
    charge = cMatch[2] === '+' ? mag : -mag;
    base = s0.slice(0, -cMatch[0].length);
  }
  if (IUPAC_ELEMENTS.has(base)) {
    return { base, element: base, charge, composition: { [base]: 1 }, mass: ATOMIC_WEIGHTS[base], isIupac: true };
  }
  const parsed = parseChemicalFormula(base);
  if (parsed) {
    const els = Object.keys(parsed.counts);
    const primary = els.length === 1 ? els[0] : els.find((e) => e !== 'H' && e !== 'O') || els[0];
    return { base, element: primary, charge, composition: parsed.counts, mass: parsed.molarMass, isIupac: true };
  }
  return { base, element: null, charge, composition: null, mass: null, isIupac: false };
}

function detectAbstractCell(raw, speciesMeta) {
  if (speciesMeta.some((m) => !m.isIupac)) return true;
  const text = `${raw?.name || ''} ${raw?.formula || ''} ${raw?.subtitle || ''}`;
  return ABSTRACT_TEXT_RE.test(text);
}

function getElementColor(el, category) {
  if (category === 'metallic' && METALLIC_COLOR_OVERRIDE[el] != null) return METALLIC_COLOR_OVERRIDE[el];
  if (CPK_COLORS[el] != null) return CPK_COLORS[el];
  let hash = 0;
  for (const ch of String(el || 'X')) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffff;
  return 0x485870 | (hash & 0x5f5f5f);
}

function shiftColorLuminance(hex, factor) {
  const clampB = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clampB(((hex >> 16) & 255) * factor);
  const g = clampB(((hex >> 8) & 255) * factor);
  const b = clampB((hex & 255) * factor);
  return (r << 16) | (g << 8) | b;
}

function getSpeciesSeedRadiusPm(meta, category) {
  if (!meta?.element) return 120;
  const el = meta.element;
  if (meta.charge !== 0) {
    const mag = Math.abs(meta.charge);
    const key = `${el}${mag > 1 ? mag : ''}${meta.charge > 0 ? '+' : '-'}`;
    if (IONIC_RADII_PM[key]) return IONIC_RADII_PM[key];
  }
  if (category === 'ionic') {
    const key = DEFAULT_ION_KEY[el];
    if (key && IONIC_RADII_PM[key]) return IONIC_RADII_PM[key];
  }
  if (category === 'metallic' && METALLIC_RADII_PM[el]) return METALLIC_RADII_PM[el];
  return COVALENT_RADII_PM[el] || 120;
}

module.exports = {
  IUPAC_ELEMENTS, ATOMIC_WEIGHTS, COVALENT_RADII_PM, METALLIC_RADII_PM, IONIC_RADII_PM,
  CPK_COLORS, VALENCE_MAX, parseChemicalFormula, parseSpeciesBase, detectAbstractCell,
  getElementColor, shiftColorLuminance, getSpeciesSeedRadiusPm,
};
