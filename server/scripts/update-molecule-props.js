#!/usr/bin/env node

/**
 * 迁移脚本：为内置分子添加物理/化学性质
 *
 * 使用方法: node scripts/update-molecule-props.js
 */

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

// 内置分子的物理/化学性质数据
const MOLECULE_PROPS = {
  'h2': {
    physics: { state: '气态', density: '0.089 g/L', meltingPoint: '-259.16°C', boilingPoint: '-252.87°C' },
    chemistry: { acidity: '中性', solubility: '微溶', reactivity: '活泼，可燃烧' }
  },
  'o2': {
    physics: { state: '气态', density: '1.429 g/L', meltingPoint: '-218.79°C', boilingPoint: '-182.96°C' },
    chemistry: { acidity: '中性', solubility: '微溶', reactivity: '活泼，支持燃烧' }
  },
  'n2': {
    physics: { state: '气态', density: '1.251 g/L', meltingPoint: '-210.01°C', boilingPoint: '-195.79°C' },
    chemistry: { acidity: '中性', solubility: '难溶', reactivity: '稳定' }
  },
  'cl2': {
    physics: { state: '气态', density: '3.214 g/L', meltingPoint: '-101.5°C', boilingPoint: '-34.04°C' },
    chemistry: { acidity: '酸性', solubility: '溶于水', reactivity: '活泼，强氧化性' }
  },
  'o3': {
    physics: { state: '气态', density: '2.144 g/L', meltingPoint: '-192.5°C', boilingPoint: '-111.9°C' },
    chemistry: { acidity: '中性', solubility: '微溶', reactivity: '活泼，强氧化性' }
  },
  'h2o': {
    physics: { state: '液态', density: '1 g/cm³', meltingPoint: '0°C', boilingPoint: '100°C' },
    chemistry: { acidity: '中性', solubility: '易溶', reactivity: '稳定' }
  },
  'h2o2': {
    physics: { state: '液态', density: '1.463 g/cm³', meltingPoint: '-0.43°C', boilingPoint: '150.2°C' },
    chemistry: { acidity: '弱酸性', solubility: '易溶', reactivity: '活泼，易分解' }
  },
  'hcl': {
    physics: { state: '气态', density: '1.639 g/L', meltingPoint: '-114.2°C', boilingPoint: '-85.1°C' },
    chemistry: { acidity: '酸性', solubility: '易溶', reactivity: '活泼' }
  },
  'h2s': {
    physics: { state: '气态', density: '1.393 g/L', meltingPoint: '-85.5°C', boilingPoint: '-60.7°C' },
    chemistry: { acidity: '酸性', solubility: '溶于水', reactivity: '活泼，有毒' }
  },
  'nh3': {
    physics: { state: '气态', density: '0.771 g/L', meltingPoint: '-77.73°C', boilingPoint: '-33.34°C' },
    chemistry: { acidity: '碱性', solubility: '易溶', reactivity: '活泼' }
  },
  'co': {
    physics: { state: '气态', density: '1.25 g/L', meltingPoint: '-205.1°C', boilingPoint: '-191.5°C' },
    chemistry: { acidity: '中性', solubility: '微溶', reactivity: '有毒，可燃烧' }
  },
  'co2': {
    physics: { state: '气态', density: '1.977 g/L', meltingPoint: '-78.5°C（升华）', boilingPoint: '-56.6°C（加压）' },
    chemistry: { acidity: '酸性', solubility: '溶于水', reactivity: '稳定' }
  },
  'so2': {
    physics: { state: '气态', density: '2.926 g/L', meltingPoint: '-75.5°C', boilingPoint: '-10°C' },
    chemistry: { acidity: '酸性', solubility: '溶于水', reactivity: '活泼，漂白性' }
  },
  'so3': {
    physics: { state: '液态', density: '1.92 g/cm³', meltingPoint: '16.9°C', boilingPoint: '45°C' },
    chemistry: { acidity: '酸性', solubility: '易溶', reactivity: '活泼，强氧化性' }
  },
  'no': {
    physics: { state: '气态', density: '1.34 g/L', meltingPoint: '-163.6°C', boilingPoint: '-151.8°C' },
    chemistry: { acidity: '中性', solubility: '微溶', reactivity: '活泼' }
  },
  'no2': {
    physics: { state: '气态', density: '1.88 g/L', meltingPoint: '-9.3°C', boilingPoint: '21.2°C' },
    chemistry: { acidity: '酸性', solubility: '溶于水', reactivity: '活泼，有毒' }
  },
  'nacl': {
    physics: { state: '固态', density: '2.165 g/cm³', meltingPoint: '801°C', boilingPoint: '1413°C' },
    chemistry: { acidity: '中性', solubility: '易溶', reactivity: '稳定' }
  },
  'ch4': {
    physics: { state: '气态', density: '0.717 g/L', meltingPoint: '-182.5°C', boilingPoint: '-161.5°C' },
    chemistry: { acidity: '中性', solubility: '难溶', reactivity: '可燃烧' }
  },
  'c2h6': {
    physics: { state: '气态', density: '1.357 g/L', meltingPoint: '-183.3°C', boilingPoint: '-88.6°C' },
    chemistry: { acidity: '中性', solubility: '难溶', reactivity: '可燃烧' }
  },
  'c2h4': {
    physics: { state: '气态', density: '1.26 g/L', meltingPoint: '-169.2°C', boilingPoint: '-103.7°C' },
    chemistry: { acidity: '中性', solubility: '难溶', reactivity: '活泼，可加成' }
  },
  'c2h2': {
    physics: { state: '气态', density: '1.177 g/L', meltingPoint: '-80.8°C', boilingPoint: '-84°C（升华）' },
    chemistry: { acidity: '弱酸性', solubility: '微溶', reactivity: '活泼，可燃烧' }
  },
  'ch3oh': {
    physics: { state: '液态', density: '0.791 g/cm³', meltingPoint: '-97.6°C', boilingPoint: '64.7°C' },
    chemistry: { acidity: '中性', solubility: '易溶', reactivity: '有毒，可燃烧' }
  },
  'ethanol': {
    physics: { state: '液态', density: '0.789 g/cm³', meltingPoint: '-114.1°C', boilingPoint: '78.37°C' },
    chemistry: { acidity: '中性', solubility: '易溶', reactivity: '可燃烧' }
  },
  'hcho': {
    physics: { state: '气态', density: '0.815 g/L', meltingPoint: '-92°C', boilingPoint: '-19.5°C' },
    chemistry: { acidity: '中性', solubility: '易溶', reactivity: '有毒，可燃烧' }
  },
  'ch3cooh': {
    physics: { state: '液态', density: '1.049 g/cm³', meltingPoint: '16.6°C', boilingPoint: '117.9°C' },
    chemistry: { acidity: '酸性', solubility: '易溶', reactivity: '稳定' }
  },
  'benzene': {
    physics: { state: '液态', density: '0.879 g/cm³', meltingPoint: '5.5°C', boilingPoint: '80.1°C' },
    chemistry: { acidity: '中性', solubility: '难溶', reactivity: '稳定，可燃烧' }
  }
};

async function updateProps() {
  console.log('开始更新分子性质...');

  // 初始化数据库（不重新创建表）
  const dataDir = path.join(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'chem-lab.db');
  
  // 直接读取现有数据库文件
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(fileBuffer);

  // 更新每个分子的性质
  for (const [id, props] of Object.entries(MOLECULE_PROPS)) {
    try {
      db.run('UPDATE molecules SET physics = ?, chemistry = ? WHERE id = ?', 
          [JSON.stringify(props.physics), JSON.stringify(props.chemistry), id]);
      console.log(`已更新: ${id}`);
    } catch (err) {
      console.error(`更新 ${id} 失败:`, err.message);
    }
  }

  // 保存数据库到文件
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);

  console.log('更新完成');
  db.close();
}

updateProps().catch(err => {
  console.error('更新失败:', err);
  process.exit(1);
});
