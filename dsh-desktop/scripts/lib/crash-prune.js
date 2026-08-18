'use strict';

// A-8: 崩溃转储清理增量。
// 在既有「14 天龄上限」基础上增加数量上限：启动清理后最多保留最近
// MAX_KEEP 个转储，且最新 1 个豁免（崩溃现场的转储常是排查依据，永远
// 不因数量上限被删）。纯函数可测；main.js pruneOldCrashDumps 调用。

const CRASH_PRUNE_MAX_AGE_MS = 14 * 24 * 3600 * 1000;
const CRASH_PRUNE_MAX_KEEP = 5;

/**
 * 选出应删除的转储文件名（去重、不重复删同一文件）。
 * @param {Array<{name: string, mtimeMs: number}>} entries
 * @param {{now?: number, maxAgeMs?: number, maxKeep?: number}} [opts]
 * @returns {string[]}
 */
function selectCrashDumpsToRemove(entries, opts) {
  const now = (opts && opts.now) || Date.now();
  const maxAgeMs = (opts && opts.maxAgeMs) || CRASH_PRUNE_MAX_AGE_MS;
  const maxKeep = (opts && opts.maxKeep) || CRASH_PRUNE_MAX_KEEP;
  const out = new Set();
  // 1) 超龄清理：最旧优先并无顺序要求，全量标记。
  for (const e of entries) {
    if (now - e.mtimeMs > maxAgeMs) out.add(e.name);
  }
  // 2) 数量上限：剩余按新→旧排序，最新 1 个豁免（永不因数量被删）；
  //    超出 maxKeep 的部分从最旧开始删。
  const remaining = entries
    .filter((e) => !out.has(e.name))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (remaining.length > maxKeep) {
    const excess = remaining.length - maxKeep;
    const victims = remaining.slice(1).slice(-excess); // 跳过最新，取最旧 excess 个
    for (const v of victims) out.add(v.name);
  }
  return [...out];
}

module.exports = {
  CRASH_PRUNE_MAX_AGE_MS,
  CRASH_PRUNE_MAX_KEEP,
  selectCrashDumpsToRemove,
};