'use strict';

// openclaw-bridge 设置注入回归（0.8.1）：
//   0.8.0 打包产物的 inject 数组遭截丢 "settings" —— ctx.settings 访问抛
//   "cannot get property 'settings' without inject"，设置页永久读不到/写不进
//   ClawBot 配置（两份用户日志实爆：rizhi + aoxuanheng 每轮启动都有
//   "[openclaw-bridge] settings section unavailable"）。
// 本测试锁三件事：
//   1. inject 数组含 "settings"（形态锚点，防再截丢）；
//   2. 设置面走 codegen `settings-host` 垫片（0.8.1 换代：内核不再提供
//      ctx.settings.register，声明式 Config 直注册整体作废，改由 apply(ctx, config)
//      的第二参 + settings/document-updated 热更承载）；
//   3. 垫片行为：取值 / volatile 摊平 / ns 过滤 / watch 退订 —— 这才是「设置页
//      读写链路活着」的真判据，比旧的空 base 锚点咬得住。
// 撤回账：旧锚 `ctx.settings.register(NS, Config, { base: {} })` 与其上的
//   `retrying with defaults` 空 base 重试分支已随换代消失（垫片不再抛，外层
//   try/catch 沦为死支路），故此处反向断言 register 不得回流。
// 源码仓（openclaw-dsh-bridge/lib/index.js）同步锁定——双轨修补两侧不得漂移。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const BUNDLED = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-openclaw-bridge', 'lib', 'index.js');
const SOURCE = path.join(__dirname, '..', '..', '..', 'openclaw-dsh-bridge', 'lib', 'index.js');
const NS_ID = 'openclaw-bridge';

