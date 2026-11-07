'use strict';

// content-has-image-guard 补丁单元测试（node --test）。
//
// v0.6.0 用户反馈「本轮运行失败 Cannot read properties of undefined (reading 'some')」。
// 真凶：dsh-llm 的 contentHasImage 是所有图片策略（capability gating / text-only
// serialization / compaction survey）共用的图片遍历，content 为非数组（undefined）时
// 裸 content.some 即抛 "Cannot read properties of undefined (reading 'some')"，
// 经 adapterStream → turn/end 冒泡成整轮失败。补丁在函数头加
// `if (!Array.isArray(content)) return false;`（非数组天然不含图片）。
// 0.2.0-rc.2：上游删了 tool-result 递归，函数体只剩一层 block 扫描——本补丁只加
// 前置守卫，判定面随上游，不补回递归。
//
// 覆盖：
//   1. 锚点命中 pristine 源（vendored kernel-pin 版本 dsh-llm tarball 的 lib/index.js）→ changed；
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

const { transformContentHasImageGuard, TOOLS_IMAGE_RESULT_OLD, TOOLS_IMAGE_RESULT_NEW, markers } = require('../lib/patch-adapters');
const { PATCH_SPECS, getSpecsByCli } = require('../lib/patch-registry');
const { LLM_PKG_REL, PTC_REL } = require('../lib/patch-target-resolver');
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

test('1-4. content-has-image-guard 命中 vendored rc.2 pristine → changed + 语义 + node --check + 幂等', () => {
  const file = extractPristineIndex();
  const pristine = fs.readFileSync(file, 'utf8');
  const out = transformContentHasImageGuard(pristine, file);
  assert.equal(out.status, 'changed', 'pristine rc.2 应 changed（锚点若漂移即回归）');
  assert.equal(typeof out.src, 'string');

  // 函数头守卫在位；原 return 行保留（仅前置守卫，不改判定语义）。
  // 0.2.0-rc.2：上游把 tool-result 递归删了，return 行只剩一层 block 扫描。
  assert.match(out.src, /function contentHasImage\(content\) \{\n\tif \(!Array\.isArray\(content\)\) return false; \/\/ [^\n]*contentHasImage non-array guard/);
  assert.match(out.src, /\treturn content\.some\(\(block\) => block\.type === "image"\);/);

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
  // tool-result 递归：0.2.0-rc.2 上游已删掉递归（只扫一层 block）。本补丁的职责
  // 仍是「非数组不裸抛」，这里锁住当前语义而不是旧递归。
  assert.equal(ch([{ type: 'tool-result', content: undefined }]), false, 'tool-result content undefined → false，绝不裸抛');
  assert.equal(ch([{ type: 'tool-result', content: [{ type: 'image' }] }]), false, 'rc.2 不再递归 tool-result.content');
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
  assert.ok(Array.isArray(spec.pkgRels), 'content-has-image-guard 现应为多靶 pkgRels');
  assert.ok(spec.pkgRels.includes(LLM_PKG_REL), 'pkgRels 应含 dsh-llm/lib/index.js');
  assert.ok(spec.pkgRels.includes(PTC_REL), 'pkgRels 应含 dsh-tool-executor-ptc/lib/index.js（0.2.2-rc.1 起 run_code 落点）');
  assert.equal(spec.transform, transformContentHasImageGuard, 'transform 应与 patch-adapters 导出同源');
  assert.equal(spec.marker, MARKER, 'marker 应为共享常量 CONTENT_HAS_IMAGE_GUARD_MARKER');
  assert.ok(!getSpecsByCli().some((s) => s.id === 'content-has-image-guard'), 'cli:false 补丁不得进 CLI 清单');
});

test('8. 多靶：dsh-tool-executor-ptc result.content.some 守卫（真实 dev 文件 + 幂等 + 精准）', () => {
  // 0.2.2-rc.1：run_code 的图片 result finalize 已从 dsh-tools/lib/index.js 拆到独立包
  // @deepseek-ai/dsh-tool-executor-ptc，且缩进从 7 tab 变成 8 tab（工厂层多一级）。
  // 既不能写死文件路径（旧的 DSHTOOLS_REL 已无该行），也不能按 7-tab 常量还原——
  // 常量还原打不中 8-tab 注入体，「起点仍是补丁态」会让下面的 changed 断言变成假判据。
  // 所以还原走缩进无关正则。
  const file = path.join(REPO_ROOT, 'dsh-desktop', 'node_modules', '@deepseek-ai', PTC_REL);
  const patched = fs.readFileSync(file, 'utf8');
  assert.ok(patched.includes(MARKER), 'dev 树应已是补丁态（缺 marker 说明 patch-deps 未收敛）');
  const src = patched
    .replace(/^\t*\/\/ dsh-desktop fix: contentHasImage non-array guard[^\n]*\n/gm, '')
    .replace(/if \(!result\.isError && Array\.isArray\(result\.content\) && /g, 'if (!result.isError && ');
  assert.ok(src.includes('result.content.some((block) => block.type === "image")'), '起点应含裸 result.content.some 锚点');
  assert.ok(!src.includes(MARKER), '还原后不得残留 marker（否则 already 分支短路，判据空转）');
  const out = transformContentHasImageGuard(src, file);
  assert.equal(out.status, 'changed', 'ptc 的 result.content.some 应可补丁');
  assert.ok(/^\t*\/\/ dsh-desktop fix: contentHasImage non-array guard/.test(out.src.split('\n').find((l) => l.includes(MARKER)) || ''), '应注入守卫注释（保留原缩进）');
  assert.ok(/Array\.isArray\(result\.content\)/.test(out.src), '守卫应含 Array.isArray(result.content)');
  assert.strictEqual(out.src.split('result.content.some((block) => block.type === "image")').length - 1, 1, '注入后只剩守卫那一处扫描');
  assert.equal(transformContentHasImageGuard(out.src, file).status, 'already', '二次应用应幂等');
});
