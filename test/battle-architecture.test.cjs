const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const battleRoot = path.join(__dirname, '..', 'src', 'battle');

test('UI layer receives battle actions through the entry point instead of importing them', () => {
  const uiSource = fs.readFileSync(path.join(battleRoot, 'ui.js'), 'utf8');
  const indexSource = fs.readFileSync(path.join(battleRoot, 'index.js'), 'utf8');

  assert.doesNotMatch(uiSource, /from ['"]\.\/actions\.js['"]/);
  assert.match(indexSource, /setBattleActionHandlers/);
});

test('asynchronous battle work can verify that its match is still active', () => {
  const stateSource = fs.readFileSync(path.join(battleRoot, 'state.js'), 'utf8');
  const actionsSource = fs.readFileSync(path.join(battleRoot, 'actions.js'), 'utf8');

  assert.match(stateSource, /export function isCurrentModeB\(/);
  assert.match(actionsSource, /isCurrentModeB\(s\)/);
});

test('opening card prefers a low-Z element without losing the remaining cards', async () => {
  const { drawOpeningTop } = await import(
    pathToFileURL(path.join(battleRoot, 'rules.js')).href,
  );
  const flip = { uid: 'flip-1', kind: 'flip' };
  const high = {
    uid: 'el-79',
    kind: 'element',
    element: { z: 79, symbol: 'Au', en: 2.54, radius: 136 },
  };
  const low = {
    uid: 'el-8',
    kind: 'element',
    element: { z: 8, symbol: 'O', en: 3.44, radius: 66 },
  };
  const deck = [flip, high, low];

  const top = drawOpeningTop(deck);

  assert.equal(top, low);
  assert.equal(deck.length, 2);
  assert.deepEqual(new Set(deck), new Set([flip, high]));
});

test('AI chooses a playable alternate dimension only when it owns a FLIP card', async () => {
  const { findAiFlipDim } = await import(
    pathToFileURL(path.join(battleRoot, 'rules.js')).href,
  );
  const state = {
    aiFlipsUsed: 0,
    dimension: 'en',
    top: {
      kind: 'element',
      element: { z: 1, symbol: 'H', en: 2.2, radius: 31 },
    },
    aiHand: [
      { uid: 'flip-1', kind: 'flip' },
      {
        uid: 'el-3',
        kind: 'element',
        element: { z: 3, symbol: 'Li', en: 0.98, radius: 128 },
      },
    ],
  };

  assert.equal(findAiFlipDim(state), 'radius');
  state.aiHand = state.aiHand.filter((card) => card.kind !== 'flip');
  assert.equal(findAiFlipDim(state), null);
});

test('opening a match from the lobby does not request BGM playback twice', () => {
  const actionsSource = fs.readFileSync(path.join(battleRoot, 'actions.js'), 'utf8');
  const uiSource = fs.readFileSync(path.join(battleRoot, 'ui.js'), 'utf8');

  assert.match(actionsSource, /bgmAlreadyRequested/);
  assert.match(uiSource, /startModeB\(\{ bgmAlreadyRequested: true \}\)/);
});

test('FLIP opens its picker before audio unlock can settle', () => {
  const uiSource = fs.readFileSync(path.join(battleRoot, 'ui.js'), 'utf8');
  const actionsSource = fs.readFileSync(path.join(battleRoot, 'actions.js'), 'utf8');
  const handFlipHandler = uiSource.match(
    /if \(card\.kind === 'flip'\) \{([\s\S]*?)\n      \}/,
  )?.[1];

  assert.ok(handFlipHandler, 'hand FLIP handler should exist');
  assert.match(handFlipHandler, /battleActions\?\.openFlipPicker\(\);[\s\S]*void sfxUnlock\(\);/);
  assert.match(uiSource, /battleActions\?\.openFlipPicker\(\);\n    \/\/ 与手牌 FLIP 一致[\s\S]*void sfxUnlock\(\);/);
  assert.match(actionsSource, /sfxUiTap,/);
});
