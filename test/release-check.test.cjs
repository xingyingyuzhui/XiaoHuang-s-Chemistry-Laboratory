const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const REPO_ROOT = path.join(__dirname, '..');

let mod;
test.before(async () => {
  mod = await import('../scripts/release-check.mjs');
});

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chem-lab-release-check-'));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function writeFiles(root, files) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
}

function runGit(cwd, args) {
  const res = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

test('version sync validator passes on real repo and catches mismatches', async () => {
  const real = mod.checkVersionSync(REPO_ROOT);
  assert.equal(real.ok, true, real.message);

  await withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'root', version: '3.2.0' }),
      'server/package.json': JSON.stringify({ name: 'srv', version: '3.1.1' }),
    });
    const mismatch = mod.checkVersionSync(dir);
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.message, /3\.2\.0/);
    assert.match(mismatch.message, /3\.1\.1/);
  });

  await withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'root', version: '3.2.0' }),
    });
    const missing = mod.checkVersionSync(dir);
    assert.equal(missing.ok, false);
    assert.match(missing.message, /server\/package\.json/);
  });
});

test('electron-builder files validator passes on real repo', () => {
  const res = mod.checkElectronBuilderFiles(REPO_ROOT);
  assert.equal(res.ok, true, res.message);
  assert.ok(res.details.requiredFiles.includes('electron/main.cjs'));
  assert.ok(res.details.requiredFiles.includes('electron/version-lock.cjs'));
});

test('electron-builder files validator catches missing local require and transitive require', async () => {
  await withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': '{}',
      'electron/main.cjs': `
        const path = require('path');
        // require('./commented-out.cjs');
        /* require('./also-ignored.cjs'); */
        const lock = require('./version-lock.cjs');
        const extra = require('./missing-from-yml.cjs');
      `,
      'electron/version-lock.cjs': `module.exports = {};`,
      'electron/missing-from-yml.cjs': `module.exports = {};`,
      'electron-builder.yml': [
        'appId: com.test.app',
        'files:',
        '  - electron/main.cjs',
        '  - electron/version-lock.cjs',
        '  - package.json',
        '',
        'asar: true',
      ].join('\n'),
    });

    const res = mod.checkElectronBuilderFiles(dir);
    assert.equal(res.ok, false);
    assert.deepEqual(res.details.missingFromBuilder, ['electron/missing-from-yml.cjs']);
    assert.equal(res.details.requiredFiles.includes('electron/commented-out.cjs'), false);
    assert.equal(res.details.requiredFiles.includes('electron/also-ignored.cjs'), false);
  });

  await withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': '{}',
      'electron/main.cjs': `const lock = require('./version-lock.cjs');`,
      'electron/version-lock.cjs': `const sub = require('./sub-helper.cjs');`,
      'electron/sub-helper.cjs': `module.exports = {};`,
      'electron-builder.yml': [
        'files:',
        '  - electron/main.cjs',
        '  - electron/version-lock.cjs',
        '  - package.json',
      ].join('\n'),
    });

    const res = mod.checkElectronBuilderFiles(dir);
    assert.equal(res.ok, false);
    assert.deepEqual(res.details.missingFromBuilder, ['electron/sub-helper.cjs']);
  });
});

test('electron-builder files validator catches nonexistent declared files', async () => {
  await withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': '{}',
      'electron/main.cjs': `console.log('ok');`,
      'electron-builder.yml': [
        'files:',
        '  - electron/main.cjs',
        '  - electron/build/ghost.png',
        '  - package.json',
      ].join('\n'),
    });

    const res = mod.checkElectronBuilderFiles(dir);
    assert.equal(res.ok, false);
    assert.ok(res.details.missingOnDisk.includes('electron/build/ghost.png'));
  });
});

