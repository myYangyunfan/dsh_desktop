'use strict';

// ---------------------------------------------------------------------------
// 文档命令真实性判定（单一实现，供 unit-doc-command-truth 守卫与临时扫描共用）。
//
// 为什么需要：文档是对外契约。CONTRIBUTING.md 曾要求贡献者「在
// scripts/test/integration-runner.js 追加场景 + 跑 npm run test:integration」，
// dsh-desktop/README.md 曾教 `npm start` / `npm run dist` / `npm run electron:fetch`
// —— 这些文件与脚本在 Electron 壳下线（6ff0cc83 / 02981194）时一并消失了，
// 而照做的人只会得到 Missing script。代码改坏会有测试红，文档改坏没有任何守卫。
//
// 判据（三条，缺一条就会假阳性淹没有效信号，均为实测踩出来的）：
//   1. 只看「命令上下文」：栅栏 ``` 块内 + 行内反引号 `...` 内。散文里的
//      "published to npm registry" / "npm downloads" 一律不看。
//   2. 只认跑脚本的三种形态：`npm run X`、`npm test`、`npm start`（后两个是
//      npm 隐式脚本，等价于 npm run test|start）。
//   3. 否定语境豁免：文档经常需要说明「某命令已失效/不存在」，这种句子必须
//      豁免，否则守卫会在每一次记录退役信息时误报（本模块的 NEGATION 词表）。
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

/** 不纳入扫描的目录（工具缓存 / 历史 spec / 第三方 README / 构建产物）。 */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', 'package-payload', 'vendor', 'vendor-next',
  '.qoder', '.trae', '.zcode', 'research',
]);

/** 否定语境标记：出现即认为该命令是被「声明失效」，不是被「推荐使用」。
 *  词表故意窄：不带「删除 / 移除 / 关闭」这类动词——「npm run clean 会删除 dist」
 *  是正经推荐句，被豁免就等于守卫漏报（漏报比误报难发现得多）。 */
const NEGATION = [
  '没有', '不存在', '不再', '已下线', '已失效', '失效', '已移除', '已删除', '一并失效',
  'Missing script', 'no longer', 'not available', 'retired', 'deprecated',
];

const CMD_RE = /\bnpm\s+run\s+([A-Za-z][\w:.-]*)|\bnpm\s+(test|start)\b/g;

/**
 * 栅栏行（开或闭）。两种合法变体：顶格/缩进，以及引用块内嵌套栅栏（README
 * 的开发段就是这么写的）。`>` 后面必须允许空格 —— 早先写成 (?:>|...) 不带
 * \s*，导致 `> ```powershell` 不被识别为栅栏，引用块里的命令整体躲在守卫外。
 */
const FENCE_LINE_RE = /^\s*(?:>\s*|\/\*\s*)?(`{3,})\s*([A-Za-z0-9_+.-]*)/;

function isNegationLine(line) {
  return NEGATION.some((token) => line.includes(token));
}

/**
 * 逐行产出「命令候选 + 所在原始行」。栅栏内的行整体算候选；栅栏外的行只取
 * 行内反引号内容算候选。否定时永远看所在原始整行（不是候选串），否则“本包
 * 没有 `npm start` 脚本”这类记录句会被当作推荐句误报。
 * @returns {Array<{candidate:string, sourceLine:string}>}
 */
function lineCommandCandidates(text) {
  const out = [];
  let inFence = false;
  for (const raw of text.split(/\r?\n/)) {
    if (FENCE_LINE_RE.test(raw)) { inFence = !inFence; continue; }
    if (inFence) {
      out.push({ candidate: raw, sourceLine: raw });
      continue;
    }
    const inline = /`([^`\n]+)`/g;
    let m;
    while ((m = inline.exec(raw)) !== null) out.push({ candidate: m[1], sourceLine: raw });
  }
  return out;
}

/**
 * 判定一段 markdown 里写明、且归属于给定 scripts 集合的 npm 命令。
 * @param {string} text markdown 原文
 * @param {Set<string>|null} scripts 归属包 package.json 的 scripts 键集合；null = 无法判定
 * @returns {{missing: Array<{script:string, line:string}>, undecided: Array<string>}}
 */
function checkDocCommands(text, scripts) {
  const missing = [];
  const undecided = [];
  const seenMissing = new Set();
  const seenUndecided = new Set();
  for (const { candidate, sourceLine } of lineCommandCandidates(text)) {
    const line = candidate.trim();
    if (!line) continue;
    if (isNegationLine(sourceLine)) continue; // 「npm start 已随 Electron 壳下线」这类记录句
    CMD_RE.lastIndex = 0;
    let m;
    while ((m = CMD_RE.exec(line)) !== null) {
      const script = m[1] || m[2];
      if (!scripts) {
        if (!seenUndecided.has(script)) { seenUndecided.add(script); undecided.push(script); }
        continue;
      }
      if (!scripts.has(script) && !seenMissing.has(script)) {
        seenMissing.add(script);
        missing.push({ script, line: sourceLine.trim() });
      }
    }
  }
  return { missing, undecided };
}

/** 向上找最近的 package.json（归属包）。到顶找不到返回 null。 */
function findPackageJson(startDir, stopAt) {
  let d = path.resolve(startDir);
  for (;;) {
    const p = path.join(d, 'package.json');
    if (fs.existsSync(p)) return p;
    const up = path.dirname(d);
    if (up === d || d === path.resolve(stopAt)) return null;
    d = up;
  }
}

/** 读 package.json 的 scripts 键集合（解析失败返回空集，不抛）。 */
function readScriptNames(pkgPath) {
  try {
    const j = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    return new Set(Object.keys((j && j.scripts) || {}));
  } catch {
    return new Set();
  }
}

/** 仓库根 markdown 描述的是 dsh-desktop 包（仓库根本身没有 package.json）。 */
function resolveScripts(mdFile, repoRoot) {
  const dir = path.dirname(mdFile);
  const own = findPackageJson(dir, repoRoot);
  const pkgPath = own || path.join(repoRoot, 'dsh-desktop', 'package.json');
  if (!fs.existsSync(pkgPath)) return { pkgPath: null, scripts: null };
  return { pkgPath, scripts: readScriptNames(pkgPath) };
}

/** 递归收集待扫的 markdown（跳过 SKIP_DIRS、临时文件与 CHANGELOG 历史记录）。 */
function collectMarkdown(rootDir) {
  const found = [];
  (function walk(dir) {
    let names = [];
    try { names = fs.readdirSync(dir); } catch { return; }
    for (const n of names) {
      if (n.startsWith('.tmp')) continue;
      const full = path.join(dir, n);
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (SKIP_DIRS.has(n)) continue;
        walk(full);
      } else if (/\.md$/i.test(n) && !/CHANGELOG/i.test(n)) {
        found.push(full);
      }
    }
  })(rootDir);
  return found;
}

