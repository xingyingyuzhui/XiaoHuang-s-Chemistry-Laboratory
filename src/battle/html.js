/**
 * 元素乱斗 · HTML 模板（纯字符串，无副作用）
 */

import { DIMENSIONS } from '../data/battle-cards.js';
import { BLOCK_LABEL, MAX_FLIP, LOG_CAP } from './constants.js';
import { strengthOf, formatVal, canPlayElement, deltaHint, handArcPx, countPlayableInDim } from './rules.js';
import { escapeHtml } from './util.js';
import { getHintMode, isBeginnerHints } from './hint-settings.js';
import { ui } from './state.js';
import { sfxIsMuted } from './sfx.js';
import { getModeBView } from './view-model.js';

export function renderHandHtml(v) {
  const { s, topEl, yourTurn, mustOpen, canFlip, needFlip, n, showHints } = v;
  return s.playerHand
    .map((card, i) => {
      const arc = handArcPx(i, n);
      if (card.kind === 'flip') {
        // 手牌 FLIP：仅手里有且该催时才 urgent 跳动
        return `
          <button type="button" class="bc bc-flip ${canFlip ? 'is-flip-ready' : ''} ${needFlip ? 'is-urgent' : ''}"
            data-hand="${i}" data-kind="flip" style="--i:${i};--arc:${arc.toFixed(1)}px">
            <span class="bc-foil"></span>
            <span class="bc-flip-tag">FLIP</span>
            <span class="bc-flip-sub">改维度</span>
          </button>`;
      }
      const ok = mustOpen
        ? yourTurn
        : yourTurn && canPlayElement(card, s.top, s.dimension);
      const locked = yourTurn && !mustOpen && !ok;
      const blocked = !yourTurn || s.busy;
      // 普通模式：不高亮可出、不贴差值，减少「照着点」
      const playable = showHints && ok && yourTurn && !s.busy;
      const hint =
        showHints && yourTurn ? deltaHint(card.element, s.dimension, topEl) : null;
      return renderCard(card, {
        handIndex: i,
        playable,
        dim: s.dimension,
        locked: showHints ? locked : false,
        blocked,
        hint,
        arc,
        // 手牌保留完整信息：Z / 区 / 三表 / χ·r / 当前维数值
        compact: false,
      });
    })
    .join('');
}


export function renderHelpMaskHtml() {
  return `<div class="battle-help-mask" id="btnHelpMask" role="presentation">
    <div class="battle-help-pop" role="dialog" aria-modal="true" aria-labelledby="battleHelpTitle">
      <header class="battle-help-head">
        <h3 id="battleHelpTitle">周期律乱斗 · 规则</h3>
        <button type="button" class="btn ghost btn-sm" id="btnHelpClose" aria-label="关闭">关闭</button>
      </header>
      <div class="battle-help-body">
        <section>
          <h4>目标</h4>
          <p>先把手牌全部打出的一方获胜。对手出完则本局结束。</p>
        </section>
        <section>
          <h4>出牌</h4>
          <p>桌面有一张<strong>顶牌</strong>，并约定当前比较维度（序数 Z / 电负性 χ / 原子半径 r）。</p>
          <p>你打出的元素牌，在<strong>当前维度</strong>上的数值必须<strong>严格大于</strong>顶牌，才能压过并成为新顶牌。</p>
        </section>
        <section>
          <h4>三个维度</h4>
          <ul>
            <li><b>序数 Z</b>：原子序数越大越强。</li>
            <li><b>电负性 χ</b>：吸引电子能力越强越好；惰性气体记为「—」，电负性维度上几乎压不过别人。</li>
            <li><b>半径 r</b>：原子半径（pm）越大越强。</li>
          </ul>
        </section>
        <section>
          <h4>FLIP 牌</h4>
          <p>消耗一张 FLIP，把比较维度改成另外一个。每局限用 ${MAX_FLIP} 次。改维度后，原本压不过的牌可能突然能出。</p>
        </section>
        <section>
          <h4>抽牌 / 过牌</h4>
          <p>仅在没有可出牌时使用：从牌库抽 1 张；若仍无法出则过牌。双方连续过牌会<strong>清叠</strong>，由你任选一张元素牌开新叠。</p>
        </section>
        <section>
          <h4>小提示</h4>
          <p>顶栏可切换「新手 / 普通」提示强度；新手会高亮可出牌与差值。音效按钮可静音 BGM 与音效。</p>
        </section>
      </div>
    </div>
  </div>`;
}

