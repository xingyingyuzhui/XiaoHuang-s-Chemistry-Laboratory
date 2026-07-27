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

async function withApiServer(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-mastery-'));
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

test('mastery map returns empty data gracefully when no sessions exist', async () => {
  await withApiServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/mastery`);
    const payload = await response.json();

    assert.equal(payload.success, true);
    assert.equal(payload.data.summary.totalQuestions, 0);
    assert.equal(payload.data.summary.totalCorrect, 0);
    assert.equal(payload.data.summary.accuracy, 0);
    assert.equal(Array.isArray(payload.data.topics), true);
    assert.equal(Array.isArray(payload.data.weakTopics), true);
    assert.ok(payload.data.suggestions.length > 0, 'should have suggestion for empty state');
    assert.ok(
      payload.data.suggestions[0].includes('还没有练习记录'),
      'should suggest starting practice',
    );
  });
});

test('mastery map computes accuracy from quiz sessions', async () => {
  await withApiServer(async (baseUrl) => {
    // Create tables and insert test data
    run(`CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY, created_at INTEGER, grades TEXT, difficulty TEXT,
      topics TEXT, reveal TEXT, total INTEGER, correct INTEGER, answered INTEGER, summary TEXT
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY, session_id TEXT, idx INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      chosen INTEGER, used_hint INTEGER, used_explain INTEGER, is_correct INTEGER
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
      id TEXT PRIMARY KEY, created_at INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      last_chosen INTEGER, last_session_id TEXT, dismissed INTEGER
    )`);

    const now = Date.now();
    run(
      `INSERT INTO quiz_sessions (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-s1', now, '[]', '中级', '[]', 'immediate', 4, 3, 4, ''],
    );

    // 3 correct + 1 wrong
    const items = [
      { id: 'qi1', stem: '水的化学式', knowledge: '物质的分类与变化', correct: 1 },
      { id: 'qi2', stem: '离子方程式书写', knowledge: '离子反应', correct: 1 },
      { id: 'qi3', stem: '氧化还原判断', knowledge: '氧化还原反应', correct: 1 },
      { id: 'qi4', stem: 'pH 计算', knowledge: '水溶液中的离子平衡', correct: 0 },
    ];
    for (const item of items) {
      run(
        `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, chosen, is_correct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [item.id, 'test-s1', 0, item.stem, '[]', 0, item.knowledge, 0, item.correct],
      );
    }

    // Add wrong item to wrong book
    run(
      `INSERT INTO quiz_wrong_book (id, created_at, stem, options, answer, knowledge, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['wb1', now, 'pH 计算', '[]', 1, '水溶液中的离子平衡', 0],
    );

    const response = await fetch(`${baseUrl}/api/mastery`);
    const payload = await response.json();

    assert.equal(payload.success, true);
    assert.equal(payload.data.summary.totalQuestions, 4);
    assert.equal(payload.data.summary.totalCorrect, 3);
    assert.equal(payload.data.summary.accuracy, 75);
    assert.equal(payload.data.summary.totalWrong, 1);

    // Check topic classification
    const ionTopic = payload.data.topics.find((t) => t.id === 'ion-balance');
    assert.ok(ionTopic, 'should have ion-balance topic');
    assert.equal(ionTopic.total, 1);
    assert.equal(ionTopic.correct, 0);
    assert.equal(ionTopic.wrong, 1);
    assert.equal(ionTopic.level, 'beginner');

    // Weak topics should include the wrong one
    const weakIds = payload.data.weakTopics.map((t) => t.id);
    assert.ok(weakIds.includes('ion-balance'), 'ion-balance should be weak');
  });
});

test('mastery map sorts weaker topics first and includes wrong-book-only weak topics', async () => {
  await withApiServer(async (baseUrl) => {
    run(`CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY, created_at INTEGER, grades TEXT, difficulty TEXT,
      topics TEXT, reveal TEXT, total INTEGER, correct INTEGER, answered INTEGER, summary TEXT
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY, session_id TEXT, idx INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      chosen INTEGER, used_hint INTEGER, used_explain INTEGER, is_correct INTEGER
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
      id TEXT PRIMARY KEY, created_at INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      last_chosen INTEGER, last_session_id TEXT, dismissed INTEGER
    )`);

    const now = Date.now();
    run(
      `INSERT INTO quiz_sessions (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-sort', now, '[]', '', '[]', 'immediate', 2, 2, 2, ''],
    );
    // mastered-ish: ion reaction 2/2
    run(
      `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, chosen, is_correct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['qi-m1', 'test-sort', 0, '离子方程式书写', '[]', 0, '离子反应', 0, 1],
    );
    run(
      `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, chosen, is_correct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['qi-m2', 'test-sort', 1, '离子共存判断', '[]', 0, '离子反应', 0, 1],
    );
    // only wrong-book, no quiz_items for polymer（避开「水解」等易误分词）
    run(
      `INSERT INTO quiz_wrong_book (id, created_at, stem, options, answer, knowledge, dismissed)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ['wb-poly', now, '下列关于淀粉的说法正确的是', '[]', 0, '淀粉', 0],
    );

    const response = await fetch(`${baseUrl}/api/mastery`);
    const payload = await response.json();
    assert.equal(payload.success, true);

    const polymer = payload.data.topics.find((t) => t.id === 'polymer');
    assert.ok(polymer, 'polymer topic should exist');
    assert.equal(polymer.wrong, 1, 'wrong-book-only item should count on polymer');

    // 有错题的知识点 level 仍是 unstarted，但排序应在 mastered 之前
    const ionIdx = payload.data.topics.findIndex((t) => t.id === 'ion-reaction');
    const polyIdx = payload.data.topics.findIndex((t) => t.id === 'polymer');
    assert.ok(polyIdx < ionIdx, 'unstarted/weak topic should sort before mastered');

    const weakIds = payload.data.weakTopics.map((t) => t.id);
    assert.ok(weakIds.includes('polymer'), 'wrong-book-only topic should be weak');
  });
});

