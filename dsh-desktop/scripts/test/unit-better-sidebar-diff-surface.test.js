'use strict';

// ---------------------------------------------------------------------------
// unit-better-sidebar-diff-surface.test.js
//
// 0.24.1 重皮后「查看变更」面的替代机器锁。取代两份退役用例：
//   · unit-better-sidebar-editor-diff.test.js —— 锁的是手改进产物的
//     `diff-turns.ts`（splitLines / diffRows / formatHistTime / HIST_OP_LABEL /
//     DiffTurnsPanel）：编辑器右侧「按变更查看 diff」历史面板，数据源是
//     window.__dshFileChanges 全局 store；
//   · unit-file-changes-highlight.test.js —— 锁的是 `file-changes-highlight.ts`
//     桥接（CodeMirror 装饰 + 三色 class），同一个全局 store 的读侧。
//
// 为什么是「替代」而不是「删除」：上游 0.24.1 把这一整面重做成了共享 diff 栈，
// 上面那些名字在 src 与四份产物里 0 命中（实测见本文件末组反证），但能力没有丢，
// 换了实现与数据源：
//   src/client/diff/rows.ts        唯一的 diff 引擎（LCS + git unified diff 两个生产者）
//   src/client/diff/highlight.ts   行内语法着色（取代三色 class 的静态高亮）
//   src/client/changes/ops.ts      会话事件日志 → 文件操作（不再依赖外部插件发布的全局 store）
//   src/client/changes/change-tree.ts  git status 折叠成 SCM 目录树
// 接线面也换了：`builtins/tabs.tsx` 的 'git' 描述符挂 ChangesTab（Git lens + 会话 lens
// 两条镜头），'diff' 描述符挂 DiffTab，两者共用同一套 diff 组件。
//
// 三条稳定性判据（与原用例同构）：
//   ① 行为实跑**随包交付的那份字节**——从 lib/client.js 的 `//#region` 源区段里把
//      纯函数抠出来在 vm 里跑（0.24.1 的 tsconfig.build.json 只 emitDeclarationOnly，
//      不再有逐文件 lib/<name>.js 镜像，产物就是唯一事实源）；
//   ② src ↔ 产物 同源护栏——区段定界唯一 + 产物区段顶层名 ⊆ src 顶层名（产物里冒出
//      src 没有的顶层声明 = 手改进物的孤儿段），src 有而产物无的名字必须逐名解释为
//      tree-shake 或常量内联，白名单写死且当场验证折叠后的字面量在位；
//   ③ 接线锁 + 退役面反向锁（旧锚点若复活即红）。
//
// 运行：node --test scripts/test/unit-better-sidebar-diff-surface.test.js
//（纯源码/产物文本 + vm 实跑，不依赖 DOM / 内核 / 网络。）
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  PLUGIN_DIR,
  loadRegionSymbols,
  regionTopLevelNames,
  srcTopLevelNames,
} = require('./fixtures/better-sidebar-region.js');

const CHANNEL_BUNDLES = ['lib/client.js', 'lib/client-registry.js'];
const ROWS = 'src/client/diff/rows.ts';
const HIGHLIGHT = 'src/client/diff/highlight.ts';
const OPS = 'src/client/changes/ops.ts';
const CHANGE_TREE = 'src/client/changes/change-tree.ts';
const GIT_STATUS = 'src/client/ui/git-status.ts';
const TABS_SRC = path.join(PLUGIN_DIR, 'src', 'client', 'builtins', 'tabs.tsx');

/** 取一份产物里某区段的原文（只为一并交回 plain() 归一函数时复用同一入口）。 */
const engine = () => loadRegionSymbols('client.js', ROWS, [
  'diffLines', 'pairMods', 'buildDiffSegments', 'diffInline', 'coalesceInline', 'formatBytes',
  'parseUnifiedDiff', 'unifiedSegments', 'untrackedFile', 'foldRowsFromContents', 'displayPath', 'diffStats',
]);

// ===========================================================================
// ① 引擎行为：行 diff（diffLines / pairMods）
// ===========================================================================

test('diffLines：增删改三分类与行号，成对改写落 mod（先旧后新）', () => {
  const { diffLines, plain } = engine();

  // 纯追加：上下文两行 + 两条 add，add 只带新侧行号。
  const added = plain(diffLines('a\nb', 'a\nb\nc\nd'));
  assert.deepEqual(added, [
    { kind: 'context', oldLine: 1, newLine: 1, text: 'a' },
    { kind: 'context', oldLine: 2, newLine: 2, text: 'b' },
    { kind: 'add', newLine: 3, text: 'c' },
    { kind: 'add', newLine: 4, text: 'd' },
  ]);

  // 纯删除：del 只带旧侧行号。
  assert.deepEqual(plain(diffLines('a\nb\nc', 'a')).map((r) => r.kind), ['context', 'del', 'del']);

  // 中段单行改写：del/add 相邻 → pairMods 折成一对 mod，旧行在前。
  const mod = plain(diffLines('a\nold\nz', 'a\nnew\nz'));
  assert.deepEqual(mod.map((r) => r.kind), ['context', 'mod', 'mod', 'context']);
  assert.deepEqual(
    mod.filter((r) => r.kind === 'mod').map((r) => [r.text, r.oldLine, r.newLine]),
    [['old', 2, undefined], ['new', undefined, 2]],
    'mod 对：旧行带 oldLine，新行带 newLine',
  );

  // 空串是「零行」而不是「一行空文本」；两边都空 → 无行。
  assert.deepEqual(plain(diffLines('', '')), []);
  assert.deepEqual(plain(diffLines('', 'a\nb')).map((r) => r.kind), ['add', 'add']);
  assert.deepEqual(plain(diffLines('a\nb', '')).map((r) => r.kind), ['del', 'del']);
});

