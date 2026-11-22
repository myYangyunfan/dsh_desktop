'use strict';

// unit-better-sidebar-team-projection.test.js — 编队名册的宿主形状回归锁。
//
// 用户报障：内核 0.2.2 起 `agentTeam` 投影不再携带成员列表，
// `@deepseek-ai/dsh-agent-team/lib/types/types.d.ts` 的 `TeamProjection` 只剩
// `{ enabled, tasks, failure? }`；而侧栏仍按 0.1.7 形状读 `team.members`，
// 于是每打开「子代理 / 编队」页就在渲染期抛
// `Cannot read properties of undefined (reading 'map')`
// —— 而且 `team === undefined` 那道守卫永远不生效：内核
// `teamProjectionDefinition.init` 让**每个会话都发这条投影**。
//
// 判据取自**发行产物** lib/client.js 里的真实函数体（不是源码字符串），在纯净 vm
// 里用合成数据直接调用：
//   - `teamProjectionOf` 必须把 `enabled === false` 读成「没有团队」；
//   - `teamMembersOf` 的名册来源只剩「Lead 行 + subagentCatalog 直接子项」，
//     即签名里出现 `entries`，且产物里不再出现 `team.members`；
//   - 任务板继续读新版返回的 `team.tasks`（用户截图里那句「保留新版返回的任务数据」）。
//
// 反证：把 `enabled === false` 判定摘掉 → ① 判据当场红。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DSH = path.resolve(__dirname, '..', '..');
const PKG_DIR = path.join(DSH, 'assets', 'plugins', 'dsh-better-sidebar');
const CLIENT_FILE = path.join(PKG_DIR, 'lib', 'client.js');
const ARTIFACT = fs.readFileSync(CLIENT_FILE, 'utf8').replace(/\r\n/g, '\n');

/** 抠 `function <name>(…args…) {…}` 的完整源码（brace 匹配）。 */
function extractFn(text, name) {
  const head = new RegExp(`function ${name}\\(`).exec(text);
  assert.ok(head !== null, `产物里找不到 function ${name}(（构建形状变了，先改判据）`);
  let depth = 0;
  let i = text.indexOf('{', head.index);
  for (; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(head.index, i + 1);
    }
  }
  throw new Error(`${name}: 括号没闭合，抠取失败`);
}

/** 在纯净 vm 里把一组函数装出来，返回它们的调用面。 */
function loadFunctions(sources) {
  const sandbox = { console, undefined, Object, Array, Map, String, Number };
  vm.createContext(sandbox);
  // 产物里 `ROOT_AGENT_NAME` 是模块级常量（宿主约定的根 agent 名），
  // 抠出来的函数体依赖它，这里按产物的值补一条全局绑定。
  vm.runInContext('var ROOT_AGENT_NAME = "lead";', sandbox);
  for (const [name, src] of Object.entries(sources)) {
    vm.runInContext(`${src}\nglobalThis[${JSON.stringify(name)}] = ${name};`, sandbox);
  }
  return sandbox;
}

const ROOT = 'session-lead';

test('① teamProjectionOf：enabled=false 读成「没有团队」（旧版恒真 → 编队页必崩）', () => {
  const box = loadFunctions({ teamProjectionOf: extractFn(ARTIFACT, 'teamProjectionOf') });
  const none = { [ROOT]: { values: { agentTeam: { enabled: false, tasks: [] } } } };
  assert.equal(
    box.teamProjectionOf(none, ROOT),
    undefined,
    'enabled === false 表示这个会话没有团队（内核每个会话都发该投影，undefined 守卫不再够用）',
  );
  const live = { enabled: true, tasks: [{ id: 't1' }] };
  assert.equal(box.teamProjectionOf({ [ROOT]: { values: { agentTeam: live } } }, ROOT), live,
    'enabled=true 必须原样返回');
  const legacy = { tasks: [] };
  assert.equal(box.teamProjectionOf({ [ROOT]: { values: { agentTeam: legacy } } }, ROOT), legacy,
    '旧宿主没有 enabled 字段时按启用处理（保守方向）');
  assert.equal(box.teamProjectionOf(undefined, ROOT), undefined, '没有投影 → 没有团队');
  assert.equal(box.teamProjectionOf(none, undefined), undefined, '没有根会话 → 没有团队');
});

