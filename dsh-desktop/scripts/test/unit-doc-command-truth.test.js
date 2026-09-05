'use strict';

// unit-doc-command-truth.test.js — 文档真值守卫（命令存在性 + 代码块可执行性）。
//
// 为什么需要：代码改坏会有测试红，文档改坏过去没有任何守卫。CONTRIBUTING.md 曾
// 要求贡献者「跑 npm run test:integration」、README 曾教 `npm start` / `npm run dist`
// / `npm run electron:fetch` —— 这些脚本与文件在 Electron 壳下线（6ff0cc83 / 02981194）
// 时一并消失，照做的人只会拿到 Missing script。判据与实现见 scripts/lib/doc-commands.js。
//
// 三条判据（缺一条就会被散文假阳性淹没，均为实测踩出来）：
//   1. 只看命令上下文（栅栏内 / 行内反引号内）；
//   2. 只认 npm run X、npm test、npm start 三种形态；
//   3. 否定语境（「npm start 已随 Electron 壳下线」这类记录句）按所在原始整行豁免。
//
// 另两条结构不变量从 dsh-desktop/docs/troubleshooting.md 的真实缺陷回过来：可执行
// 代码块里混排版引号（粘进终端必然 no such file or directory）、栅栏粘在 bullet 行尾
// （不是代码块，且让后半篇栅栏身份整体反向）。
//
// 豁免纪律：历史文档（带日期的计划/复盘快照）逐条登记在 HISTORY_EXEMPTIONS 里，
// 不发明通配规则；已不再被点名的豁免同样让本测试变红——过期豁免和没有豁免一样危险。
//
// 运行：node --test scripts/test/unit-doc-command-truth.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dc = require('../lib/doc-commands');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

/** 历史快照类文档的逐条豁免：改它们等于篡改历史记录，但必须留下可核对的理由。 */
const HISTORY_EXEMPTIONS = [
  {
    file: 'docs/commit-plan-20260822.md',
    script: 'test:unit',
    reason: '带日期的提交计划快照（2026-08-22），记录当时的门禁写法；改写它等于篡改历史。',
  },
];

const sameFile = (a, b) => a.replace(/\\/g, '/') === b.replace(/\\/g, '/');

test('仓库 markdown 里写明的 npm 命令，必须在归属包 package.json 真实存在', () => {
  const results = dc.scanDocs(REPO_ROOT);
  assert.ok(results.length >= 0, 'scanDocs 必须能跑完整个仓库');

  const undecided = [];
  const unexpected = [];
  for (const r of results) {
    for (const s of r.undecided) undecided.push(`${r.file} → ${s}（归属包判不出来，守卫对它无事可做）`);
    for (const m of r.missing) {
      const ex = HISTORY_EXEMPTIONS.find((e) => sameFile(e.file, r.file) && e.script === m.script);
      if (!ex) unexpected.push(`${r.file} → npm run ${m.script}   ⟸ ${m.line.slice(0, 100)}`);
    }
  }
  assert.deepEqual(undecided, [], '存在无法判定归属包的文档：\n' + undecided.join('\n'));
  assert.deepEqual(unexpected, [], '文档推荐了不存在的 npm 命令：\n' + unexpected.join('\n'));
});

test('历史豁免必须仍被点名（过期豁免即删除，否则豁免清单会越攒越松）', () => {
  const results = dc.scanDocs(REPO_ROOT);
  const reported = new Set(results.flatMap((r) => r.missing.map((m) => r.file + '#' + m.script)));
  const stale = HISTORY_EXEMPTIONS
    .filter((e) => !reported.has(e.file + '#' + e.script))
    .map((e) => `${e.file} → ${e.script}（已不再被点名，应删掉这条豁免）`);
  assert.deepEqual(stale, [], '存在过期豁免：\n' + stale.join('\n'));
  // 豁免清单本身不许空转成通配：逐条必须有 reason。
  for (const e of HISTORY_EXEMPTIONS) {
    assert.ok(e.reason && e.reason.length >= 8, `豁免 ${e.file}#${e.script} 缺理由`);
  }
});

test('全部 markdown 代码块结构合法：栅栏配平、栅栏不粘在行尾', () => {
  const files = dc.collectMarkdown(REPO_ROOT);
  assert.ok(files.length > 20, '待扫文档数异常偏少（' + files.length + '），判据可能已失效');
  const unbalanced = [];
  const glued = [];
  for (const f of files) {
    const rel = path.relative(REPO_ROOT, f).replace(/\\/g, '/');
    const st = dc.analyzeDocStructure(fs.readFileSync(f, 'utf8'));
    if (!st.fenceBalanced) unbalanced.push(rel + '（有 ``` 未闭合，其后整篇的块内/块外身份反向）');
    for (const g of st.gluedFences) glued.push(`${rel} L${g.line} ⟸ ${g.text.slice(0, 90)}`);
  }
  assert.deepEqual(unbalanced, [], '栅栏不配平：\n' + unbalanced.join('\n'));
  assert.deepEqual(glued, [], '栅栏粘在行尾（CommonMark 不认作代码块）：\n' + glued.join('\n'));
});

