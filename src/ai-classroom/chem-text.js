/**
 * 将题库中的少量 LaTeX 化学式转换成安全的展示 HTML。
 * 原始题干不做改写；本模块只用于浏览器渲染。
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 去除可嵌套的 LaTex 包装命令，保留括号、上下标等内部公式内容。 */
function unwrapLatexCommandGroups(source, command) {
  const marker = `\\${command}`;
  let output = '';
  let cursor = 0;
  let changed = false;

  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) {
      output += source.slice(cursor);
      break;
    }
    let open = start + marker.length;
    while (/\s/.test(source[open] || '')) open += 1;
    if (source[open] !== '{') {
      output += source.slice(cursor, open);
      cursor = open;
      continue;
    }

    let depth = 1;
    let end = open + 1;
    while (end < source.length && depth > 0) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}') depth -= 1;
      end += 1;
    }
    if (depth !== 0) {
      output += source.slice(cursor);
      break;
    }
    output += source.slice(cursor, start) + source.slice(open + 1, end - 1);
    cursor = end;
    changed = true;
  }
  return changed ? output : source;
}

function readLatexGroup(source, open) {
  if (source[open] !== '{') return null;
  let depth = 1;
  let cursor = open + 1;
  while (cursor < source.length && depth > 0) {
    if (source[cursor] === '{') depth += 1;
    else if (source[cursor] === '}') depth -= 1;
    cursor += 1;
  }
  return depth === 0 ? { content: source.slice(open + 1, cursor - 1), end: cursor } : null;
}

/** 处理两个参数的 TeX 命令，例如 \frac{a}{b} 与 \stackrel{条件}{=}。 */
function replaceTwoGroupCommand(source, command, render) {
  const marker = `\\${command}`;
  let output = '';
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) return output + source.slice(cursor);
    let firstOpen = start + marker.length;
    while (/\s/.test(source[firstOpen] || '')) firstOpen += 1;
    const first = readLatexGroup(source, firstOpen);
    const second = first && readLatexGroup(source, first.end);
    if (!second) {
      output += source.slice(cursor, start + marker.length);
      cursor = start + marker.length;
      continue;
    }
    output += source.slice(cursor, start) + render(first.content, second.content);
    cursor = second.end;
  }
  return output;
}

function renderMath(source) {
  let html = escapeHtml(source)
    // ${ }_{1}^{3}\mathrm{H}$：质量数和质子数位于元素符号左侧。
    .replace(
      /\{\s*\}_\{([^{}]+)\}\^\{([^{}]+)\}\s*\\mathrm\{([^{}]+)\}/g,
      '<span class="chem-isotope"><sup>$2</sup><sub>$1</sub><span class="chem-isotope-symbol">$3</span></span>',
    );

  // 题源既有 \mathrm{Fe}_{3}，也有 \mathrm{Fe(OH)_{3}}；后者需要平衡花括号。
  for (let i = 0; i < 3; i += 1) {
    const before = html;
    html = unwrapLatexCommandGroups(unwrapLatexCommandGroups(html, 'mathrm'), 'text');
    if (html === before) break;
  }

  html = replaceTwoGroupCommand(html, 'frac', (numerator, denominator) => `(${numerator})/(${denominator})`);
  html = replaceTwoGroupCommand(html, 'stackrel', (annotation, operator) => `${operator}（${annotation.trim()}）`);

  // 题源中偶见 Fe^{3^{+}} 这类嵌套电荷写法，先扁平化再生成上标。
  for (let i = 0; i < 3; i += 1) {
    const before = html;
    html = html.replace(/\^\{([^{}]*)\^\{([^{}]*)\}\}/g, '^{$1$2}');
    if (html === before) break;
  }

  html = html
    .replace(/\\rightleftharpoons/g, '⇌')
    .replace(/\\leftrightarrow/g, '↔')
    .replace(/\\longrightarrow/g, '→')
    .replace(/\\rightarrow/g, '→')
    .replace(/\\left|\\right/g, '')
    .replace(/\\equiv/g, '≡')
    .replace(/\\,/g, ' ')
    .replace(/\\quad/g, ' ')
    .replace(/\\cdot/g, '·')
    .replace(/\\times/g, '×')
    .replace(/\\%/g, '%')
    .replace(/\\sim/g, '∼')
    .replace(/\\alpha/g, 'α')
    .replace(/\\chi/g, 'χ')
    .replace(/\\sigma/g, 'σ')
    .replace(/\\circ/g, '°')
    .replace(/\\uparrow/g, '↑')
    .replace(/\\downarrow/g, '↓')
    .replace(/\\Delta/g, 'Δ')
    // 表格单元格中常用此命令强制换行，例如 \\[0.3em]。
    .replace(/\\\\(?:\s*\[[^\]]*\])?/g, '<br>')
    // 这些是 TeX 排版空白，不属于公式文本。
    .replace(/~/g, ' ')
    .replace(/\\n/g, ' ')
    .replace(/\\\s/g, ' ')
    .replace(/\{\s*\}/g, '')
    .replace(/\\mathrm\s*\{([^{}]*)\}/g, '$1')
    .replace(/\\text\s*\{\s*([^{}]*?)\s*\}/g, '$1');

  // 题源内的上下标参数只会是纯文本；已在上方完成 HTML 转义。
  html = html
    .replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>')
    .replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>')
    .replace(/_([A-Za-z0-9])/g, '<sub>$1</sub>')
    .replace(/\^([A-Za-z0-9+\-])/g, '<sup>$1</sup>')
    .replace(/\s+/g, ' ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/\s*<br>\s*/g, '<br>')
    .replace(/(<\/(?:sub|sup|span)>)\s+(?=[A-Za-z0-9])/g, '$1');

  return html.replace(/\\([A-Za-z]+)/g, '$1');
}

