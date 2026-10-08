'use strict';

// ---------------------------------------------------------------------------
// TA6 元测试 2：transform 契约三态语义统一（43 个 file transform 逐个实跑）。
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
// 但「桌面壳独有依赖」回退对 @openai/codex 与 @earendil-works/pi-ai 等 registry 包
// 拿到的是 dsh-desktop/node_modules 里的已打补丁副本 → 用作 pristine 会假绿；对
// @deepseek-ai/cordis-plugin-loader（registry 包、非 dsh-* 族、从来未 vendored）
// 则找不到任何源 → 硬红。两者都属「靶包不在离线内核闭包」这一类前提不成立：
// 守卫按 specTargetVendored 判定，对此类 spec 显式 t.skip(reason)，并在文件末尾
// 断言该集合恰为已知 4 条，防止误扩成整体停摆。
const { pristineRoots, findPristineTarget, describePristineRoots, specTargetVendored, specVendoredSkipReason } = require('../lib/pristine-kernel-roots');

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
  // 诚实跳过（前提不成立，非静默停摆）：靶包不在 vendor/dsh-kernel 离线闭包
  // 内时，install-pristine-kernel 天然未解包 → 无 pristine 源；且 findPristineTarget
  // 的桌面壳回退会拿到 dsh-desktop/node_modules 已补丁副本（对 codex / pi-ai），
  // 用作 pristine 会假绿。二者都以 TAP 中的 SKIP 行显式命名，不静默消失。
  const skipReason = specTargetVendored(spec) ? false : specVendoredSkipReason(spec);
  test(`三态契约：${spec.id}`, { skip: skipReason }, () => {
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

// —— file 型规格数沿革（只记变化量，逐条理由见 patch-registry 与各 spec 注释）——
// 41→47（0.6.2→0.6.4 逐条新增 conversation-assembly-resilience /
//   reasoning-row-collapse-width / session-unknown-event-tolerance /
//   released-v0-history-recovery / pi-ai-responses-tool-name-sanitize /
//   pi-ai-tool-name-wire / pi-ai-quota-not-retryable）。
//   其中 pi-ai 系三条里 openai-responses-shared.js 与 provider-retry.js 属宿主可选
//   依赖、不在 vendor/dsh-kernel 离线闭包 → 本文件按诚实 SKIP 处理（见下方集合），
//   真实字节三态见 scripts/test/unit-pi-ai-*.test.js；dsh-llm-pi-ai 那条属闭包，
//   走上方逐条生成的正常覆盖用例。
// 44 = 47（上一基线）− 3 条退役（0.2.0-rc.2 重靶）：loader-tree-isolation（靶
//   cordis-plugin-loader 1.0.5 原生逐条目隔离）、settings-section-guard（register
//   调用点全内核 0 命中）、fallback-heal-isolation（heal 回环原生逐名 try/catch）。
// 43 = 44 − image-send-fix（2026-10 内置伴随插件批量拆除：只为已退役的识图插件
//   存在，transform 与锚点常量同批删除）。
test('契约面完整性：43 个 file transform 全部被本文件覆盖', () => {
  assert.equal(fileSpecs.length, 43);
});

// 反「静默停摆」哨兵：诚实跳过集合必须恰为已知的 5 条非 vendored 目标——
// 若集合扩大，说明有真·内核靶意外掉出闭包（应查 patch-target-resolver / vendor / pin）；
// 若收缩，说明有人把 registry 包塞进 vendor/dsh-kernel（应显式更新此基线并复核语义）。
// 任何漂移都变红并点名，杜绝「整组 t.skip」这类把守卫价值静默吞掉的形态。
// 第 5 条来源：pi-ai-responses-tool-name-sanitize（靶 @earendil-works/pi-ai，
// 与同包 completions 补丁一样不属离线内核闭包）。
// 第 6 条来源：pi-ai-quota-not-retryable（靶 @earendil-works/pi-ai/dist/utils/
// provider-retry.js，同包第三条非闭包靶）。
// 0.1.6 迁移（2026-09-15）：loader-tree-isolation 移出——其靶 cordis-plugin-loader
// 已被上游收编进 vendor/dsh-kernel（@deepseek-ai/cordis-plugin-loader@1.0.3），
// 转入离线闭包，非闭包集合 6→5。
// 0.2.0-rc.2 重靶：loader-tree-isolation 规格整体退役（1.0.5 原生逐条目隔离），
// 集合仍为 5 条。
const EXPECTED_NON_VENDORED = [
  'codex-local-bin-fallback',   // @openai/codex — 宿主可选依赖
  'pi-ai-4xx-dump',             // @earendil-works/pi-ai — 宿主可选依赖
  'pi-ai-tool-schema-sanitize', // @earendil-works/pi-ai — 宿主可选依赖
  'pi-ai-responses-tool-name-sanitize', // @earendil-works/pi-ai — 宿主可选依赖
  'pi-ai-quota-not-retryable',  // @earendil-works/pi-ai — 宿主可选依赖
];
test('诚实跳过集合恰为已知 5 条非闭包目标（防静默停摆）', () => {
  const actual = fileSpecs.filter((s) => !specTargetVendored(s)).map((s) => s.id).sort();
  assert.deepEqual(actual, [...EXPECTED_NON_VENDORED].sort(),
    `非闭包（诚实 SKIP）集合漂移：实际=[${actual}]，基线=[${EXPECTED_NON_VENDORED}]`);
});
