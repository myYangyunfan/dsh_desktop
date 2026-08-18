'use strict';

// patch-session-manage 补丁单测：新装 / 幂等 / 旧版升级三条路径。
//
// 回归背景（用户实测 bug）：删除运行中会话后其他会话输入框锁死（重载页面
// 才恢复），且重载后删除已停止会话会连续多次弹「删除失败」窗。根因是补丁
// 早期用 agent/status 事件边沿缓存（dshSessionRunningState）做删除守卫，
// 而事件是边沿触发 —— 页面重载等无流连接窗口会永久错过状态边沿：
//   · 漏判（缓存无记录，实际 running）→ 运行中会话被删成孤儿，agent 继续
//     向已移除会话推流，renderer 输入状态污染到其他会话；
//   · 卡 true（缓存停留 true，实际已停）→ 已停止会话的删除被反复误拒。
// 守卫改为实时查询 ctx.agents（与官方 sessions.list 的 running 同源）后，
// 两条路径都必须不再出现事件缓存。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { patchSessionManage, MARKER } = require('../patch-session-manage.js');

// 官方 dsh-host-apiproxy 的最小锚点集（新装路径 replacements + 升级锚点回退
// 所需的 agent/status 监听器原文）。
const API_OFFICIAL = [
  'import { mkdir, stat } from "node:fs/promises";',
  'import { dirname, extname } from "node:path";',
  'import { release } from "node:os";',
  'return ok(request, { archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds] });\n\t\t\t}',
  'const workspaceArchiveSessionValueSchema = z$1.object({ archivedSessionIds: z$1.array(sessionIdSchema) });',
  '"workspace.archiveSession": {\n\t\tschema: workspaceArchiveSessionRequestSchema,\n\t\tinvoke: (api, r) => api.workspace.archiveSession(r)\n\t},',
  'ctx.on("agent/status", ({ agent, status }) => {\n\t\t\t\t\t\tqueue.push(frame({\n\t\t\t\t\t\t\ttype: "host/session-status",\n\t\t\t\t\t\t\tsessionId: agent.id,\n\t\t\t\t\t\t\trunning: status === "running"\n\t\t\t\t\t\t}));\n\t\t\t\t\t}),',
].join('\n');

function writeApi(root, content) {
  const file = path.join(root, '@deepseek-ai', 'dsh-host-apiproxy', 'lib', 'index.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function withTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sm-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('新装：删除守卫实时查询 ctx.agents，不再插入事件缓存', () => {
  withTmp((root) => {
    const file = writeApi(root, API_OFFICIAL);
    const changed = patchSessionManage(root, () => {});
    assert.equal(changed, 1, 'apiproxy 应被打补丁');
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.includes('ctx.agents.get(sessionId)?.status === "running"'),
      '守卫必须是实时查询（官方 sessions.list 同源判定）');
    assert.ok(!text.includes('dshSessionRunningState'),
      '新装不得引入事件缓存（边沿丢失会让运行中会话被删成孤儿 / 已停止会话被误拒）');
    assert.ok(text.includes('queue.push(frame({\n\t\t\t\t\t\t\ttype: "host/session-status"'),
      '官方 agent/status 监听器应保持原样（不再插入缓存写入行）');
    assert.ok(text.startsWith('// ' + MARKER), '补丁标记应在文件首行');
    assert.equal(patchSessionManage(root, () => {}), 0, '二次应用幂等');
  });
});

test('升级：旧版事件缓存守卫被替换为实时查询，缓存维护点全部回退', () => {
  withTmp((root) => {
    // 旧版补丁形态：MARKER + 官方文本 + map 声明 + status 写入行 + 缓存守卫。
    let legacy = '// ' + MARKER + ': 对话删除/归档管理运行时补丁\n' + API_OFFICIAL;
    legacy = legacy.replace('import { release } from "node:os";',
      'import { release } from "node:os";\n'
      + '// dsh-desktop patch (session manage): 每会话最近一次 agent 运行状态（删除守卫用）。\n'
      + 'const dshSessionRunningState = /* @__PURE__ */ new Map();');
    legacy = legacy.replace('ctx.on("agent/status", ({ agent, status }) => {',
      'ctx.on("agent/status", ({ agent, status }) => {\n'
      + '\t\t\t\t\t\tif (agent && agent.id) dshSessionRunningState.set(agent.id, status === "running");');
    legacy = legacy.replace(
      'return ok(request, { archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds] });\n\t\t\t}',
      'return ok(request, { archivedSessionIds: [...ctx.workspaceRegistry.archivedSessionIds] });\n\t\t\t},\n'
      + '\t\t\tasync deleteSession(request) {\n'
      + '\t\t\t\tconst { sessionId } = request.payload;\n'
      + '\t\t\t\tif (dshSessionRunningState.get(sessionId) === true) {\n'
      + '\t\t\t\t\treturn err(request, { code: "session-running" });\n'
      + '\t\t\t\t}\n\t\t\t}');
    const file = writeApi(root, legacy);

    const changed = patchSessionManage(root, () => {});
    assert.equal(changed, 1, '升级应产生一次修改');
    const up = fs.readFileSync(file, 'utf8');
    assert.ok(up.includes('ctx.agents.get(sessionId)?.status === "running"'),
      '缓存守卫应被升级为实时查询');
    assert.ok(!up.includes('dshSessionRunningState'),
      '升级后不得残留任何事件缓存（声明与写入行都应清除）');
    assert.equal(patchSessionManage(root, () => {}), 0, '升级后幂等');
  });
});

test('锚点缺失：dsh 版本漂移时跳过且不损坏文件', () => {
  withTmp((root) => {
    const file = writeApi(root, 'export default {};\n');
    const changed = patchSessionManage(root, () => {});
    assert.equal(changed, 0, '锚点不匹配应跳过');
    assert.equal(fs.readFileSync(file, 'utf8'), 'export default {};\n', '文件不得被改动');
  });
});
