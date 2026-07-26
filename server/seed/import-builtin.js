/**
 * 空库时导入内置分子
 */

const { queryOne, run, runBatch } = require('../db/sqlite');
const { BUILTIN_MOLECULES } = require('./builtin-molecules');

function importBuiltinMolecules() {
  const count = queryOne('SELECT COUNT(*) as count FROM molecules');
  if (count && Number(count.count) > 0) {
    return { imported: 0, total: Number(count.count) };
  }

  runBatch(() => {
    BUILTIN_MOLECULES.forEach((mol, index) => {
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
      run('INSERT INTO molecule_order (molecule_id, sort_order) VALUES (?, ?)', [
        mol.id,
        index + 1,
      ]);
    });
  });

  console.log(`已导入 ${BUILTIN_MOLECULES.length} 个内置分子`);
  return { imported: BUILTIN_MOLECULES.length, total: BUILTIN_MOLECULES.length };
}

/**
 * 为早期版本已创建的内置分子补齐空的性质字段。
 * 只更新内置数据的空字段，既不改用户自建分子，也不覆盖已有性质。
 */
function syncBuiltinMoleculeProperties() {
  let updated = 0;
  runBatch(() => {
    BUILTIN_MOLECULES.forEach((mol) => {
      const result = run(
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
        [JSON.stringify(mol.physics), JSON.stringify(mol.chemistry), mol.id],
      );
      updated += Number(result?.changes || 0);
    });
  });
  return updated;
}

module.exports = { importBuiltinMolecules, syncBuiltinMoleculeProperties };
