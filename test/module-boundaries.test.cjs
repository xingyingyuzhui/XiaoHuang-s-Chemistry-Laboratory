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