test('pairMods：重叠行数取 min，未配对的余量保持原类，且不改入参', () => {
  const { pairMods, plain } = engine();
  const del = (n) => ({ kind: 'del', oldLine: n, text: `d${String(n)}` });
  const add = (n) => ({ kind: 'add', newLine: n, text: `a${String(n)}` });

  // 3 del + 2 add → 前 2 对成 mod，第 3 条 del 落单。
  const three = plain(pairMods([del(1), del(2), del(3), add(1), add(2)]));
  assert.deepEqual(three.map((r) => r.kind), ['mod', 'mod', 'del', 'mod', 'mod']);

  // del 段后面没有 add 段（下一行是上下文）→ 不成对。
  assert.deepEqual(
    plain(pairMods([del(1), { kind: 'context', oldLine: 2, newLine: 1, text: 'x' }])).map((r) => r.kind),
    ['del', 'context'],
  );

  // 入参不被改写（纯函数契约：面板 useMemo 依赖引用稳定性）。
  const input = Object.freeze([del(1), add(1)]);
  const out = pairMods(input);
  assert.equal(input[0].kind, 'del', '入参首行仍是 del');
  assert.notEqual(out[0], input[0], '成对时返回新对象');
});

// ===========================================================================
// ① 引擎行为：hunk / fold 分段
// ===========================================================================

test('buildDiffSegments：默认 3 行上下文窗口，间隙够近并 hunk，够远留 fold', () => {
  const { buildDiffSegments, plain } = engine();
  const ctx = (n) => ({ kind: 'context', oldLine: n, newLine: n, text: `L${String(n)}` });
  const change = (n) => ({ kind: 'mod', oldLine: n, newLine: n, text: `X${String(n)}` });

  const rows = [];
  for (let n = 1; n <= 20; n += 1) rows.push(ctx(n));
  rows[10] = change(11);
  rows[11] = change(12);
  const segs = plain(buildDiffSegments(rows));
  // 变更在下标 10、11 → hunk 覆盖 7..14（前后各留 3 行），其余分头尾两个 fold。
  assert.deepEqual(segs.map((s) => s.kind), ['fold', 'hunk', 'fold']);
  assert.deepEqual(segs.map((s) => (s.kind === 'hunk' ? s.rows.length : s.count)), [7, 8, 5]);
  assert.deepEqual(
    { oldStart: segs[0].oldStart, oldEnd: segs[0].oldEnd, newStart: segs[0].newStart, newEnd: segs[0].newEnd },
    { oldStart: 1, oldEnd: 7, newStart: 1, newEnd: 7 },
    'fold 带自己的两侧行区间（渲染 "… n 行" 时要显示行号）',
  );

  // 间隙 7 行（= 2*context+1）仍并成一个 hunk：两处变更各留 3 行上下文正好相接，
  // 尾部剩下的 3 行上下文自成 fold。
  const merge = plain(buildDiffSegments(
    Array.from({ length: 16 }, (_v, i) => (i === 2 || i === 9 ? change(i + 1) : ctx(i + 1))),
  ));
  assert.deepEqual(merge.map((s) => s.kind), ['hunk', 'fold']);
  assert.deepEqual([merge[0].rows.length, merge[1].count], [13, 3]);

  // 间隙 8 行 → 两个 hunk；中间只夹 1 行，产物照样产出 fold（是否给展开入口是
  // 渲染侧按 MIN_FOLD 判的，分段层不做这个决定）。
  const two = plain(buildDiffSegments(
    Array.from({ length: 16 }, (_v, i) => (i === 2 || i === 10 ? change(i + 1) : ctx(i + 1))),
  ));
  assert.deepEqual(two.map((s) => s.kind), ['hunk', 'fold', 'hunk', 'fold']);
  assert.deepEqual([two[1].count, two[1].rows.length], [1, 1], '两个 hunk 之间的间隙只有 1 行');
  assert.equal(two[3].count, 2, '尾上下文收进尾 fold');

  // 全上下文（无变更）→ 整片收进一个 fold；空输入 → 空分段。
  assert.deepEqual(plain(buildDiffSegments(rows)).length, 3);
  const clean = plain(buildDiffSegments(Array.from({ length: 5 }, (_v, i) => ctx(i + 1))));
  assert.deepEqual(clean.map((s) => s.kind), ['fold']);
  assert.equal(clean[0].count, 5);
  assert.deepEqual(plain(buildDiffSegments([])), []);
});

// ===========================================================================
// ① 引擎行为：行内 diff 与字节数
// ===========================================================================

