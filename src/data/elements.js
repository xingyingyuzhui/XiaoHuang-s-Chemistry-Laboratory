/**
 * 标准周期表数据（对齐教材布局 + s/p/d/ds/f 分区）
 * period/group: 主表 1–7 / 1–18
 * f 区：period 6→grid row 9，period 7→grid row 10；col 为镧/锕行内列 4–18
 */

export const BLOCKS = {
  s: { id: 's', label: 's 区', color: '#ffedd5' },
  p: { id: 'p', label: 'p 区', color: '#e0f2fe' },
  d: { id: 'd', label: 'd 区', color: '#fef3c7' },
  ds: { id: 'ds', label: 'ds 区', color: '#bbf7d0' },
  f: { id: 'f', label: 'f 区', color: '#fce7f3' },
  noble: { id: 'noble', label: '稀有气体', color: '#ddd6fe' },
};

export const GROUP_OLD = {
  1: 'IA',
  2: 'IIA',
  3: 'IIIB',
  4: 'IVB',
  5: 'VB',
  6: 'VIB',
  7: 'VIIB',
  8: 'VIII',
  9: 'VIII',
  10: 'VIII',
  11: 'IB',
  12: 'IIB',
  13: 'IIIA',
  14: 'IVA',
  15: 'VA',
  16: 'VIA',
  17: 'VIIA',
  18: '0',
};

/** 族标竖直位置（与常见教材顶栏一致） */
export function groupLabelRow(group) {
  if (group === 1 || group === 18) return 1;
  if (group === 2 || (group >= 13 && group <= 17)) return 2;
  return 4;
}

export const PHASE_LABEL = {
  solid: '固态',
  liquid: '液态',
  gas: '气态',
};

