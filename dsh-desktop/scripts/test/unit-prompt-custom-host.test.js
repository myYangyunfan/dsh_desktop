'use strict';

// unit-prompt-custom-host.test.js — dsh-prompt-custom 宿主半边（lib/index.js）回归套件。
//
// 由来：2026-10 的交接包里验证台脚本（repro-*.mjs / harness-core.mjs）**没有随包交付**，
// 本机也没有那台机器（F:）。本文件是按交接文档与证据输出**重建**的等价回归网，不是逐字移植：
// 判据以「真实内核包 + 真实插件源码」实测行为为准，断言集合对齐交接文档 01（HTTP 契约）/
// 03（改动历史）/ 05（验证套件）里记录的现象。
//
// 证据强度：真实内核（@deepseek-ai/cordis / dsh-system-prompt / dsh-scope，取自
// dsh-desktop/node_modules 的 pin 版本）+ 真实插件源码（assets/plugins/dsh-prompt-custom/lib/index.js）
// + 复刻夹具（FakeWebServer / FakeAgents 按插件真实消费面实现；agent 作用域用内核自己的
// createScope 铸造 —— 不是手搓的层级模型）。
//
// 核心原理（为什么这些用例有意义）：内核 SystemPrompt 的节注册表是分层的
// （dsh-scope 的 ScopedLayers），判重只在同层内发生；「替换官方人设」= 用同名节注册到
// 更近的 agent 作用域。本套件锁的正是这条语义链。
//
// 隔离：每个用例一个临时 DSH_HOME（mkdtemp），用例结束还原并清理 ——
// 绝不触碰真实 ~/.dsh（AGENTS.md 硬性要求）。
//
// 反证（mutation）随套件常驻：见文件末尾「反证」一节 —— 把插件源码变异成修复前的形状，
// 断言对应判据确实能红，防止将来判据退化成空转。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pathToFileURL } = require('node:url');

const DSH = path.resolve(__dirname, '..', '..');
const PLUGIN_FILE = path.join(DSH, 'assets', 'plugins', 'dsh-prompt-custom', 'lib', 'index.js');
const CONFIG_ROUTE = '/api/dsh-prompt-custom/config';
const PREVIEW_ROUTE = '/api/dsh-prompt-custom/preview';

const OFFICIAL_PREFIX = 'OFFICIAL-PREFIX-MARKER';
const OFFICIAL_SUFFIX = 'OFFICIAL-SUFFIX-MARKER';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(cond, ms = 1500) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await cond()) return true;
    await sleep(5);
  }
  return false;
}

// ---------------------------------------------------------------------------
// 真内核包（进程级缓存；缺料即失败 —— npm ci 的 postinstall 决定它们必须在场）
// ---------------------------------------------------------------------------
let kernels = null;
async function loadKernels() {
  if (!kernels) {
    const [cordis, prompt, scope] = await Promise.all([
      import('@deepseek-ai/cordis'),
      import('@deepseek-ai/dsh-system-prompt'),
      import('@deepseek-ai/dsh-scope')
    ]);
    assert.equal(typeof cordis.Context, 'function', '@deepseek-ai/cordis 缺 Context（npm ci 未跑？）');
    assert.equal(typeof prompt.SystemPrompt, 'function', '@deepseek-ai/dsh-system-prompt 缺 SystemPrompt');
    assert.equal(typeof scope.createScope, 'function', '@deepseek-ai/dsh-scope 缺 createScope');
    kernels = {
      Context: cordis.Context,
      Service: cordis.Service,
      SystemPrompt: prompt.SystemPrompt,
      createScope: scope.createScope
    };
  }
  return kernels;
}

let pluginMod = null;
async function loadPluginModule() {
  if (!pluginMod) pluginMod = await import(pathToFileURL(PLUGIN_FILE).href);
  return pluginMod;
}

