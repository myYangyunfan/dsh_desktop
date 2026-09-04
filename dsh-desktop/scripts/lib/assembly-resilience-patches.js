'use strict';

// ---------------------------------------------------------------------------
// 会话装配「可观测化 + 自愈」补丁（BUG2 最低风险档）。
//
// 靶：@deepseek-ai/dsh-client-ui-conversation/lib/client.js 的 BoundConversation
// （assembly.ts 编译产物）。它是 Conversation 装配的驱动点：feed.subscribe 回调里
// 调 accept(window)，再把事件喂给 ConversationNodeAssembler.append/prepend/replaceWindow。
//
// 现状问题（真因链见交付报告）：装配器对「more than one start Match」「non-appended
// Match」「update before its start Match」一律 throw；这些本是上游应保证的不变量。抛错
// 冒泡到 client-store 的 notifySubscribers，被其 try/catch 以 console.error 静默吞掉，
// 快照不再前进——事件已在 durable journal（后台有轨迹），界面却不渲染（“吞消息”）。
// 对话拆分/多版本迭代 + 历史窗口不全时最易命中：某节点 owning start 尚未随窗口加载到位，
// update 先到 → 装配抛错或 state 未就绪 → 该轮/该版本永远不出节点。
//
// 本补丁不碰装配语义、不碰协议热路径、不碰去重逻辑，只在驱动层做两件事：
// ① 自愈：捕获 accept 里增量装配（prepend/append）或整体 replace 抛出的异常，改为
//    调用 dshSafeRebuild——从 durable 的“完整连续窗口” window.entries（权威真相，与
//    原 this.replace 所用同一数据）重建全部 Context。瞬时竞态（start 稍后随翻页补齐后）
//    据此一次重建即恢复、节点重新出现，替代过去“永久消失直到手动重载”。
// ② 可观测：若连重建都无法装配（durable 窗口本身结构损坏），不再静默——输出带固定
//    前缀 [dsh-assembly-resilience] 的、按错误内容去重一次的 console.error，供用户反馈
//    定位；同时保持 feed 存活（下一个独立事件照常重试），绝不因抛错卡死、也不递归。
//
// 唯一锚：整个 accept(window) 方法体（`accept(window) {` 于产物内唯一）。命中数非 1
// 即视为版本漂移整块跳过，绝不部分应用。
// ---------------------------------------------------------------------------

const ASSEMBLY_RESILIENCE_MARKER = 'dsh-desktop compat: recover swallowed conversation assembly fault';

// 原 accept(window) 方法体（产物内 3 tab 缩进、LF 行尾）。
const ACCEPT_OLD = [
  '\t\t\taccept(window) {',
  '\t\t\t\tif (window.revision === this.revision) return;',
  '\t\t\t\tif (window.revision !== this.revision + 1 || window.change.kind === "replace") {',
  '\t\t\t\t\tthis.replace(window);',
  '\t\t\t\t\treturn;',
  '\t\t\t\t}',
  '\t\t\t\tthis.revision = window.revision;',
  '\t\t\t\tswitch (window.change.kind) {',
  '\t\t\t\t\tcase "prepend":',
  '\t\t\t\t\t\tthis.publish(this.assembler.prepend(window.change.entries, window.hasMore));',
  '\t\t\t\t\t\treturn;',
  '\t\t\t\t\tcase "append": {',
  '\t\t\t\t\t\tlet publication = "none";',
  '\t\t\t\t\t\tfor (const event of window.change.entries) {',
  '\t\t\t\t\t\t\tconst next = this.assembler.append(event);',
  '\t\t\t\t\t\t\tif (next === "immediate" || publication === "none") publication = next;',
  '\t\t\t\t\t\t}',
  '\t\t\t\t\t\tthis.publish(publication);',
  '\t\t\t\t\t}',
  '\t\t\t\t}',
  '\t\t\t}',
].join('\n');