/**
 * 桌面散落的弃牌：完整牌面（像打出去的扑克），乱放在顶牌周围
 * @param {BattleCard[]} discard
 */
export function renderScatterPile(discard) {
  const dim = ui.modeB?.dimension || 'z';
  const els = (discard || [])
    .filter((c) => c.kind === 'element' && c.element)
    .slice(-10);
  if (!els.length) return '';
  return els
    .map((c, i) => {
      const el = c.element;
      let h = 0;
      const key = c.uid || `${el.symbol}-${i}`;
      for (let k = 0; k < key.length; k++) h = (h * 31 + key.charCodeAt(k)) | 0;
      const u = Math.abs(h % 1000) / 1000;
      const v = Math.abs((h * 7) % 1000) / 1000;
      // 更散开一些，像桌上随意甩开的牌
      const rot = ((u - 0.5) * 58).toFixed(1);
      const x = ((u - 0.5) * 120).toFixed(1);
      const y = ((v - 0.5) * 70 + 28).toFixed(1);
      return `<div class="battle-scatter-item" style="--r:${rot}deg;--x:${x}px;--y:${y}px;--z:${i}">
        ${renderCard(c, { dim, scatter: true })}
      </div>`;
    })
    .join('');
}

/** @param {any} s */
export function renderFlipMaskHtml(s) {
  return `<div class="battle-flip-mask" id="btnFlipMask" role="presentation">
    <div class="battle-flip-pop" role="dialog" aria-modal="true" aria-label="选择比较维度">
      <p class="battle-flip-pop-title">FLIP · 改为比</p>
      <div class="battle-flip-pop-grid">
        ${['z', 'en', 'radius']
          .map((d) => {
            const n = countPlayableInDim(s, /** @type {BattleDimension} */ (d));
            const cur = d === s.dimension;
            return `
              <button type="button" class="battle-flip-opt ${cur ? 'is-current' : ''} ${n > 0 ? 'is-hot' : ''}" data-flip="${d}">
                <span class="battle-flip-opt-ico">${d === 'z' ? 'Z' : d === 'en' ? 'χ' : 'r'}</span>
                <span>${DIMENSIONS[d].short}</span>
                <small>${d === 'z' ? '序数越大越强' : d === 'en' ? '吸引电子' : '半径越大越强'}</small>
                <em class="battle-flip-opt-n">${cur ? '当前' : n > 0 ? `可出 ${n} 张` : '暂无牌'}</em>
              </button>`;
          })
          .join('')}
      </div>
      <button type="button" class="btn ghost btn-sm" id="btnFlipCancel">取消</button>
    </div>
  </div>`;
}

/** @param {any} s */
export function renderEndMaskHtml(s) {
  const win = s.status === 'playerWin';
  const st = s.stats || { plays: 0, flips: 0, maxHit: '' };
  const flavor = win
    ? st.flips > 0
      ? `FLIP ${st.flips} 次改维，节奏漂亮。`
      : '维度稳住，压制到底。'
    : '想想何时 FLIP，大牌留关键时刻。';
  return `<div class="battle-end-mask ${win ? 'is-win' : 'is-lose'}" role="dialog" aria-modal="true" aria-labelledby="battleEndTitle">
    <div class="battle-end-rays" aria-hidden="true"></div>
    <div class="battle-end-box">
      <div class="battle-end-medal" aria-hidden="true">${win ? '🏆' : '📘'}</div>
      <h3 id="battleEndTitle">${win ? '胜利！' : '再试一次'}</h3>
      <p>${flavor}</p>
      <ul class="battle-end-stats">
        <li><span>出牌</span><b>${st.plays}</b></li>
        <li><span>FLIP</span><b>${st.flips}</b></li>
        <li><span>手牌</span><b>${s.playerHand.length}</b></li>
      </ul>
      ${st.maxHit ? `<p class="battle-end-hit">关键一击 · ${escapeHtml(st.maxHit)}</p>` : ''}
      <div class="battle-end-actions">
        <button type="button" class="btn primary battle-cta-pulse" id="btnBattleAgain">再来一局</button>
        <button type="button" class="btn ghost" id="btnBattleToHub">回大厅</button>
      </div>
    </div>
  </div>`;
}

