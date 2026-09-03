'use strict';

// image-send-fix 补丁单元测试（node --test）。
//
// 0.1.2-alpha.5 重锚 + 重新登记：内核 0.1.2-alpha.1（b5d5c4a5「退役已原生化的
// 补丁」）把 image-send-fix 连同 vision-key-fix / vision-toggle-gate 从注册表
// 摘除，但 alpha 世代内核并未原生内置识图转述（describeImagesWithVision 零命中
// node_modules）——文本模型收到图片的「VLM 转述成文字再发」兜底就此失效（故障②），
// 且 alpha.5 重写 SessionCommandController.prompt 后旧锚点全部失配。同一条
// transform 另把 :745 入口改为 request.content ?? []（纵深防御：上游同文件
// imageBlockIn 已守卫 !Array.isArray 而此处漏防；取证已推翻「该句即用户故障①」
// ——typert strict codec 令 content 必填，且准入失败只弹 toast 而非「本轮运行失败」，
// 详见 patch-adapters 注释）。
//
// 覆盖：
//   1. 锚点命中 pristine 源（vendored alpha.5 tarball 的 lib/index.js）→ changed；
//   2. transform 产物 node --check 可解析（注入体保持语法完整）；
//   3. 幂等（二遍 already）；
//   4. 语义：入口 content ?? [] 守卫、门槛改调 describeImagesWithVision、
//      dshVisionDisabled 回落 MODEL_DOES_NOT_SUPPORT_IMAGES、转述失败给
//      IMAGE_DESCRIPTION_FAILED、admit 走 admittedContent、helper 已插入、marker 在位；
//   5. 纵深防御行为：守卫后的入口表达式经 vm 执行，content undefined 不再裸抛；
//   6. 不误伤旧内核：alpha.1 旧形态（content.some / modelInfo / return err(request,）
//      → anchor-missing（绝不静默错配）；
//   7. registry 装配（pkgRel=SESSION_CTRL_INDEX_PKG_REL / transform / marker 同源 /
//      cli:false 不进 CLI 清单）。

const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync, execFileSync } = require('node:child_process');

const { transformImageSendFix, markers } = require('../lib/patch-adapters');
const { PATCH_SPECS, getSpecsByCli } = require('../lib/patch-registry');
const { SESSION_CTRL_INDEX_PKG_REL } = require('../lib/patch-target-resolver');
const { kernel } = require('../compat/kernel-pin.json');

const MARKER = markers.IMAGE_SEND_MARKER;
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const VENDOR_TARBALL = path.join(
  REPO_ROOT, 'dsh-desktop', 'vendor', 'dsh-kernel',
  `deepseek-ai-dsh-api-session-controller-${kernel.packageVersion}.tgz`,
);

/** 把 vendored tarball 解到一次性目录，返回 lib/index.js 绝对路径。 */
function extractPristineIndex() {
  assert.ok(fs.existsSync(VENDOR_TARBALL), '缺 vendored session-controller tarball: ' + VENDOR_TARBALL);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-imgsend-pristine-'));
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
  const f = path.join(os.tmpdir(), 'imgsend-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.mjs');
  fs.writeFileSync(f, src, 'utf8');
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); return true; } catch { return false; }
  finally { fs.rmSync(f, { force: true }); }
};

