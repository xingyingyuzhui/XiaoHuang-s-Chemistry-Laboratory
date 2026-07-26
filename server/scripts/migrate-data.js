#!/usr/bin/env node

/**
 * 兼容旧维护入口：同步内置分子。
 *
 * 内置数据只维护在 server/seed/builtin-molecules.js；不要在此脚本复制一份，
 * 否则手工迁移可能覆盖新字段或与启动时同步结果不一致。
 */

const { initDatabase, closeDatabase } = require('../db/sqlite');
const { getDbPath } = require('../paths');
const { syncBuiltinMolecules } = require('../seed/import-builtin');

async function migrate() {
  await initDatabase(getDbPath());
  try {
    const result = syncBuiltinMolecules();
    console.log(
      `内置分子同步完成：新增 ${result.inserted}，更新 ${result.updated}，补齐性质 ${result.propertiesUpdated}`,
    );
  } finally {
    closeDatabase();
  }
}

migrate().catch((err) => {
  console.error('数据迁移失败:', err);
  process.exit(1);
});
