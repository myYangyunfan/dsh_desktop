'use strict';

// ---------------------------------------------------------------------------
// skill-dirs-compat 补丁单测（三态契约 + 行为验证）。
//
// transformSkillDirsCompat 两点注入（2026-09 收窄：用户要求技能读取固定到
// 「只读自己的 skills」，跨代理 user-claude/user-codex 根追加已移除）：
// node:path import 扩 delimiter / 构造器 DSH_SKILL_DIRS 并入 customSkillDirs。
// 本文件用与内核产物同构的最小 fixture 验证：
//   1) pristine → changed，产物含 marker 与两处注入特征；
//   2) 产物 / marker-only → already（幂等）；
//   3) 锚点缺失（逐个挖锚点 / 空源）→ anchor-missing + detail 含文件名；
//   4) 行为：剥掉 import 后在 vm 沙箱里实跑构造器 + roots()——DSH_SKILL_DIRS
//      分隔解析、空段过滤、resolve 映射；产物不得引入跨代理根。
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const {
  transformSkillDirsCompat,
  markers: { SKILL_DIRS_COMPAT_MARKER },
} = require('../lib/patch-adapters');

// 与 dsh-skill-filesystem/lib/index.js 同构的最小 pristine 源（锚点字节级一致）。
const PRISTINE = [
  'import { access } from "node:fs/promises";',
  'import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";',
  'import { homedir } from "node:os";',
  'const PROJECT_DSH_RANK = 100;',
  'const CUSTOM_RANK = 300;',
  'const USER_DSH_RANK = 400;',
  'const USER_AGENTS_RANK = 500;',
  'var FileSystemSkillProvider = class {',
  '\tconstructor(ctx, control, config = {}) {',
  '\t\tthis.includeDefaultRoots = config.includeDefaultRoots ?? true;',
  '\t\tthis.dshHome = config.dshHome ?? "/dsh";',
  '\t\tthis.agentsHome = resolve(config.agentsHome ?? process.env.DSH_AGENTS_HOME ?? join(homedir(), ".agents"));',
  '\t\tthis.customSkillDirs = (config.customSkillDirs ?? []).map((root) => resolve(root));',
  '\t}',
  '\tasync roots(cwd) {',
  '\t\tconst roots = [];',
  '\t\troots.push(...this.customSkillDirs.map((path) => ({ path, source: "custom", rank: CUSTOM_RANK })));',
  '\t\tif (this.includeDefaultRoots) roots.push({',
  '\t\t\tpath: join(this.dshHome, "skills"),',
  '\t\t\tsource: "user-dsh",',
  '\t\t\trank: USER_DSH_RANK,',
  '\t\t\tskipSystem: true',
  '\t\t}, {',
  '\t\t\tpath: join(this.agentsHome, "skills"),',
  '\t\t\tsource: "user-agents",',
  '\t\t\trank: USER_AGENTS_RANK',
  '\t\t});',
  '\t\treturn roots;',
  '\t}',
  '};',
].join('\n');

const LABEL = 'skill-fs-index.js';

test('pristine → changed：产物含 marker、claude/codex 根与 DSH_SKILL_DIRS 逻辑', () => {
  const r = transformSkillDirsCompat(PRISTINE, LABEL);
  assert.equal(r.status, 'changed');
  assert.equal(typeof r.src, 'string');
  assert.notEqual(r.src, PRISTINE);
  assert.ok(r.src.includes(SKILL_DIRS_COMPAT_MARKER), '产物应含幂等 marker');
  assert.ok(!r.src.includes('".claude", "skills"'), '收窄后不得追加跨代理 .claude/skills 根');
  assert.ok(!r.src.includes('".codex", "skills"'), '收窄后不得追加跨代理 .codex/skills 根');
  assert.ok(!r.src.includes('source: "user-claude"'), '收窄后无 user-claude 根');
  assert.ok(!r.src.includes('source: "user-codex"'), '收窄后无 user-codex 根');
  assert.ok(r.src.includes('process.env.DSH_SKILL_DIRS'), '产物应含 DSH_SKILL_DIRS 解析');
  assert.ok(r.src.includes('delimiter, dirname'), '产物应把 delimiter 并入 node:path import');
  // import 扩展只此一处，原命名一个不丢。
  assert.ok(r.src.includes('import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";'));
});

test('已应用 / marker-only → already（幂等，不得携带 src）', () => {
  const changed = transformSkillDirsCompat(PRISTINE, LABEL);
  const again = transformSkillDirsCompat(changed.src, LABEL);
  assert.equal(again.status, 'already');
  assert.equal(again.src, undefined);
  const markerOnly = transformSkillDirsCompat(`// ${SKILL_DIRS_COMPAT_MARKER}\n`, LABEL);
  assert.equal(markerOnly.status, 'already');
});

