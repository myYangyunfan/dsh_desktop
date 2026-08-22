'use strict';

/**
 * 有界子进程执行（超时强杀）
 * ==========================
 * sidecar 内长命子进程的统一出口。
 *
 * 历史缺陷（性能审计 2026-08）：plugin-update 的 zip 解压走
 * execFileSync('powershell'/'unzip') 且无超时——AV/SmartScreen 把子进程
 * 拦到半死时（supervisor.rs D2 诊断记录的同族形态），插件更新链永挂，
 * 还会占死 Rust 侧 run_sidecar 的全局串行锁（后续所有 sidecar 命令排队）。
 * 与 koffi-preflight 的 execFileSync timeout: 20000 同思路，收口成公共件。
 */

const { spawn } = require('node:child_process');

/** 缺省上限：解压一个插件包（≤64MB 下载上限）绰绰有余，AV 拖慢也有界。 */
const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * 执行子进程，成功（退出码 0）resolve，超时/失败 reject。
 * 超时立即 kill 子进程（不留半死进程占资源）。
 */
function execFileBounded(file, args, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const done = (err) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (err) reject(err); else resolve();
    };
    let child;
    try {
      child = spawn(file, args, { stdio: opts.stdio || 'ignore', windowsHide: true });
    } catch (err) {
      return reject(err);
    }
    timer = setTimeout(() => {
      child.kill();
      done(new Error(`子进程超时（${timeoutMs}ms）被终止: ${file}`));
    }, timeoutMs);
    child.on('error', done);
    child.on('exit', (code, signal) => {
      if (signal) done(new Error(`子进程被信号终止: ${signal}`));
      else if (code === 0) done();
      else done(new Error(`子进程退出码 ${code}`));
    });
  });
}

module.exports = { execFileBounded, DEFAULT_TIMEOUT_MS };