test('mastery map sorts beginner (level order 0) before unstarted — ?? not ||', async () => {
  await withApiServer(async (baseUrl) => {
    run(`CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY, created_at INTEGER, grades TEXT, difficulty TEXT,
      topics TEXT, reveal TEXT, total INTEGER, correct INTEGER, answered INTEGER, summary TEXT
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY, session_id TEXT, idx INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      chosen INTEGER, used_hint INTEGER, used_explain INTEGER, is_correct INTEGER
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
      id TEXT PRIMARY KEY, created_at INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      last_chosen INTEGER, last_session_id TEXT, dismissed INTEGER
    )`);

    const now = Date.now();
    run(
      `INSERT INTO quiz_sessions (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-beginner-sort', now, '[]', '', '[]', 'immediate', 1, 0, 1, ''],
    );
    // 0/1 正确率 → beginner（LEVEL_ORDER 值为 0；若用 || 会变成 9 排到最后）
    run(
      `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, chosen, is_correct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['qi-beginner', 'test-beginner-sort', 0, '氧化还原判断题', '[]', 0, '氧化还原反应', 1, 0],
    );

    const response = await fetch(`${baseUrl}/api/mastery`);
    const payload = await response.json();
    assert.equal(payload.success, true);

    const redox = payload.data.topics.find((t) => t.id === 'redox');
    assert.ok(redox, 'redox topic should exist');
    assert.equal(redox.level, 'beginner');
    assert.equal(redox.total, 1);
    assert.equal(redox.correct, 0);

    const unstarted = payload.data.topics.find((t) => t.level === 'unstarted');
    assert.ok(unstarted, 'should still list unstarted topics');

    const beginnerIdx = payload.data.topics.findIndex((t) => t.id === 'redox');
    const firstUnstartedIdx = payload.data.topics.findIndex((t) => t.level === 'unstarted');
    assert.ok(beginnerIdx >= 0, 'beginner topic must appear in list');
    assert.ok(
      beginnerIdx < firstUnstartedIdx,
      `beginner (index ${beginnerIdx}) must sort before first unstarted (index ${firstUnstartedIdx}); ` +
        'LEVEL_ORDER.beginner is 0 — sort must use ?? not ||',
    );

    // 列表头部应是起步级，不能先是一片未开始
    assert.equal(payload.data.topics[0].level, 'beginner');
  });
});

test('mastery map prefers longer keyword matches when classifying', async () => {
  await withApiServer(async (baseUrl) => {
    run(`CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY, created_at INTEGER, grades TEXT, difficulty TEXT,
      topics TEXT, reveal TEXT, total INTEGER, correct INTEGER, answered INTEGER, summary TEXT
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY, session_id TEXT, idx INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      chosen INTEGER, used_hint INTEGER, used_explain INTEGER, is_correct INTEGER
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
      id TEXT PRIMARY KEY, created_at INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      last_chosen INTEGER, last_session_id TEXT, dismissed INTEGER
    )`);

    const now = Date.now();
    run(
      `INSERT INTO quiz_sessions (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-kw', now, '[]', '', '[]', 'immediate', 1, 0, 1, ''],
    );
    // 「水解」会命中离子平衡，「蛋白质」更长应归 polymer
    run(
      `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, chosen, is_correct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['qi-kw', 'test-kw', 0, '蛋白质水解产物是什么', '[]', 0, '', 1, 0],
    );

    const response = await fetch(`${baseUrl}/api/mastery`);
    const payload = await response.json();
    assert.equal(payload.success, true);
    const polymer = payload.data.topics.find((t) => t.id === 'polymer');
    const ionBal = payload.data.topics.find((t) => t.id === 'ion-balance');
    assert.equal(polymer?.total, 1, 'longer keyword 蛋白质 should win');
    assert.equal(ionBal?.total || 0, 0, 'short keyword 水解 should not steal the match');
  });
});

