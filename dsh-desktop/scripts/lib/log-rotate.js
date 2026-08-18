'use strict';
/**
 * A-1 统一日志轮转（优化方案 v5.2-FINAL）。
 *
 * 策略：附加写前查大小，单文件超过 LOG_ROTATE_MAX_BYTES 则滚动一代
 * （file -> file.1 -> file.2，保留 2 代，最旧删除）；轮转失败绝不阻断写入。
 *
 * 接入点：
 *  - main.js capLogFile（启动封顶）复用 rotateLogFile（滚动替代原「截断留尾」）；
 *  - desktop.log / dsh-web.log 运行期写流换 createRotatingWriteStream
 *    （累计写入 checkEveryBytes 后 stat 一次，超限滚动并重开 fd）；
 *  - watchdog.js 为独立小进程（零依赖），内联同语义滚动（见该文件）。
 *
 * 纯函数：fs/path 可注入（测试用），默认 node:fs / node:path。
 */

const LOG_ROTATE_MAX_BYTES = 5 * 1024 * 1024; // 单文件超过即滚动
const LOG_ROTATE_KEEP = 2; // 保留 .1 .2 两代
const LOG_ROTATE_CHECK_EVERY_BYTES = 256 * 1024; // 写流内 stat 节流粒度

/**
 * 若 file 存在且超过 maxBytes：删除 file.2（如有）、file.1 -> file.2、file -> file.1。
 * 每一步独立 try/catch；任何失败都不抛出（轮转失败不阻断后续写入）。
 * @returns {{ rotated: boolean, previousSize: number|null, error: string|null }}
 */
function rotateLogFile(file, opts = {}, fsMod = null) {
  const fs = fsMod || require('node:fs');
  const maxBytes = (opts && opts.maxBytes) || LOG_ROTATE_MAX_BYTES;
  const keep = (opts && opts.keep) || LOG_ROTATE_KEEP;
  let previousSize = null;
  try {
    const st = fs.statSync(file);
    previousSize = st.size;
    if (st.size <= maxBytes) return { rotated: false, previousSize, error: null };
  } catch {
    // 文件不存在/不可读：无需滚动。
    return { rotated: false, previousSize: null, error: null };
  }
  try {
    // 从最旧一代开始滚动：先清 .keep（如 .2），再存在的中间代逐级上移
    // （不存在的代跳过——首次滚动时 .1 尚未产生），最后 file -> .1。
    for (let i = keep; i >= 1; i--) {
      const cur = file + '.' + i;
      const next = file + '.' + (i + 1);
      try {
        if (i === keep) {
          fs.rmSync(cur, { force: true });
        } else {
          if (!fs.existsSync(cur)) continue;
          if (fs.existsSync(next)) fs.rmSync(next, { force: true });
          fs.renameSync(cur, next);
        }
      } catch (e) {
        return { rotated: false, previousSize, error: '滚动 ' + cur + ' 失败: ' + ((e && e.message) || e) };
      }
    }
    fs.renameSync(file, file + '.1');
    // 主文件被移走，重建空文件保持恒存在（写入方均为 'a' 模式会自动建，
    // 但日志目录里主文件消失会让只读方/用户困惑）。
    try { fs.closeSync(fs.openSync(file, 'a')); } catch {}
    return { rotated: true, previousSize, error: null };
  } catch (e) {
    return { rotated: false, previousSize, error: ((e && e.message) || String(e)) };
  }
}

/**
 * 创建运行期轮转写流（可作 createWriteStream 的替代）：
 * 累计写入 checkEveryBytes 字节后 stat 一次；超限则滚动并重开 fd，
 * 新文件继续接收后续写入。写入失败经 cb(err) 上报（不抛给调用方）；
 * 内部自动挂 noop error 监听，防无监听 emit 崩主进程（issue #86 同款防护）。
 */
function createRotatingWriteStream(file, opts = {}, fsMod = null) {
  const fs = fsMod || require('node:fs');
  const Writable = require('node:stream').Writable;
  const maxBytes = (opts && opts.maxBytes) || LOG_ROTATE_MAX_BYTES;
  const checkEveryBytes = (opts && opts.checkEveryBytes) || LOG_ROTATE_CHECK_EVERY_BYTES;
  let fd = null;
  let pending = 0;
  const openFd = () => { fd = fs.openSync(file, 'a'); };
  const closeFd = () => {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
      fd = null;
    }
  };
  const ws = new Writable({
    write(chunk, enc, cb) {
      try {
        if (fd === null) openFd();
        pending += chunk.length;
        if (pending >= checkEveryBytes) {
          pending = 0;
          if (rotateLogFile(file, { maxBytes }, fs).rotated) {
            closeFd();
            openFd();
          }
        }
        fs.writeSync(fd, chunk);
        cb();
      } catch (err) {
        cb(err);
      }
    },
    final(cb) {
      closeFd();
      cb();
    },
    destroy(err, cb) {
      closeFd();
      cb(err);
    },
  });
  // noop：Writable 在 _write 失败后会自动 emit('error')，无监听会抛 uncaughtException。
  ws.on('error', () => {});
  return ws;
}

module.exports = {
  LOG_ROTATE_MAX_BYTES,
  LOG_ROTATE_KEEP,
  LOG_ROTATE_CHECK_EVERY_BYTES,
  rotateLogFile,
  createRotatingWriteStream,
};