test('diffInline / coalesceInline：公共前后缀不变，只有中段标 changed', () => {
  const { diffInline, coalesceInline, plain } = engine();
  const inline = plain(diffInline('  const a = 1', '  const b = 1'));
  assert.deepEqual(inline.old.map((s) => [s.text, s.changed]), [
    ['  const ', false], ['a', true], [' = 1', false],
  ]);
  assert.deepEqual(inline.next.map((s) => [s.text, s.changed]), [
    ['  const ', false], ['b', true], [' = 1', false],
  ]);

  // 完全相同 → 没有 changed 段（不会把没改的字符也刷色）。
  const same = plain(diffInline('abc', 'abc'));
  assert.deepEqual(same.old.map((s) => [s.text, s.changed]), [['abc', false]]);

  // 合并同色相邻段：渲染按段包 span，不是按字符。
  assert.deepEqual(
    plain(coalesceInline([
      { text: 'a', changed: false }, { text: 'b', changed: false }, { text: 'c', changed: true },
    ])),
    [{ text: 'ab', changed: false }, { text: 'c', changed: true }],
  );
});

test('formatBytes：面板 meta 行的 B / KB / MB 三档', () => {
  const { formatBytes } = engine();
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1023), '1023 B');
  assert.equal(formatBytes(1024), '1.0 KB');
  assert.equal(formatBytes(1024 * 1024), '1.0 MB');
});

// ===========================================================================
// ① 引擎行为：git unified diff 生产者
// ===========================================================================

const SAMPLE_DIFF = [
  'warning: in the working copy of \'x.ts\' has CRLF',
  'diff --git a/x.ts b/x.ts',
  'index 1234567..89abcde 100644',
  '--- a/x.ts',
  '+++ b/x.ts',
  '@@ -1,3 +1,4 @@ function f() {',
  ' const a = 1',
  '-const b = 2',
  '+const b = 20',
  '+const c = 3',
  ' }',
  '\\ No newline at end of file',
  'diff --git a/p.png b/p.png',
  'Binary files /dev/null and b/p.png differ',
  'diff --git a/f b/f',
  'old mode 100644',
  'new mode 100755',
].join('\n');

test('parseUnifiedDiff：文件段/区间行号/元数据行/二进制/无 hunk 的模式改动', () => {
  const { parseUnifiedDiff, plain } = engine();
  const parsed = plain(parseUnifiedDiff(SAMPLE_DIFF));
  assert.equal(parsed.files.length, 3, '三个 diff --git 段');

  const first = parsed.files[0];
  assert.deepEqual({ oldPath: first.oldPath, newPath: first.newPath, binary: first.binary },
    { oldPath: 'a/x.ts', newPath: 'b/x.ts', binary: false });
  assert.equal(first.hunks.length, 1);
  const hunk = first.hunks[0];
  assert.deepEqual({ oldStart: hunk.oldStart, newStart: hunk.newStart, header: hunk.header },
    { oldStart: 1, newStart: 1, header: ' function f() {' });
  // 前置噪声与 index/mode 这类元数据行不产生行；`\ No newline` 挂成 meta。
  assert.deepEqual(hunk.lines.map((l) => [l.kind, l.text, l.oldNum, l.newNum]), [
    ['ctx', 'const a = 1', 1, 1],
    ['del', 'const b = 2', 2, null],
    ['add', 'const b = 20', null, 2],
    ['add', 'const c = 3', null, 3],
    ['ctx', '}', 3, 4],
    ['meta', ' No newline at end of file', null, null],
  ]);

  assert.deepEqual({ binary: parsed.files[1].binary, hunks: parsed.files[1].hunks.length },
    { binary: true, hunks: 0 }, '二进制段只标记，不画行');
  assert.equal(parsed.files[2].hunks.length, 0, '纯模式改动没有 hunk，但文件段要留着显示路径');
});

test('unifiedSegments：hunk 内成对改写，git 已裁掉的间隙成为不可展开 fold', () => {
  const { parseUnifiedDiff, unifiedSegments, plain } = engine();
  const file = plain(parseUnifiedDiff(SAMPLE_DIFF)).files[0];
  const segs = plain(unifiedSegments(file));
  assert.deepEqual(segs.map((s) => s.kind), ['hunk']);
  assert.deepEqual(segs[0].rows.map((r) => [r.kind, r.text]), [
    ['context', 'const a = 1'],
    ['mod', 'const b = 2'],
    ['mod', 'const b = 20'],
    ['add', 'const c = 3'],
    ['context', '}'],
    ['meta', ' No newline at end of file'],
  ], 'git 的行与会议话操作走同一个 pairMods');
  assert.deepEqual(plain(diffStatsOf(segs)), { added: 3, deleted: 2 });

  // 两个 hunk：-U0 风格，头前留一段 fold，hunk 之间留 git 没输出的 fold。
  const two = plain(unifiedSegments(plain(parseUnifiedDiff([
    'diff --git a/y b/y',
    '--- a/y',
    '+++ b/y',
    '@@ -5,2 +5,2 @@',
    '-old5',
    '+new5',
    ' ctx6',
    '@@ -12,1 +12,2 @@',
    '+extra',
    ' ctx12',
  ].join('\n'))).files[0]));
  assert.deepEqual(two.map((s) => s.kind), ['fold', 'hunk', 'fold', 'hunk']);
  assert.deepEqual({ count: two[0].count, oldStart: two[0].oldStart, oldEnd: two[0].oldEnd },
    { count: 4, oldStart: 1, oldEnd: 4 }, '首 hunk 之前的上下文是 git 裁掉的 -U0 缺口');
  assert.equal(two[0].rows, undefined, 'git 间隙没有原文 → 只能显示区间，不能展开');
  assert.deepEqual({ count: two[2].count, oldStart: two[2].oldStart, oldEnd: two[2].oldEnd,
    newStart: two[2].newStart, newEnd: two[2].newEnd },
  { count: 5, oldStart: 7, oldEnd: 11, newStart: 7, newEnd: 11 });
});

