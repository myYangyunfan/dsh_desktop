'use strict';
// 内核右栏整合回归锁（node --test）。
//
// 背景：内核 0.2.0 系的右栏（@deepseek-ai/dsh-client-ui-sidebar-right）自带
// dockkit 分栏/拖宽/全屏，并给出公开的两段式扩展点——它自己的「文件 / 文档预览 /
// 终端」就注册在同一套 API 上：
//   ① ctx.sidebarRightTabs.register({ id, kind, priority, title, guide })  —— 标签「类型」
//   ② ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
//        name:'sidebar.right.pane.tab', key:<①的 id>, inject }))            —— 标签「主体」
//
// 0.24.1 起这条整合由上游自己的 `src/client/native/` 承载（本仓库此前是一份
// kernel-rightbar.tsx 的「工作台 = 右栏一个标签 + legacy 自绘浮层回落」双形态实现，
// 已被上游的**接管式**设计取代：不再新造标签，而是用 priority:'extension' 抢下内核
// 自有的 `files` / `editor` 两个 kind，把插件的浏览器/编辑器接成内核右栏的实现本体）。
// 整合代码在 src/client/native/{index.ts,surface.ts,tab-adapter.tsx}。
//
// 判据（漏改任一侧即红）：
//   a. 座位等 **service** 不等 slot 声明：内核先声明 sidebar.right.pane.tab、
//      后提供 sidebarRightTabs，靠声明触发注册会读到 undefined 且声明永不折叠，
//      于是永久空面板（上游注释记着这台真实事故）；服务缺席必须直接 return。
//   b. 两段注册的形状与 key===id（内核按 id 找主体；写成 kind 会渲染成「无法查看」）；
//      类型 id 一律带 `dsh-better-sidebar:` 前缀，与内核自有实现错开。
//   c. 主体注册失败必须回滚已成功的类型注册：槽位能在上下文失效（插件重载）时抛，
//      而类型此刻已占住 id——不回滚就永久占位，该 kind 再也不可注册。
//   d. 接管只让开宿主自有的格式（表格/PDF/图片/Office）：这些留给内核的 `text` 类型。
//   e. guide 条目自 0.1.6-alpha.2 起 `id` 必填且逐提供方唯一；descriptor 没写
//      description 时**整个字段缺席**（内核无兜底，空串会渲染成一行空白）。
//   f. records 必须在任何 body 渲染前 attachStore：否则展开集没有归属，目录开关全哑。
//   g. sync 不得在每次 store commit 时重建 `files` 接管（重建窗口里的重注册会把
//      类型留成「没人持有 disposer」的僵尸）。
//   h. manifest 的 dsh.client.inject 是**硬前置**：注入失败即连带整个插件不加载，
//      所以 inject 里的每个包都必须同时是声明的 peerDependencies（内核内部包除外）。
//      能否在 pin 的内核上解析由 unit-plugin-module-table 的判据 D 兜底。
//   i. 偏好项两端逐名一致：客户端读写的 prefs 与宿主 schema 必须同名同集合，
//      否则设置回写被当未知字段丢掉（原 kernelRightbar 那条锁的不变量泛化版）。
//
// 用法：node --test scripts/test/unit-plugin-kernel-rightbar.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-better-sidebar');
const NATIVE = 'src/client/native/index.ts';
const BUNDLES = ['lib/client.js', 'lib/client-registry.js'];

const read = (rel) => fs.readFileSync(path.join(PLUGIN, rel), 'utf8');
const count = (haystack, needle) => haystack.split(needle).length - 1;

/** 逐文本（src 用单引号、产物用双引号）判据：同一形状通吃两侧。 */
const QUOTE = '[\'"]';