test('seed sync validator passes on real repo and catches labs seed drift', async () => {
  const real = await mod.checkSeedSync(REPO_ROOT);
  assert.equal(real.ok, true, real.message);
  assert.ok(real.details.labsCount >= 1);
  assert.ok(real.details.offlineQuizCount >= 200);

  await withTempDir(async (dir) => {
    writeFiles(dir, {
      'src/data/lab-scripts.js': `export const LAB_SCRIPTS = [{ id: 'lab-1', title: 'Updated Title', steps: [] }];`,
      'src/data/lab-prestudy-config.js': `export const LAB_PRESTUDY_CONFIGS = {};`,
      'server/seed/labs-builtin.js': `module.exports = { LABS_BUILTIN: [{ id: 'lab-1', title: 'Stale Title', type: '', equation: '', safety: '', phenomena: '', steps: [], prestudy: null, sortOrder: 0, source: 'builtin' }] };`,
      'server/seed/offline-quiz-bank.json': JSON.stringify([{ sourceQuestionId: 'q1' }]),
      'server/seed/offline-quiz-bank.js': `module.exports = { OFFLINE_QUESTIONS: require('./offline-quiz-bank.json') };`,
    });

    const res = await mod.checkSeedSync(dir);
    assert.equal(res.ok, false);
    assert.match(res.message, /labs-builtin\.js/);
  });
});

test('syntax validator catches invalid JS syntax in backend files', async () => {
  await withTempDir((dir) => {
    writeFiles(dir, {
      'server/ok.js': 'const x = 1;\nmodule.exports = { x };\n',
      'server/broken.js': 'function bad( {\n  return 1;\n}\n',
      'electron/main.cjs': 'module.exports = {};\n',
      'scripts/helper.mjs': 'export const ok = true;\n',
    });

    const res = mod.checkSyntax(dir);
    assert.equal(res.ok, false);
    assert.equal(res.details.checkedCount, 4);
    assert.equal(res.details.failedFiles.length, 1);
    assert.equal(res.details.failedFiles[0].file, 'server/broken.js');
  });
});

test('strict git release validator enforces clean tree and tag consistency', async () => {
  await withTempDir((dir) => {
    writeFiles(dir, {
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0' }),
    });
    runGit(dir, ['init']);
    runGit(dir, ['add', 'package.json']);
    runGit(dir, ['commit', '-m', 'init']);

    // Clean tree without tag passes default strict-git (pre-tag check)
    const cleanPreTag = mod.checkGitReleaseState(dir);
    assert.equal(cleanPreTag.ok, true, cleanPreTag.message);

    // requireTag fails before tagging
    const missingTag = mod.checkGitReleaseState(dir, { requireTag: true });
    assert.equal(missingTag.ok, false);

    // Dirty tree fails
    fs.writeFileSync(path.join(dir, 'untracked.txt'), 'dirty\n', 'utf8');
    const dirty = mod.checkGitReleaseState(dir);
    assert.equal(dirty.ok, false);
    assert.match(dirty.message, /不干净/);
    fs.unlinkSync(path.join(dir, 'untracked.txt'));

    // Tag matching HEAD passes with requireTag
    runGit(dir, ['tag', 'v1.0.0']);
    const taggedHead = mod.checkGitReleaseState(dir, { requireTag: true });
    assert.equal(taggedHead.ok, true, taggedHead.message);

    // Advancing HEAD while keeping same version causes tag conflict
    fs.writeFileSync(path.join(dir, 'extra.txt'), 'next\n', 'utf8');
    runGit(dir, ['add', 'extra.txt']);
    runGit(dir, ['commit', '-m', 'second']);
    const staleTag = mod.checkGitReleaseState(dir);
    assert.equal(staleTag.ok, false);
    assert.match(staleTag.message, /v1\.0\.0/);
  });
});

test('runReleaseChecks and CLI succeed on the real repository', async () => {
  const report = await mod.runReleaseChecks(REPO_ROOT);
  assert.equal(report.ok, true, mod.formatReport(report));
  assert.equal(report.results.length, 4);

  const cli = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/release-check.mjs')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /PASS \(4\/4\)/);
});
