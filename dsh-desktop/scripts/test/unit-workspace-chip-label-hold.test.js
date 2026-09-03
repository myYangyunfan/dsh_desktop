'use strict';

// ---------------------------------------------------------------------------
// workspace-chip-label-hold 补丁单测（三态契约 + 行为验证 + 登记完整性）。
//
// 背景（0.1.2-alpha.5「选择工作文件夹时跳闪」）：dsh-client-ui-conversation
// 的 ConversationRoot 里 chipTitle 只在 workspace 投影 phase !== "ready" 时才
// 回退 session.cwd 派生标签。选完文件夹的那一帧，会话已 open、cwd 已就位，而
// workspaces.items[].sessionIds 要等宿主下一次 upsert 才回显 ⇒ chipTitle 塌成
// undefined ⇒ chip 闪回「选择工作区」（图标换关闭态、宽度跳变）+ inert 命中使
// 输入框 disabled、placeholder 变「选择一个工作区开始」。补丁删除该表达式里的
// `workspaces.phase === "ready" ||` 一项。
//
// 本文件用与内核产物同构的最小 fixture 验证：
//   1) pristine → changed，产物含 marker、gate 项已删、其余判定行原样保留；
//   2) 产物 / marker-only → already（幂等）；
//   3) 锚点缺失（上游已自行去掉 gate 的形态 / 空源）→ anchor-missing +
//      detail 含文件名，绝不携带 src（自然退役语义）；
//   4) 行为：vm 实跑 chipTitle/inert 派生——投影缺口帧不再塌空；无 cwd 的真空
//      hero 仍塌空（语义保持）；权威 workspace.title 仍优先；产物语法可解析；
//   5) 真实内核产物（.tmp-kernel built lib）上 pristine → changed（锚点漂移哨兵）；
//   6) registry 登记字段契约（pkgRel/cli/marker/failPolicy/order 与单一数据源）。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  transformWorkspaceChipLabelHold,
  markers: { WORKSPACE_CHIP_LABEL_MARKER },
} = require('../lib/patch-adapters');
const { CONVERSATION_PKG_REL } = require('../lib/patch-target-resolver');
const { PATCH_SPECS } = require('../lib/patch-registry');

const CHIP_TITLE_PREFIX = 'const chipTitle = pendingWorkspace?.title ?? (sessionId === void 0 ? void 0 : sessionWorkspace?.title ?? ';
const GATED_TAIL = '(workspaces.phase === "ready" || cwd === void 0 || cwd === "" ? void 0 : workspaceLabel(cwd)));';
const UNGATED_TAIL = '(cwd === void 0 || cwd === "" ? void 0 : workspaceLabel(cwd)));';
const PRISTINE_CHIP_LINE = '\t\t\t' + CHIP_TITLE_PREFIX + GATED_TAIL;
const GATE_TERM = 'workspaces.phase === "ready" || ';

// 与 dsh-client-ui-conversation/lib/client.js ConversationRoot 同构的最小源
// （锚点行字节级一致：三 tab 缩进 + 同一表达式）。
const PRISTINE = [
  '\t\tfunction workspaceLabel(cwd) {',
  '\t\t\tconst base = String(cwd).split(/[\\\\/]/).pop();',
  '\t\t\treturn base !== "" ? base : cwd;',
  '\t\t}',
  '\t\tfunction ConversationRoot({ sessionId, cwd, workspaces, pendingWorkspaceId, blankOpen }) {',
  '\t\t\tconst sessionWorkspace = sessionId === void 0 ? void 0 : workspaces.items.find((workspace) => workspace.sessionIds.includes(sessionId));',
  '\t\t\tconst pendingWorkspace = workspaces.items.find((workspace) => workspace.workspaceId === pendingWorkspaceId);',
  '\t\t\t// 真实产物：hero = sessionId === void 0 || shellPhase === "blank" && (openState === "open" || summaryBlank === true);',
  '\t\t\t// 此处以 blankOpen 入参代位（新开空白会话 hero 态 = true）。',
  '\t\t\tconst hero = sessionId === void 0 || blankOpen === true;',
  PRISTINE_CHIP_LINE,
  '\t\t\tconst inert = sessionId === void 0 || hero && chipTitle === void 0;',
  '\t\t\treturn { chipTitle, inert };',
  '\t\t}',
].join('\n');

const LABEL = 'conversation-client.js';
// 0.1.2-alpha 内核构建产物（未经桌面补丁）：锚点漂移哨兵的 pristine 源。
const KERNEL_CONV_CLIENT = path.join(
  __dirname, '..', '..', '..', '.tmp-kernel', 'packages', 'client', 'ui-conversation', 'lib', 'client.js',
);

/** 实跑 fixture 产物，返回 { ConversationRoot } 所在沙箱上下文。 */
function evaluateProduct(product) {
  const context = {};
  vm.createContext(context);
  vm.runInContext(product + '\n;__root = ConversationRoot;', context);
  return context.__root;
}

