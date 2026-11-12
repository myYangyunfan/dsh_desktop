'use strict';

// ---------------------------------------------------------------------------
// 聊天历史「滚到顶自动翻页」补丁（BUG1 体验收口）。
//
// 靶：@deepseek-ai/dsh-client-ui-chat/lib/client.js 的 ChatView。现状是列表顶部
// 一个手动「加载更早」按钮，用户必须逐次点击；配合每页放大与不连续页解锁后，
// 一次点击虽能加载更多，但仍不自动。
//
// 本补丁在流程列（[data-chat-flow] column）顶部注入一个 1px 哨兵 <div>，用
// IntersectionObserver 观察它：一旦滚入视口（且 openState==='open' && hasMore &&
// !loadingOlder）即复用既有的「带锚点翻页」入口（它先记录阅读位置再取更旧一页，
// 落地后还原），因此刻意不触碰被源码注释标注为 "Scroll frames are hot" 的
// onScroll 采样路径，改由浏览器合成的 IO 回调异步驱动，风险更低。loadingOlder
// 已在 session-controller.loadOlder 内做并发门，IO 初始回调与级式补页均被自节流。
//
// 两处注入（multi-site）：① ChatView 体内、return JSX 之前加 useRef(哨兵) +
// useEffect(IO)，二者均无条件、位于组件顶层 hook 序列中，hook 顺序稳定；② 在
// flow column 的 children 首位插入哨兵 div。
//
// 三代锚点（0.2.0-rc.2 把 ChatView 的滚动逻辑拆成了 useChatViewport /
// useChatScroll / ChatNavigation，翻页入口由局部 loadOlderAnchored() 变成
// scroll.loadEarlier()，scrollerOf() 助手被内联成 list.closest(...)；0.2.1-rc.1 又在
// flow column 开标签里插入 data-chat-motion，使 jsx 锚点换代）：按世代
// 成对命中才应用，绝不允许 hooks 与 jsx 取自不同世代。
// ---------------------------------------------------------------------------

const CHAT_AUTOLOAD_MARKER = 'dsh-desktop compat: auto-load older via top sentinel';

// --- 世代 A：0.2.0-rc.2（现行 pin）---
// hooks 注入点 = ChatView 唯一 return JSX 的头两行（3 tab return + 4 tab className）。
const ANCHOR_HOOKS_RC2 = '\t\t\treturn (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tclassName: ChatView_module_css_default.frame,';
const INJECT_HOOKS_RC2 = [
  '\t\t\t/* ' + CHAT_AUTOLOAD_MARKER + ' (BUG1): a top sentinel observed with',
  '\t\t\t   IntersectionObserver auto-invokes the existing anchored pager when it scrolls',
  '\t\t\t   into view, instead of requiring a manual "Load earlier" click. It deliberately',
  '\t\t\t   avoids the hot onScroll sampling path. */',
  '\t\t\tconst olderSentinelRef = (0, react.useRef)(null);',
  '\t\t\t(0, react.useEffect)(() => {',
  '\t\t\t\tconst node = olderSentinelRef.current;',
  '\t\t\t\tconst list = scroll.listRef.current;',
  '\t\t\t\tif (node === null || list === null) return;',
  '\t\t\t\tif (openState !== "open" || !hasMore || loadingOlder) return;',
  '\t\t\t\tconst observer = new IntersectionObserver((records) => {',
  '\t\t\t\t\tif (records.some((record) => record.isIntersecting)) scroll.loadEarlier();',
  '\t\t\t\t}, { root: list.closest("[data-conversation-scroll]") ?? list, rootMargin: "300px" });',
  '\t\t\t\tobserver.observe(node);',
  '\t\t\t\treturn () => { observer.disconnect(); };',
  '\t\t\t}, [hasMore, loadingOlder, openState]);',
  ANCHOR_HOOKS_RC2,
].join('\n');
// jsx 注入点 = flow column 开标签的 data-chat-flow + children: [ 两行（8 tab），
// 哨兵作为 children 首项（9 tab）。
const ANCHOR_JSX_RC2 = '\t\t\t\t\t\t\t\t"data-chat-flow": "",\n\t\t\t\t\t\t\t\tchildren: [';
const INJECT_JSX_RC2 = ANCHOR_JSX_RC2 + '\n' + [
  '\t\t\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("div", { ref: olderSentinelRef, "aria-hidden": true, style: { height: 1 } }),',
].join('\n');

