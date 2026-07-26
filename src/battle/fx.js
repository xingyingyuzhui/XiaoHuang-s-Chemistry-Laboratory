/**
 * 元素乱斗 · 动效弹药库（Anime.js + confetti + DOM 粒子）
 * - 维度色语义 / 时间轴错峰 / 稳态环境粒子 / 飞牌对齐大牌
 */

import { animate, createTimeline, stagger, utils, cleanInlineStyles } from 'animejs';
import confetti from 'canvas-confetti';

/** 特效串行队列，避免 slam + float + banner 叠糊 */
let fxQueue = Promise.resolve();
let ambientSeeded = false;

function reducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  );
}

/** 清掉 Anime 行内 transform，避免盖住 CSS :hover */
function clearAnimStyles(targets) {
  try {
    if (!targets) return;
    const list =
      typeof targets.length === 'number' && !targets.tagName
        ? Array.from(targets)
        : [targets];
    list.forEach((el) => {
      if (el && el.nodeType === 1) cleanInlineStyles(el);
    });
  } catch {
    /* ignore */
  }
}

function accentColor() {
  const s = getComputedStyle(document.documentElement);
  return (
    s.getPropertyValue('--accent').trim() ||
    s.getPropertyValue('--stamp').trim() ||
    '#3b82f6'
  );
}

function noteColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--note').trim() || '#f59e0b';
}

function flameColor() {
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--flame').trim() || '#ef4444'
  );
}

/**
 * 当前维度语义色（与 CSS --b-dim-* 对齐）
 * @param {ParentNode | null} root
 */
function dimColor(root) {
  const play = root?.querySelector?.('.battle-play') || root;
  const dim =
    (play instanceof Element && play.getAttribute('data-dim')) ||
    document.querySelector('.battle-play')?.getAttribute('data-dim') ||
    'z';
  if (dim === 'en') return flameColor();
  if (dim === 'radius') {
    const n = noteColor();
    return n || '#22c55e';
  }
  return accentColor();
}

/**
 * 串行特效，避免同屏抢戏
 * @param {() => Promise<unknown> | unknown} job
 * @param {number} [gapMs]
 */
function enqueueFx(job, gapMs = 0) {
  fxQueue = fxQueue
    .then(() => job())
    .then(
      () =>
        gapMs > 0
          ? new Promise((r) => setTimeout(r, gapMs))
          : undefined,
    )
    .catch(() => {});
  return fxQueue;
}

/**
 * 大厅入场
 * @param {ParentNode | null} root
 */
export function fxHubIntro(root) {
  if (!root || reducedMotion()) return Promise.resolve();
  const head = root.querySelector('.battle-hub-head');
  const cards = root.querySelectorAll('.battle-mode-card');
  // 元素雨用 CSS 下落，不在此用 anime 写 opacity，避免打断 rain keyframes
  if (head) utils.set(head, { opacity: 0, translateY: 24 });
  if (cards.length) utils.set(cards, { opacity: 0, translateY: 36, scale: 0.94 });

  const tl = createTimeline({ defaults: { ease: 'out(3)' } });
  if (head) {
    tl.add(head, { opacity: [0, 1], translateY: [24, 0], duration: 520 }, 0);
  }
  if (cards.length) {
    tl.add(
      cards,
      {
        opacity: [0, 1],
        translateY: [36, 0],
        scale: [0.94, 1],
        delay: stagger(90),
        duration: 560,
      },
      120,
    );
  }
  return tl.then();
}

/**
 * 发牌：优先从牌库位飞入
 * @param {ParentNode | null} root
 */
