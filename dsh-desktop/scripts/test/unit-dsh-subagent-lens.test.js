'use strict';

// unit-dsh-subagent-lens.test.js — 子代理活动快视插件单测。
//
// 覆盖三层：
//   1) 纯逻辑：从工具调用事件流/块树提取命令与文件清单（Task/subagent、
//      bash/pwsh、read/write/edit 各形态）+ 脏数据容错（缺参数、非字符串、
//      超长截断、非法 JSON、非数组输入）+ 汇总/去重/截断/子会话匹配/路径解析。
//   2) vm 沙箱：lib/client.js 经 window.__ModuleLoader__.load 装载 + 最小模块
//      表物化 factory 不炸；apply(fakeCtx) 完成 slots 注册（toolview 按 key、
//      会话头聚合条、设置栏目），注册产物可渲染（react stub）可 dispose。
//   3) 装配登记：COMPANION_PLUGINS 含新条目；assets 元数据过 hub 校验
//      （inspectCompanionMeta：name/version/description/dsh.plugin.json 一致）。
// 运行：node --test scripts/test/unit-dsh-subagent-lens.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PLUGIN_DIR = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-subagent-lens');
const CLIENT_SRC = fs.readFileSync(path.join(PLUGIN_DIR, 'lib', 'client.js'), 'utf8');

// ---------------------------------------------------------------------------
// vm 沙箱装载（最小模块表：react 系 stub；renderer/web-react/primitives 缺席
// → 走插件内置的三级回落与防御降级，正是 rc.8 契约要求的形态）
// ---------------------------------------------------------------------------
function loadClientModule() {
  const reactStub = {
    useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: () => {},
    useMemo: (f) => (typeof f === 'function' ? f() : undefined),
    useRef: (v) => ({ current: v }),
    useSyncExternalStore: (_sub, getSnap) => getSnap(),
    Fragment: '::Fragment::',
  };
  const jsxStub = { jsx: () => null, jsxs: () => null, Fragment: '::Fragment::' };
  const moduleTable = {
    'react': reactStub,
    'react/jsx-runtime': jsxStub,
  };
  const loads = [];
  const sandbox = {
    window: { __ModuleLoader__: { load: (def) => loads.push(def) } },
    console,
    setTimeout, clearTimeout, setInterval, clearInterval,
  };
  vm.createContext(sandbox);
  vm.runInContext(CLIENT_SRC, sandbox, { filename: 'dsh-subagent-lens/lib/client.js' });
  assert.equal(loads.length, 1, '__ModuleLoader__.load 应恰好登记一次');
  assert.equal(loads[0].id, '@dsh-external/dsh-subagent-lens');
  const mod = loads[0].factory((spec) => {
    assert.ok(Object.prototype.hasOwnProperty.call(moduleTable, spec), '非法 require（不在最小模块表内）: ' + spec);
    return moduleTable[spec];
  });
  assert.ok(mod && typeof mod.apply === 'function', 'factory 应导出 apply');
  return mod;
}

let lens;
test.before(() => { lens = loadClientModule(); });

// vm 沙箱产生的对象/数组与宿主 realm 原型不同，严格 deepEqual 会以
// 「same structure but not reference-equal」误报 —— 对象比较一律走 JSON
// 结构比较，数组先 spread 成宿主数组。
function jsonEq(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message || ('json 不等: ' + JSON.stringify(actual) + ' vs ' + JSON.stringify(expected)));
}

// ---------------------------------------------------------------------------
// 1) 纯逻辑：分类 / 参数 / 截断
// ---------------------------------------------------------------------------
test('classifyActivityTool：内核工具名 + 常见别名 + 脏输入', () => {
  assert.equal(lens.classifyActivityTool('bash'), 'command');
  assert.equal(lens.classifyActivityTool('Pwsh'), 'command');
  assert.equal(lens.classifyActivityTool('shell'), 'command');
  assert.equal(lens.classifyActivityTool('read'), 'read');
  assert.equal(lens.classifyActivityTool('write'), 'write');
  assert.equal(lens.classifyActivityTool('edit'), 'edit');
  assert.equal(lens.classifyActivityTool('edit_file'), 'edit');
  // 非活动工具
  assert.equal(lens.classifyActivityTool('subagent'), null);
  assert.equal(lens.classifyActivityTool('Task'), null);
  assert.equal(lens.classifyActivityTool('todo_write'), null);
  assert.equal(lens.classifyActivityTool('grep'), null);
  // 脏输入
  assert.equal(lens.classifyActivityTool(''), null);
  assert.equal(lens.classifyActivityTool(null), null);
  assert.equal(lens.classifyActivityTool(123), null);
  assert.equal(lens.classifyActivityTool(undefined), null);
});