/** 大厅下落雨：元素符号块 */
export function renderHubRainChips() {
  const labels = [
    'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne',
    'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
    'Fe', 'Cu', 'Zn', 'Br', 'Kr', 'Ag', 'I', 'Au',
    'Z', 'χ', 'r', 's', 'p', 'd', 'Ne', 'F', 'O', 'C',
  ];
  // 伪随机，SSR/每次 render 略变无妨
  let seed = 17;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const n = 36;
  const parts = [];
  for (let i = 0; i < n; i++) {
    const label = labels[i % labels.length];
    const x = (rnd() * 96 + 2).toFixed(1); // 2%–98% 铺满左右
    const dur = (10 + rnd() * 14).toFixed(1); // 10–24s 慢落
    const delay = (-rnd() * 18).toFixed(1);
    const rot = ((rnd() - 0.5) * 28).toFixed(1);
    const scale = (0.75 + rnd() * 0.55).toFixed(2);
    const hue = i % 3; // 0 accent / 1 note / 2 stamp
    parts.push(
      `<span class="battle-float-chip battle-rain-chip hue-${hue}" style="--x:${x}%;--dur:${dur}s;--delay:${delay}s;--rot:${rot}deg;--sc:${scale}">${label}</span>`,
    );
  }
  return parts.join('');
}

export function renderHub() {
  return `
    <div class="battle-hub">
      <div class="battle-hub-bg" aria-hidden="true">
        <div class="battle-hub-orb a"></div>
        <div class="battle-hub-orb b"></div>
        <div class="battle-hub-orb c"></div>
        <div class="battle-hub-orb d"></div>
        <div class="battle-hub-orb e"></div>
        <div class="battle-hub-grid"></div>
        <div class="battle-hub-ring r1"></div>
        <div class="battle-hub-ring r2"></div>
      </div>
      <div class="battle-float-chips battle-rain" aria-hidden="true">
        ${renderHubRainChips()}
      </div>
      <header class="battle-hub-head">
        <h2>元素<span class="battle-hub-glow">乱斗</span></h2>
      </header>
      <div class="battle-mode-grid">
        <article class="battle-mode-card is-soon" data-mode="a">
          <div class="battle-mode-art art-a">
            <span class="battle-mode-glyph">⚗</span>
            <span class="battle-mode-art-label">配方模式</span>
            <span class="battle-mode-shine"></span>
          </div>
          <div class="battle-mode-body">
            <span class="battle-mode-badge">模式甲 · 预留</span>
            <h3>元素大乱斗</h3>
            <p>凑配方做实验，合法才得分。实验室叙事即将登场。</p>
            <button type="button" class="btn ghost" disabled>即将开放</button>
          </div>
        </article>
        <article class="battle-mode-card is-ready is-featured">
          <div class="battle-mode-art art-b">
            <span class="battle-mode-glyph">Z · χ · r</span>
            <span class="battle-mode-art-label">周期律乱斗</span>
            <span class="battle-mode-shine"></span>
          </div>
          <div class="battle-mode-body">
            <span class="battle-mode-badge battle-mode-badge-go">模式乙 · 可玩</span>
            <h3>周期律乱斗</h3>
            <p>UNO 风压牌 · FLIP 改维度 · 飞牌砸桌 · 先出完获胜。</p>
            <button type="button" class="btn primary battle-cta-pulse" id="btnStartModeB">
              进入战场
              <span class="battle-cta-arrow">→</span>
            </button>
          </div>
        </article>
      </div>
    </div>
  `;
}


export function renderModeASoon() {
  return `
    <div class="battle-soon">
      <button type="button" class="btn ghost btn-sm" id="btnBattleBackHub">← 返回</button>
      <div class="battle-soon-card">
        <div class="battle-soon-ico">⚗</div>
        <h2>元素大乱斗 · 即将开放</h2>
        <p>白名单配方 · 条件牌 · 事故文案。入口占位中。</p>
      </div>
    </div>
  `;
}