// [z, symbol, name, nameEn, massDisplay, period, group, block, stair?, config?]
// massDisplay 为展示用字符串（含 [ ] 放射性近似值）
const RAW = [
  [1, 'H', '氢', 'Hydrogen', '1.008', 1, 1, 's', false, '1s¹'],
  [2, 'He', '氦', 'Helium', '4.0026', 1, 18, 'p', false, '1s²'],

  [3, 'Li', '锂', 'Lithium', '6.94', 2, 1, 's', false, '[He] 2s¹'],
  [4, 'Be', '铍', 'Beryllium', '9.0122', 2, 2, 's', false, '[He] 2s²'],
  [5, 'B', '硼', 'Boron', '10.81', 2, 13, 'p', true, '[He] 2s² 2p¹'],
  [6, 'C', '碳', 'Carbon', '12.011', 2, 14, 'p', false, '[He] 2s² 2p²'],
  [7, 'N', '氮', 'Nitrogen', '14.007', 2, 15, 'p', false, '[He] 2s² 2p³'],
  [8, 'O', '氧', 'Oxygen', '15.999', 2, 16, 'p', false, '[He] 2s² 2p⁴'],
  [9, 'F', '氟', 'Fluorine', '18.998', 2, 17, 'p', false, '[He] 2s² 2p⁵'],
  [10, 'Ne', '氖', 'Neon', '20.180', 2, 18, 'p', false, '[He] 2s² 2p⁶'],

  [11, 'Na', '钠', 'Sodium', '22.990', 3, 1, 's', false, '[Ne] 3s¹'],
  [12, 'Mg', '镁', 'Magnesium', '24.305', 3, 2, 's', false, '[Ne] 3s²'],
  [13, 'Al', '铝', 'Aluminium', '26.982', 3, 13, 'p', true, '[Ne] 3s² 3p¹'],
  [14, 'Si', '硅', 'Silicon', '28.085', 3, 14, 'p', true, '[Ne] 3s² 3p²'],
  [15, 'P', '磷', 'Phosphorus', '30.974', 3, 15, 'p', false, '[Ne] 3s² 3p³'],
  [16, 'S', '硫', 'Sulfur', '32.06', 3, 16, 'p', false, '[Ne] 3s² 3p⁴'],
  [17, 'Cl', '氯', 'Chlorine', '35.45', 3, 17, 'p', false, '[Ne] 3s² 3p⁵'],
  [18, 'Ar', '氩', 'Argon', '39.948', 3, 18, 'p', false, '[Ne] 3s² 3p⁶'],

  [19, 'K', '钾', 'Potassium', '39.098', 4, 1, 's', false, '[Ar] 4s¹'],
  [20, 'Ca', '钙', 'Calcium', '40.078', 4, 2, 's', false, '[Ar] 4s²'],
  [21, 'Sc', '钪', 'Scandium', '44.956', 4, 3, 'd', false, '[Ar] 3d¹ 4s²'],
  [22, 'Ti', '钛', 'Titanium', '47.867', 4, 4, 'd', false, '[Ar] 3d² 4s²'],
  [23, 'V', '钒', 'Vanadium', '50.942', 4, 5, 'd', false, '[Ar] 3d³ 4s²'],
  [24, 'Cr', '铬', 'Chromium', '51.996', 4, 6, 'd', false, '[Ar] 3d⁵ 4s¹'],
  [25, 'Mn', '锰', 'Manganese', '54.938', 4, 7, 'd', false, '[Ar] 3d⁵ 4s²'],
  [26, 'Fe', '铁', 'Iron', '55.845', 4, 8, 'd', false, '[Ar] 3d⁶ 4s²'],
  [27, 'Co', '钴', 'Cobalt', '58.933', 4, 9, 'd', false, '[Ar] 3d⁷ 4s²'],
  [28, 'Ni', '镍', 'Nickel', '58.693', 4, 10, 'd', false, '[Ar] 3d⁸ 4s²'],
  [29, 'Cu', '铜', 'Copper', '63.546', 4, 11, 'ds', false, '[Ar] 3d¹⁰ 4s¹'],
  [30, 'Zn', '锌', 'Zinc', '65.38', 4, 12, 'ds', false, '[Ar] 3d¹⁰ 4s²'],
  [31, 'Ga', '镓', 'Gallium', '69.723', 4, 13, 'p', false, '[Ar] 3d¹⁰ 4s² 4p¹'],
  [32, 'Ge', '锗', 'Germanium', '72.630', 4, 14, 'p', true, '[Ar] 3d¹⁰ 4s² 4p²'],
  [33, 'As', '砷', 'Arsenic', '74.922', 4, 15, 'p', true, '[Ar] 3d¹⁰ 4s² 4p³'],
  [34, 'Se', '硒', 'Selenium', '78.971', 4, 16, 'p', false, '[Ar] 3d¹⁰ 4s² 4p⁴'],
  [35, 'Br', '溴', 'Bromine', '79.904', 4, 17, 'p', false, '[Ar] 3d¹⁰ 4s² 4p⁵'],
  [36, 'Kr', '氪', 'Krypton', '83.798', 4, 18, 'p', false, '[Ar] 3d¹⁰ 4s² 4p⁶'],

  [37, 'Rb', '铷', 'Rubidium', '85.468', 5, 1, 's', false, '[Kr] 5s¹'],
  [38, 'Sr', '锶', 'Strontium', '87.62', 5, 2, 's', false, '[Kr] 5s²'],
  [39, 'Y', '钇', 'Yttrium', '88.906', 5, 3, 'd', false, '[Kr] 4d¹ 5s²'],
  [40, 'Zr', '锆', 'Zirconium', '91.224', 5, 4, 'd', false, '[Kr] 4d² 5s²'],
  [41, 'Nb', '铌', 'Niobium', '92.906', 5, 5, 'd', false, '[Kr] 4d⁴ 5s¹'],
  [42, 'Mo', '钼', 'Molybdenum', '95.95', 5, 6, 'd', false, '[Kr] 4d⁵ 5s¹'],
  [43, 'Tc', '锝', 'Technetium', '[98]', 5, 7, 'd', false, '[Kr] 4d⁵ 5s²'],
  [44, 'Ru', '钌', 'Ruthenium', '101.07', 5, 8, 'd', false, '[Kr] 4d⁷ 5s¹'],
  [45, 'Rh', '铑', 'Rhodium', '102.91', 5, 9, 'd', false, '[Kr] 4d⁸ 5s¹'],
  [46, 'Pd', '钯', 'Palladium', '106.42', 5, 10, 'd', false, '[Kr] 4d¹⁰'],
  [47, 'Ag', '银', 'Silver', '107.87', 5, 11, 'ds', false, '[Kr] 4d¹⁰ 5s¹'],
  [48, 'Cd', '镉', 'Cadmium', '112.41', 5, 12, 'ds', false, '[Kr] 4d¹⁰ 5s²'],
  [49, 'In', '铟', 'Indium', '114.82', 5, 13, 'p', false, '[Kr] 4d¹⁰ 5s² 5p¹'],
  [50, 'Sn', '锡', 'Tin', '118.71', 5, 14, 'p', false, '[Kr] 4d¹⁰ 5s² 5p²'],
  [51, 'Sb', '锑', 'Antimony', '121.76', 5, 15, 'p', true, '[Kr] 4d¹⁰ 5s² 5p³'],
  [52, 'Te', '碲', 'Tellurium', '127.60', 5, 16, 'p', true, '[Kr] 4d¹⁰ 5s² 5p⁴'],
  [53, 'I', '碘', 'Iodine', '126.90', 5, 17, 'p', false, '[Kr] 4d¹⁰ 5s² 5p⁵'],
  [54, 'Xe', '氙', 'Xenon', '131.29', 5, 18, 'p', false, '[Kr] 4d¹⁰ 5s² 5p⁶'],

  [55, 'Cs', '铯', 'Caesium', '132.91', 6, 1, 's', false, '[Xe] 6s¹'],
  [56, 'Ba', '钡', 'Barium', '137.33', 6, 2, 's', false, '[Xe] 6s²'],
  // 主表第 6 周期第 3 族空缺，La 在镧系行
  [72, 'Hf', '铪', 'Hafnium', '178.49', 6, 4, 'd', false, '[Xe] 4f¹⁴ 5d² 6s²'],
  [73, 'Ta', '钽', 'Tantalum', '180.95', 6, 5, 'd', false, '[Xe] 4f¹⁴ 5d³ 6s²'],
  [74, 'W', '钨', 'Tungsten', '183.84', 6, 6, 'd', false, '[Xe] 4f¹⁴ 5d⁴ 6s²'],
  [75, 'Re', '铼', 'Rhenium', '186.21', 6, 7, 'd', false, '[Xe] 4f¹⁴ 5d⁵ 6s²'],
  [76, 'Os', '锇', 'Osmium', '190.23', 6, 8, 'd', false, '[Xe] 4f¹⁴ 5d⁶ 6s²'],
  [77, 'Ir', '铱', 'Iridium', '192.22', 6, 9, 'd', false, '[Xe] 4f¹⁴ 5d⁷ 6s²'],
  [78, 'Pt', '铂', 'Platinum', '195.08', 6, 10, 'd', false, '[Xe] 4f¹⁴ 5d⁹ 6s¹'],
  [79, 'Au', '金', 'Gold', '196.97', 6, 11, 'ds', false, '[Xe] 4f¹⁴ 5d¹⁰ 6s¹'],
  [80, 'Hg', '汞', 'Mercury', '200.59', 6, 12, 'ds', false, '[Xe] 4f¹⁴ 5d¹⁰ 6s²'],
  [81, 'Tl', '铊', 'Thallium', '204.38', 6, 13, 'p', false, '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p¹'],
  [82, 'Pb', '铅', 'Lead', '207.2', 6, 14, 'p', false, '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p²'],
  [83, 'Bi', '铋', 'Bismuth', '208.98', 6, 15, 'p', false, '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p³'],
  [84, 'Po', '钋', 'Polonium', '[209]', 6, 16, 'p', true, '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁴'],
  [85, 'At', '砹', 'Astatine', '[210]', 6, 17, 'p', false, '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁵'],
  [86, 'Rn', '氡', 'Radon', '[222]', 6, 18, 'p', false, '[Xe] 4f¹⁴ 5d¹⁰ 6s² 6p⁶'],

  [87, 'Fr', '钫', 'Francium', '[223]', 7, 1, 's', false, '[Rn] 7s¹'],
  [88, 'Ra', '镭', 'Radium', '[226]', 7, 2, 's', false, '[Rn] 7s²'],
  [104, 'Rf', '\u{2CB3B}', 'Rutherfordium', '[267]', 7, 4, 'd', false, '—'],
  [105, 'Db', '\u{2CB4A}', 'Dubnium', '[268]', 7, 5, 'd', false, '—'],
  [106, 'Sg', '\u{2CB73}', 'Seaborgium', '[269]', 7, 6, 'd', false, '—'],
  [107, 'Bh', '\u{2CB5B}', 'Bohrium', '[270]', 7, 7, 'd', false, '—'],
  [108, 'Hs', '\u{2CB76}', 'Hassium', '[277]', 7, 8, 'd', false, '—'],
  [109, 'Mt', '\u{9FCF}', 'Meitnerium', '[278]', 7, 9, 'd', false, '—'],
  [110, 'Ds', '\u{2B7FC}', 'Darmstadtium', '[281]', 7, 10, 'd', false, '—'],
  [111, 'Rg', '\u{2CB2D}', 'Roentgenium', '[282]', 7, 11, 'ds', false, '—'],
  [112, 'Cn', '\u{9FD4}', 'Copernicium', '[285]', 7, 12, 'ds', false, '—'],
  [113, 'Nh', '\u{9FED}', 'Nihonium', '[286]', 7, 13, 'p', false, '—'],
  [114, 'Fl', '\u{2B4E7}', 'Flerovium', '[289]', 7, 14, 'p', false, '—'],
  [115, 'Mc', '\u{9546}', 'Moscovium', '[290]', 7, 15, 'p', false, '—'],
  [116, 'Lv', '\u{2B7F7}', 'Livermorium', '[293]', 7, 16, 'p', false, '—'],
  [117, 'Ts', '\u{9FEC}', 'Tennessine', '[294]', 7, 17, 'p', false, '—'],
  [118, 'Og', '\u{9FEB}', 'Oganesson', '[294]', 7, 18, 'p', false, '—'],

  // 镧系 La–Lu → grid row 9, cols 4–18
  [57, 'La', '镧', 'Lanthanum', '138.91', 6, 3, 'f', false, '[Xe] 5d¹ 6s²'],
  [58, 'Ce', '铈', 'Cerium', '140.12', 6, 3, 'f', false, '[Xe] 4f¹ 5d¹ 6s²'],
  [59, 'Pr', '镨', 'Praseodymium', '140.91', 6, 3, 'f', false, '[Xe] 4f³ 6s²'],
  [60, 'Nd', '钕', 'Neodymium', '144.24', 6, 3, 'f', false, '[Xe] 4f⁴ 6s²'],
  [61, 'Pm', '钷', 'Promethium', '[145]', 6, 3, 'f', false, '[Xe] 4f⁵ 6s²'],
  [62, 'Sm', '钐', 'Samarium', '150.36', 6, 3, 'f', false, '[Xe] 4f⁶ 6s²'],
  [63, 'Eu', '铕', 'Europium', '151.96', 6, 3, 'f', false, '[Xe] 4f⁷ 6s²'],
  [64, 'Gd', '钆', 'Gadolinium', '157.25', 6, 3, 'f', false, '[Xe] 4f⁷ 5d¹ 6s²'],
  [65, 'Tb', '铽', 'Terbium', '158.93', 6, 3, 'f', false, '[Xe] 4f⁹ 6s²'],
  [66, 'Dy', '镝', 'Dysprosium', '162.50', 6, 3, 'f', false, '[Xe] 4f¹⁰ 6s²'],
  [67, 'Ho', '钬', 'Holmium', '164.93', 6, 3, 'f', false, '[Xe] 4f¹¹ 6s²'],
  [68, 'Er', '铒', 'Erbium', '167.26', 6, 3, 'f', false, '[Xe] 4f¹² 6s²'],
  [69, 'Tm', '铥', 'Thulium', '168.93', 6, 3, 'f', false, '[Xe] 4f¹³ 6s²'],
  [70, 'Yb', '镱', 'Ytterbium', '173.05', 6, 3, 'f', false, '[Xe] 4f¹⁴ 6s²'],
  [71, 'Lu', '镥', 'Lutetium', '174.97', 6, 3, 'f', false, '[Xe] 4f¹⁴ 5d¹ 6s²'],

  // 锕系 Ac–Lr → grid row 10
  [89, 'Ac', '锕', 'Actinium', '[227]', 7, 3, 'f', false, '[Rn] 6d¹ 7s²'],
  [90, 'Th', '钍', 'Thorium', '232.04', 7, 3, 'f', false, '[Rn] 6d² 7s²'],
  [91, 'Pa', '镤', 'Protactinium', '231.04', 7, 3, 'f', false, '[Rn] 5f² 6d¹ 7s²'],
  [92, 'U', '铀', 'Uranium', '238.03', 7, 3, 'f', false, '[Rn] 5f³ 6d¹ 7s²'],
  [93, 'Np', '镎', 'Neptunium', '[237]', 7, 3, 'f', false, '[Rn] 5f⁴ 6d¹ 7s²'],
  [94, 'Pu', '钚', 'Plutonium', '[244]', 7, 3, 'f', false, '[Rn] 5f⁶ 7s²'],
  [95, 'Am', '镅', 'Americium', '[243]', 7, 3, 'f', false, '[Rn] 5f⁷ 7s²'],
  [96, 'Cm', '锔', 'Curium', '[247]', 7, 3, 'f', false, '[Rn] 5f⁷ 6d¹ 7s²'],
  [97, 'Bk', '锫', 'Berkelium', '[247]', 7, 3, 'f', false, '[Rn] 5f⁹ 7s²'],
  [98, 'Cf', '锎', 'Californium', '[251]', 7, 3, 'f', false, '[Rn] 5f¹⁰ 7s²'],
  [99, 'Es', '锿', 'Einsteinium', '[252]', 7, 3, 'f', false, '[Rn] 5f¹¹ 7s²'],
  [100, 'Fm', '镄', 'Fermium', '[257]', 7, 3, 'f', false, '[Rn] 5f¹² 7s²'],
  [101, 'Md', '钔', 'Mendelevium', '[258]', 7, 3, 'f', false, '[Rn] 5f¹³ 7s²'],
  [102, 'No', '锘', 'Nobelium', '[259]', 7, 3, 'f', false, '[Rn] 5f¹⁴ 7s²'],
  [103, 'Lr', '铹', 'Lawrencium', '[266]', 7, 3, 'f', false, '[Rn] 5f¹⁴ 7s² 7p¹'],
];

