'use strict';

// 对话删除/归档管理补丁（session-manage）单测（node --test）。
//
// 覆盖四层：
//   1. 全链一次应用：6 个目标文件（dsh-session / workspace-controller 三处
//      typert 协议同步 / api-remotes 客户端描述符 / 页内 contextMenus 数据项）都写入，
//      关键注入产物齐备；
//   2. 逐项幂等：二遍零写入（本补丁用「insert/done 自身判完成」而非全局 MARKER
//      跳过，存量安装才能被后续新增替换项追补）；
//   3. 逐锚点反证：任一包内任一锚缺失 → 该包整体不落盘（单文件原子性），
//      其余包照常应用；
//   4. 锚点唯一性 + 链式安全：每个锚在自己的夹具里恰好命中一次，且每个 insert
//      都原样保留自己的锚（open-project-dir 会接在同一段原生代码之后，两补丁
//      任意先后都能命中）；
//   5. 链式共存（真 pristine 字节）：与 open-project-dir / workspace-pin 同落一份
//      client.js，三个注入体必须各只有一份、两种应用顺序都成立、产物可解析 ——
//      这是 2026-10-06 实测 P0 的回归位（见文件末尾两例）。
//
// 用法：node --test scripts/test/unit-session-manage.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { patchSessionManage, MARKER, TARGETS, buildFixtures } = require('../patch-session-manage');
const { DELETE_SESSION_MENU_GUARD } = require('../lib/host-capabilities');

function makeTree(t, fixtures) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sm-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const files = [];
  for (const fx of fixtures) {
    const file = path.join(root, ...fx.rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, fx.text, 'utf8');
    files.push(file);
  }
  return { root, files };
}

/** 默认夹具：每包一份「只含本包锚点」的拼接文本。行尾先归一到 LF——
 *  多行锚在 CRLF 下 String.replace 会静默空转，反证用例就成了替「未变异体」判绿。 */
function defaultFixtures() {
  return buildFixtures().map((fx) => ({ rel: fx.rel, text: fx.text.replace(/\r\n/g, '\n') }));
}