export function renderModeB() {
  const v = getModeBView();
  if (!v) return '';
  const {
    s, dim, topEl, flipLeft, yourTurn, mustOpen, hasFlip, canFlip, n,
    status, aiPct, youPct, hasPlayable, needFlip, showHints,
  } = v;

  const dimTrackHtml = `
    <div class="battle-dim-track" role="group" aria-label="当前比较维度">
      ${['z', 'en', 'radius']
        .map((d) => {
          const on = s.dimension === d;
          return `<div class="battle-dim-seg ${on ? 'is-on' : ''}" data-dim="${d}">
            <span class="battle-dim-ico">${d === 'z' ? 'Z' : d === 'en' ? 'χ' : 'r'}</span>
            <span>${DIMENSIONS[d].short}</span>
          </div>`;
        })
        .join('')}
      <div class="battle-dim-slider" style="--dim-i:${s.dimension === 'z' ? 0 : s.dimension === 'en' ? 1 : 2}"></div>
    </div>`;

  return `
    <div class="battle-play" data-turn="${s.turn}" data-dim="${s.dimension}" data-hint="${isBeginnerHints() ? 'beginner' : 'normal'}">
      <div class="battle-play-bg" aria-hidden="true">
        <span class="battle-felt"></span>
        <span class="battle-felt-grid"></span>
        <span class="battle-felt-glow"></span>
        <div class="battle-ambient"></div>
      </div>
      <div class="battle-vfx-layer" aria-hidden="true"></div>

      <header class="battle-play-bar">
        <button type="button" class="btn ghost btn-sm" id="btnBattleExit">← 大厅</button>
        <div class="battle-play-title">
          <strong>周期律乱斗</strong>
          <span class="battle-dim-pill" data-dim="${s.dimension}">${dim.short}</span>
        </div>
        <div class="battle-score-pills">
          <span class="battle-score-pill is-ai">敌 ${s.aiHand.length}</span>
          <span class="battle-score-pill is-you">我 ${s.playerHand.length}</span>
        </div>
        <div class="battle-hint-switch" role="group" aria-label="提示模式">
          <button type="button" class="battle-hint-btn ${getHintMode() === 'beginner' ? 'is-on' : ''}" data-hint-mode="beginner" title="高亮可出牌与差值">新手</button>
          <button type="button" class="battle-hint-btn ${getHintMode() === 'normal' ? 'is-on' : ''}" data-hint-mode="normal" title="少提示，自己判断">普通</button>
        </div>
        <button type="button" class="btn ghost btn-sm battle-sfx-btn ${sfxIsMuted() ? 'is-muted' : ''}" id="btnBattleSfx" title="${sfxIsMuted() ? '声音已关 · 点击开启并试听' : '声音已开 · 点击静音'}" aria-pressed="${sfxIsMuted() ? 'true' : 'false'}">${sfxIsMuted() ? '静音' : '有声'}</button>
        <button type="button" class="btn ghost btn-sm" id="btnBattleHelp">规则</button>
        <button type="button" class="btn ghost btn-sm" id="btnBattleRestart">重开</button>
      </header>

      <div class="battle-board">
        <!-- 左栏：对手牌墙 + 战报铺满 -->
        <aside class="battle-col battle-col-left">
          <div class="battle-side-card battle-ai-panel ${s.busy || s.turn === 'ai' ? 'is-active-side' : ''}">
            <div class="battle-side-head">
              <div class="battle-avatar battle-avatar-pulse">🤖</div>
              <div class="battle-row-meta">
                <h3>对手</h3>
                <p>FLIP ${s.aiFlipsUsed}/${MAX_FLIP} · ${s.aiHand.length} 张</p>
                <div class="battle-hp" title="手牌"><i style="--w:${aiPct}%"></i></div>
              </div>
            </div>
            <div class="battle-ai-wall" aria-hidden="true">
              ${s.aiHand
                .map(
                  (_, i) =>
                    `<span class="battle-card-back battle-card-back-lg" style="--i:${i}"></span>`,
                )
                .join('')}
            </div>
          </div>
          <div class="battle-side-card battle-log-card">
            <h4>战报</h4>
            <div class="battle-log" role="log" aria-live="polite" aria-relevant="additions">
              ${s.log
                .slice(0, LOG_CAP)
                .map(
                  (l) =>
                    `<p title="${escapeHtml(l)}">${escapeHtml(l)}</p>`,
                )
                .join('')}
            </div>
          </div>
        </aside>

        <!-- 中栏：大顶牌桌面 -->
        <section class="battle-col battle-col-center">
          <div class="battle-stage">
            <div class="battle-stage-ambient" aria-hidden="true"></div>
            <p class="battle-status ${yourTurn ? 'is-yours' : ''} ${s.busy ? 'is-thinking' : ''} ${s.status !== 'playing' ? 'is-end' : ''}">
              <span class="battle-status-pulse"></span>${status}
            </p>

            <div class="battle-table-row">
              <div class="battle-pile battle-pile-lg">
                <div class="battle-card-back battle-deck-visual"></div>
                <span class="battle-pile-label">牌库 ${s.deck.length}</span>
              </div>
              <div class="battle-top-zone">
                <div class="battle-scatter-pile" aria-hidden="true">
                  ${renderScatterPile(s.discard)}
                </div>
                <div class="battle-top-slot">
                  <div class="battle-top-halo" aria-hidden="true"></div>
                  ${
                    s.top?.element
                      ? renderCard(s.top, { large: true, dim: s.dimension })
                      : `<div class="bc bc-empty"><span>空</span></div>`
                  }
                </div>
              </div>
              <div class="battle-pile battle-pile-lg">
                <div class="battle-discard-stack">
                  <span class="battle-discard-n">${s.discard.length}</span>
                </div>
                <span class="battle-pile-label">弃牌</span>
              </div>
            </div>

            ${
              topEl
                ? `<div class="battle-compare-chip">
                    <span class="battle-compare-dot"></span>
                    比 <b>${dim.short}</b> · 顶牌 <b>${formatVal(strengthOf(topEl, s.dimension), s.dimension)}${s.dimension === 'radius' ? ' pm' : ''}</b>
                  </div>`
                : ''
            }
          </div>

          <div class="battle-dim-dock">
            ${dimTrackHtml}
          </div>
        </section>

        <!-- 右栏：操作铺满 + 大号维度键 -->
        <aside class="battle-col battle-col-right">
          <div class="battle-side-card battle-you-panel ${yourTurn ? 'is-active-side' : ''}">
            <div class="battle-side-head">
              <div class="battle-avatar battle-avatar-pulse">🧪</div>
              <div class="battle-row-meta">
                <h3>你</h3>
                <p>FLIP 剩 ${flipLeft} · ${s.playerHand.length} 张</p>
                <div class="battle-hp is-you" title="手牌"><i style="--w:${youPct}%"></i></div>
              </div>
            </div>
            <div class="battle-toolbar battle-toolbar-stack">
              <button type="button" class="btn ghost" id="btnBattleDrawPass" ${yourTurn && !mustOpen ? '' : 'disabled'}>抽牌 / 过</button>
              <button type="button" class="btn primary battle-flip-cta ${canFlip && needFlip ? 'is-urgent' : ''} ${canFlip ? 'is-ready' : ''}" id="btnBattleFlipOpen" ${canFlip ? '' : 'disabled'}>
                FLIP <span class="battle-flip-remain">${flipLeft}</span>
              </button>
            </div>
            ${
              isBeginnerHints() && (mustOpen || needFlip)
                ? `<p class="battle-nudge-flip ${mustOpen || needFlip ? '' : 'is-idle'}">${
                    mustOpen ? '点任意元素开新叠' : '可试 FLIP 改维度，或抽牌/过'
                  }</p>`
                : `<p class="battle-nudge-flip" hidden></p>`
            }
          </div>
          <div class="battle-side-card battle-tip-card battle-tip-fill">
            <h4>维度 · ${dim.short}</h4>
            <div class="battle-dim-keys" aria-hidden="true">
              ${['z', 'en', 'radius']
                .map((d) => {
                  const on = s.dimension === d;
                  return `<div class="battle-dim-key ${on ? 'is-on' : ''}">
                    <span class="battle-dim-key-ico">${d === 'z' ? 'Z' : d === 'en' ? 'χ' : 'r'}</span>
                    <span class="battle-dim-key-name">${DIMENSIONS[d].short}</span>
                    <span class="battle-dim-key-desc">${d === 'z' ? '序数↑' : d === 'en' ? '电负↑' : '半径↑'}</span>
                  </div>`;
                })
                .join('')}
            </div>
          </div>
        </aside>
      </div>

      ${s.flipPickerOpen ? renderFlipMaskHtml(s) : ''}
      ${s.helpOpen ? renderHelpMaskHtml() : ''}

      <div class="battle-hand-wrap">
        <div class="battle-hand" style="--n:${n}">
          ${renderHandHtml({
            s,
            topEl,
            yourTurn,
            mustOpen,
            canFlip,
            needFlip,
            n,
            dim,
            flipLeft,
            hasFlip,
            hasPlayable,
            showHints: isBeginnerHints(),
            status,
            aiPct,
            youPct,
          })}
        </div>
        <p class="battle-hand-hint is-hidden" aria-hidden="true"></p>
      </div>

      <div class="battle-toast ${s.toast ? 'is-show' : ''}">${escapeHtml(s.toast || '')}</div>

      ${s.status !== 'playing' ? renderEndMaskHtml(s) : ''}
    </div>
  `;
}

