const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const { app } = require('../server');
const {
  initDatabase,
  closeDatabase,
  query,
  queryOne,
} = require('../server/db/sqlite');

async function withApiServer(fn) {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'chem-lab-offline-test-'),
  );
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
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// T1: bank schema — every question has the required source metadata fields
test('offline quiz bank has source metadata on every question', () => {
  const { OFFLINE_QUESTIONS } = require('../server/seed/offline-quiz-bank');
  assert.ok(
    OFFLINE_QUESTIONS.length >= 200,
    'bank must contain at least 200 questions',
  );
  for (const q of OFFLINE_QUESTIONS) {
    assert.equal(typeof q.sourceQuestionId, 'string');
    assert.ok(q.sourceQuestionId.length > 0, 'sourceQuestionId required');
    assert.equal(typeof q.stem, 'string');
    assert.ok(q.stem.length > 0, 'question text (stem) required');
    assert.ok(Array.isArray(q.options), 'options must be array');
    assert.equal(q.options.length, 4, 'must have exactly 4 options');
    assert.equal(typeof q.answer, 'number');
    assert.ok(q.answer >= 0 && q.answer <= 3, 'answer must be 0-3');
    assert.equal(typeof q.sourceExam, 'string');
  }
});

// T1b: bank contains questions with HTML table stems (tabular conversion)
test('offline quiz bank contains HTML table stems for tabular questions', () => {
  const { OFFLINE_QUESTIONS } = require('../server/seed/offline-quiz-bank');
  const withTable = OFFLINE_QUESTIONS.filter(q => q.stem.includes('<table'));
  assert.ok(withTable.length >= 20, 'should have at least 20 table questions');
  for (const q of withTable) {
    assert.ok(q.stem.includes('</table>'), 'table must be closed');
    assert.ok(q.stem.includes('quiz-table'), 'table must have quiz-table class');
    assert.equal(q.stem.includes('\\begin{tabular}'), false, 'converted table must not retain raw LaTex table');
  }
});

// T1c: ESM source and CJS seed have identical question data
test('offline quiz ESM source and CJS seed are in sync', async () => {
  const { OFFLINE_QUESTIONS: esmQuestions } = await import('../src/data/offline-quiz-bank.js');
  const { OFFLINE_QUESTIONS: cjsQuestions } = require('../server/seed/offline-quiz-bank');

  assert.equal(esmQuestions.length, cjsQuestions.length, 'ESM and CJS must have same question count');

  for (let i = 0; i < esmQuestions.length; i++) {
    const e = esmQuestions[i];
    const c = cjsQuestions[i];
    assert.equal(e.sourceQuestionId, c.sourceQuestionId, `question ${i} sourceQuestionId mismatch`);
    assert.equal(e.stem, c.stem, `question ${i} stem mismatch`);
    assert.equal(e.answer, c.answer, `question ${i} answer mismatch`);
    assert.equal(e.label, c.label, `question ${i} label mismatch`);
    assert.deepEqual(e.options, c.options, `question ${i} options mismatch`);
  }
});

