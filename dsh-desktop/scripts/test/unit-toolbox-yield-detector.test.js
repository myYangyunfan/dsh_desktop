// 回归锁：内置件 dsh-toolbox-ui 的「让位检测」不得把内核运行时包当成竞争面板。
//
// 事故形态（2026-11-18 用户报障，随包内核 0.2.2-rc.3）：
//   面板显示「已让位给另一个 MCP 管理插件 —— 检测到 @deepseek-ai/dsh-mcp-manager 已加载」，
//   而 MCP 管理面板**整体消失**。判据只有「loader 条目名同时含 mcp 与 manager」，而
//   `dsh-web-app/cordis.patch.yml:153-154` 里内核自己的那条正是
//   `- id: mcp-manager / name: '@deepseek-ai/dsh-mcp-manager'`——纯运行时服务
//   （settings 驱动的 mcp-client 机群，无 client 半边、无 `./client` 导出）。
//   实测内核 78 个 `dsh-client-ui-*` 里没有任何 mcp 项，全包 client 产物对 `mcpServers`
//   零命中：它压根不提供界面，于是「让位」= 用户彻底失去 MCP 面板。
//
// 2026-11-22 换版到上游 1.13.0 后，**上游自带同款修复**且多一道闸：
//   `isHostBundledMcpManager(name)`（`lib/update-hint.js`）+ `entryIsActive(entry)`
//   （只对「正在跑」的条目让位）。本仓的 fork（`findConflictingManager` /
//   `isKernelFirstPartyPluginName`）随之撤除，本套件改为咬**上游形态**：
//   判据函数是那三个导出的行为，装配顺序与每道闸的唯一性用源码结构咬住。
//
// 反例（必须继续判成冲突）：老线第三方 UI 包 `dsh-mcp-manager-ui`（未加 scope）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  isHostBundledMcpManager,
  isMcpManagerPluginName,
  pluginName,
} from '../../assets/plugins/dsh-toolbox-ui/lib/update-hint.js';

const LIB = fileURLToPath(new URL('../../assets/plugins/dsh-toolbox-ui/lib/index.js', import.meta.url));
const HINT = fileURLToPath(new URL('../../assets/plugins/dsh-toolbox-ui/lib/update-hint.js', import.meta.url));

/** 让位检测的装配顺序（字符串 → 语义）。顺序即优先级，缺一即失效。 */
const GUARDS = [
  ['self-by-name', 'const self = pluginName();'],
  ['skip-self', "if (self !== '' && name === self) continue;"],
  ['name-heuristic', 'if (!isMcpManagerPluginName(name)) continue;'],
  ['skip-host-bundled', 'if (isHostBundledMcpManager(name)) continue;'],
  ['skip-inactive', 'if (!entryIsActive(entry)) continue;'],
];

/** 依次命中每道闸；缺一道就返回缺失的那道，用于反证「判据不是空转」。 */
function missingGuards(src) {
  let cursor = -1;
  const missing = [];
  for (const [label, needle] of GUARDS) {
    const at = src.indexOf(needle, cursor + 1);
    if (at < 0) missing.push(label);
    else cursor = at;
  }
  return missing;
}

test('内核运行时包 @deepseek-ai/dsh-mcp-manager 必须被判成「宿主自带」而跳过（事故原形）', () => {
  assert.equal(isHostBundledMcpManager('@deepseek-ai/dsh-mcp-manager'), true);
  // 它同时也满足「像 MCP 管理插件」这一半——正因如此才需要 scope 那道闸。
  assert.equal(isMcpManagerPluginName('@deepseek-ai/dsh-mcp-manager'), true);
});

test('按 scope 判而非按名单枚举：@deepseek-ai/* 下任何同形名都跳过', () => {
  for (const name of [
    '@deepseek-ai/dsh-mcp-manager',
    '@deepseek-ai/dsh-mcp-manager-probe',
    '@DeepSeek-AI/dsh-MCP-Manager',
  ]) {
    assert.equal(isHostBundledMcpManager(name), true, `${name} 应判成宿主自带`);
  }
});

test('老线第三方 UI 包 dsh-mcp-manager-ui 仍被判成冲突（反证：修复不得把真检测一并关掉）', () => {
  assert.equal(isMcpManagerPluginName('dsh-mcp-manager-ui'), true);
  assert.equal(isHostBundledMcpManager('dsh-mcp-manager-ui'), false);
});

test('自身判据是包名而不是 patch id：pluginName() 读到真实 package.json', () => {
  assert.equal(pluginName(), 'dsh-toolbox-ui');
  const src = readFileSync(LIB, 'utf8');
  // 两个包共用 `id: mcp-manager-ui`；用 id 排自身会把旧包一起排掉 → 让位检测永不触发。
  assert.match(src, /自身判据是\*\*包名\*\*/, 'conflictingManager 的自我排除注释应仍在位');
});

test('装配顺序与每道闸的唯一性：缺一道即判红', () => {
  const src = readFileSync(LIB, 'utf8');
  assert.deepEqual(missingGuards(src), [], '让位检测的五道闸必须按顺序各出现一次');
  for (const [label, needle] of GUARDS) {
    assert.equal(src.split(needle).length - 1, 1, `${label} 只许出现一次（同一件事只能有一处判据）`);
  }
});

test('反证：摘掉 scope 那道闸，结构判据必须当场报缺', () => {
  const src = readFileSync(LIB, 'utf8');
  const mutated = src.replace('if (isHostBundledMcpManager(name)) continue;', '');
  assert.notEqual(mutated, src, '变异体必须真的改到字节（锚点漂移时这条会先红）');
  assert.deepEqual(missingGuards(mutated), ['skip-host-bundled']);
});

test('反证：摘掉「只让位给在跑条目」那道闸，同样必须报缺', () => {
  const src = readFileSync(LIB, 'utf8');
  const mutated = src.replace('if (!entryIsActive(entry)) continue;', '');
  assert.notEqual(mutated, src);
  assert.deepEqual(missingGuards(mutated), ['skip-inactive']);
});

test('本仓 fork 已撤：上游形态没有 findConflictingManager / isKernelFirstPartyPluginName 导出', () => {
  const src = readFileSync(HINT, 'utf8');
  assert.doesNotMatch(src, /isKernelFirstPartyPluginName/, '上游用 isHostBundledMcpManager 这个名字，别把 fork 名混回来');
  assert.match(
    src,
    /export \{ checkForUpdate, isHostBundledMcpManager, isMcpManagerPluginName, pluginName, pluginVersion \};/,
    'update-hint.js 的导出面是判据的唯一来源',
  );
});
