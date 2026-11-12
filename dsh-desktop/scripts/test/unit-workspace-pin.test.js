'use strict';

// 工作区置顶补丁（workspace-pin）单测。
//
// 覆盖四层：
//   1. 锚点/幂等契约：夹具（buildUiFixture）应用 → changed=1 + marker 落盘 +
//      产物 node --check 语法过；二遍 changed=0；锚点缺失时跳过不落盘；
//   2. 核心行为（CORE 直接 eval —— 测试验的与注入 bundle 跑的是同一份代码）：
//      置顶切换 / 多选降序压顶 / 未分组不参与 / 未置顶保原序 / localStorage
//      持久化与损坏容错 / 版本号通知；
//   3. 真实 vendored 产物锚点命中（只读）：现场（已打 open-project-dir）的
//      dsh-client-ui-workspace/lib/client.js 必须包含全部锚点——内核升级导致
//      形态漂移时，此处先于 boot 链报出来；
//   4. 判据不得空转：MUTATES 豁免表里每一条都必须仍被某个改写型锚命中（0.2.2-rc.1
//      把项目行菜单搬到 ctx.contextMenus，内联数组时代的豁免项已 0 命中）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const { patchWorkspacePin, MARKER, buildUiFixture, CORE, UI_REPLACEMENTS, verifyVersionScope } = require('../patch-workspace-pin');

// 真实 vendored 产物（只读哨兵与语法验证基底；提前定义供下方注册期求值）。
const VENDORED = path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js');

// ---------------------------------------------------------------------------
// 1. 锚点/幂等契约
// ---------------------------------------------------------------------------

