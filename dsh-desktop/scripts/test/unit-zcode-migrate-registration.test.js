'use strict';
// dsh-zcode-migrate 内置登记守卫（node --test）。
//
// 这个插件是 2026-09 按要求内置进本仓库的（宿主侧 bundle 插件）：把 zcode CLI 的历史
// 会话（SQLite）转成 dsh 原生会话日志，迁完可在会话列表里恢复。内置 = 两件事同时成立：
//   ① 资产在 `assets/plugins/dsh-zcode-migrate/`（运行时落点，启动期同步镜像进 profile）；
//   ② 在 `scripts/lib/companion-plugins.js` 的 COMPANION_PLUGINS 里登记。
// 少任何一条都不会被装配：只放资产不登记 → 启动期同步不认识它（实测：插件目录进了
// 安装目录 payload 也不会落位 profile）；只登记不放资产 → hub 元数据校验直接判不合格。
//
// 判据（对齐 issue #104 的坑）：登记条目的 `id` 必须与插件自己 `cordis.patch.yml` 里的
// loader id 完全一致 —— 不一致会让 bundle 迁移的 dropBlocksByIds 漏掉残留 insert 行，
// 造成重复挂载与启动崩溃。
//
// 用法：node --test scripts/test/unit-zcode-migrate-registration.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const ASSETS = path.join(REPO, 'assets', 'plugins', 'dsh-zcode-migrate');
const { COMPANION_PLUGINS } = require('../lib/companion-plugins');

const read = (rel) => fs.readFileSync(path.join(ASSETS, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));

test('COMPANION_PLUGINS 登记 zcode-migrate（append，不扰动既有条目）', () => {
  const hits = COMPANION_PLUGINS.filter((p) => p.id === 'zcode-migrate');
  assert.equal(hits.length, 1, '必须恰好登记一次（重复登记 = 双挂载）');
  assert.equal(hits[0].name, 'dsh-zcode-migrate', 'name 必须是 profile node_modules 下的包名');
  // append 语义：既有条目必须原样在位（这条锁住「顺手重排清单」这类改动）。
  // 抽样点覆盖清单头/中/尾；原抽的 harness-pet 已随 v1.0.0 批量退役，换成 dsh-pocket。
  for (const id of ['better-sidebar', 'dsh-session-manager', 'dsh-pocket']) {
    assert.ok(COMPANION_PLUGINS.some((p) => p.id === id), `既有条目 ${id} 不得被挤掉`);
  }
  assert.ok(
    !COMPANION_PLUGINS.some((p) => p.id === 'zcode-migrate' && p.shipsNodeModules === true),
    '该插件自包含（无 node_modules），不得标 shipsNodeModules',
  );
});

test('资产目录与元数据齐备（hub 元数据校验面）', () => {
  assert.ok(fs.existsSync(ASSETS), `资产目录不在位：${ASSETS}`);
  for (const f of ['package.json', 'dsh.plugin.json', 'cordis.patch.yml', 'src/index.js', 'core/index.js']) {
    assert.ok(fs.existsSync(path.join(ASSETS, f)), `缺文件：${f}`);
  }
  const pkg = readJson('package.json');
  const manifest = readJson('dsh.plugin.json');
  assert.equal(pkg.name, 'dsh-zcode-migrate', '包名必须与登记 name 一致');
  assert.match(pkg.version, /^\d+\.\d+\.\d+/, '版本号必须是可比较的 x.y.z（hub 登记读它）');
  assert.ok((pkg.description || '').length > 0, '描述不能空（hub 元数据校验要求）');
  assert.equal(manifest.id, pkg.name, 'manifest id 必须等于包名（本插件的约定）');
  assert.equal(manifest.version, pkg.version, 'manifest 与 package 版本必须同步');
});

