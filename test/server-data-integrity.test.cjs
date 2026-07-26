const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  initDatabase,
  closeDatabase,
  query,
  queryOne,
  run,
} = require('../server/db/sqlite');
const {
  BUILTIN_MOLECULES,
} = require('../server/seed/builtin-molecules');
const {
  syncBuiltinMolecules,
} = require('../server/seed/import-builtin');
const {
  reserveGlobalAiCall,
  releaseGlobalAiCall,
} = require('../server/utils/ai-rate-limit');
const {
  tryReserveAiCall,
  releaseAiCall,
} = require('../server/utils/chem-tips');
const {
  reserveCall: reserveQuizAssistCall,
  releaseCall: releaseQuizAssistCall,
} = require('../server/utils/quiz-assist-limit');

async function withTempDatabase(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-test-'));
  const dbPath = path.join(dir, 'chem-lab.db');
  try {
    await initDatabase(dbPath);
    return await fn();
  } finally {
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('built-in molecule sync adds missing built-ins without touching custom molecules', async () => {
  await withTempDatabase(() => {
    run(
      `INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom, physics, chemistry)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        'teacher-water',
        '教师自建水模型',
        'H₂O',
        '保留这条自建数据',
        '[]',
        '[]',
        JSON.stringify({ state: '自定义' }),
        JSON.stringify({ acidity: '自定义' }),
      ],
    );

    const result = syncBuiltinMolecules();

    assert.ok(result.inserted >= BUILTIN_MOLECULES.length);
    assert.equal(
      queryOne('SELECT COUNT(*) AS count FROM molecules').count,
      BUILTIN_MOLECULES.length + 1,
    );
    assert.deepEqual(
      queryOne('SELECT physics FROM molecules WHERE id = ?', ['teacher-water']),
      { physics: JSON.stringify({ state: '自定义' }) },
    );
  });
});

test('built-in molecule sync backfills empty properties in an existing database', async () => {
  await withTempDatabase(() => {
    const water = BUILTIN_MOLECULES.find((molecule) => molecule.id === 'h2o');
    run(
      `INSERT INTO molecules (id, name, formula, desc, atoms, bonds, custom, physics, chemistry)
       VALUES (?, ?, ?, ?, ?, ?, 0, '{}', '{}')`,
      [
        water.id,
        water.name,
        water.formula,
        water.desc,
        JSON.stringify(water.atoms),
        JSON.stringify(water.bonds),
      ],
    );

    syncBuiltinMolecules();

    const row = queryOne(
      'SELECT physics, chemistry FROM molecules WHERE id = ?',
      ['h2o'],
    );
    assert.deepEqual(JSON.parse(row.physics), water.physics);
    assert.deepEqual(JSON.parse(row.chemistry), water.chemistry);
  });
});

test('releasing a global AI reservation only removes that request', async () => {
  await withTempDatabase(() => {
    const first = reserveGlobalAiCall('first');
    const second = reserveGlobalAiCall('second');
    assert.ok(first.reservationId);
    assert.ok(second.reservationId);

    releaseGlobalAiCall(first.reservationId);

    assert.deepEqual(query('SELECT id, kind FROM ai_global_calls ORDER BY id'), [
      { id: second.reservationId, kind: 'second' },
    ]);
  });
});

test('releasing an AI tip reservation only removes that request', async () => {
  await withTempDatabase(() => {
    const first = tryReserveAiCall();
    const second = tryReserveAiCall();
    assert.ok(first.reservationId);
    assert.ok(second.reservationId);

    releaseAiCall(first.reservationId);

    assert.deepEqual(query('SELECT id FROM ai_tip_calls ORDER BY id'), [
      { id: second.reservationId },
    ]);
  });
});

test('releasing an AI quiz-assist reservation only removes that request', async () => {
  await withTempDatabase(() => {
    const first = reserveQuizAssistCall('hint');
    const second = reserveQuizAssistCall('hint');
    assert.ok(first.reservationId);
    assert.ok(second.reservationId);

    releaseQuizAssistCall(first.reservationId);

    assert.deepEqual(
      query('SELECT id, kind FROM ai_quiz_assist_calls ORDER BY id'),
      [{ id: second.reservationId, kind: 'hint' }],
    );
  });
});
