const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../server');
const { initDatabase, closeDatabase, run } = require('../server/db/sqlite');
const { validateMoleculePayload, relaxGeometry } = require('../server/utils/molecule-validate');

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const angleDeg = (a, c, b) => {
  const [ux, uy, uz] = [a.x - c.x, a.y - c.y, a.z - c.z];
  const [vx, vy, vz] = [b.x - c.x, b.y - c.y, b.z - c.z];
  const cos = (ux * vx + uy * vy + uz * vz) / (Math.hypot(ux, uy, uz) * Math.hypot(vx, vy, vz));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};

test('accurate H2O, CH4, and CO2 are NOT distorted by relaxGeometry (bond lengths & VSEPR angles intact)', () => {
  const halfAngle = (104.5 / 2) * (Math.PI / 180);
  const h2o = validateMoleculePayload({
    name: '水', formula: 'H₂O',
    atoms: [
      { el: 'O', x: 0, y: 0, z: 0 },
      { el: 'H', x: 0.96 * Math.sin(halfAngle), y: 0.96 * Math.cos(halfAngle), z: 0 },
      { el: 'H', x: -0.96 * Math.sin(halfAngle), y: 0.96 * Math.cos(halfAngle), z: 0 },
    ],
    bonds: [[0, 1], [0, 2]],
  }, { fromAi: true, strictGeometry: true, relax: true });
  assert.ok(Math.abs(dist(h2o.atoms[0], h2o.atoms[1]) - 0.96) < 1e-6);
  assert.ok(Math.abs(angleDeg(h2o.atoms[1], h2o.atoms[0], h2o.atoms[2]) - 104.5) < 1e-4);

  const s = 1.09 / Math.sqrt(3);
  const ch4 = validateMoleculePayload({
    name: '甲烷', formula: 'CH₄',
    atoms: [
      { el: 'C', x: 0, y: 0, z: 0 },
      { el: 'H', x: s, y: s, z: s }, { el: 'H', x: s, y: -s, z: -s },
      { el: 'H', x: -s, y: s, z: -s }, { el: 'H', x: -s, y: -s, z: s },
    ],
    bonds: [[0, 1], [0, 2], [0, 3], [0, 4]],
  }, { fromAi: true, strictGeometry: true, relax: true });
  assert.ok(Math.abs(dist(ch4.atoms[0], ch4.atoms[1]) - 1.09) < 1e-6);
  assert.ok(Math.abs(angleDeg(ch4.atoms[1], ch4.atoms[0], ch4.atoms[2]) - 109.4712) < 1e-2);

  const co2 = validateMoleculePayload({
    name: '二氧化碳', formula: 'CO₂',
    atoms: [{ el: 'C', x: 0, y: 0, z: 0 }, { el: 'O', x: -1.16, y: 0, z: 0 }, { el: 'O', x: 1.16, y: 0, z: 0 }],
    bonds: [[0, 1], [0, 1], [0, 2], [0, 2]],
  }, { fromAi: true, strictGeometry: true, relax: true });
  assert.ok(Math.abs(dist(co2.atoms[0], co2.atoms[1]) - 1.16) < 1e-6);
  assert.ok(Math.abs(angleDeg(co2.atoms[1], co2.atoms[0], co2.atoms[2]) - 180) < 1e-4);
});

test('relaxGeometry stays finite and bounded even when all atoms start coincident', () => {
  const atoms = [
    { el: 'O', x: 0, y: 0, z: 0 },
    { el: 'H', x: 0, y: 0, z: 0 },
    { el: 'H', x: 0, y: 0, z: 0 },
  ];
  const relaxed = relaxGeometry(atoms, [[0, 1], [0, 2]]);
  for (const a of relaxed) {
    assert.ok(Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z));
    assert.ok(Math.hypot(a.x, a.y, a.z) < 10, `atom exploded to ${JSON.stringify(a)}`);
  }
  assert.ok(dist(relaxed[0], relaxed[1]) > 0.5 && dist(relaxed[0], relaxed[1]) < 1.5);
});

test('bidirectional bonds deduplicate cleanly and non-AI empty bonds infer covalent connectivity', () => {
  const h2o = validateMoleculePayload({
    name: '水', formula: 'H₂O',
    atoms: [{ el: 'O', x: 0, y: 0, z: 0 }, { el: 'H', x: 0.76, y: 0.59, z: 0 }, { el: 'H', x: -0.76, y: 0.59, z: 0 }],
    bonds: [[0, 1], [1, 0], [0, 2], [2, 0]],
  }, { fromAi: true, strictGeometry: true });
  assert.deepEqual(h2o.bonds, [[0, 1], [0, 2]]);

  const s = 1.09 / Math.sqrt(3);
  const ch4Inferred = validateMoleculePayload({
    name: '甲烷', formula: 'CH₄',
    atoms: [
      { el: 'C', x: 0, y: 0, z: 0 },
      { el: 'H', x: s, y: s, z: s }, { el: 'H', x: s, y: -s, z: -s },
      { el: 'H', x: -s, y: s, z: -s }, { el: 'H', x: -s, y: -s, z: s },
    ],
    bonds: [],
  }, { fromAi: false });
  assert.deepEqual(ch4Inferred.bonds, [[0, 1], [0, 2], [0, 3], [0, 4]]);
});