// --- 世代 B：0.1.6 及更早（在野副本；rc.2 已删 navigateToTurn 的 useCallback 形态）---
const ANCHOR_HOOKS_V1 = '\t\t\tconst navigateToTurn = (0, react.useCallback)((item) => {';
const INJECT_HOOKS_V1 = [
  '\t\t\t/* ' + CHAT_AUTOLOAD_MARKER + ' (BUG1): a top sentinel observed with',
  '\t\t\t   IntersectionObserver auto-invokes the existing anchored pager when it scrolls',
  '\t\t\t   into view, instead of requiring a manual "Load earlier" click. It deliberately',
  '\t\t\t   avoids the hot onScroll sampling path. */',
  '\t\t\tconst olderSentinelRef = (0, react.useRef)(null);',
  '\t\t\t(0, react.useEffect)(() => {',
  '\t\t\t\tconst node = olderSentinelRef.current;',
  '\t\t\t\tconst list = listRef.current;',
  '\t\t\t\tif (node === null || list === null) return;',
  '\t\t\t\tif (openState !== "open" || !hasMore || loadingOlder) return;',
  '\t\t\t\tconst root = scrollerOf(list);',
  '\t\t\t\tconst observer = new IntersectionObserver((records) => {',
  '\t\t\t\t\tif (records.some((record) => record.isIntersecting)) loadOlderAnchored();',
  '\t\t\t\t}, { root, rootMargin: "300px" });',
  '\t\t\t\tobserver.observe(node);',
  '\t\t\t\treturn () => { observer.disconnect(); };',
  '\t\t\t}, [hasMore, loadingOlder, openState]);',
  ANCHOR_HOOKS_V1,
].join('\n');
const ANCHOR_JSX_V1 = '\t\t\t\t\t\t\t"data-chat-flow": "",\n\t\t\t\t\t\t\tchildren: [';
const INJECT_JSX_V1 = ANCHOR_JSX_V1 + '\n' + [
  '\t\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("div", { ref: olderSentinelRef, "aria-hidden": true, style: { height: 1 } }),',
].join('\n');

// --- 世代 C：0.2.1-rc.1（现行 pin）---
// hooks 注入点与 rc.2 逐字相同（ChatView 的 return JSX 头两行没动）；flow column 的
// 开标签在 data-chat-flow 与 children 之间多了 `data-chat-motion`（collapseTiming 偏好
// 落地的那个属性），所以只有 jsx 锚点需要换代——按「同世代成对命中」的规矩另立一代，
// 不与 rc.2 的 jsx 混用。
const ANCHOR_JSX_V2 = [
  '\t\t\t\t\t\t\t\t"data-chat-flow": "",',
  '\t\t\t\t\t\t\t\t"data-chat-motion": deferCompletedTurns && scroll.initialized && (running || motionTail || pendingInputs.length > 0) ? "" : void 0,',
  '\t\t\t\t\t\t\t\tchildren: [',
].join('\n');
const INJECT_JSX_V2 = ANCHOR_JSX_V2 + '\n' + [
  '\t\t\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("div", { ref: olderSentinelRef, "aria-hidden": true, style: { height: 1 } }),',
].join('\n');

