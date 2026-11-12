#!/usr/bin/env node
// build-client-compat.mjs —— rc.7 客户端包兼容注册器（页面端）
// ==========================================================================
// 背景（issue 实测 + 源码深挖定论）：页面插件的
// require("@deepseek-ai/dsh-client-web-react" / "-schema-form" /
// "-ui-attachment") 由页面端 client-modules 加载器解析，三个合法来源：
// seed 表（前端 vite 构建注入）/ 已物化模块 / 已注册 package factory。
// 页面**永远不读 node_modules**。rc.8 前端构建把这三个包从 seed 表删了
// （rc.7 seed 10 项 → rc.8 7 项），而大量伴随插件 client bundle 仍 require
// 它们 → "missed the module table" → 插件全灭、侧边栏消失。
// （Electron 0.4.1 正常是因为整棵栈 rc.7：其前端 dist 静态打包了它们。）
//
// 修复：走第三条合法通道——把 rc.7 包（来自 0.4.1 构建产物，字节级同源）
// 以 esbuild 打成单文件 CJS（--packages=external：相对文件内联、包依赖
// 外部化），再包成 factory 经 window.__ModuleLoader__.load() 注册进队列
// facade（rc.8 host 注入在 <head> 紧后，classic head script 必在其后执行；
// 队列/活体两模式 load() 都收敛，注册顺序无关）。
//
// 产物：payload 的 dsh-web-frontend/dist/assets/client-compat.js
//   + dist/index.html <head> 注入 <script src="/assets/client-compat.js">
// 用法：node dsh-tauri/scripts/build-client-compat.mjs（stage-payload.sh 内建调用）
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const RC7 = path.join(REPO, 'dsh-desktop', 'dist', 'win-unpacked', 'resources', 'app', 'node_modules');
const FE_DIST = path.join(
  REPO, 'dsh-tauri', 'pp',
  'node_modules', '@deepseek-ai', 'dsh-web-frontend', 'dist',
);

// rc.8/0.1.1-rc.1 seed 表全集（external require 命中 seed 的部分；closure 包
// 走各自的 load() 注册，两条路在页面端都合法）。C1 对 0.1.1-rc.1 复核：
// 种子函数仍为同 7 项（index-ClqxG24t.js），零漂移。
const RC8_SEED = new Set([
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]);

