'use strict';

// issue #85 补丁脚本单元测试（node --test）。
//
// 覆盖五层：
//   1. 一次应用 → 产物为 0.2.2-rc.1 的 contextMenus 数据项形态：图标键
//      workspace.openDir 进 contextMenu.icon 槽 + 项目行（target workspace,
//      order 200）与会话行（register("openDir", 500, [], resolve)）两个数据项 +
//      zh/en 翻译；右键菜单本身是上游原生能力，本补丁不再自造锚点矩形；
//   2. 二次幂等（MARKER 命中即整文件跳过）；
//   3. 逐锚点反证：抽掉 5 个锚里的任意一个，都必须「整文件跳过、字节级不变、
//      anchorMissing 计 1」——防止「某个锚其实根本没起作用、补丁默默少注入一处」
//      这种假绿（rc.2 换代时正是靠这条抓到 menuRect/open-folder 两处旧锚失效；
//      0.2.2-rc.1 把行菜单搬到 ctx.contextMenus，旧的三组锚点整体失效又靠它报出）；
//   4. 锚点唯一性：夹具里每个锚恰好命中一次（互不嵌套、互不重叠），否则
//      String.replace 会打到错误的那一处；同一组锚还必须真的能在内核 pristine
//      字节上命中——夹具是自己拼的，只验夹具等于自证（见「真 pristine」一例）；
//   5. 链式安全：insert 必须原样保留自己的锚（这样任意两个共享原生锚的补丁谁先跑
//      都能命中）；确实要改写原生字节的替换显式列进 MUTATES 豁免表。
//
// 用法：node --test scripts/test/unit-open-project-dir.test.js

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { patchOpenProjectDir, MARKER, buildUiFixture, UI_REPLACEMENTS } = require('../patch-open-project-dir');
const { findPristineFile, describePristineRoots } = require('../lib/pristine-kernel-roots');

// 改写原生字段的替换（不是「保留锚再追加」）。
// 0.2.2-rc.1 起本补丁的 5 处替换全部是「锚点原文 + 追加」：图标表是补逗号后追加
// （anchor 作为子串仍在），两个菜单项与两处翻译都是锚点行原样保留。故豁免表为空。
// 这不是放宽判据：下面的「链式安全」用例对空表逐个校验 insert.includes(anchor)，
// 任何一处想改回上一代那种整行重写（如 `items: workspaceMenuItems,` 时代）都会当场判红。
const MUTATES = [];

const WS_PKG_REL = path.join('dsh-client-ui-workspace', 'lib', 'client.js');
const wsPristineFile = findPristineFile(WS_PKG_REL);
const SKIP_NO_PRISTINE = '无 pristine 的 dsh-client-ui-workspace/lib/client.js（查过：' + describePristineRoots() + '）';

function tmpTree(t, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-open-dir-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, '@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content === undefined ? buildUiFixture() : content, 'utf8');
  return { root, file };
}

/** 夹具进门先归一化行尾：多行锚在 CRLF 下 replace 会静默空转（判据假绿）。 */
function fixture() {
  return buildUiFixture().replace(/\r\n/g, '\n');
}

test('补丁脚本：一次应用产出 0.2.2-rc.1 的 contextMenus 数据项形态', (t) => {
  const tree = tmpTree(t);
  const n = patchOpenProjectDir(tree.root);
  assert.strictEqual(n, 1, '应补丁 1 个文件');
  const raw = fs.readFileSync(tree.file, 'utf8');
  const patched = raw.replace(/\r\n/g, '\n');
  assert.ok(patched.includes(MARKER), '应写入幂等标记');

  // ① 图标表：contextMenu.icon 槽尾（原生 workspace.copy）追加 workspace.openDir 键。
  assert.ok(
    patched.includes('"workspace.openDir": _deepseek_ai_dsh_client_ui_primitives.IconFolderOpenRegular'),
    '图标表应追加 workspace.openDir 键'
  );

  // ② 项目行：target "workspace"、order 200 的数据项；path 由上游 trigger 目标直给
  //    （openWorkspaceMenu 第 2 个实参就是 row.cwd），故不再自己反查 cwd。
  assert.ok(
    patched.includes('\t\t\t\tid: "workspace.openDir",\n\t\t\t\ttarget: "workspace",\n\t\t\t\torder: 200,'),
    '项目行应注册 workspace 目标 order 200 的 contextMenus 数据项'
  );
  assert.ok(
    patched.includes('resolve: ({ path }) => typeof window.dshDesktop?.openPath === "function"'),
    '项目行 resolve 应直接从 trigger 目标取 path 并探测宿主桥'
  );
  assert.ok(patched.includes('id: "open-folder",'), '项目行菜单项 id 应为 open-folder');
  assert.ok(patched.includes('window.dshDesktop?.openPath?.(path)'), '项目行 open-folder 应直接引用宿主 openPath');

  // ③ 会话行：registerSessionMenus 里的第 6 个数据项（register(id, order, [], resolve)），
  //    order 500 排在归档(600) 之前的 session-id(450) 之后。
  assert.ok(
    patched.includes('\t\t\tregister("openDir", 500, [], (target) => {'),
    '会话行应注册 order 500 的 openDir 数据项'
  );
  assert.ok(
    patched.includes('const dshSessionCwd = ctx.sessions.list.getSnapshot().byId[target.sessionId]?.cwd;'),
    '会话行 cwd 应从 sessions 快照反查'
  );
  // 降级：解析不到 cwd 或宿主桥缺失时 resolve 返回空数组 = 整行不渲染，
  // 而不是留下点了没反应的死行。
  assert.ok(
    patched.includes(
      'if (typeof window.dshDesktop?.openPath !== "function" || typeof dshSessionCwd !== "string" || dshSessionCwd === "") return [];'
    ),
    '不可用时 resolve 应返回空数组（整行不渲染）'
  );
  assert.ok(patched.includes('window.dshDesktop?.openPath?.(dshSessionCwd)'), '会话行执行体应引用反查到的 cwd');

  // ④ 翻译 zh/en。
  assert.ok(patched.includes('"menu.openProjectDir": "打开项目目录"'), '应写入中文翻译');
  assert.ok(patched.includes('"menu.openProjectDir": "Open project directory"'), '应写入英文翻译');

  // ⑤ 退役面：右键菜单已是上游原生能力（0.2.2-rc.1 的 ctx.contextMenus +
  //    getTriggerProps 同时接右键与 ⋯ 按钮），本补丁自造的 onContextMenu /
  //    menuRect / getAnchorRect 三件套整体退役，不得回流去抢上游的活。
  //    （pristine 上 menuRect / onContextMenu 各 0 命中，所以这三条是「向后不许
  //    回退」的护栏，不是「删掉注入体必红」的判据——它们在注入体被删时仍绿。）
  assert.ok(!patched.includes('menuRect'), '不得回流自造 menuRect 锚点矩形');
  assert.ok(!patched.includes('onContextMenu'), '不得回流自造 onContextMenu');
  assert.ok(!patched.includes('getAnchorRect: () =>'), '不得回流自造 getAnchorRect');

  // 幂等：二遍零写入且字节不变。
  const n2 = patchOpenProjectDir(tree.root);
  assert.strictEqual(n2, 0, '第二次应零写入');
  assert.strictEqual(fs.readFileSync(tree.file, 'utf8'), raw, '内容不应变化');
});

