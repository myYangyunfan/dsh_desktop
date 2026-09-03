'use strict';

// dsh-community-market（内置市场，上游 anywhere-labs/deepseek-harness-desktop）
// 的加载与路由冒烟测试：
//   A. 构建产物可被 Node ESM 加载（依赖面完整：schemastery / dsh-settings /
//      ajv / semver / yaml 全部可解析；sharp 走惰性 shim 不在加载期触碰）；
//   B. apply(ctx) 在模拟 cordis 上下文上完成：
//      · settings 命名空间注册（dsh-community-market）；
//      · webServer 路由注册（/api/community-market/* 十条路由全量登记）；
//   C. GET /api/community-market/state 返回合法 JSON 骨架（sources/providers
//      能力面），POST 突变路由拒绝跨源（405）；
//   D. 桥接插件（dsh-market-desktop-bridge）加载面 + 服务四件套类可实例化
//      （desktopProfiles/desktopPnpm/desktopPlugins/desktopActions）。
// 用法：node --test scripts/test/unit-community-market.test.js

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const repoRoot = path.resolve(__dirname, '..', '..');
// 可用环境变量把插件树指到带临时 node_modules 的解析沙箱（CI / 依赖重装
// 期间使用）；缺省指向仓库源位（dsh-desktop/node_modules 提供外部依赖）。
const pluginsRoot = process.env.DSH_MARKET_TEST_PLUGINS
  ? path.resolve(process.env.DSH_MARKET_TEST_PLUGINS)
  : path.join(repoRoot, 'assets', 'plugins');
const marketDir = path.join(pluginsRoot, 'dsh-community-market');
const bridgeDir = path.join(pluginsRoot, 'dsh-market-desktop-bridge');

/** 收集路由的 webServer 桩 + 极简 cordis 上下文。 */
function mockContext() {
  const routes = [];
  const settingsNamespaces = [];
  const ctx = {
    webServer: {
      port: 8080,
      register(route) {
        routes.push(route);
        return () => { const i = routes.indexOf(route); if (i >= 0) routes.splice(i, 1); };
      },
    },
    settings: {
      register(namespace, schema, opts) {
        settingsNamespaces.push({ namespace, schema, opts });
        return {
          get: () => ({ sources: [], installReceipts: [] }),
          set: async () => {},
        };
      },
    },
    logger: { error: () => {}, warn: () => {}, info: () => {} },
    effect(fn) {
      const dispose = fn() ?? (() => {});
      return dispose;
    },
    // cordis inject 语义：全部依赖服务就绪才回调；回调上下文带 get(name)。
    // 本 mock 未提供 desktopActions/desktopPlugins/desktopProfiles/desktopPnpm
    // ——与真实运行环境一致（这些由桥接插件提供，浏览面不依赖）。
    inject(list, cb) {
      if (list.every((name) => ctx[name] !== undefined)) {
        return cb({ ...ctx, get: (name) => ctx[name] });
      }
      return undefined;
    },
    on: () => () => {},
  };
  return { ctx, routes, settingsNamespaces };
}

/** node:http 风格的 req/res 桩：捕获 JSON 响应。 */
function mockReqRes(method, url, headers = {}) {
  const res = {
    statusCode: 0,
    headers: {},
    destroyed: false,
    setHeader(k, v) { this.headers[k] = v; },
    end(body) { this.body = body; },
  };
  const req = {
    method, url, headers,
    destroyed: false,
    socket: { remoteAddress: '127.0.0.1', remotePort: 54321 },
    on() { return this; },
    resume() {},
  };
  return { req, res };
}

let market;
test.before(async () => {
  market = await import(pathToFileURL(path.join(marketDir, 'lib', 'index.js')).href);
});

test('A 构建产物可加载且导出 cordis 插件面', () => {
  assert.strictEqual(market.name, 'community-market');
  assert.deepStrictEqual(market.inject, ['webServer', 'settings']);
  assert.strictEqual(typeof market.apply, 'function');
});