// ---------------------------------------------------------------------------
// 假请求/响应（handler 真实消费面：req 是流、res.writeHead/end）
// ---------------------------------------------------------------------------
function makeReq(method, body, remoteAddress = '127.0.0.1') {
  const req = new Readable({ read() {} });
  req.push(body === undefined ? '' : JSON.stringify(body));
  req.push(null);
  req.method = method;
  req.url = '/';
  req.headers = {};
  req.socket = { remoteAddress };
  return req;
}

function makeRes() {
  const res = {
    status: 0,
    headers: null,
    chunks: [],
    writeHead(status, headers) { this.status = status; this.headers = headers || null; },
    end(data) {
      if (data !== undefined && data !== null) {
        this.chunks.push(Buffer.from(Buffer.isBuffer(data) ? data : String(data)));
      }
    }
  };
  res.json = () => JSON.parse(Buffer.concat(res.chunks).toString('utf8'));
  return res;
}

// ---------------------------------------------------------------------------
// 最小宿主装配
// ---------------------------------------------------------------------------

/**
 * @param t node:test 上下文（用于 after 清理）
 * @param opts.config    装载插件前写入磁盘的配置（undefined = 不写）
 * @param opts.preAgents 装载插件前就存在的 agent id（走 apply 的「补历史」路径）
 * @param opts.mutate    插件源码的 [from, to] 替换（反证用；缺省用真源码）
 */