export function fxDealHand(root) {
  if (!root || reducedMotion()) return Promise.resolve();
  const cards = root.querySelectorAll('.battle-hand .bc');
  if (!cards.length) return Promise.resolve();
  const deck = root.querySelector('.battle-deck-visual');
  if (deck) {
    const dr = deck.getBoundingClientRect();
    cards.forEach((c, i) => {
      const cr = c.getBoundingClientRect();
      const dx = dr.left + dr.width / 2 - (cr.left + cr.width / 2);
      const dy = dr.top + dr.height / 2 - (cr.top + cr.height / 2);
      utils.set(c, {
        opacity: 0,
        translateX: dx,
        translateY: dy,
        scale: 0.55,
        rotate: 18,
      });
      void i;
    });
    return animate(cards, {
      opacity: [0, 1],
      translateX: 0,
      translateY: 0,
      scale: 1,
      rotate: 0,
      delay: stagger(50, { from: 'center' }),
      duration: 580,
      ease: 'out(4)',
      onComplete: () => clearAnimStyles(cards),
    }).then(() => clearAnimStyles(cards));
  }
  utils.set(cards, { opacity: 0, translateY: 70, scale: 0.75, rotate: 12 });
  return animate(cards, {
    opacity: [1],
    translateY: [70, 0],
    scale: [0.75, 1],
    rotate: [12, 0],
    delay: stagger(55, { from: 'center' }),
    duration: 620,
    ease: 'out(4)',
    onComplete: () => clearAnimStyles(cards),
  }).then(() => clearAnimStyles(cards));
}

/**
 * 砸桌 + 冲击波
 * @param {Element | null} topEl
 * @param {ParentNode | null} root
 */
export function fxSlamTop(topEl, root = null) {
  if (reducedMotion()) return Promise.resolve();
  const color = dimColor(root);
  const jobs = [];
  if (topEl) {
    jobs.push(
      animate(topEl, {
        scale: [0.55, 1.06, 0.98, 1],
        translateY: [-36, 0],
        rotate: [-5, 1.5, 0],
        opacity: [0.25, 1],
        duration: 520,
        ease: 'out(3)',
        onComplete: () => clearAnimStyles(topEl),
      }).then(() => clearAnimStyles(topEl)),
    );
  }
  if (root) {
    jobs.push(fxImpactRing(root, color));
    jobs.push(fxSparkBurst(root, color));
    const stage = root.querySelector('.battle-stage');
    if (stage) jobs.push(fxTableKick(stage));
  }
  return Promise.all(jobs);
}

/**
 * 维度切换大特效
 * @param {ParentNode | null} root
 * @param {string} dimLabel
 */
export function fxFlipDim(root, dimLabel = '') {
  if (!root || reducedMotion()) return Promise.resolve();
  const stage = root.querySelector('.battle-stage');
  const top = root.querySelector('.battle-top-slot .bc');
  const layer = ensureVfxLayer(root);
  const color = dimColor(root);

  const flash = document.createElement('div');
  flash.className = 'battle-dim-flash-text';
  flash.textContent = dimLabel || 'FLIP';
  flash.style.color = color;
  layer.appendChild(flash);

  // 色闪 overlay，避免整 stage filter
  const overlay = document.createElement('div');
  overlay.className = 'battle-dim-flash-overlay';
  (stage || root).appendChild(overlay);

  const tl = createTimeline({ defaults: { ease: 'out(2)' } });
  tl.add(
    flash,
    {
      opacity: [0, 1, 1, 0],
      scale: [0.6, 1.12, 1.04, 1.3],
      translateY: [16, 0, 0, -12],
      duration: 860,
    },
    0,
  );
  tl.add(overlay, { opacity: [0, 0.9, 0], duration: 700 }, 0);
  if (top) {
    tl.add(
      top,
      {
        rotateY: [0, 88, 0],
        scale: [1, 0.94, 1.04, 1],
        duration: 680,
        onComplete: () => clearAnimStyles(top),
      },
      40,
    );
  }
  spawnOrbBurst(root, 12, color);
  return tl.then().finally(() => {
    flash.remove();
    overlay.remove();
    if (top) clearAnimStyles(top);
  });
}

/**
 * 非法晃动 + 红闪
 * @param {Element | null} el
 */
export function fxShake(el) {
  if (!el || reducedMotion()) return Promise.resolve();
  el.classList.add('is-deny');
  setTimeout(() => el.classList.remove('is-deny'), 450);
  return animate(el, {
    translateX: [0, -10, 10, -7, 7, -3, 0],
    rotate: [0, -4, 4, -2, 0],
    duration: 420,
    ease: 'inOut(2)',
    onComplete: () => clearAnimStyles(el),
  }).then(() => clearAnimStyles(el));
}

