#!/usr/bin/env node

/**
 * 数据迁移脚本：将内置分子数据从 frontend 导入到 SQLite 数据库
 *
 * 使用方法: node scripts/migrate-data.js
 */

const path = require('path');
const { initDatabase, getDb, closeDatabase, queryOne, run } = require('../db/sqlite');

// 内置分子数据（从 src/data/molecules.js 复制）
const BUILTIN_MOLECULES = [
  {
    id: 'h2',
    formula: 'H₂',
    name: '氢气',
    desc: '双原子分子，最轻气体，可燃烧生成水。',
    atoms: [{ el: 'H', x: -0.37, y: 0, z: 0 }, { el: 'H', x: 0.37, y: 0, z: 0 }],
    bonds: [[0, 1]]
  },
  {
    id: 'o2',
    formula: 'O₂',
    name: '氧气',
    desc: '双原子分子，支持燃烧与呼吸，空气中约 21%。',
    atoms: [{ el: 'O', x: -0.6, y: 0, z: 0 }, { el: 'O', x: 0.6, y: 0, z: 0 }],
    bonds: [[0, 1], [0, 1]]
  },
  {
    id: 'n2',
    formula: 'N₂',
    name: '氮气',
    desc: '三键双原子分子，化学性质较稳定，空气中约 78%。',
    atoms: [{ el: 'N', x: -0.55, y: 0, z: 0 }, { el: 'N', x: 0.55, y: 0, z: 0 }],
    bonds: [[0, 1], [0, 1], [0, 1]]
  },
  {
    id: 'cl2',
    formula: 'Cl₂',
    name: '氯气',
    desc: '黄绿色有毒气体，强氧化性，可用于消毒与制盐酸。',
    atoms: [{ el: 'Cl', x: -0.99, y: 0, z: 0 }, { el: 'Cl', x: 0.99, y: 0, z: 0 }],
    bonds: [[0, 1]]
  },
  {
    id: 'o3',
    formula: 'O₃',
    name: '臭氧',
    desc: '弯曲形，强氧化性，大气臭氧层可吸收紫外线。',
    atoms: [{ el: 'O', x: 0, y: 0.35, z: 0 }, { el: 'O', x: -1.05, y: -0.35, z: 0 }, { el: 'O', x: 1.05, y: -0.35, z: 0 }],
    bonds: [[0, 1], [0, 2]]
  },
  {
    id: 'h2o',
    formula: 'H₂O',
    name: '水',
    desc: '弯曲形（约 104.5°），极性分子，生命溶剂，可形成氢键。',
    atoms: [{ el: 'O', x: 0, y: 0, z: 0 }, { el: 'H', x: 0.76, y: 0.59, z: 0 }, { el: 'H', x: -0.76, y: 0.59, z: 0 }],
    bonds: [[0, 1], [0, 2]]
  },
  {
    id: 'h2o2',
    formula: 'H₂O₂',
    name: '过氧化氢',
    desc: '过氧结构，易分解放氧，常用作消毒与漂白。',
    atoms: [{ el: 'O', x: -0.74, y: 0.1, z: 0 }, { el: 'O', x: 0.74, y: -0.1, z: 0 }, { el: 'H', x: -1.1, y: 0.85, z: 0.4 }, { el: 'H', x: 1.1, y: -0.85, z: -0.4 }],
    bonds: [[0, 1], [0, 2], [1, 3]]
  },
  {
    id: 'hcl',
    formula: 'HCl',
    name: '氯化氢',
    desc: '极性双原子分子，溶于水得盐酸，胃酸主要成分。',
    atoms: [{ el: 'H', x: -0.64, y: 0, z: 0 }, { el: 'Cl', x: 0.64, y: 0, z: 0 }],
    bonds: [[0, 1]]
  },
  {
    id: 'h2s',
    formula: 'H₂S',
    name: '硫化氢',
    desc: '弯曲形，臭鸡蛋气味，弱酸性，有毒气体。',
    atoms: [{ el: 'S', x: 0, y: 0, z: 0 }, { el: 'H', x: 0.96, y: 0.65, z: 0 }, { el: 'H', x: -0.96, y: 0.65, z: 0 }],
    bonds: [[0, 1], [0, 2]]
  },
  {
    id: 'nh3',
    formula: 'NH₃',
    name: '氨',
    desc: '三角锥形，有刺激性气味，碱性，可形成氢键。',
    atoms: [{ el: 'N', x: 0, y: 0.11, z: 0 }, { el: 'H', x: 0.94, y: -0.26, z: 0 }, { el: 'H', x: -0.47, y: -0.26, z: 0.82 }, { el: 'H', x: -0.47, y: -0.26, z: -0.82 }],
    bonds: [[0, 1], [0, 2], [0, 3]]
  },
  {
    id: 'co',
    formula: 'CO',
    name: '一氧化碳',
    desc: '三键双原子分子，无色无味有毒，可作还原剂。',
    atoms: [{ el: 'C', x: -0.65, y: 0, z: 0 }, { el: 'O', x: 0.65, y: 0, z: 0 }],
    bonds: [[0, 1], [0, 1], [0, 1]]
  },
  {
    id: 'co2',
    formula: 'CO₂',
    name: '二氧化碳',
    desc: '直线形，温室气体，光合作用原料，干冰可制冷。',
    atoms: [{ el: 'C', x: 0, y: 0, z: 0 }, { el: 'O', x: -1.16, y: 0, z: 0 }, { el: 'O', x: 1.16, y: 0, z: 0 }],
    bonds: [[0, 1], [0, 1], [0, 2], [0, 2]]
  },
  {
    id: 'so2',
    formula: 'SO₂',
    name: '二氧化硫',
    desc: '弯曲形，有刺激性气味，漂白性，酸雨成因之一。',
    atoms: [{ el: 'S', x: 0, y: 0, z: 0 }, { el: 'O', x: -1.28, y: 0.56, z: 0 }, { el: 'O', x: 1.28, y: 0.56, z: 0 }],
    bonds: [[0, 1], [0, 2]]
  },
  {
    id: 'so3',
    formula: 'SO₃',
    name: '三氧化硫',
    desc: '平面三角形，强氧化剂，与水反应生成硫酸。',
    atoms: [{ el: 'S', x: 0, y: 0, z: 0 }, { el: 'O', x: -1.2, y: 0.7, z: 0 }, { el: 'O', x: 1.2, y: 0.7, z: 0 }, { el: 'O', x: 0, y: -1.2, z: 0 }],
    bonds: [[0, 1], [0, 2], [0, 3]]
  },
  {
    id: 'no',
    formula: 'NO',
    name: '一氧化氮',
    desc: '双原子自由基，信号分子，与氧气反应生成二氧化氮。',
    atoms: [{ el: 'N', x: -0.65, y: 0, z: 0 }, { el: 'O', x: 0.65, y: 0, z: 0 }],
    bonds: [[0, 1]]
  },
  {
    id: 'no2',
    formula: 'NO₂',
    name: '二氧化氮',
    desc: '弯曲形，红棕色刺激性气体，酸雨成因之一。',
    atoms: [{ el: 'N', x: 0, y: 0, z: 0 }, { el: 'O', x: -1.1, y: 0.5, z: 0 }, { el: 'O', x: 1.1, y: 0.5, z: 0 }],
    bonds: [[0, 1], [0, 2]]
  },
  {
    id: 'nacl',
    formula: 'NaCl',
    name: '氯化钠',
    desc: '离子化合物，食盐主要成分，晶体为立方结构。',
    atoms: [{ el: 'Na', x: -1.18, y: 0, z: 0 }, { el: 'Cl', x: 1.18, y: 0, z: 0 }],
    bonds: [[0, 1]]
  },
  {
    id: 'ch4',
    formula: 'CH₄',
    name: '甲烷',
    desc: '正四面体结构，最简单有机物，天然气主要成分。',
    atoms: [{ el: 'C', x: 0, y: 0, z: 0 }, { el: 'H', x: 0.63, y: 0.63, z: 0.63 }, { el: 'H', x: -0.63, y: -0.63, z: 0.63 }, { el: 'H', x: -0.63, y: 0.63, z: -0.63 }, { el: 'H', x: 0.63, y: -0.63, z: -0.63 }],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4]]
  },
  {
    id: 'c2h6',
    formula: 'C₂H₆',
    name: '乙烷',
    desc: '两个碳原子单键连接，烷烃系列第二员。',
    atoms: [{ el: 'C', x: -0.76, y: 0, z: 0 }, { el: 'C', x: 0.76, y: 0, z: 0 }, { el: 'H', x: -1.16, y: 0.52, z: 0.38 }, { el: 'H', x: -1.16, y: -0.52, z: 0.38 }, { el: 'H', x: -1.16, y: 0, z: -0.76 }, { el: 'H', x: 1.16, y: 0.52, z: -0.38 }, { el: 'H', x: 1.16, y: -0.52, z: -0.38 }, { el: 'H', x: 1.16, y: 0, z: 0.76 }],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 6], [1, 7]]
  },
  {
    id: 'c2h4',
    formula: 'C₂H₄',
    name: '乙烯',
    desc: '平面结构，含碳碳双键，最简单烯烃，可催熟水果。',
    atoms: [{ el: 'C', x: -0.67, y: 0, z: 0 }, { el: 'C', x: 0.67, y: 0, z: 0 }, { el: 'H', x: -1.24, y: 0.93, z: 0 }, { el: 'H', x: -1.24, y: -0.93, z: 0 }, { el: 'H', x: 1.24, y: 0.93, z: 0 }, { el: 'H', x: 1.24, y: -0.93, z: 0 }],
    bonds: [[0, 1], [0, 1], [0, 2], [0, 3], [1, 4], [1, 5]]
  },
  {
    id: 'c2h2',
    formula: 'C₂H₂',
    name: '乙炔',
    desc: '直线形，含碳碳三键，焊接气焊用气体。',
    atoms: [{ el: 'C', x: -0.6, y: 0, z: 0 }, { el: 'C', x: 0.6, y: 0, z: 0 }, { el: 'H', x: -1.66, y: 0, z: 0 }, { el: 'H', x: 1.66, y: 0, z: 0 }],
    bonds: [[0, 1], [0, 1], [0, 1], [0, 2], [1, 3]]
  },
  {
    id: 'ch3oh',
    formula: 'CH₃OH',
    name: '甲醇',
    desc: '最简单醇，有毒，可致失明，工业溶剂。',
    atoms: [{ el: 'C', x: -0.76, y: 0, z: 0 }, { el: 'O', x: 0.76, y: 0, z: 0 }, { el: 'H', x: -1.16, y: 0.52, z: 0.38 }, { el: 'H', x: -1.16, y: -0.52, z: 0.38 }, { el: 'H', x: -1.16, y: 0, z: -0.76 }, { el: 'H', x: 1.16, y: 0, z: 0 }],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5]]
  },
  {
    id: 'ethanol',
    formula: 'C₂H₅OH',
    name: '乙醇',
    desc: '酒精主要成分，可饮用（适量），常用溶剂和消毒剂。',
    atoms: [{ el: 'C', x: -1.2, y: 0, z: 0 }, { el: 'C', x: 0, y: 0, z: 0 }, { el: 'O', x: 1.2, y: 0, z: 0 }, { el: 'H', x: -1.6, y: 0.52, z: 0.38 }, { el: 'H', x: -1.6, y: -0.52, z: 0.38 }, { el: 'H', x: -1.6, y: 0, z: -0.76 }, { el: 'H', x: -0.2, y: 0.52, z: 0.9 }, { el: 'H', x: -0.2, y: 0.52, z: -0.9 }, { el: 'H', x: 1.6, y: 0, z: 0 }],
    bonds: [[0, 1], [1, 2], [0, 3], [0, 4], [0, 5], [1, 6], [1, 7], [2, 8]]
  },
  {
    id: 'hcho',
    formula: 'HCHO',
    name: '甲醛',
    desc: '平面结构，刺激性气味，常用防腐剂，有毒。',
    atoms: [{ el: 'C', x: 0, y: 0, z: 0 }, { el: 'O', x: -1.16, y: 0, z: 0 }, { el: 'H', x: 0.63, y: 0.93, z: 0 }, { el: 'H', x: 0.63, y: -0.93, z: 0 }],
    bonds: [[0, 1], [0, 1], [0, 2], [0, 3]]
  },
  {
    id: 'ch3cooh',
    formula: 'CH₃COOH',
    name: '乙酸',
    desc: '食醋主要成分，弱酸，有机酸，可调味。',
    atoms: [{ el: 'C', x: -1.2, y: 0, z: 0 }, { el: 'C', x: 0, y: 0, z: 0 }, { el: 'O', x: 0.6, y: 1.0, z: 0 }, { el: 'O', x: 0.6, y: -1.0, z: 0 }, { el: 'H', x: -1.6, y: 0.52, z: 0.38 }, { el: 'H', x: -1.6, y: -0.52, z: 0.38 }, { el: 'H', x: -1.6, y: 0, z: -0.76 }, { el: 'H', x: 1.5, y: -1.0, z: 0 }],
    bonds: [[0, 1], [1, 2], [1, 3], [0, 4], [0, 5], [0, 6], [3, 7]]
  },
  {
    id: 'benzene',
    formula: 'C₆H₆',
    name: '苯',
    desc: '平面正六边形，典型芳香烃，常用有机溶剂。',
    atoms: [
      // 使用 IIFE 动态生成正六边形坐标
      ...(() => {
        const atoms = [];
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          atoms.push({ el: 'C', x: Math.cos(angle) * 1.39, y: Math.sin(angle) * 1.39, z: 0 });
        }
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          atoms.push({ el: 'H', x: Math.cos(angle) * 2.48, y: Math.sin(angle) * 2.48, z: 0 });
        }
        return atoms;
      })()
    ],
    bonds: [
      [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
      [0, 6], [1, 7], [2, 8], [3, 9], [4, 10], [5, 11]
    ]
  }
];

async function migrate() {
  console.log('开始数据迁移...');

  // 初始化数据库
  const dataDir = path.join(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'chem-lab.db');
  await initDatabase(dbPath);

  // 检查是否已有数据
  const count = queryOne('SELECT COUNT(*) as count FROM molecules');
  if (count && count.count > 0) {
    console.log(`数据库已有 ${count.count} 条分子数据，跳过迁移`);
    closeDatabase();
    return;
  }

  // 批量插入
  BUILTIN_MOLECULES.forEach((mol, index) => {
    run(`
      INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom)
      VALUES (?, ?, ?, ?, ?, ?, 0)
    `, [mol.id, mol.name, mol.formula, mol.desc, JSON.stringify(mol.atoms), JSON.stringify(mol.bonds)]);

    run('INSERT INTO molecule_order (molecule_id, sort_order) VALUES (?, ?)', [mol.id, index + 1]);
  });

  console.log(`成功导入 ${BUILTIN_MOLECULES.length} 个内置分子数据`);
  closeDatabase();
}

migrate().catch(err => {
  console.error('数据迁移失败:', err);
  process.exit(1);
});