test('B apply 注册 settings 命名空间与十条 /api/community-market 路由', () => {
  const { ctx, routes, settingsNamespaces } = mockContext();
  market.apply(ctx);
  assert.ok(
    settingsNamespaces.some((s) => s.namespace === 'dsh-community-market'),
    'settings 命名空间已注册',
  );
  const paths = routes.map((r) => r.path).sort();
  const expected = [
    '/api/community-market/assets',
    '/api/community-market/catalog',
    '/api/community-market/desktop/open-terminal',
    '/api/community-market/desktop/request-restart',
    '/api/community-market/installable',
    '/api/community-market/installations',
    '/api/community-market/operations/execute',
    '/api/community-market/operations/preview',
    '/api/community-market/sources',
    '/api/community-market/state',
  ].sort();
  assert.deepStrictEqual(paths, expected);
});

test('C1 GET state 返回合法 JSON 骨架', async () => {
  const { ctx, routes } = mockContext();
  market.apply(ctx);
  const state = routes.find((r) => r.path === '/api/community-market/state');
  assert.ok(state, 'state 路由存在');
  // 同源守卫：loopback remoteAddress + host 头与 webServer 端口一致。
  const { req, res } = mockReqRes('GET', '/api/community-market/state', {
    host: '127.0.0.1:8080',
  });
  await state.handler(req, res);
  assert.strictEqual(res.statusCode, 200, `state 响应码 200（实际 body: ${res.body}）`);
  const body = JSON.parse(res.body);
  assert.ok(Array.isArray(body.sources) || body.sources === undefined);
  assert.ok(typeof body === 'object' && body !== null);
});

test('C2 突变路由拒绝无源 POST（本地同源守卫）', async () => {
  const { ctx, routes } = mockContext();
  market.apply(ctx);
  const restart = routes.find((r) => r.path === '/api/community-market/desktop/request-restart');
  assert.ok(restart);
  const { req, res } = mockReqRes('POST', '/api/community-market/desktop/request-restart', {
    origin: 'http://evil.example',
  });
  await restart.handler(req, res);
  assert.strictEqual(res.statusCode, 405);
});

test('D 桥接插件加载面 + 客户端包装与注入清单一致', async () => {
  const bridge = await import(pathToFileURL(path.join(bridgeDir, 'lib', 'index.js')).href);
  assert.strictEqual(bridge.name, 'market-desktop-bridge');
  assert.strictEqual(typeof bridge.apply, 'function');

  // 市场客户端 bundle：loader 包装 + 桌面监管重启补丁标记。
  const fs = require('node:fs');
  const client = fs.readFileSync(path.join(marketDir, 'lib', 'client.js'), 'utf8');
  assert.ok(client.includes('window.__ModuleLoader__.load({ id: "dsh-community-market"'));
  assert.ok(client.includes('[desktop-restart-fix]'));
  // 运行时 require 面：esbuild 会剥离 type-only 导入（ui-layout/ui-sidebar/
  // locale/settings 均为类型面，预载由 package.json dsh.client.inject 声明），
  // 真正运行时消费的模块必须出现在 require 面。
  for (const needed of [
    '@deepseek-ai/dsh-client-store',
    '@deepseek-ai/dsh-client-ui-primitives',
    'react/jsx-runtime',
  ]) {
    assert.ok(client.includes(`"${needed}"`), `客户端 bundle 需运行时引用 ${needed}`);
  }
  // 注入清单与上游一致（模块预载声明完整）。
  const pkg = JSON.parse(fs.readFileSync(path.join(marketDir, 'package.json'), 'utf8'));
  assert.deepStrictEqual(pkg.dsh.client.inject, [
    '@deepseek-ai/dsh-client-store',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-layout',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-sidebar',
  ]);
});

