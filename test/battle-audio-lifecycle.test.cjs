const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const sfxModuleUrl = pathToFileURL(path.join(root, 'src', 'battle', 'sfx.js')).href;

function readSource(relPath) {
  return fs.readFileSync(path.join(root, relPath), 'utf8');
}

function createAudioEnv() {
  const storage = new Map();
  const audioInstances = [];
  const ctxInstances = [];
  const docListeners = new Map();

  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.currentSrc = src;
      this.loop = false;
      this.preload = '';
      this.volume = 1;
      this.paused = true;
      this.playCalls = 0;
      this.pauseCalls = 0;
      this.attributes = new Map();
      audioInstances.push(this);
    }
    setAttribute(k, v) {
      this.attributes.set(k, v);
    }
    play() {
      this.playCalls += 1;
      this.paused = false;
      return Promise.resolve();
    }
    pause() {
      this.pauseCalls += 1;
      this.paused = true;
    }
  }

  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.sampleRate = 44100;
      this.destination = { kind: 'destination' };
      this.suspendCalls = 0;
      this.resumeCalls = 0;
      this.oscillatorCalls = 0;
      this.gainNode = {
        gain: {
          value: 1,
          targets: [],
          cancelled: 0,
          setTargetAtTime(val, t, tc) {
            this.value = val;
            this.targets.push({ val, t, tc });
          },
          cancelScheduledValues() {
            this.cancelled += 1;
          },
        },
        connect() {},
      };
      ctxInstances.push(this);
    }
    createGain() {
      return this.gainNode;
    }
    createOscillator() {
      this.oscillatorCalls += 1;
      return {
        type: 'sine',
        frequency: { setValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createBiquadFilter() {
      return {
        type: 'lowpass',
        frequency: { value: 0 },
        Q: { value: 0 },
        connect() {},
      };
    }
    suspend() {
      this.suspendCalls += 1;
      this.state = 'suspended';
      return Promise.resolve();
    }
    resume() {
      this.resumeCalls += 1;
      this.state = 'running';
      return Promise.resolve();
    }
  }

  const fakeLocalStorage = {
    getItem(k) {
      return storage.has(k) ? storage.get(k) : null;
    },
    setItem(k, v) {
      storage.set(k, String(v));
    },
  };

  const fakeDocument = {
    hidden: false,
    visibilityState: 'visible',
    addEventListener(type, fn) {
      if (!docListeners.has(type)) docListeners.set(type, new Set());
      docListeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      docListeners.get(type)?.delete(fn);
    },
    emitVisibility(hidden) {
      this.hidden = hidden;
      this.visibilityState = hidden ? 'hidden' : 'visible';
      for (const fn of docListeners.get('visibilitychange') || []) {
        fn();
      }
    },
  };

  const prev = {
    window: globalThis.window,
    document: globalThis.document,
    Audio: globalThis.Audio,
    localStorage: globalThis.localStorage,
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };

  globalThis.window = { AudioContext: FakeAudioContext };
  globalThis.document = fakeDocument;
  globalThis.Audio = FakeAudio;
  globalThis.localStorage = fakeLocalStorage;
  globalThis.requestAnimationFrame = undefined;
  globalThis.cancelAnimationFrame = undefined;

  return {
    storage,
    audioInstances,
    ctxInstances,
    fakeDocument,
    restore() {
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) delete globalThis[k];
        else globalThis[k] = v;
      }
    },
  };
}

let importNonce = 0;
async function loadFreshSfx() {
  importNonce += 1;
  return import(`${sfxModuleUrl}?test=${importNonce}`);
}

