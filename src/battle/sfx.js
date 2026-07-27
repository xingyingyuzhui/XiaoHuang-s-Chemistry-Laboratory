/**
 * 元素乱斗 · 柔和程序化音效（Web Audio）
 * - 手势内 resume AudioContext（浏览器静音策略）
 * - 音量够听但不过分
 */

const MUTE_KEY = 'battle-sfx-muted';
const VOL_KEY = 'battle-sfx-volume';

/** @type {AudioContext | null} */
let ctx = null;
/** @type {GainNode | null} */
let master = null;
let muted = loadMuted();
/** 0–1 */
let masterVol = loadVol();

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function loadVol() {
  try {
    const v = Number(localStorage.getItem(VOL_KEY));
    if (Number.isFinite(v) && v > 0 && v <= 1) return v;
  } catch {
    /* ignore */
  }
  return 0.7;
}

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || /** @type {typeof AudioContext} */ (window.webkitAudioContext);
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = masterVol;
    master.connect(ctx.destination);
  }
  return ctx;
}

function applyMasterGain() {
  if (master && ctx) {
    master.gain.setTargetAtTime(muted ? 0 : masterVol, ctx.currentTime, 0.02);
  }
}

/**
 * 必须在用户手势调用栈内执行；返回是否可用
 * @returns {Promise<boolean>}
 */
export async function sfxUnlock() {
  const c = ensureCtx();
  if (!c) return false;
  try {
    if (c.state === 'suspended') await c.resume();
  } catch {
    return false;
  }
  applyMasterGain();
  return c.state === 'running';
}

export function sfxIsMuted() {
  return muted;
}

export function sfxGetVolume() {
  return masterVol;
}

/** @param {boolean} m */
export function sfxSetMuted(m) {
  muted = !!m;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
  applyMasterGain();
  // BGM 跟随静音
  if (muted) bgmPause(600);
  else if (bgmWanted) bgmStart({ force: true }).catch(() => {});
}

/** @param {number} v 0–1 */
export function sfxSetVolume(v) {
  masterVol = Math.max(0.05, Math.min(1, v));
  try {
    localStorage.setItem(VOL_KEY, String(masterVol));
  } catch {
    /* ignore */
  }
  applyMasterGain();
  if (bgmEl && !bgmEl.paused) {
    bgmEl.volume = clamp01(bgmTargetVol() * bgmFadeLevel);
  }
}

export async function sfxToggleMuted() {
  const next = !muted;
  sfxSetMuted(next);
  if (!next) {
    const ok = await sfxUnlock();
    if (ok) sfxUiTap();
  }
  return muted;
}

/* ========== BGM（MP3 循环 + 淡入淡出） ========== */

// Vite public/ → 站点根路径；兼容 BASE_URL（末尾通常带 /）
const BGM_URL = `${import.meta.env?.BASE_URL || '/'}audio/the_final_catalyst.mp3`.replace(
  /\/{2,}audio\//,
  '/audio/',
);
/** BGM 相对主音量的比例（避免盖过 UI 音效） */
const BGM_LEVEL = 0.42;
const BGM_FADE_IN_MS = 3200;
const BGM_FADE_OUT_MS = 900;

/** @type {HTMLAudioElement | null} */
let bgmEl = null;
/** 是否希望在对局里播放（离开关掉） */
let bgmWanted = false;
/** 0–1 淡入进度 */
let bgmFadeLevel = 0;
/** @type {number | null} */
let bgmFadeTimer = null;

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function bgmTargetVol() {
  return clamp01(masterVol * BGM_LEVEL);
}

function ensureBgm() {
  if (bgmEl) return bgmEl;
  const a = new Audio(BGM_URL);
  a.loop = true;
  a.preload = 'auto';
  a.volume = 0;
  // 部分浏览器需要 playsInline 属性（DOM 上）
  a.setAttribute('playsinline', 'true');
  bgmEl = a;
  return a;
}

function clearBgmFade() {
  if (bgmFadeTimer != null) {
    cancelAnimationFrame(bgmFadeTimer);
    bgmFadeTimer = null;
  }
}

/**
 * @param {number} from
 * @param {number} to
 * @param {number} ms
 * @param {() => void} [onDone]
 */