test('全链一次应用：6 个目标文件写入且关键产物齐备', (t) => {
  const { root, files } = makeTree(t, defaultFixtures());
  assert.equal(files.length, 6, '目标文件应为 6 个');
  const stats = { anchorMissing: 0, failed: 0 };
  const n = patchSessionManage(root, () => {}, stats);
  assert.equal(n, 6, '应修改 6 个文件');
  assert.equal(stats.anchorMissing, 0, '不应有锚点失配');
  assert.equal(stats.failed, 0, '不应有读写失败');

  const read = (rel) => fs.readFileSync(path.join(root, ...rel), 'utf8');
  const [session, ctrlHost, typertHost, ctrlClient, remotes, ui] = TARGETS.map((x) => read(x.rel));
  for (const [name, src] of [['dsh-session', session], ['workspace-controller', ctrlHost], ['typert.host', typertHost], ['controller client', ctrlClient], ['api-remotes', remotes], ['client-ui', ui]]) {
    assert.ok(src.includes(MARKER), `${name} 应写入 MARKER`);
  }
  // 1. dsh-session：live 注册表摘除能力。
  assert.ok(session.includes('remove(id)') && session.includes('this.detachEntered(entry)'), 'SessionStore.remove 应注入');
  // 2. 宿主控制器：命令 + 门面 + 依赖注入 + fs 侧清理。
  assert.ok(ctrlHost.includes('async deleteSession(request)'), 'deleteSession 命令应注入');
  assert.ok(ctrlHost.includes('return this.commands.deleteSession(request)'), '控制器门面应转发');
  // 0.2.1：上游把 inject 数组改成多行并加列 remoteAccess，注入体按新形状补齐三个服务。
  // 仍按引用取生产常量（TARGETS 里那条替换的 insert），不在测试里另抄字面串。
  const injectItem = TARGETS.find((t) => t.rel.join('/') === ['@deepseek-ai', 'dsh-api-workspace-controller', 'lib', 'index.js'].join('/'))
    .replacements.find((r) => r.anchor.trimStart().startsWith('static inject = ['));
  assert.ok(injectItem, 'TARGETS 应有 inject 那条替换');
  assert.ok(ctrlHost.includes(injectItem.insert), 'inject 应补齐 agents/sessions/sessionPersistence 三个服务');
  assert.ok(ctrlHost.includes('import { rm } from "node:fs/promises"'), '应注入目录移除依赖');
  assert.ok(ctrlHost.includes('"cannot delete a running session: stop it first"'), '应拒绝运行中会话');
  // 3. typert 协议三处同步：宿主 STRICT 分发描述符。
  assert.ok(typertHost.includes('workspace/deleteSession'), 'typert.host 应含 deleteSession 描述符');
  assert.ok(typertHost.includes('_deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_parameter_0$schema'), 'typert.host 应含入参 schema');
  // 4. 客户端模型/门面。
  assert.ok(ctrlClient.includes('async deleteSession(sessionId)'), 'controller client 应注入模型方法');
  // 0.2.2-rc.2：客户端产物压缩——双引号转模板字面量、逗号两侧去空格。
  assert.ok(ctrlClient.includes('commandError(`session delete`,result.error)'), 'controller client 应注入门面错误串');
  // 5. api-remotes：remote.workspace.deleteSession 的 schema + descriptor。
  // 0.2.1 起描述符从「数组 + id 字段」改成「'<namespace>/<method>' 键控对象」，
  // 断言随之改按键名取。
  // 0.2.2-rc.2：remotes 产物也随压缩去掉冒号后的空格。
  assert.ok(remotes.includes('"workspace/deleteSession":{'), 'remotes 应注册 deleteSession 描述符');
  assert.ok(remotes.includes('WorkspaceDeleteSessionRequest'), 'remotes 应含请求类型符号');
  assert.ok(remotes.includes('_deepseek_ai_dsh_api_workspace_controller_workspace_deleteSession_parameter_0_strict$schema'),
    'remotes 应含 strict 入参 schema（strictCodec.create 的引用目标，缺一个就是半个注入）');
  // 6. 页内：registerSessionMenus 里的 contextMenus 数据项 + zh/en。
  //    0.2.2-rc.1 第三次重构：五个 *SessionMenuItem 组件与 deleteInjected 闭包
  //    整块删除，改为 `register(id, order, endpoints, resolve)` 注册数据项，
  //    条目 = { id, label, icon?, danger?, separatorBefore?, run }。判据因此从
  //    「组件在场」改成「那一行 register(...) 调用在场」——裸的 id/danger/
  //    separatorBefore 在 pristine 上本来就有别处的同名项，单独当判据必然空转。
  // 0.2.2-rc.2：整条注册行压成单行（`register(\`delete\`,650,[],target=>{`），
  // 数据项里的 danger / separatorBefore 也挤在一行，故两段判据分开咬。
  assert.ok(ui.includes('register(`delete`,650,[],target=>{'), '页内应注册 order 650 的删除行');
  assert.ok(
    ui.includes('return[{id:`delete`,label:t(`menu.deleteSession`),danger:true,separatorBefore:true,'),
    '删除项应为「危险 + 分隔线前置」的数据项'
  );
  assert.ok(ui.includes('window.__dshSessionManager?.deleteSession(target.sessionId)'), '点击应走 dsh-session-manager 桥');
  // 桥缺失则 resolve 返回空数组 = 整行不渲染。判定式按引用取契约常量（scripts/lib/
  // host-capabilities 的 DELETE_SESSION_MENU_GUARD，与 patch-session-manage 注入体
  // 逐字同源，并由 unit-host-capabilities 做跨文件核对）——这里原先手抄的是旧形态
  // `?.deleteSession === void 0`，手抄漂移只会让断言钉不住真实字节。
  // 0.2.2-rc.2 压缩形：`if(!(<guard>))return[];`（括号与空格全被剥）。判定式仍按
  // 引用取契约常量，只把两侧的空白形态按压缩形重录。
  assert.ok(
    ui.includes('if(!(' + DELETE_SESSION_MENU_GUARD + '))return[];'),
    '桥缺失时 resolve 应返回空数组（整行不渲染）'
  );
  // 下面两条是「向后不许回退」的护栏，不是「删掉注入体必红」的判据（注入体被删时
  // 它们仍绿）：它们锁的是组件时代的旧形态不得回流。比对前整体去空白，
  // 读法形（`if (!(g)) return null;`）与压缩形（`if(!(g))return null;`）任一回流都抓到。
  const squeeze = (s) => s.replace(/\s+/g, '');
  const squeezed = squeeze(ui);
  assert.ok(
    !squeezed.includes('if(!(' + squeeze(DELETE_SESSION_MENU_GUARD) + '))returnnull'),
    '不得退回组件时代「返回 null」的整行不渲染形态'
  );
  assert.ok(!squeezed.includes('?.deleteSession===void0'), '不得退回旧的可选链判空形态');
  assert.ok(ui.includes('"menu.deleteSession":`删除对话`'), '应写入中文翻译');
  assert.ok(ui.includes('"menu.deleteSession":`Delete conversation`'), '应写入英文翻译');
});