test('parseArgsSafe / pickPath：JSON 字符串、对象直通、非法输入', () => {
  jsonEq(lens.parseArgsSafe('{"command":"ls"}'), { command: 'ls' });
  jsonEq(lens.parseArgsSafe({ a: 1 }), { a: 1 });
  assert.equal(lens.parseArgsSafe('not json'), null);
  assert.equal(lens.parseArgsSafe('[1,2]'), null);
  assert.equal(lens.parseArgsSafe(''), null);
  assert.equal(lens.parseArgsSafe(null), null);
  assert.equal(lens.parseArgsSafe(undefined), null);
  assert.equal(lens.parseArgsSafe(42), null);

  assert.equal(lens.pickPath({ file_path: 'a.js' }), 'a.js');
  assert.equal(lens.pickPath({ path: 'b.js' }), 'b.js');
  assert.equal(lens.pickPath({ filePath: 'c.js' }), 'c.js');
  assert.equal(lens.pickPath({ path: '', file_path: 'd.js' }), 'd.js');
  assert.equal(lens.pickPath({ path: 123 }), undefined);
  assert.equal(lens.pickPath(null), undefined);
  assert.equal(lens.pickPath('x'), undefined);
});

test('truncateText / firstLineOf / splitToolNames', () => {
  const short = lens.truncateText('ls -la', 400);
  assert.equal(short.text, 'ls -la');
  assert.equal(short.truncated, false);
  const long = lens.truncateText('x'.repeat(600), 400);
  assert.equal(long.text.length, 400);
  assert.equal(long.truncated, true);
  assert.equal(long.originalLength, 600);
  // 非法上限回落默认
  const fallback = lens.truncateText('y'.repeat(600), 'bogus');
  assert.equal(fallback.text.length, 400);
  assert.equal(lens.truncateText('ok', 400).text, 'ok');

  assert.equal(lens.firstLineOf('line1\nline2'), 'line1');
  assert.equal(lens.firstLineOf('only'), 'only');
  assert.equal(lens.firstLineOf(null), '');

  jsonEq([...lens.splitToolNames(['subagent', ' task ', '', 'subagent'])], ['subagent', 'task']);
  jsonEq([...lens.splitToolNames('a, b,,c')], ['a', 'b', 'c']);
  jsonEq([...lens.splitToolNames(null)], []);
  jsonEq([...lens.splitToolNames([42, 'x'])], ['x']);
});

// ---------------------------------------------------------------------------
// 2) 事件流提取（子会话 events 形态：tool/call + tool/result）
// ---------------------------------------------------------------------------
function callEvent(callId, name, args, seq) {
  return { type: 'tool/call', seq, data: { callId, name, arguments: typeof args === 'string' ? args : JSON.stringify(args) } };
}
function resultEvent(callId, isError, seq) {
  return {
    type: 'tool/result', seq,
    data: { message: { source: { callId }, content: [{ type: 'tool-result', isError }] } },
  };
}

test('activityFromEvents：Task/subagent + bash + read/write/edit 全形态', () => {
  const events = [
    callEvent('c1', 'subagent', { description: '调研内核', prompt: '去读源码并总结', run_in_background: false }, 1),
    callEvent('c2', 'bash', { command: 'node --check lib/index.js', description: '语法检查' }, 2),
    callEvent('c3', 'pwsh', { command: 'Get-ChildItem' }, 3),
    callEvent('c4', 'read', { file_path: 'C:/src/a.js' }, 4),
    callEvent('c5', 'write', { path: 'C:/src/b.js', content: 'x' }, 5),
    callEvent('c6', 'edit', { file_path: 'C:/src/c.js', old_string: 'a', new_string: 'b' }, 6),
    resultEvent('c2', false, 7),
    resultEvent('c5', true, 8),
  ];
  const out = lens.activityFromEvents(events, {});
  // Task/subagent 委派调用本身不产生命令/文件条目
  assert.equal(out.commands.length, 2);
  assert.equal(out.commands[0].command, 'node --check lib/index.js');
  assert.equal(out.commands[0].callId, 'c2');
  assert.equal(out.commands[0].error, undefined);
  assert.equal(out.commands[1].command, 'Get-ChildItem');
  assert.equal(out.fileSeeds.length, 3);
  jsonEq(out.fileSeeds.map((f) => [f.path, f.op]),
    [['C:/src/a.js', 'read'], ['C:/src/b.js', 'write'], ['C:/src/c.js', 'edit']]);
  // tool/result 的 isError 关联回对应调用
  assert.equal(out.commands[0].error, undefined);
  assert.equal(out.fileSeeds[1].error, true);
});

