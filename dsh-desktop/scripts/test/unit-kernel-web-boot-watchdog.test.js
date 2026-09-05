'use strict';

// 内核 web UI boot 看门狗补丁单元测试（#154 第三根因，node --test）。
//
// v0.5.3 用户反馈「client module system unavailable / 前端无限转圈」：内核
// 进程活着、HTTP 正常，但启动数据（__DSH_BOOT__ / client module system /
// 插件 boot）一直不落定——前端 boot 页 spinner 无限转，壳侧恢复页不出现
// （内核没死，探活恒过）。补丁在 dsh-web-frontend/dist/index.html 注入
// 有界等待看门狗（45s 超时 → 明确错误 + 重新加载出口 + 完全退出重启指引），
// 不再无限转圈。
//
// 覆盖：
//   1. 锚点命中 pristine 源（.tmp-rc2-stage 优先，回退 payload 镜像）；
//   2. 注入脚本语法合法（vm compileFunction）；
//   3. 幂等（二遍 already）+ 无锚点 anchor-missing + CRLF 归一化命中；
//   4. 行为（vm 实跑注入脚本，非复述实现）：正常 boot 页（spinner）超时 →
//      出现 dsh-boot-watchdog 覆盖层；fail-loud 已展示 → 不打扰；真 UI 替换
//      卡片 → 不打扰；
//   5. registry 装配（guard 组 order 156 / cli:false / marker 同源 /
//      pkgRel 走 resolver 常量）。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { transformKernelBootWatchdog, toPristineSource, markers } = require('../lib/patch-adapters');
const { PATCH_SPECS } = require('../lib/patch-registry');
const { KERNEL_WEB_INDEX_REL, resolvePatchTargets } = require('../lib/patch-target-resolver');

const MARKER = markers.KERNEL_BOOT_WATCHDOG_MARKER;

// 靶文件候选：dev 安装树优先（与运行时同源），其次打包 payload 镜像。
// 两处都会被 boot 链 / stage-payload 就地注入看门狗，故拿到字节后统一走
// toPristineSource 剥回 pristine —— 不再依赖「某个目录恰好没被碰过」。
// 早前这里以 .tmp-rc2-stage 为主、payload 镜像为备：前者已不再包含该包，
// 后者是补丁态，于是「必须 changed」退化成 already，后续六条提不到注入 script
// 块连带 TypeError。
const TARGET_CANDIDATES = [
  path.join(__dirname, '..', '..', 'node_modules', '@deepseek-ai', KERNEL_WEB_INDEX_REL),
  path.join(__dirname, '..', '..', '..', 'dsh-tauri', 'package-payload', 'dsh-desktop',
    'node_modules', '@deepseek-ai', KERNEL_WEB_INDEX_REL),
];

const TARGET = TARGET_CANDIDATES.find((f) => fs.existsSync(f)) || null;

function pristineSrc() {
  assert.ok(TARGET, '找不到 dsh-web-frontend dist/index.html 靶文件（dev 树与 payload 镜像均缺失）');
  return toPristineSource('kernel-web-boot-watchdog', fs.readFileSync(TARGET, 'utf8'));
}

// ---------------------------------------------------------------------------
// 1-3：锚点命中真实靶字节 / 语法合法 / 幂等与失配。
// ---------------------------------------------------------------------------

test('锚点命中真实靶字节（版本漂移哨兵）', () => {
  const r = transformKernelBootWatchdog(pristineSrc(), 'index.html');
  assert.strictEqual(r.status, 'changed', `pristine 必须命中锚点，得 ${r.status}: ${r.detail || ''}`);
  assert.ok(r.src.includes(MARKER), '产物应含 marker 注释');
  assert.ok(r.src.includes('dsh-boot-watchdog'), '应含覆盖层 id');
  assert.ok(r.src.includes('45000'), '看门狗应有界（45s）');
  assert.ok(r.src.includes('重新加载'), '覆盖层应含恢复出口');
  assert.ok(r.src.includes('完全退出并重启 DSH Desktop'), '覆盖层应含修复指引');
});

test('注入脚本语法合法（vm compileFunction）', () => {
  const r = transformKernelBootWatchdog(pristineSrc(), 'index.html');
  const m = r.src.match(/<script>\n([\s\S]*?)\n  <\/script>/);
  assert.ok(m, '应能提取注入的 script 块');
  const body = m[1].replace(/^\s*\/\*[\s\S]*?\*\/\s*/m, '');
  assert.doesNotThrow(() => vm.compileFunction(body), '注入脚本必须语法合法');
});

test('幂等：二遍 already / 无锚点 anchor-missing / CRLF 归一化命中', () => {
  const once = transformKernelBootWatchdog(pristineSrc(), 'index.html');
  assert.equal(once.status, 'changed');
  assert.equal(transformKernelBootWatchdog(once.src, 't.html').status, 'already');
  // CRLF 输入（换行风格漂移不应击穿补丁；写回保持 CRLF）。
  const crlf = pristineSrc().replace(/\n/g, '\r\n');
  const r = transformKernelBootWatchdog(crlf, 't.html');
  assert.equal(r.status, 'changed', 'CRLF 源同样命中');
  assert.ok(r.src.includes('\r\n'), 'CRLF 源写回保持 CRLF');
  // 失配：无锚点 → anchor-missing（版本漂移），绝不改写。
  const miss = transformKernelBootWatchdog('<html><body><div>x</div></body></html>', 't.html');
  assert.equal(miss.status, 'anchor-missing');
  assert.equal(miss.src, undefined, '失配时不得返回改写源');
});

