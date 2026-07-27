const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../server');
const { initDatabase, closeDatabase } = require('../server/db/sqlite');
const { LABS_BUILTIN } = require('../server/seed/labs-builtin');

async function withApiServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-labs-'));
  const dbPath = path.join(dir, 'chem-lab.db');
  let server;
  try {
    await initDatabase(dbPath);
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    return await fn(baseUrl);
  } finally {
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('labs seed auto-loads builtin experiments', async () => {
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/labs`);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.labs.length >= LABS_BUILTIN.length);
    assert.ok(body.data.labs.some((l) => l.id === 'lab-o2'));
    assert.ok(body.data.labs.find((l) => l.id === 'lab-o2')?.prestudy?.steps?.length > 0);
  });
});

test('labs CRUD create update delete', async () => {
  await withApiServer(async (baseUrl) => {
    const createRes = await fetch(`${baseUrl}/api/labs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '测试实验',
        type: '演示',
        steps: [{ label: '第一步', tip: '提示' }],
      }),
    });
    const created = await createRes.json();
    assert.equal(created.success, true);
    assert.equal(created.data.title, '测试实验');
    const id = created.data.id;

    const putRes = await fetch(`${baseUrl}/api/labs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '测试实验改' }),
    });
    const updated = await putRes.json();
    assert.equal(updated.data.title, '测试实验改');

    const delRes = await fetch(`${baseUrl}/api/labs/${id}`, { method: 'DELETE' });
    const del = await delRes.json();
    assert.equal(del.success, true);

    const getRes = await fetch(`${baseUrl}/api/labs/${id}`);
    const got = await getRes.json();
    assert.equal(got.success, false);
  });
});

test('labs export/import pack roundtrip', async () => {
  await withApiServer(async (baseUrl) => {
    const exp = await (await fetch(`${baseUrl}/api/labs/export`)).json();
    assert.equal(exp.data.format, 'xiaohuang-lab-pack');
    assert.equal(exp.data.version, 1);
    assert.ok(exp.data.labs.length >= 1);

    const imp = await fetch(`${baseUrl}/api/labs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'xiaohuang-lab-pack',
        version: 1,
        labs: [
          {
            id: 'lab-custom-imp',
            title: '导入的实验',
            type: '测试',
            steps: [{ label: 'A', tip: 'B' }],
            prestudy: null,
            sortOrder: 99,
          },
        ],
      }),
    });
    const body = await imp.json();
    assert.equal(body.success, true);
    assert.equal(body.data.created, 1);

    const list = await (await fetch(`${baseUrl}/api/labs`)).json();
    assert.ok(list.data.labs.some((l) => l.id === 'lab-custom-imp'));
  });
});

test('labs reorder and reset builtin', async () => {
  await withApiServer(async (baseUrl) => {
    const list = await (await fetch(`${baseUrl}/api/labs`)).json();
    const ids = list.data.labs.map((l) => l.id).reverse();
    const re = await fetch(`${baseUrl}/api/labs/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    assert.equal((await re.json()).success, true);

    // mutate then reset one
    await fetch(`${baseUrl}/api/labs/lab-o2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '被改过的氧气' }),
    });
    const reset = await fetch(`${baseUrl}/api/labs/lab-o2/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const body = await reset.json();
    assert.equal(body.success, true);
    assert.ok(body.data.title.includes('氧气'));
    assert.notEqual(body.data.title, '被改过的氧气');
  });
});

test('labs import never overwrites existing id', async () => {
  await withApiServer(async (baseUrl) => {
    const before = await (await fetch(`${baseUrl}/api/labs/lab-o2`)).json();
    const originalTitle = before.data.title;

    const imp = await fetch(`${baseUrl}/api/labs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'xiaohuang-lab-pack',
        version: 1,
        labs: [
          {
            id: 'lab-o2',
            title: '恶意覆盖氧气',
            type: 'hack',
            steps: [{ label: '坏步骤', tip: 'x' }],
          },
        ],
      }),
    });
    const body = await imp.json();
    assert.equal(body.success, true);
    assert.equal(body.data.created, 1);
    assert.equal(body.data.renamed, 1);
    assert.equal(body.data.updated, 0);

    const o2 = await (await fetch(`${baseUrl}/api/labs/lab-o2`)).json();
    assert.equal(o2.data.title, originalTitle);
    assert.notEqual(o2.data.title, '恶意覆盖氧气');

    const list = await (await fetch(`${baseUrl}/api/labs`)).json();
    const imported = list.data.labs.find((l) => l.title.includes('恶意覆盖氧气'));
    assert.ok(imported);
    assert.notEqual(imported.id, 'lab-o2');
    assert.equal(imported.source, 'custom');
    assert.ok(imported.title.includes('（导入）'));
  });
});