function fadeBgm(from, to, ms, onDone) {
  clearBgmFade();
  if (!bgmEl) {
    onDone?.();
    return;
  }
  const start = performance.now();
  bgmFadeLevel = from;
  bgmEl.volume = clamp01(bgmTargetVol() * from);

  const tick = (now) => {
    if (!bgmEl) return;
    const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
    // ease-out cubic，起音更柔
    const e = 1 - (1 - t) ** 3;
    bgmFadeLevel = from + (to - from) * e;
    bgmEl.volume = clamp01(bgmTargetVol() * bgmFadeLevel);
    if (t < 1) {
      bgmFadeTimer = requestAnimationFrame(tick);
    } else {
      bgmFadeTimer = null;
      bgmFadeLevel = to;
      bgmEl.volume = clamp01(bgmTargetVol() * to);
      onDone?.();
    }
  };
  bgmFadeTimer = requestAnimationFrame(tick);
}

/**
 * 开始 / 恢复 BGM（须在用户手势后；默认从 0 淡入）
 * 重要：HTMLAudioElement.play() 必须尽量在手势同步路径里调用；
 * 若先 await AudioContext.resume()，部分浏览器会丢掉 user activation，导致 play 被拒。
 * @param {{ force?: boolean }} [opts]
 */
export async function bgmStart(opts = {}) {
  bgmWanted = true;
  if (muted) return false;
  const a = ensureBgm();
  try {
    if (a.paused || opts.force) {
      // 始终从极低音量起
      bgmFadeLevel = 0;
      a.volume = 0;
      // 先 kick play（同步拿到 Promise），再并行解锁 WebAudio
      const playP = a.play();
      sfxUnlock().catch(() => {});
      await playP;
      fadeBgm(0, 1, BGM_FADE_IN_MS);
    } else if (bgmFadeLevel < 0.99) {
      sfxUnlock().catch(() => {});
      fadeBgm(bgmFadeLevel, 1, BGM_FADE_IN_MS * (1 - bgmFadeLevel));
    }
    return true;
  } catch (e) {
    console.warn('[battle-bgm] play failed', e, 'url=', a.currentSrc || BGM_URL);
    // 手势可能已失效：标记 wanted，下次静音切换/再点开始时可 force 重试
    return false;
  }
}

/**
 * 暂停 BGM（淡出）
 * @param {number} [ms]
 */
export function bgmPause(ms = BGM_FADE_OUT_MS) {
  if (!bgmEl || bgmEl.paused) {
    bgmFadeLevel = 0;
    return;
  }
  const from = bgmFadeLevel || 1;
  fadeBgm(from, 0, ms, () => {
    try {
      bgmEl?.pause();
    } catch {
      /* ignore */
    }
  });
}

/** 离开对局：停止并记住不再自动播 */
export function bgmStop(ms = BGM_FADE_OUT_MS) {
  bgmWanted = false;
  bgmPause(ms);
}

export function bgmIsWanted() {
  return bgmWanted;
}

/**
 * 在 context 就绪后执行；若仍 suspended 会尝试 resume
 * @param {(c: AudioContext, out: AudioNode) => void} fn
 */
function withAudio(fn) {
  if (muted) return;
  const c = ensureCtx();
  if (!c || !master) return;

  const run = () => {
    if (muted || !ctx || !master || ctx.state !== 'running') return;
    try {
      fn(ctx, master);
    } catch (e) {
      console.warn('[battle-sfx]', e);
    }
  };

  if (c.state === 'running') {
    run();
    return;
  }
  // 可能刚点完手势：异步 resume 后再播
  c.resume()
    .then(() => {
      applyMasterGain();
      run();
    })
    .catch(() => {});
}

/**
 * @param {AudioContext} c
 * @param {AudioNode} out
 * @param {number} t0
 * @param {OscillatorType} type
 * @param {number} freq
 * @param {number} dur
 * @param {number} peak 0–1 相对响度
 */
function tone(c, out, t0, type, freq, dur, peak) {
  const osc = c.createOscillator();
  const g = c.createGain();
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 2800;
  filt.Q.value = 0.5;

  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);

  const p = Math.max(0.001, peak);
  const attack = 0.008;
  const release = Math.max(0.04, dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(p, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);

  osc.connect(filt);
  filt.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + attack + release + 0.03);
}

/**
 * @param {AudioContext} c
 * @param {AudioNode} out
 * @param {number} t0
 * @param {number} dur
 * @param {number} peak
 * @param {number} hpFreq
 */