test('activityFromEvents：脏数据容错（非数组 / 空元素 / 非法 JSON / 非字符串参数）', () => {
  jsonEq(lens.activityFromEvents(null, {}), { commands: [], fileSeeds: [] });
  jsonEq(lens.activityFromEvents(undefined, {}), { commands: [], fileSeeds: [] });
  jsonEq(lens.activityFromEvents('not-array', {}), { commands: [], fileSeeds: [] });

  const dirty = [
    null,
    42,
    'str',
    {},
    { type: 'tool/call' },                                   // 无 data
    { type: 'tool/call', data: null },
    { type: 'tool/call', data: { name: 'bash' } },            // 无 arguments
    { type: 'tool/call', data: { name: 'bash', arguments: '{broken' } }, // 非法 JSON
    { type: 'tool/call', data: { name: 'bash', arguments: '{"command":42}' } }, // 非字符串
    { type: 'tool/call', data: { name: 'bash', arguments: '{}' } }, // 缺 command
    { type: 'tool/call', data: { name: null, arguments: '{"command":"x"}' } }, // 无名
    { type: 'tool/call', data: { name: 'read', arguments: '{"file_path":123}' } }, // 路径非字符串
    { type: 'tool/result', data: {} },                        // 无 message
    { type: 'unknown/thing', data: { name: 'bash', arguments: '{"command":"x"}' } },
  ];
  jsonEq(lens.activityFromEvents(dirty, {}), { commands: [], fileSeeds: [] });
});

test('activityFromEvents：超长命令截断（保留原长 + 标记）', () => {
  const events = [callEvent('c1', 'bash', { command: 'echo ' + 'z'.repeat(1000) }, 1)];
  const out = lens.activityFromEvents(events, { commandChars: 60 });
  assert.equal(out.commands.length, 1);
  assert.equal(out.commands[0].command.length, 60);
  assert.equal(out.commands[0].truncated, true);
  assert.equal(out.commands[0].originalLength, 5 + 1000);
});

// ---------------------------------------------------------------------------
// 3) 块树提取（chat 快照 tool-call root：running / done / subCalls）
// ---------------------------------------------------------------------------
test('activityFromBlocks：running 块 + done 块 + subCalls 递归 + 错误标记', () => {
  const blocks = [
    { callId: 'r1', name: 'bash', argsRaw: '{"command":"pnpm build"}', subCalls: [] },
    {
      kind: 'tool-result', callId: 'r2', isError: true,
      call: { name: 'read', argsRaw: '{"file_path":"src/x.ts"}' },
      content: [{ type: 'text', text: 'boom' }], subCalls: [],
    },
    {
      callId: 'r3', name: 'run_code', argsRaw: '{"code":"..."}',
      subCalls: [
        { callId: 'r3a', name: 'pwsh', argsRaw: '{"command":"dir"}', subCalls: [] },
        { callId: 'r3b', name: 'edit', argsRaw: '{"path":"src/y.ts"}', subCalls: [] },
      ],
    },
  ];
  const out = lens.activityFromBlocks(blocks, {});
  jsonEq(out.commands.map((c) => c.command), ['pnpm build', 'dir']);
  jsonEq(out.fileSeeds.map((f) => [f.path, f.op]), [['src/x.ts', 'read'], ['src/y.ts', 'edit']]);
  assert.equal(out.fileSeeds[0].error, true);
  // 脏输入
  jsonEq(lens.activityFromBlocks(null, {}), { commands: [], fileSeeds: [] });
  jsonEq(lens.activityFromBlocks([null, 7, 's', {}], {}), { commands: [], fileSeeds: [] });
});

test('toolCallRootsFromChatSnapshot：nodes Map / chat.nodes / 脏快照', () => {
  const root = { callId: 'a', name: 'bash', argsRaw: '{"command":"ls"}', subCalls: [] };
  const mkNode = (r) => ({ kind: 'tool-call', data: { root: r } });
  const nodes = new Map([['k1', mkNode(root)], ['k2', { kind: 'user' }], ['k3', null]]);
  const viaNodes = lens.toolCallRootsFromChatSnapshot({ nodes });
  assert.equal(viaNodes.length, 1);
  assert.strictEqual(viaNodes[0], root, '根块应原样透传');
  const viaChat = lens.toolCallRootsFromChatSnapshot({ chat: { nodes } });
  assert.equal(viaChat.length, 1);
  assert.strictEqual(viaChat[0], root);
  assert.equal(lens.toolCallRootsFromChatSnapshot({}).length, 0);
  assert.equal(lens.toolCallRootsFromChatSnapshot(null).length, 0);
  assert.equal(lens.toolCallRootsFromChatSnapshot({ nodes: 'not-a-map' }).length, 0);
});

