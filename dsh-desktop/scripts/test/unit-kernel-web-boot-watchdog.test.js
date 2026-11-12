'use strict';

// 内核 web UI boot 看门狗补丁单元测试（#154 第三根因 + 1.0.9「插件装崩就进不去
// 客户端」，node --test）。
//
// 背景：客户端插件装配失败时内核**不抛错**——`dsh-client-web` 的 BootController 只把
// boot 卡片换成 `Failed to load plugins`，页面不冒泡、desktop.log 零行、重载同一结果，
// 用户只能手删 profile。而 `dsh-client-web/lib/index.js` 是构建期源码，服务端发的
// `dsh-web-frontend/dist/index.html` 只加载一个自包含 assets chunk，与它无关——
// 在那里注入的生产者**永不被调用**（却能骗过 patch-surface verify）。
// 所以运行时唯一的注入点是本补丁：index.html 里那段独立看门狗。
//
// 覆盖：
//   1. 锚点命中 pristine 源 + 关键判据齐全；
//   2. 注入脚本语法合法（vm compileFunction）；
//   3. 幂等（二遍 already）/ 旧注入块就地自愈 / 无锚点 anchor-missing / CRLF 归一化；
//   4. 行为（vm 实跑注入脚本，非复述实现）：
//      · 装配失败卡片（`_failed_`）连看两轮 → page_error 上报 `[client-boot] FAILED`
//        带失败项文本 + 就地给覆盖层（含「以安全模式重启」）；
//      · 只闪一轮就消失（能用的界面）→ 不上报不覆盖（反证：不许误踢用户）；
//      · 45s 仍停在卡片 → 上报 `[client-boot] NOTE`（不换页）并给两条出口；
//      · 挂载成功（容器被接管控件替换）→ 静默；
//      · 「以安全模式重启」按钮 → invoke('recovery_safe_mode')；
//      · 非 Tauri 宿主（无 __TAURI_INTERNALS__）→ 不抛错、不上报；
//   5. registry 装配（guard 组 order 156 / cli:false / marker 同源 / pkgRel 走 resolver）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { transformKernelBootWatchdog, markers } = require('../lib/patch-adapters');
const { PATCH_SPECS } = require('../lib/patch-registry');
const { KERNEL_WEB_INDEX_REL, resolvePatchTargets } = require('../lib/patch-target-resolver');

const MARKER = markers.KERNEL_BOOT_WATCHDOG_MARKER;

// 靶文件候选：dev 安装树优先（与运行时同源），其次打包 payload 镜像。
// 取到后一律以「已注入」为前提：transform 自带版本自愈（同 marker 不同字节就地
// 替换），所以这里既接受补丁态也接受 pristine，不依赖目录是否被碰过。
const TARGET_CANDIDATES = [
  path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', KERNEL_WEB_INDEX_REL),
  path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'pp',
    'node_modules', '@deepseek-ai', KERNEL_WEB_INDEX_REL),
];

const TARGET = TARGET_CANDIDATES.find((f) => fs.existsSync(f)) || null;

function targetSrc() {
  assert.ok(TARGET, '找不到 dsh-web-frontend dist/index.html 靶文件（dev 树与 payload 镜像均缺失）');
  return fs.readFileSync(TARGET, 'utf8');
}

/** 把靶字节归一成「已注入当前脚本」的形态（幂等；旧注入体由 transform 自愈）。 */
function injectedSrc() {
  const r = transformKernelBootWatchdog(targetSrc(), 'index.html');
  if (r.status === 'already') return targetSrc();
  assert.strictEqual(r.status, 'changed', `靶文件必须可注入，得 ${r.status}: ${r.detail || ''}`);
  return r.src;
}

function extractBody(src) {
  const m = src.match(/<script>\n([\s\S]*?)\n  <\/script>/);
  assert.ok(m, '应能提取注入的 script 块');
  return m[1].replace(/^\s*\/\*[\s\S]*?\*\/\s*/m, '');
}

