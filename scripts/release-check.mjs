/**
 * 发布与工程规范自动化检查
 *
 * 检查项：
 *   1. package.json 与 server/package.json 版本号一致
 *   2. electron/main.cjs（及递归本地 require）引用的本地文件全部显式列在 electron-builder.yml 的 files: 中
 *   3. 种子数据同步检查（labs-builtin.js 与 src/data/lab-scripts.js + lab-prestudy-config.js；offline-quiz-bank.json 单源完整）
 *   4. 后端 / electron / scripts JS 语法检查（node --check）
 *   5. 可选 --strict-git：检查工作区干净且 v<version> 标签无冲突（--require-tag 可强制要求 HEAD 已打标签）
 *
 * 用法：
 *   node scripts/release-check.mjs
 *   node scripts/release-check.mjs --syntax-only
 *   node scripts/release-check.mjs --strict-git
 *   node scripts/release-check.mjs --strict-git --require-tag
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(__dirname, '..');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  'dist-exe',
  '.electron-stage',
  'public',
  'data',
]);

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

/**
 * 1. 检查根目录 package.json 与 server/package.json 版本是否一致
 */
export function checkVersionSync(root = DEFAULT_ROOT) {
  const rootPkgPath = path.join(root, 'package.json');
  const serverPkgPath = path.join(root, 'server', 'package.json');

  if (!fs.existsSync(rootPkgPath)) {
    return {
      name: 'version-sync',
      ok: false,
      message: '缺少根目录 package.json',
      details: { rootVersion: null, serverVersion: null },
    };
  }
  if (!fs.existsSync(serverPkgPath)) {
    return {
      name: 'version-sync',
      ok: false,
      message: '缺少 server/package.json',
      details: { rootVersion: null, serverVersion: null },
    };
  }

  let rootPkg;
  let serverPkg;
  try {
    rootPkg = readJsonFile(rootPkgPath);
    serverPkg = readJsonFile(serverPkgPath);
  } catch (err) {
    return {
      name: 'version-sync',
      ok: false,
      message: `解析 package.json 失败: ${err.message}`,
      details: { rootVersion: null, serverVersion: null },
    };
  }

  const rootVersion = typeof rootPkg.version === 'string' ? rootPkg.version.trim() : '';
  const serverVersion = typeof serverPkg.version === 'string' ? serverPkg.version.trim() : '';

  if (!rootVersion || !serverVersion) {
    return {
      name: 'version-sync',
      ok: false,
      message: `版本号缺失（package.json=${rootVersion || '空'}, server/package.json=${serverVersion || '空'}）`,
      details: { rootVersion, serverVersion },
    };
  }

  if (rootVersion !== serverVersion) {
    return {
      name: 'version-sync',
      ok: false,
      message: `版本号不一致：package.json (${rootVersion}) !== server/package.json (${serverVersion})`,
      details: { rootVersion, serverVersion },
    };
  }

  return {
    name: 'version-sync',
    ok: true,
    message: `版本一致 (${rootVersion})`,
    details: { rootVersion, serverVersion },
  };
}

/**
 * 去除 JS 中的单行与多行注释（保留字符串字面量内容，避免 http:// 或注释误判）
 */
export function stripJsComments(source) {
  let out = '';
  let i = 0;
  const len = source.length;
  let quote = null;

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    if (quote) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += source[i + 1];
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }

    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }

    if (ch === '/' && next === '/') {
      i += 2;
      while (i < len && source[i] !== '\n') i += 1;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i += 1;
      }
      i += 2;
      continue;
    }

    out += ch;
    i += 1;
  }

  return out;
}

/**
 * 提取 JS 源码中静态的本地相对路径 require('./...') / require('../...')
 */