/** diffStats 走同一个 engine() 句柄（上面用例内联调用，避免重复物化区段）。 */
function diffStatsOf(segs) {
  return engine().diffStats(segs);
}

test('untrackedFile / foldRowsFromContents / displayPath：git 未跟踪与间隙回填', () => {
  const { untrackedFile, foldRowsFromContents, displayPath, plain } = engine();

  const un = plain(untrackedFile('n.txt', 'a\nb\n'));
  assert.deepEqual({ oldPath: un.oldPath, newPath: un.newPath, oldStart: un.hunks[0].oldStart, newStart: un.hunks[0].newStart },
    { oldPath: '/dev/null', newPath: 'b/n.txt', oldStart: 0, newStart: 1 });
  assert.deepEqual(un.hunks[0].lines.map((l) => [l.kind, l.text, l.newNum]), [['add', 'a', 1], ['add', 'b', 2]],
    '结尾换行不额外产生一条空行');
  assert.deepEqual(plain(untrackedFile('e.txt', '')).hunks[0].lines, [], '空文件是零行的 add hunk');

  // 有旧侧区间的 fold：按 offset 把旧行映射到新侧，产出上下文行。
  const aligned = plain(foldRowsFromContents(
    { kind: 'fold', count: 3, oldStart: 3, oldEnd: 5, newStart: 4, newEnd: 6 },
    'L1\nL2\nL3\nL4\nL5', 'L1\nL2\nL3\nL4\nL5\nL6',
  ));
  assert.deepEqual(aligned.map((r) => [r.kind, r.oldLine, r.newLine, r.text]),
    [['context', 3, 4, 'L3'], ['context', 4, 5, 'L4'], ['context', 5, 6, 'L5']]);

  // 旧侧区间为空（oldEnd < oldStart）→ 纯新增缺口，只带新侧行号。
  const addedOnly = plain(foldRowsFromContents(
    { kind: 'fold', count: 3, oldStart: 2, oldEnd: 1, newStart: 2, newEnd: 4 },
    'L1', 'L1\nx\ny\nz',
  ));
  assert.deepEqual(addedOnly.map((r) => [r.kind, r.newLine, r.text]), [['add', 2, 'x'], ['add', 3, 'y'], ['add', 4, 'z']]);

  assert.deepEqual(
    ['a/x.ts', 'b/x.ts', '/dev/null', 'plain/path'].map((p) => displayPath(p)),
    ['x.ts', 'x.ts', '/dev/null', 'plain/path'],
  );
});

// ===========================================================================
// ① 行为：行内语法着色（diff/highlight.ts）
// ===========================================================================

const hl = () => loadRegionSymbols('client.js', HIGHLIGHT, ['langOfPath', 'scanLine', 'hasBlockComment', 'isColored']);

test('langOfPath：扩展名映射，点文件与未知扩展回落纯文本', () => {
  const { langOfPath } = hl();
  assert.equal(langOfPath('src/client/main.ts'), 'ts');
  assert.equal(langOfPath('a\\b\\c.md'), 'md', '反斜杠路径同样取 basename');
  assert.equal(langOfPath('x.PY'), 'py', '扩展名大小写不敏感');
  assert.equal(langOfPath('README'), undefined, '没有扩展名');
  assert.equal(langOfPath('.gitignore'), undefined, '点文件不是扩展名');
  assert.equal(langOfPath('archive.tar.unknownext'), undefined, '未知扩展回落纯文本');
});

test('scanLine：关键字/数字/字符串着色，且 token 拼回原文（不漏字）', () => {
  const { scanLine, plain } = hl();
  const line = 'const x = 1';
  const scan = plain(scanLine(line, 'ts'));
  assert.equal(scan.tokens.map((t) => t.text).join(''), line, 'token 必须无损覆盖整行');
  assert.deepEqual(scan.tokens.map((t) => t.type), ['keyword', 'plain', 'number']);
  assert.deepEqual(scan.tokens.map((t) => t.text), ['const', ' x = ', '1'], '同色相邻段合并成一个 span');
  assert.equal(scan.inBlock, false);

  // 行注释吞掉余下全部内容。
  assert.deepEqual(plain(scanLine('// note (', 'ts')).tokens.map((t) => t.type), ['comment']);

  // 空行零 token（渲染侧据此不包 span）。
  assert.deepEqual(plain(scanLine('', 'ts')), { tokens: [], inBlock: false });
});