function readIfExists(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

/** 从模块源里抠 inject 数组字面量并解析为字符串数组。 */
function parseInject(src) {
  const m = /const inject\s*=\s*\[([^\]]*)\]/.exec(src);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

/** 抠出 <<BEGIN settings-host>> … <<END settings-host>> 之间的垫片源码（自包含，无 import）。 */
function extractSettingsHost(src) {
  const m = /\/\/ <<BEGIN settings-host[^\n]*\r?\n([\s\S]*?)\/\/ <<END settings-host/.exec(src);
  return m ? m[1] : null;
}

/** 最小 ctx：只实现 on/emit，够垫片跑起来。 */
function makeCtx() {
  const listeners = [];
  return {
    on(kind, fn) {
      if (kind !== 'settings/document-updated') throw new Error('unexpected event: ' + kind);
      listeners.push(fn);
      return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
    },
    emit(ns) { for (const fn of [...listeners]) fn(ns); },
  };
}

test('内置 0.8.x 产物：inject 必须声明 "settings"', () => {
  const src = readIfExists(BUNDLED);
  assert.ok(src, '内置产物应在位: ' + BUNDLED);
  const inject = parseInject(src);
  assert.ok(Array.isArray(inject), 'inject 数组字面量应可解析');
  assert.ok(
    inject.includes('settings'),
    `inject 缺 "settings"（0.8.0 截丢回归）: [${inject.join(', ')}]`,
  );
  // 核心服务面齐全（截丢通常从队尾开始，锁全长防半截）。
  for (const svc of ['webServer', 'agents', 'sessions', 'agentDefaultModel', 'llm', 'settings']) {
    assert.ok(inject.includes(svc), `inject 缺核心服务 "${svc}"`);
  }
});

test('内置产物：设置面走 codegen settings-host 垫片（0.8.1 换代锚点）', () => {
  const src = readIfExists(BUNDLED);
  assert.ok(src);
  // 垫片块必须成对完整（历史上截丢从队尾开始，半边缺失 = apply 直接抛 → 设置页永久降级）。
  assert.ok(src.includes('<<BEGIN settings-host'), 'settings-host 垫片起始标记应在场');
  assert.ok(src.includes('<<END settings-host'), 'settings-host 垫片结束标记应在场');
  assert.ok(src.includes('function mountSettingsScope('), '垫片应导出 mountSettingsScope 供 apply 挂载');
  assert.ok(
    src.includes('mountSettingsScope(ctx, config, "openclaw-bridge")'),
    'apply 应以 profile 行 config + 条目 id 挂载 scope',
  );
  assert.ok(
    src.includes('ctx.on("settings/document-updated"'),
    '热更应订阅 settings/document-updated（否则改完配置要重启才生效）',
  );
  // 反向锁：内核已不提供 ctx.settings.register，旧直注册形态不得回流。
  assert.ok(
    !src.includes('ctx.settings.register('),
    'ctx.settings.register 属已作废的旧契约，不得再出现在产物里',
  );
});

test('垫片行为：取值 / volatile 摊平 / ns 过滤 / watch 退订', () => {
  const src = readIfExists(BUNDLED);
  const block = extractSettingsHost(src);
  assert.ok(block, '应能抠出 settings-host 垫片块');
  const sandbox = { console, Symbol, Object, Array };
  vm.createContext(sandbox);
  const { mountSettingsScope, VOLATILE_WRITE } = vm.runInContext(
    block + '\n;({ mountSettingsScope, VOLATILE_WRITE })',
    sandbox,
    { filename: 'openclaw-bridge/settings-host.js' },
  );

  // 普通 profile 行 config：原样摊平可读。
  const plain = { model: 'deepseek-chat', token: 't-1' };
  const ctx1 = makeCtx();
  const s1 = mountSettingsScope(ctx1, plain, NS_ID);
  assert.equal(JSON.stringify(s1.get()), JSON.stringify(plain), '首帧取值应等于 profile 行 config');
  assert.equal(typeof s1.watch, 'function', 'watch 应在场（热更回调）');

  // config 引用被内核就地改写 → document-updated 后 scope 读到新值。
  plain.model = 'deepseek-reasoner';
  let hits = 0;
  s1.watch(() => { hits += 1; });
  ctx1.emit(NS_ID);
  assert.equal(JSON.parse(JSON.stringify(s1.get())).model, 'deepseek-reasoner', '热更应重新取值');
  assert.equal(hits, 1, 'watch 回调应触发一次');

  // ns 过滤：别的条目 id 更新不得打扰本 scope。
  ctx1.emit('some-other-plugin');
  assert.equal(hits, 1, 'ns 不匹配时不得触发');

  // volatile 载体（get() 现取）：每次读都跟随底层值。
  let live = 'a';
  const volatileConfig = { [VOLATILE_WRITE]: true, get: () => ({ model: live }) };
  const ctx2 = makeCtx();
  const s2 = mountSettingsScope(ctx2, volatileConfig, NS_ID);
  assert.equal(s2.get().model, 'a');
  live = 'b';
  ctx2.emit(NS_ID);
  assert.equal(s2.get().model, 'b', 'volatile 载体应在热更后反映新值');

  // 退订后回调不再触发；缺席 config 回落空对象（不因 undefined 炸 apply）。
  const off = s2.watch(() => { throw new Error('退订后不应再触发'); });
  off();
  ctx2.emit(NS_ID);
  const ctx3 = makeCtx();
  assert.equal(JSON.stringify(mountSettingsScope(ctx3, undefined, NS_ID).get()), '{}');
});

test('源码仓与内置产物双轨一致（inject 同含 settings + 同款垫片）', { skip: !readIfExists(SOURCE) }, () => {
  const src = readIfExists(SOURCE);
  const inject = parseInject(src);
  assert.ok(Array.isArray(inject) && inject.includes('settings'), '源码 inject 不得回退');
  assert.ok(src.includes('function mountSettingsScope('), '源码不得停留在已作废的 register 形态');
  assert.ok(!src.includes('ctx.settings.register('), '源码旧直注册形态不得回流');
});