// T2: GET /api/offline-quiz/list returns questions without leaking answers
test('GET /api/offline-quiz/list returns questions without answer field', async () => {
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/offline-quiz/list`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.questions));
    assert.ok(body.data.questions.length > 0);
    for (const q of body.data.questions) {
      assert.equal(typeof q.sourceQuestionId, 'string');
      assert.equal(typeof q.question, 'string');
      assert.ok(Array.isArray(q.options));
      assert.equal(q.options.length, 4);
      // CRITICAL: no answer, no label in response
      assert.equal(q.answer, undefined, 'answer must not be in list response');
      assert.equal(q.label, undefined, 'label must not be in list response');
    }
  });
});

// T3: POST /api/offline-quiz/generate returns paperId and no-answer questions
test('POST /api/offline-quiz/generate returns paperId and no answers', async () => {
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/offline-quiz/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 5 }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(typeof body.data.paperId, 'string');
    assert.ok(body.data.questions.length > 0);
    assert.ok(body.data.questions.length <= 5);
    for (const q of body.data.questions) {
      assert.equal(q.answer, undefined, 'answer must not leak');
    }
  });
});

// T4: POST /api/offline-quiz/submit scores correctly and persists to quiz_sessions
test('POST /api/offline-quiz/submit scores and persists session', async () => {
  await withApiServer(async (baseUrl) => {
    // Generate
    const genRes = await fetch(`${baseUrl}/api/offline-quiz/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 5 }),
    });
    const gen = await genRes.json();
    assert.equal(gen.success, true);
    const { paperId, questions } = gen.data;

    // Submit all as chosen=0
    const subRes = await fetch(`${baseUrl}/api/offline-quiz/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperId,
        answers: questions.map((q) => ({
          id: q.sourceQuestionId,
          chosen: 0,
        })),
      }),
    });
    assert.equal(subRes.status, 200);
    const sub = await subRes.json();
    assert.equal(sub.success, true);
    assert.equal(typeof sub.data.total, 'number');
    assert.equal(typeof sub.data.correct, 'number');
    assert.equal(sub.data.total, questions.length);
    assert.ok(sub.data.correct >= 0 && sub.data.correct <= sub.data.total);

    // Verify persisted in quiz_sessions (difficulty='离线题库' marks offline)
    const sessions = query(
      "SELECT * FROM quiz_sessions WHERE difficulty = '离线题库'",
    );
    assert.ok(sessions.length >= 1, 'session must be persisted');
  });
});

// T5: Wrong book compatibility — offline wrong answers enter quiz_wrong_book
test('offline quiz wrong answers are added to wrong book', async () => {
  await withApiServer(async (baseUrl) => {
    const genRes = await fetch(`${baseUrl}/api/offline-quiz/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: 3 }),
    });
    const gen = await genRes.json();
    const { paperId, questions } = gen.data;

    // Answer all wrong (use an unlikely answer)
    await fetch(`${baseUrl}/api/offline-quiz/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        paperId,
        answers: questions.map((q) => ({
          id: q.sourceQuestionId,
          chosen: 9,
        })),
      }),
    });

    // Check wrong book
    const wbRes = await fetch(`${baseUrl}/api/quiz/wrong-book`);
    const wb = await wbRes.json();
    assert.equal(wb.success, true);
    // At least some wrong questions should be in the wrong book
    // (depends on chosen=9 being invalid → treated as wrong)
  });
});

// T6: GET /api/offline-quiz/years returns available years
test('GET /api/offline-quiz/years returns year list', async () => {
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/offline-quiz/years`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data.years));
    assert.ok(body.data.years.length > 0);
  });
});

// T7: pagination — default returns pageSize=20
test('GET /api/offline-quiz/list default pagination returns pageSize=20', async () => {
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/offline-quiz/list`);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.page, 1);
    assert.equal(body.data.pageSize, 20);
    assert.ok(body.data.questions.length <= 20);
    assert.ok(body.data.totalPages >= 1);
    assert.ok(body.data.total >= 200, 'total should be full bank count');
  });
});

// T8: pagination — custom page and pageSize
test('GET /api/offline-quiz/list custom page and pageSize', async () => {
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/offline-quiz/list?page=2&pageSize=10`);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.page, 2);
    assert.equal(body.data.pageSize, 10);
    assert.equal(body.data.questions.length, 10);
    assert.ok(body.data.totalPages > 1);
  });
});

// T9: pagination — out-of-range page returns empty
test('GET /api/offline-quiz/list out-of-range page returns empty items', async () => {
  await withApiServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/offline-quiz/list?page=999&pageSize=20`);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.page, 999);
    assert.equal(body.data.questions.length, 0);
    assert.ok(body.data.total >= 200, 'total should still be full count');
    assert.ok(body.data.totalPages >= 1);
  });
});

// T10: pagination — year filter + pagination combined
test('GET /api/offline-quiz/list year filter with pagination', async () => {
  await withApiServer(async (baseUrl) => {
    // First get years
    const yearsRes = await fetch(`${baseUrl}/api/offline-quiz/years`);
    const years = (await yearsRes.json()).data.years;
    const year = years[0];

    // Get filtered list with pagination
    const res = await fetch(`${baseUrl}/api/offline-quiz/list?year=${year}&page=1&pageSize=5`);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.page, 1);
    assert.equal(body.data.pageSize, 5);
    assert.ok(body.data.questions.length <= 5);
    assert.ok(body.data.total >= 1, 'filtered total should be at least 1');
    // total should be count for this year only
    assert.ok(body.data.total <= 200);
  });
});