/** 全仓扫描：返回 [{ file, pkgPath, missing, undecided }]（仅含有问题的文件）。 */
function scanDocs(repoRoot) {
  const results = [];
  for (const file of collectMarkdown(repoRoot)) {
    const { pkgPath, scripts } = resolveScripts(file, repoRoot);
    const { missing, undecided } = checkDocCommands(fs.readFileSync(file, 'utf8'), scripts);
    if (missing.length || undecided.length) {
      results.push({ file: path.relative(repoRoot, file).replace(/\\/g, '/'), pkgPath, missing, undecided });
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// 代码块结构体检（与命令真值同一批文档、同一套扫描，故同住本模块）。
//
// 两条不变量都是从 dsh-desktop/docs/troubleshooting.md 的真实缺陷回过来的：
//   1. 要粘进终端执行的命令里混了排版引号（U+201C/U+201D）—— shell 把花引号
//      当文件名的一部分，照文档做的人必然 no such file or directory；
//   2. 把 ```lang 粘在 bullet 行尾 —— CommonMark 要求栅栏行首，粘行尾不是代码
//      块，而且会让后半篇的栅栏身份整体反向（人和工具一起看错）。
// ---------------------------------------------------------------------------

/** 会被用户直接粘贴执行的代码块语言（含无标注的裸 ```）。 */
const EXEC_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'powershell', 'ps', 'pwsh', 'cmd', 'batch', 'console']);
/** 排版引号与全角空格：出现在可执行块里就是「粘过去跑不通」。 */
const TYPOGRAPHIC = ['\u2018', '\u2019', '\u201C', '\u201D', '\uFF02', '\u3000'];

const FENCE_LINE_RE_STRUCT = FENCE_LINE_RE; // 同一个判据，结构体检与命令扫描必须同口径
const GLUED_FENCE_RE = /\S[^\n]*?\s+`{3,}\s*[A-Za-z0-9_+.-]*\s*$/;

/**
 * 体检一段 markdown 的代码块结构。
 * @returns {{fenceBalanced:boolean, execBlocks:number,
 *   typographic:Array<{line:number, ch:string, text:string}>,
 *   gluedFences:Array<{line:number, text:string}>}}
 */
function analyzeDocStructure(text) {
  const lines = text.split(/\r?\n/);
  let inFence = false;
  let lang = '';
  let execBlocks = 0;
  const typographic = [];
  const gluedFences = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const fence = FENCE_LINE_RE_STRUCT.exec(raw);
    if (!fence && GLUED_FENCE_RE.test(raw)) gluedFences.push({ line: i + 1, text: raw.trim() });
    if (fence) {
      if (!inFence) {
        inFence = true;
        lang = (fence[2] || '').toLowerCase();
        if (EXEC_LANGS.has(lang)) execBlocks += 1;
      } else {
        inFence = false;
        lang = '';
      }
      continue;
    }
    if (!inFence || !EXEC_LANGS.has(lang)) continue;
    if (/^\s*[#%]/.test(raw)) continue; // 块内注释行的引号不进命令，无害
    for (const q of TYPOGRAPHIC) {
      if (raw.includes(q)) {
        typographic.push({
          line: i + 1,
          ch: 'U+' + q.codePointAt(0).toString(16).toUpperCase(),
          text: raw.trim(),
        });
      }
    }
  }
  return { fenceBalanced: !inFence, execBlocks, typographic, gluedFences };
}

module.exports = {
  SKIP_DIRS,
  NEGATION,
  EXEC_LANGS,
  TYPOGRAPHIC,
  FENCE_LINE_RE,
  lineCommandCandidates,
  isNegationLine,
  checkDocCommands,
  findPackageJson,
  readScriptNames,
  resolveScripts,
  collectMarkdown,
  scanDocs,
  analyzeDocStructure,
};