async function makeHost(t, opts = {}) {
  const { Context, Service, SystemPrompt, createScope } = await loadKernels();

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pc-host-'));
  const cfgFile = path.join(home, 'prompt-custom.json');
  const prevHome = process.env.DSH_HOME;
  process.env.DSH_HOME = home;
  t.after(() => {
    if (prevHome === undefined) delete process.env.DSH_HOME;
    else process.env.DSH_HOME = prevHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  const routes = new Map();
  const agents = [];
  class FakeWebServer extends Service {
    constructor(ctx) { super(ctx, 'webServer'); }
    register(route) {
      routes.set(route.path, route.handler);
      return () => routes.delete(route.path);
    }
  }
  class FakeAgents extends Service {
    constructor(ctx) { super(ctx, 'agents'); }
    list() { return agents; }
  }

  const root = new Context();
  await root.plugin(FakeWebServer, {});
  await root.plugin(FakeAgents, {});
  await root.plugin(SystemPrompt, { personaPrefix: OFFICIAL_PREFIX, personaSuffix: OFFICIAL_SUFFIX });

  const makeAgent = (id) => {
    const agent = { id };
    agent.ctx = createScope(root, agent).ctx;
    return agent;
  };
  for (const id of opts.preAgents || []) agents.push(makeAgent(id));

  if (opts.config !== undefined) {
    fs.writeFileSync(cfgFile, JSON.stringify(opts.config, null, 2) + '\n');
  }

  let mod;
  if (opts.mutate) {
    const src = fs.readFileSync(PLUGIN_FILE, 'utf8');
    let out = src;
    for (const [from, to] of opts.mutate) {
      assert.ok(out.includes(from), '反证锚点必须存在：' + from);
      out = out.replace(from, to);
    }
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-pc-mut-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const file = path.join(dir, 'index.js');
    fs.writeFileSync(file, out, 'utf8');
    mod = await import(pathToFileURL(file).href + '?mut=' + Date.now());
  } else {
    mod = await loadPluginModule();
  }
  await root.plugin({ name: mod.name, inject: mod.inject, apply: mod.apply }, {});

  const sp = root.get('systemPrompt');
  const host = {
    home,
    cfgFile,
    root,
    sp,
    agents,
    makeAgent,
    readCfg: () => JSON.parse(fs.readFileSync(cfgFile, 'utf8')),
    writeCfg: (objOrText) => fs.writeFileSync(
      cfgFile,
      typeof objOrText === 'string' ? objOrText : JSON.stringify(objOrText, null, 2) + '\n'
    ),
    async call(route, method, body, remoteAddress) {
      const handler = routes.get(route);
      assert.ok(handler, '路由未注册：' + route);
      const res = makeRes();
      await handler(makeReq(method, body, remoteAddress), res);
      return res;
    },
    /** 原样投递自定义 req/res（非法 JSON 等 host.call 表达不了的坏请求）。 */
    async callRaw(route, req, res) {
      const handler = routes.get(route);
      assert.ok(handler, '路由未注册：' + route);
      await handler(req, res);
      return res;
    },
    async status() { return (await host.call(CONFIG_ROUTE, 'GET')).json(); },
    async preview() { return (await host.call(PREVIEW_ROUTE, 'GET')).json(); },
    /** agent/created / agent/disposed 的派发（内核里是 serial 且被 await 的）。 */
    async emit(name, agent) { await root.serial(name, { agent }); },
    /** 新建 agent 走 agent/created 增量路径。 */
    async created(id) {
      const agent = makeAgent(id);
      agents.push(agent);
      await host.emit('agent/created', agent);
      return agent;
    },
    assemble: (scopeKey) => sp.assemble(scopeKey ? { agent: scopeKey, scope: scopeKey } : {}),
    textOf: (assembly) => (assembly.sections || []).map((s) => s.text).join('\n')
  };
  return host;
}

const SHAPE_KEYS = ['enabled', 'mode', 'text'];
const CONFIG_KEYS = ['ok', 'config', 'proto', 'armed', 'agents', 'injected', 'lastError', 'unknownConfigKeys', 'path', 'unknownVariables', 'malformedVariables'];
const PREVIEW_KEYS = ['ok', 'official', 'effective', 'text', 'scoped', 'agentId', 'sections', 'unknownVariables', 'malformedVariables', 'proto', 'armed', 'agents', 'injected', 'lastError', 'unknownConfigKeys', 'path'];
const sortedKeys = (o) => Object.keys(o).sort();

// ---------------------------------------------------------------------------
// 1. 注入作用域（0.3.0 —— 本插件最核心的一次修复）
// ---------------------------------------------------------------------------

test('replace 模式：同名节遮蔽官方 persona、不污染全局、根层负对照仍抛重名错', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'replace', text: 'CUSTOM-PERSONA-MARKER' },
    preAgents: ['agent-1'] // 走「补历史」注入路径
  });
  const st = await h.status(); // GET /config 是串行队列同步点：await 它 = 等安装完成
  assert.equal(st.injected, 1, '补历史 agent 应已注入');

  const official = h.textOf(await h.assemble());
  const effective = h.textOf(await h.assemble(h.agents[0]));

  assert.ok(official.includes(OFFICIAL_PREFIX) && official.includes(OFFICIAL_SUFFIX), '官方装配应保留 persona');
  assert.ok(!official.includes('CUSTOM-PERSONA-MARKER'), '全局层不得被污染');
  assert.ok(effective.includes('CUSTOM-PERSONA-MARKER'), 'replace 后 agent 作用域应只剩自定义文本');
  assert.ok(!effective.includes(OFFICIAL_PREFIX) && !effective.includes(OFFICIAL_SUFFIX), '官方 prefix/suffix 均应被遮蔽');

  // 负对照：在根层重放旧逻辑（注册同名节）必须仍抛重名错 ——
  // 证明遮蔽不是「测试台失效导致的假通过」，而是真的走的分层语义。
  assert.throws(
    () => h.sp.section({ name: 'deployment:persona-prefix', order: 0, text: 'X' }),
    /already registered/,
    '根层注册同名节应抛重名错（分层语义在场的证明）'
  );
});

