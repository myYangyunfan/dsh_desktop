'use strict';

// 余额代理与缓存单元测试（node --test）——pr-107（4704e63 + 2441d82）
// 的余额增强移植回 Tauri 线时一并移植，锚定三块能力：
//   A. readFileCached：mtime+size 命中复用 / 修改重读 / 删除失效
//   B. proxyFor：协议选代理 / NO_PROXY 三种形态 / 非法输入
//   C. 端到端：HTTP_PROXY 下 absolute-form GET 经代理命中（env 覆盖保留）
//   D. ConnectProxyAgent：https 代理先 TLS 再 CONNECT / http 代理明文 CONNECT
// 用法：node --test scripts/test/unit-balance-proxy.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const net = require('node:net');
const balance = require('../../assets/plugins/dsh-balance/lib/balance-core.js');

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-balance-proxy-'));
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

test('readCredentialLine: rc.1 v1 嵌套布局与缓存共存（aa3060c × P1-2 交叉回归）', (t) => {
  const dir = tmpdir(t);
  const creds = path.join(dir, '.credentials.yaml');
  // rc.1 v1 形态：键两格缩进进 refs:（aa3060c 修复的双形态必须保留）。
  fs.writeFileSync(creds, [
    'version: 1',
    'refs:',
    '  DEEPSEEK_API_KEY: "sk-nested"',
    'records:',
    '  provider/id:',
    '    DEEPSEEK_API_KEY: "sk-decoy"',
    '',
  ].join('\n'));
  assert.equal(balance.readCredentialLine(dir, 'DEEPSEEK_API_KEY'), 'sk-nested', 'v1 嵌套形态可读');
  assert.equal(balance.readCredentialLine(dir, 'DEEPSEEK_API_KEY'), 'sk-nested', '缓存命中同值');
  // 旧平铺形态（列 0）照旧可读。
  fs.writeFileSync(creds, 'DEEPSEEK_API_KEY: "sk-flat"\n');
  assert.equal(balance.readCredentialLine(dir, 'DEEPSEEK_API_KEY'), 'sk-flat', '改文件（平铺形态）后下轮生效');
  // 更深嵌套（≥4 格）下的同名键一律不读（安全约束不因缓存放松）。
  fs.writeFileSync(creds, ['version: 1', 'refs:', '    DEEPSEEK_API_KEY: "sk-deep"', ''].join('\n'));
  assert.equal(balance.readCredentialLine(dir, 'DEEPSEEK_API_KEY'), '', '四格缩进（非 refs 两格）不读');
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

test('ConnectProxyAgent: https 代理先对代理自身做 TLS，http 代理明文 CONNECT（字节级判据）', async () => {
  // 判据形态变更的原因：插件产物是 ESM 且以 `import * as https` 取模块命名空间，
  // CJS 侧的 t.mock.method(https,'request') 改不到它已捕获的引用（遗留 CJS 模块才 mock 得动）。
  // 于是改看「代理端口上真实收到的首字节」——比调用计数更强：TLS ClientHello 首字节 0x16，
  // 明文 CONNECT 以 ASCII "CONNECT " 开头，且顺带证明 URL.port 真的解析到了监听端口。
  const probe = (scheme) => new Promise((resolve, reject) => {
    const settled = (value, error) => {
      clearTimeout(timer);
      try { server.close(); } catch { /* 已关闭 */ }
      if (error) reject(error); else resolve(value);
    };
    const server = net.createServer((socket) => {
      socket.on('error', () => { /* 对端被我们主动销毁，属预期 */ });
      socket.once('data', (chunk) => {
        const bytes = Buffer.from(chunk);
        socket.destroy();
        settled(bytes, null);
      });
    });
    const timer = setTimeout(() => settled(null, new Error(`${scheme} 代理 4s 内未收到任何字节`)), 4000);
    server.listen(0, '127.0.0.1', () => {
      const agent = new balance.ConnectProxyAgent(new URL(`${scheme}://127.0.0.1:${server.address().port}`));
      // callback 收到的是「隧道没谈成」的错误，本用例不关心成败，只关心发出了什么字节。
      agent.createConnection({ host: 'api.example.com', port: 443 }, () => {});
    });
  });

  const overHttpsProxy = await probe('https');
  assert.equal(overHttpsProxy[0], 0x16, 'https:// 代理必须先对代理自身建 TLS（首字节应为 handshake 记录 0x16）');
  assert.ok(!overHttpsProxy.slice(0, 8).toString('latin1').startsWith('CONNECT'), 'https:// 代理不得明文发 CONNECT（单层明文会打在 TLS 端口上）');

  const overHttpProxy = await probe('http');
  const plain = overHttpProxy.toString('latin1');
  assert.ok(plain.startsWith('CONNECT '), 'http:// 代理应明文 CONNECT: ' + plain.slice(0, 24));
  assert.ok(plain.includes('api.example.com:443'), 'CONNECT 目标应为 host:port');
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
