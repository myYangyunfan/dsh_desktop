// ===========================================================================
// 补丁产物可解析性门禁（issue 2026-10-17 内核 0.2.1-rc.1 换代实测）
//
// 判据：补丁层（patch-registry 全部 PatchSpec）在装机树里写过的每一个 JS 文件，
// 必须能被 JS 引擎解析。语法坏在补丁层里是**全链静默**的：
//   · `check-syntax.js` 只扫本仓库入口文件，不看 node_modules 产物；
//   · `patch-deps.js` 只判「锚点命中 + marker 在场」，注入体是不是合法 JS 它不知道；
//   · `patch-surface verify` 只比对字节，坏字节也能自证一致（快照与产物一起坏）。
// 于是坏产物唯一的显形点是真开机：浏览器侧 `__ModuleLoader__` 对整束 combo 里
// 任何一个成员解析失败即「skipped after an earlier failure of this bundle」，
// 页面渲染成 "Failed to load plugins" 铺满 80 条 —— 内核 node 进程照常起、
// boot 五步全 OK、stderr 零 failed to load。本轮就是这条：0.2.1 重锚时
// `patch-session-manage.js` 的 remotes 注入体残留 5 行 `sourceLocation` 尾巴，
// `@deepseek-ai/dsh-api-remotes/lib/client.js` 当场 SyntaxError。
//
// 运行：node --test scripts/test/unit-patch-output-parsable.test.js
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const { collectMarkers, buildSurface } = require('../../scripts/compat/patch-surface.js');

const DESKTOP = path.resolve(__dirname, '..', '..');

/**
 * 采集「补丁层写过的文件」= 装机树里带干预标记的 JS 产物。
 * 判据源用 `patch-surface` 的同一套标记扫描（marker 来自本仓补丁源码，不硬编码名单），
 * 而不是 PatchSpec 的目标解析——后者按布局返回的是 node_modules **根**（三处落点），
 * 逐根的 pkgRel 藏在各补丁脚本里，用它采样会漏（实测只采到 26 个，而真面 109 个）。
 * 覆盖因此比 `@deepseek-ai` 单根快照（85 个）更宽：含 `@earendil-works/pi-ai`、
 * `@openai/codex`、`@anthropic-ai/sdk` 等跨根产物。
 */
function collectTargets() {
  const markers = collectMarkers(path.resolve(DESKTOP, '..'));
  const surface = buildSurface(path.join(DESKTOP, 'node_modules'), markers).surface;
  return surface
    .map((e) => path.join(DESKTOP, 'node_modules', ...e.file.split('/')))
    .filter((f) => fs.existsSync(f))
    .sort();
}

/**
 * 单文件可解析性：先按 CJS/script 在进程内编译（`new vm.Script` 与 `node --check` 同源，
 * 但不必为 109 个文件各起一个进程），抛 SyntaxError 后再按 ESM 复判一次——
 * **两种形态都解析不了**才算坏。装机树里两类混着：`@deepseek-ai/<包>/lib` 下多为 CJS，
 * 而 `lib/types` 声明文件、`@earendil-works/pi-ai/dist` 与 `@opentelemetry` 的 esm 构建是 ESM
 * （实测 5 个 ESM 产物按 CJS 判会误报 `Unexpected token 'export'`，靠形态猜测不划算，直接两判）。
 * @returns {string|null} null = 可解析；否则返回引擎原文错误（含行号）
 */