// issue #170：桌面包管理器（pnpm 经 dsh CLI）非零退出时，不能再只给一句
// “did not complete successfully”——必须把退出码与 stderr 里的根因（如
// [ERR_PNPM_FETCH_404] + 肇事包名）带出来，用户才能自救。
test('E1 packageManagerFailure 带出 exit 码与 stderr 根因行', () => {
  const { packageManagerFailure } = market.__internals;
  const outcome = {
    exitCode: 1,
    signal: null,
    stderrTail: '\u001b[31mProgress: resolved 0, reused 1\u001b[39m\n'
      + '[ERR_PNPM_FETCH_404] GET https://registry.npmjs.org/@deepseek-ai%2Fdsh-third-party-thinking: Not Found - 404\n'
      + 'This error happened while installing a direct dependency of C:\\Users\\x\\.dsh\\profiles\\web\n'
      + 'dsh: pnpm failed in profile directory C:\\Users\\x\\.dsh\\profiles\\web\n',
  };
  const message = packageManagerFailure('The desktop package manager did not complete successfully.', outcome);
  assert.ok(message.startsWith('The desktop package manager did not complete successfully. (exit 1)'), message);
  assert.ok(message.includes('ERR_PNPM_FETCH_404'), '根因错误码可见');
  assert.ok(message.includes('dsh-third-party-thinking'), '肇事包名可见');
  assert.ok(!message.includes('Progress:'), '进度行剔除');
  assert.ok(!message.includes('\u001b['), 'ANSI 色码剥离');
});

test('E2 无输出摘要时文案保持原样（兼容非桌面桥的 pnpm 实现）', () => {
  const { packageManagerFailure, packageManagerDetail } = market.__internals;
  assert.strictEqual(
    packageManagerFailure('The desktop package manager did not complete the update.', { exitCode: 2, signal: null }),
    'The desktop package manager did not complete the update. (exit 2)',
  );
  assert.ok(packageManagerFailure('base', { exitCode: null, signal: 'SIGKILL' }).startsWith('base (SIGKILL)'));
  assert.strictEqual(packageManagerDetail(undefined), '');
  assert.strictEqual(packageManagerDetail({}), '');
});

test('E3 摘要长度有界，且不泄入 AbortError 噪声', () => {
  const { packageManagerFailure, packageManagerError } = market.__internals;
  const huge = packageManagerFailure('base', { exitCode: 1, signal: null, stderrTail: 'x'.repeat(100000) });
  assert.ok(huge.length < 'base (exit 1) '.length + 950, `摘要必须截断：${huge.length}`);
  const err = packageManagerError('operation-failed', 'The desktop package manager could not start.', new Error('spawn dsh ENOENT'));
  assert.strictEqual(err.code, 'operation-failed');
  assert.ok(err.message.includes('ENOENT'), '底层 cause 带出');
  const abort = new Error('This operation was aborted');
  abort.name = 'AbortError';
  assert.strictEqual(
    packageManagerError('operation-failed', 'The desktop package manager could not start.', abort).message,
    'The desktop package manager could not start.',
    '取消不算包管理器故障，不拼接原因',
  );
});

test('E4 根因落在 stdout 时也能带出（pnpm 11 实测行为）', () => {
  const { packageManagerFailure } = market.__internals;
  // 真机链路：内核 CLI 用 stdio:'inherit' 跑 pnpm，pnpm 把 404 报告写在 stdout，
  // stderr 只剩 `dsh: pnpm failed in profile directory …`。只看 stderr 依旧看不到根因。
  const outcome = {
    exitCode: 1,
    signal: null,
    stderrTail: 'dsh: pnpm failed in profile directory C:\\Users\\x\\.dsh\\profiles\\web\n',
    stdoutTail: 'Progress: resolved 3, reused 0, downloaded 0, added 0\n'
      + '[ERR_PNPM_FETCH_404] GET https://registry.npmjs.org/@deepseek-ai%2Fdsh-third-party-thinking: Not Found - 404\n'
      + '@deepseek-ai/dsh-third-party-thinking is not in the npm registry, or you have no permission to fetch it.\n',
  };
  const message = packageManagerFailure('The desktop package manager did not complete successfully.', outcome);
  assert.ok(message.includes('ERR_PNPM_FETCH_404'), message);
  assert.ok(message.includes('is not in the npm registry'), '自救指引行保留');
  assert.ok(message.includes('dsh: pnpm failed'), 'stderr 行同场保留');
  assert.ok(!message.includes('Progress:'), '噪声行剔除');
});
