'use strict';

// ---------------------------------------------------------------------------
// plugin-core 静态高危扫描（scan）：只读静态木马模式扫描，绝不 require/执行
// 插件代码。plugin-guard 的体检与插件更新门禁共用本实现（消除复制漂移）。
//
// 模式面向「装完即失控」的常见木马形态，刻意保守以压低误报；命中只报告，
// 处置（确认/拒绝）由调用方决定（更新门禁=确认后继续/拒绝；体检=展示）。
//
// BEST-EFFORT DETECTION ONLY — NOT A SECURITY BOUNDARY. These are regex
// heuristics over decoded text: obfuscation, packing, binary-only payloads and
// files above the size caps evade them by design. Findings are advisory (they
// feed a confirm dialog / health report); they do not sandbox or block code.
// ---------------------------------------------------------------------------

const fs = require('node:fs');
const path = require('node:path');

const TROJAN_PATTERNS = [
  { code: 'TROJAN_REMOTE_EXEC', re: /(?:child_process|execSync|spawnSync|exec|spawn)\s*\(\s*['"`](?:curl|wget|powershell|cmd|bash|sh)\b[^'"`]*['"`][\s\S]{0,200}(?:\|\s*(?:sh|bash|iex|Invoke-Expression)|-enc\b)/i },
  { code: 'TROJAN_DOWNLOAD_EXEC', re: /(?:curl|wget|Invoke-WebRequest|Invoke-RestMethod|iwr)\b[\s\S]{0,160}?(?:\|\s*(?:sh|bash|iex|Invoke-Expression)\b|Out-File[\s\S]{0,80}\.(?:ps1|bat|cmd|vbs))/i },
  { code: 'TROJAN_BASE64_EVAL', re: /(?:eval|Function)\s*\(\s*(?:atob|Buffer\.from\([^)]*,\s*['"]base64['"]\)|window\.atob)\s*\(/i },
  { code: 'TROJAN_PERSISTENCE', re: /(?:reg(?:\.exe)?\s+add[\s\S]{0,120}(?:Run|RunOnce)|Startup[\\/][\w.-]+\.(?:bat|cmd|ps1|vbs|lnk)|schtasks\s+\/create|Register-ScheduledTask)/i },
  { code: 'TROJAN_EXFIL_ENV', re: /(?:process\.env|os\.env)[\s\S]{0,120}(?:https?:\/\/|fetch\s*\(|XMLHttpRequest|net\.connect|dgram)/i },
];

// Size caps: raised from 2MB/32MB so bundled plugin dists are covered. Still a
// best-effort bound — oversized files are skipped, never assumed clean.
const SCAN_MAX_FILE_BYTES = 4 * 1024 * 1024;   // per-file decode cap 4MB
const SCAN_MAX_TOTAL_BYTES = 64 * 1024 * 1024; // per-package budget 64MB
// Decodable extensions: JS/TS sources and bundles plus common native/script
// payload containers (.node/.dll/.wasm/.py/.vbs).
const SCAN_EXTS = /\.(c?js|mjs|cjs|jsx|ts|mts|cts|tsx|json|yml|yaml|sh|bash|zsh|ps1|bat|cmd|vbs|py|node|dll|wasm)$/i;
// Directories always skipped: VCS metadata and pnpm's content-addressed store
// (its entries are links to packages scanned where they really live). Other
// dot-directories are scanned instead of being discarded blindly.
const SCAN_SKIP_DIRS = new Set(['.git', '.pnpm']);

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

/**
 * 扫描一个目录树（包目录或 node_modules 根）。
 *
 * SYMLINK POLICY: links are never followed outside `root`. Each link target is
 * realpath-resolved and dropped unless it stays inside the root; in-root links
 * are followed (directories are walked once per real path, so cycles stop) and
 * the raw link target text is scanned too.
 *
 * @param {Object} opts
 * @param {string} opts.root            扫描根目录
 * @param {Set<string>} [opts.builtinNames] 内置分发包名集合（命中即跳过整个包）
 * @param {number} [opts.maxDepth]      目录深度上限（默认 4）
 * @param {number} [opts.maxFindings]   发现数上限（默认 20）
 * @param {string} [opts.labelOf]       相对路径展示函数（默认相对 root）
 * @param {boolean} [opts.skipDotDirs]  跳过 SCAN_SKIP_DIRS（.git / .pnpm，默认 true）
 * @returns {Array<{code:string, severity:'high', message:string, file:string}>}
 */
function scanDir(opts) {
  const {
    root,
    builtinNames = new Set(),
    maxDepth = 4,
    maxFindings = 20,
    labelOf = (p) => path.relative(root, p),
    skipDotDirs = true,
  } = opts;
  const findings = [];
  let total = 0;

  // Real path of the scanned root; links resolving outside it are refused.
  let rootReal = path.resolve(root);
  try { rootReal = fs.realpathSync(root); } catch { /* missing root -> walk() returns [] */ }

  const withinRoot = (real) => {
    const from = process.platform === 'win32' ? rootReal.toLowerCase() : rootReal;
    const to = process.platform === 'win32' ? real.toLowerCase() : real;
    const rel = path.relative(from, to);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  };

  // Report every matching pattern (no first-match break), up to maxFindings.
  const addFindings = (text, p) => {
    for (const { code, re } of TROJAN_PATTERNS) {
      if (findings.length >= maxFindings) return;
      if (re.test(text)) {
        findings.push({
          code,
          severity: 'high',
          message: `静态扫描命中高危模式（${code}）：${labelOf(p)}`,
          file: p,
        });
      }
    }
  };

  // Files already scanned, keyed by real path -> a file reached both directly
  // and through an in-root link is reported once.
  const visitedFiles = new Set();

  const scanFile = (p) => {
    let st;
    try { st = fs.statSync(p); } catch { return; }
    if (!st.isFile() || st.size > SCAN_MAX_FILE_BYTES || total + st.size > SCAN_MAX_TOTAL_BYTES) return;
    let key = p;
    try { key = fs.realpathSync(p); } catch { /* keep p as key */ }
    if (!withinRoot(key) || visitedFiles.has(key)) return; // never read outside root / no duplicates
    visitedFiles.add(key);
    total += st.size;
    let text;
    try { text = fs.readFileSync(p, 'utf8'); } catch { return; }
    addFindings(text, p);
  };

  // Directories already walked, keyed by real path -> symlink cycles terminate.
  const visitedDirs = new Set();

  const walk = (d, depth) => {
    if (depth > maxDepth || total > SCAN_MAX_TOTAL_BYTES || findings.length >= maxFindings) return;
    let dReal;
    try { dReal = fs.realpathSync(d); } catch { return; }
    if (!withinRoot(dReal) || visitedDirs.has(dReal)) return; // never leave root / no cycles
    visitedDirs.add(dReal);
    let entries;
    try { entries = fs.readdirSync(dReal, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (findings.length >= maxFindings) return;
      if (skipDotDirs && SCAN_SKIP_DIRS.has(e.name)) continue;
      const p = path.join(dReal, e.name);
      if (e.isSymbolicLink()) {
        // Scan the link target text, then follow only when the resolved target
        // stays inside the root (a link out of root is never followed).
        let linkTarget = '';
        try { linkTarget = fs.readlinkSync(p); } catch { continue; }
        addFindings(linkTarget, p);
        let targetReal;
        try { targetReal = fs.realpathSync(p); } catch { continue; } // broken link
        if (!withinRoot(targetReal)) continue;
        let st;
        try { st = fs.statSync(targetReal); } catch { continue; }
        if (st.isDirectory()) {
          const pkg = readJson(path.join(targetReal, 'package.json'), null);
          if (pkg && pkg.name && builtinNames.has(pkg.name)) continue; // 内置分发包不扫
          walk(targetReal, depth + 1);
        } else if (st.isFile() && (SCAN_EXTS.test(e.name) || SCAN_EXTS.test(path.basename(targetReal)))) {
          scanFile(p);
        }
      } else if (e.isDirectory()) {
        const pkg = readJson(path.join(p, 'package.json'), null);
        if (pkg && pkg.name && builtinNames.has(pkg.name)) continue; // 内置分发包不扫
        walk(p, depth + 1);
      } else if (e.isFile() && SCAN_EXTS.test(e.name)) {
        scanFile(p);
      }
    }
  };
  walk(root, 0);
  return findings;
}

module.exports = {
  TROJAN_PATTERNS,
  SCAN_MAX_FILE_BYTES,
  SCAN_MAX_TOTAL_BYTES,
  SCAN_EXTS,
  scanDir,
};