test('append 模式：官方 persona 保留、自定义节在末尾、不污染全局', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'append', text: 'CUSTOM-APPEND-MARKER' },
    preAgents: ['agent-1']
  });
  assert.equal((await h.status()).injected, 1);

  const official = h.textOf(await h.assemble());
  const effective = h.textOf(await h.assemble(h.agents[0]));
  assert.ok(effective.includes(OFFICIAL_PREFIX) && effective.includes(OFFICIAL_SUFFIX), '官方 persona 应保留');
  assert.ok(effective.includes('CUSTOM-APPEND-MARKER'), '自定义节应在场');
  assert.ok(effective.trimEnd().endsWith('CUSTOM-APPEND-MARKER'), 'append 模式自定义节应排在最后');
  assert.ok(!official.includes('CUSTOM-APPEND-MARKER'), '全局层不得被污染');
});

test('关开关 / 空文本：回落官方，armed 与 injected 一致', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'replace', text: 'CUSTOM-PERSONA-MARKER' },
    preAgents: ['agent-1']
  });
  await h.status();

  // 关开关（enabled:false）→ 官方 persona 回归
  await h.call(CONFIG_ROUTE, 'POST', { enabled: false, mode: 'replace', text: 'CUSTOM-PERSONA-MARKER' });
  const stOff = await h.status();
  assert.equal(stOff.armed, false, '关闭后 armed 应回 false');
  assert.equal(stOff.injected, 0, '关闭后不应有注入');
  const effOff = h.textOf(await h.assemble(h.agents[0]));
  assert.ok(effOff.includes(OFFICIAL_PREFIX) && !effOff.includes('CUSTOM-PERSONA-MARKER'), '关闭后应回落官方');

  // 空文本同样视为 off（desiredShape 的既有语义）
  await h.call(CONFIG_ROUTE, 'POST', { enabled: true, mode: 'replace', text: '   ' });
  const stBlank = await h.status();
  assert.equal(stBlank.armed, false, '空文本不应视为 armed');
  assert.equal(stBlank.injected, 0);
});

test('replace↔append 切换不残留：官方 persona 遮蔽/恢复都干净', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'replace', text: 'CUSTOM-SWITCH-MARKER' },
    preAgents: ['agent-1']
  });
  await h.status();
  assert.ok(!h.textOf(await h.assemble(h.agents[0])).includes(OFFICIAL_PREFIX), '前置：replace 应遮蔽官方');

  // 切 append：官方恢复、自定义仍在
  await h.call(CONFIG_ROUTE, 'POST', { enabled: true, mode: 'append', text: 'CUSTOM-SWITCH-MARKER' });
  const effAppend = h.textOf(await h.assemble(h.agents[0]));
  assert.ok(effAppend.includes(OFFICIAL_PREFIX) && effAppend.includes(OFFICIAL_SUFFIX), '切 append 后官方 persona 应恢复');
  assert.ok(effAppend.includes('CUSTOM-SWITCH-MARKER'));

  // 切回 replace：再次遮蔽
  await h.call(CONFIG_ROUTE, 'POST', { enabled: true, mode: 'replace', text: 'CUSTOM-SWITCH-MARKER' });
  const effReplace = h.textOf(await h.assemble(h.agents[0]));
  assert.ok(!effReplace.includes(OFFICIAL_PREFIX) && !effReplace.includes(OFFICIAL_SUFFIX), '切回 replace 应再次遮蔽');
  assert.ok(effReplace.includes('CUSTOM-SWITCH-MARKER'));
});

test('生命周期：agent/created 增量注入、agent/disposed 清理', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'append', text: 'CUSTOM-LIFE-MARKER' },
    preAgents: ['agent-1']
  });
  assert.equal((await h.status()).injected, 1);

  // 增量：created 是 serial 且被 await 的 → 该 agent 首次装配即可见
  const a2 = await h.created('agent-2');
  const effA2 = h.textOf(await h.assemble(a2));
  assert.ok(effA2.includes('CUSTOM-LIFE-MARKER'), 'created 后该 agent 首次装配应已可见');
  assert.equal((await h.status()).injected, 2);

  // 清理：disposed 后节被拆除（dispose 刻意不 await，轮询等它沉降）
  await h.emit('agent/disposed', a2);
  const cleaned = await until(async () => !h.textOf(await h.assemble(a2)).includes('CUSTOM-LIFE-MARKER'));
  assert.ok(cleaned, 'disposed 后装配应回落官方');
  assert.equal((await h.status()).injected, 1);
});