export function extractLocalRequires(source) {
  const cleaned = stripJsComments(source);
  const re = /\brequire\s*\(\s*(['"`])(\.\.?\/[^'"`]+)\1\s*\)/g;
  const found = [];
  let match;
  while ((match = re.exec(cleaned)) !== null) {
    found.push(match[2]);
  }
  return [...new Set(found)];
}

/**
 * 解析 electron-builder.yml 中顶层 `files:` 列表
 */
export function parseElectronBuilderFiles(ymlText) {
  const lines = ymlText.split(/\r?\n/);
  const files = [];
  let inFiles = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (!inFiles) {
      if (/^files\s*:/.test(rawLine)) {
        inFiles = true;
      }
      continue;
    }

    // 遇到新的顶层键（无缩进）则结束 files: 块
    if (!/^\s/.test(rawLine)) {
      break;
    }

    const itemMatch = rawLine.match(/^\s*-\s+(.+)$/);
    if (!itemMatch) continue;

    let value = itemMatch[1].trim();
    // 去掉未加引号时的行尾注释
    if (
      (value.startsWith('"') && value.includes('"', 1)) ||
      (value.startsWith("'") && value.includes("'", 1))
    ) {
      const q = value[0];
      value = value.slice(1, value.indexOf(q, 1));
    } else {
      const hashIdx = value.indexOf(' #');
      if (hashIdx >= 0) value = value.slice(0, hashIdx).trim();
    }

    value = value.replace(/\\/g, '/').replace(/^\.\//, '');
    if (value) files.push(value);
  }

  return files;
}

function resolveLocalModule(fromDir, specifier) {
  const base = path.resolve(fromDir, specifier);
  const candidates = [
    base,
    `${base}.cjs`,
    `${base}.js`,
    `${base}.json`,
    path.join(base, 'index.cjs'),
    path.join(base, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }
  return base;
}

/**
 * 2. 检查 electron/main.cjs 的本地 require 是否全部显式列在 electron-builder.yml 的 files: 中
 */
export function checkElectronBuilderFiles(root = DEFAULT_ROOT) {
  const entryAbs = path.join(root, 'electron', 'main.cjs');
  const ymlAbs = path.join(root, 'electron-builder.yml');

  if (!fs.existsSync(entryAbs)) {
    return {
      name: 'electron-builder-files',
      ok: false,
      message: '缺少 electron/main.cjs',
      details: { requiredFiles: [], declaredFiles: [], missingFromBuilder: ['electron/main.cjs'], missingOnDisk: ['electron/main.cjs'] },
    };
  }
  if (!fs.existsSync(ymlAbs)) {
    return {
      name: 'electron-builder-files',
      ok: false,
      message: '缺少 electron-builder.yml',
      details: { requiredFiles: [], declaredFiles: [], missingFromBuilder: [], missingOnDisk: ['electron-builder.yml'] },
    };
  }

  const declaredFiles = parseElectronBuilderFiles(fs.readFileSync(ymlAbs, 'utf8'));
  const declaredSet = new Set(declaredFiles);

  const requiredFiles = ['electron/main.cjs'];
  const missingOnDisk = [];
  const visited = new Set([entryAbs]);
  const queue = [entryAbs];

  while (queue.length > 0) {
    const currentAbs = queue.shift();
    if (!fs.existsSync(currentAbs)) continue;
    const src = fs.readFileSync(currentAbs, 'utf8');
    const specs = extractLocalRequires(src);

    for (const spec of specs) {
      const resolvedAbs = resolveLocalModule(path.dirname(currentAbs), spec);
      const rel = toPosix(path.relative(root, resolvedAbs));
      if (!requiredFiles.includes(rel)) {
        requiredFiles.push(rel);
      }
      if (!fs.existsSync(resolvedAbs)) {
        if (!missingOnDisk.includes(rel)) missingOnDisk.push(rel);
        continue;
      }
      // 递归检查 electron/ 目录下的本地模块依赖
      if (rel.startsWith('electron/') && /\.(cjs|js)$/.test(rel) && !visited.has(resolvedAbs)) {
        visited.add(resolvedAbs);
        queue.push(resolvedAbs);
      }
    }
  }

  const missingFromBuilder = requiredFiles.filter((rel) => !declaredSet.has(rel));

  for (const declared of declaredFiles) {
    if (declared.startsWith('!') || /[*?[\]{}]/.test(declared)) continue;
    const abs = path.join(root, declared);
    if (!fs.existsSync(abs) && !missingOnDisk.includes(declared)) {
      missingOnDisk.push(declared);
    }
  }

  const problems = [];
  if (missingFromBuilder.length > 0) {
    problems.push(`electron-builder.yml files: 遗漏本地 require 文件: ${missingFromBuilder.join(', ')}`);
  }
  if (missingOnDisk.length > 0) {
    problems.push(`以下文件不存在于磁盘: ${missingOnDisk.join(', ')}`);
  }

  if (problems.length > 0) {
    return {
      name: 'electron-builder-files',
      ok: false,
      message: problems.join('；'),
      details: { requiredFiles, declaredFiles, missingFromBuilder, missingOnDisk },
    };
  }

  return {
    name: 'electron-builder-files',
    ok: true,
    message: `Electron 本地依赖完整 (${requiredFiles.join(', ')})`,
    details: { requiredFiles, declaredFiles, missingFromBuilder, missingOnDisk },
  };
}

/**
 * 3. 检查种子数据一致性（labs-builtin.js + offline-quiz-bank.json）
 */
export async function checkSeedSync(root = DEFAULT_ROOT) {
  const issues = [];
  const details = { labsCount: 0, offlineQuizCount: 0 };

  // 3a. Labs seed: src/data/lab-scripts.js + lab-prestudy-config.js vs server/seed/labs-builtin.js
  const labScriptsPath = path.join(root, 'src', 'data', 'lab-scripts.js');
  const labPrestudyPath = path.join(root, 'src', 'data', 'lab-prestudy-config.js');
  const labsSeedPath = path.join(root, 'server', 'seed', 'labs-builtin.js');

  if (!fs.existsSync(labScriptsPath) || !fs.existsSync(labPrestudyPath) || !fs.existsSync(labsSeedPath)) {
    issues.push('缺少实验种子源文件或 server/seed/labs-builtin.js');
  } else {
    try {
      const bust = `?check=${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const { LAB_SCRIPTS } = await import(`${pathToFileURL(labScriptsPath).href}${bust}`);
      const { LAB_PRESTUDY_CONFIGS } = await import(`${pathToFileURL(labPrestudyPath).href}${bust}`);

      const expectedLabs = LAB_SCRIPTS.map((lab, i) => ({
        id: lab.id,
        title: lab.title,
        type: lab.type || '',
        equation: lab.equation || '',
        safety: lab.safety || '',
        phenomena: lab.phenomena || '',
        steps: lab.steps || [],
        prestudy: LAB_PRESTUDY_CONFIGS[lab.id] || null,
        sortOrder: i,
        source: 'builtin',
      }));

      const req = createRequire(import.meta.url);
      delete req.cache[req.resolve(labsSeedPath)];
      const { LABS_BUILTIN } = req(labsSeedPath);

      details.labsCount = expectedLabs.length;
      if (JSON.stringify(LABS_BUILTIN) !== JSON.stringify(expectedLabs)) {
        issues.push('server/seed/labs-builtin.js 与 src/data/lab-scripts.js 不同步，请运行 npm run sync:labs-seed');
      }
    } catch (err) {
      issues.push(`labs 种子校验出错: ${err.message}`);
    }
  }

  // 3b. Offline quiz bank single source of truth
  const offlineJsonPath = path.join(root, 'server', 'seed', 'offline-quiz-bank.json');
  const offlineCjsPath = path.join(root, 'server', 'seed', 'offline-quiz-bank.js');

  if (!fs.existsSync(offlineJsonPath)) {
    issues.push('缺少单源离线题库 server/seed/offline-quiz-bank.json');
  } else if (!fs.existsSync(offlineCjsPath)) {
    issues.push('缺少离线题库入口 server/seed/offline-quiz-bank.js');
  } else {
    try {
      const jsonQuestions = readJsonFile(offlineJsonPath);
      if (!Array.isArray(jsonQuestions) || jsonQuestions.length === 0) {
        issues.push('server/seed/offline-quiz-bank.json 必须是非空数组');
      } else {
        const req = createRequire(import.meta.url);
        delete req.cache[req.resolve(offlineJsonPath)];
        delete req.cache[req.resolve(offlineCjsPath)];
        const bank = req(offlineCjsPath);
        details.offlineQuizCount = jsonQuestions.length;
        if (!Array.isArray(bank.OFFLINE_QUESTIONS) || bank.OFFLINE_QUESTIONS.length !== jsonQuestions.length) {
          issues.push('server/seed/offline-quiz-bank.js 导出题数与 offline-quiz-bank.json 不一致');
        }
      }
    } catch (err) {
      issues.push(`离线题库校验出错: ${err.message}`);
    }
  }

  if (issues.length > 0) {
    return {
      name: 'seed-sync',
      ok: false,
      message: issues.join('；'),
      details: { ...details, issues },
    };
  }

  return {
    name: 'seed-sync',
    ok: true,
    message: `种子数据一致（labs=${details.labsCount}，offlineQuiz=${details.offlineQuizCount}）`,
    details,
  };
}

/**
 * 递归收集需要语法检查的 JS/CJS/MJS 文件
 */
export function collectJsFiles(root = DEFAULT_ROOT, dirs = ['server', 'electron', 'scripts']) {
  const files = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && /\.(?:js|cjs|mjs)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  for (const dir of dirs) {
    walk(path.join(root, dir));
  }

  return files.sort();
}

/**
 * 4. 对后端 / electron / scripts 的 JS 文件执行 `node --check` 语法检查
 */
export function checkSyntax(root = DEFAULT_ROOT, { dirs = ['server', 'electron', 'scripts'] } = {}) {
  const files = collectJsFiles(root, dirs);
  const failedFiles = [];

  for (const filePath of files) {
    const res = spawnSync(process.execPath, ['--check', filePath], {
      encoding: 'utf8',
    });
    if (res.status !== 0) {
      failedFiles.push({
        file: toPosix(path.relative(root, filePath)),
        error: (res.stderr || res.stdout || 'Syntax check failed').trim(),
      });
    }
  }

  if (failedFiles.length > 0) {
    return {
      name: 'syntax',
      ok: false,
      message: `语法检查失败 (${failedFiles.length}/${files.length}): ${failedFiles.map((f) => f.file).join(', ')}`,
      details: { checkedCount: files.length, failedFiles },
    };
  }

  return {
    name: 'syntax',
    ok: true,
    message: `语法检查通过 (${files.length} 个文件)`,
    details: { checkedCount: files.length, failedFiles: [] },
  };
}

/**
 * 5. 可选 Git 发布纪律检查（--strict-git）
 * - 工作区必须干净（无未提交/未跟踪文件）
 * - 若 v<version> 标签已存在，必须指向当前 HEAD（禁止复写旧标签）
 * - 若 requireTag=true，则要求 v<version> 标签已打在当前 HEAD
 */
export function checkGitReleaseState(root = DEFAULT_ROOT, { requireTag = false } = {}) {
  const statusRes = spawnSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (statusRes.status !== 0) {
    return {
      name: 'git-release',
      ok: false,
      message: `无法执行 git status: ${(statusRes.stderr || '').trim()}`,
      details: { clean: false, dirtyFiles: [] },
    };
  }

  const dirtyFiles = statusRes.stdout
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);

  if (dirtyFiles.length > 0) {
    return {
      name: 'git-release',
      ok: false,
      message: `Git 工作区不干净（${dirtyFiles.length} 项未提交/未跟踪变更）`,
      details: { clean: false, dirtyFiles },
    };
  }

  const pkg = readJsonFile(path.join(root, 'package.json'));
  const tagName = `v${pkg.version}`;

  const headRes = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  });
  const headSha = headRes.status === 0 ? headRes.stdout.trim() : '';

  const tagRes = spawnSync('git', ['rev-list', '-n', '1', `refs/tags/${tagName}`], {
    cwd: root,
    encoding: 'utf8',
  });
  const tagExists = tagRes.status === 0 && tagRes.stdout.trim().length > 0;
  const tagSha = tagExists ? tagRes.stdout.trim() : null;

  if (tagExists && tagSha !== headSha) {
    return {
      name: 'git-release',
      ok: false,
      message: `标签 ${tagName} 已存在于旧提交 (${tagSha.slice(0, 7)})，与当前 HEAD (${headSha.slice(0, 7)}) 不一致`,
      details: { clean: true, tagName, tagExists: true, tagMatchesHead: false, headSha, tagSha },
    };
  }

  if (requireTag && !tagExists) {
    return {
      name: 'git-release',
      ok: false,
      message: `尚未在 HEAD 打发布标签 ${tagName}`,
      details: { clean: true, tagName, tagExists: false, tagMatchesHead: false, headSha, tagSha: null },
    };
  }

  const note = tagExists
    ? `工作区干净，标签 ${tagName} 与 HEAD 一致`
    : `工作区干净，可准备打标签 ${tagName}`;

  return {
    name: 'git-release',
    ok: true,
    message: note,
    details: { clean: true, tagName, tagExists, tagMatchesHead: tagExists && tagSha === headSha, headSha, tagSha },
  };
}

/**
 * 执行完整发布检查或仅语法检查
 */
export async function runReleaseChecks(
  root = DEFAULT_ROOT,
  { strictGit = false, requireTag = false, syntaxOnly = false, syntaxDirs } = {},
) {
  const results = [];

  if (syntaxOnly) {
    results.push(checkSyntax(root, syntaxDirs ? { dirs: syntaxDirs } : undefined));
  } else {
    results.push(checkVersionSync(root));
    results.push(checkElectronBuilderFiles(root));
    results.push(await checkSeedSync(root));
    results.push(checkSyntax(root, syntaxDirs ? { dirs: syntaxDirs } : undefined));
    if (strictGit) {
      results.push(checkGitReleaseState(root, { requireTag }));
    }
  }

  const ok = results.every((r) => r.ok);
  return { ok, results };
}

export function formatReport({ ok, results }) {
  const lines = ['Release Check Report', '--------------------'];
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    lines.push(`${icon} [${r.name}] ${r.message}`);
    if (!r.ok && r.details?.failedFiles?.length) {
      for (const f of r.details.failedFiles) {
        lines.push(`    - ${f.file}: ${f.error.split(/\r?\n/)[0]}`);
      }
    }
  }
  const passed = results.filter((r) => r.ok).length;
  lines.push('--------------------');
  lines.push(ok ? `PASS (${passed}/${results.length})` : `FAIL (${passed}/${results.length} passed)`);
  return lines.join('\n');
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  const args = new Set(process.argv.slice(2));
  const strictGit = args.has('--strict-git');
  const requireTag = args.has('--require-tag');
  const syntaxOnly = args.has('--syntax-only');

  const report = await runReleaseChecks(DEFAULT_ROOT, {
    strictGit,
    requireTag,
    syntaxOnly,
  });
  console.log(formatReport(report));
  process.exit(report.ok ? 0 : 1);
}
