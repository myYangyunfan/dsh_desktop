'use strict';

// released-v0 历史恢复补丁单元测试（node --test）。
//
// 背景（0.6.4 在野缺陷，现场诊断：一台机器 54 个会话里 19 个读不回）：
// v0→v1 迁移用的 frozen released-v0 编解码器**冻结了第一方 v0 构建当时的载荷成员
// 清单**，清单外成员一律 SessionFormatError 整条拒载（不丢弃、不重写、不降级），
// 于是跨代留存的会话永久无法加载，界面表现为
// 「历史加载失败：... has unexpected member "tier"」。
//
// 两类实测来源（0.2.2-rc.1 起由三类收窄为两类——第三条上游自己实现了）：
//   1) compaction/summary 的 tier/kernelBlockId/parentBlockIds/directMessageIds/
//      effectiveMessageIds —— 第三方压缩插件 billion-context-dsh(acp-kernel) 的块账本；
//   2) permission/preset 的 origin:"default" —— 早期写入方的溯源信息；
//   3) ~~subagent/descriptor 的 version:2~~ —— 0.2.2-rc.1 上游把描述符版本集合扩成
//      SUBAGENT_DESCRIPTOR_VERSIONS = [1,2,3]，v0 分支不再只认 3，本补丁的「盖章为 3」
//      一条腿随之退役（详见下方两条断言：锚点只两处、detail 只点名两处）。
//
// 本补丁只放宽「准入清单」，并且**保留成员不删**（剥掉会丢插件语义）。
// 未知垃圾成员、必填缺失、类型/形状校验一律照拒 —— 由反向控制组钉住。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DSH = path.resolve(__dirname, '..', '..');
const {
  transformReleasedV0KeysTolerance,
  RELEASED_V0_HISTORY_MARKER,
} = require('../lib/runtime-patches');
const { SESSION_FORMAT_V0_TO_V1_PKG_REL } = require('../lib/patch-target-resolver');
const markers = require('../lib/patch-adapters').markers;

const TARGET = path.join(DSH, 'node_modules', '@deepseek-ai', SESSION_FORMAT_V0_TO_V1_PKG_REL);
const KERNEL_ROOTS = [path.join(DSH, '..', '.tmp-kernel')];

/** 取 pristine（未打补丁）内核字节。 */
function pristineSource() {
  for (const root of KERNEL_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const consumer of fs.readdirSync(root).filter((n) => n.startsWith('.consumer-')).sort().reverse()) {
      const p = path.join(root, consumer, 'node_modules', '@deepseek-ai', SESSION_FORMAT_V0_TO_V1_PKG_REL);
      if (fs.existsSync(p)) return { file: p, src: fs.readFileSync(p, 'utf8') };
    }
  }
  return null;
}

test('marker 单一数据源：runtime-patches 与 adapters.markers 同一实例', () => {
  assert.equal(markers.RELEASED_V0_HISTORY_MARKER, RELEASED_V0_HISTORY_MARKER);
});