test('rejects fake elements, valence/order violations, empty AI bonds, stoichiometry mismatch, and overlaps', () => {
  assert.throws(() => validateMoleculePayload({
    name: '伪元素', formula: 'Xz₂',
    atoms: [{ el: 'Xz', x: 0, y: 0, z: 0 }, { el: 'Xz', x: 1.2, y: 0, z: 0 }],
    bonds: [[0, 1]],
  }, { fromAi: true }), /元素符号无效/);

  assert.throws(() => validateMoleculePayload({
    name: '四重键', formula: 'C₂',
    atoms: [{ el: 'C', x: 0, y: 0, z: 0 }, { el: 'C', x: 1.2, y: 0, z: 0 }],
    bonds: [[0, 1], [0, 1], [0, 1], [0, 1]],
  }, { fromAi: true }), /超过最大允许三键/);

  assert.throws(() => validateMoleculePayload({
    name: '超价氢', formula: 'H₃',
    atoms: [{ el: 'H', x: 0, y: 0, z: 0 }, { el: 'H', x: 0.74, y: 0, z: 0 }, { el: 'H', x: -0.74, y: 0, z: 0 }],
    bonds: [[0, 1], [0, 2]],
  }, { fromAi: true }), /最大价态/);

  assert.throws(() => validateMoleculePayload({
    name: '无键分子', formula: 'H₂O',
    atoms: [{ el: 'O', x: 0, y: 0, z: 0 }, { el: 'H', x: 0.76, y: 0.59, z: 0 }, { el: 'H', x: -0.76, y: 0.59, z: 0 }],
    bonds: [],
  }, { fromAi: true }), /未提供有效化学键/);

  assert.throws(() => validateMoleculePayload({
    name: '计量不符', formula: 'H₂O',
    atoms: [
      { el: 'O', x: 0, y: 0, z: 0 },
      { el: 'H', x: 0.96, y: 0, z: 0 },
      { el: 'H', x: -0.48, y: 0.83, z: 0 },
      { el: 'H', x: -0.48, y: -0.83, z: 0 },
    ],
    bonds: [[0, 1], [0, 2], [0, 3]],
  }, { fromAi: true }), /元素计数不一致/);

  assert.throws(() => validateMoleculePayload({
    name: '严重重叠', formula: 'H₂O',
    atoms: [
      { el: 'O', x: 0, y: 0, z: 0 },
      { el: 'H', x: 0.96, y: 0, z: 0 },
      { el: 'H', x: 0.96, y: 0.2, z: 0 },
    ],
    bonds: [[0, 1], [0, 2]],
  }, { fromAi: true, strictGeometry: true, relax: false }), /重叠/);
});

test('POST /api/ai/generate parses fenced trailing-comma JSON via parseModelJson without fixJson crash', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-mol-ai-test-'));
  const origFetch = global.fetch;
  let server;
  try {
    const fenced = '```json\n' +
      '{"name":"水","formula":"H₂O","desc":"极性分子","atoms":[' +
      '{"el":"O","x":0,"y":0,"z":0},{"el":"H","x":0.76,"y":0.59,"z":0},{"el":"H","x":-0.76,"y":0.59,"z":0},' +
      '],"bonds":[[0,1],[0,2],],"physics":{"state":"液态"},"chemistry":{"acidity":"中性"},}\n```';
    global.fetch = async (url, opts) => {
      if (String(url).startsWith('https://api.deepseek.com')) {
        return new Response(JSON.stringify({ choices: [{ message: { content: fenced } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return origFetch(url, opts);
    };

    await initDatabase(path.join(dir, 'test.db'));
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
      'ai',
      JSON.stringify({ apiBase: 'https://api.deepseek.com', apiKey: 'sk-test-key', model: 'deepseek-flash' }),
    ]);

    server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.once('listening', r));
    const resp = await origFetch(`http://127.0.0.1:${server.address().port}/api/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '水分子 H2O' }),
    });
    assert.equal(resp.status, 200);
    const body = await resp.json();
    assert.equal(body.success, true);
    assert.equal(body.data.formula, 'H₂O');
    assert.equal(body.data.atoms.length, 3);
  } finally {
    global.fetch = origFetch;
    if (server) await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
