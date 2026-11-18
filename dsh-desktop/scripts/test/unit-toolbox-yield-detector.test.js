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
// 反例（必须继续判成冲突）：老线第三方 UI 包 `dsh-mcp-manager-ui`（未加 scope）。

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  findConflictingManager,
  isKernelFirstPartyPluginName,
  isMcpManagerPluginName,
} from '../../assets/plugins/dsh-toolbox-ui/lib/index.js';

const SELF = 'dsh-toolbox-ui';
const LIB = fileURLToPath(new URL('../../assets/plugins/dsh-toolbox-ui/lib/index.js', import.meta.url));

/** 按真机 loader 条目的形状造一行。 */
const entry = (name, id = 'row') => ({ options: { id, name } });

test('内核运行时包 @deepseek-ai/dsh-mcp-manager 不得被判成竞争面板（事故原形）', () => {
  const entries = [entry('@deepseek-ai/dsh-mcp-manager', 'mcp-manager')];
  assert.equal(findConflictingManager(entries, SELF), null);
});

test('内核里其他同时含 mcp+manager 的包同样跳过（按 scope 判，不按包名单个枚举）', () => {
  const entries = [entry('@deepseek-ai/dsh-mcp-manager', 'a'), entry('@deepseek-ai/dsh-mcp-manager-probe', 'b')];
  assert.equal(findConflictingManager(entries, SELF), null);
  assert.equal(isKernelFirstPartyPluginName('@deepseek-ai/dsh-mcp-manager'), true);
  assert.equal(isKernelFirstPartyPluginName('dsh-mcp-manager-ui'), false);
});

test('老线第三方 UI 包 dsh-mcp-manager-ui 仍被判成冲突（反证：修复不得把真检测一并关掉）', () => {
  const entries = [entry('dsh-mcp-manager-ui', 'mcp-manager-ui')];
  assert.deepEqual(findConflictingManager(entries, SELF), { id: 'mcp-manager-ui', name: 'dsh-mcp-manager-ui' });
});

test('自身按包名排除（同一 id 的旧包仍在场时不得误排自身判据）', () => {
  const entries = [entry(SELF, 'mcp-manager-ui'), entry('dsh-mcp-manager-ui', 'mcp-manager-ui')];
  assert.deepEqual(findConflictingManager(entries, SELF), { id: 'mcp-manager-ui', name: 'dsh-mcp-manager-ui' });
});

test('名字只含一半（mcp 或 manager）不算冲突；非字符串 / 空名 / 无 options 一律跳过', () => {
  const entries = [
    entry('@deepseek-ai/dsh-mcp-client', 'x'),
    entry('some-manager-plugin', 'y'),
    { options: null },
    { options: {} },
    entry(''),
    entry(undefined),
    null,
  ];
  assert.equal(findConflictingManager(entries, SELF), null);
  assert.equal(isMcpManagerPluginName('dsh-mcp-client'), false);
  assert.equal(isMcpManagerPluginName('dsh-mcp-manager-ui'), true);
});

test('条目表不是可迭代物时返回 null（fail-open：宁可漏检，不可误判）', () => {
  assert.equal(findConflictingManager(undefined, SELF), null);
  assert.equal(findConflictingManager(null, SELF), null);
  assert.equal(findConflictingManager({}, SELF), null);
  assert.equal(findConflictingManager(42, SELF), null);
});

test('conflictingManager() 必须走这条纯函数（不许在方法里另抄一份判据）', () => {
  const src = readFileSync(LIB, 'utf8');
  assert.match(src, /return findConflictingManager\(entries, pluginName\(\)\);/);
  // 判据只能有一处：名字半边与 scope 半边各自只在纯函数里出现一次调用点。
  assert.equal(src.match(/if \(!isMcpManagerPluginName\(name\)\) continue;/g)?.length, 1);
  assert.equal(src.match(/if \(isKernelFirstPartyPluginName\(name\)\) continue;/g)?.length, 1);
});
