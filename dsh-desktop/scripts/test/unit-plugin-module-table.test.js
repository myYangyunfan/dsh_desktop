'use strict';

// 浏览器模块表 ↔ 插件产物命名空间属性访问 的机器锁（node --test）。
//
// 覆盖 unit-plugin-esm-link 的已知盲区：打包器（rolldown / tsdown）把
// `import { X } from '@deepseek-ai/p'` 改写成 `_deepseek_ai_p.X` 属性访问后，
// import 语句就不存在了，具名导入链接守卫抓不到任何一条。0.2.0-rc.2 换代里
// dsh-client-ui-primitives 的图标面整批改名（`Icon*14/16` → `Icon*Regular` /
// `Icon*Medium`），better-sidebar 四个产物共 112 处取用成为硬断链，未守卫时的
// 症状是 React #130 —— 整个 slot entry 静默消失，不是少一个 glyph。
//
// 判据源全部取自 node_modules 实文件（PLATFORM_MODULES 与 pin 内核导出面），
// 不硬编码名单；插件的 `dsh.client.external` 扩表按内核 stripClientSuffix 归一。
// 纯函数在 scripts/lib/plugin-module-table.js，本文件只做编排与断言。
//
// 四条维度（同一条守卫、同一个判据源族）：
//   1. require spec ∈ 模块表 ∪ dsh.client.external；
//   2. 未守卫的成员取用 ∈ pin 内核该包导出面；
//   3. dsh.client 的 inject/external 声明的包必须在 pin 树里存在（幽灵声明 = client bundle
//      整册静默不加载，症状与 peer 拒挂同族）；
//   4. 正文不出现 `ctx.get("<已移除服务 id>")`（kernel-pin.services.removed 12 条）。

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const lib = require('../lib/plugin-module-table');

const DSH = path.resolve(__dirname, '..', '..');
const PLUGINS = path.join(DSH, 'assets', 'plugins');

// ---- 判据源自检 -------------------------------------------------------------