function softNoise(c, out, t0, dur, peak, hpFreq = 400) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = last * 0.85 + white * 0.15; // 略粉噪
    data[i] = last * (1 - i / len);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const hp = c.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = hpFreq;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2400;
  const g = c.createGain();
  const p = Math.max(0.001, peak);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(p, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(g);
  g.connect(out);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

/* —— 事件 —— */

export function sfxUiTap() {
  withAudio((c, out) => {
    const t = c.currentTime;
    tone(c, out, t, 'sine', 540, 0.07, 0.55);
    tone(c, out, t + 0.02, 'sine', 810, 0.06, 0.32);
  });
}

export function sfxDeal() {
  withAudio((c, out) => {
    const t = c.currentTime;
    softNoise(c, out, t, 0.1, 0.35, 450);
    tone(c, out, t + 0.01, 'triangle', 220, 0.09, 0.4);
  });
}

export function sfxFly() {
  withAudio((c, out) => {
    const t = c.currentTime;
    softNoise(c, out, t, 0.15, 0.3, 550);
    tone(c, out, t, 'sine', 300, 0.12, 0.35);
    tone(c, out, t + 0.04, 'sine', 380, 0.1, 0.28);
  });
}

export function sfxSlam() {
  withAudio((c, out) => {
    const t = c.currentTime;
    tone(c, out, t, 'sine', 90, 0.16, 0.7);
    tone(c, out, t + 0.012, 'triangle', 145, 0.11, 0.4);
    softNoise(c, out, t, 0.07, 0.28, 180);
  });
}

export function sfxFlip() {
  withAudio((c, out) => {
    const t = c.currentTime;
    tone(c, out, t, 'sine', 440, 0.14, 0.45);
    tone(c, out, t + 0.07, 'sine', 554, 0.16, 0.4);
    tone(c, out, t + 0.14, 'sine', 659, 0.18, 0.35);
    softNoise(c, out, t + 0.02, 0.08, 0.18, 650);
  });
}

export function sfxPass() {
  withAudio((c, out) => {
    const t = c.currentTime;
    tone(c, out, t, 'triangle', 250, 0.1, 0.4);
    tone(c, out, t + 0.05, 'sine', 195, 0.12, 0.32);
  });
}

export function sfxDeny() {
  withAudio((c, out) => {
    const t = c.currentTime;
    tone(c, out, t, 'triangle', 165, 0.12, 0.45);
    tone(c, out, t + 0.05, 'sine', 130, 0.14, 0.35);
  });
}

export function sfxTurn() {
  withAudio((c, out) => {
    const t = c.currentTime;
    tone(c, out, t, 'sine', 620, 0.1, 0.38);
    tone(c, out, t + 0.08, 'sine', 740, 0.12, 0.32);
  });
}

export function sfxOpenStack() {
  withAudio((c, out) => {
    const t = c.currentTime;
    tone(c, out, t, 'sine', 330, 0.1, 0.42);
    tone(c, out, t + 0.05, 'sine', 415, 0.12, 0.36);
    softNoise(c, out, t, 0.08, 0.2, 400);
  });
}

export function sfxClear() {
  withAudio((c, out) => {
    const t = c.currentTime;
    softNoise(c, out, t, 0.12, 0.28, 320);
    tone(c, out, t + 0.02, 'sine', 200, 0.14, 0.35);
    tone(c, out, t + 0.08, 'sine', 160, 0.16, 0.28);
  });
}

export function sfxWin() {
  withAudio((c, out) => {
    const t = c.currentTime;
    [392, 494, 587, 740].forEach((f, i) => {
      tone(c, out, t + i * 0.11, 'sine', f, 0.34, 0.4 - i * 0.03);
      tone(c, out, t + i * 0.11 + 0.02, 'triangle', f * 2, 0.18, 0.12);
    });
  });
}

export function sfxLose() {
  withAudio((c, out) => {
    const t = c.currentTime;
    tone(c, out, t, 'sine', 392, 0.22, 0.38);
    tone(c, out, t + 0.14, 'sine', 330, 0.24, 0.32);
    tone(c, out, t + 0.28, 'sine', 262, 0.3, 0.28);
  });
}

export function sfxHubSelect() {
  withAudio((c, out) => {
    const t = c.currentTime;
    tone(c, out, t, 'sine', 480, 0.1, 0.45);
    tone(c, out, t + 0.05, 'sine', 640, 0.12, 0.35);
  });
}
