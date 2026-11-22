const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const { app } = require('../server');
const { initDatabase, closeDatabase } = require('../server/db/sqlite');
const { hasRoute } = require('../server/utils/route-probe');
const assistantRoute = require('../server/routes/ai/assistant');

const { normalizeThinkingQuestion, normalizeThinkingQuestions } = assistantRoute;

function makeMockDoc(activeTab, map = {}) {
  return {
    querySelector(sel) {
      if (sel === '.tab.active[data-tab]') {
        return { dataset: { tab: activeTab }, getAttribute: () => activeTab };
      }
      const val = map[sel];
      if (!val) return null;
      if (typeof val === 'string') return { textContent: val, value: val };
      return val;
    },
  };
}

test('normalizeThinkingQuestion validates fields and enforces action allowlist', () => {
  const ok = normalizeThinkingQuestion({
    question: '  为什么 NaCl 晶体中每个 Na⁺ 周围有 6 个 Cl⁻？  ',
    answer: '  由半径比决定，正八面体空隙配位数为 6。 ',
    hint: '观察体心 Na⁺ 的六个面心近邻',
    action: 'coordination',
  });
  assert.equal(ok.question, '为什么 NaCl 晶体中每个 Na⁺ 周围有 6 个 Cl⁻？');
  assert.equal(ok.answer, '由半径比决定，正八面体空隙配位数为 6。');
  assert.equal(ok.hint, '观察体心 Na⁺ 的六个面心近邻');
  assert.equal(ok.action, 'coordination');

  const filtered = normalizeThinkingQuestion({
    question: '晶胞均摊怎么数？',
    answer: '顶点 1/8，面心 1/2。',
    hint: '   ',
    action: 'rm -rf',
  });
  assert.equal(filtered.action, null);
  assert.equal('hint' in filtered, false);

  assert.throws(() => normalizeThinkingQuestion(null), /无效/);
  assert.throws(() => normalizeThinkingQuestion({ question: '  ', answer: '答' }), /题干/);
  assert.throws(() => normalizeThinkingQuestion({ question: '问', answer: '' }), /结论/);
});

test('normalizeThinkingQuestions sanitizes count:3 batches, deduplicates, and filters actions', () => {
  const batch = normalizeThinkingQuestions({
    questions: [
      { question: 'O₂ 分子内共价键类型是什么？', hint: '看成键原子电负性', answer: '非极性双键（1σ+1π）。', action: 'slice' },
      { question: 'O₂ 分子内共价键类型是什么？', hint: '重复项', answer: '重复答案', action: null },
      { question: '', answer: '无题干应被跳过' },
      { question: '为什么 O₂ 常温下不如 O₃ 活泼？', hint: '比较键能', answer: 'O=O 键能较大。', action: 'evil-cmd' },
      { question: 'O₂ 与 Fe 点燃产物是什么？', hint: '区分常温与点燃', answer: '生成 Fe₃O₄。', action: 'coordination' },
      { question: '第 4 题应被截断', answer: '截断答案' },
    ],
  }, 3);

  assert.equal(batch.questions.length, 3);
  assert.equal(batch.questions[0].action, 'slice');
  assert.equal(batch.questions[1].action, null);
  assert.equal(batch.questions[2].action, 'coordination');
  assert.equal(batch.questions[2].question, 'O₂ 与 Fe 点燃产物是什么？');

  const singleWrapped = normalizeThinkingQuestions({ question: '单题兜底？', answer: '自动包装成数组。' }, 3);
  assert.equal(singleWrapped.questions.length, 1);

  assert.throws(() => normalizeThinkingQuestions({ questions: [{ question: '', answer: '' }] }, 3), /列表/);
  assert.throws(() => normalizeThinkingQuestions(null, 3), /无效/);
});