test('a 座位等 service 不等 slot 声明：ctx.inject([sidebarRightTabs]) 且缺席即 return', () => {
  const offenders = [];
  for (const rel of [NATIVE, ...BUNDLES]) {
    const s = read(rel);
    if (!new RegExp(`ctx\\.inject\\(\\[${QUOTE}sidebarRightTabs${QUOTE}\\],\\s*\\(injected\\)`).test(s)) {
      offenders.push(`${rel}：没等 sidebarRightTabs 服务（靠 slot 声明触发会永久空面板）`);
    }
    if (!/if \(tabs === (?:void 0|undefined)\) return/.test(s)) {
      offenders.push(`${rel}：服务缺席没有直接 return（缺席也要注册 = legacy 兜底丢了）`);
    }
    // 服务在结构上被读过一次，注册才走它的 register；写成 ctx.get 硬取会在缺席时抛。
    if (!/injected\.get\((?:'|"|`)sidebarRightTabs(?:'|"|`)\)/.test(s)) {
      offenders.push(`${rel}：未从注入结果里读 sidebarRightTabs`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('b 两段注册在位：类型（id 带插件前缀 + kind + priority）与主体（pane.tab/.title，key = 类型的 id）', () => {
  const offenders = [];

  const src = read(NATIVE);
  // 类型 id 的前缀构造：`dsh-better-sidebar:<descriptorId>`，接管另有字面量 id。
  if (!/return `dsh-better-sidebar:\$\{descriptorId\}`/.test(src)) offenders.push('nativeId 前缀漂移（会与内核自有实现撞 id）');
  if (!/const id = 'dsh-better-sidebar:files'/.test(src)) offenders.push('files 接管的类型 id 漂移');
  if (!/const EDITOR_KIND = 'editor'/.test(src) || !/const FILES_KIND = 'files'/.test(src)) {
    offenders.push('接管的 kind 常量漂移（内核按 kind 认领内建位）');
  }

  for (const rel of [NATIVE, ...BUNDLES]) {
    const s = read(rel);
    // ① 类型：{ id, kind } 成对，且外部实现压过内核自有的 viewer。
    if (!/tabs\.register\(\{\s*id,\s*kind:/.test(s)) offenders.push(`${rel}：缺类型注册（id/kind 形状变了）`);
    if (!new RegExp(`priority: ${QUOTE}extension${QUOTE}`).test(s)) {
      offenders.push(`${rel}：缺 priority:'extension'（抢不到内建 files/editor 位）`);
    }
    // ② 主体与 chip 标题都挂在**同一个 id** 键下。
    for (const slot of ['sidebar.right.pane.tab', 'sidebar.right.pane.tab.title']) {
      const re = new RegExp(
        `ctx\\.slots\\.inject\\(${QUOTE}${slot.replace(/\./g, '\\.')}${QUOTE}, \\(\\) => ctx\\.slots\\.register\\(\\{\\s*name: ${QUOTE}${slot.replace(/\./g, '\\.')}${QUOTE},\\s*key: id,`,
      );
      if (!re.test(s)) offenders.push(`${rel}：${slot} 未挂到类型 id 的键下（内核按 id 找主体）`);
    }
  }
  // 两个主体组件各自在位：pane 用 NativeTabBody，标题条用 NativeTabTitle。
  const bundle = read('lib/client.js');
  for (const sym of ['NativeTabBody', 'NativeTabTitle']) {
    assert.ok(count(bundle, sym) >= 2, `lib/client.js：${sym} 出现次数异常（注册与定义各一处）`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('c 主体槽位失败必须回滚类型注册（否则 id 被永久占死，该 kind 只能渲染「无法查看」）', () => {
  const offenders = [];
  for (const rel of [NATIVE, ...BUNDLES]) {
    const s = read(rel);
    // registerDescriptor 与 registerFilesKind 各一处回滚 + 两处 teardown 释放。
    const typed = count(s, 'disposeSafely(disposeType,');
    if (typed < 4) offenders.push(`${rel}：类型的释放/回滚点少于 4 处（实得 ${typed}）——接管与 descriptor 两条路径都要能回滚`);
    if (!/disposeSafely\(disposeType, (?:'|"|`)native tab type/.test(s)) {
      offenders.push(`${rel}：disposeType 的释放没有点名「native tab type」（错误面会失真）`);
    }
    // 槽位的部分成功也要释放：disposers 收集即发放。
    if (!/disposers\.push\(ctx\.slots\.inject/.test(s)) offenders.push(`${rel}：槽位 disposer 不是「边发放边收集」`);
    if (!/for \(const dispose of slots\.reverse\(\)\)/.test(s)) offenders.push(`${rel}：释放顺序没有反转（后注册的槽位应先放）`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('d 接管只让开宿主自有格式：HOST_OWNED_EXTS 覆盖表格/PDF/图片/Office，canOpen 逐地址判定', () => {
  const src = read(NATIVE);
  const offenders = [];
  const set = src.match(/const HOST_OWNED_EXTS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\n\]\)/);
  if (!set) {
    offenders.push('HOST_OWNED_EXTS 表没了（会抢走内核自渲染的预览位）');
  } else {
    // 逐项取引号里的扩展名：表里逐族插了说明注释，按逗号切会把注释和首项粘在一起。
    const members = (set[1].match(/'([^']+)'/g) || []).map((t) => t.slice(1, -1));
    // 解析器自检：抽不到足够多的项说明定界/形状变了，别拿空表去比（假绿）。
    assert.ok(members.length >= 18, `HOST_OWNED_EXTS 解析到 ${members.length} 项，少于实测的 18——定界失效`);
    for (const must of ['xlsx', 'csv', 'pdf', 'png', 'jpg', 'svg', 'doc', 'docx', 'ppt', 'pptx']) {
      if (!members.includes(must)) offenders.push(`HOST_OWNED_EXTS 缺 ${must}`);
    }
  }
  // 编辑器类型只在 dsh-resource://file/** 上开窗，且把宿主自有路径让出去。
  if (!/patterns: \['dsh-resource:\/\/file\/\*\*'\]/.test(src)) offenders.push('editor 类型的 patterns 形状变了');
  if (!/return file !== undefined && !hostOwnedPath\(file\.path\)/.test(src)) offenders.push('canOpen 没排除宿主自有格式');
  // 点文件（.bashrc）不是扩展名命中：`dot > 0` 而非 `>= 0` 的判定必须留着。
  if (!/return dot > 0 && HOST_OWNED_EXTS\.has/.test(src)) offenders.push('hostOwnedPath 的 dotfile 判定丢了');
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('e guide 条目带 id（0.1.6-alpha.2 起必填且逐提供方唯一），description 缺席时整字段省略', () => {
  const src = read(NATIVE);
  const offenders = [];
  // descriptor 自己的 guide 行用 descriptor.id；files 接管用 'files'。
  // 条目内部有整段说明注释，所以定界与 id 之间允许多行。
  if (!/guide: \[\{[\s\S]{0,600}?id: descriptor\.id,[\s\S]{0,200}?order:/.test(src)) offenders.push('descriptor 的 guide 条目缺 id（重复 id 会让内核抛 duplicate guide entry）');
  if (!/id: 'files',\s*order: 10,/.test(src)) offenders.push('files 接管的 guide 条目缺 id/order');
  // 「没有 description 就不给这个字段」：内核无兜底，空串渲染成空白行。
  if (!/return description === undefined \? \{\} : \{ description:/.test(src)) {
    offenders.push('guideDescriptionOf 不是「缺席即空对象」');
  }
  if (!/guideIconOf\(editor\?\.icon\)/.test(src)) offenders.push('files 接管没带 editor 的图标（guide 里就它一行空图位）');
  // 隐藏的 descriptor 不进 guide 列表，但类型仍注册（编辑器靠它做文件查看器）。
  if (!/descriptor\.hidden === true \|\| isEditor/.test(src)) offenders.push('hidden/editor 的 guide 豁免条件漂移');
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('f records 必须在任何注册之前 attachStore（否则展开集没有归属，目录开关全哑）', () => {
  const offenders = [];
  for (const rel of [NATIVE, ...BUNDLES]) {
    const s = read(rel);
    const attach = s.search(/records\.attachStore\(store\)/);
    const seat = s.search(/ctx\.inject\(\[(['"])sidebarRightTabs\1\]/);
    if (attach === -1) offenders.push(`${rel}：没有 records.attachStore`);
    else if (seat !== -1 && attach > seat) offenders.push(`${rel}：attachStore 晚于座位注册（首个 body 读不到 store）`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('g sync 不得在每次 store commit 时重建 files 接管（僵尸类型会永久占位）', () => {
  const src = read(NATIVE);
  const offenders = [];
  if (!/if \(descriptorId === FILES_KIND \|\| wanted\.has\(descriptorId\)\) continue/.test(src)) {
    offenders.push('清理循环没有跳过 FILES_KIND（每次 commit 都会重接一次内核类型）');
  }
  // files 接管跟随 editor 开关，且只补不重。
  if (!/const wantsFiles = service\.isTabEnabled\(EDITOR_KIND\)/.test(src)) offenders.push('files 接管没跟 editor 开关');
  if (!/if \(wantsFiles && !hasFiles\)/.test(src)) offenders.push('接管缺少「只在缺席时注册」的守卫');
  if (!/if \(!wantsFiles && hasFiles\)/.test(src)) offenders.push('editor 关闭时没有释放接管');
  // 订阅两路都要能折叠：service（标签注册表）+ store（开关）。
  if (!/const disposeSubscriptions = \[service\.subscribe\(sync\), store\.subscribe\(sync\)\]/.test(src)) {
    offenders.push('同步循环的订阅来源变了（标签注册表与偏好 store 都要接）');
  }
  // 单个 descriptor 失败不能带塌整片表面：注册点各自上报（实测 2 处：descriptor 循环
  // + files 接管）。上报必须接到客户端的可见诊断条上，否则契约断裂是静默的。
  assert.equal(count(src, 'reportFailure?.('), 2, 'native/index.ts 的上报点数量变了');
  for (const rel of ['src/client/index.tsx', ...BUNDLES]) {
    if (!/reportFailure: \(phase, error\)/.test(read(rel))) offenders.push(`${rel}：没把 reportFailure 接到可见诊断条（注册失败会静默）`);
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

/** inject 清单里「没有对应 peer 声明、也不是内核内部包」的名字。 */
const KERNEL_INTERNAL = ['@deepseek-ai/dsh-client-modules'];
function unpeeredInject(inject, peers) {
  return inject.filter((name) => !peers.includes(name) && !KERNEL_INTERNAL.includes(name));
}

test('h manifest 的 dsh.client.inject 每个包都必须是声明的 peer（硬前置要诚实）', () => {
  const pkg = JSON.parse(read('package.json'));
  const inject = pkg.dsh?.client?.inject ?? [];
  const peers = Object.keys(pkg.peerDependencies ?? {});
  assert.deepEqual(
    unpeeredInject(inject, peers),
    [],
    'dsh.client.inject 是硬前置（注入失败连带整个插件不加载）：inject 里的包必须同时是声明的 peerDependencies，除非它是内核运行时自带的内部包',
  );
  // 可选接法本身要在位：服务缺席时不注册而不是抛错（右栏 legacy 面）。
  assert.match(read(NATIVE), /ctx\.inject\(\['sidebarRightTabs'\],/, '缺可选注入（ctx.inject 形态）');
  // 反证：同一个判据函数喂一个未声明 peer 的包必须点名它（否则上面的深比对是空的）。
  assert.deepEqual(unpeeredInject([...inject, '@deepseek-ai/dsh-client-ui-nope'], peers),
    ['@deepseek-ai/dsh-client-ui-nope'], '反证未生效：判据没真的比对 peer 清单');
  // 内部包白名单也不许扩张：内核自带的那个必须在 inject 里真的被用到。
  assert.ok(inject.includes('@deepseek-ai/dsh-client-modules'), '内部包白名单与 manifest 脱钩');
});

/** 取 `export interface SidebarPrefs { … }` / `export const PrefsSchema = z.object({ … })` 的顶层键名。 */
function topLevelKeys(text, opener, closer) {
  const start = text.indexOf(opener);
  assert.notEqual(start, -1, `找不到 ${opener}`);
  const body = text.slice(start + opener.length);
  const end = body.indexOf(closer);
  assert.notEqual(end, -1, `找不到 ${opener} 的收尾`);
  const keys = [];
  for (const line of body.slice(0, end).split('\n')) {
    const m = line.match(/^ {2}([A-Za-z0-9_]+):/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

test('i 偏好项两端逐名一致（客户端 prefs 类型 ↔ 宿主 schema，集合必须相同）', () => {
  const prefs = read('src/prefs-shared.ts');
  const config = read('src/config.ts');
  const declared = topLevelKeys(prefs, 'export interface SidebarPrefs {', '\n}');
  const schema = topLevelKeys(config, 'export const PrefsSchema', '\n})');
  const defaults = topLevelKeys(prefs, 'export const SIDEBAR_PREFS_DEFAULTS: SidebarPrefs = {', '\n}');

  assert.ok(declared.length >= 10, `SidebarPrefs 键数异常（实得 ${declared.length}）——解析没命中就报异常，别静默放行`);
  assert.deepEqual(schema.sort(), declared.sort(), '宿主 schema 与客户端 prefs 类型不同名（回写会被当未知字段丢掉）');
  assert.deepEqual(defaults.sort(), declared.sort(), '缺省表与类型不同名（设置文档缺项时读不到默认值）');

  // 反证：少一个 schema 键的集合必须与类型比对失败（证明比对真的在咬合）。
  const dropped = schema.filter((k) => k !== declared[0]);
  assert.notDeepEqual(dropped.sort(), declared.sort(), '比对被架空：删一个键应当判红');
});
