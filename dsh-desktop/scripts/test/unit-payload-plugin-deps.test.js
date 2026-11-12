'use strict';

// unit-payload-plugin-deps.test.js —— 内置线交付门禁的判据（node --test）。
//
// v1.0.0 内置线（2026-10-08 裁定）把 `assets/plugins` 整树装回安装包，随之新增两条只属于
// **交付面**的风险：dev 树的依赖残留会原样进包（历史实测 433MB），以及插件文件在安装态
// 拼上安装根前缀后越过 NSIS 的 260 字符断点（历史实错 abort 于 installer.nsi:15383）。
// 判据是纯函数 `scripts/lib/payload-plugin-deps.js`，走盘与报错在调用方
// `dsh-tauri/scripts/stage-plugin-gate.mjs`（由 stage-payload.sh 接线）。
//
// 与 unit-hub-registry 的分工：那条咬的是**源树**磁盘实存 ⇔ shipsNodeModules 声明；
// 这里咬的是**payload**该剪什么、什么算超长——两者判据同源（都读 shipsNodeModules），
// 但作用面不同，缺一个就是「源干净、包脏」。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { COMPANION_PLUGINS, companionDirName } = require('../lib/companion-plugins');
const {
  residueNodeModules,
  overlongFiles,
  longestInstallPath,
  INSTALL_PREFIX_DEFAULT,
  PATH_LIMIT_DEFAULT,
  NSIS_SOURCE_PREFIX_DEFAULT,
  NSIS_SOURCE_WORKSPACE,
  NSIS_SOURCE_CONFIG_DIR,
  NSIS_SOURCE_LIMIT,
  NSIS_SOURCE_PRUNE_DIR,
  NSIS_SOURCE_PRUNE_TREES,
  nsisSourcePrefixFrom,
  nsisGateApplies,
  overlongSourceFiles,
  sourcePathLength,
} = require('../lib/payload-plugin-deps');

const REPO = path.resolve(__dirname, '..', '..', '..');

test('残留判据与同步面同源：只有 shipsNodeModules 声明的插件目录保留 node_modules', () => {
  const plugins = [
    { id: 'pocket', name: 'dsh-pocket', shipsNodeModules: true },
    { id: 'balance', name: '@deepseek-ai/dsh-balance' },
  ];
  const present = ['dsh-pocket', 'dsh-balance'];
  const doomed = residueNodeModules(plugins, present, companionDirName);
  assert.deepEqual(doomed, ['dsh-balance/node_modules'],
    '未声明随包的那条必须剪，声明了的那条必须留');
});

test('残留判据按包名→目录名换算（scoped 包落点是去 scope 的目录名）', () => {
  // dsh-balance 的源目录叫 dsh-balance（companionDirName 去掉 @scope/），判据必须用它比对，
  // 拿 name 直接比会一条都剪不到——本用例钉住这个换算。
  const plugins = [{ id: 'balance', name: '@deepseek-ai/dsh-balance' }];
  assert.equal(companionDirName({ name: '@deepseek-ai/dsh-balance' }), 'dsh-balance');
  assert.deepEqual(residueNodeModules(plugins, ['dsh-balance'], companionDirName),
    ['dsh-balance/node_modules']);
});

test('在册插件全被判给：以真实 COMPANION_PLUGINS 过一遍，正件集合恰好是 dsh-pocket 与 ds-harness-remote', () => {
  const present = COMPANION_PLUGINS.map(companionDirName);
  const doomed = new Set(residueNodeModules(COMPANION_PLUGINS, present, companionDirName));
  const shipped = COMPANION_PLUGINS.filter((p) => p.shipsNodeModules).map(companionDirName);
  assert.deepEqual(shipped.sort(), ['ds-harness-remote', 'dsh-pocket'], '声明 shipsNodeModules 的是 dsh-pocket 与 ds-harness-remote');
  for (const dir of shipped) assert.equal(doomed.has(dir + '/node_modules'), false);
  assert.equal(doomed.size, COMPANION_PLUGINS.length - shipped.length);
});