// ---------------------------------------------------------------------------
// 4) 汇总：去重 / 截断 / 计数
// ---------------------------------------------------------------------------
test('mergeFiles：跨分隔符与大小写去重、op 并集、计数、错误传播', () => {
  const files = lens.mergeFiles([
    { path: 'C:\\Src\\A.ts', op: 'read' },
    { path: 'c:/src/a.ts', op: 'write' },
    { path: 'c:/src/a.ts', op: 'read' },
    { path: 'src/b.ts', op: 'edit', error: true },
  ]);
  assert.equal(files.length, 2);
  assert.equal(files[0].path, 'C:\\Src\\A.ts');
  jsonEq([...files[0].ops].sort(), ['read', 'write']);
  assert.equal(files[0].count, 3);
  assert.equal(files[1].error, true);
  assert.equal(lens.mergeFiles(null).length, 0);
  assert.equal(lens.mergeFiles([null, {}, { path: '' }, { path: 9 }]).length, 0);
});

test('summarizeActivity：计数完整、超上限只展示最新并报告隐藏数', () => {
  const commands = Array.from({ length: 8 }, (_, i) => ({ command: 'cmd-' + i, callId: 'c' + i }));
  const fileSeeds = Array.from({ length: 5 }, (_, i) => ({ path: 'f' + i + '.ts', op: 'read' }));
  const s = lens.summarizeActivity({ commands, fileSeeds }, { maxItems: 3 });
  assert.equal(s.commandCount, 8);
  assert.equal(s.fileCount, 5);
  assert.equal(s.commands.length, 3);
  jsonEq(s.commands.map((c) => c.command), ['cmd-5', 'cmd-6', 'cmd-7']);
  assert.equal(s.hiddenCommands, 5);
  assert.equal(s.hiddenFiles, 2);
  // 上限缺省 → 默认 50；activity 脏输入 → 全零
  const s2 = lens.summarizeActivity({ commands, fileSeeds }, {});
  assert.equal(s2.commands.length, 8);
  const s3 = lens.summarizeActivity(null, {});
  assert.equal(s3.commandCount, 0);
  assert.equal(s3.fileCount, 0);
});

// ---------------------------------------------------------------------------
// 5) 委派块解析 + 子会话匹配 + 路径解析
// ---------------------------------------------------------------------------
test('parseBlockFace：running / ok / error / stopped / 脏块', () => {
  const running = lens.parseBlockFace({ callId: 'c1', name: 'subagent', argsRaw: '{"description":"调研","prompt":"读源码","run_in_background":true}' });
  assert.equal(running.done, false);
  assert.equal(running.state, 'running');
  assert.equal(running.description, '调研');
  assert.equal(running.prompt, '读源码');
  assert.equal(running.runInBackground, true);
  assert.equal(running.resultText, '');

  const done = lens.parseBlockFace({
    kind: 'tool-result', isError: false,
    call: { name: 'Task', argsRaw: '{"description":"d","prompt":"p"}' },
    content: [{ type: 'text', text: '最终输出' }, { type: 'other' }],
  });
  assert.equal(done.done, true);
  assert.equal(done.state, 'ok');
  assert.equal(done.toolName, 'Task');
  assert.equal(done.resultText, '最终输出');

  const failed = lens.parseBlockFace({ kind: 'tool-result', isError: true, call: null, content: [] });
  assert.equal(failed.state, 'error');
  assert.equal(failed.toolName, '');

  const stopped = lens.parseBlockFace({ kind: 'tool-result', isError: true, error: { code: 'interrupted' }, call: null, content: [] });
  assert.equal(stopped.state, 'stopped');

  // description 缺席时回落 prompt 首行；prompt 也缺席时空
  const fallback = lens.parseBlockFace({ callId: 'c', name: 'subagent', argsRaw: '{"prompt":"第一行\\n第二行"}' });
  assert.equal(fallback.description, '第一行');

  assert.equal(lens.parseBlockFace(null).broken, true);
  assert.equal(lens.parseBlockFace(undefined).broken, true);
});