test('逐项幂等：二遍零写入且字节不变', (t) => {
  const { root, files } = makeTree(t, defaultFixtures());
  assert.equal(patchSessionManage(root, () => {}, { anchorMissing: 0, failed: 0 }), 6);
  const before = files.map((f) => fs.readFileSync(f, 'utf8'));
  const stats = { anchorMissing: 0, failed: 0 };
  assert.equal(patchSessionManage(root, () => {}, stats), 0, '第二遍应零写入');
  assert.equal(stats.anchorMissing, 0, '第二遍不应报锚点失配');
  files.forEach((f, i) => assert.equal(fs.readFileSync(f, 'utf8'), before[i], `第 ${i} 个文件内容不应变化`));
});

test('逐锚点反证：任一锚缺失 → 该包整体不落盘，其余包照常应用', (t) => {
  TARGETS.forEach((target, ti) => {
    target.replacements.forEach((r, ri) => {
      const fixtures = defaultFixtures().map((fx, i) =>
        i === ti ? { rel: fx.rel, text: fx.text.replace(r.anchor, '/* ANCHOR-GONE */') } : fx
      );
      const { root, files } = makeTree(t, fixtures);
      const stats = { anchorMissing: 0, failed: 0 };
      const n = patchSessionManage(root, () => {}, stats);
      assert.equal(stats.anchorMissing, 1, `T${ti} 锚 #${ri} 缺失应计 anchorMissing=1`);
      assert.equal(n, TARGETS.length - 1, `T${ti} 锚 #${ri} 缺失应只少写 1 个文件`);
      const broken = fs.readFileSync(files[ti], 'utf8');
      assert.ok(!broken.includes(MARKER), `T${ti} 锚 #${ri} 缺失时不得落盘半截（MARKER 不应出现）`);
      assert.equal(broken, fixtures[ti].text, `T${ti} 锚 #${ri} 缺失时该文件字节级不变`);
    });
  });
});

test('锚点唯一性 + 链式安全（insert 必须原样保留自己的锚）', () => {
  // 唯一豁免：inject 声明是「就地改写数组元素」而非追加，原生那一行不可能原样保留。
  // 它幂等靠 insert 自身判完成、跨补丁靠别的包各写各的文件，不与本页内补丁抢锚。
  // 0.2.1 起上游把该声明改成制表符缩进的多行数组，故判据先 trimStart 再比前缀。
  const MUTATES = ['static inject = ['];
  const fixtures = buildFixtures();
  TARGETS.forEach((target, ti) => {
    const fx = fixtures[ti].text;
    target.replacements.forEach((r, ri) => {
      const hits = fx.split(r.anchor).length - 1;
      assert.equal(hits, 1, `T${ti} 锚 #${ri} 应命中 1 次，实为 ${hits}：${r.anchor.slice(0, 50)}`);
      if (!r.insert.includes(r.anchor)) {
        assert.ok(
          MUTATES.some((head) => r.anchor.trimStart().startsWith(head)),
          `T${ti} 锚 #${ri} 的 insert 未保留锚 —— 与共享同一原生锚的补丁会互相挤掉`
        );
      }
    });
  });
});

test('目标包缺失时返回 0 且不抛异常', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sm-empty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const stats = { anchorMissing: 0, failed: 0 };
  assert.equal(patchSessionManage(root, () => {}, stats), 0);
  assert.equal(stats.anchorMissing, 0, '包不在位不应计失配');
});

test('dryRun 不得写盘', (t) => {
  const fixtures = defaultFixtures();
  const { root, files } = makeTree(t, fixtures);
  const n = patchSessionManage(root, () => {}, { anchorMissing: 0, failed: 0 }, { dryRun: true });
  assert.equal(n, 0, 'dryRun 不应计入 changed');
  files.forEach((f, i) => assert.equal(fs.readFileSync(f, 'utf8'), fixtures[i].text, 'dryRun 不得改动文件'));
});