test('超长判据按安装前缀算：边界内放行、+1 判红', () => {
  const rel = 'x'.repeat(10);
  const headroom = PATH_LIMIT_DEFAULT - INSTALL_PREFIX_DEFAULT.length - rel.length;
  assert.ok(headroom > 0, '夹具应能构造恰好达标的长度');
  const atLimit = 'x'.repeat(10) + 'a'.repeat(headroom);
  assert.equal((INSTALL_PREFIX_DEFAULT + atLimit.replace(/\//g, '\\')).length, PATH_LIMIT_DEFAULT);
  assert.deepEqual(overlongFiles([atLimit]), [], '恰好等于上限不算超限');
  const overOne = atLimit + 'a';
  const hits = overlongFiles([overOne]);
  assert.equal(hits.length, 1, '超 1 个字符必须判红');
  assert.equal(hits[0].rel, overOne);
  assert.equal(hits[0].len, PATH_LIMIT_DEFAULT + 1);
});

test('超长判据真的带前缀：同一条相对路径，换更长前缀必须从不判变成判红', () => {
  const rel = 'assets/plugins/dsh-better-sidebar/lib/client.js';
  assert.deepEqual(overlongFiles([rel], { prefix: 'C:\\a\\', limit: 60 }), [],
    '夹具前提：短前缀下这条不超限');
  const hits = overlongFiles([rel], { prefix: INSTALL_PREFIX_DEFAULT, limit: 60 });
  assert.equal(hits.length, 1, '前缀参与计算，否则本用例恒绿');
});

test('最长路径自述：即便全部合规也把实测值报出来（防「静默通过」）', () => {
  const top = longestInstallPath(['a/b.js', 'a/very/long/' + 'c'.repeat(40) + '.js']);
  assert.ok(top.len > INSTALL_PREFIX_DEFAULT.length, '实测长度必须含前缀');
  assert.match(top.rel, /^a\/very\/long\//);
  assert.equal(longestInstallPath([]).len, 0, '空集返回 0 而不是 undefined');
});

test('反证：判据对「漏剪」和「漏判超长」都有捕获力', () => {
  // 变异 1：把 shipsNodeModules 判据换成「全部保留」→ 残留剪不掉，用例必须判红。
  const keepAll = (plugins, present, dirNameOf) =>
    present.map((d) => dirNameOf({ name: d }) + '/__never__');
  const plugins = [{ id: 'pocket', name: 'dsh-pocket', shipsNodeModules: true }, { id: 'b', name: 'dsh-balance' }];
  assert.notDeepEqual(keepAll(plugins, ['dsh-pocket', 'dsh-balance'], companionDirName),
    residueNodeModules(plugins, ['dsh-pocket', 'dsh-balance'], companionDirName),
    '「全保留」变异与原判据结果不同——说明真在读 shipsNodeModules');
  // 变异 2：忽略 limit 恒返回空 → 超长漏判。
  const never = (rels) => rels.filter(() => false);
  assert.equal(never(['a'.repeat(500)]).length, 0);
  assert.equal(overlongFiles(['a'.repeat(500)]).length, 1,
    '同一输入下真判据必须给出 1 条红');
});

// ---------------------------------------------------------------------------
// ④ 构建期的第二道墙（2026-10-17 v1.0.4 发布实错）：makensis 的**源路径**。
// 与安装态那条不同源、不同前缀，且**本机永远量不到**（本机前缀 55 / CI 94，差 39 字符）——
// 所以这几条用例的意义是：把「本机全绿、CI 两个 Windows job 炸在 installer.nsi:33251」
// 这件事钉成机器判据，而不是留在 CHANGELOG 的散文里。
// ---------------------------------------------------------------------------

test('CI 源路径前缀与 tauri.conf.json 现场对账：挪 staging 名/位必须同步常量', () => {
  const conf = JSON.parse(fs.readFileSync(
    path.join(REPO, 'dsh-tauri', 'src-tauri', 'src', 'app', 'tauri.conf.json'), 'utf8'));
  const res = (conf.bundle && conf.bundle.resources) || {};
  const fromKey = Object.keys(res).find((k) => res[k] === 'dsh-desktop/');
  assert.ok(fromKey, 'resources 里没有映射到 "dsh-desktop/" 的 from 串——安装布局载荷根改名了？');
  const composed = 'D:\\a\\dsh_desktop\\dsh_desktop\\dsh-tauri\\src-tauri\\src\\app\\'
    + fromKey.split('/').filter(Boolean).join('\\') + '\\';
  assert.equal(composed, NSIS_SOURCE_PREFIX_DEFAULT,
    '前缀 = CI workspace + 配置目录 + resources from 串的未归一化字面量；对不上就等于门禁在量一条不存在的路');
  assert.equal(NSIS_SOURCE_PREFIX_DEFAULT.length, 69,
    'CI 前缀实测 69 字符（本机 30，差 39）——2026-11-12 staging 挪到 dsh-tauri/pp/ 后从 94 缩下来');
  // v1.0.5 首跑事故：门禁用 path.sep 拼前缀，Linux/macOS runner 拼出正斜杠 → 与常量误判不符。
  assert.equal(nsisSourcePrefixFrom(fromKey), composed,
    '门禁必须走 nsisSourcePrefixFrom：前缀是 Windows 字面口径，不许随宿主分隔符分叉');
  assert.ok(!nsisSourcePrefixFrom(fromKey).includes('/'), 'makensis 口径全反斜杠');
  assert.equal(NSIS_SOURCE_WORKSPACE + '\\' + NSIS_SOURCE_CONFIG_DIR,
    'D:\\a\\dsh_desktop\\dsh_desktop\\dsh-tauri\\src-tauri\\src\\app', '前缀两段常量被改动');
});

test('平台门控：makensis 只在 Windows 构建上存在，非 Windows 宿主跳过剪除与长度判定', () => {
  assert.equal(nsisGateApplies('win32'), true);
  assert.equal(nsisGateApplies('darwin'), false,
    'macOS 本机装的 libreoffice-kit-darwin-arm64 带 LibreOffice.app 长配置名——按 Windows 前缀量就是假阳性');
  assert.equal(nsisGateApplies('linux'), false);
});

test('剪除面：整树只剪构建期输入，DevTools 议题文本按目录级整批剪', () => {
  assert.ok(NSIS_SOURCE_PRUNE_TREES.length > 0, '整树清单为空则本用例恒绿——按实测它应有条目');
  assert.equal(new Set(NSIS_SOURCE_PRUNE_TREES).size, NSIS_SOURCE_PRUNE_TREES.length, '清单不许重复');
  for (const rel of NSIS_SOURCE_PRUNE_TREES) {
    assert.match(rel, /libreoffice-kit-[^/]+\/sources$/, `整树剪除只允许构建期输入目录：${rel}`);
    assert.ok(!/\/(program|share)\//.test(rel), `运行时资源不许整树剪：${rel}`);
  }
  assert.match(NSIS_SOURCE_PRUNE_DIR, /issues_manager\/descriptions\/$/,
    '目录级剪除的对象必须是 DevTools 议题说明文本目录');
  // 前缀 94 → 69 之后，这批长名文本已不再越线——剪除是**体积**决定，不再是越线决定。
  assert.ok(sourcePathLength(NSIS_SOURCE_PRUNE_DIR + 'x.md') < NSIS_SOURCE_LIMIT,
    '缩前缀后该目录已不越线；若这里红了说明壁障换了位置，别照着旧结论剪文件');
});

test('构建期断点按实测收口：258 放行、259 判红（260 实测中断，259 无实证故从严）', () => {
  const atPass = 'a'.repeat(NSIS_SOURCE_LIMIT - NSIS_SOURCE_PREFIX_DEFAULT.length);
  assert.equal(sourcePathLength(atPass), NSIS_SOURCE_LIMIT);
  assert.deepEqual(overlongSourceFiles([atPass]), [], '恰好 258 必须放行——CI 实测邻居文件正是这个长度进了包');
  const atWall = atPass + 'a';
  const hits = overlongSourceFiles([atWall]);
  assert.equal(hits.length, 1, '259 必须判红');
  assert.equal(hits[0].len, NSIS_SOURCE_LIMIT + 1);
});

test('反证：同一条越线文件换成本机前缀就全绿——判据不带 CI 前缀等于没判', () => {
  const LOCAL_PREFIX = 'D:\\workspace\\dsh\\dsh-tauri\\pp\\';
  assert.equal(LOCAL_PREFIX.length, 30, '本机 staging 前缀实测 30 字符');
  const OLD_CI_PREFIX = 'D:\\a\\dsh_desktop\\dsh_desktop\\dsh-tauri\\src-tauri\\src\\app\\'
    + '..\\..\\..\\package-payload\\dsh-desktop\\';
  assert.equal(OLD_CI_PREFIX.length, 94, '旧 CI 前缀实测 94 字符（v1.0.4 事故那一代）');
  const rel = 'a'.repeat(162) + '.md';   // 165 字符：旧前缀 94 + 165 = 259 > 258
  assert.equal(overlongFiles([rel], { prefix: OLD_CI_PREFIX, limit: NSIS_SOURCE_LIMIT }).length, 1,
    '旧前缀下必须判红，否则夹具前提不成立（这条就是「本机打包全绿、CI 炸」的形状）');
  assert.deepEqual(overlongFiles([rel], { prefix: LOCAL_PREFIX, limit: NSIS_SOURCE_LIMIT }), [],
    '本机前缀下同一条全绿——所以本机永远量不到 CI 那道墙');
  assert.deepEqual(overlongSourceFiles([rel]), [],
    '新 CI 前缀（69）下同一条也绿了：结构性修法腾出的 25 字符就是这些文件的活路');
});

test('实测哨兵：pin 内核闭包里 inspector 包已无越线文件（结构性修法的验收面）', () => {
  const pkg = path.join(REPO, 'dsh-desktop', 'node_modules', '@deepseek-ai', 'dsh-experimental-inspector');
  assert.ok(fs.existsSync(pkg),
    'pristine/收敛闭包缺 @deepseek-ai/dsh-experimental-inspector——先 cd dsh-desktop && npm ci 再跑本用例');
  const rels = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !e.isSymbolicLink()) { walk(full); continue; }
      rels.push('node_modules/@deepseek-ai/dsh-experimental-inspector/'
        + path.relative(pkg, full).split(path.sep).join('/'));
    }
  })(pkg);
  assert.ok(rels.length > 100, `走盘结果异常（${rels.length} 个文件）——本用例判据会空转`);
  const over = overlongSourceFiles(rels);
  assert.deepEqual(over.map((r) => r.rel), [],
    over.length
      ? `该包仍有 ${over.length} 条越线（最长 ${over[0].len}）：前缀 69 之下还越线，说明上游又压长了目录层级；`
        + '要么加目录级剪除（有名有姓地丢），要么再次缩短 staging 前缀——CI staging 第四道此刻已经在拦'
      : '');
});

/** staging 接线判据：第二道门禁必须跑在 node_modules 镜像**之后**，且五个架构一处不落。 */
function idxAll(src, needle) {
  const out = [];
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) out.push(i);
  return out;
}
function stagingWiringViolations(sh, yml) {
  const v = [];
  const shMirror = sh.indexOf('mirror_dir "$SRC/node_modules" "$DST/node_modules"');
  const shGate = sh.indexOf('stage-nsis-path-gate.mjs');
  if (shMirror < 0) v.push('stage-payload.sh 解析不到 node_modules 镜像行');
  if (shGate < 0) v.push('stage-payload.sh 未接第二道门禁（构建期 makensis 源路径）');
  else if (shMirror >= 0 && shGate < shMirror) v.push('第二道门禁跑在 node_modules 镜像之前——量不到内核树');
  const copies = idxAll(yml, 'cp -r dsh-desktop/node_modules "$DEST/node_modules"');
  const gates = idxAll(yml, 'node dsh-tauri/scripts/stage-nsis-path-gate.mjs "$DEST"');
  if (copies.length !== 5) v.push(`CI staging 的 node_modules 镜像段数应为 5（五个架构），实为 ${copies.length}`);
  if (gates.length !== copies.length) {
    v.push(`CI 第二道门禁调用 ${gates.length} 处 ≠ 镜像段数 ${copies.length}（改一处必须五处同改）`);
  }
  copies.forEach((c, n) => {
    const next = copies.find((x) => x > c);
    if (!gates.some((g) => g > c && (next === undefined || g < next))) {
      v.push(`第 ${n + 1} 段 CI staging 在 node_modules 镜像之后没有第二道门禁`);
    }
  });
  return v;
}