test('matchChildEntry：精确 / 包含 / 未命中 / 脏目录', () => {
  const catalog = { entries: [
    { kind: 'child', id: 's1', label: '调研内核', mode: 'continuable', activity: 'running' },
    { kind: 'diagnostic', id: 's-bad' },
    { kind: 'child', id: 's2', label: '写文档', mode: 'one-shot', activity: 'inactive' },
  ] };
  assert.equal(lens.matchChildEntry(catalog, '调研内核').id, 's1');
  assert.equal(lens.matchChildEntry(catalog, '调研内核（补充）').id, 's1');
  assert.equal(lens.matchChildEntry(catalog, '写').id, 's2');
  // 无法匹配且无 description → 不强行返回
  assert.equal(lens.matchChildEntry(catalog, '完全无关'), undefined);
  assert.equal(lens.matchChildEntry(undefined, 'x'), undefined);
  assert.equal(lens.matchChildEntry({}, 'x'), undefined);
  assert.equal(lens.matchChildEntry({ entries: 'not-array' }, 'x'), undefined);
  assert.equal(lens.matchChildEntry({ entries: [null, { kind: 'child', id: 's9' }] }, ''), undefined);
});

test('resolveOpenablePath 已退役（自制壳 openPath 支路随壳退场）', () => {
  // 0.1.1 起打开文件的唯一通路是内核在 toolview 槽位给的 openFile，不再需要
  // cwd 拼绝对路径；v1.0.0 拆除自制壳后 window.dshDesktop.openPath 没有替身。
  // 留这条断言当撤回账：若哪天有人「顺手补回」路径拼接，本用例会红并逼出说明。
  assert.equal(lens.resolveOpenablePath, undefined, 'resolveOpenablePath 不应再存在');
});

// ---------------------------------------------------------------------------
// 6) vm 沙箱：apply 注册面 + 组件渲染冒烟 + dispose
// ---------------------------------------------------------------------------
function makeFakeCtx() {
  const registered = [];
  const injections = [];
  const disposers = [];
  const describeCalls = { n: 0 };
  // 0.1.1 起设置面走 ctx.remote.settings（describe 读表单、mutate 按 profile 条目 id 写），
  // 幽灵的 ctx.settingsScope 已退役。回执形状照内核契约：namespaces[].ns = 条目 id，
  // writable 挂在 value 层。
  const settingsCalls = [];
  const remote = {
    settings: {
      describe: async () => {
        describeCalls.n += 1;
        return {
          ok: true,
          value: {
            namespaces: [{ ns: 'dsh-subagent-lens', value: { enabled: true, maxItems: 50, commandChars: 400 }, revision: 'rev-1' }],
            writable: true,
          },
        };
      },
      mutate: async (entryId, ops, revision) => {
        settingsCalls.push({ entryId, ops, revision });
        return { ok: true, value: { value: { enabled: false }, revision: 'rev-2' } };
      },
    },
  };
  return {
    registered, injections, describeCalls, settingsCalls, remote,
    slots: {
      inject(slotName, factory, comment) {
        const produced = factory();
        const collect = (d) => { if (typeof d === 'function') disposers.push(d); };
        if (produced && typeof produced[Symbol.iterator] === 'function') {
          for (const d of produced) collect(d);
        } else {
          collect(produced);
        }
        injections.push({ slotName, comment });
      },
      register(entry, comp) {
        registered.push({ entry, comp });
        return () => { const i = registered.findIndex((r) => r.entry === entry); if (i >= 0) registered.splice(i, 1); };
      },
    },
    sessions: { binding: () => undefined, openSubagent: () => {} },
    disposeAll: () => { while (disposers.length > 0) disposers.pop()(); },
  };
}

test('vm 沙箱：apply 注册 toolview（按 key）/ 会话头聚合条 / 设置栏目，可 dispose', () => {
  const mod = loadClientModule();
  const ctx = makeFakeCtx();
  assert.doesNotThrow(() => mod.apply(ctx), 'apply 不得抛出');

  const toolviewEntries = ctx.registered.filter((r) => r.entry.name === 'tool.call.toolview');
  assert.deepEqual(
    toolviewEntries.map((r) => r.entry.key).sort(),
    ['Task', 'subagent', 'subagent_fork', 'task'].sort(),
    '默认 toolName 集合各注册一条 keyed 条目',
  );
  assert.ok(toolviewEntries.every((r) => typeof r.comp === 'function'));

  const strip = ctx.registered.find((r) => r.entry.name === 'conversation.session.header.utilities');
  assert.ok(strip, '会话头聚合条应注册');
  assert.equal(strip.entry.id, 'dsh-subagent-lens-activity');

  const settings = ctx.registered.find((r) => r.entry.name === 'settings.section');
  assert.ok(settings, '设置栏目应注册');
  assert.equal(settings.entry.id, 'dsh-subagent-lens');

  assert.doesNotThrow(() => ctx.disposeAll(), 'dispose 不得抛出');
  assert.equal(ctx.registered.filter((r) => r.entry.name === 'tool.call.toolview').length, 0, 'dispose 后条目应注销');
});