test('POST /api/ai/thinking-question is mounted and enforces 400 validation for single and batch count:3', async () => {
  assert.equal(hasRoute(app, 'POST', '/api/ai/thinking-question'), true);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-xh-test-'));
  let server;
  try {
    await initDatabase(path.join(dir, 'test.db'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    const r1 = await fetch(`${baseUrl}/api/ai/thinking-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ', count: 3 }),
    });
    assert.equal(r1.status, 400);

    const r2 = await fetch(`${baseUrl}/api/ai/thinking-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '氧气', formula: 'O₂', module: 'molecule', count: 3 }),
    });
    assert.equal(r2.status, 400);
    const p2 = await r2.json();
    assert.match(p2.message, /API Key/i);
  } finally {
    if (server) await new Promise((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
    closeDatabase();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('xiaohuang-dock createBrandClickGuard suppresses click after long-press or drag', async () => {
  const dockMod = await import(pathToFileURL(path.join(root, 'src/assistant/xiaohuang-dock.js')).href);
  const { createBrandClickGuard } = dockMod;

  let t = 1000;
  let summonCalls = 0;
  const guard = createBrandClickGuard({
    holdMs: 200,
    dragThreshold: 8,
    suppressMs: 900,
    now: () => t,
    onSuppress: () => { summonCalls += 1; },
  });

  // 1. 短点（<200ms 且位移 <=8px）：不应拦截 click
  guard.start(20, 20);
  t += 60;
  assert.equal(guard.move(23, 24), false);
  assert.equal(guard.end(), false);
  assert.equal(summonCalls, 0);
  let prevented = false;
  let stopped = false;
  const evShort = { preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } };
  assert.equal(guard.handleClickCapture(evShort), false);
  assert.equal(prevented, false);
  assert.equal(stopped, false);

  // 2. 长按（>=200ms）：立即触发 onSuppress 并在 900ms 内拦截捕获阶段 click
  guard.start(20, 20);
  t += 210;
  guard.triggerHold();
  assert.equal(guard.end(), true);
  assert.ok(summonCalls >= 1);
  const evHold = { preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } };
  assert.equal(guard.handleClickCapture(evHold), true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);

  // 超过 900ms 抑制窗口自动解除
  t += 950;
  assert.equal(guard.isSuppressed(), false);

  // 3. 拖拽（>8px）：立即触发 onSuppress 并拦截 click
  const beforeDragCalls = summonCalls;
  prevented = false;
  stopped = false;
  guard.start(20, 20);
  t += 30;
  assert.equal(guard.move(20, 32), true);
  assert.ok(summonCalls > beforeDragCalls);
  assert.equal(guard.end(), true);
  const evDrag = { preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } };
  assert.equal(guard.handleClickCapture(evDrag), true);
  assert.equal(prevented, true);
  assert.equal(stopped, true);
});

test('page-context.js supports provider registration, live DOM observation, and tailored fallback', async () => {
  const mod = await import(pathToFileURL(path.join(root, 'src/assistant/page-context.js')).href);
  const { registerPageAssistant, notifyPageContextChange, onPageContextChange, getActivePageContext, observeActivePageChanges } = mod;

  const unreg = registerPageAssistant('crystal', () => ({
    title: '氯化钠',
    formula: 'NaCl',
    module: 'library',
    qa: { question: 'Q1', answer: 'A1' },
  }));
  const provided = getActivePageContext(makeMockDoc('crystal'));
  assert.equal(provided.tab, 'crystal');
  assert.equal(provided.title, '氯化钠');
  assert.equal(provided.formula, 'NaCl');
  assert.equal(provided.qa.question, 'Q1');

  unreg();
  const afterUnreg = getActivePageContext(makeMockDoc('crystal', { '.crystal-stage-title': '金刚石' }));
  assert.equal(afterUnreg.title, '金刚石');
  assert.equal(afterUnreg.module, 'library');

  const molCtx = getActivePageContext(makeMockDoc('molecule', { '#moleculeTitle': '氧气（O₂）', '#moleculeDesc': '双原子非极性分子' }));
  assert.equal(molCtx.title, '氧气（O₂）');
  assert.equal(molCtx.summary, '双原子非极性分子');
  assert.equal(molCtx.quickQuestions.length, 3);
  assert.match(molCtx.quickQuestions[0], /氧气/);

  const tableCtx = getActivePageContext(makeMockDoc('table', { '#elementDetail .detail-head h2': '氧 · O', '#elementDetail .detail-badge': 'O' }));
  assert.equal(tableCtx.title, '氧 · O');
  assert.equal(tableCtx.formula, 'O');

  const seen = [];
  const off = onPageContextChange((k) => seen.push(k));
  notifyPageContextChange('crystal');
  off();
  assert.deepEqual(seen, ['crystal']);

  // observeActivePageChanges: 验证 MutationObserver、Tab 点击与 notifyPageContextChange 三路触发
  const watched = [];
  let triggerMut = null;
  class FakeObserver {
    constructor(cb) { triggerMut = cb; }
    observe(node, cfg) { watched.push({ node, cfg }); }
    disconnect() { triggerMut = null; }
  }
  const molNode = { id: 'moleculeTitle', textContent: '氢气（H₂）' };
  const aiSecNode = { id: 'aiSectionQuiz' };
  let clickListener = null;
  const fakeDoc = {
    querySelector(sel) {
      if (sel === '#moleculeTitle') return molNode;
      return null;
    },
    querySelectorAll(sel) {
      if (sel === '[id^="aiSection"]') return [aiSecNode];
      return [];
    },
    addEventListener(ev, fn) { if (ev === 'click') clickListener = fn; },
    removeEventListener(ev, fn) { if (ev === 'click' && clickListener === fn) clickListener = null; },
  };
  const reasons = [];
  const stopObs = observeActivePageChanges((r) => reasons.push(r), { doc: fakeDoc, debounceMs: 0, Observer: FakeObserver });
  assert.ok(watched.some((w) => w.node === molNode));
  assert.ok(watched.some((w) => w.node === aiSecNode && w.cfg.attributeFilter?.includes('hidden')));

  notifyPageContextChange('molecule');
  triggerMut?.([{ type: 'childList' }]);
  clickListener?.({ target: { closest: () => ({ dataset: { tab: 'table' } }) } });
  await new Promise((r) => setTimeout(r, 10));
  stopObs();

  assert.ok(reasons.includes('molecule'));
  assert.ok(reasons.includes('dom') || reasons.some((r) => r.startsWith('tab:')));
  assert.equal(clickListener, null);
});

test('companion CSS, brand-tip abort fix, molecule notify, and unified panel contracts hold', () => {
  const indexCss = fs.readFileSync(path.join(root, 'src/styles/index.css'), 'utf8');
  assert.match(indexCss, /@import\s+['"]\.\/_xiaohuang-companion\.css['"]\s+layer\(components\)\s*;/);

  const xhCss = fs.readFileSync(path.join(root, 'src/styles/_xiaohuang-companion.css'), 'utf8').trim();
  assert.match(xhCss, /^@layer\s+components\s*\{/);
  assert.match(xhCss, /\}$/);
  assert.match(xhCss, /\.xh-companion\[hidden\]/);
  assert.match(xhCss, /\.xh-panel\[hidden\]/);
  assert.match(xhCss, /\.xh-tether\[hidden\]/);

  const brandTip = fs.readFileSync(path.join(root, 'src/brand-tip.js'), 'utf8');
  assert.match(brandTip, /initXiaohuangDock/);
  assert.match(brandTip, /consumeBrandTipSuppression/);
  assert.match(brandTip, /export function hideBrandTip\(\)[\s\S]*seq\s*\+=\s*1[\s\S]*loading\s*=\s*false/);

  const molList = fs.readFileSync(path.join(root, 'src/molecule/list.js'), 'utf8');
  assert.match(molList, /notifyPageContextChange\('molecule'\)/);

  const panelJs = fs.readFileSync(path.join(root, 'src/assistant/xiaohuang-panel.js'), 'utf8');
  assert.doesNotMatch(panelJs, /xh-panel-avatar/);
  assert.doesNotMatch(panelJs, /当前页面暂无预设思考题/);
  assert.match(panelJs, /换一批/);
  assert.match(panelJs, /点击揭晓结论/);
  assert.match(panelJs, /重新盖住/);
  assert.match(panelJs, /observeActivePageChanges/);

  const clientJs = fs.readFileSync(path.join(root, 'src/api/client.js'), 'utf8');
  assert.match(clientJs, /thinkingQuestion\s*\(/);
  assert.match(clientJs, /\/ai\/thinking-question/);
});
