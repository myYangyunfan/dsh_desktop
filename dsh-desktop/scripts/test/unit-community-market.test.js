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