test('vm 沙箱：services 缺席时 apply 静默降级（不注册设置卡、不炸）', () => {
  const mod = loadClientModule();
  const ctx = makeFakeCtx();
  ctx.remote = undefined;
  ctx.sessions = undefined;
  assert.doesNotThrow(() => mod.apply(ctx));
  assert.ok(ctx.registered.some((r) => r.entry.name === 'tool.call.toolview'), 'toolview 仍应注册');
  assert.ok(!ctx.registered.some((r) => r.entry.name === 'settings.section'), 'remote.settings 缺席时不注册设置卡');
  assert.equal(ctx.describeCalls.n, 0, 'remote 缺席时不得调用 describe');
});

test('vm 沙箱：委派行组件渲染冒烟（react stub，坏数据也不炸）', () => {
  const mod = loadClientModule();
  const ctx = makeFakeCtx();
  mod.apply(ctx);
  const row = ctx.registered.find((r) => r.entry.name === 'tool.call.toolview' && r.entry.key === 'subagent').comp;

  // running 委派块 + 空 sessions
  let out;
  assert.doesNotThrow(() => {
    out = row({
      callId: 'c1', toolName: 'subagent',
      block: { callId: 'c1', name: 'subagent', argsRaw: '{"description":"调研","prompt":"读内核源码"}' },
      useSession: undefined, useSessions: (sel) => sel({ byId: {} }), sessionId: 'parent-1',
    });
  });
  assert.equal(out, null, 'jsx stub 返回 null');

  // 脏块（null / 缺字段）
  assert.doesNotThrow(() => row({ callId: 'x', toolName: 'subagent', block: null }));
  assert.doesNotThrow(() => row({ toolName: 'subagent', block: { kind: 'tool-result', call: null } }));
  // useSessions 抛错也不炸
  assert.doesNotThrow(() => row({
    callId: 'c', toolName: 'subagent',
    block: { callId: 'c', name: 'subagent', argsRaw: '{}' },
    useSessions: () => { throw new Error('snapshot boom'); }, sessionId: 'p',
  }));
});

test('vm 沙箱：聚合条组件渲染冒烟（空会话 null / 有活动渲染 / 脏快照不炸）', () => {
  const mod = loadClientModule();
  const ctx = makeFakeCtx();
  mod.apply(ctx);
  const strip = ctx.registered.find((r) => r.entry.name === 'conversation.session.header.utilities').comp;

  const snapOf = (chat, extra) => (sel) => sel({ chat, running: false, subagent: null, ...extra });
  // 空会话：零足迹 null
  let out;
  assert.doesNotThrow(() => { out = strip({ sessionId: 's1', useSession: snapOf(null), useSessions: (sel) => sel({ byId: {} }) }); });
  assert.equal(out, null);
  // 有 bash 调用：渲染
  const nodes = new Map([['k1', {
    kind: 'tool-call',
    data: { root: { callId: 'c1', name: 'bash', argsRaw: '{"command":"ls -la"}', subCalls: [] } },
  }]]);
  assert.doesNotThrow(() => {
    out = strip({ sessionId: 's1', useSession: snapOf({ nodes }), useSessions: (sel) => sel({ byId: {} }) });
  });
  assert.equal(out, null, 'jsx stub 下渲染结果为 null（不抛即过）');
  // 子代理会话（无活动也显示）
  assert.doesNotThrow(() => {
    strip({ sessionId: 's2', useSession: snapOf(null, { subagent: { address: {} } }), useSessions: (sel) => sel({ byId: {} }) });
  });
  // 脏快照 / hooks 抛错
  assert.doesNotThrow(() => strip({ sessionId: 's', useSession: () => { throw new Error('boom'); } }));
  assert.doesNotThrow(() => strip({}));
});

test('vm 沙箱：设置卡渲染冒烟（未就绪 / 就绪两态）', async () => {
  const mod = loadClientModule();
  const ctx = makeFakeCtx();
  mod.apply(ctx);
  const card = ctx.registered.find((r) => r.entry.name === 'settings.section');
  const Card = card.comp;
  const injected = card.entry.inject ? card.entry.inject() : {};
  // 未就绪：describe 还没落地（快照停在 loading）
  assert.doesNotThrow(() => Card(injected));
  // 就绪：等 describe 的 promise settle 后快照转 ready
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(ctx.describeCalls.n, 1, 'apply 应触发一次 describe');
  assert.doesNotThrow(() => Card(card.entry.inject()));
  // 合成 ready 快照（不依赖远端回执形状）
  const readyScope = { useScope: (sel) => sel({ status: 'ready', value: { enabled: true }, writable: true }), scope: { set: async () => {} } };
  assert.doesNotThrow(() => Card(readyScope));
});