test('scanLine：块注释状态跨行线程，未知语言不携带状态', () => {
  const { scanLine, hasBlockComment, isColored, plain } = hl();
  const open = plain(scanLine('/* head', 'ts'));
  assert.equal(open.inBlock, true, '未闭合的 /* 把状态交给下一行');
  const inside = plain(scanLine('still comment', 'ts', true));
  assert.deepEqual(inside.tokens.map((t) => t.type), ['comment'], '注释内部整行都是 comment');
  assert.equal(inside.inBlock, true);
  const close = plain(scanLine(' end */ rest()', 'ts', true));
  assert.deepEqual(close.tokens.map((t) => [t.text, t.type]),
    [[' end */', 'comment'], [' ', 'plain'], ['rest', 'function'], ['()', 'plain']],
    '闭合段是 comment，其后恢复正常着色（rest 后紧跟 ( → 函数名）');
  assert.equal(close.inBlock, false);

  // 没有块定界的语言（shell / python）不吞状态。
  assert.equal(hasBlockComment('ts'), true);
  assert.equal(hasBlockComment('py'), false);
  assert.equal(hasBlockComment(undefined), false);
  assert.deepEqual(plain(scanLine('# still plain', 'py')).tokens.map((t) => t.type), ['comment']);
  assert.equal(plain(scanLine('anything', 'no-such-lang')).tokens[0].type, 'plain');
  assert.equal(plain(scanLine('x', 'no-such-lang')).inBlock, false, '未知语言不携带块状态');

  assert.equal(isColored({ text: 'const', type: 'keyword' }), true);
  assert.equal(isColored({ text: ' ', type: 'plain' }), false, 'plain 不单独包 span');
});

// ===========================================================================
// ① 行为：会话事件日志 → 文件操作（changes/ops.ts）
//    ——旧 window.__dshFileChanges 桥接的替代数据源：插件自己读权威事件日志
// ===========================================================================

const opsApi = () => loadRegionSymbols('client.js', OPS, [
  'extractFileOps', 'groupByFile', 'knownContentBefore', 'parseReadContent', 'parseReadLines',
]);

/** 0.1.6 形状：user 角色消息里套一个 tool-result 块，isError 挂在块上。 */
function resultV1(callId, text, isError = false) {
  return { type: 'tool/result', time: 0, data: { message: {
    source: { kind: 'tool', callId },
    content: [{ type: 'tool-result', content: [{ type: 'text', text }], isError }],
  } } };
}
/** 0.1.7 形状：一等 tool 角色消息，块在顶层，isError 提到消息上。 */
function resultV2(callId, text, isError = false) {
  return { type: 'tool/result', time: 0, data: { message: {
    source: { kind: 'tool', callId },
    content: [{ type: 'text', text }],
    isError,
  } } };
}
function call(name, callId, args, time) {
  return { type: 'tool/call', time, data: { name, callId, arguments: JSON.stringify(args) } };
}

test('extractFileOps：read/write/edit 分类、结果结算、未知工具与缺路径忽略', () => {
  const { extractFileOps, plain } = opsApi();
  const events = [
    call('read', 'c1', { file_path: 'a.md' }, 10),
    { ...resultV1('c1', '<content>1: hello</content>', false), time: 11 },
    call('write', 'c2', { path: 'b.ts', content: 'export const x = 1\n' }, 20),
    call('str_replace', 'c3', { file_path: 'b.ts', old_string: 'x = 1', new_string: 'x = 2' }, 30),
    call('bash', 'c4', { command: 'ls' }, 40),
    call('edit', 'c5', { note: '没有路径字段' }, 50),
    { type: 'tool/call', time: 60, data: { name: 'write', callId: 'c6', arguments: '{ not json' } },
  ];
  const ops = plain(extractFileOps(events));
  assert.deepEqual(ops.map((o) => [o.callId, o.kind]).sort(), [['c1', 'read'], ['c2', 'write'], ['c3', 'edit']].sort(),
    '非文件工具、缺路径、参数非 JSON 都不产生 op');
  const byId = new Map(ops.map((o) => [o.callId, o]));
  assert.deepEqual([byId.get('c1').read, byId.get('c1').running, byId.get('c1').isError], ['<content>1: hello</content>', false, false]);
  assert.equal(byId.get('c2').content, 'export const x = 1\n');
  assert.deepEqual(byId.get('c3').edit, { oldString: 'x = 1', newString: 'x = 2' });
  // 时间新→旧排（面板按最近改动置顶）。
  assert.deepEqual(ops.map((o) => o.time), [30, 20, 10]);
});