function parseError(file) {
  const src = fs.readFileSync(file, 'utf8');
  // `.html` 产物（`kernel-web-boot-watchdog` 注入的被服务页面）：判的是页内所有
  // 内联 <script> 的**函数体**，不是整份 HTML。别把 html 从判据面里摘掉——
  // 它是唯一「注入体在运行时真的会执行」的落点（见 AGENTS.md 那条静默坑）。
  if (/\.html?$/i.test(file)) {
    const bad = [];
    const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let m;
    let i = 0;
    while ((m = re.exec(src)) !== null) {
      i += 1;
      const body = m[1];
      if (!body.trim()) continue; // 只有 src 的外链脚本，没有内联体
      try {
        vm.compileFunction(body, [], { filename: `${file}#script${i}` });
      } catch (e) {
        bad.push(`${file}: 内联 script#${i}「${e.message}」`);
      }
    }
    return bad.length ? bad.join('\n') : null;
  }
  let first = null;
  try {
    new vm.Script(src, { filename: file });
    return null;
  } catch (e) {
    if (!(e instanceof SyntaxError)) return null; // 非语法类（如 IO）不在本判据面
    first = e.message;
  }
  const tmp = path.join(os.tmpdir(), `.dsh-parsable-${path.basename(file, '.js')}-${process.pid}.mjs`);
  fs.writeFileSync(tmp, src);
  try {
    execFileSync(process.execPath, ['--check', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
    return null;
  } catch (e2) {
    return `${file}: script 形态「${first}」／module 形态「${String(e2.stderr || e2.message).trim().split('\n').slice(0, 3).join(' ')}」`;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

test.after(() => {
  // ctx() 的临时 home 只用于拼路径，从不写入；这里仍按存在即删兜一行。
  for (const f of collectCleanups()) fs.rmSync(f, { recursive: true, force: true });
});

const _cleanups = [];
function collectCleanups() { return _cleanups; }

test('补丁产物逐个可解析（装机树 marker 面，零 SyntaxError）', () => {
  const files = collectTargets();
  // 覆盖哨兵：判据面必须真采到补丁产物，否则「零失败」是空转的绿。
  // 现值 2026-11-11：110 个带干预标记的产物（109 个 JS + `dsh-web-frontend/dist/index.html`
  // 里那段看门狗注入体——判据面自 `patch-surface` 起收 .html，见 parseError 的 html 分支）；
  // 阈值取约六成，防「采集脱靶」把这条判据变成摆设。
  assert.ok(files.length >= 60, `只采到 ${files.length} 个补丁产物，采集已脱靶（判据将空转）`);
  const bad = [];
  for (const f of files) {
    const err = parseError(f);
    if (err) bad.push(err);
  }
  assert.deepEqual(bad, [], `补丁注入体产出非法 JS（浏览器 bundle 整束跳过 → 页面 Failed to load plugins）：\n${bad.join('\n')}`);
});

test('反证：尾巴残留（本轮真实坏形）必须被判红，修好的形态必须判绿', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-parsable-proof-'));
  _cleanups.push(home);
  const anchor = [
    '\t\t\t\t\tsourceLocation: {',
    '\t\t\t\t\t\t"file": "packages/api/workspace-controller/src/index.ts",',
    '\t\t\t\t\t\t"line": 170,',
    '\t\t\t\t\t\t"column": 3',
    '\t\t\t\t\t}',
    '\t\t\t\t},',
  ].join('\n');
  // 真形状：anchor 是「unarchiveSession 条目的 sourceLocation + 收尾」，收尾的 `},`
  // 关掉的是**条目对象本身**，所以它之后的键回到 descriptors 层——注入体必须按这个
  // 层次续写，多抄一遍尾巴（没有 `sourceLocation: {` 开头）就是本轮的坏形。
  const prefix = 'const descriptors = {\n\t"workspace/unarchiveSession": {\n\t\tservice: "workspaceController",\n';
  const suffix = '};\n';
  const validEntry = '\t"workspace/deleteSession": { service: "workspaceController" }\n';
  // 坏形 = 当年注入体里那段「锚点之后又抄了一遍尾巴（没有 sourceLocation 开头）」，
  // 它与锚点逐字相容、marker 也在场，patch-deps 与快照都看不见它坏。
  const danglingTail = [
    '\t\t\t\t\t\t"file": "packages/api/workspace-controller/src/index.ts",',
    '\t\t\t\t\t\t"line": 170,',
    '\t\t\t\t\t\t"column": 3',
    '\t\t\t\t\t}',
    '\t\t\t\t},',
  ].join('\n') + '\n';
  const broken = path.join(home, 'broken.js');
  fs.writeFileSync(broken, prefix + anchor + '\n' + danglingTail + suffix);
  assert.ok(parseError(broken), '残留尾巴形态未被判红 —— 本门禁对这次的事故形状是瞎的');

  const fixed = path.join(home, 'fixed.js');
  fs.writeFileSync(fixed, prefix + anchor + '\n' + validEntry + suffix);
  assert.equal(parseError(fixed), null, '合法形态被误判（判据过严会常红）');

  // 反证之二：真实注入体里绝不能再出现「锚点之后紧跟无头尾巴」这一形状。
  const src = fs.readFileSync(path.join(DESKTOP, 'scripts', 'patch-session-manage.js'), 'utf8');
  const m = src.match(/const REMOTES_INVOKE_INSERT = \[([\s\S]*?)\n\]\.join\('\\n'\);/);
  assert.ok(m, '夹具失效：读不到 REMOTES_INVOKE_INSERT，本反证需在随迁时一起更新');
  assert.ok(!/"file": "packages\/api\/workspace-controller\/src\/index\.ts",\n\s*'\\t{6}"line": 170,\n\s*'\\t{6}"column": 3',\n\s*'\\t{4}\}',/.test(m[1]),
    'REMOTES_INVOKE_INSERT 里又出现无头 sourceLocation 尾巴（2026-10-17 事故形状）');
});
