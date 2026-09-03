'use strict';

// ---------------------------------------------------------------------------
// unit-sidebar-md-code-guard.test.js
//
// Issue #171「0.5.6 查看 md 文件报错」回归 / characterization。
//
// 现象（截图 .tmp-issues/img171.png）：
//   dsh-better-sidebar: Cannot read properties of undefined (reading 'code')
//   （RenderBoundary 每 tab 错误边界捕获的是渲染期 throw → 说明当时某组件在
//    render 中解引用了 undefined 的 .code）。
//
// 判定（当前 main / 插件 v0.15.2 + 0.5.7 侧边栏批次）：
//   该报错在插件自有代码里【无法复现，已被覆盖】。证据链：
//   1) 插件自有 src 与构建产物 lib/client.js、lib/client-registry.js 里所有
//      `.code` 读取均已判空/守卫（可选链 `?.code` / `instanceof SidebarApiError`
//      / `'code' in error` / 非空 close 事件参数 / `!== undefined` 前置判定）；
//      不存在 `res.code` / `parsed.error.code` / `result.code` 这类对 RPC 响应
//      裸解引用 `.code` 的写法。
//   2) RPC 漏斗 api.call（api.ts:114-121）在返回 undefined 时（parsed===null 或
//      parsed.value===undefined）先抛 SidebarApiError（code 回落 'http'），
//      绝不会把 undefined 透传给下游再读 `.code`——正是任务点名的
//      「RPC 返回 undefined 时读 .code」场景，已判空兜底。
//   3) 文件查看失败链在 0.5.7 批次（24eb52b6 三连修 / 7def3f7d / 5b9a91ee /
//      f3634367）重做为「内联错误态 + <pre> 只读预览兜底 + chunk 自动重试」：
//      EditorHost.fail / lazy-chunk 失败都 setLoad/setState({status:'error'})
//      渲染内联提示，error.code 只在 `instanceof SidebarApiError` 分支读取，
//      不在 render 期 throw → RenderBoundary 无从被 md 打开路径触发。
//
// 不硬造修复：本测试只锁定"当前已安全"的事实（回归位）。若有人重新引入裸
// `.code` 解引用、或删掉 RPC 的 undefined 兜底 / 内联错误态，即变红。
// vendored CodeMirror/mermaid bundle（lib/client-editor.js、lib/client-mermaid.js）
// 不在扫描范围（第三方内部，插件不碰）。
//
// 运行：node --test scripts/test/unit-sidebar-md-code-guard.test.js
// （纯源码文本契约，不依赖 DOM / 内核 / 网络。）
// ---------------------------------------------------------------------------

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const PLUGIN = path.join(__dirname, '..', '..', 'assets', 'plugins', 'dsh-better-sidebar');
const SRC = path.join(PLUGIN, 'src');
const API_TS = path.join(SRC, 'client', 'api.ts');
const EDITOR_HOST = path.join(SRC, 'client', 'EditorHost.tsx');
const VIEWERS = path.join(SRC, 'client', 'builtins', 'viewers.tsx');
const LAZY_CHUNK = path.join(SRC, 'client', 'lazy-chunk.tsx');
const RENDER_BOUNDARY = path.join(SRC, 'client', 'RenderBoundary.tsx');

/** 递归收集 src 下所有 .ts/.tsx 源文件。 */
function collectSources(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...collectSources(p));
    else if (/\.(ts|tsx)$/.test(ent.name)) out.push(p);
  }
  return out;
}

// 「危险」模式：对 RPC 响应对象裸解引用 .code（无可选链、无 instanceof 守卫）——
// 这正是 0.5.6「undefined (reading 'code')」的成因形态。
const DANGEROUS = [
  // 形如 parsed.code / response.code / result.code / data.code / res.code …
  /(^|[^?\w.])(?:parsed|response|resp|res|reply|result|data|body|payload|value|json)\s*\.\s*code\b/,
  // 形如 x.error.code / x.data.code / x.result.code（可选链的 ?.error?.code 不匹配：
  // error 与 .code 之间夹了 '?'，\s*\. 无法跨过）
  /\.\s*(?:error|data|result|value|payload)\s*\.\s*code\b/,
];

// ===========================================================================
// 1. 全 src 无「裸 .code 解引用 RPC 响应」的写法
// ===========================================================================