// ---------------------------------------------------------------------------
// 5. 链式共存（真 pristine 字节）—— 2026-10-06 实测 P0 的回归位。
//
// 历史故障（0.2.1 及以前的字节形态）：dsh-client-ui-workspace/lib/client.js 同时是
// session-manage(190)、open-project-dir(200)、workspace-pin(215) 三个 root 应用器的
// 靶，而前两者共用同两行原生锚（`function ArchiveSessionMenuItem(…)` /
// `const archiveInjected = () => ({`）。opd 把自己的注入体插在锚点行之前，那段位置
// 正落在 sm 的 insert 字节区间内部 → 「用 insert 判已完成」被从中间劈开 → 二遍 boot
// 重插一次 → DeleteSessionMenuItem / deleteInjected 各声明两遍 → 该 bundle 直接
// SyntaxError（Identifier 'deleteInjected' has already been declared）。
//
// 0.2.2-rc.1 起劈裂前提消失：三个补丁的靶全部搬到 ctx.contextMenus 数据项，各自的
// 锚点区间互不相交（sm 锚 archive 项的 run 收尾、opd 锚 session-id 项收尾与
// workspace.delete 收尾、wp 锚 workspace.rename 收尾），且 insert 一律原样保留锚。
// 于是「把 done 退回 insert 字节就会重插」这条反证在新形状下**必然空转**（insert
// 不再被谁劈开，二遍照样零写入，断言 n===1 只会恒 false）。它替换成新形状下仍然
// 成立的那一条：三个补丁同落一份文件时必须各存活一份、且换序后同样成立 ——
// 任一处锚点区间把邻家的注册行吞掉，计数立刻变 0，判据不空跑。
// （`done` 判据——注入体内的独有文案——保留为纵深防御，见 patch-session-manage 第 7 节。）
// ---------------------------------------------------------------------------

const WS_REL = path.join('@deepseek-ai', 'dsh-client-ui-workspace', 'lib', 'client.js');
const WS_PKG_REL = path.join('dsh-client-ui-workspace', 'lib', 'client.js');
// 只认 pristine 闭包树（findPristineFile 不回退 dsh-desktop/node_modules —— 那里
// 是打过补丁的存量树，拿它当 pristine 会让本组两例变成假绿）。
const { findPristineFile, describePristineRoots } = require('../lib/pristine-kernel-roots');
const wsPristineFile = findPristineFile(WS_PKG_REL);
const SKIP_NO_WS = '无 pristine 的 dsh-client-ui-workspace/lib/client.js（查过：' + describePristineRoots() + '）';

/** 只含工作区页内包的假 node_modules 根，靶文件为真 pristine 字节。 */
function makeWsTree(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sm-chain-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, WS_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(wsPristineFile, file);
  return { root, file };
}