// ---------------------------------------------------------------------------
// 4：行为（vm 执行注入脚本）。
// ---------------------------------------------------------------------------

/**
 * 抽取注入脚本并在 vm 沙箱执行。沙箱提供可控 DOM / Date.now / setTimeout，
 * 返回注入脚本触发的定时器队列与「创建的元素」队列，供断言。
 */
function runWatchdog({ cardHasFailed, modulePresent, rootChildrenCount, hasBootCard = true }) {
  const src = transformKernelBootWatchdog(pristineSrc(), 'index.html').src;
  const m = src.match(/<script>\n([\s\S]*?)\n  <\/script>/);
  const body = m[1].replace(/^\s*\/\*[\s\S]*?\*\/\s*/m, '');
  let nowMs = 1000;
  const timers = []; // { at, fn }
  const created = [];
  const bootCard = {
    querySelector(sel) {
      if (sel.indexOf('_failed_') !== -1) return cardHasFailed ? {} : null;
      return null;
    },
  };
  const fakeRoot = {
    children: Array.from({ length: rootChildrenCount }, () => ({})),
    querySelector(sel) {
      if (sel === '[data-dsh-boot]') return hasBootCard ? bootCard : null;
      return null;
    },
    appendChild(node) { this.children.push(node); },
  };
  const sandbox = {
    document: {
      readyState: 'complete',
      getElementById(id) {
        if (id === 'root') return fakeRoot;
        if (id === 'dsh-boot-watchdog') return created.find((el) => el.id === 'dsh-boot-watchdog') || null;
        return null;
      },
      createElement() {
        const el = { id: '', style: {}, textContent: '', children: [], appendChild(n) { this.children.push(n); }, addEventListener() {} };
        created.push(el);
        return el;
      },
      addEventListener() {},
    },
    window: {
      addEventListener() {},
      __DSH_MODULES__: modulePresent ? { import() {} } : undefined,
      location: { reload() { sandbox.reloaded = true; } },
    },
    Date: {
      now: () => nowMs,
    },
    setTimeout(fn, ms) {
      timers.push({ at: nowMs + ms, fn });
      return timers.length;
    },
    location: { reload() { sandbox.reloaded = true; } },
  };
  vm.createContext(sandbox);
  vm.runInContext(body, sandbox);
  return { timers, created, advance: (ms) => { nowMs += ms; }, now: () => nowMs };
}

test('行为：spinner 卡死 45s 超时 → 出现 dsh-boot-watchdog 覆盖层（不再无限转圈）', () => {
  const w = runWatchdog({ cardHasFailed: false, modulePresent: false, rootChildrenCount: 1 });
  assert.ok(w.timers.length > 0, '应安排轮询 tick');
  // 按调度序推进时间并执行每个 tick；tick 内部自行判断是否已到 45s 上限。
  let fired = null;
  for (let i = 0; i < 200 && fired === null; i += 1) {
    const next = w.timers.shift();
    if (!next) break;
    w.advance(Math.max(0, next.at - w.now()));
    next.fn();
    fired = w.created.find((el) => el.id === 'dsh-boot-watchdog') || null;
  }
  assert.ok(fired, '45s 后必须出现 dsh-boot-watchdog 覆盖层');
  // 覆盖层文案含明确错误与恢复出口。
  const texts = [];
  (function collect(n) {
    if (!n) return;
    if (n.textContent) texts.push(n.textContent);
    for (const c of n.children || []) collect(c);
  })(fired);
  assert.ok(texts.some((t) => t.includes('内核服务异常')), '覆盖层应给明确错误');
  assert.ok(texts.some((t) => t.includes('重新加载')), '覆盖层应给恢复出口');
  assert.ok(texts.some((t) => t.includes('完全退出并重启')), '覆盖层应给修复指引');
});

test('行为：fail-loud 已展示 → 不打扰（错误已可见，看门狗不覆盖）', () => {
  const w = runWatchdog({ cardHasFailed: true, modulePresent: false, rootChildrenCount: 1 });
  // 执行全部已排定 timer：tick 判定 fail-loud 已展示 → 不卡死 → 不再排程。
  for (let i = 0; i < 200; i += 1) {
    const next = w.timers.shift();
    if (!next) break;
    w.advance(Math.max(0, next.at - w.now()));
    next.fn();
  }
  assert.equal(w.created.some((el) => el.id === 'dsh-boot-watchdog'), false, 'fail-loud 已展示不得再覆盖');
});

test('行为：真 UI 替换卡片 → 不打扰（boot 成功）', () => {
  const w = runWatchdog({ cardHasFailed: false, modulePresent: false, rootChildrenCount: 3, hasBootCard: false });
  for (let i = 0; i < 200; i += 1) {
    const next = w.timers.shift();
    if (!next) break;
    w.advance(Math.max(0, next.at - w.now()));
    next.fn();
  }
  // 卡片已被替换（root.children.length > 0 且无 [data-dsh-boot]）→ 不卡死。
  assert.equal(w.created.some((el) => el.id === 'dsh-boot-watchdog'), false, 'boot 成功不得出现覆盖层');
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
