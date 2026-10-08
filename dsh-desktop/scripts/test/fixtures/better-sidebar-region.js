'use strict';

// better-sidebar-region.js — dsh-better-sidebar 发行产物的「源区段」取数夹具。
//
// 为什么需要它：0.24.1 起上游构建（tsdown + tsconfig.build.json 只
// emitDeclarationOnly）不再产出逐文件的 `lib/<name>.js` 编译镜像，纯函数只活在
// 两份 bundle 本体里。tsdown 会原样保留 `//#region <源路径>` … `//#endregion`
// 定界且不压缩，所以能把自包含模块（纯函数 + 字面量表，零 import）从产物里切片、
// 在 vm 中求值——测的就是随包交付的那份字节，而不是另一条编译链的副本。
//
// 定界唯一性在这里断言：同一区段出现两次 = 同一份逻辑被打了两遍（双实现漂移前兆）。
//
// 用方：unit-better-sidebar-chunk-retry / ta2-pressure / ta10-time-window-matrix /
// ta13-soak-chunk-availability。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PLUGIN_DIR = path.join(__dirname, '..', '..', '..', 'assets', 'plugins', 'dsh-better-sidebar');

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 取 bundle 里某个源文件区段的原文。
 * @param {string} bundlePath 产物绝对路径（lib/client.js 等）
 * @param {string} sourceFile 区段路径字样，如 'src/client/chunk-availability.ts'
 * @returns {string} 区段原文（不含定界行）
 */
