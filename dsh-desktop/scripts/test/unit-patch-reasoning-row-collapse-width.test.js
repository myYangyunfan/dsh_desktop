'use strict';

// ---------------------------------------------------------------------------
// patch reasoning-row-collapse-width 补丁单元测试（node --test）。
//
// 「思考」行折叠态空白（0.6.3 第一案）的修复验证：
//   · pristine 层：vendored tarball 真实字节里 contain:size layout 全文件唯一、
//     折叠态选择器形态与锚一致；
//   · transform 层：changed 产物去 size 留 layout、marker 在位、height calc
//     原样保留（折叠高度不丢）；二遍 already；锚变异/空输入 → anchor-missing
//     不抛；产物 CSS 注释配对、node --check 语法合法；
//   · dev 树层：appDir 靶字节已收口（marker 在位、旧串零残留）。
//
// 运行：node --test scripts/test/unit-patch-reasoning-row-collapse-width.test.js
// ---------------------------------------------------------------------------

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// 权威常量口径：patch-adapters 只把 marker 收在 `markers` 命名导出里
// （顶层 REASONING_ROW_COLLAPSE_MARKER / _FROM 是模块私有，未曾导出）。
// 直接按顶层名解构会得到 undefined，而 `String.includes(undefined)` 会把
// undefined 强制成子串 "undefined" 恒真——判据就此空转（本文件曾中招）。
// 故 marker 走 markers 命名空间 + typeof 哨兵；锚点串改由 pristine 字节正则定位。
const { markers, transformReasoningRowCollapseWidth } = require('../lib/patch-adapters');
const { PATCH_SPECS } = require('../lib/patch-registry');
const { kernel } = require('../compat/kernel-pin.json');

const REASONING_ROW_COLLAPSE_MARKER = markers.REASONING_ROW_COLLAPSE_MARKER;
assert.equal(typeof REASONING_ROW_COLLAPSE_MARKER, 'string',
  'marker 必须真是 patch-adapters markers 里的字符串（导出面漂移即红，不接受 undefined）');
assert.ok(REASONING_ROW_COLLAPSE_MARKER.length > 10, 'marker 不得是空/占位串');

// pristine 源：vendored tarball 解包（dev 树已被 patch-deps 打过，幂等判定统一
// 在 pristine 上做——与 unit-patch-deps-coverage.test.js D 的解包手法同口径；
// 原同口径的 unit-patch-model-image-input 已随该规格在 0.2.0-rc.2 退役撤除）。
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const CHAT_VENDOR_TARBALL = path.join(
  REPO_ROOT, 'dsh-desktop', 'vendor', 'dsh-kernel',
  `deepseek-ai-dsh-client-ui-chat-${kernel.packageVersion}.tgz`,
);
const CHAT_FILE = extractPristineChat();

/** 把 vendored tarball 解到一次性目录，返回 pristine client.js 路径。 */
function extractPristineChat() {
  assert.ok(fs.existsSync(CHAT_VENDOR_TARBALL), '缺 vendored tarball: ' + CHAT_VENDOR_TARBALL);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-rrcw-pristine-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // win32 显式用系统自带 bsdtar（Git Bash 的 GNU tar 会把 "C:\" 当远程主机）。
  const tarBin = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const res = spawnSync(tarBin, ['-xzf', CHAT_VENDOR_TARBALL, '-C', dir], { encoding: 'utf8' });
  assert.equal(res.status, 0, 'tar 解包失败: ' + (res.stderr || ''));
  return path.join(dir, 'package', 'lib', 'client.js');
}

function readPristine() {
  assert.ok(fs.existsSync(CHAT_FILE), '缺 dsh-client-ui-chat/lib/client.js（vendor tarball）');
  return fs.readFileSync(CHAT_FILE, 'utf8');
}

/** pristine 字节里的整条折叠态规则（含 contain:size layout 的那一条）。 */
const COLLAPSE_RULE_RE = /\.[A-Za-z0-9_]+_root:not\(\[data-expanded\]\)\{contain:size layout;[^}]*\}/g;
function collapseRulesOf(src) {
  return src.match(COLLAPSE_RULE_RE) || [];
}