// ---------------------------------------------------------------------------
// 7) 装配登记与元数据（hub 识别单一数据源）
// ---------------------------------------------------------------------------
test('COMPANION_PLUGINS 登记新插件（append，不扰动既有条目）', () => {
  const { COMPANION_PLUGINS } = require('../lib/companion-plugins');
  const entry = COMPANION_PLUGINS.find((p) => p.id === 'dsh-subagent-lens');
  assert.ok(entry, '配套清单应含 dsh-subagent-lens');
  assert.equal(entry.name, '@dsh-external/dsh-subagent-lens');
  assert.equal(COMPANION_PLUGINS.filter((p) => p.id === 'dsh-subagent-lens').length, 1, '不得重复登记');
});

test('assets 元数据过 hub 校验（inspectCompanionMeta 全绿）', () => {
  const { inspectCompanionMeta } = require('../lib/hub-registry');
  const check = inspectCompanionMeta(PLUGIN_DIR, { id: 'dsh-subagent-lens', name: '@dsh-external/dsh-subagent-lens' });
  assert.deepEqual(check.reasons, [], '元数据不应有不合格项');
  assert.equal(check.ok, true);
  assert.equal(check.version, '0.1.1');
});

test('同步文件清单覆盖：插件文件均在 PLUGIN_FILES/SYNC_SUBDIRS 同步范围内', () => {
  // PLUGIN_FILES / SYNC_SUBDIRS 未从 companion-profile 导出（内部常量），
  // 从源文本解析两份字面量做回归断言（新增插件文件漏出同步范围时报警）。
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'companion-profile.js'), 'utf8');
  const listOf = (name) => {
    const m = src.match(new RegExp('const ' + name + ' = \\[([^\\]]+)\\]'));
    assert.ok(m, 'companion-profile.js 应声明 ' + name);
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
  };
  const pluginFiles = listOf('PLUGIN_FILES');
  const syncSubdirs = listOf('SYNC_SUBDIRS');
  // 有意「只进仓库、不进 profile」的条目：CHANGELOG.md 是溯源账，test/ 是上游自带
  // 单测——两者都不在运行时 require 路径上，上游 tarball 的 files 字段同样不含。
  const REPO_ONLY = ['CHANGELOG.md', 'test'];
  const entries = fs.readdirSync(PLUGIN_DIR);
  for (const f of entries) {
    if (REPO_ONLY.includes(f)) continue;
    const covered = pluginFiles.includes(f) || syncSubdirs.includes(f);
    assert.ok(covered, '未被同步机制收录的文件/目录: ' + f);
  }
  // 白名单不许腐烂：列了却已不存在的条目会让本守卫变成橡皮章
  for (const f of REPO_ONLY) {
    assert.ok(entries.includes(f), 'repo-only 允许集里的条目已不存在，应撤除: ' + f);
  }
  // lib 内全部文件经 SYNC_SUBDIRS 的 lib/ 目录级同步覆盖
  for (const f of fs.readdirSync(path.join(PLUGIN_DIR, 'lib'))) {
    assert.ok(fs.statSync(path.join(PLUGIN_DIR, 'lib', f)).isFile(), 'lib 内不应有嵌套目录: ' + f);
  }
});

// ---------------------------------------------------------------------------
// 8) M1（2026-08「开多了子代理后不稳定、白屏」）：增量扫描缓存。
//
// 根因链配套：内核 Session.events 数组常驻只追加，展开行 1.2s tick 与
// 父会话流式重渲染对同一数组的重复全量重扫是 O(N²) CPU+GC 放大器。
// activityFromEventsCached 按「数组身份 + 已扫长度」增量续扫；聚合条
// stripSummaryCached 按节点表身份 + 尺寸（1s 窗）节流。以下断言缓存版
// 与全量版**语义等价**且增量路径正确。
// ---------------------------------------------------------------------------
function callEventM1(callId, name, args, seq) {
  return { type: 'tool/call', seq, data: { callId, name, arguments: JSON.stringify(args) } };
}
function resultEventM1(callId, isError, seq) {
  return { type: 'tool/result', seq, data: { message: { source: { callId }, content: [{ type: 'tool-result', isError }] } } };
}

