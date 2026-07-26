#!/usr/bin/env node

/** @deprecated 使用统一内置分子同步；保留旧命令兼容。 */

const { initDatabase, closeDatabase } = require('../db/sqlite');
const { getDbPath } = require('../paths');
const { syncBuiltinMolecules } = require('../seed/import-builtin');

async function updateProps() {
  await initDatabase(getDbPath());
  try {
    const result = syncBuiltinMolecules();
    console.log(`性质同步完成：补齐/更新 ${result.updated + result.propertiesUpdated} 条内置分子`);
  } finally {
    closeDatabase();
  }
}

updateProps().catch((err) => {
  console.error('更新失败:', err);
  process.exit(1);
});
