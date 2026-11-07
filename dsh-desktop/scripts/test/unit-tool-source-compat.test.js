'use strict';

// unit-tool-source-compat.test.js — 空 tool-call 容错补丁单测。
// 覆盖：读端/写端变换幂等与锚点命中；打补丁后的 dsh-session 对空 callId 的
// tool/result 就地修复放行、真损坏（双非空不一致）仍拒绝、正常事件不受影响。

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
  SESSION_VALIDATION_REL,
  TOOL_SOURCE_MARKER,
  EMPTY_TOOLCALL_MARKER,
  transformToolSourceTolerance,
  transformEmptyToolCallGuard,
  patchToolSourceCompat,
  resolveEmptyToolCallTargets,
} = require('../lib/tool-source-patch');

const repoRoot = path.resolve(__dirname, '..', '..');
const nmRoot = path.join(repoRoot, 'node_modules');
const sessionTarget = path.join(nmRoot, '@deepseek-ai', SESSION_VALIDATION_REL);

/** 写端落点：0.2.2-rc.1 起从 dsh-agent-loop/lib/index.js 迁到 dsh-tools 的批入口。
 *  dsh-tools 现为 index.js + shared-<hash>.js + pipeline.js 多文件，哈希名逐版变，
 *  故按锚点（或已注入的 marker）探测，绝不写死文件名；命中必须唯一且是 pipeline.js
 *  ——若哪天搬到别处，这条会先红，而不是让下面的断言退化成读一个没有锚点的文件。 */
function writeTarget() {
  const hits = resolveEmptyToolCallTargets(nmRoot);
  assert.equal(hits.length, 1, '写端锚点应唯一命中 dsh-tools/lib 下一个文件，实得: ' + JSON.stringify(hits));
  assert.equal(path.basename(hits[0]), 'pipeline.js', '写端落点应为 dsh-tools/lib/pipeline.js，实得: ' + hits[0]);
  return hits[0];
}

function badToolResultEvent(seq) {
  // 事故形态：tool/result 的 source.callId 与消息级 toolCallId 都是空串。
  return {
    type: 'tool/result',
    seq,
    time: 1,
    // rc.1 新增必填：surface-eligible 事件必须带 surfaceOp（'append' 或
    // {op:'replace',startSeq,endSeq}），否则 adoptSessionEvent 在
    // validateSurfaceMetadata 就抛 "requires a surfaceOp marker"，到不了被测的
    // callId 容错逻辑。真实 rc.1 会话里新追加的工具结果即 append 语义。
    surfaceOp: 'append',
    data: {
      turn: 0,
      step: 1,
      message: {
        id: 'msg-' + seq,
        // rc.2 起 assertMessageEventShape 按 MESSAGE_ROLE_BY_TYPE 逐类型校验
        // role，tool/result 必须是 "tool"（旧夹具写 user，事件在 callId 容错
        // 之前就抛 "message must have role \"tool\""）。
        role: 'tool',
        source: { kind: 'tool', callId: '' },
        // rc.2 把 callId 的镜像位从 content[0] 块上移到消息记录自身
        // （message.toolCallId）；校验与就地修复都按新位置走，content 里
        // 的 toolCallId 只是块级原文，不再是被测面。
        toolCallId: '',
        content: [{ type: 'tool-result', toolCallId: '', content: [{ type: 'text', text: 'ok' }] }],
      },
    },
  };
}

test('读端变换：真实 vendored 文件锚点命中、幂等', () => {
  const src = fs.readFileSync(sessionTarget, 'utf8');
  const r1 = transformToolSourceTolerance(src, sessionTarget);
  assert.ok(r1.status === 'changed' || r1.status === 'already', '锚点应命中: ' + r1.status);
  if (r1.status === 'changed') {
    const r2 = transformToolSourceTolerance(r1.src, sessionTarget);
    assert.equal(r2.status, 'already');
  }
});

test('写端变换：真实 dev 树 dsh-tools/lib/pipeline.js 锚点命中、幂等', () => {
  const file = writeTarget();
  const src = fs.readFileSync(file, 'utf8');
  const r1 = transformEmptyToolCallGuard(src, file);
  assert.ok(r1.status === 'changed' || r1.status === 'already', '锚点应命中: ' + r1.status);
  if (r1.status === 'changed') {
    const r2 = transformEmptyToolCallGuard(r1.src, file);
    assert.equal(r2.status, 'already');
  }
});

test('patchToolSourceCompat 应用到 dev node_modules 且幂等', () => {
  patchToolSourceCompat(nmRoot);
  const s1 = fs.readFileSync(sessionTarget, 'utf8');
  const s2 = fs.readFileSync(writeTarget(), 'utf8');
  assert.match(s1, new RegExp(TOOL_SOURCE_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(s2, new RegExp(EMPTY_TOOLCALL_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // 二次应用返回 0 变更。
  assert.equal(patchToolSourceCompat(nmRoot), 0);
});

test('打补丁后的 dsh-session：空 callId 的 tool/result 就地修复放行', async () => {
  patchToolSourceCompat(nmRoot);
  const mod = await import(`${pathToFileURL(sessionTarget).href}?tool-source-tolerance`);
  const ev = badToolResultEvent(450516);
  const adopted = mod.adoptSessionEvent(ev);
  const message = adopted.data.message;
  assert.equal(message.source.kind, 'tool');
  assert.equal(message.source.callId, 'recovered-seq-450516');
  // rc.2 的镜像位在消息记录自身——修复必须把两侧对齐，否则下一轮校验又抛不一致。
  assert.equal(message.toolCallId, 'recovered-seq-450516');
});

test('打补丁后的 dsh-session：source.callId 缺失（非空串形态）同样修复', async () => {
  patchToolSourceCompat(nmRoot);
  const mod = await import(`${pathToFileURL(sessionTarget).href}?tool-source-tolerance`);
  const ev = badToolResultEvent(7);
  delete ev.data.message.source.callId;
  ev.data.message.toolCallId = 'real-call-1';
  // 一侧为空一侧非空 → 以非空侧为准。
  const adopted = mod.adoptSessionEvent(ev);
  assert.equal(adopted.data.message.source.callId, 'real-call-1');
});

test('打补丁后的 dsh-session：双非空不一致仍是硬损坏，继续拒绝', async () => {
  patchToolSourceCompat(nmRoot);
  const mod = await import(`${pathToFileURL(sessionTarget).href}?tool-source-tolerance`);
  const ev = badToolResultEvent(9);
  ev.data.message.source.callId = 'call-a';
  ev.data.message.toolCallId = 'call-b';
  assert.throws(() => mod.adoptSessionEvent(ev), /mismatched tool call ids/);
});

test('打补丁后的 dsh-session：正常的 tool/result 事件不受影响', async () => {
  patchToolSourceCompat(nmRoot);
  const mod = await import(`${pathToFileURL(sessionTarget).href}?tool-source-tolerance`);
  const ev = badToolResultEvent(11);
  ev.data.message.source.callId = 'call-ok';
  ev.data.message.toolCallId = 'call-ok';
  const adopted = mod.adoptSessionEvent(ev);
  assert.equal(adopted.data.message.source.callId, 'call-ok');
});