test('磁盘被外部改过：GET /config 回读并让注入形态对齐（armed 与 injected 不打架）', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'append', text: 'CUSTOM-DISK-MARKER' },
    preAgents: ['agent-1']
  });
  assert.equal((await h.status()).injected, 1);

  // 模拟外部进程/手工编辑把文件改成 disabled —— 已注册的 scoped 节必须随之撤下
  h.writeCfg({ enabled: false, mode: 'append', text: 'CUSTOM-DISK-MARKER' });
  const st = await h.status();
  assert.equal(st.armed, false);
  assert.equal(st.injected, 0, 'armed:false 却 injected:1 是自相矛盾（0.3.0 顺带修复项）');
  assert.ok(!h.textOf(await h.assemble(h.agents[0])).includes('CUSTOM-DISK-MARKER'), '回落后装配不得残留自定义节');
});

// ---------------------------------------------------------------------------
// 2. HTTP 契约（对齐交接文档 01 的字段表）
// ---------------------------------------------------------------------------

test('GET /config 契约：字段集合精确 + proto=2 + armed/injected 语义', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'replace', text: 'CUSTOM-CONTRACT-MARKER' },
    preAgents: ['agent-1']
  });
  const res = await h.call(CONFIG_ROUTE, 'GET');
  assert.equal(res.status, 200);
  const body = res.json();

  assert.deepEqual(sortedKeys(body), [...CONFIG_KEYS].sort(), '/config 字段集合必须与契约精确一致');
  assert.deepEqual(sortedKeys(body.config), [...SHAPE_KEYS].sort(), 'config 形态应为 normalize 后的三字段');
  assert.equal(body.proto, 2, 'API_PROTO 是宿主/client 错配判据，必须为 2');
  assert.equal(body.armed, true);
  assert.equal(body.injected, 1);
  assert.equal(body.agents, 1);
  assert.equal(body.lastError, null);
  assert.ok(String(body.path).startsWith(h.home), 'config 路径必须在隔离的临时 DSH_HOME 内');
  assert.equal(res.headers['cache-control'], 'no-store');
});

test('POST /config 生效并落盘；非法请求被拒（400/403/405）', async (t) => {
  const h = await makeHost(t);

  const ok = await h.call(CONFIG_ROUTE, 'POST', { enabled: true, mode: 'append', text: 'POSTED-MARKER' });
  assert.equal(ok.status, 200);
  assert.equal(ok.json().config.text, 'POSTED-MARKER');
  assert.deepEqual(h.readCfg(), { enabled: true, mode: 'append', text: 'POSTED-MARKER' }, 'POST 应落盘');

  // 非回环 → 403（本机保护）
  const forbidden = await h.call(CONFIG_ROUTE, 'GET', undefined, '10.0.0.5');
  assert.equal(forbidden.status, 403);

  // 非法 JSON → 400（host.call 只发合法 JSON，这里原样投递坏请求）
  const badReq = new Readable({ read() {} });
  badReq.push('{oops'); badReq.push(null);
  badReq.method = 'POST'; badReq.headers = {}; badReq.socket = { remoteAddress: '127.0.0.1' };
  const bad = await h.callRaw(CONFIG_ROUTE, badReq, makeRes());
  assert.equal(bad.status, 400, '非法 JSON 应 400');

  // 未支持方法 → 405
  const del = await h.call(CONFIG_ROUTE, 'DELETE');
  assert.equal(del.status, 405);
});