test('extractFileOps：0.1.6 包裹块与 0.1.7 顶层块两种日志形状都读得到文本与错误', () => {
  const { extractFileOps, plain } = opsApi();
  const v1 = plain(extractFileOps([call('read', 'r1', { path: 'f' }, 1), { ...resultV1('r1', 'wrapped', false), time: 2 }]));
  const v2 = plain(extractFileOps([call('read', 'r2', { path: 'f' }, 1), { ...resultV2('r2', 'lifted', true), time: 2 }]));
  assert.equal(v1[0].read, 'wrapped', '0.1.6：嵌套 tool-result 块里的 text');
  assert.equal(v1[0].isError, false);
  assert.equal(v2[0].read, undefined, '出错时不填 read');
  assert.equal(v2[0].isError, true, '0.1.7：消息级 isError');
  assert.equal(v2[0].errorText, 'lifted', '错误文本单独呈现');
  assert.equal(v2[0].running, false, '两代形状都完成结算');

  // 结果先到、调用后到（乱序日志）：没有对应 callId 的结果被忽略，不抛错。
  const orphan = plain(extractFileOps([{ ...resultV2('nope', 'x'), time: 1 }]));
  assert.deepEqual(orphan, []);
});

test('groupByFile / knownContentBefore：按路径分组与「改前全文」的尽力推断', () => {
  const { extractFileOps, groupByFile, knownContentBefore, plain } = opsApi();
  const ops = plain(extractFileOps([
    call('write', 'w1', { path: 'a', content: 'v1' }, 10),
    call('edit', 'e1', { file_path: 'a', old_string: 'v1', new_string: 'v2' }, 20),
    call('write', 'w2', { path: 'b', content: 'only-b' }, 30),
  ]));
  const groups = groupByFile(ops);
  assert.deepEqual(plain([...groups.keys()]), ['b', 'a'], '文件按其最新 op 的时间倒序');
  assert.deepEqual(plain(groups.get('a').map((o) => o.kind)), ['edit', 'write']);

  const editOp = groups.get('a')[0];
  assert.equal(knownContentBefore(ops, 'a', editOp), 'v1',
    '紧邻的前一条 edit 用它的 old_string 作改前全文');
  const bOp = groups.get('b')[0];
  assert.equal(knownContentBefore(ops, 'b', bOp), undefined, '首次出现的写入没有已知前文（全 add）');
  assert.equal(knownContentBefore(ops, 'missing', bOp), undefined);
});

test('parseReadContent / parseReadLines：read 信封拆解，空行在两种消费口径下的存废', () => {
  const { parseReadContent, parseReadLines, plain } = opsApi();
  // 行号前缀是 "<n>: "，空行也带这个前缀（冒号后仍有一个空格）。
  const raw = [
    '<content>',
    '1: # title',
    '2: ',
    '3: body',
    '(Showing lines 1-3 of 9)',
    '</content>',
  ].join('\n');

  // markdown 预览要看得到空行（块结构依赖它）→ 保空行、剥 <content> 信封与行号前缀。
  assert.equal(parseReadContent(raw), '# title\n\nbody');
  // 行内高亮要真实行号 → 空行以 text:'' 保留行号，"(Showing lines…)" 剔除。
  assert.deepEqual(plain(parseReadLines(raw)), [
    { line: 1, text: '# title' }, { line: 2, text: '' }, { line: 3, text: 'body' },
  ]);

  // 上游quirk（实测锁定，升级时要复核）：剥前缀的正则要求冒号后至少一个空白，
  // 所以 "2:"（尾随空格被裁掉的日志）在 parseReadContent 里会留下字面 "2:"，
  // 在 parseReadLines 里仍解析成 line 2 的空文本。
  const tight = raw.replace('2: ', '2:');
  assert.equal(parseReadContent(tight), '# title\n2:\nbody');
  assert.deepEqual(plain(parseReadLines(tight))[1], { line: 2, text: '' });

  // 没有前缀的日志按顺序回退计数。
  assert.deepEqual(plain(parseReadLines('alpha\nbeta')), [{ line: 1, text: 'alpha' }, { line: 2, text: 'beta' }]);
});

// ===========================================================================
// ① 行为：git status → SCM 目录树（changes/change-tree.ts）
// ===========================================================================

const treeApi = () => loadRegionSymbols('client.js', [GIT_STATUS, CHANGE_TREE], ['buildChangeTree', 'statusOfXY']);