test('可执行代码块里不得出现排版引号/全角空格（粘进终端就跑不通）', () => {
  const files = dc.collectMarkdown(REPO_ROOT);
  const hits = [];
  let execBlocks = 0;
  for (const f of files) {
    const rel = path.relative(REPO_ROOT, f).replace(/\\/g, '/');
    const st = dc.analyzeDocStructure(fs.readFileSync(f, 'utf8'));
    execBlocks += st.execBlocks;
    for (const t of st.typographic) hits.push(`${rel} L${t.line} ${t.ch} ⟸ ${t.text.slice(0, 90)}`);
  }
  // 覆盖面哨兵：判据若漂移成「一个可执行块都没找到」，本条测试会静默全绿。
  assert.ok(execBlocks >= 100, `可执行代码块数=${execBlocks}，远低于仓库实际规模——判据可能失效`);
  assert.deepEqual(hits, [], '可执行块含排版字符：\n' + hits.join('\n'));
});

test('正对照（三方向）：判据既不放过假命令，也不误伤真命令与记录句', () => {
  const scripts = new Set(['test', 'fetch-node', 'clean']);

  // ① 必须抓到：栅栏里的假命令、行内反引号里的假命令、以及「会删除 dist」这种推荐句
  //    （NEGATION 词表故意不含 删除/移除/关闭，此条即该决定的回归锁）。
  const mustCatch = dc.checkDocCommands([
    '```powershell', 'npm run definitely-fake-aaa', 'npm test', '```',
    '带反引号的推荐句 `npm run definitely-fake-bbb` 会删除 dist —— 不得被豁免。',
  ].join('\n'), scripts).missing.map((m) => m.script).sort();
  assert.deepEqual(mustCatch, ['definitely-fake-aaa', 'definitely-fake-bbb'], '假命令没被抓全');

  // ①b 引用块内嵌套栅栏（README 开发段的写法）里的命令也必须被扫到 —— 早先栅栏
  //     判据不给「> 」后的空格留位置，这整段一直躲在守卫外（实测由结构断言带出）。
  const bq = dc.checkDocCommands([
    '> 现行入口：', '>', '> ```powershell', '> npm run definitely-fake-cqc', '> ```', '> 完。',
  ].join('\n'), scripts).missing.map((m) => m.script);
  assert.deepEqual(bq, ['definitely-fake-cqc'], '引用块内嵌套栅栏里的命令没被扫到（判据盲区）');

  // ② 不得误报：真脚本、否定记录句、散文里的 npm 词汇。
  const mustNotCatch = dc.checkDocCommands([
    '本包没有 `npm start` 脚本（原 Electron 壳已下线）。',
    '```powershell', 'npm test', 'npm run fetch-node', '```',
    'It is published to the npm registry; npm downloads are tracked.',
  ].join('\n'), scripts).missing.map((m) => m.script);
  assert.deepEqual(mustNotCatch, [], '真命令或记录句被误报');

  // ③ 归属包判不出来时必须落 undecided，不能悄悄放行。
  const und = dc.checkDocCommands('```powershell\nnpm run whatever-x\n```', null);
  assert.deepEqual(und.missing, [], '无 scripts 时不该断言缺失');
  assert.deepEqual(und.undecided, ['whatever-x'], '无法判定归属包却没记进 undecided');

  // ④ 结构判据同样要有捕获力。
  const badStruct = dc.analyzeDocStructure([
    '### 标题', '', '- 说明：   ```bash', '   sudo xattr -cr \u201c/App/Foo.app\u201d', '   ```',
  ].join('\n'));
  assert.equal(badStruct.fenceBalanced, false, '未闭合栅栏没被发现');
  assert.equal(badStruct.gluedFences.length, 1, '行尾粘连栅栏没被发现');
  // 粘连的 ```lang 按 CommonMark 不构成代码块，所以那行命令会落到散文口径里、
  // 不被排版引号判据看到（troubleshooting.md L94 就是这么躲过扫描的）。这个盲区由
  // gluedFences 那条断言兜住：两者缺一就会漏报，故把当前口径钉成断言，改判据时必须同步。
  assert.equal(badStruct.typographic.length, 0, '粘连块的块内扫描口径与实现不符（改判据时请同步此断言）');

  const typoStruct = dc.analyzeDocStructure([
    '```bash', 'sudo xattr -cr \u201c/App/Foo.app\u201d', '\u3000ls -l', '# 注释里的 \u201c引号\u201d 无害', '```',
  ].join('\n'));
  const chars = typoStruct.typographic.map((t) => t.ch);
  assert.ok(chars.includes('U+201C'), '可执行块里的排版引号没被发现');
  assert.ok(chars.includes('U+3000'), '可执行块里的全角空格没被发现');
  assert.equal(typoStruct.typographic.length, 3, '注释行被误判（或计数漂了）：' + chars.join(','));
  const goodStruct = dc.analyzeDocStructure('```bash\nsudo xattr -cr "/App/Foo.app"\n```\n');
  assert.equal(goodStruct.fenceBalanced, true, '合法结构被误判');
  assert.deepEqual(goodStruct.typographic, [], '合法结构被误判（排版字符）');
  assert.equal(goodStruct.execBlocks, 1, '可执行块计数漂了（覆盖面哨兵会失效）');
});