// ---------------------------------------------------------------------------
// 1-3：锚点命中真实靶字节 / 语法合法 / 幂等与自愈。
// ---------------------------------------------------------------------------

test('锚点命中真实靶字节且关键判据齐全（版本漂移哨兵）', () => {
  const r = transformKernelBootWatchdog(targetSrc(), 'index.html');
  assert.ok(r.status === 'changed' || r.status === 'already', `靶文件状态异常: ${r.status}`);
  const src = r.status === 'changed' ? r.src : targetSrc();
  assert.ok(src.includes(MARKER), '产物应含 marker 注释');
  assert.ok(src.includes('dsh-boot-watchdog'), '应含覆盖层 id');
  assert.ok(src.includes('45000'), '看门狗应有界（45s）');
  assert.ok(src.includes('[data-dsh-boot]'), '判据锚在 boot 卡片上（挂载成功后卡片必消失）');
  assert.ok(src.includes('_failed_'), '应识别内核自己的装配失败节点');
  assert.ok(src.includes('[client-boot] FAILED'), '失败必须上报壳侧既有 page_error 通道');
  assert.ok(src.includes('[client-boot] NOTE'), '超时只记日志，不得换页');
  assert.ok(src.includes('page_error'), '不得新建桥命令，走 page_error');
  assert.ok(src.includes('recovery_safe_mode'), '覆盖层必须给安全模式出口');
  assert.ok(src.includes('重新加载'), '覆盖层应含重试出口');
  assert.ok(src.includes('DSH Pack'), '文案用当前产品名');
  // 注入块恰好一份（自愈替换不得叠加）。
  assert.equal(src.split(MARKER).length - 1, 1, '注入块应恰好一份');
});

test('注入脚本语法合法（vm compileFunction）', () => {
  assert.doesNotThrow(() => vm.compileFunction(extractBody(injectedSrc())), '注入脚本必须语法合法');
});

test('幂等：二遍 already / 旧注入体就地自愈 / 无锚点 anchor-missing / CRLF 归一化命中', () => {
  const once = transformKernelBootWatchdog(targetSrc(), 'index.html');
  const injected = once.status === 'already' ? targetSrc() : once.src;
  assert.equal(transformKernelBootWatchdog(injected, 't.html').status, 'already');

  // 旧注入体（同 marker、旧脚本体）→ 必须就地替换而不是当成 already。
  // 这是「dev 树停在旧字节、快照与产物互证假绿」的唯一解法。
  const stale = injected.replace(
    /(  <script>\n)(  \/\* [^\n]*kernel web boot watchdog[\s\S]*?)(\n  <\/script>)/,
    '$1  /* ' + MARKER + '（历史版本注入体） */\n(function(){ /* 老实现 */ })();$3',
  );
  assert.ok(stale !== injected, '夹具必须真的改掉旧块');
  const healed = transformKernelBootWatchdog(stale, 't.html');
  assert.equal(healed.status, 'changed', '旧注入体必须重写');
  assert.ok(/更新/.test(healed.detail || ''), 'changed 需说明是注入体更新');
  assert.equal(healed.src.includes('老实现'), false, '旧实现必须被替换掉');
  assert.equal(healed.src.split(MARKER).length - 1, 1, '自愈后仍恰好一份');

  // CRLF 输入（换行风格漂移不应击穿补丁；写回保持 CRLF）。
  const crlf = injected.replace(/\n/g, '\r\n');
  const r = transformKernelBootWatchdog(crlf, 't.html');
  assert.ok(r.status === 'changed' || r.status === 'already', `CRLF 源应幂等命中，得 ${r.status}`);
  if (r.status === 'changed') assert.ok(r.src.includes('\r\n'), 'CRLF 源写回保持 CRLF');

  // 失配：无锚点 → anchor-missing（版本漂移），绝不改写。
  const miss = transformKernelBootWatchdog('<html><body><div>x</div></body></html>', 't.html');
  assert.equal(miss.status, 'anchor-missing');
  assert.equal(miss.src, undefined, '失配时不得返回改写源');
});