test('1-4. image-send-fix 命中 vendored alpha.5 pristine → changed + 语义齐备 + node --check + 幂等', () => {
  const file = extractPristineIndex();
  const pristine = fs.readFileSync(file, 'utf8');
  const out = transformImageSendFix(pristine, file);
  assert.equal(out.status, 'changed', 'pristine alpha.5 应 changed（锚点若漂移即回归）');
  assert.equal(typeof out.src, 'string');

  // 故障①：入口 content ?? [] 守卫 + hasImage 走 promptContent，裸 request.content.some 消除
  assert.match(out.src, /const promptContent = request\.content \?\? \[\];/);
  assert.match(out.src, /const hasImage = promptContent\.some\(\(part\) => part\.type === "image"\);/);
  assert.ok(!/const hasImage = request\.content\.some/.test(out.src), '裸 request.content.some 必须消除');

  // 故障②：门槛改调 VLM 转述；关闭回落上游拒绝；失败给可操作指引；准入用 admittedContent
  assert.match(out.src, /admittedContent = await describeImagesWithVision\(this\.ctx, promptContent\);/);
  assert.match(out.src, /visionError\.dshVisionDisabled === true/);
  assert.match(out.src, /MODEL_DOES_NOT_SUPPORT_IMAGES/);
  assert.match(out.src, /IMAGE_DESCRIPTION_FAILED/);
  assert.match(out.src, /admitPromptContent\(this\.ctx\.attachments, admittedContent\)/);
  assert.match(out.src, /async function describeImagesWithVision\(ctx, content\) \{/);

  // marker 在位（already 判定源）
  assert.ok(out.src.includes(MARKER), '产物应含 IMAGE_SEND_MARKER');

  // node --check 产物（保持可解析）
  assert.ok(nodeCheck(out.src), 'changed 产物必须 node --check 通过');

  // 幂等：二遍 already
  assert.equal(transformImageSendFix(out.src, file).status, 'already', '二次应用应 already');
});

test('5. 故障①行为：入口表达式对 content undefined 不再裸抛（vm 执行守卫后语义）', () => {
  // 守卫后 hasImage 计算式：content undefined → promptContent=[] → some=false，不抛 TypeError。
  const sb = { request: {} };
  vm.runInNewContext(
    'const promptContent = request.content ?? []; globalThis.__hasImage = promptContent.some((p) => p.type === "image");',
    sb,
  );
  assert.equal(sb.__hasImage, false, 'content undefined → hasImage false，绝不裸抛');

  // 含图片 → hasImage true（守卫不改变正常路径判定）
  const sb2 = { request: { content: [{ type: 'text' }, { type: 'image' }] } };
  vm.runInNewContext(
    'const promptContent = request.content ?? []; globalThis.__hasImage = promptContent.some((p) => p.type === "image");',
    sb2,
  );
  assert.equal(sb2.__hasImage, true);
});

test('6. 不误伤旧内核：alpha.1 旧形态锚点 → anchor-missing（非静默错配）', () => {
  // 旧形态：hasImage 用 content（非 request.content）、门槛用 modelInfo + return err(request,、
  // 准入用 durablePromptContent(ctx, content)。新 transform 不得在其上产出 changed。
  const OLD_SHAPE_SRC = [
    'function routeServed(ctx, provider) {',
    '\treturn true;',
    '}',
    'class C {',
    '\tasync prompt(request) {',
    '\t\tconst content = request.content;',
    '\t\tconst hasImage = content.some((part) => part.type === "image");',
    '\t\tif (modelInfo.inputModalities !== void 0 && !modelInfo.inputModalities.includes("image")) return err(request, {',
    '\t\t\tcode: "attachment-error",',
    '\t\t});',
    '\t\tconst message = { content: await durablePromptContent(ctx, content) };',
    '\t}',
    '}',
  ].join('\n');
  const out = transformImageSendFix(OLD_SHAPE_SRC, 'old.js');
  assert.equal(out.status, 'anchor-missing', '旧 alpha.1 形态必须 anchor-missing（锚点已换代）');
});

test('7. registry 装配：pkgRel/transform/marker 同源、cli:false 不进 CLI 清单', () => {
  const spec = PATCH_SPECS.find((s) => s.id === 'image-send-fix');
  assert.ok(spec, 'image-send-fix 应登记');
  assert.equal(spec.kind, 'file');
  assert.equal(spec.group, 'runtime');
  assert.equal(spec.layout, 'runtime-local');
  assert.equal(spec.wslLayout, 'wsl', 'runtime-local 的 wslLayout 应为 wsl');
  assert.equal(spec.order, 80);
  assert.equal(spec.failPolicy, 'warn');
  assert.equal(spec.cli, false, 'cli:false（对齐 agent-preset-fallback 先例）');
  assert.equal(spec.pkgRel, SESSION_CTRL_INDEX_PKG_REL, 'pkgRel 应为 session-controller/lib/index.js');
  assert.equal(spec.transform, transformImageSendFix, 'transform 应与 patch-adapters 导出同源');
  assert.equal(spec.marker, MARKER, 'marker 应为共享常量 IMAGE_SEND_MARKER');
  assert.ok(!getSpecsByCli().some((s) => s.id === 'image-send-fix'), 'cli:false 补丁不得进 CLI 清单');
});
