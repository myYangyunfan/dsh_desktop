'use strict';

// balance.js 单元测试（node --test）：
//   A. readFileCached：mtime+size 命中复用 / 修改重读 / 删除失效
//   B. proxyFor：协议选代理 / NO_PROXY 三种形态 / 非法输入
//   C. 端到端：HTTP_PROXY 下 absolute-form GET 经代理命中（env 覆盖保留）
// 用法：node --test scripts/test/balance.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const balance = require('../../balance');

const ENV_KEYS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'NO_PROXY', 'no_proxy',
  'DEEPSEEK_API_KEY', 'DEEPSEEK_BALANCE_URL', 'DEEPSEEK_API_BASE'];

function withEnv(patch, fn) {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  const restore = () => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  try {
    for (const k of ENV_KEYS) delete process.env[k];
    Object.assign(process.env, patch);
    const r = fn();
    // async 函数：env 必须保持到 promise settle（fetchJson 异步读 env 选代理）
    if (r && typeof r.then === 'function') {
      return r.then((v) => { restore(); return v; }, (e) => { restore(); throw e; });
    }
    restore();
    return r;
  } catch (e) {
    restore();
    throw e;
  }
}

function tmpdir(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-balance-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('readFileCached: 命中复用 / 修改重读 / 删除失效', (t) => {
  const dir = tmpdir(t);
  const file = path.join(dir, 'cfg.yaml');
  fs.writeFileSync(file, 'v1');
  assert.equal(balance.readFileCached(file), 'v1');
  // 命中：内容被外部改坏也不读（mtime/size 未变）
  fs.writeFileSync(file, 'v1'); // 同内容重写，mtime 可能未变——不破坏命中语义
  assert.equal(balance.readFileCached(file), 'v1');
  // 修改（内容变化）→ 重读
  fs.writeFileSync(file, 'v2-longer');
  assert.equal(balance.readFileCached(file), 'v2-longer');
  // 删除 → null 且缓存失效（重建后重读）
  fs.rmSync(file);
  assert.equal(balance.readFileCached(file), null);
  fs.writeFileSync(file, 'v3');
  assert.equal(balance.readFileCached(file), 'v3');
});

test('readActiveModel: 凭证/模型读走缓存，改文件后下轮生效', (t) => {
  const dir = tmpdir(t);
  const settings = path.join(dir, 'settings.yaml');
  fs.writeFileSync(settings, 'agent-default-model:\n  provider: opencode\n  model: deepseek-v4-flash\n');
  assert.equal(balance.readActiveModel(dir), 'deepseek-v4-flash');
  assert.equal(balance.readActiveModel(dir), 'deepseek-v4-flash', '缓存命中');
  fs.writeFileSync(settings, 'agent-default-model:\n  provider: opencode\n  model: deepseek-v4-pro\n');
  assert.equal(balance.readActiveModel(dir), 'deepseek-v4-pro', 'mtime 变化后重读生效');
});

test('proxyFor: https 走 HTTPS_PROXY / http 走 HTTP_PROXY / 大小写环境名', () => {
  withEnv({ HTTPS_PROXY: 'http://proxy.local:8080' }, () => {
    assert.equal(balance.proxyFor('https://api.deepseek.com/user/balance').hostname, 'proxy.local');
    assert.equal(balance.proxyFor('http://127.0.0.1:9999/x'), null, 'http URL 不读 HTTPS_PROXY');
  });
  withEnv({ http_proxy: 'http://p2:3128' }, () => {
    assert.equal(balance.proxyFor('http://127.0.0.1:9999/x').port, '3128', '小写 http_proxy 生效');
  });
  withEnv({}, () => {
    assert.equal(balance.proxyFor('https://api.deepseek.com/user/balance'), null, '无代理直连');
  });
});

test('proxyFor: NO_PROXY 精确主机 / 域名后缀 / 星号全放行', () => {
  const proxy = { HTTP_PROXY: 'http://proxy.local:8080', NO_PROXY: '127.0.0.1,localhost,.internal, * ' };
  withEnv(proxy, () => {
    assert.equal(balance.proxyFor('http://127.0.0.1:9999/x'), null, '精确 IP 命中');
    assert.equal(balance.proxyFor('http://localhost:9999/x'), null, '精确主机命中');
    assert.equal(balance.proxyFor('http://foo.internal/x'), null, '域名后缀命中');
    assert.equal(balance.proxyFor('http://api.example.com/x'), null, '星号全放行');
  });
  withEnv({ HTTP_PROXY: 'http://proxy.local:8080', NO_PROXY: 'internal' }, () => {
    assert.ok(balance.proxyFor('http://foo.internal.example.com/x'), '中间段 internal 不命中后缀规则，应走代理');
  });
  withEnv({ HTTP_PROXY: 'http://proxy.local:8080', NO_PROXY: '.internal' }, () => {
    assert.equal(balance.proxyFor('http://api.internal/x'), null, '带点前缀同样命中后缀');
  });
});

test('proxyFor: 非法代理 URL / 非 http(s) 协议 → null 直连', () => {
  withEnv({ HTTPS_PROXY: 'not-a-url' }, () => {
    assert.equal(balance.proxyFor('https://api.deepseek.com/x'), null);
  });
  withEnv({ HTTPS_PROXY: 'ftp://proxy:21' }, () => {
    assert.equal(balance.proxyFor('https://api.deepseek.com/x'), null, '非 http(s) 代理忽略');
  });
});

test('ConnectProxyAgent: https 代理走 https.request / http 代理走 http.request（CONNECT 隧道）', (t) => {
  const httpsCalls = [];
  const httpCalls = [];
  const fakeReq = { on: () => fakeReq, end: () => {} };
  t.mock.method(https, 'request', (opts) => { httpsCalls.push(opts); return fakeReq; });
  t.mock.method(http, 'request', (opts) => { httpCalls.push(opts); return fakeReq; });
  // https:// 代理：必须先对代理自身 TLS（两层隧道），不能明文 http.request 连 443。
  const httpsAgent = new balance.ConnectProxyAgent(new URL('https://proxy.local:8443'));
  httpsAgent.createConnection({ host: 'api.example.com', port: 443 }, () => {});
  assert.equal(httpsCalls.length, 1, 'https 代理应走 https.request');
  assert.equal(httpCalls.length, 0, 'https 代理不应走明文 http.request');
  assert.equal(httpsCalls[0].method, 'CONNECT');
  assert.equal(httpsCalls[0].port, '8443', 'URL.port 为字符串');
  // http:// 代理：明文直连 CONNECT。
  const httpAgent = new balance.ConnectProxyAgent(new URL('http://proxy.local:8080'));
  httpAgent.createConnection({ host: 'api.example.com', port: 443 }, () => {});
  assert.equal(httpCalls.length, 1, 'http 代理应走 http.request');
  assert.equal(httpsCalls.length, 1, 'http 代理不应再触发 https.request');
  assert.equal(httpCalls[0].method, 'CONNECT');
  assert.equal(httpCalls[0].port, '8080', 'URL.port 为字符串');
});

test('端到端: HTTP_PROXY 下 absolute-form GET 经代理命中（env URL 覆盖保留）', (t) => {
  const target = http.createServer((req, res) => {
    // 无代理直连场景的原始语义：请求路径应为 /user/balance
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '12.3' }] }));
  });
  const proxy = http.createServer((req, res) => {
    // absolute-form：走代理时请求行携带完整 URL
    assert.ok(req.url.startsWith('http://'), '代理请求必须为 absolute-form: ' + req.url);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '99.9' }] }));
  });
  return new Promise((resolve) => {
    target.listen(0, '127.0.0.1', () => {
      proxy.listen(0, '127.0.0.1', () => {
        const targetPort = target.address().port;
        const proxyPort = proxy.address().port;
        const dir = tmpdir(t);
        const home = path.join(dir, 'home');
        fs.mkdirSync(home);
        fs.writeFileSync(path.join(home, '.credentials.yaml'), 'DEEPSEEK_API_KEY: "k-test"\n');
        const result = withEnv({
          DEEPSEEK_BALANCE_URL: 'http://127.0.0.1:' + targetPort + '/user/balance',
          HTTP_PROXY: 'http://127.0.0.1:' + proxyPort,
        }, async () => {
          const r = await balance.queryBalance(home);
          assert.equal(r.ok, true);
          assert.equal(r.balances[0].total, 99.9, '余额应来自代理响应（请求确实经代理）');
        });
        Promise.resolve(result).then(() => {
          target.close();
          proxy.close();
          resolve();
        });
      });
    });
  });
});