test('接线：stage-payload.sh 与五个架构 CI staging 都在镜像之后调用第二道门禁', () => {
  const sh = fs.readFileSync(path.join(REPO, 'dsh-tauri', 'scripts', 'stage-payload.sh'), 'utf8');
  const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'tauri-release.yml'), 'utf8');
  assert.deepEqual(stagingWiringViolations(sh, yml), [], '第二道门禁的接线不完整');
});

test('反证：接线判据对「漏调」「调早了」「五处漏一处」都有捕获力', () => {
  const sh = fs.readFileSync(path.join(REPO, 'dsh-tauri', 'scripts', 'stage-payload.sh'), 'utf8');
  const yml = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'tauri-release.yml'), 'utf8');
  const call = 'node dsh-tauri/scripts/stage-nsis-path-gate.mjs "$DEST"';
  // 变异 1：本地链漏调。
  assert.ok(stagingWiringViolations(sh.replace('stage-nsis-path-gate.mjs', 'never-called.mjs'), yml).length,
    '漏调必须判红');
  // 变异 2：调在 node_modules 镜像之前。
  const moved = sh.replace(/node "\$REPO_ROOT\/dsh-tauri\/scripts\/stage-nsis-path-gate\.mjs"[^}]*}\n/m, '')
    .replace('mirror_dir "$SRC/node_modules" "$DST/node_modules"',
      'node "$REPO_ROOT/dsh-tauri/scripts/stage-nsis-path-gate.mjs" "$DST" || exit 1\n'
      + 'mirror_dir "$SRC/node_modules" "$DST/node_modules"');
  assert.ok(stagingWiringViolations(moved, yml).some((x) => /镜像之前/.test(x)),
    '跑在镜像之前必须判红');
  // 变异 3：五个架构里漏一段（摘掉第一次出现的那条调用）。
  const first = yml.indexOf(call);
  assert.ok(first >= 0, '夹具前提：workflow 里确实有该调用');
  const oneShort = yml.slice(0, first) + yml.slice(first + call.length);
  assert.ok(stagingWiringViolations(sh, oneShort).length,
    '五处同改漏一处必须判红');
});
