/**
 * 高中化学常见分子 · 球棍示意坐标（Å 量级，仅教学用）
 */

export const ATOM_COLORS = {
  H: 0xffffff,
  C: 0x444444,
  N: 0x3050f8,
  O: 0xff0d0d,
  F: 0x90e050,
  Cl: 0x1ff01f,
  Br: 0xa62929,
  I: 0x940094,
  S: 0xffff30,
  P: 0xff8000,
  B: 0xffb5b5,
  Na: 0xab5cf2,
  Mg: 0x8aff00,
  Al: 0xbfa6a6,
  Si: 0xf0c8a0,
  K: 0x8f40d4,
  Ca: 0x3dff00,
  Fe: 0xe06633,
  default: 0xcc66ff,
};

export const ATOM_RADIUS = {
  H: 0.26,
  C: 0.4,
  N: 0.38,
  O: 0.36,
  F: 0.34,
  Cl: 0.48,
  Br: 0.52,
  I: 0.56,
  S: 0.46,
  P: 0.46,
  B: 0.38,
  Na: 0.5,
  Mg: 0.48,
  Al: 0.48,
  Si: 0.44,
  K: 0.55,
  Ca: 0.52,
  Fe: 0.48,
  default: 0.4,
};

/** @type {Array<{id:string,formula:string,name:string,desc:string,atoms:Array<{el:string,x:number,y:number,z:number}>,bonds:number[][]}>} */
export const MOLECULES = [
  // —— 常见单质 / 双原子 ——
  {
    id: 'h2',
    formula: 'H₂',
    name: '氢气',
    desc: '双原子分子，最轻气体，可燃烧生成水。',
    atoms: [
      { el: 'H', x: -0.37, y: 0, z: 0 },
      { el: 'H', x: 0.37, y: 0, z: 0 },
    ],
    bonds: [[0, 1]],
  },
  {
    id: 'o2',
    formula: 'O₂',
    name: '氧气',
    desc: '双原子分子，支持燃烧与呼吸，空气中约 21%。',
    atoms: [
      { el: 'O', x: -0.6, y: 0, z: 0 },
      { el: 'O', x: 0.6, y: 0, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 1],
    ],
  },
  {
    id: 'n2',
    formula: 'N₂',
    name: '氮气',
    desc: '三键双原子分子，化学性质较稳定，空气中约 78%。',
    atoms: [
      { el: 'N', x: -0.55, y: 0, z: 0 },
      { el: 'N', x: 0.55, y: 0, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
  },
  {
    id: 'cl2',
    formula: 'Cl₂',
    name: '氯气',
    desc: '黄绿色有毒气体，强氧化性，可用于消毒与制盐酸。',
    atoms: [
      { el: 'Cl', x: -0.99, y: 0, z: 0 },
      { el: 'Cl', x: 0.99, y: 0, z: 0 },
    ],
    bonds: [[0, 1]],
  },
  {
    id: 'o3',
    formula: 'O₃',
    name: '臭氧',
    desc: '弯曲形，强氧化性，大气臭氧层可吸收紫外线。',
    atoms: [
      { el: 'O', x: 0, y: 0.35, z: 0 },
      { el: 'O', x: -1.05, y: -0.35, z: 0 },
      { el: 'O', x: 1.05, y: -0.35, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
  },

  // —— 常见无机分子 ——
  {
    id: 'h2o',
    formula: 'H₂O',
    name: '水',
    desc: '弯曲形（约 104.5°），极性分子，生命溶剂，可形成氢键。',
    atoms: [
      { el: 'O', x: 0, y: 0, z: 0 },
      { el: 'H', x: 0.76, y: 0.59, z: 0 },
      { el: 'H', x: -0.76, y: 0.59, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
  },
  {
    id: 'h2o2',
    formula: 'H₂O₂',
    name: '过氧化氢',
    desc: '过氧结构，易分解放氧，常用作消毒与漂白。',
    atoms: [
      { el: 'O', x: -0.74, y: 0.1, z: 0 },
      { el: 'O', x: 0.74, y: -0.1, z: 0 },
      { el: 'H', x: -1.1, y: 0.85, z: 0.4 },
      { el: 'H', x: 1.1, y: -0.85, z: -0.4 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [1, 3],
    ],
  },
  {
    id: 'hcl',
    formula: 'HCl',
    name: '氯化氢',
    desc: '极性共价分子，溶于水得盐酸，高中强酸代表之一。',
    atoms: [
      { el: 'H', x: -0.85, y: 0, z: 0 },
      { el: 'Cl', x: 0.45, y: 0, z: 0 },
    ],
    bonds: [[0, 1]],
  },
  {
    id: 'h2s',
    formula: 'H₂S',
    name: '硫化氢',
    desc: '弯曲形，有臭鸡蛋气味，有毒，弱酸。',
    atoms: [
      { el: 'S', x: 0, y: 0, z: 0 },
      { el: 'H', x: 0.95, y: 0.75, z: 0 },
      { el: 'H', x: -0.95, y: 0.75, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
  },
  {
    id: 'nh3',
    formula: 'NH₃',
    name: '氨',
    desc: '三角锥形，氮肥与制冷相关，易溶于水显碱性。',
    atoms: [
      { el: 'N', x: 0, y: 0.15, z: 0 },
      { el: 'H', x: 0.94, y: -0.3, z: 0 },
      { el: 'H', x: -0.47, y: -0.3, z: 0.81 },
      { el: 'H', x: -0.47, y: -0.3, z: -0.81 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    id: 'co',
    formula: 'CO',
    name: '一氧化碳',
    desc: '直线形，有毒，不完全燃烧产物，可作还原剂。',
    atoms: [
      { el: 'C', x: -0.56, y: 0, z: 0 },
      { el: 'O', x: 0.56, y: 0, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
  },
  {
    id: 'co2',
    formula: 'CO₂',
    name: '二氧化碳',
    desc: '直线形，温室气体，干冰成分，光合作用原料。',
    atoms: [
      { el: 'C', x: 0, y: 0, z: 0 },
      { el: 'O', x: 1.16, y: 0, z: 0 },
      { el: 'O', x: -1.16, y: 0, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 1],
      [0, 2],
      [0, 2],
    ],
  },
  {
    id: 'so2',
    formula: 'SO₂',
    name: '二氧化硫',
    desc: '弯曲形，燃煤废气成分之一，可形成酸雨。',
    atoms: [
      { el: 'S', x: 0, y: 0, z: 0 },
      { el: 'O', x: 1.2, y: 0.7, z: 0 },
      { el: 'O', x: -1.2, y: 0.7, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
  },
  {
    id: 'so3',
    formula: 'SO₃',
    name: '三氧化硫',
    desc: '平面三角形示意，与水反应生成硫酸。',
    atoms: [
      { el: 'S', x: 0, y: 0, z: 0 },
      { el: 'O', x: 1.25, y: 0, z: 0 },
      { el: 'O', x: -0.62, y: 1.08, z: 0 },
      { el: 'O', x: -0.62, y: -1.08, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    id: 'no',
    formula: 'NO',
    name: '一氧化氮',
    desc: '奇电子分子，汽车尾气与雷电固氮相关。',
    atoms: [
      { el: 'N', x: -0.57, y: 0, z: 0 },
      { el: 'O', x: 0.57, y: 0, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 1],
    ],
  },
  {
    id: 'no2',
    formula: 'NO₂',
    name: '二氧化氮',
    desc: '红棕色有毒气体，弯曲形，硝酸工业中间产物。',
    atoms: [
      { el: 'N', x: 0, y: 0.2, z: 0 },
      { el: 'O', x: 1.05, y: -0.35, z: 0 },
      { el: 'O', x: -1.05, y: -0.35, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
    ],
  },
  {
    id: 'nacl',
    formula: 'NaCl',
    name: '氯化钠',
    desc: '离子化合物示意（气态分子对），食盐主要成分。',
    atoms: [
      { el: 'Na', x: -1.15, y: 0, z: 0 },
      { el: 'Cl', x: 1.15, y: 0, z: 0 },
    ],
    bonds: [[0, 1]],
  },

  // —— 有机常见 ——
  {
    id: 'ch4',
    formula: 'CH₄',
    name: '甲烷',
    desc: '正四面体，最简单烷烃，天然气主要成分。',
    atoms: [
      { el: 'C', x: 0, y: 0, z: 0 },
      { el: 'H', x: 0.63, y: 0.63, z: 0.63 },
      { el: 'H', x: -0.63, y: -0.63, z: 0.63 },
      { el: 'H', x: -0.63, y: 0.63, z: -0.63 },
      { el: 'H', x: 0.63, y: -0.63, z: -0.63 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
    ],
  },
  {
    id: 'c2h6',
    formula: 'C₂H₆',
    name: '乙烷',
    desc: '单键连接的两碳烷烃，可发生取代反应。',
    atoms: [
      { el: 'C', x: -0.77, y: 0, z: 0 },
      { el: 'C', x: 0.77, y: 0, z: 0 },
      { el: 'H', x: -1.15, y: 0.9, z: 0.5 },
      { el: 'H', x: -1.15, y: -0.2, z: -0.95 },
      { el: 'H', x: -1.15, y: -0.7, z: 0.45 },
      { el: 'H', x: 1.15, y: 0.9, z: -0.5 },
      { el: 'H', x: 1.15, y: -0.2, z: 0.95 },
      { el: 'H', x: 1.15, y: -0.7, z: -0.45 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [1, 5],
      [1, 6],
      [1, 7],
    ],
  },
  {
    id: 'c2h4',
    formula: 'C₂H₄',
    name: '乙烯',
    desc: '平面形，含碳碳双键，可加成、加聚成聚乙烯。',
    atoms: [
      { el: 'C', x: -0.67, y: 0, z: 0 },
      { el: 'C', x: 0.67, y: 0, z: 0 },
      { el: 'H', x: -1.23, y: 0.93, z: 0 },
      { el: 'H', x: -1.23, y: -0.93, z: 0 },
      { el: 'H', x: 1.23, y: 0.93, z: 0 },
      { el: 'H', x: 1.23, y: -0.93, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 1],
      [0, 2],
      [0, 3],
      [1, 4],
      [1, 5],
    ],
  },
  {
    id: 'c2h2',
    formula: 'C₂H₂',
    name: '乙炔',
    desc: '直线形，含碳碳三键，氧炔焰焊接原料。',
    atoms: [
      { el: 'C', x: -0.6, y: 0, z: 0 },
      { el: 'C', x: 0.6, y: 0, z: 0 },
      { el: 'H', x: -1.66, y: 0, z: 0 },
      { el: 'H', x: 1.66, y: 0, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 1],
      [0, 1],
      [0, 2],
      [1, 3],
    ],
  },
  {
    id: 'ch3oh',
    formula: 'CH₃OH',
    name: '甲醇',
    desc: '最简单的醇，有毒，工业溶剂与燃料相关。',
    atoms: [
      { el: 'C', x: -0.7, y: 0, z: 0 },
      { el: 'O', x: 0.7, y: 0.35, z: 0 },
      { el: 'H', x: -1.1, y: 0.9, z: 0.5 },
      { el: 'H', x: -1.1, y: 0.2, z: -0.95 },
      { el: 'H', x: -1.05, y: -0.95, z: 0.3 },
      { el: 'H', x: 1.25, y: -0.35, z: 0.4 },
    ],
    bonds: [
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [1, 5],
    ],
  },
  {
    id: 'ethanol',
    formula: 'C₂H₅OH',
    name: '乙醇',
    desc: '含羟基的常见醇，饮料酒精、消毒与燃料相关。',
    atoms: [
      { el: 'C', x: -0.8, y: 0, z: 0 },
      { el: 'C', x: 0.7, y: 0, z: 0 },
      { el: 'O', x: 1.4, y: 1.15, z: 0 },
      { el: 'H', x: -1.2, y: 0.9, z: 0.6 },
      { el: 'H', x: -1.2, y: 0.3, z: -0.95 },
      { el: 'H', x: -1.15, y: -0.95, z: 0.3 },
      { el: 'H', x: 1.05, y: -0.7, z: 0.8 },
      { el: 'H', x: 1.05, y: -0.55, z: -0.9 },
      { el: 'H', x: 2.3, y: 1.05, z: 0.15 },
    ],
    bonds: [
      [0, 1],
      [1, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [1, 6],
      [1, 7],
      [2, 8],
    ],
  },
  {
    id: 'hcho',
    formula: 'HCHO',
    name: '甲醛',
    desc: '最简单醛，平面形，装修污染与消毒相关，有毒。',
    atoms: [
      { el: 'C', x: 0, y: 0, z: 0 },
      { el: 'O', x: 1.2, y: 0, z: 0 },
      { el: 'H', x: -0.55, y: 0.95, z: 0 },
      { el: 'H', x: -0.55, y: -0.95, z: 0 },
    ],
    bonds: [
      [0, 1],
      [0, 1],
      [0, 2],
      [0, 3],
    ],
  },
  {
    id: 'ch3cooh',
    formula: 'CH₃COOH',
    name: '乙酸',
    desc: '羧酸代表，食醋主要成分，可发生酯化反应。',
    atoms: [
      { el: 'C', x: -1.2, y: 0, z: 0 },
      { el: 'C', x: 0.2, y: 0, z: 0 },
      { el: 'O', x: 0.85, y: 1.1, z: 0 },
      { el: 'O', x: 0.95, y: -1.05, z: 0 },
      { el: 'H', x: -1.6, y: 0.9, z: 0.5 },
      { el: 'H', x: -1.6, y: 0.15, z: -0.95 },
      { el: 'H', x: -1.55, y: -0.95, z: 0.35 },
      { el: 'H', x: 1.85, y: -1.15, z: 0.2 },
    ],
    bonds: [
      [0, 1],
      [1, 2],
      [1, 2],
      [1, 3],
      [0, 4],
      [0, 5],
      [0, 6],
      [3, 7],
    ],
  },
  {
    id: 'benzene',
    formula: 'C₆H₆',
    name: '苯',
    desc: '平面正六边形芳香环，键长平均化，高中有机代表物。',
    atoms: (() => {
      const atoms = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        atoms.push({ el: 'C', x: Math.cos(a) * 1.2, y: Math.sin(a) * 1.2, z: 0 });
      }
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        atoms.push({
          el: 'H',
          x: Math.cos(a) * 2.05,
          y: Math.sin(a) * 2.05,
          z: 0,
        });
      }
      return atoms;
    })(),
    bonds: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 4],
      [4, 5],
      [5, 0],
      [0, 6],
      [1, 7],
      [2, 8],
      [3, 9],
      [4, 10],
      [5, 11],
    ],
  },
];

export const MOLECULES_BY_ID = Object.fromEntries(MOLECULES.map((m) => [m.id, m]));
