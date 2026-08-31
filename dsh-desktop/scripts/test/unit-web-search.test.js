'use strict';

// issue #20 补丁的单元与功能测试（node --test）：
//  A. 补丁脚本纯逻辑：幂等、anchor 缺失跳过且不损坏、文案替换；
//  B. 打补丁后的 provider 真实 HTTP 行为（本地 mock 服务）：
//     默认基址/尾斜杠/已含 /messages 的拼接回归、Exa 场景的错误指引、
//     Anthropic 响应映射回归。
// 用法：node --test scripts/test/unit-web-search.test.js

const test = require('node:test');
const { before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { patchWebSearchBaseUrl, MARKER } = require('../patch-web-search-baseurl');

const repoRoot = path.resolve(__dirname, '..', '..');
const providerFile = path.join(repoRoot, 'node_modules', '@deepseek-ai', 'dsh-web-search-deepseek', 'lib', 'index.js');

// ---------------------------------------------------------------------------
// A. 补丁脚本纯逻辑
// ---------------------------------------------------------------------------

function buildFakeTree(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-ws-patch-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const provider = path.join(root, '@deepseek-ai', 'dsh-web-search-deepseek', 'lib', 'index.js');
  const client = path.join(root, '@deepseek-ai', 'dsh-client-ui-settings-plugins', 'lib', 'client.js');
  fs.mkdirSync(path.dirname(provider), { recursive: true });
  fs.mkdirSync(path.dirname(client), { recursive: true });
  const providerSrc = [
    'export const x = 1;',
    'function searchEndpointError(endpoint, message, cause) {',
    '\treturn new WebError(message, "WEB_PROVIDER_ERROR");',
    '}',
    'async search(request, signal) {',
    '\t\tconst endpoint = `${options.baseURL}/messages`;',
    '\t\tlet message = `DeepSeek API error (HTTP ${response.status})`;',
    '\t\tthrow searchEndpointError(endpoint, message);',
    '}',
  ].join('\n');
  const clientSrc = [
    'window.__ModuleLoader__.load({',
    '\twebSearchDescription: "The DeepSeek search provider.",',
    '\twebSearchBaseUrlHint: "Leave blank to use the provider default.",',
    '\twebSearchDescription: "DeepSeek 搜索提供方。",',
    '\twebSearchBaseUrlHint: "留空则使用提供方默认地址。",',
    '});',
  ].join('\n');
  fs.writeFileSync(provider, providerSrc);
  fs.writeFileSync(client, clientSrc);
  return { root, provider, client, providerSrc, clientSrc };
}

test('补丁脚本：一次应用、二次幂等、anchor 缺失跳过且不损坏', (t) => {
  const tree = buildFakeTree(t);
  let n = patchWebSearchBaseUrl(tree.root);
  assert.strictEqual(n, 2, '两份文件都应被补');
  const provider = fs.readFileSync(tree.provider, 'utf8');
  const client = fs.readFileSync(tree.client, 'utf8');
  assert.ok(provider.includes(MARKER) && provider.includes('normalizedBase'), 'provider 补丁落盘');
  assert.ok(client.includes(MARKER) && client.includes('Anthropic 兼容 Messages API'), 'client 文案补丁落盘');
  assert.ok(client.includes('DeepSeek 官方默认地址'), '中文提示已替换');
  assert.ok(client.includes("Enter that API's base URL"), '英文提示已替换');
  // 幂等：第二次零写入
  n = patchWebSearchBaseUrl(tree.root);
  assert.strictEqual(n, 0, '第二次运行应零写入');
  assert.strictEqual(fs.readFileSync(tree.provider, 'utf8'), provider, 'provider 内容不变');
  assert.strictEqual(fs.readFileSync(tree.client, 'utf8'), client, 'client 内容不变');
  // anchor 缺失：跳过且字节级不损坏
  fs.writeFileSync(tree.provider, 'export const changed = true;\n完全不同的内容\n');
  fs.writeFileSync(tree.client, 'export const changed = true;\n完全不同的内容\n');
  const beforeP = fs.readFileSync(tree.provider);
  const beforeC = fs.readFileSync(tree.client);
  n = patchWebSearchBaseUrl(tree.root);
  assert.strictEqual(n, 0, 'anchor 不匹配应跳过');
  assert.deepStrictEqual(fs.readFileSync(tree.provider), beforeP, 'provider 字节级不变');
  assert.deepStrictEqual(fs.readFileSync(tree.client), beforeC, 'client 字节级不变');
});

// ---------------------------------------------------------------------------
// B. 打补丁后 provider 的真实 HTTP 行为
// ---------------------------------------------------------------------------

const received = [];
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    received.push({ method: req.method, url: req.url, headers: req.headers, body });
    if (req.url === '/anthropic/v1/messages') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        content: [
          { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://example.com/a', title: '标题A' }] },
          { type: 'text', text: 'x', citations: [{ url: 'https://example.com/a', cited_text: '摘录文本' }] },
        ],
      }));
      return;
    }
    // Exa 行为：/search 存在、/search/messages 不存在
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Cannot POST /search/messages' }));
  });
});