test('锚点缺失 → anchor-missing + detail 含文件名（逐锚点挖掘）', () => {
  const cases = {
    'node:path import': PRISTINE.replace('import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";', 'import { join } from "node:path";'),
    'customSkillDirs 构造器行': PRISTINE.replace('\t\tthis.customSkillDirs = (config.customSkillDirs ?? []).map((root) => resolve(root));', '\t\tthis.customSkillDirs = [];'),
  };
  for (const [name, src] of Object.entries(cases)) {
    const r = transformSkillDirsCompat(src, LABEL);
    assert.equal(r.status, 'anchor-missing', `${name} 挖掉后应 anchor-missing`);
    assert.ok(r.detail && r.detail.includes(LABEL), `${name} 的 detail 应含文件名`);
    assert.equal(r.src, undefined);
  }
  const empty = transformSkillDirsCompat('// ta6 poisoned\n', 'POISON.js');
  assert.equal(empty.status, 'anchor-missing');
  assert.ok(empty.detail.includes('POISON.js'));
});

/** 剥掉 import 语句后在 vm 沙箱实跑（注入 join/resolve/homedir/delimiter/process）。 */
function evaluatePatched(product, env) {
  const stripped = product.replace(/^import .*$/gm, '');
  const context = {
    process: { env },
    join: (...segs) => segs.join('/'),
    resolve: (p) => '/resolved:' + String(p),
    homedir: () => '/home/tester',
    delimiter: ';',
  };
  vm.createContext(context);
  vm.runInContext(stripped, context);
  return context;
}

test('行为：收窄后 roots() 不引入跨代理根（对齐 2026-09 只读自身 skills）', async () => {
  const changed = transformSkillDirsCompat(PRISTINE, LABEL);
  const context = evaluatePatched(changed.src, {});
  const provider = new context.FileSystemSkillProvider({}, {}, { dshHome: '/dsh', customSkillDirs: ['/cfg/skills'] });
  const roots = await provider.roots();
  const sources = roots.map((r) => r.source);
  assert.ok(!sources.includes('user-claude'), 'user-claude 根已移除');
  assert.ok(!sources.includes('user-codex'), 'user-codex 根已移除');
  // 自身根次序不变：custom(300) < user-dsh(400) < user-agents(500)。
  const bySource = Object.fromEntries(roots.map((r) => [r.source, r]));
  assert.ok(bySource.custom.rank < bySource['user-dsh'].rank, 'custom 仍优先于 user-dsh');
  assert.ok(bySource['user-dsh'].rank < bySource['user-agents'].rank, 'user-dsh 仍优先于 user-agents');
});

test('行为：DSH_SKILL_DIRS 分隔解析、空段过滤、与 config 条目同级 resolve', async () => {
  const changed = transformSkillDirsCompat(PRISTINE, LABEL);
  const env = { DSH_SKILL_DIRS: 'C:\\a\\skills;;D:\\b\\skills' };
  const context = evaluatePatched(changed.src, env);
  const provider = new context.FileSystemSkillProvider({}, {}, { customSkillDirs: ['/cfg/skills'] });
  // vm 跨 realm 数组不能直接 deepEqual（原型不同），以 join 产物比对。
  const custom = (await provider.roots()).filter((r) => r.source === 'custom').map((r) => r.path).join('|');
  assert.equal(custom, [
    '/resolved:/cfg/skills',
    '/resolved:C:\\a\\skills',
    '/resolved:D:\\b\\skills',
  ].join('|'), 'config 条目 + 两个非空 env 条目，空段被过滤，统一走 resolve');
  // env 缺席 → 只有 config 条目（?? "" → split 得 [""] → 被过滤）。
  const noEnv = evaluatePatched(changed.src, {});
  const provider2 = new noEnv.FileSystemSkillProvider({}, {}, { customSkillDirs: ['/cfg/skills'] });
  const custom2 = (await provider2.roots()).filter((r) => r.source === 'custom').map((r) => r.path).join('|');
  assert.equal(custom2, '/resolved:/cfg/skills');
});

test('行为：includeDefaultRoots=false 时自身根全部缺席（对齐上游语义）', async () => {
  const changed = transformSkillDirsCompat(PRISTINE, LABEL);
  const context = evaluatePatched(changed.src, {});
  const provider = new context.FileSystemSkillProvider({}, {}, { includeDefaultRoots: false });
  const roots = await provider.roots();
  assert.equal(roots.filter((r) => String(r.source).startsWith('user-')).length, 0, 'includeDefaultRoots=false 则全部 user 根缺席');
});