test('模块表判据取自 dsh-client-web 实文件，而不是硬编码名单', () => {
  const table = lib.platformModules(path.join(DSH, 'node_modules', '@deepseek-ai',
    'dsh-client-web', 'lib', 'index.js'));
  // rc.2 实测 9 项。阈值取下界而非等号：换代只会先加行（新 UI 库），
  // 若哪天小于 8 说明抽取脱靶或宿主把平台表拆走了，判据本身已不可信。
  assert.ok(table.size >= 8, `PLATFORM_MODULES 只抽到 ${table.size} 项，判据脱靶`);
  for (const spec of ['react', 'react/jsx-runtime', 'react-dom', 'react-dom/client',
    '@deepseek-ai/cordis', '@deepseek-ai/dsh-client-ui-primitives']) {
    assert.ok(table.has(spec), `模块表缺少 ${spec}（抽取形态已变）`);
  }

  // 反证 1：抽取器跟着文件走 —— 换成合成文件必须读到合成内容，而不是真实 9 项。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-modtable-'));
  try {
    const fake = path.join(tmp, 'fake-client-web.js');
    fs.writeFileSync(fake, 'const PLATFORM_MODULES = [\n\t"@deepseek-ai/only-one"\n];\n');
    const r = lib.platformModules(fake);
    assert.deepEqual([...r], ['@deepseek-ai/only-one'], '合成模块表未如实抽出');
    // 反证 2：判据源缺文件 / 缺符号时抛错，绝不静默返回空集（空集 = 守卫假绿）。
    assert.throws(() => lib.platformModules(path.join(tmp, 'nope.js')), /缺失/);
    const noSym = path.join(tmp, 'no-symbol.js');
    fs.writeFileSync(noSym, 'export const x = 1;\n');
    assert.throws(() => lib.platformModules(noSym), /PLATFORM_MODULES/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- 舰队实扫 ---------------------------------------------------------------

test('在册舰队：产物里的宿主包取用要么在模块表内，要么由 dsh.client.external 扩表', () => {
  const ctx = lib.makeContext({ root: DSH });
  const { scanned, report, aliasCount, memberCount } = lib.scanFleet(PLUGINS, ctx);

  // 覆盖哨兵（不先证这个，「零命中」只可能是什么都没扫到）：
  // 22 = 在册 28 的约 8 成，与 unit-plugin-esm-link 同口径。
  assert.ok(scanned >= 22, `只扫到 ${scanned} 个插件目录，覆盖面已脱靶`);
  // rc.2 + 0.24.1 换装后实测 72 处 `var _x = require("<宿主包>")` 改写点（better-sidebar
  // 六个产物 + 其余件的 client bundle，含入口落在 dist/ 的两条）。阈值取约五成，掉下去就是别名识别脱靶。
  assert.ok(aliasCount >= 40, `只采到 ${aliasCount} 处 require 别名改写，采集已脱靶`);
  assert.ok(ctx.cache.size >= 4, `宿主导出面只解析了 ${ctx.cache.size} 个包，判据已脱靶`);
  // 走法不变量：传相对插件根时白名单必须同样生效（实测踩过——相对路径下 keep 集合按
  // 字符串前缀比对全部落空，dist/ 里的入口被整目录跳过，计数静默少 5 处）。
  const rel = lib.scanFleet(path.relative(process.cwd(), PLUGINS), lib.makeContext({ root: DSH }));
  assert.deepEqual([rel.scanned, rel.aliasCount, rel.memberCount], [scanned, aliasCount, memberCount],
    '相对根与绝对根的扫描结果不一致，入口白名单在其中一侧已静默失效');

  const off = report.flatMap((r) => [...r.offTable].map(([spec, files]) => `${r.dir}: ${spec} @ ${files.join(', ')}`));
  assert.deepEqual(off, [], '存在模块表外的宿主包 require（运行期 "missed the module table"）：\n  ' + off.join('\n  '));

  // 未解析的导出面只允许是「非 @deepseek-ai 包」（react 等静态不可枚举）；
  // 声明了 external / 在表内却解析不到的宿主包，意味着扩表指向了 pin 里不存在的包。
  const badUnresolved = report.flatMap((r) => [...r.unresolved]
    .filter(([spec]) => spec.startsWith('@deepseek-ai/'))
    .map(([spec, reason]) => `${r.dir}: ${spec} → ${reason}`));
  assert.deepEqual(badUnresolved, [], `宿主作用域的扩表/表内包解析不到导出面：\n  ${badUnresolved.join('\n  ')}`);
});

test('在册舰队：未守卫的命名空间成员取用必须存在于 pin 内核导出面（跨代断链守卫）', () => {
  const ctx = lib.makeContext({ root: DSH });
  const { memberCount, report } = lib.scanFleet(PLUGINS, ctx);
  // 采集哨兵：rc.2 实测舰队在表宿主包的成员取用 322 处（better-sidebar 两个主产物各 55 处
  // 图标取用是大头）。阈值取约六成；掉下去说明成员访问正则脱靶，「零缺失」就没有意义。
  assert.ok(memberCount >= 200, `只核到 ${memberCount} 处成员取用，采集已脱靶`);

  const missing = report.flatMap((r) => [...r.missing]
    .map(([k, files]) => `${r.dir}: ${k} @ ${files.join(', ')}`));
  assert.deepEqual(missing, [],
    `存在未守卫且 pin 内核未导出的成员取用（换代断链，React #130 / undefined 组件）：\n  ${missing.join('\n  ')}`);
});

test('反证：把成员名换成 rc.2 已移除的旧图标后缀，未守卫形态必须判红、守卫形态必须不判红', () => {
  const ctx = lib.makeContext({ root: DSH });
  const primitives = '@deepseek-ai/dsh-client-ui-primitives';
  const surface = lib.surfaceFor(primitives, ctx).surface;
  assert.ok(surface && surface.size > 100, 'primitives 导出面解析失败，控制组无从谈起');

  // 控制组（判据方向）：*14/*16 后缀在 rc.2 已全部消失，`*Regular` 仍在位。
  assert.equal(surface.has('IconCloseFill14'), false, '控制组失败：rc.2 已移除的 IconCloseFill14 被判在场');
  assert.equal(surface.has('IconCloseFillRegular'), true, '控制组失败：在位的 IconCloseFillRegular 被判不在场');

  // 反向捕获力：合成 bundle 里未守卫取用旧名必须报红。
  const bare = 'var _p = require("@deepseek-ai/dsh-client-ui-primitives");'
    + 'h.render(_p.IconCloseFill14, null);';
  assert.equal(lib.guarded(bare, '_p', 'IconCloseFill14'), false, '未守卫取用被误判成已守卫（守卫会空转）');

  // 六种正当回落形态都必须认下来，否则真兼容代码被误判红、守卫会常红失去意义。
  // 逐形态点名「哪个成员因哪条模式被认下」——写宽松的 `旧名 || 新名` 双查会掩盖某一条模式失效。
  const forms = [
    ['?? 回落（后缀式）', 'h.render(_p.IconCloseFill14 ?? _p.IconCloseFillRegular, null);', 'IconCloseFill14'],
    ['|| 回落（后缀式）', 'h.render(_p.IconCloseFill14 || _p.IconCloseFillRegular, null);', 'IconCloseFill14'],
    ['typeof 校验', 'const I = typeof _p.IconCloseFill14 === "function" ? _p.IconCloseFill14 : _p.IconCloseFillRegular;', 'IconCloseFill14'],
    ['相等比较', 'if (_p.IconCloseFill14 === undefined) fallback();', 'IconCloseFill14'],
    ['pickIcon 工具', 'const I = pickIcon(_p.IconCloseFill14, _p.IconCloseFillRegular);', 'IconCloseFill14'],
    ['回落目标侧（前缀式）', 'const I = _p.IconCloseFillOutline16 ?? _p.IconCloseFillRegular;', 'IconCloseFillRegular'],
  ];
  const HEAD = 'var _p = require("@deepseek-ai/dsh-client-ui-primitives");';
  for (const [name, body, member] of forms) {
    assert.equal(lib.guarded(HEAD + body, '_p', member), true, `${name}：该形态的 ${member} 没被认下，对应守卫模式已失效`);
  }

  // 端到端反向捕获力：临时插件目录里放一条未守卫旧名取用，scanners 必须报出来。
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-modtable-fleet-'));
  try {
    const root = path.join(tmp, 'assets', 'plugins', 'fake-plugin', 'lib');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'assets', 'plugins', 'fake-plugin', 'package.json'), JSON.stringify({
      name: 'fake-plugin', version: '0.0.0', private: true,
      dsh: { client: { platform: 'web', external: [primitives + '/client'] } },
    }));
    fs.writeFileSync(path.join(root, 'client.js'),
      'var _p = require("@deepseek-ai/dsh-client-ui-primitives");\n'
      + 'h.render(_p.IconCloseFill14, null);\n'
      + 'h.render(_p.IconCheckOutline16 ?? _p.IconCheckOutlineRegular, null);\n'
      + 'h.render(_p.IconCloseFillRegular, null);\n');
    const r = lib.scanPlugin(path.join(tmp, 'assets', 'plugins', 'fake-plugin'), lib.makeContext({ root: DSH }));
    assert.deepEqual([...r.missing.keys()], [`${primitives}#IconCloseFill14`],
      '未守卫的已移除成员没被抓出来（守卫空转）');
    // external 声明带 /client 后缀 → 归一后仍在表内，不该报「表外」。
    assert.equal(r.offTable.size, 0, 'dsh.client.external 的 /client 后缀未归一，正当扩表被误报表外');
    assert.equal(r.aliasCount, 1, '别名采集脱靶');
    assert.equal(r.memberCount, 4, `成员取用应采到 4 处，实为 ${r.memberCount}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('反证：模块表外且未声明 external 的宿主包 require 必须报表外', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-modtable-off-'));
  try {
    const dir = path.join(tmp, 'p', 'lib');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'p', 'package.json'), JSON.stringify({ name: 'p', version: '0.0.0', private: true }));
    fs.writeFileSync(path.join(dir, 'client.js'),
      'var _x = require("@deepseek-ai/dsh-client-not-a-real-package");\nconsole.log(_x.anything);\n');
    const ctx = lib.makeContext({ root: DSH });
    const r = lib.scanPlugin(path.join(tmp, 'p'), ctx);
    assert.deepEqual([...r.offTable.keys()], ['@deepseek-ai/dsh-client-not-a-real-package'],
      '表外宿主包 require 未被报表外');
    // 同一条 spec 若被 dsh.client.external 声明，则不再报表外，转而判它的导出面可解析性。
    fs.writeFileSync(path.join(tmp, 'p', 'package.json'), JSON.stringify({
      name: 'p', version: '0.0.0', private: true,
      dsh: { client: { platform: 'web', external: ['@deepseek-ai/dsh-client-not-a-real-package'] } },
    }));
    const r2 = lib.scanPlugin(path.join(tmp, 'p'), lib.makeContext({ root: DSH }));
    assert.equal(r2.offTable.size, 0, '已声明 external 仍报表外');
    assert.deepEqual([...r2.unresolved.keys()], ['@deepseek-ai/dsh-client-not-a-real-package'],
      '扩表指向 pin 里不存在的包时应记入 unresolved（舰队用例据此判红）');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- 声明式依赖与已移除服务 -------------------------------------------------

test('插件 dsh.client 的 inject/external 声明必须都能在 pin 内核安装树里解析到包', () => {
  // 声明落空 = 整个 client bundle 在浏览器里静默不加载（无红、无 stderr），
  // 与 peer 拒挂同属「无报错是弱证据」那一类，所以和成员链接判定放同一条守卫里。
  const ctx = lib.makeContext({ root: DSH });
  const rows = [];
  for (const d of fs.readdirSync(PLUGINS).sort()) {
    const mf = path.join(PLUGINS, d, 'package.json');
    if (!fs.existsSync(mf)) continue;
    const j = JSON.parse(fs.readFileSync(mf, 'utf8'));
    for (const s of lib.clientSpecs(j)) rows.push({ dir: d, ...s });
  }
  // 覆盖哨兵：rc.2 + better-sidebar 0.24.1 实测 57 条声明（inject 49 + external 8），阈值取约六成。
  // 上一轮记的 56（inject 46 + external 10）差在换代：它的 inject 涨到 5 条、两条 primitives 图标
  // external 随 `primitives-icons.ts` 垫片一起撤掉。台账见 docs/builtin-plugins-inventory.md §5.1。
  assert.ok(rows.length >= 30, `只采到 ${rows.length} 条 dsh.client 声明，采集已脱靶`);
  const ghosts = rows.filter((r) => !lib.specInstalled(r.spec, ctx))
    .map((r) => `${r.dir}: ${r.kind} → ${r.spec}`);
  assert.deepEqual(ghosts, [], `声明了 pin 内核里不存在的包（client bundle 静默不加载）：\n  ${ghosts.join('\n  ')}`);

  // 反证：把一条真声明换成 pin 里没有的包，必须判幽灵；同时证明 /client 后缀归一没把真包判成幽灵。
  const okSpec = rows.find((r) => r.spec.startsWith('@deepseek-ai/'));
  assert.ok(okSpec, '夹具失败：舰队里没有宿主作用域的声明可参照');
  assert.equal(lib.specInstalled('@deepseek-ai/dsh-client-not-a-real-package', ctx), false,
    '不存在的包被判可解析（判据空转）');
  assert.equal(lib.specInstalled('@deepseek-ai/dsh-client-ui-primitives/client', ctx), true,
    '/client 后缀未归一，真包被判幽灵');
});

test('插件不得引用 kernel-pin 已移除的内核服务（ctx.get 形态零命中）', () => {
  const pin = JSON.parse(fs.readFileSync(path.join(DSH, 'scripts', 'compat', 'kernel-pin.json'), 'utf8'));
  const ids = pin.services.removed.map((r) => r.id);
  assert.ok(ids.length >= 10, `kernel-pin 的 removed 清单只剩 ${ids.length} 条，判据源已漂移`);

  const hits = [];
  let files = 0;
  for (const d of fs.readdirSync(PLUGINS).sort()) {
    const root = path.join(PLUGINS, d);
    if (!fs.statSync(root).isDirectory()) continue;
    for (const f of lib.walkPluginFiles(root)) {
      files++;
      const text = fs.readFileSync(f, 'utf8');
      for (const h of lib.findRemovedServiceRefs(text, ids)) {
        hits.push(`${d}: ${path.relative(root, f).replace(/\\/g, '/')} → ctx.get("${h.id}")`);
      }
    }
  }
  assert.ok(files >= 60, `只扫了 ${files} 个插件 JS 文件，覆盖面已脱靶`);
  assert.deepEqual(hits, [], `仍在按名索取已移除服务：\n  ${hits.join('\n  ')}`);

  // 反向捕获力：合成正文里写一条真移除 id 的 ctx.get，必须命中（否则「零命中」是空转）。
  const probe = `const s = ctx.get("${ids[0]}");`;
  assert.equal(lib.findRemovedServiceRefs(probe, ids).length, 1, '移除服务的引用形态识别脱靶');
});

// ---- better-sidebar 跨代图标面专项锁 ----------------------------------------
// 历史：0.15.3 时代上游用 `Icon*14/16` 取 primitives 图标，rc.2 改名后 112 处硬断链，
// 我们在 src/client/primitives-icons.ts 叠了一层 `?? Icon*Regular` 回落链并手改进产物。
// 0.24.1 吸纳性换装（2026-10-08）把这一层整块取消了：上游改出自带 `src/client/icons.tsx`
// （内联 SVG 组件，`Icon*14/16` 名字全在插件自有模块里，不经 primitives 命名空间），
// 宿主图标一律用 `*Regular/*Medium`。于是「回落链在场」不再是本插件的不变量，
// 真不变量换成两条：① 产物里不得残留任何未守卫的 primitives 旧后缀取用；
// ② primitives 成员取用逐名命中 pin 导出面。下面两条用例锁这两点，
// 并用「注入旧后缀必须报红 / 带回落不许报红」双向反证判据不是空转。

test('better-sidebar：primitives 图标面只走 pin 在位成员，不得残留旧后缀取用', () => {
  const root = path.join(PLUGINS, 'dsh-better-sidebar');
  const ctx = lib.makeContext({ root: DSH });
  const scan = lib.scanPlugin(root, ctx);

  // 覆盖哨兵：该插件确实在判据射程内（六个浏览器产物，实测 19 处宿主包别名改写；
  // 阈值取约八成，掉下去说明别名识别脱靶，「0 缺失」就成了空转）。
  assert.ok(scan.aliasCount >= 15, `primitives 等宿主包别名只采到 ${scan.aliasCount} 处，该插件没进判据射程`);
  assert.equal(scan.missing.size, 0,
    `存在未守卫且 pin 未导出的成员取用：${[...scan.missing.keys()].join(', ')}`);

  // src 侧：*14/*16 形态的图标组件必须来自插件自有模块（./icons.tsx），
  // 不得写成从 primitives 具名导入——那是 0.15.3 的断链形态。
  const srcFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p); else if (/\.(ts|tsx)$/.test(e.name)) srcFiles.push(p);
    }
  })(path.join(root, 'src'));
  const taken = srcFiles.filter((f) => /Icon[A-Za-z0-9]+1[46]\b/.test(fs.readFileSync(f, 'utf8')));
  assert.ok(taken.length >= 6, `旧后缀图标组件取用只采到 ${taken.length} 个文件，判据脱靶`);
  for (const f of taken) {
    const text = fs.readFileSync(f, 'utf8');
    const rel = path.relative(root, f).replace(/\\/g, '/');
    assert.ok(!/import\s*\{[^}]*Icon[A-Za-z0-9]+1[46][^}]*\}\s*from\s*['"]@deepseek-ai\//s.test(text),
      `${rel} 从宿主包具名导入了旧后缀图标（换代即断链）`);
    const local = text.match(/import\s*\{[^}]*Icon[A-Za-z0-9]+1[46][^}]*\}\s*from\s*['"]([^'"]+)['"]/s);
    if (local) assert.match(local[1], /^\./, `${rel} 的旧后缀图标应从相对路径的自有模块取，实为 ${local[1]}`);
  }
  // 上游回落表不得被「顺手补回来」：它守的是已不存在的取用形态，留着会误导下次换装。
  assert.equal(fs.existsSync(path.join(root, 'src', 'client', 'primitives-icons.ts')), false,
    'src/client/primitives-icons.ts 又出现了（0.24.1 已改用自带 icons.tsx，回落层是多余的）');
});

// ---- 判据 C：浏览器模块图 ---------------------------------------------------

test('在册舰队：./client 浏览器模块图里的裸名 require 必须命中模块表或 dsh.client.external', () => {
  const ctx = lib.makeContext({ root: DSH });
  const g = lib.scanFleetBrowser(PLUGINS, ctx);
  // 样本量哨兵：判据若不咬到足够多的入口/取用，0 红点只是空转（本文件反复栽过的坑）。
  assert.ok(g.withClient >= 20, `只有 ${g.withClient} 条插件被浏览器图判据覆盖，在册 28 条应有 20+`);
  assert.ok(g.files >= g.withClient, `浏览器图文件数 ${g.files} 少于插件数 ${g.withClient}，闭包没走进去`);
  assert.ok(g.bareHits >= 40, `裸名 require 只采到 ${g.bareHits} 处，判据脱靶`);
  assert.deepEqual(g.broken, [], '浏览器入口缺失或相对依赖断链（运行期必是 slot entry 静默消失）：' + g.broken.join(' | '));
  const off = g.report.map((r) => `${r.dir}: ${[...r.offTable.keys()].join(',')}`);
  assert.deepEqual(off, [], '浏览器侧存在模块表外的裸名 require（"missed the module table"）：' + off.join(' | '));
});

test('反证：入口在 dist/ 且表外裸名的合成插件，必须同时被浏览器图与 A/B 判据咬到', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-browser-graph-'));
  try {
    const dir = path.join(tmp, 'dist');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      name: 'fake-browser', version: '0.0.0', private: true,
      main: './lib/index.js',
      exports: { '.': { default: './lib/index.js' }, './client': { default: './dist/client.js' }, './package.json': './package.json' },
      dsh: { client: { platform: 'web', external: ['@deepseek-ai/dsh-client-ui-primitives/client'] } },
    }));
    fs.writeFileSync(path.join(dir, 'client.js'),
      'var _p = require("@deepseek-ai/dsh-client-ui-primitives");\n'
      + 'var kit = require("some-ui-kit");\n'
      + 'var ghost = require("@deepseek-ai/dsh-client-not-a-real-package");\n'
      + 'var dyn = require("${notStatic}");\n'
      + 'require("./chunk-1.js");\n'
      + 'h.render(_p.IconCloseFillRegular, kit.Box, ghost.thing, dyn);\n');
    fs.writeFileSync(path.join(dir, 'chunk-1.js'), 'module.exports = require("react-native");\n');
    fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'lib', 'index.js'), 'module.exports = 1;\n');

    const ctx = lib.makeContext({ root: DSH });
    // 入口闭包：dist/client.js + 它的相对 chunk，一个都不能少。
    const entries = lib.clientEntryFiles(JSON.parse(fs.readFileSync(path.join(tmp, 'package.json'), 'utf8')));
    assert.deepEqual(entries, ['dist/client.js'], './client 条件导出没解析成入口');
    const g = lib.scanBrowserGraph(tmp, ctx);
    assert.deepEqual(g.files, ['dist/chunk-1.js', 'dist/client.js'], 'chunk 闭包没走全');
    assert.deepEqual(g.offTable.get('some-ui-kit'), ['dist/client.js'], '浏览器侧裸第三方名未报表外');
    assert.deepEqual(g.offTable.get('@deepseek-ai/dsh-client-not-a-real-package'), ['dist/client.js'],
      '表外宿主包未报表外');
    assert.ok(g.offTable.has('react-native'), '相对 chunk 里的裸名没进判据（闭包形同虚设）');
    assert.ok(![...g.offTable.keys()].some((k) => k.includes('${')), '动态拼接说明符被当成静态表外，误报');

    // 同一份产物在 A/B 半边也必须可见：dist/ 不再被 SKIP_DIR 整目录挡掉。
    const ab = lib.scanPlugin(tmp, ctx);
    assert.equal(ab.aliasCount, 4, `命名空间别名应采到 4 条（dist 入口没进扫描？）实为 ${ab.aliasCount}`);
    assert.ok(ab.missing.has('@deepseek-ai/dsh-client-not-a-real-package#thing')
      || ab.offTable.has('@deepseek-ai/dsh-client-not-a-real-package'),
      'dist 入口里的表外宿主包在 A/B 半边不可见');
    // 对照组：dist 里的正当成员取用不该红。
    assert.ok(![...ab.missing.keys()].some((k) => k.endsWith('#IconCloseFillRegular')), '正当成员被误判断链');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---- 入口可见性（全新环境的交付判据）---------------------------------------

test('在册插件：manifest 声明的每个 JS 入口必须在磁盘存在且不被 git 忽略规则遮蔽', () => {
  const rows = lib.auditEntryVisibility(PLUGINS);
  assert.ok(rows.length >= 40, `入口只采到 ${rows.length} 条，在册 28 条插件应有 40+`);
  assert.deepEqual(rows.filter((r) => !r.exists).map((r) => `${r.dir}/${r.entry}`), [],
    'manifest 指向的入口文件不在磁盘（loader 侧表现为 import 失败）');
  assert.deepEqual(rows.filter((r) => r.ignored).map((r) => `${r.dir}/${r.entry}`), [],
    '入口文件被 .gitignore 遮蔽 → 全新 clone 没有它，伴随插件同步会装出空目录');
  // 样本量哨兵：确有入口落在通用 SKIP_DIR 名下（dist/），否则上一条断言可能只是没咬到东西。
  const shipped = rows.filter((r) => r.entry.split('/').some((s) => lib.SKIP_DIR.has(s)));
  assert.ok(shipped.length >= 1, '没有任何入口落在被整目录跳过的目录下，白名单判据空转');
});

test('判据源反证：通用 dist/ 规则确实会遮蔽入口，插件级例外必须把它放回来', () => {
  // 合成路径走同一条 gitignore 引擎：证明「被 ignore」不是恒 false 的摆设。
  assert.equal(lib.gitIgnored('dsh-desktop/assets/plugins/some-plugin/dist/client.js'), true,
    '通用 dist/ 规则没咬住合成入口，判据源已失效');
  assert.equal(lib.gitIgnored('dsh-desktop/assets/plugins/dsh-prompt-optimizer/dist/client.js'), false,
    'dsh-prompt-optimizer 的浏览器入口仍在忽略范围内（例外规则没生效）');
  assert.equal(lib.gitIgnored('dsh-desktop/scripts/lib/plugin-module-table.js'), false,
    '普通源文件被判成忽略，判据过宽');
});

test('变异反证：往真产物注入 primitives 旧后缀取用，判据必须逐名报红、带回落不许报红', () => {
  // 真·变异：拿 better-sidebar 的真实产物（client.js）做宿主，往尾部接一段
  // 「未守卫取用 rc.2 已移除的旧图标成员」，同一套 scanPlugin 必须逐名报红；
  // 同段落加回 `?? Icon*Regular` 守卫后必须 0 红。这一红一绿是「上面那条 0 缺失
  // 不是空转」的现场证据，也正是 0.15.3 时代那层回落链守的形态。
  const root = path.join(PLUGINS, 'dsh-better-sidebar');
  const ctx = lib.makeContext({ root: DSH });
  const original = fs.readFileSync(path.join(root, 'lib', 'client.js'), 'utf8');
  const PRIMITIVES = '@deepseek-ai/dsh-client-ui-primitives';

  const fixtureWith = (tail) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-bs-mutant-'));
    fs.copyFileSync(path.join(root, 'package.json'), path.join(tmp, 'package.json'));
    fs.mkdirSync(path.join(tmp, 'lib'), { recursive: true });
    for (const f of fs.readdirSync(path.join(root, 'lib'))) {
      if (!f.endsWith('.js')) continue;
      fs.copyFileSync(path.join(root, 'lib', f), path.join(tmp, 'lib', f));
    }
    fs.writeFileSync(path.join(tmp, 'lib', 'client.js'), original + '\n' + tail + '\n');
    return tmp;
  };

  const bare = 'var _mutprobe = require("@deepseek-ai/dsh-client-ui-primitives");'
    + 'h.render(_mutprobe.IconCloseFill14, _mutprobe.IconChevronDown16);';
  const guardedTail = 'var _mutprobe = require("@deepseek-ai/dsh-client-ui-primitives");'
    + 'h.render(_mutprobe.IconCloseFill14 ?? _mutprobe.IconCloseFillRegular,'
    + ' _mutprobe.IconChevronDown16 ?? _mutprobe.IconCloseFillRegular);';

  let tmp = fixtureWith(bare);
  try {
    const r = lib.scanPlugin(tmp, ctx);
    for (const k of [`${PRIMITIVES}#IconCloseFill14`, `${PRIMITIVES}#IconChevronDown16`]) {
      assert.ok(r.missing.has(k), `变异体没报出 ${k}（判据对未守卫旧后缀取用已脱靶）`);
    }
    assert.ok([...r.missing.keys()].every((k) => /#Icon[A-Za-z0-9]+1[46]$/.test(k)),
      '变异体报出了预期之外的成员：' + [...r.missing.keys()].filter((k) => !/#Icon[A-Za-z0-9]+1[46]$/.test(k)).join(', '));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  tmp = fixtureWith(guardedTail);
  try {
    const r = lib.scanPlugin(tmp, ctx);
    assert.equal(r.missing.size, 0,
      `带回落的取用被误判断链（守卫会常红，真兼容代码会被判死）：${[...r.missing.keys()].join(', ')}`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }

  // 对照组：未变异的原始产物同判据必须 0 缺失（红点来自变异段落，不是路径/别名识别差异）。
  assert.equal(lib.scanPlugin(root, ctx).missing.size, 0, '原始产物本就有缺失成员，对照不成立');
});