function formatPlainText(value) {
  // 题源偶尔把 \% 等排版命令写在 $...$ 之外；仍按公式规则清洗即可。
  return String(value).includes('\\') ? renderMath(value) : escapeHtml(value);
}

/** 安全显示包含 $...$ 的题干或选项。 */
export function formatChemText(value) {
  // 少量原始题目漏写结尾 $；按分隔符奇偶处理，仍可正确展示该段公式。
  return String(value)
    .split('$')
    .map((part, index) =>
      index % 2 === 1
        ? `<span class="chem-math">${renderMath(part)}</span>`
        : formatPlainText(part),
    )
    .join('');
}

/** 题源保留 (A) 前缀，页面已渲染 A. 时仅在显示层去重。 */
export function formatChemOption(value) {
  return formatChemText(String(value).replace(/^\([A-D]\)\s*/, ''));
}

/**
 * 将题源中转换出的表格按白名单重建，防止题干 HTML 被转义，也不信任其中的属性。
 * 所有单元格内容仍走 formatChemText，保证公式、普通文本与 HTML 转义一致。
 */
function formatQuizTable(tableHtml) {
  const rows = [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)];
  if (!rows.length) return formatChemText(tableHtml);

  const renderedRows = rows.map((row) => {
    const cells = [...row[1].matchAll(/<(td|th)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)];
    if (!cells.length) return '';
    return `<tr>${cells.map((cell) => `<${cell[1].toLowerCase()}>${formatChemText(cell[2])}</${cell[1].toLowerCase()}>`).join('')}</tr>`;
  }).filter(Boolean);

  return renderedRows.length
    ? `<table class="quiz-table">${renderedRows.join('')}</table>`
    : formatChemText(tableHtml);
}

function formatArrayCell(value) {
  // array 表格里的说明文字通常使用 \text{...}，但不在 $...$ 内。
  const plain = String(value).replace(/\\text\s*\{\s*([^{}]*?)\s*\}/g, '$1');
  return formatChemText(plain);
}

/** 将题源中剩余的 LaTex array 白名单重建为同一套题目表格。 */
function formatLatexArray(arraySource) {
  const body = arraySource
    .replace(/^\\begin\{array\}\{[^}]*\}\s*/i, '')
    .replace(/\\end\{array\}\s*$/i, '')
    .replace(/\\hline\s*/gi, '');
  const rows = body
    .split(/\\\\\s*/)
    // AGIEval 的少量 JSONL 行把换行保留为字面量 \\n，而不是实际换行。
    .map(row => row.replace(/\\n/g, ' ').trim())
    .filter(Boolean)
    .map(row => row.split(/\s*&\s*/));

  if (!rows.length || rows.some(row => row.length < 2)) return formatChemText(arraySource);
  return `<table class="quiz-table">${rows.map((row, rowIndex) => {
    const tag = rowIndex === 0 ? 'th' : 'td';
    return `<tr>${row.map(cell => `<${tag}>${formatArrayCell(cell)}</${tag}>`).join('')}</tr>`;
  }).join('')}</table>`;
}

/**
 * 为紧凑预览截取题干，但永远不截断 $...$ 公式边界。
 * 表格在预览中以占位文字呈现，完整表格只在做题页显示。
 */
export function formatChemPreview(value, limit = 60) {
  const plain = String(value)
    .replace(/<table\b[^>]*>[\s\S]*?<\/table\s*>/gi, ' [表格题] ')
    .replace(/\\begin\{array\}\{[^}]*\}[\s\S]*?\\end\{array\}/gi, ' [表格题] ');
  const tokens = plain.split(/(\$[^$]*(?:\$|$))/g);
  let source = '';
  let length = 0;
  let truncated = false;

  for (const token of tokens) {
    if (!token) continue;
    if (length + token.length <= limit) {
      source += token;
      length += token.length;
      continue;
    }
    // 不展示被截断的公式，避免泄漏未闭合的 LaTex 语法。
    if (!token.startsWith('$') && limit > length) source += token.slice(0, limit - length);
    truncated = true;
    break;
  }
  return `${formatChemText(source)}${truncated ? '…' : ''}`;
}

/** 安全显示题干；内置表格会被重建，其余内容按普通文本/公式处理。 */
export function formatChemStem(value) {
  const source = String(value);
  const tablePattern = /<table\b[^>]*>[\s\S]*?<\/table\s*>|\\begin\{array\}\{[^}]*\}[\s\S]*?\\end\{array\}/gi;
  let output = '';
  let cursor = 0;
  let match;

  while ((match = tablePattern.exec(source))) {
    output += formatChemText(source.slice(cursor, match.index));
    output += match[0].startsWith('<') ? formatQuizTable(match[0]) : formatLatexArray(match[0]);
    cursor = match.index + match[0].length;
  }
  return output + formatChemText(source.slice(cursor));
}