// --- 世代 D：0.2.2-rc.2（现行 pin，整包 minify 后的产物）---
// rc.2 的 dsh-client-ui-chat/lib/client.js 是压成单行的 bundle：缩进/换行/空格全没了，
// `"div"` 变反引号模板串、`jsxs)(...)` 紧贴 `return`、对象字面量无空格。语义与世代 C 一致
// （useChatScroll + scroll.loadEarlier + data-chat-motion 都在），所以注入体照旧，只把锚点
// 换成 minify 后的真字节——按「同世代成对命中」另立一代，不与格式化世代混用。
const ANCHOR_HOOKS_MIN = 'return(0,react_jsx_runtime.jsxs)(`div`,{className:ChatView_module_css_default.frame,children:[';
const INJECT_HOOKS_MIN = [
  '/* ' + CHAT_AUTOLOAD_MARKER + ' (BUG1): a top sentinel observed with',
  '   IntersectionObserver auto-invokes the existing anchored pager when it scrolls',
  '   into view, instead of requiring a manual "Load earlier" click. It deliberately',
  '   avoids the hot onScroll sampling path. */',
  'const olderSentinelRef=(0,react.useRef)(null);',
  '(0,react.useEffect)(()=>{',
  '\tconst node=olderSentinelRef.current;',
  '\tconst list=scroll.listRef.current;',
  '\tif(node===null||list===null)return;',
  '\tif(openState!=="open"||!hasMore||loadingOlder)return;',
  '\tconst observer=new IntersectionObserver((records)=>{',
  '\t\tif(records.some((record)=>record.isIntersecting))scroll.loadEarlier();',
  '\t},{root:list.closest("[data-conversation-scroll]")??list,rootMargin:"300px"});',
  '\tobserver.observe(node);',
  '\treturn()=>{observer.disconnect();};',
  '},[hasMore,loadingOlder,openState]);',
  ANCHOR_HOOKS_MIN,
].join('\n');
const ANCHOR_JSX_MIN = '"data-chat-flow":``,"data-chat-motion":deferCompletedTurns&&scroll.initialized&&(running||motionTail||pendingInputs.length>0)?``:void 0,children:[';
const INJECT_JSX_MIN = ANCHOR_JSX_MIN + '\n' + [
  '(0,react_jsx_runtime.jsx)("div",{ref:olderSentinelRef,"aria-hidden":true,style:{height:1}}),',
].join('\n');

// 世代表顺序即优先级：先 minify 后的 0.2.2（现行 pin），再 0.2.1 / rc.2 / v1 格式化形态。
const CHAT_AUTOLOAD_GENERATIONS = [
  { id: '0.2.2', hooks: ANCHOR_HOOKS_MIN, hooksInjection: INJECT_HOOKS_MIN, jsx: ANCHOR_JSX_MIN, jsxInjection: INJECT_JSX_MIN },
  { id: '0.2.1', hooks: ANCHOR_HOOKS_RC2, hooksInjection: INJECT_HOOKS_RC2, jsx: ANCHOR_JSX_V2, jsxInjection: INJECT_JSX_V2 },
  { id: 'rc.2', hooks: ANCHOR_HOOKS_RC2, hooksInjection: INJECT_HOOKS_RC2, jsx: ANCHOR_JSX_RC2, jsxInjection: INJECT_JSX_RC2 },
  { id: '0.1.6', hooks: ANCHOR_HOOKS_V1, hooksInjection: INJECT_HOOKS_V1, jsx: ANCHOR_JSX_V1, jsxInjection: INJECT_JSX_V1 },
];

const hits = (src, needle) => src.split(needle).length - 1;

function transformChatAutoLoadOlder(src, file) {
  if (src.includes(CHAT_AUTOLOAD_MARKER)) return { status: 'already' };
  const generation = CHAT_AUTOLOAD_GENERATIONS.find((g) => hits(src, g.hooks) === 1 && hits(src, g.jsx) === 1);
  if (generation === void 0) {
    const detail = CHAT_AUTOLOAD_GENERATIONS
      .map((g) => g.id + '(hooks=' + hits(src, g.hooks) + ', jsx=' + hits(src, g.jsx) + ')')
      .join(' / ');
    return { status: 'anchor-missing', detail: '聊天自动翻页锚点无成对命中的世代(' + detail + ')，跳过 ' + file };
  }
  let patched = src.replace(generation.hooks, () => generation.hooksInjection);
  patched = patched.replace(generation.jsx, () => generation.jsxInjection);
  if (patched === src) {
    return { status: 'anchor-missing', detail: '未找到聊天自动翻页锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: patched };
}

module.exports = {
  CHAT_AUTOLOAD_MARKER,
  transformChatAutoLoadOlder,
};