/**
 * 可出牌律动：只 scale / 光晕，禁止 Y 位移
 * @param {ParentNode | null} root
 */
export function fxNudgePlayable(root) {
  if (!root || reducedMotion()) return Promise.resolve();
  const cards = root.querySelectorAll('.battle-hand .bc.is-playable');
  if (!cards.length) return Promise.resolve();
  return animate(cards, {
    scale: [1, 1.05, 1.02, 1.04, 1],
    delay: stagger(45),
    duration: 520,
    ease: 'inOut(2)',
    onComplete: () => clearAnimStyles(cards),
  }).then(() => clearAnimStyles(cards));
}

/**
 * 飞牌（贝塞尔感 + 对齐大牌外轮廓）
 * @param {Element} fromEl
 * @param {Element} toSlot
 */
export function fxFlyToSlot(fromEl, toSlot) {
  if (reducedMotion() || !fromEl || !toSlot) return Promise.resolve();
  const fr = fromEl.getBoundingClientRect();
  // 优先对齐已有大牌，否则用 slot 中心、锁定大牌宽高比
  const targetCard = toSlot.querySelector('.bc.is-large') || toSlot.querySelector('.bc');
  const tr = (targetCard || toSlot).getBoundingClientRect();
  const targetW = targetCard ? tr.width : Math.min(tr.width * 0.92, 148);
  const targetH = targetCard ? tr.height : targetW * (196 / 148);

  const clone = /** @type {HTMLElement} */ (fromEl.cloneNode(true));
  clone.classList.add('bc-fly-clone');
  clone.style.cssText = `
    position: fixed; left:${fr.left}px; top:${fr.top}px;
    width:${fr.width}px; height:${fr.height}px;
    margin:0; z-index:10000; pointer-events:none; transform:none;
    filter: drop-shadow(0 12px 24px rgba(0,0,0,.35));
    border-radius: var(--b-r-md, 14px);
  `;
  document.body.appendChild(clone);

  const ghosts = [];
  for (let i = 0; i < 3; i++) {
    const g = /** @type {HTMLElement} */ (fromEl.cloneNode(true));
    g.classList.add('bc-fly-ghost');
    g.style.cssText = clone.style.cssText;
    g.style.zIndex = String(9990 + i);
    g.style.opacity = '0';
    document.body.appendChild(g);
    ghosts.push(g);
  }

  const endLeft = tr.left + tr.width / 2 - targetW / 2;
  const endTop = tr.top + tr.height / 2 - targetH / 2;
  const dx = endLeft - fr.left;
  const dy = endTop - fr.top;
  const midY = dy - Math.min(100, Math.abs(dy) * 0.4 + 48);
  const scaleX = targetW / Math.max(fr.width, 1);
  const scaleY = targetH / Math.max(fr.height, 1);

  const tl = createTimeline({ defaults: { ease: 'inOut(2.2)' } });
  tl.add(
    clone,
    {
      keyframes: [
        {
          translateX: dx * 0.32,
          translateY: midY,
          rotate: -14,
          scale: 1.06,
          duration: 200,
        },
        {
          translateX: dx,
          translateY: dy,
          rotate: 0,
          scaleX,
          scaleY,
          duration: 300,
        },
      ],
    },
    0,
  );
  ghosts.forEach((g, i) => {
    const t = (i + 1) / 4;
    tl.add(
      g,
      {
        opacity: [0, 0.28, 0],
        translateX: [0, dx * t, dx * (0.55 + t * 0.35)],
        translateY: [0, midY * t * 0.85, dy * (0.4 + t * 0.4)],
        rotate: [-8, -4],
        scale: [0.95, 0.85],
        duration: 380,
        delay: 30 + i * 40,
      },
      0,
    );
  });

  return tl
    .then()
    .finally(() => {
      clone.remove();
      ghosts.forEach((g) => g.remove());
    });
}