test('buildChangeTree：目录先于文件、单子链压缩、计数药丸、clean/ignored 与重复路径剔除', () => {
  const { buildChangeTree, statusOfXY, plain } = treeApi();
  const nodes = plain(buildChangeTree([
    { xy: ' M', path: 'src/client/a.ts' },
    { xy: ' M', path: 'src/client/b.ts' },
    { xy: '??', path: 'src/x.md' },
    { xy: '  ', path: 'clean.ts' },
    { xy: '!!', path: 'ignored.ts' },
    { xy: 'A ', path: 'src\\client\\a.ts' },
    { xy: 'UU', path: 'merge/c.ts' },
  ]));

  assert.deepEqual(nodes.map((n) => [n.kind, n.name]), [['dir', 'merge'], ['dir', 'src']], '目录行排在文件行前，同层按名排序');
  const src = nodes[1];
  assert.equal(src.changes, 3, '计数药丸统计树下所有变更文件（重复路径只算一次）');
  assert.deepEqual(src.children.map((n) => [n.kind, n.name]), [['dir', 'client'], ['file', 'x.md']]);
  assert.deepEqual(src.children[0].children.map((n) => n.name), ['a.ts', 'b.ts']);
  // 反斜杠路径归一后与正斜杠是同一个文件：保留 git 原拼写作为行标识。
  assert.equal(src.children[0].children[0].path, 'src/client/a.ts');
  assert.equal(nodes[0].children[0].status.tone, 'conflict', '冲突态优先占行色');
  assert.equal(nodes[1].children[0].children[0].status.tone, 'modified');

  // 单子链压缩：只有目录、且每层唯一孩子时整条链合成一个标签。
  const chain = plain(buildChangeTree([{ xy: ' M', path: 'a/b/c/d.md' }]));
  assert.deepEqual(chain.map((n) => [n.kind, n.name, n.path]), [['dir', 'a/b/c', 'a/b/c']]);
  assert.deepEqual(chain[0].children.map((n) => n.name), ['d.md']);

  // 空输入 / 全是无效条目 → 空列表。
  assert.deepEqual(plain(buildChangeTree([])), []);
  assert.deepEqual(plain(buildChangeTree([{ xy: '  ', path: 'x' }, { xy: '??', path: '' }])), []);

  assert.deepEqual(plain(statusOfXY('??')), { letter: 'U', tone: 'untracked', staged: false, unstaged: true });
  assert.equal(statusOfXY('  '), undefined, '干净条目没有状态');
});

// ===========================================================================
// ② src ↔ 产物 同源护栏
// ===========================================================================

/** src 有、产物区段没有，且解释得通（未被入口引用而 tree-shake / 常量内联）的名字。 */
const FOLDED_OUT = {
  [ROWS]: ['HUNK_CONTEXT', 'MIN_FOLD'],
  [HIGHLIGHT]: ['tokenizeLine'],
  [OPS]: [],
  [CHANGE_TREE]: [],
};