// 加固版：非连续/replace 分支走 dshSafeRebuild；增量分支包 try/catch；新增自愈重建方法。
const ACCEPT_NEW = [
  '\t\t\taccept(window) {',
  '\t\t\t\tif (window.revision === this.revision) return;',
  '\t\t\t\tif (window.revision !== this.revision + 1 || window.change.kind === "replace") {',
  '\t\t\t\t\tthis.dshSafeRebuild(window);',
  '\t\t\t\t\treturn;',
  '\t\t\t\t}',
  '\t\t\t\tthis.revision = window.revision;',
  '\t\t\t\ttry {',
  '\t\t\t\t\tswitch (window.change.kind) {',
  '\t\t\t\t\t\tcase "prepend":',
  '\t\t\t\t\t\t\tthis.publish(this.assembler.prepend(window.change.entries, window.hasMore));',
  '\t\t\t\t\t\t\treturn;',
  '\t\t\t\t\t\tcase "append": {',
  '\t\t\t\t\t\t\tlet publication = "none";',
  '\t\t\t\t\t\t\tfor (const event of window.change.entries) {',
  '\t\t\t\t\t\t\t\tconst next = this.assembler.append(event);',
  '\t\t\t\t\t\t\t\tif (next === "immediate" || publication === "none") publication = next;',
  '\t\t\t\t\t\t\t}',
  '\t\t\t\t\t\t\tthis.publish(publication);',
  '\t\t\t\t\t\t}',
  '\t\t\t\t\t}',
  '\t\t\t\t} catch (error) {',
  '\t\t\t\t\tthis.dshSafeRebuild(window, error);',
  '\t\t\t\t}',
  '\t\t\t}',
  '\t\t\tdshSafeRebuild(window, cause) {',
  '\t\t\t\t// ' + ASSEMBLY_RESILIENCE_MARKER + ' fault by rebuilding from the authoritative',
  '\t\t\t\t// contiguous window; surface a single deduped tagged error if even that cannot',
  '\t\t\t\t// assemble, and keep the feed alive (no recursion, no wedged subscription).',
  '\t\t\t\tthis.revision = window.revision;',
  '\t\t\t\ttry {',
  '\t\t\t\t\tthis.publish(this.assembler.replaceWindow(window.entries, window.hasMore));',
  '\t\t\t\t\tthis.dshAssemblyFault = void 0;',
  '\t\t\t\t} catch (error) {',
  '\t\t\t\t\tconst detail = "[dsh-assembly-resilience] 会话历史装配自愈失败，已跳过本次重建：" + (error && error.message);',
  '\t\t\t\t\tif (this.dshAssemblyFault !== detail) {',
  '\t\t\t\t\t\tthis.dshAssemblyFault = detail;',
  '\t\t\t\t\t\tconsole.error(detail, { revision: window.revision, change: window.change && window.change.kind, cause: cause && cause.message });',
  '\t\t\t\t\t}',
  '\t\t\t\t}',
  '\t\t\t}',
].join('\n');

function transformConversationAssemblyResilience(src, file) {
  if (src.includes(ASSEMBLY_RESILIENCE_MARKER)) return { status: 'already' };
  const hit = src.split(ACCEPT_OLD).length - 1;
  if (hit === 0) {
    return { status: 'anchor-missing', detail: '未找到会话装配 accept 锚点（版本可能已变更），跳过 ' + file };
  }
  if (hit > 1) {
    return { status: 'anchor-missing', detail: '会话装配 accept 锚点命中 ' + hit + ' 处（非唯一），跳过 ' + file };
  }
  const patched = src.replace(ACCEPT_OLD, () => ACCEPT_NEW);
  if (patched === src) {
    return { status: 'anchor-missing', detail: '未找到会话装配 accept 锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: patched };
}

module.exports = {
  ASSEMBLY_RESILIENCE_MARKER,
  ACCEPT_OLD,
  ACCEPT_NEW,
  transformConversationAssemblyResilience,
};
