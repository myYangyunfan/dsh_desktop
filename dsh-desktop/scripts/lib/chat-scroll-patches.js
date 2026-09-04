'use strict';

// ---------------------------------------------------------------------------
// 聊天历史「滚到顶自动翻页」补丁（BUG1 体验收口）。
//
// 靶：@deepseek-ai/dsh-client-ui-chat/lib/client.js 的 ChatView。现状是列表顶部
// 一个手动「加载更早」按钮（onClick: loadOlderAnchored），用户必须逐次点击；配合
// h1（每页 50→200）与 h3（不连续页不再锁死）后，一次点击虽能加载更多，但仍不自动。
//
// 本补丁在流程列（[data-chat-flow] column）顶部注入一个 0 高哨兵 <div>，用
// IntersectionObserver 观察它：一旦滚入视口（且 openState==='open' && hasMore &&
// !loadingOlder）即复用既有的 loadOlderAnchored（它会先记录锚点行再翻页，落地后
// 还原阅读位置）。刻意不触碰被源码注释标注为 "Scroll frames are hot" 的 onScroll
// 采样路径，改由浏览器合成的 IO 回调异步驱动，风险更低。loadingOlder 已在
// session-controller.loadOlder 内做并发门，IO 初始回调与级式补页均被自节流。
//
// 两处注入（multi-site）：① 在 useCallback(navigateToTurn) 前加 useRef(哨兵) +
// useEffect(IO)，二者均无条件、位于组件顶层 hook 序列中，hook 顺序稳定；② 在
// flow column 的 children 首位插入哨兵 div。两处锚点任一缺失/非唯一即整块跳过。
// ---------------------------------------------------------------------------

const CHAT_AUTOLOAD_MARKER = 'dsh-desktop compat: auto-load older via top sentinel';

// 注入点 ①：唯一锚 = navigateToTurn 的 useCallback 声明行（3 tab 缩进）。
const ANCHOR_HOOKS = '\t\t\tconst navigateToTurn = (0, react.useCallback)((item) => {';
const INJECT_HOOKS = [
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
  ANCHOR_HOOKS,
].join('\n');

// 注入点 ②：唯一锚 = flow column 开标签的 data-chat-flow + children: [ 两行（7 tab）。
const ANCHOR_JSX = [
  '\t\t\t\t\t\t\t"data-chat-flow": "",',
  '\t\t\t\t\t\t\tchildren: [',
].join('\n');
const INJECT_JSX = [
  '\t\t\t\t\t\t\t"data-chat-flow": "",',
  '\t\t\t\t\t\t\tchildren: [',
  '\t\t\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("div", { ref: olderSentinelRef, "aria-hidden": true, style: { height: 1 } }),',
].join('\n');

function transformChatAutoLoadOlder(src, file) {
  if (src.includes(CHAT_AUTOLOAD_MARKER)) return { status: 'already' };
  const hookHits = src.split(ANCHOR_HOOKS).length - 1;
  const jsxHits = src.split(ANCHOR_JSX).length - 1;
  // 两处锚点都必须唯一命中；否则视为版本漂移，绝不部分应用。
  if (hookHits !== 1 || jsxHits !== 1) {
    return { status: 'anchor-missing', detail: '聊天自动翻页锚点命中异常(hooks=' + hookHits + ', jsx=' + jsxHits + ')，跳过 ' + file };
  }
  let patched = src.replace(ANCHOR_HOOKS, () => INJECT_HOOKS);
  patched = patched.replace(ANCHOR_JSX, () => INJECT_JSX);
  if (patched === src) {
    return { status: 'anchor-missing', detail: '未找到聊天自动翻页锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: patched };
}

module.exports = {
  CHAT_AUTOLOAD_MARKER,
  transformChatAutoLoadOlder,
};