function makeSandbox(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ws-pin-'));
  const file = path.join(dir, '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buildUiFixture(), 'utf8');
  return { dir, file };
}

test('夹具应用：changed=1、marker 落盘、菜单/排序/翻译注入齐', () => {
  const sb = makeSandbox();
  try {
    const logs = [];
    const n = patchWorkspacePin(sb.dir, (m) => logs.push(m));
    assert.equal(n, 1, '应修改 1 个文件');
    assert.equal(logs.filter((l) => l.includes('已应用')).length, 1);
    const out = fs.readFileSync(sb.file, 'utf8').replace(/\r\n/g, '\n');
    assert.ok(out.includes(MARKER), 'marker 应落盘（幂等锚）');
    assert.ok(out.includes('dshToggleWorkspacePin'), 'store 应注入');
    assert.ok(out.includes('dshApplyWorkspacePins(groups)'), '分组排序应接线');
    // 0.2.2-rc.1：菜单项由内联 workspaceMenuItems 数组改成 ctx.contextMenus 数据项，
    // 图标键直接复用上游的 workspace.pin / workspace.unpin（上游图标表里本来就有
    // 这两个键，故不能拿裸的 `"workspace.pin"` 当判据——那份字节原生就在，删掉注入体
    // 仍然绿；判据必须落在本补丁独有的 id / 翻译文案上）。
    // 0.2.2-rc.2：客户端产物整体压缩（单行、双引号转模板字面量、无空格），
    // 判据按压缩形重录。仍咬「id + target + order」三件同时到位：裸的 `order: 200`
    // 在 pristine 上本来就有别处的同名项，单独当判据等于空转。
    assert.ok(
      out.includes('ctx.contextMenus.register({id:`workspace.pinToggle`,target:`workspace`,order:200,'),
      '置顶项应注册为 workspace 目标 order 200 的 contextMenus 数据项'
    );
    assert.ok(
      out.includes('icon:{key:dshWorkspacePinState(workspaceId)?`workspace.unpin`:`workspace.pin`}'),
      '图标应复用上游 workspace.pin / workspace.unpin 键'
    );
    assert.ok(
      out.includes('label:ctx.locale.bind(NS)(dshWorkspacePinState(workspaceId)?`workspace.unpin`:`workspace.pin`)'),
      '标签应随置顶态切换上游 workspace.pin / workspace.unpin 词条'
    );
    assert.ok(out.includes('"workspace.pin":`置顶到列表顶部`'), 'zh「置顶」翻译应注入');
    assert.ok(out.includes('"workspace.unpin":`取消置顶`'), 'zh「取消置顶」翻译应注入');
    assert.ok(out.includes('"workspace.pin":`Pin to top`'), 'en「Pin to top」翻译应注入');
    assert.ok(out.includes('"workspace.unpin":`Unpin`'), 'en「Unpin」翻译应注入');
    assert.ok(out.includes('dshWsPinVersion'), 'SessionTree 版本号应进作用域与 deps');
    // 注：夹具是锚点拼接（未闭合的字面量，open-project-dir 同款设计），不作
    // 语法检查——语法验证由下一测在真实 vendored 副本上做。
  } finally {
    fs.rmSync(sb.dir, { recursive: true, force: true });
  }
});

test('真实产物副本应用：注入后语法合法（vendored 现场基底）', { skip: !fs.existsSync(VENDORED) ? 'vendored dsh-client-ui-workspace 不在位' : false }, () => {
  const sb = makeSandbox();
  try {
    fs.copyFileSync(VENDORED, sb.file);
    const n = patchWorkspacePin(sb.dir, () => {});
    assert.ok(n === 0 || n === 1, '幂等或应用均合法（现场可能已打过）');
    const out = fs.readFileSync(sb.file, 'utf8');
    if (n === 1) {
      assert.ok(out.includes(MARKER) && out.includes('dshApplyWorkspacePins(groups)'), '应用后应含注入');
      const r = spawnSync(process.execPath, ['--check', sb.file], { encoding: 'utf8' });
      assert.equal(r.status, 0, `真实产物注入后语法必须合法: ${r.stderr}`);
    }
  } finally {
    fs.rmSync(sb.dir, { recursive: true, force: true });
  }
});

test('幂等：二遍 changed=0（marker 命中即跳过）', () => {
  const sb = makeSandbox();
  try {
    assert.equal(patchWorkspacePin(sb.dir, () => {}), 1);
    const logs = [];
    assert.equal(patchWorkspacePin(sb.dir, (m) => logs.push(m)), 0, '二遍不得再改');
    assert.ok(logs.some((l) => l.includes('已应用，跳过')), '应记录跳过日志');
  } finally {
    fs.rmSync(sb.dir, { recursive: true, force: true });
  }
});

test('锚点缺失：整文件跳过、绝不落盘半截', () => {
  const sb = makeSandbox();
  try {
    // 抽掉一个锚（排序锚的收尾 `return groups;` 已随 rc.2 压成
    // `return groups}function sessionMemberIds(`，改抽这条尾界的前半
    // `function sessionMemberIds(`），applyReplacements 应在该锚前回滚（前面锚点的
    // 替换只发生在内存 src，未落盘）。
    let fixture = buildUiFixture().replace(/\r\n/g, '\n');
    const mutated = fixture.replace('function sessionMemberIds(', 'function sessionMemberIdsGone(');
    // 反证替换必须真的生效：压缩/重录后若这条子串不再命中，replace 会静默空转，
    // 用例就退化成「未变异体上判绿」——本仓栽过这一跤（AGENTS.md 行尾那条）。
    assert.notStrictEqual(mutated, fixture, '反证用的锚子串必须仍在夹具里');
    fixture = mutated;
    fs.writeFileSync(sb.file, fixture, 'utf8');
    const stats = { anchorMissing: 0 };
    const n = patchWorkspacePin(sb.dir, () => {}, stats);
    assert.equal(n, 0, '不得计入 changed');
    assert.equal(stats.anchorMissing, 1, '锚点缺失应计数');
    assert.ok(!fs.readFileSync(sb.file, 'utf8').includes(MARKER), '失败路径不得落盘');
  } finally {
    fs.rmSync(sb.dir, { recursive: true, force: true });
  }
});

// 逐锚点反证：11 个锚任意缺一个都必须「整文件跳过 + 字节级不变 + anchorMissing=1」。
// 只测「锚都在位时补丁成功」是假绿的一半来源——rc.2 换代时 UI_HOOKS 的 menuRect
// 锚、UI_ZH/EN 的 menu.openProjectDir 锚（那是 open-project-dir 自己的产物，不是
// 原生字节）就是这样被这条测出来必须重锚的。
test('逐锚点反证：任一锚缺失都必须整文件跳过且不落盘', (t) => {
  const full = buildUiFixture().replace(/\r\n/g, '\n');
  UI_REPLACEMENTS.forEach((r, i) => {
    const broken = full.replace(r.anchor, '/* ANCHOR-GONE */');
    assert.notStrictEqual(broken, full, `夹具里找不到锚 #${i}: ${r.anchor.slice(0, 40)}`);
    const sb = makeSandbox();
    try {
      fs.writeFileSync(sb.file, broken, 'utf8');
      const stats = { anchorMissing: 0, failed: 0 };
      const n = patchWorkspacePin(sb.dir, () => {}, stats);
      assert.strictEqual(n, 0, `锚 #${i} 缺失时不得计入 changed`);
      assert.strictEqual(stats.anchorMissing, 1, `锚 #${i} 缺失应计 anchorMissing=1`);
      assert.strictEqual(fs.readFileSync(sb.file, 'utf8'), broken, `锚 #${i} 缺失时文件字节级不变`);
    } finally {
      fs.rmSync(sb.dir, { recursive: true, force: true });
    }
  });
});

// 锚点必须互不嵌套：夹具是锚点顺序拼接，某锚若在另一锚体内再出现，real bundle 上
// 的 String.replace 就可能打到错误的那一处（置顶接线打进了兄弟函数）。
test('锚点唯一性：夹具中每个锚恰好命中一次', () => {
  const fx = buildUiFixture().replace(/\r\n/g, '\n');
  UI_REPLACEMENTS.forEach((r, i) => {
    const hits = fx.split(r.anchor).length - 1;
    assert.strictEqual(hits, 1, `锚 #${i} 应命中 1 次，实为 ${hits}：${r.anchor.slice(0, 50)}`);
  });
});

// 链式安全：insert 默认原样保留自己的锚，这样共享同一原生锚的补丁（open-project-dir
// 共用 `menu.unarchiveSession` 翻译锚）无论谁先跑都能命中；确实改写原生字节的须显式登记。
// 0.2.2-rc.2 重录（客户端产物压缩：换行缩进被剥、双引号转模板字面量、对象字面量
// 去空格）——旧表的可读字节（`className: clsx(...)` 带空格、`return groups;`）在
// 新产物里 0 命中，豁免项僵留会让「豁免」二字变成空话，故下面另有一条用例咬它。
const MUTATES = [
  '{className:clsx(Rows_module_css_default.slot',   // folder 图标着色（span 里插 style 行）
  '{className:Rows_module_css_default.projectText', // 标题 span：jsx→jsxs 并插置顶小圆点
  'return groups}function sessionMemberIds(',       // 分组产出改走置顶重排（函数声明成了新的尾界）
  'statuses,',                                      // deps 尾项追加版本号
];
test('链式安全：insert 保留锚，改写原生字节的须进 MUTATES 豁免表', () => {
  UI_REPLACEMENTS.forEach((r, i) => {
    if (r.insert.includes(r.anchor)) return;
    assert.ok(
      MUTATES.some((head) => r.anchor.includes(head)),
      `锚 #${i} 的 insert 未保留锚，也未登记为改写型：${r.anchor.slice(0, 60)}`
    );
  });
});

// 豁免表反向咬合：每一条豁免都必须真的落在某个「不保留锚」的替换上。
// 旧内核片段的僵留（如 workspaceMenuItems 时代那几行）在这里当场判红，而不是
// 悄悄躺在表里当装饰——「旧键 0 命中」正是换代后判据空转最常见的那一种。
test('MUTATES 豁免项必须仍锚在新字节上（旧内核片段不得僵留）', () => {
  const mutating = UI_REPLACEMENTS.filter((r) => !r.insert.includes(r.anchor));
  assert.ok(mutating.length > 0, '夹具里应存在改写型替换（否则豁免表本身失去意义）');
  MUTATES.forEach((head) => {
    const used = mutating.filter((r) => r.anchor.includes(head)).length;
    assert.equal(used, 1, `豁免项应恰好被一个改写型锚命中，实为 ${used}（旧内核片段，应删除或按新字节重录）：${head}`);
  });
});

// ---------------------------------------------------------------------------
// 2. 核心行为（CORE 与注入同源）
// ---------------------------------------------------------------------------

/** 在隔离 vm 里跑 CORE 并返回 store API + mock 环境（K1 注入体同款验证法：
 *  CORE 是本仓常量而非不可信输入，vm 隔离只为干净作用域）。 */
function evalCore({ stored = null } = {}) {
  const writes = [];
  const sandbox = {
    react: {
      useState: (v) => [v, () => {}],
      useEffect: () => {},
    },
    localStorage: {
      getItem: () => stored,
      setItem: (k, v) => writes.push([k, v]),
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(CORE + '\n;this.__api = { dshWorkspacePins, dshWorkspacePinState, dshToggleWorkspacePin, dshApplyWorkspacePins };', ctx);
  return { ...sandbox.__api, writes };
}

test('置顶切换：pin → pinned，再 pin → 恢复，均通知版本号 + 持久化', () => {
  const c = evalCore();
  assert.equal(c.dshWorkspacePinState('ws-1'), false, '初始未置顶');
  c.dshToggleWorkspacePin('ws-1');
  assert.equal(c.dshWorkspacePinState('ws-1'), true);
  assert.equal(c.dshWorkspacePins.version, 1, '版本号 +1（重渲染信号）');
  assert.equal(c.writes.length, 1, '应写一次 localStorage');
  assert.deepEqual(JSON.parse(c.writes[0][1]), { 'ws-1': c.dshWorkspacePins.map['ws-1'] });
  c.dshToggleWorkspacePin('ws-1');
  assert.equal(c.dshWorkspacePinState('ws-1'), false, '再切取消置顶');
  assert.equal(c.dshWorkspacePins.version, 2);
  assert.deepEqual(JSON.parse(c.writes[1][1]), {}, '取消后持久化为空对象');
  c.dshToggleWorkspacePin(void 0);
  assert.equal(c.dshWorkspacePins.version, 2, '未分组（无 id）不动作');
});

test('排序：多选置顶按时间降序压顶，未置顶保原序，未分组不参与', () => {
  const c = evalCore();
  const g = (workspaceId, tag) => ({ workspaceId, key: workspaceId ?? '', tag });
  const groups = [g(void 0, 'ungrouped'), g('a', 'A'), g('b', 'B'), g('c', 'C'), g('d', 'D')];
  assert.deepEqual(c.dshApplyWorkspacePins(groups), groups, '无置顶时原样返回（同引用）');
  // Array.from 归一：CORE 在 vm 隔离 realm 里跑，跨 realm 数组的原型与
  // deepStrictEqual 的本 realm 原型不等（打印相同仍 fail）——转本 realm 再断。
  const tags = (out) => Array.from(out.map((x) => x.tag));
  // 先 pin b 再 pin a：b 时间早 → a 在 b 上方。
  c.dshToggleWorkspacePin('b');
  c.dshToggleWorkspacePin('a');
  assert.deepEqual(tags(c.dshApplyWorkspacePins(groups)), ['A', 'B', 'ungrouped', 'C', 'D'], '置顶压顶（最近置顶最上），未分组恒不置顶');
  c.dshToggleWorkspacePin('c');
  assert.deepEqual(tags(c.dshApplyWorkspacePins(groups)), ['C', 'A', 'B', 'ungrouped', 'D'], '第三个置顶排最上');
  c.dshToggleWorkspacePin('a');
  assert.deepEqual(tags(c.dshApplyWorkspacePins(groups)), ['C', 'B', 'ungrouped', 'A', 'D'], '取消 a 后剩余置顶仍压顶，A 回原位');
});

test('localStorage 损坏/畸形内容整体忽略（容错优先）', () => {
  for (const stored of ['{not json', '{"a": "not-number"}', 'null', '[1,2]']) {
    const c = evalCore({ stored });
    assert.equal(c.dshWorkspacePinState('a'), false, `畸形存储 ${stored} 不得注入状态`);
    assert.equal(Object.keys(c.dshWorkspacePins.map).length, 0);
  }
  const ok = evalCore({ stored: '{"a": 111, "b": 222}' });
  assert.equal(ok.dshWorkspacePinState('a'), true, '合法存储应恢复置顶态');
  assert.deepEqual(Array.from(ok.dshApplyWorkspacePins([{ workspaceId: 'b' }, { workspaceId: 'a' }]).map((x) => x.workspaceId)), ['b', 'a'], '恢复的 pinMillis 参与降序');
});

// ---------------------------------------------------------------------------
// 3. 真实 vendored 产物锚点命中 + 作用域校验（只读哨兵）
// ---------------------------------------------------------------------------

test('现场 vendored 产物：全部锚点在位且声明与 deps 同作用域（内核形态漂移先于此报出）', { skip: !fs.existsSync(VENDORED) ? 'vendored dsh-client-ui-workspace 不在位' : false }, () => {
  // 行尾归一：多行锚（UI_HOOKS / UI_FOLDER / UI_TITLE / UI_SORT / UI_TREE / UI_DEPS）
  // 在 CRLF 下 includes 恒 false —— 不归一就是判据静默空转。
  const src = fs.readFileSync(VENDORED, 'utf8').replace(/\r\n/g, '\n');
  if (src.includes(MARKER)) {
    assert.ok(src.includes('dshApplyWorkspacePins(groups)'), '已打补丁的现场应含排序接线');
    // 0.6.5 实爆回归：已打补丁的现场也曾「看起来正常」（marker 在位、排序接线在位），
    // 但声明被注进了 SearchResults、deps 留在 SessionTree —— SessionTree 首渲染
    // ReferenceError → sidebar.workspaces 槽位崩溃 → 左侧会话栏空白。故此处不再
    // 只看字符串在场，必须机器校验两者同作用域。
    const scope = verifyVersionScope(src);
    assert.ok(scope.ok, `已打补丁现场必须声明与 deps 同作用域: ${scope.why}`);
    return;
  }
  for (const { anchor } of UI_REPLACEMENTS) {
    assert.ok(src.includes(anchor), `锚点缺失（open-project-dir 是否已应用？）: ${anchor.split('\n')[0].slice(0, 70)}`);
  }
});

test('作用域校验：声明落在别的函数里必须判红（0.6.5 左侧会话栏空白回归锁）', () => {
  const drifted = [
    'function SearchResults({ useSessions }) {',
    '			const dshWsPinVersion = dshUseWorkspacePinVersion();',
    '}',
    'function SessionTree({ list }) {',
    '			}), [',
    '				list,',
    '				dshWsPinVersion',
    '			]);',
    '}',
  ].join('\n');
  const bad = verifyVersionScope(drifted);
  assert.equal(bad.ok, false, '跨函数作用域必须判红');
  assert.equal(bad.fn, 'SearchResults', '应指出声明所在函数');
  assert.equal(bad.deps, 'SessionTree', '应指出 deps 所在函数');

  const good = [
    'function SessionTree({ list }) {',
    '			const dshWsPinVersion = dshUseWorkspacePinVersion();',
    '			}), [',
    '				list,',
    '				dshWsPinVersion',
    '			]);',
    '}',
  ].join('\n');
  assert.equal(verifyVersionScope(good).ok, true, '同作用域应通过');
});

test('作用域校验失败时绝不落盘（锚点漂移 → 整文件跳过）', () => {
  const sb = makeSandbox();
  try {
    // 在「声明锚」与「deps 锚」之间插一个函数头：注入后声明落在前面的函数、
    // deps 落在后面的函数（正是 0.6.5 实爆的跨作用域形态），校验必须拦下。
    const depsAnchor = UI_REPLACEMENTS.find((r) => r.insert.includes('dshWsPinVersion\n')).anchor;
    assert.ok(depsAnchor, '应能定位 deps 锚');
    fs.writeFileSync(sb.file, buildUiFixture().replace(depsAnchor, 'function Other() {\n' + depsAnchor), 'utf8');
    const stats = { anchorMissing: 0 };
    const n = patchWorkspacePin(sb.dir, () => {}, stats);
    assert.equal(n, 0, '不得计入 changed');
    assert.ok(stats.anchorMissing >= 1, '应计数为锚点/作用域失败');
    assert.ok(!fs.readFileSync(sb.file, 'utf8').includes(MARKER), '校验失败不得落盘');
  } finally {
    fs.rmSync(sb.dir, { recursive: true, force: true });
  }
});
