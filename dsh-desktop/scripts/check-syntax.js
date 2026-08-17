'use strict';

// 构建前语法预检（prepack / predist 自动执行）。
// v0.3.8 事故：main.js 中 `async` 关键字与 function 声明被注释拆开，
// 打包出启动即抛 ReferenceError: async is not defined 的安装包。
// 该类问题 node --check 查不出来（孤立 async 是合法的表达式语句，
// 错误发生在运行时），因此本脚本额外做模式扫描。
// 检查范围与 electron-builder.yml 的 files 清单保持一致（入口 js）。

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const entryFiles = [
  'main.js',
  'preload.js',
  'updater.js',
  'client-updater.js',
  'balance.js',
  'session-watcher.js',
  'renderer-recovery.js',
  'wsl-backend.js',
  'watchdog.js',
  // 自愈 / 补丁模块（electron-builder files 清单内，随包分发，必须过语法门）。
  'profile-manifest.js',
  'profile-patch-heal.js',
  'profile-bundle-heal.js',
  // 统一补丁引擎与配套插件共享模块（main.js / 同步脚本 / after-pack 共用）。
  'scripts/lib/patch-io.js',
  'scripts/lib/patch-engine.js',
  'scripts/lib/companion-plugins.js',
  'scripts/lib/runtime-patches.js',
  'scripts/lib/companion-profile.js',
  'scripts/lib/versions.js',
  'scripts/patch-web-search-baseurl.js',
  'scripts/patch-menu-viewport.js',
  'scripts/patch-session-manage.js',
  'scripts/gpu-crash-guard.js',
  'scripts/install-minimal-win-preset.js',
  'scripts/patch-deps.js',
  'scripts/patch-pi-ai-credits.js',
  'scripts/sync-companion-plugins.js',
  'scripts/after-pack.js',
  'scripts/patch-portable-template.js',
  'scripts/plugin-manager-patch.js',
  'scripts/plugin-manager-update.js',
  'scripts/desktop-diagnostics.js',
  'scripts/desktop-backup.js',
  'scripts/desktop-ordering.js',
  'scripts/desktop-validity.js',
];

// 匹配「async/await 关键字与紧随其后的 function 声明之间被空行/注释行拆开」：
//   async // 注释…
//   // 更多注释…
//   function probeOverlayAgent() {}
// 孤立 async/await 表达式在运行时会抛 ReferenceError，必须在打包前拦截。
const DETACHED_KEYWORD = /^[ \t]*(async|await)[ \t]*(?:\/\/[^\r\n]*)?[ \t]*\r?\n(?:[ \t]*(?:\/\/[^\r\n]*)?[ \t]*\r?\n)*[ \t]*function\b/gm;

/**
 * 把字符串/模板字面量与注释替换为等长空白（保留换行以维持行号），
 * 只让 DETACHED_KEYWORD 扫描真实代码区（issue #75：模板字符串/块注释里的
 * 示例文本——如 `const doc = \`\nasync\nfunction foo() {}\n\`;`——曾触发
 * 打包门禁假阳性）。模板内 `${...}` 表达式区同样视为模板内容：与
 * node --check 的解析边界一致，文档字符串不应拦截打包；表达式区内嵌
 * 模板的极端形态有极小漏报可能，但事故形态（顶层 async 拆行）不受影响。
 */
function stripLiteralsAndComments(text) {
  const out = text.split('');
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (ch === "'" || ch === '"') {
      const quote = ch;
      const start = i;
      i++;
      let closed = false;
      while (i < n) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === quote) { i++; closed = true; break; }
        i++;
      }
      if (closed) {
        for (let j = start; j < i; j++) {
          if (text[j] !== '\n' && text[j] !== '\r') out[j] = ' ';
        }
      }
      continue;
    }
    if (ch === '`') {
      const start = i;
      i++;
      let closed = false;
      while (i < n) {
        if (text[i] === '\\') { i += 2; continue; }
        if (text[i] === '`') { i++; closed = true; break; }
        if (text[i] === '$' && text[i + 1] === '{') {
          // 跳过内嵌表达式区：花括号配对，引号/模板内的字符不参与配对
          let depth = 1;
          i += 2;
          while (i < n && depth > 0) {
            const c = text[i];
            if (c === '{') depth++;
            else if (c === '}') depth--;
            else if (c === "'" || c === '"' || c === '`') {
              const q = c;
              i++;
              while (i < n && text[i] !== q) {
                if (text[i] === '\\') i++;
                i++;
              }
            }
            i++;
          }
          continue;
        }
        i++;
      }
      if (closed) {
        for (let j = start; j < i; j++) {
          if (text[j] !== '\n' && text[j] !== '\r') out[j] = ' ';
        }
      }
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < n && text[i] !== '\n') { out[i] = ' '; i++; }
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const start = i;
      out[start] = ' ';
      out[start + 1] = ' ';
      i += 2;
      while (i < n) {
        if (text[i] === '*' && text[i + 1] === '/') {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
          break;
        }
        if (text[i] !== '\n' && text[i] !== '\r') out[i] = ' ';
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

function detachedHits(text) {
  const hits = [];
  let match;
  const cleaned = stripLiteralsAndComments(text);
  DETACHED_KEYWORD.lastIndex = 0;
  while ((match = DETACHED_KEYWORD.exec(cleaned)) !== null) {
    const upTo = text.slice(0, match.index);
    hits.push({ keyword: match[1], line: upTo.split(/\r?\n/).length });
  }
  return hits;
}

const missing = entryFiles.filter((f) => !fs.existsSync(path.join(root, f)));
if (missing.length) {
  console.error('[check-syntax] 缺少入口文件: ' + missing.join(', '));
  process.exit(1);
}

let failed = 0;
for (const file of entryFiles) {
  const filePath = path.join(root, file);
  const result = spawnSync(process.execPath, ['--check', filePath], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    failed++;
    console.error(`[check-syntax] FAIL ${file}（node --check）`);
    if (result.stderr) console.error(result.stderr.trim());
    continue;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const hits = detachedHits(text);
  if (hits.length > 0) {
    failed++;
    console.error(`[check-syntax] FAIL ${file}（疑似 async/await 关键字与声明被拆开）`);
    for (const hit of hits) {
      console.error(`  行 ${hit.line}: 孤立的 ${hit.keyword} 后跟 function 声明，运行时会抛 ReferenceError`);
    }
    continue;
  }
  console.log(`[check-syntax] ok   ${file}`);
}

if (failed > 0) {
  console.error(`[check-syntax] ${failed} 个文件未通过，终止打包。`);
  process.exit(1);
}
console.log('[check-syntax] 全部入口文件语法检查通过。');