test('unknownConfigKeys：冷启动即报（零 POST）、数组配置不误报（0.3.5）', async (t) => {
  // 冷启动：磁盘里就有陌生键（另一个版本写的），一次 POST 都不发也要报出
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'append', text: 'COLD-MARKER', prefix: 'FOREIGN', futureField: { x: 1 } }
  });
  const cold = await h.status();
  assert.deepEqual([...cold.unknownConfigKeys].sort(), ['futureField', 'prefix'], '冷启动应报出陌生键');
  assert.equal(cold.config.text, 'COLD-MARKER', '陌生键不应影响本插件字段的读取');

  // 0.3.5：JSON **数组**（非空！空数组没有键、验不出这个 bug）不得被当成 {"0":..,"1":..}
  h.writeCfg('["a","b"]\n');
  const arr = await h.status();
  assert.deepEqual(arr.unknownConfigKeys, [], '数组配置不得误报陌生字段');
});

test('0.3.4 非破坏性写盘：保存只覆盖本插件字段，陌生键（含嵌套/非字符串）保留', async (t) => {
  const h = await makeHost(t, {
    config: {
      enabled: true, mode: 'append', text: 'OLD',
      prefix: 'KEEP-ME', ttl: 42, nested: { a: [1, 2, 3] }, flag: true, nil: null
    }
  });
  await h.call(CONFIG_ROUTE, 'POST', { enabled: true, mode: 'replace', text: 'NEW' });
  const disk = h.readCfg();
  assert.equal(disk.text, 'NEW', '本插件字段应被更新');
  assert.equal(disk.mode, 'replace');
  assert.equal(disk.prefix, 'KEEP-ME');
  assert.equal(disk.ttl, 42);
  assert.deepEqual(disk.nested, { a: [1, 2, 3] });
  assert.equal(disk.flag, true);
  assert.equal(disk.nil, null);
});

test('变量告警：未知/畸形报出、已知不误报；预览做真实插值', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'append', text: 'Hi {{model}} + {{nope_unknown}} + {{Bad.Name}}' },
    preAgents: ['agent-1']
  });
  // 注册一个真实变量（内核里由其它插件提供）—— 告警集合必须从真实 variables 取、不写死
  h.sp.variable('model', () => 'model-test-value');

  const st = await h.status();
  assert.ok(st.unknownVariables.includes('nope_unknown'), '未知变量应报出');
  assert.ok(!st.unknownVariables.includes('model'), '已注册变量不得误报');
  assert.ok(st.malformedVariables.includes('Bad.Name'), '畸形变量名应报出');

  const pv = await h.preview();
  assert.ok(pv.effective.includes('model-test-value'), '预览应做真实插值（{{model}} → 值）');
  assert.ok(!pv.effective.includes('{{model}}'), '已注册变量不应以字面量残留');
  assert.ok(pv.effective.includes('{{nope_unknown}}'), '未知变量应原样保留（预览宽容、与内核抛错相对）');
});

test('/preview 契约：official/effective 双语义 + sections 键恰好 [name] + text===official', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'replace', text: 'CUSTOM-PREVIEW-MARKER' },
    preAgents: ['agent-1']
  });
  await h.status(); // preview 不接串行队列：先经 GET /config 等补历史安装落地
  const pv = await h.preview();

  assert.equal(pv.ok, true);
  assert.equal(pv.proto, 2);
  assert.deepEqual(sortedKeys(pv), [...PREVIEW_KEYS].sort(), '/preview 字段集合必须与契约精确一致');
  assert.ok(pv.official.includes(OFFICIAL_PREFIX) && !pv.official.includes('CUSTOM-PREVIEW-MARKER'), 'official = 不含自定义的官方全文');
  assert.ok(pv.effective.includes('CUSTOM-PREVIEW-MARKER') && !pv.effective.includes(OFFICIAL_PREFIX), 'effective = 模型真正看到的全文（replace 遮蔽在其中）');
  assert.equal(pv.text, pv.official, 'text 是兼容字段，固定给 official');
  assert.equal(pv.scoped, true);
  assert.equal(pv.agentId, 'agent-1');
  assert.ok(Array.isArray(pv.sections) && pv.sections.length > 0);
  for (const s of pv.sections) {
    assert.deepEqual(Object.keys(s), ['name'], '0.3.3：section 只允许有 name 键（order 是恒 undefined 的死字段）');
  }
});