function makeProvider(baseURL) {
  return new Promise((resolve, reject) => {
    import(pathToFileURL(providerFile).href).then((mod) => {
      resolve(new mod.DeepSeekSearchProvider(() => ({
        apiKey: 'sk-test',
        baseURL,
        model: 'deepseek-v4-flash',
        apiVersion: '2023-06-01',
        maxTokens: 4096,
        maxUses: 5,
      })));
    }, reject);
  });
}

test('拼接回归：默认形态基址 → <基址>/messages，映射结果正确', async () => {
  const base = 'http://127.0.0.1:' + mock.address().port + '/anthropic/v1';
  const provider = await makeProvider(base);
  const result = await provider.search({ query: 'q' }, undefined);
  assert.strictEqual(received.at(-1).url, '/anthropic/v1/messages', '默认形态应拼 /messages');
  assert.ok(received.at(-1).headers['x-api-key'] === 'sk-test' && received.at(-1).headers['anthropic-version'] === '2023-06-01', '协议头保持不变');
  assert.deepStrictEqual(result.sources, [{ url: 'https://example.com/a', title: '标题A', snippet: '摘录文本' }], 'Anthropic 响应映射回归');
  assert.strictEqual(result.truncated, false);
});

test('拼接回归：尾斜杠基址 → 无双斜杠', async () => {
  const base = 'http://127.0.0.1:' + mock.address().port + '/anthropic/v1/';
  const provider = await makeProvider(base);
  await provider.search({ query: 'q' }, undefined);
  assert.strictEqual(received.at(-1).url, '/anthropic/v1/messages', '尾斜杠不应产生 //');
});

test('拼接修复：基址已含 /messages → 不再重复拼接', async () => {
  const base = 'http://127.0.0.1:' + mock.address().port + '/anthropic/v1/messages';
  const provider = await makeProvider(base);
  await provider.search({ query: 'q' }, undefined);
  assert.strictEqual(received.at(-1).url, '/anthropic/v1/messages', '完整端点应原样使用');
});

test('issue #20 场景：Exa 式基址 404 时错误信息含请求地址与协议契约指引', async () => {
  const base = 'http://127.0.0.1:' + mock.address().port + '/search';
  const provider = await makeProvider(base);
  let caught = null;
  try {
    await provider.search({ query: 'q' }, undefined);
  } catch (err) {
    caught = err;
  }
  assert.ok(caught, '应抛出错误');
  assert.strictEqual(received.at(-1).url, '/search/messages', '仍按协议拼 /messages（该协议下不可避免）');
  assert.ok(caught.message.includes('/search/messages'), '错误信息应包含实际请求地址: ' + caught.message);
  assert.ok(caught.message.includes('Anthropic 兼容 Messages API'), '错误信息应包含协议契约指引');
  assert.ok(caught.message.includes('Exa'), '错误信息应给出其它协议服务的指引');
  assert.ok(caught.message.includes('接口地址'), '错误信息应指向「接口地址」设置项');
});

test('happy-path 回归：web_search_tool_result 缺块时仍抛 WebError', async () => {
  // 通过 mock 返回一个「无结果块」的响应（走 mapAnthropicResponse 的失败分支）
  const weird = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ content: [{ type: 'text', text: 'no search' }] }));
    });
  });
  await new Promise((resolve) => weird.listen(0, '127.0.0.1', resolve));
  try {
    const base = 'http://127.0.0.1:' + weird.address().port + '/anthropic/v1';
    const provider = await makeProvider(base);
    let caught = null;
    try {
      await provider.search({ query: 'q' }, undefined);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught && /no web_search_tool_result/.test(caught.message), '缺结果块应报既有 WebError');
  } finally {
    await new Promise((resolve) => weird.close(resolve));
  }
});

// 启动 mock、确保 checkout 内的 provider 已打补丁（幂等）。
before(async () => {
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve));
  patchWebSearchBaseUrl(path.join(repoRoot, 'node_modules'));
  const patched = fs.readFileSync(providerFile, 'utf8');
  if (!patched.includes(MARKER)) {
    // 防御：跑测试前必须已打补丁（保证测试的是修复后的行为）。
    throw new Error('checkout provider 未打补丁，无法测试修复后行为');
  }
});

after(async () => {
  await new Promise((resolve) => mock.close(resolve));
});