export function fxWinConfetti() {
  if (reducedMotion()) return;
  const colors = [accentColor(), noteColor(), flameColor(), '#22c55e', '#a78bfa', '#38bdf8'];
  const burst = (opts) =>
    confetti({
      ...opts,
      colors,
      disableForReducedMotion: true,
    });
  burst({ particleCount: 100, spread: 78, startVelocity: 40, origin: { y: 0.52 } });
  setTimeout(() => {
    burst({ particleCount: 48, angle: 55, spread: 55, origin: { x: 0.05, y: 0.7 } });
    burst({ particleCount: 48, angle: 125, spread: 55, origin: { x: 0.95, y: 0.7 } });
  }, 160);
  setTimeout(() => {
    burst({ particleCount: 60, spread: 100, startVelocity: 26, origin: { y: 0.4 }, scalar: 1.05 });
  }, 380);
}

/**
 * @param {Element | null} arena
 */
export function fxTableKick(arena) {
  if (!arena || reducedMotion()) return Promise.resolve();
  return animate(arena, {
    translateX: [0, -3, 3, -2, 1, 0],
    duration: 260,
    ease: 'inOut(2)',
    onComplete: () => clearAnimStyles(arena),
  }).then(() => clearAnimStyles(arena));
}

/**
 * 回合切换横幅（进队列）
 * @param {ParentNode | null} root
 * @param {string} text
 */
export function fxTurnBanner(root, text) {
  if (!root || reducedMotion() || !text) return Promise.resolve();
  return enqueueFx(() => {
    const layer = ensureVfxLayer(root);
    const el = document.createElement('div');
    el.className = 'battle-turn-banner';
    el.innerHTML = `<span>${text}</span>`;
    layer.appendChild(el);
    return animate(el, {
      opacity: [0, 1, 1, 0],
      translateY: [14, 0, 0, -10],
      scale: [0.92, 1.04, 1, 0.98],
      duration: 1000,
      ease: 'out(3)',
    })
      .then()
      .finally(() => el.remove());
  }, 80);
}

/**
 * 浮动得分/属性字（进队列，与 banner 错峰）
 * @param {ParentNode | null} root
 * @param {string} text
 * @param {'good'|'bad'|'info'} kind
 */
export function fxFloatText(root, text, kind = 'info') {
  if (!root || !text) return Promise.resolve();
  return enqueueFx(() => {
    const layer = ensureVfxLayer(root);
    const el = document.createElement('div');
    el.className = `battle-float-dmg battle-float-dmg--${kind}`;
    el.textContent = text;
    layer.appendChild(el);
    if (reducedMotion()) {
      setTimeout(() => el.remove(), 700);
      return Promise.resolve();
    }
    return animate(el, {
      opacity: [0, 1, 1, 0],
      translateY: [8, -10, -26, -44],
      scale: [0.85, 1.12, 1.04, 0.96],
      duration: 820,
      ease: 'out(2)',
    }).then(() => el.remove());
  }, 120);
}

/**
 * @param {ParentNode} root
 * @param {string} [color]
 */
function fxImpactRing(root, color) {
  const layer = ensureVfxLayer(root);
  const slot = root.querySelector('.battle-top-slot');
  const ring = document.createElement('div');
  ring.className = 'battle-impact-ring';
  if (color) {
    ring.style.borderColor = color;
    ring.style.boxShadow = `0 0 20px ${color}`;
  }
  if (slot) {
    const r = slot.getBoundingClientRect();
    const pr = root.getBoundingClientRect();
    ring.style.left = `${r.left + r.width / 2 - pr.left}px`;
    ring.style.top = `${r.top + r.height / 2 - pr.top}px`;
  }
  layer.appendChild(ring);
  return animate(ring, {
    scale: [0.3, 2.15],
    opacity: [0.75, 0],
    duration: 480,
    ease: 'out(2)',
  })
    .then()
    .finally(() => ring.remove());
}

/**
 * @param {ParentNode} root
 * @param {string} [color]
 */