test('loader id 一致性（issue #104 的坑：不一致会双挂载）', () => {
  const registryId = COMPANION_PLUGINS.find((p) => p.id === 'zcode-migrate').id;
  const patch = read('cordis.patch.yml');
  const loaderId = (patch.match(/^\s*-\s*id:\s*(\S+)\s*$/m) || [])[1];
  assert.ok(loaderId !== undefined, 'cordis.patch.yml 里找不到 insert 行的 loader id');
  assert.equal(loaderId, registryId, '登记 id 必须与 cordis.patch.yml 的 loader id 一致');
  // 包名同样要对上（bundle 迁移按 name 判定「这个 bundle 是否已挂」）。
  // 实测 28 份 cordis.patch.yml 里 26 份的 name 是 YAML 单引号形态、2 份裸写——
  // 引号不是语义的一部分（内核用 YAML 解析器读），所以剥掉两侧引号再比，
  // 免得「顺手去掉一对引号」被误报成双挂载缺陷。
  const rawName = (patch.match(/^\s*name:\s*(\S+)\s*$/m) || [])[1];
  const loaderName = rawName === undefined ? undefined : rawName.replace(/^['"]+|['"]+$/g, '');
  assert.equal(loaderName, 'dsh-zcode-migrate', 'insert 行的 name 必须是包名');
});

test('manifest 声明的工具必须在源码里真的注册（防「声明了没实现」）', () => {
  const manifest = readJson('dsh.plugin.json');
  const declared = manifest.contributes?.tools ?? [];
  assert.deepEqual(declared, ['zcode_inspect', 'zcode_migrate', 'zcode_verify'], '工具清单是既有契约，改这里要同步改实现与文档');
  const tools = read('src/tools.js');
  const offenders = declared.filter((name) => !tools.includes(`'${name}'`));
  assert.deepEqual(offenders, [], `以下工具在 manifest 里声明但 src/tools.js 没注册：${offenders.join(', ')}`);
});

// ---------------------------------------------------------------------------
// 客户端半（设置页）：给「选中 + 一键迁移」提供界面。三条不变量：
//   ① 清单声明了 client.main，且那个文件真的存在（否则内核加载不到页面）；
//   ② 包内 bundle id 必须等于 manifest id —— 注册表频道靠 id === 插件 id 判定到货，
//      写成包名以外的东西会「装了但页面不出现」；
//   ③ 页面必须注册到内核的设置槽（settings.section），且宿主侧真挂了它调用的那个
//      HTTP 前缀路由（两边路径漂移 = 页面永远报错）。
// ---------------------------------------------------------------------------
test('客户端半：设置页在清单/包声明/产物/宿主路由四处对齐', () => {
  const manifest = readJson('dsh.plugin.json');
  const pkg = readJson('package.json');
  const offenders = [];

  // ① 声明与产物
  if (manifest.client?.main !== './lib/client.js') offenders.push('dsh.plugin.json 未声明 client.main=./lib/client.js');
  if (pkg.exports?.['./client'] === undefined) offenders.push('package.json 缺 ./client 导出');
  const clientFile = path.join(ASSETS, 'lib', 'client.js');
  if (!fs.existsSync(clientFile)) offenders.push('lib/client.js 不在位（客户端产物）');
  else {
    const src = fs.readFileSync(clientFile, 'utf8');
    // ② bundle id === manifest id
    const id = (src.match(/__ModuleLoader__\.load\(\{\s*id:\s*'([^']+)'/) || [])[1];
    if (id !== manifest.id) offenders.push(`bundle id(${id}）必须等于 manifest id(${manifest.id})`);
    // ③ 设置槽 + 调用的接口前缀
    if (!src.includes("'settings.section'")) offenders.push('页面未注册 settings.section');
    const apiPrefix = (src.match(/const API = '([^']+)'/) || [])[1];
    if (apiPrefix === undefined) offenders.push('页面未声明 API 前缀');
    else {
      const host = read('src/rpc.js');
      const hostPrefix = (host.match(/API_PREFIX = '([^']+)'/) || [])[1];
      if (hostPrefix !== apiPrefix) offenders.push(`页面前缀(${apiPrefix}) 与宿主 API_PREFIX(${hostPrefix}) 不一致`);
      for (const action of ['inspect', 'migrate', 'verify', 'workspaces']) {
        if (!host.includes(`${API_PREFIX_ACTION(action)}`)) offenders.push(`宿主缺 ${action} 分支`);
      }
    }
    // 注入面：设置槽的拥有者必须在 dsh.client.inject 里
    const inject = pkg.dsh?.client?.inject ?? [];
    if (!inject.some((id) => /dsh-client-ui-settings/.test(id))) offenders.push('dsh.client.inject 未包含 @deepseek-ai/dsh-client-ui-settings');
  }

  assert.deepEqual(offenders, [], offenders.join('\n'));
});

// ---------------------------------------------------------------------------
// 「目录已不存在」的语义（用户实报：每次登记工作区都刷一排 ENOENT 红字）。
// 注册表要求目录真实存在，而 zcode 的历史会话经常指向早已删掉的项目目录，于是
// 「登记工作区」对那批目录永远失败。约定：**不存在 ≠ 失败**，宿主报 `skipped: true`
// 且不调注册表，页面按灰字列出并藏掉登记按钮。这条用真 HTTP 面（真 server + fetch）
// 跑行为，而不是正则扫源码 —— 语义错了必须能红。
// ---------------------------------------------------------------------------
test('workspaces：目录已不存在 → skipped 且不碰注册表（真 HTTP 面）', async () => {
  const http = require('node:http');
  const { pathToFileURL } = require('node:url');
  const os = require('node:os');
  const { createApiHandler, API_PREFIX } = await import(pathToFileURL(path.join(ASSETS, 'src', 'rpc.js')).href);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-zcode-ws-'));
  const realDir = path.join(root, 'still-here');
  const goneDir = path.join(root, 'deleted-long-ago');
  fs.mkdirSync(realDir);
  const calls = [];
  const registry = {
    async create(dir, title) {
      calls.push({ dir, title });
      return { id: 'ws-' + title, title };
    },
  };
  const handler = createApiHandler({ dbPath: 'x', dshRoot: 'y' }, { workspaceRegistry: registry });
  const server = http.createServer((req, res) => { handler(req, res).catch(() => res.end()); });
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const res = await fetch(`http://127.0.0.1:${server.address().port}${API_PREFIX}/workspaces`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ directories: [realDir, goneDir] }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.ok, true, '请求成功即 ok:true（顶层 ok:false 会被页面当硬错误，吞掉逐条结果）');
    assert.equal(body.results[0].ok, true, '存在的目录照常登记');
    assert.equal(body.results[1].ok, false);
    assert.equal(body.results[1].skipped, true, '不存在的目录必须标 skipped');
    assert.equal(body.results[1].error, undefined, 'skipped 不带 error（页面才能与真失败分开渲染）');
    assert.deepEqual(calls.map((c) => c.dir), [realDir], '不存在的目录不得调用 registry.create');
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('inspect 报出目录/会话的存在性（页面据此标注与门控）', () => {
  const core = read('core/migrate.js');
  assert.match(core, /exists:\s*existsOf\(directory\)/, 'inspect().directories[] 必须带 exists');
  assert.match(core, /directoryExists:\s*existsOf\(/, 'inspect().sessions[] 必须带 directoryExists');
  const client = read('lib/client.js');
  assert.match(client, /directoryExists !== false/, '页面必须按存在性门控「登记工作区」按钮');
  assert.match(client, /skipped === true/, '页面必须单独渲染 skipped（灰字）而不是并进失败');
});

// ---------------------------------------------------------------------------
// 设置页「点一下」的行为锁（用户实报：点「迁移选中」报 `ids.map is not a function`）。
//
// 根因是把处理函数裸挂在 onClick 上 —— React 会把点击事件当第一个实参传进去，
// 事件不是数组：`ids.length` 是 undefined → 批循环整个不执行 → 预演模式下静默
// 「0 成功」，关掉预演就死在 `ids.map`。源码正则与类型都看不出来，只有真点击能。
//
// 所以这里锁两层：① 页面自带一个**真渲染 + 真点击**的行为测试（少了它就等于没锁）；
// ② 裸挂这个具体写法不许回来（`run` 内部另有一道非数组兜底）。
// ---------------------------------------------------------------------------
test('设置页的点击行为有真渲染测试，且不再裸挂 onClick 处理函数', () => {
  const clientTest = path.join(ASSETS, 'test', 'client.test.mjs');
  assert.ok(fs.existsSync(clientTest), '缺 test/client.test.mjs：没有真点击的测试，onClick 传参错法就没人拦');
  const src = fs.readFileSync(clientTest, 'utf8');
  assert.match(src, /props\.onClick\(\{/, '行为测试必须真的调用 onClick 并传入事件对象');
  assert.match(src, /factory\(require\)/, '行为测试必须走真实装载路径（__ModuleLoader__ + require shim）');

  const pkg = readJson('package.json');
  assert.equal(pkg.scripts?.test, 'node --test "test/*.test.mjs"', '测试脚本必须覆盖 test/ 下全部用例');

  const client = read('lib/client.js');
  assert.match(client, /Array\.isArray\(explicitIds\)/, 'run() 必须对非数组入参兜底（事件对象不是数组）');
  // 先剥注释再匹配：`lib/client.js` 的注释里就写着「别再写 `onClick: run`」，
  // 不剥的话这条断言会被自己的注释绊倒（同名坑：AGENTS.md 里的命令 token）。
  const clientCode = stripComments(client);
  assert.doesNotMatch(clientCode, /onClick:\s*run\b/, '别再裸挂 run：onClick 会把事件当 explicitIds 传进去');
  assert.match(clientCode, /onClick:\s*\(\)\s*=>\s*run\(\)/, '主迁移按钮必须是 () => run()');
});

/** 去掉行注释与块注释，避免源码断言被注释里的示例文字绊倒。 */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// ---------------------------------------------------------------------------
// 「登记工作区」必须**把会话挂进去**（用户实报：迁移后会话还在「未分组」）。
//
// 内核的会话归组靠工作区记录里的 `sessionIds`，不是按会话头的 cwd 现算 ——
// `bootstrap()` 那套按 cwd 自动归组只在工作区域**首次**初始化时跑一次
// （`dsh-workspace/lib/index.js` 的 `if (!state.initialized)` 分支）。所以
// `registry.create(path)` 只是建了个**空**工作区，必须再 `attachSession(id)`。
// 这条锁住「只 create 不 attach」的回归。
// ---------------------------------------------------------------------------
test('登记工作区必须 attachSession（只 create 会得到空工作区）', () => {
  const host = read('src/rpc.js');
  assert.match(host, /attachSession\(/, '宿主侧必须调 workspace.attachSession');
  assert.match(host, /attachFailed/, '挂不上的会话要逐条上报，不能吞');
  assert.match(host, /sessionIds/, 'workspaces 请求要能带会话 id');
  // 路由必须收 groups（目录 + 会话 id），旧的 directories 只作兼容
  assert.match(host, /pickGroups\(/, 'workspaces 路由要用 pickGroups 归一化入参');
  const client = stripComments(read('lib/client.js'));
  assert.match(client, /groupsFor\(/, '页面必须按目录带上会话 id');
  assert.match(client, /call\('workspaces',\s*\{\s*groups\s*\}\)/, '页面必须发 groups 而不是裸目录列表');
  assert.match(client, /dshId/, '会话 id 取侦察结果里的 dshId');
});

/** 与 src/rpc.js 里的模板串同形（`${API_PREFIX}/inspect` 展开后的样子）。 */
function API_PREFIX_ACTION(action) {
  return '`${API_PREFIX}/' + action + '`';
}