test('/preview 无活动 agent：scoped=false、effective 退化为 official', async (t) => {
  const h = await makeHost(t, { config: { enabled: true, mode: 'append', text: 'CUSTOM-NOAGENT-MARKER' } });
  const pv = await h.preview();
  assert.equal(pv.scoped, false);
  assert.equal(pv.agentId, null);
  assert.equal(pv.effective, pv.official);
  assert.ok(pv.official.includes(OFFICIAL_PREFIX), '无 agent 时官方文本应完整');
});

// ---------------------------------------------------------------------------
// 3. 反证（mutation red-proof）
//
// 把插件源码变异成「修复前」的形状 → 对应判据必须变红。
// 这不是重复劳动：它锁住「判据真的能红」——防止将来用例被改写成永真断言（假绿）。
// ---------------------------------------------------------------------------

test('反证：删掉 readFileConfig 的数组守卫 → 0.3.5 判据变红', async (t) => {
  const h = await makeHost(t, {
    mutate: [[
      'return parsed && typeof parsed === \'object\' && !Array.isArray(parsed) ? parsed : null;',
      'return parsed && typeof parsed === \'object\' ? parsed : null;'
    ]]
  });
  h.writeCfg('["a","b"]\n');
  const st = await h.status();
  assert.deepEqual(st.unknownConfigKeys, ['0', '1'], '变异后应重现「数组被当成 {"0":..,"1":..}」的误报（证明判据能红）');
});

test('反证：写盘变异回整文件重写 → 0.3.4 判据变红', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'append', text: 'OLD', prefix: 'KEEP-ME' },
    mutate: [['const out = { ...base, ...cfg };', 'const out = { ...cfg };']]
  });
  await h.call(CONFIG_ROUTE, 'POST', { enabled: true, mode: 'append', text: 'NEW' });
  assert.equal(h.readCfg().prefix, undefined, '变异后陌生键应被抹掉（证明判据能红）');
});

test('反证：注册变异回插件根 ctx → 0.3.0 判据变红（重名错 + 未注入）', async (t) => {
  const h = await makeHost(t, {
    config: { enabled: true, mode: 'replace', text: 'CUSTOM-MUTANT-MARKER' },
    preAgents: ['agent-1'],
    mutate: [['fiber = agent.ctx.inject([\'systemPrompt\'], (scope) => {', 'fiber = ctx.inject([\'systemPrompt\'], (scope) => {']]
  });
  const st = await h.status();
  // 变异体在根层注册同名节 → 抛重名错 → 插件自己的 try/catch 把它吞进 lastError
  // （这正是历史静默失效的形状：记账觉得装上了，实际没装）。要锁的不是 injected
  // 记账，而是用户可见行为——replace 不生效、官方 persona 未被遮蔽。
  assert.match(String(st.lastError || ''), /already registered/i, '重名错必须被 lastError 捕获（0.3.0 的可见性修复）');
  assert.ok(!String(st.lastError).includes('undefined'), 'lastError 应是内核原文');
  const effective = h.textOf(await h.assemble(h.agents[0]));
  assert.ok(!effective.includes('CUSTOM-MUTANT-MARKER'), '变异后 replace 不生效（证明「遮蔽生效」判据能红）');
  assert.ok(effective.includes(OFFICIAL_PREFIX), '变异后官方 persona 未被遮蔽（证明判据能红）');
});