test('② teamMembersOf：名册 = Lead 行 + subagentCatalog 直接子项，不再读 team.members', () => {
  const src = extractFn(ARTIFACT, 'teamMembersOf');
  assert.match(src, /entries/, '签名必须收 subagentCatalog 的 entries（新版唯一名册来源）');
  assert.match(src, /ROOT_AGENT_NAME/, 'Lead 行用宿主约定的根 agent 名');
  assert.match(ARTIFACT, /ROOT_AGENT_NAME = "lead"/, '根 agent 名必须逐字为 lead（宿主 ROOT_AGENT_NAME）');
  assert.ok(!src.includes('.members'), '旧读法 team.members 不得残留在名册构造里');

  const box = loadFunctions({ teamMembersOf: src });
  const team = { enabled: true, tasks: [] };
  const entries = [
    { id: 'child-1', label: 'Alice' },
    { id: 'child-2', label: 'Bob' },
  ];
  const byId = { [ROOT]: { running: true }, 'child-1': { running: true } };
  const rows = box.teamMembersOf(team, ROOT, entries, {}, byId);
  assert.equal(rows.length, 3, 'Lead 一行 + 两个 catalog 子项');
  assert.deepEqual(
    // spread 先把 vm 域的数组搬进本域（跨 realm 的数组原型不同，deepStrictEqual 会判不等）。
    [...rows].map(r => [r.id, r.name, r.role, r.phase, r.status].join('|')),
    [
      `${ROOT}|lead|lead|active|running`,
      'child-1|Alice|teammate|active|running',
      'child-2|Bob|teammate|active|idle',
    ],
    '名字取 label 兜底、状态取会话列表的 running 位；能进名册的成员都已上线（phase=active）',
  );
  // 展示名优先用会话标题，其次 label，最后 id。
  const titled = box.teamMembersOf(team, ROOT, entries, {}, { [ROOT]: {}, 'child-1': { displayTitle: '子代理一' } });
  assert.equal(titled[1].name, '子代理一', '会话标题优先于 catalog label');
  const noLabel = box.teamMembersOf(team, ROOT, [{ id: 'child-3' }], {}, {});
  assert.equal(noLabel[1].name, 'child-3', '既无标题也无 label 时回落到 id');
  // live 兜底：summaries 没带 running 时用 live 的标记。
  const fallback = box.teamMembersOf(team, ROOT, entries, { 'child-2': { running: true } }, { [ROOT]: {} });
  assert.equal(fallback[2].status, 'running', 'summaries 缺字段时 live 兜底');
  assert.equal(box.teamMembersOf(undefined, ROOT, entries, {}, {}).length, 0, '没有团队 → 空名册');
  assert.equal(box.teamMembersOf(team, undefined, entries, {}, {}).length, 0, '没有根会话 → 空名册');
});

test('③ 任务板仍读新版返回的任务数据（team.tasks）', () => {
  assert.ok(ARTIFACT.includes('team.tasks'), '编队页 / 任务板必须继续消费 team.tasks');
  assert.ok(ARTIFACT.includes('teamTasks'), '任务板的接线在位（SubagentView 的 teamTasks 入参）');
});

test('④ 全产物不再有 team.members 旧读法', () => {
  const hits = ARTIFACT.match(/team\.members/g) ?? [];
  assert.equal(hits.length, 0, `发行产物里不得再有 team.members（实为 ${hits.length} 处）`);
});

test('反证：摘掉 enabled 判定 → ① 判据当场红', () => {
  const src = extractFn(ARTIFACT, 'teamProjectionOf');
  const from = 'team?.enabled === false ? void 0 : team';
  assert.ok(src.includes(from), '变异锚点必须在位');
  const box = loadFunctions({ teamProjectionOf: src.replace(from, 'team') });
  const none = { [ROOT]: { values: { agentTeam: { enabled: false, tasks: [] } } } };
  assert.notEqual(
    box.teamProjectionOf(none, ROOT),
    undefined,
    '变异体必须退回「恒真」——这正是旧版的崩溃形状，说明 ① 咬的是真守卫',
  );
});