// 构建期种子守卫（C1 建议）：读当前 FE 主 bundle 文本，校验
//   a) 全部 seed 键名仍在 bundle 中（内核漏供某个 seed → 页面崩）；
//   b) ROOTS 两个 id 不在 bundle 中（进入图行/种子 → arrive() 跳过拉取，
//      预注册顶死图行条目 → invalid plugin 横幅）。
// 把未来 rc.2+ 的静默漂移变成构建错误。索引文件为 hash 命名，通配读取。
function assertSeedGuard() {
  const assetsDir = path.join(FE_DIST, 'assets');
  let idxName;
  try {
    idxName = fs.readdirSync(assetsDir).find((f) => /^index-[\w-]+\.js$/.test(f));
  } catch { /* payload 未就位时 stage-payload 流程会先镜像 —— 跳过守卫 */ }
  if (!idxName) {
    console.warn('[compat] 种子守卫：FE bundle 未找到（payload 未就位？），跳过');
    return;
  }
  const bundle = fs.readFileSync(path.join(assetsDir, idxName), 'utf8');
  // seed 键两种形态：带引号（scoped 名/含斜杠）或裸标识符对象键（react 等）。
  const seedIn = (k) => bundle.includes(JSON.stringify(k))
    || new RegExp(`[{,]\\s*${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(bundle);
  const missingSeed = [...RC8_SEED].filter((k) => !seedIn(k));
  if (missingSeed.length > 0) {
    throw new Error(`[compat] 种子守卫失败：FE bundle 缺失 seed 键 ${missingSeed.join(', ')} —— 内核 seed 表漂移，需人工复核 RC8_SEED 与 ROOTS`);
  }
  const collide = ROOTS.filter((id) => bundle.includes(`"${id}"`));
  if (collide.length > 0) {
    throw new Error(`[compat] 种子守卫失败：ROOTS 包 ${collide.join(', ')} 出现在 FE bundle（图行/种子回潮）—— 预注册将顶死图行条目，需从 ROOTS 移除或改锚`);
  }
  console.log(`[compat] 种子守卫通过：${idxName}（7 seed 键在位，ROOTS 零撞车）`);
}

// 根：rc.8 前端 seed 缺失且被插件 require 的包。**必须同时不在 rc.8 boot
// graph 行里**——arrive() 见 factories.has(id) 会跳过该行 bundle 拉取
// （client.js arrive()：loadCache/factories 命中即 resolve），预注册的
// rc.7 纯对象形态会顶死 rc.8 客户端插件条目 → 「invalid plugin, expect
// function or object with an "apply" method, received object」启动横幅
// （实测：ui-attachment 在 71 图行中，曾入 ROOTS 即触发该横幅；web-react/
// schema-form 无图行，安全）。graph 行原生供给的包一律不得入此清单。
const ROOTS = [
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-schema-form',
];

// web-react 增强导出（高级设置空白 issue #124 的纵深防御）：rc.8 的
// dsh-client-ui-renderer 只导出 apply/inject，插件回落链 require 本包时，
// 除 rc.7 原生导出（bindSnapshotSelector 等）外**补一个
// useSyncExternalStoreWithSelector 具名导出**——旧插件若直接从 web-react
// 解构该符号（不经 bindSnapshotSelector），兼容注册同样满足。实现：临时
// CJS 入口 re-export 原包全部导出 + 内联 use-sync-external-store/shim/
// with-selector（其 react 依赖走 external seed，包体本身内联进 bundle）。
const ENHANCED_ENTRY_SRC = {
  // ESM 入口 re-export 原包全部具名导出 + useSyncExternalStoreWithSelector。
  // 高级设置空白（issue #124）的纵深防御：rc.8 的 dsh-client-ui-renderer 只导出
  // apply/inject，插件回落到本包时若按新形态解构 useSyncExternalStoreWithSelector
  // （不经 bindSnapshotSelector），兼容注册同样满足。注意用 `export *`（具名
  // 直落 module.exports，与旧产物同形）而非 `export default`（esbuild CJS 会
  // 包成 module.exports.default，页面解构拿 undefined——Node 单测抓出）。
  // with-selector 直指 production 构建文件（相对依赖由 esbuild 内联）。
  '@deepseek-ai/dsh-client-web-react': () => `
export * from ${JSON.stringify(path.join(RC7, '@deepseek-ai', 'dsh-client-web-react', 'lib', 'index.js'))};
export { useSyncExternalStoreWithSelector } from ${JSON.stringify(path.join(RC7, 'use-sync-external-store', 'cjs', 'use-sync-external-store-shim', 'with-selector.production.min.js'))};
`,
};

// node 内建/危险模块黑名单（页面端不可用，出现即构建失败——防把内核侧
// 库意外拉进闭包）。


function pkgDir(id) { return path.join(RC7, ...id.split('/')); }
function readPkg(id) {
  return JSON.parse(fs.readFileSync(path.join(pkgDir(id), 'package.json'), 'utf8'));
}

// 闭包 BFS 仅供诊断输出与存在性校验；实际打包按根独立进行——闭包依赖
// **内联**进各根 bundle（--external 仅限 rc8 seed 7 项）。曾试
// --packages=external + 全闭包逐包注册：子路径 require
// （use-sync-external-store/shim/with-selector.js）会暴露给页面表且
// 匹配不到注册 id（Node harness 实测抓出）。内联后页面只见 3 个根 id。
const closureDiag = new Set();
{
  const q = [...ROOTS];
  while (q.length > 0) {
    const id = q.shift();
    if (closureDiag.has(id) || RC8_SEED.has(id)) continue;
    if (!fs.existsSync(path.join(RC7, ...id.split('/'), 'package.json'))) {
      throw new Error(`client-compat: 闭包包缺失 ${id}（0.4.1 构建产物不完整？重跑 dsh-desktop 打包）`);
    }
    closureDiag.add(id);
    for (const dep of Object.keys(readPkg(id).dependencies || {})) q.push(dep);
  }
}
console.log(`[compat] 依赖闭包（将内联）：${[...closureDiag].join(', ')}`);

// ---- 每根独立 esbuild：单文件 CJS，external 仅 rc8 seed ----
function bundleRoot(id) {
  let entry = path.join(pkgDir(id), readPkg(id).main || 'index.js');
  let entrySrc = null;
  if (ENHANCED_ENTRY_SRC[id]) {
    // 增强根：写临时 ESM 入口（re-export 原包 + 补强导出），esbuild 打它。
    entrySrc = ENHANCED_ENTRY_SRC[id]();
    entry = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-compat-')), 'entry.mjs');
    fs.writeFileSync(entry, entrySrc, 'utf8');
  }
  const extArgs = [...RC8_SEED].map((s) => `--external:${s}`).join(' ');
  // --define 把依赖链里 shim 入口的 `if (process.env.NODE_ENV === "production")`
  // 静态求值：production 分支保留、dev 块摇掉、**产物不再引用 process**。
  // 页面端没有 process——实测（Edge CDP）旧产物 factory 执行即抛
  // "process is not defined"，require('@deepseek-ai/dsh-client-web-react') 从未
  // 真正成功过（Agent 2 改 require renderer 优先后回落链才不再触发、无人发现）。
  const out = execSync(
    `npx --yes esbuild@0.25.0 ${JSON.stringify(entry)} --bundle --format=cjs --platform=node ${extArgs} --define:process.env.NODE_ENV=\\"production\\" --log-level=error`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const requires = [...out.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]);
  const bad = requires.filter((s) => !RC8_SEED.has(s));
  if (bad.length > 0) {
    throw new Error(`client-compat: ${id} 残留非 seed external ${bad.join(',')}（内联不彻底）`);
  }
  return out;
}

assertSeedGuard(); // rc.2+ 漂移 fail-fast（在 bundleRoot 产出前拦住）

const parts = [];
parts.push(
  '/* DSH Desktop client-compat：rc.7 客户端包兼容注册（自动生成，勿手改）。',
  ' * 机制见 dsh-tauri/scripts/build-client-compat.mjs 头注。 */',
  '(function(){',
  "'use strict';",
  'var L = window.__ModuleLoader__;',
  "if (L == null || typeof L.load !== 'function') { console.warn('[dsh-compat] __ModuleLoader__ 缺失，跳过'); return; }",
  'function wrap(cjsSource) {',
  '  return function (require) {',
  '    var module = { exports: {} };',
  '    new Function("require", "module", "exports", cjsSource)(require, module, module.exports);',
  '    return module.exports;',
  '  };',
  '}',
);
for (const id of ROOTS) {
  const src = bundleRoot(id);
  parts.push(`L.load({ id: ${JSON.stringify(id)}, factory: wrap(${JSON.stringify(src)}) });`);
  console.log(`[compat] + ${id}（${(src.length / 1024).toFixed(0)}KB，依赖已内联）`);
}
parts.push('})();');

const outFile = path.join(FE_DIST, 'assets', 'client-compat.js');
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, parts.join('\n'), 'utf8');

// ---- index.html 注入（<title> 后；host 的 facade 注在 <head> 紧后必先于本脚本）----
const idxFile = path.join(FE_DIST, 'index.html');
let html = fs.readFileSync(idxFile, 'utf8');
if (html.includes('client-compat.js')) {
  console.log('[compat] index.html 已注入，跳过');
} else {
  const TAG = '<script src="/assets/client-compat.js" defer></script>';
  if (html.includes('<title>')) {
    html = html.replace(/(<title>[^<]*<\/title>)/, `$1\n  ${TAG}`);
  } else {
    html = html.replace(/(<head[^>]*>)/, `$1\n  ${TAG}`);
  }
  fs.writeFileSync(idxFile, html, 'utf8');
  console.log('[compat] index.html 注入完成');
}
console.log(`[compat] 完成：${outFile}`);