test('activityFromEventsCached：与全量版语义等价（命令/文件/错误标记）', () => {
  const events = [
    callEventM1('a1', 'bash', { command: 'ls' }, 1),
    callEventM1('a2', 'read', { file_path: 'C:/x.js' }, 2),
    callEventM1('a3', 'subagent', { description: 'd' }, 3),
    resultEventM1('a1', true, 4),
  ];
  const fresh = lens.activityFromEvents(events, { commandChars: 400 });
  const cached = lens.activityFromEventsCached(events, { commandChars: 400 });
  jsonEq([...cached.commands].map((c) => ({ c: c.command, e: !!c.error })), [...fresh.commands].map((c) => ({ c: c.command, e: !!c.error })));
  jsonEq(cached.fileSeeds, fresh.fileSeeds);
  assert.equal(cached.commands.length, 1, '非活动工具（subagent）不产命令');
  assert.equal(cached.commands[0].error, true, 'tool/result 错误标记回写');
  // 非数组输入直通全量版
  jsonEq(lens.activityFromEventsCached(null, {}), { commands: [], fileSeeds: [] });
});

test('activityFromEventsCached：追加增量（只扫新增段）+ 迟到错误回写旧条目', () => {
  const events = [callEventM1('c1', 'bash', { command: 'git status' }, 1)];
  const first = lens.activityFromEventsCached(events, { commandChars: 400 });
  assert.equal(first.commands.length, 1);
  // 追加两条（内核 appendLive 语义：同一数组 push）——增量路径覆盖新增段。
  events.push(callEventM1('c2', 'pwsh', { command: 'dir' }, 2), resultEventM1('c1', true, 3));
  const second = lens.activityFromEventsCached(events, { commandChars: 400 });
  assert.equal(second.commands.length, 2, '增量续扫必须含新增命令');
  assert.equal(second.commands[0].command, 'git status');
  assert.equal(second.commands[0].error, true, '迟到的错误标记必须回写旧条目对象');
  // 与全量重扫等价
  const fresh = lens.activityFromEvents(events, { commandChars: 400 });
  jsonEq([...second.commands].map((c) => ({ c: c.command, e: !!c.error })), [...fresh.commands].map((c) => ({ c: c.command, e: !!c.error })));
});

test('activityFromEventsCached：数组换新（窗口重建）与配置漂移自动失效', () => {
  const e1 = [callEventM1('k1', 'bash', { command: 'a'.repeat(900) }, 1)];
  const s1 = lens.activityFromEventsCached(e1, { commandChars: 400 });
  assert.equal(s1.commands[0].truncated, true, '400 字符截断生效');
  // 同一数组不同 commandChars → 缓存失效全量重扫
  const s2 = lens.activityFromEventsCached(e1, { commandChars: 800 });
  assert.equal(s2.commands[0].command.length, 800, '配置漂移后按新长度截断');
  // 新数组身份（installWindow 整体换新）→ WeakMap 天然失效
  const e2 = [callEventM1('k2', 'bash', { command: 'echo new' }, 1)];
  const s3 = lens.activityFromEventsCached(e2, { commandChars: 400 });
  assert.equal(s3.commands[0].command, 'echo new');
});

test('stripSummaryCached：摘要缓存 + 尺寸变化即时重算', () => {
  const mkChat = (n) => {
    const nodes = new Map();
    for (let i = 0; i < n; i++) {
      nodes.set('k' + i, { kind: 'tool-call', data: { root: { callId: 'r' + i, name: 'bash', argsRaw: JSON.stringify({ command: 'cmd ' + i }), subCalls: [] } } });
    }
    return { nodes };
  };
  const chat = mkChat(2);
  const o = { commandChars: 400, maxItems: 50 };
  const s1 = lens.stripSummaryCached(chat, o);
  assert.equal(s1.commandCount, 2, '两个 bash 根块');
  // 同一节点表、尺寸未变、1s 窗内 → 复用缓存对象（引用相等）
  const s2 = lens.stripSummaryCached(chat, o);
  assert.equal(s1, s2, '尺寸未变 1s 窗内应复用缓存摘要');
  // 新节点入表（尺寸变化）→ 立即重算
  chat.nodes.set('k2', { kind: 'tool-call', data: { root: { callId: 'r2', name: 'bash', argsRaw: JSON.stringify({ command: 'cmd 2' }), subCalls: [] } } });
  const s3 = lens.stripSummaryCached(chat, o);
  assert.notEqual(s3, s2, '尺寸变化必须立即重算');
  assert.equal(s3.commandCount, 3);
  // 空快照（无节点表）直通降级
  const s0 = lens.stripSummaryCached(null, o);
  assert.equal(s0.commandCount, 0);
});