function fxSparkBurst(root, color) {
  const layer = ensureVfxLayer(root);
  const slot = root.querySelector('.battle-top-slot');
  let cx = 50;
  let cy = 40;
  if (slot) {
    const r = slot.getBoundingClientRect();
    const pr = root.getBoundingClientRect();
    cx = ((r.left + r.width / 2 - pr.left) / Math.max(pr.width, 1)) * 100;
    cy = ((r.top + r.height / 2 - pr.top) / Math.max(pr.height, 1)) * 100;
  }
  const n = 11;
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.className = 'battle-spark';
    s.style.left = `${cx}%`;
    s.style.top = `${cy}%`;
    if (color) {
      s.style.background = color;
      s.style.boxShadow = `0 0 8px ${color}`;
    }
    layer.appendChild(s);
    const ang = (Math.PI * 2 * i) / n + Math.random() * 0.35;
    const dist = 36 + Math.random() * 48;
    animate(s, {
      translateX: Math.cos(ang) * dist,
      translateY: Math.sin(ang) * dist,
      scale: [1, 0],
      opacity: [1, 0],
      duration: 420 + Math.random() * 180,
      ease: 'out(2)',
    }).then(() => s.remove());
  }
  return Promise.resolve();
}

/**
 * @param {ParentNode} root
 * @param {number} count
 * @param {string} [color]
 */
function spawnOrbBurst(root, count = 10, color) {
  if (reducedMotion()) return;
  const layer = ensureVfxLayer(root);
  for (let i = 0; i < count; i++) {
    const o = document.createElement('span');
    o.className = 'battle-vfx-orb';
    o.style.left = `${30 + Math.random() * 40}%`;
    o.style.top = `${35 + Math.random() * 30}%`;
    if (color) {
      o.style.background = color;
      o.style.boxShadow = `0 0 12px ${color}`;
    }
    layer.appendChild(o);
    animate(o, {
      translateX: (Math.random() - 0.5) * 150,
      translateY: (Math.random() - 0.5) * 110 - 36,
      scale: [0, 1.15, 0],
      opacity: [0, 0.85, 0],
      duration: 680 + Math.random() * 280,
      ease: 'out(2)',
    }).then(() => o.remove());
  }
}

/**
 * @param {ParentNode} root
 */
function ensureVfxLayer(root) {
  let layer = root.querySelector('.battle-vfx-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'battle-vfx-layer';
    layer.setAttribute('aria-hidden', 'true');
    root.appendChild(layer);
  }
  return /** @type {HTMLElement} */ (layer);
}

/**
 * 环境粒子：开局种一次，不在每次 patch 清空
 * @param {ParentNode | null} root
 * @param {{ force?: boolean }} [opts]
 */
export function fxSpawnAmbient(root, opts = {}) {
  if (!root || reducedMotion()) return;
  const host = root.querySelector('.battle-ambient');
  if (!host) return;
  if (host.childElementCount > 0 && ambientSeeded && !opts.force) return;
  host.innerHTML = '';
  // 固定伪随机种子，避免每次重开位置「闪」
  let seed = 42;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const count = 18;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'battle-ambient-dot';
    p.style.left = `${rnd() * 100}%`;
    p.style.top = `${rnd() * 100}%`;
    p.style.setProperty('--d', `${7 + rnd() * 10}s`);
    p.style.setProperty('--delay', `${-rnd() * 12}s`);
    p.style.setProperty('--sz', `${2.5 + rnd() * 4}px`);
    p.style.setProperty('--op', `${0.28 + rnd() * 0.32}`);
    host.appendChild(p);
  }
  ambientSeeded = true;
  const stageAmb = root.querySelector('.battle-stage-ambient');
  if (stageAmb) stageAmb.innerHTML = '';
}

/** 新开局时重置粒子种子 */
export function fxResetAmbient() {
  ambientSeeded = false;
}

/**
 * 可出牌持续呼吸光
 * @param {ParentNode | null} root
 */
export function fxHighlightPlayable(root) {
  if (!root || reducedMotion()) return;
  const cards = root.querySelectorAll('.battle-hand .bc.is-playable');
  cards.forEach((c) => c.classList.add('is-glow'));
}
