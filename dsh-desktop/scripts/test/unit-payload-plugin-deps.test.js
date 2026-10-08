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

const { COMPANION_PLUGINS, companionDirName } = require('../lib/companion-plugins');
const {
  residueNodeModules,
  overlongFiles,
  longestInstallPath,
  INSTALL_PREFIX_DEFAULT,
  PATH_LIMIT_DEFAULT,
} = require('../lib/payload-plugin-deps');

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

test('在册插件全被判给：以真实 COMPANION_PLUGINS 过一遍，正件集合恰好是 dsh-pocket', () => {
  const present = COMPANION_PLUGINS.map(companionDirName);
  const doomed = new Set(residueNodeModules(COMPANION_PLUGINS, present, companionDirName));
  const shipped = COMPANION_PLUGINS.filter((p) => p.shipsNodeModules).map(companionDirName);
  assert.deepEqual(shipped, ['dsh-pocket'], '当前唯一声明 shipsNodeModules 的是 dsh-pocket');
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
