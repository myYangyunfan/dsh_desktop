'use strict';

// ---------------------------------------------------------------------------
// journal-stream 历史续读补丁（BUG1「历史对话加载不完整」根因之一）。
//
// 靶：@deepseek-ai/dsh-api-gateway 的 RemoteJournalStream.prepend()。
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

// 锚点：不连续守卫的 if 行（每个客户端恰好一处）。0.2.1-rc.1 起 dsh-api-gateway 把
// lib/client.js 拆成 client.node.js + client.browser.js 两份 bundle，两份缩进不同
// （node 半边 2 个制表符 / browser 半边 4 个）。前导空白按命中行实际捕获、不写死——
// 写死任一固定缩进等于只修一半，另一半历史仍断头。
const JOURNAL_PREPEND_GUARD_TAIL =
  'if (tail !== void 0 && before !== void 0 && !this.options.follows(this.options.last(tail), before)) {';
// 收窄后的守卫（与上方逐字同前缀，只多一个 compare 合取；写成字面量以免程序化拼串把
// if 的右括号吃掉——吃掉就是语法错误，bundle 直接炸）。
const JOURNAL_PREPEND_NARROWED_TAIL =
  'if (tail !== void 0 && before !== void 0 && !this.options.follows(this.options.last(tail), before) && this.options.compare(this.options.last(tail), before) >= 0) {';
const JOURNAL_PREPEND_RE = new RegExp(
  '^(\\t+)' + JOURNAL_PREPEND_GUARD_TAIL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$',
  'gm',
);

// minify 形态（0.2.2-rc.2 的 browser 半边：整行压平、无空格、无缩进）。同一条守卫语义，
// 只是真字节不同：`if(tail!==void 0&&before!==void 0&&!this.options.follows(...)){`。
// 与格式化形态并存（node 半边仍是 2 tab 多行），两者都按「唯一命中」判定。
const JOURNAL_PREPEND_GUARD_MIN =
  'if(tail!==void 0&&before!==void 0&&!this.options.follows(this.options.last(tail),before)){';
const JOURNAL_PREPEND_NARROWED_MIN =
  'if(tail!==void 0&&before!==void 0&&!this.options.follows(this.options.last(tail),before)&&this.options.compare(this.options.last(tail),before)>=0){';
const JOURNAL_PREPEND_MIN_RE = new RegExp(
  JOURNAL_PREPEND_GUARD_MIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  'g',
);

// 说明注释 + 收窄后的守卫条件（仅对 overlap/straddle 触发 fail-soft），逐行套命中处的缩进。
function journalPrependReplacement(indent) {
  return [
    indent + '// ' + JOURNAL_PREPEND_MARKER + '.',
    indent + '// Restrict the fail-soft lock+throw to overlapping/straddle pages (last(tail) >= before).',
    indent + '// A pure seq gap (fork hole) now falls through to the normal prepend branch below: publish',
    indent + '// the strictly-older accepted entries, advance firstCursor, and report real hasMore, so history',
    indent + '// keeps paging past fork discontinuities instead of locking the window at the first hole.',
    indent + JOURNAL_PREPEND_NARROWED_TAIL,
  ].join('\n');
}

function transformJournalPrependContinuity(src, file) {
  if (src.includes(JOURNAL_PREPEND_MARKER)) return { status: 'already' };
  const hits = src.match(JOURNAL_PREPEND_RE);
  if (hits && hits.length === 1) {
    const indent = hits[0].slice(0, hits[0].indexOf('if ('));
    const patched = src.replace(JOURNAL_PREPEND_RE, () => journalPrependReplacement(indent));
    if (patched !== src) return { status: 'changed', src: patched };
  }
  // minify 形态（browser 半边）：整行内联，无缩进可捕获，注入体也压成单行。
  const minHits = src.match(JOURNAL_PREPEND_MIN_RE);
  if (minHits && minHits.length === 1) {
    const patched = src.replace(
      JOURNAL_PREPEND_MIN_RE,
      () => '/* ' + JOURNAL_PREPEND_MARKER + ': only overlap/straddle pages lock+throw; a pure seq gap prepends. */' + JOURNAL_PREPEND_NARROWED_MIN,
    );
    if (patched !== src) return { status: 'changed', src: patched };
  }
  return {
    status: 'anchor-missing',
    detail: '未找到 journal-stream 断头锚点（版本可能已变更），跳过 ' + file,
  };
}

module.exports = {
  JOURNAL_PREPEND_MARKER,
  JOURNAL_PREPEND_GUARD_TAIL,
  JOURNAL_PREPEND_NARROWED_TAIL,
  JOURNAL_PREPEND_RE,
  journalPrependReplacement,
  transformJournalPrependContinuity,
};
