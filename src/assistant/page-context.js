/**
 * 随堂小黄页面上下文注册与自动探测（跨 Tab 冻结契约）
 * 各模块可通过 registerPageAssistant 注入精确上下文与 3D 联动回调；
 * 未注册或返回 null 时自动回退到 DOM 探测，确保全站 7 个 Tab 均可用。
 */

const providers = new Map();
const listeners = new Set();

function textOf(doc, sel) {
  return doc?.querySelector?.(sel)?.textContent?.replace(/\s+/g, ' ').trim() || '';
}

function valOf(doc, sel) {
  return String(doc?.querySelector?.(sel)?.value || '').trim();
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
    const title = textOf(doc, '#elementDetail .detail-head h2') || '元素周期表';
    const formula = textOf(doc, '#elementDetail .detail-badge');
    const summary = textOf(doc, '#elementDetail .detail-teach p') || '元素周期律与分区规律';
    return { title, formula, module: 'table', summary, quickQuestions: ['该元素常见化合价与代表物？', '同周期/同主族性质如何递变？', '考试常见易错点有哪些？'] };
  }
  if (tabKey === 'molecule') {
    const title = textOf(doc, '#moleculeTitle') || textOf(doc, '#molTitle') || '3D 分子结构';
    const summary = textOf(doc, '#moleculeDesc') || '共价分子空间构型与极性';
    return { title: title === '—' ? '3D 分子结构' : title, formula: '', module: 'molecule', summary, quickQuestions: ['中心原子杂化类型和空间构型？', '该分子是极性分子还是非极性分子？', '有哪些常见典型反应？'] };
  }
  if (tabKey === 'crystal') {
    return { title: textOf(doc, '.crystal-stage-title') || '3D 晶胞结构库', formula: '', module: 'library', summary: '晶体微粒排布、均摊法、配位数与密度计算', quickQuestions: ['这个晶胞里各微粒怎么用均摊法数？', '配位数和最短距离公式是什么？', '高考常考哪些变式？'] };
  }
  if (tabKey === 'molar') {
    const heading = textOf(doc, '#panel-molar .molar-section:not([hidden]) h3') || '化学计算';
    const expr = valOf(doc, '#panel-molar .molar-section:not([hidden]) input, #panel-molar .molar-section:not([hidden]) textarea');
    return { title: heading, formula: expr.slice(0, 40), module: 'molar', summary: expr ? `${heading}：${expr}` : '摩尔质量、方程式配平与化学计量', quickQuestions: ['这步计算最容易在哪出错？', '配平/计量核心思路是什么？', '怎么快速验算结果？'] };
  }
  if (tabKey === 'electron') {
    const name = textOf(doc, '#electronName');
    const sym = textOf(doc, '#electronSymbol');
    const cfg = textOf(doc, '#electronConfig');
    return { title: name && name !== '选择左侧元素查看' ? `${name} 电子排布` : '原子核外电子排布', formula: sym === '—' ? '' : sym, module: 'electron', summary: cfg || '能级交错、洪特规则与泡利不相容原理', quickQuestions: ['该原子的价层电子排布特点？', '存在洪特规则特例吗？', '失去电子时先失哪一能级？'] };
  }
  if (tabKey === 'battle') {
    return { title: '元素乱斗 · 周期律', formula: '', module: 'battle', summary: '原子半径、第一电离能、电负性与金属性/非金属性比较', quickQuestions: ['第一电离能为什么有 II A / V A 反常？', '同周期与同主族半径怎么比？', '电负性大小如何影响键极性？'] };
  }
  if (tabKey === 'ai') {
    const secTitle = textOf(doc, '#panel-ai .ai-section:not([hidden]) h3') || textOf(doc, '#aiNavList .ai-nav-card.active') || '化学课堂';
    return { title: secTitle, formula: '', module: 'classroom', summary: `化学课堂 · ${secTitle}`, quickQuestions: ['本节最容易考的核心结论是什么？', '请举一道典型例题讲清思路', '高考常见易错点有哪些？'] };
  }
  return { title: '小黄的化学实验室', formula: '', module: tabKey || 'general', summary: '高中化学互动实验与结构可视化' };
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