// ---------------------------------------------------------------------------
// 4：行为（vm 执行注入脚本）。
// ---------------------------------------------------------------------------

/**
 * 在 vm 沙箱执行注入脚本，返回可控定时器队列 / 创建的元素 / invoke 记录。
 * @param {object} o
 * @param {string[]|null} o.failedTexts boot 卡片里 `_failed_` 节点的文本（null = 无失败节点）
 * @param {boolean} o.hasBootCard  #root 里是否还有 [data-dsh-boot]
 * @param {number} o.rootChildrenCount #root 子节点数（React 接管后卡片消失但有子节点）
 * @param {boolean} o.tauri 是否存在 __TAURI_INTERNALS__
 * @param {boolean} o.boxClassMissing 反证用：失败容器 class 名漂移（只能靠文本判定）
 * @param {(step:number)=>string[]|null} [o.failedTextsAt] 按 tick 次数动态给失败文本
 */
function runWatchdog(o = {}) {
  const {
    failedTexts = null, hasBootCard = true, rootChildrenCount = 1, tauri = true,
    boxClassMissing = false, failedTextsAt = null,
  } = o;
  const body = extractBody(injectedSrc());
  let nowMs = 1000;
  let cardAlive = hasBootCard;
  let failures = failedTexts;
  let tickCount = 0;
  const timers = [];
  const created = [];
  const invokes = [];
  const reloads = [];

  function mkEl(tag) {
    const el = {
      tagName: tag, id: '', style: {}, textContent: '', children: [], handlers: {},
      appendChild(n) { this.children.push(n); return n; },
      addEventListener(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); },
      fire(type) { for (const fn of this.handlers[type] || []) fn.call(this); },
    };
    created.push(el);
    return el;
  }

  // 真实 DOM 形状（按被服务 chunk 的真字节造，不是发明）：
  //   boot 根节点 `dataset.dshBoot=""` → div[data-dsh-boot]
  //   失败容器 `_failed_<hash>`，条目 `_failedItem_<hash>`
  const failedText = () => (failures && failures.length
    ? `Failed to load plugins ${failures.join(' ')}` : '');
  const failedBox = {
    get textContent() { return failedText(); },
    querySelectorAll(sel) {
      if (sel.indexOf('_failedItem_') === -1) return [];
      return (failures || []).map((t) => ({ textContent: t }));
    },
  };
  const bootCard = {
    get textContent() { return failedText(); },
    querySelector(sel) {
      if (sel.indexOf('_failed_') === -1) return null;
      if (boxClassMissing) return null; // 反证：class 名漂移时退回文本判定
      return failures && failures.length ? failedBox : null;
    },
  };
  const fakeRoot = {
    get children() { return Array.from({ length: rootChildrenCount }, () => ({})); },
    querySelector(sel) {
      if (sel === '[data-dsh-boot]') return cardAlive ? bootCard : null;
      return null;
    },
    appendChild(n) { this._panel = n; return n; },
  };
  const sandbox = {
    Date: { now: () => nowMs },
    Promise,
    document: {
      readyState: 'complete',
      getElementById(id) {
        if (id === 'root') return fakeRoot;
        return created.find((el) => el.id === id) || null;
      },
      createElement: (tag) => mkEl(tag),
      addEventListener() {},
    },
    location: { reload() { reloads.push(Date.now()); } },
    setTimeout(fn, ms) { timers.push({ at: nowMs + ms, fn }); return timers.length; },
  };
  sandbox.window = {
    addEventListener() {},
    location: sandbox.location,
    // 每组用例开始前按 tick 动态改失败文本：用于「闪一轮就恢复」的反证。
  };
  if (tauri) {
    sandbox.window.__TAURI_INTERNALS__ = {
      invoke(cmd, args) { invokes.push({ cmd, args }); return Promise.resolve(); },
    };
  }
  vm.createContext(sandbox);
  vm.runInContext(body, sandbox);

  const view = {
    timers, created, invokes, reloads,
    get ticks() { return tickCount; },
    advance(ms) { nowMs += ms; },
    /** 推进并执行全部已排定定时器；每步前按 failedTextsAt 调整卡片状态 */
    drain(maxSteps = 300) {
      for (let i = 0; i < maxSteps; i += 1) {
        const next = timers.shift();
        if (!next) break;
        nowMs = Math.max(nowMs, next.at);
        tickCount += 1;
        if (failedTextsAt) {
          const r = failedTextsAt(tickCount);
          if (r && r.hasBootCard !== undefined) cardAlive = r.hasBootCard;
          if (r && r.failedTexts !== undefined) failures = r.failedTexts;
        }
        next.fn();
      }
    },
    panel() { return created.find((el) => el.id === 'dsh-boot-watchdog') || null; },
    texts() {
      const p = view.panel();
      const out = [];
      (function walk(n) {
        if (!n) return;
        if (n.textContent) out.push(n.textContent);
        for (const c of n.children || []) walk(c);
      })(p);
      return out;
    },
    button(label) {
      const p = view.panel();
      const find = (n) => {
        if (!n) return null;
        if (n.tagName === 'button' && n.textContent === label) return n;
        for (const c of n.children || []) {
          const hit = find(c);
          if (hit) return hit;
        }
        return null;
      };
      return find(p);
    },
  };
  return view;
}

