'use strict';
// 内置插件的**工具名合规守卫**（node --test）。
//
// 背景：模型 API 校验函数名必须匹配 `^[a-zA-Z0-9_-]+$`，带点的名字会把**整个请求**打成
// 400，用户看到的是「本轮运行失败」+ 会话直接发不出消息：
//   Invalid 'tools[0].name': string does not match pattern.
//   Expected a string that matches the pattern '^[a-zA-Z0-9_-]+$'.
// 这不是「某个工具调用失败」，是这一轮连请求都发不出去。
//
// 本仓库的 provider（dsh-llm-deepseek / dsh-llm-pi-ai）有一层 fork 补丁会在出口把非法
// 字符换成 `_`、回程再还原（`__dshDsWireName` / `__dshPiWireToolName`）——**那只是创可贴**：
//   ① 只覆盖这两个模块、这两条已知路径，别的 dsh 构建（npm 全局装的官方包）没有；
//   ② 别的 API 形状不覆盖：历史日志里报的是 `tools[N].function.name`，而用户最近一次报的是
//      `tools[0].name`，形状不同，说明补丁没盖住那条路；
//   ③ 名字本身仍然非法，任何一层没走到补丁就原样发出去。
// 所以真正的修法是**源头就用合法名字**。这条守卫盯住源头：扫所有内置插件的
// `contributes.tools` 与源码里的工具注册字面量，出现非法字符就红。
//
// 历史：cardian 插件因此报错过 8 次（2026-08-29 ×6、09-02 ×1，日志见 ~/.dsh/synapse）。
// 它的 36 个工具名仍是带点写法（vendored 上游包，改名会动它的公开工具面），
// 所以这里用**棘轮**：允许清单里记着当前已知数量，数量只能减不能增。
//
// 用法：node --test scripts/test/unit-plugin-tool-names.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const PLUGINS = path.join(REPO, 'assets', 'plugins');

/** 模型 API 对函数名的硬要求（错误信息里逐字给出的那个模式）。 */
const TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]+$/;

/**
 * 已知的违规存量（棘轮）：插件名 → 允许出现的非法工具名个数。
 * 只能往下减：修完一个就把数字调小，别往上加。
 *
 * 目前是空的 —— 2026-09-19 把 dsh-cardian 的 36 个 `cardian.*` 工具名全部改成
 * `cardian_*` 之后，全部内置插件的工具名都合规了。以后若真需要临时容忍，再往这里加。
 */
const KNOWN_OFFENDERS = {};

/** 递归收集插件目录下的源码文件（跳过 node_modules / test / 产物目录）。 */
function sourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'test' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(js|mjs|cjs|ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

/**
 * 从源码里抠出工具注册用的字面量名字。
 * 覆盖本仓库实际存在的两种写法：
 *   register(ctx, 'cardian.status', { … })      /  register(ctx, 'view_image', { … })
 *   ctx.tools.register({ name: 'view_image', … })
 */
function registeredNames(source) {
  const names = [];
  for (const m of source.matchAll(/register\(\s*[A-Za-z_$][\w$]*\s*,\s*'([^']+)'/g)) names.push(m[1]);
  for (const m of source.matchAll(/tools\.register\(\{[\s\S]{0,400}?name:\s*'([^']+)'/g)) names.push(m[1]);
  return names;
}

/** 插件目录 → { declared, source } 两类名字。 */
function collect() {
  const report = new Map();
  for (const entry of fs.readdirSync(PLUGINS, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(PLUGINS, entry.name);
    const manifestPath = path.join(dir, 'dsh.plugin.json');
    const declared = [];
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      for (const name of manifest.contributes?.tools ?? []) declared.push(name);
    }
    const source = [];
    for (const file of sourceFiles(dir)) {
      for (const name of registeredNames(fs.readFileSync(file, 'utf8'))) source.push({ name, file: path.relative(REPO, file) });
    }
    if (declared.length === 0 && source.length === 0) continue;
    report.set(entry.name, { declared, source });
  }
  return report;
}

test('内置插件声明的工具名必须匹配 ^[a-zA-Z0-9_-]+$', () => {
  const offenders = [];
  for (const [plugin, { declared }] of collect()) {
    for (const name of declared) if (!TOOL_NAME_PATTERN.test(name)) offenders.push(`${plugin}: contributes.tools 里的 ${name}`);
  }
  assert.deepEqual(offenders, [], `工具名带非法字符（模型 API 会 400）：\n${offenders.join('\n')}`);
});

test('内置插件源码里注册的工具名必须匹配 ^[a-zA-Z0-9_-]+$（棘轮：存量只减不增）', () => {
  const counts = new Map();
  const samples = new Map();
  for (const [plugin, { source }] of collect()) {
    for (const { name, file } of source) {
      if (TOOL_NAME_PATTERN.test(name)) continue;
      counts.set(plugin, (counts.get(plugin) ?? 0) + 1);
      if (!samples.has(plugin)) samples.set(plugin, `${name} (${file})`);
    }
  }
  const unexpected = [];
  for (const [plugin, count] of counts) {
    const allowed = KNOWN_OFFENDERS[plugin];
    if (allowed === undefined) unexpected.push(`${plugin}: ${count} 个非法工具名，例如 ${samples.get(plugin)}`);
    else if (count > allowed) unexpected.push(`${plugin}: ${count} 个 > 允许存量 ${allowed}（棘轮只减不增），例如 ${samples.get(plugin)}`);
  }
  assert.deepEqual(unexpected, [], `新增了带非法字符的工具名：\n${unexpected.join('\n')}`);

  // 存量修完后把允许清单里的数字删掉（这条会提醒你别忘了）。
  for (const [plugin, allowed] of Object.entries(KNOWN_OFFENDERS)) {
    const actual = counts.get(plugin) ?? 0;
    if (actual < allowed) {
      assert.fail(`${plugin} 的非法工具名已从 ${allowed} 降到 ${actual}，请把 KNOWN_OFFENDERS 里的数字改成 ${actual}（降到 0 就删掉这一项）`);
    }
  }
});

// 注：迁移插件 dsh-zcode-migrate 的「三个工具名是下划线写法」回归锁随该件退役
// （2026-11-08）一并下线——它贡献的 zcode_inspect / zcode_migrate / zcode_verify
// 已不在宿主工具面。
