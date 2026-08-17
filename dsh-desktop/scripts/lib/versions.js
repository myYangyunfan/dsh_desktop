'use strict';

// ---------------------------------------------------------------------------
// 版本号比较（全仓唯一实现，单一数据源）。
//
// 历史：updater.js（客户端/agent 更新）与 scripts/plugin-manager-update.js
// （插件检查更新）曾各自维护一份语义不同的实现，companion-profile.js 再跨
// 层 require 脚本文件拿版本比较——三处共两份算法，边界行为逐步漂移
// （前导 v、四段版本、预发布段比较）。本模块收口为一份实现：
//
//   · 数值分段比较（0.12.2 > 0.2.1），段数不限；
//   · 缺失段按 0 处理（1.0 == 1.0.0）；
//   · 忽略前导 v（v0.2.3 == 0.2.3）；
//   · 段先按数字前缀比较（0.2.4-beta > 0.2.3）；
//   · 数字前缀相等时：无预发布后缀 > 有后缀（0.2.3 > 0.2.3-beta）；
//   · 两段都带后缀按字符串比较（alpha < beta < rc）；
//   · 数字段 > 纯文本段。
//
// 对旧两处实现的全部真实调用形态（0.3.9 客户端版本、0.1.0-rc.N agent
// 版本、0.2.4-beta 插件版本）逐一比对过结果一致，替换为零行为变更。
// ---------------------------------------------------------------------------

function compareVersions(a, b) {
  const pa = String(a || '').replace(/^v/, '').split('.');
  const pb = String(b || '').replace(/^v/, '').split('.');
  const n = Math.max(pa.length, pb.length);
  const seg = (s) => {
    if (s === undefined) return { num: 0, isNum: true, hasPre: false, raw: '' };
    const m = /^(\d+)(.*)$/.exec(s);
    if (!m) return { num: NaN, isNum: false, hasPre: false, raw: s };
    return { num: parseInt(m[1], 10), isNum: true, hasPre: m[2].length > 0, raw: s };
  };
  for (let i = 0; i < n; i++) {
    const x = seg(pa[i]);
    const y = seg(pb[i]);
    if (x.isNum && y.isNum) {
      if (x.num !== y.num) return x.num < y.num ? -1 : 1;
      if (x.hasPre !== y.hasPre) return x.hasPre ? -1 : 1; // 有后缀 < 无后缀
      if (x.hasPre && x.raw !== y.raw) return x.raw < y.raw ? -1 : 1;
    } else if (x.isNum && !y.isNum) {
      return 1;
    } else if (!x.isNum && y.isNum) {
      return -1;
    } else if (x.raw !== y.raw) {
      return x.raw < y.raw ? -1 : 1;
    }
  }
  return 0;
}

module.exports = { compareVersions };
