'use strict';

// 「客户端」补丁必须打在**被服务的运行时产物**上（1.0.9 事故的机器锁，node --test）。
//
// 事故形状：`client-boot-failure-report` 补丁注入到
// `@deepseek-ai/dsh-client-web/lib/index.js`，`patch-surface verify` 判绿、单测全绿，
// 但服务端 `dsh-web-app` 的 `resolveDistIndex()` 指向的是
// `@deepseek-ai/dsh-web-frontend/dist/index.html` —— 它只加载一个自包含的
// `dist/assets/index-*.js`，与 `dsh-client-web` 毫无关系（整包 0 命中）。
// 于是那段注入体在运行时**永不被调用**：插件装配失败仍静默、日志零行、用户进不去。
//
// 本套件把这条边界钉成判据：
//   1. 服务入口链 = dsh-web-app → dsh-web-frontend/dist/index.html；
//   2. index.html 只加载 assets/index-*.js，且该 chunk 里没有 dsh-client-web /
//      dsh-client-modules / 我们的注入标记（⇒ 源码补丁不在运行时路径上）；
//   3. 用户看到的失败界面 `Failed to load plugins` 就在那个 chunk 里（证明链路对得上）；
//   4. 真正的生产者在被服务的 index.html 里（看门狗注入体带 [client-boot] FAILED）。
//
// 若哪天 2 变红（chunk 里出现了 dsh-client-web），说明上游把客户端源码改成运行时
// 加载了 —— 那时源码补丁才重新成为有效生产者，回来重估这条边界，别直接删断言。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { transformKernelBootWatchdog, markers } = require('../lib/patch-adapters');
const { KERNEL_WEB_INDEX_REL } = require('../lib/patch-target-resolver');

const NM = path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai');
const WEB_APP_ENTRY = path.join(NM, 'dsh-web-app', 'lib', 'index.js');
const WEB_FRONTEND_DIR = path.join(NM, 'dsh-web-frontend', 'dist');
const INDEX_HTML = path.join(NM, KERNEL_WEB_INDEX_REL);
const CLIENT_WEB_ENTRY = path.join(NM, 'dsh-client-web', 'lib', 'index.js');

function skipIfMissing() {
  return !fs.existsSync(WEB_FRONTEND_DIR) || !fs.existsSync(INDEX_HTML);
}

test('服务入口链：dsh-web-app 的静态目录解析到 dsh-web-frontend/dist/index.html', { skip: skipIfMissing() }, () => {
  const entry = fs.readFileSync(WEB_APP_ENTRY, 'utf8');
  assert.ok(/dsh-web-frontend/.test(entry), 'dsh-web-app 必须引用 dsh-web-frontend（静态产物包）');
  assert.ok(/index\.html/.test(entry), 'dsh-web-app 必须按 index.html 提供页面');
  assert.ok(fs.existsSync(INDEX_HTML), `被服务的页面必须存在: ${INDEX_HTML}`);
});

test('index.html 只加载自包含 chunk，chunk 里没有 dsh-client-web（源码补丁不在运行时路径）', { skip: skipIfMissing() }, () => {
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const m = html.match(/<script[^>]*src="\.\/(assets\/[^"]+\.js)"/);
  assert.ok(m, `index.html 必须通过 assets chunk 启动，实际未找到: ${html.slice(0, 400)}`);
  const chunkPath = path.join(WEB_FRONTEND_DIR, m[1]);
  assert.ok(fs.existsSync(chunkPath), `assets chunk 必须在位: ${chunkPath}`);
  const chunk = fs.readFileSync(chunkPath, 'utf8');

  assert.ok(chunk.includes('Failed to load plugins'),
    '用户看到的失败界面必须在这个 chunk 里（链路核对）');
  for (const needle of ['dsh-client-web', 'dsh-client-modules', markers.CLIENT_BOOT_FAILURE_MARKER]) {
    assert.equal(chunk.includes(needle), false,
      `chunk 里出现 ${needle} 说明运行时开始加载源码包了——本仓的「客户端补丁」边界需要重估`);
  }
});

test('反证：源码补丁确实注入了 dsh-client-web，但它不在被服务的 chunk 里', { skip: skipIfMissing() }, () => {
  assert.ok(fs.existsSync(CLIENT_WEB_ENTRY), 'dsh-client-web 构建期源码必须在位（补丁靶面）');
  const clientSrc = fs.readFileSync(CLIENT_WEB_ENTRY, 'utf8');
  assert.ok(clientSrc.includes(markers.CLIENT_BOOT_FAILURE_MARKER),
    '源码补丁必须仍注入（前向兼容：上游改成运行时加载时它就是有效生产者）');

  // 整个 dist 里都不该出现该标记：注入成功 ≠ 运行时执行。
  const chunkName = fs.readFileSync(INDEX_HTML, 'utf8')
    .match(/<script[^>]*src="\.\/(assets\/[^"]+\.js)"/)[1];
  const served = fs.readFileSync(path.join(WEB_FRONTEND_DIR, chunkName), 'utf8');
  assert.equal(served.includes(markers.CLIENT_BOOT_FAILURE_MARKER), false,
    '源码补丁的注入标记不得出现在被服务的 chunk 里（否则说明它真的在跑）');
});

test('看门狗判据用的是被服务 chunk 的真 DOM 契约（不是夹具发明的）', { skip: skipIfMissing() }, () => {
  // 这条是「夹具发明宿主契约」的解药：判据里用到的每个 DOM 事实都要能在真字节里
  // 找到出处，否则看门狗会在真机上永远不触发，而单测全绿。
  const chunkName = fs.readFileSync(INDEX_HTML, 'utf8')
    .match(/<script[^>]*src="\.\/(assets\/[^"]+\.js)"/)[1];
  const chunk = fs.readFileSync(path.join(WEB_FRONTEND_DIR, chunkName), 'utf8');

  assert.ok(chunk.includes('dataset.dshBoot'), 'boot 根节点必须由 chunk 打 data-dsh-boot 属性');
  assert.ok(/_failedItem_/.test(chunk), '失败条目 class 必须是 `_failedItem_<hash>`');
  assert.ok(/_failed_/.test(chunk), '失败容器 class 必须是 `_failed_<hash>`');
  assert.ok(chunk.includes('Failed to load plugins'), '失败标题文本必须与判据一致');
  // 桌面壳不定义 dshDesktopBoot ⇒ 失败走 page.fail 渲染卡片（有它则走宿主回调，卡片不出现）
  assert.ok(chunk.includes('dshDesktopBoot'), 'chunk 里的失败分支以 dshDesktopBoot 是否存在为分叉');
});

test('真正的生产者在被服务的 index.html 里（看门狗注入体）', { skip: skipIfMissing() }, () => {
  const raw = fs.readFileSync(INDEX_HTML, 'utf8');
  const r = transformKernelBootWatchdog(raw, 'index.html');
  assert.ok(r.status === 'changed' || r.status === 'already', `看门狗应可注入，得 ${r.status}`);
  const served = r.status === 'changed' ? r.src : raw;
  assert.ok(served.includes(markers.KERNEL_BOOT_WATCHDOG_MARKER), '被服务的页面必须带看门狗');
  assert.ok(served.includes('[client-boot] FAILED'), '客户端装配失败必须能从页面报到壳侧');
  assert.ok(served.includes("invoke('page_error'"), '上报必须走既有 page_error 通道');
  assert.ok(served.includes('recovery_safe_mode'), '页面必须能触发安全模式重启');
});
