'use strict';

// content-has-image-guard 补丁单元测试（node --test）。
//
// v0.6.0 用户反馈「本轮运行失败 Cannot read properties of undefined (reading 'some')」。
// 真凶：dsh-llm 的 contentHasImage 是所有图片策略（capability gating / text-only
// serialization / compaction survey）共用的唯一递归图片遍历，它对 tool-result 块
// 递归调用 contentHasImage(block.content)；当某个 tool-result 块的 content 为非数组
// （undefined）时，裸 content.some 即抛 "Cannot read properties of undefined
// (reading 'some')"，经 adapterStream → turn/end 冒泡成整轮失败。补丁在函数头加
// `if (!Array.isArray(content)) return false;`（非数组天然不含图片）。
//
// 覆盖：
//   1. 锚点命中 pristine 源（vendored alpha.5 dsh-llm tarball 的 lib/index.js）→ changed；
//   2. transform 产物 node --check 可解析（守卫保持语法完整）；
//   3. 幂等（二遍 already）；
//   4. 语义：函数头 Array.isArray 守卫在位、原 return 行保留、marker 在位；
//   5. 行为：守卫后的 contentHasImage 经 vm 执行，content=undefined → false 不裸抛；
//      正常数组路径（含 tool-result 递归 undefined content）判定不变；
//   6. 不误伤：锚点缺失（版本漂移）→ anchor-missing（绝不静默错配）；
//   7. registry 装配（pkgRel=LLM_PKG_REL / transform / marker 同源 / cli:false）。

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync, execFileSync } = require('node:child_process');

const { transformContentHasImageGuard, markers } = require('../lib/patch-adapters');
const { PATCH_SPECS, getSpecsByCli } = require('../lib/patch-registry');
const { LLM_PKG_REL } = require('../lib/patch-target-resolver');
const { kernel } = require('../compat/kernel-pin.json');

const MARKER = markers.CONTENT_HAS_IMAGE_GUARD_MARKER;
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const VENDOR_TARBALL = path.join(
  REPO_ROOT, 'dsh-desktop', 'vendor', 'dsh-kernel',
  `deepseek-ai-dsh-llm-${kernel.packageVersion}.tgz`,
);

/** 把 vendored dsh-llm tarball 解到一次性目录，返回 lib/index.js 绝对路径。 */
function extractPristineIndex() {
  assert.ok(fs.existsSync(VENDOR_TARBALL), '缺 vendored dsh-llm tarball: ' + VENDOR_TARBALL);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-chimg-pristine-'));
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
  // win32 显式用系统自带 bsdtar（Git Bash 的 GNU tar 会把 "C:\" 当远程主机）。
  const tarBin = process.platform === 'win32'
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')
    : 'tar';
  const res = spawnSync(tarBin, ['-xzf', VENDOR_TARBALL, '-C', dir], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, 'tar 解包失败: ' + (res.stderr || ''));
  return path.join(dir, 'package', 'lib', 'index.js');
}

const nodeCheck = (src) => {
  const f = path.join(os.tmpdir(), 'chimg-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.mjs');
  fs.writeFileSync(f, src, 'utf8');
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); return true; } catch { return false; }
  finally { fs.rmSync(f, { force: true }); }
};

