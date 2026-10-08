// 回归锁：发布出去的页内 bundle 里，每个 @deepseek-ai/* 裸标识符都必须能被官方
// 浏览器模块系统解析——要么在种子表里，要么由本包 dsh.client.external / inject 声明。
//
// 起因（dep-closure 的一类 error）：lib/client.js 的 bindSnapshotSelector 三级回落链里
// 曾留着第二级 require("@deepseek-ai/dsh-client-web-react")。这个名字在官方内核
// 0.1.7-rc.1 的 277 个 @deepseek-ai 包里不存在，浏览器模块系统对未知裸标识符一律
// throw，所以那一级永远进不去（异常又被空 catch 吞掉）——它不是崩溃，而是让 bundle
// 里混着一个无法解析的裸名。该 rung 已删除，这里把它和声明口径一起锁住。
//
// 判据直接取 tools/audit/dep-closure.js 导出的同一份实现（只读引用，不改门禁），
// 避免测试与门禁各写一套判据而漂移。
//
// 反证要求（仓库纪律）：判据被一项项拆掉时结论必须随之翻转，见下面 3 个反证用例。
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const depClosure = require(resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "tools", "audit", "dep-closure.js"));

const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(PKG_DIR, "..", "..");

/** 官方浏览器模块系统的种子表，直接取门禁里那份常量（同一事实源）。 */
const SEED_SOURCE = readFileSync(join(REPO_DIR, "tools", "audit", "dep-closure.js"), "utf8");
const SEED_NAMES = [...SEED_SOURCE.matchAll(/^\s*'((?:@deepseek-ai|react)[^']*)',$/gm)].map((m) => m[1]);

/** 页内 bundle 里的 @deepseek-ai 裸标识符（先剥注释，再按 require/from 形态抽）。 */
function bundleDeepseekSpecifiers(text) {
  return [...depClosure.specifiersIn(depClosure.stripComments(text))].filter((s) => s.startsWith("@deepseek-ai/"));
}

/** 能否解析：种子表命中，或按「全名 / 裸包名 / <裸包名>/client」任一形式声明过。 */
function resolvable(spec, declared) {
  const bare = depClosure.bareNameOf(spec);
  return SEED_NAMES.includes(bare) || SEED_NAMES.includes(spec)
    || [spec, bare, `${bare}/client`].some((c) => declared.has(c));
}

function load() {
  const bundle = readFileSync(join(PKG_DIR, "lib", "client.js"), "utf8");
  const manifest = JSON.parse(readFileSync(join(PKG_DIR, "package.json"), "utf8"));
  const client = (manifest.dsh && manifest.dsh.client) || {};
  const declared = new Set([...(client.external || []), ...(client.inject || [])]);
  return { bundle, declared };
}

test("种子表常量被门禁导出（前置条件，防止判据静默变空）", () => {
  assert.ok(SEED_NAMES.length >= 8, `没抓到种子表：${JSON.stringify(SEED_NAMES)}`);
  assert.ok(SEED_NAMES.includes("react/jsx-runtime"));
});

test("页内 bundle 的每个 @deepseek-ai 裸标识符都可解析（幽灵名不得回归）", () => {
  const { bundle, declared } = load();
  const unresolved = bundleDeepseekSpecifiers(bundle).filter((s) => !resolvable(s, declared));
  assert.deepEqual(unresolved, [], `client bundle 引用了模块系统解析不了的 @deepseek-ai 名：${unresolved.join(", ")}`);
});

test("幽灵名 dsh-client-web-react 不在发布物里，并对内核快照做存在性反证", () => {
  const { bundle } = load();
  assert.doesNotMatch(bundle, /dsh-client-web-react/, "幽灵回落 rung 又回来了");
  // 反证：这名字确实不是内核包（否则上一条断言就没有意义）；同时确认真包在快照里。
  const kernel = JSON.parse(readFileSync(join(REPO_DIR, "tools", "audit", "kernel-packages.json"), "utf8"));
  assert.ok(kernel.packages.includes("@deepseek-ai/dsh-client-ui-primitives"), "内核快照应含真实包 ui-primitives");
  assert.ok(!kernel.packages.includes("@deepseek-ai/dsh-client-web-react"), "内核快照不该含幽灵名 web-react");
});

test("回落链仍是两级（ui-renderer → react 原生），没被整段删掉", () => {
  const { bundle } = load();
  assert.match(bundle, /require\("@deepseek-ai\/dsh-client-ui-renderer"\)/, "第一级 ui-renderer 必须还在");
  assert.match(bundle, /const \{ useSyncExternalStore \} = require\("react"\)/, "最终兜底 react 原生 useSyncExternalStore 必须还在");
  assert.match(bundle, /if \(!bindSnapshotSelector\) \{/, "兜底守卫必须还在");
});

// ---- 反证：逐项拆判据，结论必须翻转，否则说明判据根本没起作用 ----

test("反证 A：往 bundle 文本里插一个未声明的 @deepseek-ai 名，必须判为不可解析", () => {
  const { bundle, declared } = load();
  const polluted = `${bundle}\nconst x = require("@deepseek-ai/dsh-client-not-a-real-package");\n`;
  const unresolved = bundleDeepseekSpecifiers(polluted).filter((s) => !resolvable(s, declared));
  assert.ok(unresolved.includes("@deepseek-ai/dsh-client-not-a-real-package"), "判据没起作用：幽灵名被放过了");
});

test("反证 B：清空 external/inject 声明，真实的 ui-renderer 引用必须变红", () => {
  const { bundle } = load();
  const unresolved = bundleDeepseekSpecifiers(bundle).filter((s) => !resolvable(s, new Set()));
  assert.ok(unresolved.includes("@deepseek-ai/dsh-client-ui-renderer"), "判据没起作用：没有任何引用依赖声明");
});

test("反证 C：同一个名字的三种声明形式，只有种子表与 external/inject 三条路能放行", () => {
  const spec = "@deepseek-ai/dsh-client-ui-renderer";
  assert.ok(!resolvable(spec, new Set()), "不声明时不可解析");
  assert.ok(resolvable(spec, new Set([spec])), "声明裸名后可解析");
  assert.ok(resolvable(spec, new Set([`${spec}/client`])), "声明 <pkg>/client 后可解析");
  assert.ok(resolvable(`${spec}/client`, new Set([spec])), "bundle 写子路径、声明写裸名也可解析");
  // 种子表这条路与声明无关：删光声明也必须放行
  assert.ok(resolvable("react/jsx-runtime", new Set()), "种子表模块不该依赖声明");
});
