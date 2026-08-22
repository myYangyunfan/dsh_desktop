'use strict';

/**
 * sidecar CLI 性能与资源上界测试
 * =================================
 * 运行：`node --test sidecar/cli-perf.test.js`（仓库 dsh-tauri/ 目录下）。
 *
 * 覆盖（性能审计 2026-08 的三个 Node 侧根因）：
 *  1. 模块懒加载：全部子命令共用 ctxFromArgs→loadModules 入口，而多数子命令
 *     只碰一两个模块——此前 15 个模块全量 require（patch-registry 729 行等），
 *     每 3 分钟的 balance-fetch 也整套装载（纯启动开销）。懒加载后：缺失的
 *     重量级模块不再炸（最小 appDir 只有 balance 两件套也能跑 balance-fetch）。
 *  2. 子进程有界：plugin-update 的 zip 解压此前 execFileSync 无超时——
 *     AV/SmartScreen 拦半死时更新链永挂，并占死 Rust 侧串行锁。
 *  3. httpGetJson 字节上限：元数据通道（npm latest / GitHub Releases）无
 *     integrity 校验，此前响应体无限累积成字符串（对照 httpGetBuffer 的
 *     64MB 与 balance.js 的 1MB，这是唯一缺口）。
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

const CLI = path.join(__dirname, 'cli.js');
const APP_DIR = path.resolve(__dirname, '..', '..', 'dsh-desktop');

test('懒加载：balance-fetch 只装 balance 两件套（缺失的重量级模块不再炸）', () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-lazy-appdir-'));
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-lazy-home-'));
  try {
    // 最小 appDir：仅 balance-fetch 实际消费的两个模块（scripts/、plugin-guard
    // 等全部缺席）。全量装载形态（历史缺陷）在此必然 Cannot find module。
    fs.copyFileSync(path.join(APP_DIR, 'balance.js'), path.join(appDir, 'balance.js'));
    fs.copyFileSync(path.join(APP_DIR, 'balance-scheduler.js'), path.join(appDir, 'balance-scheduler.js'));
    const r = spawnSync(process.execPath, [CLI, 'balance-fetch', '--app-dir', appDir], {
      encoding: 'utf8',
      env: { ...process.env, DSH_HOME: home, DSH_TAURI_USERDATA: path.join(home, 'ud') },
      timeout: 30_000,
    });
    const lastLine = (r.stdout || '').trimEnd().split('\n').pop() || '';
    let json = null;
    try { json = JSON.parse(lastLine); } catch { /* 保持 null */ }
    assert.ok(json && typeof json === 'object', `stdout 末行应为 JSON（结构化降级不炸进程）: ${lastLine.slice(0, 200)}`);
    assert.ok(
      !(json.error && /Cannot find module/.test(String(json.error))),
      `balance-fetch 不得因未消费的重量级模块装载失败（懒加载锚点）: ${json.error}`
    );
    assert.strictEqual(typeof json.ok, 'boolean', '载荷形态：ok 布尔（无密钥 → ok:false 结构化降级）');
  } finally {
    fs.rmSync(appDir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

const { execFileBounded, DEFAULT_TIMEOUT_MS } = require('./exec-bounded');

test('exec-bounded：挂死子进程超时被杀（有界锚点）', async () => {
  const t0 = Date.now();
  await assert.rejects(
    execFileBounded(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { timeoutMs: 400 }),
    /超时/
  );
  const ms = Date.now() - t0;
  assert.ok(ms < 5_000, `超时须及时返回（实测 {ms}ms）——否则与无超时同罪`);
});

test('exec-bounded：正常退出 resolve；非零退出码 reject', async () => {
  await execFileBounded(process.execPath, ['-e', '']);
  await assert.rejects(execFileBounded(process.execPath, ['-e', 'process.exit(3)']), /退出码 3/);
});

test('exec-bounded：缺省超时为有界值（不得回退无界）', () => {
  assert.ok(Number.isFinite(DEFAULT_TIMEOUT_MS) && DEFAULT_TIMEOUT_MS > 0, '缺省超时必须是有限正值');
});

const { httpGetJson, MAX_JSON_BYTES } = require('./http-json');

test('http-json：超上限响应被拒绝（内存上界锚点）', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // 流式慢滴 5MB（无 Content-Length，真实慢滴形态）。
    const chunk = 'x'.repeat(64 * 1024);
    let sent = 0;
    const t = setInterval(() => {
      res.write(chunk);
      sent += chunk.length;
      if (sent > 5 * 1024 * 1024) { clearInterval(t); res.end(); }
    }, 5);
    req.on('close', () => clearInterval(t));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/latest`;
  try {
    await assert.rejects(httpGetJson(url, 5000), /上限/);
  } finally {
    server.close();
  }
});

test('http-json：合法小 JSON 正常解析；非 200 拒绝', async () => {
  const server = http.createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200); res.end(JSON.stringify({ version: '1.2.3' })); }
    else { res.writeHead(404); res.end('nope'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const v = await httpGetJson(base + '/ok', 2000);
    assert.deepStrictEqual(v, { version: '1.2.3' });
    await assert.rejects(httpGetJson(base + '/missing', 2000), /HTTP 404/);
  } finally {
    server.close();
  }
  assert.ok(MAX_JSON_BYTES > 0, '上限常量必须存在且为正');
});