/** 读产物的「可断言文本」：行尾归一到 LF（多行键在 CRLF 下 split/includes 恒 0）。 */
function readSrc(file) {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * 三个注入体各出现几次（>1 即重复注入，0 即被邻家吞掉）。
 * 键面按 0.2.2-rc.2 的压缩产物取（单行、模板字面量、无空格）：裸的 id / order /
 * danger 在 pristine 上本来就有同名项（`id:\`delete\``、`order:200`、`danger:true`
 * 各 ≥1 命中），拿它们当判据等于空转，必须咬住整条 register(...) 调用。
 */
function injectionCounts(src) {
  return {
    deleteRow: src.split('register(`delete`,650').length - 1,
    openDirRow: src.split('register(`openDir`,500').length - 1,
    openDirIcon: src.split('"workspace.openDir":_deepseek_ai_dsh_client_ui_primitives.IconFolderOpenRegular').length - 1,
    pinToggle: src.split('id:`workspace.pinToggle`').length - 1,
  };
}

const EXPECT_ONE_EACH = { deleteRow: 1, openDirRow: 1, openDirIcon: 1, pinToggle: 1 };

/** ESM 语法可解析性（node --check 只认 .mjs/.cjs 后缀，故落一份 .mjs 副本）。 */
function syntaxErrorOf(root, src) {
  const probe = path.join(root, '_syntax-probe.mjs');
  fs.writeFileSync(probe, src, 'utf8');
  try {
    execFileSync(process.execPath, ['--check', probe], { stdio: ['ignore', 'ignore', 'pipe'] });
    return null;
  } catch (err) {
    return String(err.stderr || err.message).split('\n').filter(Boolean)[0];
  } finally {
    fs.rmSync(probe, { force: true });
  }
}

const wsChain = (root) => {
  const { patchOpenProjectDir } = require('../patch-open-project-dir');
  const { patchWorkspacePin } = require('../patch-workspace-pin');
  return [
    patchSessionManage(root, () => {}, { anchorMissing: 0, failed: 0 }),
    patchOpenProjectDir(root, () => {}, { anchorMissing: 0, failed: 0 }),
    patchWorkspacePin(root, () => {}, { anchorMissing: 0, failed: 0 }),
  ];
};

test('链式共存（真字节）：sm→opd→wp 连跑两遍，注入体各一份且语法可解析', { skip: wsPristineFile ? false : SKIP_NO_WS }, (t) => {
  const { root, file } = makeWsTree(t);
  const firstPass = wsChain(root);
  assert.deepEqual(firstPass.slice(1), [1, 1], '一遍应写入 opd / wp 各 1 个文件');
  assert.deepEqual(firstPass, [1, 1, 1], '一遍三个应用器各写 1 个文件');
  const first = fs.readFileSync(file, 'utf8');
  assert.deepEqual(injectionCounts(readSrc(file)), EXPECT_ONE_EACH, '一遍后四个注入体都应恰好一份');
  assert.equal(syntaxErrorOf(root, readSrc(file)), null, '一遍后必须可解析');

  const second = wsChain(root);
  const after = fs.readFileSync(file, 'utf8');
  assert.deepEqual(second, [0, 0, 0], `二遍三个应用器都应零写入（实际 sm=${second[0]} opd=${second[1]} wp=${second[2]}）`);
  assert.equal(after, first, '二遍字节不得变化');
  assert.deepEqual(injectionCounts(readSrc(file)), EXPECT_ONE_EACH, '不得出现重复声明，也不得被邻家吞掉');
  assert.equal(syntaxErrorOf(root, readSrc(file)), null, '二遍后仍须可解析');
});

test('反证：三个补丁同落一份文件，删除行 / 打开目录行 / 置顶行必须各存活一份', { skip: wsPristineFile ? false : SKIP_NO_WS }, (t) => {
  const { root, file } = makeWsTree(t);
  assert.deepEqual(wsChain(root), [1, 1, 1], '前置：一遍三个应用器各写 1');
  const src = readSrc(file);
  // 判据粒度是「整条 register(...) 调用」：sm 的删除行锚在 registerSessionMenus 的
  // archive 项收尾、opd 的 openDir 行锚在 session-id 项收尾（同一函数、相邻两块），
  // wp 的 pinToggle 锚在 workspace.rename 的收尾。任一处区间把邻家那行吞掉（或被
  // 邻家重写抹平），这里的计数就变 0 → 本用例红，不是空跑。
  assert.deepEqual(injectionCounts(src), EXPECT_ONE_EACH, 'sm / opd / wp 三个注入体必须各存活一份');
  assert.equal(src.split('register(`delete`,650').length - 1, 1, '删除行应恰好 1 条');
  assert.equal(src.split('register(`openDir`,500').length - 1, 1, '打开目录行应恰好 1 条');
  assert.equal(syntaxErrorOf(root, src), null, '三补丁共存后必须仍可解析');
});

test('反证：换序（opd / wp 先跑）同样各存活一份，且二遍仍零写入', { skip: wsPristineFile ? false : SKIP_NO_WS }, (t) => {
  const { root, file } = makeWsTree(t);
  const { patchOpenProjectDir } = require('../patch-open-project-dir');
  const { patchWorkspacePin } = require('../patch-workspace-pin');
  const reversed = [
    patchOpenProjectDir(root, () => {}, { anchorMissing: 0, failed: 0 }),
    patchWorkspacePin(root, () => {}, { anchorMissing: 0, failed: 0 }),
    patchSessionManage(root, () => {}, { anchorMissing: 0, failed: 0 }),
  ];
  assert.deepEqual(reversed, [1, 1, 1], '换序后三个应用器仍各写 1');
  const src = readSrc(file);
  assert.deepEqual(injectionCounts(src), EXPECT_ONE_EACH, '换序后三个注入体仍各一份（锚点区间互不侵占）');
  assert.equal(syntaxErrorOf(root, src), null, '换序产物必须可解析');

  const second = wsChain(root);
  assert.deepEqual(second, [0, 0, 0], `换序后二遍仍应零写入（实际 sm=${second[0]} opd=${second[1]} wp=${second[2]}）`);
  assert.equal(readSrc(file), src, '换序后二遍字节不得变化');
});
