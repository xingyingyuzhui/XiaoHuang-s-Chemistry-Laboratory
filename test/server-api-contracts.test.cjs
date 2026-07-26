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
  run,
} = require('../server/db/sqlite');
const { storeQuizPaper } = require('../server/utils/quiz-paper-store');

async function withApiServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-api-test-'));
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

test('quiz session uses the server paper answer instead of a tampered client answer', async () => {
  await withApiServer(async (baseUrl) => {
    const paperId = storeQuizPaper([
      {
        id: 'q-water',
        stem: '水的化学式是？',
        options: ['H₂', 'H₂O', 'O₂', 'CO₂'],
        answer: 1,
      },
    ]);

    const response = await fetch(`${baseUrl}/api/quiz/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperId,
        items: [
          {
            id: 'q-water',
            stem: '被篡改的题干',
            options: ['x', 'y', 'z', 'w'],
            answer: 0,
            chosen: 0,
          },
        ],
      }),
    });
    const payload = await response.json();

    assert.equal(payload.success, true);
    assert.equal(payload.data.correct, 0);
    assert.deepEqual(
      queryOne('SELECT stem, answer, is_correct FROM quiz_items'),
      { stem: '水的化学式是？', answer: 1, is_correct: 0 },
    );
  });
});

test('settings API masks a stored AI key', async () => {
  await withApiServer(async (baseUrl) => {
    run(
      'INSERT INTO settings (key, value) VALUES (?, ?)',
      [
        'ai',
        JSON.stringify({
          apiBase: 'https://api.deepseek.com',
          apiKey: 'sk-secret-value',
          model: 'deepseek-v4-flash',
        }),
      ],
    );

    const response = await fetch(`${baseUrl}/api/settings`);
    const payload = await response.json();

    assert.equal(payload.success, true);
    assert.equal(payload.data.ai.apiKey, 'sk-s***ue');
    assert.notEqual(payload.data.ai.apiKey, 'sk-secret-value');
  });
});