const LAN_ORDER = [57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71];
const ACT_ORDER = [89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 100, 101, 102, 103];

function parseMass(display) {
  const n = Number(String(display).replace(/[\[\]]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function toElement(row) {
  const [z, symbol, name, nameEn, massDisplay, period, group, block, stair, config] = row;
  let gridRow = period;
  let gridCol = group;
  let series = null;

  if (block === 'f') {
    if (LAN_ORDER.includes(z)) {
      gridRow = 9;
      gridCol = 4 + LAN_ORDER.indexOf(z);
      series = 'lanthanide';
    } else if (ACT_ORDER.includes(z)) {
      gridRow = 10;
      gridCol = 4 + ACT_ORDER.indexOf(z);
      series = 'actinide';
    }
  }

  const isNoble = group === 18 && block !== 'f';

  return {
    z,
    symbol,
    name,
    nameEn,
    massDisplay,
    mass: parseMass(massDisplay),
    period,
    group,
    block,
    isNoble,
    stair: Boolean(stair),
    config: config || '—',
    gridRow,
    gridCol,
    series,
    summary: '',
  };
}

export const ELEMENTS = RAW.map(toElement);

export const ELEMENTS_BY_SYMBOL = Object.fromEntries(ELEMENTS.map((e) => [e.symbol, e]));
export const ELEMENTS_BY_Z = Object.fromEntries(ELEMENTS.map((e) => [e.z, e]));

export function blockColor(el) {
  if (el.isNoble) return BLOCKS.noble.color;
  return (BLOCKS[el.block] || BLOCKS.p).color;
}

export function blockLabel(el) {
  if (el.isNoble) return BLOCKS.noble.label;
  return (BLOCKS[el.block] || BLOCKS.p).label;
}
