const { queryOne, run, runBatch } = require('../db/sqlite');
const { BUILTIN_MOLECULES } = require('./builtin-molecules');

/** 升版本时同步内置数据；custom=1 的教师/学生自建数据永不覆盖。 */
const BUILTIN_MOLECULES_VERSION = 2;

function readSeedVersion() {
  const row = queryOne(
    "SELECT value FROM settings WHERE key = 'builtin_molecules_version'",
  );
  try {
    return Number(JSON.parse(row?.value ?? '0')) || 0;
  } catch {
    return Number(row?.value) || 0;
  }
}

function writeSeedVersion() {
  run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    ['builtin_molecules_version', JSON.stringify(BUILTIN_MOLECULES_VERSION)],
  );
}

function insertBuiltinMolecule(mol, index) {
  run(
    `INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom, physics, chemistry)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
    [
      mol.id,
      mol.name,
      mol.formula,
      mol.desc || '',
      JSON.stringify(mol.atoms || []),
      JSON.stringify(mol.bonds || []),
      JSON.stringify(mol.physics || {}),
      JSON.stringify(mol.chemistry || {}),
    ],
  );
  run('INSERT OR IGNORE INTO molecule_order (molecule_id, sort_order) VALUES (?, ?)', [
    mol.id,
    index + 1,
  ]);
}

function updateBuiltinMolecule(mol) {
  return run(
    `UPDATE molecules
     SET name = ?, formula = ?, desc = ?, atoms = ?, bonds = ?,
         physics = ?, chemistry = ?
     WHERE id = ? AND custom = 0`,
    [
      mol.name,
      mol.formula,
      mol.desc || '',
      JSON.stringify(mol.atoms || []),
      JSON.stringify(mol.bonds || []),
      JSON.stringify(mol.physics || {}),
      JSON.stringify(mol.chemistry || {}),
      mol.id,
    ],
  );
}

function backfillBuiltinProperties(mol) {
  return run(
    `UPDATE molecules
     SET physics = CASE
           WHEN physics IS NULL OR TRIM(physics) IN ('', '{}') THEN ?
           ELSE physics
         END,
         chemistry = CASE
           WHEN chemistry IS NULL OR TRIM(chemistry) IN ('', '{}') THEN ?
           ELSE chemistry
         END
     WHERE id = ?
       AND custom = 0
       AND (physics IS NULL OR TRIM(physics) IN ('', '{}')
         OR chemistry IS NULL OR TRIM(chemistry) IN ('', '{}'))`,
    [JSON.stringify(mol.physics || {}), JSON.stringify(mol.chemistry || {}), mol.id],
  );
}

/**
 * 幂等同步内置分子。
 *
 * - 首次启动导入全部内置分子；
 * - 已有数据库仍会补入后来新增的内置分子；
 * - 版本升级时仅更新 custom=0 的内置数据；
 * - 每次启动均补齐空的物理/化学性质，兼容早期数据库。
 */
function syncBuiltinMolecules() {
  const forceUpdate = readSeedVersion() < BUILTIN_MOLECULES_VERSION;
  const result = { inserted: 0, updated: 0, propertiesUpdated: 0, skippedCustom: 0 };

  runBatch(() => {
    BUILTIN_MOLECULES.forEach((mol, index) => {
      const existing = queryOne('SELECT custom FROM molecules WHERE id = ?', [mol.id]);
      if (!existing) {
        insertBuiltinMolecule(mol, index);
        result.inserted += 1;
        return;
      }
      if (Number(existing.custom)) {
        result.skippedCustom += 1;
        return;
      }
      if (forceUpdate) {
        result.updated += Number(updateBuiltinMolecule(mol)?.changes || 0);
      } else {
        result.propertiesUpdated += Number(backfillBuiltinProperties(mol)?.changes || 0);
      }
    });
    writeSeedVersion();
  });

  return result;
}

/** @deprecated 使用 syncBuiltinMolecules；保留给旧脚本调用。 */
function importBuiltinMolecules() {
  const result = syncBuiltinMolecules();
  return {
    imported: result.inserted,
    total: Number(queryOne('SELECT COUNT(*) AS count FROM molecules')?.count || 0),
  };
}

/**
 * 为早期版本已创建的内置分子补齐空的性质字段。
 * 只更新内置数据的空字段，既不改用户自建分子，也不覆盖已有性质。
 */
function syncBuiltinMoleculeProperties() {
  return syncBuiltinMolecules().propertiesUpdated;
}

module.exports = {
  BUILTIN_MOLECULES_VERSION,
  importBuiltinMolecules,
  syncBuiltinMolecules,
  syncBuiltinMoleculeProperties,
};