const GAP_FRAME = {
  // 选完文件夹后的一帧：会话已 open（sessionId 有值）、cwd 已就位、空白新会话
  // 处于 hero 态，workspace 投影 phase 已 ready 但 sessionIds 尚未回含该会话。
  sessionId: 's-new',
  cwd: 'C:\\work\\demo',
  workspaces: { phase: 'ready', items: [] },
  pendingWorkspaceId: void 0,
  blankOpen: true,
};

test('pristine → changed：gate 项已删、marker 在位、其余判定行不受扰', () => {
  const r = transformWorkspaceChipLabelHold(PRISTINE, LABEL);
  assert.equal(r.status, 'changed');
  assert.equal(typeof r.src, 'string');
  assert.notEqual(r.src, PRISTINE);
  assert.ok(r.src.includes(WORKSPACE_CHIP_LABEL_MARKER), '产物应含幂等 marker');
  assert.ok(r.src.includes(CHIP_TITLE_PREFIX + UNGATED_TAIL), 'chipTitle 应改为仅由 cwd 空值收敛');
  assert.ok(r.src.includes('cwd === void 0 || cwd === ""'), '无 cwd 收敛分支必须保留');
  // 只动 chipTitle 一行：hero / inert / sessionWorkspace / pendingWorkspace 原样。
  assert.ok(r.src.includes('\t\t\tconst hero = sessionId === void 0 || blankOpen === true;'), 'hero 行不得改动');
  assert.ok(r.src.includes('\t\t\tconst inert = sessionId === void 0 || hero && chipTitle === void 0;'), 'inert 行不得改动');
  assert.ok(r.src.includes('const sessionWorkspace = sessionId === void 0'), 'sessionWorkspace 行不得改动');
  // 注入体缩进与原行一致（三 tab），且注入后 chipTitle 仍独占一行。
  const chipLines = r.src.split('\n').filter((line) => line.includes('const chipTitle ='));
  assert.equal(chipLines.length, 1, 'chipTitle 仍应恰有一处定义');
  assert.ok(chipLines[0].startsWith('\t\t\tconst chipTitle ='), '注入行须保持三 tab 缩进');
  // gate 项只在 chipTitle 行上断言（注入说明注释里会原文引用被删项）。
  assert.ok(!chipLines[0].includes(GATE_TERM), 'chipTitle 行里的 workspaces.phase gate 项应被删除');
});

test('产物语法自洽（new vm.Script 可解析）', () => {
  const r = transformWorkspaceChipLabelHold(PRISTINE, LABEL);
  assert.doesNotThrow(() => new vm.Script('(function(){\n' + r.src + '\nreturn ConversationRoot;\n})'), '注入体必须保持可解析');
});

test('已应用 / marker-only → already（幂等，不得携带 src）', () => {
  const changed = transformWorkspaceChipLabelHold(PRISTINE, LABEL);
  const again = transformWorkspaceChipLabelHold(changed.src, LABEL);
  assert.equal(again.status, 'already');
  assert.equal(again.src, undefined);
  const markerOnly = transformWorkspaceChipLabelHold('// ' + WORKSPACE_CHIP_LABEL_MARKER + '\n', LABEL);
  assert.equal(markerOnly.status, 'already');
});

test('锚点缺失 → anchor-missing（含上游自然退役形态）', () => {
  // 上游若自行去掉 gate（或改掉该表达式），补丁必须失配跳过、绝不改写。
  const retired = PRISTINE.replace(PRISTINE_CHIP_LINE, '\t\t\t' + CHIP_TITLE_PREFIX + UNGATED_TAIL);
  const r1 = transformWorkspaceChipLabelHold(retired, LABEL);
  assert.equal(r1.status, 'anchor-missing', '上游已内置同款放宽 → 应 anchor-missing 退役');
  assert.ok(r1.detail && r1.detail.includes(LABEL), 'detail 应含文件名');
  assert.equal(r1.src, undefined, 'anchor-missing 不得携带 src');
  // 整行挖除 / 空源同样失配。
  for (const [name, src] of Object.entries({
    '整行缺失': PRISTINE.replace(PRISTINE_CHIP_LINE + '\n', ''),
    '空源': '// ta6 poisoned\n',
  })) {
    const r = transformWorkspaceChipLabelHold(src, LABEL);
    assert.equal(r.status, 'anchor-missing', `${name} 应 anchor-missing`);
    assert.ok(r.detail.includes(LABEL), `${name} detail 应含文件名`);
  }
});

