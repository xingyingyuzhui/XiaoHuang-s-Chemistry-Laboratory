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

const { normalizeThinkingQuestion } = assistantRoute;

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

test('POST /api/ai/thinking-question is mounted and enforces 400 validation', async () => {
  assert.equal(hasRoute(app, 'POST', '/api/ai/thinking-question'), true);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-xh-test-'));
  let server;
  try {
    await initDatabase(path.join(dir, 'test.db'));
    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    // 缺少 title -> 400
    const r1 = await fetch(`${baseUrl}/api/ai/thinking-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '   ' }),
    });
    assert.equal(r1.status, 400);

    // 未配置 API Key -> 400
    const r2 = await fetch(`${baseUrl}/api/ai/thinking-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '氯化钠', formula: 'NaCl', module: 'library' }),
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

test('page-context.js supports provider registration, change notification, and DOM fallback', async () => {
  const mod = await import(pathToFileURL(path.join(root, 'src/assistant/page-context.js')).href);
  const { registerPageAssistant, notifyPageContextChange, onPageContextChange, getActivePageContext } = mod;

  // 注册 provider 与注销回退
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

  // DOM 探测回退（molecule / table / ai）
  const molCtx = getActivePageContext(makeMockDoc('molecule', { '#moleculeTitle': '水 (H₂O)', '#moleculeDesc': 'V 形极性分子' }));
  assert.equal(molCtx.title, '水 (H₂O)');
  assert.equal(molCtx.summary, 'V 形极性分子');

  const tableCtx = getActivePageContext(makeMockDoc('table', { '#elementDetail .detail-head h2': '氧 · O', '#elementDetail .detail-badge': 'O' }));
  assert.equal(tableCtx.title, '氧 · O');
  assert.equal(tableCtx.formula, 'O');

  // 变更通知不抛错且通知订阅者
  const seen = [];
  const off = onPageContextChange((k) => seen.push(k));
  notifyPageContextChange('crystal');
  off();
  assert.deepEqual(seen, ['crystal']);
});

test('styles/index.css imports _xiaohuang-companion.css in layer(components) and brand-tip wires dock', () => {
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

  const clientJs = fs.readFileSync(path.join(root, 'src/api/client.js'), 'utf8');
  assert.match(clientJs, /thinkingQuestion\s*\(/);
  assert.match(clientJs, /\/ai\/thinking-question/);
});
