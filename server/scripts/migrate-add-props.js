#!/usr/bin/env node

/**
 * 迁移脚本：添加 physics 和 chemistry 列到 molecules 表
 *
 * 使用方法: node scripts/migrate-add-props.js
 */

const path = require('path');
const { initDatabase, getDb, closeDatabase, query, run } = require('../db/sqlite');

async function migrate() {
  console.log('开始迁移...');

  // 初始化数据库
  const dataDir = path.join(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'chem-lab.db');
  await initDatabase(dbPath);

  const db = getDb();

  // 检查列是否已存在
  const columns = query("PRAGMA table_info(molecules)");
  const columnNames = columns.map(c => c.name);

  if (!columnNames.includes('physics')) {
    console.log('添加 physics 列...');
    run("ALTER TABLE molecules ADD COLUMN physics JSON DEFAULT '{}'");
  } else {
    console.log('physics 列已存在');
  }

  if (!columnNames.includes('chemistry')) {
    console.log('添加 chemistry 列...');
    run("ALTER TABLE molecules ADD COLUMN chemistry JSON DEFAULT '{}'");
  } else {
    console.log('chemistry 列已存在');
  }

  console.log('迁移完成');
  closeDatabase();
}

migrate().catch(err => {
  console.error('迁移失败:', err);
  process.exit(1);
});
