'use strict';

// ---------------------------------------------------------------------------
// 统一补丁 I/O 原语（唯一实现）。
//
// main.js 的运行时补丁（12 个 apply*）、scripts/ 下的补丁脚本与
// profile-bundle-heal.js 曾各自实现「原子写」与「进程级读缓存」，且
// 原子写（writePatchAtomic / writeFileAtomic）与非原子 fs.writeFileSync
// 混用、读缓存只覆盖部分调用方。本模块把这些机械性样板收口为一处，
// 所有调用方共用，杜绝再次漂移。
//
// 约定：
//   - writeFileAtomic：临时文件 + rename。临时文件与目标同目录，保证 rename
//     同卷；替换整文件，避免与 dsh 的 HMR 观察者撕裂读。临时名含 pid +
//     时间戳 + 进程内序号：主进程运行时补丁与 CLI 补丁脚本可能并发打同一
//     文件，固定 .tmp 名会让两个调用方互相覆盖/rename 对方尚未写满的
//     临时文件（历史竞态）。
//   - readFileCached：按 realpath 归一化 + size/mtime 签名做进程级读缓存；
//     任何写入都会更新 mtime，缓存自动失效，不存在陈旧内容（语义与旧 main.js
//     内联实现完全一致，包括多路径指向同一物理文件时的去重读）。读前读后
//     各 stat 一次：读取期间文件被改写则不写缓存（TOCTOU 防护），下一次
//     调用自然重读。
// ---------------------------------------------------------------------------

const fs = require('node:fs');

let atomicTmpSeq = 0;

/** 原子写（唯一临时名 + rename），避免与 dsh 的观察者撕裂读。 */
function writeFileAtomic(file, content) {
  const tmp = `${file}.${process.pid}.${Date.now()}.${++atomicTmpSeq}.tmp`;
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw err;
  }
}

// realpath -> { size, mtimeMs, text }
const fileReadMemo = new Map();
// 路径本身是固定常量：realpath 解析结果缓存一次即可。
const fileRealKeyMemo = new Map();

function fileRealKey(file) {
  let key = fileRealKeyMemo.get(file);
  if (key === undefined) {
    try { key = fs.realpathSync(file); } catch { key = file; }
    fileRealKeyMemo.set(file, key);
  }
  return key;
}

/**
 * 进程级读缓存：文件缺失/不可读返回 null（调用方按读取失败处理）。
 * 缓存命中条件 = realpath 相同 + size 与 mtimeMs 精确一致；写入必改 mtime，
 * 因此不存在陈旧内容。
 * @param {string} file
 * @returns {string|null}
 */
function readFileCached(file) {
  try {
    const st = fs.statSync(file);
    const key = fileRealKey(file);
    const hit = fileReadMemo.get(key);
    if (hit && hit.size === st.size && hit.mtimeMs === st.mtimeMs) return hit.text;
    const text = fs.readFileSync(file, 'utf8');
    // TOCTOU 防护：读取期间文件被改写（size/mtime 变化）则不缓存，
    // 避免把「读到的旧内容」记在「新签名」下造成陈旧命中。
    const st2 = fs.statSync(file);
    if (st2.size === st.size && st2.mtimeMs === st.mtimeMs) {
      fileReadMemo.set(key, { size: st2.size, mtimeMs: st2.mtimeMs, text });
    }
    return text;
  } catch {
    return null;
  }
}

module.exports = { writeFileAtomic, readFileCached };
