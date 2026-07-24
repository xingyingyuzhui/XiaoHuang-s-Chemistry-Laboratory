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
         VALUES (?, ?, ?, ?, ?, ?, 0, '{}', '{}')`,
        [
          mol.id,
          mol.name,
          mol.formula,
          mol.desc || '',
          JSON.stringify(mol.atoms || []),
          JSON.stringify(mol.bonds || []),
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

module.exports = { importBuiltinMolecules };
