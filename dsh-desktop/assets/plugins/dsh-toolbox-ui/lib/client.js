window.__ModuleLoader__.load({
	id: 'dsh-toolbox-ui',
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
// MCP 市场 UI browser bundle：右下角浮动按钮打开响应式管理面板。
var React = require('react');
var __injectCss = function(text) {
  if (typeof document === 'undefined') return () => {};
  var id = 'dsh-toolbox-ui/mcp.css';
  var tag = document.querySelector('style[data-plugin-css="' + id + '"]');
  var created = false;
  if (!tag) {
    tag = document.createElement('style');
    // 两个属性都要盖，与官方构建器 styleInjectionModule 生成的一致
    // （packages/client/tsdown.client.ts）：
    //   data-plugin     模块加载器认领与清理样式的凭据（entry-lifecycle.ts 的
    //                   removeOwnedStyles 只删 data-plugin === 插件 id 的标签）
    //   data-plugin-css 本插件自己的去重键
    // 只盖 pluginCss 时，加载器只能靠「materialize 期间新出现的未打标 style」兜底认领；
    // 若标签在认领窗口之外插入，HMR 卸载就会留下孤儿 style。
    tag.dataset.plugin = 'dsh-toolbox-ui';
    tag.dataset.pluginCss = id;
    document.head.appendChild(tag);
    created = true;
  }
  try {
    tag.textContent = text;
  } catch (error) {
    if (created) tag.remove();
    throw error;
  }
  return () => tag.remove();
};
const React2 = React;
const { useState, useEffect, useCallback, useMemo, useRef } = React2;

/* 主题令牌别名层。DSH 的 ui-theme 拥有全部颜色、几何与字体：插件只消费语义令牌，
   不写死色值、不写局部圆角数值（docs/web-styling.md：「Use --dsw-alias-* semantic
   tokens in feature components. Do not copy static palette values or write literal
   colors there.」）。要用的令牌在这里一次性收成 --mcp-* 别名，后面的规则只引用别名——
   换主题、调刻度都只改这一处。

   挂在 body 而不是 .dsh-mcp-wrap 上：本插件有三个互不相邻的 slot 子树
   （shell.overlay 的悬浮按钮、sidebar.footer.action 的侧栏入口、面板自己），它们
   没有公共祖先，别名必须定义在共同祖先上。

   也不能挂在 :root：ui-theme 把全部 --dsw-alias-* 定义在 **body** 上
   （design-platform.css 的 `body{}` 与 `body[data-ds-dark-theme]{}`），而 :root 是 body
   的祖先——自定义属性在声明处就完成替换，在 :root 上写 `var(--dsw-alias-*)` 会取到空值，
   整片别名失效（实测卡片与面板背景变透明）。

   两点容易踩：
   - 几何走 --dsw-radius-*（docs/ui-radius.md 的分级），不写字面数值。官方 spec 把
     「>4px 且 <99px 的字面圆角」判为违规，≤4px 才算绘图细节。
   - 等宽字体是 --ds-font-family-code（ui-theme/src/styles/base.css 的 :root 里定义的就是
     它，官方 51 处用它）。别用 --dsw-font-mono：那个名字全仓没有定义，只是个约定俗成的
     引用目标，用上它等于永远命中 fallback，等宽字形跟宿主代码块对不上。 */
const MCP_CSS = `body{--mcp-accent:var(--dsw-alias-brand-primary);--mcp-ok:var(--dsw-alias-state-success-primary);--mcp-err:var(--dsw-alias-state-error-primary);--mcp-warn:var(--dsw-alias-state-warn-primary);--mcp-info:var(--dsw-alias-state-business-primary);--mcp-mut:var(--dsw-alias-label-secondary);--mcp-bg-1:var(--dsw-alias-bg-layer-1);--mcp-bg-2:var(--dsw-alias-bg-layer-2);--mcp-bg-3:var(--dsw-alias-bg-layer-3);--mcp-line:var(--dsw-alias-border-l2);--mcp-mono:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);--mcp-r-xs:var(--dsw-radius-xs);--mcp-r-sm:var(--dsw-radius-sm);--mcp-r-md:var(--dsw-radius-md);--mcp-r-lg:var(--dsw-radius-lg);--mcp-r-xl:var(--dsw-radius-xl);--mcp-r-panel:var(--dsw-radius-panel)}
.dsh-mcp-wrap,.dsh-mcp-panel-overlay,.dsh-mcp-overlay,.dsh-mcp-fab,.dsh-mcp-footer-action,.dsh-mcp-toast{color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit)}
.dsh-mcp-wrap{box-sizing:border-box;display:flex;flex-direction:column;height:100%;min-height:0;gap:16px;padding:0;font-size:12.5px;-webkit-font-smoothing:antialiased}
.dsh-mcp-wrap ::-webkit-scrollbar{width:8px;height:8px}
.dsh-mcp-wrap ::-webkit-scrollbar-thumb{background:var(--dsw-alias-scrollbar-bg-l2);border-radius:999px;corner-shape:round;border:2px solid transparent;background-clip:padding-box}
.dsh-mcp-wrap ::-webkit-scrollbar-thumb:hover{background:var(--dsw-alias-scrollbar-hover-l2);border:2px solid transparent;background-clip:padding-box}
.dsh-mcp-wrap ::-webkit-scrollbar-track{background:transparent}
/* 标题栏四列钉死：标题 | 能力层 | 操作区（占满剩余，**内容右对齐**）| 关闭。
   原型就是这样排的：能力层贴着标题在左，功能按钮贴右，中间那列吃掉空白。
   曾经两个错法各来过一次：
     · flex + space-between：关闭跟着操作区宽度走，MCP 面 6 个按钮、技能面 1 个，
       一切面「关闭」横移几百像素（用户原话：「切换之后这个位置来回换位置」）；
     · 能力层与按钮组塞进同一列且左对齐：整排按钮挤在标题旁边，中间空一大块，
       与原型明显不同（用户第二次指出：「顶部这个你不还是在左边」）。
   现在四列各自锚定：切面只让第三列的内容变化，关闭永远在第四列。 */
.dsh-mcp-head{flex:none;display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;align-items:center;gap:12px}
.dsh-mcp-title{flex:none;white-space:nowrap;font-size:15px;font-weight:600;line-height:1.35;letter-spacing:.1px;display:flex;align-items:center;gap:8px}
.dsh-mcp-title::before{content:"";width:3px;height:14px;border-radius:1.5px;background:var(--mcp-accent)}
.dsh-mcp-head-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;min-width:0}
/* 按钮高度统一：32px 主按钮、28px 次按钮/图标按钮。原 30px 图标按钮与 7/13px 主按钮
   混排，同一行里永远对不齐——这是「不优雅」最显眼的来源。 */
.dsh-mcp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-sm);padding:0 12px;height:32px;background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);font-size:12.5px;font-weight:500;white-space:nowrap;cursor:pointer;transition:background .1s,border-color .1s}
.dsh-mcp-btn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}
.dsh-mcp-btn:active{background:var(--dsw-alias-interactive-bg-active)}
.dsh-mcp-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.dsh-mcp-btn.primary{background:var(--dsw-alias-button-primary-fill);border-color:transparent;color:var(--dsw-alias-label-primary-inverted)}
.dsh-mcp-btn.primary:hover{background:var(--dsw-alias-button-primary-hover)}
.dsh-mcp-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.dsh-mcp-btn.danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger);border-color:var(--dsw-alias-state-error-primary)}
/* 尺寸/形态修饰。放在 .dsh-mcp-btn 之后、且都是 (0,2,0)：与基础规则冲突的那些属性
   （padding / border-color / background）在这里一次性定死，别在别处再补一条同名的。 */
.dsh-mcp-btn.icon{width:28px;height:28px;padding:0}
.dsh-mcp-btn.sm{padding:0 8px;height:28px;font-size:11px}
.dsh-mcp-btn.ghost{border-color:transparent;background:transparent}
.dsh-mcp-btn.ghost:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:transparent}
.dsh-mcp-btn.sel{background:var(--dsw-alias-interactive-bg-hover-accent);border-color:var(--mcp-accent);color:var(--dsw-alias-label-primary)}

/* 分段控件：浅槽 + 选中项填实。能力层与模式层共用同一个控件、同一套尺寸——
   「切换管哪个能力」和「切换看到哪一面」是同一类决定，长得一样才不用重新学。
   它压过 .dsh-mcp-btn 的边框/内边距，特异性 (0,2,0)，位置在此之后。 */
/* 分段控件：32px 高，与主按钮同高，同一行里不再一高一矮。 */
.dsh-mcp-seg{display:inline-flex;gap:2px;padding:2px;flex:none;border-radius:var(--mcp-r-md);background:var(--mcp-bg-2)}
.dsh-mcp-seg .dsh-mcp-btn{border-color:transparent;background:transparent;padding:0 12px;height:28px;font-size:12.5px;border-radius:var(--mcp-r-sm)}
.dsh-mcp-seg .dsh-mcp-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-seg .dsh-mcp-btn.sel{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted);font-weight:600}
.dsh-mcp-seg-count{font-size:10px;font-weight:500;padding:0 4px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-interactive-bg-hover);color:var(--mcp-mut);line-height:14px}
.dsh-mcp-seg .dsh-mcp-btn.sel .dsh-mcp-seg-count{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary-inverted)}

/* ── 第二行：模式分段 | 作用域药丸 | 连接状态 ─────────────────────────────
   两个能力面共用这一条、共用这个三列节奏（与标题栏同款 grid）。
   三列钉死还有一个理由：右侧那句状态的长短会变（「宿主已连接」↔「skills 服务未就绪」），
   不钉死它就会推着中间的药丸左右晃——这正是标题栏关闭按钮当初漂移的同一个成因。 */
/* 第二行统一 32px 高：模式分段、作用域药丸、连接状态在同一水平线上。 */
.dsh-mcp-sub{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;flex:none;height:32px}
.dsh-mcp-sub-scope{min-width:0;display:flex;align-items:center}
/* ⚠️ 作用域条必须**吃掉中间那一列的剩余宽度**。
   .dsh-mcp-tabs-wrap 自己是 flex:none（它原来是 .dsh-mcp-wrap 这个**列**容器的直接子元素，
   靠 stretch 拿满宽度）。搬进第二行的 grid 之后，中间那列是 minmax(0,1fr)、而它在这个
   flex 行里 flex:none → 收缩到内容宽度，里面的 .dsh-mcp-tabs 的 clientWidth 于是只剩 47px，
   真机上整条只剩一个「…8」按钮（点得到、但作用域一个都看不见）。
   这条是位置与归属变更带来的回归，只有真机 getComputedStyle/clientWidth 看得见。
   （本注释里原本用反引号包了类名——那直接把 MCP_CSS 这个模板字符串**提前截断**了，
     后面的 CSS 全被当成 JS 解析，真机表现是「插件加载失败：mcp is not defined」。
     有 test/panel-css-invariants 的用例守着：样式常量正文里不得出现反引号。） */
.dsh-mcp-sub-scope .dsh-mcp-tabs-wrap{flex:1 1 auto;min-width:0}
.dsh-mcp-runtime{display:inline-flex;align-items:center;gap:5px;flex:none;white-space:nowrap;font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.dsh-mcp-runtime svg{color:var(--mcp-ok)}
.dsh-mcp-runtime.err{color:var(--mcp-err)}
.dsh-mcp-runtime.err svg{color:var(--mcp-err)}

/* ── 列表底栏：统计文本 + 排序/刷新图标组 ────────────────────────────────
   原型的「批量」要一个多选启停的 Host RPC，这一版不做——画一个点了没反应的按钮更糟。 */
.dsh-mcp-side-foot{flex:none;display:flex;align-items:center;gap:6px;border-top:1px solid var(--mcp-line);padding-top:8px;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-mcp-foot-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.dsh-mcp-foot-spacer{flex:1}
.dsh-mcp-foot-btn{box-sizing:border-box;width:24px;height:24px;flex:none;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:var(--mcp-r-sm);background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;transition:background .12s,color .12s}
.dsh-mcp-foot-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-mcp-foot-btn:disabled{opacity:.5;cursor:not-allowed}

/* 下拉菜单：「⋯ 更多」与底栏排序共用一个原语。 */
.dsh-mcp-dd{position:relative;display:inline-flex}
.dsh-mcp-dd-pop{position:absolute;top:calc(100% + 5px);right:0;z-index:60;display:flex;flex-direction:column;gap:2px;min-width:186px;padding:6px;border-radius:var(--mcp-r-lg);background:var(--mcp-bg-2);box-shadow:var(--dsw-elevation-panel)}
.dsh-mcp-dd-pop .dsh-mcp-btn{box-sizing:border-box;width:100%;justify-content:flex-start;border-color:transparent;background:transparent}
.dsh-mcp-dd-pop .dsh-mcp-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-dd-pop .dsh-mcp-btn.sel{background:var(--dsw-alias-interactive-bg-hover-accent);border-color:transparent;color:var(--dsw-alias-label-primary);font-weight:600}
.dsh-mcp-dd-pop .dsh-mcp-btn.danger{color:var(--mcp-err)}
.dsh-mcp-dd-pop .dsh-mcp-btn.danger:hover{background:var(--dsw-alias-interactive-bg-hover-danger)}
.dsh-mcp-dd-sep{height:1px;margin:4px 2px;background:var(--mcp-line)}
/* 底栏的排序按钮在最左，弹层右对齐会跑出卡片外。 */
.dsh-mcp-foot-dd .dsh-mcp-btn.icon{width:24px;height:24px;border-color:transparent;background:transparent;color:var(--dsw-alias-label-tertiary)}
.dsh-mcp-foot-dd .dsh-mcp-btn.icon:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-mcp-foot-dd .dsh-mcp-dd-pop{top:auto;bottom:calc(100% + 8px);right:0;left:auto}
/* 详情操作栏的「⋯」：靠右，与主/次行为同高。 */
.dsh-mcp-d-more{flex:none}
.dsh-mcp-body{display:flex;gap:14px;flex:1;min-height:0}
.dsh-mcp-side{width:292px;min-width:248px;min-height:0;display:flex;flex-direction:column;gap:12px;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-lg);background:var(--mcp-bg-2);padding:12px;overflow:hidden}
.dsh-mcp-side.embedded{width:auto;min-width:0;flex:1 1 auto;border:0;border-radius:0;background:transparent;padding:0;overflow:visible}
.dsh-mcp-search{position:relative;flex:none;min-width:0}
.dsh-mcp-search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:.5}
.dsh-mcp-search input{width:100%;box-sizing:border-box;padding:0 10px 0 30px;height:32px;border-radius:var(--mcp-r-md);border:1px solid var(--mcp-line);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font-size:12px;outline:none;transition:border-color .1s,box-shadow .1s}
.dsh-mcp-search input::placeholder{color:var(--mcp-mut)}
.dsh-mcp-search input:focus{border-color:var(--mcp-accent);box-shadow:none}
.dsh-mcp-list{flex:1 1 auto;min-height:52px;overflow-y:auto;display:flex;flex-direction:column;gap:4px;margin:0 -4px;padding:0 4px}
.dsh-mcp-item{position:relative;flex:none;display:flex;align-items:center;gap:10px;padding:12px;border-radius:var(--mcp-r-md);cursor:pointer;border:1px solid transparent;transition:background .1s,border-color .1s}
.dsh-mcp-item:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l2)}
.dsh-mcp-item.sel{background:var(--dsw-alias-interactive-bg-hover-accent);border-color:transparent}
.dsh-mcp-item.sel::before{content:"";position:absolute;left:-1px;top:20%;bottom:20%;width:2px;border-radius:1px;background:var(--mcp-accent)}
.dsh-mcp-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--mcp-mut);box-shadow:none;corner-shape:round}
.dsh-mcp-dot.connected{background:var(--mcp-ok);box-shadow:0 0 4px color-mix(in srgb,var(--mcp-ok) 55%,transparent)}
.dsh-mcp-dot.failed{background:var(--mcp-err);box-shadow:0 0 6px color-mix(in srgb,var(--mcp-err) 55%,transparent)}
.dsh-mcp-dot.loading{background:var(--mcp-warn);animation:mcpBlink 1.1s infinite}
@keyframes mcpBlink{50%{opacity:.35}}
.dsh-mcp-item-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.dsh-mcp-item-name-row{display:flex;align-items:center;gap:7px;min-width:0}
.dsh-mcp-item-name{font-size:12.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:.1px}
/* 状态文本是这一行里唯一会变长的东西：让它自己省略，别去挤芯片。 */
.dsh-mcp-item-meta{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-mcp-item-sub{font-size:10.5px;color:var(--mcp-mut);display:flex;gap:6px;align-items:center;min-width:0;overflow:hidden;white-space:nowrap;flex-wrap:wrap;row-gap:4px}
/* 状态芯片**不收缩**：窄面板下让它自己换行，而不是把 "HTTP" 挤成半截、被后一个芯片盖住。 */
.dsh-mcp-item-sub>.dsh-mcp-chip{flex:none}
/* ⚠️ 子行必须有 min-width:0 + overflow:hidden：它在 flex 列里（.dsh-mcp-item-main 是
   flex:1;min-width:0），只要里面放进任何**不收缩**的长文本（真机踩过：一整条根路径），
   它就会撑破 185px 的单元格并**没有省略号地**硬裁——显示成半截字，看起来像渲染坏了。
   .dsh-mcp-item-name 早就有 ellipsis，子行此前漏了。 */
.dsh-mcp-item-sub>*{min-width:0;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis}
.dsh-mcp-badge{display:inline-flex;align-items:center;padding:1.5px 7px;border-radius:999px;font-size:10.5px;font-weight:500;line-height:16px;border:1px solid var(--mcp-line);color:var(--mcp-mut);background:var(--mcp-bg-1);corner-shape:round}
.dsh-mcp-badge.dot::before{content:"";width:5px;height:5px;border-radius:50%;background:currentColor;margin-right:5px;opacity:.85;corner-shape:round}
.dsh-mcp-badge.t-http{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}
.dsh-mcp-badge.t-stdio{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-warn-primary);background:var(--dsw-alias-state-warn-tertiary)}
.dsh-mcp-badge.s-on{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-success-primary);background:var(--dsw-alias-state-success-tertiary)}
.dsh-mcp-badge.s-on.dot::before{background:var(--dsw-alias-state-success-primary)}
.dsh-mcp-badge.s-err.dot::before{background:var(--dsw-alias-state-error-primary)}
.dsh-mcp-badge.s-off{color:var(--mcp-mut);border-color:var(--mcp-line)}
.dsh-mcp-badge.s-err{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-interactive-bg-hover-danger)}
.dsh-mcp-badge.scope-ws{color:var(--mcp-accent);border-color:var(--mcp-accent);background:var(--dsw-alias-interactive-bg-hover-accent)}
.dsh-mcp-badge.t-defer{color:var(--mcp-accent);border-color:var(--mcp-accent);border-style:dashed;background:transparent}
/* 延迟开关芯片：直接复用「可点的药丸」原语（.dsh-mcp-chip，市场分类就是它）——用户在这块
   UI 里已经学会"药丸 = 可点"，所以它必须长得像药丸，而不是像状态徽标（.dsh-mcp-badge）。
   .sel = 已延迟（accent 边框 + accent 底），与市场里"选中的筛选项"同一套视觉。
   ⚠️ 这段是模板字符串：注释里**不能出现反引号**，否则会提前终止字符串（踩过，整份 CSS 变
   TypeError）。 */
.dsh-mcp-chip.sm{padding:2px 8px;font-size:10.5px;line-height:16px;gap:4px}
.dsh-mcp-chip.ro{cursor:default}
.dsh-mcp-chip.ro:hover{background:var(--mcp-bg-1);border-color:var(--mcp-line)}
.dsh-mcp-chip.ro.sel:hover{background:var(--dsw-alias-interactive-bg-hover-accent);border-color:var(--mcp-accent)}
.dsh-mcp-chip:focus-visible{outline:1px solid var(--mcp-accent);outline-offset:1px}
.dsh-mcp-detail{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:12px;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-lg);background:var(--mcp-bg-2);padding:16px;overflow:hidden}
/* 只有正文滚：头与 Tab 行 flex:none，操作栏不再随内容滑走。
   之前 .dsh-mcp-detail 自己 overflow-y:auto，头、操作按钮、Tab 与正文一起滚，
   卡片一多就「滚动一下按钮就没了」。 */
.dsh-mcp-d-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:10px;padding-right:2px}
/* 非当前页签的卡片直接不参与布局——用 visibility/height 会让正文区留下空洞。
   ⚠️ 选择器**必须**带 .dsh-mcp-detail 前缀。样式表里有两条 .dsh-mcp-card：后面那条
   （市场样式所在的长行）把它定义成 display:flex。单类选择器 .dsh-mcp-pane-off 与它
   同特异性、位置更靠前 → 被压掉，三个页签会同时显示。真机实测就是这样：
   computed display 是 flex，而类名明明挂着。
   这里用 (0,2,0) 压过任何单类规则，位置就不必再依赖先后。 */
.dsh-mcp-detail .dsh-mcp-pane-off{display:none}
.dsh-mcp-d-body>.dsh-mcp-card{flex:none}
.dsh-mcp-item-sub>.dsh-mcp-badge{border-color:transparent;background:transparent;padding-inline:0;color:var(--mcp-mut)}
.dsh-mcp-d-diag{display:flex;flex-direction:column;gap:8px}
.dsh-mcp-d-note{font-size:12px;line-height:18px;color:var(--mcp-mut)}
/* 空状态：图标方块 + 标题 + 一句说明，居中成块（原先是单行灰字，看不出「这里没有东西」
   和「这里加载失败」的区别）。 */
.dsh-mcp-d-empty{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--mcp-mut);font-size:13px;gap:4px;padding:24px 16px}
.dsh-mcp-d-empty>.dsh-mcp-d-actions{margin-top:14px;justify-content:center}
.dsh-mcp-d-empty b{font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-mcp-d-empty span{font-size:11.5px;line-height:18px;color:var(--mcp-mut);max-width:320px}
.dsh-mcp-d-empty::before{content:"";width:26px;height:26px;border-radius:var(--mcp-r-md);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-d-head{flex:none;display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
/* 详情里的 Tab 行复用作用域那套 .dsh-mcp-tab 原语，但**必须换行而不是横滚**。
   作用域条用「横滚 + ⋯ 弹层」是因为它的条目数不可控；详情页签固定三项、且窄屏下
   横滚条的滚动条是隐藏的——实测 390px 视口下 scrollWidth 431 > clientWidth 309，
   「诊断」会静默跑到屏幕外且没有任何提示。换行则三项永远都在。 */
.dsh-mcp-detail>.dsh-mcp-tabs{flex:none;gap:20px;flex-wrap:wrap;overflow:visible;border-bottom:1px solid var(--mcp-line);padding:0}
.dsh-mcp-detail>.dsh-mcp-tabs>.dsh-mcp-tab{border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;padding:8px 0 10px}
.dsh-mcp-detail>.dsh-mcp-tabs>.dsh-mcp-tab.sel{border-bottom-color:var(--mcp-accent);background:transparent}
.dsh-mcp-d-name{font-size:17px;font-weight:600;line-height:1.3;letter-spacing:.1px;display:flex;align-items:center;gap:8px;min-width:0;overflow-wrap:anywhere}
.dsh-mcp-d-meta{display:flex;gap:6px;align-items:center;margin-top:6px;flex-wrap:wrap}
.dsh-mcp-d-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.dsh-mcp-d-scope-hint{font-size:11.5px;color:var(--mcp-mut)}
.dsh-mcp-d-desc{margin:6px 0 0;font-size:12px;line-height:1.6;color:var(--mcp-mut);max-width:72ch;max-height:3.2em;overflow:hidden}
.dsh-mcp-d-description{font-size:12px;line-height:1.65;color:var(--mcp-mut);white-space:pre-wrap;overflow-wrap:anywhere}
/* 头部左侧标题列：占满 d-head 减掉操作列之后的宽度，长名字换行而不是把按钮挤下去。 */
.dsh-mcp-d-title{flex:1;min-width:0}
.dsh-mcp-card{border:1px solid var(--mcp-line);border-radius:var(--mcp-r-lg);padding:16px;background:var(--mcp-bg-1)}
.dsh-mcp-card h4{margin:0 0 10px;font-size:11px;font-weight:600;color:var(--mcp-mut);letter-spacing:.2px;display:flex;align-items:center;gap:6px}
.dsh-mcp-card h4::after{content:"";flex:1;height:1px;background:var(--mcp-line);margin-left:2px}
.dsh-mcp-kv{display:grid;grid-template-columns:auto minmax(0,1fr);gap:5px 14px;font-size:12px;word-break:break-all}
.dsh-mcp-kv>*{min-width:0}
.dsh-mcp-kv b{color:var(--mcp-mut);font-weight:500;white-space:normal;overflow-wrap:anywhere}
.dsh-mcp-tools{display:flex;flex-direction:column;gap:5px}
.dsh-mcp-tool{display:flex;gap:9px;padding:7px 9px;border-radius:var(--mcp-r-sm);background:var(--mcp-bg-1);border:1px solid transparent;transition:background .12s,border-color .12s}
.dsh-mcp-tool:hover{border-color:var(--mcp-line);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-tool-name{font-family:var(--mcp-mono);font-size:11.5px;color:var(--dsw-alias-brand-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}
.dsh-mcp-tool-desc{font-size:11.5px;color:var(--mcp-mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-mcp-empty-list{display:flex;align-items:center;justify-content:center;min-height:120px;padding:24px 16px;text-align:center;color:var(--mcp-mut);font-size:11.5px;line-height:1.65}
.dsh-mcp-overlay{position:fixed;inset:0;background:var(--dsw-alias-bg-overlay);display:flex;align-items:center;justify-content:center;z-index:200;padding:12px;animation:mcpFade .15s ease-out}
.dsh-mcp-whatsnew{box-sizing:border-box;width:min(460px,92vw);background:var(--mcp-bg-2);border:0;border-radius:var(--mcp-r-panel);padding:20px;box-shadow:var(--dsw-elevation-prominent);animation:mcpPop .2s cubic-bezier(.2,0,0,1)}
.dsh-mcp-whatsnew-head{display:flex;flex-direction:column;gap:2px;margin-bottom:12px}
.dsh-mcp-whatsnew-head b{font-size:15px;font-weight:650}
.dsh-mcp-whatsnew-head span{font-size:12px;color:var(--mcp-mut)}
.dsh-mcp-whatsnew-body{display:flex;flex-direction:column;gap:12px;max-height:52vh;overflow-y:auto}
.dsh-mcp-whatsnew-entry{display:flex;flex-direction:column;gap:6px}
.dsh-mcp-whatsnew-ver{font-size:11px;font-weight:650;color:var(--mcp-accent)}
.dsh-mcp-whatsnew-item{display:flex;gap:8px;font-size:12.5px;line-height:1.6}
.dsh-mcp-whatsnew-dot{flex:none;color:var(--mcp-accent)}
.dsh-mcp-whatsnew-where{display:block;margin-top:3px;width:fit-content;padding:0 6px;border-radius:999px;background:var(--mcp-line);color:var(--mcp-mut);font-size:11px;line-height:17px;white-space:nowrap;corner-shape:round}
.dsh-mcp-whatsnew-foot{display:flex;justify-content:flex-end;margin-top:14px}
.dsh-mcp-modal{box-sizing:border-box;display:flex;flex-direction:column;width:560px;max-width:92vw;max-height:88dvh;overflow:hidden;background:var(--mcp-bg-2);border:0;border-radius:var(--mcp-r-panel);padding:0;box-shadow:var(--dsw-elevation-prominent);animation:mcpPop .2s cubic-bezier(.2,0,0,1)}
.dsh-mcp-modal-head{display:flex;align-items:flex-start;gap:12px;flex:none;padding:20px 20px 16px}
.dsh-mcp-modal h3{flex:1;min-width:0;margin:0;font-size:15px;line-height:1.5;font-weight:600;overflow-wrap:anywhere}
.dsh-mcp-modal-body{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:0 20px 20px}
.dsh-mcp-field{margin-bottom:14px}
.dsh-mcp-field>label{display:block;font-size:11.5px;color:var(--mcp-mut);margin-bottom:6px;font-weight:500}
/* Note: 布局与滚动边界见 .agents/notes/implemented/2026-11-05-extension-center-workbench.md；控制边界见 2026-11-04-compact-tool-preview.md
   -- 工具加载工作区 -----------------------------------------------------------
   这是一个工作台，不是设置卡片堆：顶部给上下文，正文给决策，底部给提交。
   颜色、几何和层级全部从 DSH 主题令牌来；平面分隔用发丝线，抬升表面才用阴影。 */
.dsh-mcp-tool-loading-page{display:flex;flex:1;min-height:0;flex-direction:column;overflow:hidden}
.dsh-mcp-tool-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 2px 2px 0}
/* 固定区域：参数、概览、工具条不滚；只有工具列表滚。 */
.dsh-mcp-tool-fixed{flex:none}
.dsh-mcp-tool-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:0 0 10px}
.dsh-mcp-tool-hero-copy{min-width:0}
.dsh-mcp-tool-title{margin:0;font-size:16px;font-weight:650;line-height:1.3;letter-spacing:0}
/* 概览条：一张卡、四个统计格。数字是这张页面上唯一变长的东西，给它 tabular-nums
   并钉住一格的宽度节奏，保存中数字增减时不推挤邻居。 */
.dsh-mcp-tool-overview{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));margin:10px 0 2px;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-lg);background:var(--mcp-bg-2)}
.dsh-mcp-tool-stat{display:flex;align-items:center;gap:9px;min-width:0;padding:10px 14px}
.dsh-mcp-tool-stat+.dsh-mcp-tool-stat{border-left:.5px solid var(--mcp-line)}
.dsh-mcp-tool-stat-mark{width:8px;height:8px;flex:none;border-radius:50%;corner-shape:round;background:var(--mcp-mut)}
.dsh-mcp-tool-stat-mark.resident{background:var(--mcp-ok)}
.dsh-mcp-tool-stat-mark.deferred{background:var(--mcp-accent)}
.dsh-mcp-tool-stat-mark.protected{background:var(--mcp-warn)}
.dsh-mcp-tool-stat-value{font-size:17px;font-weight:680;line-height:1.1;font-variant-numeric:tabular-nums}
.dsh-mcp-tool-stat-copy{min-width:0;display:flex;flex-direction:column;gap:1px}
.dsh-mcp-tool-stat-label{color:var(--dsw-alias-label-primary);font-size:11.5px;font-weight:600;line-height:1.3}
.dsh-mcp-tool-stat-note{overflow:hidden;color:var(--mcp-mut);font-size:10.5px;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
/* 搜索参数：与工具列表同级的第二区块，不再是底部折叠的「高级设置」。
    标题与三列字段先于工具统计，说明留给字段旁的提示。 */
.dsh-mcp-tool-params{padding:0 0 14px;border-bottom:.5px solid var(--mcp-line)}
.dsh-mcp-tool-params-head{margin-bottom:12px}
.dsh-mcp-tool-params-title{margin:0;font-size:13px;font-weight:600;line-height:1.35}
.dsh-mcp-tool-params-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dsh-mcp-tool-param{display:flex;flex-direction:column;gap:6px;min-width:0}
.dsh-mcp-tool-param-label{display:flex;align-items:center;gap:5px;color:var(--dsw-alias-label-primary);font-size:11.5px;font-weight:600;line-height:1.35}
.dsh-mcp-tool-param-inline{display:flex;align-items:center;gap:8px}
.dsh-mcp-tool-param-inline input{flex:1;min-width:0}
.dsh-mcp-tool-param input[type='number']{width:100%;box-sizing:border-box;padding:0 10px;height:32px;border:0.5px solid var(--mcp-line);border-radius:var(--mcp-r-md);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:1.35;outline:none}
.dsh-mcp-tool-param input[type='number']:focus{border-color:var(--mcp-accent);box-shadow:0 0 0 2px var(--dsw-alias-interactive-bg-hover-accent)}
.dsh-mcp-tool-param input:disabled{opacity:.55;cursor:not-allowed}
.dsh-mcp-tool-param-saved{margin:8px 0 0;color:var(--mcp-ok);font-size:11px;line-height:1.4}
/* 工具条：搜索 + 分段筛选。筛选用与顶栏能力层同一形态的浅槽分段控件——
   「看到哪一面」在面板里已经长这样，工具页不再发明第二种筛选长相。 */
.dsh-mcp-tool-toolbar{display:flex;align-items:center;gap:10px;padding:8px 0 10px}
.dsh-mcp-tool-toolbar .dsh-mcp-search{flex:1;min-width:180px}
.dsh-mcp-tool-filter{display:inline-flex;gap:2px;flex:none;padding:3px;border-radius:var(--mcp-r-lg);background:var(--mcp-bg-2)}
.dsh-mcp-tool-filter button{display:inline-flex;align-items:center;gap:5px;border:0;border-radius:var(--mcp-r-md);background:transparent;color:var(--mcp-mut);font:inherit;font-size:11.5px;line-height:1.3;padding:5px 11px;cursor:pointer;white-space:nowrap}
.dsh-mcp-tool-filter button[aria-pressed='true']{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted);font-weight:650}
/* 卡片网格：每张卡自带边框与底色，行间不再用发丝线分隔——线上排名字曾是
   「密密麻麻一整片」观感的来源；卡片之间的 10px 空隙就是分组。 */
.dsh-mcp-tool-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
/* 行 = 卡片：第 1 行 名称+中文短名+ⓘ | 常驻/按需分段；第 2 行 说明（截断，全文在 title）。
   说明截断是有意的：这页的决定是「加载方式」，说明只是辨认工具用的线索，
   整段铺开会让 34 张卡高低不一、网格错位。 */
.dsh-mcp-tool-row{position:relative;display:flex;flex-direction:column;gap:5px;margin:0;padding:10px 12px;border:.5px solid var(--mcp-line);border-radius:var(--mcp-r-md);background:var(--mcp-bg-1);transition:border-color .12s,background .12s}
.dsh-mcp-tool-row.is-changed{border-color:var(--mcp-accent);background:var(--dsw-alias-interactive-bg-hover-accent)}
.dsh-mcp-tool-info{display:flex;align-items:center;gap:6px;min-width:0}
.dsh-mcp-tool-row .dsh-mcp-tool-name{flex:0 1 auto;max-width:100%;min-width:0;overflow:hidden;color:var(--dsw-alias-label-primary);font-family:var(--mcp-mono);font-size:12px;font-weight:650;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}
.dsh-mcp-tool-alias{min-width:0;overflow:hidden;color:var(--mcp-mut);font-size:11px;line-height:1.4;text-overflow:ellipsis;white-space:nowrap}
.dsh-mcp-tool-desc{display:-webkit-box;overflow:hidden;color:var(--mcp-mut);font-size:10.5px;line-height:1.45;-webkit-box-orient:vertical;-webkit-line-clamp:2}
/* 常驻/按需：行内的选择控件与工具条的筛选分段同形同尺寸，差别只在选中色——
   常驻读语义绿、按需读 accent，与概览条的两个圆点一一对应。 */
.dsh-mcp-tool-pick{display:inline-flex;gap:2px;flex:none;padding:2px;border-radius:var(--mcp-r-md);background:var(--mcp-bg-2)}
.dsh-mcp-tool-pick button{border:0;border-radius:var(--mcp-r-sm);background:transparent;color:var(--mcp-mut);font:inherit;font-size:11px;line-height:1.3;padding:4px 10px;cursor:pointer;white-space:nowrap}
.dsh-mcp-tool-pick button:disabled{opacity:.55;cursor:not-allowed}
.dsh-mcp-tool-pick button[aria-pressed='true']{font-weight:650}
.dsh-mcp-tool-pick button[aria-pressed='true'].is-resident{background:var(--dsw-alias-state-success-tertiary);color:var(--dsw-alias-state-success-primary)}
.dsh-mcp-tool-pick button[aria-pressed='true'].is-deferred{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--mcp-accent)}
.dsh-mcp-tool-pick button:focus-visible{outline:1px solid var(--mcp-accent);outline-offset:1px}
/* 保存栏常驻底栏：左边一句话说清「改了几个/改完何时生效」，右边放弃+保存。
   改动徽标与脏行卡片同色同圆点——底部 promised 的改动数与列表里高亮的卡互相对得上。 */
.dsh-mcp-tool-save{display:flex;align-items:center;gap:10px;flex:none;margin-top:2px;padding:10px 12px;border:.5px solid var(--mcp-line);border-radius:var(--mcp-r-md);background:var(--mcp-bg-2)}
.dsh-mcp-tool-save-hint{display:flex;align-items:center;gap:6px;min-width:0;overflow:hidden;font-size:11px;line-height:1.4;color:var(--mcp-mut)}
.dsh-mcp-tool-save-dirty{display:inline-flex;align-items:center;gap:5px;flex:none;padding:1.5px 8px;border-radius:999px;corner-shape:round;background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--mcp-accent);font-size:10.5px;font-weight:650;line-height:16px;font-variant-numeric:tabular-nums}
.dsh-mcp-tool-save-spacer{flex:1}
.dsh-mcp-tool-save-actions{display:flex;align-items:center;gap:8px;flex:none}
.dsh-mcp-tool-loading-page .dsh-mcp-d-err{margin:12px 0 0}
@media (hover:hover){
  .dsh-mcp-tool-filter button:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
  .dsh-mcp-tool-row:hover{border-color:var(--dsw-alias-border-l3)}
  .dsh-mcp-tool-row.is-changed:hover{border-color:var(--mcp-accent)}
  .dsh-mcp-tool-pick button:not([aria-pressed='true']):hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
}
@media (max-width:760px){
  .dsh-mcp-tool-hero{display:block;padding-bottom:8px}
  .dsh-mcp-tool-overview{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dsh-mcp-tool-stat{padding:9px 10px}
  .dsh-mcp-tool-stat+.dsh-mcp-tool-stat{border-left:0}
  .dsh-mcp-tool-stat:nth-child(even){border-left:.5px solid var(--mcp-line)}
  .dsh-mcp-tool-stat:nth-child(n+3){border-top:.5px solid var(--mcp-line)}
  .dsh-mcp-tool-stat-value{font-size:16px}
  .dsh-mcp-tool-stat-note{display:none}
  .dsh-mcp-tool-params-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .dsh-mcp-tool-param:last-child{grid-column:1 / -1}
  .dsh-mcp-tool-param-label{font-size:10.5px}
  .dsh-mcp-tool-toolbar{align-items:stretch;flex-direction:column}
  .dsh-mcp-tool-toolbar .dsh-mcp-search{width:100%}
  .dsh-mcp-tool-filter{width:100%;justify-content:space-between}
  .dsh-mcp-tool-filter button{flex:1;padding-inline:6px}
  .dsh-mcp-tool-list{grid-template-columns:minmax(0,1fr)}
  .dsh-mcp-tool-save{align-items:stretch;flex-direction:column;gap:8px}
  .dsh-mcp-tool-save-spacer{display:none}
  .dsh-mcp-tool-save-actions{justify-content:flex-end}
}
/* 参数说明标记（C2）：label 是 block，标记用 inline-flex 挂在文字后面，不进流布局。 */
.dsh-mcp-hint{display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;margin-left:6px;color:var(--mcp-mut);vertical-align:middle;cursor:help;border-radius:50%;corner-shape:round}
.dsh-mcp-hint:hover,.dsh-mcp-hint:focus-visible{color:var(--mcp-accent)}
.dsh-mcp-hint:focus-visible{outline:1px solid var(--mcp-accent);outline-offset:1px}
/* 开关关掉时输入框置灰（disabled）：可见、不可改、不生效——不卸载，避免表单跳动。 */
.dsh-mcp-field input:disabled{opacity:.45;cursor:not-allowed}
.dsh-mcp-field input,.dsh-mcp-field select,.dsh-mcp-field textarea{width:100%;box-sizing:border-box;padding:0 11px;height:32px;border-radius:var(--mcp-r-md);border:1px solid var(--mcp-line);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none;transition:border-color .1s,box-shadow .1s}
.dsh-mcp-field textarea{padding:8px 11px;height:auto;min-height:72px}
.dsh-mcp-field input::placeholder{color:var(--mcp-mut)}
.dsh-mcp-field input:focus,.dsh-mcp-field select:focus,.dsh-mcp-field textarea:focus{border-color:var(--mcp-accent);box-shadow:0 0 0 2px var(--dsw-alias-interactive-bg-hover-accent)}
.dsh-mcp-radio-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.dsh-mcp-radio-row label{display:flex;align-items:center;gap:8px;margin:0;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-md);padding:9px 12px;background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);cursor:pointer;font-size:12.5px;transition:border-color .12s,background .12s}
.dsh-mcp-radio-row label:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-radio-row label.sel{border-color:var(--mcp-accent);background:var(--dsw-alias-interactive-bg-hover-accent)}
.dsh-mcp-radio-row input[type='radio']{width:15px;height:15px;flex:none;margin:0;padding:0;appearance:none;-webkit-appearance:none;border:1.5px solid var(--dsw-alias-border-l3);border-radius:50%;background:transparent;position:relative;cursor:pointer;transition:border-color .12s,background .12s;corner-shape:round}
.dsh-mcp-radio-row input[type='radio']:checked{border-color:var(--mcp-accent);background:radial-gradient(circle,var(--dsw-alias-label-primary-inverted) 0 4px,var(--mcp-accent) 4.5px)}
.dsh-mcp-radio-row input[type='radio']:hover{border-color:var(--mcp-accent)}
.dsh-mcp-kv-edit{display:grid;grid-template-columns:38% 1fr auto;gap:8px;margin-bottom:8px;align-items:center}
.dsh-mcp-kv-edit input{width:100%;min-width:0;box-sizing:border-box}
.dsh-mcp-input-action{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:start}.dsh-mcp-input-action textarea{min-width:0}.dsh-mcp-kv-row-actions{display:flex;gap:5px;align-items:center;height:34px}.dsh-mcp-inline-icon{box-sizing:border-box;width:34px!important;height:34px!important;padding:0!important;flex:none}
.dsh-mcp-kv-del{box-sizing:border-box;width:34px;height:34px;padding:0!important;display:inline-flex;align-items:center;justify-content:center;flex:none}
.dsh-mcp-secret{display:inline-flex;align-items:center;gap:6px;min-width:0;max-width:100%}.dsh-mcp-secret-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:pre-wrap;word-break:break-all}.dsh-mcp-secret-btn{width:24px;height:24px;flex:none;padding:0;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-sm);background:var(--dsw-alias-button-elevated-fill);color:var(--mcp-mut);cursor:pointer}.dsh-mcp-secret-btn:hover{color:var(--dsw-alias-label-primary);border-color:var(--mcp-accent)}.dsh-mcp-secret-list{display:flex;flex-direction:column;gap:5px;min-width:0}.dsh-mcp-secret-row{display:grid;grid-template-columns:minmax(0,40%) minmax(0,1fr);gap:8px;align-items:center;min-width:0}.dsh-mcp-secret-row b{min-width:0;overflow-wrap:anywhere}.dsh-mcp-log{margin-top:10px;padding:9px 11px;border-left:3px solid var(--mcp-err);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--mcp-err);font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word}.dsh-mcp-log.warn{border-left-color:var(--mcp-warn);color:var(--mcp-warn);background:var(--dsw-alias-state-warn-tertiary)}
.dsh-mcp-kv-add{display:flex;justify-content:flex-end;margin-top:2px}
.dsh-mcp-kv-del{border:1px solid var(--mcp-line);background:var(--dsw-alias-button-elevated-fill);color:var(--mcp-mut);cursor:pointer;font-size:14px;padding:3px 9px;border-radius:var(--mcp-r-sm);line-height:18px;transition:color .12s,background .12s,border-color .12s}
.dsh-mcp-kv-del:hover{color:var(--mcp-err);background:var(--dsw-alias-interactive-bg-hover-danger);border-color:var(--dsw-alias-state-error-primary)}
.dsh-mcp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin:0;padding:14px 20px;flex:none;border-top:1px solid var(--mcp-line);background:var(--mcp-bg-2);flex-wrap:wrap}
.dsh-mcp-advanced{margin-top:14px}.dsh-mcp-check{display:flex!important;align-items:center;gap:8px;margin:9px 0!important;color:var(--dsw-alias-label-primary)!important}.dsh-mcp-check input{width:auto!important}.dsh-mcp-number-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.dsh-mcp-number-grid .dsh-mcp-field{margin-bottom:0}.dsh-mcp-import-preview{font-size:12px;line-height:1.6;color:var(--mcp-mut);white-space:pre-wrap}.dsh-mcp-import-json{min-height:220px;resize:vertical;font-family:var(--mcp-mono)!important}
.dsh-mcp-check-list{display:flex;flex-direction:column;gap:3px;max-height:180px;overflow-y:auto;padding:3px;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-md);background:var(--mcp-bg-1)}
.dsh-mcp-check-row{display:flex;align-items:center;gap:8px;padding:5px 7px;border-radius:var(--mcp-r-sm);font-size:12px;color:var(--dsw-alias-label-primary);cursor:pointer}
.dsh-mcp-check-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-check-row input{width:auto;flex:none;margin:0}
.dsh-mcp-check-name{font-weight:600;overflow-wrap:anywhere}
.dsh-mcp-check-meta{margin-left:auto;flex:none;font-size:11px;color:var(--mcp-mut)}
.dsh-mcp-check-toolbar{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:11px;color:var(--mcp-mut)}
.dsh-mcp-copy-target{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-md);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px}
.dsh-mcp-source-box{margin:0 0 14px;flex:none}.dsh-mcp-source-list{display:flex;flex-direction:column;gap:6px;max-height:186px;overflow-y:auto;margin-top:7px}.dsh-mcp-source-row{box-sizing:border-box;display:flex;flex-direction:column;gap:3px;width:100%;padding:8px 10px;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-md);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:1.45;text-align:left;cursor:pointer;transition:border-color .12s,background .12s}.dsh-mcp-source-row:hover:not(:disabled){border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}.dsh-mcp-source-row.sel{border-color:var(--mcp-accent);background:var(--mcp-bg-2)}.dsh-mcp-source-row:disabled{cursor:default;opacity:.7}.dsh-mcp-source-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}.dsh-mcp-source-name{font-weight:600}.dsh-mcp-source-path{font-family:var(--mcp-mono);font-size:10.5px;color:var(--dsw-alias-brand-text);overflow-wrap:anywhere}.dsh-mcp-source-detail{font-size:11px;color:var(--mcp-mut);overflow-wrap:anywhere}.dsh-mcp-source-note{font-size:10.5px;color:var(--mcp-mut)}.dsh-mcp-source-warn{font-size:10.5px;color:var(--mcp-warn)}
.dsh-mcp-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--dsw-alias-toast-bg);backdrop-filter:blur(10px);border:0;color:var(--dsw-alias-label-primary);padding:10px 18px;border-radius:var(--mcp-r-lg);font-size:12.5px;z-index:300;box-shadow:var(--dsw-shadow-lv3);max-width:70vw;animation:mcpPop .16s ease-out}
.dsh-mcp-toast.err{border:1px solid var(--dsw-alias-state-error-primary)}
.dsh-mcp-toast.ok{border:1px solid var(--dsw-alias-state-success-primary)}
.dsh-mcp-toggle{position:relative;width:34px;height:19px;box-sizing:border-box;border-radius:999px;border:0;cursor:pointer;background:var(--dsw-alias-border-l3);transition:background .18s,border-color .18s;flex:none;box-shadow:none;corner-shape:round}
.dsh-mcp-toggle[aria-checked='true']{background:var(--mcp-accent);border-color:transparent}
.dsh-mcp-toggle:disabled{opacity:.65;cursor:not-allowed}
.dsh-mcp-toggle::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--dsw-alias-switch-thumb);transition:left .18s,background .18s;box-shadow:none;corner-shape:round}
.dsh-mcp-toggle[aria-checked='true']::after{left:17px;background:var(--dsw-alias-label-primary-foreground)}
.dsh-mcp-d-err{font-size:12.5px;color:var(--mcp-err);margin-top:8px;white-space:pre-wrap}
/* 悬浮按钮：外框尺寸必须恰好是 JS 里 FAB_SIZE 的值（拖拽边界与默认位置按它算，
   client.js 的 clampFabPos/defaultFabPos）。border-box 让这个等式不受边框影响——
   之前是 1px 边框 + content-box，渲染出 52px 而 JS 按 50px 夹取，右/下边缘会差 2px；
   现在去掉边框（抬升表面改成 elevation 阴影）+ border-box，两边一致且不会再漂。 */
/* 浮动按钮：48px 圆角矩形，圆角跟随主题，hover 用 translateY(-2px) + elevation 加深，
   不再 scale(1.05)。原 50px 正圆 + scale 放大像「游戏按钮」，与面板气质不符。 */
.dsh-mcp-fab{position:fixed;right:22px;bottom:22px;box-sizing:border-box;width:48px;height:48px;border-radius:var(--mcp-r-lg);border:0;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted);cursor:grab;user-select:none;display:flex;align-items:center;justify-content:center;box-shadow:var(--dsw-elevation-panel);z-index:190;touch-action:none;transition:transform .15s cubic-bezier(.2,0,0,1),background .15s,box-shadow .15s;pointer-events:auto}
.dsh-mcp-fab:hover{transform:translateY(-2px);background:var(--dsw-alias-button-primary-hover);box-shadow:var(--dsw-elevation-prominent)}
.dsh-mcp-fab:active{transform:translateY(0)}
.dsh-mcp-fab svg{width:20px;height:20px}
.dsh-mcp-panel-overlay{position:fixed;inset:0;background:var(--dsw-alias-bg-overlay);display:flex;align-items:center;justify-content:center;z-index:180;padding:26px;pointer-events:auto;animation:mcpFade .14s ease-out}
.dsh-mcp-panel{box-sizing:border-box;width:min(1180px,95vw);height:min(920px,90vh);background:var(--mcp-bg-1);border:0;border-radius:var(--mcp-r-panel);box-shadow:var(--dsw-elevation-prominent);display:flex;flex-direction:column;overflow:hidden;animation:mcpPop .2s cubic-bezier(.2,0,0,1)}
.dsh-mcp-panel:focus{outline:none}
.dsh-mcp-modal:focus{outline:none}
.dsh-mcp-panel .dsh-mcp-wrap{height:100%;min-height:0;padding:20px}
.dsh-mcp-filters{flex:none;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px;align-items:center}
/* 控件收起、只剩一键动作时（项目作用域条目 ≤6）：单列 + 靠右，与有 select 时按钮的位置一致。 */
.dsh-mcp-filters.bare{grid-template-columns:auto;justify-content:end}
/* 「全部延迟」主按钮：放在过滤器行右侧（原本大片空白），必须是列表第一屏就可见的——
   曾经它在底栏，服务器一多就滚出视野，用户根本找不到这个功能。 */
.dsh-mcp-filters>.dsh-mcp-defer-all{grid-column:1 / -1;justify-self:end}
.dsh-mcp-defer-all{display:inline-flex;align-items:center;gap:5px;padding:0 11px;height:32px;border-radius:var(--mcp-r-sm);border:1px solid var(--mcp-accent);background:var(--mcp-accent);color:var(--dsw-alias-label-primary-inverted);font:inherit;font-size:11.5px;font-weight:600;white-space:nowrap;cursor:pointer;transition:filter .1s,opacity .1s}
.dsh-mcp-defer-all:hover:not(:disabled){filter:brightness(1.12)}
.dsh-mcp-defer-all:disabled{opacity:.45;cursor:not-allowed}
.dsh-mcp-defer-all svg{width:12px;height:12px;flex:none}
.dsh-mcp-filters select{width:100%;box-sizing:border-box;padding:0 24px 0 8px;height:32px;border-radius:var(--mcp-r-sm);border:1px solid var(--mcp-line);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:11.5px;outline:none;transition:border-color .1s;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--mcp-mut) 50%),linear-gradient(135deg,var(--mcp-mut) 50%,transparent 50%);background-position:calc(100% - 13px) 50%,calc(100% - 9px) 50%;background-size:4px 4px,4px 4px;background-repeat:no-repeat}
.dsh-mcp-filters select:focus{border-color:var(--mcp-accent)}
.dsh-mcp-tool{flex-direction:column;padding:0;gap:0}
.dsh-mcp-tool-head{display:flex;align-items:center;gap:9px;padding:7px 9px;border-radius:var(--mcp-r-sm)}
.dsh-mcp-tool-head.interactive{cursor:pointer}
.dsh-mcp-tool-head.interactive:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-tool-head.interactive:focus-visible{outline:1px solid var(--mcp-accent);outline-offset:-1px}
.dsh-mcp-tool-body{padding:2px 9px 10px;display:flex;flex-direction:column;gap:8px}
.dsh-mcp-params{display:flex;flex-direction:column;gap:6px}
.dsh-mcp-param{border:1px solid var(--mcp-line);border-radius:var(--mcp-r-md);padding:7px 9px;background:var(--mcp-bg-1)}
.dsh-mcp-param-head{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.dsh-mcp-param-name{font-family:var(--mcp-mono);font-size:11.5px;color:var(--dsw-alias-brand-text);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.dsh-mcp-param-type{font-size:10px;color:var(--mcp-mut);border:1px solid var(--mcp-line);border-radius:var(--mcp-r-xs);padding:1px 5px;font-family:var(--mcp-mono);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:60%}
.dsh-mcp-req{font-size:10px;color:var(--dsw-alias-state-warn-primary);border:1px solid var(--dsw-alias-state-warn-primary);border-radius:var(--mcp-r-xs);padding:1px 5px}
.dsh-mcp-opt{font-size:10px;color:var(--mcp-mut);border:1px solid var(--mcp-line);border-radius:var(--mcp-r-xs);padding:1px 5px}
.dsh-mcp-param-desc{font-size:11px;color:var(--mcp-mut);margin-top:4px;line-height:1.5;white-space:normal;word-break:break-word}
.dsh-mcp-param-enum{font-size:10.5px;color:var(--mcp-mut);margin-top:3px;font-family:var(--mcp-mono);word-break:break-all}
.dsh-mcp-tool-rawbtn{align-self:flex-start;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-sm);background:var(--dsw-alias-button-elevated-fill);color:var(--mcp-mut);font-size:11px;padding:4px 9px;cursor:pointer;transition:color .12s,border-color .12s}
.dsh-mcp-tool-rawbtn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}
.dsh-mcp-json{font-family:var(--mcp-mono);font-size:11px;line-height:1.5;background:var(--mcp-bg-1);border:1px solid var(--mcp-line);border-radius:var(--mcp-r-lg);padding:9px;overflow:auto;white-space:pre;max-height:260px;color:var(--dsw-alias-label-primary);margin:0}
/* ── 发现市场（两个能力面共用的**内联**视图）─────────────────────────────
   曾经它是 .dsh-mcp-modal.dsh-mcp-market——一个 1080×820 的浮层；而技能面的市场是内联的。
   于是同一个「发现市场」在两个能力面里是两种形态：MCP 面按「市场」弹窗、技能面按「市场」换页。
   现在两边都是内联视图，共用下面这批原语（.dsh-mcp-chips / .dsh-mcp-grid / .dsh-mcp-mcard）。
   卡片类名故意**不叫** .dsh-mcp-card：那个名字已经被详情里的内容卡占了，而这里的一条
   display:flex 曾经把 .dsh-mcp-pane-off 压掉（三个页签同时显示，真机事故）。 */
.dsh-mcp-market-view{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:12px;padding-right:2px}
/* 工具栏（来源切换 + 搜索 + 分类药丸）钉在滚动区顶部。
   为什么需要它：滚动盒是 .dsh-mcp-market-view 本身，而工具栏是它的子节点，所以默认会跟着滚走
   （纯 MCP 那版把滚动放在 .dsh-mcp-market-grid 上、工具栏留在外面，因此天然固定；改成内联市场
   视图 + 多 section 之后滚动盒上提了一层，工具栏就掉进了滚动区）。
   三个要点缺一不可：① 必须把「head + 两个来源各自的分类药丸行」**包成一个容器**再 sticky——
   分类药丸是 .dsh-mcp-market-head 的兄弟节点，只钉 head 的话药丸仍会从下面滑过去；
   ② 必须给不透明背景，否则卡片会从工具栏下面透出来；③ top:0 相对滚动容器的 padding 盒，
   本容器的 padding 只有右侧 2px，所以 0 就对。 */
.dsh-mcp-market-toolbar{position:sticky;top:0;z-index:1;flex:none;display:flex;flex-direction:column;gap:10px;padding-bottom:10px;border-bottom:1px solid var(--mcp-line);background:var(--mcp-bg-1)}
.dsh-mcp-market-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:none}
/* 右侧一组：搜索 + 「安装到」。原型是同一条横排（药丸 | 搜索 | 安装到），这里靠
   flex-wrap 实现——分类药丸会先占满一行，工具组整块换到下一行，窄屏也不会把选择器压扁。 */
.dsh-mcp-market-tools{display:flex;flex-wrap:wrap;align-items:center;gap:8px;flex:1 1 260px;min-width:0}
.dsh-mcp-market-tools .dsh-mcp-search{flex:1 1 auto;min-width:160px}
/* 「安装到」：市场模式下唯一的作用域入口。刻意做成带文字的标签 + 原生 select
   （而不是又一个图标按钮）——「装到哪」是**有后果**的选择，不能只用一个图标暗示。 */
.dsh-mcp-market-scope{display:inline-flex;align-items:center;gap:6px;flex:none;white-space:nowrap;font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
.dsh-mcp-market-scope select{max-width:220px;box-sizing:border-box;padding:6px 24px 6px 9px;border-radius:var(--mcp-r-sm);border:1px solid var(--mcp-line);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--mcp-mut) 50%),linear-gradient(135deg,var(--mcp-mut) 50%,transparent 50%);background-position:calc(100% - 13px) 50%,calc(100% - 9px) 50%;background-size:4px 4px,4px 4px;background-repeat:no-repeat;cursor:pointer}
.dsh-mcp-market-scope select:focus{border-color:var(--mcp-accent)}
.dsh-mcp-market-head .dsh-mcp-search{flex:1 1 180px;min-width:0}
.dsh-mcp-market-section{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;flex:none}
.dsh-mcp-market-section b{font-size:13px;font-weight:650}
.dsh-mcp-market-section span{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}
/* 分类药丸：**换行**，不横滚。
   横滚 + 隐藏滚动条 = 最后一个药丸被裁掉一半，而且没有任何线索说明它还能滚
   （真机上就是「文件与…」被切在右边缘，用户第一反应是「没处理好」——对）。
   三条药丸行各有各的出口，但都必须有一个可见的出口：详情页签换行、作用域条
   「横滚 + ⋯N 弹层」、分类药丸条目数固定且有限（十来个）所以直接换行。
   ⚠️ 别在这条上加 overflow-x:auto——那正是把出口藏起来的写法。 */
.dsh-mcp-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-width:0;padding:1px 0}
/* 药丸行吃掉搜索框剩下的宽度；搜索框自身有 min-width，窄屏下会整块换到下一行。 */
.dsh-mcp-market-head .dsh-mcp-chips{flex:1 1 auto}
.dsh-mcp-chip{display:inline-flex;align-items:center;gap:5px;flex:none;padding:5px 11px;border-radius:999px;corner-shape:round;border:1px solid var(--mcp-line);background:var(--mcp-bg-1);color:var(--mcp-mut);font:inherit;font-size:12px;line-height:1.5;white-space:nowrap;cursor:pointer;transition:background .13s,border-color .13s,color .13s}
.dsh-mcp-chip:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}
/* 不可用的来源（宿主没提供那个接口）：明确变灰且不接受点击，而不是给一个点开就报错的入口。 */
.dsh-mcp-chip:disabled{opacity:.45;cursor:not-allowed;text-decoration:line-through}
.dsh-mcp-chip:disabled:hover{background:var(--mcp-bg-1);border-color:var(--mcp-line)}
.dsh-mcp-chip.sel{color:var(--dsw-alias-label-primary);border-color:var(--mcp-accent);background:var(--dsw-alias-interactive-bg-hover-accent);font-weight:600}
.dsh-mcp-chip-count{font-size:10px;padding:0 5px;border-radius:999px;corner-shape:round;background:var(--mcp-line);color:var(--mcp-mut);line-height:15px}
.dsh-mcp-chip.sel .dsh-mcp-chip-count{background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--mcp-accent)}
.dsh-mcp-market-filters{display:flex;align-items:center;gap:10px;flex-wrap:wrap;flex:none;font-size:12px;color:var(--mcp-mut)}
.dsh-mcp-market-filters select{padding:5px 22px 5px 9px;border-radius:var(--mcp-r-sm);border:1px solid var(--mcp-line);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;outline:none;appearance:none;-webkit-appearance:none;background-image:linear-gradient(45deg,transparent 50%,var(--mcp-mut) 50%),linear-gradient(135deg,var(--mcp-mut) 50%,transparent 50%);background-position:calc(100% - 12px) 50%,calc(100% - 8px) 50%;background-size:4px 4px,4px 4px;background-repeat:no-repeat;cursor:pointer}
.dsh-mcp-market-filters select:focus{border-color:var(--mcp-accent)}
.dsh-mcp-market-filters label{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.dsh-mcp-market-filters input[type='checkbox']{width:14px;height:14px;margin:0;accent-color:var(--mcp-accent);cursor:pointer}
/* grid-auto-rows:1fr 让所有隐式行等高，否则行高 = 该行最高那张卡，跨行看就是「大小不一」。
   必须与 .dsh-mcp-mcard-desc 的截断一起用：不截断时最矮的卡会留出大片空白。 */
.dsh-mcp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(268px,100%),1fr));gap:10px;align-content:start;grid-auto-rows:1fr}
.dsh-mcp-mcard{min-width:0;flex:none;box-sizing:border-box;display:flex;flex-direction:column;gap:9px;padding:13px 14px;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-lg);background:var(--mcp-bg-1);transition:border-color .13s,background .13s}
.dsh-mcp-mcard:hover{border-color:var(--dsw-alias-border-l3);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-mcard.installed{border-color:var(--dsw-alias-state-success-primary)}
.dsh-mcp-mcard-top{display:flex;align-items:flex-start;gap:9px}
.dsh-mcp-mcard-icon{width:30px;height:30px;flex:none;border-radius:var(--mcp-r-sm);background:var(--dsw-alias-interactive-bg-hover);color:var(--mcp-mut);display:flex;align-items:center;justify-content:center}
.dsh-mcp-mcard-main{flex:1;min-width:0}
.dsh-mcp-mcard-name{font-size:13px;font-weight:650;line-height:1.35;overflow-wrap:anywhere}
.dsh-mcp-mcard-meta{font-size:10.5px;color:var(--dsw-alias-label-tertiary);margin-top:2px;display:flex;align-items:center;gap:5px;flex-wrap:wrap}
/* 截断到 3 行（上游 summary 长度不受控，几千像素高的行就是这么来的）。
   ⚠️ **这里不能用 -webkit-line-clamp**：本元素是 .dsh-mcp-mcard（display:flex）的 flex item，
   Chrome 会把 flex item 上的 display:-webkit-box 块化成 flow-root，line-clamp 随之完全失效
   ——真机实测：源码写着 display:-webkit-box / line-clamp:3，computed display 却是 flow-root，
   长描述仍是 148px 高、一行没截。所以改用不依赖 display 的「行高 × 行数」截法：
   line-height 1.55 与 font-size 12px 都写在同一规则上，故 1.55em 就是一行，×3 恰好三行。
   全文出口由调用点的 title 提供，不能只截不留路。
   ⚠️ 本段在 MCP_CSS 这个**模板字符串**里：注释里不得出现反引号（会直接把字符串截断，
   详见本文件上方那条同类记录），类名与属性一律不加引号。 */
.dsh-mcp-mcard-desc{font-size:12px;line-height:1.55;color:var(--mcp-mut);flex:1 1 auto;max-height:calc(1.55em * 3);overflow:hidden}
.dsh-mcp-mcard-tags{display:flex;align-items:center;gap:5px;flex-wrap:wrap}
.dsh-mcp-mcard-access{font-size:10.5px;color:var(--mcp-mut);line-height:1.45;overflow-wrap:anywhere}
.dsh-mcp-mcard-note{font-size:10.5px;line-height:1.45;color:var(--mcp-warn);overflow-wrap:anywhere}
.dsh-mcp-mcard-vars{display:flex;flex-direction:column;gap:2px;font-size:10.5px;line-height:1.45;color:var(--dsw-alias-brand-text);overflow-wrap:anywhere}
.dsh-mcp-mcard-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:1px solid var(--mcp-line);padding-top:9px}
.dsh-mcp-mcard-stat{font-size:10.5px;color:var(--dsw-alias-label-tertiary)}
.dsh-mcp-mcard-stat.err{color:var(--mcp-err)}
.dsh-mcp-mcard-actions{display:flex;gap:7px;align-items:center;flex:none}
.dsh-mcp-market-empty{grid-column:1 / -1;padding:40px 20px;text-align:center;color:var(--mcp-mut);font-size:13px}
@keyframes mcpPop{from{opacity:0;transform:scale(.98) translateY(4px)}to{opacity:1;transform:scale(1) translateY(0)}}
@keyframes mcpFade{from{opacity:0}to{opacity:1}}
.dsh-mcp-tabs-wrap{position:relative;flex:none;min-width:0}.dsh-mcp-tabs{display:flex;gap:6px;align-items:center;overflow-x:auto;scrollbar-width:none;padding:2px 0}.dsh-mcp-tabs::-webkit-scrollbar{display:none}.dsh-mcp-tab{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border-radius:999px;corner-shape:round;border:1px solid var(--mcp-line);background:var(--mcp-bg-1);color:var(--mcp-mut);font-size:12px;cursor:pointer;flex:none;white-space:nowrap;transition:background .13s,border-color .13s,color .13s;line-height:1.4}.dsh-mcp-tab:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}.dsh-mcp-tab.sel{color:var(--dsw-alias-label-primary);border-color:var(--mcp-accent);background:var(--dsw-alias-interactive-bg-hover-accent);font-weight:600}.dsh-mcp-tab-count{font-size:10px;font-weight:500;padding:0 6px;border-radius:999px;background:var(--mcp-line);color:var(--mcp-mut);line-height:15px;corner-shape:round}.dsh-mcp-tab.more.open{color:var(--dsw-alias-label-primary);border-color:var(--mcp-accent);background:var(--dsw-alias-interactive-bg-hover-accent)}.dsh-mcp-tab-pop{position:absolute;top:calc(100% + 5px);right:0;z-index:60;background:var(--mcp-bg-2);border:0;border-radius:var(--mcp-r-lg);box-shadow:var(--dsw-elevation-panel);padding:6px;display:flex;flex-direction:column;gap:2px;min-width:170px}
/* 弹层里的行复用 .dsh-mcp-tab，但它自带 padding+border 且是 content-box：width:100%
   会把内边距和边框再加一遍，整行比弹层宽出一圈而溢出（与下面 .dsh-mcp-entry-item 同一个坑）。 */
.dsh-mcp-tab-pop .dsh-mcp-tab{box-sizing:border-box;width:100%}.dsh-mcp-entry{position:relative;display:inline-flex}.dsh-mcp-entry-pop{left:auto;right:0;min-width:196px}
/* 菜单行不复用 .dsh-mcp-tab：那是标签 chip（content-box + 自带 padding/border），配上 width:100%
   会把内边距和边框再加一遍，整行比弹层宽出一圈而溢出。行自己的盒模型必须 border-box。 */
.dsh-mcp-entry-item{box-sizing:border-box;display:flex;align-items:center;width:100%;padding:7px 10px;border:1px solid transparent;border-radius:var(--mcp-r-sm);background:transparent;color:var(--mcp-mut);font-family:inherit;font-size:12px;line-height:1.4;text-align:left;white-space:nowrap;cursor:pointer;transition:background .13s,border-color .13s,color .13s}
.dsh-mcp-entry-item:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-entry-item.sel{border-color:var(--mcp-accent);background:var(--dsw-alias-interactive-bg-hover-accent);color:var(--dsw-alias-label-primary);font-weight:600}.dsh-mcp-ws-body{width:288px;min-width:248px;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:hidden}.dsh-mcp-section{display:flex;flex-direction:column;gap:8px;min-height:0;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-lg);background:var(--mcp-bg-2);padding:12px;overflow:hidden}.dsh-mcp-section.local{flex:1 1 auto;min-height:124px;max-height:none;border-color:var(--mcp-line)}.dsh-mcp-section-actions{display:flex;justify-content:flex-end;gap:4px;flex:none}.dsh-mcp-global-list{flex:1;display:flex;flex-direction:column;gap:3px;overflow-y:auto;min-height:52px;margin:0 -4px;padding:0 4px}
.dsh-mcp-item.muted{opacity:.52}
.dsh-mcp-item.muted:hover{opacity:.85}
.dsh-mcp-global-search{position:relative;flex:none}
.dsh-mcp-global-search svg{position:absolute;left:10px;top:50%;transform:translateY(-50%);opacity:.5}
.dsh-mcp-global-search input{width:100%;box-sizing:border-box;padding:7px 10px 7px 30px;border-radius:var(--mcp-r-sm);border:1px solid var(--mcp-line);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font-size:11.5px;outline:none;transition:border-color .15s}
.dsh-mcp-global-search input::placeholder{color:var(--mcp-mut)}
/* 项目 / 全局共享是来源导航，和右侧概览 / 工具页签使用同一条下划线语言。 */
.dsh-mcp-source-tabs{display:flex;gap:14px;flex:none;border-bottom:1px solid var(--mcp-line)}
.dsh-mcp-source-tabs button{display:flex;align-items:center;gap:6px;flex:1;justify-content:center;padding:6px 0 10px;border:0;border-bottom:2px solid transparent;background:transparent;color:var(--mcp-mut);font:inherit;font-size:12px;cursor:pointer}
.dsh-mcp-source-tabs button[aria-selected='true']{color:var(--dsw-alias-label-primary);font-weight:600;border-bottom-color:var(--mcp-accent)}
.dsh-mcp-source-tabs button span{font-size:10.5px;color:var(--mcp-mut);font-variant-numeric:tabular-nums}
.dsh-mcp-source-tabs button:focus-visible{outline:1px solid var(--mcp-accent);outline-offset:-2px}
/* 折叠指示器：一个图标、一个方向。
   曾经三处各写一套（列表里的三角字符、组头的常驻三角 + CSS 旋转、诊断组头的感叹号），
   同一个「可展开」长得不一样不好认。收起态统一转 -90°。 */
.dsh-mcp-caret{display:inline-flex;align-items:center;justify-content:center;flex:none;width:14px;color:var(--mcp-mut);transition:transform .12s}
.dsh-mcp-caret.closed{transform:rotate(-90deg)}
.dsh-mcp-eye{box-sizing:border-box;width:30px;height:26px;flex:none;padding:0;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--mcp-line);border-radius:var(--mcp-r-sm);background:var(--dsw-alias-button-elevated-fill);color:var(--mcp-mut);cursor:pointer;transition:color .12s,border-color .12s,background .12s}
.dsh-mcp-eye:hover{color:var(--dsw-alias-label-primary);border-color:var(--mcp-accent)}
.dsh-mcp-eye.off{color:var(--mcp-err);border-color:var(--mcp-err);background:var(--dsw-alias-interactive-bg-hover-danger)}
.dsh-mcp-eye:disabled{opacity:.5;cursor:not-allowed}
/* ── 通知条（让位 / 降级 / 更新 / 读取失败）──────────────────────────────
   统一成一张三色卡片：中性（无色调）| warn | err | info。进 wrap 的纵向流、
   不挤头部，所以 Tab 行的位置不会因为「有没有通知」而上下跳。
   位置放在 head 之后、第二行之前：先说明状态，再给操作。 */
.dsh-mcp-notice{display:flex;align-items:flex-start;gap:10px;flex:none;padding:10px 12px;border-radius:var(--mcp-r-lg);border:1px solid var(--mcp-line);background:var(--mcp-bg-1);color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family,inherit);font-size:12px}
.dsh-mcp-notice>svg{flex:none;margin-top:1px}
.dsh-mcp-notice-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.dsh-mcp-notice-body b{font-size:12.5px}
.dsh-mcp-notice-body span{color:var(--mcp-mut);line-height:18px;overflow-wrap:anywhere}
.dsh-mcp-notice.warn{border-color:var(--mcp-warn);background:var(--dsw-alias-state-warn-tertiary)}
.dsh-mcp-notice.warn>svg{color:var(--mcp-warn)}
.dsh-mcp-notice.err{border-color:var(--mcp-err);background:var(--dsw-alias-interactive-bg-hover-danger)}
.dsh-mcp-notice.err>svg{color:var(--mcp-err)}
.dsh-mcp-notice.info{border-color:var(--mcp-info);background:var(--dsw-alias-state-business-tertiary)}
.dsh-mcp-notice.info>svg{color:var(--mcp-info)}
.dsh-mcp-notice-actions{display:flex;gap:6px;flex:none;align-items:center}
/* 让位提示不在面板里（它渲染在入口被占的位置），所以要自带定位与抬升。 */
.dsh-mcp-notice-dock{max-width:520px;margin:14px;box-shadow:var(--dsw-elevation-panel)}
/* 一键升级按钮：与 .dsh-mcp-btn.primary 同令牌，但更小——它长在提示条里，不该抢面板主操作的视觉权重。 */
/* 左侧栏底部入口（sidebar.footer.action）：与 DSH 侧栏底部其它控件同规格——
   展开态是 42px 行（图标 + 文字），收起轨道是 36px 圆钮（仅图标）。 */
.dsh-mcp-footer-action{display:inline-flex;align-items:center;gap:8px;width:100%;height:42px;box-sizing:border-box;margin:0 -2px;padding:0 10px 0 8px;border:none;border-radius:var(--mcp-r-md);background:transparent;color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;cursor:pointer;transition:background .15s}
.dsh-mcp-footer-action:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-mcp-footer-action:active{background:var(--dsw-alias-interactive-bg-active)}
.dsh-mcp-footer-action.rail{justify-content:center;gap:0;width:36px;height:36px;margin:0;padding:0;border-radius:50%;corner-shape:round}
.dsh-mcp-footer-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* 响应式覆盖必须位于全部基础规则之后：同特异性下后出现者胜出。 */
@media (max-width:760px){.dsh-mcp-panel-overlay{padding:10px}.dsh-mcp-panel{max-width:none;width:100%;height:calc(100dvh - 20px);border-radius:var(--mcp-r-panel)}.dsh-mcp-panel .dsh-mcp-wrap{padding:12px}.dsh-mcp-head{align-items:flex-start}.dsh-mcp-body{flex-direction:column;overflow-y:auto;overflow-x:hidden}.dsh-mcp-side,.dsh-mcp-ws-body{width:auto;min-width:0;max-height:none;flex:none}.dsh-mcp-side:not(.embedded) .dsh-mcp-list{max-height:38vh}.dsh-mcp-section.local{flex:none;min-height:0;max-height:none}.dsh-mcp-section.local .dsh-mcp-list{max-height:30vh}.dsh-mcp-global-list{max-height:30vh}.dsh-mcp-detail{padding:12px;flex:none;overflow:visible}.dsh-mcp-d-body{overflow:visible}.dsh-mcp-d-title{flex:none}.dsh-mcp-d-head{flex-direction:column}.dsh-mcp-kv-edit{grid-template-columns:minmax(90px,35%) minmax(0,1fr) auto}}
/* 窄屏：标题与关闭留在第一行，能力层与操作区各占一整行。
   ⚠️ 必须显式钉每一样东西的行列。四列 grid 退成两列后，自动排布会把「关闭」挤到第二行
   （子元素顺序是 标题→能力层→操作区→关闭），而「关闭」在任何宽度下都该在右上角。 */
@media (max-width:900px){.dsh-mcp-head{grid-template-columns:minmax(0,1fr) auto}.dsh-mcp-title{grid-row:1;grid-column:1}.dsh-mcp-head>.dsh-mcp-btn{grid-row:1;grid-column:2}.dsh-mcp-head>.dsh-mcp-seg{grid-row:2;grid-column:1}.dsh-mcp-head-actions{grid-row:3;grid-column:1 / -1;justify-content:flex-start}.dsh-mcp-sub{height:auto;min-height:32px;grid-template-columns:minmax(0,1fr)}.dsh-mcp-sub-scope{grid-row:2}.dsh-mcp-runtime{grid-row:3}.dsh-mcp-market-scope{max-width:100%}.dsh-mcp-market-scope select{min-width:0;max-width:100%;flex:1}.dsh-mcp-market-tools .dsh-mcp-search{min-width:0}}
@media (max-width:480px){.dsh-mcp-head{grid-template-columns:minmax(0,1fr) auto}.dsh-mcp-title{grid-row:1;grid-column:1}.dsh-mcp-head>.dsh-mcp-btn{grid-row:1;grid-column:2}.dsh-mcp-head>.dsh-mcp-seg{grid-row:2;grid-column:1 / -1}.dsh-mcp-head-actions{grid-row:3;grid-column:1 / -1;width:100%;justify-content:flex-start}.dsh-mcp-btn{padding:7px 9px}.dsh-mcp-radio-row,.dsh-mcp-number-grid{grid-template-columns:1fr}.dsh-mcp-modal{max-width:none;width:100%;padding:0}.dsh-mcp-modal-head{padding:16px}.dsh-mcp-modal-body{padding:0 16px 16px}.dsh-mcp-modal-actions{padding:12px 16px}.dsh-mcp-kv{grid-template-columns:1fr;gap:4px}.dsh-mcp-kv>b{margin-top:4px}.dsh-mcp-secret-row{grid-template-columns:1fr;gap:4px}.dsh-mcp-secret{width:100%}.dsh-mcp-kv-edit{grid-template-columns:1fr auto}.dsh-mcp-kv-edit input:first-child{grid-column:1 / -1}.dsh-mcp-tool{flex-direction:column}.dsh-mcp-tool-name{max-width:100%}.dsh-mcp-tool-desc{white-space:normal}.dsh-mcp-tool-head{grid-template-columns:minmax(0,1fr) auto}.dsh-mcp-tool-head select{grid-column:1 / -1;width:100%}}
/* 动效约定：宿主官方客户端包普遍在 prefers-reduced-motion 下关掉过渡与弹入动画
   （ui-* 包 46 处 @media，另有若干 JS 侧 matchMedia 判定）。这里关掉缩放弹入与过渡；
   .dsh-mcp-dot.loading 的呼吸只改透明度、且是「正在连接」的状态线索，故保留。
   ⚠️ 本注释在模板字符串内部：不得出现反引号。 */
@media (prefers-reduced-motion:reduce){.dsh-mcp-panel,.dsh-mcp-whatsnew,.dsh-mcp-modal,.dsh-mcp-toast,.dsh-mcp-fab{animation:none}.dsh-mcp-wrap *,.dsh-mcp-panel-overlay *,.dsh-mcp-overlay *,.dsh-mcp-fab,.dsh-mcp-toggle::after{transition:none}}
`;

// ── Skills（能力层第二面）样式 ────────────────────────────────────────────────
//
// ⚠️ 本常量**不得**声明 --mcp-* 别名：别名层的唯一宿主是 MCP_CSS 里那个 body 规则。
// 自定义属性在**声明处**完成替换，所以第二处 body 声明会整体覆盖前一处（顺序靠后者胜），
// 一半界面会取到空值。这里只**消费**已声明的别名（有测试守着）。
//
// ⚠️ 注入必须与 MCP_CSS **合并成一次** __injectCss 调用：那个函数的 id 与 data-plugin-css
// 是写死的 'dsh-toolbox-ui/mcp.css'，以同一 id 二次调用会复用同一个 <style> 并覆写
// textContent——skills 样式会把 MCP 面板样式静默冲掉（不报错，只是面板变形）。
//
// 类名统一 dsh-skills-* 前缀：与 dsh-mcp-* 分开，两者各自的扫描器（theme-contract 的
// 「每个渲染出来的类都要有样式」）才不会互相误判，也便于一眼看出哪块属于哪个能力面。
const SKILLS_CSS = `.dsh-skills-root{display:flex;flex-direction:column;min-height:0;flex:1;gap:0}
.dsh-skills-sec{font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary);margin:14px 0 6px}
.dsh-skills-meta{display:grid;grid-template-columns:96px minmax(0,1fr);gap:4px 10px;font-size:12px;line-height:18px}
.dsh-skills-meta dt{color:var(--mcp-mut);margin:0}
.dsh-skills-meta dd{margin:0;color:var(--dsw-alias-label-primary);word-break:break-all}
.dsh-skills-pre{flex:none;margin:0;padding:14px;border-radius:var(--mcp-r-sm);background:var(--mcp-bg-1);border:.5px solid var(--mcp-line);font-family:var(--mcp-mono);font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);overflow:visible;white-space:pre-wrap;word-break:break-word}
/* 作用域组头：占满列表整行，所以路径放得下（这正是它取代筛选下拉的理由）。
   超长走 ellipsis，完整根路径在 title 里兜底。 */
.dsh-skills-group{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;margin:8px 0 3px;padding:5px 6px;border:0;border-radius:var(--mcp-r-sm);background:transparent;color:var(--mcp-mut);font-family:inherit;font-size:11px;font-weight:600;letter-spacing:.1px;text-align:left;cursor:pointer}
.dsh-skills-group:first-child{margin-top:0}
.dsh-skills-group:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-skills-group.static{cursor:default}
.dsh-skills-group.static:hover{background:transparent;color:var(--mcp-mut)}
/* 组头只定宽度；收起态的旋转由 .dsh-mcp-caret.closed 一处负责（别再写第二条旋转规则）。 */
.dsh-skills-group-caret{flex:none;width:12px}
.dsh-skills-group-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-skills-group-count{flex:none;padding:0 6px;border-radius:999px;corner-shape:round;background:var(--mcp-line);color:var(--mcp-mut);line-height:15px;font-size:10px}
.dsh-skills-risk{border-radius:var(--mcp-r-lg);border:.5px solid var(--mcp-line);background:var(--mcp-bg-2);padding:10px;margin:10px 0}
.dsh-skills-risk-h{display:flex;align-items:center;gap:8px;font-size:12px;line-height:18px;font-weight:600;color:var(--dsw-alias-label-primary);margin-bottom:8px}
.dsh-skills-risk-row{display:flex;gap:10px;font-size:12px;line-height:18px;padding:3px 0;align-items:flex-start}
.dsh-skills-risk-row .k{flex:none;width:104px;color:var(--mcp-mut)}
/* 风险行左列有时带一个图标（如「声明不一致」的警示）。图标是行内 svg，靠 baseline 对齐会偏低。 */
.dsh-skills-risk-row .k svg{vertical-align:-2px;margin-right:3px}
.dsh-skills-risk-row .v{flex:1;min-width:0;color:var(--dsw-alias-label-primary)}
/* 红绿灯的文字承载：颜色不能是唯一载体（无障碍 + 「这点点是咋回事」的直接答案）。
   每个风险档一条自己的文字规则，卡片底栏按档位挑一条用。 */
.dsh-skills-blocked{color:var(--mcp-err);font-weight:600}
.dsh-skills-warn{color:var(--mcp-warn)}
/* 「安装时创建」：紧跟在路径后面，**不许在词组中间折行**（真机上被折成「安装时创/建」）。
   它自己占一行是可以的（选项窄的时候），所以只禁词内折行、不禁换行。 */
.dsh-skills-pending{color:var(--mcp-warn);font-weight:600;white-space:nowrap}
.dsh-skills-ack{display:flex;align-items:flex-start;gap:8px;font-size:12px;line-height:18px;padding:8px 0;color:var(--dsw-alias-label-primary);cursor:pointer}
.dsh-skills-ack input{margin:2px 0 0;flex:none;accent-color:var(--mcp-accent)}
.dsh-skills-note{padding:10px 12px;font-size:12px;line-height:18px;color:var(--mcp-mut);border-top:.5px solid var(--mcp-line);flex:none}
/* 市场翻页区：按钮居中。滚动到底的自动加载挂在 .dsh-mcp-market-view 的 onScroll 上。 */
.dsh-skills-hub-more{display:flex;justify-content:center;padding:4px 0 10px;flex:none}
/* 外部源的「上游页面」链接：与插件其余链接同一套（品牌色 + hover 下划线），
   不在弹窗里引入第二种链接样式。 */
.dsh-skills-link{color:var(--mcp-accent);text-decoration:none;word-break:break-all}
.dsh-skills-link:hover{text-decoration:underline}
.dsh-skills-empty{display:flex;flex:1;align-items:center;justify-content:center;padding:32px 16px;font-size:12px;line-height:18px;color:var(--mcp-mut);text-align:center}

/* ⚠️ 拼表顺序是契约的一部分：将来要加规则前先读这段。
   这两张样式表按 MCP_CSS → SKILLS_CSS 的顺序**拼成一张**（apply 里那一次 __injectCss），
   所以同特异性下 SKILLS_CSS 天然压过 MCP_CSS——而这件事在源码里完全看不出来。
   两次真机事故都出自这里：
     · .dsh-mcp-pane-off 被后面那条 .dsh-mcp-card{display:flex} 压掉 → 三个页签同时显示；
     · 外壳对齐块接在 MCP_CSS 末尾 → 圆角与选中背景根本没生效。
   现在的做法是**不留跨表覆盖块**：所有原语都在自己那张表的定义处一次写对
   （.dsh-mcp-tab 的药丸、.dsh-mcp-d-empty 的成块、分段控件都回了 MCP_CSS）。
   将来若确实需要覆盖 MCP_CSS，覆盖块只能放在**本常量最末尾**，并在这里写明为什么。
   另：整张样式表是模板字符串，注释里不得出现反引号。 */
`;

const h = React2.createElement;

// ── 文案层（locale） ────────────────────────────────────────────────────
//
// 面板的每一句用户可见文案都走这里的 t()。两种语言：源码里的中文字面量是**基准**
// （zh），英文表是它的镜像（en）。
//
// 为什么用「中文字面量当 key」而不是另起一套符号键（'mcp.add.title' 之类）：
//   1. 改动面最小——650 处调用点不需要为取名字再想一遍，替换的是 t('中文') 而不是
//      t(KEY)，键与文案永远不可能对不上（符号键最容易出的错就是改文案忘了改键）。
//   2. 不会漏——哪天新增一句没进英文表，界面上直接显示中文原文，是**看得见的**缺口；
//      符号键漏了则显示 'mcp.some.key'，同样看得见，但中文原文至少还是可读的。
//   3. 拼接句（'已连接 · ' + refs + ' 个会话在用'）在中文里语序固定，英文里未必；
//      所以带参数的句子用 {n} 占位符写成**一条**键，而不是把碎片拼起来。
//
// ctx.locale 不在时会退化成恒等函数（语言包插件缺失、或宿主没挂 dsh-client-locale），
// 面板照常显示中文——**绝不因为翻译层缺席而白屏**。
const LOCALE_NS = 'dsh-toolbox-ui';

/** 英文词典：键是源码里的中文字面量（含 {占位符}），值是英文。 */
const EN_DICT = {
  // —— 作用域与来源标签 ——
  '项目 · .dsh/skills': 'Project · .dsh/skills',
  '项目 · .agents/skills': 'Project · .agents/skills',
  '自定义目录': 'Custom directory',
  '全局 · .dsh/skills': 'Global · .dsh/skills',
  '全局 · .agents/skills': 'Global · .agents/skills',
  '内置（只读）': 'Built-in (read-only)',
  '项目': 'Project',
  '项目 {name}': 'Project {name}',
  // —— 通用 ——
  '全部': 'All',
  '全部作用域（{count}）': 'All scopes ({count})',
  '••••••（保留原值）': '•••••• (keep existing value)',
  '取消': 'Cancel',
  '关闭': 'Close',
  '保存': 'Save',
  '保存中…': 'Saving…',
  '添加': 'Add',
  '编辑': 'Edit',
  '移除': 'Remove',
  '启用': 'Enable',
  '停用': 'Disable',
  '重试': 'Retry',
  '重试中…': 'Retrying…',
  '刷新': 'Refresh',
  '刷新中…': 'Refreshing…',
  '加载中…': 'Loading…',
  '安装': 'Install',
  '安装中…': 'Installing…',
  '复制': 'Copy',
  '复制 JSON': 'Copy JSON',
  '复制失败': 'Copy failed',
  '已复制到剪贴板': 'Copied to clipboard',
  '已复制 JSON 到剪贴板': 'JSON copied to clipboard',
  '复制失败，请手动全选复制': 'Copy failed — select all and copy manually',
  '下载文件': 'Download file',
  '排序': 'Sort',
  '默认顺序': 'Default order',
  '按名称': 'By name',
  '名称': 'Name',
  '按状态': 'By status',
  '状态': 'Status',
  '位置': 'Location',
  '来源': 'Source',
  '许可': 'License',
  '文档': 'Docs',
  '页面': 'Page',
  '概览': 'Overview',
  '诊断': 'Diagnostics',
  '技能正文': 'Skill body',
  '详情分区': 'Detail sections',
  '必填': 'Required',
  '可选': 'Optional',
  '可选值：{values}': 'Allowed values: {values}',
  '默认值：{value}': 'Default: {value}',
  '收起参数': 'Hide arguments',
  '查看参数': 'Show arguments',
  '收起原始 JSON': 'Hide raw JSON',
  '查看原始 JSON': 'Show raw JSON',
  // —— 页面骨架 ——
  '扩展中心': 'Extension Center',
  '工具箱': 'Toolbox',
  '工具箱面板': 'Toolbox panel',
  '工具箱面板（可拖拽移动）': 'Toolbox panel (drag to move)',
  '打开工具箱面板': 'Open the Toolbox panel',
  '能力层': 'Ability layer',
  '模式': 'Mode',
  '入口': 'Entry points',
  '入口显示：{mode}': 'Entry points: {mode}',
  '悬浮按钮 + 侧栏入口': 'Floating button + sidebar entry',
  '仅悬浮按钮': 'Floating button only',
  '仅侧栏入口': 'Sidebar entry only',
  '技能': 'Skills',
  '已安装': 'Installed',
  '发现市场': 'Market',
  // —— 连接与运行状态 ——
  '挂载失败': 'Mount failed',
  '作用域隔离失败': 'Scope isolation failed',
  '作用域故障': 'Scope fault',
  '已禁用': 'Disabled',
  '状态未知': 'Status unknown',
  '连接中…': 'Connecting…',
  '连接失败': 'Connection failed',
  '尚未建立连接（新会话自动挂载）': 'Not connected yet (mounted automatically by a new session)',
  '已连接': 'Connected',
  '已停止': 'Stopped',
  '失败': 'Failed',
  '已连接 · {refs} 个会话在用{tools}': 'Connected · in use by {refs} session(s){tools}',
  '已连接 · 当前无会话使用（连接保留，下次直接用）{tools}': 'Connected · no session using it (connection kept for next time){tools}',
  ' · {count} 工具': ' · {count} tool(s)',
  '{count} 工具': '{count} tool(s)',
  '{count} 个工具': '{count} tool(s)',
  '{count} 个会话共用': 'shared by {count} session(s)',
  '（宿主没有给出原因）': '(the Host gave no reason)',
  '宿主 MCP 读取失败': 'Could not read MCP from the Host',
  'skills 服务未就绪': 'skills service not ready',
  '宿主 skills 服务未就绪，技能面已降级': 'The Host skills service is not ready; the skills pane is degraded',
  '未取到 remote.skillsManager（{reason}）。技能面不可用，MCP 面不受影响。':
    'remote.skillsManager is unavailable ({reason}). The skills pane is unusable; the MCP pane is unaffected.',
  '原因未知': 'reason unknown',
  '排查': 'Troubleshoot',
  '检查宿主是否挂载并启用了 @deepseek-ai/dsh-skill': 'Check that the Host mounts and enables @deepseek-ai/dsh-skill',
  'MCP 配置读取失败': 'Could not read the MCP configuration',
  '加载失败': 'Loading failed',
  // —— 作用域与项目 ——
  '全局': 'Global',
  '全局（当前 profile）': 'Global (current profile)',
  '全局配置': 'Global configuration',
  '项目配置': 'Project configuration',
  '选择左侧的一个 MCP': 'Select an MCP on the left',
  '这里会显示它的连接配置、已注册的工具，以及连接失败时的诊断。':
    'Its connection settings, registered tools, and connection-failure diagnostics appear here.',
  '选择左侧的一个技能': 'Select a skill on the left',
  '这里会显示它的位置与调用权限、SKILL.md 正文，以及遮蔽或校验失败时的诊断。':
    'Its location, invocation permissions, SKILL.md body, and any shadowing or validation diagnostics appear here.',
  '没有匹配的 MCP': 'No matching MCP',
  '没有全局 MCP': 'No global MCP',
  '没有匹配的全局 MCP': 'No matching global MCP',
  '没有发现技能。检查宿主是否挂载了 dsh-skill 内置插件。':
    'No skills found. Check that the Host mounts the dsh-skill built-in plugin.',
  '没有匹配的技能': 'No matching skills',
  '搜索 MCP…': 'Search MCP…',
  '搜索全局 MCP…': 'Search global MCP…',
  '搜索技能…': 'Search skills…',
  '搜索服务、用途或提供方…': 'Search services, purposes, or providers…',
  '搜索 skillhub.cn（回车）': 'Search skillhub.cn (press Enter)',
  '搜索 MCP 服务': 'Search MCP services',
  '搜索技能': 'Search skills',
  '按分类浏览': 'Browse by category',
  '按传输过滤': 'Filter by transport',
  '按状态过滤': 'Filter by status',
  '排序方式': 'Sort order',
  '全部传输': 'All transports',
  '全部状态': 'All statuses',
  // —— MCP 列表操作 ——
  '添加 MCP': 'Add MCP',
  '添加项目 MCP': 'Add project MCP',
  '编辑 MCP': 'Edit MCP',
  '导入 MCP': 'Import MCP',
  '导入 MCP（{scope}）': 'Import MCP ({scope})',
  '导出项目 MCP': 'Export project MCP',
  '复制项目 MCP': 'Copy project MCP',
  '复制项目 MCP 到另一个工作区': 'Copy project MCP to another workspace',
  '导出': 'Export',
  '复制到…': 'Copy to…',
  '排序 MCP': 'Sort MCP',
  '排序技能': 'Sort skills',
  '更多操作': 'More actions',
  '刷新列表': 'Refresh list',
  '重连': 'Reconnect',
  '重连本项目共享连接（拆掉旧连接并按当前配置重建，不影响其他会话）':
    'Reconnect this project’s shared connection (tear down the old one and rebuild from the current config; other sessions are unaffected)',
  '导出本项目的 MCP 配置（JSON，可备份、跨机器迁移或分享）':
    'Export this project’s MCP configuration (JSON — back up, migrate across machines, or share)',
  '把本项目的 MCP 复制到另一个已注册的工作区':
    'Copy this project’s MCP into another registered workspace',

  // —— 第二批：由面板其余文案补全（见 README 的开发说明）——
  'npx 或 C:\\path\\to\\bin.exe': "npx or C:\\path\\to\\bin.exe",
  '.dsh/skills': ".dsh/skills",
  '.agents/skills': ".agents/skills",
  '项目 {name} · {detail}': "Project {name} · {detail}",
  'Filesystem · 本地文件读写': "Filesystem · Local file read/write",
  'Memory · 知识图谱记忆': "Memory · Knowledge graph memory",
  'Sequential Thinking · 分步推理': "Sequential Thinking · Step-by-step reasoning",
  'Time · 时区时间工具（需 uvx）': "Time · Time zone & time tools (requires uvx)",
  'Git · 版本控制（需 uvx）': "Git · Version control (requires uvx)",
  '目标工作区当前有 {count} 个 MCP': "Target workspace currently has {count} MCP servers",
  '新增：{names}': "Added: {names}",
  '、': ", ",
  // 裸拼接的中文标点也走词典：英文排版用 ASCII（': ' 带尾随空格；括号走 '（{name}）' 整句）。
  '：': ": ",
  '覆盖同名：{names}': "Overwrite same name: {names}",
  '跳过同名（保留目标原配置）：{names}': "Skip same name (keep target config): {names}",
  '没有要写入的条目': "No entries to write",
  '{total} 个服务 · {on} 启用{suffix}': "{total} servers · {on} enabled{suffix}",
  ' · {count} 失败': " · {count} failed",
  '{total} 个技能 · {on} 已启用{suffix}': "{total} skills · {on} enabled{suffix}",
  ' · {count} 已停用': " · {count} disabled",
  '：已启用': ": Enabled",
  '：已禁用': ": Disabled",
  '禁用': "Disable",
  '来自其他配置层，只读': "From another config layer, read-only",
  '已屏蔽：': "Blocked: ",
  '可见：': "Visible: ",
  '已在此项目屏蔽，点击恢复可见': "Blocked in this project, click to restore visibility",
  '在此项目可见，点击屏蔽': "Visible in this project, click to block",
  '已屏蔽': "Blocked",
  '复制 {label}': "Copy {label}",
  '隐藏 {label}': "Hide {label}",
  '显示 {label}': "Show {label}",
  '显示/隐藏 {label}': "Show/hide {label}",
  '此 MCP 由全局配置提供。要改它的连接配置，请切到「全局」标签页；在这里只能决定它对本项目是否可见。': "This MCP is provided by the global config. To change its connection settings, switch to the \"Global\" tab; here you can only decide whether it is visible to this project.",
  '以下项目也定义了同名 serverName：{names}。DSH 0.1.5 起各注册作用域可独立使用同名；更早的版本按全进程唯一判定，同名会导致其中一份启动失败。': "The following projects also define an MCP with the same serverName: {names}. Since DSH 0.1.5, each registration scope can use the same name independently; earlier versions required process-wide uniqueness, so a duplicate name caused one of them to fail to start.",
  '工具命名与其他 serverName 前缀重叠，无法可靠判断归属；请避免在 serverName 中使用双下划线。': "Tool names overlap with the prefixes of other serverNames, so ownership cannot be determined reliably; avoid using double underscores in serverName.",
  'serverName 同名冲突': "Duplicate serverName",
  '已在此项目屏蔽': "Blocked in this project",
  '在此项目可见': "Visible in this project",
  '来自 mcp-client 最近日志': "From recent mcp-client logs",
  '连接信息': "Connection info",
  '传输': "Transport",
  '命令': "Command",
  '参数': "Args",
  '工作目录': "Working directory",
  '是': "Yes",
  '否（补丁中 disabled: true）': "No (disabled: true in patch)",
  '配置来源': "Config source",
  '{base}，另有 {count} 条同名条目由其他配置层提供（{ids}）': "{base}, plus {count} other same-named entries from another config layer ({ids})",
  '同一 serverName 在 loader 里还有 {count} 条条目，由其他配置层提供（{items}）。mcp-client 在连接期按作用域判重，同名条目里只有一条能连上；本面板只能编辑/移除属于当前 profile 的那条。': "The same serverName also exists as {count} more loader entries owned by other config layers ({items}). mcp-client rejects duplicates per registration scope at connect time, so only one of them can connect; this panel can only edit/remove the entry owned by the current profile.",
  '（已禁用）': " (disabled)",
  '全局配置（在「全局」标签页可编辑）': "Global config (editable on the \"Global\" tab)",
  '项目配置 .dsh/mcp.json（可编辑，本项目会话共享一份连接）': "Project config .dsh/mcp.json (editable, sessions in this project share one connection)",
  '当前 Web profile（可编辑）': "Current Web profile (editable)",
  '其他 bundle / Agent（只读）': "Other bundles / Agents (read-only)",
  '调用超时': "Invocation timeout",
  '启动失败策略': "Startup failure policy",
  '阻止插件启动': "Block plugin startup",
  '记录错误并继续': "Log error and continue",
  '自动重连': "Auto-reconnect",
  '{min}–{max} ms，最多 {attempts} 次': "{min}–{max} ms, up to {attempts} attempts",
  '环境变量': "Env vars",
  '环境变量 {name}': "Env var {name}",
  '工具（{count}）': "Tools ({count})",
  '工具归属存在命名歧义': "Tool ownership is ambiguous",
  '尚无会话持有该项目连接，或连接尚未就绪': "No session holds a connection for this project yet, or the connection is not ready",
  '暂无工具': "No tools yet",
  '未检测到配置层冲突或工具归属歧义。': "No config layer conflicts or tool ownership ambiguity detected.",
  '请填写 MCP 名称': "Please enter an MCP name",
  '工具超时和最大尝试次数必须是正整数': "Tool timeout and max attempts must be positive integers",
  '重连延迟必须是有效正数且不超过 2147483647 ms': "Reconnect delay must be a valid positive number no greater than 2147483647 ms",
  '首次延迟不能大于最大延迟': "Initial delay cannot exceed max delay",
  '隐藏原值：': "Hide original value: ",
  '显示原值：': "Show original value: ",
  '从预设模板快速填充（可选，命令需本机 npx/uvx）': "Quick-fill from a preset template (optional, command requires local npx/uvx)",
  '选择预设模板': "Select preset template",
  '— 选择预设 —': "— Select preset —",
  'MCP 名称（唯一标识，不可改）': "MCP name (unique ID, cannot be changed)",
  '传输类型': "Transport type",
  'HTTP（远程）': "HTTP (remote)",
  'stdio（本地进程）': "stdio (local process)",
  '参数（每行一个，原样传给进程）': "Args (one per line, passed to the process as-is)",
  '工作目录 cwd（可选）': "Working directory cwd (optional)",
  'Headers（可选）': "Headers (optional)",
  '环境变量（可选，值写 !!js process.env.KEY 引用密钥）': "Env vars (optional, use !!js process.env.KEY as the value to reference a secret)",
  'Bearer … 或 !!js process.env.KEY': "Bearer … or !!js process.env.KEY",
  '删除此项': "Delete this entry",
  '删除 {name}': "Delete {name}",
  '配置项': "Config entries",
  '+ 添加': "+ Add",
  '运行策略': "Runtime policy",
  '工具调用超时（毫秒）': "Tool invocation timeout (ms)",
  '首次连接失败时阻止插件启动': "Block plugin startup on initial connection failure",
  // —— ToolSearch 延迟加载 ——
  '延迟加载工具（ToolSearch 按需搜索）': "Defer tool loading (on demand via ToolSearch)",
  '开启后该服务器的工具不再全量常驻上下文，模型按需通过 tool_search 搜索加载；调用一次多一个往返。适合工具数量多的服务器。': "When enabled, this server's tools no longer stay resident in context; the model loads them on demand via tool_search, at the cost of one extra round trip per discovery. Suited to servers with many tools.",
  '工具延迟加载': "Tool deferral",
  // 主按钮（过滤器行那一颗）：ToolSearch 上线时只加了中文——英文界面下**主按钮显示中文**，
  // 而当时 parity 只覆盖表驱动标签，调用点上的字面量没人核对。新增词条必须同时过
  // test/client-i18n.test.mjs 的"调用点 parity"（它同时守缺英文与死词条两个方向）。
  '全部延迟': "Defer all",
  '取消全部延迟': "Undefer all",
  '延迟': "Deferred",
  // 行内单台开关（两种状态都渲染、都可点）
  '全量': "Resident",
  '该服务器的工具不常驻上下文：模型经 tool_search 按需搜索加载，命中后才进入工具列表。点击切回全量常驻。': "This server's tools do not stay resident in context: the model loads them on demand via tool_search, and they enter the tool list only after a hit. Click to keep them fully resident again.",
  '该服务器的工具每轮都常驻上下文。点击切到延迟加载：模型经 tool_search 按需搜索，命中后才进入工具列表。': "This server's tools stay resident in context every turn. Click to defer them: the model loads them on demand via tool_search, and they enter the tool list only after a hit.",
  '该服务器不属于本插件的配置，延迟开关要回到它自己的作用域里改': "This server is not configured by this plugin; switch deferral where it is configured",
  '已把 {name} 切到延迟加载': "Deferred {name}",
  '已把 {name} 切回全量常驻': "{name} is fully resident again",
  '已开启（{count} 工具经 tool_search 按需加载）': "Enabled ({count} tools load on demand via tool_search)",
  '该服务器 {count} 个工具，将经 tool_search 按需加载': "This server has {count} tools, which will load on demand via tool_search",
  '关闭（工具全量常驻上下文）': "Disabled (all tool schemas stay resident in context)",
  '该服务器仅 {count} 个工具：延迟后按需加载，但每轮仍要付一段引导语，省下的空间可能不多': "This server has only {count} tools: deferral still loads them on demand, but every turn also pays a guidance paragraph, so the space saved may be small",
  '已开启全部延迟加载': "Deferral enabled for all MCP servers",
  '已关闭全部延迟加载': "Deferral disabled for all MCP servers",
  '把当前 Web profile 的所有 MCP 切到延迟加载（{count} 个）：模型经 tool_search 按需搜索，命中后才进工具列表': "Switch all {count} MCP servers in the current Web profile to deferred loading: the model searches on demand via tool_search, and tools enter the list only after a hit",
  '把当前 Web profile 的所有 MCP 切回全量常驻（{count} 个）': "Switch all {count} MCP servers in the current Web profile back to fully resident",
  '把该项目的所有 MCP 切到延迟加载（{count} 个）：模型经 tool_search 按需搜索，命中后才进工具列表': "Switch all {count} MCP servers in this project to deferred loading: the model searches on demand via tool_search, and tools enter the list only after a hit",
  '把该项目的所有 MCP 切回全量常驻（{count} 个）': "Switch all {count} MCP servers in this project back to fully resident",
  // —— C2：延迟加载参数表单 ——
  // —— 统一工具加载策略（表驱动文案走 localized()，这里只收 t() 的调用点）——
  '工具': "Tools",
  '加载方式': "Loading mode",

  '放弃修改': "Discard changes",
  '保存已完成，但重新读取失败：{error}': "Saved, but reloading failed: {error}",
  '已保存工具加载策略': "Tool loading policy saved",
  '搜索参数': "Search settings",
  '一次最多返回几个': "Results per search",
  '搜一次最多拿回几条。调小可能漏掉要用的那个，调大每次多占一点上下文。默认 10。': "How many results one search returns. Smaller may miss the tool; larger costs a little context. Default 10.",
  '同时记住几个已发现的工具': "Remembered tools",
  '模型搜索出来的工具同时保留几个，超了先淘汰最久没用过的。默认 20。': "How many searched tools stay loaded at once; the least recently used are dropped first. Default 20.",
  '限制目录大小': "Limit catalog size",
  '目录上限需要一个正整数': "The catalog limit needs a positive whole number.",
  // —— 工具加载页（第三个能力面）——
  '工具加载': "Tool loading",

  '可设置': "Configurable",
  '常驻': "Resident",
  '按需': "On demand",
  '内置与插件工具': "Built-in & plugin tools",
  '每轮都在上下文里': "In context every turn",
  '搜索命中后加载': "Loaded after a search hit",
  '受保护': "Protected",
  '已改 {count} 项': "{count} changed",
  '已改 {count} 项 + 参数': "{count} changed + settings",
  '参数已修改': "Settings changed",
  '未保存，保存后下一次请求生效': "Unsaved; applies to the next request after saving",

  '目录默认全部列出，只有工具特别多时才需要设上限。': "The catalog lists all tools by default; cap it only when there are very many.",
  '参数已保存': "Settings saved",
  '最多字符数': "Maximum characters",
  '按名称或用途搜索': "Search by name or purpose",
  '按加载策略筛选': "Filter by loading policy",
  '没有匹配的工具。': "No matching tools.",
  '正在读取…': "Loading…",
  '默认': "Default",
  '断开后自动重连': "Auto-reconnect after disconnect",
  '首次延迟 ms': "Initial delay ms",
  '最大延迟 ms': "Max delay ms",
  '最大尝试次数': "Max attempts",
  '读取 MCP 目录失败': "Failed to read MCP directory",
  '移除失败：{name}': "Remove failed: {name}",
  '已移除 {names}': "Removed {names}",
  '安装 MCP 失败': "Failed to install MCP",
  '已配置': "Configured",
  '需密钥': "Needs secret",
  '需连接信息': "Needs connection info",
  '免密钥': "No secret needed",
  '全局已装': "Installed globally",
  '需填参数': "Needs args",
  '安装后需编辑，替换 {names}': "Edit after install, replace {names}",
  '密钥：{names}': "Secrets: {names}",
  '连接：{names}': "Connections: {names}",
  '已写入{scope}': "Written to {scope}",
  '本项目配置': "This project's config",
  '需先填参数': "Parameters required first",
  '全局已装 · 可加一份项目副本': "Installed globally · you can add a project copy",
  '可直接安装': "Ready to install",
  '打开官方文档': "Open official docs",
  'MCP 发现市场': "MCP discovery marketplace",
  '安装到': "Install to",
  '安装到哪个作用域': "Which scope to install to",
  '内置 MCP 目录': "Built-in MCP catalog",
  '正在读取目录…': "Reading catalog…",
  '{total} 个服务 · 已配置 {installed} 个 · 装入{scope}': "{total} services · {installed} configured · installing to {scope}",
  '本项目 {name}': "This project {name}",
  '未配置优先': "Unconfigured first",
  '只要免密钥': "Keyless only",
  '显示 {visible} / {total}': "Showing {visible} / {total}",
  '读取目录失败': "Failed to read catalog",
  '移除失败': "Failed to remove",
  '安装失败': "Failed to install",
  '没有匹配的服务，换个关键词或分类试试': "No matching services — try another keyword or category",
  '目录是空的': "The catalog is empty",
  '收录 ≠ 背书。': "Listing ≠ endorsement.",
  '内置目录只保证「命令与协议形态已核对」，不审查服务端行为。装上之前请确认来源可信——尤其是需要密钥或连接信息的那些。': "The built-in catalog only guarantees that the command and protocol shape have been verified; it does not audit server behavior. Before installing, make sure the source is trustworthy — especially for those that need keys or connection details.",
  '读取本机客户端配置失败': "Failed to read local client config",
  '这条配置里没有可导入的 MCP': "No importable MCP in this config",
  '预览失败': "Preview failed",
  'JSON 解析失败': "JSON parse failed",
  '导入失败': "Import failed",
  '替换会删除{scope}': "Replacing will delete {scope}",
  '该项目': "this project",
  '当前 Web profile': "Current Web profile",
  '{warning}中未出现在 JSON 里的 MCP。确认继续？': "MCP in {warning} that do not appear in the JSON. Continue anyway?",
  '{warning}中未出现在这份来源里的 MCP。确认继续？': "MCP in {warning} that do not appear in this source. Continue anyway?",
  '无': "None",
  '更新：{names}': "Update: {names}",
  '移除：{names}': "Remove: {names}",
  '提示：{warning}': "Note: {warning}",
  '项目级': "Project-level",
  '没检测到这个项目的项目级 MCP 配置（.mcp.json / .codex/config.toml / .pi/mcp.json / opencode.json 等），可在下面手动粘贴': "No project-level MCP config detected for this project (.mcp.json / .codex/config.toml / .pi/mcp.json / opencode.json, etc.) — you can paste it manually below",
  '没检测到本机客户端的全局 MCP 配置（~/.claude.json / ~/.codex/config.toml / ~/.config/opencode/opencode.json 等），可在下面手动粘贴': "No global MCP config detected for local clients (~/.claude.json / ~/.codex/config.toml / ~/.config/opencode/opencode.json, etc.) — you can paste it manually below",
  '导入 MCP{scope}': "Import MCP {scope}",
  '（{name}）': " ({name})",
  '从本机客户端导入{layer}配置（只读，不修改它们的文件）': "Import {layer} config from local clients (read-only, their files are not modified)",
  '正在扫描本机客户端配置…': "Scanning local client configs…",
  '{count} 个 MCP：{names}': "{count} MCP: {names}",
  '没有可导入的 MCP': "No importable MCP",
  '含需掩码字段：{names}（导入后在详情页可用眼睛查看）': "Contains fields to mask: {names} (after importing, view them on the details page with the eye icon)",
  '环境变量未设置：{names}（导入后该处会得到空值）': "Environment variables not set: {names} (after importing, those will be empty)",
  '{count} 条提示，导入时逐条列出': "{count} notes, listed one by one during import",
  '或粘贴 JSON：支持 Claude/Cursor/Cline/Roo 的 mcpServers、VS Code 的 servers，以及单个 MCP 对象': "Or paste JSON: supports Claude/Cursor/Cline/Roo mcpServers, VS Code servers, and a single MCP object",
  '合并（同名更新）': "Merge (update by name)",
  '替换该项目': "Replace this project",
  '替换当前 Profile': "Replace current profile",
  '取消选择来源': "Clear selected source",
  '导入中…': "Importing…",
  '确认从来源导入': "Confirm import from source",
  '解析中…': "Parsing…",
  '预览': "Preview",
  '确认导入': "Confirm import",
  '解析并预览': "Parse and preview",
  '导出失败': "Export failed",
  '已开始下载 {filename}': "Download started: {filename}",
  '下载失败：{error}（可改用「复制 JSON」）': "Download failed: {error} (you can use \"Copy JSON\" instead)",
  '导出项目 MCP{scope}': "Export project MCP {scope}",
  '正在读取项目配置…': "Reading project config…",
  '共 {count} 个 MCP{suffix}': "{count} MCP total{suffix}",
  '，含 exclude（{names}）': ", including exclude ({names})",
  '这是完整配置：字面写死的凭据（URL 里的 token、字面 header / env 值）会原样出现在这里，请按密钥对待。用 ${VAR} 引用的位置保持引用写法，不会被解析成明文。': "This is the complete config: hardcoded credentials (tokens in URLs, literal header / env values) appear here verbatim, so treat them as secrets. Places that reference ${VAR} keep the reference form and are not resolved to plaintext.",
  '格式与 .dsh/mcp.json 一致：可以直接放进目标工作区的 .dsh/mcp.json，或用「导入 MCP」粘贴回来（粘贴只读取 mcpServers，exclude 需要手动设）。': "The format matches .dsh/mcp.json: you can drop it straight into the target workspace's .dsh/mcp.json, or paste it back via \"Import MCP\" (pasting only reads mcpServers; exclude must be set manually).",
  '无法预览目标工作区': "Cannot preview the target workspace",
  '源：{source}。复制在宿主内完成，配置与凭据不会经过浏览器。': "Source: {source}. Copying happens inside the Host; config and credentials never pass through the browser.",
  '目标工作区': "Target workspace",
  '选择目标工作区…': "Select target workspace…",
  '{name}（{count} 个 MCP）{suffix}': "{name} ({count} MCP){suffix}",
  ' · 配置无效': " · invalid config",
  '没有其他已注册的工作区：先在 DSH 里打开另一个项目，它会出现在顶部标签页里。': "No other registered workspaces: open another project in DSH first and it will appear in the top tabs.",
  '要复制的 MCP（{selected}/{total}）': "MCP to copy ({selected}/{total})",
  '全不选': "Deselect all",
  '全选': "Select all",
  '目标已有同名条目时按下方选择处理': "When the target already has an entry with the same name, apply the choice below",
  '跳过目标同名': "Skip same-name in target",
  '覆盖目标同名': "Overwrite same-name in target",
  '写入结果预览': "Write result preview",
  '正在读取目标工作区配置…': "Reading target workspace config…",
  '选择已变化，正在按当前选择重算…': "Selection changed, recalculating for the current selection…",
  '等预览算出当前选择的结果': "Wait for the preview to compute the current selection",
  '复制中…': "Copying…",
  '已刷新项目 MCP，共 {count} 个': "Project MCP refreshed, {count} total",
  '已刷新，共 {count} 个 MCP': "Refreshed, {count} MCP total",
  '{method} 成功': "{method} succeeded",
  '{method} 失败': "{method} failed",
  '已启用 ': "Enabled ",
  '已禁用 ': "Disabled ",
  '已重连 {name}': "Reconnected {name}",
  '已请求重连 {name}': "Reconnect requested for {name}",
  '确认移除 MCP「{name}」？将从{scope}中删除。': "Remove MCP \"{name}\"? It will be deleted from {scope}.",
  '当前 Web profile 配置': "Current Web profile config",
  '已屏蔽 {name}，对运行中的会话立即生效': "Blocked {name}, effective immediately for running sessions",
  '已取消屏蔽 {name}，对运行中的会话立即生效': "Unblocked {name}, effective immediately for running sessions",
  '该 MCP 来自其他配置层，配置只读，无法查看具体值': "This MCP comes from another config layer; its config is read-only, so specific values can't be viewed",
  '读取配置失败': "Failed to read config",
  '已保存 {name}': "Saved {name}",
  '已添加 {name}': "Added {name}",
  '保存失败': "Save failed",
  '添加失败': "Add failed",
  '已导入 MCP': "MCP imported",
  '已安装所选 MCP': "Selected MCP installed",
  '已复制': "Copied",
  '调用失败': "Invocation failed",
  '（配置无效：{error}）': "(Invalid config: {error})",
  '技能服务未连接': "Skill service not connected",
  '{count} 个项目 MCP 未能挂载到会话': "{count} project MCPs could not be mounted to the session",
  '。首个原因：{reason}　点开对应条目查看每一条的具体错误。': ". First reason: {reason} Click the corresponding entry to see the specific error for each one.",
  '　本项目当前有 {count} 个会话在运行。': " This project currently has {count} running sessions.",
  '{count} 个项目 MCP 的工具无法隔离（会出现在所有项目的会话里）': "Tools of {count} project MCPs can't be isolated (they will appear in sessions of all projects)",
  '屏蔽未能写入会话作用域': "Blocking could not be written to session scope",
  '正在升级到 v{version}…': "Upgrading to v{version}…",
  '已升级到 v{version}，重启宿主后生效': "Upgraded to v{version}; takes effect after the Host restarts",
  '升级失败：{text}': "Upgrade failed: {text}",
  '本地链接安装，无法一键升级{suffix}': "Local link install, one-click upgrade unavailable{suffix}",
  '（当前 v{version}）': "(current v{version})",
  '新版本 v{version} 可用': "New version v{version} available",
  '宿主代码在进程内执行，不重启等于没升级。': "Host code runs in-process, so not restarting is the same as not upgrading.",
  '升级由官方 pluginManager 执行，装完需要重启宿主。': "The upgrade is performed by the official pluginManager; the Host must be restarted afterwards.",
  '升级由官方 pluginManager 执行，装完需要重启宿主': "The upgrade is performed by the official pluginManager; the Host must be restarted afterwards",
  '升级': "Upgrade",
  '看这次改了什么': "See what changed",
  '查看更新方式': "View update method",
  '本版本内不再提示': "Don't show again in this version",
  '写入当前 Web profile 的 MCP 配置，所有项目共享': "Write MCP config to the current Web profile, shared by all projects",
  '{path}（.dsh/mcp.json，只对该项目的会话生效）': "{path} (.dsh/mcp.json, effective only for this project's sessions)",
  '还没有项目 MCP。点上方「添加项目 MCP」，或去「发现市场」安装。': "No project MCP yet. Use \"Add project MCP\" above, or install one from \"Discover marketplace\".",
  '共享的全局 MCP': "Shared global MCP",
  '项目 MCP': "Project MCP",
  '此项目还没有 MCP': "This project has no MCP yet",
  'MCP 来源': "MCP source",
  '全局共享': "Shared global",
  '搜索参数需要正整数': "Search settings must be positive whole numbers",
  '已显示 {shown} / 共 {total} 条': "Showing {shown} of {total}",
  '正在连接 skills 服务…': "Connecting to the skills service…",
  '{visible}/{total} 可见': "{visible}/{total} visible",
  '新版本与当前 DSH 不兼容，未升级。': "The new version is incompatible with the current DSH; not upgraded.",
  '该包没有声明组合包，不能作为插件安装。': "This package does not declare a bundle package, so it cannot be installed as a plugin.",
  '版本号不合法，未升级。': "Invalid version number; not upgraded.",
  '无法确定要升级哪个包，未升级。': "Cannot determine which package to upgrade; not upgraded.",
  '在 profile 里找不到这个插件，未升级。': "This plugin was not found in the profile; not upgraded.",
  '宿主正在停止，未升级；请重启后再试。': "The Host is stopping; not upgraded. Please restart and try again.",
  '该包正在被使用，未升级。': "This package is in use; not upgraded.",
  '构建授权已过期，未升级；请重试。': "Build authorization has expired; not upgraded. Please try again.",
  '当前 profile 由应用托管，不允许在这里改动。': "The current profile is managed by the application and cannot be modified here.",
  '这一项无法被单独改动（随 DSH 提供）。': "This item cannot be modified individually (it ships with DSH).",
  '错误码 {code}': "Error code {code}",
  'pnpm 退出码 {code}': "pnpm exit code {code}",
  '升级失败（{bits}）：': "Upgrade failed ({bits}):",
  '，': ", ",
  '升级失败：': "Upgrade failed:",
  '升级失败（{bits}）。': "Upgrade failed ({bits}).",
  '升级失败。': "Upgrade failed.",
  '本次更新内容': "What's in this update",
  'v{version} 的更新': "What's new in v{version}",
  '这些变化你可能想知道': "These changes may be of interest",
  '知道了': "Got it",
  '已让位给另一个 MCP 管理插件': "Yielded to another MCP management plugin",
  '检测到 {name} 已挂载，本面板不再注册入口，以免两个面板互相遮挡、同时改写同一份配置。': "Detected that {name} is already mounted, so this panel no longer registers an entry, to avoid the two panels covering each other and both rewriting the same config.",
  '另一个 MCP 管理插件': "Another MCP management plugin",
  '卸载其中一个后重启 DSH 即可恢复。': "Uninstall one of them and restart DSH to restore.",
  '旧机制停用': "Legacy mechanism disabled",
  '已停用': "Disabled",
  '模型不会自动调用它': "The model will not invoke it automatically",
  '模型不用': "Not model-invocable",
  '你不能用 /名字 手动调用它': "You cannot invoke it manually with /name",
  '不可手调': "Not user-invocable",
  '模型只会收到「{scope}」那一份': "The model will only receive the \"{scope}\" copy",
  '被遮蔽': "Shadowed",
  '另有 {names}': "Plus {names}",
  '同名 {count} 份': "{count} with the same name",
  '：已停用': ": disabled",
  '内置技能只读': "Built-in skills are read-only",
  '面板没能定位这条技能的目录（技能目录可能是符号链接），因此读不到它的调用权限——文件本身可能是好的': "The panel could not locate this skill's directory (the skill directory may be a symlink), so its invocation permissions could not be read — the file itself may be fine",
  'SKILL.md 的 frontmatter 读不出来（宿主会跳过这条技能），无法判断它的调用权限': "The SKILL.md frontmatter cannot be read (the Host will skip this skill), so its invocation permissions cannot be determined",
  '（加载中…）': "(Loading…)",
  '读取失败': "Read failed",
  '宿主未返回原因': "Host returned no reason",
  '（无正文）': "(No body)",
  '内置只读': "Built-in, read-only",
  '已启用': "Enabled",
  '模型可调用': "Model-invocable",
  '模型不可调用': "Not model-invocable",
  '调用权限未知': "Invocation permission unknown",
  '用户不可调用': "Not user-invocable",
  '这是旧版启停机制（改名成 .disabled）留下的条目；恢复后请用新的停用方式': "This entry was left behind by the old enable/disable mechanism (renaming to .disabled); after restoring it, use the new way to disable it",
  '旧机制残留': "Legacy mechanism leftover",
  '删除技能': "Delete skill",
  '技能属性': "Skill properties",
  '（未报告）': "(Not reported)",
  '旧机制停用（SKILL.md.disabled）——点「启用」把它改回来': "Disabled by the old mechanism (SKILL.md.disabled) — click \"Enable\" to change it back",
  '已停用（disable-model-invocation: true + user-invocable: false）': "Disabled (disable-model-invocation: true + user-invocable: false)",
  '未知（读不到这个文件）': "Unknown (cannot read this file)",
  '模型自动调用': "Model auto-invocation",
  '{name}：允许模型自动调用': "{name}: allow model auto-invocation",
  '写入 SKILL.md 的 disable-model-invocation。宿主用文件监听盯技能根，改动约 0.25 秒就生效（实测中位数 246ms），不必重启': "Writes disable-model-invocation in SKILL.md. The Host watches the skill root with a file watcher, so changes take effect in about 0.25 seconds (measured median 246ms) — no restart needed",
  '允许': "Allow",
  '禁止': "Forbid",
  '未知': "Unknown",
  '用户可调用': "User-invocable",
  '{name}：允许用户手动调用': "{name}: allow manual user invocation",
  '写入 SKILL.md 的 user-invocable：关掉后你就不能用 /名字 手动调用它（模型仍可自动调用）。与上面那个一起关掉就是「已停用」': "Writes user-invocable in SKILL.md: turning it off means you can no longer invoke it manually with /name (the model can still auto-invoke it). Turning it off together with the one above makes it \"Disabled\"",
  '同名遮蔽': "Same-name shadowing",
  '实际生效': "Actually in effect",
  '来自 {scope}，模型只会收到那一份；本行是另一个作用域里的副本。': "Comes from {scope}; the model only receives that one. This row is the copy in another scope.",
  '未检测到跨作用域同名遮蔽，本份已进入模型目录。': "No cross-scope same-name shadowing detected; this copy is in the model catalog.",
  '安装 {name}': "Install {name}",
  '上游未提供许可信息': "Upstream provided no license information",
  '上游页面': "Upstream page",
  '外部源（skillhub.cn）': "External source (skillhub.cn)",
  '本插件未核验': "Not verified by this plugin",
  '只做来源披露，不做许可判定、不做安全审查': "Source disclosure only; no license determination and no security review",
  '发布方': "Publisher",
  '已认证{suffix}': "Verified{suffix}",
  '：{name}': ": {name}",
  '未提供认证信息': "No verification information provided",
  '安全扫描': "Security scan",
  '上游未提供扫描结论': "Upstream provided no scan conclusion",
  '运行前提': "Requirements",
  '需要 API Key': "API Key required",
  '不需要 API Key': "No API Key required",
  '它会带来什么': "What it brings",
  '进入模型上下文': "Enters the model context",
  '技能正文会作为指令注入会话': "The skill body is injected into the session as instructions",
  '可执行片段': "Executable content",
  '上游未提供清单，本插件未核验：正文可能引用 scripts/ 等可执行文件': "Upstream provided no manifest and this plugin did not verify it: the body may reference executables such as scripts/",
  '含 scripts/ 目录': "Contains a scripts/ directory",
  '无 scripts/ 目录': "No scripts/ directory",
  '工具权限': "Tool permissions",
  '上游未提供，本插件未核验': "Not provided by upstream, not verified by this plugin",
  '未声明': "Undeclared",
  '　安装时创建': " Created at install time",
  '没有可写入的技能目录': "No writable skill directory",
  '宿主报告的作用域都是只读的（例如只有内置技能）。装不了任何位置——先确认 DSH 的用户级技能目录存在且可写。': "Every scope reported by the Host is read-only (for example, only built-in skills). Nothing can be installed anywhere — first make sure the DSH user-level skill directory exists and is writable.",
  '我知道这是外部来源、本插件未做核验，愿意自行承担安装后的风险。': "I understand this is an external source that this plugin has not verified, and I accept the risk of installing it.",
  '先勾选上面的确认': "Check the confirmation above first",
  '确认并安装': "Confirm and install",
  '未知发布者': "Unknown publisher",
  '下载 {count}': "Download {count}",
  '（上游未提供说明）': "(No description provided by upstream)",
  '已认证': "Verified",
  '需 API Key': "API Key required",
  '本地已有同名技能': "A skill with the same name already exists locally",
  '来自 skillhub.cn': "From skillhub.cn",
  '在 skillhub.cn 上查看': "View on skillhub.cn",
  '搜索失败': "Search failed",
  '确认删除技能「{name}」？{target}会从磁盘移除，不可撤销。': "Delete skill \"{name}\"? {target} will be removed from disk and cannot be undone.",
  '整个目录（含 scripts/references）': "The entire directory (including scripts/references)",
  '该文件': "That file",
  '技能面板': "Skills panel",
  '技能发现市场': "Skill discovery marketplace",
  'skillhub.cn（外部源）': "skillhub.cn (external source)",
  '正在搜索…': "Searching…",
  '已显示 {shown} / 共 {total} 条 · 装入{scope}': "Showing {shown} of {total} · Install into {scope}",
  '当前宿主进程还没有外部源接口': "The current Host process does not yet have the external source interface",
  '面板已更新，但这个正在运行的宿主进程是在更新之前启动的，所以它不认识 skillHubSearch。重启宿主（dsh 进程）后即可使用。': "The panel has been updated, but this running Host process was started before the update, so it does not recognize skillHubSearch. Restart the Host (the dsh process) to use it.",
  '连接 skillhub.cn 失败': "Failed to connect to skillhub.cn",
  '没有匹配的外部技能。': "No matching external skills.",
  '加载更多失败': "Failed to load more",
  '加载更多': "Load more",
  '外部源，本插件未核验。': "External source, not verified by this plugin.",
  'skillhub.cn 上的技能由任何人发布，条目里没有许可信息；安装前会把上游给的发布方认证与安全扫描结论摆出来，但那不等于本插件的审查结论。收录 ≠ 背书。': "Skills on skillhub.cn are published by anyone, and listings carry no license information; before installation, the publisher verification and security scan conclusions provided by upstream are shown, but those are not this plugin's own review conclusions. Listed ≠ endorsed.",
  'MCP 市场服务未连接（面板仍可用）': "MCP marketplace service not connected (the panel still works)",
  '技能服务未连接（需要宿主挂载 dsh-skill）': "Skill service not connected (requires the Host to mount dsh-skill)",
}

/** EN_DICT 里有没有这条键（中文原文 → 英文译文的查表存在性判断）。 */
const dictHas = (key) => Object.prototype.hasOwnProperty.call(EN_DICT, key);

/**
 * 中文「词典」：恒等映射（键就是中文原文本身）。
 *
 * 为什么必须注册它：宿主按 **active → fallback 链** 查命名空间，而英文是每条链的
 * 终点（`LocaleRuntime.fallbackChain` 末尾强制追加 `FALLBACK_LOCALE='en'`，
 * 见 deepseek-harness 的 packages/client/locale）。只注册 en 那一份时，中文模式下
 * 链是 ['zh','en']：zh 未命中 → **落到 en 命中** → 整片面板变英文（真机事故：
 * DSH 设中文，面板除了走数据的分类标签全是英文）。平台的 register 契约也要求
 * 双语平衡（"every shipped locale is required"）——单语言注册双语命名空间是违规用法。
 * 中文这份恒等，正是「我们的中文就是原文本身」的诚实表达。
 */
const ZH_DICT = Object.fromEntries(Object.keys(EN_DICT).map((key) => [key, key]));

/**
 * 把一个中文字面量渲染成**当前语言**的文案。
 *
 * 唯一判据是 locale 服务报的 active 语言：
 *   · active === 'en' 且 EN_DICT 有这条 → 英文；
 *   · 其他一律返回中文原文。
 *
 * ⚠️ 这里**刻意不做**「EN_DICT 无条件兜底」。曾经写成「locale 服务不在时也出英文」，
 * 结果是测试里（以真 bundle 渲染但不装 locale 服务）全部文案变英文、28 个断言中文的
 * 用例集体失败——而那 28 个断言是对的：**没有 locale 服务 = 没有语言切换能力 = 原文**。
 * 英文不是默认值，它是被显式选中的语言；把英文当兜底等于替用户改了他的语言设置。
 *
 * @param {string} zh - 源码里的中文字面量（带 {占位符} 时用 vars 填充）。
 * @param {object} [vars] - 占位符取值；未提供的占位符原样留在文案里（便于发现漏填）。
 * @returns {string}
 */
let localeT = null;
/** 当前 active 语言是否为英文。由 apply 接线时更新（见文件末尾）。
 *  BCP 47 用连字符、部分宿主/老配置用下划线（en_US），两种分隔符都切。 */
let localeActive = null;
const localeIsEnglish = () => typeof localeActive === 'string' && localeActive.toLowerCase().split(/[-_]/)[0] === 'en';
/**
 * 送给**宿主**的语言标记（市场条目的文案用）。英文界面给 'en'，其余一律给 undefined。
 *
 * 为什么给 undefined 而不是 'zh'：宿主那边 `pickLocalized` 的默认分支就是中文优先，
 * 不传字段 = 走默认 = 与改前逐字节一致。少传一个字段，老宿主、老面板、新面板三者
 * 的任何组合都不会改变中文用户看到的东西。
 */
const contentLocale = () => (localeIsEnglish() ? 'en' : undefined);

/**
 * 从目录条目里取一条**随语言变**的文案（label / summary / access / vendor）。
 *
 * 目录是随插件发下来的静态数据，每条只有中文原文 + 可选的 `*En` 字段
 * （由 scripts/build-catalog.mjs 从英文副本生成）。所以这里不是 t() 那种「查词典」，
 * 而是「同一份数据里挑一种写法」。
 *
 * ⚠️ 中文（默认）返回**原字段**，与改前逐字节一致——英文副本缺席时也是这条路。
 * 英文侧缺字段就回落中文，绝不返回空串（宁可显示中文，也不要一张空卡片）。
 *
 * @param {object} item - MCP_CATALOG 的一项。
 * @param {string} field - 字段基名（label / summary / access / vendor）。
 * @returns {string}
 */
function pickCatalogText(item, field) {
  const zh = item?.[field]
  if (!localeIsEnglish()) return zh ?? '';
  const en = item?.[`${field}En`]
  return (typeof en === 'string' && en.trim() !== '') ? en : (zh ?? '');
}

function t(zh, vars) {
  let out = zh;
  // 宿主词典优先：它登记了这条就用它（语言包可以覆盖本 bundle 自带的译法）。
  if (localeT) {
    const hit = localeT(zh);
    // 语言包没登记这条键时 bind() 返回键本身——那不代表「翻译成中文」，
    // 而是「这条没翻」，此时才轮到自带表。
    if (typeof hit === 'string' && hit !== zh) out = hit;
  }
  // 自带表只在 active 明确是英文时生效。**不能**当成无条件兜底：
  // 没有 locale 服务 = 没有语言切换能力 = 原文（中文），英文必须是被显式选中的语言。
  if (out === zh && localeIsEnglish() && dictHas(zh)) out = EN_DICT[zh];
  if (vars === undefined) return out;
  return out.replace(/\{(\w+)\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : whole);
}

/**
 * 取一条**本地化内容值**的当前语言文本。DSH 的 LocalizedText 形状：
 * `string | { en, ...locale }`（见宿主 `@deepseek-ai/dsh-package-manifest`，
 * 它配 resolveText 的回落链解析包文案）。这里中文是基准：显式英文才出英文，
 * 英文缺席回落中文——与 t() 同一把尺（没有语言服务 = 原文）。
 *
 * 使用者是**数据**（whats-new 的条目），不是界面文案：那些走 t() + EN_DICT。
 * @param {string|{zh?:string,en?:string}|undefined} value - 本地化内容值。
 * @returns {string}
 */
function localized(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  return localeIsEnglish() ? (value.en ?? value.zh ?? '') : (value.zh ?? value.en ?? '');
}

// ── 技能面板的纯逻辑 ────────────────────────────────────────────────────
// 单独放一组、且都是纯函数：面板组件本身在 jsdom 里测不出多少真东西（渲染得出来 ≠ 对），
// 而下面这些推导才是最容易出错的地方（作用域归属、遮蔽、诊断合并、红绿灯判定）。

/**
 * 宿主六级 source 的可读标签（SPEC 约束 2 的完整集合）。
 *
 * ⚠️ 表里存的是**中文原文（词典键）**，不是 t() 的结果。
 * 模块级求值的 t() 一定拿到中文：这些常量在 bundle 加载时就建好了，而 active 语言要等
 * apply() 读到 locale 服务才知道——先求值就等于把语言**在加载那一刻定死**。
 * 真机表现：切到 English 后，凡来自这些表的文案仍是中文（详情页签、排序菜单、入口菜单、
 * 作用域标签），其余都正常。所以统一改成「存键、用时翻」，调用点见各处的 t(...)。
 */
const SCOPE_LABELS = {
  'project-dsh': '项目 · .dsh/skills',
  'project-agents': '项目 · .agents/skills',
  custom: '自定义目录',
  'user-dsh': '全局 · .dsh/skills',
  'user-agents': '全局 · .agents/skills',
  bundled: '内置（只读）',
};

/**
 * 项目级 source 的**路径部分**（不含「项目」前缀）。
 *
 * 为什么单独存一份：带项目名的那句是「项目 {name} · {detail}」——
 * 前缀与路径各自要能翻译，而合起来又必须是一条整句（中英语序不同）。
 * 所以把不随项目变的那半段提出来，按 source 取。
 */
const PROJECT_SOURCE_PREFIX = 'project-';
// 同 SCOPE_LABELS：存原文，用时翻（模块级 t() 会锁死成加载时的语言）。
const SCOPE_LABEL_DETAILS = {
  'project-dsh': '.dsh/skills',
  'project-agents': '.agents/skills',
};

/**
 * 从工作区路径取项目名（末段目录名）。
 * Windows 与 POSIX 都要吃：宿主回的是各平台原生分隔符。
 */
function projectLabelOf(cwd) {
  const parts = String(cwd || '').split(/[\\/]+/).filter(Boolean);
  return parts.length === 0 ? '' : parts[parts.length - 1];
}

/**
 * 一行的作用域标签：在「哪一级 source」之上补上「**哪个项目**」。
 *
 * SCOPE_LABELS 只回答前者，于是多工作区下每个项目级技能都写着同一句
 * 「项目 · .agents/skills」——用户问的「你分项目和全局，但没说哪个项目啊」
 * 就是这个。行数据上一直有 cwd（toView 带过来的），只是从没被用上。
 *
 * 完整路径放 title 与详情页的根目录行；两个项目末段目录同名时，靠这两处区分。
 *
 * ⚠️ 这里**按 source 判「是不是项目级」**，绝不按显示出来的标签判。
 * 曾经写成 `base.startsWith(t('项目'))` / `base.replace(t('项目'), …)`——那是用**文案**
 * 当判据：`t()` 在英文下返回 'Project · .agents/skills'，而 `t('项目')` 返回 'Project'，
 * 于是英文界面里两件事同时坏掉——`startsWith` 侥幸还对（都以 Project 开头），
 * 但 replace 只会换掉第一处、且中文下 `'项目 ' + name` 里的前缀又没走 t()。
 * 判据必须是数据（source），文案只负责显示。
 */
function skillScopeLabel(row) {
  const source = row?.source;
  // 两张表存的都是中文原文（词典键），所以这里必须过 t()：这是**渲染路径**，
  // 每次调用都读当前语言，切语言后立刻正确。
  const base = t(SCOPE_LABELS[source] || source || '');
  // 项目级 source 是 project-dsh / project-agents 两个（见 skillScopeOptions 的同源判据）。
  if (!String(source || '').startsWith(PROJECT_SOURCE_PREFIX)) return base;
  const name = projectLabelOf(row?.cwd);
  return name === '' ? base : t('项目 {name} · {detail}', { name, detail: t(SCOPE_LABEL_DETAILS[source] || '') });
}

/**
 * 作用域候选项，**由实际发现的 source 集合派生**（SPEC 约束 12）。
 *
 * 为什么不能写死一份「全局/项目」清单：本机 `~/.dsh/skills`（rank 400）**不存在**，
 * 11 个技能全在 `~/.agents/skills`（rank 500）。写死的清单会让用户看到一个空的作用域、
 * 或看不到自己技能真正所在的那一级。所以只列宿主真报出来的来源，并带上真实根路径。
 *
 * @param {object[]} rows - 技能行（listSkillViews 的结果）。
 * @returns {{ source: string, label: string, scope: string, root: string|undefined, cwd: string|undefined }[]}
 */
/**
 * 候选的**展示顺序**按宿主 rank（见 docs/skills.md 的优先级表）。
 *
 * 这只决定「谁排在前面」（也就是安装时的默认选中项），**不决定谁存在**——
 * 存在与否永远只看宿主实际报了什么（约束 12）。所以表里没有的 source 一律排到最后。
 * 为什么值得单独一张表：localeCompare 会把 bundled 排到 user-dsh 前面（'b' < 'u'），
 * 于是只读的内置目录成了安装弹窗的默认目标。
 */
const SOURCE_RANK = { 'project-dsh': 100, 'project-agents': 200, custom: 300, 'user-dsh': 400, 'user-agents': 500, bundled: 600 };
const sourceRank = (source) => SOURCE_RANK[source] ?? 999;

function skillScopeOptions(rows) {
  const seen = new Map();
  for (const entry of Array.isArray(rows) ? rows : []) {
    // ⚠️ 去重键必须是**作用域身份（source + cwd）**，不是 source：两个工作区都会有
    // `project-agents`，只按 source 去重会把它们合成一项，还带上第一个的 root。
    //
    // 曾经这里还要展开 `row.disabled`（旧版把已停用技能放在**第二个数组**里）——
    // 那个数组已经不存在了（停用是行上的派生态，见 SkillsManagerGateway.list）。
    const source = entry?.source;
    if (typeof source !== 'string' || source === '' || seen.has(skillScopeIdentity(entry))) continue;
    seen.set(skillScopeIdentity(entry), {
      // 安装目标的身份与宿主一致：source + root（见 installTargetId）。
      id: installTargetId({ source, root: entry.root }),
      source,
      // 标签同样带项目名：筛选下拉里两行「项目 · .agents/skills」是没法选的。
      label: skillScopeLabel(entry),
      scope: entry.scope === 'project' ? 'project' : 'global',
      root: entry.root,
      cwd: entry.cwd,
      // wire 上的目标引用用的是 projectPath；这条退路上它等于行的 cwd。
      projectPath: entry.cwd,
      // ⚠️ writable 必须带下去：宿主在每一行上标了它（bundled 为 false），
      // 第一版把它丢了，于是「内置（只读）」既进了候选、还因为排在前面成了**默认**
      // 安装目标。注意它现在只是**显示用**：真正的可写与否由服务端判定（不接受载荷里的 writable）。
      writable: entry.writable !== false,
    });
  }
  // 全局在前、项目在后（与宿主 rank 的语义一致：rank 小的先被采纳，用户级是默认视角）。
  return [...seen.values()].sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === 'global' ? -1 : 1;
    const rank = sourceRank(left.source) - sourceRank(right.source);
    return rank !== 0 ? rank : left.label.localeCompare(right.label);
  });
}

/**
 * 技能行的**唯一身份**：`source + cwd + name`。
 *
 * 为什么必须只有一个：同一件事曾经在面板里被写成四份不同的身份——行的 key 用
 * `scope:source:name`、分组键用 `rank\0source\0cwd`、诊断去重用 `scope:name`、
 * 安装目标用 `source`——于是「同名跨作用域是合法配置」这条事实在每个推导里都要被
 * 重新记得一次，漏掉一个就是静默错：
 *   · 诊断按 `scope:name` 去重 → 同名的一条启用一条停用会被判成「已在工作中」而丢掉，
 *     调用方为了避免重复只好把输入清空，整块诊断 UI 因此恒为空；
 *   · 行的 key 少了 cwd → 两个工作区的同名技能撞同一个 React key，看起来是一行；
 *   · 安装目标只用 source → 两个工作区合成一项，装进第一个。
 * scope 不再进身份：它是 source 的函数（project-* / custom / user-* / bundled），
 * 写进来等于给同一件事留第二处判据。
 */
const skillScopeIdentity = (row) => `${row?.source || 'unknown'}\u0000${row?.cwd || ''}`;
const skillIdentity = (row) => `${skillScopeIdentity(row)}\u0000${row?.name || ''}`;

/**
 * 把技能行加工成面板要的形状：加一个**稳定的 key**。
 *
 * key 必须是「来源 + 项目 + 名称」而不是名称：同名跨作用域是合法配置（DSH 按 rank 裁决谁生效），
 * 按名字当 key 会让 React 把两份不同的技能认成同一行，用户就只能看到一个副本——
 * 而启停/删除是精确作用到某一个根上的（SPEC 决策 D8）。
 */
function skillRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    ...row,
    key: skillIdentity(row),
  }));
}

/**
 * 组的排序档位：全局在前、项目居中、自定义次之、内置垫底。
 *
 * 原先候选项按 `source.localeCompare` 排，于是 `bundled`（'b' < 'u'）**排在用户自己的
 * 全局技能之前**——最不该日常操作的那一组反倒置顶。
 */
function skillGroupRank(row) {
  const source = String(row?.source || '');
  if (source === 'bundled') return 'bundled';
  if (source.startsWith('project-')) return 'project';
  if (source === 'custom') return 'custom';
  return 'user';
}

const GROUP_RANK_ORDER = { user: 0, project: 1, custom: 2, bundled: 3 };

/**
 * 一行的组身份：`档位 \0 source \0 cwd`。
 *
 * 抽出来是因为**两个地方必须算出同一个 key**：列表分组（skillGroups）和第二行那条作用域
 * 药丸（skillScopeTabs 的选择值）。各写一份的话，药丸点了之后筛不出任何行——而界面上
 * 看不出哪里错了（药丸高亮正常、列表空着）。
 *
 * 身份含 cwd 的理由见 skillGroups：两个项目都有 project-agents 时，只按 source 会混组。
 */
function skillGroupKey(row) {
  return `${skillGroupRank(row)}\u0000${skillScopeIdentity(row)}`;
}

/**
 * 按作用域给技能行分组——**作用域在技能面是列表的结构，不是一个筛选值**。
 *
 * 为什么必须分组而不是塞进下拉：一条作用域标签是「哪一级 source × 哪个项目」两维，
 * 压成一句 `项目 easyStory · .agents/skills` 后长度不可控，而侧栏筛选器只有 ~139px
 * （原生 select 的面板宽度等于自身宽度、option 不换行），于是必然被裁——
 * 用户看到的「显示也不全」是维度用错了控件，不是字号问题。
 * 组头占满整行宽度，路径放得下，且作用域从「要选的」变成「看到的」。
 *
 * ⚠️ 组的身份是 (source + cwd)，**不是 source**：两个项目都有 `project-agents` 时，
 * 只按 source 分组会把两个项目的技能混进同一组——那正是「没说哪个项目」本身。
 */
function skillGroups(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const rank = skillGroupRank(row);
    const key = skillGroupKey(row);
    let group = groups.get(key);
    if (group === undefined) {
      group = { key, rank, source: row.source, cwd: row.cwd, root: row.root, label: skillScopeLabel(row), rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()].sort((left, right) => {
    const rank = GROUP_RANK_ORDER[left.rank] - GROUP_RANK_ORDER[right.rank];
    if (rank !== 0) return rank;
    // 同档位内按项目名排，让多项目的顺序稳定且可读（而不是按宿主返回顺序）。
    return left.label.localeCompare(right.label);
  });
}

/**
 * 第二行那条作用域药丸的候选：**全部** + 每个实际存在的组。
 *
 * 为什么以组（source + cwd）为单位、而不是以 source：组才是列表的结构，也是用户能
 * 点击的最小作用域单位。以 source 为单位的话，两个项目会合成一个药丸，点下去筛出
 * 两个项目的技能——而用户以为选的是某一个项目。
 *
 * 计数取组内行数，所以药丸上的数字与它筛出来的行数**一定相等**（都由 skillGroups 派生）。
 */
function skillScopeTabs(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return [
    { key: 'all', label: t('全部'), count: list.length, title: t('全部作用域（{count}）', { count: list.length }) },
    ...skillGroups(list).map((group) => ({
      key: group.key,
      label: group.label,
      count: group.rows.length,
      title: group.root ? group.label + ' — ' + group.root : group.label,
    })),
  ];
}

/**
 * 同名跨作用域的行 → 「还有几份、都在哪」。
 *
 * 分组之后这件事第一次**看得见**：同一个名字出现在两个组里就是遮蔽的现场。
 * 原先只有一个「被遮蔽」badge，用户知道有问题但找不到另一份在哪。
 */
function skillTwinCounts(rows) {
  const byName = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const list = byName.get(row.name) || [];
    list.push(row);
    byName.set(row.name, list);
  }
  const counts = new Map();
  for (const list of byName.values()) {
    if (list.length < 2) continue;
    for (const row of list) {
      counts.set(row.key, {
        total: list.length,
        // 其他份在哪：最多列两个，多了放不下。
        others: list.filter((other) => other.key !== row.key).slice(0, 2).map((other) => skillScopeLabel(other)),
      });
    }
  }
  return counts;
}

/**
 * 详情要渲染的那一行：**按身份从当前 rows 派生**。
 *
 * 为什么不是把选中的行对象存进 state：那样存的是"上一次取数时的那个对象"。面板里刚启停一个
 * 技能时列表会重新取数，而详情仍渲染旧对象——真机实测：磁盘上的状态已经改了，详情却仍写旧值，
 * 点「刷新」也不变，只有重新选中那一行才对。派生之后这个状态无法存在。
 * 选中项从列表里消失（被删掉/换了作用域）时返回 null，详情自然回到空态。
 */
const selectedSkillRow = (rows, key) => (Array.isArray(rows) ? rows.find((row) => row?.key === key) ?? null : null)

/**
 * 指出哪些条目**被同名条目遮蔽**（相对模型可见目录的差异）。
 *
 * DSH 按 rank 裁决同名技能谁生效，被遮蔽的那份模型收不到——但用户确实装了它。
 * 不提示的话，用户会以为自己操作的是生效的那份（本仓库的独有价值之一）。
 *
 * ⚠️ 判据必须是 **rank**，不是数组位置。曾经取「排在最前的那个」当生效者，而那个前提是错的：
 * 宿主 `list` 的输出按**名字**排序（dsh-skill 的 compareSkillSummary），面板自己又按
 * 「全局在前、项目在后」拼接——而项目级 rank(100/200) 恰好**小于**用户级(400/500)，
 * 于是"最前的"正好是 rank 最大、也就是真正**落选**的那份，方向完全相反（真机报告 + 已复现）。
 * 结果是面板指着生效的那份说「你被遮蔽了」，用户照它去操作，改的其实是模型收不到的那份。
 *
 * 同名里 rank 最小者胜；rank 相同（同一档的不同项目）时按输入顺序取先者——那种情况下
 * 谁生效由宿主的 providerOrder 决定，面板拿不到，但两个不同项目里的同名技能互不影响，
 * 标一份为胜者只是为了让提示有个主语，不会误导操作。
 *
 * 已停用的行不参与：两个调用面都关掉的技能，模型和用户都拿不到它，
 * 说它"遮蔽/被遮蔽"都是假的。它只该出现在诊断里（见 skillDiagnostics）。
 * ⚠️ 判据是 `enabled === false`——**不知道**（null）的行要参与：
 * 它可能照样进了模型目录，把它排除掉才是漏报。
 *
 * @param {object[]} rows
 * @returns {object[]} 被遮蔽的行（附生效者信息）。
 */
function shadowedSkills(rows) {
  const groups = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row?.enabled === false) continue;
    const list = groups.get(row.name) || [];
    list.push(row);
    groups.set(row.name, list);
  }
  const shadowed = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    // 生效者 = rank 最小者（同 rank 取先出现的）。不能改用位置，理由见上。
    const winner = list.reduce((best, row) => (sourceRank(row.source) < sourceRank(best.source) ? row : best), list[0]);
    for (const row of list) {
      if (row === winner) continue;
      shadowed.push({ ...row, shadowedBy: winner });
    }
  }
  return shadowed;
}

/**
 * 汇总「用户需要知道但模型看不到」的条目。
 *
 * ⚠️ 输入只有**行**，判据与行身份同源：`enabled === false` 就是「两个调用面都关掉了」。
 * 停用现在是 frontmatter 的两个字段，宿主照样把它报在目录里，所以这里不需要第二个数组，
 * 也就不可能「同一条出现两次」或「整块 UI 恒为空」。
 *
 * 非法 frontmatter（宿主只 warn + skip）目前**没有**生产者，见 TODO row 21——
 * 在它落地之前，这里不假装能报。
 */
function skillDiagnostics(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.enabled === false)
    .map((row) => ({ ...row, kind: 'disabled', level: 'warn' }));
}

/**
 * detail 等动作请求的参数：**送整条引用**（source + root + 项目路径 + 磁盘条目 + 形态）。
 *
 * 为什么不能只送 name（或 name + cwd）：宿主侧 `ctx.skills.get(name)` 按 rank 返回
 * **生效者**，而面板的模型是 (根, 条目) 精确操作（D8）——只送名字时，点「被遮蔽」
 * 那一行看到的是生效者的正文，用户以为自己在读被遮蔽的那份。
 *
 * ⚠️ 送的是 **entry（磁盘条目名）而不是 name（技能名）**：宿主允许两者不一致
 * （`dir-name/SKILL.md` 里写 `name: dir-alias` 照收），而定位必须按磁盘上的真实位置。
 * name 只是显示用的身份，服务端从文件里自己读得出来。
 *
 * 单独成一个函数：这条不变量得有个能被直接断言的家里，而不是埋在组件闭包里。
 */
function skillDetailRequest(row) {
  return {
    name: row?.name,
    source: row?.source,
    root: row?.root,
    projectPath: row?.cwd,
    entry: row?.entry,
    kind: row?.kind,
  };
}

const MAX_TIMER_DELAY_MS = 2147483647;
const REDACTED_VALUE = '__DSH_MCP_REDACTED__';
/**
 * 表单里表示「这个字段没改，沿用原值」的**哨兵字符串**。
 *
 * ⚠️ 它**必须是中文原文、且与语言无关**，不能写成 t(...)：
 *   · 它是**数据**不是文案——`row.v === PRESERVED_VALUE_LABEL` 这类 `===` 判据有五处，
 *     `fromFormValue` 还靠它把值还原成 REDACTED_VALUE 再送回宿主；
 *   · 模块级 t() 又会在 apply() 拿到 locale 之前求值，把哨兵锁死成加载时的语言；
 *   · 一旦哨兵随语言变化，用户在英文界面下编辑一次表单，`===` 就不再成立——
 *     原本「保留原值」的字段会被当成用户**手输的字面量**写进配置，
 *     等于把凭据位置的占位符固化成真实配置（静默的数据损坏）。
 * 所以哨兵恒为中文，**显示**时才按语言换（见 PRESERVED_VIEW 与 toFormValue 的渲染侧）。
 */
const PRESERVED_VALUE_LABEL = '••••••（保留原值）';
/** 哨兵在输入框里的**显示**形态：按当前语言给，但绝不参与比较。 */
const preservedView = () => t(PRESERVED_VALUE_LABEL);
/**
 * 这个值是不是「保留原值」哨兵？**两种形态都算**：原文（来自宿主/初始 state）与
 * 当前语言的显示形态（用户在英文界面里碰过该字段后回写的）。
 * 判据统一走这里，别在别处直接 `=== PRESERVED_VALUE_LABEL`——那样英文界面下会漏判。
 */
const isPreservedValue = (value) => value === PRESERVED_VALUE_LABEL || value === preservedView();
const MASKED_VALUE = '••••••';
const toFormValue = (value) => value === REDACTED_VALUE ? PRESERVED_VALUE_LABEL : String(value || '');
/**
 * 表单值 → 送往宿主的取值：哨兵还原成 REDACTED_VALUE（表示「沿用原值」）。
 *
 * ⚠️ 必须同时认**哨兵原文**和它的**当前语言显示形态**：输入框显示的是 preservedView()，
 * 而用户一旦改动该字段，onChange 把「显示出来的那串」写回 state——英文界面下回写的
 * 就是英文标签。只认中文原文的话，那种回写会被当成用户手输的字面量写进配置。
 * 这里两种都还原成 REDACTED_VALUE（用户没改内容、只是碰了一下字段时，语义仍是"保留原值"）。
 */
const fromFormValue = (value) => (isPreservedValue(value) ? REDACTED_VALUE : value);
const displayValue = (value) => value === REDACTED_VALUE ? MASKED_VALUE : value;
function setOwn(target, key, value) {
  Object.defineProperty(target, key, { value, enumerable: true, configurable: true, writable: true });
}

const Toggle = ({ on, disabled, onChange, title, label }) =>
  h('button', {
    type: 'button',
    role: 'switch',
    className: 'dsh-mcp-toggle',
    disabled,
    title,
    // 状态只走 aria-checked，不另设 class —— 与官方 ui-primitives/Switch 同一形状
    // （Switch.module.css 开头的注释：外观键于 aria-checked 而非并行 class，视觉状态
    // 就不会与辅助技术读到的状态不一致）。CSS 侧读 [aria-checked='true']。
    'aria-checked': on,
    'aria-label': label,
    onClick: (e) => { e.stopPropagation(); if (onChange) onChange(!on); },
  });

const Dot = ({ phase }) => {
  const cls = phase === 'connected' ? 'connected' : phase === 'failed' ? 'failed' : phase === 'loading' || phase === 'waiting' ? 'loading' : '';
  return h('span', { className: 'dsh-mcp-dot ' + cls });
};

const Badge = ({ cls, title, children }) => h('span', { className: 'dsh-mcp-badge ' + (cls || ''), title }, children);

/**
 * 折叠指示器。全面板只有这一种：向下的 chevron，收起时转 -90°（指向右）。
 *
 * 曾经是三套写法——列表里的向下/向右三角**字符**、组头的常驻三角加 CSS 旋转、
 * 诊断组头的感叹号。同一个「能不能展开」在三处长得不一样，用户读不出哪一处可点。
 * 现在统一成一个图标 + 一个 `open` 布尔，旋转也只剩 .dsh-mcp-caret.closed 一条规则。
 *
 * 图标而不是字符：三角字符的基线、字号、字体回退各平台都不同（它是 U+25BE，
 * 命中不到任何字体约定），换台机器就换一副样子。
 */
const Caret = ({ open, cls }) => h('span', { className: 'dsh-mcp-caret' + (cls ? ' ' + cls : '') + (open ? '' : ' closed'), 'aria-hidden': true }, h(Icon, { d: ICONS.chev, size: 12 }));

/**
 * 通知条：面板里所有「非阻断、但你需要知道」的一句话都走这一张卡。
 *
 * 为什么统一：原先有四种写法各画一遍——更新条用 .dsh-mcp-upd（自己的边框色与按钮），
 * 让位提示用 .dsh-skills-banner，挂载/作用域失败用 .dsh-mcp-log（红/黄左边框块），
 * 降级提示还不存在。「同一件事长什么样」因此取决于它是谁写的。
 *
 * tone 只有四档，各自对应一个语义令牌：中性（无 tone，读配置失败之类的事实陈述）、
 * warn、err、info。图标按语义给（不是按 tone 给）——「更新」用 info 色调但配 up 图标。
 *
 * role='status'：warn/err 是异步出现的结果，读屏需要被念出来；info 不需要打断。
 */
const Notice = ({ tone, icon, title, children, actions }) => h('div', {
  className: 'dsh-mcp-notice' + (tone ? ' ' + tone : ''),
  role: tone === 'warn' || tone === 'err' ? 'status' : undefined,
},
  h(Icon, { d: ICONS[icon || 'info'], size: 18 }),
  h('div', { className: 'dsh-mcp-notice-body' },
    h('b', null, title),
    children ? h('span', null, children) : null,
  ),
  actions && actions.length ? h('div', { className: 'dsh-mcp-notice-actions' }, ...actions) : null,
);

const Icon = ({ d, size }) =>
  h('svg', { width: size || 13, height: size || 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' }, h('path', { d }));

/**
 * 图标表。**全部路径都画在 `Icon` 的 16×16 viewBox 坐标系里**（Icon 的 viewBox 是
 * '0 0 16 16'，不做缩放），所以坐标一旦超出 0–16 就被 viewBox 裁掉、图标整个不可见。
 *
 * 曾经 edit / eye / eyeOff / copy 四条是照 24 单位的网格写的（edit 的 y 一直到 20），
 * 在 16 的盒子里等于画到框外——「编辑」按钮上那个图标一直是空的，而没有任何测试会红。
 * 统一到 16 网格是这条表的不变量：新增图标请照 16 画。
 */
const ICONS = {
  search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM13.5 13.5L11 11',
  plus: 'M8 3v10M3 8h10',
  refresh: 'M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3',
  trash: 'M3 4h10M6.5 4V2.8a.8.8 0 0 1 .8-.8h1.4a.8.8 0 0 1 .8.8V4M4.5 4l.6 9a1 1 0 0 0 1 .9h3.8a1 1 0 0 0 1-.9l.6-9M6.7 7v4.5M9.3 7v4.5',
  plug: 'M6 2v4M10 2v4M4.5 6h7V8a3.5 3.5 0 0 1-7 0zM8 11.5V14',
  // 面板图标：四格网格，比插头更贴近「管理面板」语义。
  panel: 'M2.5 2.5h4.3v4.3H2.5zM9.2 2.5h4.3v4.3H9.2zM2.5 9.2h4.3v4.3H2.5zM9.2 9.2h4.3v4.3H9.2z',
  x: 'M4 4l8 8M12 4l-8 8',
  edit: 'M11.6 2.4l2 2L6 12l-2.6.6L4 10zM10.2 3.8l2 2',
  eye: 'M1.2 8S3.6 4.2 8 4.2 14.8 8 14.8 8 12.4 11.8 8 11.8 1.2 8 1.2 8zM8 6.2a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6z',
  eyeOff: 'M2 2l12 12M6.2 4.5A6.6 6.6 0 0 1 8 4.2c4.4 0 6.8 3.8 6.8 3.8a9.4 9.4 0 0 1-1.9 2.4M9.8 11.5a6.6 6.6 0 0 1-1.8.3C3.6 11.8 1.2 8 1.2 8a9.6 9.6 0 0 1 1.9-2.4',
  copy: 'M5.5 5.5h6.2v6.2H5.5zM3 10.2V4.3h6',
  entry: 'M2.5 3.5h11v9h-11zM2.5 6.5h11M6.5 6.5v6',
  more: 'M3.2 8h.01M8 8h.01M12.8 8h.01',
  sort: 'M4.5 13V3.2M4.5 13L2.5 11M4.5 13l2-2M11.5 3v9.8M11.5 3l-2 2M11.5 3l2 2',
  check: 'M3 8.4l3.4 3.4L13 4.6',
  warn: 'M8 2.2l6 11.6H2zM8 6.4v3.4M8 11.6h.01',
  info: 'M8 1.6a6.4 6.4 0 1 0 0 12.8A6.4 6.4 0 0 0 8 1.6zM8 7.4v4M8 5.1h.01',
  shield: 'M8 1.8l5.2 2v4.3c0 3.3-2.2 5.4-5.2 6.1-3-.7-5.2-2.8-5.2-6.1V3.8z',
  up: 'M8 13.2V3M4.2 6.8L8 3l3.8 3.8',
  play: 'M5 3.2l7.6 4.8L5 12.8z',
  pause: 'M6 3.2v9.6M10 3.2v9.6',
  chev: 'M4.2 6.2L8 10l3.8-3.8',
  box: 'M8 1.6l5.4 2.9v6.2L8 13.6l-5.4-2.9V4.5zM2.6 4.5L8 7.4l5.4-2.9M8 7.4v6.2',
  // 闪电 = 按需加载（延迟）：工具不常驻，需要时才取。用于「全部延迟」主按钮。
  zap: 'M9 1.6L3.6 9.4h3.5L6.4 14.4l5.6-8H8.4z',
};

// ── 常用 MCP 预设模板（主流管理器常见的“浏览即添加”能力）────────────
// 预设只填充表单，不直接写入；命令依赖本机 npx / uvx，保存前请确认可用。
// ⚠️ 表里存**中文原文**（= EN_DICT 的键），翻译发生在渲染点（t(p.label)）：
// 在这里写 t() 会把语言冻在 bundle 加载那一刻，英文界面下整个下拉仍是中文。
const MCP_PRESETS = [
  { id: 'filesystem', serverName: 'filesystem', label: 'Filesystem · 本地文件读写', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/path/to/allowed/dir'] },
  { id: 'memory', serverName: 'memory', label: 'Memory · 知识图谱记忆', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-memory'] },
  { id: 'sequential-thinking', serverName: 'sequential-thinking', label: 'Sequential Thinking · 分步推理', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
  { id: 'time', serverName: 'time', label: 'Time · 时区时间工具（需 uvx）', transport: 'stdio', command: 'uvx', args: ['mcp-server-time'] },
  { id: 'git', serverName: 'git', label: 'Git · 版本控制（需 uvx）', transport: 'stdio', command: 'uvx', args: ['mcp-server-git'] },
];

// ── 工具参数 JSON Schema 的可读化渲染辅助 ────────────────────────────
function clearRevealState(generation, setValues, setBusy) {
  generation.current += 1;
  setValues({});
  setBusy?.('');
}
function consumeRevision(ref, next) {
  if (typeof next !== 'string') return false;
  const changed = ref.current !== '' && next !== ref.current;
  ref.current = next;
  return changed;
}
async function copyText(text) {
  let area;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof window !== 'undefined' && window.isSecureContext) {
      await navigator.clipboard.writeText(String(text));
      return true;
    }
    area = document.createElement('textarea');
    area.value = String(text);
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    return document.execCommand('copy') === true;
  } catch {
    return false;
  } finally {
    area?.remove();
  }
}
function describeType(node) {
  if (!node || typeof node !== 'object') return 'any';
  if (Array.isArray(node.type)) return node.type.join(' | ');
  if (node.anyOf || node.oneOf) {
    const branches = node.anyOf || node.oneOf || [];
    return branches.map(describeType).filter((value, index, list) => list.indexOf(value) === index).join(' | ');
  }
  if (node.type === 'array') return node.items ? 'array<' + describeType(node.items) + '>' : 'array';
  return typeof node.type === 'string' ? node.type : 'any';
}
function enumText(node) {
  return node && Array.isArray(node.enum) ? node.enum.map((value) => JSON.stringify(value)).join(', ') : '';
}

// 标签页估算宽度：用于溢出折叠（中文按 15px、ASCII 按 8px 粗估，含 padding）。
function estimateTabWidth(label, hasCount) {
  let width = 0;
  for (const ch of label) width += ch.charCodeAt(0) > 255 ? 15 : 8;
  return width + 26 + (hasCount ? 26 : 0);
}
// 与 `.dsh-mcp-tab-pop{min-width:170px}` 同源：锚点夹取要用它算「弹层还能放多左」。
const POPOVER_MIN_WIDTH = 170;

// 作用域标签页：全局固定首位；项目超出宽度时折叠为「…N」弹出层。
const ScopeTabs = ({ tabs, active, onSelect }) => {
  const rootRef = useRef(null);
  const barRef = useRef(null);
  const moreRef = useRef(null);
  const [barWidth, setBarWidth] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  // 弹层要贴着「…N」按钮，而不是贴标签条右边缘：标签条右侧常留有大段空白
  // （估算宽度偏保守，可见标签提前截断），贴右边缘会让弹层离点击处很远。
  const [moreRight, setMoreRight] = useState(0);
  const syncMoreAnchor = useCallback(() => {
    const wrap = rootRef.current;
    const btn = moreRef.current;
    if (!wrap || !btn) return;
    // 对齐到按钮右边缘；但窄屏上按钮可能很靠左，若右对齐会让 170px 的弹层从左边溢出，
    // 因此夹取到「弹层仍能完整落在标签条内」的范围（170 与 CSS 的 min-width 一致）。
    const gap = Math.round(wrap.getBoundingClientRect().right - btn.getBoundingClientRect().right);
    const maxRight = Math.max(0, Math.round(wrap.clientWidth) - POPOVER_MIN_WIDTH);
    setMoreRight(Math.min(Math.max(0, gap), maxRight));
  }, []);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') { setBarWidth(el.clientWidth); return; }
    const update = () => setBarWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { setMoreOpen(false); }, [active]);
  useEffect(() => {
    if (moreOpen) syncMoreAnchor();
  }, [moreOpen, barWidth, tabs, syncMoreAnchor]);
  useEffect(() => {
    if (!moreOpen) return;
    const close = (e) => { if (!rootRef.current || !rootRef.current.contains(e.target)) setMoreOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [moreOpen]);
  const visibleCount = useMemo(() => {
    if (!barWidth || tabs.length === 0) return tabs.length;
    let acc = 0;
    let count = 0;
    for (let i = 0; i < tabs.length; i += 1) {
      const w = estimateTabWidth(tabs[i].label, tabs[i].count !== undefined) + 8;
      if (acc + w > barWidth) break;
      acc += w;
      count += 1;
    }
    if (count >= tabs.length) return tabs.length;
    // 有溢出时至少保留一个 tab，并为「…N」预留宽度。
    const moreWidth = 58;
    while (count > 1 && acc + moreWidth > barWidth) {
      count -= 1;
      acc -= estimateTabWidth(tabs[count].label, tabs[count].count !== undefined) + 8;
    }
    return count;
  }, [tabs, barWidth]);
  const hidden = visibleCount < tabs.length ? tabs.slice(visibleCount) : [];
  const visible = visibleCount < tabs.length ? tabs.slice(0, visibleCount) : tabs;
  // 弹层必须挂在滚动容器之外：.dsh-mcp-tabs 是 overflow-x:auto 的裁剪盒，
  // 放在里面（哪怕 position:absolute）会被整块裁掉，标签一多就再也点不到隐藏项目。
  // `right` 由 moreRight 给到「…N」按钮的右边缘，弹层因此贴住触发它的按钮。
  const popover = moreOpen && hidden.length
    ? h('div', { className: 'dsh-mcp-tab-pop', style: { right: moreRight + 'px' }, onClick: (e) => e.stopPropagation() },
        hidden.map((tab) =>
          h('div', { key: tab.key, role: 'tab', 'aria-selected': active === tab.key, className: 'dsh-mcp-tab' + (active === tab.key ? ' sel' : ''), onClick: () => { setMoreOpen(false); onSelect(tab.key); }, title: tab.title || tab.label },
            tab.label,
            tab.count !== undefined ? h('span', { className: 'dsh-mcp-tab-count' }, tab.count) : null,
          ),
        ),
      )
    : null;
  return h('div', { className: 'dsh-mcp-tabs-wrap', ref: rootRef },
    h('div', { className: 'dsh-mcp-tabs', ref: barRef },
      visible.map((tab) =>
        h('div', { key: tab.key, role: 'tab', 'aria-selected': active === tab.key, className: 'dsh-mcp-tab' + (active === tab.key ? ' sel' : ''), onClick: () => onSelect(tab.key), title: tab.title || tab.label },
          tab.label,
          tab.count !== undefined ? h('span', { className: 'dsh-mcp-tab-count' }, tab.count) : null,
        ),
      ),
      hidden.length ? h('div', { key: '__more__', ref: moreRef, role: 'tab', 'aria-expanded': moreOpen, className: 'dsh-mcp-tab more' + (moreOpen ? ' open' : ''), onClick: (e) => { e.stopPropagation(); syncMoreAnchor(); setMoreOpen((value) => !value); } }, h('b', null, '…'), hidden.length) : null,
    ),
    popover,
  );
};
function flattenParameters(schema) {
  if (!schema || typeof schema !== 'object') return { required: [], properties: [] };
  const required = Array.isArray(schema.required) ? schema.required : [];
  const props = schema.properties;
  if (!props || typeof props !== 'object') return { required, properties: [] };
  const requiredSet = new Set(required);
  const properties = Object.keys(props).map((name) => {
    const node = props[name] && typeof props[name] === 'object' ? props[name] : {};
    return {
      name,
      type: describeType(node),
      description: node.description || '',
      required: requiredSet.has(name),
      hasDefault: Object.prototype.hasOwnProperty.call(node, 'default'),
      default: node.default,
      enumText: enumText(node),
    };
  });
  return { required, properties };
}
const ToolRow = ({ tool }) => {
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState(false);
  const hasSchema = !!tool.parameters && typeof tool.parameters === 'object';
  const { properties } = hasSchema ? flattenParameters(tool.parameters) : { properties: [] };
  const toggle = () => setOpen((value) => !value);
  const headProps = hasSchema ? {
    className: 'dsh-mcp-tool-head interactive',
    role: 'button',
    tabIndex: 0,
    'aria-expanded': open,
    title: open ? t('收起参数') : t('查看参数'),
    onClick: toggle,
    onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } },
  } : { className: 'dsh-mcp-tool-head' };
  return h('div', { className: 'dsh-mcp-tool' },
    h('div', headProps,
      h('span', { className: 'dsh-mcp-tool-name', title: tool.name }, tool.name),
      h('span', { className: 'dsh-mcp-tool-desc', title: tool.description }, tool.description || ''),
      hasSchema ? h(Caret, { open }) : null,
    ),
    open && hasSchema ? h('div', { className: 'dsh-mcp-tool-body' },
      properties.length ? h('div', { className: 'dsh-mcp-params' },
        properties.map((p) => h('div', { key: p.name, className: 'dsh-mcp-param' },
          h('div', { className: 'dsh-mcp-param-head' },
            h('code', { className: 'dsh-mcp-param-name' }, p.name),
            p.required ? h('span', { className: 'dsh-mcp-req' }, t('必填')) : h('span', { className: 'dsh-mcp-opt' }, t('可选')),
            h('span', { className: 'dsh-mcp-param-type' }, p.type),
          ),
          p.description ? h('div', { className: 'dsh-mcp-param-desc' }, p.description) : null,
          p.enumText ? h('div', { className: 'dsh-mcp-param-enum' }, t('可选值：{values}', { values: p.enumText })) : null,
          p.hasDefault ? h('div', { className: 'dsh-mcp-param-enum' }, t('默认值：{value}', { value: JSON.stringify(p.default) })) : null,
        )),
      ) : null,
      h('button', { type: 'button', className: 'dsh-mcp-tool-rawbtn', onClick: () => setRaw((value) => !value) }, raw ? t('收起原始 JSON') : t('查看原始 JSON')),
      raw ? h('pre', { className: 'dsh-mcp-json' }, JSON.stringify(tool.parameters, null, 2)) : null,
    ) : null,
  );
};

const Btn = ({ cls, icon, onClick, disabled, title, children }) =>
  h('button', { type: 'button', className: 'dsh-mcp-btn' + (cls ? ' ' + cls : ''), onClick, disabled, title }, icon ? h(Icon, { d: ICONS[icon] }) : null, children);

/**
 * 下拉菜单：详情操作栏的「⋯ 更多」、以及列表底栏的排序都用它。
 *
 * ⚠️ 必须是**组件**（唯一带 hooks 的那一层）。ServerDetail / SkillDetail 是纯函数——
 * 测试直接以普通函数调用它们，函数体里放 useState 会抛 "Invalid hook call"。所以开合状态
 * 封在这里，详情那两个函数只负责把 items 摆好。
 *
 * 行用原生 <button>，状态走 aria-pressed（与面板里那个眼睛开关、入口菜单同一惯用法）：
 * role=menuitemradio 要配一整套方向键 / Home / Esc / roving tabindex 的键盘行为，
 * 不实现就等于这个菜单对键盘用户不存在，还多了一句假声明。
 */
const DropMenu = ({ label, icon, iconOnly, title, items, disabled, cls }) => {
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!boxRef.current || !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  // 菜单内容变了（换了一台服务器、换了一个作用域）就收起来：留着上一次的条目会点错东西。
  const signature = (items || []).map((item) => item.key).join('|');
  useEffect(() => { setOpen(false); }, [signature]);
  const rows = (items || []).filter(Boolean);
  return h('div', { className: 'dsh-mcp-dd' + (cls ? ' ' + cls : ''), ref: boxRef },
    h(Btn, {
      cls: (iconOnly ? 'icon ' : '') + (open ? 'sel' : ''),
      icon,
      disabled,
      title: title || label,
      onClick: (e) => { e.stopPropagation(); setOpen((value) => !value); },
      children: iconOnly ? null : label,
    }),
    open && rows.length
      ? h('div', { className: 'dsh-mcp-dd-pop', role: 'group', 'aria-label': title || label },
        rows.map((item) => (item.separator
          ? h('div', { key: item.key, className: 'dsh-mcp-dd-sep' })
          : h(Btn, {
            key: item.key,
            icon: item.icon,
            cls: (item.danger ? 'danger' : '') + (item.on ? ' sel' : ''),
            disabled: item.disabled,
            title: item.title,
            onClick: () => { setOpen(false); item.onSelect(); },
            children: item.label,
          }))),
      )
      : null,
  );
};

/**
 * 列表底栏：统计文本 + 排序/刷新图标组。
 *
 * 原型的「批量」缺一个 RPC（多选启停要 Host 支持一次改多条），所以那一版**不做**——
 * 与其画一个点了没反应的按钮，不如让它缺席。这个判断至今成立：**多选仍然没有做**。
 *
 * 这里曾经还有一个 `action` 槽位，docstring 写着它是给「全部延迟」用的。实际它从来只有一个
 * 真渲染处：列表的过滤器行（ServerList 的 toolbarAction，第一屏可见），两个 ListFooter
 * 调用点都不传 action——于是槽位与它的四条 CSS 全是死代码，而 docstring 还在指示下一个
 * 人往底栏加第二个入口（与「唯一入口在过滤器行」自相矛盾）。已删。
 */
const ListFooter = ({ text, sortKey, onSort, onRefresh, refreshing, sortTitle }) => h('div', { className: 'dsh-mcp-side-foot' },
  h('span', { className: 'dsh-mcp-foot-text' }, text),
  h('span', { className: 'dsh-mcp-foot-spacer' }),
  onSort ? h(DropMenu, {
    icon: 'sort',
    iconOnly: true,
    cls: 'dsh-mcp-foot-dd',
    title: (sortTitle || t('排序')) + t('：') + t(SORT_LABELS[sortKey || 'default']),
    items: SORT_KEYS.map((key) => ({
      key,
      label: t(SORT_LABELS[key]),
      on: (sortKey || 'default') === key,
      onSelect: () => onSort(key),
    })),
  }) : null,
  h('button', {
    type: 'button',
    className: 'dsh-mcp-foot-btn',
    'aria-label': t('刷新列表'),
    title: t('刷新'),
    disabled: !!refreshing,
    onClick: onRefresh,
  }, h(Icon, { d: ICONS.refresh })),
);

/**
 * 详情头部的操作栏槽位：**[主行为] + [次要行为] + [⋯ 更多]**。
 *
 * 为什么是槽位而不是「把按钮排一排」：头部是一行，按钮一多它就开始换行、把标题挤扁
 * （MCP 面曾经 6 个按钮，窄屏下两行起步）。定死位置之后，新增的动作有唯一去处——⋯，
 * 于是「加功能」不再等于「头部变高」。
 *
 * 普通函数而不是组件：调用方 ServerDetail / SkillDetail 必须是纯函数（测试直接调用），
 * 里面放不下 hooks。⋯ 的开合状态封在 DropMenu 里。
 */
const actionBar = ({ primary, secondary, more }) => h('div', { className: 'dsh-mcp-d-actions' },
  primary || null,
  secondary || null,
  more && more.length ? h(DropMenu, { icon: 'more', iconOnly: true, cls: 'dsh-mcp-d-more', title: t('更多操作'), items: more }) : null,
);

// 面板里所有 .dsh-mcp-modal 对话框的唯一外壳——**只渲染弹层本体**，遮罩留在调用点（有两个对话框
// 在忙碌时整块不可关闭，那是各调用点自己的可见性语义；遮罩多套一层就会嵌套出两个 overlay）。
// 存在的理由是**一条实测过的故障**：焦点不吸进对话框，按一次 Esc 会冒泡到面板自己的 Esc 处理器，
// 把面板和对话框一起关掉（侧栏入口形态下则是按了没反应）。以前这条规矩靠五个调用点各写一遍五行
// prop 来维持，于是它只可能被下一个忘了写的人破坏——焦点契约因此放在这里：调用点无从遗漏，
// 也没有第二份要同步的实现（`test/package-contract.test.mjs` 数着渲染站点）。
// 面板本体（dsh-mcp-panel）与「更新内容」卡片走的是各自的焦点策略（panelRef / boxRef + 文档级
// keydown），刻意不套这一层：它们的关闭语义与弹窗不同。
// onClose 传 null 表示这一刻不可关闭（例如市场正在安装），Escape 不生效——与旧行为一致。
const Dialog = ({ label, cls, onClose, children }) => {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialogRef.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  const nodes = (Array.isArray(children) ? children.flat(Infinity) : [children]).filter((node) => node != null && node !== false);
  const heading = nodes[0]?.type === 'h3' ? nodes.shift() : h('h3', null, label);
  const actions = nodes.at(-1)?.props?.className === 'dsh-mcp-modal-actions' ? nodes.pop() : null;
  return h('div', {
    ref: dialogRef, className: 'dsh-mcp-modal' + (cls ? ' ' + cls : ''), role: 'dialog', 'aria-modal': true, 'aria-label': label, tabIndex: -1,
    onKeyDown: (e) => {
      if (e.key === 'Escape' && onClose) { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab') return;
      const items = Array.from(dialogRef.current?.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]') || [])
        .filter((node) => node.getClientRects().length > 0);
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    },
  },
    h('div', { className: 'dsh-mcp-modal-head' }, heading,
      h(Btn, { cls: 'icon ghost', title: t('关闭'), onClick: onClose }, h(Icon, { d: ICONS.x }))),
    h('div', { className: 'dsh-mcp-modal-body' }, ...nodes),
    actions,
  );
};

// 服务器列表。embedded=true 时作为项目 tab 的分区内容渲染：去掉自身卡片外框，
// 并在条目较少时隐藏搜索/过滤（否则控件会挤占本就有限的列表高度）。
const CONTROLS_THRESHOLD = 6;
// 项目行的两个事实判定与文案：**放在模块作用域**，因为它是纯函数 —— 抽出来才能被真正测到
// （组件内部的闭包在 node 里跑不起来，只能靠钉源码文本，那种测试证明不了文案对不对）。
//   link  —— 这条连接在不在（"没人用"不等于"没连上"：连接按空闲策略保留）；
//   scope —— 投射范围（几个会话正在用它）。
// 旧文案把两者压成一句「待会话挂载」，读起来像"还没连上/排队中"，而事实是"连接在、只是当前没会话用"。
const mountFailed = (s) => s.mountFailed === true;
// 作用域故障是第三类失败：连接可能完全正常，但工具不在共享作用域层（两个 dsh-scope 模块实例）。
// Host 已在行上标好 scopeFailed 与具体原因，这里只负责不要把它显示成「连接失败」。
const scopeFailed = (s) => s.scopeFailed === true;
const wsSub = (s) => {
  if (mountFailed(s)) return t('挂载失败');
  if (scopeFailed(s)) return t('作用域隔离失败');
  if (s.status === 'disabled') return t('已禁用');
  if (s.status === 'unknown') return t('状态未知');
  if (s.status === 'loading') return t('连接中…');
  if (s.status === 'failed') return t('连接失败');
  if (s.status !== 'connected') return t('尚未建立连接（新会话自动挂载）');
  const refs = typeof s.refs === 'number' ? s.refs : 0;
  // 工具数后缀是**整句的一部分**，拼进同一条键里：中文说「…会话在用 · 3 工具」，
  // 英文说「…session(s) · 3 tool(s)」——把碎片分两处拼会把语序写死在代码里。
  const tools = typeof s.toolCount === 'number' ? t(' · {count} 工具', { count: s.toolCount }) : '';
  return refs > 0
    ? t('已连接 · {refs} 个会话在用{tools}', { refs, tools })
    : t('已连接 · 当前无会话使用（连接保留，下次直接用）{tools}', { tools });
};

// 跨工作区复制的目标候选 = 除当前工作区之外的所有已注册工作区。抽成纯函数是为了能脱离 React
// 断言（面板组件在 node 里渲染不起来：测试替身的 hooks 是空实现，见 client-entry.test.mjs），
// 也为了让「不会把自己列为目标」这条不变量只写一遍。
const copyTargets = (workspaces, from) => (workspaces || []).filter((ws) => ws && ws.path && ws.path !== from);
// 两条失败横幅（挂载失败、工具无法隔离）共用的那句话：把**第一条原因**摆到横幅上。只列
// serverName 等于把真因留在每行详情里等用户自己找，而用户拿着横幅去提问时最需要的恰恰是它；
// 同一条事实（Host 记的 error 文本）只在这里成形，两处横幅都读它。
const firstFailureReason = (entry) => String(entry?.error ?? '').trim() || t('（宿主没有给出原因）');
// 预览文案：把「这次会新增 / 覆盖 / 跳过什么」逐条说清。抽成纯函数是为了能在 node 里直接断言
// ——组件在测试环境只跑首帧，异步预览那段逻辑靠它才测得到。
const copyPlanText = (plan) => {
  const lines = [t('目标工作区当前有 {count} 个 MCP', { count: plan.targetCount })];
  if (plan.added.length) lines.push(t('新增：{names}', { names: plan.added.join(t('、')) }));
  if (plan.updated.length) lines.push(t('覆盖同名：{names}', { names: plan.updated.join(t('、')) }));
  if (plan.skipped.length) lines.push(t('跳过同名（保留目标原配置）：{names}', { names: plan.skipped.join(t('、')) }));
  if (!plan.added.length && !plan.updated.length && !plan.skipped.length) lines.push(t('没有要写入的条目'));
  return lines.join('\n');
};
// 预览只对"算出它的那份输入"负责。把输入压成一个可比较的键，界面据此判断手上这份计划还是不是
// 当前选择的结论——抽成纯函数是为了能在 node 里断言（同 copyTargets/copyPlanText）。没有目标时
// 返回空串：那种状态下不存在"当前计划"。
const copyPlanKey = ({ from, to, names, overwrite } = {}) => (to
  ? JSON.stringify({ from: from || '', to, names: names || [], overwrite: overwrite === true })
  : '');
// 确认按钮的准入条件：当前选择必须已有一份**成功**的计划。少了这条，用户就能在"新预览还在路上"
// 的窗口里按旧结论落一份新结果——"预览说跳过、实际却覆盖"正是这么发生的（Host 侧那份同源不变量
// 拦不住客户端的这个时间差）。这条不变量只用这一个表达式表达，别在别处再判一次。
const copyPlanReady = (key, preview) => Boolean(key) && preview?.key === key && Boolean(preview?.plan);
// 兜底文件名与 .dsh/mcp.json 同名，用户拿到就能直接放进目标工作区。
const exportFileName = (name) => String(name || 'workspace').replace(/[\\/:*?"<>|\s]+/g, '-') + '-mcp.json';

// ── 列表底栏：统计与排序（纯函数）──────────────────────────────────────
//
// 为什么不写在组件里：这些推导（「几个启用」「几个失败」「排序后第一条是谁」）正是最容易
// 算错的部分，而组件内部的闭包在 node 里跑不起来，只能靠钉源码文本——那种测试证明不了
// 数字对不对。抽到模块作用域后可以直接以普通函数调用。
//
// 数字只统计**当前已取到的那一批行**（当前作用域），不跨作用域求和：外壳拿不到跨作用域的
// 全量（见 ABILITY_TABS 那边的注释），编一个总数比不显示更糟。

function countRows(rows, predicate) {
  let n = 0;
  for (const row of Array.isArray(rows) ? rows : []) if (predicate(row)) n += 1;
  return n;
}

/**
 * 一行的状态档位，只用于排序：有问题的排前面。
 *
 * 0 失败 / 1 连接中 / 2 正常 / 3 停用。与 Dot 的 phase 取值域一致（deriveMcpPhase），
 * 但**不是同一件事**：Dot 要的是一个颜色，排序要的是一个全序，所以这里把 unknowns 归到 3。
 */
function mcpStatusRank(row) {
  const s = row || {};
  if (s.mountFailed === true || s.scopeFailed === true) return 0;
  if (s.enabled === false) return 3;
  const status = s.status || s.phase || 'stopped';
  if (status === 'failed') return 0;
  if (status === 'loading' || status === 'waiting') return 1;
  if (status === 'connected') return 2;
  return 3;
}

const mcpStatsText = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const on = countRows(list, (s) => s && s.enabled !== false);
  const bad = countRows(list, (s) => mcpStatusRank(s) === 0);
  return t('{total} 个服务 · {on} 启用{suffix}', { total: list.length, on, suffix: bad ? t(' · {count} 失败', { count: bad }) : '' });
};

const skillStatsText = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const off = countRows(list, (r) => r && r.enabled === false);
  return t('{total} 个技能 · {on} 已启用{suffix}', { total: list.length, on: list.length - off, suffix: off ? t(' · {count} 已停用', { count: off }) : '' });
};

/**
 * 一键「全部延迟」的状态判定。
 *
 * `includeWorkspace` 决定**这次一键的范围**：全局作用域只数当前 profile 能改的全局行
 * （项目行的 defer 写在 <项目>/.dsh/mcp.json，不该被扫进来）；项目作用域打开它，
 * 于是一次翻转的就是这个项目自己的所有 MCP。两个作用域各一次写入、各写各的文件。
 */
const deferAllState = (rows, { includeWorkspace = false } = {}) => {
  const list = (Array.isArray(rows) ? rows : []).filter((s) => s && s.managed === true && (includeWorkspace || s.scope !== 'workspace'));
  // 与行内芯片读**同一个字段**：芯片显示的是"统一策略下的实际状态"（`deferEffective`），
  // 概览若还数旧的 `defer`，就会出现"概览说 0 台延迟、每行芯片都写着延迟"。
  const deferred = countRows(list, (s) => (s.deferEffective ?? s.defer) === true);
  return { total: list.length, deferred, all: list.length > 0 && deferred === list.length };
};

/**
 * 排序键。两个能力面共用同一套键名与同一份文案，切换能力层时排序按钮不用重新学。
 *
 * ⚠️ **没有「按作用域」**：两个面的列表本身已经按作用域切开了——MCP 面是作用域药丸
 * （每个列表里只可能有一种 scope），技能面是分组（组顺序由 skillGroups 的档位固定，
 * 与输入顺序无关）。所以按作用域排序**永远不可能改变任何可见的东西**。
 * 一个点了永远没反应的菜单项比没有这一项更糟：用户会以为排序坏了。
 */
const SORT_KEYS = ['default', 'name', 'status'];
// 同 SCOPE_LABELS：存中文原文，渲染时翻（模块级 t() 会把语言锁死在加载那一刻）。
const SORT_LABELS = { default: '默认顺序', name: '按名称', status: '按状态' };

/**
 * 稳定排序：同键的行保持**宿主返回的原始顺序**。
 *
 * 直接 `Array.prototype.sort` 在 V8 上现在也是稳定的，但这里显式带上下标，是因为比较
 * 函数里会出现大量 0（同一状态、同一作用域），依赖引擎实现等于把「列表顺序会不会突然
 * 变」交给运行时版本决定——而顺序突变在面板里看起来像「数据被改了」。
 */
function stableSort(rows, compare) {
  return (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row, index }))
    .sort((a, b) => compare(a.row, b.row) || a.index - b.index)
    .map((item) => item.row);
}

const byName = (pick) => (a, b) => String(pick(a) || '').localeCompare(String(pick(b) || ''), 'zh-Hans-CN');

/** MCP 列表排序。键只有默认/名称/状态——作用域维度的理由见 SORT_KEYS 的注释。 */
function sortServers(rows, key) {
  if (key === 'name') return stableSort(rows, byName((s) => s.serverName));
  if (key === 'status') return stableSort(rows, (a, b) => mcpStatusRank(a) - mcpStatusRank(b));
  return Array.isArray(rows) ? rows : [];
}

/** 技能列表排序。已停用排在**前面**：那是需要你处理的那一批。 */
function sortSkills(rows, key) {
  if (key === 'name') return stableSort(rows, byName((r) => r.name));
  if (key === 'status') return stableSort(rows, (a, b) => Number(a.enabled === false ? 0 : 1) - Number(b.enabled === false ? 0 : 1));
  return Array.isArray(rows) ? rows : [];
}

const ServerList = ({ servers, total, selected, query, onQuery, onSelect, onToggle, onToggleDefer, busy, transportFilter, statusFilter, onTransportFilter, onStatusFilter, embedded, workspace, emptyHint, footer, toolbarAction }) => {
  const count = total === undefined ? servers.length : total;
  // 门分两道。控件本身（搜索 + 两个过滤 select）在条目少时藏起来，把高度让给列表——
  // 但**一键动作不跟着藏**：项目作用域是 embedded，而它恰恰是延迟开关的第二个写入口
  // （.dsh/mcp.json）。曾经整行共用一个门，项目 MCP ≤6 时「全部延迟」直接不渲染，
  // "唯一入口"在项目小列表下不存在。
  const showControls = !embedded || count > CONTROLS_THRESHOLD;
  const showToolbar = showControls || Boolean(toolbarAction);
  // mountFailed / scopeFailed / wsSub 现在在模块作用域（纯函数，可被测试直接调用）。
  // 项目 MCP 的 status 与全局同一个取值域（deriveMcpPhase）：connected / failed / loading /
  // stopped / disabled / unknown。状态点因此直接复用，不再需要为项目行特例。
  const dotPhase = (s) => (mountFailed(s) || scopeFailed(s) ? 'failed' : s.status || s.phase);
  const toggleLocked = (s) => busy || !s.managed || (s.scope !== 'workspace' && !s.enabled && s.phase !== 'stopped');
  return h('div', { className: 'dsh-mcp-side' + (embedded ? ' embedded' : '') },
    showControls ? h('div', { className: 'dsh-mcp-search' }, h(Icon, { d: ICONS.search }), h('input', { placeholder: t('搜索 MCP…'), value: query, onChange: (e) => onQuery(e.target.value) })) : null,
    showToolbar ? h('div', { className: 'dsh-mcp-filters' + (showControls ? '' : ' bare') },
      showControls ? h('select', { value: transportFilter, onChange: (e) => onTransportFilter(e.target.value), 'aria-label': t('按传输过滤') },
        h('option', { value: 'all' }, t('全部传输')),
        h('option', { value: 'http' }, 'HTTP'),
        h('option', { value: 'stdio' }, 'stdio'),
      ) : null,
      showControls ? h('select', { value: statusFilter, onChange: (e) => onStatusFilter(e.target.value), 'aria-label': t('按状态过滤') },
        h('option', { value: 'all' }, t('全部状态')),
        workspace ? null : h('option', { value: 'connected' }, t('已连接')),
        workspace ? null : h('option', { value: 'failed' }, t('失败')),
        h('option', { value: 'disabled' }, t('已禁用')),
      ) : null,
      // 全局动作（「全部延迟」）放在过滤器行右侧：这一行原本只有两个 select、右边大片空白，
      // 而它**必须**在列表第一屏可见——曾经它在列表底栏（footer），服务器一多就滚出视野，
      // 用户原话是「我都没注意到，差点以为没有这个功能」。
      // 主按钮 + 闪电图标，与底栏那个纯文字按钮的视觉重量差一个量级。
      toolbarAction ? h('button', {
        type: 'button',
        className: 'dsh-mcp-defer-all',
        disabled: toolbarAction.disabled === true,
        title: toolbarAction.title,
        onClick: toolbarAction.onClick,
      }, h(Icon, { d: ICONS.zap }), toolbarAction.label) : null,
    ) : null,
    h('div', { className: 'dsh-mcp-list' },
      servers.length === 0
        ? h('div', { className: 'dsh-mcp-empty-list' }, count === 0 && emptyHint ? emptyHint : t('没有匹配的 MCP'))
        : servers.map((s) =>
            h('div', { key: s.serverName, role: 'button', tabIndex: 0, 'aria-selected': selected === s.serverName, className: 'dsh-mcp-item' + (selected === s.serverName ? ' sel' : ''), onClick: () => onSelect(s.serverName), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.serverName); } } },
              h('div', { className: 'dsh-mcp-item-main' },
                h('div', { className: 'dsh-mcp-item-name-row' },
                  h(Dot, { phase: dotPhase(s) }),
                  h('div', { className: 'dsh-mcp-item-name' }, s.serverName),
                ),
                h('div', { className: 'dsh-mcp-item-sub' },
                  h(Badge, { cls: s.transport === 'http' ? 't-http' : 't-stdio' }, s.transport === 'http' ? 'HTTP' : 'stdio'),
                  h('span', { className: 'dsh-mcp-item-meta' }, s.scope === 'workspace' ? wsSub(s) : t('{count} 工具', { count: s.toolCount })),
                  // 延迟开关：**两种状态都渲染**，点一下就地切换（不必进「编辑」框）。
                  // 不带 token 数：我们不知道用户装了什么 MCP，schema 大小差一个量级，任何
                  // 估算都给不出可用的数，而给了数用户就拿它做决定（主动误导）。
                  h(DeferChip, { on: (s.deferEffective ?? s.defer) === true, interactive: s.managed === true && !busy, onClick: () => onToggleDefer(s) }),
                  mountFailed(s) ? h(Badge, { cls: 's-err' }, t('挂载失败')) : null,
                  scopeFailed(s) ? h(Badge, { cls: 's-err' }, t('作用域故障')) : null,
                ),
              ),
              h(Toggle, { on: s.enabled, disabled: toggleLocked(s), label: s.serverName + (s.enabled ? t('：已启用') : t('：已禁用')), title: s.managed ? (s.enabled ? t('禁用') : t('启用')) : t('来自其他配置层，只读'), onChange: () => onToggle(s) }),
            ),
          ),
    ),
    // 底栏（统计 + 排序/刷新）由调用方给：同一张卡片在全局与项目两种布局下都要有底栏，
    // 但文案与可用动作不同（项目作用域没有连接态）。放在 .dsh-mcp-list 之后、卡片之内。
    footer || null,
  );
};

// 可见性按钮：与「启用」滑块刻意用不同控件——滑块表示启用状态，眼睛表示在本项目是否可见。
const EyeToggle = ({ hidden, disabled, onChange, label }) =>
  h('button', {
    type: 'button',
    className: 'dsh-mcp-eye' + (hidden ? ' off' : ''),
    disabled,
    'aria-pressed': !hidden,
    'aria-label': (hidden ? t('已屏蔽：') : t('可见：')) + label,
    title: hidden ? t('已在此项目屏蔽，点击恢复可见') : t('在此项目可见，点击屏蔽'),
    onClick: (e) => { e.stopPropagation(); onChange(!hidden); },
  }, h(Icon, { d: ICONS[hidden ? 'eyeOff' : 'eye'], size: 15 }));

// 延迟开关芯片：**状态即按钮**（两种状态都渲染、都可点）。
//
// 为什么改成这样：以前这里只是"开着的时候才出现的徽标"，想给某一台开延迟必须进「编辑」
// 弹框勾一下——而列表上看不出那个动作在哪（用户实测反馈："按钮确实藏得有点深"）。
//
// 为什么是**芯片**不是开关：右侧那颗 Toggle 是「启用/禁用」（关掉 = 该服务器不加载、工具
// 全没）。延迟只是"工具放不放常驻上下文"，两者外观一致会让人以为关掉延迟等于关掉服务器。
// 与眼睛（可见性）同一条教训：后果不同的控件必须长得不一样。
//
// 非本插件管理的条目（项目视图里出现的全局条目、外部 bundle 的条目）只展示不可点：
// 它们要改得去它自己的作用域，在这里改会变成"点了另一个文件"。
const DeferChip = ({ on, interactive, onClick }) => {
  const label = on ? t('延迟') : t('全量');
  const title = on
    ? t('该服务器的工具不常驻上下文：模型经 tool_search 按需搜索加载，命中后才进入工具列表。点击切回全量常驻。')
    : t('该服务器的工具每轮都常驻上下文。点击切到延迟加载：模型经 tool_search 按需搜索，命中后才进入工具列表。');
  // 闪电图标 = 延迟加载（与「全部延迟」主按钮同一个图标），两种状态都带：它标明"这是延迟开关"，
  // 而不是"现在延迟着"。状态由 `.sel`（accent 底 + accent 边框）+ 文案 + aria-pressed 表达。
  const icon = h(Icon, { d: ICONS.zap, size: 11 });
  if (!interactive) {
    return h('span', {
      className: 'dsh-mcp-chip sm ro' + (on ? ' sel' : ''),
      title: t('该服务器不属于本插件的配置，延迟开关要回到它自己的作用域里改'),
    }, icon, label);
  }
  return h('button', {
    type: 'button',
    className: 'dsh-mcp-chip sm' + (on ? ' sel' : ''),
    'aria-pressed': on,
    'aria-label': title,
    title,
    // 阻止冒泡：否则点芯片会顺带选中这一行（行本身是 role=button）。
    onClick: (e) => { e.stopPropagation(); onClick(); },
    onKeyDown: (e) => { e.stopPropagation(); },
  }, icon, label);
};

// 项目 tab 中的「全局 MCP（可屏蔽）」列表：配置只读，可点选查看详情，可切换本项目可见性。
// 搜索框置于滚动列表之外，避免随列表滚走。
const GlobalServerList = ({ servers, exclude, onToggleExclude, onSelect, selected, busy }) => {
  const [q, setQ] = useState('');
  const hidden = new Set(exclude || []);
  const query = (q || '').toLowerCase();
  const list = query ? servers.filter((s) => s.serverName.toLowerCase().includes(query)) : servers;
  return h(React2.Fragment, null,
    servers.length > CONTROLS_THRESHOLD ? h('div', { className: 'dsh-mcp-global-search' }, h(Icon, { d: ICONS.search }), h('input', { placeholder: t('搜索全局 MCP…'), value: q, onChange: (e) => setQ(e.target.value) })) : null,
    h('div', { className: 'dsh-mcp-global-list' },
      servers.length === 0
        ? h('div', { className: 'dsh-mcp-empty-list' }, t('没有全局 MCP'))
        : list.length === 0
          ? h('div', { className: 'dsh-mcp-empty-list' }, t('没有匹配的全局 MCP'))
          : list.map((s) => {
              const isHidden = hidden.has(s.serverName);
              return h('div', {
                key: s.serverName,
                role: 'button',
                tabIndex: 0,
                'aria-selected': selected === s.serverName,
                className: 'dsh-mcp-item' + (selected === s.serverName ? ' sel' : '') + (isHidden ? ' muted' : ''),
                onClick: () => onSelect(s.serverName),
                onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(s.serverName); } },
              },
                h('div', { className: 'dsh-mcp-item-main' },
                  h('div', { className: 'dsh-mcp-item-name-row' },
                    h(Dot, { phase: s.status || s.phase }),
                    h('div', { className: 'dsh-mcp-item-name' }, s.serverName),
                  ),
                  h('div', { className: 'dsh-mcp-item-sub' },
                    h(Badge, { cls: s.transport === 'http' ? 't-http' : 't-stdio' }, s.transport === 'http' ? 'HTTP' : 'stdio'),
                    h('span', { className: 'dsh-mcp-item-meta' }, t('{count} 工具', { count: s.toolCount })),
                    isHidden ? h(Badge, { cls: 's-off' }, t('已屏蔽')) : null,
                  ),
                ),
                // 眼睛 = 可见性，与项目 MCP 的启用滑块在语义与外观上都区分开。
                h(EyeToggle, { hidden: isHidden, disabled: busy, label: s.serverName, onChange: (next) => onToggleExclude(s.serverName, next) }),
              );
            }),
    ),
  );
};

/**
 * 详情页签的公共构造。MCP 面与技能面必须长得一样、行为一样，所以规则只写在这里。
 *
 * 刻意做成**普通函数而不是组件**：组件节点在假 React 树里不会被展开（测试收集到的
 * 只有 `{ type: DetailTab, props }`），于是「页签文案与计数正确」这类断言只能空转。
 * 直接返回元素则让两个能力面的页签在测试里都是可见的。
 */
const detailTab = (tab, onTab, id, label, count) => h('button', {
  key: id,
  type: 'button',
  role: 'tab',
  'aria-selected': tab === id,
  className: 'dsh-mcp-tab' + (tab === id ? ' sel' : ''),
  onClick: () => { if (onTab) onTab(id); },
}, label, count ? h('span', { className: 'dsh-mcp-tab-count' }, String(count)) : null);

/** 非当前页签的卡片不参与布局——只渲染当前页会让别处的文本断言失去意义，所以是隐藏而非卸载。 */
const detailPaneOff = (tab, id) => (tab === id ? '' : ' dsh-mcp-pane-off');

const ServerDetail = ({ server, tools, onToggle, onReconnect, onEdit, onRemove, busy, onReveal, revealed, onCopy, excluded, onToggleExclude, emptyTitle, emptyActions, tab = 'overview', onTab }) => {
  if (!server)
    return h('div', { className: 'dsh-mcp-detail' }, h('div', { className: 'dsh-mcp-d-empty' },
      h('b', null, emptyTitle || t('选择左侧的一个 MCP')),
      emptyTitle ? null : h('span', null, t('这里会显示它的连接配置、已注册的工具，以及连接失败时的诊断。')),
      emptyActions ? h('div', { className: 'dsh-mcp-d-actions' }, ...emptyActions) : null));
  const env = server.env || {};
  const headers = server.headers || {};
  const envKeys = Object.keys(env);
  const headerKeys = Object.keys(headers);
  const revealId = (field, key) => server.serverName + ':' + field + (key !== undefined ? ':' + key : '');
  const revealedValue = (field, key) => {
    const r = revealed[revealId(field, key)];
    if (!r || r.value === undefined) return undefined;
    return Array.isArray(r.value) ? r.value.join(' ') : String(r.value);
  };
  // 项目 MCP 由会话挂载，管理面板不持有其连接：状态保持中性，除非它确实挂载失败过
  // （workspaceServerView 不产生 lastError，此处的 lastError 只会来自挂载失败）。
  const isWorkspace = server.scope === 'workspace';
  // 项目行的两类失败是两回事，由 Host 分开标记，不再用“lastError 存在”去反推：
  //   mountFailed  = 我们自己 setup 阶段挂不上（serverName 冲突/启动失败）
  //   status=failed = 连接已建但 mcp-client 报错/重连耗尽（工具被注销）
  //   scopeFailed  = 工具注册到了全局层而不是共享作用域层（dsh-scope 两份模块实例）
  const mountFailed = isWorkspace && server.mountFailed === true;
  const scopeFailed = isWorkspace && server.scopeFailed === true;
  // 在项目 tab 里查看的全局 MCP：配置属于全局作用域，此处只读，仅能切换本项目可见性。
  const isForeign = server.foreign === 'global';
  const status = mountFailed ? 'failed' : server.status || server.phase || 'stopped';
  const statusCls = server.enabled ? (status === 'connected' ? 's-on' : status === 'failed' ? 's-err' : '') : 's-off';
  const statusText = !server.enabled
    ? t('已禁用')
    : mountFailed
      ? t('挂载失败')
      : scopeFailed
        ? t('作用域隔离失败')
        : isWorkspace
          // 项目行的 status 与全局同一个取值域（deriveMcpPhase），只是文案不同。
          // 这里只说**连接**那一半事实（"在不在"）；"几个会话在用"由详情页的连接信息与列表行的
          // 副文案给出——两者刻意不合并，见 wsSub 的注释。
          // stopped 在项目语境里意为「这条共享连接尚未建立」（新会话挂载时才建）。
        ? (status === 'connected' ? t('已连接') : status === 'failed' ? t('连接失败') : status === 'unknown' ? t('状态未知') : status === 'loading' ? t('连接中…') : t('尚未建立连接（新会话自动挂载）'))
        : status === 'connected' ? t('已连接') : status === 'failed' ? t('连接失败') : status === 'unknown' ? t('状态未知') : status === 'loading' || status === 'waiting' ? t('连接中…') : t('已停止');
  const mut = (v) => {
    const visible = displayValue(v);
    return typeof visible === 'string' && visible.length > 90 ? visible.slice(0, 88) + '…' : visible;
  };
  const RevealBtn = ({ field, keyName, label, fallback }) => {
    // 眼睛（以及点开后的复制）只属于**被掩码的值**。明文值（如无凭据的 URL）本来就摆在眼前，
    // 给它配一个只会让人以为还藏了东西，而点下去其实什么也不变。
    const masked = fallback === REDACTED_VALUE;
    const state = revealed[revealId(field, keyName)];
    const shown = revealedValue(field, keyName) !== undefined ? revealedValue(field, keyName) : mut(fallback);
    const revealedNow = state?.value !== undefined;
    return h('span', { className: 'dsh-mcp-secret' },
      h('span', { className: 'dsh-mcp-secret-value', title: shown }, shown),
      revealedNow ? h('button', { type: 'button', className: 'dsh-mcp-secret-btn', title: t('复制 {label}', { label }), 'aria-label': t('复制 {label}', { label }), onClick: () => onCopy(shown) }, h(Icon, { d: ICONS.copy })) : null,
      masked ? h('button', { type: 'button', className: 'dsh-mcp-secret-btn', disabled: state?.pending, title: revealedNow ? t('隐藏 {label}', { label }) : t('显示 {label}', { label }), 'aria-label': t('显示/隐藏 {label}', { label }), onClick: () => onReveal(server, field, keyName) }, state?.pending ? '…' : h(Icon, { d: ICONS[revealedNow ? 'eyeOff' : 'eye'] })) : null,
    );
  };
  const RevealRow = ({ field, keyName, label }) =>
    h('div', { className: 'dsh-mcp-secret-row' },
      h('b', null, keyName),
      h(RevealBtn, { field, keyName, label, fallback: String(env[keyName] ?? headers[keyName] ?? '') }),
    );
  // 详情页签：只把**已经取到的**卡片分组，不新增任何取数。MCP 规范继续扩字段时，
  // 新卡片进对应页签即可，右侧不会变成一条无限长的下拉。
  //
  // 硬错误（server.lastError）刻意不进页签：它是「为什么这行是红的」的直接答案，
  // 藏到一次点击后面等于把诊断成本转嫁给最需要它的人。
  const diagBlocks = [
    isForeign ? h('div', { className: 'dsh-mcp-log warn' }, t('此 MCP 由全局配置提供。要改它的连接配置，请切到「全局」标签页；在这里只能决定它对本项目是否可见。')) : null,
    // 同名在 DSH 0.1.5 起是合法配置（官方按注册作用域隔离），所以只有这份连接真的失败时才
    // 把它摆成原因；成功时不刷屏，更不把一条好连接说成冲突。
    isWorkspace && server.duplicateOwners?.length && status === 'failed' ? h('div', { className: 'dsh-mcp-log warn' }, t('以下项目也定义了同名 serverName：{names}。DSH 0.1.5 起各注册作用域可独立使用同名；更早的版本按全进程唯一判定，同名会导致其中一份启动失败。', { names: server.duplicateOwners.join(t('、')) })) : null,
    // 全局层的同名条目：**说清是谁**，否则这一行看起来只是"坏了"，而用户没有任何线索。
    // 关键事实有两个——(1) 本行仍然可编辑（身份按 id，不按名字）；(2) 另一条不归本 profile，
    // 要改它得去它自己的配置层，删掉本行之后它通常要重启宿主才会重新尝试连接。
    server.duplicates?.length
      ? h('div', { className: 'dsh-mcp-log warn' },
        t('同一 serverName 在 loader 里还有 {count} 条条目，由其他配置层提供（{items}）。mcp-client 在连接期按作用域判重，同名条目里只有一条能连上；本面板只能编辑/移除属于当前 profile 的那条。', {
          count: server.duplicates.length,
          items: server.duplicates.map((other) => other.id + (other.disabled ? t('（已禁用）') : '')).join(t('、')),
        }))
      : null,
    server.toolCountAmbiguous ? h('div', { className: 'dsh-mcp-log warn' }, t('工具命名与其他 serverName 前缀重叠，无法可靠判断归属；请避免在 serverName 中使用双下划线。')) : null,
  ].filter(Boolean);
  const paneOff = (id) => detailPaneOff(tab, id);
  const tabBtn = (id, label, count) => detailTab(tab, onTab, id, label, count);
  return h('div', { className: 'dsh-mcp-detail' },
    h('div', { className: 'dsh-mcp-d-head' },
      h('div', { className: 'dsh-mcp-d-title' },
        h('div', { className: 'dsh-mcp-d-name' }, server.serverName),
        h('div', { className: 'dsh-mcp-d-meta' },
          h(Dot, { phase: status }),
          h(Badge, { cls: statusCls + ' dot' }, statusText),
          h(Badge, { cls: server.transport === 'http' ? 't-http' : 't-stdio' }, server.transport === 'http' ? 'HTTP' : 'stdio'),
          h(Badge, { cls: isWorkspace ? 'scope-ws' : '' }, isWorkspace ? t('项目配置') : t('全局配置')),
          isWorkspace ? null : h(Badge, null, t('{count} 个工具', { count: server.toolCount })),
          isWorkspace && server.refs > 0 ? h(Badge, null, t('{count} 个会话共用', { count: server.refs })) : null,
          isWorkspace && server.duplicateOwners?.length && status === 'failed' ? h(Badge, { cls: 's-err' }, t('serverName 同名冲突')) : null,
        ),
      ),
      // 操作栏槽位：[主行为] + [次要行为] + [⋯ 更多]。
      // 主行为 = 启停（最高频、也是唯一会改状态的动作）；「重连」与「移除」收进 ⋯，
      // 于是以后再加动作有确定去处，头部不会因此换行（真机窄屏下 6 个按钮要两行起步）。
      actionBar({
        primary: isForeign
          ? h(React2.Fragment, null,
              h('span', { className: 'dsh-mcp-d-scope-hint' }, excluded ? t('已在此项目屏蔽') : t('在此项目可见')),
              h(EyeToggle, { hidden: excluded, disabled: busy, label: server.serverName, onChange: (next) => onToggleExclude(server.serverName, next) }),
            )
          : h(Btn, {
            cls: 'primary',
            icon: server.enabled ? 'pause' : 'play',
            onClick: () => onToggle(server),
            disabled: busy || !server.managed,
            title: server.managed ? (server.enabled ? t('禁用') : t('启用')) : t('来自其他配置层，只读'),
            children: server.enabled ? t('停用') : t('启用'),
          }),
        secondary: isForeign ? null : h(Btn, { icon: 'edit', onClick: () => onEdit(server), disabled: busy || !server.managed, children: t('编辑') }),
        more: isForeign ? [] : [
          {
            key: 'reconnect',
            icon: 'refresh',
            label: t('重连'),
            title: isWorkspace ? t('重连本项目共享连接（拆掉旧连接并按当前配置重建，不影响其他会话）') : t('重连'),
            disabled: busy || !server.enabled || !server.managed,
            onSelect: () => onReconnect(server),
          },
          { key: 'sep', separator: true },
          { key: 'remove', icon: 'trash', label: t('移除'), danger: true, disabled: busy || !server.managed, onSelect: () => onRemove(server) },
        ],
      }),
    ),
    server.lastError ? h('div', { className: 'dsh-mcp-log', title: t('来自 mcp-client 最近日志') }, server.lastError) : null,
    h('div', { className: 'dsh-mcp-tabs', role: 'tablist', 'aria-label': t('详情分区') },
      tabBtn('overview', t('概览')),
      tabBtn('tools', t('工具'), tools.length),
      tabBtn('diag', t('诊断'), diagBlocks.length),
    ),
    h('div', { className: 'dsh-mcp-d-body' },
    h('div', { className: 'dsh-mcp-card' + paneOff('overview') },
      h('h4', null, t('连接信息')),
      h('div', { className: 'dsh-mcp-kv' },
        h('b', null, t('传输')), h('span', null, server.transport === 'http' ? 'Streamable HTTP' : 'stdio'),
        server.url ? h('b', null, 'URL') : null, server.url ? h(RevealBtn, { field: 'url', label: 'URL', fallback: server.url }) : null,
        server.command ? h('b', null, t('命令')) : null, server.command ? h('span', null, mut(server.command)) : null,
        server.args && server.args.length ? h('b', null, t('参数')) : null, server.args && server.args.length ? h(RevealBtn, { field: 'args', label: t('参数'), fallback: server.args.map(mut).join(' ') }) : null,
        server.cwd ? h('b', null, t('工作目录')) : null, server.cwd ? h('span', null, mut(server.cwd)) : null,
        h('b', null, t('启用')), h('span', null, server.enabled ? t('是') : t('否（补丁中 disabled: true）')),
        // 「可不可编辑」只看 managed（= 本 profile 有没有这一条），同名与否只是附加事实。
        // 原来 conflict 优先并写成「冲突，只读」，等于把"别人也有一条"读成"你的这条也锁了"。
        h('b', null, t('配置来源')), h('span', null,
          server.conflict
            ? t('{base}，另有 {count} 条同名条目由其他配置层提供（{ids}）', {
              base: isForeign ? t('全局配置（在「全局」标签页可编辑）') : isWorkspace ? t('项目配置 .dsh/mcp.json（可编辑，本项目会话共享一份连接）') : server.managed ? t('当前 Web profile（可编辑）') : t('其他 bundle / Agent（只读）'),
              count: Math.max(1, server.duplicates?.length ?? 0),
              ids: (server.duplicates ?? []).map((other) => other.id).join(t('、')) || t('未知'),
            })
            : isForeign ? t('全局配置（在「全局」标签页可编辑）') : isWorkspace ? t('项目配置 .dsh/mcp.json（可编辑，本项目会话共享一份连接）') : server.managed ? t('当前 Web profile（可编辑）') : t('其他 bundle / Agent（只读）')),
        server.toolCallTimeoutMs ? h('b', null, t('调用超时')) : null, server.toolCallTimeoutMs ? h('span', null, server.toolCallTimeoutMs + ' ms') : null,
        h('b', null, t('启动失败策略')), h('span', null, server.failOnStartupError ? t('阻止插件启动') : t('记录错误并继续')),
        h('b', null, t('工具延迟加载')), h('span', null, (server.deferEffective ?? server.defer)
          ? t('已开启（{count} 工具经 tool_search 按需加载）', { count: server.toolCount })
          : t('关闭（工具全量常驻上下文）')),
        server.reconnect ? h('b', null, t('自动重连')) : null, server.reconnect ? h('span', null, server.reconnect.enabled === false ? t('关闭') : t('{min}–{max} ms，最多 {attempts} 次', { min: server.reconnect.initialDelayMs || 500, max: server.reconnect.maxDelayMs || 30000, attempts: server.reconnect.maxAttempts || 10 })) : null,
        headerKeys.length ? h('b', null, 'Headers') : null, headerKeys.length ? h('div', { className: 'dsh-mcp-secret-list' }, headerKeys.map((k) => h(RevealRow, { key: k, field: 'headers', keyName: k, label: 'Header ' + k }))) : null,
        envKeys.length ? h('b', null, t('环境变量')) : null, envKeys.length ? h('div', { className: 'dsh-mcp-secret-list' }, envKeys.map((k) => h(RevealRow, { key: k, field: 'env', keyName: k, label: t('环境变量 {name}', { name: k }) }))) : null,
      ),
    ),
    h('div', { className: 'dsh-mcp-card' + paneOff('tools') },
      h('h4', null, t('工具（{count}）', { count: tools.length })),
      h('div', { className: 'dsh-mcp-tools' },
        tools.length === 0
          ? h('div', { className: 'dsh-mcp-empty-list' }, server.toolCountAmbiguous ? t('工具归属存在命名歧义') : server.scope === 'workspace' ? t('尚无会话持有该项目连接，或连接尚未就绪') : t('暂无工具'))
          : tools.map((t) => h(ToolRow, { key: t.name, tool: t })),
      ),
    ),
    h('div', { className: 'dsh-mcp-d-diag' + paneOff('diag') },
      diagBlocks.length
        ? diagBlocks
        : h('div', { className: 'dsh-mcp-d-note' }, t('未检测到配置层冲突或工具归属歧义。')),
    ),
    ),
  );
};

/**
 * 详情页签的状态宿主。
 *
 * 为什么要有这一层：ServerDetail / SkillDetail 都是**纯函数**——测试直接以普通函数
 * 调用它们来校验渲染出的文本，函数体里放 useState 会在那种调用下抛 "Invalid hook
 * call"。所以页签状态放在这个薄包装里，详情组件只收 tab / onTab：
 * 不给 props 时默认第一页，且所有页内容照样全部渲染、只用 class 关掉非当前的，
 * 于是「详情必须画出正文」这类断言在分页之后依然成立。
 */
const ServerDetailPane = (props) => {
  const [tab, setTab] = useState('overview');
  // 换一台 server 就回到概览：上一台的页签选择对新的一台没有意义。
  const key = props.server ? props.server.serverName + ':' + (props.server.scope || '') : '';
  useEffect(() => { setTab('overview'); }, [key]);
  return h(ServerDetail, { ...props, tab, onTab: setTab });
};

const AddEditModal = ({ open, onClose, onSubmit, busy, initial, onRevealValue, revealEpoch, scope, scopeName }) => {
  const [name, setName] = useState('');
  const [transport, setTransport] = useState('http');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [cwd, setCwd] = useState('');
  const [toolCallTimeoutMs, setToolCallTimeoutMs] = useState('60000');
  const [failOnStartupError, setFailOnStartupError] = useState(false);
  const [deferTools, setDeferTools] = useState(false);
  const [reconnectEnabled, setReconnectEnabled] = useState(true);
  const [initialDelayMs, setInitialDelayMs] = useState('500');
  const [maxDelayMs, setMaxDelayMs] = useState('30000');
  const [maxAttempts, setMaxAttempts] = useState('10');
  const [headers, setHeaders] = useState([{ k: '', v: '' }]);
  const [envs, setEnvs] = useState([{ k: '', v: '' }]);
  const [error, setError] = useState('');
  const [revealBusy, setRevealBusy] = useState('');
  const [editRevealed, setEditRevealed] = useState({});
  const editRevealGeneration = useRef(0);
  const editing = !!initial;
  const applyPreset = (id) => {
    const preset = MCP_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setName(preset.serverName);
    setTransport(preset.transport);
    setUrl('');
    setCommand(preset.command || '');
    setArgs((preset.args || []).join('\n'));
    setCwd('');
    setHeaders([{ k: '', v: '' }]);
    setEnvs([{ k: '', v: '' }]);
    setError('');
  };
  useEffect(() => {
    clearRevealState(editRevealGeneration, setEditRevealed, setRevealBusy);
  }, [revealEpoch]);
  useEffect(() => {
    editRevealGeneration.current += 1;
    if (!open) return;
    if (initial) {
      setName(initial.serverName);
      setTransport(initial.transport === 'http' ? 'http' : 'stdio');
      setUrl(toFormValue(initial.url || ''));
      setCommand(initial.command || '');
      setArgs(Array.isArray(initial.args) ? initial.args.map(toFormValue).join('\n') : '');
      setCwd(initial.cwd || '');
      setToolCallTimeoutMs(String(initial.toolCallTimeoutMs || 60000));
      setFailOnStartupError(initial.failOnStartupError === true);
      setDeferTools(initial.defer === true);
      setReconnectEnabled(initial.reconnect?.enabled !== false);
      setInitialDelayMs(String(initial.reconnect?.initialDelayMs || 500));
      setMaxDelayMs(String(initial.reconnect?.maxDelayMs || 30000));
      setMaxAttempts(String(initial.reconnect?.maxAttempts || 10));
      const hd = Object.keys(initial.headers || {}).map((k) => ({ k, originalKey: k, v: toFormValue(initial.headers[k]) }));
      setHeaders(hd.length ? hd : [{ k: '', v: '' }]);
      const ev = Object.keys(initial.env || {}).map((k) => ({ k, originalKey: k, v: toFormValue(initial.env[k]) }));
      setEnvs(ev.length ? ev : [{ k: '', v: '' }]);
    } else {
      setName(''); setTransport('http'); setUrl(''); setCommand(''); setArgs(''); setCwd('');
      setToolCallTimeoutMs('60000'); setFailOnStartupError(false); setReconnectEnabled(true);
      setInitialDelayMs('500'); setMaxDelayMs('30000'); setMaxAttempts('10');
      setHeaders([{ k: '', v: '' }]); setEnvs([{ k: '', v: '' }]);
    }
    setError('');
    setRevealBusy('');
    setEditRevealed({});
  }, [open, initial]);
  if (!open) return null;
  const kv = (rows, setRows, i, field, v) => {
    const next = rows.slice();
    const row = { ...next[i], [field]: v };
    if (field === 'k' && isPreservedValue(row.v) && v !== row.originalKey) row.v = '';
    next[i] = row;
    setRows(next);
  };
  const addRow = (rows, setRows) => setRows([...rows, { k: '', v: '' }]);
  const delRow = (rows, setRows, i) => setRows(rows.filter((_, x) => x !== i));
  const editRevealId = (field, key) => (initial?.serverName || 'new') + ':' + field + (key !== undefined ? ':' + key : '');
  const formatRevealedValue = (value) => Array.isArray(value)
    ? value.join('\n')
    : value && typeof value === 'object'
      ? Object.entries(value).map(([key, item]) => `${key}=${typeof item === 'object' ? JSON.stringify(item) : String(item)}`).join('\n')
      : String(value ?? '');
  // 输入框里显示的哨兵要按语言给（英文界面下不该冒出中文「保留原值」），但**只换显示**：
  // 值本身仍是 PRESERVED_VALUE_LABEL，提交时 fromFormValue 才认得出它。见哨兵的注释。
  const visibleEditValue = (field, key, fallback) => {
    const shown = Object.hasOwn(editRevealed, editRevealId(field, key)) ? editRevealed[editRevealId(field, key)] : fallback;
    return isPreservedValue(shown) ? preservedView() : shown;
  };
  const hideEditReveal = (field, key) => setEditRevealed((prev) => {
    const next = { ...prev };
    delete next[editRevealId(field, key)];
    return next;
  });
  const toggleEditReveal = async (field, key) => {
    if (!editing || !initial) return;
    const id = editRevealId(field, key);
    if (Object.hasOwn(editRevealed, id)) { hideEditReveal(field, key); return; }
    const generation = editRevealGeneration.current;
    setRevealBusy(id); setError('');
    try {
      const value = await onRevealValue(initial, field, key);
      if (generation !== editRevealGeneration.current) return;
      setEditRevealed((prev) => ({ ...prev, [id]: formatRevealedValue(value) }));
    } catch (e) {
      if (generation !== editRevealGeneration.current) return;
      setError(String(e?.message || e));
    } finally {
      if (generation === editRevealGeneration.current) setRevealBusy('');
    }
  };
  const submit = () => {
    const n = (name || '').trim();
    if (!n) return setError(t('请填写 MCP 名称'));
    const spec = { name: n, transport };
    if (transport === 'http') {
      spec.url = fromFormValue(url.trim());
      const hd = {};
      headers.forEach((r) => { if (r.k.trim()) setOwn(hd, r.k.trim(), fromFormValue(r.v)); });
      if (Object.keys(hd).length) spec.headers = hd;
    } else {
      spec.command = command.trim();
      const parts = args.split(/\r?\n/).map((s) => fromFormValue(s.trim())).filter(Boolean);
      if (parts.length) spec.args = parts;
      if (cwd.trim()) spec.cwd = cwd.trim();
      const ev = {};
      envs.forEach((r) => { if (r.k.trim()) setOwn(ev, r.k.trim(), fromFormValue(r.v)); });
      if (Object.keys(ev).length) spec.env = ev;
    }
    const timeout = Number(toolCallTimeoutMs);
    const initialDelay = Number(initialDelayMs);
    const maxDelay = Number(maxDelayMs);
    const attempts = Number(maxAttempts);
    if (!Number.isSafeInteger(timeout) || timeout <= 0 || !Number.isSafeInteger(attempts) || attempts <= 0) return setError(t('工具超时和最大尝试次数必须是正整数'));
    if (!Number.isFinite(initialDelay) || initialDelay <= 0 || initialDelay > MAX_TIMER_DELAY_MS || !Number.isFinite(maxDelay) || maxDelay <= 0 || maxDelay > MAX_TIMER_DELAY_MS) return setError(t('重连延迟必须是有效正数且不超过 2147483647 ms'));
    if (initialDelay > maxDelay) return setError(t('首次延迟不能大于最大延迟'));
    spec.toolCallTimeoutMs = timeout;
    spec.failOnStartupError = failOnStartupError;
    // 表单显式渲染的字段直接赋值；defer 关掉时写 false（updateEntry 对 false 原样落盘，
    // 不会留下 true 残影）。
    spec.defer = deferTools;
    spec.reconnect = { enabled: reconnectEnabled, initialDelayMs: initialDelay, maxDelayMs: maxDelay, maxAttempts: attempts };
    // 表单只拥有它显式渲染的字段，而提交是**重建** spec 而不是增量修改 —— 所以其余字段必须原样
    // 带回去，否则"编辑一次"就把它们抹掉：`disabled`（会让一个被禁用的 server 被悄悄启用）以及
    // 项目级的两个预算旋钮（表单不渲染它们，但配置文件里可能有）。
    if (initial) {
      if (initial.enabled === false) spec.disabled = true;
      for (const key of ['idleTimeoutMs', 'readyTimeoutMs']) if (initial[key] !== undefined) spec[key] = initial[key];
    }
    onSubmit(spec, setError);
  };
  const kvRows = transport === 'http' ? headers : envs;
  const setKvRows = transport === 'http' ? setHeaders : setEnvs;
  const revealIcon = (id, label, onClick) => {
    const shown = Object.hasOwn(editRevealed, id);
    return h('button', { type: 'button', className: 'dsh-mcp-btn dsh-mcp-inline-icon', disabled: revealBusy === id, title: (shown ? t('隐藏原值：') : t('显示原值：')) + label, 'aria-label': (shown ? t('隐藏原值：') : t('显示原值：')) + label, onClick }, revealBusy === id ? '…' : h(Icon, { d: ICONS[shown ? 'eyeOff' : 'eye'] }));
  };
  return h('div', { className: 'dsh-mcp-overlay', onClick: (e) => e.target === e.currentTarget && onClose() },
    h(Dialog, { label: editing ? t('编辑 MCP') : t('添加 MCP'), onClose },
      h('h3', null, (editing ? t('编辑 MCP') : t('添加 MCP')) + (scope !== 'global' && scopeName ? t('（{name}）', { name: scopeName }) : '')),
      !editing ? h('div', { className: 'dsh-mcp-field' },
        h('label', null, t('从预设模板快速填充（可选，命令需本机 npx/uvx）')),
        h('select', { value: '', onChange: (e) => applyPreset(e.target.value), 'aria-label': t('选择预设模板') },
          h('option', { value: '' }, t('— 选择预设 —')),
          MCP_PRESETS.map((p) => h('option', { key: p.id, value: p.id }, t(p.label))),
        ),
      ) : null,
      h('div', { className: 'dsh-mcp-field' },
        h('label', null, t('MCP 名称（唯一标识，不可改）')),
        h('input', { value: name, disabled: editing, onChange: (e) => setName(e.target.value), placeholder: 'my-server' }),
      ),
      h('div', { className: 'dsh-mcp-field' },
        h('label', null, t('传输类型')),
        h('div', { className: 'dsh-mcp-radio-row' },
          h('label', { className: transport === 'http' ? 'sel' : '' }, h('input', { type: 'radio', checked: transport === 'http', onChange: () => setTransport('http') }), t('HTTP（远程）')),
          h('label', { className: transport === 'stdio' ? 'sel' : '' }, h('input', { type: 'radio', checked: transport === 'stdio', onChange: () => setTransport('stdio') }), t('stdio（本地进程）')),
        ),
      ),
      transport === 'http'
        ? h('div', { className: 'dsh-mcp-field' },
            h('label', null, 'URL'),
            h('div', { className: 'dsh-mcp-input-action' },
              h('input', { value: visibleEditValue('url', undefined, url), onChange: (e) => { hideEditReveal('url'); setUrl(e.target.value); }, placeholder: 'https://example.com/mcp' }),
              editing && isPreservedValue(url) ? revealIcon('url', 'URL', () => toggleEditReveal('url')) : null,
            ),
          )
        : h('div', null,
            h('div', { className: 'dsh-mcp-field' }, h('label', null, t('命令')), h('input', { value: command, onChange: (e) => setCommand(e.target.value), placeholder: t('npx 或 C:\\path\\to\\bin.exe') })),
            h('div', { className: 'dsh-mcp-field' },
              h('label', null, t('参数（每行一个，原样传给进程）')),
              h('div', { className: 'dsh-mcp-input-action' },
                h('textarea', { rows: 4, value: visibleEditValue('args', undefined, args), onChange: (e) => { hideEditReveal('args'); setArgs(e.target.value); }, placeholder: '-y\nmcp-server@latest' }),
                editing && isPreservedValue(args) ? revealIcon('args', t('参数'), () => toggleEditReveal('args')) : null,
              ),
            ),
            h('div', { className: 'dsh-mcp-field' }, h('label', null, t('工作目录 cwd（可选）')), h('input', { value: cwd, onChange: (e) => setCwd(e.target.value), placeholder: 'C:\\path\\to\\workspace' })),
          ),
      h('div', { className: 'dsh-mcp-field' },
        h('label', null, transport === 'http' ? t('Headers（可选）') : t('环境变量（可选，值写 !!js process.env.KEY 引用密钥）')),
        kvRows.map((row, i) => {
          const field = transport === 'http' ? 'headers' : 'env';
          const originalKey = row.originalKey || row.k;
          const id = editRevealId(field, originalKey);
          return h('div', { key: i, className: 'dsh-mcp-kv-edit' },
            h('input', { placeholder: transport === 'http' ? 'Authorization' : 'API_KEY', value: row.k, onChange: (e) => { hideEditReveal(field, originalKey); kv(kvRows, setKvRows, i, 'k', e.target.value); } }),
            h('input', { placeholder: transport === 'http' ? t('Bearer … 或 !!js process.env.KEY') : 'value', value: visibleEditValue(field, originalKey, row.v), onChange: (e) => { hideEditReveal(field, originalKey); kv(kvRows, setKvRows, i, 'v', e.target.value); } }),
            h('div', { className: 'dsh-mcp-kv-row-actions' },
              editing && isPreservedValue(row.v) ? revealIcon(id, row.k, () => toggleEditReveal(field, originalKey)) : null,
              h('button', { type: 'button', className: 'dsh-mcp-kv-del', onClick: () => delRow(kvRows, setKvRows, i), title: t('删除此项'), 'aria-label': t('删除 {name}', { name: row.k || t('配置项') }) }, h(Icon, { d: ICONS.x })),
            ),
          );
        }),
        h('div', { className: 'dsh-mcp-kv-add' }, h(Btn, { onClick: () => addRow(kvRows, setKvRows), children: t('+ 添加') })),
      ),
      h('div', { className: 'dsh-mcp-card dsh-mcp-advanced' },
        h('h4', null, t('运行策略')),
        h('div', { className: 'dsh-mcp-field' }, h('label', null, t('工具调用超时（毫秒）')), h('input', { type: 'number', min: 1, value: toolCallTimeoutMs, onChange: (e) => setToolCallTimeoutMs(e.target.value) })),
        h('label', { className: 'dsh-mcp-check' }, h('input', { type: 'checkbox', checked: failOnStartupError, onChange: (e) => setFailOnStartupError(e.target.checked) }), t('首次连接失败时阻止插件启动')),
        h('label', { className: 'dsh-mcp-check', title: t('开启后该服务器的工具不再全量常驻上下文，模型按需通过 tool_search 搜索加载；调用一次多一个往返。适合工具数量多的服务器。') }, h('input', { type: 'checkbox', checked: deferTools, onChange: (e) => setDeferTools(e.target.checked) }), t('延迟加载工具（ToolSearch 按需搜索）')),
        // 开启前预告：只给**真实数据**——工具数。不再提任何门槛：两道门槛（per-server ≤10、
        // 会话级 <15）在第十轮整个删掉了（官方没有这两道，且它们制造"勾了没生效"的断层）。
        // 刻意不给"能省多少 token"：我们不知道用户装了什么 MCP，schema 大小差一个量级，
        // 估算数字的精确感是假的，而用户会拿它做决定。
        // 唯一保留的诚实记账：小服务器延迟之后每轮仍要付一段引导语，"省字"可能是负的
        // （DECISIONS §9.1 的补记）——这句话必须写在这里，因为开关就在这一行。
        editing && initial.toolCount !== undefined
          ? h('div', { className: 'dsh-mcp-d-note' }, initial.toolCount <= 10
            ? t('该服务器仅 {count} 个工具：延迟后按需加载，但每轮仍要付一段引导语，省下的空间可能不多', { count: initial.toolCount })
            : t('该服务器 {count} 个工具，将经 tool_search 按需加载', { count: initial.toolCount }))
          : null,
        h('label', { className: 'dsh-mcp-check' }, h('input', { type: 'checkbox', checked: reconnectEnabled, onChange: (e) => setReconnectEnabled(e.target.checked) }), t('断开后自动重连')),
        h('div', { className: 'dsh-mcp-number-grid' },
          h('div', { className: 'dsh-mcp-field' }, h('label', null, t('首次延迟 ms')), h('input', { type: 'number', min: 1, step: 'any', value: initialDelayMs, onChange: (e) => setInitialDelayMs(e.target.value) })),
          h('div', { className: 'dsh-mcp-field' }, h('label', null, t('最大延迟 ms')), h('input', { type: 'number', min: 1, step: 'any', value: maxDelayMs, onChange: (e) => setMaxDelayMs(e.target.value) })),
          h('div', { className: 'dsh-mcp-field' }, h('label', null, t('最大尝试次数')), h('input', { type: 'number', min: 1, value: maxAttempts, onChange: (e) => setMaxAttempts(e.target.value) })),
        ),
      ),
      error ? h('div', { className: 'dsh-mcp-d-err' }, error) : null,
      h('div', { className: 'dsh-mcp-modal-actions' },
        h(Btn, { onClick: onClose, children: t('取消') }),
        h(Btn, { cls: 'primary', onClick: submit, disabled: busy, children: busy ? t('保存中…') : (editing ? t('保存') : t('添加')) }),
      ),
    ),
  );
};

// 「MCP 市场」：目录的浏览与安装入口。
//
// 与旧的「内置 MCP」对话框的区别是它成了**主要入口**：搜索框是主操作，分类 chips 让用户
// 按用途找而不是按名字找，卡片直接可装，不再需要先勾选再确认。多选保留着——批量装同一类
// （比如把搜索类一次装齐）仍然比一个个点快。
//
// 数据来自 Host 的 builtins RPC，**分类标签也在那里**：这个文件是预构建 bundle，不 import
// Host 模块，所以 lib/mcp-catalog.js 的常量在这里读不到——Host 已把 categoryLabel 带在每条
// 目上。分类的**顺序**取目录里的首次出现序，而生成器已按 CATEGORY_ORDER 重排了目录，所以这里
// 取到的就是产品定的顺序；客户端不再维护一份顺序表：否则加一个分类要记得改两个文件。
/**
 * MCP 发现市场 —— **内联视图**，不再是浮层。
 *
 * 为什么改：从前它是个 1080×820 的弹窗（.dsh-mcp-modal.dsh-mcp-market），而技能面的市场
 * 是内联的。同一个「发现市场」在两个能力面里是两种形态、两个入口（一个按钮弹窗、
 * 一个模式切换），用户得分别学一遍。现在两边都是第二行「发现市场」模式下的内联网格，
 * 共用同一批原语（.dsh-mcp-chips / .dsh-mcp-grid / .dsh-mcp-mcard）。
 *
 * 逐条安装，不做多选批量：多选那套（全选 / 安装选中）与技能面、与原型都不一致，
 * 而且它把一个「看见就能装」的动作变成了「先勾再确认」两步。
 */
/**
 * 把目录条目对齐到**当前作用域**的「已配置」语义。
 *
 * 为什么必须有这一步：Host 的目录是按**全局 effective 配置**标 `installed` 的，
 * 而面板有全局与项目两种作用域。第一版只在项目作用域里**补** true、从不改成 false，
 * 于是切到某个项目后：全局装过的服务被显示成「已写入本项目配置」并给一个「移除」按钮
 * （那个项目其实一条配置都没有，按钮点下去只会报错）——真机上就是这么表现的：
 * 药丸写着 0 个 MCP，市场里却有 11 个「已配置」。
 *
 * 两种作用域的含义本来就不同，所以这里明确二分：
 *   全局：Host 报什么就是什么（就是当前 profile 的配置）。
 *   项目：**只有该项目自己的配置算数**；全局装过但本项目没有的，标成
 *         `globallyInstalled` 让卡片说清楚「全局已装，可以再装一份项目副本」，
 *         而不是假装它已经在这个项目里。
 *
 * 纯函数：目录映射是「同一份数据在两种作用域下两种含义」这类最容易错的地方，
 * 抽出来才能直接断言，而不是只在真机上看一眼。
 */
function catalogForScope(items, { isWorkspace, knownNames } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!isWorkspace) return list;
  const names = new Set((Array.isArray(knownNames) ? knownNames : [])
    .map((entry) => entry?.serverName)
    .filter((name) => typeof name === 'string' && name !== ''));
  return list.map((item) => (names.has(item.name)
    ? { ...item, installed: true, installedAs: [item.name], globallyInstalled: item.installed === true }
    // installed:false 是**判定**，不是「不知道」：本项目确实没有这一条。
    : { ...item, installed: false, installedAs: undefined, globallyInstalled: item.installed === true }));
}

/**
 * 安装目标：优先用宿主报的**全部**位置（`skillTargets`，含还没建的），
 * 拿不到就退回「实际发现」的候选。
 *
 * 为什么要两条路：`skillTargets` 是新方法，老宿主没有它——那时 `call` 返回 `{ok:false}`，
 * 面板必须退回原来的行为（只列已经在用的位置），而不是把「安装到」变成空的。
 * 为什么新方法才是正解：观察 ≠ 能力。「`~/.dsh/skills` 里还没有技能」不代表不能往里装，
 * 而按发现派生的候选永远列不出这种位置（用户的原话：「用户没有选择的权力？」）。
 *
 * @param {object[]} targets - 宿主 skillTargets 的结果（{source, root, scope, writable, exists, projectPath}）。
 * @param {object[]} discovered - skillScopeOptions(rows) 的退路。
 * @returns {{ source, label, scope, root, writable, exists, pending }[]}
 */
/**
 * 安装目标的**唯一身份**：`source + root`。
 *
 * ⚠️ 不能只用 `source`：两个工作区都会有 `project-agents`。只按 source 做 key/查找，会让
 * 两个单选项撞同一个 key、同一个选中值，而且 `find` 取首个 → 用户以为选的是项目 B，
 * 实际写进项目 A（或 `installTargets[0]` 那个默认）。宿主本来就是按 `source\0root`
 * 去重的（skills-registry.js 的 skillTargetsView），面板必须用同一套身份。
 */
const installTargetId = (option) => `${option?.source || ''}\u0000${option?.root || ''}`

function skillTargetOptions(targets, discovered) {
  const host = (Array.isArray(targets) ? targets : []).filter((target) => typeof target?.source === 'string' && typeof target?.root === 'string')
  if (host.length === 0) return Array.isArray(discovered) ? discovered : []
  return host
    // 标签复用同一套（SCOPE_LABELS + 项目名），不另起一份文案。
    // projectPath 是原始工作区路径，用来补出「项目 easyStory」里的名字。
    .map((target) => ({
      id: installTargetId(target),
      source: target.source,
      label: skillScopeLabel({ source: target.source, cwd: target.projectPath }),
      scope: target.scope === 'project' ? 'project' : 'global',
      root: target.root,
      // wire 上的目标引用（source + root + projectPath）：服务端拿自己算出的目标集合核对。
      projectPath: target.projectPath,
      // 只用于**过滤**掉只读位置（服务端仍会独立判定一次，不接受载荷里的 writable）。
      writable: target.writable !== false,
      // exists=false：目录还没建。**照样可装**（宿主 importSkill 会 mkdir -p），
      // 但要在选项里说清楚，别让人以为选了个坏位置。
      exists: target.exists !== false,
      pending: target.exists === false,
    }))
    // 展示顺序：**全局在前、项目在后**（用户级是默认视角，与作用域药丸同一套语义），
    // 组内按宿主 rank。这是**面板的**呈现顺序，与宿主返回的顺序（纯 rank）故意不同：
    // host 的 rank 是「谁被优先采纳」，不是「用户先看到谁」。
    .sort((left, right) => {
      if (left.scope !== right.scope) return left.scope === 'global' ? -1 : 1
      return sourceRank(left.source) - sourceRank(right.source)
    })
}

/**
 * 区分「宿主没提供这个接口」与「上游失败」。
 *
 * 为什么必须分开：新版面板在老宿主进程上跑时，`skillHubSearch` 这个 endpoint 根本不存在，
 * wire 直接 404。把它显示成「skillhub.cn 不可用」是**误报**——上游一次都没被访问过，
 * 用户会去查网络/上游，而真正要做的是重启宿主加载新版插件。
 *
 * 判据取自 wire 的实际形状（真机抓到过）：
 *   client api: skillsManager/skillHubSearch failed: transport failure for
 *   /api/skillsManager/skillHubSearch: HTTP 404
 * 也就是「transport failure」/「HTTP 404」这两个网关用词。这里没有更好的办法：
 * 网关不暴露能力自省（没有 methods() 之类的公开面），所以只能按这两个标记分类。
 * 分类错了最坏只是措辞不对（两条路径都不会假装成功）。
 *
 * @param {string} message - callSkills 返回的 error 原文。
 * @returns {'missing' | 'upstream'}
 */
function classifyHubError(message) {
  const text = String(message || '');
  return /transport failure|HTTP 404/i.test(text) ? 'missing' : 'upstream';
}

const McpMarketView = ({ call, busy, setBusy, onInstalled, scope, scopeName, scopeOptions, onScope, knownNames }) => {
  const isWorkspace = scope !== 'global' && scope !== undefined;
  const loadGeneration = useRef(0);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  // 错误卡片带**来源**而不是一句通用标题：这个面板里三种动作（读目录 / 安装 / 移除）都会往这里
  // 写，一律写成「读取目录失败」时，一次移除失败看起来像目录坏了（真机就是这么误导的），
  // 旁边那个「重试」其实只是重新读一次目录，跟用户想重试的那件事也不是同一件。
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('default');
  const [onlyKeyless, setOnlyKeyless] = useState(false);

  // ⚠️ 目录的重载键必须是「作用域 + 该作用域当前的 serverName 集合」，不能只是「是不是项目」。
  // 真机实测两处都错在这一条上：
  //   1) 全局 ↔ 项目：`servers` 是**异步**到的。切过去的那一帧目录已经重载、而名字还是上一
  //      个作用域的，于是全局装过的条目被算成「本项目已配置」（实测显示「已配置 9 个」
  //      并给 9 个「移除」按钮，而那个项目一条配置都没有）。
  //   2) 项目 ↔ 项目：isWorkspace 不变 → loadCatalog 身份不变 → **目录根本不重载**，
  //      卡片停在上一个项目的已配置状态。
  // 把名字集合压成一个字符串进依赖，两处一起解决：名字到位后自动重算一次，
  // 而字符串相同就不会因为数组换了引用而空转。
  const knownNamesKey = (Array.isArray(knownNames) ? knownNames : [])
    .map((server) => server?.serverName)
    .filter((name) => typeof name === 'string' && name !== '')
    .sort()
    .join('|');

  const loadCatalog = useCallback(async () => {
    const generation = ++loadGeneration.current;
    setLoading(true); setError('');
    try {
      const res = await call('builtins');
      if (!res?.ok) throw new Error(res?.error || t('读取 MCP 目录失败'));
      if (generation !== loadGeneration.current) return;
      // 项目作用域：「已配置」必须以**这个项目自己的配置**为准，不能用 Host 那份
      // 全局 effective 的标记（理由与后果见 catalogForScope 的注释）。
      setCatalog(catalogForScope(res.builtins, { isWorkspace, knownNames }));
    } catch (e) {
      if (generation === loadGeneration.current) setError({ title: t('读取目录失败'), message: String(e?.message || e) });
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [call, isWorkspace, knownNames, knownNamesKey]);
  // 挂载即加载（市场模式才渲染这个组件），换作用域重新加载一遍：已配置状态是按作用域算的。
  useEffect(() => {
    setCatalog([]); setError(null);
    loadCatalog();
  }, [loadCatalog]);

  // 分类按目录里的首次出现顺序排列；标签取条目自带的 categoryLabel。
  const categoryCounts = new Map();
  for (const item of catalog) {
    const key = item.category || 'other';
    const entry = categoryCounts.get(key) || { label: pickCatalogText(item, 'categoryLabel') || key, count: 0 };
    entry.count += 1;
    categoryCounts.set(key, entry);
  }
  const categories = [...categoryCounts.keys()];

  // 「需不需要密钥」是用户最先要判断的事之一：免密的可以立刻装来试，要 Key 的得先申请。
  const needsKey = (item) => Array.isArray(item.envKeys) && item.envKeys.length > 0;
  // 连接参数（Redis 的 HOST/PORT、ClickHouse 的 HOST/USER）不是密钥，但同样要用户先准备，
  // 所以「只要免密钥」这个筛选项把它们也排除掉——否则 Redis 会被当成装上就能用。
  const needsConfig = (item) => Array.isArray(item.configKeys) && item.configKeys.length > 0;
  // 参数里含 <占位符>：装完要去编辑里替换，否则拿占位符当真实路径启动。
  // 占位符提示按语言挑：英文副本译了 args 里的占位符（生成器派生 placeholdersEn），
  // 没译就回落中文——宁可显示中文，也不要指着 `<仓库路径>` 让英文用户猜。
  const needsArgs = (item) => Array.isArray(item.placeholders) && item.placeholders.length > 0;
  const itemPlaceholders = (item) => (localeIsEnglish() && Array.isArray(item.placeholdersEn) && item.placeholdersEn.length ? item.placeholdersEn : item.placeholders) || [];
  const readyToRun = (item) => !needsKey(item) && !needsConfig(item) && !needsArgs(item);

  const filtered = catalog.filter((item) => {
    if (category !== 'all' && (item.category || 'other') !== category) return false;
    if (onlyKeyless && !readyToRun(item)) return false;
    if (!query.trim()) return true;
    // 两种语言都进搜索域：英文界面下用户可能按中文名找，反之亦然。
    const haystack = [item.label, item.labelEn, item.id, item.name, item.summary, item.summaryEn, item.vendor, item.vendorEn, item.access, item.accessEn]
      .filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });
  const visible = sort === 'installed'
    ? [...filtered].sort((a, b) => Number(a.installed || false) - Number(b.installed || false))
    : sort === 'name'
      ? [...filtered].sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-Hans-CN'))
      : filtered;

  const remove = async (item) => {
    setBusy(true); setError(null);
    try {
      // Host 的移除是单数 RPC、按 serverName 定位。一条目录项可能以多个名字装过（用户改过名），
      // 所以逐个移除；任一失败都如实报出来——静默跳过会让「移除」看着成功、实际留下半条配置。
      const names = item.installedAs && item.installedAs.length ? item.installedAs : [item.name];
      const notes = [];
      for (const name of names) {
        // 两个方法的 wire 形状**不同**，不能照着写成一个对象：
        //   removeWorkspaceServer 收一个 payload（wire `payload`），传对象；
        //   removeServer 收**标量 name**（wire `name`），传字符串。
        // 客户端代理按位置把实参映射到 `parameters[i].wire`（dsh-api-gateway 的
        // ClientRemote.invoke），所以 `removeServer({ name })` 到宿主就是 `{ name: { name } }`，
        // 被 name 的 String codec 拦下——真机报 `wire field "name" failed boundary validation`，
        // 「移除」永远失败（而面板把这条错误显示成「读取目录失败」，更像目录坏了）。
        const res = isWorkspace
          ? await call('removeWorkspaceServer', { wsPath: scope, name })
          : await call('removeServer', name);
        if (!res?.ok) throw new Error(res?.error || t('移除失败：{name}', { name }));
        // 宿主那句 note 里带着「还剩下几条同名条目、要重启宿主才会重连」——直接覆盖成
        // 「已移除 xxx」会把这唯一的线索丢掉，用户随后仍然看到失败日志，只会以为没删掉。
        if (typeof res.note === 'string' && res.note.trim() !== '') notes.push(res.note);
      }
      onInstalled({ note: notes.length ? notes.join('；') : t('已移除 {names}', { names: names.join(t('、')) }) });
      await loadCatalog();
    } catch (e) {
      setError({ title: t('移除失败'), message: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  };
  const install = async (ids) => {
    if (!ids || !ids.length) return;
    setBusy(true); setError(null);
    try {
      const res = isWorkspace
        ? await call('installWorkspaceBuiltins', { wsPath: scope, ids })
        : await call('installBuiltins', { ids });
      if (!res?.ok) throw new Error(res?.error || t('安装 MCP 失败'));
      onInstalled(res);
      await loadCatalog();
    } catch (e) {
      setError({ title: t('安装失败'), message: String(e?.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const installedCount = catalog.filter((item) => item.installed).length;
  const cardOf = (item) => {
    const http = item.transport === 'streamable-http';
    // 与技能面的市场卡片同一个原语（.dsh-mcp-mcard）：
    //   左边一个图标块 / 名字 + 来源 / 一句说明 / 标签 / 底栏（统计 + 动作）。
    return h('div', {
      key: item.id,
      className: 'dsh-mcp-mcard' + (item.installed ? ' installed' : ''),
    },
      h('div', { className: 'dsh-mcp-mcard-top' },
        h('div', { className: 'dsh-mcp-mcard-icon' }, h(Icon, { d: ICONS[item.installed ? 'check' : 'box'], size: 16 })),
        h('div', { className: 'dsh-mcp-mcard-main' },
          h('div', { className: 'dsh-mcp-mcard-name' }, pickCatalogText(item, 'label')),
          h('div', { className: 'dsh-mcp-mcard-meta' },
            item.vendor ? h('span', null, pickCatalogText(item, 'vendor')) : null,
            h('span', null, http ? 'streamable-http' : 'stdio'),
          ),
        ),
      ),
      h('div', { className: 'dsh-mcp-mcard-desc', title: pickCatalogText(item, 'summary') }, pickCatalogText(item, 'summary')),
      h('div', { className: 'dsh-mcp-mcard-tags' },
        item.categoryLabel ? h(Badge, null, pickCatalogText(item, 'categoryLabel')) : null,
        item.installed
          ? h(Badge, { cls: 's-on' }, t('已配置'))
          : (needsKey(item)
            ? h(Badge, null, t('需密钥'))
            : needsConfig(item)
              // 连接参数与密钥分开说：Redis / ClickHouse 是本机服务，标成「需密钥」会让人
              // 以为要去申请账号。
              ? h(Badge, null, t('需连接信息'))
              : h(Badge, { cls: 's-off' }, t('免密钥'))),
        // 项目作用域下：全局装过、但这个项目没有。说清楚而不是假装它已在这个项目里——
        // 装一份项目副本是完全合理的动作，用户需要知道「全局那份还在」。
        !item.installed && item.globallyInstalled ? h(Badge, { cls: 's-lock' }, t('全局已装')) : null,
        // 含 <占位符> 的条目（如 filesystem 的「允许访问的目录」）装完**不能直接用**：
        // 拿占位符当真实参数启动一定失败。这里如实标出来，别让用户以为装完就好了。
        needsArgs(item) ? h(Badge, { cls: 's-err' }, t('需填参数')) : null,
      ),
      h('div', { className: 'dsh-mcp-mcard-access' }, pickCatalogText(item, 'access')),
      needsArgs(item)
        ? h('div', { className: 'dsh-mcp-mcard-note' }, t('安装后需编辑，替换 {names}', { names: itemPlaceholders(item).join(t('、')) }))
        : null,
      // 把要填的变量名直接写出来。只说「需密钥」等于没说——用户知道要申请，却不知道
      // 填进哪个名字（ClickHouse 要 4 个变量，Redis 要 HOST/PORT）。
      needsKey(item) || needsConfig(item)
        ? h('div', { className: 'dsh-mcp-mcard-vars' },
            needsKey(item) ? h('span', null, t('密钥：{names}', { names: item.envKeys.join(t('、')) })) : null,
            needsConfig(item) ? h('span', null, t('连接：{names}', { names: item.configKeys.join(t('、')) })) : null,
          )
        : null,
      h('div', { className: 'dsh-mcp-mcard-foot' },
        h('span', { className: 'dsh-mcp-mcard-stat' + (needsArgs(item) ? ' err' : '') },
          item.installed
            ? t('已写入{scope}', { scope: isWorkspace ? t('本项目配置') : t('全局配置') })
            : (needsArgs(item)
              ? t('需先填参数')
              : (!item.installed && item.globallyInstalled ? t('全局已装 · 可加一份项目副本') : t('可直接安装')))),
        h('div', { className: 'dsh-mcp-mcard-actions' },
          item.installed
            ? h(Btn, { cls: 'danger sm', disabled: busy, onClick: () => remove(item), children: t('移除') })
            : h(Btn, { cls: 'primary sm', disabled: busy, onClick: () => install([item.id]), children: t('安装') }),
          item.homepage
            ? h('a', {
              className: 'dsh-mcp-btn sm',
              href: item.homepage,
              target: '_blank',
              rel: 'noreferrer',
              title: t('打开官方文档'),
              children: t('文档'),
            })
            : null,
        ),
      ),
    );
  };

  return h('div', { className: 'dsh-mcp-market-view', role: 'region', 'aria-label': t('MCP 发现市场') },
    h('div', { className: 'dsh-mcp-market-toolbar' },
      h('div', { className: 'dsh-mcp-market-head' },
        h('div', { className: 'dsh-mcp-chips', role: 'tablist', 'aria-label': t('按分类浏览') },
          h('button', {
            type: 'button', role: 'tab', 'aria-selected': category === 'all',
            className: 'dsh-mcp-chip' + (category === 'all' ? ' sel' : ''),
            onClick: () => setCategory('all'),
          }, t('全部'), h('span', { className: 'dsh-mcp-chip-count' }, catalog.length)),
          categories.map((key) => h('button', {
            key, type: 'button', role: 'tab', 'aria-selected': category === key,
            className: 'dsh-mcp-chip' + (category === key ? ' sel' : ''),
            onClick: () => setCategory(key),
          }, categoryCounts.get(key).label, h('span', { className: 'dsh-mcp-chip-count' }, categoryCounts.get(key).count))),
        ),
        h('div', { className: 'dsh-mcp-market-tools' },
          h('div', { className: 'dsh-mcp-search' },
            h(Icon, { d: ICONS.search }),
            h('input', {
              type: 'search',
              placeholder: t('搜索服务、用途或提供方…'),
              value: query,
              'aria-label': t('搜索 MCP 服务'),
              onChange: (e) => setQuery(e.target.value),
            }),
          ),
          // 「安装到」：市场模式下**唯一**的作用域入口（已安装模式用药丸，两者写同一份 state）。
          // 原型有这一项，第一版漏了——结果是「装到哪」只在脚注里用一行小字说，
          // 而用户真正需要的是在按「安装」之前能改它。
          h('label', { className: 'dsh-mcp-market-scope' },
            h('span', null, t('安装到')),
            h('select', {
              value: scope,
              'aria-label': t('安装到哪个作用域'),
              onChange: (e) => onScope(e.target.value),
            },
              ...scopeOptions.map((option) => h('option', { key: option.key, value: option.key, title: option.title }, option.label)),
            ),
          ),
        ),
      ),
    ),
    // 目录说明：装到哪里是这一屏最要紧的事实（写错作用域等于装了个用不上的服务）。
    h('div', { className: 'dsh-mcp-market-section' },
      h('b', null, t('内置 MCP 目录')),
      h('span', null, loading
        ? t('正在读取目录…')
        : t('{total} 个服务 · 已配置 {installed} 个 · 装入{scope}', { total: catalog.length, installed: installedCount, scope: isWorkspace ? t('本项目 {name}', { name: scopeName }) : t('全局配置') })),
    ),
    h('div', { className: 'dsh-mcp-market-filters' },
      h('label', null, t('排序'),
        h('select', { value: sort, onChange: (e) => setSort(e.target.value), 'aria-label': t('排序方式') },
          h('option', { value: 'default' }, t('默认')),
          h('option', { value: 'installed' }, t('未配置优先')),
          h('option', { value: 'name' }, t('名称')),
        ),
      ),
      h('label', null,
        h('input', { type: 'checkbox', checked: onlyKeyless, onChange: (e) => setOnlyKeyless(e.target.checked) }),
        t('只要免密钥'),
      ),
      h('span', null, t('显示 {visible} / {total}', { visible: visible.length, total: catalog.length })),
    ),
    h('div', { className: 'dsh-mcp-grid' },
      error
        ? h(Notice, {
          tone: 'err', icon: 'warn', title: error.title, children: error.message,
          actions: [h(Btn, { key: 'retry', cls: 'sm', disabled: loading || busy, onClick: loadCatalog, children: loading ? t('重试中…') : t('重试') })],
        })
        : null,
      !error && !loading && !visible.length
        ? h('div', { className: 'dsh-mcp-market-empty' }, catalog.length ? t('没有匹配的服务，换个关键词或分类试试') : t('目录是空的'))
        : null,
      visible.map(cardOf),
    ),
    h('div', { className: 'dsh-skills-note' },
      h('b', null, t('收录 ≠ 背书。')),
      t('内置目录只保证「命令与协议形态已核对」，不审查服务端行为。装上之前请确认来源可信——尤其是需要密钥或连接信息的那些。'),
    ),
  );
};

const sourceImportNames = (row) => (row.entries || []).filter((entry) => !entry.error).map((entry) => entry.name);
// 只在界面上提示「这条来源带了会被掩码的字段」。具体值一律留在 Host：Host 只给字段名。
const sourceMaskedFields = (row) => [...new Set((row.entries || []).flatMap((entry) => entry.maskedFields || []))];
// 环境变量名不算秘密（值才是），但缺值会让导入后的那个位置变成空字符串，得先说。
const sourceMissingEnv = (row) => [...new Set((row.entries || []).flatMap((entry) => entry.missingEnv || []))];

const JsonImportModal = ({ open, onClose, call, busy, setBusy, onImported, scope, scopeName }) => {
  const isWorkspace = scope !== 'global' && scope !== undefined;
  const [text, setText] = useState('');
  const [mode, setMode] = useState('merge');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [sources, setSources] = useState([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState('');
  const [source, setSource] = useState(null);
  const [sourcePreview, setSourcePreview] = useState(null);
  const clearSource = () => { setSource(null); setSourcePreview(null); };
  // 项目标签同时决定「扫哪些项目级来源」与「写到哪个项目」，与粘贴路径的分工一致。
  // 注意：这个对象每次渲染都是新的，**不能**进 useCallback 的依赖——那会让 loadSources
  // 每渲染换一次身份、扫描无限重跑。loadSources 里按 isWorkspace/scope 原值重建一份。
  const scopePayload = isWorkspace ? { wsPath: scope } : {};
  const loadSources = useCallback(async () => {
    setSourcesLoading(true); setSourcesError('');
    try {
      const res = await call('scanImportSources', isWorkspace ? { wsPath: scope } : {});
      if (!res?.ok) throw new Error(res?.error || t('读取本机客户端配置失败'));
      setSources(res.sources || []);
    } catch (e) { setSourcesError(String(e?.message || e)); }
    finally { setSourcesLoading(false); }
  }, [call, isWorkspace, scope]);
  useEffect(() => { if (open) { setPreview(null); setError(''); } }, [open]);
  useEffect(() => {
    if (!open) { setSources([]); setSourcesError(''); clearSource(); return; }
    loadSources();
  }, [open, loadSources]);
  if (!open) return null;
  // 选中来源后，来源导入优先于粘贴内容：两者不会同时在生效状态。
  const pickSource = async (row) => {
    const names = sourceImportNames(row);
    if (row.error || !names.length) { setError(row.error || t('这条配置里没有可导入的 MCP')); return; }
    setBusy(true); setError(''); setPreview(null); clearSource();
    try {
      const res = await call('previewImportSource', { sourceId: row.sourceId, scope: row.scope, names, ...scopePayload });
      if (!res?.ok) throw new Error(res?.error || t('预览失败'));
      setSource(row); setSourcePreview(res);
    } catch (e) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  };
  const runPreview = async () => {
    setBusy(true); setError(''); clearSource();
    try {
      const res = isWorkspace
        ? await call('previewWorkspaceImport', { wsPath: scope, json: text, mode })
        : await call('previewImport', { json: text, mode });
      if (!res?.ok) throw new Error(res?.error || t('JSON 解析失败'));
      setPreview(res);
    } catch (e) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  };
  // 两条导入流程（粘贴 / 本机来源）只有「确认文案」与「调哪个 RPC」不同：把
  // 确认 → busy → RPC → 报错或收尾的骨架收在一处，避免两处各写一遍、改一处漏一处。
  const submitImport = async (confirmMessage, run) => {
    if (confirmMessage && !confirm(confirmMessage)) return;
    setBusy(true); setError('');
    try {
      const res = await run();
      if (!res?.ok) throw new Error(res?.error || t('导入失败'));
      onImported(res);
      onClose();
    } catch (e) { setError(String(e?.message || e)); }
    finally { setBusy(false); }
  };
  const replaceWarning = t('替换会删除{scope}', { scope: isWorkspace ? t('该项目') : t('当前 Web profile') });
  const applyImport = async () => {
    if (!preview) return runPreview();
    // 同名冲突不再让整批失败：Host 会跳过那几条并在预览的提示里写明，用户按需处理。
    return submitImport(
      mode === 'replace' ? t('{warning}中未出现在 JSON 里的 MCP。确认继续？', { warning: replaceWarning }) : '',
      () => (isWorkspace
        ? call('importWorkspaceJson', { wsPath: scope, json: text, mode })
        : call('importJson', { json: text, mode })),
    );
  };
  const applySourceImport = async () => {
    if (!source || !sourcePreview) return;
    return submitImport(
      mode === 'replace' ? t('{warning}中未出现在这份来源里的 MCP。确认继续？', { warning: replaceWarning }) : '',
      // 送出的是来源标识 + 条目名 + 预览时的内容指纹；路径与凭据都留在 Host 重算。
      () => call('importSource', {
        sourceId: source.sourceId,
        scope: source.scope,
        names: sourceImportNames(source),
        mode,
        contentHash: sourcePreview.contentHash,
        ...scopePayload,
      }),
    );
  };
  const activePreview = sourcePreview?.preview || preview;
  const summary = activePreview ? [
    t('新增：{names}', { names: activePreview.added?.join(', ') || t('无') }),
    t('更新：{names}', { names: activePreview.updated?.join(', ') || t('无') }),
    mode === 'replace' ? t('移除：{names}', { names: activePreview.removed?.join(', ') || t('无') }) : null,
    // 被跳过的同名条目（其他配置层占用、或来源里重名）由 Host 放进 warnings，这里只渲染一处，
    // 免得同一件事既显示"冲突"又显示"提示"。
    ...(activePreview.warnings || []).map((warning) => t('提示：{warning}', { warning })),
  ].filter(Boolean).join('\n') : '';
  // 来源列表已按当前层过滤（Host 侧保证）：全局标签只有全局来源，项目标签只有该项目的来源，
  // 所以行上不需要「（项目）」后缀，也不再需要用户自己判断「这一行会导到哪儿去」。
  const layerLabel = isWorkspace ? t('项目级') : t('全局');
  const layerHint = isWorkspace
    ? t('没检测到这个项目的项目级 MCP 配置（.mcp.json / .codex/config.toml / .pi/mcp.json / opencode.json 等），可在下面手动粘贴')
    : t('没检测到本机客户端的全局 MCP 配置（~/.claude.json / ~/.codex/config.toml / ~/.config/opencode/opencode.json 等），可在下面手动粘贴');
  return h('div', { className: 'dsh-mcp-overlay', onClick: (e) => e.target === e.currentTarget && onClose() },
    h(Dialog, { label: t('导入 MCP'), onClose },
      h('h3', null, t('导入 MCP{scope}', { scope: isWorkspace && scopeName ? t('（{name}）', { name: scopeName }) : '' })),
      h('div', { className: 'dsh-mcp-field dsh-mcp-source-box' },
        h('label', null, t('从本机客户端导入{layer}配置（只读，不修改它们的文件）', { layer: layerLabel })),
        sourcesLoading ? h('div', { className: 'dsh-mcp-source-detail' }, t('正在扫描本机客户端配置…')) : null,
        sourcesError ? h('div', { className: 'dsh-mcp-d-err' }, sourcesError) : null,
        !sourcesLoading && !sourcesError && !sources.length
          ? h('div', { className: 'dsh-mcp-source-detail' }, layerHint)
          : null,
        sources.length ? h('div', { className: 'dsh-mcp-source-list' }, sources.map((row) => {
          const names = sourceImportNames(row);
          const masked = sourceMaskedFields(row);
          const missingEnv = sourceMissingEnv(row);
          const detail = row.error || (names.length ? t('{count} 个 MCP：{names}', { count: names.length, names: names.join(', ') }) : t('没有可导入的 MCP'));
          return h('button', {
            key: row.key,
            type: 'button',
            className: 'dsh-mcp-source-row' + (source?.key === row.key ? ' sel' : ''),
            disabled: busy || !!row.error || !names.length,
            title: row.displayPath,
            onClick: () => pickSource(row),
          },
            h('span', { className: 'dsh-mcp-source-head' },
              h('span', { className: 'dsh-mcp-source-name' }, row.label),
              h('code', { className: 'dsh-mcp-source-path' }, row.displayPath),
            ),
            h('span', { className: 'dsh-mcp-source-detail' }, detail),
            masked.length ? h('span', { className: 'dsh-mcp-source-note' }, t('含需掩码字段：{names}（导入后在详情页可用眼睛查看）', { names: masked.join(t('、')) })) : null,
            missingEnv.length ? h('span', { className: 'dsh-mcp-source-warn' }, t('环境变量未设置：{names}（导入后该处会得到空值）', { names: missingEnv.join(t('、')) })) : null,
            row.warnings?.length ? h('span', { className: 'dsh-mcp-source-warn' }, t('{count} 条提示，导入时逐条列出', { count: row.warnings.length })) : null,
          );
        })) : null,
      ),
      h('div', { className: 'dsh-mcp-field' },
        h('label', null, t('或粘贴 JSON：支持 Claude/Cursor/Cline/Roo 的 mcpServers、VS Code 的 servers，以及单个 MCP 对象')),
        h('textarea', { className: 'dsh-mcp-import-json', value: text, onChange: (e) => { setText(e.target.value); setPreview(null); clearSource(); }, placeholder: '{\n  "mcpServers": {\n    "example": { "command": "npx", "args": ["-y", "example-mcp"] }\n  }\n}' }),
      ),
      h('div', { className: 'dsh-mcp-radio-row' },
        h('label', { className: mode === 'merge' ? 'sel' : '' }, h('input', { type: 'radio', checked: mode === 'merge', onChange: () => { setMode('merge'); setPreview(null); } }), t('合并（同名更新）')),
        h('label', { className: mode === 'replace' ? 'sel' : '' }, h('input', { type: 'radio', checked: mode === 'replace', onChange: () => { setMode('replace'); setPreview(null); } }), isWorkspace ? t('替换该项目') : t('替换当前 Profile')),
      ),
      summary ? h('div', { className: 'dsh-mcp-card dsh-mcp-import-preview' }, summary) : null,
      error ? h('div', { className: 'dsh-mcp-d-err' }, error) : null,
      h('div', { className: 'dsh-mcp-modal-actions' },
        h(Btn, { onClick: onClose, children: t('取消') }),
        source ? h(Btn, { onClick: () => { clearSource(); setError(''); }, disabled: busy, children: t('取消选择来源') }) : null,
        source
          ? h(Btn, { cls: 'primary', onClick: applySourceImport, disabled: busy || !sourcePreview, children: busy ? t('导入中…') : t('确认从来源导入') })
          : h(Btn, { onClick: runPreview, disabled: busy || !text.trim(), children: busy ? t('解析中…') : t('预览') }),
        source ? null : h(Btn, { cls: 'primary', onClick: applyImport, disabled: busy || !text.trim(), children: preview ? t('确认导入') : t('解析并预览') }),
      ),
    ),
  );
};

// ── 导出项目配置 ─────────────────────────────────────────────────────────
// 只读快照，写入目标不在这里发生：拿到 JSON 的用户可以自己决定放进哪个工作区、或备份起来。
// 与「复制到…」的分工：这个功能把配置**给你**（可跨机器、可分享、可存档），凭据因此会经过浏览器；
// 同机搬运不需要这一点，用复制即可（那条路凭据不出 Host）。
const WorkspaceExportModal = ({ open, onClose, call, scope, scopeName }) => {
  const [state, setState] = useState({ phase: 'loading' });
  const [note, setNote] = useState('');
  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setState({ phase: 'loading' });
    setNote('');
    (async () => {
      try {
        const res = await call('exportWorkspaceJson', { wsPath: scope });
        if (cancelled) return;
        if (!res?.ok) throw new Error(res?.error || t('导出失败'));
        setState({ phase: 'ready', data: res });
      } catch (e) {
        if (!cancelled) setState({ phase: 'error', error: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [open, call, scope]);
  if (!open) return null;
  const data = state.phase === 'ready' ? state.data : null;
  // excluded 可能缺席（HMR 期间新旧代次短暂重叠）：只读它自己的字段，不让一次 undefined
  // 把整个面板打崩——面板崩了用户连重载都点不到。
  const excluded = data && Array.isArray(data.excluded) ? data.excluded : [];
  const json = data ? data.json : '';
  const download = () => {
    const filename = exportFileName(data.name);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setNote(t('已开始下载 {filename}', { filename }));
    } catch (e) {
      setNote(t('下载失败：{error}（可改用「复制 JSON」）', { error: String(e?.message || e) }));
    }
  };
  return h('div', { className: 'dsh-mcp-overlay', onClick: (e) => e.target === e.currentTarget && onClose() },
    h(Dialog, { label: t('导出项目 MCP'), onClose },
      h('h3', null, t('导出项目 MCP{scope}', { scope: scope !== 'global' && scopeName ? t('（{name}）', { name: scopeName }) : '' })),
      state.phase === 'loading' ? h('div', { className: 'dsh-mcp-source-detail' }, t('正在读取项目配置…')) : null,
      state.phase === 'error' ? h('div', { className: 'dsh-mcp-d-err' }, state.error) : null,
      data ? h(React2.Fragment, null,
        h('div', { className: 'dsh-mcp-field' },
          h('label', null, t('共 {count} 个 MCP{suffix}', { count: data.count, suffix: excluded.length ? t('，含 exclude（{names}）', { names: excluded.join(t('、')) }) : '' })),
          h('textarea', { className: 'dsh-mcp-import-json', readOnly: true, value: json, onFocus: (e) => e.target.select() }),
        ),
        h('div', { className: 'dsh-mcp-log warn' }, t('这是完整配置：字面写死的凭据（URL 里的 token、字面 header / env 值）会原样出现在这里，请按密钥对待。用 ${VAR} 引用的位置保持引用写法，不会被解析成明文。')),
        h('div', { className: 'dsh-mcp-source-detail' }, t('格式与 .dsh/mcp.json 一致：可以直接放进目标工作区的 .dsh/mcp.json，或用「导入 MCP」粘贴回来（粘贴只读取 mcpServers，exclude 需要手动设）。')),
      ) : null,
      note ? h('div', { className: 'dsh-mcp-source-detail' }, note) : null,
      h('div', { className: 'dsh-mcp-modal-actions' },
        h(Btn, { onClick: onClose, children: t('关闭') }),
        data ? h(Btn, { onClick: () => copyText(json).then((ok) => setNote(ok ? t('已复制 JSON 到剪贴板') : t('复制失败，请手动全选复制'))), children: t('复制 JSON') }) : null,
        data ? h(Btn, { cls: 'primary', onClick: download, children: t('下载文件') }) : null,
      ),
    ),
  );
};

// ── 延迟加载参数（C2）────────────────────────────────────────────────────
//
// 面板是这三个数字**唯一的解释处**：数值本身没有意义，「这个数管什么、改大改小会怎样」才是
// 用户决定动不动它时要看的（证据见 .tasks/mcp-tool-search/TUNING-DECISIONS.md 的 F4/Q2/Q4）。
// 所以每个字段的标签旁有一个 ⓘ 标记，鼠标移上去用**大白话**说明它的作用——不摆"33%"、
// "schema 体积"这种行话：能看懂的人本来就会自己调，需要说明的正是看不懂的那批。
//
// 保存是**一次 RPC**：Host 把值写进 profile patch 的 `config.toolSearch`，然后在运行中的
// 进程里重装运行时（工具定义里的上限跟着变）。面板不自己拼配置，也不假设"写盘即生效"——
// patch 文件不会被热加载，这一点在 test/real-host-loader 里用真 loader 钉着。
//
// ⚠️ 表里存**中文原文**（= EN_DICT 的键），翻译发生在渲染点 t(field.label)：在这里写 t()
// 会把语言冻在 bundle 加载那一刻（i18n 用例里那组真机缺陷就是它）。
// 参数说明标记（ⓘ）：鼠标移上去用大白话说清这个数字管什么。
// 用**原生 `title`**而不是自绘 tooltip：面板里已经有浮层裁切、层级与主题三样要跟宿主同步的
// 东西，为一个说明再养一套不划算。同一段文字同时给 `aria-label` + `tabIndex`——读屏与键盘
// 也能拿到（触屏没有 hover，`title` 不出现，那条路只能靠 aria）。
const HintMarker = ({ text }) => h('span', {
  className: 'dsh-mcp-hint',
  title: text,
  'aria-label': text,
  tabIndex: 0,
}, h(Icon, { d: ICONS.info, size: 12 }));

// 说明一律一句话——那块地方小，`title` 该回答"这个数字管什么"，不是放一篇论文。
// ── 工具搜索（ToolSearch）：一个入口，两件事 ─────────────────────────────
//
// ① 工具：内置与其他插件的工具逐个选「常驻 / 按需」，默认常驻。
//    MCP 的启停与「延迟 / 全量」在左侧列表里，这里不重复。
// ② 搜索参数：一次返回几条、目录上限、已发现上限（原先单独的「延迟参数」并到了这里）。
/**
 * 目录上限开关打开时的**建议起点**，不是默认值：默认完全不限制（服务端
 * `DEFAULTS.maxCatalogChars = undefined`）。12,500 有实测依据——456 个延迟工具只列名字约
 * 11,690 字符，等于"花今天的钱"。它同时是输入框的 placeholder，两者必须是同一个数。
 */
const CATALOG_CHARS_SUGGESTION = 12500

const TOOL_SEARCH_CHOICES = [
  { id: 'resident', label: '常驻' },
  { id: 'deferred', label: '按需' },
]

/** 已知宿主内置工具的中文短名。未知工具只显示名字，不硬造翻译。 */
const BUILTIN_LABELS = {
  tool_search: '工具搜索入口',
  working_directory: '切换工作目录',
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  glob: '查找文件',
  grep: '搜索文件内容',
  bash: '运行命令',
  pwsh: '运行命令',
  run_code: '运行代码',
  read_image: '查看图片',
  ask_user_question: '向用户提问',
  task: '任务列表',
  todo_write: '待办清单',
  web_search: '网页搜索',
  web_fetch: '抓取网页',
  list_mcp_resources: '列出 MCP 资源',
  list_mcp_resource_templates: '列出资源模板',
  read_mcp_resource: '读取 MCP 资源',
  skill: '加载技能',
  present: '交付文件',
  job_list: '列出后台任务',
  job_output: '读取任务输出',
  job_kill: '停止后台任务',
  send_message: '给 Agent 发消息',
  subagent: '委派子任务',
  subagent_fork: '带上下文委派',
  list_agents: '列出子 Agent',
  interrupt_agent: '中断子 Agent',
  workflow: '编排多 Agent',
  get_goal: '查看当前目标',
  create_goal: '创建持续目标',
  update_goal: '更新目标',
  exit_plan_mode: '退出计划模式',
  schedule_create: '创建定时提醒',
  schedule_list: '列出定时提醒',
  schedule_delete: '删除定时提醒',
  schedule_update: '修改定时提醒',
  list_pages: '列出浏览器页面',
  navigate_page: '打开网页',
  take_screenshot: '网页截图',
  take_snapshot: '读取页面结构',
  click: '点击页面元素',
  fill: '填写页面输入',
  hover: '悬停页面元素',
  press_key: '按下按键',
  evaluate_script: '在页面执行脚本',
  new_page: '新建浏览器页面',
  close_page: '关闭浏览器页面',
  resize_page: '调整页面尺寸',
  select_page: '切换浏览器页面',
  wait_for: '等待页面条件',
  list_console_messages: '读取控制台消息',
  list_network_requests: '读取网络请求',
  get_network_request: '查看单个网络请求',
  performance_start_trace: '开始性能录制',
  performance_stop_trace: '结束性能录制',
}

const toolLabel = (row) => (row.kind === 'builtin' && BUILTIN_LABELS[row.name]) || row.name

/**
 * 一个工具 = 一行：**宿主原名**（等宽，正常显示）+ 中文短名标记 + 策略下拉。
 *
 * 名字必须用宿主原名：`working_directory`、`job_output` 是可搜索、可与日志/文档对上号的
 * 唯一标识；把它换成中文标题后，用户在别处看到英文名就找不到对应行了。
 * 中文短名是**标记**（说明这行大概是什么工具），不是标题；未知工具没有标记，
 * 退回到宿主的 description 标记（ⓘ），不硬造翻译。
 */
/**
 * 一个工具 = 一行：宿主原名（等宽）+ 中文短名标记 + 常驻/按需。
 *
 * 这里没有第三态：工具页只管全局。内置与插件工具在所有项目里是同一批宿主工具，
 * 按项目再分一层只会让「换个项目就变回去」看起来像丢配置。MCP 服务器粒度的
 * 开关在 MCP 页面，不在这里重复。
 */
const toolLoadingRow = (row, draft, onChange, { saving = false } = {}) => {
  const alias = row.kind === 'builtin' ? BUILTIN_LABELS[row.name] : ''
  const policy = draft[row.name] || row.policy || 'resident'
  // 改动高亮：草稿值与已保存值不同 = 这张卡要进「保存」的承诺里。用户改完往下滚之前
  // 能在原地看到「这张卡不一样了」，而不是滚到底栏才发现改了几张。
  const changed = (row.policy || 'resident') !== policy
  return h('div', { className: 'dsh-mcp-tool-row' + (changed ? ' is-changed' : ''), key: row.name },
    h('div', { className: 'dsh-mcp-tool-info' },
      h('span', { className: 'dsh-mcp-tool-name', title: row.name }, row.name),
      alias ? h('span', { className: 'dsh-mcp-tool-alias' }, alias) : null,
      row.description ? h(HintMarker, { text: row.description }) : null,
    ),
    h('span', { className: 'dsh-mcp-tool-pick', role: 'group', 'aria-label': (alias || row.name) + ' · ' + t('加载方式') },
      ...TOOL_SEARCH_CHOICES.map((choice) => h('button', {
        key: choice.id,
        type: 'button',
        className: choice.id === 'resident' ? 'is-resident' : 'is-deferred',
        'aria-pressed': policy === choice.id,
        disabled: saving,
        onClick: () => onChange(row.name, choice.id),
      }, t(choice.label))),
    ),
    // 说明只作辨认线索：一行截断、全文留在 title。决定「加载方式」不需要读整段 schema 描述，
    // 铺开只会让 34 张卡高低不一（density 用例钉着双列网格，不齐整的双列比单列更乱）。
    row.description ? h('div', { className: 'dsh-mcp-tool-desc', title: row.description }, row.description) : null,
  )
}

/** 搜索参数三项：与原来的「延迟参数」同一套字段与校验，只是搬进同一个弹窗。 */
const SEARCH_PARAM_FIELDS = [
  { key: 'maxResults', label: '一次最多返回几个', about: '搜一次最多拿回几条。调小可能漏掉要用的那个，调大每次多占一点上下文。默认 10。' },
  { key: 'maxDiscovered', label: '同时记住几个已发现的工具', about: '模型搜索出来的工具同时保留几个，超了先淘汰最久没用过的。默认 20。' },
]

const ToolLoadingModal = ({ open, onClose, call, onSaved, inline = false }) => {
  const [loaded, setLoaded] = useState(null)
  const [toolDraft, setToolDraft] = useState({})
  const [params, setParams] = useState({})
  const [savedParams, setSavedParams] = useState({})
  const [limitOn, setLimitOn] = useState(false)
  const [error, setError] = useState('')
  const [searchError, setSearchError] = useState('')
  const [searchLoaded, setSearchLoaded] = useState(false)
  const [searchSaved, setSearchSaved] = useState(false)
  // 保存后显示**宿主原话**（`note`）：它区分"已写入并立即生效"与"已写入，重启后生效"。
  // 写死一句"参数已保存"就把这个区别盖掉了，而那正是 persisted/live 契约要说的事。
  const [savedNotice, setSavedNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [toolQuery, setToolQuery] = useState('')
  const [toolFilter, setToolFilter] = useState('all')
  const readPolicy = () => call('toolLoadingSettings')
  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLoaded(null)
    setError('')
    setSearchError('')
    setSearchLoaded(false)
    setSearchSaved(false)
    setParams({})
    setLimitOn(false)
    setSavedParams({})
    ;(async () => {
      try {
        const [res, search] = await Promise.all([readPolicy(), call('toolSearchSettings')])
        if (cancelled) return
        if (!res?.ok) throw new Error(res?.error || t('读取失败'))
        setToolDraft({ ...(res.policy?.tools || {}) })
        setLoaded(res)
        if (search?.ok && search.settings) {
          setSearchLoaded(true)
          setParams({ ...search.settings })
          setSavedParams({ ...search.settings })
          setLimitOn(search.settings.maxCatalogChars !== undefined)
        } else {
          setSearchError(search?.error || t('读取失败'))
        }
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e))
      }
    })()
    return () => { cancelled = true }
  }, [open, call])
  if (!open) return null
  const entriesKey = (tools) => JSON.stringify(Object.entries(tools || {}).sort(([a], [b]) => a.localeCompare(b)))
  const dirty = loaded !== null && entriesKey(toolDraft) !== entriesKey(loaded.policy?.tools)
  const paramKey = (value, limited) => JSON.stringify([
    ...SEARCH_PARAM_FIELDS.map((field) => String(value[field.key] ?? '')),
    limited ? String(value.maxCatalogChars ?? '') : null,
  ])
  const paramsChanged = searchLoaded && paramKey(params, limitOn) !== paramKey(savedParams, savedParams.maxCatalogChars !== undefined)
  const setTool = (name, value) => setToolDraft((prev) => {
    const next = { ...prev }
    const original = loaded?.tools?.find((row) => row.name === name)
    if (value === original?.policy && !Object.hasOwn(loaded.policy?.tools || {}, name)) delete next[name]
    else next[name] = value
    return next
  })
  const discard = () => {
    setToolDraft({ ...(loaded.policy?.tools || {}) })
    setParams({ ...savedParams })
    setLimitOn(savedParams.maxCatalogChars !== undefined)
    setError('')
    setSearchSaved(false)
  }
  const submit = async () => {
    if (saving || loaded === null || (inline && !dirty && !paramsChanged)) return
    setSaving(true)
    // 本次保存要显示的那句话（宿主原话优先）。同一个值既给面板内联提示，也给上层 flash，
    // 两处显示同一句话——否则面板说"重启后生效"、外面弹"已保存"，等于自己拆自己的台。
    let notice = ''
    setError('')
    setSearchError('')
    try {
      // 全部输入先校验，避免无效参数使工具策略先落盘。
      const settings = {}
      if (paramsChanged) {
        for (const field of SEARCH_PARAM_FIELDS) {
          const raw = String(params[field.key] ?? '').trim()
          if (raw === '') continue
          const value = Number(raw)
          if (!Number.isSafeInteger(value) || value < 1) throw new Error(t('搜索参数需要正整数'))
          settings[field.key] = value
        }
        if (limitOn) {
          const value = Number(String(params.maxCatalogChars ?? '').trim())
          if (!Number.isSafeInteger(value) || value < 1) throw new Error(t('目录上限需要一个正整数'))
          settings.maxCatalogChars = value
        }
      }
      // 两个配置使用各自 RPC。每项成功后立即确认该项的基线，后项失败仍保留已保存事实。
      if (dirty) {
        const policy = { ...loaded.policy, groups: { ...(loaded.policy?.groups || {}) }, tools: { ...toolDraft } }
        if (policy.mode === 'legacy') delete policy.mode
        const res = await call('updateToolLoadingSettings', { policy })
        if (!res?.ok) throw new Error(res?.error || t('保存失败'))
        notice = res.note || ''
        setSavedNotice(notice)
        const savedPolicy = res.policy || policy
        setLoaded({ ...loaded, policy: savedPolicy,
          tools: (loaded.tools || []).map((row) => ({ ...row, policy: savedPolicy.tools?.[row.name] || row.policy })) })
        setToolDraft({ ...(savedPolicy.tools || {}) })
      }
      if (paramsChanged) {
        const res = await call('updateToolSearchSettings', { settings })
        if (!res?.ok) throw new Error(res?.error || t('保存失败'))
        const saved = { ...(res.settings || settings) }
        setParams(saved)
        setSavedParams(saved)
        setLimitOn(saved.maxCatalogChars !== undefined)
        setSearchSaved(true)
        if (res.note) { notice = res.note; setSavedNotice(res.note) }
      }
      // ③ 回读策略（参数保存后服务端可能规范化）
      const fresh = await readPolicy()
      if (!fresh?.ok) throw new Error(t('保存已完成，但重新读取失败：{error}', { error: fresh?.error || t('读取失败') }))
      setToolDraft({ ...(fresh.policy?.tools || {}) })
      setLoaded(fresh)
      onSaved?.(fresh, notice || undefined)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setSaving(false)
    }
  }
  const setParam = (key, value) => {
    if (!searchLoaded) return
    setParams((prev) => ({ ...prev, [key]: value }))
    setSearchSaved(false)
  }
  // 单一数据源：这一页只认 `toolLoadingSettings().tools` 这一份行数据。
  // 曾经这里把 `kind === 'mcp'` 的行整类排除（"MCP 去 MCP 页管"），可是 MCP 页那个开关读的是
  // 旧的服务器级 `defer`，统一策略下的组级/单工具设置在那儿看不见——于是被延迟的 MCP 工具
  // 在工具页被丢掉、在 MCP 页显示"全量"，两边都说没事。现在 MCP 行照样进这张表，
  // 计数也从同一份 rows 派生，不再"概览数一套、列表数另一套"。
  const manageable = (loaded?.tools || []).filter((row) => row.protected !== true)
  const policyOf = (row) => toolDraft[row.name] || row.policy || 'resident'
  const residentCount = manageable.filter((row) => policyOf(row) === 'resident').length
  const deferredCount = manageable.length - residentCount
  const changedCount = manageable.filter((row) => (row.policy || 'resident') !== policyOf(row)).length
  const protectedTools = (loaded?.tools || []).filter((row) => row.protected === true)
  const needle = toolQuery.trim().toLowerCase()
  const visibleTools = manageable.filter((row) => (toolFilter === 'all' || policyOf(row) === toolFilter)
    && (!needle || [row.name, toolLabel(row), row.description || ''].join(' ').toLowerCase().includes(needle)))
  // 搜索参数提到顶部：它们是「工具怎么加载」的另一半，不是高级选项。
  // 一个保存动作，只调用实际发生改动的配置接口。
  const parameters = h('section', { className: 'dsh-mcp-tool-params' },
    h('div', { className: 'dsh-mcp-tool-params-head' },
      h('h4', { className: 'dsh-mcp-tool-params-title' }, t('搜索参数')),
    ),
    h('div', { className: 'dsh-mcp-tool-params-grid' },
      ...SEARCH_PARAM_FIELDS.map((field) => h('label', { className: 'dsh-mcp-tool-param', key: field.key },
        h('span', { className: 'dsh-mcp-tool-param-label' }, t(field.label), h(HintMarker, { text: t(field.about) })),
        h('input', { type: 'number', min: 1, step: 1, disabled: !searchLoaded || saving,
          value: params[field.key] ?? '', onChange: (e) => setParam(field.key, e.target.value) }),
      )),
      h('div', { className: 'dsh-mcp-tool-param' },
        h('span', { className: 'dsh-mcp-tool-param-label' }, t('限制目录大小'), h(HintMarker, { text: t('目录默认全部列出，只有工具特别多时才需要设上限。') })),
        h('div', { className: 'dsh-mcp-tool-param-inline' },
          h(Toggle, { on: limitOn, disabled: !searchLoaded || saving, label: t('限制目录大小'), onChange: (next) => {
            if (!searchLoaded) return
            setLimitOn(next)
            // 打开时只在**空**的情况下预填建议起点：别覆盖用户已经填过的数。
            if (next && String(params.maxCatalogChars ?? '').trim() === '') setParam('maxCatalogChars', String(CATALOG_CHARS_SUGGESTION))
            setSearchSaved(false)
          } }),
          // 关掉时**置灰保留**，不卸载：主流语义是"可见、不可改、不生效"。卸载会让表单跳一下，
          // 用户也看不出这一项原本是什么。`disabled` 表达"不生效"，保存时仍**不发**这个键。
          h('input', { type: 'number', min: 1, step: 1, disabled: !limitOn || !searchLoaded || saving,
            value: params.maxCatalogChars ?? '', placeholder: String(CATALOG_CHARS_SUGGESTION),
            'aria-label': t('最多字符数'), onChange: (e) => setParam('maxCatalogChars', e.target.value) }),
        ),
      ),
    ),
    searchError ? h('div', { className: 'dsh-mcp-d-err' }, searchError) : null,
    searchSaved ? h('p', { role: 'status', className: 'dsh-mcp-tool-param-saved' }, savedNotice || t('参数已保存')) : null,
  )
  // 概览条的一格：圆点与数字给「现在是什么局面」一个 3 秒答案。数值全来自与列表
  // 同源的那份数据（other / protectedTools / changedCount），不另问宿主——两个来源
  // 各数各的，迟早出现「概览说 34、列表数出 33」这种自己对不上自己的笑话。
  const stat = (mark, value, label, note) => h('div', { className: 'dsh-mcp-tool-stat' },
    h('span', { className: 'dsh-mcp-tool-stat-mark' + (mark ? ' ' + mark : '') }),
    h('span', { className: 'dsh-mcp-tool-stat-value' }, String(value)),
    h('span', { className: 'dsh-mcp-tool-stat-copy' },
      h('span', { className: 'dsh-mcp-tool-stat-label' }, label),
      note ? h('span', { className: 'dsh-mcp-tool-stat-note' }, note) : null,
    ),
  )
  const hero = h('div', { className: 'dsh-mcp-tool-hero' }, h('div', { className: 'dsh-mcp-tool-hero-copy' },
    h('h3', { className: 'dsh-mcp-tool-title' }, t('工具加载')),
  ))
  const overview = loaded === null ? null : h('div', { className: 'dsh-mcp-tool-overview' },
    stat('', manageable.length, t('可设置'), t('内置与插件工具')),
    stat('resident', residentCount, t('常驻'), t('每轮都在上下文里')),
    stat('deferred', deferredCount, t('按需'), t('搜索命中后加载')),
    stat('protected', protectedTools.length, t('受保护'), protectedTools.map((row) => row.name).join(' / ')),
  )
  const toolbar = h('div', { className: 'dsh-mcp-tool-toolbar' },
    h('div', { className: 'dsh-mcp-search' }, h(Icon, { d: ICONS.search }), h('input', { value: toolQuery,
      placeholder: t('按名称或用途搜索'), 'aria-label': t('按名称或用途搜索'), onChange: (e) => setToolQuery(e.target.value) })),
    h('div', { className: 'dsh-mcp-tool-filter', role: 'group', 'aria-label': t('按加载策略筛选') },
      ...[{ id: 'all', label: '全部' }, ...TOOL_SEARCH_CHOICES].map((choice) => h('button', {
        key: choice.id, type: 'button', 'aria-pressed': toolFilter === choice.id, onClick: () => setToolFilter(choice.id),
      }, t(choice.label))),
    ),
  )
  const list = loaded === null ? null : visibleTools.length ? h('div', { className: 'dsh-mcp-tool-list' }, ...visibleTools.map((row) => toolLoadingRow(row, toolDraft, setTool, { saving })))
    : h('div', { className: 'dsh-mcp-source-detail' }, t('没有匹配的工具。'))
  const fixed = [
    inline ? null : hero,
    error ? h('div', { className: 'dsh-mcp-d-err', role: 'alert' }, error) : null,
    loaded === null ? (error ? null : h('div', { className: 'dsh-mcp-source-detail' }, t('正在读取…')))
      : h(React2.Fragment, null, parameters, overview, toolbar),
  ]
  const content = [...fixed, list]
  if (inline) return h('div', { className: 'dsh-mcp-tool-loading-page' },
    h('div', { className: 'dsh-mcp-tool-fixed' }, ...fixed),
    h('div', { className: 'dsh-mcp-tool-scroll' }, list),
    h('div', { className: 'dsh-mcp-tool-save' },
      h('span', { className: 'dsh-mcp-tool-save-hint' },
        (dirty || paramsChanged) ? h('span', { className: 'dsh-mcp-tool-save-dirty' },
          dirty && paramsChanged ? t('已改 {count} 项 + 参数', { count: changedCount })
            : dirty ? t('已改 {count} 项', { count: changedCount })
            : t('参数已修改')) : null,
        (dirty || paramsChanged) ? t('未保存，保存后下一次请求生效') : null),
      h('span', { className: 'dsh-mcp-tool-save-spacer' }),
      h('span', { className: 'dsh-mcp-tool-save-actions' },
        (dirty || paramsChanged) ? h(Btn, { onClick: discard, disabled: saving, children: t('放弃修改') }) : null,
        loaded ? h(Btn, { cls: 'primary', onClick: submit, disabled: saving || (!dirty && !paramsChanged), children: saving ? t('保存中…') : t('保存') }) : null,
      ),
    ),
  )
  return h('div', { className: 'dsh-mcp-overlay', onClick: (e) => e.target === e.currentTarget && onClose?.() },
    h(Dialog, { label: t('工具加载'), onClose }, ...content),
  )
}

// ── 复制到另一个工作区 ───────────────────────────────────────────────────
// 默认全选源项目的 MCP、默认跳过目标同名条目：这两个默认值的方向一致——先让最常见的
// 「把 A 的配置搬给 B」一次点完，同时让"改动目标已有配置"必须由用户显式选一次。
const WorkspaceCopyModal = ({ open, onClose, call, busy, setBusy, onCopied, from, fromName, servers, workspaces }) => {
  const targets = useMemo(() => copyTargets(workspaces, from), [workspaces, from]);
  const [to, setTo] = useState('');
  const [names, setNames] = useState([]);
  const [overwrite, setOverwrite] = useState(false);
  const [error, setError] = useState('');
  // 计划与"算出它的那份输入"一起存：只有两者对得上，手上这份才是当前选择的结论（见 copyPlanKey）。
  const [preview, setPreview] = useState({ key: '', plan: null, error: '' });
  // 选了目标就先把结果算给用户看：写入前说清「目标已有哪几条同名、按当前选择会怎么处理」，
  // 而不是写完才在结果提示里告诉他有几条被跳过。判断全在 Host（resolveWorkspaceCopy），
  // 这里只渲染——所以预览与实际落盘不可能用两套规则。
  // 竞态靠 cleanup 的 cancelled 标志：React 保证下一次 effect 之前先跑 cleanup，卸载时也跑，
  // 所以"先发的请求后到"不可能覆盖后发的结果（多养一个序号 ref 只会让人以为 cancelled 不够用）。
  // 但 cancelled 只解决"谁写状态"，不解决"手上这份计划是不是当前选择的"——那是 requestKey 的事。
  const requestKey = copyPlanKey({ from, to, names, overwrite });
  useEffect(() => {
    if (!requestKey) { setPreview({ key: '', plan: null, error: '' }); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const res = await call('previewWorkspaceCopy', { from, to, names, overwrite });
        if (cancelled) return;
        if (!res?.ok) throw new Error(res?.error || t('无法预览目标工作区'));
        setPreview({ key: requestKey, plan: res, error: '' });
      } catch (e) {
        if (cancelled) return;
        setPreview({ key: requestKey, plan: null, error: String(e?.message || e) });
      }
    })();
    return () => { cancelled = true; };
  }, [requestKey, from, to, names, overwrite, call]);
  const planCurrent = preview.key === requestKey;
  // 计划过时只影响展示与"能不能按确认"；写入语义仍由 Host 在写锁内按最新配置重算。
  const ready = copyPlanReady(requestKey, preview);
  const plan = planCurrent ? preview.plan : null;
  const planError = planCurrent ? preview.error : '';
  // 打开时重置选择。**不能**依赖 servers：面板每 5s 轮询一次、每次都换数组引用，
  // 依赖它会让用户勾到一半就被重置回全选。
  useEffect(() => {
    if (!open) return;
    setTo('');
    setNames((servers || []).map((server) => server.serverName));
    setOverwrite(false);
    setError('');
    setPreview({ key: '', plan: null, error: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!open) return null;
  const list = servers || [];
  const allSelected = list.length > 0 && names.length === list.length;
  const toggleName = (name, checked) => setNames((prev) => (checked ? (prev.includes(name) ? prev : [...prev, name]) : prev.filter((item) => item !== name)));
  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await call('copyWorkspaceServers', { from, to, names, overwrite });
      if (!res?.ok) throw new Error(res?.error || t('复制失败'));
      onCopied(res);
      onClose();
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };
  return h('div', { className: 'dsh-mcp-overlay', onClick: (e) => e.target === e.currentTarget && onClose() },
    h(Dialog, { label: t('复制项目 MCP'), onClose },
      h('h3', null, t('复制项目 MCP 到另一个工作区')),
      h('div', { className: 'dsh-mcp-source-detail' }, t('源：{source}。复制在宿主内完成，配置与凭据不会经过浏览器。', { source: fromName || from })),
      h('div', { className: 'dsh-mcp-field' },
        h('label', null, t('目标工作区')),
        targets.length
          ? h('select', { className: 'dsh-mcp-copy-target', value: to, onChange: (e) => setTo(e.target.value) },
            h('option', { value: '' }, t('选择目标工作区…')),
            targets.map((ws) => h('option', { key: ws.path, value: ws.path }, t('{name}（{count} 个 MCP）{suffix}', { name: ws.name, count: ws.serverCount, suffix: ws.error ? t(' · 配置无效') : '' }))),
          )
          : h('div', { className: 'dsh-mcp-source-detail' }, t('没有其他已注册的工作区：先在 DSH 里打开另一个项目，它会出现在顶部标签页里。')),
      ),
      targets.length ? h('div', { className: 'dsh-mcp-field' },
        h('label', null, t('要复制的 MCP（{selected}/{total}）', { selected: Math.min(names.length, list.length), total: list.length })),
        h('div', { className: 'dsh-mcp-check-toolbar' },
          h('button', { type: 'button', className: 'dsh-mcp-btn sm ghost', onClick: () => setNames(allSelected ? [] : list.map((server) => server.serverName)) }, allSelected ? t('全不选') : t('全选')),
          h('span', null, t('目标已有同名条目时按下方选择处理')),
        ),
        h('div', { className: 'dsh-mcp-check-list' }, list.map((server) => h('label', { key: server.serverName, className: 'dsh-mcp-check-row' },
          h('input', { type: 'checkbox', checked: names.includes(server.serverName), onChange: (e) => toggleName(server.serverName, e.target.checked) }),
          h('span', { className: 'dsh-mcp-check-name' }, server.serverName),
          h('span', { className: 'dsh-mcp-check-meta' }, server.transport === 'http' ? 'HTTP' : 'stdio'),
        ))),
      ) : null,
      targets.length ? h('div', { className: 'dsh-mcp-radio-row' },
        h('label', { className: overwrite ? '' : 'sel' }, h('input', { type: 'radio', checked: !overwrite, onChange: () => setOverwrite(false) }), t('跳过目标同名')),
        h('label', { className: overwrite ? 'sel' : '' }, h('input', { type: 'radio', checked: overwrite, onChange: () => setOverwrite(true) }), t('覆盖目标同名')),
      ) : null,
      to ? h('div', { className: 'dsh-mcp-field' },
        h('label', null, t('写入结果预览')),
        planError ? h('div', { className: 'dsh-mcp-d-err' }, planError) : null,
        plan
          ? h('div', { className: 'dsh-mcp-card dsh-mcp-import-preview' }, copyPlanText(plan))
          : (planError ? null : h('div', { className: 'dsh-mcp-source-detail' }, planCurrent ? t('正在读取目标工作区配置…') : t('选择已变化，正在按当前选择重算…'))),
      ) : null,
      error ? h('div', { className: 'dsh-mcp-d-err' }, error) : null,
      h('div', { className: 'dsh-mcp-modal-actions' },
        h(Btn, { onClick: onClose, children: t('取消') }),
        h(Btn, { cls: 'primary', onClick: submit, disabled: busy || !ready, title: ready ? '' : t('等预览算出当前选择的结果'), children: busy ? t('复制中…') : t('复制') }),
      ),
    ),
  );
};

const POLL_INTERVAL_MS = 5000;

// 面板靠轮询反映 MCP 连接状态。标签页不可见时没人看这份数据，却照样每 5s 打两个 RPC，
// 因此隐藏期间跳过拉取，并在重新可见时立刻补一次，避免用户回来先看到一屏陈旧状态。
function startVisibilityAwarePolling(doc, timer, intervalMs, run) {
  const visible = () => !doc || doc.visibilityState !== 'hidden';
  const disposeInterval = timer.interval(() => { if (visible()) run(); }, intervalMs);
  if (!doc || typeof doc.addEventListener !== 'function') return disposeInterval;
  const onVisibilityChange = () => { if (visible()) run(); };
  doc.addEventListener('visibilitychange', onVisibilityChange);
  return () => {
    disposeInterval();
    doc.removeEventListener('visibilitychange', onVisibilityChange);
  };
}

const McpTab = (props) => {
  const { call, callSkills, onClose, floating, timer, pluginManager } = props;
  const panelRef = useRef(null);
  const [servers, setServers] = useState([]);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [tools, setTools] = useState([]);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // C2：延迟加载参数的表单。与 add/import 同一层：它也是"改宿主配置"的一次性动作。
  // 统一工具加载策略（内置 + MCP 同一套规则、可整体切换）。与「延迟参数」分开：
  // 一个是**有哪些工具该常驻**，一个是**搜索机制自己的预算**，混在一起会让人以为是同一件事。
  const [editTarget, setEditTarget] = useState(null);
  const [toast, setToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [transportFilter, setTransportFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  // ---- workspace 项目层 ----
  const [scope, setScope] = useState('global');
  const [workspaces, setWorkspaces] = useState([]);
  const [globalServers, setGlobalServers] = useState([]);
  const [exclude, setExclude] = useState([]);
  const [mountErrors, setMountErrors] = useState([]);
  const [scopeErrors, setScopeErrors] = useState([]);
  const [restrictError, setRestrictError] = useState(null);
  const [liveAgents, setLiveAgents] = useState(0);
  const [globalOpen, setGlobalOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [updateHint, setUpdateHint] = useState(null);
  const loadSeq = useRef(0);
  const manualRefreshSeq = useRef(0);
  const revisionRef = useRef('');
  const revealRevisionRef = useRef('');
  const [revealed, setRevealed] = useState({});
  const revealGeneration = useRef(0);
  const clearRevealed = useCallback(() => {
    clearRevealState(revealGeneration, setRevealed);
  }, []);

  useEffect(() => {
    if (floating) panelRef.current?.focus();
  }, [floating]);

  const flash = useCallback(
    (msg, kind) => {
      setToast({ msg, kind: kind || 'ok' });
      timer.timeout(() => setToast(''), 3200);
    },
    [timer],
  );

  const load = useCallback(async (notify = false) => {
    const seq = ++loadSeq.current;
    // switchScope 在切换那一刻递增同一个序列号；过期响应不能写回新作用域。
    const requestScope = scope;
    const isWorkspace = requestScope !== 'global';
    if (notify) { manualRefreshSeq.current = seq; setRefreshing(true); }
    try {
      const viewPromise = isWorkspace ? call('getWorkspaceView', { wsPath: requestScope }) : call('list');
      const [res, wsRes] = await Promise.all([viewPromise, call('listWorkspaces')]);
      if (seq !== loadSeq.current) return;
      if (wsRes && wsRes.ok) setWorkspaces(wsRes.workspaces || []);
      if (res && res.ok) {
        if (isWorkspace) {
          const next = res.servers || [];
          setGlobalServers(res.global || []);
          setExclude(res.exclude || []);
          setMountErrors(res.mountErrors || []);
          setScopeErrors(res.scopeErrors || []);
          setRestrictError(res.restrictError || null);
          setLiveAgents(res.liveAgents || 0);
          setError(res.error || '');
          if (!Object.hasOwn(res, 'revision') || res.revision !== revisionRef.current) {
            revisionRef.current = res.revision || '';
            setServers(next);
          }
          if (notify) flash(t('已刷新项目 MCP，共 {count} 个', { count: next.length }));
        } else {
          const next = res.servers || [];
          if (consumeRevision(revealRevisionRef, res.revealRevision)) clearRevealed();
          const hasRevision = Object.hasOwn(res, 'revision');
          if (!hasRevision || res.revision !== revisionRef.current) {
            revisionRef.current = res.revision || '';
            setServers(next);
          }
          setError('');
          if (notify) flash(t('已刷新，共 {count} 个 MCP', { count: next.length }));
        }
      } else {
        const message = (res && res.error) || t('加载失败');
        setError(message);
        if (notify) flash(message, 'err');
      }
    } catch (e) {
      if (seq !== loadSeq.current) return;
      const message = String((e && e.message) || e);
      setError(message);
      if (notify) flash(message, 'err');
    } finally {
      if (notify && manualRefreshSeq.current === seq) setRefreshing(false);
    }
  }, [call, clearRevealed, flash, scope]);

  useEffect(() => {
    load(false);
    return startVisibilityAwarePolling(typeof document === 'undefined' ? null : document, timer, POLL_INTERVAL_MS, () => load(false));
  }, [load, timer]);

  // 更新提示：Host 每天最多查一次 npm registry（本包的 latest 端点，见 lib/index.js 的
  // updateLatestUrl）；纯增值信息，任何失败都静默，不打扰面板。
  useEffect(() => {
    let cancelled = false;
    call('updateHint').then((res) => {
      if (cancelled || !res?.ok || !res.updateAvailable) return;
      let dismissed = null;
      try { dismissed = localStorage.getItem('dsh-mcp-manager-ui.updateHint.dismissed'); } catch { /* 存储不可用时视为未关闭 */ }
      if (dismissed !== res.latest) setUpdateHint(res);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [call]);

  // 探测一键升级的可用性：官方 pluginManager 在不在 + 本插件是不是 npm 装的。
  // 与 updateHint 同一条纪律：任何失败都静默（按钮不出现即可），绝不因它让面板报错。
  // 只在确实有新版时才探测——没有新版时按钮本来就不显示，省一次 remote 调用。
  useEffect(() => {
    if (!updateHint?.latest || !pluginManager || typeof pluginManager[UPGRADE_METHOD] !== 'function') return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await pluginManager.listBundles();
        if (cancelled || !res || res.ok !== true || !Array.isArray(res.value)) return;
        const bundle = res.value.find((b) => b && b.name === UPGRADE_PACKAGE) || null;
        // 只有判定为「可升级」才记 state；不可升级时保持 idle，按钮走旧的链接形态。
        const plan = upgradePlan({ service: pluginManager, hint: updateHint, bundle });
        if (!cancelled && plan.supported) setUpgradeState({ phase: 'idle', bundle, spec: plan.spec });
      } catch { /* 探测失败 = 没有一键升级，退回链接；不报错 */ }
    })();
    return () => { cancelled = true; };
  }, [pluginManager, updateHint]);

  // 挂载失败按 serverName 索引：既标到列表行上，也注入详情的错误区，避免「顶部报错但那一行看着正常」。
  // 挂载失败的汇总横幅用的就是这个列表；行与详情都读 Host 标在行上的 mountFailed。

  // 选中项可能来自项目列表或（项目 tab 下的）全局列表；后者标记为 foreign，详情区据此只读。
  const selectedServer = useMemo(() => {
    if (scope === 'global' || !globalOpen) return servers.find((row) => row.serverName === selected) || null;
    const shared = globalServers.find((row) => row.serverName === selected);
    return shared ? { ...shared, managed: false, foreign: 'global' } : null;
  }, [servers, globalServers, selected, scope, globalOpen]);

  // 默认选中第一个服务器：右侧详情是这一页的主体，空着等于把大半版面浪费掉，
  // 用户还得先猜「要不要点左边」。只在**当前没有选中项**时补选，绝不覆盖用户的选择；
  // 选中项被删掉后 selected 仍留着旧名（详情区自然变空态），此时也会补选到剩下的第一个。
  useEffect(() => {
    const rows = scope !== 'global' && globalOpen ? globalServers : servers;
    if (rows.some((row) => row.serverName === selected)) return;
    setSelected(rows[0]?.serverName || '');
  }, [servers, globalServers, globalOpen, scope, selected]);

  useEffect(() => {
    let cancelled = false;
    setTools([]);
    if (!selected) return () => { cancelled = true; };
    (async () => {
      try {
        // 项目 MCP 要带 wsPath 才能精确定位：serverName 的全 app 唯一性只在保存路径被校验，
        // 手工编辑 .dsh/mcp.json 能造出两个项目同名，光按名字问会拿到另一个项目的工具。
        const res = selectedServer?.scope === 'workspace' && scope !== 'global'
          ? await call('tools', { name: selected, wsPath: scope })
          : await call('tools', { name: selected });
        if (!cancelled && res?.ok) setTools(res.tools || []);
      } catch {
        if (!cancelled) setTools([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selected, selectedServer?.scope, selectedServer?.toolRevision, scope, call]);

  /** 结果展示的**唯一**判据：宿主说了什么就说什么（`note`），没说才退回调用方文案。
   *  以前这里写死 `successMsg || res.note`，于是"写盘成功、运行中没生效"（`live: 'skipped'`）
   *  被报成"已保存"，正好把这条契约想告诉用户的那件事盖掉了。 */
  const resultMessage = (res, fallback) => res?.note || res?.liveReason || fallback
  /** `live: 'failed'` 是"盘上变了、运行中没跟上"，必须按错误显示，不能用普通成功色。 */
  const resultTone = (res) => (res?.live === 'failed' ? 'err' : undefined)
  const act = useCallback(
    async (method, args, successMsg) => {
      setBusy(true);
      try {
        const res = await call(method, args);
        if (res && res.ok) {
          flash(resultMessage(res, successMsg || t('{method} 成功', { method })), resultTone(res));
        } else {
          flash((res && res.error) || t('{method} 失败', { method }), 'err');
        }
      } catch (e) {
        flash(String((e && e.message) || e), 'err');
      } finally {
        setBusy(false);
        timer.timeout(load, 250);
      }
    },
    [call, flash, load, timer],
  );

  const toggleDeferOne = (s) => {
    if (busy || s.managed !== true) return;
    // 方向必须从**芯片显示的那个值**推出：芯片读 `deferEffective`（统一策略下的实际状态），
    // 若这里改读旧的 `defer`，用户点一颗写着"延迟"的芯片、方向却是"再打开一次延迟"，
    // 结果就是点了没反应却提示成功。
    const next = (s.deferEffective ?? s.defer) !== true;
    // 乐观更新只动被点的那一行（不是整个作用域），再由 act 完成后的 load 校准。
    revisionRef.current = '';
    setServers((prev) => prev.map((row) => (row.serverName === s.serverName && row.scope === s.scope ? { ...row, defer: next, deferEffective: next } : row)));
    return act(
      'setDefer',
      s.scope === 'workspace' ? { name: s.serverName, wsPath: scope, defer: next } : { name: s.serverName, defer: next },
      next ? t('已把 {name} 切到延迟加载', { name: s.serverName }) : t('已把 {name} 切回全量常驻', { name: s.serverName }),
    );
  };
  const onToggle = (s) => {
    if (busy || !s.managed) return;
    const next = !s.enabled;
    // 乐观更新：本地先翻转，操作完成后由 load 校准。
    revisionRef.current = '';
    setServers((prev) => prev.map((x) => (x.serverName === s.serverName ? { ...x, enabled: next } : x)));
    if (scope === 'global') {
      return act(next ? 'enable' : 'disable', s.serverName, (next ? t('已启用 ') : t('已禁用 ')) + s.serverName);
    }
    // 项目层：写 disabled 字段到项目配置。
    const spec = { ...s, name: s.serverName, transport: s.transport === 'stdio' ? 'stdio' : 'streamable-http', disabled: !next };
    return act('updateWorkspaceServer', { wsPath: scope, spec }, (next ? t('已启用 ') : t('已禁用 ')) + s.serverName);
  };
  /**
   * 一键把 MCP 切到延迟/全量。两个作用域各走各的 RPC 载荷：
   *   全局 → { defer }             Host 改 <profile>/cordis.patch.yml
   *   项目 → { wsPath: scope, defer }  Host 改 <项目>/.dsh/mcp.json
   *
   * 乐观更新本地行的 defer 标记，再由 act 完成后的 load 校准。defer 是**下一轮模型请求**
   * 才生效的属性（工具清单每步重新组装），不需要额外刷新会话。
   */
  const setDeferAll = (next) => {
    if (busy) return;
    const inWorkspace = scope !== 'global';
    revisionRef.current = '';
    setServers((prev) => prev.map((s) => (s.managed === true && (inWorkspace || s.scope !== 'workspace') ? { ...s, defer: next } : s)));
    return act('setDeferAll', inWorkspace ? { wsPath: scope, defer: next } : { defer: next }, next ? t('已开启全部延迟加载') : t('已关闭全部延迟加载'));
  };
  const onReconnect = (s) => {
    // 项目连接也要有出口：mcp-client 的重连预算耗尽后会注销工具并停止，只能靠重载配置/重启宿主
    // 恢复（它的 README 明写），而项目 MCP 不是常驻服务 —— 所以「重连」在这里是必需的能力，
    // 不是可选装饰。这条路径 = 拆掉旧连接 + 按当前配置重建 + 对齐存活会话。
    if (s.scope === 'workspace') {
      return act('reconnectWorkspaceServer', { wsPath: scope, name: s.serverName }, t('已重连 {name}', { name: s.serverName }));
    }
    act('reconnect', s.serverName, t('已请求重连 {name}', { name: s.serverName }));
  };
  const onRemove = (s) => {
    const isWorkspace = s.scope === 'workspace';
    if (confirm(t('确认移除 MCP「{name}」？将从{scope}中删除。', { name: s.serverName, scope: isWorkspace ? t('项目配置') : t('当前 Web profile 配置') }))) {
      clearRevealed();
      // 不传 successMsg：宿主那句 note 才是权威结果（它会说明「还有几条同名条目没动、
      // 要重启宿主才会重连」）。传了 successMsg 就等于用一个泛化文案把它盖掉。
      if (isWorkspace) act('removeWorkspaceServer', { wsPath: scope, name: s.serverName });
      else act('removeServer', s.serverName);
    }
  };
  const onToggleExclude = (serverName, hidden) => {
    if (busy || scope === 'global') return;
    revisionRef.current = '';
    setGlobalServers((prev) => prev.map((s) => (s.serverName === serverName ? { ...s, excluded: hidden } : s)));
    setExclude((prev) => (hidden ? (prev.includes(serverName) ? prev : [...prev, serverName]) : prev.filter((name) => name !== serverName)));
    // 屏蔽同样是"写盘即对齐"：Host 会立刻把新的 restrict 写进会话作用域，运行中的会话在**下一次
    // 模型请求**就不再见得到这些工具（工具清单是每步重新组装的，不是首轮定型）。
    act('setWorkspaceExclude', { wsPath: scope, serverName, hidden }, hidden ? t('已屏蔽 {name}，对运行中的会话立即生效', { name: serverName }) : t('已取消屏蔽 {name}，对运行中的会话立即生效', { name: serverName }));
  };
  useEffect(() => { clearRevealed(); }, [selected, clearRevealed]);
  const revealValue = useCallback(async (server, field, key) => {
    if (!server.managed) throw new Error(t('该 MCP 来自其他配置层，配置只读，无法查看具体值'));
    const res = server.scope === 'workspace'
      ? await call('revealWorkspaceServer', { wsPath: scope, name: server.serverName, field, key })
      : await call('reveal', { name: server.serverName, field, key });
    if (!res?.ok) throw new Error(res?.error || t('读取配置失败'));
    return res.value;
  }, [call, scope]);
  const onCopy = useCallback((text) => {
    copyText(text).then((ok) => flash(ok ? t('已复制到剪贴板') : t('复制失败'), ok ? 'ok' : 'err'));
  }, [flash]);
  const onReveal = useCallback(async (server, field, key) => {
    const id = server.serverName + ':' + field + (key !== undefined ? ':' + key : '');
    if (revealed[id]?.value !== undefined) { setRevealed((prev) => ({ ...prev, [id]: false })); return; }
    if (revealed[id]?.pending) return;
    const generation = revealGeneration.current;
    setRevealed((prev) => ({ ...prev, [id]: { pending: true } }));
    try {
      const value = await revealValue(server, field, key);
      if (generation !== revealGeneration.current) return;
      setRevealed((prev) => ({ ...prev, [id]: { value, field, key } }));
    } catch (e) {
      if (generation !== revealGeneration.current) return;
      setRevealed((prev) => ({ ...prev, [id]: false }));
      flash(String(e?.message || e), 'err');
    }
  }, [flash, revealValue, revealed]);
  const onSubmit = async (spec, setFormError) => {
    setBusy(true);
    const isWorkspace = scope !== 'global';
    try {
      const res = isWorkspace
        ? (editTarget
            ? await call('updateWorkspaceServer', { wsPath: scope, spec })
            : await call('addWorkspaceServer', { wsPath: scope, spec }))
        : (editTarget ? await call('update', spec) : await call('add', spec));
      if (res && res.ok) {
        // 同 act()：宿主说"已写入，重启后生效"时不能盖成"已保存"。
        clearRevealed();
        flash(resultMessage(res, editTarget ? t('已保存 {name}', { name: spec.name }) : t('已添加 {name}', { name: spec.name })), resultTone(res));
        setAddOpen(false);
        setEditTarget(null);
        timer.timeout(load, 1500);
      } else {
        setFormError((res && res.error) || (editTarget ? t('保存失败') : t('添加失败')));
      }
    } catch (e) {
      setFormError(String((e && e.message) || e));
    } finally {
      setBusy(false);
    }
  };
  const openAdd = () => { setEditTarget(null); setAddOpen(true); };
  const openEdit = (s) => { setEditTarget(s); setAddOpen(true); };
  const onImported = (res) => {
    clearRevealed();
    flash(res.note || t('已导入 MCP'));
    timer.timeout(load, 1200);
  };
  const onBuiltinsInstalled = (res) => {
    clearRevealed();
    flash(res.note || t('已安装所选 MCP'));
    timer.timeout(load, 1200);
  };
  // 复制写的是**另一个**工作区（不是当前标签页），这里刷新只为让结果尽快可见——
  // 「跳过 N 条同名」这类事实必须由 Host 的结果文案说出来，界面不猜。
  const onCopiedToWorkspace = (res) => {
    flash(res.note || t('已复制'));
    timer.timeout(load, 1200);
  };

  const dismissUpdateHint = () => {
    if (updateHint?.latest) { try { localStorage.setItem('dsh-mcp-manager-ui.updateHint.dismissed', updateHint.latest); } catch { /* 忽略：下次打开会再提示 */ } }
    setUpdateHint(null);
    // 升级完成的横幅不挂在 updateHint 上（那时它已经是 null），所以要把 state 也收掉，
    // 否则「关闭」按钮按下去横幅还在。
    setUpgradeState((current) => (current.phase === 'done' ? { phase: 'idle' } : current));
  };

  // 一键升级：探测官方 pluginManager → 读本插件那一行 → 判定 → 执行 → 按 application 分流。
  // 探测失败一律静默退回「查看更新方式」链接：老宿主 / 没这个 namespace 时按钮不该出现，
  // 更不该报错（这一整块是纯增值信息，与 updateHint 同一条纪律）。
  const [upgradeState, setUpgradeState] = useState({ phase: 'idle' });
  const runUpgrade = async () => {
    const svc = pluginManager;
    const plan = upgradePlan({ service: svc, hint: updateHint, bundle: upgradeState.bundle || null });
    if (!plan.supported) {
      // 只有「本地链接安装」值得明说：其余情况（宿主没提供、已是最新）按钮本来就不显示。
      setUpgradeState({ phase: 'blocked', reason: plan.reason });
      return;
    }
    setUpgradeState({ phase: 'running', version: plan.version });
    try {
      // 两个参数：installBundle(spec, options)。少传第二个会被 wire 直接拒绝
      // （client api: pluginManager/installBundle expected 2 argument(s), got 1）。
      const res = await svc[UPGRADE_METHOD](plan.spec, {});
      if (!res || res.ok !== true) {
        setUpgradeState({ phase: 'failed', text: (res && res.error && (res.error.message || res.error.code)) || t('调用失败') });
        return;
      }
      const r = res.value || {};
      if (r.application === 'failed' || r.application === 'cancelled') {
        // 三个参数：未知错误码时要靠 pnpm 的原文解释失败（见 upgradeFailureText）。
        setUpgradeState({
          phase: 'failed',
          text: upgradeFailureText(r.error, r.packageResult && r.packageResult.exitCode, r.packageResult && r.packageResult.output),
        });
        return;
      }
      // applied / restart-required / overridden 都算装上了。宿主代码在进程内执行，升级已存在的包
      // 时官方**无条件**返回 restart-required（installBundle 里 `if (Object.hasOwn(before, name))
      // return 'restart-required'`，与 HMR 开不开无关），所以这里必须告诉用户去重启。
      setUpgradeState({ phase: 'done', version: plan.version || updateHint?.latest || '' });
    } catch (e) {
      setUpgradeState({ phase: 'failed', text: String(e?.message || e) });
    }
  };
  const filtered = useMemo(() => {
    const q = (query || '').toLowerCase();
    return servers.filter((s) => {
      if (transportFilter !== 'all' && s.transport !== transportFilter) return false;
      if (statusFilter !== 'all') {
        const status = s.status || s.phase || 'waiting';
        if (statusFilter === 'connected' && status !== 'connected') return false;
        if (statusFilter === 'failed' && status !== 'failed') return false;
        if (statusFilter === 'disabled' && s.enabled) return false;
      }
      if (!q) return true;
      return s.serverName.toLowerCase().includes(q) || (s.url || s.command || '').toLowerCase().includes(q);
    });
  }, [servers, query, transportFilter, statusFilter]);

  const visibleGlobalCount = useMemo(() => {
    const hidden = new Set(exclude || []);
    return globalServers.reduce((count, s) => (hidden.has(s.serverName) ? count : count + 1), 0);
  }, [globalServers, exclude]);

  const scopeTabs = useMemo(() => {
    const tabs = [{ key: 'global', label: t('全局') }];
    for (const ws of workspaces) {
      tabs.push({ key: ws.path, label: ws.name, count: ws.serverCount, title: ws.path + (ws.error ? t('（配置无效：{error}）', { error: ws.error }) : '') });
    }
    return tabs;
  }, [workspaces]);
  const scopeName = scope === 'global' ? t('全局') : (workspaces.find((ws) => ws.path === scope)?.name || scope);
  const switchScope = useCallback((next) => {
    if (next === scope) return;
    // 先让旧请求失效，再清掉旧作用域的视图数据。否则新 scope 已渲染、
    // 旧 servers 仍在树里，用户就会先看到「项目里有全局 MCP」，下一次刷新又消失。
    loadSeq.current += 1;
    setScope(next);
    setServers([]);
    setGlobalServers([]);
    setTools([]);
    setExclude([]);
    setMountErrors([]);
    setScopeErrors([]);
    setRestrictError(null);
    setLiveAgents(0);
    setSelected('');
    setQuery('');
    // 状态过滤在两种作用域下语义不同（项目 MCP 无连接态），切换时归零避免「空列表且控件已隐藏」。
    setTransportFilter('all');
    setStatusFilter('all');
    setGlobalOpen(false);
    setExportOpen(false);
    setCopyOpen(false);
    setAddOpen(false);
    setImportOpen(false);
    setEditTarget(null);
    setError('');
    revisionRef.current = '';
    clearRevealed();
    // 新作用域只由 [load, timer] effect 拉取；这里的 load 仍捕获旧 scope。
  }, [scope, clearRevealed]);

  // 工作区路径列表：宿主 skillsManager.list 要的是字符串数组，而 workspaces 状态里是
  // { path, name, serverCount, … } 对象。单独抽出来是因为 SkillsPanel 也要用同一份
  // （它不能自己问服务——那个方法在 mcpManager 上，问 skillsManager 只会静默失败）。
  const workspacePaths = useMemo(
    () => (Array.isArray(workspaces) ? workspaces : [])
      .map((item) => (typeof item === 'string' ? item : item?.path))
      .filter((value) => typeof value === 'string' && value !== ''),
    [workspaces],
  );

  // ── 能力层（MCP / 技能）与模式层（已安装 / 发现市场）─────────────────────
  //
  // 两层都由**外壳**渲染，而且是同一种控件（.dsh-mcp-seg）：能力层在标题栏（管哪个能力），
  // 模式层在第二行（看哪一面）。位置固定，所以切面时两排控件都不动。
  //
  // 为什么模式层也住在这里：曾经它是各能力面自己画的（MCP 面一个「市场」按钮弹窗、
  // 技能面一条自己的 bar），于是「同一个概念、两种形态、两个渲染者」。现在只有这一个。
  const [ability, setAbility] = useState('mcp');
  const [mode, setMode] = useState('manage');
  // 技能面的作用域药丸（全部 + 每个实际存在的作用域组）。选择值就是组的 key，
  // 与列表分组同源（skillGroupKey），所以药丸上的数字和它筛出来的行数一定相等。
  const [scopeFilter, setScopeFilter] = useState('all');
  const [mcpSort, setMcpSort] = useState('default');
  const [skillSort, setSkillSort] = useState('default');
  // { state: 'unknown' | 'ready' | 'down', count, error }
  const [skillsService, setSkillsService] = useState({ state: 'unknown', count: null, error: '' });

  // 技能服务可用性：**在 MCP 面也要能知道**。技能面没打开时 SkillsPanel 根本没挂载，
  // 所以外壳自己探一次。
  //
  // ⚠️ 这里原来探的是 `skillsManager/market`——它读的是随宿主返回的内置目录（离线、无网络
  // 请求），是当时最便宜的探针。2026-10-10 内置目录随市场一起删掉后，这个端点不存在了，
  // 探针于是**必然**走失败分支、把面板先标成「服务未连接」，直到 SkillsPanel 的 `list`
  // 报回真实结果。现在改探 `list`：它同样只读本机技能根、不发网络请求，而且是权威答案
  // （`market` 当年也只是回答「服务在不在」）。代价是技能面打开时会各查一次，可忽略。
  //
  // 为什么要专门有一条：宿主可以禁掉 dsh-skill 内置插件，那种 profile 里技能面只是不可用，
  // 但用户看到的是「技能页一直空着/一直加载」，没有任何线索指向原因（SPEC 约束 16）。
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(callSkills('list', { workspaces: [] })).then((res) => {
      if (cancelled) return;
      if (res && res.ok) {
        // 探测成功只把 unknown 推进到 ready；已经有 SkillsPanel 报过结果就不覆盖它
        // （list 才是权威，探针只回答「服务在不在」）。
        setSkillsService((current) => (current.state === 'unknown' ? { state: 'ready', count: null, error: '' } : current));
        return;
      }
      setSkillsService({ state: 'down', count: null, error: (res && res.error) || t('技能服务未连接') });
    }).catch(() => { /* callSkills 自身不抛；真抛了也只是探测失败，不打扰面板 */ });
    return () => { cancelled = true; };
  }, [callSkills]);

  const onSkillsSummary = useCallback((info) => {
    setSkillsService((current) => ({ ...current, ...info }));
  }, []);

  // ⚠️ item.label 必须过 t()：两张表（ABILITY_TABS / SKILL_MODES）存的是**中文原文**，
  // 在这里翻而不是在建表时翻——建表发生在 apply() 拿到 locale 之前，那时翻等于把语言
  // 锁死在加载那一刻（真机表现：切 English 后页签仍是中文）。这里是**唯一**的分段控件
  // 渲染点，能力层与模式层都过它，所以翻这一处就够。
  const seg = (items, active, onSelect, label) => h('div', { className: 'dsh-mcp-seg', role: 'tablist', 'aria-label': label },
    ...items.map((item) => h('button', {
      key: item.id,
      type: 'button',
      role: 'tab',
      'aria-selected': active === item.id,
      className: 'dsh-mcp-btn' + (active === item.id ? ' sel' : ''),
      onClick: () => onSelect(item.id),
    },
      t(item.label),
      item.count === undefined || item.count === null ? null : h('span', { className: 'dsh-mcp-seg-count' }, String(item.count)),
    )),
  );

  // 能力层计数：技能的来自 SkillsPanel 回传的 list 结果（**行数**——已停用的技能也在列表里）。
  // MCP 面**不显示数字**——跨作用域总数外壳拿不到（list 只回答当前作用域那批），
  // 编一个出来比不显示更糟：用户会拿它当「一共有几个 MCP」。
  const abilityTabs = seg(
    ABILITY_TABS.map((tab) => (tab.id === 'skills' ? { ...tab, count: skillsService.count } : tab)),
    ability,
    setAbility,
    t('能力层'),
  );

  // 悬浮窗外壳：**两个能力面共用这一处**。
  // `.dsh-mcp-wrap` 只提供列布局与内边距；面板真正的外观（背景、圆角、阴影、遮罩、层级）
  // 全部来自 .dsh-mcp-panel-overlay / .dsh-mcp-panel。所以任何返回内容的出口都必须过这里，
  // 否则得到的是一个没有背景、没有定位的裸 div——页面其它内容会直接透过来。
  const wrapFloating = (content) => (floating
    ? h(
      'div',
      { className: 'dsh-mcp-panel-overlay', onClick: (e) => e.target === e.currentTarget && onClose && onClose() },
      h('div', { ref: panelRef, className: 'dsh-mcp-panel', role: 'dialog', 'aria-modal': true, 'aria-label': t('扩展中心'), tabIndex: -1, onKeyDown: (e) => { if (e.key === 'Escape' && onClose) onClose(); } }, content),
    )
    : content);

  // ── 第二行：模式分段 | 作用域药丸 | 连接状态 ────────────────────────────
  //
  // 这一条由**外壳**渲染，两个能力面共用（曾经技能面自己画一条 bar、MCP 面直接把作用域
  // 药丸当第二行，于是切面时这一行的形状与控件都换了）。
  //
  // 作用域只在**已安装**模式出现：市场是随宿主一起发下来的目录，没有作用域语义，
  // 留着它只会让人以为「筛选了市场」（原型同款处理：市场模式下这段 display:none、不留空档）。
  const skillsScopeTabs = skillsService.scopeTabs || [];
  const runtime = ability === 'tool-loading'
    ? null
    : ability === 'skills'
      ? (skillsService.state === 'down'
        ? { cls: ' err', icon: 'warn', text: t('skills 服务未就绪') }
        : skillsService.state === 'unknown'
          ? { cls: '', icon: 'info', text: t('正在连接 skills 服务…') }
          : null)
      : (error ? { cls: ' err', icon: 'warn', text: t('宿主 MCP 读取失败') } : null);

  // 工具页没有作用域：它管的是宿主全局注册的工具，与当前选中哪个项目无关。
  // 所以这一行在工具页只留右侧那句状态，模式与作用域两列都不渲染。
  const subRow = h('div', { className: 'dsh-mcp-sub' },
    ability === 'tool-loading' ? null : seg(SKILL_MODES, mode, setMode, t('模式')),
    h('div', { className: 'dsh-mcp-sub-scope' },
      ability === 'tool-loading'
        ? null
        : mode === 'manage'
          ? (ability === 'skills'
            ? (skillsScopeTabs.length > 1 ? h(ScopeTabs, { tabs: skillsScopeTabs, active: scopeFilter, onSelect: setScopeFilter }) : null)
            : h(ScopeTabs, { tabs: scopeTabs, active: scope, onSelect: switchScope }))
          : null,
    ),
    runtime ? h('div', { className: 'dsh-mcp-runtime' + runtime.cls, title: runtime.text }, h(Icon, { d: ICONS[runtime.icon], size: 13 }), runtime.text) : null,
  );

  // ── 通知条 ──────────────────────────────────────────────────────────────
  // 顺序固定：降级 → 读取失败 → 项目级故障 → 更新。前三条是「现在有问题」，
  // 更新是纯增值信息，所以它排最后（也最容易被忽略，但它本来就不该抢注意力）。
  const notices = [
    // 技能服务缺失：**在 MCP 面也要说**。MCP 面照常可用，但用户切到技能面时不能
    // 只看到一个空列表——他需要知道是宿主没挂 dsh-skill，而不是自己没有技能。
    skillsService.state === 'down'
      ? h(Notice, {
        key: 'skills-down', tone: 'err', icon: 'shield',
        title: t('宿主 skills 服务未就绪，技能面已降级'),
        children: t('未取到 remote.skillsManager（{reason}）。技能面不可用，MCP 面不受影响。', { reason: skillsService.error || t('原因未知') }),
        actions: [h(Btn, { key: 'how', cls: 'sm', onClick: () => flash(t('检查宿主是否挂载并启用了 @deepseek-ai/dsh-skill')), children: t('排查') })],
      })
      : null,
    error
      ? h(Notice, {
        key: 'load-failed', tone: 'err', icon: 'warn',
        title: t('MCP 配置读取失败'),
        children: error,
        actions: [h(Btn, { key: 'retry', cls: 'sm', onClick: () => load(true), disabled: refreshing, children: t('重试') })],
      })
      : null,
    scope !== 'global' && mountErrors.length
      ? h(Notice, {
        key: 'mount-failed', tone: 'warn', icon: 'warn',
        title: t('{count} 个项目 MCP 未能挂载到会话', { count: mountErrors.length }),
        // 项目 MCP 是「该项目所有会话共享一份连接」，同一项目内不会因并发会话而撞名；这里只
        // 如实给出并发会话数作为上下文（挂载失败的常见外部原因），不再把它说成 serverName 占用。
        // 只列 serverName 等于把真因留给用户自己逐条点开，所以正文直接摆出首条原因（Host 记的
        // 官方原文；同名占用时还带「和谁同名」与根因），其余各条在详情里给全文。
        children: mountErrors.map((m) => m.serverName).join(t('、'))
          + t('。首个原因：{reason}　点开对应条目查看每一条的具体错误。', { reason: firstFailureReason(mountErrors[0]) })
          + (liveAgents > 1 ? t('　本项目当前有 {count} 个会话在运行。', { count: liveAgents }) : ''),
      })
      : null,
    scope !== 'global' && scopeErrors.length
      ? h(Notice, {
        key: 'scope-failed', tone: 'warn', icon: 'warn',
        // 「作用域隔离失败」说清后果：这批工具会出现在**所有**项目的会话里（不是只在这一个项目里
        // 少工具），所以它不是"某个 server 没配好"，而是这台机器的安装让作用域失效——横幅因此
        // 也必须带出原因，否则用户只会去查 MCP 配置。
        title: t('{count} 个项目 MCP 的工具无法隔离（会出现在所有项目的会话里）', { count: scopeErrors.length }),
        children: scopeErrors.map((m) => m.serverName).join(t('、'))
          + t('。首个原因：{reason}　点开对应条目查看每一条的具体错误。', { reason: firstFailureReason(scopeErrors[0]) }),
      })
      : null,
    scope !== 'global' && restrictError
      ? h(Notice, { key: 'restrict', tone: 'warn', icon: 'warn', title: t('屏蔽未能写入会话作用域'), children: restrictError.error })
      : null,
    // 更新条的存活条件：有新版本，**或者**刚升完（要告诉用户重启，否则「点完就消失」
    // 等于没说——实测就是这样：升级成功后 updateHint 立刻变成「已是最新」，这条随之消失）。
    (updateHint || upgradeState.phase === 'done') ? h(Notice, {
      key: 'update', tone: 'info', icon: 'up',
      title: upgradeState.phase === 'running'
        ? t('正在升级到 v{version}…', { version: upgradeState.version })
        // ⚠️ done 分支**不得**再读 updateHint 的字段：那时它已经是 null（宿主已认不出旧版）。
        : upgradeState.phase === 'done' ? t('已升级到 v{version}，重启宿主后生效', { version: upgradeState.version })
          : upgradeState.phase === 'failed' ? t('升级失败：{text}', { text: upgradeState.text })
            : upgradeState.phase === 'blocked' && upgradeState.reason === 'not-npm'
              ? t('本地链接安装，无法一键升级{suffix}', { suffix: updateHint?.current ? t('（当前 v{version}）', { version: updateHint.current }) : '' })
              : t('新版本 v{version} 可用', { version: updateHint.latest }),
      children: upgradeState.phase === 'done' ? t('宿主代码在进程内执行，不重启等于没升级。') : t('升级由官方 pluginManager 执行，装完需要重启宿主。'),
      actions: [
        // 可升级时给按钮，否则退回链接。按钮只在探测确认过 service + npm 来源后出现——
        // 探测失败时这一整条与改动前完全一致，不会出现点了没反应的按钮。
        upgradeState.phase === 'idle' && upgradeState.spec
          ? h(Btn, { key: 'go', cls: 'sm primary', title: t('升级由官方 pluginManager 执行，装完需要重启宿主'), onClick: runUpgrade, children: t('升级') })
          : h('a', {
            key: 'link',
            className: 'dsh-mcp-btn sm',
            href: (updateHint && updateHint.url) || 'https://github.com/Imzl-zl/dsh-toolbox-ui/releases',
            target: '_blank',
            rel: 'noreferrer',
          }, upgradeState.phase === 'done' ? t('看这次改了什么') : t('查看更新方式')),
        h(Btn, { key: 'close', cls: 'icon ghost', title: t('本版本内不再提示'), onClick: dismissUpdateHint }, h(Icon, { d: ICONS.x })),
      ],
    }) : null,
  ].filter(Boolean);

  // ── 两个能力面共用的外壳 ────────────────────────────────────────────────
  //
  // ⚠️ 三个不变量，都有真机故障作依据：
  //
  // 1) **两个能力面必须走同一个出口**（.dsh-mcp-panel-overlay → .dsh-mcp-panel → .dsh-mcp-wrap）。
  //    `.dsh-mcp-wrap` 只负责列布局与内边距，没有背景/定位/层级；裸返回会让面板被当成
  //    页面里的普通 div，设置页内容直接透过来（实测糊成一片、完全不可读）。
  //
  // 2) **标题栏与第二行必须同构**。切换能力层只该换「管什么」，不该换「怎么操作」。
  //    曾经技能面自己另起了一套（标题栏空着、模式切换另起一条 bar、关闭按钮画两遍），
  //    一按「技能」整个面板换了个样——用户的原话是「一切换换一套操作逻辑」。
  //    所以现在**只有一处** head + subRow，能力层与模式层都归外壳。
  //
  // 3) **只有 .dsh-mcp-d-body 滚**：head / 通知条 / subRow 全是 flex:none。
  //    通知条进流（而不是浮在头部之上）也是为了让 Tab 行的位置恒定——有没有通知都一样。
  const head = h('div', { className: 'dsh-mcp-head' },
    // 标题是**常量**「扩展中心」，能力名由旁边的分段控件承载。
    // 之前这里写的是当前面的名字（「技能」/「MCP 市场」），标题随切面变、和分段控件
    // 说的是同一件事，等于把同一信息说两遍，还让用户以为换了个地方。
    h('div', { className: 'dsh-mcp-title' }, t('扩展中心')),
    // 第二列：能力层。**单独一列**，不塞进操作区里——塞进去它就跟按钮一起被推到同一边，
    // 而原型是「能力层贴标题在左、功能按钮贴右」。
    abilityTabs,
    // 第三列：功能按钮，内容右对齐。作用域由第二行的药丸承载，按钮文案不再重复项目名：
    // 项目名长度不可控，塞进按钮会把工具栏挤到换行；完整作用域放在药丸的 title 里。
    h('div', { className: 'dsh-mcp-head-actions' },
      ability === 'mcp' && mode === 'manage'
        ? h(Btn, { icon: 'refresh', onClick: () => load(true), disabled: refreshing, children: refreshing ? t('刷新中…') : t('刷新') })
        : null,
      ability === 'mcp' ? h(Btn, { onClick: () => setImportOpen(true), title: t('导入 MCP（{scope}）', { scope: scopeName }), children: t('导入 MCP') }) : null,
      ability === 'mcp'
        ? h(Btn, { cls: 'primary', icon: 'plus', onClick: openAdd, title: (scope === 'global' ? t('添加 MCP') : t('添加项目 MCP')) + t('（{name}）', { name: scopeName }), children: scope === 'global' ? t('添加 MCP') : t('添加项目 MCP') })
        // 技能面这里**不放「发现技能」**：市场已经是第二行那个模式分段（同一屏、同一位置）。
        // 两个入口指向同一件事，正是「同一个概念两个渲染者」——用户会问「这两个按钮一样吗」。
        // 技能面也没有「添加技能」这个动作（安装走市场，创建要新 RPC），所以主行为位留空。
        : null,
      h(EntryMenu, null),
    ),
    // 关闭按钮**不在**上面那一列里：它单独占 grid 第四列。与技能面来回切换时
    // 操作区的按钮数量差 5 倍，一起 flex-end 会让「关闭」每次横移几百像素。
    onClose ? h(Btn, { icon: 'x', onClick: onClose, children: t('关闭') }) : null,
  );

  // 统计取**当前看得见的那一批**（filtered），不是全量 servers。
  // 底栏就贴在列表下面：写着「25 个技能」而屏幕上只有 12 行，读起来像 bug；
  // 作用域的总量由上面那颗药丸自己带着（它写的就是 12），不必在这里再说一遍。
  //
  // 一键「全部延迟」：两个作用域都能用，各写各的文件。
  //   全局 → setDeferAll({defer})  改 <profile>/cordis.patch.yml
  //   项目 → setDeferAll({wsPath, defer})  改 <项目>/.dsh/mcp.json
  // **计数取当前作用域的全量行（servers），不是筛选后的 filtered**：Host 的 setDeferAll
  // 遍历 patch/项目配置里的全部 managed 条目，一次全改。按 filtered 算的话，一有筛选，
  // 按钮 title 写「所有 MCP（N 个）」而完成后 toast 写「已把 M 个服务器…」——同一次交互
  // 两个数，而用户没有任何理由知道该信哪个。项目作用域要打开 includeWorkspace，
  // 否则项目行全被滤掉、按钮永远禁用。
  const deferAll = deferAllState(servers, scope === 'global' ? {} : { includeWorkspace: true });
  const mcpListFooter = h(ListFooter, {
    text: mcpStatsText(filtered),
    sortKey: mcpSort,
    onSort: setMcpSort,
    onRefresh: () => load(true),
    refreshing,
    sortTitle: t('排序 MCP'),
  });

  // 「全部延迟」的**唯一**渲染处：列表的过滤器行（ServerList 的 toolbarAction）。
  // 曾经它同时出现在底栏，一屏放不下时用户根本看不到——现在是唯一入口，位置固定在第一屏。
  const deferAllAction = {
    label: deferAll.all ? t('取消全部延迟') : t('全部延迟'),
    title: (deferAll.all
      ? (scope === 'global'
        ? t('把当前 Web profile 的所有 MCP 切回全量常驻（{count} 个）', { count: deferAll.total })
        : t('把该项目的所有 MCP 切回全量常驻（{count} 个）', { count: deferAll.total }))
      : (scope === 'global'
        ? t('把当前 Web profile 的所有 MCP 切到延迟加载（{count} 个）：模型经 tool_search 按需搜索，命中后才进工具列表', { count: deferAll.total })
        : t('把该项目的所有 MCP 切到延迟加载（{count} 个）：模型经 tool_search 按需搜索，命中后才进工具列表', { count: deferAll.total }))),
    disabled: deferAll.total === 0 || busy,
    onClick: () => setDeferAll(!deferAll.all),
  };

  // 市场里的「安装到」候选：全局 + 每个工作区。
  // ⚠️ 与「已安装」模式的药丸是**同一份 state**（scope / switchScope）——
  // 两个控件、两个模式，任一时刻只显示一个，所以不存在两个真值。
  // MCP 的落盘位置只有 `<profile>/mcp.json`（全局）与 `<项目>/.dsh/mcp.json`（项目）
  // 两种，没有 `.agents/` 变体（那是 skills 侧的社区约定，见 skillScopeOptions）。
  const scopeChoices = useMemo(() => [
    { key: 'global', label: t('全局（当前 profile）'), title: t('写入当前 Web profile 的 MCP 配置，所有项目共享') },
    ...(Array.isArray(workspaces) ? workspaces : []).map((ws) => ({
      key: ws.path,
      label: t('项目 {name}', { name: ws.name || projectLabelOf(ws.path) }),
      title: t('{path}（.dsh/mcp.json，只对该项目的会话生效）', { path: ws.path }),
    })),
  ], [workspaces]);

  const mcpBody = mode === 'market'
    ? h(McpMarketView, {
      call, busy, setBusy,
      onInstalled: onBuiltinsInstalled,
      scope, scopeName,
      scopeOptions: scopeChoices,
      onScope: switchScope,
      knownNames: servers,
      // 从表头按钮进来的一次性切换已经删掉，市场现在是模式层的一种，进来就加载。
      active: true,
    })
    : (scope === 'global'
      ? h(
        'div',
        { className: 'dsh-mcp-body' },
        h(ServerList, {
          servers: sortServers(filtered, mcpSort),
          total: servers.length,
          selected,
          query,
          onQuery: setQuery,
          onSelect: setSelected,
          onToggle,
          onToggleDefer: toggleDeferOne,
          busy,
          transportFilter,
          statusFilter,
          onTransportFilter: setTransportFilter,
          onStatusFilter: setStatusFilter,
          footer: mcpListFooter,
          toolbarAction: deferAllAction,
        }),
        h(ServerDetailPane, {
          server: selectedServer,
          tools,
          onToggle,
          onReconnect,
          onEdit: openEdit,
          onRemove,
          busy,
          onReveal,
          revealed,
          onCopy,
        }),
      )
      : h(
        'div',
        { className: 'dsh-mcp-body' },
        // 两份来源共用左栏，切换只换列表，右侧详情始终保留。
        h('div', { className: 'dsh-mcp-ws-body', key: scope, 'data-ws-path': scope },
          h('div', { className: 'dsh-mcp-section local' },
            h('div', { className: 'dsh-mcp-source-tabs', role: 'tablist', 'aria-label': t('MCP 来源') },
              h('button', { type: 'button', role: 'tab', 'aria-selected': !globalOpen,
                onClick: () => { setGlobalOpen(false); setSelected(''); } },
                t('项目 MCP'), h('span', null, servers.length)),
              h('button', { type: 'button', role: 'tab', 'aria-selected': globalOpen,
                title: t('共享的全局 MCP'), onClick: () => { setGlobalOpen(true); setSelected(''); } },
                t('全局共享'), h('span', null, globalServers.length)),
            ),
            !globalOpen && servers.length > 0 ? h('div', { className: 'dsh-mcp-section-actions' },
              h(Btn, { cls: 'sm ghost', disabled: busy,
                title: t('导出本项目的 MCP 配置（JSON，可备份、跨机器迁移或分享）'),
                onClick: () => setExportOpen(true), children: t('导出') }),
              h(Btn, { cls: 'sm ghost', disabled: busy,
                title: t('把本项目的 MCP 复制到另一个已注册的工作区'),
                onClick: () => setCopyOpen(true), children: t('复制到…') }),
            ) : null,
            globalOpen ? h(React2.Fragment, null,
              h(GlobalServerList, { servers: globalServers, exclude, onToggleExclude, onSelect: setSelected, selected, busy }),
              h(ListFooter, { text: t('{visible}/{total} 可见', { visible: visibleGlobalCount, total: globalServers.length }),
                onRefresh: () => load(true), refreshing }),
            ) : h(ServerList, {
              servers: sortServers(filtered, mcpSort),
              total: servers.length,
              selected,
              query,
              onQuery: setQuery,
              onSelect: setSelected,
              onToggle,
              onToggleDefer: toggleDeferOne,
              busy,
              transportFilter,
              statusFilter,
              onTransportFilter: setTransportFilter,
              onStatusFilter: setStatusFilter,
              embedded: true,
              workspace: true,
              emptyHint: t('还没有项目 MCP。点上方「添加项目 MCP」，或去「发现市场」安装。'),
              footer: mcpListFooter,
              toolbarAction: deferAllAction,
            }),
          ),
        ),
        h(ServerDetailPane, {
          server: selectedServer,
          tools,
          onToggle,
          onReconnect,
          onEdit: openEdit,
          onRemove,
          busy,
          onReveal,
          revealed,
          onCopy,
          excluded: exclude.includes(selected),
          onToggleExclude,
          emptyTitle: !globalOpen && servers.length === 0 ? t('此项目还没有 MCP') : undefined,
          emptyActions: !globalOpen && servers.length === 0 ? [
            h(Btn, { key: 'add', cls: 'primary', icon: 'plus', onClick: openAdd, children: t('添加项目 MCP') }),
            h(Btn, { key: 'market', onClick: () => setMode('market'), children: t('发现市场') }),
          ] : undefined,
        }),
      ));

  // workspaces 由 McpTab 传下去：它已经用**正确的** call（mcpManager）取到了列表，
  // 而 SkillsPanel 手上的 call 是 callSkills（skillsManager），自己取会静默失败。
  //
  // 模式 / 作用域药丸 / 排序都**由外壳持有**（它们是第二行与底栏的一部分），
  // 这里只把值传进去——SkillsPanel 因此只负责「技能面那具身体」。
  const skillsBody = h(SkillsPanel, {
    call: callSkills,
    workspaces: workspacePaths,
    mode,
    scopeFilter,
    onScopeFilter: setScopeFilter,
    sortKey: skillSort,
    onSort: setSkillSort,
    onSummary: onSkillsSummary,
    // 技能面的行动作失败时要说出宿主的原话（见 SkillsPanel 里 act 的说明）——与 MCP 面共用这一条 flash。
    flash,
  });

  const inner = h(
    'div',
    { className: 'dsh-mcp-wrap' },
    head,
    ...notices,
    ability === 'tool-loading' ? null : subRow,
    ability === 'skills'
      ? skillsBody
      : ability === 'tool-loading'
        ? h(ToolLoadingModal, {
          open: true,
          inline: true,
          onClose: () => {},
          call,
          onSaved: (_fresh, note) => flash(note || t('已保存工具加载策略')),
        })
        : mcpBody,
    h(AddEditModal, { open: addOpen, onClose: () => { setAddOpen(false); setEditTarget(null); }, onSubmit, busy, initial: editTarget, onRevealValue: revealValue, revealEpoch: revealGeneration.current, scope, scopeName }),
    h(JsonImportModal, { open: importOpen, onClose: () => setImportOpen(false), call, busy, setBusy, onImported, scope, scopeName }),
    // 更新提示也挂在面板的弹层列表里：面板一开它就挂载，向宿主问一次「这次变了什么」。
    h(WhatsNewModal, { call }),
    h(WorkspaceExportModal, { open: exportOpen && scope !== 'global', onClose: () => setExportOpen(false), call, scope, scopeName }),
    h(WorkspaceCopyModal, {
      open: copyOpen && scope !== 'global',
      onClose: () => setCopyOpen(false),
      call,
      busy,
      setBusy,
      onCopied: onCopiedToWorkspace,
      from: scope,
      fromName: scopeName,
      servers,
      workspaces,
    }),
    toast
      ? h('div', { className: 'dsh-mcp-toast ' + toast.kind }, toast.msg)
      : null,
  );

  return wrapFloating(inner);
};


// ── 右下角浮动按钮（shell.overlay 常驻，可拖拽 + 记忆位置）──────────────
// shell.overlay 是「叠加式」挂载层，DSH 不做多插件避让，所以按钮定位由本插件
// 自己负责：默认右下角，用户可拖动到任意位置，位置存 localStorage 跨会话还原。
//
// 跟手性要点（参考 dnd-kit / react-draggable / 社区 FAB 拖拽惯例）：
// - 拖拽期间直接写 DOM，不走 setState：pointermove 高频，每个事件都让 React 重渲染
//   会掉帧、不跟手；最终位置只在松手时提交一次。
// - Pointer Events + setPointerCapture 统一鼠标/触摸/笔，快速拖动不丢事件。
// - touch-action:none 是触摸下唯一可靠的滚动抑制手段（iOS Safari 尤其如此）。
//   本按钮是 position:fixed 的 50px 圆钮，脱离文档流，left/top 重绘成本可忽略，
//   故保留 left/top 定位以复用现有 :hover/:active 的 transform 缩放反馈。
const FAB_POS_KEY = 'dsh-mcp-manager-ui/fab-pos';
const FAB_SIZE = 48;
const FAB_EDGE = 22;
const DRAG_THRESHOLD = 5;

function fabViewport() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  return { w, h };
}
function clampFabPos(x, y) {
  const { w, h } = fabViewport();
  return {
    x: Math.min(Math.max(x, 0), Math.max(0, w - FAB_SIZE)),
    y: Math.min(Math.max(y, 0), Math.max(0, h - FAB_SIZE)),
  };
}
function defaultFabPos() {
  const { w, h } = fabViewport();
  return { x: w - FAB_SIZE - FAB_EDGE, y: h - FAB_SIZE - FAB_EDGE };
}
function readFabPos() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(FAB_POS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Number.isFinite 兜底：JSON 里 1e999 会解析成 Infinity，typeof number 挡不住，
    // 混进 clamp 会产出 NaNpx 让按钮凭空消失。
    if (!parsed || typeof parsed.x !== 'number' || typeof parsed.y !== 'number' || !Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return clampFabPos(parsed.x, parsed.y);
  } catch {
    return null;
  }
}
function saveFabPos(pos) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FAB_POS_KEY, JSON.stringify({ x: pos.x, y: pos.y }));
  } catch {
    // 存储不可用（无痕/禁用）：拖拽仍可用，只是不跨会话记忆。
  }
}

// ── 面板开合状态：悬浮按钮与左侧栏入口共享同一份 ──────────────────────────────
// 两个入口分属不同的 slot 子树（shell.overlay / sidebar.footer.action），没有公共
// React 祖先，因此用模块级订阅而不是 context。单一数据源：两个入口看到的开关状态
// 永远一致，不会出现「一个说开着、一个说关着」。
function createPanelVisibility() {
  let open = false;
  const listeners = new Set();
  return {
    isOpen: () => open,
    set(next) {
      if (open === next) return;
      open = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
const panelVisibility = createPanelVisibility();

const usePanelOpen = () => {
  const [open, setOpen] = useState(panelVisibility.isOpen());
  useEffect(() => panelVisibility.subscribe(() => setOpen(panelVisibility.isOpen())), []);
  return open;
};

// ── 当前语言版本：让 effect 依赖能感知语言切换 ──────────────────────────────
// 组件渲染时直接读 localeActive 就够了（宿主每个 outlet 在语言切换时都会重渲染），
// 但 **effect 依赖不行**：切语言不会改变任何 props/state，依赖里没有它，
// 「按语言重新拉取」这类 effect 就不会跑（真机表现：切英文后技能市场的描述与
// 分类名停在中文，要等下次搜索/重挂才变）。所以给语言一个版本号 store，
// readActive 在语言真变时 bump，组件用 useLocaleVersion() 把它列进依赖。
function createLocaleVersion() {
  let version = 0;
  const listeners = new Set();
  return {
    get: () => version,
    bump: () => {
      version += 1;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
const localeVersion = createLocaleVersion();
const useLocaleVersion = () => {
  const [version, setVersion] = useState(localeVersion.get());
  useEffect(() => localeVersion.subscribe(() => setVersion(localeVersion.get())), []);
  return version;
};

// ── 入口显示偏好：两个入口都可关，但不能都关 ─────────────────────────────────
// 面板只能从这两个入口打开（右下角悬浮按钮 / 左侧栏底部「MCP」）。所以「两个都关」是一
// 个必须**无法表达**的状态：真出现了，用户就再也打不开面板，只能手改 localStorage 回来。
// 这里因此不存两个 boolean，而是存一张「模式 → 入口可见性」表：非法组合在表里根本不存在，
// 不需要额外的守卫、禁用逻辑或「至少留一个」的提示文案。新增入口时，这张表的不变式
// （每一项至少一个入口可见）由 test/client-entry.test.mjs 直接对表断言。
const ENTRY_KEY = 'dsh-mcp-manager-ui/entry';
const ENTRY_VISIBILITY = {
  both: { fab: true, sidebar: true },
  fab: { fab: true, sidebar: false },
  sidebar: { fab: false, sidebar: true },
};
// 同 SCOPE_LABELS：存中文原文，渲染时翻。
const ENTRY_LABELS = {
  both: '悬浮按钮 + 侧栏入口',
  fab: '仅悬浮按钮',
  sidebar: '仅侧栏入口',
};
const ENTRY_DEFAULT = 'both';
const ENTRY_MODES = Object.keys(ENTRY_VISIBILITY);

// localStorage 是外部输入（旧版本写的、用户手改的）：不认识的值一律退回默认，
// 不半信半疑地拿去查表（查不到会得到一个 undefined 的可见性，等于悄悄关掉所有入口）。
function normalizeEntryMode(value) {
  return Object.prototype.hasOwnProperty.call(ENTRY_VISIBILITY, value) ? value : ENTRY_DEFAULT;
}
function readEntryMode() {
  try {
    if (typeof localStorage === 'undefined') return ENTRY_DEFAULT;
    return normalizeEntryMode(localStorage.getItem(ENTRY_KEY));
  } catch {
    return ENTRY_DEFAULT;
  }
}
function saveEntryMode(mode) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(ENTRY_KEY, mode);
  } catch {
    // 存储不可用（无痕 / 被禁用）：本次会话内仍然生效，只是不跨会话记忆。
  }
}
function createEntryMode() {
  let mode = readEntryMode();
  const listeners = new Set();
  return {
    get: () => mode,
    set(next) {
      const normalized = normalizeEntryMode(next);
      if (normalized === mode) return;
      mode = normalized;
      saveEntryMode(mode);
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
const entryMode = createEntryMode();

const useEntryMode = () => {
  const [mode, setMode] = useState(entryMode.get());
  useEffect(() => entryMode.subscribe(() => setMode(entryMode.get())), []);
  return mode;
};

// shell.overlay 那个注册里到底渲染什么：面板挂载点与悬浮按钮是两件事——
//   面板：只要 open 就渲染。侧栏入口只改 panelVisibility，真正渲染面板的是这里，
//         所以把面板也用入口偏好门住 = 关掉悬浮按钮后侧栏入口点了没反应（把自己锁死）。
//   按钮：才看入口偏好，且只在面板没开着时占位。
// 抽成纯函数也是为了让这条不变式能脱离 React 被测：测试替身的 hooks 是空实现，组件本身
// 在 node 里渲染不起来（见 test/client-entry.test.mjs）。
function overlaySeats(mode, open) {
  return { panel: open, fab: !open && ENTRY_VISIBILITY[mode].fab };
}

// 入口偏好的开关就放在面板头部：它必须能从面板里改回来（关掉一个入口后用户还在面板里），
// 而面板本身只有这两个入口能打开——所以这个控件不能藏得更深。低频操作，用图标按钮 + 弹层，
// 不占 Tab（作用域 tab 讲的是「管哪一份配置」，与显示偏好无关）。
const EntryMenu = () => {
  const mode = useEntryMode();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!boxRef.current || !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);
  return h(
    'div',
    { className: 'dsh-mcp-entry', ref: boxRef },
    h(Btn, {
      icon: 'entry',
      title: t('入口显示：{mode}', { mode: t(ENTRY_LABELS[mode]) }),
      onClick: (e) => { e.stopPropagation(); setOpen((value) => !value); },
      children: t('入口'),
    }),
    // 行用原生 <button> 而不是 div[role=menuitemradio]：menu 语义要求方向键 / Home / Esc /
    // roving tabindex 一整套键盘行为，不实现就等于这个设置对键盘用户不存在，还多了一句假声明。
    // 原生按钮免费给到 Tab 与 Enter/Space，状态用 aria-pressed 表达（与面板里那个眼睛开关同一个惯用法）。
    open ? h('div', { className: 'dsh-mcp-tab-pop dsh-mcp-entry-pop' },
      ENTRY_MODES.map((value) =>
        h('button', {
          key: value,
          type: 'button',
          'aria-pressed': mode === value,
          className: 'dsh-mcp-entry-item' + (mode === value ? ' sel' : ''),
          onClick: () => { entryMode.set(value); setOpen(false); },
        }, t(ENTRY_LABELS[value])),
      ),
    ) : null,
  );
};

// 左侧栏底部入口（sidebar.footer.action，DSH 0.1.5 起提供）：官方标准的发现入口。
// 点击打开的是同一个浮层面板——不切换主面板、不打断正在进行的会话。
const McpFooterAction = ({ wide }) => {
  const open = usePanelOpen();
  const mode = useEntryMode();
  // 文案层补接的第二个时机：侧栏入口比面板更早挂载（页面加载就渲染），桌面壳下
  // 在这里补接，用户还没点开面板语言就已经跟上。幂等，overlay 挂载时那次是兜底。
  useEffect(() => { ensureLocaleWired() }, []);
  // 「仅悬浮按钮」模式：返回 null 就够了，不需要注销注册。list 型 slot 的每个条目直接渲染
  // 进侧栏的 .footerActions（display:flex、无 gap/padding），外层 outlet 锚点又是
  // display:contents，所以空子树不占任何布局、也不留空行。
  if (!ENTRY_VISIBILITY[mode].sidebar) return null;
  return h(
    'button',
    {
      type: 'button',
      className: 'dsh-mcp-footer-action' + (wide ? '' : ' rail'),
      title: t('工具箱面板'),
      'aria-label': t('打开工具箱面板'),
      'aria-expanded': open,
      onClick: () => panelVisibility.set(true),
    },
    h(Icon, { d: ICONS.plug, size: wide ? 16 : 18 }),
    wide ? h('span', { className: 'dsh-mcp-footer-name' }, t('工具箱')) : null,
  );
};

// ── 更新提示：升级后说一次「这次变了什么」────────────────────────────
// 为什么要有它：新能力只写在 README / release note 里，用户根本不会去找——面板头部的
// 「入口」开关就是这么被忽略掉的。所以升级后主动说一次，并指出它在哪。
// 内容真源在 lib/whats-new.js（宿主侧），这里只管「这次该不该说」：
//   - 记的是「上次确认过的版本」（与 updateHint 的 dismissed 同一个惯用法，确认才落盘）；
//   - 认得出上次那版 → 报它之后的全部（跨版本升级不漏）；
//   - 认不出（新装，或从还没有这个功能的版本升上来）→ 只报当前这一条。这两者从
//     localStorage 里分不辨，而后者正是要覆盖的人，所以偏向「说一次」，代价只是新装
//     用户看到一条本次更新。
const WHATS_NEW_SEEN_KEY = 'dsh-mcp-manager-ui.whatsNew.seen';

// ── 一键升级：借官方 pluginManager，不自己 spawn 包管理器 ──────────────
// 为什么能这么做：`@deepseek-ai/dsh-plugin-manager` 随 dsh-base / dsh-web-app 提供
// （人人都有，不依赖任何第三方市场插件），它把 installBundle 挂进共享的 ctx.remote。
// 官方 UI 自己不做升级（它的安装对话框会先拦「该插件已安装。如需升级，请卸载后重新安装」），
// 但那个拦截发生在 inspect()（仅按包名判重），而 installBundle 自己**不调 inspect**——
// 所以覆盖安装是它的既定能力，官方只是没在 UI 上开放。
//
// 为什么值得做：升级 = 改用户机器上的安装，而覆盖安装由官方完成版本校验与失败还原
// （executePluginCommand 失败时 restoreFiles 会回滚 manifest/lockfile）。自己 spawn pnpm
// 就要把 Windows 的 .cmd 外壳、pnpm 9/10/11 差异、跨平台 PATH 全部重做一遍。
const UPGRADE_NAMESPACE = 'pluginManager';
const UPGRADE_METHOD = 'installBundle';
const UPGRADE_PACKAGE = 'dsh-toolbox-ui';

/**
 * 这次升级能不能做、为什么不能——纯判定，便于单测。
 *
 * 三种「不能升」的来源各不相同，报给用户的话也必须不同：
 *   - 宿主没提供 pluginManager（老宿主 / 非 web 形态）→ 退回手动命令；
 *   - 插件不是 npm 装的（link:/file:/github:）→ 覆盖安装会把它换成 npm 包，不能做；
 *   - 当前版本不低于最新 → 无需升级。
 *
 * @param {object} input - 判定输入。
 * @param {object|null} input.service - 探测到的 pluginManager 命名空间（null = 宿主没提供）。
 * @param {object|null} input.hint - updateHint 的结果（current / latest / updateAvailable）。
 * @param {object|null} input.bundle - listBundles 里本插件那一行（source / installed / version）。
 * @returns {{supported: boolean, reason: string, spec: string|null, canRestart: boolean}} 判定结果。
 */
function upgradePlan({ service, hint, bundle }) {
  const hasMethod = !!service && typeof service[UPGRADE_METHOD] === 'function';
  if (!hasMethod) return { supported: false, reason: 'no-service', spec: null };
  if (!hint?.updateAvailable || !hint?.latest) return { supported: false, reason: 'up-to-date', spec: null };
  // 本地安装形态（link:/file:/github:/tarball）不归 installBundle 管：拿 npm spec 覆盖会把
  // 用户的本地开发链接换成 npm 包，那是破坏而不是升级。只认 registry 来源。
  const source = typeof bundle?.source === 'string' ? bundle.source : '';
  const isRegistry = source === '' || /^\d|^\^|^~|^latest$/.test(source);
  if (!isRegistry) return { supported: false, reason: 'not-npm', spec: null };
  return {
    supported: true,
    reason: 'ok',
    // 带 ^：与 profile 里已有的前缀风格一致（实测 pnpm 沿用原 spec 前缀，不会因这次调用
    // 把 `^1.4.2` 改成精确的 `1.4.2`，所以用户不会因此失去 `dsh plugin update` 的自动升级）。
    spec: `${UPGRADE_PACKAGE}@^${hint.latest}`,
    // 目标版本随判定一起带出来：升级完成后 updateHint 会被宿主刷成「已是最新」，
    // 那时就没有版本可显示了，必须在这里记住。
    version: hint.latest,
  };
}

/**
 * 从官方 `packageResult.output` 里挑出**pnpm 自己说的那句话**。
 *
 * 为什么不直接把 output 贴上去：它整段是 pnpm 的完整输出（进度行、`npm notice` 噪声、
 * 可能还有 ANSI 颜色码），几千字符贴进横幅等于没说话。这里只取"有信息量"的末尾几行。
 *
 * 为什么值得做：真机实测过一次失败，面板只显示「错误码 operation-error，pnpm 退出码
 * 3221226505」（那个退出码是 Windows 上的崩溃码），而 pnpm 原文写得很清楚：
 * `ERR_PNPM_NO_MATCHING_VERSION … The latest release of <包名> is "1.5.3"`。
 * 官方早就把这段放在 `packageResult.output` 里回给我们了，之前一直没用。
 */
function pnpmOutputTail(output, limit = 3) {
  const text = typeof output === 'string' ? output : '';
  if (!text) return '';
  const lines = text
    // eslint-disable-next-line no-control-regex
    .replace(/\u001b\[[0-9;]*m/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^npm (notice|warn)\b/.test(line) && !/^Progress:/.test(line));
  if (lines.length === 0) return '';
  // 从**最后一条报错行**起取（含它后面那几行）：pnpm 把结论写在报错行的紧后面——
  // `[ERR_PNPM_NO_MATCHING_VERSION] No matching version found for <包名>@1.6.0` 的下一行就是
  // `The latest release of <包名> is "1.5.3".`，那句才是用户最需要的。只挑含 error 的行会把它丢掉。
  // 没有报错行时取末尾几行（pnpm 同样把结论放在最后）。
  const errorAt = lines.reduce((found, line, index) => (/ERR_|error|Error|failed|ENOENT|ETIMEDOUT|ENOTFOUND|E404|EACCES/.test(line) ? index : found), -1);
  const picked = errorAt >= 0 ? lines.slice(errorAt, errorAt + limit) : lines.slice(-limit);
  const joined = picked.join(' ').replace(/\s+/g, ' ').trim();
  return joined.length > 300 ? joined.slice(0, 297) + '…' : joined;
}

/**
 * 升级失败时给用户看的话。
 *
 * 为什么不能只写「升级失败」：desktop 直接改当前 profile 且**没有自动回滚**（见
 * deepseek-harness 的 desktop-in-place-profile 决策），用户必须知道发生了什么、下一步做什么。
 * 这些码来自 plugin-manager 的 ManagementError.code，逐个给出可操作的解释；**未知码**则把
 * 码、退出码和 pnpm 的原文一起带出来——只写一个崩溃码，用户和我们都不无从查起。
 * @param {object|null} error - ChangeResult.error（{code, diagnostic?}）。
 * @param {number|null} exitCode - pnpm 退出码。
 * @param {string|null} output - ChangeResult.packageResult.output（pnpm 的原始输出）。
 * @returns {string} 中文说明。
 */
function upgradeFailureText(error, exitCode, output) {
  const code = error?.code;
  const known = {
    'incompatible-version': t('新版本与当前 DSH 不兼容，未升级。'),
    'not-bundle': t('该包没有声明组合包，不能作为插件安装。'),
    'invalid-spec': t('版本号不合法，未升级。'),
    'ambiguous-install': t('无法确定要升级哪个包，未升级。'),
    'unknown-plugin': t('在 profile 里找不到这个插件，未升级。'),
    'stop-profile': t('宿主正在停止，未升级；请重启后再试。'),
    'bundle-in-use': t('该包正在被使用，未升级。'),
    'stale-approval': t('构建授权已过期，未升级；请重试。'),
    'management-required': t('当前 profile 由应用托管，不允许在这里改动。'),
    'unaddressable': t('这一项无法被单独改动（随 DSH 提供）。'),
  };
  if (known[code]) return known[code];
  // 未知码不吞掉：把码和 pnpm 的退出码如实带出来，否则用户和我们都无从查起。
  const bits = [];
  if (code) bits.push(t('错误码 {code}', { code }));
  if (typeof exitCode === 'number' && exitCode !== 0) bits.push(t('pnpm 退出码 {code}', { code: exitCode }));
  const tail = pnpmOutputTail(output);
  // 已知码的解释已经说清了原因，就不再拿 pnpm 的输出淹没它；未知码才把原文接上。
  if (tail) return (bits.length ? t('升级失败（{bits}）：', { bits: bits.join(t('，')) }) : t('升级失败：')) + tail;
  return bits.length ? t('升级失败（{bits}）。', { bits: bits.join(t('，')) }) : t('升级失败。');
}

function whatsNewFor(current, lastSeen, entries) {
  if (!current || !Array.isArray(entries) || entries.length === 0) return [];
  if (lastSeen === current) return [];
  const index = entries.findIndex((entry) => entry.version === lastSeen);
  return index >= 0 ? entries.slice(index + 1) : entries.filter((entry) => entry.version === current);
}

// 自带 RPC 与状态：面板只管「在这儿渲染一个」。它挂在面板里，就自然随面板挂载/卸载——
// 这正是「升级后第一次打开面板时弹一次」的触发点，不需要另外判开合。
const WhatsNewModal = ({ call }) => {
  const [notice, setNotice] = useState(null);
  const boxRef = useRef(null);
  const confirmRef = useRef(null);
  const bouncedRef = useRef(null);

  // 打开面板时问一次有没有「这次更新」要讲。RPC 失败 / 服务未连接时静默：与 updateHint
  // 同一条理由（纯增值信息，不允许影响面板可用性，也不该在控制台报错吓人）。
  useEffect(() => {
    let alive = true;
    call('whatsNew')
      .then((res) => {
        if (!alive || !res || !res.ok || !Array.isArray(res.entries)) return;
        let seen = null;
        try { seen = localStorage.getItem(WHATS_NEW_SEEN_KEY); } catch { /* 存储不可用：这次仍提示，只是下次还会提示 */ }
        const unseen = whatsNewFor(res.current, seen, res.entries);
        if (unseen.length) setNotice({ current: res.current, entries: unseen });
      })
      .catch(() => { /* 见上：提示失败不影响面板 */ });
    return () => { alive = false; };
  }, []);

  const dismiss = () => {
    try { if (notice?.current) localStorage.setItem(WHATS_NEW_SEEN_KEY, notice.current); } catch { /* 存储不可用：本次关闭有效，下次打开面板会再提示一次 */ }
    setNotice(null);
  };

  // 自己弹出来的东西，键盘可达性就是它自己的责任，而它比面板里那几个多一个坑：
  // 宿主应用会把焦点抢到自己的输入框，所以不能“延迟一点再 focus”——那是在赌对方的时序。
  // 这里用“焦点守卫”：任何落在弹框外的 focusin 都拉回来，同时记下对方本来想聚焦谁，
  // 关闭时还给它（不猜选择器，也不改应用的 DOM）。Esc 关闭；点击遮罩关闭已支持。
  // 依赖跟 notice 而不是空数组：没提示时不该装监听；也不跟 onClose，否则父组件每次重渲染
  // 都会把焦点反复抢回按钮。
  useEffect(() => {
    if (!notice) return undefined;
    confirmRef.current?.focus();
    const onFocusIn = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) {
        bouncedRef.current = event.target;
        confirmRef.current?.focus();
      }
    };
    // 捕获阶段 + stopPropagation：提示渲染在面板内部，而面板自己也有 Esc 处理器（关面板），
    // 不拦住的话按一次 Esc 会把面板和提示一起关掉。这样 Esc 只关最内一层，再按一次才关面板。
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      dismiss();
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('keydown', onKeyDown, true);
      const target = bouncedRef.current;
      // 尽力而为：对方可能在弹框期间重建了那个节点（实测过），那就让它留在插件自己的界面上，
      // 而不是去猜一个选择器把焦点塞回应用内部。
      if (target && document.contains(target) && typeof target.focus === 'function') target.focus();
    };
  }, [notice]);

  if (!notice) return null;
  return h(
    'div',
    { className: 'dsh-mcp-overlay', onClick: (e) => e.target === e.currentTarget && dismiss() },
    h(
      'div',
      { ref: boxRef, className: 'dsh-mcp-whatsnew', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('本次更新内容') },
      h('div', { className: 'dsh-mcp-whatsnew-head' },
        // 版本中性：首次打开（没有任何记录）与从旧版本升上来走的是同一个分支，
        // 写「更新到」会把前者的文案说错。
        h('b', null, t('v{version} 的更新', { version: notice.current })),
        h('span', null, t('这些变化你可能想知道')),
      ),
      h('div', { className: 'dsh-mcp-whatsnew-body' },
        notice.entries.map((entry) =>
          h('div', { key: entry.version, className: 'dsh-mcp-whatsnew-entry' },
            // 一次跳多个版本时每条自带版本号；只报一条时标题里的版本号就够了。
            notice.entries.length > 1 ? h('div', { className: 'dsh-mcp-whatsnew-ver' }, 'v' + entry.version) : null,
            entry.items.map((item, position) =>
              h('div', { key: position, className: 'dsh-mcp-whatsnew-item' },
                h('span', { className: 'dsh-mcp-whatsnew-dot', 'aria-hidden': true }, '·'),
                h('span', null,
                  localized(item.text),
                  item.where ? h('span', { className: 'dsh-mcp-whatsnew-where' }, localized(item.where)) : null,
                ),
              ),
            ),
          ),
        ),
      ),
      h('div', { className: 'dsh-mcp-whatsnew-foot' },
        h('button', { ref: confirmRef, type: 'button', className: 'dsh-mcp-btn primary', onClick: dismiss }, t('知道了')),
      ),
    ),
  );
};

// ── 技能能力面：管理（左列表 + 右详情）与市场（卡片网格）──────────────────
// 复用既有原子（Toggle / Badge / Btn / Icon / 空状态 / toast），不另造一套。

/**
 * 能力层枚举：MCP / 技能。计数由外壳填（技能的来自 SkillsPanel 回传）。
 *
 * ⚠️ label 存**中文原文**，由 seg 的渲染点过 t()。这里不写成 t('技能')：
 * 模块级求值发生在 apply() 拿到 locale 之前，会把语言锁死在加载那一刻——
 * 真机表现正是「能力层那个『技能』页签切到 English 后仍是中文」。
 */
const ABILITY_TABS = [
  { id: 'mcp', label: 'MCP' },
  { id: 'skills', label: '技能' },
  { id: 'tool-loading', label: '工具' },
];

/**
 * 模式层枚举：已安装 / 发现市场。**两个能力面共用这一套**，由外壳渲染在第二行。
 *
 * 曾经它叫「管理 / 市场」且由技能面自己画：MCP 面的市场是一个弹窗按钮、技能面的市场是
 * 一个模式切换——同一个概念两种形态。现在两边都是第二行上的同一个分段控件。
 */
// 同 ABILITY_TABS：label 存中文原文，由 seg 的渲染点过 t()（模块级 t() 会锁死语言）。
const SKILL_MODES = [
  { id: 'manage', label: '已安装' },
  { id: 'market', label: '发现市场' },
];

const SkillsEmpty = ({ text }) => h('div', { className: 'dsh-skills-empty' }, text);

/**
 * 让位提示（D15）：检测到**另一个** MCP 管理插件时，本插件不注册入口，只说明情况。
 *
 * 为什么是「让位」而不是「两个都装」：两个 MCP 管理面板同时在场时，它们的悬浮按钮、
 * 侧栏入口会互相遮挡，且都写同一份 profile 配置——用户看到的是两个都在、却不知该信哪个。
 * 所以后装的那个主动退出，只留一条可关闭的说明。
 *
 * 反过来「检测失败必须 fail-open」（SPEC 约束 10）：漏检最坏是两个入口并存（可自愈），
 * 误判则用户**完全打不开面板**——代价不对称，所以拿不准时照常注册（见 apply 的判定）。
 *
 * ⚠️ 它渲染在**面板之外**（入口被占的位置），所以走通知条原语时要自带定位：
 * .dsh-mcp-notice-dock 就是为这个场景加的，别在别处复用。
 */
const HandoverNotice = ({ conflict }) => h(
  'div',
  { className: 'dsh-mcp-notice warn dsh-mcp-notice-dock', role: 'status' },
  h(Icon, { d: ICONS.warn, size: 18 }),
  h('div', { className: 'dsh-mcp-notice-body' },
    h('b', null, t('已让位给另一个 MCP 管理插件')),
    h('span', null, t('检测到 {name} 已挂载，本面板不再注册入口，以免两个面板互相遮挡、同时改写同一份配置。', { name: conflict?.name || t('另一个 MCP 管理插件') })),
    h('span', null, t('卸载其中一个后重启 DSH 即可恢复。')),
  ),
);

/**
 * 管理模式的左列表一行。
 *
 * 作用域**不再出现在行内**：它由所在组的组头承载（见 skillGroups）。
 * 之前每行挂一条 `项目 xxx · .agents/skills` 的 badge，在 288px 侧栏里必然被裁断；
 * 分组之后行内腾出的宽度还给技能名，行只说「哪一份」该说的事：调用权限与同名遮蔽。
 */
const SkillRow = ({ row, selected, onSelect, onToggle, busy, shadowedBy, twins }) => h(
  'div',
  {
    // 与 MCP 面同一套行容器（.dsh-mcp-item）：状态点 + 主列 + 右侧开关。
    // 切换能力层时列表的视觉与操作位置因此不再跳动。
    className: 'dsh-mcp-item' + (selected ? ' sel' : '') + (row.enabled === false ? ' muted' : ''),
    role: 'button',
    tabIndex: 0,
    'aria-selected': !!selected,
    onClick: () => onSelect(row),
    onKeyDown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(row); } },
  },
  // 状态点沿用 MCP 那套语义：停用 = stopped（灰），可用 = connected（绿）。
  // 三态：读不出文件时（enabled === null）用 loading 的灰点——不假装知道它是哪一种。
  h(Dot, { phase: row.enabled === false ? 'stopped' : row.enabled === null ? 'loading' : 'connected' }),
  h('div', { className: 'dsh-mcp-item-main' },
    h('div', { className: 'dsh-mcp-item-name', title: row.name }, row.name),
    h('div', { className: 'dsh-mcp-item-sub' },
      // 作用域由**组头**承载，行内不再重复一条会被裁断的路径（这是分组的直接收益）。
      //
      // ⚠️ 两个调用面**各自**都可能被关掉，所以这里要按面各说一句——只标模型面的话，
      // 「仅模型可调用」（用户面关着）在列表上**看不出任何异常**，用户点进去才会发现
      // 自己没法用 /名字 调用它。顺序有讲究：停用是更强的结论（两个面都关了），先说它，
      // 否则停用的行会被说成「仅用户可调用」——用户会以为手动还能调用它，实际不能。
      row.enabled === false
        ? h(Badge, { cls: 's-off' }, row.migrated ? t('旧机制停用') : t('已停用'))
        : [
          row.modelInvocable === false ? h(Badge, { key: 'no-model', cls: 's-off', title: t('模型不会自动调用它') }, t('模型不用')) : null,
          row.userInvocable === false ? h(Badge, { key: 'no-user', cls: 's-off', title: t('你不能用 /名字 手动调用它') }, t('不可手调')) : null,
        ],
      shadowedBy
        // 被遮蔽时说出**生效的那份在哪**：原先只说「被遮蔽」，用户找不到另一份。
        ? h(Badge, { cls: 's-err', title: t('模型只会收到「{scope}」那一份', { scope: skillScopeLabel(shadowedBy) }) }, t('被遮蔽'))
        : (twins && twins.total > 1
          ? h(Badge, { cls: 's-off', title: t('另有 {names}', { names: twins.others.join(t('、')) }) }, t('同名 {count} 份', { count: twins.total }))
          : null),
    ),
  ),
  onToggle
    ? h(Toggle, {
      on: row.enabled !== false,
      disabled: busy || row.writable === false,
      label: row.name + (row.enabled === false ? t('：已停用') : t('：已启用')),
      title: row.writable === false ? t('内置技能只读') : (row.enabled === false ? t('启用') : t('停用')),
      onChange: () => onToggle(row, row.enabled === false),
    })
    : null,
);

/** 一个作用域组的组头：可折叠，整行显示作用域，右侧计数。 */
const SkillGroupHeader = ({ group, collapsed, onToggleCollapse }) => h(
  'button',
  {
    type: 'button',
    className: 'dsh-skills-group' + (collapsed ? ' collapsed' : ''),
    onClick: () => onToggleCollapse(group.key),
    // 完整根路径放 title：组头一行放不下时（超长项目名），这里是不丢信息的兜底。
    title: group.root ? group.label + ' — ' + group.root : group.label,
    'aria-expanded': !collapsed,
  },
  h(Caret, { open: !collapsed, cls: 'dsh-skills-group-caret' }),
  h('span', { className: 'dsh-skills-group-label' }, group.label),
  h('span', { className: 'dsh-skills-group-count' }, String(group.rows.length)),
);

/**
 * 「调用权限未知」到底是哪种未知——给用户一句**说得对**的原因。
 *
 * 为什么不能一律写成「frontmatter 读不出来」：那是把两种不同的事说成了一种，而且真机报告
 * 证明它会把用户引向错误的方向。技能目录是符号链接时根定位不到（`root === undefined`），
 * 文件本身完全合法、宿主也照常加载，用户却看到「frontmatter 读不出来（宿主会跳过这条技能）」
 * ——一句凭空的断言，照它去查 frontmatter 只会白费功夫。
 *
 * 这里能分开的是两种（行上有 root 与否就是面板掌握的全部线索）：
 *   · 根没定位到 → 面板根本不知道去哪读这个文件（定位问题，不是文件问题）；
 *   · 有根却读不出权限 → 文件没了/搬走了/没权限，或 frontmatter 本身有问题。
 * 第二种没法再细分：读取失败的原因在宿主侧（`invocationOf` 只把结果压成 null），
 * 面板拿不到更细的话，就不编一个——正文页会把真正的失败原文摆出来。
 */
function invocationUnknownReason(row) {
  if (typeof row?.root !== 'string' || row.root === '')
    return t('面板没能定位这条技能的目录（技能目录可能是符号链接），因此读不到它的调用权限——文件本身可能是好的');
  return t('SKILL.md 的 frontmatter 读不出来（宿主会跳过这条技能），无法判断它的调用权限');
}

/** 管理模式的右侧详情：元信息 + 正文 + 启停/删除（与 MCP 面同一张详情卡片）。 */
const SkillDetail = ({ row, shadowedBy, body, busy, onRetry, onToggle, onRemove, onModelInvocable, onUserInvocable, tab = 'overview', onTab }) => {
  if (!row) return h('div', { className: 'dsh-mcp-detail' }, h('div', { className: 'dsh-mcp-d-empty' },
    h('b', null, t('选择左侧的一个技能')),
    h('span', null, t('这里会显示它的位置与调用权限、SKILL.md 正文，以及遮蔽或校验失败时的诊断。'))));
  const disabled = row.enabled === false;
  // 三态：true / false / null（读不到文件时不知道两个调用面是否都关掉了）。
  const enabledKnown = row.enabled === true || row.enabled === false;
  const readonly = row.writable === false;
  // 调用权限的**三态**：true / false / 未知。未知是真实的一态——宿主对 frontmatter 非法的技能
  // 整条跳过，那时「能不能被模型调用」没有答案。此前它被渲染成「不可调用」，那是凭空的断言。
  const invocationKnown = row.modelInvocable === true || row.modelInvocable === false;
  const paneOff = (id) => detailPaneOff(tab, id);
  const tabBtn = (id, label, count) => detailTab(tab, onTab, id, label, count);
  // 「（加载中…）」只能出现在**真的在加载**的时候。之前失败也落到这句兜底文案上
  // （`content || t('（加载中…）')`），用户看到的就是「加载半天没反应」——
  // 失败没有终态，等于把错误伪装成等待。
  const bodyPane = body.status === 'loading'
    ? h('pre', { className: 'dsh-skills-pre' }, t('（加载中…）'))
    : body.status === 'error'
      ? h('div', { className: 'dsh-skills-risk' },
        h('div', { className: 'dsh-skills-risk-row' },
          h('span', { className: 'k dsh-skills-blocked' }, t('读取失败')),
          h('span', { className: 'v' }, body.text || t('宿主未返回原因')),
        ),
        h(Btn, { onClick: onRetry, disabled: busy }, t('重试')),
      )
      : h('pre', { className: 'dsh-skills-pre' }, body.text || t('（无正文）'));
  return h(
    'div',
    { className: 'dsh-mcp-detail' },
    // 与 MCP 详情共用同一套头部原语（d-head / d-title / d-name / d-meta / d-actions）：
    // 切换能力层时「名字在哪、状态在哪、按钮在哪」不用重新学一遍，切面也不重排。
    h('div', { className: 'dsh-mcp-d-head' },
      h('div', { className: 'dsh-mcp-d-title' },
        h('div', { className: 'dsh-mcp-d-name' },
          row.name,
          readonly ? h(Badge, { cls: 's-lock' }, t('内置只读')) : null,
        ),
        h('div', { className: 'dsh-mcp-d-meta' },
          h(Badge, { cls: disabled ? 's-off' : shadowedBy ? 's-warn' : 's-on' },
            disabled ? t('已停用') : shadowedBy ? t('被遮蔽') : enabledKnown ? t('已启用') : t('状态未知')),
          invocationKnown
            ? h(Badge, { cls: row.modelInvocable ? null : 's-off' }, row.modelInvocable ? t('模型可调用') : t('模型不可调用'))
            : h(Badge, { cls: 's-off', title: invocationUnknownReason(row) }, t('调用权限未知')),
          invocationKnown && !row.userInvocable ? h(Badge, { cls: 's-off' }, t('用户不可调用')) : null,
          row.migrated ? h(Badge, { cls: 's-warn', title: t('这是旧版启停机制（改名成 .disabled）留下的条目；恢复后请用新的停用方式') }, t('旧机制残留')) : null,
        ),

      ),
      // 与 MCP 面同一套槽位：[主行为] + [次要行为] + [⋯ 更多]。
      // 与列表行那个开关同一动作、同一双向语义：已停用的技能在这里也能启用回来。
      // 技能面暂时没有次要行为可放（打开编辑器 / 复制副本都要新 RPC），所以次槽空着——
      // 空槽是契约的一部分：以后加动作进 ⋯，头部照样不换行。
      actionBar({
        primary: h(Btn, {
          cls: 'primary',
          icon: disabled ? 'play' : 'pause',
          onClick: () => onToggle(row, disabled),
          disabled: busy || readonly,
          title: readonly ? t('内置技能只读') : undefined,
          children: disabled ? t('启用') : t('停用'),
        }),
        more: [
          { key: 'remove', icon: 'trash', label: t('删除技能'), danger: true, disabled: busy || readonly, title: readonly ? t('内置技能只读') : undefined, onSelect: () => onRemove(row) },
        ],
      }),
    ),
    h('div', { className: 'dsh-mcp-tabs', role: 'tablist', 'aria-label': t('详情分区') },
      tabBtn('overview', t('概览')),
      tabBtn('text', t('技能正文')),
      tabBtn('diag', t('诊断'), shadowedBy ? 1 : 0),
    ),
    h('div', { className: 'dsh-mcp-d-body' },
      h('div', { className: 'dsh-mcp-card' + paneOff('overview') },
        row.description ? h('p', { className: 'dsh-mcp-d-description' }, row.description) : null,
        h('h4', null, t('技能属性')),
        h('div', { className: 'dsh-mcp-kv' },
          // 作用域与根目录合成一行：分组之后「哪一级」已由组头说过，这里只补完整路径。
          h('b', null, t('位置')), h('span', null, (row.root || t('（未报告）')) + t('（{name}）', { name: skillScopeLabel(row) })),
          // 「停用」的落点是**文件内容**（frontmatter 的两个调用面字段），不是文件名——
          // 旧机制（改名 .disabled）只在迁移读取时才会出现在状态里，如实标出来。
          h('b', null, t('状态')), h('span', null,
            row.migrated
              ? t('旧机制停用（SKILL.md.disabled）——点「启用」把它改回来')
              : disabled
                ? t('已停用（disable-model-invocation: true + user-invocable: false）')
                : enabledKnown ? t('已启用') : t('未知（读不到这个文件）')),
          // 两个调用面**各自可写**：宿主支持的就是两个面，而「已停用」只是「两个都关」这一种组合。
          // 只给一个面开关的话，用户在面板里拨不回「仅手动可调用」那一档——只能去编辑文件。
          // 写在 SKILL.md 的 frontmatter 里，所以只在可写根上给开关；权限读不出来时不装懂
          // ——开关禁用并写明未知。
          h('b', null, t('模型自动调用')),
          h('span', null,
            h(Toggle, {
              on: row.modelInvocable === true,
              disabled: busy || readonly || !invocationKnown,
              label: t('{name}：允许模型自动调用', { name: row.name }),
              title: readonly
                ? t('内置技能只读')
                : invocationKnown
                  ? t('写入 SKILL.md 的 disable-model-invocation。宿主用文件监听盯技能根，改动约 0.25 秒就生效（实测中位数 246ms），不必重启')
                  : invocationUnknownReason(row),
              onChange: () => onModelInvocable(row, row.modelInvocable !== true),
            }),
            ' ',
            invocationKnown ? (row.modelInvocable ? t('允许') : t('禁止')) : t('未知'),
          ),
          h('b', null, t('用户可调用')),
          h('span', null,
            h(Toggle, {
              on: row.userInvocable === true,
              disabled: busy || readonly || !invocationKnown,
              label: t('{name}：允许用户手动调用', { name: row.name }),
              title: readonly
                ? t('内置技能只读')
                : invocationKnown
                  ? t('写入 SKILL.md 的 user-invocable：关掉后你就不能用 /名字 手动调用它（模型仍可自动调用）。与上面那个一起关掉就是「已停用」')
                  : invocationUnknownReason(row),
              onChange: () => onUserInvocable(row, row.userInvocable !== true),
            }),
            ' ',
            invocationKnown ? (row.userInvocable ? t('允许') : t('禁止')) : t('未知'),
          ),
        ),
      ),
      h('div', { className: 'dsh-mcp-card' + paneOff('text') },
        h('h4', null, t('技能正文')),
        bodyPane,
      ),
      h('div', { className: 'dsh-mcp-d-diag' + paneOff('diag') },
        shadowedBy
          ? h('div', { className: 'dsh-skills-risk' },
            h('div', { className: 'dsh-skills-risk-h' }, t('同名遮蔽')),
            h('div', { className: 'dsh-skills-risk-row' },
              h('span', { className: 'k' }, t('实际生效')),
              h('span', { className: 'v' }, t('来自 {scope}，模型只会收到那一份；本行是另一个作用域里的副本。', { scope: skillScopeLabel(shadowedBy) })),
            ),
          )
          : h('div', { className: 'dsh-mcp-d-note' }, t('未检测到跨作用域同名遮蔽，本份已进入模型目录。')),
      ),
    ),
  );
};

/** 技能详情页签的状态宿主。理由与 ServerDetailPane 相同：详情组件必须是纯函数，
 *  否则测试里以普通函数调用它会抛 "Invalid hook call"。 */
const SkillDetailPane = (props) => {
  const [tab, setTab] = useState('overview');
  const key = props.row ? props.row.name + ':' + (props.row.source || '') : '';
  // 被遮蔽 / 只读这类「需要解释」的行直接落到诊断页；正常行回概览。
  useEffect(() => { setTab('overview'); }, [key]);
  return h(SkillDetail, { ...props, tab, onTab: setTab });
};

/**
 * 外部源（skillhub.cn）的安装确认弹窗——市场只剩这一条来源，所以安装只走这里。
 *
 * ⚠️ 上游条目**没有 license 字段**，所以本插件在这里能做的只有披露：
 * 把上游唯二可信的东西摆出来（发布方企业认证、安全扫描结论）、把「本插件未核验」写在明处、
 * 要一次**显式确认**（服务端也校验 `acknowledged`，UI 只是它的界面）。
 * 判定归工具，决定归人——但工具不提供它没把握的判定：**不编一个许可判定**出来。
 *
 * 落点用同一套「安装到」，身份是 `(source, root)`（见 installTargetId）。
 */
const SkillInstallModal = ({ entry, scopeOptions, scope, onScope, onClose, onConfirm, busy, external = {} }) => {
  const [ack, setAck] = useState(false);
  if (!entry) return null;
  // 外壳沿用既有的 dsh-mcp-overlay 与 h3 标题、dsh-mcp-modal-actions 页脚——这是本仓库既有的
  // 模态约定（其它弹窗都这样）。**不要**另造 modal-h/-b/-f：那些类没有样式定义，
  // theme-contract 的「渲染出来的类都要有样式」会直接红（实测抓到过）。
  // 内层走共享的 Dialog 构造器，不手写 role/tabIndex/Escape：焦点契约（ref + 挂载即吸焦点 +
  // stopPropagation）就是那个构造器本身。手写一份的后果实测过——焦点留在面板里，按一次 Esc
  // 会把面板连着弹框一起关掉（侧栏入口形态下则是按了没反应），与 1.5.1 修掉的是同一个缺陷。
  return h('div', { className: 'dsh-mcp-overlay', onClick: (e) => e.target === e.currentTarget && onClose() },
    h(Dialog, { label: t('安装 {name}', { name: entry.name }), onClose },
      h('h3', null, t('安装 {name}', { name: entry.name })),
      h('dl', { className: 'dsh-skills-meta' },
        h('dt', null, t('来源')), h('dd', null, external ? 'skillhub.cn · ' + entry.source : entry.source),
        // 外部源没有许可字段——**不编一个许可**，如实写「未提供」。
        h('dt', null, t('许可')), h('dd', null, external ? t('上游未提供许可信息') : entry.license),
        external ? h('dt', null, t('上游页面')) : null,
        external ? h('dd', null, h('a', { className: 'dsh-skills-link', href: external.pageUrl, target: '_blank', rel: 'noreferrer' }, external.pageUrl)) : null,
      ),
      // 外部源披露：上游唯二可信的东西都摆出来，且**说清本插件没做什么**——
      // 「未做许可判定」比一个编出来的绿灯诚实。
      h('div', { className: 'dsh-skills-risk' },
        h('div', { className: 'dsh-skills-risk-h' }, t('外部源（skillhub.cn）')),
        h('div', { className: 'dsh-skills-risk-row' },
          h('span', { className: 'k dsh-skills-warn' }, h(Icon, { d: ICONS.warn }), t('本插件未核验')),
          h('span', { className: 'v' }, t('只做来源披露，不做许可判定、不做安全审查')),
        ),
        h('div', { className: 'dsh-skills-risk-row' },
          h('span', { className: 'k' }, t('发布方')),
          h('span', { className: 'v' },
            external.publisher?.verified
              ? t('已认证{suffix}', { suffix: external.publisher.certifiedName ? t('：{name}', { name: external.publisher.certifiedName }) : (external.publisher.name ? t('：{name}', { name: external.publisher.name }) : '') })
              : (external.publisher?.name || t('未提供认证信息')),
          ),
        ),
        h('div', { className: 'dsh-skills-risk-row' },
          h('span', { className: 'k' }, t('安全扫描')),
          h('span', { className: 'v' },
            external.security?.sanbu || external.security?.keen
              ? [external.security?.sanbu, external.security?.keen].filter(Boolean).map((scan) => scan.statusText || scan.status).join(' · ')
              : t('上游未提供扫描结论'),
          ),
        ),
        h('div', { className: 'dsh-skills-risk-row' },
          h('span', { className: 'k' }, t('运行前提')),
          h('span', { className: 'v' }, external.requiresApiKey ? t('需要 API Key') : t('不需要 API Key')),
        ),
      ),
      h('div', { className: 'dsh-skills-risk' },
        h('div', { className: 'dsh-skills-risk-h' }, t('它会带来什么')),
        // 「进入模型上下文」是无条件的，作为第一等披露项单独说明。
        h('div', { className: 'dsh-skills-risk-row' },
          h('span', { className: 'k dsh-skills-warn' }, h(Icon, { d: ICONS.warn }), t('进入模型上下文')),
          h('span', { className: 'v' }, t('技能正文会作为指令注入会话')),
        ),
        h('div', { className: 'dsh-skills-risk-row' },
          h('span', { className: 'k' }, t('可执行片段')),
          // ⚠️ 不要在这里断言「无 scripts/ 目录」：上游条目**根本没有 scripts 字段**
          // （normalizeHubSkill 拿不到），所以 entry.scripts 恒为 undefined。
          // 真机实测抓到过反例——弹框写着「无 scripts/ 目录」，而落盘出来的技能带
          // scripts/ 与 hooks/*.py。把「没核验」说成「没有」正是这个弹框最不该犯的错，
          // 所以这里如实写「未提供 + 未核验」，把"有没有"留给装完的自己看。
          h('span', { className: 'v' }, external
            ? t('上游未提供清单，本插件未核验：正文可能引用 scripts/ 等可执行文件')
            : (entry.scripts ? t('含 scripts/ 目录') : t('无 scripts/ 目录'))),
        ),
        h('div', { className: 'dsh-skills-risk-row' },
          h('span', { className: 'k' }, t('工具权限')),
          // 同理：上游也不给工具权限清单，「未声明」会被读成「作者声明了没有」。
          h('span', { className: 'v' }, external
            ? t('上游未提供，本插件未核验')
            : ((entry.allowedTools || []).length ? entry.allowedTools.join(', ') : t('未声明'))),
        ),
      ),
      h('div', { className: 'dsh-skills-sec' }, t('安装到')),
      // 作用域候选来自**实际发现**的 source（约束 12），不是写死列表；
      // 且只列**可写**的那些——内置目录只读，列出来只会让人装进去然后困惑
      // （第一版就是这样：只读的内置排在前面，还成了默认目标）。
      // 容器复用 MCP 面的 .dsh-mcp-radio-row：技能面原先自造的 dsh-skills-list/-row
      // 两条规则已被当作死 CSS 删掉，弹窗里这一整块因此是裸的（label 堆叠、无 hover）。
      scopeOptions.length
        ? h('div', { className: 'dsh-mcp-radio-row' },
          ...scopeOptions.map((option) => h('label', { key: option.id },
            h('input', {
              type: 'radio',
              name: 'dsh-skills-scope',
              checked: scope === option.id,
              onChange: () => onScope(option.id),
            }),
            h('span', null,
              option.label + (option.root ? t('（{name}）', { name: option.root }) : ''),
              // 目录还没建也要能选（宿主 importSkill 会 mkdir -p），但要说清楚——
              // 否则用户以为选了个不存在的坏位置。
              option.pending ? h('b', { className: 'dsh-skills-pending' }, t('　安装时创建')) : null,
            ),
          )),
        )
        : h(Notice, {
          tone: 'warn', icon: 'warn', title: t('没有可写入的技能目录'),
          children: t('宿主报告的作用域都是只读的（例如只有内置技能）。装不了任何位置——先确认 DSH 的用户级技能目录存在且可写。'),
        }),
      // 外部源恒需一次显式确认：它是本插件唯一可安装的来源，也是唯一没有许可信息的来源。
      h('label', { className: 'dsh-skills-ack' },
        h('input', { type: 'checkbox', checked: ack, onChange: (e) => setAck(e.target.checked) }),
        h('span', null, t('我知道这是外部来源、本插件未做核验，愿意自行承担安装后的风险。')),
      ),
      h('div', { className: 'dsh-mcp-modal-actions' },
        h(Btn, { onClick: onClose }, t('取消')),
        h(Btn, {
          cls: 'primary',
          onClick: () => onConfirm(entry),
          disabled: busy || !scopeOptions.length || !ack,
          title: !scopeOptions.length ? t('没有可写入的技能目录') : (!ack ? t('先勾选上面的确认') : undefined),
        }, busy ? t('安装中…') : t('确认并安装')),
      ),
    ),
  );
};

/**
 * 外部源（skillhub.cn）的一张市场卡片：与内置目录卡片**同一个原语**（.dsh-mcp-mcard），
 * 只是把「许可红绿灯」换成上游真有的东西：发布方 owner、下载量、是否需 API Key、是否已认证。
 *
 * 为什么不做红绿灯：上游没有许可字段，用颜色表达一个不存在的判定就是编（约束 8 的闸门
 * 只对内置目录成立）。这里的每一枚徽章都能在上游响应里指到出处。
 */
const HubCard = ({ entry, installed, onInstall }) => h(
  'div',
  { className: 'dsh-mcp-mcard' + (installed ? ' installed' : '') },
  h('div', { className: 'dsh-mcp-mcard-top' },
    h('div', { className: 'dsh-mcp-mcard-icon' }, h(Icon, { d: ICONS[installed ? 'check' : 'box'], size: 16 })),
    h('div', { className: 'dsh-mcp-mcard-main' },
      h('div', { className: 'dsh-mcp-mcard-name', title: entry.name }, entry.name),
      h('div', { className: 'dsh-mcp-mcard-meta' },
        h('span', null, entry.owner || t('未知发布者')),
        h('span', null, t('下载 {count}', { count: entry.downloads })),
      ),
    ),
  ),
  h('div', { className: 'dsh-mcp-mcard-desc', title: entry.summary || undefined }, entry.summary || t('（上游未提供说明）')),
  h('div', { className: 'dsh-mcp-mcard-tags' },
    entry.verified ? h(Badge, { cls: 's-on' }, t('已认证')) : null,
    entry.requiresApiKey ? h(Badge, null, t('需 API Key')) : h(Badge, { cls: 's-off' }, t('免密钥')),
    entry.version ? h(Badge, null, 'v' + entry.version) : null,
  ),
  h('div', { className: 'dsh-mcp-mcard-foot' },
    h('span', { className: 'dsh-mcp-mcard-stat' }, installed ? t('本地已有同名技能') : t('来自 skillhub.cn')),
    h('div', { className: 'dsh-mcp-mcard-actions' },
      h(Btn, { cls: 'primary sm', onClick: () => onInstall(entry), children: t('安装') }),
      h('a', {
        className: 'dsh-mcp-btn sm',
        href: entry.pageUrl,
        target: '_blank',
        rel: 'noreferrer',
        title: t('在 skillhub.cn 上查看'),
        children: t('页面'),
      }),
    ),
  ),
);

/**
 * 市场每页条数。上游 /api/skills 的 pageSize 上限就是 100（宿主侧会夹住），用满它：
 * 上游有 19 万条（实测 total=192936），按 48 一页要翻 4019 页，按 100 翻 1930 页。
 */
const HUB_PAGE_SIZE = 100;

/**
 * 市场条目的唯一性不变式：同一个 slug 只出现一次。
 *
 * 为什么必须全局去重（跨页 + 页内一起）：上游**同一页内**就会返回重复 slug——
 * 实测第 1 页（pageSize=100, sortBy=downloads）100 条里只有 88 个不同 slug
 * （agent-browser / anti-fraud 各出现 3 次，同一技能被不同发布者重复发布）。
 * 只按「与已加载页」去重挡不住页内重复：重复 key 进 React 后 reconciliation
 * 错乱，真机表现是卡片越滚越多、计数与实物不符（297 张卡 vs 计数 285）、
 * 搜索像没生效。 HubCard 的 key 是 slug，所以这条不变式同时是渲染正确性的前提。
 *
 * @param {object[]} items - 上游条目（已规范化的形状）。
 * @returns {object[]} 去重后的新数组（保持原顺序，不修改入参）。
 */
function dedupeHubSkills(items) {
  const seen = new Set();
  const unique = [];
  for (const item of items ?? []) {
    const slug = String(item?.slug ?? '');
    if (seen.has(slug)) continue;
    seen.add(slug);
    unique.push(item);
  }
  return unique;
}

/**
 * 技能能力面的入口组件：管理 + 市场。
 *
 * 数据全部走宿主 RPC（skillsManager），不依赖会话（SPEC 约束 14：官方的
 * ctx.remote.skills.list 需要真实 sessionId，会激活冷 Agent）。
 */
// ⚠️ 它**不接** onClose / floating / onMode：悬浮外壳（wrapFloating）与模式分段都归 McpTab，
// 面板只负责「技能面那具身体」。留着没人用的 prop 会让下一个人以为这里还能控制面板开关。
const SkillsPanel = ({ call, workspaces, mode = 'manage', scopeFilter = 'all', onScopeFilter, sortKey = 'default', onSort, onSummary, flash }) => {
  const [rows, setRows] = useState([]);
  // ⚠️ 选中存的是**身份**（行 key），行对象从当前 rows **派生**——不存对象本身。
  // 存对象会留住"上一次取数时的那个对象"：面板里刚启停一个技能后列表刷新，详情却还在渲染
  // 旧对象（真机实测：磁盘上已经是 .disabled，详情仍写「已启用」，点「刷新」也不变，只有重新
  // 选中那一行才对）。派生之后这个状态无法存在——没有旧对象可留。
  const [selectedKey, setSelectedKey] = useState('');
  // 正文是**三态**，不是字符串：字符串没法表达「失败了」，于是失败只能长得像加载中。
  const [body, setBody] = useState({ status: 'idle' });
  const [busy, setBusy] = useState(false);
  const [entry, setEntry] = useState(null);
  const [scope, setScope] = useState('');
  // 宿主支持的**全部**落盘位置（含还没建的）。老宿主没有这个方法 → 空数组 → 退回发现集。
  const [targets, setTargets] = useState([]);
  // 市场只有**一个**来源：skillhub.cn（直连上游、本插件只做披露）。
  // page/done 是翻页的真值来源：上游 total=192936（实测，深页有货），只取首页就会
  // 「计数写着 19 万、屏幕只有一页」——数字与实物对不上，用户以为下拉会刷新。
  const [hub, setHub] = useState({ items: [], total: 0, page: 1, done: false, loading: false, loadingMore: false, error: '', kind: '' });
  // 滚动回调与「加载更多」按钮都在渲染之外触发，那里读不到本次渲染的 hub——ref 拿最新的一份。
  const hubRef = useRef(hub);
  useEffect(() => { hubRef.current = hub; }, [hub]);
  // 同步的在途标志：state 要等下一次渲染+effect 才同步进 ref，那之间的重复触发
  // （双击按钮、滚动事件连续 fire）会并发打同一页——去重后第二次响应全是重复项，
  // 会被误判成 done，翻页提前终止。所以这道闸必须是同步的。
  const hubInFlight = useRef(false);
  const [hubCategory, setHubCategory] = useState('');
  const [hubCategoryLabels, setHubCategoryLabels] = useState({});
  // 外部源条目被选中时的披露信息（点安装时按 slug 拉一次 detail）。
  const [hubDetail, setHubDetail] = useState(null);
  // 管理面列表的筛选词：只管**本地**那张表，不发任何网络请求。
  const [query, setQuery] = useState('');
  // 市场的关键字分**草稿**与**已提交**两份。为什么要分开：
  // `searchHub` 是 useCallback，而挂载/切分类/提交都靠 `useEffect([call, searchHub])` 触发——
  // 把输入框直接绑到 searchHub 的依赖上，就等于「每敲一个字打一次上游」，
  // 与代码注释和文档都写着的「显式触发（回车 / 切分类）」正相反（依赖链与真机都能证实）。
  // 拆开之后：击键只改草稿，回车才把草稿提交成 hubKeyword，依赖不变就不会重发请求。
  // 顺带把两个面的输入框也分开——它们本来就是两个互不相干的搜索框，
  // 共用一份状态会让「管理面筛选词」出现在市场搜索框里，也会让两边互相触发。
  const [marketDraft, setMarketDraft] = useState('');
  const [hubKeyword, setHubKeyword] = useState('');
  // 语言版本：搜索与分类的 effect 依赖它——切语言要按新语言重拉
  // （上游描述中英两份、分类名中英两份，不重拉就停在切换前的语言）。
  const localeV = useLocaleVersion();
  // 筛选只留状态。作用域**不在这里**：它是第二行那排药丸（外壳持有），由 scopeFilter 传进来。
  const [statusFilter, setStatusFilter] = useState('all');
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());

  // onSummary 是外壳的回调，用来把「技能服务在不在 + 一共几个技能」报上去
  // （第二行的连接状态、能力层那个计数都读它）。用 ref 拿最新的一份，避免把它写进 load 的依赖。
  const summaryRef = useRef(onSummary);
  useEffect(() => { summaryRef.current = onSummary; }, [onSummary]);

  const load = useCallback(async () => {
    // ⚠️ 工作区列表**由 McpTab 通过 props 传进来**，不能在这里自己问服务：
    // 本组件的 `call` 是 callSkills（打到 skillsManager），而 `listWorkspaces` 只在
    // **mcpManager** 上——问了也只会拿到 {ok:false}，且**不报错**，表现为「项目级技能
    // 永远不出现」。这个缺陷由「面板只调 skillsManager 真实存在的方法」用例抓出。
    // SPEC 约束 13：每个工作区各查一次 list({cwd}) 再合并（宿主传 cwd 时返回合并视图，
    // 所以按 source 过滤在宿主侧完成，客户端只负责把列表传下去）。
    const result = await call('list', { workspaces: workspaces || [] });
    if (!result.ok) {
      // 服务不可用：把原因与「一个技能都没有」分开——前者要一条降级提示，后者是空状态。
      summaryRef.current?.({ state: 'down', count: null, error: result.error || '', scopeTabs: [] });
      return result;
    }
    // 宿主返回的是**一个**数组：停用不再是「在另一个数组里」，而是行上的派生态
    // （enabled = 两个调用面是否都关掉，见 lib/skills-registry.js 的 toView）。
    // 旧版是两个数组、停用件由宿主扫盘补一份——那套做法的代价见 SkillsManagerGateway.list。
    const next = skillRows(result.skills || []);
    setRows(next);
    // 计数就是行数：已停用的技能也是技能（面板里看得见、也点得动），
    // 只数可调用的会让「能力层写着 8、列表里有 11 行」这种自相矛盾出现。
    summaryRef.current?.({ state: 'ready', count: next.length, error: '', scopeTabs: skillScopeTabs(next) });
    return result;
  }, [call, workspaces]);

  useEffect(() => { void load(); }, [load]);
  // 切回这个标签页时重取一次列表：**宿主侧本来就已经自动发现**（它用 chokidar 监听技能根，
  // 新增/改名/删除技能无需重启即到达模型），所以面板缺的只是「知道自己该重取一次」。
  //
  // ⚠️ 为什么不是订阅 `skills/change` 做到推送式刷新：那个事件**不在**宿主的 Remote 转发
  // 白名单里，而白名单由 `dsh-api-remotes` 独占（`registerRemoteEvents` 只接受一个源，
  // 第二个注册直接抛 already registered）——第三方插件没有合法途径把它送到浏览器。
  // 这是契约没开这个口，不是我们偷懒；如实写在这里，免得下一轮有人又去试一遍。
  //
  // 也不轮询：技能变化远没有 MCP 连接状态那么频繁，而每次 list 都要扫全部技能根并逐个读文件
  // 解析 frontmatter。焦点重取的收益/成本比明显更好。
  useEffect(() => {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return undefined;
    const onVisibilityChange = () => { if (document.visibilityState !== 'hidden') void load(); };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [load]);
  useEffect(() => {
    // 安装目标：问宿主「可以写到哪里」。拿不到（老宿主）就留空，由 skillTargetOptions 退回归发现集。
    // ⚠️ try/catch 不能省：RPC **抛错**（宿主没这个 endpoint、传输失败）时没有它，
    // 这个 async IIFE 会 reject 成 `Uncaught (in promise)`——注释承诺的"拿不到就留空"
    // 对抛错那条路根本不成立。真机 console 实测过（stack 经 prepareInvocation）。
    void (async () => {
      try {
        const result = await call('skillTargets', { workspaces: workspaces || [] });
        if (result.ok) setTargets(result.targets || []);
      } catch { /* 安装目标只是增强：留空即退回归发现集，不该把面板带下去 */ }
    })();
  }, [call, workspaces]);

  // 外部源的搜索：**显式触发**（挂载首屏 / 切分类 / 回车提交），不是每次击键都打网络。
  // 这条纪律靠**依赖**成立，不靠注释：searchHub 只依赖 hubKeyword（已提交的），
  // 而输入框改的是 marketDraft —— 所以击键不会让它换身份、也就不会有请求。
  // 远端目录不可用时只把错误留在结果区，面板照旧（约束 11 的降级纪律）。
  const searchHub = useCallback(async () => {
    setHub((current) => ({ ...current, loading: true, error: '', kind: '' }));
    try {
      // page: 1 是**重置搜索**：换关键字/分类时整体替换，翻页态归零。
      const result = await call('skillHubSearch', { keyword: hubKeyword, category: hubCategory, page: 1, pageSize: HUB_PAGE_SIZE, locale: contentLocale() });
      if (!result.ok) throw new Error(result.error || t('搜索失败'));
      setHub({ items: dedupeHubSkills(result.skills), total: result.total || 0, page: 1, done: false, loading: false, loadingMore: false, error: '', kind: '' });
    } catch (error) {
      const message = String(error?.message || error);
      setHub({ items: [], total: 0, page: 1, done: false, loading: false, loadingMore: false, error: message, kind: classifyHubError(message) });
    }
  }, [call, hubCategory, hubKeyword]);

  // 加载下一页：**追加**而不是替换（替换就成了「永远只有第 1 页」）。
  const loadMoreHub = useCallback(async () => {
    const current = hubRef.current;
    // 没有更多就不发：done（上游该给新条目的页全是重复项）或已显示满 total。
    if (hubInFlight.current || current.loading || current.loadingMore || current.done || current.items.length >= current.total) return;
    hubInFlight.current = true;
    setHub((prev) => ({ ...prev, loadingMore: true, error: '', kind: '' }));
    try {
      const result = await call('skillHubSearch', { keyword: hubKeyword, category: hubCategory, page: current.page + 1, pageSize: HUB_PAGE_SIZE, locale: contentLocale() });
      if (!result.ok) throw new Error(result.error || t('搜索失败'));
      setHub((prev) => {
        // 一条不变式表达两种重复：拼接后整体去重，新增的尾部就是这一页的净增。
        // 跨页重复（排名漂移）与页内重复（多个发布者同一 slug）一次挡住；
        // 净增为 0 = 上游翻不出新东西了，再滚也是重复请求。
        const merged = dedupeHubSkills([...prev.items, ...(result.skills || [])]);
        return { ...prev, items: merged, page: prev.page + 1, loadingMore: false, done: merged.length === prev.items.length };
      });
    } catch (error) {
      const message = String(error?.message || error);
      setHub((prev) => ({ ...prev, loadingMore: false, error: message, kind: classifyHubError(message) }));
    } finally {
      hubInFlight.current = false;
    }
  }, [call, hubCategory, hubKeyword, localeV]);

  // 还有没有下一页：一条派生值，按钮显隐、滚动触发、停止条件都读它——不各写一份判断。
  const hubHasMore = hub.items.length < hub.total && hub.done !== true;

  // 分类只随**语言**重取：它不随关键字变（放进搜索的 effect 里会每搜一次多打一次
  // 分类接口），但语言切换必须重取——上游每个分类给中英两份（name/nameEn），
  // 不重取就停在切换前的语言。locale 也一起传：宿主侧按它挑 nameEn。
  useEffect(() => {
    // try/catch 不能省，理由同上面的安装目标：RPC 抛错时没有它就会逃逸成
    // `Uncaught (in promise)`，而"取不到就用原始 key"只覆盖了 ok:false 那一条路。
    void (async () => {
      try {
        const result = await call('skillHubCategories', { locale: contentLocale() });
        // 分类只是显示层：取不到就用原始 key，不该因此让市场打不开。
        if (result.ok) setHubCategoryLabels(result.labels || {});
      } catch { /* 分类标签只是增强：保持空映射即显示原始 key，不该把市场带下去 */ }
    })();
  }, [call, localeV]);

  useEffect(() => { void searchHub(); }, [searchHub]);

  const scopeOptions = skillTargetOptions(targets, skillScopeOptions(rows));
  // 安装目标 = 候选里**可写**的那些。内置目录（bundled）只读，既不该进候选、
  // 更不该像第一版那样因为排在前面而成为默认目标（真机实测：默认就指向内置目录，
  // 而 importSkill 不传 writable 时宿主按可写处理 → 会直接写进内置目录）。
  const installTargets = scopeOptions.filter((option) => option.writable !== false);
  // 摘要、弹窗默认选项与最终写入共用这一个目标；scope 是身份，作用域语义来自 option.scope。
  const installTarget = installTargets.find((option) => option.id === scope) || installTargets[0];
  const shadowed = shadowedSkills(rows);

  // 列表与详情共用筛选结果，不能继续操作已被作用域、状态或查询排除的行。
  const visibleRows = useMemo(() => sortSkills(rows.filter((row) => {
    if (scopeFilter !== 'all' && skillGroupKey(row) !== scopeFilter) return false;
    if (statusFilter === 'disabled' && row.enabled !== false) return false;
    if (statusFilter === 'enabled' && row.enabled === false) return false;
    const needle = query.trim().toLowerCase();
    if (needle === '') return true;
    return [row.name, row.description, skillScopeLabel(row), row.cwd]
      .some((value) => String(value || '').toLowerCase().includes(needle));
  }), sortKey), [rows, scopeFilter, statusFilter, query, sortKey, localeV]);
  const selected = selectedSkillRow(visibleRows, selectedKey);

  // 加载某一行的正文。三态必须都落到 UI 上：失败没有终态，就会长得像「一直在加载」。
  const loadBody = useCallback(async (row) => {
    if (!row) return;
    setBody({ status: 'loading' });
    const result = await call('detail', skillDetailRequest(row));
    setBody(result.ok
      ? { status: 'ok', text: result.skill?.content || '' }
      // 错误原文给出去：用户要靠它判断下一步，只留一句「加载失败」等于没给信息。
      : { status: 'error', text: result.error || t('宿主未返回原因') });
  }, [call]);

  const selectRow = useCallback((row) => {
    setSelectedKey(row?.key ?? '');
    void loadBody(row);
  }, [loadBody]);

  // 保留仍可见的选择；筛选排除它时补选第一行，无匹配时清空详情。
  useEffect(() => {
    if (selected) return;
    if (visibleRows.length) selectRow(visibleRows[0]);
    else if (selectedKey) { setSelectedKey(''); setBody({ status: 'idle' }); }
  }, [selected, visibleRows, selectedKey, selectRow]);

  // 行动作的统一出口——与 MCP 面的 act 同一条纪律：**失败必须说出来**。宿主拒绝时给的是具体
  // 原因（「这个字段的值跨了多行，请手工修改这一行」这类），吞掉它就只剩「点了没反应」；而技能面
  // 的动作真的动用户的文件，那句原因正是用户唯一能据以修好的信息。成功才重新取数。
  // 返回 true = 成功，调用方据此决定要不要做后续（清选中、关弹窗）。
  const act = useCallback(async (method, payload) => {
    setBusy(true);
    try {
      const res = await call(method, payload);
      if (!res || res.ok !== true) {
        flash?.((res && res.error) || t('{method} 失败', { method }), 'err');
        return false;
      }
      await load();
      return true;
    } finally { setBusy(false); }
  }, [call, flash, load]);

  const toggleRow = useCallback(async (row, enable) => {
    // 双向：MCP 面每行都有启用/停用开关，技能面必须同样能**恢复**已停用的技能。
    const next = enable === undefined ? row.enabled === false : enable === true;
    // 只送**引用**（source + root + 项目路径 + 磁盘条目 + 形态），不送 writable：可写与否由服务端
    // 判定，客户端传什么不算数（否则「只读根不可写」只是客户端的礼貌）。
    await act('setEnabled', { ...skillDetailRequest(row), enabled: next });
  }, [act]);

  const toggleModelInvocable = useCallback(async (row, modelInvocable) => {
    // 「允许模型自动调用」的开关：写技能文件里的 disable-model-invocation（issue #5）。
    // 与启停同一条纪律：只送引用，可写与否由服务端判定。
    // 重新取数在 act 里：行上的权限来自**磁盘上的那个文件**（宿主侧从文件解析），刷出来的就是
    // 真正写下去的值；被拒绝时文件没变，开关如实停在原位，而原因由 act 说出来。
    await act('setModelInvocable', { ...skillDetailRequest(row), modelInvocable: modelInvocable === true });
  }, [act]);

  const toggleUserInvocable = useCallback(async (row, userInvocable) => {
    // 「用户可调用」的开关：写技能文件里的 user-invocable。
    // 它存在的理由与「停用」直接相关：停用 = 两个面都关，而只给一个面开关的话，
    // 用户在面板里拨不回「仅手动可调用」那一档（只能去编辑文件）。
    // 纪律与上面那个完全一致（只送引用、可写与否由服务端判定、失败要把原因说出来）。
    await act('setUserInvocable', { ...skillDetailRequest(row), userInvocable: userInvocable === true });
  }, [act]);

  const removeRow = useCallback(async (row) => {
    // 「删除技能」是**真删**（宿主 removeSkill：目录捆绑连目录、扁平删文件）。
    // 之前这个菜单项接的是 toggleRow —— 点删除只会把技能停用，还报成功。
    if (!confirm(t('确认删除技能「{name}」？{target}会从磁盘移除，不可撤销。', { name: row.name, target: row.kind === 'bundle' ? t('整个目录（含 scripts/references）') : t('该文件') }))) return;
    // 删成功才清选中：失败时那一行还在，清掉选中只会让用户面对一个空详情、还不知道为什么。
    if (await act('removeSkill', skillDetailRequest(row))) setSelectedKey('');
  }, [act]);

  const confirmInstall = useCallback(async (target) => {
    // 落点按**安装目标的唯一身份**（source + root）解析：两个工作区会有同一个 source，
    // 按 source `find` 会静默装进第一个（用户以为选了项目 B，实际写进项目 A）。
    const option = installTarget || {};
    // writable 是显式声明：宿主默认按可写处理，所以这里的 true 必须与
    // 「只列可写目标」这个前提一致，不能靠默认值蒙。
    //
    // 市场只有外部源这一条路：宿主下载上游 zip 再走**同一个** importSkill 落盘——
    // 落点因此仍然由面板选，而不是上游说了算。
    const ok = await act('skillHubInstall', {
      slug: target.slug,
      version: target.version,
      // 落点只送引用；`acknowledged` 是**服务端**要求的确认（UI 的勾选框只是它的界面）。
      source: option.source,
      root: option.root,
      projectPath: option.projectPath,
      acknowledged: true,
    });
    // 装失败时弹窗留在原地（用户要能看到失败原因、能重试），只有成功才收起来。
    if (ok) { setEntry(null); setHubDetail(null); }
  }, [act, installTarget]);

  // 选中的作用域在数据刷新后可能整个消失（工作区被移除），留着它会让列表永远空着、
  // 而药丸上已经找不到那个高亮项——用户没有任何办法退回去。
  useEffect(() => {
    if (scopeFilter === 'all') return;
    if (!rows.length) return;
    if (rows.some((row) => skillGroupKey(row) === scopeFilter)) return;
    onScopeFilter?.('all');
  }, [rows, scopeFilter, onScopeFilter]);
  // 分组在**过滤之后**算：搜索/筛选命中的行落在哪几组，就只显示那几组的组头。
  const groups = skillGroups(visibleRows);
  const twinCounts = skillTwinCounts(rows);
  const toggleGroup = useCallback((key) => {
    // 新 Set 而不是原地 add/delete：与这个仓库其余 state 一样走不可变更新，
    // 否则引用不变、组件不会重渲染，折叠点了没反应。
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  return h('section', { className: 'dsh-skills-root', 'aria-label': t('技能面板') },
    // ⚠️ 第二行**不在这里**：模式分段、作用域药丸、连接状态都由外壳（McpTab）渲染，
    // 这一层只负责「技能面这具身体」。技能面自己画第二行，正是当初「两套 UI」的来源
    // ——标题栏上会并排出现 MCP | 技能 | 管理 | 市场 四个标签，其中「技能」还是死按钮。
    mode === 'manage'
      ? h('div', { className: 'dsh-mcp-body' },
        // 左栏与 MCP 面同一张卡片（.dsh-mcp-side），并且**管理模式下也有搜索**——
        // 技能只会越装越多，MCP 面常驻的搜索在这里同样必需（原先只有市场模式有，自身就不一致）。
        h('div', { className: 'dsh-mcp-side' },
          h('div', { className: 'dsh-mcp-search' }, h(Icon, { d: ICONS.search }), h('input', { placeholder: t('搜索技能…'), value: query, onChange: (e) => setQuery(e.target.value) })),
          h('div', { className: 'dsh-mcp-filters' },
            h('select', { value: statusFilter, onChange: (e) => setStatusFilter(e.target.value), 'aria-label': t('按状态过滤') },
              h('option', { value: 'all' }, t('全部状态')),
              h('option', { value: 'enabled' }, t('已启用')),
              h('option', { value: 'disabled' }, t('已停用')),
            ),
          ),
          h('div', { className: 'dsh-mcp-list' },
            visibleRows.length === 0
              ? h('div', { className: 'dsh-mcp-empty-list' }, rows.length === 0 ? t('没有发现技能。检查宿主是否挂载了 dsh-skill 内置插件。') : t('没有匹配的技能'))
              : null,
            // 按作用域分组：组头整行放得下路径，行内不再重复一份被裁断的标签。
            ...groups.flatMap((group) => collapsedGroups.has(group.key)
              ? [h(SkillGroupHeader, { key: group.key, group, collapsed: true, onToggleCollapse: toggleGroup })]
              : [
                h(SkillGroupHeader, { key: group.key, group, collapsed: false, onToggleCollapse: toggleGroup }),
                ...group.rows.map((row) => h(SkillRow, {
                  key: row.key,
                  row,
                  selected: row.key === selectedKey,
                  onSelect: selectRow,
                  onToggle: toggleRow,
                  busy,
                  shadowedBy: shadowed.find((item) => item.key === row.key)?.shadowedBy,
                  twins: twinCounts.get(row.key),
                })),
              ]),
          ),
          // 底栏：统计 + 排序/刷新，与 MCP 面同一副（ListFooter）。
          // 统计同样只数**看得见的行**（visibleRows）：作用域药丸筛出 12 行时，
          // 底栏必须写 12——写成全量就与屏幕上的行数对不上了。
          h(ListFooter, {
            text: skillStatsText(visibleRows),
            sortKey,
            onSort,
            onRefresh: () => void load(),
            refreshing: busy,
            sortTitle: t('排序技能'),
          }),
        ),
        // 右栏与 MCP 面同一张卡片（.dsh-mcp-detail）。
        h(SkillDetailPane, {
          row: selected,
          shadowedBy: shadowed.find((item) => item.key === selectedKey)?.shadowedBy,
          body,
          busy,
          onRetry: () => void loadBody(selected),
          onToggle: toggleRow,
          onModelInvocable: toggleModelInvocable,
          onUserInvocable: toggleUserInvocable,
          onRemove: removeRow,
        }),
      )
      // 市场与 MCP 面同一副骨架：分类药丸 + 搜索 | 说明 | 网格 + 卡片。
      // 曾经这一面用的是 .dsh-skills-bar / .dsh-skills-tags / .dsh-skills-grid / .dsh-skills-card
      // 一整套私有原语——同一个「发现市场」在两个能力面长得不一样，于是切换时像换了个产品。
      // 滚动监听挂在滚动容器**自己**身上（React 对 scroll 是原生直挂，不靠事件委托），
      // 不在 effect 里挂：宿主外壳在持续高频重渲染本面板（真机 wire 上 list/skillTargets
      // 每秒一轮、连续上百次渲染），被动 effect 的重跑会被饿住——IntersectionObserver
      // 版的观察器在首屏搜索完成后迟迟创建不出来，实测「首次滚动不加载、交互过一次才加载」。
      // onScroll 的处理器每次渲染都是新闭包，读的也是当次渲染的 loadMoreHub，不过期。
      : h('div', {
        className: 'dsh-mcp-market-view', role: 'region', 'aria-label': t('技能发现市场'),
        onScroll: (event) => {
          const box = event.currentTarget;
          // 离底部还有 200px 以上就什么都不做——给一点提前量，用户看到的就是「到底就有」。
          if (box.scrollTop + box.clientHeight < box.scrollHeight - 200) return;
          void loadMoreHub();
        },
      },
        h('div', { className: 'dsh-mcp-market-toolbar' },
          h('div', { className: 'dsh-mcp-market-head' },
            h('div', { className: 'dsh-mcp-search' },
              h(Icon, { d: ICONS.search }),
              h('input', {
                value: marketDraft,
                placeholder: t('搜索 skillhub.cn（回车）'),
                'aria-label': t('搜索技能'),
                // 击键只改草稿；回车才提交（提交后 searchHub 换身份 → effect 发一次请求）。
                onChange: (event) => setMarketDraft(event.target.value),
                onKeyDown: (event) => { if (event.key === 'Enter') setHubKeyword(marketDraft); },
              }),
            ),
          ),
          // 分类 key 来自上游、标签来自它的分类接口（取不到就显示原始 key）。
          h('div', { className: 'dsh-mcp-chips', role: 'tablist', 'aria-label': t('按分类浏览') },
            ...[['', t('全部')], ...Object.entries(hubCategoryLabels)].map(([key, label]) => h('button', {
              key: key || 'all',
              type: 'button',
              role: 'tab',
              'aria-selected': hubCategory === key,
              className: 'dsh-mcp-chip' + (hubCategory === key ? ' sel' : ''),
              onClick: () => setHubCategory(key),
            }, label)),
          ),
        ),
        h('div', { className: 'dsh-mcp-market-section' },
          h('b', null, t('skillhub.cn（外部源）')),
          // 计数说清「已显示 / 共」：只写总数就是 19 万条结果旁边只摆一页卡片——
          // 数字是真的，用户在面板里却到不了其余条目，看着就像没有。
          h('span', null, hub.loading ? t('正在搜索…') : installTarget
            ? t('已显示 {shown} / 共 {total} 条 · 装入{scope}', { shown: hub.items.length, total: hub.total, scope: installTarget.scope === 'global' ? t('全局') : installTarget.label })
            : t('已显示 {shown} / 共 {total} 条', { shown: hub.items.length, total: hub.total })),
        ),
        // 两种失败**分开说**：宿主没这个接口 ≠ 上游挂了。混成一句会让用户去查网络，
        // 而真正要做的是重启宿主加载新版插件。
        // 错误 Notice 只在**一页都没有**时替换整个结果区：首屏失败 = 市场打不开，这么摆；
        // 加载更多失败是另一回事——已加载的页面要留着，错误与重试放在结果区上方，
        // 否则上游抖一下，用户已翻的几百张卡就全没了（追加失败是翻页引入的新失败面）。
        hub.items.length === 0
          ? (hub.error
            ? (hub.kind === 'missing'
              ? h(Notice, {
                tone: 'warn', icon: 'warn',
                title: t('当前宿主进程还没有外部源接口'),
                children: t('面板已更新，但这个正在运行的宿主进程是在更新之前启动的，所以它不认识 skillHubSearch。重启宿主（dsh 进程）后即可使用。'),
              })
              : h(Notice, {
                tone: 'warn', icon: 'warn', title: t('连接 skillhub.cn 失败'), children: hub.error,
                actions: [h(Btn, { key: 'retry', cls: 'sm', disabled: hub.loading, onClick: () => void searchHub(), children: t('重试') })],
              }))
            : h(SkillsEmpty, { text: hub.loading ? t('正在搜索…') : t('没有匹配的外部技能。') }))
          : h('div', { className: 'dsh-mcp-grid' },
              ...hub.items.map((item) => h(HubCard, {
                key: item.slug,
                entry: item,
                installed: rows.some((row) => row.name === item.name || row.name === item.slug),
                onInstall: (target) => {
                  setEntry(target);
                  setScope(installTarget?.id || '');
                  setHubDetail(null);
                  // 装之前拉一次详情：披露块要的是发布方认证与安全扫描，列表里没有。
                  void (async () => {
                    const result = await call('skillHubDetail', { slug: target.slug, locale: contentLocale() });
                    setHubDetail(result.ok ? result : { pageUrl: target.pageUrl, publisher: null, security: null, requiresApiKey: target.requiresApiKey });
                  })();
                },
              }))),
        hub.error && hub.items.length > 0
          ? h(Notice, {
            tone: 'warn', icon: 'warn', title: t('加载更多失败'), children: hub.error,
            actions: [h(Btn, { key: 'retry-more', cls: 'sm', disabled: hub.loadingMore, onClick: () => void loadMoreHub(), children: t('重试') })],
          })
          : null,
        // 翻页区：显式按钮（兜底，键盘可达）。滚动到底的自动加载挂在上面那个滚动
        // 容器的 onScroll 上——没有更多时整块消失，摆一个点不动的按钮比不摆更糟。
        hubHasMore
          ? h('div', { className: 'dsh-skills-hub-more' },
              h(Btn, { cls: 'sm', disabled: hub.loadingMore, onClick: () => void loadMoreHub(), children: hub.loadingMore ? t('加载中…') : t('加载更多') }))
          : null,
        h('div', { className: 'dsh-skills-note' },
          h('b', null, t('外部源，本插件未核验。')),
          t('skillhub.cn 上的技能由任何人发布，条目里没有许可信息；安装前会把上游给的发布方认证与安全扫描结论摆出来，但那不等于本插件的审查结论。收录 ≠ 背书。')),
      ),
    // 关闭时**真的卸载**，而不是进到组件内部再 return null：
    // 许可确认的勾选必须随弹窗一起消失。复用实例会让「关掉再开同一个技能」
    // 时 ack 仍是 true——那等于闸门白设。key 保证换一张卡也必是新实例。
    entry ? h(SkillInstallModal, {
      key: entry.name + ':' + (entry.source || ''),
      entry,
      // 传**可写**目标：只读的内置目录不是安装位置（选了它等于把技能写进只读目录）。
      scopeOptions: installTargets,
      scope,
      onScope: setScope,
      onClose: () => { setEntry(null); setHubDetail(null); },
      onConfirm: confirmInstall,
      busy,
      // 外部源：披露块用详情接口拿到的发布方/安全扫描；未到位时先按列表字段说「未提供」。
      external: entry.source === 'skillhub'
        ? {
          pageUrl: hubDetail?.pageUrl || entry.pageUrl,
          publisher: hubDetail?.publisher || null,
          security: hubDetail?.security || null,
          requiresApiKey: entry.requiresApiKey === true,
        }
        : null,
    }) : null,
  );
};

const McpOverlay = ({ call, callSkills, timer, pluginManager }) => {
  const open = usePanelOpen();
  const mode = useEntryMode();
  const seats = overlaySeats(mode, open);
  const [pos, setPos] = useState(() => readFabPos() || defaultFabPos());
  const fabRef = useRef(null);
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);

  // 文案层补接：apply 时 locale 服务可能还没 provide（桌面壳的原生桥让它的 apply
  // 变成异步的）。面板挂载是第一个「宿主肯定已启动完」的时刻，在这里补接——
  // 词典注册会 bump revision，已挂载的 outlet 自动重渲染，语言当即跟上。
  useEffect(() => { ensureLocaleWired() }, []);

  // 窗口尺寸变化时把按钮拉回可视区，避免记忆的位置因分辨率变化而出界。
  // 悬浮按钮被偏好关掉时不订阅：给一个看不见的按钮算位置只是白渲染。
  useEffect(() => {
    if (!ENTRY_VISIBILITY[mode].fab) return;
    const onResize = () => setPos((current) => clampFabPos(current.x, current.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mode]);

  const handlePointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    const el = fabRef.current;
    if (!el) return;
    // 起始位置取 state 的 left/top（而非 getBoundingClientRect），避免 :hover 的 scale
    // 微移左上角带来的几像素误差。
    dragRef.current = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: pos.x,
      startY: pos.y,
      live: { x: pos.x, y: pos.y },
      moved: false,
    };
    try { el.setPointerCapture(event.pointerId); } catch { /* 忽略不支持捕获的环境 */ }
  };
  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    const el = fabRef.current;
    if (!drag || !el) return;
    const dx = event.clientX - drag.startClientX;
    const dy = event.clientY - drag.startClientY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    drag.live = clampFabPos(drag.startX + dx, drag.startY + dy);
    // 跟手：直接写 DOM，不触发 React 渲染；松手时才 setPos 提交。
    el.style.left = drag.live.x + 'px';
    el.style.top = drag.live.y + 'px';
    el.style.cursor = 'grabbing';
  };
  const handlePointerEnd = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (fabRef.current) fabRef.current.style.cursor = '';
    if (!drag) return;
    if (drag.moved) {
      // 拖动收尾：吞掉紧随其后的 click，避免「拖动后误打开面板」；提交位置 + 落盘。
      suppressClickRef.current = true;
      setTimeout(() => { suppressClickRef.current = false; }, 0);
      setPos(drag.live);
      saveFabPos(drag.live);
    }
  };
  const handleClick = () => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    panelVisibility.set(true);
  };

  const style = { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto' };

  return h(
    React2.Fragment,
    null,
    seats.panel ? h(McpTab, { call, callSkills, timer, pluginManager, onClose: () => panelVisibility.set(false), floating: true }) : null,
    seats.fab ? h(
      'button',
      {
        ref: fabRef,
        type: 'button',
        className: 'dsh-mcp-fab',
        title: t('工具箱面板（可拖拽移动）'),
        'aria-label': t('打开工具箱面板'),
        'aria-expanded': false,
        style,
        onClick: handleClick,
        onPointerDown: handlePointerDown,
        onPointerMove: handlePointerMove,
        onPointerUp: handlePointerEnd,
        onPointerCancel: handlePointerEnd,
      },
      h(Icon, { d: ICONS.panel, size: 20 }),
    ) : null,
  );
};

function createTimer() {
  const timeouts = new Set();
  const intervals = new Set();
  return {
    timeout(fn, ms) {
      const id = setTimeout(() => {
        timeouts.delete(id);
        fn();
      }, ms);
      timeouts.add(id);
      return () => {
        clearTimeout(id);
        timeouts.delete(id);
      };
    },
    interval(fn, ms) {
      const id = setInterval(fn, ms);
      intervals.add(id);
      return () => {
        clearInterval(id);
        intervals.delete(id);
      };
    },
    dispose() {
      for (const id of timeouts) clearTimeout(id);
      for (const id of intervals) clearInterval(id);
      timeouts.clear();
      intervals.clear();
    },
  };
}

// strict codec 与 lib/typert.js 是同一份契约的两份产物：宿主 loader 校验 host 那份，
// typert-registry 的**浏览器半**校验这份，两边规则一致而两个渠道查不同的键——
//   0.1.5-rc.x（= 当时 latest/next，npx 默认装到的那条）查 `codec.schema.parse`；
//   0.1.6-alpha.2 起查 `typeof codec.create === 'function'` 并用它物化 schema。
// 所以两个键都写（少写一半就是「面板能加载、一调用就炸」或「加载即拒」）。
// 浏览器侧不需要 zod：宿主只要求 create() 返回带 parse 的 schema。两处必须一起改。
const ANY_VALUE_SCHEMA = { parse: (v) => v };
const STRING_SCHEMA = { parse: (v) => { if (typeof v !== 'string') throw new TypeError('Expected string'); return v; } };
function strictCodec(symbol, schema) {
  return { mode: 'strict', typeSymbol: 'dsh-toolbox-ui/typert#' + symbol, schema: schema, create: () => schema };
}
function mcpCodec(m) { return strictCodec(m, ANY_VALUE_SCHEMA); }
function mcpParam(name, sym) { return { name: name, wire: name, source: 'json', codec: strictCodec(sym, sym === 'String' ? STRING_SCHEMA : ANY_VALUE_SCHEMA) }; }
// skills 侧：id/service/namespace 三处都必须写 skillsManager，且必须与 lib/typert.js 的
// mvs() 逐字节一致（test/client-lifecycle.test.mjs 会 deepEqual 两侧）。
// 三个 Skills* 结果码复用 ANY_VALUE_SCHEMA：与 MCP 侧同一策略（宿主只要求 create() 返回带
// parse 的 schema，真正校验在宿主的 TYPERT 那份 zod 上）。
function skParam(name, sym) { return { name: name, wire: name, source: 'json', codec: strictCodec(sym, ANY_VALUE_SCHEMA) }; }
function sk(method, parameters, resultSym) {
  return {
    id: 'dsh-toolbox-ui#skillsManager/' + method,
    service: 'skillsManager',
    namespace: 'skillsManager',
    method: method,
    invocation: { kind: 'direct' },
    parameters: parameters,
    result: mcpCodec(resultSym),
  };
}
const MCP_CONTRIBUTION = {
  package: 'dsh-toolbox-ui',
  descriptors: [
    // <rpc-contract:begin> 由 scripts/rpc-contract.mjs 生成，勿手改
    { id: 'dsh-toolbox-ui#mcpManager/list', service: 'mcpManager', namespace: 'mcpManager', method: 'list', invocation: { kind: 'direct' }, parameters: [], result: mcpCodec('ListResult') },
    { id: 'dsh-toolbox-ui#mcpManager/status', service: 'mcpManager', namespace: 'mcpManager', method: 'status', invocation: { kind: 'direct' }, parameters: [mcpParam('name', 'String')], result: mcpCodec('StatusResult') },
    { id: 'dsh-toolbox-ui#mcpManager/enable', service: 'mcpManager', namespace: 'mcpManager', method: 'enable', invocation: { kind: 'direct' }, parameters: [mcpParam('name', 'String')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/disable', service: 'mcpManager', namespace: 'mcpManager', method: 'disable', invocation: { kind: 'direct' }, parameters: [mcpParam('name', 'String')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/reconnect', service: 'mcpManager', namespace: 'mcpManager', method: 'reconnect', invocation: { kind: 'direct' }, parameters: [mcpParam('name', 'String')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/tools', service: 'mcpManager', namespace: 'mcpManager', method: 'tools', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('ToolsResult') },
    { id: 'dsh-toolbox-ui#mcpManager/builtins', service: 'mcpManager', namespace: 'mcpManager', method: 'builtins', invocation: { kind: 'direct' }, parameters: [], result: mcpCodec('BuiltinCatalogResult') },
    { id: 'dsh-toolbox-ui#mcpManager/installBuiltins', service: 'mcpManager', namespace: 'mcpManager', method: 'installBuiltins', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'BuiltinInstallPayload')], result: mcpCodec('BuiltinInstallResult') },
    { id: 'dsh-toolbox-ui#mcpManager/add', service: 'mcpManager', namespace: 'mcpManager', method: 'add', invocation: { kind: 'direct' }, parameters: [mcpParam('spec', 'Spec')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/update', service: 'mcpManager', namespace: 'mcpManager', method: 'update', invocation: { kind: 'direct' }, parameters: [mcpParam('spec', 'Spec')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/removeServer', service: 'mcpManager', namespace: 'mcpManager', method: 'removeServer', invocation: { kind: 'direct' }, parameters: [mcpParam('name', 'String')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/setDeferAll', service: 'mcpManager', namespace: 'mcpManager', method: 'setDeferAll', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'DeferAllPayload')], result: mcpCodec('DeferAllResult') },
    { id: 'dsh-toolbox-ui#mcpManager/setDefer', service: 'mcpManager', namespace: 'mcpManager', method: 'setDefer', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'DeferPayload')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/toolSearchSettings', service: 'mcpManager', namespace: 'mcpManager', method: 'toolSearchSettings', invocation: { kind: 'direct' }, parameters: [], result: mcpCodec('ToolSearchSettings') },
    { id: 'dsh-toolbox-ui#mcpManager/updateToolSearchSettings', service: 'mcpManager', namespace: 'mcpManager', method: 'updateToolSearchSettings', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ToolSearchSettingsPayload')], result: mcpCodec('ToolSearchSettings') },
    { id: 'dsh-toolbox-ui#mcpManager/toolLoadingSettings', service: 'mcpManager', namespace: 'mcpManager', method: 'toolLoadingSettings', invocation: { kind: 'direct' }, parameters: [], result: mcpCodec('ToolLoadingSettings') },
    { id: 'dsh-toolbox-ui#mcpManager/updateToolLoadingSettings', service: 'mcpManager', namespace: 'mcpManager', method: 'updateToolLoadingSettings', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ToolLoadingPayload')], result: mcpCodec('ToolLoadingSettings') },
    { id: 'dsh-toolbox-ui#mcpManager/workspaceToolLoading', service: 'mcpManager', namespace: 'mcpManager', method: 'workspaceToolLoading', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ToolLoadingPayload')], result: mcpCodec('ToolLoadingSettings') },
    { id: 'dsh-toolbox-ui#mcpManager/setWorkspaceToolLoading', service: 'mcpManager', namespace: 'mcpManager', method: 'setWorkspaceToolLoading', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ToolLoadingPayload')], result: mcpCodec('ToolLoadingSettings') },
    { id: 'dsh-toolbox-ui#mcpManager/reveal', service: 'mcpManager', namespace: 'mcpManager', method: 'reveal', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('RevealResult') },
    { id: 'dsh-toolbox-ui#mcpManager/previewImport', service: 'mcpManager', namespace: 'mcpManager', method: 'previewImport', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('ImportPreview') },
    { id: 'dsh-toolbox-ui#mcpManager/importJson', service: 'mcpManager', namespace: 'mcpManager', method: 'importJson', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('ImportResult') },
    { id: 'dsh-toolbox-ui#mcpManager/scanImportSources', service: 'mcpManager', namespace: 'mcpManager', method: 'scanImportSources', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('ImportSourcesResult') },
    { id: 'dsh-toolbox-ui#mcpManager/previewImportSource', service: 'mcpManager', namespace: 'mcpManager', method: 'previewImportSource', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('ImportPreview') },
    { id: 'dsh-toolbox-ui#mcpManager/importSource', service: 'mcpManager', namespace: 'mcpManager', method: 'importSource', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('ImportResult') },
    { id: 'dsh-toolbox-ui#mcpManager/listWorkspaces', service: 'mcpManager', namespace: 'mcpManager', method: 'listWorkspaces', invocation: { kind: 'direct' }, parameters: [], result: mcpCodec('WorkspaceListResult') },
    { id: 'dsh-toolbox-ui#mcpManager/getWorkspaceView', service: 'mcpManager', namespace: 'mcpManager', method: 'getWorkspaceView', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('WorkspaceViewResult') },
    { id: 'dsh-toolbox-ui#mcpManager/addWorkspaceServer', service: 'mcpManager', namespace: 'mcpManager', method: 'addWorkspaceServer', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/updateWorkspaceServer', service: 'mcpManager', namespace: 'mcpManager', method: 'updateWorkspaceServer', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/removeWorkspaceServer', service: 'mcpManager', namespace: 'mcpManager', method: 'removeWorkspaceServer', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/setWorkspaceExclude', service: 'mcpManager', namespace: 'mcpManager', method: 'setWorkspaceExclude', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/installWorkspaceBuiltins', service: 'mcpManager', namespace: 'mcpManager', method: 'installWorkspaceBuiltins', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'BuiltinInstallPayload')], result: mcpCodec('BuiltinInstallResult') },
    { id: 'dsh-toolbox-ui#mcpManager/previewWorkspaceImport', service: 'mcpManager', namespace: 'mcpManager', method: 'previewWorkspaceImport', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('ImportPreview') },
    { id: 'dsh-toolbox-ui#mcpManager/importWorkspaceJson', service: 'mcpManager', namespace: 'mcpManager', method: 'importWorkspaceJson', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('ImportResult') },
    { id: 'dsh-toolbox-ui#mcpManager/copyWorkspaceServers', service: 'mcpManager', namespace: 'mcpManager', method: 'copyWorkspaceServers', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('WorkspaceCopyResult') },
    { id: 'dsh-toolbox-ui#mcpManager/previewWorkspaceCopy', service: 'mcpManager', namespace: 'mcpManager', method: 'previewWorkspaceCopy', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('WorkspaceCopyPreview') },
    { id: 'dsh-toolbox-ui#mcpManager/exportWorkspaceJson', service: 'mcpManager', namespace: 'mcpManager', method: 'exportWorkspaceJson', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('WorkspaceExportResult') },
    { id: 'dsh-toolbox-ui#mcpManager/revealWorkspaceServer', service: 'mcpManager', namespace: 'mcpManager', method: 'revealWorkspaceServer', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('RevealResult') },
    { id: 'dsh-toolbox-ui#mcpManager/projectConnections', service: 'mcpManager', namespace: 'mcpManager', method: 'projectConnections', invocation: { kind: 'direct' }, parameters: [], result: mcpCodec('ProjectConnectionsResult') },
    { id: 'dsh-toolbox-ui#mcpManager/reconnectWorkspaceServer', service: 'mcpManager', namespace: 'mcpManager', method: 'reconnectWorkspaceServer', invocation: { kind: 'direct' }, parameters: [mcpParam('payload', 'ImportPayload')], result: mcpCodec('NoteResult') },
    { id: 'dsh-toolbox-ui#mcpManager/updateHint', service: 'mcpManager', namespace: 'mcpManager', method: 'updateHint', invocation: { kind: 'direct' }, parameters: [], result: mcpCodec('UpdateHintResult') },
    { id: 'dsh-toolbox-ui#mcpManager/whatsNew', service: 'mcpManager', namespace: 'mcpManager', method: 'whatsNew', invocation: { kind: 'direct' }, parameters: [], result: mcpCodec('WhatsNewResult') },
    sk('list', [skParam('payload', 'SkillPayload')], 'SkillListResult'),
    sk('detail', [skParam('payload', 'SkillPayload')], 'SkillDetailResult'),
    sk('setEnabled', [skParam('payload', 'SkillPayload')], 'SkillMutationResult'),
    sk('setModelInvocable', [skParam('payload', 'SkillPayload')], 'SkillMutationResult'),
    sk('setUserInvocable', [skParam('payload', 'SkillPayload')], 'SkillMutationResult'),
    sk('removeSkill', [skParam('payload', 'SkillPayload')], 'SkillMutationResult'),
    sk('importSkill', [skParam('payload', 'SkillPayload')], 'SkillMutationResult'),
    sk('skillTargets', [skParam('payload', 'SkillPayload')], 'SkillTargetsResult'),
    sk('skillHubSearch', [skParam('payload', 'SkillPayload')], 'SkillHubSearchResult'),
    sk('skillHubDetail', [skParam('payload', 'SkillPayload')], 'SkillHubDetailResult'),
    sk('skillHubCategories', [skParam('payload', 'SkillPayload')], 'SkillHubCategoriesResult'),
    sk('skillHubInstall', [skParam('payload', 'SkillPayload')], 'SkillMutationResult'),
    sk('conflictingManager', [], 'SkillConflictResult'),
    // <rpc-contract:end>
  ].map((descriptor) => ({ ...descriptor, sourceLocation: { file: 'dsh-toolbox-ui/lib/typert.js', line: 7, column: 1 } }))
};
/** apply 时没探到 locale 服务时留下的 ctx，供面板首次挂载时重探（桌面壳的异步 provide）。 */
let localeProbeCtx = null;
/** 文案层是否已接上线（探到服务且 register/bind 成功）。 */
let localeWired = false;

/**
 * 把面板的词典接到宿主的 locale 服务上。探不到服务就原样返回 false（调用方决定
 * 是否留下 ctx 稍后重探）。任何异常都按「没接上」处理——翻译层接不上不得挡住
 * 面板（fail-open），退化成中文原文。
 *
 * 注册**中英两份**词典（见 ZH_DICT 的注释：只注册 en 会让中文模式整片变英文，
 * 因为宿主把英文设为每条回落链的终点）。
 * @param {object} ctx - 插件 apply 的 cordis 上下文。
 * @returns {boolean} 是否接上了。
 */
function wireLocale(ctx) {
  try {
    const locale = typeof ctx?.get === 'function' ? ctx.get('locale') : null;
    if (!locale || typeof locale.register !== 'function' || typeof locale.bind !== 'function') return false;
    // ctx.effect 保证插件卸载时词典随之注销（否则 HMR 重载会因 (ns, locale) 重复占用而抛错）。
    ctx.effect(() => locale.register(LOCALE_NS, { zh: ZH_DICT, en: EN_DICT }), 'dsh-toolbox-ui: dictionaries');
    // bind 的返回值必须验一次：宿主若返回非函数，下面每次渲染调 localeT(zh) 都会抛，
    // 而整段接线在 try 里——异常会被 catch 吞掉、面板无声退化。这里挡在接线处，
    // 坏 bind 按「没有语言包」处理（退回自带表/中文原文），不留定时炸弹。
    const bound = locale.bind(LOCALE_NS);
    localeT = typeof bound === 'function' ? bound : null;
    // 记录 active 语言。用订阅而不是只读一次：用户在设置里切语言时不能要求重开面板。
    // getLocale() 缺失（老宿主）时不订阅，active 保持 null → t() 恒等回中文，
    // 面板在该宿主上就是纯中文——这是没有语言服务时唯一诚实的表现。
    if (typeof locale.getLocale === 'function' && typeof locale.subscribe === 'function') {
      const readActive = () => {
        const next = locale.getLocale()?.active ?? null;
        // 只在语言**真变**时 bump：宿主每次发布（含我们自己注册词典）都会通知订阅者，
        // 无脑 bump 会让市场的 effect 白拉一遍。
        if (next === localeActive) return;
        localeActive = next;
        localeVersion.bump();
      };
      readActive();
      ctx.effect(() => locale.subscribe(readActive), 'dsh-toolbox-ui: locale subscription');
    }
    localeWired = true;
    return true;
  } catch {
    // 刻意吞掉：翻译层接不上不得挡住面板（fail-open），退化成中文原文。
    localeT = null;
    localeActive = null;
    return false;
  }
}

/** 面板首次挂载时调用：apply 没接上 locale 服务（桌面壳的异步 provide）就在这里补接。 */
function ensureLocaleWired() {
  if (localeWired || !localeProbeCtx) return;
  if (wireLocale(localeProbeCtx)) localeProbeCtx = null;
}

async function apply(ctx) {
  const disposeMount = await ctx.remote.$mount(MCP_CONTRIBUTION);
  let disposeCss;
  let timer;
  // 文案层接线。**必须早于任何组件注册**：槽位一旦注册就会渲染，渲染时 t() 已经在用
  // localeT 了——晚接线会让首帧显示中文、切换后才变英文（闪一下）。
  // locale 服务不在时（没挂 dsh-client-locale）整段跳过，t() 退化成恒等，面板照常。
  //
  // ⚠️ 但「不在」可能只是**迟到**：桌面壳给 locale 插件的 apply 挂了原生桥
  // （`__DSH_LOCALE__.read()` 是异步的），它要先 await 才 provide；我们的 apply
  // 先跑完时 ctx.get('locale') 就是 null。真机表现：桌面版面板恒中文、在设置里
  // 切语言也不跟随（web 没有这座桥、同步 provide，所以 web 一直是好的）。
  // 不能改用 inject 声明依赖：宿主没有 locale 插件时 inject 会让 fiber 保持
  // inactive——整个面板直接不出现（见 docs/design.en.md 对 inject 的说明）。
  // 所以：apply 探一次；没探到就把 ctx 留下，面板首次挂载时重探——那一刻桌面壳的
  // 异步 provide 早已完成，而词典注册会 bump revision，已挂载的 outlet 自动重渲染。
  if (!wireLocale(ctx)) localeProbeCtx = ctx;
  let cleanupPromise;
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      try {
        timer?.dispose();
      } finally {
        try {
          disposeCss?.();
        } finally {
          await disposeMount();
        }
      }
    })();
    return cleanupPromise;
  };

  try {
    // 让位检测（D15）放在**注册入口之前**：一旦注册了 slot，两个面板就会并存。
    // 检测失败一律视为「无冲突」（fail-open，SPEC 约束 10）——见 callSkills 的降级形态。
    let conflict = null;
    try {
      const svc = typeof ctx.get === 'function' ? ctx.get('remote.skillsManager') : null;
      if (svc && typeof svc.conflictingManager === 'function') {
        const probe = await svc.conflictingManager();
        const value = probe && probe.ok ? probe.value : probe;
        if (value && typeof value.name === 'string') conflict = value;
      }
    } catch {
      // 刻意吞掉：探测本身失败不得挡住面板（fail-open）。
      conflict = null;
    }
    // ⚠️ 必须**合并成一次**注入：__injectCss 的 id 与 data-plugin-css 写死为
    // 'dsh-toolbox-ui/mcp.css'，以同一 id 二次调用会复用同一个 <style> 标签并覆写
    // textContent——skills 样式会把 MCP 面板样式静默冲掉（不报错，只是面板变形）。
    // 合并同时也让 client-lifecycle 的 document.styles.length === 1 断言继续成立。
    disposeCss = __injectCss(MCP_CSS + '\n' + SKILLS_CSS);
    timer = createTimer();
    const call = async (method, args) => {
      const svc = (typeof ctx.get === 'function' ? ctx.get('remote.mcpManager') : null) || null;
      if (!svc || typeof svc[method] !== 'function') return { ok: false, error: t('MCP 市场服务未连接（面板仍可用）') };
      const r = args === undefined || args === null ? await svc[method]() : await svc[method](args);
      if (r && r.ok) return { ok: true, ...((r.value && typeof r.value === 'object') ? r.value : {}) };
      if (r && !r.ok) return { ok: false, error: (r.error && (r.error.message || r.error.code)) || t('调用失败') };
      return r;
    };
    // 技能侧**独立的** call：skillsManager 与 mcpManager 是两个服务，取不到时降级成
    // 「技能服务未连接」，MCP 面板照常可用（SPEC 约束 16：宿主可禁用 dsh-skill 内置插件，
    // 那种 profile 里技能面必须只是不可用，不能连累 MCP 面）。
    const callSkills = async (method, args) => {
      const svc = (typeof ctx.get === 'function' ? ctx.get('remote.skillsManager') : null) || null;
      if (!svc || typeof svc[method] !== 'function') return { ok: false, error: t('技能服务未连接（需要宿主挂载 dsh-skill）') };
      const r = args === undefined || args === null ? await svc[method]() : await svc[method](args);
      if (r && r.ok) return { ok: true, ...((r.value && typeof r.value === 'object') ? r.value : {}) };
      if (r && !r.ok) return { ok: false, error: (r.error && (r.error.message || r.error.code)) || t('调用失败') };
      return r;
    };
    // 一键升级要用官方 pluginManager，而它只在 apply 的 ctx 上取得到（面板组件拿不到 ctx——
    // 它的 props 来自 slot 的 inject）。所以在这里取好、随 inject 传进面板，与 call 同一手法；
    // 取不到就给 null，面板据此不显示按钮。
    if (conflict) {
      // 只渲染提示、不注册入口。样式仍要注入，否则提示没有排版。
      ctx.slots.inject('shell.overlay', () =>
        ctx.slots.register({ name: 'shell.overlay', id: 'mcp-handover', order: 1000, label: () => t('工具箱') }, () => h(HandoverNotice, { conflict })),
      );
      return cleanup;
    }
    const pluginManager = (typeof ctx.get === 'function' ? ctx.get('remote.' + UPGRADE_NAMESPACE) : null)
      || (ctx.remote && ctx.remote[UPGRADE_NAMESPACE])
      || null;
    ctx.slots.inject('shell.overlay', () =>
      ctx.slots.register({ name: 'shell.overlay', id: 'mcp-fab', order: 1000, label: () => t('工具箱'), inject: () => ({ call, callSkills, timer, pluginManager }) }, McpOverlay),
    );
    // 官方标准侧栏入口（sidebar.footer.action，0.1.5 起声明）：与悬浮按钮共享同一个
      // 面板和开关状态。用 inject 而不是直接 register：它声明感知，会等侧边栏把 slot 声明出来
      // （插件加载顺序不保证晚于侧边栏）。
    // ⚠️ label 就是侧栏里**看得见的那几个字**（slot 的 label 由外壳渲染）。这里从 'MCP' 改成
    // t('工具箱')：面板早就不是只有 MCP 了（还有技能面与技能市场），而 name/包名是 dsh-toolbox-ui
    // ——入口上写着 MCP、点开却是 MCP + 技能，用户第一眼就会问"名字怎么还是 MCP"。
    // ⚠️ label 必须写成 **thunk**（() => t('工具箱')）而不是求值好的字符串：宿主的 SlotLabel
    // 契约是「string | (() => string)」，侧栏每读一次条目就 resolveSlotLabel 一次（且订阅
    // locale 变化重解），thunk 才会跟着当前语言走；直接写 t('工具箱') 会把语言冻在插件加载
    // 那一刻，切语言后侧栏入口停在旧语言直到宿主重启。
    ctx.slots.inject('sidebar.footer.action', () =>
      ctx.slots.register({ name: 'sidebar.footer.action', id: 'mcp-manager', order: 100, label: () => t('工具箱') }, McpFooterAction),
    );
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
const inject = ['slots', 'remote', 'typert', 'remote.pluginManager'];
exports.apply = apply;
exports.inject = inject;

		return module.exports;
	}
});