test('行为：装配失败卡片 → 上报 [client-boot] FAILED（带失败项）并给安全模式出口', () => {
  const w = runWatchdog({ failedTexts: ['dsh-broken failed to load', 'uiRenderer failed to load'] });
  w.drain();
  const fails = w.invokes.filter((i) => i.cmd === 'page_error'
    && String(i.args && i.args.message).startsWith('[client-boot] FAILED'));
  assert.equal(fails.length, 1, '致命失败必须且只上报一次');
  const msg = fails[0].args.message;
  assert.ok(msg.includes('dsh-broken failed to load'), `报文应带失败项原文: ${msg}`);
  assert.ok(msg.includes('uiRenderer failed to load'), `报文应带全部失败项: ${msg}`);

  const panel = w.panel();
  assert.ok(panel, '失败必须当场给恢复覆盖层（壳侧换页失败时仍有出口）');
  const texts = w.texts();
  assert.ok(texts.some((t) => t.includes('客户端插件装配失败')), `应给明确错误标题: ${texts}`);
  assert.ok(texts.some((t) => t.includes('以安全模式重启')), '应给安全模式指引');
  assert.ok(w.button('以安全模式重启'), '覆盖层必须有「以安全模式重启」按钮');
  assert.ok(w.button('重新加载'), '覆盖层必须保留重试按钮');
});

test('行为：失败容器 class 名漂移时退回文本判定（判据不押单一 class 名）', () => {
  const w = runWatchdog({ failedTexts: ['dsh-broken failed to load'], boxClassMissing: true });
  w.drain();
  const fails = w.invokes.filter((i) => i.cmd === 'page_error'
    && String(i.args.message).startsWith('[client-boot] FAILED'));
  assert.equal(fails.length, 1, 'class 漂移也必须判出致命失败');
  assert.ok(fails[0].args.message.includes('Failed to load plugins'),
    `报文应带上屏原文: ${fails[0].args.message}`);
});

test('行为：失败只闪一轮就恢复 → 不上报不覆盖（不许误踢能用的界面）', () => {
  // tick1 看到失败节点（连看计数 = 1），tick2 卡片已被真 UI 替换 → 计数清零，绝不上报。
  // 反证：把阈值改成 1 这条当场变红——它是「连看两轮」判据的唯一凭据。
  const w = runWatchdog({
    failedTexts: ['transient fail'],
    failedTextsAt: (step) => (step >= 2 ? { failedTexts: null, hasBootCard: false } : null),
  });
  w.drain();
  assert.ok(w.ticks >= 1, '夹具必须真的跑过 tick（否则本用例在空转）');
  assert.equal(w.invokes.filter((i) => i.cmd === 'page_error').length, 0, '瞬时失败不得上报');
  assert.equal(w.panel(), null, '瞬时失败不得出覆盖层');
});

