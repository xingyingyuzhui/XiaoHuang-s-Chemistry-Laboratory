/**
 * 随堂小黄页面上下文注册、自动探测与实时 DOM 监听（跨 Tab 冻结契约）
 * 各模块可通过 registerPageAssistant 注入精确上下文与 3D 联动回调；
 * 未注册或返回 null 时自动回退到 DOM 探测，并自动监听 Tab/分子/元素/分区切换。
 */

const providers = new Map();
const listeners = new Set();

const TEXT_WATCH_SELECTORS = [
  '#moleculeTitle',
  '#molTitle',
  '#moleculeDesc',
  '#elementDetail',
  '#detailName',
  '#electronName',
  '#electronSymbol',
  '#electronTitle',
  '#electronConfig',
  '#molarResult',
  '#balanceResult',
  '#balanceStatus',
  '#stoichResult',
  '#stoichStatus',
];

const HIDDEN_WATCH_SELECTORS = [
  '[id^="aiSection"]',
  '#panel-molar .molar-section',
];

const NAV_WATCH_SELECTORS = ['.tabs', '#aiNavList', '#molarNavList'];

function textOf(doc, sel) {
  return doc?.querySelector?.(sel)?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function valOf(doc, sel) {
  return String(doc?.querySelector?.(sel)?.value || '').trim();
}

function shortName(title) {
  return String(title || '').split(/[·（(]/)[0].trim();
}

export function registerPageAssistant(tabKey, providerFn) {
  if (!tabKey || typeof providerFn !== 'function') return () => {};
  providers.set(tabKey, providerFn);
  return () => {
    if (providers.get(tabKey) === providerFn) providers.delete(tabKey);
  };
}

export function onPageContextChange(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notifyPageContextChange(tabKey = '') {
  listeners.forEach((fn) => {
    try { fn(tabKey); } catch { /* ignore listener errors */ }
  });
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent('xiaohuang:context-change', { detail: { tabKey } }));
  }
}

function introspectTab(tabKey, doc) {
  if (tabKey === 'table') {
    const title = textOf(doc, '#elementDetail .detail-head h2') || textOf(doc, '#detailName') || '元素周期表';
    const formula = textOf(doc, '#elementDetail .detail-badge');
    const summary = textOf(doc, '#elementDetail .detail-teach p') || '元素周期律与分区规律';
    const el = title !== '元素周期表' ? shortName(title) : '';
    const quickQuestions = el
      ? [`${el}常见化合价与代表物有哪些？`, `${el}在同周期/同主族中性质如何递变？`, `${el}有哪些高考常见易错点？`]
      : ['同周期与同主族元素性质如何递变？', '金属性与非金属性的判断依据是什么？', '元素周期律有哪些高考高频易错点？'];
    return { title, formula, module: 'table', summary, quickQuestions };
  }
  if (tabKey === 'molecule') {
    const rawTitle = textOf(doc, '#moleculeTitle') || textOf(doc, '#molTitle');
    const title = !rawTitle || rawTitle === '—' ? '3D 分子结构' : rawTitle;
    const summary = textOf(doc, '#moleculeDesc') || '共价分子空间构型与极性';
    const hasMol = title !== '3D 分子结构';
    const quickQuestions = hasMol
      ? [`${title}的成键特点与空间构型？`, `${title}是极性分子还是非极性分子？`, `${title}有哪些典型反应与高频考点？`]
      : ['中心原子杂化类型和空间构型怎么判断？', '如何判断共价分子的极性与非极性？', '键角大小比较有哪些常用规律？'];
    return { title, formula: '', module: 'molecule', summary, quickQuestions };
  }
  if (tabKey === 'crystal') {
    const title = textOf(doc, '.crystal-corner-info .crystal-corner-title') || textOf(doc, '.crystal-stage-title') || '3D 晶胞结构库';
    const formula = textOf(doc, '.crystal-corner-info .crystal-corner-formula');
    const hasItem = title !== '3D 晶胞结构库';
    const quickQuestions = hasItem
      ? [`${title}晶胞里各微粒怎么用均摊法数？`, `${title}的配位数和最短距离怎么看？`, `${title}在高考中常考哪些变式？`]
      : ['晶胞中各位置微粒怎么用均摊法计数？', '配位数和最短距离公式如何推导？', '晶胞密度公式计算容易在哪出错？'];
    return { title, formula, module: 'library', summary: '晶体微粒排布、均摊法、配位数与密度计算', quickQuestions };
  }
  if (tabKey === 'molar') {
    const heading = textOf(doc, '#panel-molar .molar-section:not([hidden]) h3') || '化学计算';
    const expr = valOf(doc, '#panel-molar .molar-section:not([hidden]) input, #panel-molar .molar-section:not([hidden]) textarea');
    const resLine = textOf(doc, '#panel-molar .molar-section:not([hidden]) .molar-balance-eq')
      || textOf(doc, '#panel-molar .molar-section:not([hidden]) .molar-total');
    const shortExpr = expr.slice(0, 32);
    const tag = shortExpr ? `「${shortExpr.slice(0, 20)}」` : heading;
    return {
      title: shortExpr ? `${heading} · ${shortExpr}` : heading,
      formula: expr.slice(0, 40),
      module: 'molar',
      summary: resLine ? `${heading}：${resLine.slice(0, 80)}` : (expr ? `${heading}：${expr.slice(0, 80)}` : '摩尔质量、方程式配平与化学计量'),
      quickQuestions: [`${tag}这步计算最容易在哪出错？`, `${heading}的核心解题思路是什么？`, '怎么快速检验计算或配平结果是否正确？'],
    };
  }
  if (tabKey === 'electron') {
    const name = textOf(doc, '#electronName') || textOf(doc, '#electronTitle');
    const sym = textOf(doc, '#electronSymbol');
    const cfg = textOf(doc, '#electronConfig');
    const validName = name && name !== '选择左侧元素查看' && name !== '—' ? name : '';
    const title = validName ? `${validName} 电子排布` : '原子核外电子排布';
    const quickQuestions = validName
      ? [`${validName}的价层电子排布有什么特点？`, `${validName}存在洪特规则特例吗？`, `${validName}失去电子时先失哪一能级？`]
      : ['能级交错规律怎么快速记忆？', '哪些常见元素存在洪特规则特例？', '过渡金属失电子时为什么先失 ns 电子？'];
    return { title, formula: sym === '—' ? '' : sym, module: 'electron', summary: cfg || '能级交错、洪特规则与泡利不相容原理', quickQuestions };
  }
  if (tabKey === 'battle') {
    return {
      title: '元素乱斗 · 周期律',
      formula: '',
      module: 'battle',
      summary: '原子半径、第一电离能、电负性与金属性/非金属性比较',
      quickQuestions: ['第一电离能为什么有 II A / V A 反常？', '同周期与同主族原子半径怎么比较？', '电负性差值如何影响化学键类型？'],
    };
  }
  if (tabKey === 'ai') {
    const secTitle = textOf(doc, '#panel-ai .ai-section:not([hidden]) > :not([hidden]) h3')
      || textOf(doc, '#panel-ai .ai-section:not([hidden]) h3')
      || textOf(doc, '#aiNavList .ai-nav-card.is-active .ai-nav-card-title')
      || textOf(doc, '#aiNavList .ai-nav-card.active')
      || '化学课堂';
    return {
      title: secTitle,
      formula: '',
      module: 'classroom',
      summary: `化学课堂 · ${secTitle}`,
      quickQuestions: [`「${secTitle}」最常考的核心结论是什么？`, `请结合「${secTitle}」举一道典型例题讲思路`, `「${secTitle}」有哪些常见易错辨析？`],
    };
  }
  return {
    title: '小黄的化学实验室',
    formula: '',
    module: tabKey || 'general',
    summary: '高中化学互动实验与结构可视化',
    quickQuestions: ['本节最容易考的核心结论是什么？', '如何从微观结构解释宏观性质？', '高考常见易错点有哪些？'],
  };
}

export function getActivePageContext(doc = typeof document !== 'undefined' ? document : null) {
  const activeTabEl = doc?.querySelector?.('.tab.active[data-tab]');
  const tabKey = activeTabEl?.dataset?.tab || activeTabEl?.getAttribute?.('data-tab') || 'table';
  const provider = providers.get(tabKey);
  if (provider) {
    try {
      const provided = provider();
      if (provided && typeof provided === 'object') return { tab: tabKey, ...provided };
    } catch { /* fallback to DOM introspection */ }
  }
  return { tab: tabKey, ...introspectTab(tabKey, doc) };
}

/**
 * 监听全站页面上下文变化：显式通知 + Tab 点击 + 关键 DOM 节点 MutationObserver（100ms 防抖）
 * @param {(reason?: string) => void} cb
 * @param {{ doc?: Document | null, debounceMs?: number, Observer?: typeof MutationObserver | null }} [opts]
 * @returns {() => void}
 */
export function observeActivePageChanges(cb, opts = {}) {
  if (typeof cb !== 'function') return () => {};
  const doc = opts.doc !== undefined ? opts.doc : (typeof document !== 'undefined' ? document : null);
  const debounceMs = typeof opts.debounceMs === 'number' ? opts.debounceMs : 100;
  const ObserverCtor = opts.Observer !== undefined
    ? opts.Observer
    : (typeof MutationObserver !== 'undefined' ? MutationObserver : null);

  let timer = 0;
  let disposed = false;

  const fireNow = (reason) => {
    if (disposed) return;
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    try { cb(reason); } catch { /* ignore observer callback errors */ }
  };

  const schedule = (reason) => {
    if (disposed) return;
    if (debounceMs <= 0) {
      if (typeof queueMicrotask === 'function') queueMicrotask(() => fireNow(reason));
      else fireNow(reason);
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = 0;
      fireNow(reason);
    }, debounceMs);
  };

  const offNotify = onPageContextChange((tabKey) => fireNow(tabKey || 'notify'));

  const onDocClick = (e) => {
    const tabBtn = e?.target?.closest?.('.tab[data-tab]');
    if (tabBtn) {
      schedule(`tab:${tabBtn.dataset?.tab || tabBtn.getAttribute?.('data-tab') || ''}`);
      return;
    }
    if (e?.target?.closest?.('#panel-molar')) schedule('molar:click');
  };
  const onMolarField = (e) => {
    if (e?.target?.closest?.('#panel-molar')) schedule('molar:input');
  };
  doc?.addEventListener?.('click', onDocClick, true);
  doc?.addEventListener?.('input', onMolarField, true);
  doc?.addEventListener?.('change', onMolarField, true);

  let observer = null;
  if (doc && ObserverCtor) {
    observer = new ObserverCtor(() => schedule('dom'));
    const observed = new Set();
    const watch = (el, config) => {
      if (!el || observed.has(el)) return;
      observed.add(el);
      try { observer.observe(el, config); } catch { /* ignore unsupported node */ }
    };

    for (const sel of TEXT_WATCH_SELECTORS) {
      watch(doc.querySelector?.(sel), { childList: true, subtree: true, characterData: true });
    }
    for (const sel of HIDDEN_WATCH_SELECTORS) {
      const nodes = doc.querySelectorAll?.(sel);
      if (nodes) {
        for (const el of nodes) watch(el, { attributes: true, attributeFilter: ['hidden'] });
      }
    }
    for (const sel of NAV_WATCH_SELECTORS) {
      watch(doc.querySelector?.(sel), { attributes: true, attributeFilter: ['class', 'aria-selected'], subtree: true, childList: true });
    }
  }

  return () => {
    disposed = true;
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    offNotify();
    doc?.removeEventListener?.('click', onDocClick, true);
    doc?.removeEventListener?.('input', onMolarField, true);
    doc?.removeEventListener?.('change', onMolarField, true);
    observer?.disconnect?.();
  };
}