function extractRegion(bundlePath, sourceFile) {
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  // 只认行首定界：区段的头注释里会原样引用这段路径字样，按子串数会重影。
  const head = new RegExp(`^[ \\t]*\\/\\/#region ${escapeRe(sourceFile)}$`, 'gm');
  const markers = bundle.match(head) || [];
  assert.equal(markers.length, 1, `${path.basename(bundlePath)}: ${sourceFile} 区段定界应唯一，实得 ${markers.length}`);
  const first = new RegExp(`^[ \\t]*\\/\\/#region ${escapeRe(sourceFile)}$`, 'm');
  const headMatch = bundle.match(first);
  const rest = bundle.slice(headMatch.index + headMatch[0].length);
  const tail = rest.search(/\n[ \t]*\/\/\#endregion/);
  assert.ok(tail !== -1, `${path.basename(bundlePath)}: ${sourceFile} 区段应有 //#endregion 收尾`);
  return rest.slice(0, tail);
}

/**
 * 物化 chunk-availability 区段，交回其导出符号。
 *
 * 两种 realm：
 *   · 默认在**新上下文**里求值，返回的 `sandbox` 即模块内的 `globalThis`
 *     —— `isModuleSystemAvailable()` 的缺省参数探测用例要往它上面挂全局；
 *   · `sameRealm: true` 在当前 realm 里求值（IIFE 包裹，不污染 global），
 *     与被删掉的 ESM 逐文件镜像 `lib/chunk-availability.js` 同 realm：
 *     微任务排队步数与真产物一致。soak/压测按「N 个 await 刷完一轮」计数，
 *     跨 realm 会让 attemptLoad 的宿主 Promise 多走一跳，所以它们走这条路。
 *
 * @param {object} [options]
 * @param {object} [options.globals] 追加注入的沙箱全局（仅默认 realm 有意义）
 * @param {boolean} [options.sameRealm] 在当前 realm 求值
 */
function loadChunkAvailability(options) {
  const { globals, sameRealm = false } = options || {};
  const region = extractRegion(path.join(PLUGIN_DIR, 'lib', 'client.js'), 'src/client/chunk-availability.ts');
  const exportsExpr = '({ CHUNK_RETRY_BASE_DELAY_MS, CHUNK_RETRY_MAX_DELAY_MS, nextDelayMs,'
    + ' isModuleSystemAvailable, moduleSystemUnavailableMessage, createChunkRetryLoop })';
  if (sameRealm) {
    // `return` 与表达式必须同行：换行会被 ASI 补成分号，返回 undefined。
    const made = vm.runInThisContext(`(() => {${region}\nreturn ${exportsExpr};})()`, {
      filename: 'client.js#chunk-availability',
    });
    return assertChunkSymbols(made);
  }
  const sandbox = { console, setTimeout, clearTimeout, AbortSignal, ...(globals || {}) };
  const made = vm.runInNewContext(
    region + '\n' + exportsExpr,
    vm.createContext(sandbox),
    { filename: 'client.js#chunk-availability' },
  );
  // 对象跨 realm：归一成本 realm 的函数引用不影响调用，但断言栈更干净。
  return { ...assertChunkSymbols(made), sandbox };
}

function assertChunkSymbols(made) {
  for (const key of ['nextDelayMs', 'isModuleSystemAvailable', 'moduleSystemUnavailableMessage', 'createChunkRetryLoop']) {
    assert.equal(typeof made[key], 'function', `chunk-availability 区段应含 ${key}`);
  }
  return made;
}

/**
 * 通用区段取符号：在沙箱里物化某个（或按依赖顺序某几个）源文件区段，按名单交回
 * 导出，并把结果做 JSON 往返归一（vm 里的对象属另一个 realm，deepEqual 直接比会假红）。
 * 只适用于**纯函数模块**（零 import，或值 import 只被未调用的函数体引用——
 * 区段里的裸标识符在沙箱里是未定义全局，只有真去调用才 ReferenceError，
 * 所以 change-tree.ts 需要把它依赖的 git-status.ts 区段一并拼进同一上下文）。
 *
 * @param {string} bundleRel 产物相对路径（'client.js' / 'client-editor.js'）
 * @param {string | string[]} sourceFile 区段路径字样（如 'src/client/diff/rows.ts'）
 * @param {string[]} symbols 要交回的导出名
 * @param {object} [globals] 追加注入的沙箱全局
 */
function loadRegionSymbols(bundleRel, sourceFile, symbols, globals) {
  const files = Array.isArray(sourceFile) ? sourceFile : [sourceFile];
  const region = files.map((file) => extractRegion(path.join(PLUGIN_DIR, 'lib', bundleRel), file)).join('\n');
  for (const name of symbols) {
    const owners = files.filter((file) => hasSymbol(extractRegion(path.join(PLUGIN_DIR, 'lib', bundleRel), file), name));
    assert.ok(owners.length > 0, `${bundleRel} 的 ${files.join(' + ')} 区段里没有 ${name}`);
  }
  const sandbox = { console, setTimeout, clearTimeout, AbortSignal, ...(globals || {}) };
  const made = vm.runInNewContext(
    `${region}\n({ ${symbols.join(', ')} })`,
    vm.createContext(sandbox),
    { filename: `${bundleRel}#${files.join('+')}` },
  );
  return {
    ...Object.fromEntries(symbols.map((name) => [name, made[name]])),
    /** 跨 realm 结果归一：把 vm 里的对象/数组复制成本 realm 的 plain 值。 */
    plain(value) { return JSON.parse(JSON.stringify(value)); },
  };
}

function hasSymbol(region, name) {
  return new RegExp(`(function ${name}|const ${name}|class ${name})\\b`).test(region);
}

/**
 * 区段的顶层声明名集合（src ↔ 产物同源护栏用）。
 * tsdown 给区段整体补缩进，所以基准层取首个非空行的缩进，只收该层声明——
 * 函数体内部的 const/let 不算模块符号。
 *
 * @param {string} bundleRel 产物相对路径
 * @param {string} sourceFile 区段路径字样
 * @returns {string[]} 顶层 function/const/let/class 的名字（按出现顺序）
 */
function regionTopLevelNames(bundleRel, sourceFile) {
  const region = extractRegion(path.join(PLUGIN_DIR, 'lib', bundleRel), sourceFile);
  const first = region.split('\n').find((line) => line.trim() !== '');
  const indent = /^[ \t]*/.exec(first === undefined ? '' : first)[0];
  return topLevelNames(region, indent);
}

/**
 * 源文件的顶层声明名集合：`export function x` / `export const x` / 未导出的
 * `function x` 都收（与区段侧同一口径），类型声明（interface/type）不收——
 * 它们编译后不存在。
 *
 * @param {string} srcRel 插件内源文件相对路径（'src/client/diff/rows.ts'）
 * @returns {string[]} 顶层声明名
 */
function srcTopLevelNames(srcRel) {
  return topLevelNames(fs.readFileSync(path.join(PLUGIN_DIR, srcRel), 'utf8'), '');
}

function topLevelNames(text, indent) {
  const esc = indent.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `^${esc}(?:export\\s+)?(?:declare\\s+)?(?:async\\s+function|function|const|let|class)\\s+([A-Za-z_$][\\w$]*)`,
    'gm',
  );
  const out = [];
  for (const match of text.matchAll(re)) if (!out.includes(match[1])) out.push(match[1]);
  return out;
}

module.exports = {
  PLUGIN_DIR,
  extractRegion,
  loadChunkAvailability,
  loadRegionSymbols,
  regionTopLevelNames,
  srcTopLevelNames,
};