test('pristine 锚点唯一性：contain:size layout 全文件一次且在折叠态选择器里', () => {
  const src = readPristine();
  const hits = src.split('contain:size layout').length - 1;
  assert.equal(hits, 1, `contain:size layout 应全文件唯一（实际 ${hits} 次）`);
  // 折叠态选择器的 CSS Module 哈希类随内核换代而变：alpha 世代为 .t2QtNG_root，
  // 0.1.5-rc.1（compat-pin 锁版的 vendored 字节）为 .lcKema_root。哈希即稳定锚，
  // 换版必须在这里跟着更正——不更正就是「锚点已漂移」的红灯，而非静默失配。
  assert.ok(src.includes('.lcKema_root:not([data-expanded])'), '折叠态选择器（哈希类）应在场');
  const rules = collapseRulesOf(src);
  assert.equal(rules.length, 1, `折叠态规则（含 contain:size layout）应整条唯一（实际 ${rules.length} 条）`);
  assert.match(rules[0], /^\.[A-Za-z0-9_]{6,}_root:not\(\[data-expanded\]\)\{contain:size layout;/,
    '折叠态规则应以哈希类 _root:not([data-expanded]) 选择器开头（锚点确实落在这个作用域里）');
  assert.ok(
    rules[0].includes('height:calc(24px + var(--dsh-content-font-delta,0px))'),
    '折叠高度 calc 应在同一条规则里（补丁只去 size、不得丢高度）',
  );
  // 注册表装配同源：spec.marker 必须就是 patch-adapters 导出的那个 marker。
  const spec = PATCH_SPECS.find((s) => s.id === 'reasoning-row-collapse-width');
  assert.ok(spec, 'reasoning-row-collapse-width 应登记在注册表');
  assert.equal(spec.marker, REASONING_ROW_COLLAPSE_MARKER, '注册表 marker 应与 patch-adapters 同源');
  assert.match(String(spec.pkgRel || (spec.pkgRels || []).join()).replace(/\\/g, '/'),
    /dsh-client-ui-chat\/lib\/client\.js$/, '靶应为 dsh-client-ui-chat/lib/client.js');
});

test('transform：changed 产物去 size 留 layout、marker 在位、折叠高度保留', () => {
  const src = readPristine();
  const rule = collapseRulesOf(src)[0];
  assert.ok(rule, 'pristine 折叠态规则应可定位（上一条已锁）');
  const r = transformReasoningRowCollapseWidth(src, 'chat/client.js');
  assert.equal(r.status, 'changed');
  assert.ok(r.src.includes(REASONING_ROW_COLLAPSE_MARKER), '产物应有 marker（幂等依据）');
  assert.equal(r.src.split('contain:size layout').length - 1, 0, 'size containment 应零残留');
  assert.ok(r.src.includes('contain:layout;'), '应保留 layout containment');
  assert.ok(
    r.src.includes('{contain:layout;/* dsh-desktop fix: reasoning row collapse width (contain:size removed) */height:calc(24px + var(--dsh-content-font-delta,0px))}'),
    '折叠高度 calc 应原样保留（去 size 不动 height；marker 注释插在声明之间）',
  );
  // 单点改动锁：产物必须恰好等于「pristine 里那条折叠态规则被就地改写」，
  // 全文其余字节一动不动（防止 replace 命中多处或顺手改了别处）。
  const expected = rule.replace('contain:size layout;', 'contain:layout;/* ' + REASONING_ROW_COLLAPSE_MARKER + ' */');
  assert.equal(r.src, src.replace(rule, expected), '产物应只改这一条规则、其余字节逐字不动');
});

test('幂等：changed 产物二遍 → already', () => {
  const src = readPristine();
  const once = transformReasoningRowCollapseWidth(src, 'chat/client.js');
  assert.equal(once.status, 'changed');
  const twice = transformReasoningRowCollapseWidth(once.src, 'chat/client.js');
  assert.equal(twice.status, 'already');
});

test('锚变异（上游换写法）→ anchor-missing 不落半成品', () => {
  const src = readPristine().replace('contain:size layout', 'contain:strict size');
  const r = transformReasoningRowCollapseWidth(src, 'chat/client.js');
  assert.equal(r.status, 'anchor-missing');
  assert.ok(!r.src, '失配不得返回 src');
});

test('脏输入（空串 / 无 CSS 的 JS）→ anchor-missing 不抛', () => {
  assert.equal(transformReasoningRowCollapseWidth('', 'a.js').status, 'anchor-missing');
  assert.equal(
    transformReasoningRowCollapseWidth('module.exports = 1;', 'a.js').status,
    'anchor-missing',
  );
});

test('产物 CSS 注释配对（marker 注释不破坏样式串）', () => {
  const src = readPristine();
  const r = transformReasoningRowCollapseWidth(src, 'chat/client.js');
  assert.equal(r.status, 'changed');
  const count = (s, t) => s.split(t).length - 1;
  // 不能拿「全文 open === close」当判据：0.2.2-rc.1 的 client.js 截图式样式字面量里本就带一个
  // 不成对的 `*/`（实测 pristine open=599 / close=600），用全文配对会把上游既有形态误判成
  // 我们注入造成的破坏。真正要钉的是「本补丁注入的注释是配对的一对」——增量口径对两代都成立。
  const dOpen = count(r.src, '/*') - count(src, '/*');
  const dClose = count(r.src, '*/') - count(src, '*/');
  assert.equal(dOpen, 1, `应恰好注入 1 个 CSS 注释开头（实际增量 ${dOpen}）`);
  assert.equal(dClose, 1, `注入的 CSS 注释必须闭合（实际增量 ${dClose}）`);
  // 注入体整体在位（成对的注释 + 去掉 size containment 的规则）。
  assert.ok(
    r.src.includes('.lcKema_root:not([data-expanded]){contain:layout;/* ' + REASONING_ROW_COLLAPSE_MARKER),
    '注入的规则应带成对 marker 注释且 contain:layout',
  );
});

test('产物 node --check 语法合法', () => {
  const src = readPristine();
  const r = transformReasoningRowCollapseWidth(src, 'chat/client.js');
  assert.equal(r.status, 'changed');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-rrcw-out-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, 'client.js');
  fs.writeFileSync(out, r.src, 'utf8');
  const res = spawnSync(process.execPath, ['--check', out], { encoding: 'utf8' });
  assert.equal(res.status, 0, '产物语法应合法: ' + (res.stderr || ''));
});

test('dev 树收口：appDir 靶字节已应用本补丁（marker 在位、旧串零残留）', () => {
  const devTarget = path.join(REPO_ROOT, 'dsh-desktop', 'node_modules',
    '@deepseek-ai', 'dsh-client-ui-chat', 'lib', 'client.js');
  assert.ok(fs.existsSync(devTarget), '缺 dev 靶: ' + devTarget);
  const src = fs.readFileSync(devTarget, 'utf8');
  assert.ok(src.includes(REASONING_ROW_COLLAPSE_MARKER), 'dev 靶应有 marker（patch-deps 收口）');
  assert.equal(src.split('contain:size layout').length - 1, 0, 'dev 靶 size containment 应零残留');
});