test('#171 src 全量：不存在对 RPC 响应裸解引用 .code 的危险写法', () => {
  const files = collectSources(SRC);
  assert.ok(files.length >= 20, `应扫到插件 src 源文件，实际 ${files.length}`);
  const offenders = [];
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (DANGEROUS.some((re) => re.test(line))) {
        offenders.push(`${path.relative(PLUGIN, f)}:${i + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `发现未判空的 .code 解引用（#171 复发风险）:\n${offenders.join('\n')}`);
});

test('#171 反例自检：危险正则确能捕获裸 RPC .code（防空测试）', () => {
  // 保证上面那条扫描不是"永远为真"的空断言：喂危险样例必须命中。
  assert.ok(DANGEROUS.some((re) => re.test('  const c = response.error.code')));
  assert.ok(DANGEROUS.some((re) => re.test('  const c = parsed.error.code')));
  assert.ok(DANGEROUS.some((re) => re.test('  if (res.code === 500) x')));
  // 安全样例不得命中。
  assert.ok(!DANGEROUS.some((re) => re.test("  parsed?.error?.code ?? 'http'")), '可选链 + 兜底不得被判危险');
  assert.ok(!DANGEROUS.some((re) => re.test('  error instanceof SidebarApiError && error.code === "http"')), 'instanceof 守卫的单层 error.code 不得被判危险');
});

// ===========================================================================
// 2. RPC 漏斗对 undefined 响应的判空兜底（任务点名的场景）
// ===========================================================================

test('#171 api.call：value===undefined 先抛 SidebarApiError，code 读用可选链 + ?? 兜底', () => {
  const src = fs.readFileSync(API_TS, 'utf8');
  // ① undefined 响应在解引用前就被拦成异常（value===undefined → throw）。
  assert.match(src, /parsed\.value === undefined/, '应显式判定 parsed.value === undefined 并抛错');
  // ② code 读取必带可选链 + 兜底码，绝不解引用 undefined。
  assert.match(src, /parsed\?\.error\?\.code\s*\?\?\s*['"]http['"]/, "应用 parsed?.error?.code ?? 'http' 形态");
  // ③ 不得出现裸 parsed.error.code。
  assert.ok(!/parsed\.error\.code\b/.test(src), '不得出现裸 parsed.error.code');
  // call 与 fetchUpload 两条漏斗都要守。
  const guardCount = (src.match(/parsed\?\.error\?\.code\s*\?\?\s*['"]http['"]/g) || []).length;
  assert.ok(guardCount >= 2, `两条 RPC 漏斗都该有兜底，实得 ${guardCount}`);
});

test('#171 构建产物 client.js/client-registry.js：RPC 漏斗同样判空（src↔lib 一致）', () => {
  for (const f of ['client.js', 'client-registry.js']) {
    const p = path.join(PLUGIN, 'lib', f);
    assert.ok(fs.existsSync(p), `缺构建产物 ${f}`);
    const src = fs.readFileSync(p, 'utf8');
    assert.match(src, /parsed\.value === void 0/, `${f} 应含 undefined value 守卫（void 0 形态）`);
    assert.match(src, /parsed\?\.error\?\.code\s*\?\?\s*"http"/, `${f} 应含可选链 + ?? "http" 兜底`);
    assert.ok(!/[^?]\bparsed\.error\.code\b/.test(src), `${f} 不得出现裸 parsed.error.code`);
  }
});

// ===========================================================================
// 3. 文件查看失败链「内联渲染、不在 render 期 throw」——RenderBoundary 不被触发
// ===========================================================================

test('#171 EditorHost.fail：error.code 只在 instanceof 分支读，失败走内联 error 态', () => {
  const src = fs.readFileSync(EDITOR_HOST, 'utf8');
  // code 读取被 instanceof 守卫。
  assert.match(src, /error instanceof SidebarApiError && \(error\.code === ['"]network['"] \|\| error\.code === ['"]http['"]\)/,
    'retryable 判定应在 instanceof SidebarApiError 之后');
  // 失败落到内联错误态（setLoad status:'error'），而非 throw。
  assert.match(src, /setLoad\(\{[\s\S]*?status: 'error'/, 'fail() 应 setLoad({status:\'error\'}) 内联渲染');
  assert.match(src, /message: error instanceof Error \? error\.message : String\(error\)/,
    '错误消息取值应判型，不解引用可能 undefined 的对象');
});

test('#171 viewers/lazy-chunk：editor chunk 失败用 <pre> 只读预览兜底（不 throw）', () => {
  const viewers = fs.readFileSync(VIEWERS, 'utf8');
  assert.match(viewers, /function TextFallback/, '应存在 TextFallback 只读兜底组件');
  assert.match(viewers, /<pre/, 'TextFallback 应渲染 <pre> 内联预览');
  const lazy = fs.readFileSync(LAZY_CHUNK, 'utf8');
  // chunk 失败 setState 内联错误态，配 fallback 渲染器，绝不在 render 抛。
  assert.match(lazy, /setState\(\{ status: 'error'/, 'chunk 失败应 setState({status:\'error\'}) 内联态');
  assert.match(lazy, /status === 'error'/, '错误态应被渲染消费（内联提示/降级预览）');
});

test('#171 RenderBoundary 契约：捕获渲染 throw 显示插件前缀文案（与截图一致的错误面）', () => {
  const src = fs.readFileSync(RENDER_BOUNDARY, 'utf8');
  // 截图里的 `dsh-better-sidebar: <message>` 正是此边界渲染出来的；它捕获的是 throw，
  // 而上面三例证明 md 打开链路不再在 render 期 throw。
  assert.match(src, /dsh-better-sidebar:/, 'RenderBoundary 应渲染 "dsh-better-sidebar:" 前缀（截图错误面来源）');
  assert.match(src, /getDerivedStateFromError|componentDidCatch/, '应是错误边界（捕获子树 render throw）');
});
