'use strict';

// ---------------------------------------------------------------------------
// journal-stream 历史续读补丁（BUG1「历史对话加载不完整」根因之一）。
//
// 靶：@deepseek-ai/dsh-api-gateway/lib/client.js 的 RemoteJournalStream.prepend()。
// 内核把「历史页与当前窗口不连续（!follows）」一律 fail-soft：publish
// entries:[] + hasMore:false 并 throw。session-controller 侧 prependWindow 遂把
// hasMore 永久锁死为 false，loadOlder / loadThrough 立即停摆——表现即「上滑到顶、
// 进度条到头，但早期对话从未加载」。
//
// !follows 实为两类的合并：
//   (a) 纯 gap：本页最新条 last(tail) < before（seq 空洞，典型来自对话拆分 / 多
//       版本迭代的 fork）。accepted 已由 filter 保证每条 first < before，且此分支
//       last(tail) < before，故全部严格更旧、绝不与当前窗口重叠 → 直接 prepend 安全，
//       且能让历史跨过 fork 空洞继续向更早处加载（用户核心诉求）。
//   (b) overlap/straddle：某条 ranged entry 的 last(tail) >= before，横跨窗口头部。
//       若也 prepend 会把窗口内已有的 seq 重复渲染（破坏「准确回溯」）。
//
// 修复：把 fail-soft 的触发条件收窄到 (b)（compare(last(tail), before) >= 0）。
// (a) gap 不再命中守卫，落入下方正常分支：prepend accepted（全严格更旧）+ 推进
// firstCursor/baseSeq + 回填真实 hasMore，历史可持续翻页。(b) overlap 维持原
// fail-soft（不注入重复）。连续页（follows 为真）本就不进守卫，行为不变，无回归。
// ---------------------------------------------------------------------------

const JOURNAL_PREPEND_MARKER = 'dsh-desktop compat: continue history past seq gap';

// OLD：不连续守卫的条件行（唯一）。制表符缩进，与 gateway/lib/client.js :1032 逐字节对齐。
const JOURNAL_PREPEND_OLD = [
  '\t\t\t\tif (tail !== void 0 && before !== void 0 && !this.options.follows(this.options.last(tail), before)) {',
].join('\n');

// NEW：三行说明注释 + 收窄后的守卫条件（仅对 overlap/straddle 触发 fail-soft）。
const JOURNAL_PREPEND_NEW = [
  '\t\t\t\t// ' + JOURNAL_PREPEND_MARKER + '.',
  '\t\t\t\t// Restrict the fail-soft lock+throw to overlapping/straddle pages (last(tail) >= before).',
  '\t\t\t\t// A pure seq gap (fork hole) now falls through to the normal prepend branch below: publish',
  '\t\t\t\t// the strictly-older accepted entries, advance firstCursor, and report real hasMore, so history',
  '\t\t\t\t// keeps paging past fork discontinuities instead of locking the window at the first hole.',
  '\t\t\t\tif (tail !== void 0 && before !== void 0 && !this.options.follows(this.options.last(tail), before) && this.options.compare(this.options.last(tail), before) >= 0) {',
].join('\n');

function transformJournalPrependContinuity(src, file) {
  if (src.includes(JOURNAL_PREPEND_MARKER)) return { status: 'already' };
  const hit = src.split(JOURNAL_PREPEND_OLD).length - 1;
  if (hit === 0) {
    return { status: 'anchor-missing', detail: '未找到 journal-stream 断头锚点（版本可能已变更），跳过 ' + file };
  }
  // 只接受唯一命中；多处命中说明锚点被复制，宁可 anchor-missing 也不误改。
  if (hit > 1) {
    return { status: 'anchor-missing', detail: 'journal-stream 断头锚点命中 ' + hit + ' 处（非唯一），跳过 ' + file };
  }
  const patched = src.replace(JOURNAL_PREPEND_OLD, () => JOURNAL_PREPEND_NEW);
  if (patched === src) {
    return { status: 'anchor-missing', detail: '未找到 journal-stream 断头锚点（版本可能已变更），跳过 ' + file };
  }
  return { status: 'changed', src: patched };
}

module.exports = {
  JOURNAL_PREPEND_MARKER,
  JOURNAL_PREPEND_OLD,
  JOURNAL_PREPEND_NEW,
  transformJournalPrependContinuity,
};
