/**
 * 前端样式分层、按需加载与 woff2 字体打包回归测试：
 * 1) _ai-classroom.css 已拆分为 barrel + _ai-classroom/* 子文件，无遗漏/孤儿文件
 * 2) 跨 Tab 共用样式（.btn-sm / .ai-nav-* / .stage-ai / .quiz-section-head / .quiz-status / .chem-keypad / .rxn-muted）留在首屏 eager CSS
 * 3) index.css 声明 @layer 级联顺序，5 套主题 skin.css 全部落在 themes 层，所有按需 Tab CSS 落在 components/overrides 层
 * 4) 重 Tab 样式已从 index.css 移除并由动态入口按需加载
 * 5) fonts.js / _fonts.css 仅声明 woff2 字体（涵盖 3 个字体族 8 个字重/样式），不引入冗余 .woff
 */
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function source(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

test('_ai-classroom.css is a barrel importing all partials under _ai-classroom/', () => {
  const barrel = stripComments(source('src/styles/_ai-classroom.css'));
  const imports = [...barrel.matchAll(/@import\s+['"]\.\/_ai-classroom\/([^'"]+)['"]\s+layer\((components|overrides)\)\s*;/g)];
  assert.ok(imports.length >= 7, `expected >= 7 classroom partials, got ${imports.length}`);

  // Barrel must not contain inline style rule blocks
  assert.doesNotMatch(barrel, /\{/, '_ai-classroom.css barrel should not contain raw style blocks');

  const importedFiles = new Set(imports.map((m) => m[1]));
  const diskFiles = fs
    .readdirSync(path.join(root, 'src/styles/_ai-classroom'))
    .filter((f) => f.endsWith('.css'));

  for (const rel of importedFiles) {
    const full = path.join(root, 'src/styles/_ai-classroom', rel);
    assert.ok(fs.existsSync(full), `missing imported partial: _ai-classroom/${rel}`);
    assert.ok(fs.readFileSync(full, 'utf8').trim().length > 0, `empty partial: _ai-classroom/${rel}`);
  }
  for (const f of diskFiles) {
    assert.ok(importedFiles.has(f), `orphan partial not imported by barrel: _ai-classroom/${f}`);
  }

  // Verify key domain selectors are preserved across the split partials
  const combined = diskFiles
    .map((f) => source(`src/styles/_ai-classroom/${f}`))
    .join('\n');
  for (const sel of [
    '.ai-section-empty',
    '.quiz-field',
    '.quiz-card',
    '.quiz-opt.is-correct',
    '.quiz-opt.is-wrong',
    '.lab-title-row',
    '.prestudy-page',
    '.mastery-section',
    '.lesson-pack-layout',
    '.is-just-revealed',
  ]) {
    assert.ok(combined.includes(sel), `expected selector ${sel} in _ai-classroom/ partials`);
  }
});

test('cross-tab shared primitives remain eagerly imported via index.css', () => {
  const index = stripComments(source('src/styles/index.css'));
  assert.match(index, /@import\s+['"]\.\/_forms\.css['"]\s+layer\(components\)\s*;/);
  assert.match(index, /@import\s+['"]\.\/_shared-ui\.css['"]\s+layer\(components\)\s*;/);

  const forms = source('src/styles/_forms.css');
  assert.match(forms, /\.btn-sm\s*\{/, '.btn-sm must live in eager _forms.css for molecule & battle tabs');

  const shared = source('src/styles/_shared-ui.css');
  for (const sel of [
    '.ai-nav-list',
    '.ai-nav-card',
    '.stage-ai',
    '.quiz-section-head',
    '.quiz-status',
    '.chem-keypad',
    '.rxn-muted',
  ]) {
    assert.ok(shared.includes(sel), `shared primitive ${sel} must live in eager _shared-ui.css`);
  }
});

test('index.css enforces CSS @layer cascade order with all 5 themes in layer(themes)', () => {
  const index = stripComments(source('src/styles/index.css'));

  // Layer order declaration must come before the first @import
  const layerOrderMatch = index.match(
    /@layer\s+tokens\s*,\s*base\s*,\s*components\s*,\s*responsive\s*,\s*themes\s*,\s*overrides\s*;/,
  );
  assert.ok(layerOrderMatch, 'index.css must declare @layer tokens, base, components, responsive, themes, overrides;');

  const firstImportIdx = index.indexOf('@import');
  assert.ok(
    layerOrderMatch.index < firstImportIdx,
    '@layer order statement must appear before the first @import',
  );

  // Every @import in index.css must explicitly assign a layer(...)
  const allImports = [...index.matchAll(/@import\s+([^;]+);/g)];
  assert.ok(allImports.length > 0);
  for (const m of allImports) {
    assert.match(
      m[1],
      /\blayer\((tokens|base|components|responsive|themes|overrides)\)\s*$/,
      `unlayered @import in index.css: @import ${m[1]};`,
    );
  }

  // All 5 themes must have tokens in layer(tokens) and skin in layer(themes)
  for (const theme of ['default', 'stationery', 'reagent', 'blackboard', 'pixel']) {
    assert.match(
      index,
      new RegExp(`@import\\s+['"]\\./themes/${theme}/tokens\\.css['"]\\s+layer\\(tokens\\)\\s*;`),
      `theme ${theme} tokens.css must be in layer(tokens)`,
    );
    assert.match(
      index,
      new RegExp(`@import\\s+['"]\\./themes/${theme}/skin\\.css['"]\\s+layer\\(themes\\)\\s*;`),
      `theme ${theme} skin.css must be in layer(themes)`,
    );
  }
});

test('heavy tab CSS is lazy-loaded by dynamic entries and layered to protect theme skins', () => {
  const index = stripComments(source('src/styles/index.css'));
  const lazyCssFiles = [
    '_element-battle.css',
    '_ai-classroom.css',
    '_classroom-extra.css',
    '_balance-script.css',
    '_molecule-reactions.css',
  ];
  for (const cssFile of lazyCssFiles) {
    assert.doesNotMatch(
      index,
      new RegExp(cssFile.replace('.', '\\.')),
      `${cssFile} should be lazy-loaded instead of imported in index.css`,
    );
  }

  // Dynamic entries must import their own lazy CSS
  const battleEntry = source('src/battle/index.js');
  assert.match(battleEntry, /import\s+['"]\.\.\/styles\/_element-battle\.css['"]\s*;/);

  const classroomEntry = source('src/ai-classroom.js');
  assert.match(classroomEntry, /import\s+['"]\.\/styles\/_ai-classroom\.css['"]\s*;/);
  assert.match(classroomEntry, /import\s+['"]\.\/styles\/_classroom-extra\.css['"]\s*;/);
  assert.match(classroomEntry, /import\s+['"]\.\/styles\/_balance-script\.css['"]\s*;/);

  const moleculeEntry = source('src/molecule/index.js');
  assert.match(moleculeEntry, /import\s+['"]\.\.\/styles\/_molecule-reactions\.css['"]\s*;/);

  // Barrel lazy CSS files must assign every @import to a layer
  for (const barrelRel of ['src/styles/_element-battle.css', 'src/styles/_ai-classroom.css']) {
    const css = stripComments(source(barrelRel));
    const imports = [...css.matchAll(/@import\s+([^;]+);/g)];
    assert.ok(imports.length > 0, `${barrelRel} should import partials`);
    for (const m of imports) {
      assert.match(
        m[1],
        /\blayer\((components|overrides)\)\s*$/,
        `lazy barrel import in ${barrelRel} must specify layer(): ${m[1]}`,
      );
    }
  }

  // Standalone lazy CSS files must wrap all rules in @layer components { ... }
  for (const rel of [
    'src/styles/_classroom-extra.css',
    'src/styles/_balance-script.css',
    'src/styles/_molecule-reactions.css',
  ]) {
    const css = stripComments(source(rel)).trim();
    assert.match(css, /^@layer\s+components\s*\{/, `${rel} must open with @layer components {`);
    assert.match(css, /\}$/, `${rel} must close @layer components block`);
  }
});

test('fonts.js and _fonts.css declare woff2-only font faces for all required weights', () => {
  const fontsJs = stripComments(source('src/styles/fonts.js'));
  assert.match(fontsJs, /import\s+['"]\.\/_fonts\.css['"]\s*;/);
  assert.doesNotMatch(
    fontsJs,
    /@fontsource\/[^'"]+\.css/,
    'fonts.js must not import @fontsource CSS files that pull in legacy .woff assets',
  );

  const fontsCss = stripComments(source('src/styles/_fonts.css'));
  assert.doesNotMatch(
    fontsCss,
    /\.woff(['")?\s]|$)|format\(['"]woff['"]\)/,
    '_fonts.css must not reference legacy .woff files',
  );

  const faces = [...fontsCss.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((m) => m[1]);
  assert.equal(faces.length, 8, `expected 8 @font-face declarations, got ${faces.length}`);

  const expected = [
    { family: 'JetBrains Mono', weight: '500', style: 'normal', file: 'jetbrains-mono-latin-500-normal.woff2' },
    { family: 'JetBrains Mono', weight: '600', style: 'normal', file: 'jetbrains-mono-latin-600-normal.woff2' },
    { family: 'JetBrains Mono', weight: '700', style: 'normal', file: 'jetbrains-mono-latin-700-normal.woff2' },
    { family: 'IBM Plex Mono', weight: '500', style: 'normal', file: 'ibm-plex-mono-latin-500-normal.woff2' },
    { family: 'IBM Plex Mono', weight: '600', style: 'normal', file: 'ibm-plex-mono-latin-600-normal.woff2' },
    { family: 'IBM Plex Mono', weight: '700', style: 'normal', file: 'ibm-plex-mono-latin-700-normal.woff2' },
    { family: 'Instrument Serif', weight: '400', style: 'normal', file: 'instrument-serif-latin-400-normal.woff2' },
    { family: 'Instrument Serif', weight: '400', style: 'italic', file: 'instrument-serif-latin-400-italic.woff2' },
  ];

  for (const spec of expected) {
    const match = faces.find(
      (b) =>
        b.includes(`font-family: '${spec.family}'`) &&
        b.includes(`font-weight: ${spec.weight}`) &&
        b.includes(`font-style: ${spec.style}`),
    );
    assert.ok(match, `missing @font-face for ${spec.family} ${spec.weight} ${spec.style}`);
    assert.ok(match.includes(spec.file), `expected ${spec.file} in @font-face for ${spec.family}`);
    assert.match(match, /format\(['"]woff2['"]\)/);
  }
});

test('dist build output (when present) emits zero .woff files and keeps layered CSS', (t) => {
  const assetsDir = path.join(root, 'dist', 'assets');
  if (!fs.existsSync(assetsDir)) {
    t.skip('dist/assets not built yet');
    return;
  }

  const files = fs.readdirSync(assetsDir);
  const woffFiles = files.filter((f) => f.endsWith('.woff'));
  const woff2Files = files.filter((f) => f.endsWith('.woff2'));
  assert.equal(woffFiles.length, 0, `expected 0 .woff files in dist/assets, found: ${woffFiles.join(', ')}`);
  assert.equal(woff2Files.length, 8, `expected 8 .woff2 files in dist/assets, found ${woff2Files.length}`);

  const distHtml = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
  const entryCssLinks = [...distHtml.matchAll(/<link[^>]+href="\/assets\/([^"]+\.css)"[^>]*>/g)].map((m) => m[1]);
  assert.equal(entryCssLinks.length, 1, `expected 1 eager CSS link in dist/index.html, got ${entryCssLinks.length}`);

  const entryCss = fs.readFileSync(path.join(assetsDir, entryCssLinks[0]), 'utf8');
  assert.ok(
    entryCss.includes('@layer tokens,base,components,responsive,themes,overrides;'),
    'bundled entry CSS must preserve @layer order declaration',
  );

  // Every emitted CSS asset should have zero unlayered top-level style rules
  for (const cssFile of files.filter((f) => f.endsWith('.css'))) {
    const txt = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');
    let depth = 0;
    let top = '';
    for (let i = 0; i < txt.length; i++) {
      const ch = txt[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (depth === 0) top += ch;
    }
    const leftover = top
      .replace(/@font-face/g, '')
      .replace(/@layer\s+[^{;]+;?/g, '')
      .replace(/\s+/g, '')
      .trim();
    assert.equal(leftover, '', `unlayered top-level CSS found in dist/assets/${cssFile}: ${leftover.slice(0, 80)}`);
  }
});
