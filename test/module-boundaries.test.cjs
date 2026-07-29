const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

test('AI router is a thin composition root for feature route modules', () => {
  const entry = source('server/routes/ai.js');

  assert.match(entry, /require\('\.\/ai\/molecules'\)/);
  assert.match(entry, /require\('\.\/ai\/quiz'\)/);
  assert.match(entry, /require\('\.\/ai\/chemistry'\)/);
  assert.ok(fs.existsSync(path.join(root, 'server/routes/ai/molecules.js')));
  assert.ok(fs.existsSync(path.join(root, 'server/routes/ai/quiz.js')));
  assert.ok(fs.existsSync(path.join(root, 'server/routes/ai/chemistry.js')));
});

test('AI classroom entry delegates focused UI concerns to feature modules', () => {
  const entry = source('src/ai-classroom.js');

  assert.match(entry, /from '\.\/ai-classroom\/quiz-config\.js'/);
  assert.match(entry, /from '\.\/ai-classroom\/lab-shell\.js'/);
  assert.match(entry, /from '\.\/ai-classroom\/wrong-book\.js'/);
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/quiz-config.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/lab-shell.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/wrong-book.js')));
});

test('AI classroom quiz engine lives under ai-classroom/quiz-* modules', () => {
  const entry = source('src/ai-classroom.js');
  assert.match(entry, /from '\.\/ai-classroom\/quiz-shell\.js'/);
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/quiz-shell.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/quiz-model.js')));
  assert.ok(fs.existsSync(path.join(root, 'src/ai-classroom/quiz-views.js')));
  // Entry must not still define the paper renderer inline
  assert.equal(/function renderPaper\(/.test(entry), false);
  assert.equal(/function renderResultList\(/.test(entry), false);
  assert.equal(/async function generateQuiz\(/.test(entry), false);
});

test('main.js does not static-import heavy modules (Three.js, battle, classroom)', () => {
  const entry = source('src/main.js');

  // These must NOT appear as static imports
  assert.equal(
    /import\s+.*from\s+['"]\.\/molecule-list\.js['"]/.test(entry),
    false,
    'molecule-list must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"]\.\/molecule-ai\.js['"]/.test(entry),
    false,
    'molecule-ai must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"]\.\/molecule-reactions\.js['"]/.test(entry),
    false,
    'molecule-reactions must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"]\.\/electron-renderer\.js['"]/.test(entry),
    false,
    'electron-renderer must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"]\.\/ai-classroom\.js['"]/.test(entry),
    false,
    'ai-classroom must be dynamically imported',
  );
  assert.equal(
    /import\s+.*from\s+['"]\.\/element-battle\.js['"]/.test(entry),
    false,
    'element-battle must be dynamically imported',
  );

  // These SHOULD remain as static imports
  assert.match(entry, /import\s+.*from\s+['"]\.\/periodic-table\.js['"]/);
  assert.match(entry, /import\s+.*from\s+['"]\.\/settings\.js['"]/);
  assert.match(entry, /import\s+.*from\s+['"]\.\/brand-tip\.js['"]/);
  assert.match(entry, /import\s+.*from\s+['"]\.\/side-drawer\.js['"]/);
  assert.match(entry, /import\s+.*from\s+['"]\.\/molar-ui\.js['"]/);
  assert.match(entry, /import\s+.*from\s+['"]\.\/feature-loader\.js['"]/);
  // 允许多行 import { a, b } from './panel-loading.js'
  assert.match(entry, /from\s+['"]\.\/panel-loading\.js['"]/);
});

test('panel-loading module exists and is used for lazy tab overlay', () => {
  assert.ok(fs.existsSync(path.join(root, 'src/panel-loading.js')));
  const loading = source('src/panel-loading.js');
  assert.match(loading, /export function showPanelLoading/);
  assert.match(loading, /export function hidePanelLoading/);
  assert.match(loading, /export function showPanelError/);
  assert.match(loading, /\.hidden\s*=\s*true/);
});

test('molecule feature is packaged under src/molecule/', () => {
  const entry = source('src/main.js');
  assert.match(entry, /import\(['"]\.\/molecule\//);
  assert.ok(fs.existsSync(path.join(root, 'src/molecule/index.js')));
});