test('mastery map classifies unknown questions to uncategorized', async () => {
  await withApiServer(async (baseUrl) => {
    run(`CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY, created_at INTEGER, grades TEXT, difficulty TEXT,
      topics TEXT, reveal TEXT, total INTEGER, correct INTEGER, answered INTEGER, summary TEXT
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY, session_id TEXT, idx INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      chosen INTEGER, used_hint INTEGER, used_explain INTEGER, is_correct INTEGER
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
      id TEXT PRIMARY KEY, created_at INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      last_chosen INTEGER, last_session_id TEXT, dismissed INTEGER
    )`);

    const now = Date.now();
    run(
      `INSERT INTO quiz_sessions (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-s2', now, '[]', '', '[]', 'immediate', 1, 1, 1, ''],
    );
    run(
      `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, chosen, is_correct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['qi-uncat', 'test-s2', 0, '某道无法分类的综合题', '[]', 0, '', 0, 1],
    );

    const response = await fetch(`${baseUrl}/api/mastery`);
    const payload = await response.json();

    assert.equal(payload.success, true);
    const uncat = payload.data.topics.find((t) => t.id === 'uncategorized');
    assert.ok(uncat, 'should have uncategorized topic');
    assert.equal(uncat.total, 1);
    assert.equal(uncat.correct, 1);
  });
});

test('mastery classification: short ambiguous words in stem alone do not misclassify', async () => {
  // Table-driven: stem with only a short ambiguous word + empty knowledge → uncategorized
  const cases = [
    { stem: '下列关于酸的说法正确的是', knowledge: '', expected: 'uncategorized' },
    { stem: '碱能与哪些物质反应', knowledge: '', expected: 'uncategorized' },
    { stem: '铁的化学性质', knowledge: '', expected: 'uncategorized' },
  ];
  // We can't easily call classifyQuestion directly (it's in the route module),
  // but we can test via the API by inserting quiz items and checking topic assignment.
  // For a pure unit-level check, we verify the behavior through the full API path.
  await withApiServer(async (baseUrl) => {
    run(`CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY, created_at INTEGER, grades TEXT, difficulty TEXT,
      topics TEXT, reveal TEXT, total INTEGER, correct INTEGER, answered INTEGER, summary TEXT
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY, session_id TEXT, idx INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      chosen INTEGER, used_hint INTEGER, used_explain INTEGER, is_correct INTEGER
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
      id TEXT PRIMARY KEY, created_at INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      last_chosen INTEGER, last_session_id TEXT, dismissed INTEGER
    )`);

    const now = Date.now();
    run(
      `INSERT INTO quiz_sessions (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-ambig', now, '[]', '', '[]', 'immediate', cases.length, 0, cases.length, ''],
    );

    for (let i = 0; i < cases.length; i++) {
      run(
        `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, chosen, is_correct)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [`qi-ambig-${i}`, 'test-ambig', i, cases[i].stem, '[]', 0, cases[i].knowledge, 0, 0],
      );
    }

    const response = await fetch(`${baseUrl}/api/mastery`);
    const payload = await response.json();
    assert.equal(payload.success, true);

    const uncat = payload.data.topics.find((t) => t.id === 'uncategorized');
    assert.ok(uncat, 'should have uncategorized topic');
    assert.equal(uncat.total, cases.length, 'all short-ambiguous cases should land in uncategorized');
  });
});

test('mastery classification: knowledge field boosts classification', async () => {
  await withApiServer(async (baseUrl) => {
    run(`CREATE TABLE IF NOT EXISTS quiz_sessions (
      id TEXT PRIMARY KEY, created_at INTEGER, grades TEXT, difficulty TEXT,
      topics TEXT, reveal TEXT, total INTEGER, correct INTEGER, answered INTEGER, summary TEXT
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_items (
      id TEXT PRIMARY KEY, session_id TEXT, idx INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      chosen INTEGER, used_hint INTEGER, used_explain INTEGER, is_correct INTEGER
    )`);
    run(`CREATE TABLE IF NOT EXISTS quiz_wrong_book (
      id TEXT PRIMARY KEY, created_at INTEGER, stem TEXT, options TEXT,
      answer INTEGER, knowledge TEXT, hint TEXT, explain_bank TEXT,
      last_chosen INTEGER, last_session_id TEXT, dismissed INTEGER
    )`);

    const now = Date.now();
    run(
      `INSERT INTO quiz_sessions (id, created_at, grades, difficulty, topics, reveal, total, correct, answered, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['test-kboost', now, '[]', '', '[]', 'immediate', 1, 0, 1, ''],
    );
    // stem alone has short ambiguous "铁", but knowledge says "氧化还原反应"
    run(
      `INSERT INTO quiz_items (id, session_id, idx, stem, options, answer, knowledge, chosen, is_correct)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ['qi-kboost', 'test-kboost', 0, '铁与稀硝酸反应', '[]', 0, '氧化还原反应', 0, 0],
    );

    const response = await fetch(`${baseUrl}/api/mastery`);
    const payload = await response.json();
    assert.equal(payload.success, true);
    const redox = payload.data.topics.find((t) => t.id === 'redox');
    assert.ok(redox, 'should have redox topic');
    assert.equal(redox.total, 1, 'knowledge field "氧化还原反应" should classify correctly');
  });
});