test('同源护栏：区段定界唯一 + 产物顶层名 ⊆ src 顶层名，缺席者逐名在册', () => {
  const offenders = [];
  for (const bundle of CHANNEL_BUNDLES) {
    for (const rel of [ROWS, HIGHLIGHT, OPS, CHANGE_TREE]) {
      const srcNames = srcTopLevelNames(rel);
      const bundleNames = regionTopLevelNames(bundle.replace(/^lib\//, ''), rel);
      const absent = srcNames.filter((n) => !bundleNames.includes(n));
      const extra = bundleNames.filter((n) => !srcNames.includes(n));
      const allowed = FOLDED_OUT[rel] || [];
      for (const n of extra) offenders.push(`${bundle} ${rel}：产物有 src 没有的顶层声明 "${n}"（手改进物的孤儿段？）`);
      for (const n of absent) {
        if (!allowed.includes(n)) offenders.push(`${bundle} ${rel}：src 导出 "${n}" 在产物缺席且无解释`);
      }
      assert.ok(srcNames.length >= 4, `${rel} 的顶层声明少于 4 个，护栏取到了空集`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));

  // 被内联掉的常量必须留下折叠后的字面量，否则白名单只是句空话。
  const client = fs.readFileSync(path.join(PLUGIN_DIR, 'lib', 'client.js'), 'utf8');
  assert.ok(client.includes('context = 3'), 'HUNK_CONTEXT 应内联为 buildDiffSegments 的默认参数 3');
  assert.ok(client.includes('count >= 3'), 'MIN_FOLD 应内联为 fold 展开阈值 3');
});

test('同源护栏反证：判据对「孤儿声明 / 无解释缺席 / 样本空集」都会红', () => {
  const srcNames = srcTopLevelNames(ROWS);
  const bundleNames = regionTopLevelNames('client.js', ROWS);
  assert.ok(srcNames.length > bundleNames.length, '区段取到的是子集，否则下面三条反证没有意义');

  // ① 产物多出一个 src 没有的名字 → 必须被点出来。
  const withOrphan = [...bundleNames, 'handPatchedOrphan'];
  assert.ok(withOrphan.filter((n) => !srcNames.includes(n)).length === 1, '孤儿声明判据不咬');
  // ② 从白名单里删掉一项 → 该名字立刻变成「无解释缺席」。
  const allowed = FOLDED_OUT[ROWS].filter((n) => n !== 'HUNK_CONTEXT');
  assert.ok(srcNames.filter((n) => !bundleNames.includes(n) && !allowed.includes(n)).includes('HUNK_CONTEXT'),
    '缺席白名单判据不咬');
  // ③ 取错文件（空集）不能让护栏变绿。
  assert.ok(srcNames.filter((n) => !bundleNames.includes(n) && !(FOLDED_OUT[ROWS] || []).includes(n)).length === 0);
  assert.ok(srcTopLevelNames('src/client/diff/highlight.ts').length > 0, 'highlight 顶层名不得为空');
  // ④ 区段取符号的在位断言是活的：喂一个不存在的符号必须抛。
  assert.throws(() => loadRegionSymbols('client.js', ROWS, ['noSuchDiffSymbol']), /noSuchDiffSymbol/);
});

test('两份频道产物各含完整 diff 栈区段（每环定界唯一）', () => {
  const stack = [
    ROWS, HIGHLIGHT, OPS, CHANGE_TREE,
    'src/client/diff/DiffRows.tsx', 'src/client/diff/DiffFiles.tsx', 'src/client/diff/use-git-diff.ts',
    'src/client/changes/ChangesTab.tsx', 'src/client/changes/DiffPane.tsx',
    'src/client/changes/GitLens.tsx', 'src/client/changes/SessionLens.tsx',
    'src/client/DiffTab.tsx', 'src/client/builtins/tabs.tsx',
  ];
  for (const bundle of CHANNEL_BUNDLES) {
    const text = fs.readFileSync(path.join(PLUGIN_DIR, bundle), 'utf8');
    for (const rel of stack) {
      const hits = text.split(`//#region ${rel}`).length - 1;
      assert.equal(hits, 1, `${bundle} 里 ${rel} 的区段定界应恰好一次，实得 ${hits}`);
    }
  }
});

// ===========================================================================
// ③ 接线：两条镜头共用同一套 diff 组件；退役面不得复活
// ===========================================================================

test('接线：git 描述符挂 ChangesTab（徽标读 opCountOf），diff 描述符挂 DiffTab', () => {
  const tabs = fs.readFileSync(TABS_SRC, 'utf8');
  assert.ok(tabs.includes("import { ChangesTab, opCountOf } from '../changes/ChangesTab.tsx'"),
    '变更页与 op 计数取自同一模块（徽标与会话 lens 同源）');
  assert.ok(tabs.includes("import { DiffTab } from '../DiffTab.tsx'"));

  const gitBlock = tabs.slice(tabs.indexOf("      id: 'git',"), tabs.indexOf("      id: 'subagent',"));
  assert.ok(gitBlock.length > 200 && gitBlock.includes('<ChangesTab'), "'git' 描述符（id 保留以续用已存布局）挂 ChangesTab");
  assert.ok(gitBlock.includes('const count = opCountOf(scope.sessionId)'), '徽标只读 op 计数缓存，不在徽标里发请求');
  assert.ok(gitBlock.includes('onOpenDiff={onOpenDiff}'), '变更行经 onOpenDiff 打开 diff 页');

  const diffBlock = tabs.slice(tabs.indexOf("      id: 'diff',"), tabs.indexOf('  ]\n}'));
  assert.ok(diffBlock.includes('<DiffTab sessionId={scope.sessionId} cwd={scope.cwd} diff={tab.diff} />'));
  assert.ok(diffBlock.includes('hidden: true') && diffBlock.includes('order: -1'),
    'diff 页是按需打开的隐藏类型');

  for (const bundle of CHANNEL_BUNDLES) {
    const text = fs.readFileSync(path.join(PLUGIN_DIR, bundle), 'utf8');
    assert.equal(text.split('id: "git"').length - 1, 1, `${bundle}：'git' 描述符注册点应唯一`);
    assert.equal(text.split('id: "diff"').length - 1, 1, `${bundle}：'diff' 描述符注册点应唯一`);
    assert.ok(text.includes('opCountOf'), `${bundle}：徽标的 op 计数在产物里缺席`);
  }
});

test('反向锁：旧「按变更查看 diff」与全局 store 桥接的锚点在 src 与产物里都是 0 命中', () => {
  const retired = ['__dshFileChanges', 'queryFileChanges', 'DiffTurnsPanel', 'diff-turns',
    'splitLines', 'diffRows', 'formatHistTime', 'HIST_OP_LABEL', 'dsh-editor-diff-add',
    'dsh-eh-line', 'file-changes-highlight.ts'];
  const sources = [];
  const walk = (dir) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|css)$/.test(ent.name)) sources.push(p);
    }
  };
  walk(path.join(PLUGIN_DIR, 'src'));
  // 扫描面 = 插件自有代码 + 三处会内联我们手改段的产物。vendored 重资产 bundle
  // （client-mermaid.js 里的 mermaid、client-editor.js 里的 CodeMirror）自带同名
  // 内部符号（实测 splitLines 在 mermaid bundle 里就有），那是第三方实现，不算我们
  // 退役面的复活；client-editor.js 仍在范围内，因为旧手改段就落在它里面。
  for (const bundle of ['client.js', 'client-registry.js', 'client-editor.js']) {
    sources.push(path.join(PLUGIN_DIR, 'lib', bundle));
  }

  const hits = [];
  for (const file of sources) {
    const text = fs.readFileSync(file, 'utf8');
    for (const token of retired) {
      if (text.includes(token)) hits.push(`${path.relative(PLUGIN_DIR, file)}: ${token}`);
    }
  }
  assert.deepEqual(hits, [], `退役面复活（这些实现已被 diff/ + changes/ 取代）:\n${hits.join('\n')}`);

  // 判据自证（防空扫）：同一套 token 塞进内存副本必须逐个点出来，且扫描面非空。
  assert.ok(sources.length >= 40, `扫描面只有 ${sources.length} 个文件，判据没在扫东西`);
  const bait = retired.join('\n');
  assert.equal(retired.filter((token) => bait.includes(token)).length, retired.length,
    '反向锁的 token 表自身不完整');
});