test('1-4. content-has-image-guard 命中 vendored alpha.5 pristine → changed + 语义 + node --check + 幂等', () => {
  const file = extractPristineIndex();
  const pristine = fs.readFileSync(file, 'utf8');
  const out = transformContentHasImageGuard(pristine, file);
  assert.equal(out.status, 'changed', 'pristine alpha.5 应 changed（锚点若漂移即回归）');
  assert.equal(typeof out.src, 'string');

  // 函数头守卫在位；原 return 行保留（仅前置守卫，不改判定语义）。
  assert.match(out.src, /function contentHasImage\(content\) \{\n\tif \(!Array\.isArray\(content\)\) return false; \/\/ [^\n]*contentHasImage non-array guard/);
  assert.match(out.src, /\treturn content\.some\(\(block\) => block\.type === "image" \|\| block\.type === "tool-result" && contentHasImage\(block\.content\)\);/);

  // marker 在位（already 判定源）
  assert.ok(out.src.includes(MARKER), '产物应含 CONTENT_HAS_IMAGE_GUARD_MARKER');

  // node --check 产物（保持可解析）
  assert.ok(nodeCheck(out.src), 'changed 产物必须 node --check 通过');

  // 幂等：二遍 already
  assert.equal(transformContentHasImageGuard(out.src, file).status, 'already', '二次应用应 already');
});

test('5. 行为：守卫后 contentHasImage 对 undefined / 嵌套 tool-result.content undefined 均不裸抛', () => {
  // 从 changed 产物里抠出 contentHasImage 函数体，在 vm 里实跑（真语义验证，非字符串断言）。
  const file = extractPristineIndex();
  const patched = transformContentHasImageGuard(fs.readFileSync(file, 'utf8'), file).src;
  const start = patched.indexOf('function contentHasImage(content) {');
  assert.ok(start >= 0, '产物应含 contentHasImage');
  // 取到函数闭合（到下一个 \n} 行）。
  const end = patched.indexOf('\n}', start);
  const fnSrc = patched.slice(start, end + 2);
  // 以脚本完成值取回函数（避免向 sandbox 塞 globalThis 遮蔽真全局）。
  const ch = vm.runInNewContext(fnSrc + '\ncontentHasImage;', {});
  assert.equal(typeof ch, 'function');
  // 顶层 undefined → false（旧实现此处抛 reading 'some'）。
  assert.equal(ch(undefined), false, 'content undefined → false，绝不裸抛');
  assert.equal(ch(null), false);
  // 正常数组路径判定不变。
  assert.equal(ch([{ type: 'text', text: 'x' }]), false);
  assert.equal(ch([{ type: 'image' }]), true);
  // tool-result 递归：content undefined → 递归守卫返回 false，不崩。
  assert.equal(ch([{ type: 'tool-result', content: undefined }]), false);
  // tool-result 递归含图片 → true。
  assert.equal(ch([{ type: 'tool-result', content: [{ type: 'image' }] }]), true);
});

test('6. 不误伤：锚点缺失（版本漂移）→ anchor-missing（非静默错配）', () => {
  const DRIFTED = [
    'function contentHasImage(content) {',
    '\treturn content.every((block) => block.type !== "image");', // 上游改写，锚点消失
    '}',
  ].join('\n');
  assert.equal(transformContentHasImageGuard(DRIFTED, 'drifted.js').status, 'anchor-missing');
});

test('7. registry 装配：pkgRel/transform/marker 同源、cli:false 不进 CLI 清单', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'content-has-image-guard');
  assert.ok(spec, 'content-has-image-guard 应登记');
  assert.equal(spec.kind, 'file');
  assert.equal(spec.group, 'runtime');
  assert.equal(spec.layout, 'runtime-local');
  assert.equal(spec.wslLayout, 'wsl', 'runtime-local 的 wslLayout 应为 wsl');
  assert.equal(spec.order, 271);
  assert.equal(spec.failPolicy, 'warn');
  assert.equal(spec.cli, false);
  assert.equal(spec.pkgRel, LLM_PKG_REL, 'pkgRel 应为 dsh-llm/lib/index.js');
  assert.equal(spec.transform, transformContentHasImageGuard, 'transform 应与 patch-adapters 导出同源');
  assert.equal(spec.marker, MARKER, 'marker 应为共享常量 CONTENT_HAS_IMAGE_GUARD_MARKER');
  assert.ok(!getSpecsByCli().some((s) => s.id === 'content-has-image-guard'), 'cli:false 补丁不得进 CLI 清单');
});