test('锚点命中 pristine → changed，两处齐备且成员是「保留」而非「剥离」', () => {
  const p = pristineSource();
  assert.ok(p, '找不到 pristine v0→v1 内核源（先跑 scripts/install-pristine-kernel.mjs）');
  assert.ok(!p.src.includes(RELEASED_V0_HISTORY_MARKER), 'pristine 基线不得已带 marker');
  const r = transformReleasedV0KeysTolerance(p.src, p.file);
  assert.equal(r.status, 'changed');
  const out = r.src;
  // 两处 marker 注释（1/2、2/2）——descriptor 腿随 0.2.2-rc.1 上游自实现退役。
  assert.equal(out.split(RELEASED_V0_HISTORY_MARKER).length - 1, 2, '两处改动都要带 marker 注释');
  for (const f of ['tier', 'kernelBlockId', 'parentBlockIds', 'directMessageIds', 'effectiveMessageIds']) {
    assert.ok(out.includes('"' + f + '"'), 'compaction/summary 准入应含块账本字段 ' + f);
  }
  assert.ok(/"permission\/preset": disposition\(\["preset"\], \[\s*"origin"/.test(out),
    'permission/preset 准入应含 origin');
  // 反证（退役腿不得复活）：不得再注入描述符盖章逻辑。
  assert.ok(!out.includes('if (version === 0 && descriptorVersion === 2) data["version"] = 3;'),
    '描述符盖章腿已退役（上游 SUBAGENT_DESCRIPTOR_VERSIONS = [1,2,3]），不得重新注入');
  // 关键反向锁：不得引入任何删除成员的行为（剥离会丢第三方插件语义）。
  assert.ok(!/delete record\[key\]/.test(out), '不得剥离未知成员（会丢 billion-context-dsh 的块账本）');
  // 原有拒载能力必须原样保留。
  assert.ok(out.includes('has unexpected member'), '未知垃圾成员的拒载校验必须保留');
  assert.ok(out.includes('lacks required member'), '必填成员缺失的拒载校验必须保留');
});

test('幂等：二次 already；无关源码 anchor-missing 且 detail 不含糊', () => {
  const p = pristineSource();
  const once = transformReleasedV0KeysTolerance(p.src, p.file);
  assert.equal(transformReleasedV0KeysTolerance(once.src, p.file).status, 'already');
  const none = transformReleasedV0KeysTolerance('function unrelated() {}', 'x.js');
  assert.equal(none.status, 'anchor-missing');
  // 两处锚点全缺时 detail 必须逐处点名（换代时能直接看出是哪一处上游改了）。
  for (const w of ['compaction/summary', 'permission/preset']) {
    assert.ok(none.detail.includes(w), 'anchor-missing detail 应点名缺失锚：' + w);
  }
  // 反证：已退役的 descriptor 腿不得再出现在 detail 里（否则说明锚点表没随退役收敛）。
  assert.ok(!none.detail.includes('subagent/descriptor'), 'descriptor 腿已退役，detail 不应再点名它');
});

test('部分锚点缺失时整补丁不落地（避免半投导致准入与校验不一致）', () => {
  const p = pristineSource();
  const partial = p.src.replace('\t"permission/preset": disposition(["preset"]),', '\t"permission/preset": disposition(["preset"], ["origin"]),');
  const r = transformReleasedV0KeysTolerance(partial, p.file);
  assert.equal(r.status, 'anchor-missing', '缺任一处锚点就整体不落地');
  assert.ok(!r.src, 'anchor-missing 不得返回改写后的源码');
});

test('产物语法合法（node --check）', () => {
  const p = pristineSource();
  const out = transformReleasedV0KeysTolerance(p.src, p.file).src;
  const tmp = path.join(DSH, '.tmp-released-v0-check.mjs');
  fs.writeFileSync(tmp, out, 'utf8');
  try {
    const { spawnSync } = require('node:child_process');
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, '产物 node --check 失败：' + (r.stderr || '').slice(0, 400));
  } finally {
    fs.rmSync(tmp, { force: true });
  }
});

// ---- 功能级：直接跑打过补丁的真实校验器 -------------------------------------
function summaryEvent(extra) {
  return {
    type: 'compaction/summary', seq: 20, time: 1,
    data: {
      compactionId: 'c-1',
      summary: [{ type: 'text', text: 's' }],
      shadowedRange: { start: 3, end: 5 },
      shadowedSeqs: [3, 4, 5],
      shadowedTokenCount: 100,
      provider: 'deepseek',
      model: 'dsh-pro',
      ...extra,
    },
  };
}

let mod = null;
async function patched() {
  assert.ok(fs.existsSync(TARGET), '靶文件缺失：' + TARGET);
  assert.ok(fs.readFileSync(TARGET, 'utf8').includes(RELEASED_V0_HISTORY_MARKER),
    'dev 靶未收口本补丁（跑 node scripts/patch-deps.js）');
  if (!mod) mod = await import(pathToFileURL(TARGET).href);
  return mod;
}

test('功能：带块账本字段的老 v0 compaction/summary 可加载，且字段原样保留', async () => {
  const m = await patched();
  const ledger = {
    tier: 'detail', kernelBlockId: 'k-1', parentBlockIds: ['p-1'],
    directMessageIds: ['d-1'], effectiveMessageIds: ['e-1'],
  };
  const ev = summaryEvent(ledger);
  m.assertReleasedEventPayload(ev, 0);
  for (const [k, v] of Object.entries(ledger)) {
    assert.deepEqual(ev.data[k], v, '块账本字段 ' + k + ' 必须原样保留（插件语义依赖它）');
  }
});

test('功能：permission/preset 带 origin 可加载且 origin 保留', async () => {
  const m = await patched();
  const ev = { type: 'permission/preset', seq: 4, time: 1, data: { preset: 'auto-approve', origin: 'default' } };
  m.assertReleasedEventPayload(ev, 0);
  assert.equal(ev.data.origin, 'default', 'origin 属溯源信息，必须保留');
});

test('功能：subagent/descriptor version:2 由上游原样接受（本补丁不再盖章为 3）', async () => {
  const m = await patched();
  const ev = { type: 'subagent/descriptor', seq: 6, time: 1, data: { mode: 'one-shot', version: 2, provider: 'deepseek' } };
  m.assertReleasedEventPayload(ev, 0);
  // 0.2.2-rc.1：SUBAGENT_DESCRIPTOR_VERSIONS = [1,2,3]，v2 原生合法，不再需要我们的盖章腿。
  // 这条锁住「上游确实自己做到了」——若哪天又只认 3，这里立刻红（而不是被静默打回原形）。
  assert.equal(ev.data.version, 2, 'v2 应原样保留（上游已接受 [1,2,3]）');
  // 形状不合法仍要照拒（准入放宽不等于不校验）。
  const bad = { type: 'subagent/descriptor', seq: 7, time: 1, data: { mode: 'one-shot', version: 2, provider: 42 } };
  assert.throws(() => m.assertReleasedEventPayload(bad, 0), /provider/);
});

test('功能反向控制：未知垃圾成员、未知描述符版本、必填缺失一律照拒', async () => {
  const m = await patched();
  const junk = summaryEvent({ totallyUnknownField: 1 });
  assert.throws(() => m.assertReleasedEventPayload(junk, 0), /has unexpected member/,
    '准入是白名单式扩展，不是「任意未知成员都放行」');
  const v9 = { type: 'subagent/descriptor', seq: 8, time: 1, data: { mode: 'one-shot', version: 9, provider: 'deepseek' } };
  assert.throws(() => m.assertReleasedEventPayload(v9, 0), /unsupported descriptor version/,
    '非 2 的未知描述符版本仍须照拒');
  const missing = summaryEvent({});
  delete missing.data.model;
  assert.throws(() => m.assertReleasedEventPayload(missing, 0), /lacks required member/);
});