test('行为：45s 仍停在卡片 → 只记 [client-boot] NOTE（不换页）并给两条出口', () => {
  const w = runWatchdog({ failedTexts: null, hasBootCard: true });
  w.drain();
  const calls = w.invokes.filter((i) => i.cmd === 'page_error');
  assert.ok(calls.some((i) => String(i.args.message).startsWith('[client-boot] NOTE')),
    '超时应记日志（否则仍是静默）');
  assert.equal(calls.some((i) => String(i.args.message).startsWith('[client-boot] FAILED')), false,
    '超时不等于确证失败，不得触发壳侧换页');
  const texts = w.texts();
  assert.ok(texts.some((t) => t.includes('内核服务异常')), `应给明确错误: ${texts}`);
  assert.ok(w.button('重新加载') && w.button('以安全模式重启'), '两条出口都要在');
});

test('行为：挂载成功（卡片消失）→ 静默，不上报不覆盖', () => {
  const w = runWatchdog({ failedTexts: null, hasBootCard: false, rootChildrenCount: 3 });
  w.drain();
  assert.equal(w.invokes.length, 0, 'boot 成功不得上报');
  assert.equal(w.panel(), null, 'boot 成功不得出现覆盖层');
});

test('行为：「以安全模式重启」→ invoke recovery_safe_mode；非 Tauri 宿主不抛错不上报', () => {
  const w = runWatchdog({ failedTexts: ['bad plugin'] });
  w.drain();
  const btn = w.button('以安全模式重启');
  assert.ok(btn, '必须有安全模式按钮');
  btn.fire('click');
  assert.ok(w.invokes.some((i) => i.cmd === 'recovery_safe_mode'), '点击必须落到 recovery_safe_mode');

  // 反证：没有 __TAURI_INTERNALS__（浏览器直开 / 非桌面宿主）→ 不抛错、不上报。
  const bare = runWatchdog({ failedTexts: ['bad plugin'], tauri: false });
  assert.doesNotThrow(() => bare.drain());
  assert.equal(bare.invokes.length, 0);
  assert.ok(bare.panel(), '没有桥也要给就地出口（至少能重新加载）');
  assert.doesNotThrow(() => bare.button('以安全模式重启').fire('click'), '无桥时点击不得抛错');
});

// ---------------------------------------------------------------------------
// 5：registry 装配。
// ---------------------------------------------------------------------------

test('registry 装配：guard 组 / order 156 / cli:false / marker 同源 / pkgRel 走 resolver', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'kernel-web-boot-watchdog');
  assert.ok(spec, 'registry 必须登记 kernel-web-boot-watchdog');
  assert.equal(spec.group, 'guard');
  assert.equal(spec.order, 156);
  assert.equal(spec.kind, 'file');
  assert.equal(spec.cli, false, '只在桌面壳 boot 链应用');
  assert.equal(spec.marker, markers.KERNEL_BOOT_WATCHDOG_MARKER, 'marker 与 transform 同源');
  assert.equal(spec.pkgRel, KERNEL_WEB_INDEX_REL, 'pkgRel 走 resolver 常量');
  // 布局解析：app 内置副本必须命中。
  const targets = resolvePatchTargets({ home: 'H', appDir: 'A', userDataDir: 'U', wslMode: false }, spec);
  assert.ok(targets.includes('A\\node_modules\\@deepseek-ai\\dsh-web-frontend\\dist\\index.html')
    || targets.includes('A/node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html'), `app 内置副本必须命中: ${targets}`);
});