test('真 pristine 字节：每个锚恰好命中一次（夹具不得自证）', { skip: wsPristineFile ? false : SKIP_NO_PRISTINE }, () => {
  const src = fs.readFileSync(wsPristineFile, 'utf8').replace(/\r\n/g, '\n');
  UI_REPLACEMENTS.forEach((r, i) => {
    const hits = src.split(r.anchor).length - 1;
    assert.strictEqual(
      hits,
      1,
      `锚 #${i} 在 pristine 上应命中 1 次，实为 ${hits}（内核换代后必须按真字节重锚）：${r.anchor.split('\n')[0].slice(0, 70)}`
    );
  });
});

test('逐锚点反证：任一锚缺失都必须整文件跳过且不落盘', (t) => {
  const full = fixture();
  UI_REPLACEMENTS.forEach((r, i) => {
    const broken = full.replace(r.anchor, '/* ANCHOR-GONE */');
    assert.notStrictEqual(broken, full, `夹具里找不到锚 #${i}: ${r.anchor.slice(0, 40)}`);
    const tree = tmpTree(t, broken);
    const stats = { anchorMissing: 0, failed: 0 };
    const n = patchOpenProjectDir(tree.root, () => {}, stats);
    assert.strictEqual(n, 0, `锚 #${i} 缺失时不得计入 changed`);
    assert.strictEqual(stats.anchorMissing, 1, `锚 #${i} 缺失应计 anchorMissing=1`);
    assert.strictEqual(fs.readFileSync(tree.file, 'utf8'), broken, `锚 #${i} 缺失时文件字节级不变`);
  });
});

test('锚点唯一性：夹具中每个锚恰好命中一次', () => {
  const fx = fixture();
  UI_REPLACEMENTS.forEach((r, i) => {
    const hits = fx.split(r.anchor).length - 1;
    assert.strictEqual(hits, 1, `锚 #${i} 应命中 1 次，实为 ${hits}：${r.anchor.slice(0, 50)}`);
  });
});

test('链式安全：每个 insert 都原样保留自己的锚（0.2.2-rc.1 起无改写型）', () => {
  // 本补丁与 workspace-pin 共用原生 `menu.unarchiveSession` 翻译锚（本补丁插前、
  // workspace-pin 插后），谁吞掉自己的锚谁就把对方挤掉。MUTATES 为空即「一处都不许吞」。
  UI_REPLACEMENTS.forEach((r, i) => {
    if (r.insert.includes(r.anchor)) return;
    assert.ok(
      MUTATES.some((head) => r.anchor.startsWith(head) || r.anchor.includes(head)),
      `锚 #${i} 的 insert 未保留锚，也未登记为改写型：${r.anchor.split('\n')[0].slice(0, 60)}`
    );
  });
  // 反向：豁免表若残留旧内核片段（0.2.1 及以前的 workspaceMenuItems 数组、onSelect
  // guard、pageX/pageY 锚点矩形），它永远不会再被哪条锚命中——这种僵留本身要判红，
  // 否则「豁免」二字会随换代慢慢变成一句空话。
  MUTATES.forEach((head) => {
    assert.ok(
      UI_REPLACEMENTS.some((r) => !r.insert.includes(r.anchor) && r.anchor.includes(head)),
      `MUTATES 项在任何锚点里 0 命中（旧内核片段，应删除或按新字节重录）：${head}`
    );
  });
});

test('补丁脚本：目标包缺失时返回 0 且不抛异常', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-open-dir-empty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.strictEqual(patchOpenProjectDir(root), 0);
});

test('夹具本身不得含 MARKER（否则幂等分支吞掉首次应用）', () => {
  assert.ok(!buildUiFixture().includes(MARKER));
});
