const { queryOne, run, runBatch } = require('../db/sqlite');
const { BUILTIN_REACTIONS } = require('./builtin-reactions');

function rowFromReaction(r, source = 'builtin') {
  const now = Date.now();
  return {
    id: r.id,
    title: r.title,
    type: r.type || '',
    equation: r.equation,
    reactants_json: JSON.stringify(r.reactants || []),
    products_json: JSON.stringify(r.products || []),
    conditions: r.conditions || '',
    phenomena: r.phenomena || '',
    notes: r.notes || '',
    steps_json: JSON.stringify(r.steps || []),
    molecule_ids_json: JSON.stringify(r.moleculeIds || []),
    source,
    created_at: r.created_at || now,
  };
}

function insertReaction(row) {
  run(
    `INSERT OR REPLACE INTO chem_reactions (
      id, title, type, equation, reactants_json, products_json,
      conditions, phenomena, notes, steps_json, molecule_ids_json, source, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.title,
      row.type,
      row.equation,
      row.reactants_json,
      row.products_json,
      row.conditions,
      row.phenomena,
      row.notes,
      row.steps_json,
      row.molecule_ids_json,
      row.source,
      row.created_at,
    ],
  );
}

/** 同步内置反应（INSERT OR REPLACE，不覆盖 AI 添加的非内置 id） */
function syncBuiltinReactions() {
  const rows = BUILTIN_REACTIONS.map((r) => rowFromReaction(r, 'builtin'));
  if (typeof runBatch === 'function') {
    runBatch(() => {
      rows.forEach(insertReaction);
    });
  } else {
    rows.forEach(insertReaction);
  }
  console.log(`已同步 ${rows.length} 条内置化学反应`);
  return rows.length;
}

/** 库为空时导入；否则仍同步内置以便种子更新生效 */
function importBuiltinReactionsIfEmpty() {
  const count = queryOne('SELECT COUNT(*) as c FROM chem_reactions');
  if (count && Number(count.c) > 0) {
    return syncBuiltinReactions();
  }
  return syncBuiltinReactions();
}

module.exports = {
  importBuiltinReactionsIfEmpty,
  syncBuiltinReactions,
  rowFromReaction,
  insertReaction,
  BUILTIN_REACTIONS,
};