test('labs create rejects empty title and empty predict options', async () => {
  await withApiServer(async (baseUrl) => {
    const noTitle = await fetch(`${baseUrl}/api/labs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '  ', steps: [{ label: 'A', tip: '' }] }),
    });
    assert.equal((await noTitle.json()).success, false);

    const badPredict = await fetch(`${baseUrl}/api/labs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '有假预习',
        steps: [{ label: 'A', tip: 't' }],
        prestudy: {
          steps: [
            {
              label: 'A',
              tip: 't',
              predict: {
                question: '题？',
                options: ['仅一项', '', '', ''],
                answer: 0,
              },
            },
          ],
        },
      }),
    });
    const badBody = await badPredict.json();
    assert.equal(badBody.success, false);
    assert.match(String(badBody.message || badBody.error || ''), /选项|预习/);
  });
});

test('labs put marks source custom; reorder rejects partial ids', async () => {
  await withApiServer(async (baseUrl) => {
    const o2Before = await (await fetch(`${baseUrl}/api/labs/lab-o2`)).json();
    assert.equal(o2Before.data.source, 'builtin');

    const put = await fetch(`${baseUrl}/api/labs/lab-o2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: o2Before.data.title, safety: '改过的安全提示' }),
    });
    const putBody = await put.json();
    assert.equal(putBody.success, true);
    assert.equal(putBody.data.source, 'custom');
    assert.equal(putBody.data.safety, '改过的安全提示');

    const list = await (await fetch(`${baseUrl}/api/labs`)).json();
    const partial = list.data.labs.slice(0, 1).map((l) => l.id);
    const re = await fetch(`${baseUrl}/api/labs/reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: partial }),
    });
    assert.equal((await re.json()).success, false);
  });
});

test('labs seed fills missing builtins without overwriting custom', async () => {
  await withApiServer(async (baseUrl) => {
    await fetch(`${baseUrl}/api/labs/lab-o2`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '用户改的氧气标题' }),
    });
    // 再拉列表会触发 ensureLabsSeeded；不应把标题刷回内置
    const list = await (await fetch(`${baseUrl}/api/labs`)).json();
    const o2 = list.data.labs.find((l) => l.id === 'lab-o2');
    assert.equal(o2.title, '用户改的氧气标题');
    assert.equal(o2.source, 'custom');
    assert.ok(list.data.labs.length >= LABS_BUILTIN.length);
  });
});

test('lab-schema unit rejects empty predict placeholders', () => {
  const { validateLab, validatePredict } = require('../server/utils/lab-schema');
  assert.equal(validatePredict({ question: '', options: ['a', 'b', 'c', 'd'], answer: 0 }).ok, false);
  assert.equal(
    validatePredict({ question: 'q', options: ['a', 'b', 'c', ''], answer: 0 }).ok,
    false,
  );
  assert.equal(
    validateLab({
      title: 'x',
      steps: [{ label: 's', tip: '' }],
      prestudy: {
        steps: [{ label: 's', tip: '', predict: { question: '（请填写题目）', options: ['', '', '', ''], answer: 0 } }],
      },
    }).ok,
    false,
  );
  assert.equal(
    validateLab({ title: '好实验', steps: [{ label: '加热', tip: '注意' }] }).ok,
    true,
  );
});
