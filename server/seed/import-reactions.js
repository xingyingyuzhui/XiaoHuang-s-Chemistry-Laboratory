const { queryOne, run, runBatch, query } = require('../db/sqlite');
const { BUILTIN_REACTIONS } = require('./builtin-reactions');

/** 种子版本：升版本时覆盖内置 id；AI 自定义 id 永不碰 */
const BUILTIN_SEED_VERSION = 2;

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

function insertBuiltinIfMissing(row) {
  const existing = queryOne('SELECT id, source FROM chem_reactions WHERE id = ?', [
    row.id,
  ]);
  if (!existing) {
    insertReaction(row);
    return 'insert';
  }
  // 仅覆盖仍标记为 builtin 的行；AI 占用同 id 时不碰
  if (existing.source === 'builtin') {
    insertReaction(row);
    return 'replace';
  }
  return 'skip';
}

/**
 * 同步内置反应：
 * - 库中无记录 → 全量导入
 * - 有记录 → 仅 upsert source=builtin 的 id，且仅当 seed 版本升高时强制覆盖 builtin
 * - 永不覆盖 source=ai
 */
function syncBuiltinReactions() {
  const rows = BUILTIN_REACTIONS.map((r) => rowFromReaction(r, 'builtin'));
  const verRow = queryOne(
    "SELECT value FROM settings WHERE key = 'builtin_reactions_version'",
  );
  let curVer = 0;
  try {
    curVer = Number(JSON.parse(verRow?.value ?? '0')) || 0;
  } catch {
    curVer = Number(verRow?.value) || 0;
  }

  const force = curVer < BUILTIN_SEED_VERSION;
  let inserted = 0;
  let replaced = 0;
  let skipped = 0;

  const apply = () => {
    for (const row of rows) {
      if (force) {
        const existing = queryOne(
          'SELECT id, source FROM chem_reactions WHERE id = ?',
          [row.id],
        );
        if (existing && existing.source === 'ai') {
          skipped += 1;
          continue;
        }
        insertReaction(row);
        if (existing) replaced += 1;
        else inserted += 1;
      } else {
        const r = insertBuiltinIfMissing(row);
        if (r === 'insert') inserted += 1;
        else if (r === 'replace') replaced += 1;
        else skipped += 1;
      }
    }
    run(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      ['builtin_reactions_version', JSON.stringify(BUILTIN_SEED_VERSION)],
    );
  };

  if (typeof runBatch === 'function') runBatch(apply);
  else apply();

  console.log(
    `内置反应同步 v${BUILTIN_SEED_VERSION}：新增 ${inserted}，更新 ${replaced}，跳过 ${skipped}`,
  );
  return rows.length;
}

function importBuiltinReactionsIfEmpty() {
  return syncBuiltinReactions();
}

module.exports = {
  importBuiltinReactionsIfEmpty,
  syncBuiltinReactions,
  rowFromReaction,
  insertReaction,
  BUILTIN_REACTIONS,
  BUILTIN_SEED_VERSION,
};