/**
 * @param {BattleCard} card
 * @param {{ large?: boolean, handIndex?: number, playable?: boolean, dim?: BattleDimension, locked?: boolean, blocked?: boolean, hint?: {ok:boolean,text:string}|null, arc?: number, compact?: boolean, scatter?: boolean }} opt
 */

export function renderCard(card, opt = {}) {
  const el = card.element;
  if (!el) return '';
  const dim = opt.dim || 'z';
  const val = strengthOf(el, dim);
  const block = el.block || 'p';
  const compact = !!opt.compact && !opt.large;
  const classes = [
    'bc',
    'bc-el',
    `block-${block}`,
    opt.large ? 'is-large' : '',
    opt.scatter ? 'is-scatter' : '',
    compact ? 'is-compact' : '',
    opt.playable ? 'is-playable' : '',
    opt.locked ? 'is-locked' : '',
    opt.blocked ? 'is-blocked' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const tag = opt.handIndex != null ? 'button' : 'div';
  const i = opt.handIndex ?? 0;
  const arc = opt.arc != null ? opt.arc : handArcPx(i, 7);
  const ariaHint = opt.hint
    ? opt.hint.ok
      ? `可出，${opt.hint.text}`
      : `压不过，${opt.hint.text}`
    : '';
  const attrs =
    opt.handIndex != null
      ? `type="button" data-hand="${opt.handIndex}" data-kind="element" style="--i:${i};--arc:${arc.toFixed(1)}px" aria-disabled="${opt.locked || opt.blocked ? 'true' : 'false'}" aria-label="${el.symbol} ${el.name} ${ariaHint}"`
      : '';

  const enShow = el.en === 0 ? '—' : el.en.toFixed(2);
  const pZ = Math.min(1, el.z / 80);
  const pEn = el.en === 0 ? 0 : Math.min(1, el.en / 4);
  const pR = Math.min(1, el.radius / 210);

  // 完整卡面：轨道圆 + 三表 + χ/r（手牌与大牌都有）
  return `
    <${tag} class="${classes}" ${attrs}>
      <span class="bc-bg" aria-hidden="true"></span>
      <span class="bc-orbit" style="--pz:${pZ};--pen:${pEn};--pr:${pR}" aria-hidden="true"></span>
      <span class="bc-sheen" aria-hidden="true"></span>
      <span class="bc-frame" aria-hidden="true"></span>
      <span class="bc-z">Z${el.z}</span>
      <span class="bc-block">${BLOCK_LABEL[block] || block}</span>
      <span class="bc-symbol">${el.symbol}</span>
      <span class="bc-name">${el.name}</span>
      ${
        compact
          ? ''
          : `<span class="bc-meters" aria-hidden="true">
        <i style="--p:${pZ * 100}%" data-k="z"></i>
        <i style="--p:${pEn * 100}%" data-k="en"></i>
        <i style="--p:${pR * 100}%" data-k="r"></i>
      </span>
      <span class="bc-stats">
        <i class="${dim === 'en' ? 'on' : ''}">χ${enShow}</i>
        <i class="${dim === 'radius' ? 'on' : ''}">r${el.radius}</i>
      </span>`
      }
      ${
        compact
          ? `<span class="bc-detail" aria-hidden="true">
        <span class="bc-meters">
          <i style="--p:${pZ * 100}%" data-k="z"></i>
          <i style="--p:${pEn * 100}%" data-k="en"></i>
          <i style="--p:${pR * 100}%" data-k="r"></i>
        </span>
        <span class="bc-stats">
          <i class="${dim === 'en' ? 'on' : ''}">χ${enShow}</i>
          <i class="${dim === 'radius' ? 'on' : ''}">r${el.radius}</i>
        </span>
      </span>`
          : ''
      }
      <span class="bc-power">
        <em>${DIMENSIONS[dim].short}</em>
        <b>${formatVal(val, dim)}</b>
      </span>
      ${opt.hint ? `<span class="bc-hint ${opt.hint.ok ? 'ok' : 'no'}">${opt.hint.text}</span>` : ''}
    </${tag}>
  `;
}
