'use strict';

// ---------------------------------------------------------------------------
// TA6 元测试 2：transform 契约三态语义统一（37 个 file transform 逐个实跑）。
//
// 对每个 transform 用三种输入各跑一遍：
//   1) pristine 源（pristine-kernel-roots 给出的未补丁内核闭包树，历史上是
//      .tmp-rc2-stage、现为 .tmp-kernel/.consumer-*/node_modules；重定位补丁回退到
//      .tmp-kernel 的构建产物）→ status ∈ {changed, already, anchor-missing}；
//        - changed：必须携带 string src 且与输入不同；
//        - already：不得携带 src；
//        - anchor-missing（自然退役）：detail 非空且含文件名；此时用
//          dsh-desktop/node_modules 真实已应用树补验 already 态；
//   2) 已应用源（自产：对输入跑一遍的产物；或真实已应用树的文件文本）
//      → 必须 already（幂等）；
//   3) 毒化源（把 changed 的锚点区段从输入中挖掉；无法定位区段或本就
//      anchor-missing 的用空白源兜底）→ 必须 anchor-missing，detail 非空
//      且含传入的文件名，不得携带 src、不得 throw；
//   3b) marker-only 输入（仅含 marker 注释）→ 不得 changed（marker 短路是
//      already；双信号 marker 需第二信号，缺信号回落 anchor-missing 也是
//      合法契约）。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PATCH_SPECS } = require('../lib/patch-registry');
// pristine 源的定位统一收口在 pristine-kernel-roots：过去这里把单一
// .tmp-rc2-stage（一次性 npm 装配产物）硬编码成唯一 pristine 根，该树被清理后
// 本文件整片红；现在按「闭包树候选根 → 内核构建产物 → 桌面壳独有依赖」逐级回退。
const { pristineRoots, findPristineTarget, describePristineRoots } = require('../lib/pristine-kernel-roots');

const PATCHED_DESKTOP = path.join(__dirname, '..', '..', 'node_modules'); // postinstall 后的真实已应用树
const POISON_LABEL = 'TA6-POISON-TARGET.js';

/**
 * 定位 spec 的目标文件。
 * @param {object} spec registry 条目
 * @param {string} [root] 显式根（如真实已应用树 dsh-desktop/node_modules）；
 *   省略 = 跨全部 pristine 候选源搜索。
 */