test('main.js wires battle leave/enter audio hooks while preserving dynamic import', () => {
  const mainSource = readSource('src/main.js');
  const battleEntry = readSource('src/element-battle.js');
  const battleIndex = readSource('src/battle/index.js');

  assert.match(mainSource, /import\(['"]\.\/element-battle\.js['"]\)/);
  assert.doesNotMatch(mainSource, /import\s+.*from\s+['"]\.\/element-battle\.js['"]/);
  assert.match(
    mainSource,
    /if\s*\(\s*name\s*!==\s*['"]battle['"]\s*&&\s*battleModule\s*\)\s*\{\s*battleModule\.onBattleLeave\?\.\(\);/,
  );
  assert.match(
    mainSource,
    /if\s*\(\s*name\s*===\s*['"]battle['"]\s*\)[\s\S]*?battleModule\.onBattleEnter\?\.\(\);/,
  );

  assert.match(battleIndex, /export function onBattleLeave\(/);
  assert.match(battleIndex, /export function onBattleEnter\(/);
  assert.match(battleEntry, /onBattleLeave/);
  assert.match(battleEntry, /onBattleEnter/);
});

test('pauseBattleAudio and resumeBattleAudio are safe before AudioContext is initialized', async () => {
  const env = createAudioEnv();
  try {
    const sfx = await loadFreshSfx();
    assert.doesNotThrow(() => sfx.pauseBattleAudio());
    assert.doesNotThrow(() => sfx.resumeBattleAudio());
    assert.equal(env.ctxInstances.length, 0);
    assert.equal(env.audioInstances.length, 0);
    assert.equal(sfx.sfxIsMuted(), false);
  } finally {
    env.restore();
  }
});

test('leaving battle tab suspends BGM and WebAudio without clobbering user mute preference', async () => {
  const env = createAudioEnv();
  try {
    const sfx = await loadFreshSfx();

    const started = await sfx.bgmStart({ force: true });
    assert.equal(started, true);
    await sfx.sfxUnlock();

    assert.equal(env.audioInstances.length, 1);
    assert.equal(env.ctxInstances.length, 1);
    const bgm = env.audioInstances[0];
    const ctx = env.ctxInstances[0];

    assert.equal(bgm.paused, false);
    assert.equal(ctx.state, 'running');
    assert.equal(sfx.sfxIsMuted(), false);

    // Leaving battle tab silences everything immediately without muting user pref
    sfx.pauseBattleAudio();
    assert.equal(bgm.paused, true);
    assert.equal(bgm.volume, 0);
    assert.equal(ctx.state, 'suspended');
    assert.equal(ctx.suspendCalls, 1);
    assert.equal(sfx.sfxIsMuted(), false);
    assert.equal(env.storage.get('battle-sfx-muted'), undefined);

    // Background SFX calls while away must not wake AudioContext or schedule oscillators
    const oscBefore = ctx.oscillatorCalls;
    sfx.sfxUiTap();
    assert.equal(ctx.state, 'suspended');
    assert.equal(ctx.oscillatorCalls, oscBefore);

    // Returning to battle tab resumes AudioContext and BGM
    const playBefore = bgm.playCalls;
    sfx.resumeBattleAudio();
    await Promise.resolve();
    assert.equal(ctx.state, 'running');
    assert.equal(bgm.paused, false);
    assert.equal(bgm.playCalls, playBefore + 1);
    assert.equal(sfx.sfxIsMuted(), false);
  } finally {
    env.restore();
  }
});

test('returning to battle tab stays silent when the user explicitly muted audio', async () => {
  const env = createAudioEnv();
  try {
    const sfx = await loadFreshSfx();

    await sfx.bgmStart({ force: true });
    await sfx.sfxUnlock();
    const bgm = env.audioInstances[0];
    const ctx = env.ctxInstances[0];

    sfx.sfxSetMuted(true);
    assert.equal(sfx.sfxIsMuted(), true);
    assert.equal(env.storage.get('battle-sfx-muted'), '1');

    const playCallsAfterMute = bgm.playCalls;
    const resumeCallsAfterMute = ctx.resumeCalls;

    sfx.pauseBattleAudio();
    assert.equal(sfx.sfxIsMuted(), true);
    assert.equal(env.storage.get('battle-sfx-muted'), '1');

    sfx.resumeBattleAudio();
    await Promise.resolve();

    assert.equal(sfx.sfxIsMuted(), true);
    assert.equal(env.storage.get('battle-sfx-muted'), '1');
    assert.equal(bgm.paused, true);
    assert.equal(bgm.playCalls, playCallsAfterMute);
    assert.equal(ctx.resumeCalls, resumeCallsAfterMute);
  } finally {
    env.restore();
  }
});

test('visibilitychange suspends audio when hidden and only resumes if still on battle tab', async () => {
  const env = createAudioEnv();
  try {
    const sfx = await loadFreshSfx();

    await sfx.bgmStart({ force: true });
    await sfx.sfxUnlock();
    const bgm = env.audioInstances[0];
    const ctx = env.ctxInstances[0];

    // Window minimized while on battle tab -> suspend
    env.fakeDocument.emitVisibility(true);
    assert.equal(bgm.paused, true);
    assert.equal(ctx.state, 'suspended');
    assert.equal(sfx.sfxIsMuted(), false);

    // Window restored while on battle tab -> resume
    env.fakeDocument.emitVisibility(false);
    await Promise.resolve();
    assert.equal(bgm.paused, false);
    assert.equal(ctx.state, 'running');

    // Switch to another tab, then minimize + restore window -> must remain silent
    sfx.pauseBattleAudio();
    assert.equal(bgm.paused, true);
    env.fakeDocument.emitVisibility(true);
    env.fakeDocument.emitVisibility(false);
    await Promise.resolve();
    assert.equal(bgm.paused, true);
    assert.equal(ctx.state, 'suspended');
  } finally {
    env.restore();
  }
});