test('行为：投影缺口帧不再塌回「选择工作区」/禁用输入框', () => {
  // pristine 形态复现症状：chipTitle undefined ⇒ inert true（chip 闪占位文案、
  // composer disabled + placeholder「选择一个工作区开始」）。
  const before = evaluateProduct(PRISTINE)(GAP_FRAME);
  assert.equal(before.chipTitle, undefined, '未打补丁时缺口帧应塌空（症状复现）');
  assert.equal(before.inert, true, '未打补丁时缺口帧 composer 应 inert');

  const changed = transformWorkspaceChipLabelHold(PRISTINE, LABEL);
  const after = evaluateProduct(changed.src)(GAP_FRAME);
  assert.equal(after.chipTitle, 'demo', '缺口帧应由 cwd 派生标签顶上（与回显后的标题同源）');
  assert.equal(after.inert, false, '缺口帧 composer 不得再 inert');
});

test('行为：权威投影与空目录语义保持', () => {
  const changed = transformWorkspaceChipLabelHold(PRISTINE, LABEL);
  const root = evaluateProduct(changed.src);
  // 1) 投影回显后：workspace.title 仍优先于 cwd 派生标签（可含用户改名）。
  const settled = root({
    sessionId: 's-new',
    cwd: 'C:\\work\\demo',
    workspaces: { phase: 'ready', items: [{ workspaceId: 'w1', title: '我的主仓', sessionIds: ['s-new'] }] },
    pendingWorkspaceId: void 0,
    blankOpen: true,
  });
  assert.equal(settled.chipTitle, '我的主仓', '投影到位后仍取 workspace.title');
  // 2) pendingWorkspace（刚点选、尚未切换）优先级不变。
  const pending = root({
    sessionId: 's-new',
    cwd: 'C:\\work\\demo',
    workspaces: { phase: 'ready', items: [{ workspaceId: 'w2', title: '待接入', sessionIds: [] }] },
    pendingWorkspaceId: 'w2',
    blankOpen: true,
  });
  assert.equal(pending.chipTitle, '待接入', 'pendingWorkspace.title 仍最高优先');
  // 3) 无会话（真空 hero）与无 cwd 会话：chipTitle 仍塌空，「选择工作区」引导不丢。
  const noSession = root({ sessionId: void 0, cwd: 'C:\\work\\demo', workspaces: { phase: 'ready', items: [] }, pendingWorkspaceId: void 0, blankOpen: false });
  assert.equal(noSession.chipTitle, undefined, '无会话时不得凭空给出标签');
  assert.equal(noSession.inert, true, '无会话 hero 仍应引导选择工作区');
  for (const cwd of [void 0, '']) {
    const noCwd = root({ sessionId: 's-x', cwd, workspaces: { phase: 'ready', items: [] }, pendingWorkspaceId: void 0, blankOpen: true });
    assert.equal(noCwd.chipTitle, undefined, `cwd=${JSON.stringify(cwd)} 的空目录态语义须保持`);
    assert.equal(noCwd.inert, true, '空目录会话仍走 inert composer 引导');
  }
});

const KERNEL_SKIP_REASON = fs.existsSync(KERNEL_CONV_CLIENT) ? false : '.tmp-kernel 构建产物不可用';

test('真实内核产物（.tmp-kernel built lib）上 pristine → changed（锚点漂移哨兵）', { skip: KERNEL_SKIP_REASON }, () => {
  const src = fs.readFileSync(KERNEL_CONV_CLIENT, 'utf8');
  assert.equal(
    (src.match(/const chipTitle = pendingWorkspace\?\.title/g) || []).length, 1,
    'pristine 内核产物里 chipTitle 应恰有一处（锚点唯一性前提）',
  );
  const r = transformWorkspaceChipLabelHold(src, KERNEL_CONV_CLIENT);
  assert.equal(r.status, 'changed', `对 alpha 内核产物应 changed，得 ${r.status}（${r.detail || ''}）`);
  assert.ok(r.src.includes(WORKSPACE_CHIP_LABEL_MARKER));
});

test('registry 登记契约：workspace-chip-label-hold 字段齐全且与实现同源', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'workspace-chip-label-hold');
  assert.ok(spec, '补丁必须登记进 patch-registry（本仓纪律）');
  assert.equal(spec.kind, 'file');
  assert.equal(spec.group, 'runtime');
  assert.equal(spec.order, 350);
  assert.equal(spec.layout, 'runtime-local');
  assert.equal(spec.wslLayout, 'wsl');
  assert.equal(spec.pkgRel, CONVERSATION_PKG_REL, 'pkgRel 必须走 patch-target-resolver 常量');
  assert.equal(spec.transform, transformWorkspaceChipLabelHold, 'transform 须与 patch-adapters 导出同源');
  assert.equal(spec.marker, WORKSPACE_CHIP_LABEL_MARKER, 'marker 须引用共享常量（单一数据源）');
  assert.equal(spec.failPolicy, 'warn');
  assert.equal(spec.cli, true, 'boot 与 CLI 同步期均应应用');
  assert.equal(typeof spec.logs.doneLog, 'function');
  assert.ok(spec.logs.doneLog('X').includes('选择工作文件夹'), 'doneLog 文案应直指报障症状');
});