function targetFile(spec, root) {
  if (root === undefined) return findPristineTarget(spec);
  const rels = spec.pkgRels && spec.pkgRels.length ? spec.pkgRels : [spec.pkgRel];
  if (spec.layout === 'profile-boot-dirs') {
    const lib = path.join(root, '@deepseek-ai', 'dsh', 'lib');
    let names = [];
    try { names = fs.readdirSync(lib); } catch { return null; }
    const hit = names.filter((f) => /^profile-boot-.*\.js$/.test(f)).sort();
    return hit.length ? path.join(lib, hit[0]) : null;
  }
  for (const rel of rels) {
    const p = path.join(root, '@deepseek-ai', rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** pristine 输入：跨全部 pristine 候选源定位（见 pristine-kernel-roots）。 */
function pristineInput(spec) {
  const file = targetFile(spec);
  assert.ok(file, `${spec.id} 在 pristine 树中找不到目标文件（可用根：${describePristineRoots()}）`);
  const src = fs.readFileSync(file, 'utf8');
  return { file, src };
}

/** 从输入与 patched 的公共前后缀定位锚点区段，挖掉它。 */
function excavateAnchor(input, patched) {
  if (patched === input) return null;
  let pre = 0;
  const minLen = Math.min(input.length, patched.length);
  while (pre < minLen && input[pre] === patched[pre]) pre += 1;
  let suf = 0;
  while (suf < minLen - pre && input[input.length - 1 - suf] === patched[patched.length - 1 - suf]) suf += 1;
  const core = input.slice(pre, input.length - suf);
  if (core.length === 0 || core.length > input.length * 0.6) return null; // 多点注入 → 兜底
  return input.slice(0, pre) + input.slice(input.length - suf);
}

const fileSpecs = PATCH_SPECS.filter((s) => s.kind === 'file');

test('前置条件：pristine 内核树与真实已应用树均可用', () => {
  assert.ok(pristineRoots().length > 0,
    '无任何可用 pristine 根（曾经硬编码 .tmp-rc2-stage，该树被清后本文件集体假红）：' + describePristineRoots());
  assert.ok(fs.existsSync(PATCHED_DESKTOP));
});

for (const spec of fileSpecs) {
  test(`三态契约：${spec.id}`, () => {
    const { file, src: pristine } = pristineInput(spec);

    // 1) pristine（依赖链先行）：三态之一，各态契约自洽。
    const r1 = spec.transform(pristine, file);
    assert.ok(
      ['changed', 'already', 'anchor-missing'].includes(r1.status),
      `${spec.id} 对 pristine 的 status 越界：${r1.status}`,
    );
    if (r1.status === 'changed') {
      assert.equal(typeof r1.src, 'string', `${spec.id} changed 必须携带 string src`);
      assert.notEqual(r1.src, pristine, `${spec.id} changed 产物必须不同于输入`);
    } else {
      assert.equal(r1.src, undefined, `${spec.id} ${r1.status} 不得携带 src`);
    }
    if (r1.status === 'anchor-missing') {
      assert.ok(r1.detail && r1.detail.includes(path.basename(file)),
        `${spec.id} 退役态 detail 应含文件名，得 "${r1.detail}"`);
      // 退役补丁在真实已应用树上必须表现为 already（幂等语义不因退役丢失）。
      const patchedFile = targetFile(spec, PATCHED_DESKTOP);
      if (patchedFile) {
        const rp = spec.transform(fs.readFileSync(patchedFile, 'utf8'), patchedFile);
        assert.equal(rp.status, 'already', `${spec.id} 在真实已应用树应 already，得 ${rp.status}`);
      }
    }

    // 2) 已应用源（自产）：幂等 already。
    const applied = r1.status === 'changed' ? r1.src
      : r1.status === 'already' ? pristine
        : fs.readFileSync(targetFile(spec, PATCHED_DESKTOP), 'utf8');
    const r2 = spec.transform(applied, file);
    assert.equal(r2.status, 'already', `${spec.id} 已应用源应 already，得 ${r2.status}`);
    assert.equal(r2.src, undefined);

    // 3) 毒化源：锚点挖掉 → anchor-missing + detail 含文件名，绝不改写。
    const poisoned = r1.status === 'changed'
      ? (excavateAnchor(pristine, r1.src) ?? '// ta6 poisoned\n')
      : '// ta6 poisoned\n';
    const r3 = spec.transform(poisoned, POISON_LABEL);
    assert.equal(r3.status, 'anchor-missing', `${spec.id} 毒化源应 anchor-missing，得 ${r3.status}`);
    assert.ok(r3.detail && r3.detail.length > 0, `${spec.id} anchor-missing 必须携带 detail`);
    assert.ok(
      r3.detail.includes(POISON_LABEL) || r3.detail.includes(path.basename(file)),
      `${spec.id} anchor-missing detail 应含文件名，得 "${r3.detail}"`,
    );
    assert.equal(r3.src, undefined, 'anchor-missing 不得携带 src');

    // 3b) marker-only：绝不 changed。
    if (spec.marker) {
      const r4 = spec.transform(`// ${spec.marker}\n`, POISON_LABEL);
      assert.notEqual(r4.status, 'changed',
        `${spec.id} marker-only 输入必须短路（already 或双信号回落 anchor-missing）`);
    }
  });
}

// 41 = 40（旧基线）+ conversation-assembly-resilience（BUG2 会话装配「可观测化 + 自愈」：
// BoundConversation.accept 被静默吞的装配抛错 → 安全重建 + 去重告警）一条 file 补丁。
test('契约面完整性：41 个 file transform 全部被本文件覆盖', () => {
  assert.equal(fileSpecs.length, 41);
});
