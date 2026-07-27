const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../server');
const {
  initDatabase,
  closeDatabase,
  queryOne,
} = require('../server/db/sqlite');

async function withApiServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-lp-'));
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

test('lesson packs CRUD: create, list, get, update, delete', async () => {
  await withApiServer(async (baseUrl) => {
    // Create
    const createRes = await fetch(`${baseUrl}/api/lesson-packs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '高一第一章',
        grade: '高一',
        topics: '物质分类',
        notes: '测试备注',
        contents: { selectedTopics: ['物质的分类与变化'] },
      }),
    });
    const created = await createRes.json();
    assert.equal(created.success, true);
    assert.equal(created.data.name, '高一第一章');
    assert.equal(created.data.grade, '高一');

    const packId = created.data.id;

    // List
    const listRes = await fetch(`${baseUrl}/api/lesson-packs`);
    const listed = await listRes.json();
    assert.equal(listed.success, true);
    assert.equal(listed.data.packs.length, 1);
    assert.equal(listed.data.packs[0].id, packId);

    // Get
    const getRes = await fetch(`${baseUrl}/api/lesson-packs/${packId}`);
    const got = await getRes.json();
    assert.equal(got.success, true);
    assert.equal(got.data.name, '高一第一章');
    assert.deepEqual(got.data.contents.selectedTopics, ['物质的分类与变化']);

    // Update
    const updateRes = await fetch(`${baseUrl}/api/lesson-packs/${packId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '高一第一章（修订版）' }),
    });
    const updated = await updateRes.json();
    assert.equal(updated.success, true);
    assert.equal(updated.data.name, '高一第一章（修订版）');

    // Delete
    const deleteRes = await fetch(`${baseUrl}/api/lesson-packs/${packId}`, {
      method: 'DELETE',
    });
    const deleted = await deleteRes.json();
    assert.equal(deleted.success, true);

    // Verify deleted
    const listAfter = await fetch(`${baseUrl}/api/lesson-packs`);
    const listedAfter = await listAfter.json();
    assert.equal(listedAfter.data.packs.length, 0);
  });
});

test('lesson pack export/import roundtrip preserves content', async () => {
  await withApiServer(async (baseUrl) => {
    // Create a pack
    const createRes = await fetch(`${baseUrl}/api/lesson-packs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: '导出测试',
        grade: '高二',
        topics: '有机化学',
        notes: '用于测试',
        contents: { selectedTopics: ['有机化合物通识'], selectedLabs: ['lab-ester'] },
      }),
    });
    const created = (await createRes.json()).data;

    // Export
    const exportRes = await fetch(`${baseUrl}/api/lesson-packs/${created.id}/export`);
    const exported = (await exportRes.json()).data;

    assert.equal(exported.format, 'xiaohuang-lesson-pack');
    assert.equal(exported.version, 1);
    assert.equal(exported.metadata.name, '导出测试');
    assert.equal(exported.metadata.grade, '高二');
    assert.deepEqual(exported.contents.selectedTopics, ['有机化合物通识']);
    assert.deepEqual(exported.contents.selectedLabs, ['lab-ester']);
    assert.ok(exported.metadata.exportedAt, 'should have export timestamp');

    // Import
    const importRes = await fetch(`${baseUrl}/api/lesson-packs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exported),
    });
    const imported = await importRes.json();
    assert.equal(imported.success, true);
    // Import with existing name should auto-rename
    assert.ok(imported.data.pack.name.includes('导出测试'), 'should keep base name');
    assert.deepEqual(imported.data.pack.contents.selectedTopics, ['有机化合物通识']);
    assert.equal(imported.data.nameChanged, true);

    // Should have 2 packs now
    const listRes = await fetch(`${baseUrl}/api/lesson-packs`);
    const listed = await listRes.json();
    assert.equal(listed.data.packs.length, 2);
  });
});

test('lesson pack import rejects invalid format', async () => {
  await withApiServer(async (baseUrl) => {
    // Wrong format
    const res1 = await fetch(`${baseUrl}/api/lesson-packs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'wrong', version: 1, metadata: { name: 'test' } }),
    });
    const p1 = await res1.json();
    assert.equal(p1.success, false);
    assert.ok(p1.message.includes('格式'));

    // Wrong version
    const res2 = await fetch(`${baseUrl}/api/lesson-packs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'xiaohuang-lesson-pack', version: 99, metadata: { name: 'test' } }),
    });
    const p2 = await res2.json();
    assert.equal(p2.success, false);
    assert.ok(p2.message.includes('版本'));

    // Missing metadata
    const res3 = await fetch(`${baseUrl}/api/lesson-packs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'xiaohuang-lesson-pack', version: 1 }),
    });
    const p3 = await res3.json();
    assert.equal(p3.success, false);
    assert.ok(p3.message.includes('metadata'));
  });
});

test('lesson pack import handles name conflict by generating new name', async () => {
  await withApiServer(async (baseUrl) => {
    // Create original
    await fetch(`${baseUrl}/api/lesson-packs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '同名测试' }),
    });

    // Import with same name
    const importRes = await fetch(`${baseUrl}/api/lesson-packs/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        format: 'xiaohuang-lesson-pack',
        version: 1,
        metadata: { name: '同名测试' },
        contents: {},
      }),
    });
    const imported = await importRes.json();
    assert.equal(imported.success, true);
    assert.equal(imported.data.nameChanged, true);
    assert.ok(imported.data.pack.name.includes('同名测试'));
    assert.notEqual(imported.data.pack.name, '同名测试');

    // Original should still exist
    const listRes = await fetch(`${baseUrl}/api/lesson-packs`);
    const listed = await listRes.json();
    assert.equal(listed.data.packs.length, 2);
    const names = listed.data.packs.map((p) => p.name);
    assert.ok(names.includes('同名测试'), 'original should remain');
  });
});

test('lesson pack export does not contain sensitive fields', async () => {
  await withApiServer(async (baseUrl) => {
    const createRes = await fetch(`${baseUrl}/api/lesson-packs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '安全测试' }),
    });
    const created = (await createRes.json()).data;

    const exportRes = await fetch(`${baseUrl}/api/lesson-packs/${created.id}/export`);
    const exported = (await exportRes.json()).data;

    // Should not contain internal fields
    assert.equal(exported.id, undefined);
    assert.equal(exported.createdAt, undefined);
    assert.equal(exported.updatedAt, undefined);
    assert.equal(exported.metadata.apiKey, undefined);
    assert.equal(exported.metadata.dbPath, undefined);
  });
});
